// Build step: packs draw.io's built-in image library (img/lib, referenced by
// styles as image=img/lib/...) into images.bin for the plugin. Files are
// grouped into chunks of about 64 KB that are compressed together (zstd),
// which compresses far better than single small files. Layout (little endian):
//   u32 chunk count, then per chunk: u32 offset, u32 length (into the data)
//   u32 file count,  then per file:  u16 path length, path (UTF-8),
//                                    u32 chunk, u32 offset, u32 length
//                                    (offset/length within the inflated chunk)
//   the compressed chunks, back to back
// Usage: node tools/build-images.js
const fs = require('fs'), path = require('path');
const zstd = require('./zstd');
const root = path.join(__dirname, '..');
const webapp = path.join(root, 'vendor/drawio/src/main/webapp');
const CHUNK = 64 * 1024;

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(d, e.name)) : /\.(svg|png|jpe?g|gif)$/i.test(e.name) ? [path.join(d, e.name)] : []);
}
// sorted by path, so that files of one library share chunks
const files = walk(path.join(webapp, 'img/lib')).sort();

const chunks = [], entries = [];
let current = [], size = 0;
const flush = () => {
  if (current.length === 0) return;
  chunks.push(zstd.compress(Buffer.concat(current)));
  current = [];
  size = 0;
};
for (const f of files) {
  const data = fs.readFileSync(f);
  if (size > 0 && size + data.length > CHUNK) flush();
  entries.push([path.relative(webapp, f).split(path.sep).join('/'), chunks.length, size, data.length]);
  current.push(data);
  size += data.length;
}
flush();

const parts = [];
const u32 = v => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
parts.push(u32(chunks.length));
let off = 0;
for (const c of chunks) { parts.push(u32(off), u32(c.length)); off += c.length; }
parts.push(u32(entries.length));
for (const [key, chunk, offset, length] of entries) {
  const k = Buffer.from(key, 'utf8');
  const n = Buffer.alloc(2);
  n.writeUInt16LE(k.length);
  parts.push(n, k, u32(chunk), u32(offset), u32(length));
}
parts.push(...chunks);
fs.writeFileSync(path.join(root, 'images.bin'), Buffer.concat(parts));
console.error(`${files.length} images in ${chunks.length} chunks, ${(off / 1e6).toFixed(1)} MB`);
