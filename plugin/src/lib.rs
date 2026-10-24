//! Typst plugin that renders draw.io diagrams with draw.io's own JavaScript
//! (mxGraph, Graph.js, Shapes.js, stencils) running in QuickJS.
//!
//! The JS is precompiled to stripped bytecode (compiler/, bytecode.bin) and
//! evaluated once in `wizer.initialize`, so the shipped module is a Wizer
//! snapshot with draw.io already loaded. Without the snapshot the first call
//! initialises lazily (slow, but works).

use rquickjs::allocator::Allocator;
use rquickjs::{qjs, Array, CatchResultExt, Context, Ctx, Function, Runtime, TypedArray, Value};
use std::alloc::Layout;
use std::collections::HashMap;
use wasm_minimal_protocol::*;

initiate_protocol!();

/// The plugin's JS as raw-deflated QuickJS bytecode (see compiler/src/main.rs).
static BYTECODE: &[u8] = include_bytes!("../bytecode.bin");

/// draw.io's stencil libraries, raw-deflated back to back (tools/build-stencils.js).
static STENCILS: &[u8] = include_bytes!("../stencils.bin");
static STENCIL_INDEX: &[u8] = include_bytes!("../stencil-index.bin");

/// draw.io's built-in image library (img/lib), see tools/build-images.js.
static IMAGES: &[u8] = include_bytes!("../images.bin");

/// Fonts for outline text (subset Liberation fonts), see tools/build-fonts.py.
static FONTS: &[u8] = include_bytes!("../fonts.bin");

struct Engine {
    _runtime: Runtime,
    context: Context,
}

static mut ENGINE: Option<Engine> = None;

fn engine() -> Result<&'static Engine, String> {
    // SAFETY: wasm plugins are single-threaded and the engine is never dropped.
    unsafe {
        let slot = &mut *std::ptr::addr_of_mut!(ENGINE);
        if slot.is_none() {
            *slot = Some(create_engine()?);
        }
        Ok(slot.as_ref().unwrap())
    }
}

/// QuickJS allocator that zeroes blocks when they are freed. Wizer stores
/// every non-zero byte of memory in the snapshot, so without this the module
/// would also carry the parser's and loader's freed scratch memory.
struct ZeroingAlloc;

const HEADER: usize = 16;

fn layout(size: usize) -> Layout {
    Layout::from_size_align(size + HEADER, HEADER).expect("allocation too large")
}

unsafe impl Allocator for ZeroingAlloc {
    fn alloc(&mut self, size: usize) -> *mut u8 {
        unsafe {
            let base = std::alloc::alloc(layout(size));
            if base.is_null() {
                return base;
            }
            (base as *mut usize).write(size);
            base.add(HEADER)
        }
    }

    fn calloc(&mut self, count: usize, size: usize) -> *mut u8 {
        let Some(size) = count.checked_mul(size) else { return std::ptr::null_mut() };
        unsafe {
            let base = std::alloc::alloc_zeroed(layout(size));
            if base.is_null() {
                return base;
            }
            (base as *mut usize).write(size);
            base.add(HEADER)
        }
    }

    unsafe fn dealloc(&mut self, ptr: *mut u8) {
        let base = ptr.sub(HEADER);
        let size = (base as *const usize).read();
        std::ptr::write_bytes(base, 0, size + HEADER);
        std::alloc::dealloc(base, layout(size));
    }

    unsafe fn realloc(&mut self, ptr: *mut u8, new_size: usize) -> *mut u8 {
        if ptr.is_null() {
            return self.alloc(new_size);
        }
        if new_size == 0 {
            self.dealloc(ptr);
            return std::ptr::null_mut();
        }
        let new = self.alloc(new_size);
        if !new.is_null() {
            std::ptr::copy_nonoverlapping(ptr, new, Self::usable_size(ptr).min(new_size));
            self.dealloc(ptr);
        }
        new
    }

    unsafe fn usable_size(ptr: *mut u8) -> usize {
        (ptr.sub(HEADER) as *const usize).read()
    }
}

