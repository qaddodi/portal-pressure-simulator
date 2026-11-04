// A figure's names drawn by the GPU (Mohammad, 2 Nov 2026: "Move. Everything. To. GPU."): the sinusoid's captions, their leaders and
// their lit terms' colour, set in script and drawn through the charts' shared GPU context (trace-gl.js, the SDF atlas of text-gl.js), in the
// frame that asks for them. The page keeps its own captions only as a quiet model, for screen readers and for what reads their boxes
// at rest (credit.js, a slide's wait for its names): made clear (app.css .cap-gl-on), and placed between frames, never in one.
//
// The GPU is the source of truth: each caption is numbers kept here (its lines and their looks, its centre, its step aside and its
// scale, whether it shows), and its fades and steps are eased here, on the frame's clock, as the stylesheet's
// transitions eased them (D_SURFACE on the arrive curve). A frame that moves the figure moves its names in the same frame: the owner
// puts their new places and calls paint(), and the names are drawn in that frame's last turn (finalFrame).
//
//   const cap = createCaptions(box);            // box: the names' layer 
//   cap.look(key, look)                         // its type, ink and halo, read between frames (lookOf below)
//   cap.measure(key, lines)                     // lines: per line [[text, kind], ...]; its [w, h] in its look
//   cap.put(key, { x, y, off, show })           // x, y: the box's centre (px); off: [dx, dy, scale]
//   cap.lead(key, { x1, y1, x2, y2, show, colour, of })
//   cap.box(key) / cap.at(key)                  // its box (px) / where it is drawn now
//   cap.paint()

import { finalFrameFor, easeNow, cancelFrame } from './frame.js';
import { measure } from './glyph-measure.js';
import { textPolys, textWidth, glyphsReady, textCovers, loadGlyphs } from './text-gl.js';
import { D_SURFACE, easeArrive } from './ease.js';
import { cssColor } from './css-color.js';
import { readBox, readRects, readStyle } from './layout-snap.js';
import { createLabelGL } from './label-gl.js';
import { createLayerAlpha } from './layer-alpha.js';

const finalFrame = finalFrameFor('label-captions');
const RETRIES = 30;   // (frames a failed hand-over is drawn again, in a row)
const NONE = [];
const NOOP = () => {};   // (a disposed layer's mutators)
const ZERO = [0, 0];
const MIRROR = { lh: 1, gap: 0, halo: 0, haloC: '', runs: {} };   // (a mirrored caption's runs carry their own looks)
/** A colour as the page computed it (rgb(), color(srgb …), oklab() from a color-mix, a token's raw value), as rgba() the GPU's pen reads; '' for none. */
export function rgbaOf(c) {
  if (!c || c === 'none' || c === 'transparent') return '';
  const [r, g, b, a] = cssColor(c);
  return a > 0 ? `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${+a.toFixed(4)})` : '';
}
/**
 * A caption's halo colour for the GPU's pen. The page's names set their outline from the theme's token (--label-halo, the Anatomy and Circuit labels' halo),
 * so the token is read first, as the theme gives it for this element, and the browser's computed stroke colour only where there is none: a browser
 * that reports that property differently (a current colour, or the colour a theme had before) must not set the halo the GPU draws with.
 */
export function haloOf(cs) {
  // (One halo for every label: the theme's --label-halo, as the Anatomy and Circuit labels have it. --cap-outline, white in every theme, was the lobule's own.)
  const t = cs.getPropertyValue?.('--label-halo');
  const own = t && t.trim() && rgbaOf(t.trim());
  if (own) return own;
  // (A name whose own page rule cleared the token (a lit term's, once) still has the theme's outline: the root's.)
  let root = '';
  try { if (typeof document !== 'undefined' && document.documentElement) root = rgbaOf(readStyle(document.documentElement).getPropertyValue('--label-halo').trim()); } catch { /* no root style: the stroke colour below */ }
  return root || rgbaOf(cs.webkitTextStrokeColor);
}
/** An outer box shadow as computed ("<colour> 0px 1px 6px 0px"): { colour, dy, blur }, or null. */
export function shadowOf(s) {
  if (!s || s === 'none' || /\binset\b/.test(s)) return null;
  const m = /^(.*?\))?\s*(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+(-?[\d.]+)px)?\s*(.*)$/.exec(s.trim());
  if (!m) return null;
  const colour = rgbaOf((m[1] || m[6] || '').trim());
  return colour ? { colour, dy: +m[3], blur: +m[4] } : null;
}
/**
 * The layer's one view from its two records (R08), into `out` [k, e, f]: a hand's pan (dx, dy, in the layer's px) and the dive's scale (k about
 * a point, drawn as k p + (e, f)). The pan is applied first and the dive carries the panned layer, p → k (p + d) + (e, f), so each record
 * is written and cleared by its own owner and neither erases the other. A record that is off is the identity.
 */
export function composeView(dx, dy, k, e, f, out = [1, 0, 0]) {
  out[0] = k; out[1] = e + k * dx; out[2] = f + k * dy;
  return out;
}
// Inter's ascent and descent (hhea 1984 and 494 of 2048), as the browser sets a line: its baseline from the line's top.
const ASC = 1984 / 2048, DESC = 494 / 2048;

// ── Eases: a value that glides to each new target from where it stands, as a CSS transition does ──
const easer = (v) => ({ v, from: v, to: v, t0: 0, ms: 0 });
// A caption: its eases, where it is, the words set for it (its own record, or a page's mirrored one) and the records its calls give back.
const newItem = (key) => ({ key, a: easer(0), s: easer(1), dx: easer(0), dy: easer(0), x: 0, y: 0, w: 0, h: 0, shown: false, lines: null, lk: null, set: null, own: null, size: [0, 0], zero: [0, 0], pos: { x: 0, y: 0, w: 0, h: 0, a: 0 } });
function easeTo(e, to, now, ms = D_SURFACE) {
  if (e.to === to) return;
  e.from = easeAt(e, now); e.to = to; e.t0 = now; e.ms = ms;
}
function easeAt(e, now) {
  if (!e.ms) return e.to;
  const k = (now - e.t0) / e.ms;
  if (k >= 1) { e.ms = 0; e.v = e.to; return e.to; }
  return (e.v = e.from + (e.to - e.from) * easeArrive(Math.max(0, k)));
}
const easing = (e, now) => !!e.ms && now - e.t0 < e.ms;
const snap = (e, v) => { e.v = e.from = e.to = v; e.ms = 0; };

