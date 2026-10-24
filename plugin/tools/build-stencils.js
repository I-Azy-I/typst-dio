// Build step: turns draw.io's stencil libraries (stencils.min.js) into
//   stencils.bin          the library payloads (zstd), back to back
//   stencil-index.bin     tab-separated lines (zstd), loaded by the Rust plugin:
//                         L offset length names attrs   (lists joined by \x1f)
//                         S key library checkpoint(7 numbers)
// so that js/stencils.js can decode single shapes on demand.
// Usage: node tools/build-stencils.js
const vm = require('vm'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const root = path.join(__dirname, '..');
const zstd = require('./zstd');
const webapp = path.join(root, 'vendor/drawio/src/main/webapp/js');

const ctx = vm.createContext({});
for (const f of ['js/shim.js', 'vendor/drawio/src/main/webapp/js/viewer-static.min.js', 'js/stencils.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}

const src = fs.readFileSync(path.join(webapp, 'stencils.min.js'), 'utf8');
const entries = [...src.matchAll(/^f\['([^']+)'\] = '([^']+)';?$/gm)];
if (entries.length === 0) throw new Error('no stencil libraries found in stencils.min.js');

const chunks = [], libs = [], shapes = {};
let offset = 0;
ctx.__shapes = shapes;
vm.runInContext(`mxStencilRegistry.addStencil = function (name, stencil) {
  __shapes[name] = [__lib].concat(stencil.desc.cp);
};`, ctx);

entries.forEach(([, file, b64], i) => {
  const deflated = Buffer.from(b64, 'base64');
  const d = zlib.inflateRawSync(deflated);
  const s = [];
  for (let k = 0, o = 20; k < 5; k++) {
    const n = d.readUInt32BE(4 * k);
    s.push(new Uint8Array(d.subarray(o, o + n)));
    o += n;
  }
  const lib = { s: s.slice(0, 4), strs: Buffer.from(s[4]).toString('utf8').split('\0'), names: [], attrs: [] };
  ctx.__libData = lib;
  ctx.__lib = i;
  vm.runInContext(`(function () {
    var doc = __stencilDecode(__libData, [0, 0, 0, 0, 0, 0, 0], true);
    for (var n = doc; n != null; n = n.nextSibling) mxStencilRegistry.parseStencilSet(n, null, true);
  })()`, ctx);
  // stored as zstd of the inflated payload (smaller than draw.io's deflate)
  const packed = zstd.compress(d);
  libs.push([offset, packed.length, lib.names, lib.attrs]);
  chunks.push(packed);
  offset += packed.length;
  if (process.env.VERBOSE) console.error(file);
});

fs.writeFileSync(path.join(root, 'stencils.bin'), Buffer.concat(chunks));
const lines = libs.map(([off, len, names, attrs]) => ['L', off, len, names.join('\x1f'), attrs.join('\x1f')].join('\t'));
for (const [key, e] of Object.entries(shapes)) {
  if (/[\t\n]/.test(key)) throw new Error('bad stencil key ' + JSON.stringify(key));
  lines.push(['S', key, ...e].join('\t'));
}
fs.writeFileSync(path.join(root, 'stencil-index.bin'), zstd.compress(Buffer.from(lines.join('\n') + '\n')));
console.error(`${libs.length} libraries, ${Object.keys(shapes).length} shapes, ${(offset / 1e6).toFixed(1)} MB`);
