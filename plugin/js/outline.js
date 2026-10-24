// Outline text: lays out labels with the bundled fonts (subset Liberation
// fonts, see tools/build-fonts.py) and returns positioned glyphs, so that
// lib.typ can draw them as shapes, with an invisible text layer on top to keep
// the text selectable. Used with `text: "outline"`; the input is the label
// structure built by htmlToLines in glue.js, the same that lib.typ lays out
// for native text, and the layout mirrors lib.typ's (and the browser's).
//
// __outlineLayout(label) -> {w, h, items} in label px, where items are
//   {k: 'g', f: font, sz, c, x, y, g: [glyph, dx, dy, ...]}  glyphs on a baseline
//   {k: 'r', x, y, w, h, c}                                   filled rectangle
//   {k: 's', t, x, y, w, h, sz}                               invisible text line
//   {k: 'a', x, y, w, h, href}                                link area
// It throws OutlineFallback when a character is missing from the fonts (the
// label is then drawn as native text). __outlineGlyphs() returns the outlines
// of all glyphs used since __outlineReset().
(function (g) {
  'use strict';

  function OutlineFallback(why) { this.message = why; }
  g.OutlineFallback = OutlineFallback;

  var LINE_HEIGHT = 1.2;
  var R = function (v) { return Math.round(v * 100) / 100; };

  // ───────────── fonts ─────────────
  var infos = {}, used = {};
  function info(key) {
    var m = infos[key];
    if (m === undefined) {
      var a = __fontInfo(key);
      m = infos[key] = a ? { upem: a[0], asc: a[1], desc: a[2], ulPos: a[3], ulTh: a[4], stPos: a[5], stTh: a[6] } : null;
    }
    return m;
  }
  g.__outlineReset = function () { used = {}; };
  g.__outlineGlyphs = function () {
    var out = {};
    Object.keys(used).forEach(function (key) {
      var gl = {};
      Object.keys(used[key]).forEach(function (id) { gl[id] = __glyphPath(key, +id); });
      out[key] = { upem: info(key).upem, g: gl };
    });
    return out;
  };

  // draw.io font family -> bundled font: monospace and serif families map to
  // Liberation Mono/Serif, everything else to Liberation Sans (Helvetica/Arial)
  function fontKey(family, bold, italic) {
    var f = String(family || '').toLowerCase();
    var fam = /mono|courier|consol|menlo|monaco|code|terminal|typewriter/.test(f) ? 'mono' :
      /times|georgia|garamond|cambria|palatino|baskerville|didot|bookman|roman/.test(f) ||
      (/serif/.test(f) && !/sans/.test(f)) ? 'serif' : 'sans';
    return fam + (bold && italic ? '-bi' : bold ? '-b' : italic ? '-i' : '');
  }

  // ───────────── runs -> shaped segments ─────────────
  // A segment is a word or a run of spaces in one style.
  function style(r, base, sc) {
    var b = r.b != null ? r.b : base.b, i = r.i != null ? r.i : base.i;
    var sup = r.sup === 1, sub = r.sub === 1;
    var size = (r.sz != null ? r.sz : base.sz) * sc;
    var parent = size;
    if (sup || sub) size *= 0.83;
    return {
      key: fontKey(r.f || base.f, b === 1 || b === true, i === 1 || i === true),
      size: size,
      // browsers raise super by a third of the parent size, lower sub by a fifth
      shift: sup ? -parent / 3 : sub ? parent / 5 : 0,
      c: r.c || base.c,
      u: (r.u != null ? r.u : base.u) === 1, s: (r.s != null ? r.s : base.s) === 1,
      bg: r.bg || null, href: r.href || null
    };
  }
  function shape(text, st) {
    var m = info(st.key);
    if (!m) throw new OutlineFallback('font ' + st.key);
    var a = __shape(st.key, text), k = st.size / m.upem, glyphs = [], x = 0;
    var u = used[st.key] || (used[st.key] = {});
    for (var i = 0; i < a.length; i += 4) {
      var gid = a[i];
      if (gid === 0) throw new OutlineFallback('glyph');
      u[gid] = true;
      glyphs.push(gid, R(x + a[i + 2] * k), R(-a[i + 3] * k));
      x += a[i + 1] * k;
    }
    return { glyphs: glyphs, w: x };
  }
  function segments(runs, base, sc) {
    var out = [];
    runs.forEach(function (r) {
      var st = style(r, base, sc);
      String(r.t).split(/( +)/).forEach(function (t) {
        if (t === '') return;
        var sh = shape(t, st);
        out.push({ t: t, st: st, w: sh.w, glyphs: sh.glyphs, space: /^ +$/.test(t) });
      });
    });
    return out;
  }

  // Greedy line breaking at spaces (like CSS white-space: normal with
  // word-wrap: normal: a word wider than the line overflows).
  function wrap(segs, width) {
    var lines = [[]], w = 0;
    segs.forEach(function (sg) {
      var line = lines[lines.length - 1];
      if (sg.space) { if (line.length > 0) { line.push(sg); w += sg.w; } return; }
      var trailing = 0;
      for (var i = line.length - 1; i >= 0 && line[i].space; i--) trailing += line[i].w;
      if (line.length > 0 && w - trailing + sg.w > width + 0.01) {
        while (line.length > 0 && line[line.length - 1].space) line.pop();
        lines.push([sg]);
        w = sg.w;
      } else { line.push(sg); w += sg.w; }
    });
    var last = lines[lines.length - 1];
    while (last.length > 0 && last[last.length - 1].space) last.pop();
    return lines;
  }
  function widthOf(segs) { return segs.reduce(function (a, s) { return a + s.w; }, 0); }

  // CSS line box: line-height 1.2 per inline box, glyphs centred in it (half
  // leading), including the strut of the block's own font
  function lineMetrics(segs, base, sc) {
    var strut = { key: fontKey(base.f, base.b === 1, base.i === 1), size: base.sz * sc, shift: 0 };
    var A = 0, D = 0;
    [strut].concat(segs.map(function (s) { return s.st; })).forEach(function (st) {
      var m = info(st.key);
      var lh = LINE_HEIGHT * st.size, k = st.size / m.upem;
      var a = (lh - (m.asc + m.desc) * k) / 2 + m.asc * k - st.shift;
      A = Math.max(A, a);
      D = Math.max(D, lh - a);
    });
    return { A: A, D: D, h: A + D };
  }

  // Emits one visual line at (x, top) and returns its height.
  function emitLine(items, segs, x, top, width, align, justify, base, sc) {
    var lm = lineMetrics(segs, base, sc);
    var natural = widthOf(segs);
    var gap = 0, spaces = segs.filter(function (s) { return s.space; }).length;
    var x0 = x;
    if (justify && spaces > 0 && natural < width) gap = (width - natural) / spaces;
    else if (align === 'center') x0 = x + (width - natural) / 2;
    else if (align === 'right') x0 = x + width - natural;
    var baseline = top + lm.A, cx = x0, text = '', group = null;
    var flush = function () { if (group) { items.push(group); group = null; } };
    segs.forEach(function (sg) {
      var st = sg.st, w = sg.w + (sg.space ? gap : 0);
      var m = info(st.key), k = st.size / m.upem, y = baseline + st.shift;
      if (st.bg) items.unshift({ k: 'r', x: R(cx), y: R(top), w: R(w), h: R(lm.h), c: st.bg });
      if (!sg.space) {
        if (!group || group.f !== st.key || group.sz !== R(st.size) || group.c !== st.c || group.y !== R(y)) {
          flush();
          group = { k: 'g', f: st.key, sz: R(st.size), c: st.c, x: R(cx), y: R(y), g: [] };
        }
        for (var i = 0; i < sg.glyphs.length; i += 3) {
          group.g.push(sg.glyphs[i], R(cx - group.x + sg.glyphs[i + 1]), sg.glyphs[i + 2]);
        }
      }
      if (st.u) items.push({ k: 'r', x: R(cx), y: R(y - m.ulPos * k), w: R(w), h: R(Math.max(m.ulTh * k, 0.5)), c: st.c });
      if (st.s) items.push({ k: 'r', x: R(cx), y: R(y - m.stPos * k), w: R(w), h: R(Math.max(m.stTh * k, 0.5)), c: st.c });
      if (st.href) items.push({ k: 'a', x: R(cx), y: R(top), w: R(w), h: R(lm.h), href: st.href });
      text += sg.t;
      cx += w;
    });
    flush();
    if (text.trim() !== '') {
      items.push({ k: 's', t: text, x: R(x0), y: R(top), w: R(cx - x0), h: R(lm.h), sz: R(base.sz * sc) });
    }
    return lm.h;
  }

  // ───────────── blocks ─────────────
  // Lays out a list of lines (a label or a table cell). `maxw`: wrapping
  // width (null: unbounded); `fill`: the width is exactly `maxw` (cells).
  function layoutBlock(lines, o) {
    var sc = o.sc, base = o.base;
    var prepared = lines.map(function (l) {
      var ind = (l.ind || 0) * sc, indr = (l.indr || 0) * sc;
      if (l.tbl) return { l: l, ind: ind, indr: indr, natural: tableNatural(l.tbl, o) };
      if (l.hr) return { l: l, ind: ind, indr: indr, natural: 0 };
      var segs = segments(l.runs, base, sc);
      return { l: l, ind: ind, indr: indr, segs: segs, natural: widthOf(segs) };
    });
    var widest = 0;
    prepared.forEach(function (p) { widest = Math.max(widest, p.natural + p.ind + p.indr); });
    var hasTable = prepared.some(function (p) { return p.l.tbl; });
    var W = o.fill ? o.maxw :
      o.maxw != null && (o.wrap || hasTable) ? Math.min(widest, o.maxw) : widest;
    var items = [], y = 0;
    prepared.forEach(function (p) {
      var l = p.l;
      if (l.mt) y += l.mt * sc;
      var pad = (l.pad || 0) * sc, inner = W - p.ind - p.indr;
      var align = l.align || o.al;
      if (l.tbl) {
        var t = layoutTable(l.tbl, o, inner);
        var tx = p.ind + (align === 'center' ? (inner - t.w) / 2 : align === 'right' ? inner - t.w : 0);
        t.items.forEach(function (it) { items.push(offset(it, tx, y)); });
        y += t.h;
      } else if (l.hr) {
        items.push({ k: 'r', x: R(p.ind), y: R(y), w: R(inner), h: R(sc), c: '#9a9a9a' });
        y += sc;
      } else {
        var start = y, before = items.length;
        y += pad;
        var vlines = o.wrap || o.fill ? wrap(p.segs, inner - 2 * pad) : [p.segs.filter(function () { return true; })];
        vlines.forEach(function (segs, i) {
          var justify = align === 'justify' && i < vlines.length - 1;
          y += emitLine(items, segs, p.ind + pad, y, inner - 2 * pad, align === 'justify' ? 'left' : align, justify, base, sc);
        });
        y += pad;
        if (l.bg) items.splice(before, 0, { k: 'r', x: R(p.ind), y: R(start), w: R(inner), h: R(y - start), c: l.bg });
      }
      if (l.mb) y += l.mb * sc;
    });
    return { w: W, h: y, items: items };
  }
  function offset(it, dx, dy) {
    var c = {};
    for (var k in it) c[k] = it[k];
    c.x = R(c.x + dx);
    c.y = R(c.y + dy);
    return c;
  }

  // ───────────── tables ─────────────
  function cellBase(o, c) { return { sc: o.sc, base: o.base, al: c.al || o.al, wrap: true }; }
  function size(v, avail, sc) {
    if (v == null) return null;
    if (typeof v === 'string' && /%$/.test(v)) return avail == null ? null : avail * parseFloat(v) / 100;
    return v * sc;
  }
  function tableNatural(t, o) {
    var tw = size(t.w, o.maxw, o.sc);
    if (tw != null) return tw;
    return colWidths(t, o, null).reduce(function (a, b) { return a + b; }, 0) + frame(t, o).extra;
  }
  function frame(t, o) {
    var sc = o.sc, border = (t.border || 0) * sc;
    var collapse = !!t.collapse, spacing = collapse || !t.border ? 0 : (t.spacing != null ? t.spacing : 2) * sc;
    var ncols = Math.max.apply(null, t.rows.map(function (r) {
      return r.cells.reduce(function (a, c) { return a + (c.cs || 1); }, 0);
    }).concat([1]));
    // outer border and spacing of separated borders
    var extra = collapse ? border : 2 * border + spacing * (ncols + 1);
    return { border: border, collapse: collapse, spacing: spacing, ncols: ncols, extra: extra };
  }
  // Column widths: natural (max-content) widths, or scaled to a given table
  // width in proportion to them (like a browser's automatic table layout).
  function colWidths(t, o, tableW) {
    var f = frame(t, o), sc = o.sc, widths = [];
    for (var i = 0; i < f.ncols; i++) widths.push(0);
    t.rows.forEach(function (r) {
      var col = 0;
      r.cells.forEach(function (c) {
        var n = c.cs || 1, pad = (c.pad != null ? c.pad : t.pad) * sc;
        if (n === 1 && col < f.ncols) {
          var b = layoutBlock(c.lines, { sc: sc, base: o.base, al: c.al || o.al, maxw: null, wrap: false });
          widths[col] = Math.max(widths[col], b.w + 2 * pad + (f.collapse ? f.border : 2 * f.border));
        }
        col += n;
      });
    });
    if (tableW != null) {
      var total = widths.reduce(function (a, b) { return a + b; }, 0);
      var avail = tableW - f.extra;
      widths = widths.map(function (w) { return total > 0 ? avail * Math.max(w, 1) / total : avail / f.ncols; });
    }
    return widths;
  }
  function layoutTable(t, o, avail) {
    var f = frame(t, o), sc = o.sc;
    var tw = size(t.w, avail, sc), th = size(t.h, o.boxh, sc);
    var widths = colWidths(t, o, tw);
    var cb = f.collapse ? f.border : 2 * f.border;  // border inside a cell box
    // lay out cells at their column width
    var rows = t.rows.map(function (r) {
      var col = 0;
      return {
        r: r,
        cells: r.cells.map(function (c) {
          var n = c.cs || 1, w = 0;
          for (var k = col; k < col + n && k < f.ncols; k++) w += widths[k] + (k > col ? f.spacing + (f.collapse ? 0 : 0) : 0);
          var pad = (c.pad != null ? c.pad : t.pad) * sc;
          var block = layoutBlock(c.lines, { sc: sc, base: o.base, al: c.al || o.al, maxw: Math.max(w - 2 * pad - cb, 0), wrap: true, fill: true });
          var cell = { c: c, col: col, w: w, pad: pad, block: block };
          col += n;
          return cell;
        })
      };
    });
    var heights = rows.map(function (row) {
      return row.cells.reduce(function (h, cell) {
        return (cell.c.rs || 1) > 1 ? h : Math.max(h, cell.block.h + 2 * cell.pad + cb);
      }, 0);
    });
    var natural = heights.reduce(function (a, b) { return a + b; }, 0) + (f.collapse ? f.border : 2 * f.border + f.spacing * (rows.length + 1));
    if (th != null && th > natural && rows.length > 0) {
      var add = (th - natural) / rows.length;
      heights = heights.map(function (h) { return h + add; });
    }
    var x0 = f.collapse ? f.border / 2 : f.border + f.spacing;
    var colX = [x0];
    for (var i = 0; i < f.ncols; i++) colX.push(colX[i] + widths[i] + f.spacing);
    var W = f.collapse ? colX[f.ncols] + f.border / 2 : colX[f.ncols] + f.border;
    var items = [], y = f.collapse ? f.border / 2 : f.border + f.spacing;
    var stroke = function (b, x, y, w, h) {
      // a border of width b around the box (x, y, w, h), drawn as four rectangles
      if (!b || !(b.w > 0)) return;
      var bw = b.w * sc;
      items.push({ k: 'r', x: R(x - bw / 2), y: R(y - bw / 2), w: R(w + bw), h: R(bw), c: b.c });
      items.push({ k: 'r', x: R(x - bw / 2), y: R(y + h - bw / 2), w: R(w + bw), h: R(bw), c: b.c });
      items.push({ k: 'r', x: R(x - bw / 2), y: R(y - bw / 2), w: R(bw), h: R(h + bw), c: b.c });
      items.push({ k: 'r', x: R(x + w - bw / 2), y: R(y - bw / 2), w: R(bw), h: R(h + bw), c: b.c });
    };
    var total = y + heights.reduce(function (a, b) { return a + b + f.spacing; }, 0) - (f.collapse ? 0 : 0);
    var H = f.collapse ? total + f.border / 2 - (rows.length ? 0 : 0) : total + f.border;
    if (t.bg) items.push({ k: 'r', x: 0, y: 0, w: R(W), h: R(H), c: t.bg });
    var deco = [];
    rows.forEach(function (row, ri) {
      var h = heights[ri];
      row.cells.forEach(function (cell) {
        var c = cell.c, x = colX[cell.col];
        var ch = h;
        for (var k = 1; k < (c.rs || 1) && ri + k < rows.length; k++) ch += heights[ri + k] + f.spacing;
        var fill = c.bg || row.r.bg;
        if (fill) items.push({ k: 'r', x: R(x), y: R(y), w: R(cell.w), h: R(ch), c: fill });
        var bd = c.bd || row.r.bd || (f.border > 0 ? { w: t.border, c: '#000000' } : null);
        if (bd) deco.push([bd, x, y, cell.w, ch]);
        var inner = cell.block, inset = cell.pad + (f.collapse ? f.border / 2 : f.border);
        var va = c.va || 'middle';
        var cy = va === 'top' ? y + inset : va === 'bottom' ? y + ch - inset - inner.h : y + (ch - inner.h) / 2;
        inner.items.forEach(function (it) { items.push(offset(it, x + inset, cy)); });
      });
      y += h + f.spacing;
    });
    deco.forEach(function (d) { stroke.apply(null, d); });
    var fb = t.bd || (!f.collapse && f.border > 0 ? { w: t.border, c: '#000000' } : null);
    if (fb) stroke(fb, 0, 0, W, H);
    return { w: W, h: H, items: items };
  }

  // ───────────── entry point ─────────────
  g.__outlineLayout = function (cmd) {
    var sc = cmd.sc || 1;
    var base = { sz: cmd.sz, f: cmd.f, c: cmd.c, b: cmd.b || 0, i: cmd.i || 0, u: cmd.u || 0, s: cmd.s || 0 };
    var hasTable = cmd.lines.some(function (l) { return l.tbl; });
    var maxw = cmd.wrap ? cmd.ww : hasTable ? cmd.w : null;
    var block = layoutBlock(cmd.lines, {
      sc: sc, base: base, al: cmd.al, maxw: maxw, wrap: cmd.wrap, fill: false,
      boxh: cmd.h > 2 ? cmd.h : null
    });
    return { w: R(block.w), h: R(block.h), items: block.items };
  };
})(globalThis);
