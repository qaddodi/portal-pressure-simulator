// A label's fade or colour ease, read once and run by the GPU's frame (1 Nov 2026; label-gl.js, ?labeltrack=0 off).
//
// Before, a label whose CSS fade, colour transition or script fade was running had its whole look read again from the page on every
// frame (getComputedStyle on the group, every line and run), which on a slide change made the browser work out the page's style again
// mid-frame for every label, and a colour ease drew its picture again each frame. Here the running animations are read once as they
// start (Element.getAnimations: their keyframes, timing and easing), and each frame's opacity and colours are worked out from them
// with no read of the page at all: the opacity goes to the GPU as the picture's alpha, the colours as the look's values.
//
// Only what is understood exactly is taken: the group's own opacity (CSS animations, transitions and script fades, in their
// composite order), and fill or stroke transitions on a line's runs or a pill, all on one clock. Anything else (a filter, a size, a
// custom property, a paused or repeating animation, an easing written as steps) leaves the label to be read each frame, as before.
// No DOM is touched here beyond the animation objects handed in, so tests can run it.

import { cubicBezier } from './ease.js';

const KW = { ease: [0.25, 0.1, 0.25, 1], 'ease-in': [0.42, 0, 1, 1], 'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1] };
const memo = new Map();
/** A CSS easing as a function of 0..1, or null when it is not one this follows exactly (steps, linear() with stops). */
export function easingOf(s) {
  if (typeof s === 'string' && memo.has(s)) return memo.get(s);   // (a string seen before: nothing built)
  s = String(s ?? 'linear').trim() || 'linear';   // alloc-rare: only an easing string not seen before; read as a label's animations start, never per frame
  if (memo.has(s)) return memo.get(s);
  let f = null;
  if (s === 'linear') f = (u) => u;   // alloc-rare: first sight of this easing string (memoised after)
  else if (KW[s]) f = cubicBezier(...KW[s]);   // alloc-rare: first sight of this easing string (memoised after)
  else {
    const m = /^cubic-bezier\(([^)]+)\)$/.exec(s);
    if (m) { const v = m[1].split(',').map(Number); if (v.length === 4 && v.every(Number.isFinite)) f = cubicBezier(...v); }   // alloc-rare: first sight of this easing string (memoised after)
  }
  if (memo.size >= 400) memo.clear();   // (bounded: an easing string is read from page styles, so a long session cannot grow it without end)
  memo.set(s, f);
  return f;
}

/** An animation's timing on the page's clock: { t0, delay, dur, ease, fill, es }, or null when it is not followed. */
export function timingOf(a, now) {
  const e = a?.effect, tm = e?.getTiming?.();
  if (!tm || (a.playbackRate ?? 1) !== 1 || a.playState === 'paused' || a.playState === 'idle') return null;
  if ((tm.iterations ?? 1) !== 1 || (tm.direction || 'normal') !== 'normal' || tm.iterationStart || (e.composite && e.composite !== 'replace')) return null;
  const dur = tm.duration, delay = tm.delay || 0, ct = a.currentTime;
  if (typeof dur !== 'number' || !(dur >= 0) || !Number.isFinite(delay) || (ct != null && typeof ct !== 'number')) return null;
  const ease = easingOf(tm.easing);
  if (!ease) return null;
  return { t0: now - (ct ?? 0), delay, dur, ease, fill: String(tm.fill || 'none'), es: String(tm.easing || 'linear') };   // alloc-rare: read once as a label's animation starts (capture), then followed by progressAt with no read
}
/** Where a timing stands at `now`, after its easing (0..1), or null where it has no effect (outside it, with no fill there). */
export function progressAt(t, now) {
  const l = now - t.t0;
  if (l < t.delay) return /backwards|both/.test(t.fill) ? 0 : null;
  if (l >= t.delay + t.dur) return /forwards|both/.test(t.fill) ? 1 : null;
  return t.ease((l - t.delay) / t.dur);
}
const META = new Set(['offset', 'computedOffset', 'easing', 'composite']);
// (What a label's look does not read, so an animation of it changes nothing drawn here: a move, a turn, a visibility.)
const HARMLESS = new Set(['transform', 'translate', 'scale', 'rotate', 'visibility', 'pointerEvents', 'cursor']);
/** A keyframe list for `prop`: [{ o, v, ease }] from offset 0 to 1, or null. */
export function keysOf(kf, prop) {
  if (!kf?.length) return null;
  const out = [];   // alloc-rare: read once as a label's animation starts (capture), then followed by trackAt with no read
  for (const k of kf) {
    if (k.composite && k.composite !== 'auto' && k.composite !== 'replace') return null;
    const v = k[prop];
    if (v == null || v === '') return null;
    const o = k.computedOffset ?? k.offset, ease = easingOf(k.easing);
    if (!Number.isFinite(o) || !ease) return null;
    out.push({ o, v, ease });   // alloc-rare: read once as a label's animation starts (capture)
  }
  if (out.length < 2 || out[0].o !== 0 || out[out.length - 1].o !== 1) return null;
  return out;
}
/** The keyframes' value at progress p. */
function along(keys, p) {
  let i = 0;
  while (i < keys.length - 2 && p >= keys[i + 1].o) i++;
  const a = keys[i], b = keys[i + 1], span = b.o - a.o;
  return a.v + (b.v - a.v) * (span > 0 ? a.ease(Math.min(1, Math.max(0, (p - a.o) / span))) : 1);
}
const isTransition = (a) => a && 'transitionProperty' in a;

