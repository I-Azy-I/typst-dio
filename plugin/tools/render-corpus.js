// Renders every .drawio/.xml file under the given directories (all pages)
// with the plugin's JS in Node and reports failures with full stack traces.
// Usage: node tools/render-corpus.js <dir>...
const vm = require('vm'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const ctx = vm.createContext(require('./natives')());
for (const s of require(path.join(root, 'js', 'sources.json'))) {
  vm.runInContext(fs.readFileSync(path.join(root, s), 'utf8'), ctx, { filename: s });
}
function files(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? files(path.join(d, e.name)) : /\.(drawio|xml)$/.test(e.name) ? [path.join(d, e.name)] : []);
}
let ok = 0, bad = 0;
const errors = new Map();
for (const f of process.argv.slice(2).flatMap(files)) {
  ctx.__input = fs.readFileSync(f, 'utf8');
  let pages;
  try { pages = JSON.parse(vm.runInContext('__drawioRenderJson(__input, \'{"listOnly":true}\')', ctx)).pages; }
  catch (e) { pages = [0]; }
  for (let p = 0; p < pages.length; p++) {
    ctx.__opts = JSON.stringify({ page: p });
    try { vm.runInContext('__drawioRenderJson(__input, __opts)', ctx); ok++; }
    catch (e) {
      bad++;
      const key = String(e && e.message);
      if (!errors.has(key)) errors.set(key, { file: f, page: p, stack: String(e && e.stack).split('\n').filter(l => /^\s+at /.test(l)).slice(0, 8).join('\n') });
      else errors.get(key).count = (errors.get(key).count || 1) + 1;
    }
    vm.runInContext('__drawioLogs()', ctx);
  }
}
console.log(`${ok} pages rendered, ${bad} failed`);
for (const [msg, e] of errors) console.log(`\n${msg} (${e.count || 1}x) e.g. ${path.relative(process.cwd(), e.file)} page ${e.page}\n${e.stack}`);
