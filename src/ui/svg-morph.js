// One morph for a chart that is drawn again (sprint 1 Nov, "Animate chart changes smoothly"). A chart in the data card that
// changes (a new slide adds a point to the talk's trace, a curve is swapped for the next slide's) used to be built afresh and faded
// in over the old drawing, so for a moment both stood on the card, two lines, two sets of numbers, each at half strength. Now the
// new drawing takes over the old one's pieces: each line, dot, bar, gridline and word that is in both glides from where it stood to
// where it goes (position, length and size together, --d-surface on --ease-move); a piece only the old drawing has fades out where
// it stood (--d-small), a piece only the new one has fades in once the old words are going (a --d-flip delay, then --d-small).
//
//   morphSvg(prev, next)          prev: the <svg> on the card now, next: the new one, built but not in the page. true when it took
//                                 over (next is appended beside prev, which goes at the end); false when it did nothing at all
//                                 and the caller does what it always did (a crossfade): Reduce Motion, a drawing
//                                 in another coordinate system (a different viewBox), no piece in common, or a page that cannot.
//
// What is "the same piece": the same kind of element at the same place in the drawing's structure (its parents' first class and
// transform), with the same look (class, style, data-*, every attribute that is not geometry), and for words the same words;
// the n-th such piece of the old drawing is the n-th of the new. Anything else is not a pair, it fades: so a colour never changes
// part way, a word never turns into another, and a piece whose look changed crosses over (a line that turns from grey to red).
//   - Geometry that glides: x, y, x1..y2, cx, cy, r, rx, ry, width, height, d, points, transform, as numbers in the same pattern
//     of letters (a path with the same commands). A line that gains a point (M…L…L…) grows out of its old end; one that loses a
//     point folds into its new end. A pair whose geometry cannot be put side by side is not a pair.
//   - `data-nomorph` on an element, or on any group round it, is never paired: a part the chart moves itself (a ring that glides after
//     the slider, a word it places on every paint) is never written by two hands. It fades like any piece that has no partner.
//   - A fade is the Web Animations API's, over whatever opacity the piece has: a piece the stylesheet holds at less than full strength
//     (a ring that is `off`) is left to its own transition and never faded by this file.
//   - The clip paths in <defs> glide with their drawing, so a panel's corners and its fills stay together; nothing in <defs> fades.
// A morph begun while another is still going on the same card takes the drawing as it stands, mid-glide, as its old one, so a
// quick run of slides never jumps; the earlier morph's leaving words finish fading on their own.
// The clock is the eases' (frame.js easeNow: no leap after a long frame) and the writes come in the frame's late phase, after the
// chart's own paints, so a frame shows the glide and nothing else.
import { lateFrameFor, cancelFrame, easeNow } from './frame.js';
import { D_FLIP, D_SMALL, D_SURFACE, EASE_ARRIVE, EASE_MOVE, easeMove } from './ease.js';
import { removeSoon } from './class-soon.js';
import { setGeo, rawGeo, holdPts, dropPts, holdCmds, dropCmds, holdMat, dropMat } from './held-geo.js';
import { pathCmds, newCmds } from './shape-gl.js';
import { reduceMotionMQ } from './motion.js';

const nextLate = lateFrameFor('svg-morph');

