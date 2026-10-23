// Build step: packs draw.io's built-in image library (img/lib, referenced by
// styles as image=img/lib/...) into images.bin for the plugin:
//   u32 count, then per entry: u16 path length, path (UTF-8), u32 offset,
//   u32 length (offsets into the data that follows), then the raw-deflated
//   files back to back. All integers little endian.
// Usage: node tools/build-images.js
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const root = path.join(__dirname, '..');
const webapp = path.join(root, 'vendor/drawio/src/main/webapp');

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(d, e.name)) : /\.(svg|png|jpe?g|gif)$/i.test(e.name) ? [path.join(d, e.name)] : []);
}
const files = walk(path.join(webapp, 'img/lib')).sort();
const head = [Buffer.alloc(4)], data = [];
head[0].writeUInt32LE(files.length);
let off = 0;
for (const f of files) {
  const key = Buffer.from(path.relative(webapp, f).split(path.sep).join('/'), 'utf8');
  const z = zlib.deflateRawSync(fs.readFileSync(f), { level: 9 });
  const e = Buffer.alloc(2 + key.length + 8);
  e.writeUInt16LE(key.length, 0);
  key.copy(e, 2);
  e.writeUInt32LE(off, 2 + key.length);
  e.writeUInt32LE(z.length, 6 + key.length);
  head.push(e);
  data.push(z);
  off += z.length;
}
fs.writeFileSync(path.join(root, 'images.bin'), Buffer.concat([...head, ...data]));
console.error(`${files.length} images, ${(off / 1e6).toFixed(1)} MB`);
