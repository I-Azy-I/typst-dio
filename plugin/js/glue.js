// Renders a draw.io page with draw.io's own code onto a recording canvas and
// returns the drawing commands (CBOR) for lib.typ to replay.
(function (g) {
  'use strict';

  var R = function (v) { return Math.round(v * 100) / 100; };

  // ───────────── colours ─────────────
  var NAMED = __cssNamedColors;  // from shim.js
  function hex2(n) { n = Math.max(0, Math.min(255, Math.round(n))); return (n < 16 ? '0' : '') + n.toString(16); }

  // Normalises a CSS colour to '#rrggbbaa' (alpha multiplied by `alpha`), or
  // null for none/transparent/unknown.
  // draw.io colours may be light-dark(light, dark) pairs; `dark` picks the
  // second (render option theme: "dark"). CSS var() resolves to its fallback.
  var dark = false;
  var outline = false;  // render option text = outline
  function color(c, alpha) {
    if (c == null) return null;
    c = String(c).trim();
    if (c === '' || c === 'none' || c === 'transparent') return null;
    if (c.indexOf('light-dark(') === 0) {
      try { var ld = mxUtils.getLightDarkColor(c); c = dark ? ld.dark : ld.light; } catch (e) { return null; }
      if (c == null) return null;
      c = String(c).trim();
    }
    var v;
    while ((v = /^var\(\s*--[\w-]+\s*,\s*(.*)\)$/.exec(c)) != null) c = v[1].trim();
    if (c === '' || c === 'none' || c === 'transparent' || c.indexOf('var(') === 0) return null;
    var rgb = null, a = 1, m;
    var lc = c.toLowerCase();
    if (lc.charAt(0) === '#') {
      var h = lc.substring(1);
      if (h.length === 3 || h.length === 4) h = h.split('').map(function (x) { return x + x; }).join('');
      if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(h)) return null;
      rgb = h.substring(0, 6);
      if (h.length === 8) a = parseInt(h.substring(6), 16) / 255;
    } else if ((m = /^hsla?\(([^)]*)\)$/.exec(lc)) != null) {
      var q = m[1].split(/[\s,\/]+/).filter(Boolean);
      var hh = ((parseFloat(q[0]) % 360) + 360) % 360 / 360, ss = parseFloat(q[1]) / 100, ll = parseFloat(q[2]) / 100;
      var t2 = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss, t1 = 2 * ll - t2;
      var hue = function (t) {
        t = (t + 1) % 1;
        return 255 * (t < 1 / 6 ? t1 + (t2 - t1) * 6 * t : t < 1 / 2 ? t2 : t < 2 / 3 ? t1 + (t2 - t1) * (2 / 3 - t) * 6 : t1);
      };
      rgb = hex2(hue(hh + 1 / 3)) + hex2(hue(hh)) + hex2(hue(hh - 1 / 3));
      if (q.length > 3) a = q[3].indexOf('%') > 0 ? parseFloat(q[3]) / 100 : parseFloat(q[3]);
    } else if ((m = /^rgba?\(([^)]*)\)$/.exec(lc)) != null) {
      var p = m[1].split(/[\s,\/]+/).filter(Boolean);
      var ch = function (v) { return v.indexOf('%') > 0 ? parseFloat(v) * 2.55 : parseFloat(v); };
      rgb = hex2(ch(p[0])) + hex2(ch(p[1])) + hex2(ch(p[2]));
      if (p.length > 3) a = p[3].indexOf('%') > 0 ? parseFloat(p[3]) / 100 : parseFloat(p[3]);
    } else if (NAMED[lc]) {
      rgb = NAMED[lc];
    } else return null;
    a *= (alpha == null ? 1 : alpha);
    if (!(a > 0)) return null;
    return '#' + rgb + (a < 1 ? hex2(a * 255) : '');
  }

  // ───────────── recording canvas ─────────────
  // Mirrors mxSvgCanvas2D: model coordinates are mapped through
  // (v + dx) * scale (mxAbstractCanvas2D.addOp), then through the affine
  // transform that rotate() builds, like the SVG `transform` attribute.
  function mul(m, n) {
    return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
      m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  }
  function apply(m, x, y) {
    return m == null ? [x, y] : [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  }

  function RecCanvas(root) {
    mxAbstractCanvas2D.call(this);
    this.root = root;
    this.defs = root.ownerDocument.createElementNS(mxConstants.NS_SVG, 'defs');
    this.cmds = [];
    this.textEnabled = true;
    this.foEnabled = true;
    this.minStrokeWidth = 0;
  }
  mxUtils.extend(RecCanvas, mxAbstractCanvas2D);
  RecCanvas.prototype.format = function (v) { return parseFloat(v); };
  RecCanvas.prototype.createState = function () {
    var s = mxAbstractCanvas2D.prototype.createState.apply(this, arguments);
    s.matrix = null;
    return s;
  };
  RecCanvas.prototype.rotate = function (theta, flipH, flipV, cx, cy) {
    if (theta == 0 && !flipH && !flipV) return;
    var s = this.state;
    cx = (cx + s.dx) * s.scale;
    cy = (cy + s.dy) * s.scale;
    var m = s.matrix || [1, 0, 0, 1, 0, 0];
    if (flipH && flipV) theta += 180;
    else if (flipH != flipV) {
      var tx = flipH ? cx : 0, ty = flipV ? cy : 0;
      m = mul(m, [flipH ? -1 : 1, 0, 0, flipV ? -1 : 1, tx - (flipH ? -tx : tx), ty - (flipV ? -ty : ty)]);
    }
    if (flipH ? !flipV : flipV) theta *= -1;
    if (theta != 0) {
      var r = theta * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
      m = mul(m, [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy]);
    }
    s.matrix = m;
    s.rotation += theta;
    s.rotationCx = cx;
    s.rotationCy = cy;
  };

  // Shapes are recorded as paths in canvas units (before the matrix).
  RecCanvas.prototype.rect = function (x, y, w, h) {
    this.begin();
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.close();
  };
  RecCanvas.prototype.roundrect = function (x, y, w, h, dx, dy) {
    dx = Math.min(dx, w / 2);
    dy = Math.min(dy, h / 2);
    if (!(dx > 0) || !(dy > 0)) return this.rect(x, y, w, h);
    var k = 0.5522847498;
    this.begin();
    this.moveTo(x + dx, y);
    this.lineTo(x + w - dx, y);
    this.curveTo(x + w - dx + dx * k, y, x + w, y + dy - dy * k, x + w, y + dy);
    this.lineTo(x + w, y + h - dy);
    this.curveTo(x + w, y + h - dy + dy * k, x + w - dx + dx * k, y + h, x + w - dx, y + h);
    this.lineTo(x + dx, y + h);
    this.curveTo(x + dx - dx * k, y + h, x, y + h - dy + dy * k, x, y + h - dy);
    this.lineTo(x, y + dy);
    this.curveTo(x, y + dy - dy * k, x + dx - dx * k, y, x + dx, y);
    this.close();
  };
  RecCanvas.prototype.ellipse = function (x, y, w, h) {
    var k = 0.5522847498, rx = w / 2, ry = h / 2, cx = x + rx, cy = y + ry;
    this.begin();
    this.moveTo(cx + rx, cy);
    this.curveTo(cx + rx, cy + ry * k, cx + rx * k, cy + ry, cx, cy + ry);
    this.curveTo(cx - rx * k, cy + ry, cx - rx, cy + ry * k, cx - rx, cy);
    this.curveTo(cx - rx, cy - ry * k, cx - rx * k, cy - ry, cx, cy - ry);
    this.curveTo(cx + rx * k, cy - ry, cx + rx, cy - ry * k, cx + rx, cy);
    this.close();
  };

  // Converts the flat path (op, x, y, ...) into transformed segments.
  RecCanvas.prototype.segments = function () {
    var p = this.path, m = this.state.matrix, out = [], i = 0;
    var n = { M: 2, L: 2, Q: 4, C: 6, Z: 0 };
    while (i < p.length) {
      var op = p[i++];
      var cnt = n[op];
      if (cnt == null) continue;
      var seg = [op.toLowerCase()];
      for (var j = 0; j < cnt; j += 2) {
        var q = apply(m, p[i + j], p[i + j + 1]);
        seg.push(R(q[0]), R(q[1]));
      }
      i += cnt;
      out.push(seg);
    }
    return out;
  };

  RecCanvas.prototype.paint = function (filled, stroked) {
    var s = this.state;
    if (this.path == null || this.path.length === 0) return;
    var segs = this.segments();
    var cmd = { k: 'p', d: segs };
    var fill = null;
    if (filled && s.fillColor != null) {
      if (s.gradientColor != null && s.gradientColor != mxConstants.NONE) {
        var c1 = color(s.fillColor, s.alpha * s.gradientFillAlpha);
        var c2 = color(s.gradientColor, s.alpha * s.gradientAlpha);
        var dir = s.gradientDirection || 'south';
        var ang = { south: 90, north: 270, east: 0, west: 180, radial: 0 }[dir];
        if (ang == null) ang = 90;
        cmd.grad = { a: c1 || '#ffffff00', b: c2 || '#ffffff00', ang: R(ang + s.rotation), radial: dir === 'radial' };
        fill = true;
      } else {
        fill = color(s.fillColor, s.alpha * s.fillAlpha);
        if (fill) cmd.fill = fill;
      }
    }
    if (stroked && s.strokeColor != null) {
      var sc = color(s.strokeColor, s.alpha * s.strokeAlpha);
      if (sc) {
        cmd.stroke = sc;
        cmd.sw = R(Math.max(this.minStrokeWidth, s.strokeWidth * s.scale));
        if (s.dashed) {
          var scale = (s.fixDash ? 1 : s.strokeWidth) * s.scale;
          var pat = String(s.dashPattern || '3 3').split(' ').map(Number)
            .filter(function (v) { return isFinite(v); }).map(function (v) { return R(v * scale); });
          if (pat.length > 0 && pat.some(function (v) { return v > 0; })) {
            if (pat.length % 2 === 1) pat = pat.concat(pat);
            cmd.dash = pat;
          }
        }
        if (s.lineCap && s.lineCap !== 'flat') cmd.cap = s.lineCap === 'square' ? 'square' : 'round';
        if (s.lineJoin && s.lineJoin !== 'miter') cmd.join = s.lineJoin === 'bevel' ? 'bevel' : 'round';
        if (s.miterLimit != null && s.miterLimit != 4) cmd.miter = Number(s.miterLimit);
      }
    }
    if (cmd.fill == null && cmd.grad == null && cmd.stroke == null) return;
    if (s.shadow) {
      var shc = color(s.shadowColor, s.shadowAlpha * s.alpha);
      if (shc) cmd.shadow = { c: shc, dx: R(s.shadowDx * s.scale), dy: R(s.shadowDy * s.scale) };
    }
    this.cmds.push(cmd);
  };
  RecCanvas.prototype.fill = function () { this.paint(true, false); };
  RecCanvas.prototype.stroke = function () { this.paint(false, true); };
  RecCanvas.prototype.fillAndStroke = function () { this.paint(true, true); };

  // ───────────── images ─────────────
  function dataUriBytes(src) {
    var m = /^data:([^,;]*)((?:;[^,;]*)*?)(;base64)?,(.*)$/s.exec(src);
    if (m == null) return null;
    var mime = m[1].toLowerCase();
    var fmt = mime.indexOf('svg') >= 0 ? 'svg' : mime.indexOf('png') >= 0 ? 'png' :
      mime.indexOf('jpeg') >= 0 || mime.indexOf('jpg') >= 0 ? 'jpg' : mime.indexOf('gif') >= 0 ? 'gif' :
      mime.indexOf('webp') >= 0 ? 'webp' : null;
    if (fmt == null) return null;
    // Non-base64 data is percent-encoded text (usually SVG)
    var out = m[3] ? base64Bytes(m[4]) : utf8(decodeURIComponentSafe(m[4]));
    return { fmt: fmt, data: out };
  }
  function base64Bytes(s) {
    if (typeof __b64 === 'function') return __b64(s);
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 255;
    return out;
  }
  function decodeURIComponentSafe(s) { try { return decodeURIComponent(s); } catch (e) { return unescape(s); } }

  // draw.io's own images (img/lib/..., possibly as an absolute URL to a
  // draw.io host) are bundled in the plugin (__image).
  function builtinImage(src) {
    var m = /(?:^|\/)(img\/lib\/[^?#]+)/.exec(src);
    if (m == null || typeof __image !== 'function') return null;
    var key = decodeURIComponentSafe(m[1]);
    var data = __image(key);
    if (data == null) return null;
    var ext = key.substring(key.lastIndexOf('.') + 1).toLowerCase();
    return { fmt: ext === 'jpeg' ? 'jpg' : ext, data: data };
  }

  RecCanvas.prototype.image = function (x, y, w, h, src, aspect, flipH, flipV) {
    if (src == null) return;
    src = String(src);
    var s = this.state;
    var img = /^data:/.test(src) ? dataUriBytes(src) : builtinImage(src);
    var x0 = (x + s.dx) * s.scale, y0 = (y + s.dy) * s.scale;
    var cw = w * s.scale, chh = h * s.scale;
    var c = apply(s.matrix, x0 + cw / 2, y0 + chh / 2);
    var m = s.matrix || [1, 0, 0, 1, 0, 0];
    var det = m[0] * m[3] - m[1] * m[2];
    var cmd = { k: 'i', cx: R(c[0]), cy: R(c[1]), w: R(cw), h: R(chh),
      rot: R(Math.atan2(m[1], m[0]) * 180 / Math.PI), fit: aspect ? 'contain' : 'stretch' };
    var fh = !!flipH != (det < 0), fv = !!flipV;
    if (fh) cmd.fh = true;
    if (fv) cmd.fv = true;
    if (s.alpha < 1) cmd.alpha = R(s.alpha);
    if (img != null) { cmd.fmt = img.fmt; cmd.data = img.data; }
    else cmd.src = src;
    this.cmds.push(cmd);
  };

  // ───────────── text ─────────────
  var BLOCK = { div: 1, p: 1, li: 1, ul: 1, ol: 1, h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1, blockquote: 1,
    pre: 1, table: 1, tr: 1, section: 1, article: 1, header: 1, footer: 1, center: 1, hr: 1, dl: 1, dt: 1, dd: 1 };
  var HSIZE = { h1: 2, h2: 1.5, h3: 1.17, h4: 1, h5: 0.83, h6: 0.67 };
  // Browser default vertical margins (em of the element's font size)
  var MARGIN = { h1: 0.67, h2: 0.83, h3: 1, h4: 1.33, h5: 1.67, h6: 2.33, p: 1, ul: 1, ol: 1, blockquote: 1, pre: 1, dl: 1 };
  var FONT_SIZES = [0, 10, 13, 16, 18, 24, 32, 48];

  function cssSize(v, base) {
    var m = /^([\d.]+)(px|pt|em|rem|%)?$/.exec(String(v).trim());
    if (!m) return base;
    var n = parseFloat(m[1]);
    switch (m[2]) {
      case 'pt': return n * 4 / 3;
      case 'em': case 'rem': return n * base;
      case '%': return n * base / 100;
      default: return n;
    }
  }

  // Converts an HTML label into lines of styled runs. Lines can carry `align`,
  // `mt`/`mb` (block margins in px, collapsed like CSS) and `ind` (list indent).
  function htmlToLines(str, base, nowrap) {
    var frag = __parseMarkup(String(str), document, true);
    var lines = [{ runs: [] }];
    var pending = 0;  // vertical margin waiting for the next line
    function startLine(st) {
      var l = line();
      if (pending > 0) { l.mt = R(pending); pending = 0; }
      if (st && st.ind) l.ind = st.ind;
      if (st && st.indr) l.indr = st.indr;
      if (st && st.lbg) l.bg = st.lbg;
      if (st && st.lpad) l.pad = R(st.lpad);
    }
    function line() { return lines[lines.length - 1]; }
    function newline(align) {
      lines.push({ runs: [] });
      if (align) line().align = align;
    }
    function blockBreak(align) {
      var l = line();
      if (l.runs.length > 0 || l.forced) newline(align);
      else if (align) l.align = align;
    }
    function push(t, st) {
      if (t === '') return;
      if (line().runs.length === 0) startLine(st);
      var r = { t: t };
      if (st.b) r.b = 1;
      if (st.i) r.i = 1;
      if (st.u) r.u = 1;
      if (st.s) r.s = 1;
      if (st.sup) r.sup = 1;
      if (st.sub) r.sub = 1;
      if (st.c) r.c = st.c;
      if (st.bg) r.bg = st.bg;
      if (st.sz !== base.sz) r.sz = R(st.sz);
      if (st.f && st.f !== base.f) r.f = st.f;
      if (st.href) r.href = st.href;
      line().runs.push(r);
    }
    function styled(el, st) {
      var n = {};
      for (var k in st) n[k] = st[k];
      var tag = el.nodeName.toLowerCase();
      if (tag === 'b' || tag === 'strong') n.b = true;
      if (tag === 'i' || tag === 'em' || tag === 'cite' || tag === 'var') n.i = true;
      if (tag === 'u' || tag === 'ins') n.u = true;
      if (tag === 's' || tag === 'strike' || tag === 'del') n.s = true;
      if (tag === 'sup') n.sup = true;
      if (tag === 'sub') n.sub = true;
      // links: the browser's default style (blue, underlined) unless styled
      if (tag === 'a') { n.href = el.getAttribute('href') || null; n.c = '#0000ee'; n.u = true; }
      if (tag === 'code' || tag === 'pre' || tag === 'tt' || tag === 'kbd') n.f = 'monospace';
      if (HSIZE[tag]) { n.b = true; n.sz = st.sz * HSIZE[tag]; }
      if (tag === 'ul' || tag === 'ol') { n.ind = (st.ind || 0) + 40; n.list = { ol: tag === 'ol', n: 0 }; }
      if (tag === 'blockquote') { n.ind = (st.ind || 0) + 40; n.indr = (st.indr || 0) + 40; }
      n.al = alignOf(el) || st.al;
      if (tag === 'font') {
        if (el.getAttribute('color')) n.c = color(el.getAttribute('color')) || n.c;
        if (el.getAttribute('face')) n.f = el.getAttribute('face');
        var fs = parseInt(el.getAttribute('size'), 10);
        if (fs >= 1 && fs <= 7) n.sz = FONT_SIZES[fs];
      }
      var css = el.style || {};
      if (css.color) n.c = color(css.color) || n.c;
      var bgv = css.backgroundColor || (css.background && String(css.background).split(/\s+/).map(function (v) { return color(v); })
        .filter(Boolean)[0]);
      // a block element's background fills the whole block line (lbg),
      // an inline one only highlights its text (bg)
      var blockEl = BLOCK[tag] || css.display === 'block';
      if (bgv) { if (blockEl) n.lbg = color(bgv) || n.lbg; else n.bg = color(bgv) || n.bg; }
      if (blockEl && css.padding) n.lpad = cssSize(String(css.padding).trim().split(/\s+/)[0], n.sz || st.sz);
      if (css.fontWeight) n.b = css.fontWeight === 'bold' || css.fontWeight === 'bolder' || parseInt(css.fontWeight, 10) >= 600;
      if (css.fontStyle) n.i = css.fontStyle === 'italic' || css.fontStyle === 'oblique';
      var td = css.textDecoration || css.textDecorationLine;
      if (td) { if (td.indexOf('underline') >= 0) n.u = true; if (td.indexOf('line-through') >= 0) n.s = true; if (td === 'none') { n.u = false; n.s = false; } }
      if (css.fontSize) n.sz = cssSize(css.fontSize, st.sz);
      if (css.fontFamily) n.f = css.fontFamily.split(',')[0].replace(/["']/g, '').trim();
      if (css.verticalAlign === 'super') n.sup = true;
      if (css.verticalAlign === 'sub') n.sub = true;
      return n;
    }
    function alignOf(el) {
      var a = (el.style && el.style.textAlign) || el.getAttribute('align');
      return a === 'left' || a === 'right' || a === 'center' || a === 'justify' ? a : null;
    }
    function walkNodes(node, st) {
      for (var i = 0; i < node.childNodes.length; i++) {
        var c = node.childNodes[i];
        if (c.nodeType === 3) {
          var t = c.nodeValue.replace(/[ \t\r\n\f]+/g, ' ');
          var l = line();
          // collapse whitespace across runs and at line starts
          var prev = l.runs.length > 0 ? l.runs[l.runs.length - 1].t : '';
          if (t.charAt(0) === ' ' && (l.runs.length === 0 || / $/.test(prev))) t = t.substring(1);
          push(t, st);
        } else if (c.nodeType === 1) {
          var tag = c.nodeName.toLowerCase();
          if (tag === 'br') {
            if (line().runs.length === 0) startLine(st);
            line().forced = true;
            newline(st.al);
            continue;
          }
          if (tag === 'script' || tag === 'style' || tag === 'head' || tag === 'title') continue;
          if (tag === 'img') continue;
          if (tag === 'hr') {
            // a rule line with half an em of margin above and below
            blockBreak(st.al);
            pending = Math.max(pending, st.sz / 2);
            startLine(st);
            line().hr = 1;
            newline(st.al);
            pending = st.sz / 2;
            continue;
          }
          var isBlock = BLOCK[tag] || (c.style && c.style.display === 'block');
          var cs = styled(c, st);
          if (tag === 'table') {
            blockBreak(st.al);
            startLine(st);
            line().tbl = table(c, cs);
            newline(st.al);
            continue;
          }
          // vertical margins: browser defaults (nested lists have none), unless
          // set inline, e.g. <h1 style="margin-top: 0px">
          var m = MARGIN[tag] && !((tag === 'ul' || tag === 'ol') && st.ind) ? MARGIN[tag] * cs.sz : 0;
          var mtop = m, mbot = m, css = c.style || {};
          if (css.margin) {
            var mp = String(css.margin).trim().split(/\s+/);
            mtop = cssSize(mp[0], cs.sz);
            mbot = cssSize(mp.length > 2 ? mp[2] : mp[0], cs.sz);
          }
          if (css.marginTop) mtop = cssSize(css.marginTop, cs.sz);
          if (css.marginBottom) mbot = cssSize(css.marginBottom, cs.sz);
          if (isBlock) { pending = Math.max(pending, mtop); blockBreak(cs.al); }
          if (tag === 'li') push(st.list && st.list.ol ? (++st.list.n) + '. ' : '\u2022 ', cs);
          if (tag === 'td' || tag === 'th') { if (line().runs.length > 0) push(' ', st); }
          walkNodes(c, cs);
          if (isBlock) { blockBreak(st.al); pending = Math.max(pending, mbot); }
        }
      }
    }
    // Trims whitespace at line ends and drops the empty trailing line left by
    // a block end; returns the finished lines.
    function finish() {
    lines.forEach(function (l) {
      if (l.runs.length > 0) {
        var last = l.runs[l.runs.length - 1];
        last.t = last.t.replace(/ +$/, '');
        if (last.t === '') l.runs.pop();
      }
      if (nowrap) l.runs.forEach(function (r) { r.t = r.t.replace(/ /g, ' '); });
    });
    // Drop empty trailing lines, like a browser ignores a final <br> or block
    // end; a line holding only a <br> (e.g. <div><br></div>) stays visible.
    var last;
    while (lines.length > 1 && (last = lines[lines.length - 1]).runs.length === 0 && !last.forced &&
      !last.mt && !last.hr && !last.tbl) lines.pop();
    lines.forEach(function (l) { delete l.forced; });
    if (pending > 0) lines[lines.length - 1].mb = R(pending);
    return lines;
    }

    // Converts the children of `node` into lines of their own (table cells).
    function convert(node, st) {
      var saved = [lines, pending];
      lines = [{ runs: [] }];
      pending = 0;
      walkNodes(node, st);
      var out = finish();
      lines = saved[0];
      pending = saved[1];
      return out;
    }

    // A length attribute/style: px number, a 'N%' string, or null
    function len(v, size) {
      if (v == null || String(v).trim() === '') return null;
      v = String(v).trim();
      if (/%$/.test(v)) return v;
      var n = cssSize(v, size);
      return isFinite(n) ? R(n) : null;
    }
    // CSS border shorthand ('1px solid #000') -> {w, c}
    function borderOf(css) {
      var b = css.border;
      if (!b) return null;
      if (/none|hidden/.test(b)) return { w: 0 };
      var w = /([\d.]+)px/.exec(b);
      var c = b.replace(/[\d.]+px|\b(solid|dashed|dotted|double|inset|outset|groove|ridge|thin|medium|thick)\b/g, '').trim();
      return { w: w ? parseFloat(w[1]) : 1, c: color(c) || '#000000' };
    }
    // <table> -> {rows: [{cells: [{lines, cs, rs, al, va, bg, bd, w, pad}], bg, bd}],
    // border, collapse, pad, spacing, w, h, bg, bd} (rendered by lib.typ)
    function table(el, st) {
      var css = el.style || {};
      var battr = el.getAttribute('border');
      var t = {
        border: battr == null ? 0 : battr === '' ? 1 : (parseFloat(battr) || 0),
        collapse: /collapse/.test(css.borderCollapse || ''),
        pad: el.getAttribute('cellpadding') != null ? (parseFloat(el.getAttribute('cellpadding')) || 0) : 1,
        spacing: el.getAttribute('cellspacing') != null ? (parseFloat(el.getAttribute('cellspacing')) || 0) : 2,
        rows: []
      };
      var tw = len(css.width || el.getAttribute('width'), st.sz);
      var th = len(css.height || el.getAttribute('height'), st.sz);
      if (tw != null) t.w = tw;
      if (th != null) t.h = th;
      var tbg = color(css.backgroundColor || el.getAttribute('bgcolor'));
      if (tbg) t.bg = tbg;
      var tbd = borderOf(css);
      if (tbd) t.bd = tbd;
      var tst = styled(el, st);
      tst.bg = null;
      tst.lbg = null;
      tst.lpad = 0;
      // cells inherit the label's alignment unless the table's HTML sets one;
      // <th> doesn't force centring, as the label sets text-align explicitly
      (function rows(node, rst) {
        node.childNodes.forEach(function (tr) {
          if (tr.nodeType !== 1) return;
          var tag = tr.nodeName.toLowerCase();
          if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') { rows(tr, styled(tr, rst)); return; }
          if (tag !== 'tr') return;
          var trs = styled(tr, rst);
          trs.bg = null;
          trs.lbg = null;
          var row = { cells: [] };
          var rbg = color((tr.style || {}).backgroundColor || tr.getAttribute('bgcolor'));
          if (rbg) row.bg = rbg;
          var rbd = borderOf(tr.style || {});
          if (rbd) row.bd = rbd;
          tr.childNodes.forEach(function (td) {
            if (td.nodeType !== 1) return;
            var dt = td.nodeName.toLowerCase();
            if (dt !== 'td' && dt !== 'th') return;
            var cs = styled(td, trs), dcss = td.style || {};
            if (dt === 'th') cs.b = true;
            var cell = {};
            var cbg = color(dcss.backgroundColor || td.getAttribute('bgcolor'));
            if (cbg) cell.bg = cbg;
            cs.bg = null;
            cs.lbg = null;
            var span = parseInt(td.getAttribute('colspan'), 10);
            if (span > 1) cell.cs = span;
            var rspan = parseInt(td.getAttribute('rowspan'), 10);
            if (rspan > 1) cell.rs = rspan;
            var va = td.getAttribute('valign') || dcss.verticalAlign || tr.getAttribute('valign');
            if (va && va !== 'middle') cell.va = va;
            if (cs.al) cell.al = cs.al;
            var cbd = borderOf(dcss);
            if (cbd) cell.bd = cbd;
            var cw = len(dcss.width || td.getAttribute('width'), cs.sz);
            if (cw != null) cell.w = cw;
            if (dcss.padding) cell.pad = R(cssSize(String(dcss.padding).trim().split(/\s+/)[0], cs.sz));
            cs.ind = 0;
            cs.indr = 0;
            cell.lines = convert(td, cs);
            row.cells.push(cell);
          });
          t.rows.push(row);
        });
      })(el, tst);
      return t;
    }

    walkNodes(frag, base);
    return finish();
  }

  function plainToLines(str, nowrap) {
    return String(str).split('\n').map(function (t) {
      if (nowrap) t = t.replace(/ /g, ' ');
      return { runs: t === '' ? [] : [{ t: t }] };
    });
  }

  RecCanvas.prototype.text = function (x, y, w, h, str, align, valign, wrap, format, overflow, clip, rotation, dir) {
    if (!this.textEnabled || str == null) return;
    var s = this.state;
    if (!(s.fontSize > 0)) return;
    if (mxUtils.isNode(str)) str = str.outerHTML;
    str = String(str);
    if (str === '') return;
    // draw.io's text CSS only knows left/right, anything else (e.g. the label
    // style align=justify) renders centred; justify inside the HTML still works
    align = align === 'left' || align === 'right' ? align : 'center';
    valign = valign || 'middle';
    var vertical = dir != null && String(dir).substring(0, 9) === 'vertical-';

    // Box placement from mxSvgCanvas2D.createCss (w includes foreignObjectPadding)
    var fw0 = w + 2;
    var pt = mxUtils.getAlignmentAsPoint(align, valign);
    var dx = pt.x * fw0, dy = pt.y * h;
    var fw = 1, fh = 1, ofl = true, clipH = null;
    if (clip) { fw = fw0; clipH = h; dy = 0; }
    else if (overflow == 'fill') { fw = fw0; fh = h; }
    else if (overflow == 'width') { fw = fw0 - 2; dy = 0; if (h > 0) clipH = h; }
    else if (overflow == 'block') { fw = fw0 - 2; ofl = false; dy = 0; }
    else { ofl = false; if (vertical) dx = 0; else dy = 0; }
    var doWrap = !!(wrap && ((vertical && h > 0) || (!vertical && w > 0)));
    if (doWrap) {
      if (vertical) fh = h; else fw = fw0;
    } else if (!ofl && overflow != 'block') dx = 0;

    var sc = s.scale;
    var ax = (x + s.dx) * sc, ay = (y + s.dy) * sc;
    var fs = s.fontStyle || 0;
    var base = {
      sz: s.fontSize, f: s.fontFamily, b: (fs & 1) === 1, i: (fs & 2) === 2, u: (fs & 4) === 4, s: (fs & 8) === 8
    };
    var lines = format === 'html' ? htmlToLines(str, base, !doWrap) : plainToLines(str, !doWrap);
    if (lines.every(function (l) { return l.runs.length === 0 && !l.hr && !l.tbl; })) return;

    var cmd = {
      k: 't', x: R(ax + dx * sc), y: R(ay + dy * sc), w: R(fw * sc), h: R(fh * sc),
      ax: R(ax), ay: R(ay), al: align, va: valign, wrap: doWrap, sc: R(sc),
      sz: R(s.fontSize), f: s.fontFamily, c: color(s.fontColor, s.alpha) || '#000000',
      lines: lines
    };
    // wrapping width: the box width, or its height for vertical text
    if (doWrap) cmd.ww = R((vertical ? h : fw) * sc);
    if (dir === 'rtl') cmd.dir = 'rtl';
    // text shadow (textShadow=1): draw.io applies the shape's shadow style as a
    // CSS drop-shadow on the label; recorded by the mxText.paint hook below
    var ts = this.textShadow;
    if (ts) {
      var shc = color(ts.color, (ts.opacity != null ? ts.opacity / 100 : 1) * s.alpha);
      if (shc) cmd.shadow = { c: shc, dx: R(ts.dx * sc), dy: R(ts.dy * sc), blur: R((ts.blur || 0) * sc) };
    }
    if (base.b) cmd.b = 1;
    if (base.i) cmd.i = 1;
    if (base.u) cmd.u = 1;
    if (base.s) cmd.s = 1;
    if (clipH != null) cmd.clip = R(clipH * sc);
    var rot = s.rotation + (rotation || 0);
    if (vertical) rot += String(dir).substring(String(dir).length - 3) === '-rl' ? 90 : -90;
    if (rot % 360 != 0) cmd.rot = R(rot);
    var bg = color(s.fontBackgroundColor, s.alpha);
    var bd = color(s.fontBorderColor, s.alpha);
    if (bg) cmd.bg = bg;
    if (bd) { cmd.bd = bd; cmd.bw = R((s.fontBorderWidth != null ? s.fontBorderWidth : 1) * sc); }
    if (s.labelPadding != null) {
      var p = s.labelPadding;
      cmd.pad = [R(p.top * sc), R(p.right * sc), R(p.bottom * sc), R(p.left * sc)];
    }
    // outline text: lay the label out with the bundled fonts (js/outline.js);
    // labels the fonts can't draw (other scripts, right-to-left) stay native
    if (outline && cmd.dir !== 'rtl') {
      try {
        cmd.ol = __outlineLayout(cmd);
        delete cmd.lines;
      } catch (e) {
        if (!(e instanceof OutlineFallback)) throw e;
      }
    }
    this.cmds.push(cmd);
  };
  RecCanvas.prototype.updateText = function () {};
  RecCanvas.prototype.getSvgGradient = function () { return 'none'; };
  RecCanvas.prototype.createImageSymbol = function () { return null; };
  RecCanvas.prototype.setLink = function () {};
  RecCanvas.prototype.setTitle = function () {};
  RecCanvas.prototype.getAlternateText = function () { return null; };
  RecCanvas.prototype.createElement = function (tag) { return this.root.ownerDocument.createElementNS(mxConstants.NS_SVG, tag); };
  g.RecCanvas = RecCanvas;

  var textPaint = mxText.prototype.paint;
  mxText.prototype.paint = function (c) {
    if (!(c instanceof RecCanvas)) return textPaint.apply(this, arguments);
    c.textShadow = this.isShadowEnabled() ? this.getShadowStyle() : null;
    try { return textPaint.apply(this, arguments); } finally { c.textShadow = null; }
  };

  // ───────────── CBOR ─────────────
  function utf8(str) {
    var out = [], i = 0;
    for (; i < str.length; i++) {
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
  }

  function Cbor() { this.buf = new Uint8Array(1024); this.n = 0; this.dv = new DataView(this.buf.buffer); }
  Cbor.prototype.ensure = function (k) {
    if (this.n + k <= this.buf.length) return;
    var len = this.buf.length * 2;
    while (len < this.n + k) len *= 2;
    var b = new Uint8Array(len);
    b.set(this.buf.subarray(0, this.n));
    this.buf = b;
    this.dv = new DataView(b.buffer);
  };
  Cbor.prototype.head = function (major, v) {
    this.ensure(9);
    var m = major << 5;
    if (v < 24) this.buf[this.n++] = m | v;
    else if (v < 256) { this.buf[this.n++] = m | 24; this.buf[this.n++] = v; }
    else if (v < 65536) { this.buf[this.n++] = m | 25; this.dv.setUint16(this.n, v); this.n += 2; }
    else if (v < 4294967296) { this.buf[this.n++] = m | 26; this.dv.setUint32(this.n, v); this.n += 4; }
    else { this.buf[this.n++] = m | 27; this.dv.setUint32(this.n, Math.floor(v / 4294967296)); this.dv.setUint32(this.n + 4, v >>> 0); this.n += 8; }
  };
  Cbor.prototype.bytes = function (major, b) {
    this.head(major, b.length);
    this.ensure(b.length);
    this.buf.set(b, this.n);
    this.n += b.length;
  };
  Cbor.prototype.write = function (v) {
    if (v === null || v === undefined) { this.ensure(1); this.buf[this.n++] = 0xf6; }
    else if (v === true) { this.ensure(1); this.buf[this.n++] = 0xf5; }
    else if (v === false) { this.ensure(1); this.buf[this.n++] = 0xf4; }
    else if (typeof v === 'number') {
      if (Number.isInteger(v) && Math.abs(v) < 4294967296) {
        if (v >= 0) this.head(0, v); else this.head(1, -1 - v);
      } else if (!isFinite(v)) { this.ensure(1); this.buf[this.n++] = 0xf6; }
      else { this.ensure(9); this.buf[this.n++] = 0xfb; this.dv.setFloat64(this.n, v); this.n += 8; }
    } else if (typeof v === 'string') this.bytes(3, utf8(v));
    else if (v instanceof Uint8Array) this.bytes(2, v);
    else if (Array.isArray(v)) { this.head(4, v.length); for (var i = 0; i < v.length; i++) this.write(v[i]); }
    else if (typeof v === 'object') {
      var keys = Object.keys(v).filter(function (k) { return v[k] !== undefined; });
      this.head(5, keys.length);
      for (var j = 0; j < keys.length; j++) { this.write(keys[j]); this.write(v[keys[j]]); }
    } else this.write(String(v));
  };
  function cbor(v) { var c = new Cbor(); c.write(v); return c.buf.slice(0, c.n); }

  // A cell that fails to paint (usually a browser API the shim lacks) is
  // skipped and logged instead of failing the whole diagram.
  var drawCellState = mxImageExport.prototype.drawCellState;
  mxImageExport.prototype.drawCellState = function (state, canvas) {
    var depth = canvas.states ? canvas.states.length : 0;
    try {
      drawCellState.apply(this, arguments);
    } catch (e) {
      console.error('drawio: skipped cell ' + (state.cell ? state.cell.id : '?') + ': ' + (e && e.message));
      while (canvas.states && canvas.states.length > depth) canvas.restore();
    }
  };

  // Native inflate for compressed pages (pako in interpreted JS is slow)
  if (typeof __inflate === 'function' && typeof pako !== 'undefined') {
    var nativeInflate = function (raw) {
      return function (data, opts) {
        var b = data instanceof Uint8Array ? data : new Uint8Array(data);
        var out = __inflate(b, raw);
        return opts && opts.to === 'string' ? __utf8(out) : out;
      };
    };
    pako.inflateRaw = nativeInflate(true);
    pako.inflate = nativeInflate(false);
  }

  // ───────────── rendering ─────────────
  function childElements(node, name) {
    var out = [];
    for (var c = node.firstChild; c != null; c = c.nextSibling) if (c.nodeType === 1 && (name == null || c.nodeName === name)) out.push(c);
    return out;
  }

  function pages(root) {
    if (root.nodeName === 'mxfile') return childElements(root, 'diagram');
    return [root];
  }

  function modelNode(page) {
    if (page.nodeName === 'mxGraphModel') return page;

    var inner = childElements(page, 'mxGraphModel')[0];
    // Moved to a document of its own so that ids of other pages do not clash
    // in mxCodec (which indexes the whole document)
    if (inner) {
      var doc = mxUtils.createXmlDocument();
      doc.appendChild(doc.importNode(inner, true));
      return doc.documentElement;
    }
    var txt = mxUtils.trim(mxUtils.getTextContent(page));
    if (txt.length === 0) return null;
    return mxUtils.parseXml(Graph.decompress(txt)).documentElement;
  }

  // Stage timings for profiling (opts.profile): logged via console.log
  var t0 = 0;
  function mark(what) { if (t0) { var t = Date.now(); console.log('time ' + what + ' ' + (t - t0) + ' ms'); t0 = t; } }

  function render(xml, opts) {
    dark = opts.theme === 'dark';
    outline = opts.text === 'outline';
    __outlineReset();
    t0 = opts.profile ? Date.now() : 0;
    var doc = mxUtils.parseXml(xml);
    mark('parse file');
    var root = doc.documentElement;
    if (root == null) throw new Error('not a draw.io file');
    // .drawio.svg / .drawio.png exports carry the file in a content attribute
    if (root.nodeName === 'svg' && root.getAttribute('content')) {
      doc = mxUtils.parseXml(root.getAttribute('content'));
      root = doc.documentElement;
    }
    if (root.nodeName !== 'mxfile' && root.nodeName !== 'mxGraphModel') throw new Error('not a draw.io file (root element <' + root.nodeName + '>)');
    var list = pages(root);
    var names = list.map(function (p, i) { return p.getAttribute('name') || ('Page-' + (i + 1)); });
    var sel = opts.page == null ? 0 : opts.page;
    var idx = typeof sel === 'number' ? sel : names.indexOf(String(sel));
    if (idx < 0 || idx >= list.length) throw new Error('no page ' + JSON.stringify(sel) + ' (pages: ' + names.join(', ') + ')');
    if (opts.listOnly) return { pages: names };
    var node = modelNode(list[idx]);
    mark('page model');
    if (node == null) return { pages: names, page: idx, w: 0, h: 0, bg: null, items: [] };

    if (typeof __stencilReset === 'function') __stencilReset();
    var container = document.createElement('div');
    document.body.appendChild(container);
    var graph = new Graph(container);
    try {
      graph.foldingEnabled = false;
      graph.setEnabled(false);
      var gs = node.getAttribute('gridSize');
      if (gs != null) graph.gridSize = parseFloat(gs);
      var canvas = null;
      graph.createSvgCanvas = function (n) {
        canvas = new RecCanvas(n);
        canvas.minStrokeWidth = this.cellRenderer.minSvgStrokeWidth || 0;
        return canvas;
      };
      new mxCodec(node.ownerDocument).decode(node, graph.getModel());
      g.__flushTimers();
      mark('decode model');
      var bgAttr = node.getAttribute('background');
      var bg = (bgAttr != null && bgAttr !== 'none' && bgAttr !== '') ? bgAttr : null;
      // Dark appearance needs a dark page, as in draw.io (its default dark background)
      if (dark && bg == null) bg = 'light-dark(#ffffff, #121212)';
      var border = opts.border != null ? Number(opts.border) : 0;
      var svg = graph.getSvg(bg, 1, border, false, null, true, true, null, null, false);
      g.__flushTimers();
      mark('paint');
      return {
        pages: names, page: idx,
        w: R(parseFloat(svg.getAttribute('width'))), h: R(parseFloat(svg.getAttribute('height'))),
        bg: color(bg), items: canvas ? canvas.cmds : [],
        glyphs: outline ? __outlineGlyphs() : {}
      };
    } finally {
      graph.destroy();
      if (container.parentNode) container.parentNode.removeChild(container);
    }
  }

  g.__drawioRender = function (xml, optsJson) {
    return cbor(render(xml, JSON.parse(optsJson || '{}')));
  };
  g.__drawioRenderJson = function (xml, optsJson) {
    return JSON.stringify(render(xml, JSON.parse(optsJson || '{}')), function (k, v) {
      return v instanceof Uint8Array ? '<' + v.length + ' bytes>' : v;
    });
  };
  g.__drawioCbor = cbor;
})(globalThis);