/// Runs each precompiled script of the bundle in order.
fn load_bytecode(ctx: &Ctx) -> Result<(), String> {
    let mut bundle = unzstd(BYTECODE).map_err(|e| e.to_string())?;
    let result = (|| {
        let mut rest = &bundle[..];
        let take = |rest: &mut &[u8]| -> Result<Vec<u8>, String> {
            let n = rest.get(..4).ok_or("truncated bytecode")?;
            let n = u32::from_le_bytes([n[0], n[1], n[2], n[3]]) as usize;
            let v = rest.get(4..4 + n).ok_or("truncated bytecode")?.to_vec();
            *rest = &rest[4 + n..];
            Ok(v)
        };
        while !rest.is_empty() {
            let name = String::from_utf8_lossy(&take(&mut rest)?).into_owned();
            let mut code = take(&mut rest)?;
            let raw = ctx.as_raw().as_ptr();
            // SAFETY: plain QuickJS API calls on a live context; the returned
            // values are wrapped so they are freed.
            let res = unsafe {
                let func = qjs::JS_ReadObject(raw, code.as_ptr(), code.len() as _, qjs::JS_READ_OBJ_BYTECODE as i32);
                let res = if qjs::JS_IsException(func) { func } else { qjs::JS_EvalFunction(raw, func) };
                Value::from_raw(ctx.clone(), res)
            };
            code.fill(0);
            if res.is_exception() {
                let err = ctx.catch();
                let msg = err
                    .as_exception()
                    .map(|e| format!("{e}"))
                    .unwrap_or_else(|| format!("{err:?}"));
                return Err(format!("drawio: loading {name} failed: {msg}"));
            }
        }
        Ok(())
    })();
    bundle.fill(0);
    result
}

fn create_engine() -> Result<Engine, String> {
    let runtime = Runtime::new_with_alloc(ZeroingAlloc).map_err(|e| e.to_string())?;
    runtime.set_max_stack_size(0);
    let context = Context::full(&runtime).map_err(|e| e.to_string())?;
    context.with(|ctx| -> Result<(), String> {
        install_natives(&ctx).map_err(|e| e.to_string())?;
        load_bytecode(&ctx)
    })?;
    runtime.run_gc();
    Ok(Engine { _runtime: runtime, context })
}

struct StencilLib {
    offset: usize,
    len: usize,
    names: Vec<&'static str>,
    attrs: Vec<&'static str>,
}

struct StencilIndex {
    libs: Vec<StencilLib>,
    shapes: HashMap<&'static str, [u32; 8]>,
}

static mut STENCIL_INDEX_PARSED: Option<StencilIndex> = None;

/// Inflates and parses stencil-index.bin (see tools/build-stencils.js) on first use.
fn stencil_index() -> &'static StencilIndex {
    // SAFETY: single-threaded, initialised once and never dropped.
    unsafe {
        let slot = &mut *std::ptr::addr_of_mut!(STENCIL_INDEX_PARSED);
        slot.get_or_insert_with(|| {
            let mut index = StencilIndex { libs: Vec::new(), shapes: HashMap::new() };
            // Leaked: the index lives as long as the plugin instance.
            let text: &'static str = match unzstd(STENCIL_INDEX).ok().and_then(|b| String::from_utf8(b).ok()) {
                Some(t) => Box::leak(t.into_boxed_str()),
                None => return index,
            };
            let list = |s: &'static str| if s.is_empty() { Vec::new() } else { s.split('\x1f').collect() };
            for line in text.lines() {
                let f: Vec<&'static str> = line.split('\t').collect();
                match f.first() {
                    Some(&"L") if f.len() == 5 => index.libs.push(StencilLib {
                        offset: f[1].parse().unwrap_or(0),
                        len: f[2].parse().unwrap_or(0),
                        names: list(f[3]),
                        attrs: list(f[4]),
                    }),
                    Some(&"S") if f.len() == 10 => {
                        let mut e = [0u32; 8];
                        for (k, v) in f[2..].iter().enumerate() {
                            e[k] = v.parse().unwrap_or(0);
                        }
                        index.shapes.insert(f[1], e);
                    }
                    _ => {}
                }
            }
            index
        })
    }
}

fn js_err(msg: &str) -> rquickjs::Error {
    rquickjs::Error::new_from_js_message("native", "error", msg.to_string())
}

