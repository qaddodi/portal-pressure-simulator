// Organs painted on the GPU from their own SVG (WebGL2, with the shape drawer shape-gl.js): an organ's group read once into a
// list of paint operations, each a shape (its path or ellipse, through its transforms) filled or stroked with the colour,
// gradient and opacity the page's own styles give it, clipped where the SVG clips it; the list painted back to front into
// a layer of the organ's own, which is laid on the stack with the group's opacity and its mask. The colours are read from the
// page (computed styles, gradient stops), never written twice, so every theme and state paints as the SVG does; the edges are
// the shape drawer's (within a few levels of the browser's, Mohammad's OK of 22 Oct).
//
// What it reads: path, ellipse, circle and rect; fill and stroke (solid colours, linear and radial gradients in the element's
// box or in user space, with stops, a gradientTransform, pad spread); fill-, stroke- and element opacity (an opacity on a group
// is carried to its shapes, which in these organs never overlap: the liver's two sheens); stroke width and caps (every joint is
// drawn round: the organs' outlines are round-joined, and the flank's miter joints are on a smooth curve, where they agree);
// clip-path (one shape, in the user space of the element it clips); a group mask whose content is itself such shapes (its
// luminance). Anything else (a dash, a filter, a nested mask, a focal point) and the organ is not read: null, and the caller
// keeps the organ's picture.

import { flattenPath, flattenCmds, ellipsePoly, polyBoxInto, polyMeshInto, prestartShapes } from './shape-gl.js';
import { prestart, linkProgram } from './gl-compile.js';
import { strHash } from './liver-geo.js';
import { readStyle, readLocalCTM } from './layout-snap.js';
import { sceneBegin, sceneStyle } from './scene-store.js';
import { getLive } from './live-style.js';
import { WARM_MS } from './warm-views.js';
import { STOPS, STOPS_CMAP, STOP_LOOK } from './stop-tokens.js';
// (The colour a clear writes, one array for every clear: none made per call, plan rev 2 §2.8.)
const CLEAR0 = new Float32Array(4);

const ID = [1, 0, 0, 1, 0, 0];
// (The colour channels a coverage is written to, one array each: the shape drawer reads them at once, never keeps them.)
const CH_R = [true, false, false, false], CH_G = [false, true, false, false], CH_B = [false, false, true, false];
const same6 = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3] && a[4] === b[4] && a[5] === b[5];
// A dashed stroke (the stent guide, the stented veins' mesh) cut into its dashes on the CPU once per outline and tolerance, each dash a
// stroke of its own with the stroke's caps, painted on the GPU like any other.
// A clip inside a clip (the colon's shades and fold, each cut to its own bowel loop inside the colon's own clip): painted with both,
// the inner one's coverage in the scratch's green and the outer one's in its blue, so the colon is painted on the GPU and not kept as
// a picture rasterized from the SVG copy.
const REFINE_OPS = 64;   // (shapes a refinement step hands the GPU at most: R18)
// (A computed dash pattern is read once per text: the same pattern and offset text give the very same object, which callers only read.
// A few at most; past that, started over.)
const DASHES = new Map();
const DASH_N = new Float64Array(16);   // (the numbers of the pattern being read)
// The numbers of "6px, 4px", "6 4", "3.5, 2" read in place (digits, a point, an optional "px", split by spaces and commas). Any other form (a
// percentage, an exponent, another unit) is not read: null, which the caller takes as a pattern the painter does not draw (the picture is kept).
const sepAt = (c) => c === 32 || c === 44 || c === 9 || c === 10;
export function parseDash(ds, offs) {   // alloc-rare: the pattern text is parsed the first time it is seen, then kept in DASHES
  const L = ds.length;
  let n = 0, sum = 0, anyPos = false;
  for (let i = 0; i < L;) {
    let c = ds.charCodeAt(i);
    if (sepAt(c)) { i++; continue; }
    let v = 0, fd = 0, seen = 0, dot = false;
    for (; i < L; i++) {
      c = ds.charCodeAt(i);
      if (c >= 48 && c <= 57) { v = v * 10 + (c - 48); seen++; if (dot) fd++; } else if (c === 46 && !dot) dot = true; else break;
    }
    if (!seen || n >= 16) return null;
    if (i < L && ds.charCodeAt(i) === 112 && ds.charCodeAt(i + 1) === 120) i += 2;
    if (i < L && !sepAt(ds.charCodeAt(i))) return null;
    if (fd) v /= 10 ** fd;
    DASH_N[n++] = v; sum += v; if (v > 0) anyPos = true;
  }
  if (!n || !anyPos) return null;
  const m = n % 2 ? 2 * n : n, a = new Array(m);   // alloc-rare: as above
  for (let k = 0; k < m; k++) a[k] = DASH_N[k % n];
  if (m === 2 * n && n % 2) sum *= 2;
  if (sum <= 1e-6) return null;
  return { a, off: parseFloat(offs) || 0 };   // alloc-rare: as above
}
const dashOf = parseDash;
/** A computed dash pattern → { a: lengths (user units, even count), off }, or null (a percentage, or nothing to draw). */
function readDash(cs) {
  const text = cs.strokeDasharray, offText = cs.strokeDashoffset;
  let m = DASHES.get(text);
  if (m === undefined) { if (DASHES.size >= 256) DASHES.clear(); DASHES.set(text, (m = new Map())); }   // alloc-rare: as above
  let d = m.get(offText);
  if (d === undefined) { if (m.size >= 64) m.clear(); d = dashOf(text, offText); m.set(offText, d); }
  return d;
}
/** Polylines cut into their dashes (SVG's rule: the pattern runs on along each subpath from its start, shifted by the offset). */
export function dashPolys(polys, { a, off }) {
  // alloc-rare: dashes are cut only where no mesh is kept for the shape at this pattern (it, its cap or its tolerance changed), never in a frame that kept it
  const P = a.reduce((t, v) => t + v, 0), out = [];
  for (const { pts, closed } of polys) {
    const n = pts.length / 2;
    if (n < 2) continue;
    // alloc-rare: dashes are cut only where no mesh is kept for the shape at this pattern (it, its cap or its tolerance changed), never in a frame that kept it
    const xs = [], ys = [];
    for (let k = 0; k < n; k++) { xs.push(pts[2 * k]); ys.push(pts[2 * k + 1]); }
    if (closed) { xs.push(pts[0]); ys.push(pts[1]); }
    // (Where in the pattern the subpath starts: the offset taken into one period.)
    let pos = ((off % P) + P) % P, i = 0;
    while (pos >= a[i]) { pos -= a[i]; i = (i + 1) % a.length; }
    // alloc-rare: dashes are cut only where no mesh is kept for the shape at this pattern (it, its cap or its tolerance changed), never in a frame that kept it
    let left = a[i] - pos, on = i % 2 === 0, cur = on ? [xs[0], ys[0]] : null;
    for (let k = 1; k < xs.length; k++) {
      let x0 = xs[k - 1], y0 = ys[k - 1], L = Math.hypot(xs[k] - x0, ys[k] - y0);
      const x1 = xs[k], y1 = ys[k];
      for (;;) {
        if (left >= L) { left -= L; if (on) cur.push(x1, y1); break; }
        const f = left / L, x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f;
        // alloc-rare: dashes are cut only where no mesh is kept for the shape at this pattern (it, its cap or its tolerance changed), never in a frame that kept it
        if (on) { cur.push(x, y); if (cur.length >= 4) out.push({ pts: new Float32Array(cur), closed: false }); cur = null; }
        L -= left; x0 = x; y0 = y;
        i = (i + 1) % a.length; left = a[i]; on = i % 2 === 0;
        // alloc-rare: dashes are cut only where no mesh is kept for the shape at this pattern (it, its cap or its tolerance changed), never in a frame that kept it
        if (on) cur = [x, y];
      }
    }
    // alloc-rare: dashes are cut only where no mesh is kept for the shape at this pattern (it, its cap or its tolerance changed), never in a frame that kept it
    if (cur && cur.length >= 4) out.push({ pts: new Float32Array(cur), closed: false });
  }
  return out;
}
// An even-odd fill (the tamponade balloon's latex rim, a ring cut out of its outline) painted on the GPU by its parity.

// Shapes the app makes itself (the liver's outline and its nodules, stage.js morphLiver), handed over as numbers as they are made:
// { d (the text written to the elements), cmds (shape-gl pathCmds' form), id }. A path whose `d` is still that text is cut from
// the numbers, named by the id, so the painter neither hashes nor parses the liver's thousands of characters (the nodules' tens of
// thousands) on any frame; any other `d` (written by anything else) is read from the text as before.
const SRC = new WeakMap();
// (A fixed shape's dashed meshes' names, by shape and pattern: objects, as a fixed shape's own name is the shape.)
const DASHED = new WeakMap();
let srcId = 0;
// (A source nothing is bound to any more is handed out again by the next shapeSource, with a new name: a liver easing makes one a
// frame, and each frame's is let go by the paths of the next. A source is its maker's to bind at once; once every element has moved
// on from it, it is no more to be used. Nothing keeps one by identity: the painter's keys carry its id.)
const FREE_SRC = [];
/** A shape made by the app: its `d` and its commands, under a name of its own. */
export const shapeSource = (d, cmds) => {
  const s = FREE_SRC.pop();
  if (s) { s.d = d; s.cmds = cmds; s.id = ++srcId; s.key = undefined; return s; }
  return { d, cmds, id: ++srcId, key: undefined, n: 0 };   // alloc-rare: only while none is free to hand out again (the first frames of an easing), then they go round
};
/** The element `el` now draws the shape `src` (its `d` written with src.d). */
export function bindShape(el, src) {
  if (!el) return;
  const was = SRC.get(el);
  if (was === src) return;
  SRC.set(el, src);
  if (src) src.n++;
  if (was && --was.n <= 0) FREE_SRC.push(was);   // alloc-rare: the free list grows only to the few sources in the air at once
}
/** The shape source of a path element whose `d` is still its text, or null. */
function srcOf(el) { const s = SRC.get(el); return s && el.getAttribute('d') === s.d ? s : null; }
/** Makes `src` (a record kept by the caller, made once by shapeSource) the shape { d, cmds } under a new name: no record is made for it. */
export function reshape(src, d, cmds) { src.d = d; src.cmds = cmds; src.id = ++srcId; src.key = undefined; return src; }
/** a ∘ b: b applied first (SVG matrices [a, b, c, d, e, f]). */
export const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
// The flattening tolerance (world units) for a shape drawn at `sc` device px per unit: a fifth of a pixel or finer, in powers of
// two, so a pinch keeps the same meshes until the zoom doubles. One rule for fills, strokes and clips alike: a clip given the
// exact 0.2 / scale cut its outline again, and built and uploaded a new mesh, at every step of a zoom (T02, 26 Oct).
export const detailTol = (sc) => Math.min(0.5, 2 ** Math.floor(Math.log2(0.2 / sc)));
export const inv = (m) => { const d = m[0] * m[3] - m[1] * m[2] || 1e-12; return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d]; };
/** a ∘ b written into `o` (which may be a or b): mul without the new array. Returns o. */
export function mulTo(o, a, b) {
  const a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5], b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3], b4 = b[4], b5 = b[5];
  o[0] = a0 * b0 + a2 * b1; o[1] = a1 * b0 + a3 * b1; o[2] = a0 * b2 + a2 * b3; o[3] = a1 * b2 + a3 * b3;
  o[4] = a0 * b4 + a2 * b5 + a4; o[5] = a1 * b4 + a3 * b5 + a5;
  return o;
}
/** The inverse of m written into `o` (which may be m): inv without the new array. Returns o. */
export function invTo(o, m) {
  const m0 = m[0], m1 = m[1], m2 = m[2], m3 = m[3], m4 = m[4], m5 = m[5], d = m0 * m3 - m1 * m2 || 1e-12;
  o[0] = m3 / d; o[1] = -m1 / d; o[2] = -m2 / d; o[3] = m0 / d; o[4] = (m2 * m5 - m3 * m4) / d; o[5] = (m1 * m4 - m0 * m5) / d;
  return o;
}

