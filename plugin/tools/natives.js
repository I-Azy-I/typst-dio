// Node versions of the plugin's native functions (src/lib.rs), for the dev
// tools that run the JS outside the plugin.
const fs = require('fs'), path = require('path');
const zstd = require('./zstd');
const root = path.join(__dirname, '..');

module.exports = function natives() {
  const bin = fs.readFileSync(path.join(root, 'stencils.bin'));
  const libs = [], shapes = new Map();
  for (const line of zstd.decompress(fs.readFileSync(path.join(root, 'stencil-index.bin'))).toString('utf8').split('\n')) {
    const f = line.split('\t');
    if (f[0] === 'L') libs.push([+f[1], +f[2], f[3] ? f[3].split('\x1f') : [], f[4] ? f[4].split('\x1f') : []]);
    else if (f[0] === 'S') shapes.set(f[1], f.slice(2).map(Number));
  }
  const img = fs.readFileSync(path.join(root, 'images.bin')), images = new Map(), chunks = [];
  let i = 4;
  for (let k = img.readUInt32LE(0); k > 0; k--, i += 8) chunks.push([img.readUInt32LE(i), img.readUInt32LE(i + 4)]);
  const count = img.readUInt32LE(i);
  i += 4;
  for (let k = 0; k < count; k++) {
    const n = img.readUInt16LE(i);
    images.set(img.toString('utf8', i + 2, i + 2 + n),
      [img.readUInt32LE(i + 2 + n), img.readUInt32LE(i + 6 + n), img.readUInt32LE(i + 10 + n)]);
    i += n + 14;
  }
  const dataStart = i;
  return {
    // Node has no shaping engine: outline text falls back to native text
    __fontInfo() { return undefined; },
    __image(key) {
      const e = images.get(key);
      if (!e) return undefined;
      const [c, off, len] = e, [co, cl] = chunks[c];
      const chunk = zstd.decompress(img.subarray(dataStart + co, dataStart + co + cl));
      return new Uint8Array(chunk.subarray(off, off + len));
    },
    __stencilShape: key => shapes.get(key),
    __stencilLib(i) {
      const [off, len, names, attrs] = libs[i];
      const d = zstd.decompress(bin.subarray(off, off + len)), s = [];
      for (let k = 0, o = 20; k < 5; k++) { const n = d.readUInt32BE(4 * k); s.push(new Uint8Array(d.subarray(o, o + n))); o += n; }
      return [s[0], s[1], s[2], s[3], Buffer.from(s[4]).toString('utf8'), names.slice(), attrs.slice()];
    }
  };
};