fn inflate(data: &[u8], raw: bool) -> rquickjs::Result<Vec<u8>> {
    let out = if raw {
        miniz_oxide::inflate::decompress_to_vec(data)
    } else {
        miniz_oxide::inflate::decompress_to_vec_zlib(data)
    };
    out.map_err(|e| js_err(&format!("inflate failed: {e:?}")))
}

/// Decompresses the plugin's own data files (zstd, see tools/zstd.js).
fn unzstd(data: &[u8]) -> rquickjs::Result<Vec<u8>> {
    use std::io::Read;
    let mut src = data;
    let mut dec = ruzstd::decoding::StreamingDecoder::new(&mut src).map_err(|e| js_err(&format!("zstd: {e}")))?;
    let mut out = Vec::new();
    dec.read_to_end(&mut out).map_err(|e| js_err(&format!("zstd: {e}")))?;
    Ok(out)
}

/// Lenient base64 (standard or URL-safe alphabet, whitespace and padding ignored).
fn base64(s: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let (mut acc, mut bits) = (0u32, 0u32);
    for b in s.bytes() {
        let v = match b {
            b'A'..=b'Z' => b - b'A',
            b'a'..=b'z' => b - b'a' + 26,
            b'0'..=b'9' => b - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            _ => continue,
        };
        acc = (acc << 6) | v as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
        }
    }
    out
}

fn native_b64<'js>(ctx: Ctx<'js>, s: String) -> rquickjs::Result<TypedArray<'js, u8>> {
    TypedArray::new(ctx, base64(&s))
}

fn native_inflate<'js>(ctx: Ctx<'js>, data: TypedArray<'js, u8>, raw: bool) -> rquickjs::Result<TypedArray<'js, u8>> {
    // SAFETY: no JavaScript runs while the slice is alive.
    let out = inflate(unsafe { data.as_slice() }, raw)?;
    TypedArray::new(ctx, out)
}

fn native_utf8(data: TypedArray<'_, u8>) -> String {
    // SAFETY: no JavaScript runs while the slice is alive.
    String::from_utf8_lossy(unsafe { data.as_slice() }).into_owned()
}

struct ImageIndex {
    /// (offset, length) of each compressed chunk in IMAGES
    chunks: Vec<(usize, usize)>,
    /// path -> (chunk, offset, length) within the inflated chunk
    files: HashMap<&'static str, (usize, usize, usize)>,
}

static mut IMAGE_INDEX: Option<ImageIndex> = None;

/// Parses the header of IMAGES (see tools/build-images.js) on first use.
fn image_index() -> &'static ImageIndex {
    // SAFETY: single-threaded, initialised once and never dropped.
    unsafe {
        let slot = &mut *std::ptr::addr_of_mut!(IMAGE_INDEX);
        slot.get_or_insert_with(|| {
            let mut index = ImageIndex { chunks: Vec::new(), files: HashMap::new() };
            let u32_at = |i: usize| IMAGES.get(i..i + 4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]) as usize);
            let Some(nchunks) = u32_at(0) else { return index };
            let mut i = 4;
            for _ in 0..nchunks {
                let (Some(off), Some(len)) = (u32_at(i), u32_at(i + 4)) else { return index };
                index.chunks.push((off, len));
                i += 8;
            }
            let Some(count) = u32_at(i) else { return index };
            i += 4;
            let mut files = Vec::with_capacity(count);
            for _ in 0..count {
                let Some(b) = IMAGES.get(i..i + 2) else { break };
                let n = u16::from_le_bytes([b[0], b[1]]) as usize;
                let (Some(key), Some(chunk), Some(off), Some(len)) =
                    (IMAGES.get(i + 2..i + 2 + n), u32_at(i + 2 + n), u32_at(i + 6 + n), u32_at(i + 10 + n))
                else {
                    break;
                };
                files.push((std::str::from_utf8(key).unwrap_or(""), chunk, off, len));
                i += n + 14;
            }
            // chunk offsets are relative to the data after the header
            for c in index.chunks.iter_mut() {
                c.0 += i;
            }
            for (key, chunk, off, len) in files {
                index.files.insert(key, (chunk, off, len));
            }
            index
        })
    }
}