// (A colour string read once: the same string gives the same array again, which callers only read. A few hundred at most; past that, started over.)
const COLORS = new Map();
/** A CSS colour as computed ("rgb(…)", "rgba(…)", "color(srgb r g b / a)", "transparent") → [r, g, b, a] in 0..1, or null. The array is shared: not to be changed. */
export function parseColor(s) {
  if (typeof s === 'string') {
    const hit = COLORS.get(s);
    if (hit !== undefined) return hit;
    if (COLORS.size >= 512) COLORS.clear();
    const c = parseColorText(s);
    COLORS.set(s, c);
    return c;
  }
  return parseColorText(s);
}
function parseColorText(s) {
  s = String(s || '').trim();   // alloc-rare: a colour string is parsed the first time it is seen, then kept in COLORS
  if (s === 'transparent') return [0, 0, 0, 0];   // alloc-rare: as above
  let m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);   // alloc-rare: as above
  if (m) return [m[1] / 255, m[2] / 255, m[3] / 255, m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]];   // alloc-rare: as above
  m = s.match(/^color\(srgb\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/);   // alloc-rare: as above
  if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]];   // alloc-rare: as above
  return null;
}

const matAttr = (el) => { const t = el.transform?.baseVal; if (!t || !t.numberOfItems) return ID; const k = t.consolidate().matrix; return [k.a, k.b, k.c, k.d, k.e, k.f]; };   // (for chainM and the tests; the reading below writes into kept frames)
// An element's own transform as the page lays it, where a strict reading found a CSS one (its transform, translate, rotate or scale,
// about its transform-origin): read from the browser's own frames (cssLocal), kept until the element is read again. The page's
// styles that set one also ease it, and while they do the group is not read (stage.js syncOver), so it stands between two readings.
const CSS_M = new WeakMap();
let cssAny = false;   // (none taken yet: the organs' paints never look)
const matOf = (el) => (cssAny && CSS_M.get(el)) || matAttr(el);
// (An element's frame for the page's getter, one array per element rewritten at each ask: the painter reads it at once, never keeps it.)
const EM = new WeakMap();
/** An element's own frame, its CSS transform included where a strict reading took one. Kept per element, rewritten at the next ask. */
/** An element's own transform attribute written into `o` (or the identity, shared, where it has none): matAttr with no new array. Returns the matrix to read. */
export function matAttrTo(o, el) { const t = el.transform?.baseVal; if (!t || !t.numberOfItems) return ID; const k = t.consolidate().matrix; o[0] = k.a; o[1] = k.b; o[2] = k.c; o[3] = k.d; o[4] = k.e; o[5] = k.f; return o; }
/** elMat with no new array: the frame of `el` (its CSS one where a strict reading took one), written into `o` when it is its attribute's. Returns the matrix to read; not to be kept. */
export const elMatTo = (o, el) => (cssAny && CSS_M.get(el)) || matAttrTo(o, el);
export const elMat = (el) => {
  let o = EM.get(el);
  if (!o) EM.set(el, (o = [1, 0, 0, 1, 0, 0]));   // alloc-rare: one frame per element, made the first time the element is asked
  return matOfTo(o, el);
};
const CL_B = [1, 0, 0, 1, 0, 0], CL_I = [1, 0, 0, 1, 0, 0], CL_A = [1, 0, 0, 1, 0, 0], CL_M = [1, 0, 0, 1, 0, 0];
/** An element's own transform as the browser lays it (its frame (getCTM) undone by its parent's) written into `o`, or null where either is not known (o is then unchanged). */
function cssLocalTo(o, el) {
  const a = readLocalCTM(el), b = readLocalCTM(el.parentNode);
  if (!a || !b) return null;
  CL_B[0] = b.a; CL_B[1] = b.b; CL_B[2] = b.c; CL_B[3] = b.d; CL_B[4] = b.e; CL_B[5] = b.f;
  CL_A[0] = a.a; CL_A[1] = a.b; CL_A[2] = a.c; CL_A[3] = a.d; CL_A[4] = a.e; CL_A[5] = a.f;
  mulTo(CL_M, invTo(CL_I, CL_B), CL_A);
  for (let i = 0; i < 6; i++) if (!Number.isFinite(CL_M[i])) return null;
  return copy6(o, CL_M);
}
/** An element's own transform as the browser lays it: its frame (getCTM) undone by its parent's, or null where either is not known. */
/** `into`: the record this element had (the one cssLocal made for it before), written again in place. */
export function cssLocal(el, into = null) { return cssLocalTo(into || [1, 0, 0, 1, 0, 0], el); }   // alloc-rare: a caller with no record to write into gets one
// (A url(#id) text and its id, read once per text.)
const URLIDS = new Map();
const urlIdText = (v) => String(v || '').match(/url\(\s*["']?#([^)"']+)["']?\s*\)/)?.[1] || null;   // alloc-rare: a text is matched the first time it is seen, then kept in URLIDS
const urlId = (v) => {
  if (!v) return null;
  let r = URLIDS.get(v);
  if (r === undefined) { if (URLIDS.size >= 512) URLIDS.clear(); r = urlIdText(v); URLIDS.set(v, r); }   // alloc-rare: as above
  return r;
};
// (String.trim's white space, read from the end: whether a number's text ends in a percent sign, with no string made.)
const isWs = (c) => c === 32 || (c >= 9 && c <= 13) || c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff;
const endsPct = (v) => { let i = v.length - 1; while (i >= 0 && isWs(v.charCodeAt(i))) i--; return i >= 0 && v.charCodeAt(i) === 37; };
const num = (el, a, dflt) => { const v = el.getAttribute(a); if (v == null || v === '') return dflt; const n = parseFloat(v); return endsPct(v) ? n / 100 : n; };

// What the reading keeps of each element (read again at each reading, compared with what the element gives now, so the reading
// hands back the very same objects while nothing they were made from has changed and a new one only where something did): its
// chain of elements, its shape, its clip, the ops it gave and, for a group read as a root, its spec. Nothing handed out is ever
// written again; a change makes a new object and leaves the old one as it was, for whoever still holds it.
const ER = new WeakMap();
const newRec = () => ({ pch: null, ch: null, rch: null, path: null, pk: 0, p0: 0, p1: 0, p2: 0, p3: 0, pg: null, cl: null, fill: null, stroke: null, grp: null, spec: null, refs: null, rr: null, cssm: null });   // alloc-rare: one record per element, made the first time it is read
function rec(el) {
  let e = ER.get(el);
  if (!e) ER.set(el, (e = newRec()));   // alloc-rare: as above
  return e;
}
const sameN = (a, b) => a === b || (a !== a && b !== b);
const dup6 = (a) => [a[0], a[1], a[2], a[3], a[4], a[5]];   // alloc-rare: the copy an op or a clip keeps of a frame that changed (or is new), never one it already has

/** A gradient by id → { kind: 1 linear | 2 radial, box (objectBoundingBox units), gt (gradientTransform), p (x1 y1 x2 y2 | cx cy r), stops: [[offset, r, g, b, a]] }, or null. The same object while the gradient reads the same. */
let refsOut = null;
const GR = new WeakMap(), GRAD_RE = /^(linear|radial)Gradient$/;
const GGT = [1, 0, 0, 1, 0, 0], GP = new Float64Array(4), GS = new Float64Array(40);
/** A transform list written into o as one frame (the identity for none). */
function trTo(o, tr) {
  const t = tr?.baseVal;
  if (!t || !t.numberOfItems) return copy6(o, ID);
  const k = t.consolidate().matrix;
  o[0] = k.a; o[1] = k.b; o[2] = k.c; o[3] = k.d; o[4] = k.e; o[5] = k.f;
  return o;
}
// (A gradient stop's colour and opacity are the page's styles' to give, and they depend on the look alone (Light, Soft, Dark, Navy;
// Black as Dark, System as the device's light or dark) and on the circuit view where it differs: scripts/gen-stop-tokens.mjs measures
// the page for each and writes stop-tokens.js; tests/stop-tokens.test.js fails when the rules they read change. A stop is named by its
// class, style and presentation attributes, kept per stop with its row until one of them changes.)
const SYS_DARK = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
const SR = new WeakMap(), SR_WARNED = new Set();
/** The column of STOP_COLS the page's look takes now. */
function lookCol(doc) {
  const r = doc.documentElement;
  return STOP_LOOK[r.getAttribute('data-palette') || r.getAttribute('data-theme') || (SYS_DARK?.matches ? 'sys-dark' : 'sys-light')] ?? 0;
}
/** A stop's row in the table (its colour and opacity for each column), or null, saying so once, for a stop the table lacks. */
function stopRow(st, g) {
  const a = st.getAttribute('class') || '', b = st.getAttribute('style') || '', c = st.getAttribute('stop-color') || '', d = st.getAttribute('stop-opacity') || '';
  let e = SR.get(st);
  if (!e || e.a !== a || e.b !== b || e.c !== c || e.d !== d) {
    const sig = `${a}|${b}|${c}|${d}`;   // alloc-rare: a stop's signature is made the first time it is read, and again only where its class or style changed
    if (!STOPS[sig] && !SR_WARNED.has(sig)) { SR_WARNED.add(sig); console.error(`Organs on the GPU: the gradient stop "${sig}" (${g.id}) is not in stop-tokens.js: run npm run gen:stops`); }   // alloc-rare: as above
    e = { a, b, c, d, sig };   // alloc-rare: as above
    SR.set(st, e);
  }
  return (st.closest('.stage-wrap.cmap') && STOPS_CMAP[e.sig]) || STOPS[e.sig] || null;
}
function readGradient(doc, id) {
  refsOut?.add(id);
  const g = doc.getElementById(id);
  if (!g || !GRAD_RE.test(g.localName)) return null;
  if (g.getAttribute('href') || g.getAttribute('xlink:href')) return null;
  const sm = g.getAttribute('spreadMethod');
  if (sm && sm !== 'pad') return null;
  const box = (g.getAttribute('gradientUnits') || 'objectBoundingBox') === 'objectBoundingBox';
  if (g.gradientTransform) trTo(GGT, g.gradientTransform); else matOfTo(GGT, g);
  const linear = g.localName === 'linearGradient', np = linear ? 4 : 3;
  if (linear) { GP[0] = num(g, 'x1', 0); GP[1] = num(g, 'y1', 0); GP[2] = num(g, 'x2', 1); GP[3] = num(g, 'y2', 0); }
  else {
    GP[0] = num(g, 'cx', 0.5); GP[1] = num(g, 'cy', 0.5); GP[2] = num(g, 'r', 0.5);
    const fx = g.getAttribute('fx'), fy = g.getAttribute('fy');
    if ((fx != null && num(g, 'fx', 0) !== GP[0]) || (fy != null && num(g, 'fy', 0) !== GP[1])) return null;
  }
  let n = 0, last = 0;
  const kids = g.children;
  for (let i = 0; i < kids.length; i++) {
    const s = kids[i];
    if (s.localName !== 'stop') continue;
    const row = stopRow(s, g);   // (its colour and opacity from the table of the page's styles, never the cascade: stop-tokens.js)
    if (!row) return null;
    const c = parseColor(row[lookCol(doc) * 2]);
    if (!c) return null;
    const o = Math.min(1, Math.max(last, num(s, 'offset', 0)));
    last = o;
    if (n < 8) { const j = n * 5; GS[j] = o; GS[j + 1] = c[0]; GS[j + 2] = c[1]; GS[j + 3] = c[2]; GS[j + 4] = c[3] * (row[lookCol(doc) * 2 + 1] || 0); }
    n++;
  }
  if (!n || n > 8) return null;
  const kind = linear ? 1 : 2, R = GR.get(g);
  if (R && R.kind === kind && R.box === box && R.stops.length === n && R.p.length === np) {
    let same = same6(R.gt, GGT);
    for (let i = 0; same && i < np; i++) same = R.p[i] === GP[i];
    for (let i = 0; same && i < n; i++) { const s = R.stops[i], j = i * 5; same = s[0] === GS[j] && s[1] === GS[j + 1] && s[2] === GS[j + 2] && s[3] === GS[j + 3] && s[4] === GS[j + 4]; }
    if (same) return R;
  }
  // (A gradient made when it first reads, or when its stops, colours or box have changed: a theme, a gradient easing its stops.)
  const p = linear ? [GP[0], GP[1], GP[2], GP[3]] : [GP[0], GP[1], GP[2]], stops = [];   // alloc-rare: a gradient read the first time or changed, as above
  for (let i = 0; i < n; i++) { const j = i * 5; stops.push([GS[j], GS[j + 1], GS[j + 2], GS[j + 3], GS[j + 4]]); }   // alloc-rare: as above
  const out = { kind, box, gt: dup6(GGT), p, stops };   // alloc-rare: as above
  GR.set(g, out);
  return out;
}

