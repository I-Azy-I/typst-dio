//! Compiles the plugin's JavaScript (js/sources.json order) to QuickJS
//! bytecode with source text and debug info stripped, and writes the
//! uncompressed bundle to `bytecode.raw` (build.sh compresses it to
//! `bytecode.bin` with zstd):
//!   repeated { u32 name_len, name, u32 code_len, code } (little endian)
//! Usage: drawio-compiler <plugin dir>

use rquickjs::{qjs, Context, Runtime};
use std::ffi::CString;
use std::path::Path;

fn compile(ctx: &rquickjs::Ctx, name: &str, src: &str) -> Vec<u8> {
    let raw = ctx.as_raw().as_ptr();
    let code = CString::new(src).expect("NUL in source");
    let file = CString::new(name).unwrap();
    unsafe {
        // Global (sloppy-mode) script, compiled but not run
        let flags = (qjs::JS_EVAL_TYPE_GLOBAL | qjs::JS_EVAL_FLAG_COMPILE_ONLY) as i32;
        let obj = qjs::JS_Eval(raw, code.as_ptr(), src.len() as _, file.as_ptr(), flags);
        if qjs::JS_IsException(obj) {
            let e = rquickjs::Value::from_raw(ctx.clone(), qjs::JS_GetException(raw));
            panic!("{name}: {e:?}");
        }
        let mut len: qjs::size_t = 0;
        // DRAWIO_NO_STRIP=1 keeps source and debug info (useful for debugging)
        let strip = if std::env::var_os("DRAWIO_NO_STRIP").is_some() {
            0
        } else {
            qjs::JS_WRITE_OBJ_STRIP_SOURCE | qjs::JS_WRITE_OBJ_STRIP_DEBUG
        };
        let wflags = (qjs::JS_WRITE_OBJ_BYTECODE | strip) as i32;
        let buf = qjs::JS_WriteObject(raw, &mut len, obj, wflags);
        assert!(!buf.is_null(), "{name}: JS_WriteObject failed");
        let out = std::slice::from_raw_parts(buf, len as usize).to_vec();
        qjs::js_free(raw, buf as _);
        qjs::JS_FreeValue(raw, obj);
        out
    }
}

fn main() {
    let dir = std::env::args().nth(1).expect("usage: drawio-compiler <plugin dir>");
    let dir = Path::new(&dir);
    let list = std::fs::read_to_string(dir.join("js/sources.json")).unwrap();
    let files: Vec<String> = list
        .split('"')
        .enumerate()
        .filter(|(i, _)| i % 2 == 1)
        .map(|(_, s)| s.to_string())
        .collect();

    let rt = Runtime::new().unwrap();
    let context = Context::full(&rt).unwrap();
    let mut bundle = Vec::new();
    let (mut src_total, mut code_total) = (0, 0);
    context.with(|ctx| {
        for f in &files {
            let src = std::fs::read_to_string(dir.join(f)).unwrap_or_else(|e| panic!("{f}: {e}"));
            let code = compile(&ctx, f, &src);
            src_total += src.len();
            code_total += code.len();
            let name = Path::new(f).file_name().unwrap().to_string_lossy();
            bundle.extend((name.len() as u32).to_le_bytes());
            bundle.extend(name.as_bytes());
            bundle.extend((code.len() as u32).to_le_bytes());
            bundle.extend(code);
        }
    });
    std::fs::write(dir.join("bytecode.raw"), &bundle).unwrap();
    eprintln!(
        "{} files: source {:.1} MB -> bytecode {:.1} MB",
        files.len(),
        src_total as f64 / 1e6,
        code_total as f64 / 1e6
    );
}