/// Bytes of a built-in image such as "img/lib/ibm/vpc/Router.svg", or undefined.
fn native_image<'js>(ctx: Ctx<'js>, key: String) -> rquickjs::Result<Option<TypedArray<'js, u8>>> {
    let index = image_index();
    let Some(&(chunk, off, len)) = index.files.get(key.as_str()) else { return Ok(None) };
    let &(coff, clen) = index.chunks.get(chunk).ok_or_else(|| js_err("bad image chunk"))?;
    let src = IMAGES.get(coff..coff + clen).ok_or_else(|| js_err("bad image offset"))?;
    let data = unzstd(src)?;
    let file = data.get(off..off + len).ok_or_else(|| js_err("bad image entry"))?;
    Ok(Some(TypedArray::new_copy(ctx, file)?))
}

static mut FONT_FACES: Option<HashMap<String, Option<rustybuzz::Face<'static>>>> = None;

/// The font for a key such as "sans" or "serif-bi" (see tools/build-fonts.py),
/// decompressed and parsed on first use; the data lives as long as the plugin.
fn font(key: &str) -> Option<&'static rustybuzz::Face<'static>> {
    // SAFETY: single-threaded, entries are inserted once and never dropped.
    let faces = unsafe { (*std::ptr::addr_of_mut!(FONT_FACES)).get_or_insert_with(HashMap::new) };
    if !faces.contains_key(key) {
        let face = (|| {
            let u32_at = |i: usize| FONTS.get(i..i + 4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]) as usize);
            let count = u32_at(0)?;
            let mut i = 4;
            let mut found = None;
            for _ in 0..count {
                let b = FONTS.get(i..i + 2)?;
                let n = u16::from_le_bytes([b[0], b[1]]) as usize;
                let (name, off, len) = (FONTS.get(i + 2..i + 2 + n)?, u32_at(i + 2 + n)?, u32_at(i + 6 + n)?);
                if name == key.as_bytes() {
                    found = Some((off, len));
                }
                i += n + 10;
            }
            let (off, len) = found?;
            let data: &'static [u8] = Box::leak(unzstd(FONTS.get(i + off..i + off + len)?).ok()?.into_boxed_slice());
            rustybuzz::Face::from_slice(data, 0)
        })();
        faces.insert(key.to_string(), face);
    }
    faces.get(key).and_then(|f| f.as_ref())
}

/// [units per em, ascender, descender (positive), underline position,
/// underline thickness, strike-out position, strike-out thickness] in font
/// units, or undefined for an unknown font.
fn native_font_info(key: String) -> Option<Vec<f64>> {
    let f = font(&key)?;
    let ul = f.underline_metrics();
    let st = f.strikeout_metrics();
    Some(vec![
        f.units_per_em() as f64,
        f.ascender() as f64,
        -(f.descender() as f64),
        ul.map(|m| m.position as f64).unwrap_or(-0.1 * f.units_per_em() as f64),
        ul.map(|m| m.thickness as f64).unwrap_or(0.05 * f.units_per_em() as f64),
        st.map(|m| m.position as f64).unwrap_or(0.3 * f.units_per_em() as f64),
        st.map(|m| m.thickness as f64).unwrap_or(0.05 * f.units_per_em() as f64),
    ])
}

/// Shapes `text` (kerning, ligatures): [glyph, x advance, x offset, y offset]
/// per glyph, in font units; glyph 0 marks a character the font lacks.
fn native_shape<'js>(ctx: Ctx<'js>, key: String, text: String) -> rquickjs::Result<TypedArray<'js, f32>> {
    let f = font(&key).ok_or_else(|| js_err("unknown font"))?;
    let mut buf = rustybuzz::UnicodeBuffer::new();
    buf.push_str(&text);
    buf.set_direction(rustybuzz::Direction::LeftToRight);
    let out = rustybuzz::shape(f, &[], buf);
    let mut v = Vec::with_capacity(out.len() * 4);
    for (info, pos) in out.glyph_infos().iter().zip(out.glyph_positions()) {
        v.extend([info.glyph_id as f32, pos.x_advance as f32, pos.x_offset as f32, pos.y_offset as f32]);
    }
    TypedArray::new(ctx, v)
}