/**
 * A caption's look, read from the page's own caption between frames (getComputedStyle results): `cs` the caption's, `runs` its kinds of
 * run ({ name: cs, ... }: the name's capitals, a reading's figure and its unit). Every number in px, colours as
 * the page computed them.
 */
export function lookOf(cs, runs) {
  const px = (v) => parseFloat(v) || 0;
  const run = (s) => ({ size: px(s.fontSize) || 12, weight: parseFloat(s.fontWeight) || 400, ls: px(s.letterSpacing), fill: rgbaOf(s.color), op: s.opacity === '' || s.opacity == null ? 1 : +s.opacity, upper: s.textTransform === 'uppercase', mr: px(s.marginRight) });
  const lh = cs.lineHeight === 'normal' || !cs.lineHeight ? 1.2 : /px$/.test(cs.lineHeight) ? px(cs.lineHeight) / (px(cs.fontSize) || 12) : px(cs.lineHeight);
  const R = {};
  for (const k in runs) if (runs[k]) R[k] = run(runs[k]);
  return { lh, gap: px(cs.rowGap), halo: px(cs.webkitTextStrokeWidth), haloC: haloOf(cs), runs: R };
}
/** The ring of an inset box shadow as computed ("<colour> 0px 0px 0px 2px inset"): { w, colour }, or null. */
export function ringOf(s) {
  if (!s || s === 'none' || !/\binset\b/.test(s)) return null;
  const m = /^(.*?\))?\s*(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s*(.*?)\s*inset\s*$/.exec(s.trim());
  if (!m) return null;
  return { w: +m[5], colour: rgbaOf((m[1] || m[6] || '').trim()) };
}
// (A run's font and letter spacing as the pen reads them, made again only when its scale changes: a caption that holds its size draws
// every frame with the strings it drew with the frame before, as it held them.)
const fontOf = (r, s) => {
  if (r.fontS !== s) { r.fontS = s; r.fontStr = `${r.weight} ${(r.size * s).toFixed(2)}px Inter`; }
  return r.fontStr;
};
const NBSP = /\u00a0/g;
const upper = (r, t) => (r.upper ? t.toUpperCase() : t);
// (A run's width: Inter's own outlines and kerning, as the Anatomy labels are set (label-gl.js layBlock), once the outlines are here; the SDF atlas's before.)
const outlined = (t) => glyphsReady() && textCovers(t);
const widthOf = (t, r) => (outlined(t) ? textWidth(t, { weight: r.weight, size: r.size, tnum: true }) : measure(t, fontOf(r, 1)));
// A run's outlines as the Anatomy pen draws them (the same textPolys label-gl's blockOps fills), made once per word and kept as numbers: pieces (closed),
// their starts in pts, and the counts. A reading that changes is made once, the frame it first shows; the table starts over past 1500 words.
const OUTL = new Map();
function outlineOf(t, r) {
  const key = `${r.weight}|${r.size}|${r.ls}|${t}`;
  let o = OUTL.get(key);
  if (o) return o;
  const polys = textPolys(t, 0, 0, { weight: r.weight, size: r.size, tnum: true, ls: r.ls }).polys;
  let n = 0;
  for (const p of polys) n += p.pts.length + 2;
  const pts = new Float32Array(n), starts = new Int32Array(polys.length);
  let w = 0;
  polys.forEach((p, i) => { starts[i] = w; pts.set(p.pts, w); w += p.pts.length; pts[w++] = p.pts[0]; pts[w++] = p.pts[1]; });   // (closed: the first point again, for the halo's stroke)
  if (OUTL.size > 1500) OUTL.clear();
  OUTL.set(key, o = { pts, starts, np: polys.length, n });
  return o;
}
// (The characters of a word as the browser counts them for letter spacing: its code points, a surrogate pair as one.)
const points = (u) => { let c = 0; for (let i = 0; i < u.length; i++) { const k = u.charCodeAt(i); if (k < 0xdc00 || k > 0xdfff) c++; } return c; };
const newLine = () => ({ runs: [], m: 0, w: 0, y: 0, base: 0 });
const newRun = () => ({ t: '', r: null, x: 0 });

/**
 * A caption's lines set in a look, written into `set` (kept by the caption, its lines and runs reused): { lines: [{ runs: [{ t, r (its look), x }],
 * m (how many runs), w, y, base }], n (how many lines), w, h }. `lines`: per line, its runs as [text, kind] (text a string; kind: one of the
 * look's runs, as 'name', 'fig', 'unit'); a run of a kind the look does not have is left out.
 */
export function setLines(look, lines, set) {
  let w = 0, h = 0, n = 0;
  for (let i = 0; i < lines.length; i++) {
    const spec = lines[i];
    let x = 0, top = 0, m = 0, last = null;
    const ln = set.lines[n] || (set.lines[n] = newLine());
    for (let j = 0; j < spec.length; j++) {
      const t = spec[j][0], r = look.runs[spec[j][1]];
      if (!r || typeof t !== 'string' || t === '') continue;
      const u = upper(r, t).replace(NBSP, ' ');   // (the outlines have no no-break space: a plain one, as wide)
      const run = ln.runs[m] || (ln.runs[m] = newRun());
      run.t = u; run.r = r; run.x = x; m++; last = r;
      if (outlined(u)) outlineOf(u, r);   // (made now, between frames, so the frame that draws it only lays it)
      x += widthOf(u, r) + r.ls * points(u) + r.mr;
      top = Math.max(top, r.size);
    }
    if (!m) continue;
    const lw = x - last.mr, lh = look.lh * top;
    if (n) h += look.gap;
    // (Each run on the line's one baseline, set as the browser sets a line of mixed sizes: the half leading of its largest type.)
    ln.m = m; ln.w = lw; ln.y = h; ln.base = h + (lh - (ASC + DESC) * top) / 2 + ASC * top;
    n++;
    w = Math.max(w, lw);
    h += lh;
  }
  set.n = n; set.w = w; set.h = h;
  return set;
}