// (A paint text read once: null for none, false for what is not readable, a { solid } for a colour, or the id of the gradient it names.
// A colour's paint object is one per colour array; a gradient's is one per gradient reading.)
const PAINT_TXT = new Map(), PSOL = new WeakMap(), GPAINT = new WeakMap();
function paintText(v) {   // alloc-rare: a text is read the first time it is seen, then kept in PAINT_TXT
  v = String(v || '').trim();   // alloc-rare: the text is read the first time it is seen, then kept in PAINT_TXT
  if (!v || v === 'none') return null;
  const id = urlId(v);
  if (id) return id;
  const c = parseColor(v);
  if (!c) return false;
  let p = PSOL.get(c);
  if (!p) PSOL.set(c, (p = { solid: c }));   // alloc-rare: one paint for each colour
  return p;
}
/** A paint (computed fill or stroke) → { solid: [r, g, b, a] } | { grad }, or null for none; false: not readable. */
function readPaintValue(doc, v) {
  let x = PAINT_TXT.get(v);
  if (x === undefined) { if (PAINT_TXT.size >= 512) PAINT_TXT.clear(); x = paintText(v); PAINT_TXT.set(v, x); }   // alloc-rare: as above
  if (typeof x !== 'string') return x;
  const grad = readGradient(doc, x);
  if (!grad) return false;
  let p = GPAINT.get(grad);
  if (!p) GPAINT.set(grad, (p = { grad }));   // alloc-rare: one paint for each gradient reading (the same while the gradient reads the same)
  return p;
}

/** The shape an element draws, in its own units: { el, d } (a path, read again at each paint), or { poly } (fixed), or null. One object per element while its numbers stand. */
function polyOf(E, kind, a, b, c, d) {
  if (E.pk === kind && sameN(E.p0, a) && sameN(E.p1, b) && sameN(E.p2, c) && sameN(E.p3, d)) return E.pg;
  E.pk = kind; E.p0 = a; E.p1 = b; E.p2 = c; E.p3 = d;
  // (Made when the element is first read, or its numbers change.)
  return (E.pg = { poly: kind === 3 ? [{ pts: new Float32Array([a, b, a + c, b, a + c, b + d, a, b + d]), closed: true }] : ellipsePoly(a, b, c, d) });   // alloc-rare: a fixed shape made the first time, or when its numbers change
}
function readGeom(el, E) {
  switch (el.localName) {
    case 'path': return E.path || (E.path = { el, d: true });   // alloc-rare: one per path element, the first time it is read
    case 'ellipse': return polyOf(E, 1, num(el, 'cx', 0), num(el, 'cy', 0), num(el, 'rx', 0), num(el, 'ry', 0));
    case 'circle': { const r = num(el, 'r', 0); return polyOf(E, 2, num(el, 'cx', 0), num(el, 'cy', 0), r, r); }
    case 'rect': {
      if (el.getAttribute('rx') || el.getAttribute('ry')) return false;
      return polyOf(E, 3, num(el, 'x', 0), num(el, 'y', 0), num(el, 'width', 0), num(el, 'height', 0));
    }
    default: return false;
  }
}

const KM = [1, 0, 0, 1, 0, 0], CMM = [1, 0, 0, 1, 0, 0], MT = [1, 0, 0, 1, 0, 0];
/** A clip-path by id, in the user space `me` (to the group's frame) of the element `E` it clips: { geom, m, km, chain, outer? }, or false. The same object while it reads the same. */
function readClip(doc, id, me, E, ch, outer) {
  const c = doc.getElementById(id);
  if (!c || c.localName !== 'clipPath' || (c.getAttribute('clipPathUnits') || 'userSpaceOnUse') !== 'userSpaceOnUse') return false;
  const kids = c.children;
  if (kids.length !== 1 || c.getAttribute('clip-path')) return false;
  const k = kids[0], geom = readGeom(k, rec(k));
  if (!geom) return false;
  matOfTo(KM, k); mulTo(CMM, me, KM);
  const was = E.cl;
  if (was && was.geom === geom && was.chain === ch && was.outer === (outer || undefined) && same6(was.m, CMM) && same6(was.km, KM)) return was;
  const cl = { geom, m: dup6(CMM), km: dup6(KM), chain: ch };   // alloc-rare: a clip made the first time, or when its shape, frame or chain changed
  if (outer) cl.outer = outer;
  return (E.cl = cl);
}

/**
 * An SVG group read for painting: { ops, opacity, mask } where each op is { geom, m (its units → the group's frame), kind:
 * 'fill' | 'stroke', paint ({ solid } | { grad }), alpha, w (stroke width), cap (0 butt, 1 round, 2 square), clip ({ geom, m }
 * | null) }, opacity the group's own and mask a group read the same way (its content), or null. Null when anything in it is
 * outside what the painter draws (the caller keeps the picture). `withMask`: read the group's mask (else it is left to the caller).
 * `nest`: a group inside it with a mask, or see-through (opacity below 1), is read as a group of its own, an op { kind: 'group',
 * ops, mask, chain, a0 } painted in a layer of its own and laid with its opacity and mask, as the browser lays it (without it such
 * a group's opacity is carried to its shapes, and a mask inside is not read). (The organs drawn as pictures, organs-gl bake: the
 * gut's see-through shades, the stomach's and duodenum's fades, each a group of overlapping shapes.)
 * Each element's reading is kept with what it was made from: read again, a group whose elements give the same gives the very same
 * spec (and ops, shapes, paints, clips), and only what changed is new.
 */
// (Why the last reading that came back null stopped: [reason, element], for the overlays' readout and tests.)
let lastFail = null;
/** Why the last readGroup that gave null stopped: [reason, element], or null. */
export const readFail = () => lastFail;
// `strict` (the figure's overlays, stage.js syncOver): visibility as the page computes it, and refused as well, so that such a group
// stays in the SVG rather than painted otherwise than the browser paints it: a CSS animation, a marker, a vector effect other than a
// non-scaling stroke (painted at its width in the page's px: the painter's cssPx), a paint order, crisp edges, or a stroke whose joins are not round on an outline with corners (the painter joins every stroke
// round). A CSS transform (the caudate's growth, about its origin) is taken as the browser lays it (cssLocal).
const REFS_TMP = new Set();
/** readGroup, and the ids of every gradient it read (a change to one of them changes what it reads). The same pair while spec and ids are the same. */
export function readGroupRefs(root, opt) {
  REFS_TMP.clear();
  refsOut = REFS_TMP;
  let spec;
  try { spec = readGroup(root, opt); } finally { refsOut = null; }
  const E = rec(root);
  let refs = E.refs;
  if (!refs || refs.size !== REFS_TMP.size) refs = null;
  else for (const id of REFS_TMP) if (!refs.has(id)) { refs = null; break; }
  if (!refs) E.refs = refs = new Set(REFS_TMP);   // alloc-rare: the ids a group read are kept once, and again only when the set of gradients it reads changed
  const rr = E.rr;
  if (rr && rr.spec === spec && rr.refs === refs) return rr;
  return (E.rr = { spec, refs });   // alloc-rare: made the first time, or when the spec or its gradients changed
}

// (One context for each reading in progress: a group's mask is read inside its walk.)
const CTX = [];
const newCtx = () => ({ root: null, doc: null, ok: true, withMask: true, nest: false, strict: false, shown: false });   // alloc-rare: the contexts of the nesting depth first reached (a handful, kept)
const LISTS = [];   // (the op lists being filled, one for each reading in progress and each nested group in progress)
const ME = [];      // (the frame of the element being walked, one for each depth of the walk)
let rd = 0, ld = 0, dp = 0;
const ownList = () => LISTS[ld++] || (LISTS[ld - 1] = []);   // alloc-rare: a list of the depth first reached, kept
const DEFS_RE = /^(defs|clipPath|mask|pattern|linearGradient|radialGradient|symbol|marker|style|title|desc|metadata)$/, META_RE = /^(title|desc|metadata)$/;
const CAPS = { butt: 0, round: 1, square: 2 };
const CSS_OK = { cssTransforms: true };
const MITER_RE = /[LlHhVvZz]/;
function fail(c, r, el) { c.ok = false; lastFail = [r, el]; }   // alloc-rare: a refusal ends the reading and the caller gives that group up (the picture or the SVG stays); it is read again only when a change is seen, never in a frame
/** The ops of a list, as the array they were last handed out in where they are the same ones. */
function settle(prev, list) {
  const n = list.length;
  if (prev && prev.length === n) { let i = 0; while (i < n && prev[i] === list[i]) i++; if (i === n) return prev; }
  const out = [];   // alloc-rare: a list made the first time, or when one of its ops changed
  for (let i = 0; i < n; i++) out.push(list[i]);
  return out;
}
const anyOwnO = (ch) => { for (let i = 0; i < ch.length; i++) if (ownO(ch[i])) return true; return false; };
function fillOp(E, el, geom, me, paint, alpha, cl, ch, a0, eo) {
  const p = E.fill;
  if (p && p.geom === geom && p.paint === paint && p.alpha === alpha && p.clip === cl && p.chain === ch && p.a0 === a0 && (p.eo === true) === eo && same6(p.m, me)) return p;
  const op = { geom, m: dup6(me), kind: 'fill', paint, alpha, clip: cl, el, chain: ch, a0 };   // alloc-rare: an op made the first time, or when something it was made from changed
  if (eo) op.eo = true;
  return (E.fill = op);
}
function strokeOp(E, el, geom, me, paint, alpha, w, cap, cl, ch, a0, dash, nss) {
  const p = E.stroke;
  if (p && p.geom === geom && p.paint === paint && p.alpha === alpha && p.w === w && p.cap === cap && p.clip === cl && p.chain === ch && p.a0 === a0 && (p.dash || null) === dash && (p.nss === true) === !!nss && same6(p.m, me)) return p;
  const op = { geom, m: dup6(me), kind: 'stroke', paint, alpha, w, cap, clip: cl, el, chain: ch, a0 };   // alloc-rare: as above
  if (dash) op.dash = dash;
  if (nss) op.nss = true;
  return (E.stroke = op);
}

