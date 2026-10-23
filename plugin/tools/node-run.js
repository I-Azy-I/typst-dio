// Dev harness: runs the plugin's JS in a bare V8 context (like QuickJS would),
// then renders a diagram and prints the JSON result.
// Usage: node tools/node-run.js <file.drawio> [page]
const vm = require('vm'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const sources = require(path.join(root, 'js', 'sources.json'));
const ctx = vm.createContext(require('./natives')());
let t0 = Date.now();
for (const s of sources) {
  try { vm.runInContext(fs.readFileSync(path.join(root, s), 'utf8'), ctx, { filename: s }); }
  catch (e) { console.error('load error in', s, e); console.error(vm.runInContext('__drawioLogs().join("\\n")', ctx)); process.exit(1); }
}
console.error('load ms', Date.now() - t0);
if (process.argv[2]) {
  ctx.__input = fs.readFileSync(process.argv[2], 'utf8');
  ctx.__opts = JSON.stringify({ page: process.argv[3] ?? 0 });
  t0 = Date.now();
  let out;
  try { out = vm.runInContext('__drawioRenderJson(__input, __opts)', ctx); }
  catch (e) { console.error('render error', e instanceof Error ? e.message + '\n' + String(e.stack).split('\n').filter(l => /^\s+at /.test(l)).slice(0, 14).map(l => l.slice(0, 200)).join('\n') : e); }
  console.error('render ms', Date.now() - t0);
  console.error(vm.runInContext('__drawioLogs().join("\\n")', ctx));
  if (out) console.log(out);
} else console.error(vm.runInContext('__drawioLogs().join("\\n")', ctx));