/// A glyph outline as path segments ["m", x, y], ["l", ...], ["q", ...],
/// ["c", ...], ["z"] in font units with y pointing down.
fn native_glyph_path<'js>(ctx: Ctx<'js>, key: String, gid: u16) -> rquickjs::Result<Array<'js>> {
    struct Builder(Vec<(char, Vec<f32>)>);
    impl rustybuzz::ttf_parser::OutlineBuilder for Builder {
        fn move_to(&mut self, x: f32, y: f32) { self.0.push(('m', vec![x, -y])); }
        fn line_to(&mut self, x: f32, y: f32) { self.0.push(('l', vec![x, -y])); }
        fn quad_to(&mut self, x1: f32, y1: f32, x: f32, y: f32) { self.0.push(('q', vec![x1, -y1, x, -y])); }
        fn curve_to(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, x: f32, y: f32) {
            self.0.push(('c', vec![x1, -y1, x2, -y2, x, -y]));
        }
        fn close(&mut self) { self.0.push(('z', vec![])); }
    }
    let f = font(&key).ok_or_else(|| js_err("unknown font"))?;
    let mut b = Builder(Vec::new());
    f.outline_glyph(rustybuzz::ttf_parser::GlyphId(gid), &mut b);
    let arr = Array::new(ctx.clone())?;
    for (i, (op, coords)) in b.0.into_iter().enumerate() {
        let seg = Array::new(ctx.clone())?;
        seg.set(0, op.to_string())?;
        for (k, c) in coords.into_iter().enumerate() {
            seg.set(k + 1, c as f64)?;
        }
        arr.set(i, seg)?;
    }
    Ok(arr)
}

/// Index entry for a stencil key: [library, decoder checkpoint (7)], or undefined.
fn native_stencil_shape(key: String) -> Option<Vec<u32>> {
    stencil_index().shapes.get(key.as_str()).map(|e| e.to_vec())
}

/// Inflates one stencil library: [ops, xs, ys, nums, strings, names, attrs]
/// (see js/stencils.js).
fn native_stencil_lib<'js>(ctx: Ctx<'js>, i: usize) -> rquickjs::Result<Array<'js>> {
    let lib = stencil_index().libs.get(i).ok_or_else(|| js_err("bad stencil library"))?;
    let src = STENCILS.get(lib.offset..lib.offset + lib.len).ok_or_else(|| js_err("bad stencil offset"))?;
    let d = unzstd(src)?;
    let arr = Array::new(ctx.clone())?;
    let mut o = 20;
    for k in 0..5 {
        let n = d
            .get(4 * k..4 * k + 4)
            .map(|b| u32::from_be_bytes([b[0], b[1], b[2], b[3]]) as usize)
            .ok_or_else(|| js_err("bad stencil header"))?;
        let part = d.get(o..o + n).ok_or_else(|| js_err("bad stencil stream"))?;
        if k < 4 {
            arr.set(k, TypedArray::<u8>::new_copy(ctx.clone(), part)?)?;
        } else {
            arr.set(k, String::from_utf8_lossy(part).into_owned())?;
        }
        o += n;
    }
    arr.set(5, lib.names.clone())?;
    arr.set(6, lib.attrs.clone())?;
    Ok(arr)
}

/// Native helpers for work that is too slow in interpreted JS.
fn install_natives(ctx: &Ctx) -> rquickjs::Result<()> {
    let g = ctx.globals();
    g.set("__b64", Function::new(ctx.clone(), native_b64)?)?;
    g.set("__inflate", Function::new(ctx.clone(), native_inflate)?)?;
    g.set("__utf8", Function::new(ctx.clone(), native_utf8)?)?;
    g.set("__image", Function::new(ctx.clone(), native_image)?)?;
    g.set("__fontInfo", Function::new(ctx.clone(), native_font_info)?)?;
    g.set("__shape", Function::new(ctx.clone(), native_shape)?)?;
    g.set("__glyphPath", Function::new(ctx.clone(), native_glyph_path)?)?;
    g.set("__stencilShape", Function::new(ctx.clone(), native_stencil_shape)?)?;
    g.set("__stencilLib", Function::new(ctx.clone(), native_stencil_lib)?)?;
    Ok(())
}

#[export_name = "wizer.initialize"]
pub extern "C" fn wizer_initialize() {
    engine().expect("engine initialisation failed");
    stencil_index();
}