// (An element's style: worked out in script from the page's rules (scene-store.js), never asked of the browser; the browser is asked only
// for an element the store cannot answer (a CSS transform, a rule under @container). A reading starts from what the page is now.)
const styleOf = (el) => sceneStyle(el) || readStyle(el);
export function readGroup(root, opt) {
  if (rd === 0) sceneBegin();
  const r0 = rd, d0 = dp, l0 = ld;
  const c = CTX[rd] || (CTX[rd] = newCtx());   // alloc-rare: as above
  rd++;
  c.root = root; c.doc = root.ownerDocument; c.ok = true;
  c.withMask = opt === undefined || opt.withMask === undefined ? true : opt.withMask;
  c.nest = opt === undefined || opt.nest === undefined ? false : opt.nest;
  c.strict = opt === undefined || opt.strict === undefined ? false : opt.strict;
  c.shown = opt === undefined || opt.shown === undefined ? false : opt.shown;   // (the root's own display: none is the plate's, not a hiding: the backdrop, stage.js BACKDROP_READ)
  try { return readRoot(c, root); } finally { rd = r0; dp = d0; ld = l0; }
}
function readRoot(c, root) {
  const doc = c.doc, E = rec(root), list = ownList();
  list.length = 0;
  // (Visibility as the picture's copy takes it, svg-inline.js inlineStyles: the element's own setting, else its parent's. The
  // computed one is hidden under the whole figure while the GPU draws it (.gl-plate); the liver's congestion, islands and gloss
  // are hidden with their own style in the imaging view, whatever their opacity.)
  // What eases on the page is written inline (an element's style or its own attribute: the liver parts' opacity, the cuts'
  // fill-opacity, the organs' transforms), so an op keeps its chain of elements down from the root and the painter reads those
  // from the chain at each paint (liveOf); what the page's styles give (read here, computed) stands until the group is read again.
  walk(c, root, ID, 1, null, 'visible', E.rch || (E.rch = []), list, 0);   // alloc-rare: a root's (empty) chain, the first time it is read
  if (!c.ok) return null;
  const rcs = styleOf(root);
  const opacity = parseFloat(rcs.opacity) || 0;
  CS_O.set(root, opacity);
  let mask = null;
  const mid = urlId(rcs.mask && rcs.mask !== 'none' ? rcs.mask : root.getAttribute('mask'));
  if (mid && c.withMask) {
    const mel = doc.getElementById(mid);
    if (!mel || mel.localName !== 'mask' || (mel.getAttribute('maskContentUnits') || 'userSpaceOnUse') !== 'userSpaceOnUse') { lastFail = ['mask units', root]; return null; }   // alloc-rare: a refusal, as fail
    mask = readGroup(mel);
    if (!mask) return null;
  } else if (mid) mask = undefined;
  const clipId = urlId(rcs.clipPath && rcs.clipPath !== 'none' ? rcs.clipPath : null);
  if (clipId) { lastFail = ['clip on the group', root]; return null; }   // alloc-rare: a refusal, as fail
  const s = E.spec, ops = settle(s && s.ops, list);
  if (s && s.ops === ops && s.opacity === opacity && s.mask === mask) return s;
  return (E.spec = { ops, opacity, mask, root });
}
// (`out`: the list the ops go to, the root's or a nested group's; `a0`: where in the chain the ops' opacities start, past a nested
// group's own, which is laid with its layer. The walk's frames are the depth's own, written in place.)
function walk(c, el, m, alpha, clip, vis, chain, out, a0) {
  if (!c.ok) return;
  dp++;
  walkEl(c, el, m, alpha, clip, vis, chain, out, a0);
  dp--;
}
function walkEl(c, el, m, alpha, clip, vis, chain, out, a0) {
  const root = c.root, doc = c.doc;
  // (Definitions kept inside an organ's own art (the colon's and the bowel's clips) paint nothing where they are.)
  if (el !== root && DEFS_RE.test(el.localName)) return;
  const cs = styleOf(el);
  if (cs.display === 'none' && !(c.shown && el === root)) return;
  const E = rec(el);
  if (c.strict) {
    vis = cs.visibility === 'collapse' ? 'hidden' : cs.visibility || 'visible';
    { const r = strictRefused(el, cs, CSS_OK); if (r) { fail(c, r, el); return; } }
    CSS_M.delete(el);
    if (cssTransformed(el, cs)) {
      const lm = cssLocalTo(E.cssm || (E.cssm = [1, 0, 0, 1, 0, 0]), el);   // alloc-rare: one frame for each element that has a CSS transform, the first time
      if (!lm) { fail(c, 'css transform', el); return; }
      CSS_M.set(el, lm); cssAny = true;
    }
  } else {
    const own = el.style?.visibility || el.getAttribute('visibility');
    if (own && own !== 'inherit') vis = own;
  }
  const o = parseFloat(cs.opacity);
  if (!(o > 0) && !ownO(el)) return;   // (at nothing by the page's styles: never shown; by its own setting: shown as it eases)
  if (cs.filter && cs.filter !== 'none') { fail(c, 'filter', el); return; }
  if (cs.mixBlendMode && cs.mixBlendMode !== 'normal') { fail(c, 'blend mode', el); return; }
  const masked = el !== root && ((cs.mask && cs.mask !== 'none') || !!el.getAttribute('mask'));
  const own2 = c.nest && el !== root && el.localName === 'g' && (masked || o < 1);
  if (masked && !own2) { fail(c, 'mask', el); return; }
  const me = ME[dp] || (ME[dp] = [1, 0, 0, 1, 0, 0]);   // alloc-rare: the frame of a depth of the walk, made when the walk first goes that deep, kept
  if (el === root) copy6(me, ID); else mulTo(me, m, matOfTo(MT, el));
  const a = el === root ? 1 : alpha * o;
  const ch = el === root ? chain : chainOf(E, chain, el);
  CS_O.set(el, o);
  let cl = clip;
  const cid = el === root ? null : urlId(cs.clipPath && cs.clipPath !== 'none' ? cs.clipPath : el.getAttribute('clip-path'));
  if (cid) {
    // (Two clips, one inside the other: both painted (NEST_CLIP), never three.)
    if (clip && clip.outer) { fail(c, 'nested clip', el); return; }
    cl = readClip(doc, cid, me, E, ch, clip);
    if (!cl) { fail(c, 'clip', el); return; }
  }
  const kids = el.children;
  if (own2) {
    // A group of its own: its shapes at their own opacities (from below it in the chain), its mask in its own frame.
    const l0 = ld, sub = ownList();
    sub.length = 0;
    for (let i = 0; i < kids.length; i++) walk(c, kids[i], me, 1, cl, vis, ch, sub, ch.length);
    if (!c.ok) { ld = l0; return; }
    let mk = null;
    if (masked) {
      const mel = doc.getElementById(urlId(cs.mask && cs.mask !== 'none' ? cs.mask : el.getAttribute('mask')));
      if (!mel || mel.localName !== 'mask' || (mel.getAttribute('maskContentUnits') || 'userSpaceOnUse') !== 'userSpaceOnUse') { fail(c, 'mask units', el); ld = l0; return; }
      mk = readGroup(mel);
      if (!mk) { fail(c, `mask content: ${lastFail?.[0]}`, el); ld = l0; return; }   // alloc-rare: a refusal, as fail
    }
    if (sub.length) out.push(groupOp(E, el, sub, mk, me, a, ch, a0));
    ld = l0;
    return;
  }
  if (el.localName === 'g' || el === root) { for (let i = 0; i < kids.length; i++) walk(c, kids[i], me, a, cl, vis, ch, out, a0); return; }
  if (META_RE.test(el.localName) || vis !== 'visible') return;
  const geom = readGeom(el, E);
  if (!geom) { fail(c, `element ${el.localName}`, el); return; }   // alloc-rare: a refusal, as fail
  if (geom.d && !el.getAttribute('d')) return;
  let dash = null;
  if (cs.strokeDasharray && cs.strokeDasharray !== 'none') {
    dash = readDash(cs);
    if (!dash) { fail(c, 'dash', el); return; }
  }
  if (c.strict && geom.d && cs.stroke && cs.stroke !== 'none' && (cs.strokeLinejoin || 'miter') !== 'round' && MITER_RE.test(el.getAttribute('d'))) { fail(c, 'miter join', el); return; }
  const eo = (cs.fillRule || 'nonzero') === 'evenodd';
  const fill = readPaintValue(doc, cs.fill), stroke = readPaintValue(doc, cs.stroke);
  if (fill === false || stroke === false) { fail(c, `paint ${fill === false ? cs.fill : cs.stroke}`, el); return; }   // alloc-rare: a refusal, as fail
  if (fill) {
    const fo = parseFloat(cs.fillOpacity) || 0;
    CS_FO.set(el, fo);
    if (a * fo > 0 || ownFO(el) || anyOwnO(ch)) out.push(fillOp(E, el, geom, me, fill, a * fo, cl, ch, a0, eo));
  }
  if (stroke) {
    const so = parseFloat(cs.strokeOpacity) || 0, w = parseFloat(cs.strokeWidth) || 0;
    CS_SO.set(el, so);
    if ((a * so > 0 || ownSO(el) || anyOwnO(ch)) && w > 0) {
      // (A non-scaling stroke (a slide's calipers): its width in the page's px, read only strictly.)
      out.push(strokeOp(E, el, geom, me, stroke, a * so, w, CAPS[cs.strokeLinecap] ?? 0, cl, ch, a0, dash, c.strict && cs.vectorEffect === 'non-scaling-stroke'));
    }
  }
}
/** The chain of elements down to `el` (its parent's chain and itself): the same array while the parent's chain is. */
function chainOf(E, chain, el) {
  if (E.ch && E.pch === chain) return E.ch;
  E.pch = chain;
  return (E.ch = [...chain, el]);   // alloc-rare: an element's chain, made the first time it is read or when its parent's chain is a new one (the tree changed)
}
function groupOp(E, el, ops, mask, me, alpha, ch, a0) {
  const p = E.grp, list = settle(p && p.ops, ops);
  if (p && p.ops === list && p.mask === mask && p.alpha === alpha && p.chain === ch && p.a0 === a0 && same6(p.m, me)) return p;
  return (E.grp = { kind: 'group', ops: list, mask, m: dup6(me), alpha, el, chain: ch, a0 });   // alloc-rare: a nested group made the first time, or when something it was made from changed
}

// What a strict reading refuses in an element's computed style (readGroup `strict`).
const MATRIX = /^matrix\(\s*([-\d.e]+)[\s,]+([-\d.e]+)[\s,]+([-\d.e]+)[\s,]+([-\d.e]+)[\s,]+([-\d.e]+)[\s,]+([-\d.e]+)\s*\)$/;
const TR_KEYS = ['translate', 'rotate', 'scale'], MARKER_KEYS = ['markerStart', 'markerMid', 'markerEnd'];
// (A computed matrix text and its six numbers, read once per text; null for any other form.)
const MATRICES = new Map();
function matrixText(t) {
  let r = MATRICES.get(t);
  if (r === undefined) {
    if (MATRICES.size >= 256) MATRICES.clear();
    const k = t.match(MATRIX);   // alloc-rare: a transform text is read the first time it is seen, then kept in MATRICES
    r = null;
    if (k) { r = new Float64Array(6); for (let i = 0; i < 6; i++) r[i] = +k[i + 1]; }   // alloc-rare: as above
    MATRICES.set(t, r);
  }
  return r;
}
// (`cssTransforms`: a CSS transform is not refused, readGroup takes it as the browser lays it, cssLocal.)
export function strictRefused(el, cs, opt) {
  if (cs.animationName && cs.animationName !== 'none') return 'animation';
  const t = cssTransformed(el, cs);
  if (t && !(opt && opt.cssTransforms)) return t;
  if (cs.vectorEffect && !/^(none|non-scaling-stroke)$/.test(cs.vectorEffect)) return 'vector-effect';
  for (let i = 0; i < 3; i++) { const k = MARKER_KEYS[i]; if (cs[k] && cs[k] !== 'none') return 'marker'; }
  if (cs.paintOrder && cs.paintOrder !== 'normal') return 'paint-order';
  if (cs.shapeRendering && !/^(auto|geometricPrecision)$/.test(cs.shapeRendering)) return 'shape-rendering';
  return '';
}
const AT = [1, 0, 0, 1, 0, 0];
/** Which CSS transform the page gives an element beyond its transform attribute ('transform', 'translate', 'rotate', 'scale'), or ''. */
export function cssTransformed(el, cs) {
  for (let i = 0; i < 3; i++) { const k = TR_KEYS[i]; if (cs[k] && cs[k] !== 'none') return k; }
  const t = cs.transform;
  if (t && t !== 'none') {
    // (The page's computed transform of an SVG element holds its transform attribute: the same matrix is the attribute's alone.)
    const k = matrixText(t);
    if (!k) return 'transform';
    trTo(AT, el.transform);
    for (let i = 0; i < 6; i++) if (Math.abs(k[i] - AT[i]) > 1e-6 * Math.max(1, Math.abs(AT[i]))) return 'transform';
  } else { const b = el.transform?.baseVal; if (b && b.numberOfItems) return 'transform'; }
  return '';
}

// The computed opacities read with a group (by element), for the chain elements whose own setting is not inline.
const CS_O = new WeakMap(), CS_FO = new WeakMap(), CS_SO = new WeakMap();
const ownV = (el, prop, attr) => { const h = getLive(el, prop); if (h != null && h !== '') return h; const v = el.style?.[prop]; if (v != null && v !== '') return v; const a = el.getAttribute(attr); return a != null && a !== '' ? a : null; };
const ownO = (el) => ownV(el, 'opacity', 'opacity') != null;
const ownFO = (el) => ownV(el, 'fillOpacity', 'fill-opacity') != null;
const ownSO = (el) => ownV(el, 'strokeOpacity', 'stroke-opacity') != null;
const clamp01 = (v) => Math.min(1, Math.max(0, parseFloat(v) || 0));
const liveO = (el, cs) => { const v = ownV(el, 'opacity', 'opacity'); return v != null ? clamp01(v) : cs.get(el) ?? 1; };
const livePO = (el, prop, attr, cs) => { const v = ownV(el, prop, attr); return v != null ? clamp01(v) : cs.get(el) ?? 1; };
/** A group's own opacity now (its root's own setting, else as read). */
export const specOpacity = (spec) => (spec.root ? liveO(spec.root, CS_O) : spec.opacity);
/** The frame of an element chain (each element's transform, outermost first) now. */
export const chainM = (chain) => { let m = ID; for (const el of chain) m = mul(m, matOf(el)); return m; };
/**
 * An op as it stands now: its frame (the chain's transforms), its alpha (the chain's opacities and its own fill or stroke
 * opacity) and its clip's frame, read from the page's inline settings, else as read with the group.
 */