/**
 * A page element's words as the page set them (its grid, its flex, its wraps), read between frames for the GPU to draw them in the same
 * place: { lines: [{ runs: [{ t, r, x }], w, base }], w, h, marks, at }. Each text the element shows is one run at its own spot (a wrapped
 * one, a run for each of its lines), in its own type, ink, letter spacing, opacity and halo (its -webkit-text-stroke). A background
 * (a call's pill) is a mark drawn under the words. `at`: the boxes of the elements `sel` names, in the element's own px, for marks of
 * the owner's (a label's arrow). Null when the element takes no room. Reads only; never called in a frame.
 */
export function mirrorOf(el, sel = []) {
  const box = readBox(el);
  if (!box || !(box.width > 0 && box.height > 0)) return null;
  const px = (v) => parseFloat(v) || 0, opOf = (cs) => (cs.opacity === '' || cs.opacity == null ? 1 : +cs.opacity);
  const lines = [], marks = [], at = {};
  const cs0 = readStyle(el), bg = rgbaOf(cs0.backgroundColor);
  if (bg) {
    const bw = px(cs0.borderTopWidth);
    marks.push({ kind: 'bg', fill: bg, rad: Math.min(px(cs0.borderTopLeftRadius), box.height / 2, box.width / 2), sh: shadowOf(cs0.boxShadow),
      border: bw > 0 ? { w: bw, colour: rgbaOf(cs0.borderTopColor) } : null });
  }
  const rg = document.createRange(), tw = document.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const txt = n.data.replace(/\s+/g, ' ');
    if (!txt.trim()) continue;
    const p = n.parentElement, cs = readStyle(p);
    let op = 1;
    for (let e = p; e && e !== el; e = e.parentElement) op *= opOf(e === p ? cs : readStyle(e));
    rg.selectNodeContents(n);
    const rs = readRects(rg);
    if (!rs?.length) continue;   // (shown as display: none: a name's short form on a wide screen)
    const size = px(cs.fontSize) || 12;
    const r = { size, weight: parseFloat(cs.fontWeight) || 400, ls: px(cs.letterSpacing), fill: rgbaOf(cs.color), op, upper: cs.textTransform === 'uppercase', mr: 0,
      halo: px(cs.webkitTextStrokeWidth), haloC: haloOf(cs) };
    const put = (t, rc) => { if (t.trim()) lines.push({ runs: [{ t: upper(r, t), r, x: rc.left - box.left }], w: box.width, base: rc.bottom - box.top - DESC * size }); };
    if (rs.length === 1) { put(txt.trimEnd(), rs[0]); continue; }
    // (Wrapped: each of its lines from the words that sit on it.)
    const words = [], re = /\S+/g;
    for (let m = re.exec(n.data); m; m = re.exec(n.data)) {
      rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
      const q = readRects(rg)?.[0];
      if (q) words.push([m[0], q]);
    }
    let cur = null;
    for (const [w, q] of words) {
      if (cur && Math.abs(q.top - cur.q.top) < size / 2) cur.t += ` ${w}`;
      else { if (cur) put(cur.t, cur.q); cur = { t: w, q }; }
    }
    if (cur) put(cur.t, cur.q);
  }
  for (const s of sel) {
    const e = el.querySelector(s), b = e && readBox(e);
    if (b?.width) at[s] = { x: b.left - box.left, y: b.top - box.top, w: b.width, h: b.height, colour: rgbaOf(readStyle(e, '::before').backgroundColor) };
  }
  return { lines, w: box.width, h: box.height, marks, at };
}

/**
 * The rows of words an element shows, each as its own box { x0, y0, x1, y1 } from the element's corner (a line as wide as its letters, not
 * as the widest line): written into `out` (its records reused) and returned. A leader stops on the row it runs to, not on the corner of
 * a box the longer line makes wide. Reads only; never called in a frame.
 */
export function inkRows(el, out = []) {
  let n = 0;
  const box = readBox(el);
  if (box && box.width > 0 && box.height > 0) {
    const rg = document.createRange(), tw = document.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
    for (let t = tw.nextNode(); t; t = tw.nextNode()) {
      if (!t.data.trim()) continue;
      rg.selectNodeContents(t);
      const rs = readRects(rg);
      for (let i = 0; rs && i < rs.length; i++) {
        const r = rs[i];
        if (!(r.width > 0 && r.height > 0)) continue;
        const x0 = r.left - box.left, y0 = r.top - box.top, x1 = r.right - box.left, y1 = r.bottom - box.top;
        let row = null;
        for (let j = 0; j < n; j++) {
          const q = out[j], ov = Math.min(q.y1, y1) - Math.max(q.y0, y0);
          if (ov > 0.5 * Math.min(q.y1 - q.y0, y1 - y0)) { row = q; break; }
        }
        if (row) { row.x0 = Math.min(row.x0, x0); row.y0 = Math.min(row.y0, y0); row.x1 = Math.max(row.x1, x1); row.y1 = Math.max(row.y1, y1); }
        else { const q = out[n++] || (out[n - 1] = { x0: 0, y0: 0, x1: 0, y1: 0 }); q.x0 = x0; q.y0 = y0; q.x1 = x1; q.y1 = y1; }   // alloc-rare: a row record is made once and reused
      }
    }
  }
  out.length = n;
  return out;
}

