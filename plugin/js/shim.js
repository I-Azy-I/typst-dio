// Minimal browser environment so draw.io's viewer bundle (mxGraph, Graph.js,
// Shapes.js) can run headless inside QuickJS. Only what mxGraph touches while
// loading, decoding a model and painting onto a recording canvas is provided;
// layout queries (offsetWidth, getBBox, ...) report zero sizes.
(function (g) {
  'use strict';

  g.window = g;
  g.self = g;
  g.top = g;
  g.parent = g;
  g.globalThis = g;

  // ───────────── console (messages are collected, see __drawioLogs) ─────────────
  var logs = [];
  function logger(level) {
    return function () {
      var parts = [];
      for (var i = 0; i < arguments.length; i++) {
        var a = arguments[i];
        parts.push(a instanceof Error ? a.message + '\n' + a.stack : String(a));
      }
      if (logs.length < 200) logs.push(level + ': ' + parts.join(' '));
    };
  }
  g.console = {
    log: logger('log'), info: logger('info'), warn: logger('warn'),
    error: logger('error'), debug: logger('debug'), trace: logger('trace'),
    time: function () {}, timeEnd: function () {}, group: function () {},
    groupEnd: function () {}, assert: function () {}
  };
  g.__drawioLogs = function () { var l = logs; logs = []; return l; };

  // ───────────── timers (run on demand by __flushTimers) ─────────────
  var timers = [];
  var timerId = 1;
  g.setTimeout = function (fn, delay) {
    var id = timerId++;
    if (typeof fn === 'function') timers.push({ id: id, fn: fn, args: Array.prototype.slice.call(arguments, 2) });
    return id;
  };
  g.clearTimeout = function (id) {
    for (var i = 0; i < timers.length; i++) if (timers[i].id === id) { timers.splice(i, 1); return; }
  };
  g.setInterval = function () { return timerId++; };
  g.clearInterval = function () {};
  g.requestAnimationFrame = function (fn) { return g.setTimeout(fn, 0); };
  g.cancelAnimationFrame = g.clearTimeout;
  g.queueMicrotask = function (fn) { g.setTimeout(fn, 0); };
  g.__flushTimers = function () {
    for (var n = 0; timers.length > 0 && n < 10000; n++) {
      var t = timers.shift();
      try { t.fn.apply(g, t.args); } catch (e) { g.console.error('timer', e); }
    }
  };

  // ───────────── base64 ─────────────
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var B64R = {};
  for (var bi = 0; bi < 64; bi++) B64R[B64.charAt(bi)] = bi;
  B64R['-'] = 62; B64R['_'] = 63;
  function bytesToBinary(b) {
    var parts = [];
    for (var i = 0; i < b.length; i += 8192) parts.push(String.fromCharCode.apply(null, b.subarray(i, i + 8192)));
    return parts.join('');
  }
  g.__bytesToBinary = bytesToBinary;
  g.atob = function (s) {
    s = String(s);
    if (typeof __b64 === 'function') return bytesToBinary(__b64(s));
    var out = [], acc = 0, bits = 0;
    for (var i = 0; i < s.length; i++) {
      var v = B64R[s.charAt(i)];
      if (v === undefined) continue;
      acc = (acc << 6) | v;
      bits += 6;
      if (bits >= 8) { bits -= 8; out.push(String.fromCharCode((acc >> bits) & 255)); }
    }
    return out.join('');
  };
  g.btoa = function (s) {
    s = String(s);
    var out = [];
    for (var i = 0; i < s.length; i += 3) {
      var a = s.charCodeAt(i), b = s.charCodeAt(i + 1), c = s.charCodeAt(i + 2);
      var n = (a << 16) | ((b || 0) << 8) | (c || 0);
      out.push(B64.charAt(n >> 18 & 63), B64.charAt(n >> 12 & 63),
        i + 1 < s.length ? B64.charAt(n >> 6 & 63) : '=', i + 2 < s.length ? B64.charAt(n & 63) : '=');
    }
    return out.join('');
  };

  // ───────────── CSS colours ─────────────
  // mxUtils.isValidColor relies on CSS.supports('color', value) (stencil
  // colours are dropped without it).
  var NAMED_COLORS = { aliceblue: 'f0f8ff', antiquewhite: 'faebd7', aqua: '00ffff', aquamarine: '7fffd4', azure: 'f0ffff', beige: 'f5f5dc', bisque: 'ffe4c4', black: '000000', blanchedalmond: 'ffebcd', blue: '0000ff', blueviolet: '8a2be2', brown: 'a52a2a', burlywood: 'deb887', cadetblue: '5f9ea0', chartreuse: '7fff00', chocolate: 'd2691e', coral: 'ff7f50', cornflowerblue: '6495ed', cornsilk: 'fff8dc', crimson: 'dc143c', cyan: '00ffff', darkblue: '00008b', darkcyan: '008b8b', darkgoldenrod: 'b8860b', darkgray: 'a9a9a9', darkgreen: '006400', darkgrey: 'a9a9a9', darkkhaki: 'bdb76b', darkmagenta: '8b008b', darkolivegreen: '556b2f', darkorange: 'ff8c00', darkorchid: '9932cc', darkred: '8b0000', darksalmon: 'e9967a', darkseagreen: '8fbc8f', darkslateblue: '483d8b', darkslategray: '2f4f4f', darkslategrey: '2f4f4f', darkturquoise: '00ced1', darkviolet: '9400d3', deeppink: 'ff1493', deepskyblue: '00bfff', dimgray: '696969', dimgrey: '696969', dodgerblue: '1e90ff', firebrick: 'b22222', floralwhite: 'fffaf0', forestgreen: '228b22', fuchsia: 'ff00ff', gainsboro: 'dcdcdc', ghostwhite: 'f8f8ff', gold: 'ffd700', goldenrod: 'daa520', gray: '808080', green: '008000', greenyellow: 'adff2f', grey: '808080', honeydew: 'f0fff0', hotpink: 'ff69b4', indianred: 'cd5c5c', indigo: '4b0082', ivory: 'fffff0', khaki: 'f0e68c', lavender: 'e6e6fa', lavenderblush: 'fff0f5', lawngreen: '7cfc00', lemonchiffon: 'fffacd', lightblue: 'add8e6', lightcoral: 'f08080', lightcyan: 'e0ffff', lightgoldenrodyellow: 'fafad2', lightgray: 'd3d3d3', lightgreen: '90ee90', lightgrey: 'd3d3d3', lightpink: 'ffb6c1', lightsalmon: 'ffa07a', lightseagreen: '20b2aa', lightskyblue: '87cefa', lightslategray: '778899', lightslategrey: '778899', lightsteelblue: 'b0c4de', lightyellow: 'ffffe0', lime: '00ff00', limegreen: '32cd32', linen: 'faf0e6', magenta: 'ff00ff', maroon: '800000', mediumaquamarine: '66cdaa', mediumblue: '0000cd', mediumorchid: 'ba55d3', mediumpurple: '9370db', mediumseagreen: '3cb371', mediumslateblue: '7b68ee', mediumspringgreen: '00fa9a', mediumturquoise: '48d1cc', mediumvioletred: 'c71585', midnightblue: '191970', mintcream: 'f5fffa', mistyrose: 'ffe4e1', moccasin: 'ffe4b5', navajowhite: 'ffdead', navy: '000080', oldlace: 'fdf5e6', olive: '808000', olivedrab: '6b8e23', orange: 'ffa500', orangered: 'ff4500', orchid: 'da70d6', palegoldenrod: 'eee8aa', palegreen: '98fb98', paleturquoise: 'afeeee', palevioletred: 'db7093', papayawhip: 'ffefd5', peachpuff: 'ffdab9', peru: 'cd853f', pink: 'ffc0cb', plum: 'dda0dd', powderblue: 'b0e0e6', purple: '800080', rebeccapurple: '663399', red: 'ff0000', rosybrown: 'bc8f8f', royalblue: '4169e1', saddlebrown: '8b4513', salmon: 'fa8072', sandybrown: 'f4a460', seagreen: '2e8b57', seashell: 'fff5ee', sienna: 'a0522d', silver: 'c0c0c0', skyblue: '87ceeb', slateblue: '6a5acd', slategray: '708090', slategrey: '708090', snow: 'fffafa', springgreen: '00ff7f', steelblue: '4682b4', tan: 'd2b48c', teal: '008080', thistle: 'd8bfd8', tomato: 'ff6347', turquoise: '40e0d0', violet: 'ee82ee', wheat: 'f5deb3', white: 'ffffff', whitesmoke: 'f5f5f5', yellow: 'ffff00', yellowgreen: '9acd32' };
  g.__cssNamedColors = NAMED_COLORS;
  var colorFn = /^(rgb|hsl)a?\(\s*[-+\d.]+(deg|%)?(\s*[,\s]\s*[-+\d.]+%?){2}(\s*[,\/]\s*[\d.]+%?)?\s*\)$/i;
  g.CSS = {
    supports: function (prop, value) {
      if (String(prop).toLowerCase() !== 'color') return true;
      var v = String(value).trim().toLowerCase();
      return /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(v) || colorFn.test(v) ||
        NAMED_COLORS[v] != null || v === 'transparent' || v === 'currentcolor';
    },
    escape: function (s) { return String(s).replace(/[^\w-]/g, function (c) { return '\\' + c; }); }
  };

  // ───────────── legacy RegExp.$1-$9 ─────────────
  // QuickJS lacks these; rough.js (sketch style) reads them after
  // String.prototype.match, so only match() results are tracked.
  if (!('$1' in RegExp)) {
    var lastMatch = null, strMatch = String.prototype.match;
    String.prototype.match = function (re) {
      var m = strMatch.apply(this, arguments);
      if (m != null && !(re instanceof RegExp && re.global)) lastMatch = m;
      return m;
    };
    for (var ri = 1; ri <= 9; ri++) (function (i) {
      Object.defineProperty(RegExp, '$' + i, { configurable: true,
        get: function () { return lastMatch != null && lastMatch[i] != null ? lastMatch[i] : ''; } });
    })(ri);
  }

  // ───────────── text encoding (UTF-8 only) ─────────────
  function TextEncoder() { this.encoding = 'utf-8'; }
  TextEncoder.prototype.encode = function (str) {
    str = String(str == null ? '' : str);
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) {
        var d = str.charCodeAt(i + 1);
        if (d >= 0xdc00 && d < 0xe000) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; }
      }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | c >> 6, 0x80 | c & 63);
      else if (c < 0x10000) out.push(0xe0 | c >> 12, 0x80 | c >> 6 & 63, 0x80 | c & 63);
      else out.push(0xf0 | c >> 18, 0x80 | c >> 12 & 63, 0x80 | c >> 6 & 63, 0x80 | c & 63);
    }
    return new Uint8Array(out);
  };
  function TextDecoder(label) { this.encoding = String(label || 'utf-8').toLowerCase(); }
  TextDecoder.prototype.decode = function (buf) {
    if (buf == null) return '';
    var b = buf instanceof Uint8Array ? buf : ArrayBuffer.isView(buf) ?
      new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) : new Uint8Array(buf);
    if (typeof __utf8 === 'function' && (this.encoding === 'utf-8' || this.encoding === 'utf8')) return __utf8(b);
    var parts = [], chunk = [];
    for (var i = 0; i < b.length;) {
      var c = b[i++], cp;
      if (this.encoding !== 'utf-8' && this.encoding !== 'utf8') cp = c;
      else if (c < 0x80) cp = c;
      else if (c >= 0xc0 && c < 0xe0) cp = (c & 31) << 6 | b[i++] & 63;
      else if (c >= 0xe0 && c < 0xf0) { cp = (c & 15) << 12 | (b[i] & 63) << 6 | b[i + 1] & 63; i += 2; }
      else if (c >= 0xf0) { cp = (c & 7) << 18 | (b[i] & 63) << 12 | (b[i + 1] & 63) << 6 | b[i + 2] & 63; i += 3; }
      else cp = 0xfffd;
      if (cp >= 0x10000) { cp -= 0x10000; chunk.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023)); }
      else chunk.push(cp);
      if (chunk.length >= 8192) { parts.push(String.fromCharCode.apply(null, chunk)); chunk = []; }
    }
    parts.push(String.fromCharCode.apply(null, chunk));
    return parts.join('');
  };
  g.TextEncoder = TextEncoder;
  g.TextDecoder = TextDecoder;

  // ───────────── environment objects ─────────────
  g.navigator = {
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    appVersion: '5.0 (X11; Linux x86_64)', appName: 'Netscape', platform: 'Linux x86_64',
    language: 'en', languages: ['en'], onLine: false, maxTouchPoints: 0, vendor: 'Google Inc.',
    clipboard: null, serviceWorker: undefined
  };
  g.location = {
    href: 'https://localhost/', protocol: 'https:', host: 'localhost', hostname: 'localhost',
    origin: 'https://localhost', port: '', pathname: '/', search: '', hash: '',
    reload: function () {}, replace: function () {}, assign: function () {}
  };
  g.history = { pushState: function () {}, replaceState: function () {}, state: null };
  g.screen = { width: 1920, height: 1080, availWidth: 1920, availHeight: 1080 };
  g.devicePixelRatio = 1;
  g.innerWidth = 1920; g.innerHeight = 1080;
  g.outerWidth = 1920; g.outerHeight = 1080;
  g.pageXOffset = 0; g.pageYOffset = 0; g.scrollX = 0; g.scrollY = 0;
  g.performance = { now: function () { return Date.now(); } };
  g.matchMedia = function () {
    return { matches: false, media: '', addListener: function () {}, removeListener: function () {},
      addEventListener: function () {}, removeEventListener: function () {} };
  };
  function Storage() { this._d = {}; }
  Storage.prototype.getItem = function (k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; };
  Storage.prototype.setItem = function (k, v) { this._d[k] = String(v); };
  Storage.prototype.removeItem = function (k) { delete this._d[k]; };
  Storage.prototype.clear = function () { this._d = {}; };
  Storage.prototype.key = function (i) { return Object.keys(this._d)[i] || null; };
  g.localStorage = new Storage();
  g.sessionStorage = new Storage();
  g.getComputedStyle = function (el) { return (el && el.style) || new CSSStyleDeclaration(); };
  g.scrollTo = function () {};
  g.open = function () { return null; };
  g.alert = function () {};
  g.confirm = function () { return false; };
  g.prompt = function () { return null; };
  g.postMessage = function () {};
  g.fetch = function () { return Promise.reject(new Error('fetch is not available')); };
  function Noop() {}
  Noop.prototype.observe = function () {};
  Noop.prototype.unobserve = function () {};
  Noop.prototype.disconnect = function () {};
  g.MutationObserver = Noop;
  g.ResizeObserver = Noop;
  g.IntersectionObserver = Noop;
  g.Worker = undefined;

  // ───────────── events ─────────────
  function Event(type, init) {
    this.type = type;
    this.bubbles = !!(init && init.bubbles);
    this.cancelable = !!(init && init.cancelable);
    this.defaultPrevented = false;
    this.detail = init && init.detail;
  }
  Event.prototype.preventDefault = function () { this.defaultPrevented = true; };
  Event.prototype.stopPropagation = function () {};
  Event.prototype.stopImmediatePropagation = function () {};
  Event.prototype.initEvent = function (type, bubbles, cancelable) { this.type = type; this.bubbles = bubbles; this.cancelable = cancelable; };
  Event.prototype.initCustomEvent = function (type, bubbles, cancelable, detail) { this.initEvent(type, bubbles, cancelable); this.detail = detail; };
  g.Event = Event;
  g.CustomEvent = Event;
  g.MouseEvent = Event;
  g.KeyboardEvent = Event;
  g.PointerEvent = Event;

  var EventTargetProto = {
    addEventListener: function (type, fn) {
      if (!this._listeners) this._listeners = {};
      (this._listeners[type] = this._listeners[type] || []).push(fn);
    },
    removeEventListener: function (type, fn) {
      var l = this._listeners && this._listeners[type];
      if (l) { var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }
    },
    dispatchEvent: function (evt) {
      var l = this._listeners && this._listeners[evt.type];
      if (l) l.slice().forEach(function (fn) { try { fn.call(this, evt); } catch (e) { g.console.error(e); } }, this);
      return !evt.defaultPrevented;
    },
    attachEvent: function () {},
    detachEvent: function () {}
  };
  for (var ek in EventTargetProto) g[ek] = EventTargetProto[ek];

  // ───────────── CSS ─────────────
  function camel(n) { return n.replace(/-([a-z])/g, function (m, c) { return c.toUpperCase(); }); }
  function dash(n) { return n.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); }); }
  function CSSStyleDeclaration() {}
  CSSStyleDeclaration.prototype.setProperty = function (n, v) { this[camel(n)] = v == null ? '' : String(v); };
  CSSStyleDeclaration.prototype.getPropertyValue = function (n) { var v = this[camel(n)]; return v == null ? '' : v; };
  CSSStyleDeclaration.prototype.removeProperty = function (n) { delete this[camel(n)]; };
  Object.defineProperty(CSSStyleDeclaration.prototype, 'cssText', {
    get: function () {
      var out = [];
      for (var k in this) {
        if (Object.prototype.hasOwnProperty.call(this, k) && this[k] !== '' && this[k] != null) out.push(dash(k) + ': ' + this[k] + ';');
      }
      return out.join(' ');
    },
    set: function (css) {
      for (var k in this) if (Object.prototype.hasOwnProperty.call(this, k)) delete this[k];
      String(css || '').split(';').forEach(function (decl) {
        var i = decl.indexOf(':');
        if (i > 0) this[camel(decl.substring(0, i).trim())] = decl.substring(i + 1).trim();
      }, this);
    }
  });
  g.CSSStyleDeclaration = CSSStyleDeclaration;

  function ClassList(el) { this.el = el; }
  ClassList.prototype._get = function () { return (this.el.getAttribute('class') || '').split(/\s+/).filter(Boolean); };
  ClassList.prototype.contains = function (c) { return this._get().indexOf(c) >= 0; };
  ClassList.prototype.add = function () {
    var l = this._get();
    for (var i = 0; i < arguments.length; i++) if (l.indexOf(arguments[i]) < 0) l.push(arguments[i]);
    this.el.setAttribute('class', l.join(' '));
  };
  ClassList.prototype.remove = function () {
    var rm = Array.prototype.slice.call(arguments);
    this.el.setAttribute('class', this._get().filter(function (c) { return rm.indexOf(c) < 0; }).join(' '));
  };
  ClassList.prototype.toggle = function (c, force) {
    var has = this.contains(c);
    if (force === undefined) force = !has;
    if (force) this.add(c); else this.remove(c);
    return force;
  };

  // ───────────── DOM nodes ─────────────
  var HTML_NS = 'http://www.w3.org/1999/xhtml';

  function NodeList(arr) { arr.item = function (i) { return this[i] || null; }; return arr; }

  function Node() {}
  Node.ELEMENT_NODE = 1; Node.ATTRIBUTE_NODE = 2; Node.TEXT_NODE = 3; Node.CDATA_SECTION_NODE = 4;
  Node.PROCESSING_INSTRUCTION_NODE = 7; Node.COMMENT_NODE = 8; Node.DOCUMENT_NODE = 9;
  Node.DOCUMENT_FRAGMENT_NODE = 11;
  for (var ek2 in EventTargetProto) Node.prototype[ek2] = EventTargetProto[ek2];
  Node.prototype._init = function (doc) {
    this.ownerDocument = doc;
    this.parentNode = null;
    this.childNodes = NodeList([]);
  };
  function sib(node, d) {
    var p = node.parentNode;
    if (!p) return null;
    var i = p.childNodes.indexOf(node);
    return p.childNodes[i + d] || null;
  }
  Object.defineProperties(Node.prototype, {
    firstChild: { get: function () { return this.childNodes[0] || null; } },
    lastChild: { get: function () { return this.childNodes[this.childNodes.length - 1] || null; } },
    nextSibling: { get: function () { return sib(this, 1); } },
    previousSibling: { get: function () { return sib(this, -1); } },
    parentElement: { get: function () { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; } },
    isConnected: { get: function () { var n = this; while (n.parentNode) n = n.parentNode; return n.nodeType === 9; } },
    textContent: {
      get: function () {
        if (this.nodeType === 3 || this.nodeType === 4 || this.nodeType === 8) return this.nodeValue;
        return this.childNodes.map(function (c) { return c.nodeType === 8 ? '' : c.textContent; }).join('');
      },
      set: function (v) {
        if (this.nodeType === 3 || this.nodeType === 4 || this.nodeType === 8) { this.nodeValue = String(v); return; }
        this._clear();
        if (v != null && v !== '') this.appendChild(this.ownerDocument.createTextNode(String(v)));
      }
    }
  });
  // Core fields are accessors on the prototype (backed by _fields) because
  // DOMPurify reads them through Object.getOwnPropertyDescriptor lookups.
  ['nodeType', 'nodeName', 'nodeValue', 'parentNode', 'childNodes', 'ownerDocument', 'attributes'].forEach(function (p) {
    var f = '_' + p;
    Object.defineProperty(Node.prototype, p, {
      get: function () { return this[f] === undefined ? null : this[f]; },
      set: function (v) { this[f] = v; },
      configurable: true
    });
  });
  Node.prototype.hasChildNodes = function () { return this.childNodes.length > 0; };
  Node.prototype._clear = function () {
    this.childNodes.forEach(function (c) { c.parentNode = null; });
    this.childNodes.length = 0;
  };
  Node.prototype.appendChild = function (c) { return this.insertBefore(c, null); };
  Node.prototype.insertBefore = function (c, ref) {
    if (c.nodeType === 11) {
      var kids = c.childNodes.slice();
      for (var i = 0; i < kids.length; i++) this.insertBefore(kids[i], ref);
      return c;
    }
    if (c.parentNode) c.parentNode.removeChild(c);
    var idx = ref ? this.childNodes.indexOf(ref) : -1;
    if (idx < 0) this.childNodes.push(c); else this.childNodes.splice(idx, 0, c);
    c.parentNode = this;
    return c;
  };
  Node.prototype.removeChild = function (c) {
    var i = this.childNodes.indexOf(c);
    if (i >= 0) { this.childNodes.splice(i, 1); c.parentNode = null; }
    return c;
  };
  Node.prototype.replaceChild = function (n, old) {
    this.insertBefore(n, old);
    return this.removeChild(old);
  };
  Node.prototype.remove = function () { if (this.parentNode) this.parentNode.removeChild(this); };
  Node.prototype.contains = function (n) {
    while (n) { if (n === this) return true; n = n.parentNode; }
    return false;
  };
  Node.prototype.cloneNode = function (deep) {
    var c;
    if (this.nodeType === 1) {
      c = this.ownerDocument.createElementNS(this.namespaceURI, this.nodeName);
      for (var i = 0; i < this.attributes.length; i++) {
        var a = this.attributes[i];
        c.setAttributeNS(a.namespaceURI, a.name, a.value);
      }
    } else if (this.nodeType === 3) c = this.ownerDocument.createTextNode(this.nodeValue);
    else if (this.nodeType === 4) c = this.ownerDocument.createCDATASection(this.nodeValue);
    else if (this.nodeType === 8) c = this.ownerDocument.createComment(this.nodeValue);
    else if (this.nodeType === 11) c = this.ownerDocument.createDocumentFragment();
    else if (this.nodeType === 9) { c = new Document(this.isXml); }
    else c = this.ownerDocument.createProcessingInstruction(this.nodeName, this.nodeValue);
    if (deep) this.childNodes.forEach(function (k) {
      var kc = k.cloneNode(true);
      if (c.nodeType === 9) setOwner(kc, c);
      c.appendChild(kc);
    });
    return c;
  };
  Node.prototype.normalize = function () {};
  Node.prototype.isEqualNode = function (o) { return o === this; };
  Node.prototype.compareDocumentPosition = function () { return 0; };
  Node.prototype.lookupNamespaceURI = function () { return null; };
  g.Node = Node;

  function setOwner(n, doc) {
    n.ownerDocument = doc;
    n.childNodes.forEach(function (c) { setOwner(c, doc); });
  }

  function CharacterData(doc, type, name, value) {
    this._init(doc);
    this.nodeType = type;
    this.nodeName = name;
    this.nodeValue = String(value);
  }
  CharacterData.prototype = Object.create(Node.prototype);
  Object.defineProperty(CharacterData.prototype, 'data', {
    get: function () { return this.nodeValue; }, set: function (v) { this.nodeValue = String(v); }
  });
  Object.defineProperty(CharacterData.prototype, 'length', { get: function () { return this.nodeValue.length; } });
  g.Text = CharacterData;
  g.Comment = CharacterData;

  function Attr(ns, name, value) {
    this.namespaceURI = ns || null;
    this.name = this.nodeName = name;
    var i = name.indexOf(':');
    this.localName = i >= 0 ? name.substring(i + 1) : name;
    this.prefix = i >= 0 ? name.substring(0, i) : null;
    this.value = this.nodeValue = String(value);
    this.nodeType = 2;
    this.specified = true;
  }

  // Simple CSS selector support: tag, #id, .class, [attr], [attr=value], and
  // descendant combinators. Enough for the few lookups mxGraph performs.
  function matchSimple(el, sel) {
    var re = /([#.]?)([\w-]+|\*)|\[([\w:-]+)(?:([~^$*|]?=)["']?([^"'\]]*)["']?)?\]/g, m;
    var ok = true, any = false;
    while ((m = re.exec(sel)) != null) {
      any = true;
      if (m[3] != null) {
        var v = el.getAttribute(m[3]);
        if (v == null) { ok = false; break; }
        if (m[4] === '=' && v !== m[5]) { ok = false; break; }
      } else if (m[1] === '#') {
        if (el.getAttribute('id') !== m[2]) { ok = false; break; }
      } else if (m[1] === '.') {
        if (el.classList.contains(m[2]) === false) { ok = false; break; }
      } else if (m[2] !== '*' && el.nodeName.toLowerCase() !== m[2].toLowerCase()) { ok = false; break; }
    }
    return any && ok;
  }
  function matches(el, selector) {
    return selector.split(',').some(function (s) {
      var parts = s.trim().split(/\s+/);
      if (!matchSimple(el, parts[parts.length - 1])) return false;
      var p = el.parentNode, i = parts.length - 2;
      while (i >= 0 && p && p.nodeType === 1) {
        if (matchSimple(p, parts[i])) i--;
        p = p.parentNode;
      }
      return i < 0;
    });
  }
  function walk(node, fn) {
    for (var i = 0; i < node.childNodes.length; i++) {
      var c = node.childNodes[i];
      if (c.nodeType === 1) { if (fn(c) === true) return true; if (walk(c, fn)) return true; }
    }
    return false;
  }

  function Element(doc, ns, name) {
    this._init(doc);
    this.nodeType = 1;
    this.namespaceURI = ns || null;
    var html = ns === HTML_NS && !doc.isXml;
    this.nodeName = this.tagName = html ? name.toUpperCase() : name;
    var i = name.indexOf(':');
    this.localName = i >= 0 ? name.substring(i + 1) : (html ? name.toLowerCase() : name);
    this.prefix = i >= 0 ? name.substring(0, i) : null;
    this.attributes = NodeList([]);
    this.style = new CSSStyleDeclaration();
    this.classList = new ClassList(this);
    this.dataset = {};
    this.scrollLeft = 0; this.scrollTop = 0;
  }
  Element.prototype = Object.create(Node.prototype);
  Element.prototype._attr = function (name) {
    for (var i = 0; i < this.attributes.length; i++) if (this.attributes[i].name === name) return i;
    return -1;
  };
  Element.prototype._attrNS = function (ns, local) {
    for (var i = 0; i < this.attributes.length; i++) {
      var a = this.attributes[i];
      if ((a.namespaceURI || null) === (ns || null) && a.localName === local) return i;
    }
    return -1;
  };
  Element.prototype.getAttribute = function (n) {
    if (n === 'style' && this.namespaceURI === HTML_NS) { var css = this.style.cssText; return css === '' ? (this._attr(n) >= 0 ? '' : null) : css; }
    var i = this._attr(n);
    return i >= 0 ? this.attributes[i].value : null;
  };
  Element.prototype.setAttribute = function (n, v) {
    if (n === 'style') this.style.cssText = v;
    var i = this._attr(n);
    if (i >= 0) this.attributes[i].value = this.attributes[i].nodeValue = String(v);
    else this.attributes.push(new Attr(null, n, v));
  };
  Element.prototype.hasAttribute = function (n) { return this._attr(n) >= 0; };
  Element.prototype.removeAttribute = function (n) { var i = this._attr(n); if (i >= 0) this.attributes.splice(i, 1); };
  Element.prototype.removeAttributeNode = function (a) { var i = this.attributes.indexOf(a); if (i >= 0) this.attributes.splice(i, 1); return a; };
  Element.prototype.getAttributeNode = function (n) { var i = this._attr(n); return i >= 0 ? this.attributes[i] : null; };
  Element.prototype.getAttributeNS = function (ns, n) { var i = this._attrNS(ns, n); return i >= 0 ? this.attributes[i].value : null; };
  Element.prototype.setAttributeNS = function (ns, n, v) {
    var local = n.indexOf(':') >= 0 ? n.substring(n.indexOf(':') + 1) : n;
    var i = this._attrNS(ns, local);
    if (i < 0 && !ns) i = this._attr(n);
    if (i >= 0) this.attributes[i].value = this.attributes[i].nodeValue = String(v);
    else this.attributes.push(new Attr(ns, n, v));
    if (n === 'style') this.style.cssText = v;
  };
  Element.prototype.hasAttributeNS = function (ns, n) { return this._attrNS(ns, n) >= 0; };
  Element.prototype.removeAttributeNS = function (ns, n) { var i = this._attrNS(ns, n); if (i >= 0) this.attributes.splice(i, 1); };
  Element.prototype.getAttributeNames = function () { return this.attributes.map(function (a) { return a.name; }); };
  Element.prototype.getElementsByTagName = function (name) {
    var out = [], lname = name.toLowerCase();
    walk(this, function (c) {
      if (name === '*' || c.nodeName === name || (c.namespaceURI === HTML_NS && c.nodeName.toLowerCase() === lname)) out.push(c);
    });
    return NodeList(out);
  };
  Element.prototype.getElementsByTagNameNS = function (ns, name) {
    var out = [];
    walk(this, function (c) { if ((ns === '*' || c.namespaceURI === ns) && (name === '*' || c.localName === name)) out.push(c); });
    return NodeList(out);
  };
  Element.prototype.getElementsByClassName = function (cls) {
    var out = [];
    walk(this, function (c) { if (c.classList.contains(cls)) out.push(c); });
    return NodeList(out);
  };
  Element.prototype.querySelectorAll = function (sel) {
    var out = [];
    walk(this, function (c) { if (matches(c, sel)) out.push(c); });
    return NodeList(out);
  };
  Element.prototype.querySelector = function (sel) {
    var found = null;
    walk(this, function (c) { if (matches(c, sel)) { found = c; return true; } });
    return found;
  };
  Element.prototype.matches = function (sel) { return matches(this, sel); };
  Element.prototype.closest = function (sel) {
    var n = this;
    while (n && n.nodeType === 1) { if (matches(n, sel)) return n; n = n.parentNode; }
    return null;
  };
  Element.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  };
  Element.prototype.getClientRects = function () { return []; };
  Element.prototype.getBBox = function () { return { x: 0, y: 0, width: 0, height: 0 }; };
  Element.prototype.getComputedTextLength = function () { return 0; };
  Element.prototype.getTotalLength = function () { return 0; };
  Element.prototype.getScreenCTM = function () { return null; };
  Element.prototype.focus = function () {};
  Element.prototype.blur = function () {};
  Element.prototype.click = function () {};
  Element.prototype.scrollIntoView = function () {};
  Element.prototype.setPointerCapture = function () {};
  Element.prototype.releasePointerCapture = function () {};
  Element.prototype.getContext = function () { return null; };
  Element.prototype.toDataURL = function () { return 'data:,'; };
  Element.prototype.append = function () {
    for (var i = 0; i < arguments.length; i++) {
      var a = arguments[i];
      this.appendChild(typeof a === 'string' ? this.ownerDocument.createTextNode(a) : a);
    }
  };
  Element.prototype.insertAdjacentHTML = function () {};
  ['offsetWidth', 'offsetHeight', 'offsetLeft', 'offsetTop', 'clientWidth', 'clientHeight',
    'clientLeft', 'clientTop', 'scrollWidth', 'scrollHeight'].forEach(function (p) {
    Object.defineProperty(Element.prototype, p, { get: function () { return 0; }, set: function () {} });
  });
  Object.defineProperties(Element.prototype, {
    id: { get: function () { return this.getAttribute('id') || ''; }, set: function (v) { this.setAttribute('id', v); } },
    className: {
      get: function () { return this.getAttribute('class') || ''; },
      set: function (v) { this.setAttribute('class', v); }
    },
    children: { get: function () { return NodeList(this.childNodes.filter(function (c) { return c.nodeType === 1; })); } },
    firstElementChild: { get: function () { return this.children[0] || null; } },
    lastElementChild: { get: function () { var c = this.children; return c[c.length - 1] || null; } },
    nextElementSibling: { get: function () { var n = this.nextSibling; while (n && n.nodeType !== 1) n = n.nextSibling; return n; } },
    previousElementSibling: { get: function () { var n = this.previousSibling; while (n && n.nodeType !== 1) n = n.previousSibling; return n; } },
    childElementCount: { get: function () { return this.children.length; } },
    innerHTML: {
      get: function () { return this.childNodes.map(function (c) { return serialize(c, true); }).join(''); },
      set: function (v) {
        this._clear();
        var frag = parseMarkup(String(v == null ? '' : v), this.ownerDocument, true);
        this.appendChild(frag);
      }
    },
    outerHTML: { get: function () { return serialize(this, true); } },
    innerText: {
      get: function () { return this.textContent; },
      set: function (v) { this.textContent = v; }
    },
    value: {
      get: function () { return this.getAttribute('value') || ''; },
      set: function (v) { this.setAttribute('value', v); }
    }
  });
  g.Element = Element;
  g.HTMLElement = Element;
  g.SVGElement = Element;
  g.HTMLCanvasElement = function () {};
  g.HTMLIFrameElement = function () {};
  g.HTMLImageElement = function () {};

  // ───────────── Document ─────────────
  function Document(isXml) {
    this._init(this);
    this.nodeType = 9;
    this.nodeName = '#document';
    this.isXml = !!isXml;
    this.implementation = g.document ? g.document.implementation : null;
  }
  Document.prototype = Object.create(Node.prototype);
  Object.defineProperties(Document.prototype, {
    documentElement: { get: function () { for (var i = 0; i < this.childNodes.length; i++) if (this.childNodes[i].nodeType === 1) return this.childNodes[i]; return null; } },
    body: { get: function () { var d = this.documentElement; return d ? d.getElementsByTagName('body')[0] || null : null; } },
    head: { get: function () { var d = this.documentElement; return d ? d.getElementsByTagName('head')[0] || null : null; } },
    children: { get: function () { return NodeList(this.childNodes.filter(function (c) { return c.nodeType === 1; })); } }
  });
  Document.prototype.createElement = function (n) { return new Element(this, this.isXml ? null : HTML_NS, n); };
  Document.prototype.createElementNS = function (ns, n) { return new Element(this, ns, n); };
  Document.prototype.createTextNode = function (v) { return new CharacterData(this, 3, '#text', v); };
  Document.prototype.createCDATASection = function (v) { return new CharacterData(this, 4, '#cdata-section', v); };
  Document.prototype.createComment = function (v) { return new CharacterData(this, 8, '#comment', v); };
  Document.prototype.createProcessingInstruction = function (t, v) { return new CharacterData(this, 7, t, v); };
  Document.prototype.createDocumentFragment = function () {
    var f = new Element(this, null, '#document-fragment');
    f.nodeType = 11;
    return f;
  };
  Document.prototype.importNode = function (n, deep) { var c = n.cloneNode(deep); setOwner(c, this); return c; };
  Document.prototype.adoptNode = function (n) { if (n.parentNode) n.parentNode.removeChild(n); setOwner(n, this); return n; };
  Document.prototype.getElementById = function (id) {
    var found = null;
    walk(this, function (c) { if (c.getAttribute('id') === id) { found = c; return true; } });
    return found;
  };
  ['getElementsByTagName', 'getElementsByTagNameNS', 'getElementsByClassName', 'querySelector', 'querySelectorAll']
    .forEach(function (m) { Document.prototype[m] = Element.prototype[m]; });
  // Pre-order iterator over a subtree (NodeFilter.SHOW_* bit mask), for DOMPurify
  Document.prototype.createNodeIterator = function (root, whatToShow) {
    var list = [];
    (function collect(n) {
      if (whatToShow == null || (whatToShow & (1 << (n.nodeType - 1))) !== 0) list.push(n);
      for (var i = 0; i < n.childNodes.length; i++) collect(n.childNodes[i]);
    })(root);
    var i = 0;
    return { nextNode: function () { while (i < list.length) { var n = list[i++]; if (n.parentNode || n === root) return n; } return null; },
      detach: function () {} };
  };
  // Pre-order walker (only nextNode/currentNode, as used by draw.io)
  Document.prototype.createTreeWalker = function (root, whatToShow) {
    var it = this.createNodeIterator(root, whatToShow);
    var w = { root: root, currentNode: root,
      nextNode: function () {
        var n = it.nextNode();
        if (n === root) n = it.nextNode();
        if (n) w.currentNode = n;
        return n;
      } };
    return w;
  };
  Document.prototype.createEvent = function () { return new Event(''); };
  Document.prototype.createRange = function () {
    return { selectNodeContents: function () {}, setStart: function () {}, setEnd: function () {},
      collapse: function () {}, getBoundingClientRect: Element.prototype.getBoundingClientRect,
      getClientRects: function () { return []; } };
  };
  Document.prototype.execCommand = function () { return false; };
  Document.prototype.queryCommandState = function () { return false; };
  Document.prototype.queryCommandSupported = function () { return false; };
  Document.prototype.hasFocus = function () { return false; };
  Document.prototype.getSelection = function () { return null; };
  Document.prototype.elementFromPoint = function () { return null; };
  Document.prototype.write = function () {};
  Document.prototype.writeln = function () {};
  Document.prototype.open = function () {};
  Document.prototype.close = function () {};
  Document.prototype.evaluate = undefined;
  g.Document = Document;
  g.NodeFilter = { SHOW_ALL: 0xffffffff, SHOW_ELEMENT: 1, SHOW_ATTRIBUTE: 2, SHOW_TEXT: 4, SHOW_CDATA_SECTION: 8,
    SHOW_PROCESSING_INSTRUCTION: 64, SHOW_COMMENT: 128, SHOW_DOCUMENT: 256, SHOW_DOCUMENT_FRAGMENT: 1024,
    FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 };
  g.DocumentFragment = function () {};
  g.NamedNodeMap = function () {};
  g.XMLDocument = Document;

  var document = new Document(false);
  var html = document.createElement('html');
  html.appendChild(document.createElement('head'));
  html.appendChild(document.createElement('body'));
  document.appendChild(html);
  document.readyState = 'complete';
  document.compatMode = 'CSS1Compat';
  document.characterSet = 'UTF-8';
  document.defaultView = g;
  document.location = g.location;
  document.URL = g.location.href;
  document.referrer = '';
  document.cookie = '';
  document.title = '';
  document.fonts = { add: function () {}, check: function () { return true; }, ready: Promise.resolve(),
    addEventListener: function () {}, load: function () { return Promise.resolve([]); } };
  document.implementation = {
    createDocument: function (ns, name) {
      var d = new Document(true);
      d.implementation = this;
      if (name) d.appendChild(d.createElementNS(ns, name));
      return d;
    },
    createHTMLDocument: function () {
      var d = new Document(false);
      d.implementation = this;
      var h = d.createElement('html');
      h.appendChild(d.createElement('head'));
      h.appendChild(d.createElement('body'));
      d.appendChild(h);
      return d;
    },
    hasFeature: function () { return true; }
  };
  g.document = document;

  // ───────────── markup parser (XML, and lenient HTML for labels) ─────────────
  var VOID = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, param: 1, source: 1, track: 1, wbr: 1 };
  var ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®',
    hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“',
    rdquo: '”', bull: '•', middot: '·', times: '×', divide: '÷', deg: '°',
    euro: '€', laquo: '«', raquo: '»', larr: '←', rarr: '→', uarr: '↑',
    darr: '↓', harr: '↔', le: '≤', ge: '≥', ne: '≠', plusmn: '±', trade: '™',
    shy: '­', ensp: ' ', emsp: ' ', thinsp: ' ', zwj: '‍', zwnj: '‌' };
  function decodeEntities(s) {
    if (s.indexOf('&') < 0) return s;
    return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, function (m, e) {
      if (e.charAt(0) === '#') {
        var cp = e.charAt(1) === 'x' || e.charAt(1) === 'X' ? parseInt(e.substring(2), 16) : parseInt(e.substring(1), 10);
        return isFinite(cp) ? String.fromCodePoint(cp) : m;
      }
      return Object.prototype.hasOwnProperty.call(ENT, e) ? ENT[e] : m;
    });
  }
  g.__decodeEntities = decodeEntities;

  function parseMarkup(src, doc, lenient) {
    var root = doc.createDocumentFragment();
    var stack = [root];
    var nsStack = [{ '': lenient ? HTML_NS : null, xml: 'http://www.w3.org/XML/1998/namespace' }];
    var i = 0, n = src.length;
    var tagEndRe = /["'>]/g;
    var attrRe = /([^\s=\/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;
    function cur() { return stack[stack.length - 1]; }
    function text(t) {
      if (t.length === 0) return;
      var c = cur();
      var last = c.lastChild;
      if (last && last.nodeType === 3) last.nodeValue += t;
      else c.appendChild(doc.createTextNode(t));
    }
    while (i < n) {
      var lt = src.indexOf('<', i);
      if (lt < 0) { text(decodeEntities(src.substring(i))); break; }
      if (lt > i) text(decodeEntities(src.substring(i, lt)));
      if (src.startsWith('<!--', lt)) {
        var ce = src.indexOf('-->', lt + 4);
        if (ce < 0) ce = n;
        cur().appendChild(doc.createComment(src.substring(lt + 4, ce)));
        i = ce + 3;
      } else if (src.startsWith('<![CDATA[', lt)) {
        var de = src.indexOf(']]>', lt + 9);
        if (de < 0) de = n;
        if (lenient) text(src.substring(lt + 9, de));
        else cur().appendChild(doc.createCDATASection(src.substring(lt + 9, de)));
        i = de + 3;
      } else if (src.charAt(lt + 1) === '?') {
        var pe = src.indexOf('?>', lt);
        i = pe < 0 ? n : pe + 2;
      } else if (src.charAt(lt + 1) === '!') {
        // DOCTYPE (may contain an internal subset in brackets)
        var depth = 0, j = lt + 2;
        for (; j < n; j++) {
          var ch = src.charAt(j);
          if (ch === '[') depth++;
          else if (ch === ']') depth--;
          else if (ch === '>' && depth <= 0) break;
        }
        i = j + 1;
      } else if (src.charAt(lt + 1) === '/') {
        var ge = src.indexOf('>', lt);
        if (ge < 0) ge = n;
        var name = src.substring(lt + 2, ge).trim();
        var lname = name.toLowerCase();
        for (var k = stack.length - 1; k > 0; k--) {
          var nn = stack[k].nodeName;
          if (nn === name || (lenient && nn.toLowerCase() === lname)) {
            stack.length = k;
            nsStack.length = k;
            break;
          }
        }
        i = ge + 1;
      } else if (/[A-Za-z_:]/.test(src.charAt(lt + 1))) {
        // start tag: find the closing '>' outside of quotes, jumping over
        // quoted values (they can be megabytes of image data)
        var e = lt + 1;
        for (;;) {
          tagEndRe.lastIndex = e;
          var tm = tagEndRe.exec(src);
          if (tm == null) { e = n; break; }
          e = tm.index;
          if (tm[0] === '>') break;
          var qe = src.indexOf(tm[0], e + 1);
          e = qe < 0 ? n : qe + 1;
        }
        var body = src.substring(lt + 1, e);
        var selfClose = body.charAt(body.length - 1) === '/';
        if (selfClose) body = body.substring(0, body.length - 1);
        var m = /^[^\s\/>]+/.exec(body);
        var tag = m[0];
        var rest = body.substring(tag.length);
        var attrs = [];
        var ns = Object.create(nsStack[nsStack.length - 1]);
        attrRe.lastIndex = 0;
        var am;
        while ((am = attrRe.exec(rest)) != null) {
          var an = am[1];
          var av = am[2] != null ? am[2] : am[3] != null ? am[3] : am[4] != null ? am[4] : (lenient ? '' : an);
          av = decodeEntities(av);
          if (an === 'xmlns') ns[''] = av;
          else if (an.substring(0, 6) === 'xmlns:') ns[an.substring(6)] = av;
          attrs.push([an, av]);
        }
        var ci = tag.indexOf(':');
        var tns = ci >= 0 ? ns[tag.substring(0, ci)] : ns[''];
        var el = new Element(doc, tns || null, tag);
        if (lenient && !tns) { el.namespaceURI = HTML_NS; }
        for (var a = 0; a < attrs.length; a++) {
          var aname = attrs[a][0];
          var ai = aname.indexOf(':');
          var ans = aname.substring(0, 6) === 'xmlns:' || aname === 'xmlns' ? 'http://www.w3.org/2000/xmlns/' :
            ai >= 0 ? ns[aname.substring(0, ai)] || null : null;
          el.setAttributeNS(ans, aname, attrs[a][1]);
        }
        cur().appendChild(el);
        var isVoid = lenient && VOID[tag.toLowerCase()];
        if (!selfClose && !isVoid) {
          stack.push(el);
          nsStack.push(ns);
          var lt2 = tag.toLowerCase();
          if (lenient && (lt2 === 'script' || lt2 === 'style')) {
            var endIdx = src.toLowerCase().indexOf('</' + lt2, e + 1);
            if (endIdx < 0) endIdx = n;
            if (endIdx > e + 1) el.appendChild(doc.createTextNode(src.substring(e + 1, endIdx)));
            i = endIdx;
            continue;
          }
        }
        i = e + 1;
      } else {
        text('<');
        i = lt + 1;
      }
    }
    return root;
  }
  g.__parseMarkup = parseMarkup;

  function escText(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/\n/g, '&#xa;').replace(/\r/g, '&#xd;').replace(/\t/g, '&#x9;');
  }
  function serialize(node, html) {
    switch (node.nodeType) {
      case 3: return escText(node.nodeValue);
      case 4: return '<![CDATA[' + node.nodeValue + ']]>';
      case 8: return '<!--' + node.nodeValue + '-->';
      case 7: return '<?' + node.nodeName + ' ' + node.nodeValue + '?>';
      case 9: case 11: return node.childNodes.map(function (c) { return serialize(c, html); }).join('');
    }
    var isHtml = html && node.namespaceURI === HTML_NS;
    var name = isHtml ? node.nodeName.toLowerCase() : node.nodeName;
    var out = '<' + name;
    for (var i = 0; i < node.attributes.length; i++) {
      var a = node.attributes[i];
      var v = a.name === 'style' && isHtml ? node.style.cssText : a.value;
      out += ' ' + a.name + '="' + escAttr(v) + '"';
    }
    if (isHtml && node._attr('style') < 0 && node.style.cssText !== '') out += ' style="' + escAttr(node.style.cssText) + '"';
    if (node.childNodes.length === 0) {
      if (isHtml) return out + (VOID[name] ? '>' : '></' + name + '>');
      return out + '/>';
    }
    out += '>';
    for (var j = 0; j < node.childNodes.length; j++) out += serialize(node.childNodes[j], html);
    return out + '</' + name + '>';
  }
  g.__serialize = serialize;

  g.DOMParser = function () {};
  g.DOMParser.prototype.parseFromString = function (str, type) {
    var isHtml = type === 'text/html';
    var doc = isHtml ? document.implementation.createHTMLDocument('') : new Document(true);
    doc.implementation = document.implementation;
    if (isHtml) {
      var frag = parseMarkup(String(str), doc, true);
      // Put parsed content into <body> unless it already provides <html>
      var hasHtml = frag.childNodes.some(function (c) { return c.nodeType === 1 && c.nodeName === 'HTML'; });
      if (hasHtml) { doc._clear(); doc.appendChild(frag); }
      else doc.body.appendChild(frag);
    } else {
      doc.appendChild(parseMarkup(String(str), doc, false));
    }
    return doc;
  };
  g.XMLSerializer = function () {};
  g.XMLSerializer.prototype.serializeToString = function (node) { return serialize(node, false); };

  // ───────────── networking stubs ─────────────
  function XMLHttpRequest() { this.readyState = 0; this.status = 0; this.responseText = ''; this.response = null; }
  XMLHttpRequest.prototype.open = function (method, url) { this.url = url; this.readyState = 1; };
  XMLHttpRequest.prototype.setRequestHeader = function () {};
  XMLHttpRequest.prototype.overrideMimeType = function () {};
  XMLHttpRequest.prototype.getResponseHeader = function () { return null; };
  XMLHttpRequest.prototype.getAllResponseHeaders = function () { return ''; };
  XMLHttpRequest.prototype.abort = function () {};
  XMLHttpRequest.prototype.addEventListener = function () {};
  XMLHttpRequest.prototype.send = function () {
    this.readyState = 4;
    this.status = 404;
    this.responseXML = null;
    if (typeof this.onreadystatechange === 'function') {
      var self = this;
      g.setTimeout(function () { self.onreadystatechange(); }, 0);
    }
  };
  g.XMLHttpRequest = XMLHttpRequest;

  function Image() { Element.call(this, document, HTML_NS, 'img'); this.width = 0; this.height = 0; this.complete = false; }
  Image.prototype = Object.create(Element.prototype);
  Object.defineProperty(Image.prototype, 'src', {
    get: function () { return this.getAttribute('src') || ''; },
    set: function (v) { this.setAttribute('src', v); }
  });
  g.Image = Image;
  g.Blob = function (parts, opts) { this.parts = parts || []; this.type = (opts && opts.type) || ''; };
  g.URL = function (u) { this.href = String(u); };
  g.URL.createObjectURL = function () { return 'blob:none'; };
  g.URL.revokeObjectURL = function () {};
  g.FileReader = function () {};
  g.FileReader.prototype.readAsDataURL = function () {};
  g.FileReader.prototype.readAsText = function () {};
  g.FontFace = function () { this.load = function () { return Promise.resolve(this); }; };
})(globalThis);