export function liveOf(op) {
  if (!op.chain) return { m: op.m, alpha: op.alpha, cm: op.clip ? op.clip.m : null, cm2: op.clip?.outer ? op.clip.outer.m : null };
  let a = 1;
  for (let i = op.a0 || 0; i < op.chain.length; i++) a *= liveO(op.chain[i], CS_O);
  if (op.kind === 'group') return { m: chainM(op.chain), alpha: a, cm: null };
  a *= op.kind === 'fill' ? livePO(op.el, 'fillOpacity', 'fill-opacity', CS_FO) : livePO(op.el, 'strokeOpacity', 'stroke-opacity', CS_SO);
  const m = chainM(op.chain);
  const o = op.clip?.outer;
  return { m, alpha: a, cm: op.clip ? mul(op.clip.chain ? chainM(op.clip.chain) : op.m, op.clip.km) : null, cm2: o ? (o.chain ? mul(chainM(o.chain), o.km) : o.m) : null };
}

// liveOf for the painter's own use, written into a kept record (newLive) with its matrices in place: the same numbers, none of the new
// arrays and objects a frame's every op asked for. `hasCm`/`hasCm2`: whether the clip's frames are set (liveOf's cm/cm2 null or not).
const matTmp = [1, 0, 0, 1, 0, 0], matTmp2 = [1, 0, 0, 1, 0, 0];
function copy6(o, a) { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; o[3] = a[3]; o[4] = a[4]; o[5] = a[5]; return o; }
/** matOf(el) written into o. */
function matOfTo(o, el) {
  const c = cssAny && CSS_M.get(el);
  if (c) return copy6(o, c);
  const t = el.transform?.baseVal;
  if (!t || !t.numberOfItems) return copy6(o, ID);
  const k = t.consolidate().matrix;
  o[0] = k.a; o[1] = k.b; o[2] = k.c; o[3] = k.d; o[4] = k.e; o[5] = k.f;
  return o;
}
/** chainM(chain) written into o. */
function chainMTo(o, chain) {
  copy6(o, ID);
  for (const el of chain) mulTo(o, o, matOfTo(matTmp, el));
  return o;
}
const newLive = () => ({ m: [1, 0, 0, 1, 0, 0], cm: [1, 0, 0, 1, 0, 0], cm2: [1, 0, 0, 1, 0, 0], hasCm: false, hasCm2: false, alpha: 1 });   // alloc-rare: the pool's records, made as a frame first needs them (a handful, kept)
function liveInto(l, op) {
  if (!op.chain) {
    copy6(l.m, op.m); l.alpha = op.alpha;
    l.hasCm = !!op.clip; if (op.clip) copy6(l.cm, op.clip.m);
    l.hasCm2 = !!op.clip?.outer; if (op.clip?.outer) copy6(l.cm2, op.clip.outer.m);
    return l;
  }
  let a = 1;
  for (let i = op.a0 || 0; i < op.chain.length; i++) a *= liveO(op.chain[i], CS_O);
  if (op.kind === 'group') { chainMTo(l.m, op.chain); l.alpha = a; l.hasCm = false; l.hasCm2 = false; return l; }
  a *= op.kind === 'fill' ? livePO(op.el, 'fillOpacity', 'fill-opacity', CS_FO) : livePO(op.el, 'strokeOpacity', 'stroke-opacity', CS_SO);
  chainMTo(l.m, op.chain);
  const c = op.clip, o = c?.outer;
  l.alpha = a;
  l.hasCm = !!c;
  if (c) { if (c.chain) chainMTo(matTmp2, c.chain); else copy6(matTmp2, op.m); mulTo(l.cm, matTmp2, c.km); }
  l.hasCm2 = !!o;
  if (o) { if (o.chain) { chainMTo(matTmp2, o.chain); mulTo(l.cm2, matTmp2, o.km); } else copy6(l.cm2, o.m); }
  return l;
}

/** The element's paint's box in its own units (an objectBoundingBox gradient's), from its flattened outline. */
function boxOf(polys, out) { polyBoxInto(polys, out); out[2] -= out[0]; out[3] -= out[1]; return out; }

// ── GL ──
/**
 * The pixels the painter's targets may hold (each of them, five to seven with the stencil) beside a canvas of cw × ch: half
 * as much again as the canvas or a view's picture (stage.js schedulePlateView keeps each picture within 4.2e6), whichever
 * is larger. A picture's sides are kept so that with the canvas's they stay within it (stage.js), so the targets never pass it.
 */
export const targetRoom = (cw, ch) => 1.5 * Math.max(4.2e6, cw * ch);

const QUAD_VS = `#version 300 es
layout(location=0) in vec2 corner;
void main() { gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0); }`;
// One paint operation: the shape's coverage (scratch r) times its clip's (scratch g), painted with its colour or gradient.
const PAINT_FS = `#version 300 es
precision highp float;
uniform highp sampler2D cov;
uniform int useClip;
uniform int kind;           // 0 solid, 1 linear, 2 radial
uniform vec4 color;         // straight
uniform mat3 toGrad;        // device px (y down) → the gradient's own space
uniform vec4 gp;            // linear: x1 y1 x2 y2; radial: cx cy r
uniform float stopO[8];
uniform vec4 stopC[8];      // straight
uniform int nStops;
uniform float alpha;
uniform float H;
out vec4 o;
vec4 grad(float t) {
  if (t <= stopO[0]) return stopC[0];
  for (int i = 1; i < 8; i++) {
    if (i >= nStops) break;
    if (t <= stopO[i]) { float w = stopO[i] - stopO[i - 1]; return w > 0.0 ? mix(stopC[i - 1], stopC[i], (t - stopO[i - 1]) / w) : stopC[i]; }
  }
  return stopC[nStops - 1];
}
void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  vec4 cv = texelFetch(cov, ip, 0);
  float c = cv.r * (useClip >= 1 ? cv.g : 1.0) * (useClip == 2 ? cv.b : 1.0);
  if (c <= 0.0) discard;
  vec4 col = color;
  if (kind != 0) {
    vec2 g = (toGrad * vec3(gl_FragCoord.x, H - gl_FragCoord.y, 1.0)).xy;
    float t;
    if (kind == 1) { vec2 d = gp.zw - gp.xy; float L2 = dot(d, d); t = L2 > 0.0 ? dot(g - gp.xy, d) / L2 : 0.0; }
    else t = gp.z > 0.0 ? length(g - gp.xy) / gp.z : 1.0;
    col = grad(clamp(t, 0.0, 1.0));
  }
  float a = col.a * alpha * c;
  o = vec4(col.rgb * a, a);
}`;
// A painted group laid over the target: its pixels times its opacity and, with a mask, the mask's luminance there.
const LAY_FS = `#version 300 es
precision highp float;
uniform sampler2D src, mask;
uniform int useMask;
uniform float opacity;
out vec4 o;
void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  float k = opacity;
  if (useMask == 1) { vec4 m = texelFetch(mask, ip, 0); k *= dot(m.rgb, vec3(0.2125, 0.7154, 0.0721)); }
  o = texelFetch(src, ip, 0) * k;
}`;

// (Linked through gl-compile.js: the programs the figure's renderer started at its setup (prestartOrganPaint), else compiled here.)
function program(gl, vs, fs) {
  const p = linkProgram(gl, vs, fs);
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);   // alloc-rare: a program's uniform table, built once when it is linked
  for (let k = 0; k < n; k++) { const name = gl.getActiveUniform(p, k).name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, name); }   // alloc-rare: a program's uniform table, built once when it is linked
  return { p, u };   // alloc-rare: a program's uniform table, built once when it is linked
}

/** Starts the painter's programs and its shapes' on gl, nothing read (gl-compile.js prestart): createOrganPaint takes them up. */
export function prestartOrganPaint(gl) { prestart(gl, QUAD_VS, PAINT_FS); prestart(gl, QUAD_VS, LAY_FS); prestartShapes(gl); }

/**
 * The painter, on a WebGL2 context, drawing with `shape` (createShapeGL on the same context). paintGroup(spec, m, w, h, fbo)
 * lays the group read by readGroup, under `m` (the group's frame → device pixels, y down), over framebuffer `fbo` (w × h).
 */
