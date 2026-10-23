// Node versions of the plugin's native functions (src/lib.rs), for the dev
// tools that run the JS outside the plugin.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const root = path.join(__dirname, '..');

module.exports = function natives() {
  const bin = fs.readFileSync(path.join(root, 'stencils.bin'));
  const libs = [], shapes = new Map();
  for (const line of zlib.inflateRawSync(fs.readFileSync(path.join(root, 'stencil-index.bin'))).toString('utf8').split('\n')) {
    const f = line.split('\t');
    if (f[0] === 'L') libs.push([+f[1], +f[2], f[3] ? f[3].split('\x1f') : [], f[4] ? f[4].split('\x1f') : []]);
    else if (f[0] === 'S') shapes.set(f[1], f.slice(2).map(Number));
  }
  const img = fs.readFileSync(path.join(root, 'images.bin')), images = new Map();
  let i = 4;
  const entries = [];
  for (let k = img.readUInt32LE(0); k > 0; k--) {
    const n = img.readUInt16LE(i);
    entries.push([img.toString('utf8', i + 2, i + 2 + n), img.readUInt32LE(i + 2 + n), img.readUInt32LE(i + 6 + n)]);
    i += n + 10;
  }
  for (const [key, off, len] of entries) images.set(key, [i + off, len]);
  return {
    __image(key) {
      const e = images.get(key);
      return e ? new Uint8Array(zlib.inflateRawSync(img.subarray(e[0], e[0] + e[1]))) : undefined;
    },
    __stencilShape: key => shapes.get(key),
    __stencilLib(i) {
      const [off, len, names, attrs] = libs[i];
      const d = zlib.inflateRawSync(bin.subarray(off, off + len)), s = [];
      for (let k = 0, o = 20; k < 5; k++) { const n = d.readUInt32BE(4 * k); s.push(new Uint8Array(d.subarray(o, o + n))); o += n; }
      return [s[0], s[1], s[2], s[3], Buffer.from(s[4]).toString('utf8'), names.slice(), attrs.slice()];
    }
  };
};