const GEO = new Set(['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'd', 'points', 'transform']);
const LEAF = new Set(['line', 'path', 'rect', 'circle', 'ellipse', 'text', 'polyline', 'polygon']);
const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

// ── Numbers inside a string ─────────────────────────────────────────────────────────────────────────────────────────
/** A string split at its numbers: 'M1 2L3.5 4' → { glue: ['M', ' ', 'L', ' ', ''], nums: [1, 2, 3.5, 4] } (glue is one longer). */
export function splitNums(str) {
  const nums = [], glue = []; let last = 0;
  for (const m of String(str).matchAll(NUM)) { glue.push(str.slice(last, m.index)); nums.push(parseFloat(m[0])); last = m.index + m[0].length; }
  glue.push(String(str).slice(last));
  return { glue, nums };
}
// (Rounded to two decimals; the shortest form of that number is the one with no trailing zeros: 1.5, 12, 0.07.)
const fmt = (v) => String(Math.round(v * 100) / 100);
/** The numbers put back into their glue. */
export function joinNums(glue, nums) {
  let s = '';
  for (let i = 0; i < glue.length; i++) { s += glue[i]; if (i < nums.length) s += fmt(nums[i]); }
  return s;
}
const sameGlue = (a, b) => a.length === b.length && a.every((g, i) => g === b[i]);

/** The points of a path that is one 'M x y' and then 'L x y's (how the charts draw a polyline), else null. */
export function polyPoints(d) {
  const { glue, nums } = splitNums(d);
  if (nums.length < 2 || nums.length % 2) return null;
  const g = glue.map((s) => s.replace(/[\s,]+/g, ''));
  for (let i = 0; i < g.length; i++) if (g[i] !== (i === 0 ? 'M' : i === g.length - 1 || i % 2 ? '' : 'L')) return null;
  const pts = []; for (let i = 0; i < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
}
export function polyD(pts) {
  let s = '';
  for (let i = 0; i < pts.length; i++) { s += i ? 'L' : 'M'; s += fmt(pts[i][0]); s += ' '; s += fmt(pts[i][1]); }
  return s;
}

/** How a geometry attribute glides from `a` to `b`: { glue, from, to } over numbers in one pattern, { poly: true, from, to } for polylines
 *  of different lengths (the shorter one's last point repeated, so a new stretch grows out of the end and a lost one folds into it),
 *  or null when the two cannot be put side by side. Equal strings need no glide: { still: true }. */
export function tweenOf(attr, a, b) {
  if (a === b) return { still: true };
  const A = splitNums(a), B = splitNums(b);
  if (sameGlue(A.glue, B.glue) && A.nums.length === B.nums.length) {
    const tw = { glue: B.glue, from: A.nums, to: B.nums };
    // (A single number glides as a number, a polyline's points as a typed array: the frame writes no text. Anything else is text.)
    if (A.nums.length === 1 && attr !== 'transform' && attr !== 'd' && attr !== 'points') tw.one = true;
    else if (attr === 'points' ? A.nums.length >= 4 && A.nums.length % 2 === 0 : attr === 'd' && polyPoints(a) && polyPoints(b)) tw.flat = flatOf(A.nums, B.nums);
    else if (attr === 'd') tw.cmds = cmdsOf(a, b);   // (a curve: its commands, when the two have the same ones)
    else if (attr === 'transform') tw.mat = matOf(b, A.nums, B.nums);
    if (!tw.cmds) delete tw.cmds;
    if (!tw.mat) delete tw.mat;
    // (Anything that glides is held as numbers; a pattern none of those holds is not paired, its pieces fade.)
    return tw.one || tw.flat || tw.cmds || tw.mat ? tw : null;
  }
  if (attr === 'd') {
    const p = polyPoints(a), q = polyPoints(b);
    if (p && q) {
      const n = Math.max(p.length, q.length), pad = (pts) => Array.from({ length: n }, (_, i) => pts[Math.min(i, pts.length - 1)]);
      const from = pad(p), to = pad(q);
      return { poly: true, from, to, flat: flatOf(from.flat(), to.flat()) };
    }
  }
  return null;
}
// (A curve's glide: both ends parsed into commands; they glide as numbers when they are the same commands (an arc's flags too). Else null.)
function cmdsOf(a, b) {
  const A = pathCmds(a, newCmds()), B = pathCmds(b, newCmds());
  if (!A.n || A.n !== B.n || A.nv !== B.nv) return null;
  for (let i = 0; i < A.n; i++) if (A.op[i] !== B.op[i]) return null;
  if (A.op.subarray(0, A.n).includes(5)) {   // (an arc: its two flags cannot glide, they must be the same)
    for (let i = 0, k = 0; i < A.n; i++) {
      const o = A.op[i];
      if (o === 5) { if (A.v[k + 3] !== B.v[k + 3] || A.v[k + 4] !== B.v[k + 4]) return null; k += 7; } else k += o === 1 || o === 2 ? 2 : o === 3 ? 6 : o === 4 ? 4 : 0;
    }
  }
  return { from: A.v.slice(0, A.nv), to: B.v.slice(0, B.nv), cm: { op: B.op.slice(0, B.n), v: new Float64Array(B.nv), n: B.n, nv: B.nv } };
}
// A transform's glide as a matrix: the functions (translate, scale, rotate, skewX, skewY, matrix) with their number counts, so a frame works the
// matrix out from the glided numbers in place, as svg-gl.js's transformOf does from the text. Null for any other function.
const FN_CODE = { translate: 1, scale: 2, rotate: 3, skewX: 4, skewY: 5, matrix: 6 };
function matOf(b, fromNums, toNums) {
  const fns = [], cnt = [];
  for (const m of b.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const code = FN_CODE[m[1]], n = m[2].split(/[\s,]+/).filter(Boolean).length;
    if (!code || (code === 6 && n !== 6)) return null;
    fns.push(code); cnt.push(n);
  }
  if (!fns.length || cnt.reduce((x, y) => x + y, 0) !== toNums.length) return null;
  return { fns: Uint8Array.from(fns), cnt: Uint8Array.from(cnt), from: Float64Array.from(fromNums), to: Float64Array.from(toNums), buf: new Float64Array(toNums.length), m: new Float64Array(6) };
}
/** The matrix of the glide's numbers (mat.buf), written into mat.m: each function laid on the right of the ones before, as transformOf does. */
function composeMat(mat) {
  const { fns, cnt, buf, m } = mat;
  let a = 1, b = 0, c = 0, d = 1, e = 0, f = 0;
  for (let i = 0, k = 0; i < fns.length; k += cnt[i++]) {
    let na, nb, nc, nd, ne, nf;
    const x = cnt[i] > 0 ? buf[k] : 0, y = cnt[i] > 1 ? buf[k + 1] : 0;
    switch (fns[i]) {
      case 1: na = 1; nb = 0; nc = 0; nd = 1; ne = x || 0; nf = y || 0; break;
      case 2: na = cnt[i] > 0 ? x : 1; nb = 0; nc = 0; nd = cnt[i] > 1 ? y : na; ne = 0; nf = 0; break;
      case 3: {
        const r = ((x || 0) * Math.PI) / 180, co = Math.cos(r), si = Math.sin(r), cx = (cnt[i] > 1 ? buf[k + 1] : 0) || 0, cy = (cnt[i] > 2 ? buf[k + 2] : 0) || 0;
        na = co; nb = si; nc = -si; nd = co; ne = cx - co * cx + si * cy; nf = cy - si * cx - co * cy; break;
      }
      case 4: na = 1; nb = 0; nc = Math.tan(((x || 0) * Math.PI) / 180); nd = 1; ne = 0; nf = 0; break;
      case 5: na = 1; nb = Math.tan(((x || 0) * Math.PI) / 180); nc = 0; nd = 1; ne = 0; nf = 0; break;
      default: na = buf[k]; nb = buf[k + 1]; nc = buf[k + 2]; nd = buf[k + 3]; ne = buf[k + 4]; nf = buf[k + 5];
    }
    const ra = a * na + c * nb, rb = b * na + d * nb, rc = a * nc + c * nd, rd = b * nc + d * nd, re = a * ne + c * nf + e, rf = b * ne + d * nf + f;
    a = ra; b = rb; c = rc; d = rd; e = re; f = rf;
  }
  m[0] = a; m[1] = b; m[2] = c; m[3] = d; m[4] = e; m[5] = f;
  return m;
}
// (Both ends of a polyline's glide as typed arrays, and the one the frame writes in place.)
const flatOf = (from, to) => ({ from: Float64Array.from(from), to: Float64Array.from(to), buf: new Float64Array(from.length) });
/** Puts the glide at k on the piece: held as a number or as points, or (a curve, a transform) as its text. */
export function holdTween(el, attr, tw, k) {
  const f = tw.flat, c = tw.cmds, t = tw.mat;
  if (f) {
    const { from, to, buf } = f;
    for (let i = 0; i < buf.length; i++) buf[i] = from[i] + (to[i] - from[i]) * k;
    holdPts(el, buf, buf.length >> 1, attr === 'points' && (el.localName || el.tagName) === 'polygon');
  } else if (c) {
    const { from, to, cm } = c, v = cm.v;
    for (let i = 0; i < v.length; i++) v[i] = from[i] + (to[i] - from[i]) * k;
    holdCmds(el, cm);
  } else if (t) {
    const { from, to, buf } = t;
    for (let i = 0; i < buf.length; i++) buf[i] = from[i] + (to[i] - from[i]) * k;
    holdMat(el, composeMat(t));
  } else setGeo(el, attr, tw.from[0] + (tw.to[0] - tw.from[0]) * k);   // (a single number)
}
/** Lets go of what holdTween put on the piece: it shows the chart's own number again. */
function letGo(el, attr, tw) { if (tw.flat) dropPts(el); else if (tw.cmds) dropCmds(el); else if (tw.mat) dropMat(el); setGeo(el, attr, undefined); }

/** The glide's string at k (0 → a, 1 → b). */
export function tweenAt(tw, k) {
  // (Written straight into the string, a frame of the glide builds no point lists: the same text polyD and joinNums make of the tween's points.)
  let s = '';
  if (tw.poly) {
    const { from, to } = tw;
    for (let i = 0; i < from.length; i++) {
      const x = from[i][0], y = from[i][1];
      s += i ? 'L' : 'M'; s += fmt(x + (to[i][0] - x) * k); s += ' '; s += fmt(y + (to[i][1] - y) * k);
    }
    return s;
  }
  const { glue, from, to } = tw;
  for (let i = 0; i < glue.length; i++) { s += glue[i]; if (i < from.length) s += fmt(from[i] + (to[i] - from[i]) * k); }
  return s;
}

// ── Describing a drawing ────────────────────────────────────────────────────────────────────────────────────────────
const unref = (v) => v.replace(/url\(#[^)]*\)/g, 'url(#)');
// (A style as its declarations, without the opacity and visibility the morph itself writes, and with its numbers in one form: the browser
// writes a style back in its own, 12.00px as 12px.)
const styleOf = (el) => (el.getAttribute('style') || '').split(';').map((d) => d.trim()).filter((d) => d && !/^(?:opacity|visibility)\s*:/i.test(d))
  .map((d) => d.replace(/\s*:\s*/, ': ').replace(NUM, (m) => fmt(parseFloat(m)))).join('; ');
const firstClass = (el) => (el.getAttribute('class') || '').trim().split(/\s+/)[0] || '';
// What a group is, for the pieces inside it: its kind, its classes (less the ones that only say what state it is in), its data-* and its transform.
// So a gridline and a cut-off line, both in a group of class ptk-grid, are not mixed up, and a mark that becomes the last ("now") is still itself.
const VOLATILE = new Set(['now', 'on', 'off', 'in']);
const groupOf = (el) => {
  const t = el.localName || el.tagName, cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter((c) => c && !VOLATILE.has(c)).join('.');
  const data = el.getAttributeNames().filter((n) => n.startsWith('data-') && n !== 'data-nomorph').sort().map((n) => `${n}=${el.getAttribute(n)}`).join(',');
  return `${t}.${cls}${data ? `[${data}]` : ''}${el.getAttribute('transform') ? `@${el.getAttribute('transform')}` : ''}`;
};

/** Every piece of a drawing that can glide or fade, in document order: { el, key, geo, defs, skip }. key is what makes two pieces the
 *  same one (kind, place in the structure, look, and the words); geo the geometry attributes; defs: inside <defs> (glides, never fades);
 *  skip: kept out of the morph (data-nomorph). */
export function describe(svg) {
  const out = [];
  for (const el of svg.querySelectorAll('*')) {
    const tag = el.localName || el.tagName;
    if (!LEAF.has(tag)) continue;
    const path = []; let skip = false, defs = false;
    for (let p = el.parentNode; p && p !== svg; p = p.parentNode) {
      const t = p.localName || p.tagName;
      if (t === 'defs') defs = true;
      if (p.hasAttribute?.('data-nomorph')) skip = true;
      path.push(groupOf(p));
    }
    if (el.hasAttribute?.('data-nomorph')) skip = true;
    const geo = {}, look = [];
    for (const name of el.getAttributeNames()) {
      if (name === 'id' || name === 'style') continue;
      const v = el.getAttribute(name);
      if (GEO.has(name)) geo[name] = v; else look.push(`${name}=${unref(v)}`);
    }
    const st = styleOf(el); if (st) look.push(`style=${unref(st)}`);
    let words = '';
    if (tag === 'text') words = (el._t ?? el.textContent) + '\u0001' + [...el.children].map((c) => `${firstClass(c)}:${styleOf(c)}`).join('\u0002');
    out.push({ el, key: `${path.reverse().join('>')}>${tag}|${look.sort().join(';')}|${words}`, geo, defs, skip });
  }
  return out;
}

/** The morph of drawing A into drawing B (describe's lists): { pairs: [{ a, b, tweens: [[attr, tween]] }], oldOnly, newOnly }. The n-th piece
 *  of a key in A is the n-th in B; a pair whose geometry cannot be put side by side is no pair (both fade). */
export function planMorph(A, B) {
  const pool = new Map();
  for (const a of A) if (!a.skip) { let q = pool.get(a.key); if (!q) pool.set(a.key, q = []); q.push(a); }
  const pairs = [], newOnly = [], taken = new Set();
  for (const b of B) {
    if (b.skip) { if (!b.defs) newOnly.push(b); continue; }
    const a = pool.get(b.key)?.shift();
    const tweens = [];
    let ok = !!a;
    if (a) for (const attr of new Set([...Object.keys(a.geo), ...Object.keys(b.geo)])) {
      const x = a.geo[attr], y = b.geo[attr];
      const tw = x == null || y == null ? null : tweenOf(attr, x, y);
      if (!tw) { ok = false; break; }
      if (!tw.still) tweens.push([attr, tw]);
    }
    if (ok) { pairs.push({ a, b, tweens }); taken.add(a); } else if (!b.defs) newOnly.push(b);
  }
  const oldOnly = A.filter((a) => !a.defs && !taken.has(a));
  return { pairs, oldOnly, newOnly };
}

// ── The morph on the page ───────────────────────────────────────────────────────────────────────────────────────────
const active = new WeakMap();   // host → the morph going on in it
const reduced = () => typeof matchMedia === 'function' && reduceMotionMQ.matches;
const clamp01 = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v);
const canFade = (el) => typeof el.animate === 'function' && typeof getComputedStyle === 'function';
/** A piece's opacity now and whether an earlier fade is still on it: { o, flying }. */
const probe = (el) => {
  const o = parseFloat(getComputedStyle(el).opacity);
  return { o: Number.isFinite(o) ? o : 1, flying: (el.getAnimations?.().length || 0) > 0 };
};
const FULL = 0.999;

export function morphSvg(prev, next) {
  try {
    if (reduced() || !prev?.isConnected || !prev.parentNode || typeof prev.querySelectorAll !== 'function' || typeof next?.querySelectorAll !== 'function' || typeof prev.getAttributeNames !== 'function') return false;
    for (const a of ['viewBox', 'width', 'height', 'preserveAspectRatio']) if ((prev.getAttribute(a) || '') !== (next.getAttribute(a) || '')) return false;
    active.get(prev.parentNode)?.snapshot();   // (a glide still going on in this drawing is read as it stands now)
    const plan = planMorph(describe(prev), describe(next));
    if (!plan.pairs.length) return false;
    const host = prev.parentNode;
    active.get(host)?.release();
    const m = new Morph(host, prev, next, plan);
    active.set(host, m);
    m.start();
    return true;
  } catch (err) {
    // (Whatever went wrong, the caller crossfades as it always did.)
    console.error('[svg-morph]', err);
    return false;
  }
}

class Morph {
  constructor(host, prev, next, plan) {
    this.tickFn = () => this.tick();   // (made once: a frame of the glide asks for the next with it, no new closure)
    this.host = host; this.prev = prev; this.next = next; this.plan = plan;
    this.live = true; this.t0 = null; this.raf = 0; this.fades = []; this.k = 0;
  }
  start() {
    const { host, next, plan } = this;
    host.append(next);
    const fade = canFade(next);
    // (What each piece is doing now, read before anything is written: a piece caught mid-fade by an earlier morph carries on from the strength
    // it has; one the stylesheet holds at less than full strength is left to the stylesheet.)
    const gone = fade ? plan.oldOnly.map((a) => probe(a.el)) : [], came = fade ? plan.newOnly.map((b) => probe(b.el)) : [];
    const kept = fade ? plan.pairs.map(({ a, b }) => { const pa = probe(a.el); return pa.flying ? { from: pa.o, to: probe(b.el).o } : null; }) : [];
    if (fade) for (const { a } of plan.pairs) a.el.getAnimations?.().forEach((x) => x.cancel());
    // (The new drawing starts exactly as the old one stood: its pieces at the old pieces' places, the old ones put out of sight under them.)
    for (const { a, b, tweens } of plan.pairs) {
      for (const [attr, tw] of tweens) { if (b.defs || (tw.flat && b.el._pts) || (tw.cmds && b.el._cmds) || (tw.mat && b.el._mat)) { tw.flat = tw.cmds = tw.mat = null; }   // (a clip path in <defs> is read as text; a piece the chart holds itself keeps to text)
      holdTween(b.el, attr, tw, 0); tw.base = rawGeo(b.el, attr); }   // (held on the piece, no attribute written: the chart's own number stays under it)
      a.el.style.visibility = 'hidden';
    }
    // (A chart drawn on the GPU (svg-gl.js) draws each fade from its animation's own clock: noteFade.)
    const to = (el, from, o, delay, ms, ease) => { el.getAnimations?.().forEach((x) => x.cancel()); const an = el.animate([{ opacity: from }, { opacity: o }], { duration: ms, delay, easing: ease, fill: 'both' }); this.fades.push(an); host._svgGL?.noteFade(el, an, from, o, delay, ms, ease); };
    plan.oldOnly.forEach((a, i) => { const p = gone[i]; if (p && (p.flying || p.o >= FULL)) to(a.el, p.o, 0, 0, D_SMALL, EASE_MOVE); });
    plan.newOnly.forEach((b, i) => { const p = came[i]; if (p && p.o >= FULL) to(b.el, 0, 1, D_FLIP, D_SMALL, EASE_ARRIVE); });
    plan.pairs.forEach(({ b }, i) => { const k = kept[i]; if (k && k.to >= FULL) to(b.el, k.from, 1, 0, D_SMALL, EASE_ARRIVE); });
    host._svgGL?.wake(D_SURFACE + D_FLIP + D_SMALL + 80);   // (its GPU picture drawn every frame of the glide and the fades)
    this.raf = nextLate(this.tickFn);
  }
  /** Another morph takes this card over: this one stops moving the new drawing (it is that morph's old one now); its leaving words finish. */
  release() { this.live = false; }
  /** The points of a glide still going written out as text on their pieces, so a drawing read mid-glide (by the next morph) shows the numbers it shows now. */
  snapshot() {
    if (!this.live) return;
    for (const { b, tweens } of this.plan.pairs) for (const [attr, tw] of tweens) if ((tw.flat || tw.cmds || tw.mat) && !tw.dead) setGeo(b.el, attr, tweenAt(tw, this.k));
  }
  tick() {
    this.raf = 0;
    const now = easeNow();
    if (this.t0 == null) this.t0 = now;
    const t = now - this.t0, { plan } = this;
    const gone = !this.next.isConnected;
    if (this.live && !gone) {
      const e = this.k = easeMove(clamp01(t / D_SURFACE));
      for (const { b, tweens } of plan.pairs) for (const [attr, tw] of tweens) {
        // (Something else wrote this number since the glide began, the chart's own paint: it keeps it, and the glide lets go of it.)
        if (tw.dead) continue;
        if (rawGeo(b.el, attr) !== tw.base) { tw.dead = true; letGo(b.el, attr, tw); continue; }
        holdTween(b.el, attr, tw, e);
      }
    }
    if (gone || t >= D_SURFACE) { this.finish(); return; }
    this.raf = nextLate(this.tickFn);
  }
  finish() {
    const { plan } = this;
    if (this.live && this.next.isConnected) for (const { b, tweens } of plan.pairs) for (const [attr, tw] of tweens) if (!tw.dead) letGo(b.el, attr, tw);   // (the number the chart wrote shows again: the landing)
    for (const f of this.fades) f.cancel();
    removeSoon(this.prev);   // (taken out right after this task, before the next frame: a write between frames, not in one)
    cancelFrame(this.raf); this.raf = 0;
    if (active.get(this.host) === this) active.delete(this.host);
    this.live = false;
  }
}
