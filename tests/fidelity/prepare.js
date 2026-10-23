// Prepares the fidelity corpus: every page of every .drawio/.xml file under
// the given directories becomes a single-page, uncompressed file in
//   <work>/cases/full/<id>.drawio   the page as-is
//   <work>/cases/geom/<id>.drawio   the same with noLabel=1 on every cell, so
//                                   both renderers draw shapes and edges only
// and <work>/cases.json lists the ids with their source.
// Usage: node prepare.js <work> <dir>...
const vm = require('vm'), fs = require('fs'), path = require('path');
const plugin = path.join(__dirname, '../../plugin');
const ctx = vm.createContext(require(path.join(plugin, 'tools/natives'))());
for (const s of require(path.join(plugin, 'js/sources.json'))) {
  vm.runInContext(fs.readFileSync(path.join(plugin, s), 'utf8'), ctx, { filename: s });
}

const [work, ...dirs] = process.argv.slice(2);
if (!work || dirs.length === 0) { console.error('usage: node prepare.js <work> <dir>...'); process.exit(2); }
for (const d of ['cases/full', 'cases/geom']) fs.mkdirSync(path.join(work, d), { recursive: true });

function files(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? files(path.join(d, e.name)) : /\.(drawio|xml)$/.test(e.name) ? [path.join(d, e.name)] : []);
}

// Returns [{name, xml}] with one uncompressed <mxGraphModel> per page.
vm.runInContext(`function __pages(src) {
  var root = mxUtils.parseXml(src).documentElement, out = [];
  if (root == null) return out;
  var list = root.nodeName == 'mxfile' ? root.childNodes.filter(function (n) { return n.nodeName == 'diagram'; }) :
    root.nodeName == 'mxGraphModel' ? [root] : [];
  list.forEach(function (p, i) {
    var model = p.nodeName == 'mxGraphModel' ? p : p.childNodes.filter(function (n) { return n.nodeName == 'mxGraphModel'; })[0];
    if (model == null) {
      var txt = mxUtils.trim(mxUtils.getTextContent(p));
      if (txt.length == 0) return;
      model = mxUtils.parseXml(Graph.decompress(txt)).documentElement;
    }
    out.push({ name: p.getAttribute('name') || ('Page-' + (i + 1)), xml: mxUtils.getXml(model) });
  });
  return out;
}
function __noLabels(xml) {
  var doc = mxUtils.parseXml(xml);
  doc.documentElement.getElementsByTagName('mxCell').forEach(function (c) {
    var st = c.getAttribute('style');
    c.setAttribute('style', (st ? st.replace(/;?$/, ';') : '') + 'noLabel=1;');
  });
  return mxUtils.getXml(doc.documentElement);
}`, ctx);

const cases = [];
const wrap = (name, xml) => `<mxfile><diagram name="${name.replace(/[&<"]/g, '_')}">${xml}</diagram></mxfile>\n`;
for (const dir of dirs) {
  for (const f of files(dir)) {
    ctx.__src = fs.readFileSync(f, 'utf8');
    let pages;
    try { pages = vm.runInContext('__pages(__src)', ctx); } catch (e) { continue; }
    pages.forEach((p, i) => {
      const rel = path.relative(dir, f).replace(/\.(drawio|xml)$/, '');
      const id = (path.basename(dir) + '__' + rel + (pages.length > 1 ? '__p' + i : '')).replace(/[^\w.-]+/g, '_');
      ctx.__xml = p.xml;
      fs.writeFileSync(path.join(work, 'cases/full', id + '.drawio'), wrap(p.name, p.xml));
      fs.writeFileSync(path.join(work, 'cases/geom', id + '.drawio'), wrap(p.name, vm.runInContext('__noLabels(__xml)', ctx)));
      cases.push({ id, source: f, page: i });
    });
  }
}
fs.writeFileSync(path.join(work, 'cases.json'), JSON.stringify(cases, null, 1));
console.error(`${cases.length} cases`);