export function createOrganPaint(gl, shape) {
  const paintP = program(gl, QUAD_VS, PAINT_FS), layP = program(gl, QUAD_VS, LAY_FS);
  const quad = gl.createBuffer(), vao = gl.createVertexArray();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  // Canvas-sized targets: the coverage scratch (with the stencil the fills need), and a group and a mask layer for each depth.
  const tex = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); return t; };   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  const target = () => ({ tex: tex(), fbo: gl.createFramebuffer(), on: false });   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  // (depths[d]: the group and mask layers of a group nested d deep, depths[0] the root's; made as a nesting first needs them.)
  const scratch = target(), stencil = gl.createRenderbuffer(), depths = [[target(), target()]], layers = depths[0];   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  // W × H: the target painted now (the canvas, or a picture's texture: organs-gl bake), drawn from the targets' bottom-left
  // corner; AW × AH: what the targets hold, grown so a picture of another size never makes them all again, within the room
  // the canvas gives them (targetRoom); BW × BH: the canvas, the live painting's size.
  let W = 0, H = 0, AW = 0, AH = 0, BW = 0, BH = 0, allocVer = 0;
  // (The picture job painting with the nested layers now (bakeJob): one at a time.)
  let holder = null;
  const allocOne = (t) => {   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, AW, AH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    t.on = true;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
  };
  function size(w, h, canvas = false) {
    W = w; H = h;
    if (canvas) { BW = w; BH = h; }
    if (w <= AW && h <= AH) return;
    // Each side grew on its own, so a wide picture and then a tall one left every target as wide as the one and as tall as the
    // other, up to 4096 × 4096 (67 MB each, five to seven of them with the stencil): on an iPad at 2×, over the vessels' own
    // buffers, Safari ended the page (Mohammad, 25 Oct: "Crashed on iPad", healthy, anatomy). Past the room the canvas gives
    // them they are made again at what is needed now: this size and the canvas's.
    const gw = Math.max(AW, w), gh = Math.max(AH, h);
    if (gw * gh <= targetRoom(BW, BH)) { AW = gw; AH = gh; } else { AW = Math.max(w, BW); AH = Math.max(h, BH); }
    allocVer++;   // (every target made again, what they held lost: a picture's job half done starts over)
    allocOne(scratch);
    // (Only the layers already made are made again: a mask layer is made when a masked group first needs it, see clearOne.)
    for (let d = 0; d < depths.length; d++) { if (depths[d][0].on || d === 0) allocOne(depths[d][0]); if (depths[d][1].on) allocOne(depths[d][1]); }
    gl.bindRenderbuffer(gl.RENDERBUFFER, stencil);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.STENCIL_INDEX8, AW, AH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, scratch.fbo);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.STENCIL_ATTACHMENT, gl.RENDERBUFFER, stencil);
    gl.clearBufferfi(gl.DEPTH_STENCIL, 0, 1, 0);
  }
  const depth = (d) => { while (depths.length <= d) { const pair = [target(), target()]; depths.push(pair); } return depths[d]; };   // alloc-rare: a nesting depth's pair of layers is made the first time a picture needs that depth (never in a frame of the live painting)
  // Meshes by shape and tolerance: an outline written to several paths (the liver's fill, its shades, its clip) is cut once a frame.
  let meshes = new Map(), meshesOld = new Map();   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  // (The pictures' meshes (bake): kept across frames, so a picture made again at the same detail cuts no outline again. Each mesh's
  // arrays stay on the GPU while it is kept (shape-gl.js), and are given back when it is let go.)
  // (Each kept mesh carries the picture that last used it (tick): past the cap, those no picture of the last two used are let go,
  // so a picture made at a new zoom never drops the meshes of the one being made.)
  let kept = new Map(), keeping = false, tick = 0;   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  const KEEP_CAP = 4000;
  // (A path's `d` named by its hash and length, worked out once a frame: the liver's is thousands of characters, the nodules'
  // tens of thousands, and an outline written to several paths is hashed once.)
  let dKeys = new Map();   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  const dKey = (d) => { let k = dKeys.get(d); if (!k) { k = `${d.length}:${strHash(d)}`; dKeys.set(d, k); } return k; };   // alloc-rare: the key of a `d` text, built when that text is new (a changed outline), kept after
  // A kept mesh no picture of the last two used, given back (its GPU arrays too, unless the live painting has it this frame).
  function evict() {
    for (const [k, v] of kept) if (v.tick < tick - 1) { kept.delete(k); if (!meshes.has(k) && !meshesOld.has(k)) shape.release(v.mesh); }
  }
  // (A path's name: its shape source's, else its text's hash. Kept per element while its `d` is the same text, so no key is built
  // again for an outline that did not change.)
  const pathKeys = new WeakMap();   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  const pathKey = (el) => {   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
    const s = srcOf(el);
    if (s) return s.key || (s.key = `n${s.id}`);   // alloc-rare: built once for each new shape source (the liver's, once per change of its outline), then kept on it
    const d = el.getAttribute('d') || '';
    let r = pathKeys.get(el);
    if (r && r.d === d) return r.key;
    if (!r) pathKeys.set(el, (r = { d: '', key: '' }));   // alloc-rare: one record per path element, the first time its key is asked
    r.d = d; r.key = dKey(d);
    return r.key;
  };
  // (A clip's name: its path's, or a fixed shape's own number (a rect or a circle read once), so two such clips under one frame are
  // never taken for one another: both were named '' before.)
  const polyIds = new WeakMap(); let polyN = 0;   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  const clipKey = (geom) => (geom.d ? pathKey(geom.el) : polyIds.get(geom) ?? (polyIds.set(geom, `p${++polyN}`), polyIds.get(geom)));   // alloc-rare: a fixed shape is named once, the first time it is asked
  // A mesh's name by shape, cap, tolerance and dash, kept per shape while those are the same (a frame that changed none of them
  // builds no string and finds no mesh by a new one).
  const meshKeys = new WeakMap();   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  function meshKey(geom, src, d, cap, tol, dash) {
    let r = meshKeys.get(geom);
    if (r && r.src === src && r.sid === (src ? src.id : 0) && r.d === d && r.tol === tol && r.cap === cap && r.dash === dash) return r.key;
    // (A dashed stroke's mesh is its dashes: named by its pattern too. A fixed shape dashed is named by the pattern on the shape.)
    const dk = dash ? `|${dash.a.join(',')}@${dash.off}` : '';   // alloc-rare: built when the shape, its cap, tolerance or dash changed, not in a frame that kept them
    let key = geom.d ? `${tol}|${cap}|${src ? `n${src.id}` : dKey(d)}${dk}` : geom;
    if (dash && !geom.d) { let m = DASHED.get(geom); if (!m) DASHED.set(geom, (m = new Map())); const k2 = `${cap}${dk}`; if (!m.has(k2)) m.set(k2, { k2 }); key = m.get(k2); }   // alloc-rare: a dashed fixed shape, named once per cap and pattern
    if (!r) meshKeys.set(geom, (r = { src: null, sid: 0, d: null, tol: 0, cap: 0, dash: null, key: null }));
    r.src = src; r.sid = src ? src.id : 0; r.d = d; r.tol = tol; r.cap = cap; r.dash = dash; r.key = key;
    return key;
  }
  // The mesh's outline cut at tolerance tol (dashed into its dashes where it has a pattern): only where no mesh is kept for the key.
  const flatOf = (src, geom, d, tol, dash) => {   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
    const polys = src ? flattenCmds(src.cmds, tol) : geom.d ? flattenPath(d, tol) : geom.poly;
    return dash ? dashPolys(polys, dash) : polys;
  };
  function meshOf(geom, cap, tol, dash = null) {
    const src = geom.d ? srcOf(geom.el) : null;
    const d = geom.d && !src ? geom.el.getAttribute('d') || '' : null;
    const key = meshKey(geom, src, d, cap, tol, dash);
    if (keeping) {
      let k = kept.get(key);
      if (!k) {
        if (kept.size >= KEEP_CAP) evict();
        const polys = flatOf(src, geom, d, tol, dash);
        kept.set(key, (k = { mesh: polyMeshInto(polys, cap, null, { tri: null, seg: null, nTri: 0, nSeg: 0 }), polys, box: boxOf(polys, [0, 0, 0, 0]), tick }));   // alloc-rare: a mesh is made when none is kept for the shape at this detail (an outline that changed, a zoom past a bucket)
      }
      k.tick = tick;
      return k;
    }
    let r = meshes.get(key) || meshesOld.get(key) || kept.get(key);
    if (!r) {
      const polys = flatOf(src, geom, d, tol, dash);
      r = { mesh: polyMeshInto(polys, cap, null, { tri: null, seg: null, nTri: 0, nSeg: 0 }), polys, box: boxOf(polys, [0, 0, 0, 0]) };
    }
    meshes.set(key, r);
    return r;
  }
  const scaleOf = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  // Device px per CSS px of what is painted now (the overlays' canvas: veins-gl overLay), for a non-scaling stroke, whose width is
  // in the page's px whatever its frame: in its own units, that width over the frame's scale (sc, device px per unit).
  let cssPx = 1;
  const wOf = (op, sc) => (op.nss ? (op.w * cssPx) / sc : op.w);   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  // A device box [x0, y0, x1, y1] (y down) of polylines under m, grown by `g` px, cut to the canvas, written into `o`: true, or false if
  // empty (o is then not to be read).
  function devBoxTo(o, box, m, g) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let c = 0; c < 4; c++) {
      const x = c & 1 ? box[0] + box[2] : box[0], y = c & 2 ? box[1] + box[3] : box[1];
      const u = m[0] * x + m[2] * y + m[4], v = m[1] * x + m[3] * y + m[5];
      x0 = Math.min(x0, u); y0 = Math.min(y0, v); x1 = Math.max(x1, u); y1 = Math.max(y1, v);
    }
    x0 = Math.max(0, Math.floor(x0 - g)); y0 = Math.max(0, Math.floor(y0 - g)); x1 = Math.min(W, Math.ceil(x1 + g)); y1 = Math.min(H, Math.ceil(y1 + g));
    if (!(x1 > x0 && y1 > y0)) return false;
    o[0] = x0; o[1] = y0; o[2] = x1; o[3] = y1;
    return true;
  }
  const scissor = (b) => { gl.enable(gl.SCISSOR_TEST); gl.scissor(b[0], H - b[3], b[2] - b[0], b[3] - b[1]); };   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  const mat = new Float32Array(9), stopO = new Float32Array(8), stopC = new Float32Array(32);   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  const drawQuad = () => { gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };   // alloc-rare: built once when the painter is made (once per GL context), never in a frame

  // Boxes met and joined: the *To forms write into `o` (which may be a) and return it (or null for no overlap); meet and join make new
  // ones, for the picture jobs' frames, which keep theirs.
  const meetTo = (o, a, c) => {   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
    if (!a || !c) return null;
    const r0 = Math.max(a[0], c[0]), r1 = Math.max(a[1], c[1]), r2 = Math.min(a[2], c[2]), r3 = Math.min(a[3], c[3]);
    if (!(r2 > r0 && r3 > r1)) return null;
    o[0] = r0; o[1] = r1; o[2] = r2; o[3] = r3;
    return o;
  };
  const joinTo = (o, a, c) => {   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
    if (!a || !c) return a || c;
    const r0 = Math.min(a[0], c[0]), r1 = Math.min(a[1], c[1]), r2 = Math.max(a[2], c[2]), r3 = Math.max(a[3], c[3]);
    o[0] = r0; o[1] = r1; o[2] = r2; o[3] = r3;
    return o;
  };
  const meet = (a, c) => { if (!a || !c) return null; const r = [Math.max(a[0], c[0]), Math.max(a[1], c[1]), Math.min(a[2], c[2]), Math.min(a[3], c[3])]; return r[2] > r[0] && r[3] > r[1] ? r : null; };   // alloc-rare: a picture job's frames keep their boxes (a nested group's step), never the live painting's
  const join = (a, c) => (a && c ? [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[2]), Math.max(a[3], c[3])] : a || c);   // alloc-rare: as meet, a nested group's box
  // The scratch the painting works in, each written in place and read at once (a call never keeps one past its own end, except where noted):
  // an op's boxes and frames (opAt), its clips' boxes, the boxes of a paint, a group and a lay.
  const BX = [0, 0, 0, 0], BX2 = [0, 0, 0, 0], PB = [0, 0, 0, 0], SB = [0, 0, 0, 0], SB2 = [0, 0, 0, 0], GB = [0, 0, 0, 0], LB = [0, 0, 0, 0], LW = [0, 0, 0, 0];   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  const OM = [1, 0, 0, 1, 0, 0], CM = [1, 0, 0, 1, 0, 0], CM2 = [1, 0, 0, 1, 0, 0], TG = [1, 0, 0, 1, 0, 0], TG2 = [1, 0, 0, 1, 0, 0], TGB = [1, 0, 0, 1, 0, 0];   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  const SZ = [0, 0];   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  // An op under m: its mesh, its clip's, and the device box it paints within (with its stroke, its clip), or null for none. The record
  // is ONE object, rewritten by each call (a group's box is then a new array): read what is needed before asking for another op.
  // (An op's inline settings are read once a frame: describe and the paint both ask.)
  const lives = new Map(), livePool = [];   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  let liveN = 0;
  function liveAt(op) {
    let l = lives.get(op);
    if (!l) { l = livePool[liveN] || (livePool[liveN] = newLive()); liveN++; liveInto(l, op); lives.set(op, l); }
    return l;
  }
  const forgetLives = () => { lives.clear(); liveN = 0; };   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  const AT = { om: OM, sh: null, cm: CM, csh: null, cm2: CM2, csh2: null, b: null, alpha: 0, mm: [1, 0, 0, 1, 0, 0] };   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  function opAt(op, m) {
    const lv = liveAt(op);
    if (op.kind === 'group') {
      let b = null;
      for (const k of op.ops) { const kb = opAt(k, m).b; b = join(b, kb && kb.slice()); }   // alloc-rare: a nested group (read only for a picture's job), never a live op
      AT.b = lv.alpha > 0 ? b : null; AT.alpha = lv.alpha; mulTo(AT.mm, m, lv.m);
      return AT;
    }
    // (The tolerance in powers of two, a fifth of a pixel or finer: a pinch reuses the meshes until the zoom doubles.)
    const om = mulTo(OM, m, lv.m), sc = scaleOf(om), tol = detailTol(sc);
    const sh = meshOf(op.geom, op.kind === 'stroke' ? op.cap : 0, tol, op.kind === 'stroke' ? op.dash || null : null);
    const grow = op.kind === 'stroke' ? (wOf(op, sc) / 2) * sc + 2 : 2;
    // (At no opacity it paints nothing: no box, so a change check sees it come and go.)
    let b = lv.alpha > 0 && devBoxTo(BX, sh.box, om, grow) ? BX : null, csh = null, csh2 = null;
    if (op.clip) {
      const cm = mulTo(CM, m, lv.cm);
      csh = meshOf(op.clip.geom, 0, detailTol(scaleOf(cm)));
      b = meetTo(BX, b, devBoxTo(BX2, csh.box, cm, 2) ? BX2 : null);
      if (op.clip.outer) {
        const cm2 = mulTo(CM2, m, lv.cm2);
        csh2 = meshOf(op.clip.outer.geom, 0, detailTol(scaleOf(cm2)));
        b = meetTo(BX, b, devBoxTo(BX2, csh2.box, cm2, 2) ? BX2 : null);
      }
    }
    AT.sh = sh; AT.csh = csh; AT.csh2 = csh2; AT.b = b; AT.alpha = lv.alpha;
    return AT;
  }
  // Painting as a job: frames of ops (a group's, a nested group's into its own layer, its mask's into the mask layer, and the
  // layer laid over what it belongs to once both are in), painted in order and resumable between any two ops. A picture
  // (organs-gl bake) is painted a few ms a frame however deep its groups nest (a nested group was painted whole within one
  // op: the gut's see-through shades, all at once). `ck`: the clip whose coverage the scratch's green holds (none after a pause:
  // the scratch is the live painting's between two steps), with its frame in `cmv` (and `ck2`, `cmv2` for the outer clip).
  const frameOf = (ops, m, into, within, d) => ({ ops, m, into, within, d, i: 0 });   // alloc-rare: the frames of a picture's job (a nested group's, a step of a bake), made as it begins
  /** Runs a job's frames until they are all painted (true) or, after at least one op, `until` (performance.now) has passed (false). */
  // (Bounded steps, recs_cgpt R18, 2 Nov 2026: each shape's paint is timed and its cost kept, so a step stops BEFORE an op that would
  // run past its deadline, not after it; a step also hands the GPU at most REFINE_OPS shapes, so a cheap CPU step cannot flood it.
  // The first op of a step always runs (progress). ?refbound=0: the old rule, stop only once past the deadline.)
  const opCost = new WeakMap();   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  let opMean = 0.05, layMean = 0.05;
  function runJob(job, until = Infinity) {
    let n = 0;
    job.ck = job.ck2 = null;
    const bound = until !== Infinity;
    while (job.frames.length) {
      const f = job.frames[job.frames.length - 1];
      if (!f.lay && f.i >= f.ops.length) { job.frames.pop(); continue; }
      // (recs-production-120hz §15: a layer's composite is a unit of its own, counted and held to the deadline like a shape, never run
      // ahead of the check; a group's setup (its targets cleared) is counted as an op below.)
      if (bound && n > 0) {
        if (n >= REFINE_OPS) return false;
        const guess = f.lay ? layMean : opCost.get(f.ops[f.i]) ?? opMean;
        if (performance.now() + guess > until) return false;
      }
      if (n > 0 && performance.now() > until) return false;
      if (f.lay) {
        job.frames.pop(); n++;
        const t0 = bound ? performance.now() : 0, y = f.lay;
        layOver(y[0], y[1], y[2], y[3], y[4], y[5]); job.ck = job.ck2 = null;
        if (bound) layMean += (performance.now() - t0 - layMean) * 0.2;
        continue;
      }
      const op = f.ops[f.i++];
      n++;
      if (op.kind === 'group') {
        // A nested group (readGroup nest): painted in its own layer, laid with its opacity and mask, as the browser lays it.
        const at = opAt(op, f.m), b = f.within ? meet(at.b, f.within) : at.b;
        if (!b) continue;
        const [g, k] = depth(f.d + 1);
        clearTargets(b, g, op.mask ? k : null);
        // (Last in, first painted: its shapes, then its mask, then the layer laid.)
        job.frames.push({ lay: [g, k, b, at.alpha, !!op.mask, f.into] });   // alloc-rare: a nested group's frames, in a picture's job only
        if (op.mask) job.frames.push(frameOf(op.mask.ops, at.mm.slice(), k.fbo, b, f.d + 1));   // alloc-rare: as above
        job.frames.push(frameOf(op.ops, f.m, g.fbo, b, f.d + 1));
        job.ck = job.ck2 = null;
        continue;
      }
      if (bound) {
        const t0 = performance.now();
        paintOp(op, f.m, f.into, f.within, job);
        const took = performance.now() - t0;
        opCost.set(op, took); opMean += (took - opMean) * 0.1;
      } else paintOp(op, f.m, f.into, f.within, job);
    }
    return true;
  }
  // (The live painting's one job and frame, rewritten by each paintOps: it never nests, and is done before the next begins.)
  const PJ = { frames: [], ck: null, ck2: null, cmv: [0, 0, 0, 0, 0, 0], cmv2: [0, 0, 0, 0, 0, 0] }, PF = { ops: null, m: null, into: null, within: null, d: 0, i: 0 };   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  /** Paints the ops of a group into the bound target (cleared by the caller), under m; only within `within` (a device box) if given. */
  // (d: how deep in nested groups the ops are, whose layers are depths[d + 1].)
  function paintOps(spec, m, into, within = null, d = 0) {
    PF.ops = spec.ops; PF.m = m; PF.into = into; PF.within = within; PF.d = d; PF.i = 0;
    PJ.frames.length = 0; PJ.frames.push(PF);
    runJob(PJ);
    PF.ops = PF.m = PF.into = PF.within = null;
  }
  /** One shape's op painted over `into` under m, within `within`. */
  function paintOp(op, m, into, within, job) {
    SZ[0] = W; SZ[1] = H;
    const at = opAt(op, m), { om, sh, cm, csh, cm2, csh2 } = at;
    const b = within ? meetTo(PB, at.b, within) : at.b;
    if (!b) return false;
    // The shape's coverage into the scratch's red, its clip's into green (kept while the next op has the same clip).
    gl.bindFramebuffer(gl.FRAMEBUFFER, scratch.fbo);
    gl.viewport(0, 0, W, H);
    const cv = job.cmv || (job.cmv = [0, 0, 0, 0, 0, 0]), cv2 = job.cmv2 || (job.cmv2 = [0, 0, 0, 0, 0, 0]);   // alloc-rare: a picture's job gets its two frames the first time it paints a clipped op
    const ck = op.clip ? clipKey(op.clip.geom) : null;
    const newClip = !!op.clip && !(ck === job.ck && same6(cv, cm));
    // (The outer clip of a clip inside a clip, in the blue, kept the same way.)
    const ck2 = csh2 ? clipKey(op.clip.outer.geom) : null;
    const newClip2 = !!csh2 && !(ck2 === job.ck2 && same6(cv2, cm2));
    // (A new clip's green is cleared over the clip's own box, with this op's: a later op with the same clip is cut to that box, so
    // it never reads the green outside it. It was the whole canvas, on every clipped group, every frame.)
    gl.colorMask(true, newClip, newClip2, false);
    let sb = newClip && devBoxTo(SB2, csh.box, cm, 2) ? joinTo(SB, b, SB2) : b;
    if (newClip2 && devBoxTo(SB2, csh2.box, cm2, 2)) sb = joinTo(SB, sb, SB2);
    scissor(sb);
    gl.clearBufferfv(gl.COLOR, 0, CLEAR0);
    gl.colorMask(true, true, true, true);
    gl.disable(gl.SCISSOR_TEST);
    if (op.kind === 'fill') shape.fill(sh.mesh, om, SZ, CH_R, false, !!op.eo);
    else shape.stroke(sh.mesh, om, SZ, CH_R, wOf(op, scaleOf(om)));
    if (newClip) { shape.fill(csh.mesh, cm, SZ, CH_G); job.ck = ck; copy6(cv, cm); }
    if (newClip2) { shape.fill(csh2.mesh, cm2, SZ, CH_B); job.ck2 = ck2; copy6(cv2, cm2); }
    // Painted over the target within the op's box.
    gl.bindFramebuffer(gl.FRAMEBUFFER, into);
    gl.viewport(0, 0, W, H);
    scissor(b);
    const U = paintP.u;
    gl.useProgram(paintP.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, scratch.tex);
    gl.uniform1i(U.cov, 0);
    gl.uniform1i(U.useClip, csh2 ? 2 : op.clip ? 1 : 0);
    gl.uniform1f(U.alpha, at.alpha);
    gl.uniform1f(U.H, H);
    const p = op.paint;
    if (p.solid) { gl.uniform1i(U.kind, 0); gl.uniform4fv(U.color, p.solid); }
    else {
      const g = p.grad;
      // device → the element's units → (its box) → the gradient's space (its transform undone).
      invTo(TG, om);
      if (g.box) { const bx = sh.box; TGB[0] = 1 / (bx[2] || 1); TGB[1] = 0; TGB[2] = 0; TGB[3] = 1 / (bx[3] || 1); TGB[4] = -bx[0] / (bx[2] || 1); TGB[5] = -bx[1] / (bx[3] || 1); mulTo(TG, TGB, TG); }
      mulTo(TG, invTo(TG2, g.gt), TG);
      mat[0] = TG[0]; mat[1] = TG[1]; mat[2] = 0; mat[3] = TG[2]; mat[4] = TG[3]; mat[5] = 0; mat[6] = TG[4]; mat[7] = TG[5]; mat[8] = 1;
      gl.uniformMatrix3fv(U.toGrad, false, mat);
      gl.uniform1i(U.kind, g.kind);
      gl.uniform4f(U.gp, g.p[0], g.p[1], g.p[2], g.p[3] ?? 0);
      stopO.fill(0); stopC.fill(0);
      for (let i = 0; i < g.stops.length; i++) { const s = g.stops[i]; stopO[i] = s[0]; stopC[4 * i] = s[1]; stopC[4 * i + 1] = s[2]; stopC[4 * i + 2] = s[3]; stopC[4 * i + 3] = s[4]; }
      gl.uniform1fv(U.stopO, stopO); gl.uniform4fv(U.stopC, stopC); gl.uniform1i(U.nStops, g.stops.length);
      gl.uniform4f(U.color, 0, 0, 0, 0);
    }
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    drawQuad();
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    return true;
  }

  /** The device box of everything a group paints under m (with its strokes), or null. It is one kept array: read at once. */
  function groupBox(spec, m) {
    let has = false;
    for (const op of spec.ops) {
      const b = opAt(op, m).b;
      if (!b) continue;
      if (has) joinTo(GB, GB, b); else { GB[0] = b[0]; GB[1] = b[1]; GB[2] = b[2]; GB[3] = b[3]; has = true; }
    }
    return has ? GB : null;
  }
  // What an op paints, as a string: what it is painted with (fixed while the spec lives: kept on the op) and where (its outline's
  // `d` and its frame, read now). Two frames with the same string paint the same pixels in the same box. The string is kept on the
  // op with the numbers and names it was built from, and built again only when one of them is not the same.
  const paintKey = (op) => op.pk || (op.pk = JSON.stringify([op.kind, op.w, op.cap, op.paint, op.eo ? 1 : 0, op.dash || 0]));   // alloc-rare: once for each op, the first time it is described
  const sigs = new WeakMap();   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  function opSig(op, m) {
    const lv = liveAt(op), pk = op.geom.d ? pathKey(op.geom.el) : '', ck = op.clip ? clipKey(op.clip.geom) : '', ok = op.clip?.outer ? clipKey(op.clip.outer.geom) : '';
    let r = sigs.get(op);
    if (r && r.a === lv.alpha && r.hc === lv.hasCm && r.hc2 === lv.hasCm2 && r.pk === pk && r.ck === ck && r.ok === ok && r.css === (op.nss ? cssPx : 0)
      && same6(r.m, lv.m) && (!lv.hasCm || same6(r.cm, lv.cm)) && (!lv.hasCm2 || same6(r.cm2, lv.cm2)) && same6(r.mm, m)) return r.str;
    if (!r) sigs.set(op, (r = { a: 0, hc: false, hc2: false, pk: '', ck: '', ok: '', css: 0, m: [0, 0, 0, 0, 0, 0], cm: [0, 0, 0, 0, 0, 0], cm2: [0, 0, 0, 0, 0, 0], mm: [0, 0, 0, 0, 0, 0], str: '' }));   // alloc-rare: one record per op, the first time it is described
    r.a = lv.alpha; r.hc = lv.hasCm; r.hc2 = lv.hasCm2; r.pk = pk; r.ck = ck; r.ok = ok; r.css = op.nss ? cssPx : 0;
    copy6(r.m, lv.m); if (lv.hasCm) copy6(r.cm, lv.cm); if (lv.hasCm2) copy6(r.cm2, lv.cm2); copy6(r.mm, m);
    return (r.str = `${paintKey(op)}|${lv.alpha}|${lv.m.join(',')}|${lv.hasCm ? lv.cm.join(',') : ''}${lv.hasCm2 ? `|${lv.cm2.join(',')}` : ''}|${m.join(',')}|${pk}|${ck}${op.clip?.outer ? `|${ok}` : ''}${op.nss ? `|${cssPx}` : ''}`);
  }
  // The mask's ops' strings are the op's own with a prefix, kept the same way.
  function maskSig(op, m) {
    const s = opSig(op, m), r = sigs.get(op);
    if (r.msrc !== s) { r.msrc = s; r.ms = `mask|${s}`; }
    return r.ms;
  }
  // The record a describe is writing (dd) and the entries written so far (dn).
  let dd = null, dn = 0;
  function put(sig, b) {
    const e = dd.ops[dn] || (dd.ops[dn] = ['', null]);   // alloc-rare: an entry is made the first time a record has this many ops
    e[0] = sig;
    if (b) { const o = dd.bx[dn] || (dd.bx[dn] = [0, 0, 0, 0]); o[0] = b[0]; o[1] = b[1]; o[2] = b[2]; o[3] = b[3]; e[1] = o; } else e[1] = null;   // alloc-rare: as above, the entry's box
    dn++;
  }
  function putNested(list, pre, m) {   // alloc-rare: nested groups are read only for a picture's job, never the live organs described here
    for (const op of list) {
      if (op.kind === 'group') { put(`${pre}group|${liveAt(op).alpha}|${liveAt(op).m.join(',')}`, opAt(op, m).b); putNested(op.ops, pre, m); if (op.mask) putNested(op.mask.ops, `${pre}gmask|`, m); }   // alloc-rare: nested groups are read only for a picture's job, never the live organs described here
      else put(`${pre}${opSig(op, m)}`, opAt(op, m).b);   // alloc-rare: nested groups are read only for a picture's job, never the live organs described here
    }
  }
  /**
   * The group under m described for a change check: its own string (opacity, whether masked) and, per op (the mask's after its
   * own), [string, device box]. The meshes it will paint are touched (kept for the frame). `out`: a record { sig, ops } to write the
   * description into, and to be returned (the stack keeps two for each group, one for the frame before: nothing is made). Without
   * one, a new record.
   */
  function describe(spec, m, out) {
    dd = out || { sig: '', ops: [] };   // alloc-rare: only for a caller that passes no record (the tests); the stack always does
    if (!dd.bx) dd.bx = [];   // alloc-rare: the record's box list, made with it
    dn = 0;
    let nested = false;
    for (const op of spec.ops) if (op.kind === 'group') { nested = true; break; }
    if (nested) putNested(spec.ops, '', m);
    else for (const op of spec.ops) { const s = opSig(op, m); put(s, opAt(op, m).b); }
    if (spec.mask) for (const op of spec.mask.ops) { const s = maskSig(op, m); put(s, opAt(op, m).b); }
    dd.ops.length = dn;
    const so = specOpacity(spec), sm = spec.mask ? 1 : 0;
    if (dd.so !== so || dd.sm !== sm) { dd.so = so; dd.sm = sm; dd.base = `${so}|${sm}`; }   // alloc-rare: built when the group's opacity or mask changed
    dd.sig = dd.base;
    const r = dd; dd = null;
    return r;
  }

  // The group's layer (and the mask's) cleared within b.
  function clearTargets(b, t1, t2 = null) {
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    clearOne(b, t1);
    if (t2) clearOne(b, t2);
  }
  function clearOne(b, t) {
    if (!t.on) allocOne(t);   // (a layer is given its room when first cleared for a group: the mask layers and the deeper pairs of a painter that never needs them stay one texel)
    if (t !== layers[0]) warmDeep();
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.viewport(0, 0, W, H);
    scissor(b); gl.clearBufferfv(gl.COLOR, 0, CLEAR0); gl.disable(gl.SCISSOR_TEST);
  }
  const clearIn = (b, withMask) => clearTargets(b, layers[0], withMask ? layers[1] : null);   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  // The group's layer laid over fbo within b, times opacity and, withMask, the mask layer's luminance.
  const lay = (b, opacity, withMask, fbo) => layOver(layers[0], layers[1], b, opacity, withMask, fbo);   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  function layOver(g, k, b, opacity, withMask, fbo) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, W, H);
    scissor(b);
    gl.useProgram(layP.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, g.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, k.tex);
    gl.uniform1i(layP.u.src, 0); gl.uniform1i(layP.u.mask, 1);
    gl.uniform1i(layP.u.useMask, withMask ? 1 : 0);
    gl.uniform1f(layP.u.opacity, opacity);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    drawQuad();
    gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
  }
  // (Perf D2: the mask layer and the nested pairs are given back once nothing has cleared them for WARM_MS. A plain idle timer: they are not
  // held in the global budget, so counting them cannot make the budget drop anything else mid gesture. Only ever from a timer, never within
  // a paint, and never while a picture's job holds them (a slide change's bakes clear them all the time; dropping and making them again
  // mid-change cost 385 ms frames, 3 Nov). The next first clear makes them again.)
  let deepT = 0, deepAt = 0;
  const deepBytesNow = () => { let n = 0; for (let d = 0; d < depths.length; d++) for (let j = 0; j < 2; j++) if ((d > 0 || j === 1) && depths[d][j].on) n++; return n * AW * AH * 4; };   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  const trimDeepNow = () => { if (holder) return false; for (let d = 0; d < depths.length; d++) for (let j = 0; j < 2; j++) if ((d > 0 || j === 1) && depths[d][j].on) trimOne(depths[d][j]); return true; };   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  const deepArm = (ms) => { clearTimeout(deepT); deepT = setTimeout(deepCheck, ms); deepT?.unref?.(); };   // alloc-rare: armed when the layers are first used after being given back
  function deepCheck() {   // alloc-rare: runs from a timer, a few times in a warm period
    deepT = 0;
    if (gl.isContextLost()) return;
    const idle = performance.now() - deepAt;
    if (idle < WARM_MS || !trimDeepNow()) deepArm(Math.max(1000, WARM_MS - idle));   // used lately, or a picture's job is painting with them: asked again
  }
  function warmDeep() {
    deepAt = performance.now();
    if (!deepT) deepArm(WARM_MS);
  }
  const trimOne = (t) => { t.on = false; gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); };   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  const dropOne = (t) => { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); };   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
  // The group's ops laid over fbo (the painter sized to w × h), within a device box if given.
  function layGroup(spec, m, w, h, fbo, within) {
    let win = within;
    if (!win) { LW[0] = 0; LW[1] = 0; LW[2] = w; LW[3] = h; win = LW; }
    const b = meetTo(LB, groupBox(spec, m), win);
    if (!b) return;
    clearIn(b, !!spec.mask);
    paintOps(spec, m, layers[0].fbo, b);
    // (A mask's content is in the user space of the element it masks: the group's frame.)
    if (spec.mask) paintOps(spec.mask, m, layers[1].fbo, b);
    lay(b, specOpacity(spec), !!spec.mask, fbo);
  }
  return {   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
    /** Device px per CSS px of the target painted next (1 unless set): a non-scaling stroke's width. */
    set cssPx(v) { cssPx = v > 0 ? v : 1; },   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
    get cssPx() { return cssPx; },   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
    /** Lays the group `spec` (readGroup) under m over framebuffer `fbo` of size w × h, with its opacity and mask. */
    paintGroup(spec, m, w, h, fbo, within = null) {
      size(w, h, true);
      layGroup(spec, m, w, h, fbo, within);
    },
    /**
     * The same group laid over a target of its own, `w` × `h` (a texture's framebuffer, cleared by the caller), for a picture of the
     * group to be laid again later (organs-gl keeps one of a live group that stands still). `m` is the group's frame already moved
     * by whole device pixels so that its box lies in the target; the canvas is `cw` × `ch`, and the painter is left sized to it.
     */
    paintGroupInto(spec, m, w, h, fbo, cw, ch) {
      size(cw, ch, true);
      size(w, h);
      layGroup(spec, m, w, h, fbo, null);
      W = cw; H = ch;
    },
    /**
     * A picture's group (organs-gl bake), laid over framebuffer `fbo` (w × h) as paintGroup lays it, as a job painted a few ops at a
     * time, its meshes kept across frames: step(until) paints on until that time (performance.now) and returns 'done' once all is
     * painted, 'more', 'wait' while another picture's job holds the nested layers (one at a time: they keep a half-painted group
     * between steps), or 'lost' when those layers were made again meanwhile (the canvas grew: the picture must start over). A group
     * with no opacity of its own and no mask is painted straight onto the picture (the same pixels: "over" onto what is under it);
     * any other in a layer of its own, laid once whole. drop() gives it up.
     */
    bakeJob(spec, m, w, h, fbo, pic = tick) {
      let job = null, ver = -1;
      const me = {   // alloc-rare: a picture's job and frames, made once per group of a picture (a patient change), not in a frame of the live painting
        step(until = Infinity) {
          if (holder && holder !== me) return 'wait';
          holder = me;
          size(w, h);
          keeping = true; tick = pic;
          try {
            if (!job) {
              ver = allocVer;
              if (spec.mask || specOpacity(spec) < 1) {
                const b = meet(groupBox(spec, m), [0, 0, w, h]);   // alloc-rare: a picture's job and frames, made once per group of a picture (a patient change), not in a frame of the live painting
                job = { frames: [] };   // alloc-rare: a picture's job and frames, made once per group of a picture (a patient change), not in a frame of the live painting
                if (b) {
                  const [g, k] = depth(1);
                  clearTargets(b, g, spec.mask ? k : null);
                  // (A mask's content is in the user space of the element it masks: the group's frame.)
                  job.frames.push({ lay: [g, k, b, specOpacity(spec), !!spec.mask, fbo] });   // alloc-rare: a picture's job and frames, made once per group of a picture (a patient change), not in a frame of the live painting
                  if (spec.mask) job.frames.push(frameOf(spec.mask.ops, m, k.fbo, b, 1));
                  job.frames.push(frameOf(spec.ops, m, g.fbo, b, 1));
                }
              } else job = { frames: [frameOf(spec.ops, m, fbo, [0, 0, w, h], 0)] };   // alloc-rare: a picture's job and frames, made once per group of a picture (a patient change), not in a frame of the live painting
            } else if (ver !== allocVer) { holder = null; return 'lost'; }
            if (!runJob(job, until)) return 'more';
            holder = null;
            return 'done';
          } finally { keeping = false; forgetLives(); dKeys.clear(); }
        },
        drop() { if (holder === me) holder = null; job = null; },
      };
      return me;
    },
    /** A new picture begun (organs-gl bake): its number, passed to its groups' jobs (bakeJob), for the kept meshes' ages. */
    beginPicture: () => ++tick,   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
    /** What it holds on the GPU: meshes with arrays there, and those the pictures keep. */
    stats: () => ({ meshes: shape.count?.() ?? 0, kept: kept.size }),   // alloc-rare: diagnostic counts for the ?perf readout, not read in a frame
    /** Lets go of the pictures' kept meshes (their GPU arrays too). */
    dropKept() { if (holder) return; for (const [k, v] of kept) if (!meshes.has(k) && !meshesOld.has(k)) shape.release(v.mesh); kept.clear(); },
    /** The group's device box under m (groupBox), and its description (describe), for the stack's change check. */
    box: (spec, m) => groupBox(spec, m),   // alloc-rare: built once when the painter is made (once per GL context), never in a frame
    describe,
    /**
     * A layer drawn by `draw(fbo)` (a picture of some organs, under its own program) laid over framebuffer `fbo` (w × h) times the
     * luminance of a mask group painted under m: the gut's cut and the stomach's see-through, made live while the layer stays a
     * picture. `box`: the layer's device box [x0, y0, x1, y1] (y down); `opacity`: the group's own, laid with the mask.
     */
    layMasked(draw, box, maskSpec, m, w, h, fbo, opacity = 1, within = null) {
      size(w, h, true);
      LB[0] = Math.max(0, Math.floor(box[0])); LB[1] = Math.max(0, Math.floor(box[1])); LB[2] = Math.min(W, Math.ceil(box[2])); LB[3] = Math.min(H, Math.ceil(box[3]));
      const b = within ? meetTo(LB, LB, within) : LB;
      if (!b || !(b[2] > b[0] && b[3] > b[1])) return;
      clearIn(b, true);
      gl.bindFramebuffer(gl.FRAMEBUFFER, layers[0].fbo);
      gl.viewport(0, 0, W, H);
      draw(layers[0].fbo, b);
      paintOps(maskSpec, m, layers[1].fbo, b);
      lay(b, opacity, true, fbo);
    },
    /** Ends a frame of painting: meshes not used in it are let go. */
    endFrame() {
      // (A mesh let go is given back to the GPU, unless a picture keeps it.)
      for (const [k, v] of meshesOld) if (!meshes.has(k) && !kept.has(k)) shape.release(v.mesh);
      const spent = meshesOld; meshesOld = meshes; meshes = spent; meshes.clear(); dKeys.clear(); forgetLives();
    },
    /** The bytes held by the layers a live frame does not need: the mask layer and every nested depth (made when a masked or nested group first needs them). */
    deepBytes: deepBytesNow,
    /** Gives those layers back (not while a picture's job is painting with them); a group that needs one again makes it at its first clear. */
    trimDeep() { return trimDeepNow(); },
    trim() { this.dropKept(); clearTimeout(deepT); deepT = 0; if (!AW) return; W = H = AW = AH = BW = BH = 0; trimOne(scratch); for (let d = 0; d < depths.length; d++) { trimOne(depths[d][0]); trimOne(depths[d][1]); } gl.bindRenderbuffer(gl.RENDERBUFFER, stencil); gl.renderbufferStorage(gl.RENDERBUFFER, gl.STENCIL_INDEX8, 1, 1); },
    dispose() {
      // (Every mesh's arrays given back with the shape drawer: those kept for pictures, the live frame's and the last frame's.)
      kept.clear(); meshes.clear(); meshesOld.clear(); holder = null;
      clearTimeout(deepT); deepT = 0;
      shape.dispose();
      dropOne(scratch); for (let d = 0; d < depths.length; d++) { dropOne(depths[d][0]); dropOne(depths[d][1]); }
      gl.deleteRenderbuffer(stencil); gl.deleteBuffer(quad); gl.deleteVertexArray(vao); gl.deleteProgram(paintP.p); gl.deleteProgram(layP.p);
    },
  };
}