/**
 * The running animations of a label (or a mark) as a track, or null when one of them is not followed exactly.
 *   anims: Element.getAnimations() of it (composite order); opEl: the element whose opacity is followed; paintOk(el): whether a
 *   fill or stroke ease on el is followed (a run or a pill: the parts whose own colour is read); now: performance.now().
 * Returns { ops: [{ t, keys }] (opacity layers, lowest first), under, paint: { t, ease, pairs: [{ el, prop, from, to }] } | null, end }.
 *   under: the opacity beneath the animations, when the caller knows it (the optional 5th argument); else null, and where no layer
 *   contributes (a delay with no backwards fill, past the end with no forwards fill) trackAt gives op null: the caller keeps its own.
 */
export function trackOf(anims, opEl, paintOk, now, under = null) {
  const ops = [], pairs = [];   // alloc-rare: a track is read once as a label's animations start (capture, only when the label is new or dirty), then followed by trackAt
  let paintT = null, paintEase = null, paintES = '', end = -Infinity, opTrans = false, opAnim = false;
  for (const a of anims || []) {   // alloc-rare: as above, read once at an animation's start
    const e = a?.effect, el = e?.target;
    if (!e || !el || e.pseudoElement) return null;
    let kf;
    try { kf = e.getKeyframes(); } catch { return null; }
    const props = new Set();   // alloc-rare: as above, read once at an animation's start
    for (const k of kf) for (const p in k) if (!META.has(p)) props.add(p);
    let t = null;
    for (const p of props) {
      if (HARMLESS.has(p) || (p === 'opacity' && el !== opEl)) continue;
      t ||= timingOf(a, now);
      if (!t) return null;
      if (p === 'opacity') {
        const keys = keysOf(kf, p);
        if (!keys) return null;
        for (const k of keys) { k.v = parseFloat(k.v); if (!Number.isFinite(k.v)) return null; }
        if (isTransition(a)) opTrans = true; else opAnim = true;
        ops.push({ t, keys });   // alloc-rare: as above, read once at an animation's start
      } else if ((p === 'fill' || p === 'stroke') && paintOk(el) && isTransition(a)) {
        const keys = keysOf(kf, p);
        if (!keys || keys.length !== 2 || !rgbOf(keys[0].v) || !rgbOf(keys[1].v)) return null;
        if (pairs.some((q) => q.el === el && q.prop === p)) return null;   // alloc-rare: as above, read once at an animation's start
        // (Every colour ease on one clock: a pill and its words, or a whole line, ease together.)
        if (!paintT) { paintT = t; paintEase = keys[0].ease; paintES = String(kf[0].easing || 'linear'); }   // alloc-rare: as above, read once at an animation's start
        else if (Math.abs(paintT.t0 - t.t0) > 2 || paintT.delay !== t.delay || paintT.dur !== t.dur || paintT.es !== t.es || paintT.fill !== t.fill || paintES !== String(kf[0].easing || 'linear')) return null;   // alloc-rare: as above, read once at an animation's start
        pairs.push({ el, prop: p, from: keys[0].v, to: keys[1].v });   // alloc-rare: as above, read once at an animation's start
      } else return null;
    }
    if (t) end = Math.max(end, t.t0 + t.delay + t.dur);
  }
  // (A transition and an animation of the opacity at once: which wins is the cascade's, not followed here.)
  if (opTrans && opAnim) return null;
  // alloc-rare: as above, read once at an animation's start
  return { ops, under: ops.length && Number.isFinite(under) ? under : null, paint: pairs.length ? { t: paintT, ease: paintEase, pairs } : null, end };
}
/**
 * Learn a track's `under` from a read of the page taken while none of its opacity layers has an effect (a delayed fade before it
 * starts, a fade with no fill after it ends): that read is then the page's own opacity. Returns whether `under` is known.
 */
export function settleUnder(m, now, read) {
  if (!m.ops.length || m.under != null) return m.under != null;
  for (let i = 0; i < m.ops.length; i++) if (progressAt(m.ops[i].t, now) != null) return false;
  if (!Number.isFinite(read)) return false;
  m.under = read;
  return true;
}
const AT = { op: null, w: null };
/**
 * A track at `now`: { op: the opacity (null: not animated), w: the colours' share from `from` to `to` (null: none) }.
 * The returned object is one kept object, written anew by every call: read it before the next call, do not keep it.
 */