/// Renders one page. `data` is the file contents, `opts` a JSON object
/// (`page`: index or name, `border`). Returns CBOR (see js/glue.js).
#[wasm_func]
pub fn render(data: &[u8], opts: &[u8]) -> Result<Vec<u8>, String> {
    let xml = std::str::from_utf8(data).map_err(|_| "drawio: file is not valid UTF-8".to_string())?;
    let opts = std::str::from_utf8(opts).map_err(|e| e.to_string())?;
    engine()?.context.with(|ctx| {
        let f: Function = ctx.globals().get("__drawioRender").map_err(|e| e.to_string())?;
        let out: TypedArray<u8> = f
            .call((xml, opts))
            .catch(&ctx)
            .map_err(|e| format!("drawio: {e}"))?;
        // SAFETY: no JavaScript runs while the slice is alive.
        Ok(unsafe { out.as_slice() }.to_vec())
    })
}

#[cfg(test)]
mod tests {
    fn render(file: &str, opts: &str) -> Vec<u8> {
        let data = std::fs::read(format!("../example/{file}")).unwrap();
        super::render(&data, opts.as_bytes()).unwrap()
    }

    // One test: the engine is a single-threaded global.
    #[test]
    fn renders_examples() {
        assert!(render("plain.drawio", r#"{"page":0}"#).len() > 1000);
        assert!(render("plain.drawio", r#"{"page":"Second"}"#).len() > 100);
        assert!(render("compressed.drawio", "{}").len() > 1000);
        assert!(render("features.drawio", "{}").len() > 1000);

        let data = std::fs::read("../example/plain.drawio").unwrap();
        let err = super::render(&data, br#"{"page":"Nope"}"#).unwrap_err();
        assert!(err.contains("no page"), "{err}");
    }
}

#[cfg(test)]
mod mem {
    #[test]
    #[ignore]
    fn memory_report() {
        let e = super::engine().unwrap();
        e._runtime.run_gc();
        let m = e._runtime.memory_usage();
        eprintln!("malloc_size {} used {} count {}", m.malloc_size, m.memory_used_size, m.malloc_count);
        eprintln!("atoms {} strings {} str_size {} objs {} props {} shapes {} shape_size {}", m.atom_count, m.str_count, m.str_size, m.obj_count, m.prop_count, m.shape_count, m.shape_size);
        eprintln!("js_func {} js_func_size {} code {} pc2line {} c_func {}", m.js_func_count, m.js_func_size, m.js_func_code_size, m.js_func_pc2line_size, m.c_func_count);
        eprintln!("arrays {} fast_arrays {} fast_elems {} binary objs {} size {}", m.array_count, m.fast_array_count, m.fast_array_elements, m.binary_object_count, m.binary_object_size);
    }
}

#[cfg(test)]
mod timing {
    /// DRAWIO_FILE=path cargo test --release time_file -- --ignored --nocapture
    #[test]
    #[ignore]
    fn time_file() {
        let path = std::env::var("DRAWIO_FILE").expect("set DRAWIO_FILE");
        let data = std::fs::read(path).unwrap();
        super::engine().unwrap();
        let t = std::time::Instant::now();
        let out = super::render(&data, br#"{"profile":true}"#).unwrap();
        eprintln!("render {:?}, {} bytes", t.elapsed(), out.len());
        super::engine().unwrap().context.with(|ctx| {
            let logs: Vec<String> = ctx.eval("__drawioLogs()").unwrap();
            for l in logs { eprintln!("{l}"); }
        });
    }
}

#[cfg(test)]
mod dev {
    /// DRAWIO_JS=code cargo test --release eval_js -- --ignored --nocapture
    /// Evaluates JS in the loaded engine (the file in DRAWIO_FILE is in `__input`).
    #[test]
    #[ignore]
    fn eval_js() {
        let code = std::env::var("DRAWIO_JS").expect("set DRAWIO_JS");
        let input = std::env::var("DRAWIO_FILE").map(|f| std::fs::read_to_string(f).unwrap()).unwrap_or_default();
        super::engine().unwrap().context.with(|ctx| {
            ctx.globals().set("__input", input).unwrap();
            let r: rquickjs::Result<String> = ctx.eval(code);
            match r {
                Ok(s) => eprintln!("=> {s}"),
                Err(_) => eprintln!("error: {:?}", ctx.catch()),
            }
            let logs: Vec<String> = ctx.eval("__drawioLogs()").unwrap();
            for l in logs { eprintln!("{l}"); }
        });
    }
}
