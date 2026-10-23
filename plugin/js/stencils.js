// Lazy stencil loading. draw.io's stencils.min.js decodes a whole library
// (e.g. 1050 AWS shapes) on first use, which is far too slow in Typst's wasm
// interpreter. tools/build-stencils.js stores each library's deflated payload
// in stencils.bin and records, per shape, the decoder state at its start
// (stencil-index.bin);
// here a single shape is decoded from that checkpoint. The decoder is a port
// of `decode` in stencils.min.js (draw.io, Apache-2.0).
(function (g) {
  'use strict';

  var draw = { move: 1, line: 1, quad: 1, curve: 1, arc: 1, rect: 1, roundrect: 1, ellipse: 1, text: 1, image: 1, 'include-shape': 1 };
  var xs = { x: 1, x1: 1, x2: 1, x3: 1 };
  var ys = { y: 1, y1: 1, y2: 1, y3: 1 };

  function Attributes() {}
  Attributes.prototype = Object.freeze(Object.create(null));
  var none = Object.freeze(new Attributes());

  // Light element for mxStencil (same API as StencilNode in stencils.min.js)
  function StencilNode(name, parent) {
    this.nodeName = name;
    this.parentNode = parent;
    this.firstChild = null;
    this.nextSibling = null;
    this.attrs = none;
  }
  StencilNode.prototype.nodeType = 1;
  StencilNode.prototype.getAttribute = function (name) {
    var v = this.attrs[name];
    return typeof v === 'string' ? v : null;
  };
  StencilNode.prototype.getElementsByTagName = function (name) {
    var result = [];
    (function collect(node) {
      for (var c = node.firstChild; c != null; c = c.nextSibling) {
        if (c.nodeName == name) result.push(c);
        collect(c);
      }
    })(this);
    return result;
  };
  Object.defineProperty(StencilNode.prototype, 'attributes', {
    get: function () {
      var names = Object.keys(this.attrs), out = [];
      for (var i = 0; i < names.length; i++) out.push({ name: names[i], nodeName: names[i], value: this.attrs[names[i]] });
      return out;
    }
  });

  // Decodes the element starting at checkpoint `cp` = [op, p1, p2, p3, si,
  // names, attrNames] (stream positions and dictionary sizes) from the
  // library streams `lib` = {s: [ops, xs, ys, nums], strs, names, attrs}.
  // With `all` set, decodes the whole library and stores each <shape>'s
  // checkpoint in node.cp (used by tools/build-stencils.js); `lib.names` and
  // `lib.attrs` are then filled in as they are read.
  function decode(lib, cp, all) {
    var s = lib.s, ops = s[0], strs = lib.strs;
    var names = lib.names, attrNames = lib.attrs;
    var p = [cp[0], cp[1], cp[2], cp[3]], si = cp[4], nn = cp[5], an = cp[6];
    var root = new StencilNode(null, null), parent = root, prev = null, depth = 0;
    var px = 0, py = 0, pn = new Map();

    function read(k) {
      var bytes = s[k], n = 0, m = 1, c;
      do { c = bytes[p[k]++]; n += (c & 127) * m; m *= 128; } while (c & 128);
      return (n % 2 == 1) ? -(n + 1) / 2 : n / 2;
    }

    while (p[0] < ops.length) {
      var here = all ? [p[0], p[1], p[2], p[3], si, nn, an] : null;
      var op = ops[p[0]++];
      if (op == 255) {
        prev = parent;
        parent = parent.parentNode;
        if (--depth == 0 && !all) break;
        continue;
      }
      if ((op >> 1) == nn) { if (all) names.push(strs[si]); si++; nn++; }
      var name = names[op >> 1];
      var node = new StencilNode(name, parent);
      var count = ops[p[0]++];
      var coords = draw[name] === 1;
      if (prev == null) parent.firstChild = node; else prev.nextSibling = node;
      if (name == 'shape') {
        px = 0; py = 0; pn = new Map();
        if (all) node.cp = here;
      }
      if (count > 0) node.attrs = new Attributes();
      for (var i = 0; i < count; i++) {
        var id = ops[p[0]++];
        if (id == an) { if (all) attrNames.push(strs[si]); si++; an++; }
        var attr = attrNames[id];
        if (ops[p[0]++] == 0) node.attrs[attr] = strs[si++];
        else if (coords && xs[attr] === 1) { px += read(1); node.attrs[attr] = String(px / 1000); }
        else if (coords && ys[attr] === 1) { py += read(2); node.attrs[attr] = String(py / 1000); }
        else {
          var key = name + ' ' + attr;
          var next = (pn.get(key) || 0) + read(3);
          pn.set(key, next);
          node.attrs[attr] = String(next / 1000);
        }
      }
      if (op & 1) {
        prev = node;
        if (depth == 0 && !all) break;
      } else {
        parent = node;
        prev = null;
        depth++;
      }
    }
    return root.firstChild;
  }
  g.__stencilDecode = decode;
  g.__StencilNode = StencilNode;

  if (typeof __stencilShape === 'undefined' || typeof mxStencilRegistry === 'undefined') return;

  // The index and library payloads live in the plugin (src/lib.rs):
  // __stencilShape(key) -> [library, checkpoint...] or undefined,
  // __stencilLib(i) -> [ops, xs, ys, nums, strings, names, attrs].
  // Inflated libraries are kept for the duration of one render.
  var libs = {};
  g.__stencilReset = function () { libs = {}; };
  function library(i) {
    var lib = libs[i];
    if (lib == null) {
      var r = __stencilLib(i);
      lib = libs[i] = { s: [r[0], r[1], r[2], r[3]], strs: r[4].split('\0'), names: r[5], attrs: r[6] };
    }
    return lib;
  }

  var getStencil = mxStencilRegistry.getStencil;
  mxStencilRegistry.getStencil = function (name) {
    var stencil = mxStencilRegistry.stencils[name];
    if (stencil == null && name != null) {
      var key = String(name);
      var e = __stencilShape(key);
      if (e == null) { key = key.toLowerCase(); e = __stencilShape(key); }
      if (e != null) {
        var node = decode(library(e[0]), e.slice(1));
        stencil = new mxStencil(node);
        mxStencilRegistry.addStencil(key, stencil);
        return stencil;
      }
    }
    return getStencil.apply(this, arguments);
  };
})(globalThis);