/**
 * The names' layer in `box`: see above.
 *
 * Presented (R06): `presented` turns true at the first frame at nonzero size whose end() did not return false, and onPresented fires then;
 * until it does the page's own names are what shows (the owner adds app.css .cap-gl-on only on it). Once presented it stays: everything is
 * on the GPU, so a failed hand-over or a lost context keeps the last completed picture and the class, the frame is drawn again on the GPU
 * (a few tries, and after the context is built again, by the drawer's redraw), and the page's names never come back. onLost fires only
 * when the drawer is gone for good (dispose, or no WebGL2). New words before the next frame do not take it back either (a flash);
 * `gen` counts the content generations and a frame always draws the latest.
 */
export function createCaptions(box, { labelGL = createLabelGL, deferred = false } = {}) {
  // The words are drawn by label-gl, the Anatomy and Circuit labels' own renderer (Mohammad, 3 Nov 2026: "Same engine for labels everywhere"):
  // each caption is a label group (.lb, its words as <text><tspan>) in a model svg, laid out and drawn by a label-gl layer of its own over this box.
  // Leaders, dots, arrows and the legend's dot are label-gl's marks and groups too; with no label-gl (no WebGL2) the page's own names show.
  const NS = 'http://www.w3.org/2000/svg';
  const model = document.createElementNS(NS, 'svg'), mblocks = document.createElementNS(NS, 'g');
  model.setAttribute('class', 'cap-model'); model.setAttribute('aria-hidden', 'true'); mblocks.setAttribute('class', 'lb-blocks'); model.append(mblocks);
  box.append(model);
  const lroot = document.createElementNS(NS, 'g');
  lroot.setAttribute('class', 'lb-leaders'); model.prepend(lroot);
  // The layer is drawn in the figure's own context (attach, L1 of docs/gpu-two-contexts-plan.md): a pass of its present, under the glass, so a name
  // is in the very picture the figure is, never a frame off, and no canvas of its own lies over the stage. `deferred`: the owner attaches it
  // when it knows the figure (a view made before the figure's renderer exists); attach(null) is the own-canvas layer the names had before.
  let LG = deferred ? null : labelGL(model, mblocks, { force: true, id: 'capLabelGl', marks: [lroot] });
  let hosted = null;   // { top, off (the pass's removal), spec, alpha } while the names are drawn in a host's context
  const lgList = [];
  const lgOn = () => !!LG && !LG.lost;
  let svSeq = 0;
  // A leader and its dot as marks label-gl draws (the Anatomy's .leader, .leader-dot-halo, .leader-dot): written here, drawn by the GPU.
  const mk = (cls) => { const e = document.createElementNS(NS, cls === 'leader' ? 'path' : 'circle'); e.setAttribute('class', cls); lroot.append(e); return e; };
  function leadMarks(key, L, x1, y1, x2, y2, a) {
    const M = L.m || (L.m = { p: mk('leader'), h: mk('leader-dot-halo'), d: mk('leader-dot') });
    M.p.setAttribute('d', `M${x2.toFixed(2)} ${y2.toFixed(2)} L${x1.toFixed(2)} ${y1.toFixed(2)}`);
    for (const e of [M.h, M.d]) { e.setAttribute('cx', x2.toFixed(2)); e.setAttribute('cy', y2.toFixed(2)); }
    M.h.setAttribute('r', String(leadLook.haloR)); M.d.setAttribute('r', String(L.r ?? leadLook.r));
    const o = a.toFixed(3);
    if (M.o !== o) { M.o = o; M.p.style.opacity = M.h.style.opacity = M.d.style.opacity = o; }
  }
  // Whether label-gl can draw all of a caption's words (Inter's outlines have every glyph); else it is not drawn until they are (draw() runs again when they load).
  function covered(I) {
    if (I.cvSv === I.sv && I.cvGr === glyphsReady()) return I.cv;
    I.cvSv = I.sv; I.cvGr = glyphsReady();
    let ok = glyphsReady();
    for (let li = 0, n = I.set.n ?? I.set.lines.length; ok && li < n; li++) { const ln = I.set.lines[li]; for (let ri = 0, m = ln.m ?? ln.runs.length; ok && ri < m; ri++) ok = textCovers(ln.runs[ri].t); }
    return (I.cv = ok);
  }
  // A caption's group, made again only when its words, scale or look changed.
  function buildGroup(I, s) {
    let g = I.g;
    if (!g) { g = I.g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'lb'); mblocks.append(g); I.ent = { g, x: 0, y: 0, rot: false }; }
    if (I.gsv === I.sv && I.gs === s && I.ggr === glyphsReady() && I.garr === I.arrow && I.gdec === I.decor) return g;
    I.gsv = I.sv; I.gs = s; I.ggr = glyphsReady(); I.garr = I.arrow; I.gdec = I.decor;
    g.textContent = '';
    const bw = I.w * s;
    if (I.arrow) {   // (an owner's arrow: a small triangle about a point of the caption, turned to the way it points)
      const A = I.arrow, c = Math.cos(A.ang), sn = Math.sin(A.ang), ox = (A.x + c * A.r) * s, oy = (A.y + sn * A.r) * s, tri = document.createElementNS(NS, 'polygon');
      tri.setAttribute('points', [ox + (-4.5 * c + 5 * sn) * s, oy + (-4.5 * sn - 5 * c) * s, ox + 4.5 * c * s, oy + 4.5 * sn * s, ox + (-4.5 * c - 5 * sn) * s, oy + (-4.5 * sn + 5 * c) * s].map((v) => v.toFixed(2)).join(' '));
      tri.style.fill = A.colour; g.append(tri);
    }
    for (const D of I.decor || NONE) {   // (shapes the owner sets with a caption, in its own px from the caption's corner: a legend's dot and its ring)
      const q = document.createElementNS(NS, 'polygon');
      q.setAttribute('points', D.pts.map((v) => (v * s).toFixed(2)).join(' '));
      q.style.fill = D.fill || 'none';
      if (D.stroke) { q.style.stroke = D.stroke; q.style.strokeWidth = `${D.sw || 1}px`; }
      g.append(q);
    }
    for (let li = 0, n = I.set.n ?? I.set.lines.length; li < n; li++) {
      const ln = I.set.lines[li], x0 = (bw - ln.w * s) / 2;
      for (let ri = 0, rn = ln.m ?? ln.runs.length; ri < rn; ri++) {
        const { t: txt, r, x } = ln.runs[ri];
        const te = document.createElementNS(NS, 'text'), sp = document.createElementNS(NS, 'tspan');
        te.setAttribute('x', (x0 + x * s).toFixed(2)); te.setAttribute('y', (ln.base * s).toFixed(2));
        sp.setAttribute('font-size', (r.size * s).toFixed(2)); sp.setAttribute('font-weight', r.weight);
        if (r.ls) sp.setAttribute('letter-spacing', (r.ls * s).toFixed(3));
        sp.style.fill = r.fill; sp.textContent = txt;
        te.append(sp); g.append(te);
      }
    }
    return g;
  }
  const items = new Map(), leads = new Map(), looks = new Map();
  // (The leaders' and dots' look, the Anatomy's: the owner reads it from the page's tokens between frames, leadLook(); these are its defaults.)
  const leadLook = { line: '', lw: 1, r: 2.4, fill: '', ring: '', rw: 1.3, halo: '', haloR: 5 };
  let holes = NONE;   // (the glasses lying over this layer, as glass-gl.js tells them: the names under them are left out)
  let vk = 1, ve = 0, vf = 0, ask = 0, drewOnce = false, onDrawn = null, onRest = null, onFrame = null, wasMoving = false, lastT = 0, drawing = false;
  let presented = false, onPresented = null, onLost = null, gen = 0, retries = 0, dead = false;
  // The names the last frame drew, for the browser checks (R17, snapshot()): two record lists, the one being drawn and the one last handed over,
  // their records reused; nothing is made in a frame once they have grown to the most names a frame draws.
  let drawn = [], shown = [], drawnV = [1, 0, 0], shownV = [1, 0, 0], drawnN = 0, shownN = 0, drawnLN = 0, shownLN = 0, drawnL = [], shownL = [], seq = 0, shownGen = 0, drawnGen = 0, shownW = 0, shownH = 0;
  const record = (key, x, y, w, h, a, cw, ch, I, l, t, sc) => {
    const r = drawn[drawnN++] || (drawn[drawnN - 1] = { key: '', x: 0, y: 0, w: 0, h: 0, a: 0, clipped: false, I: null, l: 0, t: 0, s: 1 });   // alloc-rare: only until a frame has drawn as many names as any frame will
    r.key = key; r.x = x; r.y = y; r.w = w; r.h = h; r.a = a; r.I = I; r.l = l; r.t = t; r.s = sc;
    r.clipped = x < 0 || y < 0 || x + w > cw || y + h > ch;
  };
  const present = (on) => {
    if (on === presented) return;
    presented = on;
    if (on) onPresented?.(); else onLost?.();
  };
  function draw() {
    ask = 0;
    if (dead || !box.isConnected) return;
    const bx = readBox(box), w = bx.width, h = bx.height;
    const now = easeNow();
    lastT = now;
    let more = false, failed = false;
    drawing = true; drawnN = 0; drawnLN = 0; drawnGen = gen; drawnV[0] = vk; drawnV[1] = ve; drawnV[2] = vf;
    try {
      // (The owner's places for this frame, set as it is drawn: a glide its page eased, a pan's ride.)
      if (onFrame?.(now)) more = true;
      if (!(w > 0 && h > 0)) {
        // (In a host's context nothing hides an empty layer: the names last handed over would stay drawn.)
        if (hosted && LG) { lgList.length = 0; LG.sync(lgList); }
        return;
      }
      // (The whole layer carried by the owner's view, view(): a point p is at k p + (e, f). A pan, or the lobule's dive about a point. Only the
      // places go through it: the words, their halo, the leaders' width and the dots keep their size on the screen at any zoom, as the
      // Anatomy and Circuit labels do (Mohammad, 3 Nov 2026), so nothing here is scaled by it.)
      // (The page's fades of the layer (the camera's, the sinusoid's, a slide's hush, the lobule's own fade), which reached the canvas that lay inside
      // it, reach the picture drawn in the host's context: layer-alpha.js, no read of the page in a frame while none changes.)
      let la = 1;
      if (hosted) {
        hosted.alpha ||= createLayerAlpha(box, { near: hosted.spec.near || null, onChange: () => api.paint() });   // alloc-rare: once per attach, on its first frame
        la = hosted.alpha.now();
        if (hosted.alpha.moving) more = true;
      }
      // Leaders under the names, as their layer was.
      for (const [key, L] of leads) {
        const a = easeAt(L.a, now) * (L.of ? itemA(L.of, now) : 1);
        more ||= easing(L.a, now);
        if (a <= 0.002 || !L.colour) { if (L.m && L.m.o !== '0.000') { L.m.o = '0.000'; L.m.p.style.opacity = L.m.h.style.opacity = L.m.d.style.opacity = '0'; } continue; }
        let { x1, y1 } = L;
        const I = L.of && items.get(L.of);
        // (Its near end follows its name's step aside, as eased, to the edge of the smaller box when the name was set smaller.)
        if (I && L.follow) { x1 += easeAt(I.dx, now) - L.sg * (I.w / 2) * (1 - easeAt(I.s, now)); y1 += easeAt(I.dy, now); }
        // (Both ends where the figure now has them; the near end keeps its distance from its name's middle, which does not scale.)
        const x2 = vk * L.x2 + ve, y2 = vk * L.y2 + vf;
        let sx = vk * x1 + ve, sy = vk * y1 + vf;
        if (I && vk !== 1) { sx = vk * I.x + ve + (x1 - I.x); sy = vk * I.y + vf + (y1 - I.y); }
        { const q = drawnL[drawnLN++] || (drawnL[drawnLN - 1] = { key: '', x0: 0, y0: 0, x1: 0, y1: 0, a: 0 }); q.key = key; q.x0 = x2; q.y0 = y2; q.x1 = sx; q.y1 = sy; q.a = a; }   // (what this frame drew, for snapshot(): the figure's point and the name's end, view applied; alloc-rare, only until a frame has drawn as many leaders as any frame will)
        // The leader and its dot as the Anatomy and Circuit labels draw them (app.css .leader, .leader-dot): a 1px line in the leader ink, the dot on
        // its point with the stage's paper round it and the text ink's ring.
        if (lgOn()) leadMarks(key, L, sx, sy, x2, y2, a * la);
      }
      lgList.length = 0;
      for (const I of items.values()) {
        const lk = looks.get(I.key);
        if (!lk || !I.set) continue;
        const a = easeAt(I.a, now), s = easeAt(I.s, now), dx = easeAt(I.dx, now), dy = easeAt(I.dy, now);
        more ||= easing(I.a, now) || easing(I.s, now) || easing(I.dx, now) || easing(I.dy, now);
        if (a <= 0.002) continue;
        // (Where the box's middle stands on the screen, the layer's view included: k p + (e, f); its size is its own, never the view's.)
        const bw = I.w * s, bh = I.h * s, l = vk * (I.x + dx) + ve - bw / 2, t = vk * (I.y + dy) + vf - bh / 2;
        record(I.key, l, t, bw, bh, a, w, h, I, l, t, s);
        // A lit term (a slide's) shows in its colour on the name and figure alone, as the page's look reads it: no pill or chip behind
        // a figure's label (owner, 2 Nov: anatomy-style halo text, no pills).
        if (lgOn() && covered(I)) {
          if (I.set.lines.length && (I.set.n ?? 1) > 0) {
            const g = buildGroup(I, s), e = I.ent;
            e.x = l; e.y = t;
            const o = (a * la).toFixed(3);
            if (g.style.opacity !== o) g.style.opacity = o;
            lgList.push(e);
          }
          continue;
        }
      }
      if (LG) LG.sync(lgList);
    } finally {
      drawing = false;
      const handed = lgOn();   // (label-gl is here and its context is not lost: the picture went to it)
      // (In the finally: a frame at no size returns above.) A frame that could not be handed over, or came while the context was gone,
      // leaves the last picture in the canvas and the class on: it is drawn again (a few tries, then at the next paint or restore).
      if (LG) {
        if (w > 0 && h > 0 && handed) { retries = 0; seq++; const t = shown; shown = drawn; drawn = t; shownN = drawnN; shownLN = drawnLN; { const t2 = shownL; shownL = drawnL; drawnL = t2; } shownGen = drawnGen; { const v = shownV; shownV = drawnV; drawnV = v; } shownW = w; shownH = h; present(true); if (!drewOnce) { drewOnce = true; onDrawn?.(); } }
        else if (w > 0 && h > 0 && !handed) failed = true;
      }
    }
    if (failed && retries++ < RETRIES) more = true;
    if (more) ask = finalFrame(draw);
    else if (wasMoving) onRest?.();   // (its eases done: the owner may place its page model, between frames)
    wasMoving = more;
  }
  // The layer's drawer let go: its pass out of the host's present, its fade follower ended, the drawer disposed.
  function dropLG() {
    if (hosted) { hosted.off?.(); hosted.alpha?.dispose(); hosted = null; }
    if (LG) { LG.dispose?.(); LG = null; }
    lgList.length = 0;
  }
  function itemA(key, now) { const I = items.get(key); return I ? easeAt(I.a, now) : 1; }
  // (Inter's outlines, the Anatomy pen's: till they are here the names are drawn from the atlas, and set again, then drawn from the outlines.)
  if (!glyphsReady()) loadGlyphs().then(() => { if (!dead) { gen++; api.paint(); } }, () => {});
  const api = {
    /**
     * Where the names are drawn. `{ top, order, active, near, scale }`: in the figure's context (veins-gl top), as a pass of its present at `order`
     * (under the glass: no holes are cut); active(): whether the host may draw them now; near: the element up whose chain a style write
     * is watched for the layer's fades; scale(): the host canvas's pixels per CSS px. `null`: a canvas of the layer's own, as before (no figure).
     * Called again when the figure's renderer is made anew; the names already set are drawn again at once.
     */
    attach(spec) {
      if (dead) return;
      dropLG();
      if (spec?.top) {
        const top = spec.top;
        const host = { gl: top.gl, canvas: top.canvas, ask: () => top.present(), now: () => top.present(), active: () => !dead && !top.gl.isContextLost() && (spec.active ? !!spec.active() : true), scale: spec.scale };
        LG = labelGL(model, mblocks, { force: true, id: 'capLabelGl', marks: [lroot], host });
        if (LG) hosted = { top, spec, alpha: null, off: top.add({ order: spec.order ?? 0, solo: true, prep: () => { if (lgList.length || leads.size) LG?.drawInto?.(); }, draw: () => {} }) };   // (a prep, as the stage labels': laid before any glass takes its blur)   // (nothing to draw: the present has cleared the canvas, no pass is run)
      } else LG = labelGL(model, mblocks, { force: true, id: 'capLabelGl', marks: [lroot] });
      gen++;
      api.paint();
    },
    /** The figure's renderer is gone (or about to be made anew): its pass is taken out; the last picture stays in the figure's canvas until it is. */
    detach() { if (!dead) dropLG(); },
    /** Whether the GPU draws the names (WebGL2 and the charts' drawer are here); false: the page's own names must show. */
    get on() { return !dead && !!LG; },
    /** Called once, after the first frame the GPU drew the names and handed over. */
    set onDrawn(f) { if (dead) return; onDrawn = f; if (drewOnce) f?.(); },
    /** True while the GPU's picture of the names is on the screen (a frame at nonzero size, handed over); false: the page's own names must show. */
    get presented() { return presented; },
    /** Called each time the names become presented (at once if they already are). */
    set onPresented(f) { if (dead) return; onPresented = f; if (presented) f?.(); },
    /** Called when presentation is lost: a failed hand-over, a lost context, a size of nothing. */
    set onLost(f) { if (!dead) onLost = f; },
    /**
     * What the last frame handed over drew, for the browser checks (R17): { seq (counts the frames that landed), gen (the content generation they
     * drew), w, h (the canvas), items: [{ key, x, y, w, h, a, clipped }] } in the layer's px, view included, as the GPU drew them (not the page's
     * model); a (0 to 1) what it shows, clipped when its box reaches past the canvas. A frame that did not land changes nothing. Made on a call.
     */
    snapshot() {
      const items = [];
      for (let i = 0; i < shownN; i++) {
        const r = shown[i], rows = [];   // (rows: each line's own box as the GPU drew it, from the words' runs as they stand: a line as wide as its letters)
        const set = r.I?.set, bw = r.w;   // (screen px: the view is in the places already, the words keep their size)
        if (set) for (let li = 0, n = set.n ?? set.lines.length; li < n; li++) {
          const ln = set.lines[li], m = ln.m ?? ln.runs.length;
          if (!m) continue;
          const x0 = r.l + (bw - ln.w * r.s) / 2;
          let lo = Infinity, hi = -Infinity, top = 0;
          for (let ri = 0; ri < m; ri++) { const q = ln.runs[ri]; lo = Math.min(lo, q.x); hi = Math.max(hi, q.x + widthOf(q.t, q.r) + q.r.ls * points(q.t)); top = Math.max(top, q.r.size); }
          const by = r.t + ln.base * r.s;
          rows.push({ x: x0 + lo * r.s, y: by - ASC * top * r.s, w: (hi - lo) * r.s, h: (ASC + DESC) * top * r.s });
        }
        let halo = '';   // (the halo colour of the first run that has one, as the pen was given it)
        if (set) for (let li = 0, n = set.n ?? set.lines.length; li < n && !halo; li++) { const ln = set.lines[li]; for (let ri = 0, m = ln.m ?? ln.runs.length; ri < m && !halo; ri++) { const q = ln.runs[ri].r; if ((q.halo ?? looks.get(r.key)?.halo) > 0) halo = q.haloC ?? looks.get(r.key)?.haloC ?? ''; } }
        items.push({ key: r.key, x: r.x, y: r.y, w: r.w, h: r.h, a: r.a, clipped: r.clipped, rows, halo });
      }
      // (The leaders this frame drew: the figure's point (x0, y0) and the name's end (x1, y1), in the layer's px with the view already applied.)
      const leadsOut = [];
      for (let i = 0; i < shownLN; i++) { const q = shownL[i]; leadsOut.push({ key: q.key, x0: q.x0, y0: q.y0, x1: q.x1, y1: q.y1, a: q.a }); }
      return { seq, gen: shownGen, w: shownW, h: shownH, items, leads: leadsOut };
    },
    /** The glasses over this layer (glass-gl.js tellHoles: client px boxes, fades, shapes), [] for none: the names are left out under them, in the frame that draws them. */
    holes(list) { if (dead || list === holes) return; holes = list || NONE; LG?.setHoles?.(holes); api.paint(); },
    /** The content generation: counts each change of words, looks or mirrors. */
    get gen() { return gen; },
    /** Called first in each frame the names are drawn (now): the owner sets their places there; true while one of them still moves. */
    set onFrame(f) { if (!dead) onFrame = f; },
    /** Called after a frame in which the last of its eases ended. */
    set onRest(f) { if (!dead) onRest = f; },
    /** A caption's look (lookOf): its sizes are set again the next time it is measured. */
    look(key, lk) { looks.set(key, lk); gen++; api.paint(); },
    hasLook: (key) => looks.has(key),
    /** Sets the lines of a caption in its look, for its size: { w, h } (0 until its look is read). */
    measure(key, lines) {
      const lk = looks.get(key);
      let I = items.get(key);
      if (!I) items.set(key, I = newItem(key));
      // (The words are a new list when they change, the owner builds them then, so the list itself is their signature.)
      if (lk && (I.lines !== lines || I.lk !== lk || I.gr !== glyphsReady())) {
        I.lines = lines; I.lk = lk; I.gr = glyphsReady();
        I.set = setLines(lk, lines, I.own || (I.own = { lines: [], n: 0, w: 0, h: 0 }));   // (its own record: a mirrored one, mirror(), is the owner's, never written into)
        I.w = I.set.w; I.h = I.set.h; I.size[0] = I.w; I.size[1] = I.h; I.sv = ++svSeq; gen++;
      } else if (!lk) { I.lines = lines; }
      return lk ? I.size : I.zero;
    },
    /** Sets a caption from the page's own as it was set (mirrorOf): its words at their spots, its marks. */
    mirror(key, m) {
      let I = items.get(key);
      if (!I) items.set(key, I = newItem(key));
      if (!looks.has(key)) looks.set(key, MIRROR);
      gen++;
      if (!m) { I.set = null; I.sv = ++svSeq; api.paint(); return; }
      I.set = m; I.w = m.w; I.h = m.h; I.sig = ''; I.lines = null; I.sv = ++svSeq;
      if (glyphsReady()) for (const ln of m.lines) for (const q of ln.runs) if (outlined(q.t)) outlineOf(q.t, q.r);   // (the words' outlines made here, between frames, not in the frame that first draws them)
      api.paint();
    },
    /** Shapes drawn with a caption ([{ pts: [x, y, ...] from its corner, fill, stroke, sw }]): the legend's dot. */
    decor(key, list) { const I = items.get(key); if (I && I.decor !== list) { I.decor = list; api.paint(); } },
    /** An arrow drawn with a caption ({ x, y, ang, r, colour }: about x, y of its box, turned ang, r out), or none (null). */
    arrow(key, A) { const I = items.get(key); if (I && I.arrow !== A) { I.arrow = A; api.paint(); } },
    /**
     * Places a caption: x, y its box's centre (px), off [dx, dy, s] its step aside and scale (eased), show 0 or 1 (eased; a caption seen
     * for the first time fades in).
     */
    put(key, { x, y, off = null, show = 1, now = easeNow(), ms = D_SURFACE }) {
      const I = items.get(key);
      if (!I) return;
      lastT = now;
      I.x = x; I.y = y;
      if (off) {
        if (!I.placed) { snap(I.dx, off[0]); snap(I.dy, off[1]); snap(I.s, off[2]); }
        else { snap(I.dx, off[0]); snap(I.dy, off[1]); easeTo(I.s, off[2], now); }   // (a name's step aside is a place, so it is where the owner puts it in this frame, never eased toward: V-LBL-1)
      }
      if (I.set) {
        if (!I.placed) I.placed = true;
        easeTo(I.a, show, now, ms);
      }
      api.paint();
    },
    /** put() with no object made (a frame's call): s its eased scale, or -1 to leave it. */
    place(key, x, y, show, ms, s, now) {
      const I = items.get(key);
      if (!I) return;
      lastT = now; I.x = x; I.y = y;
      if (s >= 0) { if (!I.placed) snap(I.s, s); else easeTo(I.s, s, now); }
      if (I.set) { I.placed = true; easeTo(I.a, show, now, ms); }
      api.paint();
    },
    /** Hides a caption at once (as a view leaves): it fades in again the next time it is placed. */
    reset(key) { const I = items.get(key); if (I) { I.placed = false; snap(I.a, 0); } },
    /** Hides every caption and leader at once (the view they belong to is gone): each fades in again the next time it is placed, from nothing, at its own place. */
    hideAll() {
      for (const I of items.values()) { I.placed = false; snap(I.a, 0); }
      for (const L of leads.values()) snap(L.a, 0);
      api.paint();
    },
    lead(key, L) {
      let o = leads.get(key);
      if (!o) leads.set(key, o = { a: easer(L.show ?? 1) });
      Object.assign(o, L);
      if (L.cut) snap(o.a, 0); else easeTo(o.a, L.show ?? 1, easeNow());
      api.paint();
    },
    leadOf: (key) => leads.get(key),
    /** The leaders' and dots' look, as label-gl draws the Anatomy's (app.css .leader, .leader-dot, .leader-dot-halo): { line, lw, r, fill, ring, rw, halo, haloR }; colours as rgba(). */
    leadLook(lk) {
      let ch = false;
      for (const k in lk) if (lk[k] !== undefined && leadLook[k] !== lk[k]) { leadLook[k] = lk[k]; ch = true; }
      if (ch) { gen++; api.paint(); }
    },
    /** Where a caption is drawn (its box's centre, step aside included) and how much it shows: { x, y, w, h, a }, or null; by default as
     *  of the frame that last placed or drew the names. */
    at(key, now = lastT || easeNow()) {
      const I = items.get(key);
      if (!I) return null;
      const s = easeAt(I.s, now), P = I.pos;   // (the caption's own record, written in place: read it before the next call)
      P.x = I.x + easeAt(I.dx, now); P.y = I.y + easeAt(I.dy, now); P.w = I.w * s; P.h = I.h * s; P.a = easeAt(I.a, now);
      return P;
    },
    /** Whether a caption or a leader is still easing. */
    moving(now = easeNow()) {
      for (const I of items.values()) if (easing(I.a, now) || easing(I.s, now) || easing(I.dx, now) || easing(I.dy, now)) return true;
      for (const L of leads.values()) if (easing(L.a, now)) return true;
      return false;
    },
    /** The whole layer moved as one: a point p is drawn at k p + (e, f) (px). A pan is k 1; the lobule's dive is a scale about a point. */
    view(k, e, f) { if (vk === k && ve === e && vf === f) return; vk = k; ve = e; vf = f; api.paint(); },
    paint() { if (!drawing) retries = 0; if (!ask && !drawing) ask = finalFrame(draw); },   // (a new ask starts the tries of a failed hand-over again)
    /** Draws now, in this frame (the owner's frame moved the figure: its names move with it). */
    drawNow() { if (ask) return; draw(); },
    /**
     * Let go once and for good (R13): the queued frame is cancelled, the callbacks, records and the canvas are let go, the drawer is disposed,
     * and every later call does nothing (no frame is asked, nothing is drawn). Not a lost context: that keeps the picture and draws again.
     */
    dispose() {
      if (dead) return;
      dead = true;
      if (ask) cancelFrame(ask);
      ask = 0;
      const was = presented, lost = onLost;
      onFrame = onRest = onDrawn = onPresented = onLost = null;
      items.clear(); leads.clear(); looks.clear(); drawn = []; shown = []; drawnL = []; shownL = []; drawnN = shownN = drawnLN = shownLN = 0;
      model.remove(); dropLG();
      presented = false;
      if (was) lost?.();
      // alloc-rare: teardown, when the layer is let go, never in a frame
      for (const k of ['look', 'measure', 'mirror', 'arrow', 'decor', 'put', 'place', 'reset', 'hideAll', 'lead', 'view', 'paint', 'drawNow', 'attach', 'detach']) api[k] = NOOP;
      api.measure = () => ZERO;
      api.hasLook = () => false;
      api.leadOf = api.at = () => null;
      api.moving = () => false;
    },
  };
  return api;
}
