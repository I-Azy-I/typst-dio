// Checks that every shape decoded on demand (js/stencils.js) equals the shape
// from draw.io's own whole-library decoder (stencils.min.js).
const vm = require('vm'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const root = path.join(__dirname, '..');
function ctxWith(files, extra) {
  const ctx = vm.createContext(extra || {});
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  return ctx;
}
const base = ['js/shim.js', 'vendor/drawio/src/main/webapp/js/viewer-static.min.js', 'vendor/drawio/src/main/webapp/js/shapes-14-6-5.min.js'];
const ser = `function __ser(n) { var a = n.attributes, s = '<' + n.nodeName;
  for (var i = 0; i < a.length; i++) s += ' ' + a[i].name + '=' + JSON.stringify(a[i].value);
  s += '>'; for (var c = n.firstChild; c; c = c.nextSibling) s += __ser(c); return s + '</' + n.nodeName + '>'; }`;
const lazy = ctxWith([...base, 'js/stencils.js'], require('./natives')());
const full = ctxWith([...base, 'vendor/drawio/src/main/webapp/js/stencils.min.js']);
vm.runInContext(ser, lazy); vm.runInContext(ser, full);
const keys = zlib.inflateRawSync(fs.readFileSync(path.join(root, 'stencil-index.bin'))).toString('utf8').split('\n').filter(l => l.startsWith('S\t')).map(l => l.split('\t')[1]);
// load every library in the reference context
vm.runInContext(`(function(){ var src = Object.keys(mxStencilRegistry.libraries); })()`, full);
const libFiles = [...fs.readFileSync(path.join(root, 'vendor/drawio/src/main/webapp/js/stencils.min.js'), 'utf8').matchAll(/^f\['([^']+)'\]/gm)].map(m => m[1]);
full.__files = libFiles;
vm.runInContext(`__files.forEach(function (f) { var d = mxStencilRegistry.loadStencil(STENCIL_PATH + '/' + f); mxStencilRegistry.parseStencilSet(d.documentElement, null, true); });`, full);
let bad = 0;
for (const k of keys) {
  full.__k = k; lazy.__k = k;
  const a = vm.runInContext('__ser(mxStencilRegistry.stencils[__k].desc)', full);
  const b = vm.runInContext('__ser(mxStencilRegistry.getStencil(__k).desc)', lazy);
  if (a !== b) { if (bad++ < 3) console.error('MISMATCH', k, '\n', a.slice(0, 300), '\n', b.slice(0, 300)); }
}
console.error(`${keys.length - bad}/${keys.length} shapes identical`);
process.exit(bad ? 1 : 0);