export function trackAt(m, now) {
  let op = null, w = null;
  if (m.ops.length) {
    op = m.under;
    for (let i = m.ops.length - 1; i >= 0; i--) {
      const L = m.ops[i], p = progressAt(L.t, now);
      if (p == null) continue;
      op = along(L.keys, p);
      break;
    }
  }
  if (m.paint) {
    const p = progressAt(m.paint.t, now);
    w = p == null ? (now - m.paint.t.t0 < m.paint.t.delay ? 0 : 1) : m.paint.ease(Math.min(1, Math.max(0, p)));
  }
  AT.op = op; AT.w = w;
  return AT;
}

const RGB = new Map();   // (colour string → its channels, or null; the strings of a page's few eases, so it stays small)
/**
 * A computed colour as straight RGBA (0..255, 0..1 alpha), or null when it is not written as rgb()/rgba().
 * The array is the memo's own, shared by every caller of that string: read it, do not change or keep it for writing.
 */
export function rgbOf(c) {
  const str = typeof c === 'string';
  if (str) { const hit = RGB.get(c); if (hit !== undefined) return hit; }
  const v = parseRgb(c);
  if (str) { if (RGB.size >= 256) RGB.clear(); RGB.set(c, v); }
  return v;
}
function parseRgb(c) {
  const m = /^rgba?\(([^)]+)\)$/.exec(String(c || '').trim());   // alloc-rare: only a colour string not seen before (memoised by rgbOf), read as an ease starts
  if (!m) return null;
  const v = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);   // alloc-rare: as above, first sight of this colour string
  if (v.length < 3 || v.some((x) => !Number.isFinite(x))) return null;   // alloc-rare: as above, first sight of this colour string
  return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1];   // alloc-rare: as above, first sight of this colour string
}
const MIX = new Map();   // (a mixed colour's channels and alpha → its rgba() text, so an ease or a repeat of one builds each text once)
/** One channel of the premultiplied mix of A and B, share w of B, over the mixed alpha `al`. */
const chan = (A, B, i, w, al) => Math.round((A[i] * A[3] + (B[i] * B[3] - A[i] * A[3]) * w) / al);
/** Two colours mixed as CSS mixes a transition's (premultiplied sRGB), share w of the second, as an rgba() the page and the GPU read alike. */
export function mixColour(a, b, w) {
  if (w <= 0) return a;
  if (w >= 1) return b;
  const A = rgbOf(a), B = rgbOf(b);
  if (!A || !B) return w < 0.5 ? a : b;
  const al = A[3] + (B[3] - A[3]) * w;
  if (!(al > 0)) return 'transparent';
  const r = chan(A, B, 0, w, al), g = chan(A, B, 1, w, al), bl = chan(A, B, 2, w, al), a4 = Math.round(al * 10000);
  // (The alpha to four places, as before: the text is `${a4 / 10000}`, the shortest form of that number, which is what +al.toFixed(4) gave.)
  // (A key only for values a colour can have; anything else, which a page's rgb() never gives, is written out each time.)
  if (!(r >= 0 && r <= 255 && g >= 0 && g <= 255 && bl >= 0 && bl <= 255 && a4 <= 10000)) return `rgba(${r}, ${g}, ${bl}, ${a4 / 10000})`;   // alloc-rare: never reached with a valid colour (the channels are 0..255 and the alpha 0..1)
  const key = ((r * 256 + g) * 256 + bl) * 16384 + a4;
  let t = MIX.get(key);
  if (t === undefined) {
    if (MIX.size >= 1024) MIX.clear();
    t = `rgba(${r}, ${g}, ${bl}, ${a4 / 10000})`;
    MIX.set(key, t);
  }
  return t;
}
/**
 * mixColour as numbers, with no text made: the mix's straight r, g, b (0..255, whole numbers, as mixColour rounds them) and its alpha (to
 * four places) are written into `out`, an array the caller keeps (a fully transparent mix is [0, 0, 0, 0]). Returns false, and writes
 * nothing, where mixColour would not give an rgba() text (w at or past either end, a colour that is not rgb()/rgba()): the caller then
 * reads mixColour's own answer, which for those makes no text either (it is the colour it was given, or 'transparent').
 */
export function mixRgbaInto(out, a, b, w) {
  if (!(w > 0 && w < 1)) return false;
  const A = rgbOf(a), B = rgbOf(b);
  if (!A || !B) return false;
  const al = A[3] + (B[3] - A[3]) * w;
  if (!(al > 0)) { out[0] = 0; out[1] = 0; out[2] = 0; out[3] = 0; return true; }
  out[0] = chan(A, B, 0, w, al); out[1] = chan(A, B, 1, w, al); out[2] = chan(A, B, 2, w, al); out[3] = Math.round(al * 10000) / 10000;
  return true;
}
