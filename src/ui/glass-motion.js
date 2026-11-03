// The glass's motion without reading the page (1 Nov 2026, Mohammad: "Move everything to GPU"; the coordinator: snapshot the geometry
// once before motion starts, then drive the glass from the transforms and fades it is given). A glass's box and fade are read once
// (glass-gl measureGeo, outside any frame) with every moving part taken out; each frame then puts back what moves: a translation or an
// opacity written inline on the glass or on anything holding it, or a running animation of either (a CSS transition, a CSS keyframe
// animation, a script's animate()), worked out from its keyframes and its timing, with no read of layout or style.
//
// Nothing here builds anything in a frame (2 Nov 2026, Mohammad: "SVG and CPU do NOTHING during motion"; 29 sites on the off-GPU scan): text
// is read by character code into kept buffers, keyframes are turned into numbers when the animation is first seen, and each answer is
// written into an object the caller keeps. tests/glass-motion.test.js holds every function to the old code's answers
// (tests/fixtures/glass-motion-ref.mjs) and to producing no garbage.

const NUM = (v) => parseFloat(v) || 0;
const UNSET = {};   // (a memo that has read nothing yet: no string is ever this)
const P10 = new Float64Array(23);   // (10^0 … 10^22: every one exact in a double)
for (let i = 0, v = 1; i < 23; i++, v *= 10) P10[i] = v;
const PAIR = new Float64Array(2);
const R = new Float64Array(2);   // (a result passed back: a double returned from, or handed to, a call that is not inlined is boxed, a heap number each; R[0] out, R[1] in)

// ── Reading CSS text without building anything (2 Nov 2026, Mohammad: "SVG and CPU do NOTHING during motion") ──
// Every function here walks the string by character code and writes numbers into a kept buffer or object: no substring, no split, no
// array, no closure, no regular expression, so a frame that follows a glide builds no garbage. A number is worked out as the browser
// does when it fits a double exactly (up to 15 digits and a power of ten up to 22: one correctly rounded step); anything beyond that
// (a script's unrounded 17-digit string) goes through Number() on a slice, as before. Each is checked against the old, string-splitting
// code in tests/glass-motion.test.js.
let endAt = 0;   // (where the last scanDec stopped, or -1 when no number starts there)
const isWs = (c) => (c <= 32 ? c === 32 || (c >= 9 && c <= 13) : c >= 160 && (c === 160 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff));   // (what trim() and \s take for a space)
/** A decimal number at i (an optional '-', or '+' with `plus`; digits with an optional point; an optional e±digits), up to e: its value in R[0], where it ended in endAt (-1: none). */
function scanDec(str, i, e, plus) {
  const st = i;
  let c = i < e ? str.charCodeAt(i) : 0, neg = false;
  if (c === 45) { neg = true; c = ++i < e ? str.charCodeAt(i) : 0; } else if (plus && c === 43) c = ++i < e ? str.charCodeAt(i) : 0;
  let mant = 0, sig = 0, nd = 0, fd = 0, big = false;
  while (c >= 48 && c <= 57) { nd++; if (sig || c !== 48) { if (++sig > 15) big = true; else mant = mant * 10 + (c - 48); } c = ++i < e ? str.charCodeAt(i) : 0; }
  if (c === 46) {
    c = ++i < e ? str.charCodeAt(i) : 0;
    while (c >= 48 && c <= 57) { nd++; fd++; if (sig || c !== 48) { if (++sig > 15) big = true; else mant = mant * 10 + (c - 48); } c = ++i < e ? str.charCodeAt(i) : 0; }
  }
  if (!nd) { endAt = -1; R[0] = NaN; return; }
  let ex = 0;
  if (c === 101 || c === 69) {
    let j = i + 1, d = j < e ? str.charCodeAt(j) : 0, es = false;
    if (d === 45 || d === 43) { es = d === 45; d = ++j < e ? str.charCodeAt(j) : 0; }
    if (d >= 48 && d <= 57) {
      while (d >= 48 && d <= 57) { if (ex < 100000) ex = ex * 10 + (d - 48); d = ++j < e ? str.charCodeAt(j) : 0; }
      i = j;
      if (es) ex = -ex;
    }
  }
  endAt = i;
  if (big) { R[0] = +str.slice(st, i); return; }   // alloc-rare: more than 15 significant digits (a script's unrounded number); the style serialiser keeps six, so no glide writes one
  if (mant === 0) { R[0] = neg ? -0 : 0; return; }
  const x = ex - fd;
  let v;
  if (x === 0) v = mant;
  else if (x < 0 && x >= -22) v = mant / P10[-x];
  else if (x > 0 && x <= 22) v = mant * P10[x];
  else { R[0] = +str.slice(st, i); return; }   // alloc-rare: a power of ten past 22 (an exponent no transform holds); never in a glide
  R[0] = neg ? -v : v;
}
/** A CSS length in str[s, e): "12px", "-.5PX", "1e3px" as px, a bare 0, '' as 0; NaN for anything else (a unit, a percentage, a bare 1). In R[0]. */
function lenAt(str, s, e) {
  while (s < e && isWs(str.charCodeAt(s))) s++;
  while (e > s && isWs(str.charCodeAt(e - 1))) e--;
  if (s >= e || (e - s === 1 && str.charCodeAt(s) === 48)) { R[0] = 0; return; }
  scanDec(str, s, e, false);
  if (endAt < 0) { R[0] = NaN; return; }
  const i = endAt, v = R[0];
  let px = false;
  if (i < e) { if (e - i === 2 && (str.charCodeAt(i) | 32) === 112 && (str.charCodeAt(i + 1) | 32) === 120) px = true; else { R[0] = NaN; return; } }
  if (!px && v !== 0) R[0] = NaN;
}
/** What Number() makes of str[s, e), in R[0]: '' is 0, a plain decimal is read in place; the rest (hex, Infinity, text) is left to Number(). */
function numAt(str, s, e) {
  while (s < e && isWs(str.charCodeAt(s))) s++;
  while (e > s && isWs(str.charCodeAt(e - 1))) e--;
  if (s >= e) { R[0] = 0; return; }
  scanDec(str, s, e, true);
  if (endAt !== e) R[0] = Number(str.slice(s, e));   // alloc-rare: not a plain decimal (hex, Infinity, text); the style serialiser writes none, so no glide holds one
}
const FUNCS = ['translate3d', 'translateX', 'translateY', 'translate', 'matrix3d', 'matrix'];
let openAt = 0;   // (just after the "(" of the function fnAt found)
function fnAt(str, i) {
  for (let f = 0; f < 6; f++) {
    const name = FUNCS[f];
    if (str.startsWith(name, i) && str.charCodeAt(i + name.length) === 40) { openAt = i + name.length + 1; return f; }
  }
  return -1;
}
const argEnd = (str, from, close) => { const k = str.indexOf(',', from); return k < 0 || k > close ? close : k; };

/** A CSS transform as a pure translation, written into out[0], out[1] (px): true. False when it is anything else (a scale, a turn, a
 *  percentage). Empty, 'none': 0, 0, true. */
export function shiftInto(t, out) {
  out[0] = 0; out[1] = 0;
  if (!t) return true;
  const str = t, n = str.length;
  let i = 0, e = n;
  while (i < e && isWs(str.charCodeAt(i))) i++;
  while (e > i && isWs(str.charCodeAt(e - 1))) e--;
  if (i >= e || (e - i === 4 && str.startsWith('none', i))) return true;
  let x = 0, y = 0;
  while (i < e) {
    if (isWs(str.charCodeAt(i))) { i++; continue; }
    const f = fnAt(str, i);
    if (f < 0) return false;
    const a = openAt, close = str.indexOf(')', a);
    if (close < 0) return false;
    if (f === 1) { lenAt(str, a, argEnd(str, a, close)); x += R[0]; }
    else if (f === 2) { lenAt(str, a, argEnd(str, a, close)); y += R[0]; }
    else if (f < 4) {
      const e0 = argEnd(str, a, close), s1 = e0 < close ? e0 + 1 : close, e1 = e0 < close ? argEnd(str, s1, close) : close;
      lenAt(str, a, e0); x += R[0];
      lenAt(str, s1, e1); y += R[0];
      if (f === 0) { lenAt(str, e1 < close ? e1 + 1 : close, close); if (R[0] !== 0) return false; }
    } else {
      let cnt = 1;
      for (let k = str.indexOf(',', a); k >= 0 && k < close; k = str.indexOf(',', k + 1)) cnt++;
      const want = f === 4 ? 16 : 6;
      if (cnt !== want) return false;
      let s = a;
      for (let k = 0; k < cnt; k++) {
        const ke = argEnd(str, s, close);
        numAt(str, s, ke);
        const v = R[0];
        s = ke + 1;
        if (f === 5) { if (k === 0 || k === 3) { if (v !== 1) return false; } else if (k === 1 || k === 2) { if (v !== 0) return false; } else if (k === 4) x += v; else y += v; }
        else if (k === 12) x += v;
        else if (k === 13) y += v;
        else if (k === 0 || k === 5 || k === 10 || k === 15 ? v !== 1 : v !== 0) return false;
      }
    }
    i = close + 1;
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  out[0] = x; out[1] = y;
  return true;
}

/** The CSS translate property ("10px", "10px 4px", "none", '') written into out[0], out[1]: true, or false. */
export function translateInto(t, out) {
  out[0] = 0; out[1] = 0;
  if (!t) return true;
  const str = t;
  let i = 0, e = str.length;
  while (i < e && isWs(str.charCodeAt(i))) i++;
  while (e > i && isWs(str.charCodeAt(e - 1))) e--;
  if (i >= e || (e - i === 4 && str.startsWith('none', i))) return true;
  let cnt = 0, s0 = 0, e0 = 0, s1 = 0, e1 = 0, s2 = 0, e2 = 0;
  while (i < e) {
    if (isWs(str.charCodeAt(i))) { i++; continue; }
    const s = i;
    while (i < e && !isWs(str.charCodeAt(i))) i++;
    if (cnt === 0) { s0 = s; e0 = i; } else if (cnt === 1) { s1 = s; e1 = i; } else if (cnt === 2) { s2 = s; e2 = i; }
    if (++cnt > 3) return false;
  }
  lenAt(str, s0, e0);
  const x = R[0];
  if (cnt > 1) lenAt(str, s1, e1); else R[0] = 0;
  const y = R[0];
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (cnt > 2) { lenAt(str, s2, e2); if (R[0] !== 0) return false; }
  out[0] = x; out[1] = y;
  return true;
}

/** The inline transform and translate of one element, read as numbers and kept: parsed again only when the text changed. */
export class Inline {
  constructor() { this.ts = UNSET; this.tok = true; this.tx = 0; this.ty = 0; this.us = UNSET; this.uok = true; this.ux = 0; this.uy = 0; }
}
/** The element's inline transform (str) as a translation: true with m.tx, m.ty set, or false when it is anything else. */
export function inlineShift(m, str) {
  if (str !== m.ts) { m.ts = str; m.tok = shiftInto(str, PAIR); m.tx = PAIR[0]; m.ty = PAIR[1]; }
  return m.tok;
}
/** The element's inline translate property (str): true with m.ux, m.uy set, or false. */
export function inlineTranslate(m, str) {
  if (str !== m.us) { m.us = str; m.uok = translateInto(str, PAIR); m.ux = PAIR[0]; m.uy = PAIR[1]; }
  return m.uok;
}

// cubic-bezier(x1, y1, x2, y2), held in b[o … o+3], at x = R[1] (0..1), solved for t by Newton's method with bisection behind it. The y in R[0].
function bezier(b, o) {
  const x = R[1];
  if (x <= 0) { R[0] = 0; return; }
  if (x >= 1) { R[0] = 1; return; }
  const x1 = b[o], y1 = b[o + 1], x2 = b[o + 2], y2 = b[o + 3];
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  let t = x;
  for (let i = 0; i < 8; i++) { const e = ((ax * t + bx) * t + cx) * t - x; if (Math.abs(e) < 1e-6) break; const d = (3 * ax * t + 2 * bx) * t + cx; if (Math.abs(d) < 1e-6) break; t -= e / d; }
  if (!(t >= 0 && t <= 1) || Math.abs(((ax * t + bx) * t + cx) * t - x) > 1e-4) { let lo = 0, hi = 1; t = x; for (let i = 0; i < 30; i++) { if (((ax * t + bx) * t + cx) * t < x) lo = t; else hi = t; t = (lo + hi) / 2; } }
  R[0] = ((ay * t + by) * t + cy) * t;
}
const NAMED = { ease: [0.25, 0.1, 0.25, 1], 'ease-in': [0.42, 0, 1, 1], 'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1] };
const EB = new Float64Array(4);
const LINEAR = 0, CUBIC = 1, UNKNOWN = 2;
/** A CSS easing as a kind: LINEAR, CUBIC (its four numbers left in EB) or UNKNOWN (steps(), linear() with stops, anything it cannot follow). */
function easingKind(e) {
  const s = (e || 'linear').trim();   // alloc-rare: an easing is read once, when its animation is first seen, never in a frame
  if (s === 'linear') return LINEAR;
  const k = Object.hasOwn(NAMED, s) ? NAMED[s] : (/^cubic-bezier\(([^)]*)\)$/.exec(s)?.[1].split(',').map(Number));   // alloc-rare: an easing is read once, when its animation is first seen, never in a frame
  if (!k || k.length !== 4 || k.some((v) => !Number.isFinite(v))) return UNKNOWN;   // alloc-rare: an easing is read once, when its animation is first seen, never in a frame
  EB[0] = k[0]; EB[1] = k[1]; EB[2] = k[2]; EB[3] = k[3];
  return CUBIC;
}

// ── An animation's keyframes, as numbers ──
// A keyframe effect's getKeyframes() is read once, when the animation is first seen, into one Float64Array (per key: offset, the
// translation x and y, the opacity, and an easing's four numbers) and one Uint8Array (per key: whether its transform is a translation,
// and its easing's kind). motionAt() then reads those each frame and writes into a Motion: nothing is built.
const KD = 8, KOFF = 0, KTX = 1, KTY = 2, KOP = 3, KEZ = 4;
export class Track {
  constructor(n) {
    this.n = n; this.hasT = false; this.hasO = false; this.bad = false; this.prop = false;   // (prop: its translation is the translate property's, which replaces the element's own inline translate while it plays)
    this.d = new Float64Array(n * KD);   // alloc-rare: a track is made once per animation, when it is first seen
    this.f = new Uint8Array(n * 2);   // alloc-rare: a track is made once per animation, when it is first seen
  }
}
/** What one animation does to the glass at one moment: set `at` (its transformed progress), call motionAt(), and read hasT with tx, ty
 *  (px) and hasO with o. (The progress goes in a field, not an argument: a double handed to a call that is not inlined is boxed.) */
export class Motion {
  constructor() { this.at = 0; this.hasT = false; this.tx = 0; this.ty = 0; this.hasO = false; this.o = 0; this.prop = false; }
}
/** An effect's getKeyframes() as a Track, or null with none. */
export function compileKeyframes(kf) {
  if (!kf?.length) return null;
  const n = kf.length, T = new Track(n), d = T.d, f = T.f;   // alloc-rare: an animation is compiled once, when it is first seen
  let missT = false, missO = false, anyTf = false, anyTr = false;
  for (let i = 0; i < n; i++) {
    const k = kf[i];
    // (A keyframe moves the element by its transform or by the translate property (the dock glide, the words' glide); an animation that
    // mixes the two is not followed.)
    if (k.transform != null) { T.hasT = true; anyTf = true; } else if (k.translate != null && k.translate !== '') { T.hasT = true; anyTr = true; } else missT = true;
    if (k.opacity != null) T.hasO = true; else missO = true;
  }
  T.prop = anyTr;
  T.bad = (T.hasT && missT) || (T.hasO && missO) || (anyTf && anyTr);
  for (let i = 0; i < n; i++) {
    const k = kf[i], b = i * KD;
    d[b + KOFF] = k.computedOffset ?? k.offset ?? (n > 1 ? i / (n - 1) : 0);
    if (k.transform != null ? shiftInto(k.transform, PAIR) : k.translate != null && translateInto(k.translate, PAIR)) { f[2 * i] = 1; d[b + KTX] = PAIR[0]; d[b + KTY] = PAIR[1]; }
    if (k.opacity != null) d[b + KOP] = NUM(k.opacity);
    const kind = easingKind(k.easing);
    f[2 * i + 1] = kind;
    if (kind === CUBIC) { d[b + KEZ] = EB[0]; d[b + KEZ + 1] = EB[1]; d[b + KEZ + 2] = EB[2]; d[b + KEZ + 3] = EB[3]; }
  }
  return T;
}
/** One animation's effect on the glass at transformed progress out.at, written into out (hasT, tx, ty, hasO, o): true, or false when its
 *  keyframes hold something it cannot follow (a transform that is not a translation, an implicit keyframe, an easing it does not know). */
export function motionAt(T, out) {
  out.hasT = false; out.hasO = false;
  const p = out.at;
  if (!T || !Number.isFinite(p) || T.bad) return false;
  if (!T.hasT && !T.hasO) return true;
  const n = T.n, d = T.d, f = T.f;
  let i = 0;
  while (i < n - 2 && p > d[(i + 1) * KD + KOFF]) i++;
  const j = i + 1 < n - 1 ? i + 1 : n - 1, a = i * KD, b = j * KD, oa = d[a + KOFF], ob = d[b + KOFF], kind = f[2 * i + 1];
  if (kind === UNKNOWN) return false;
  let u;
  if (ob > oa) {
    let x = (p - oa) / (ob - oa);
    x = x < 0 ? 0 : x > 1 ? 1 : x;
    if (kind === LINEAR) u = x; else { R[1] = x; bezier(d, a + KEZ); u = R[0]; }
  } else u = p >= ob ? 1 : 0;
  if (T.hasT) {
    if (!f[2 * i] || !f[2 * j]) return false;
    out.hasT = true; out.prop = T.prop;
    out.tx = d[a + KTX] + (d[b + KTX] - d[a + KTX]) * u;
    out.ty = d[a + KTY] + (d[b + KTY] - d[a + KTY]) * u;
  }
  if (T.hasO) { out.hasO = true; out.o = d[a + KOP] + (d[b + KOP] - d[a + KOP]) * u; }
  return true;
}

// ── An inline style, compared without being taken apart ──
// Each declaration's four boundaries (key start and end, value start and end, trimmed) go into a kept Int32Array: no Map, no Set, no
// substring. A key is compared a character at a time, upper case folded; a value exactly. The tables grow, once, to the largest
// style seen.
let DA = new Int32Array(256), DB = new Int32Array(256);
function putDecl(s, a, b, tab, cnt) {
  const colon = s.indexOf(':', a);
  if (colon <= a || colon >= b) return cnt;
  let ks = a, ke = colon, vs = colon + 1, ve = b;
  while (ks < ke && isWs(s.charCodeAt(ks))) ks++;
  while (ke > ks && isWs(s.charCodeAt(ke - 1))) ke--;
  while (vs < ve && isWs(s.charCodeAt(vs))) vs++;
  while (ve > vs && isWs(s.charCodeAt(ve - 1))) ve--;
  const o = cnt * 4;
  tab[o] = ks; tab[o + 1] = ke; tab[o + 2] = vs; tab[o + 3] = ve;
  return cnt + 1;
}
/** s's declarations into tab (a value's own ';' inside brackets or quotes kept); how many. */
function declsInto(s, tab) {
  const n = s.length;
  let cnt = 0, depth = 0, q = 0, from = 0;
  for (let i = 0; i < n; i++) {
    const ch = s.charCodeAt(i);
    if (q) { if (ch === q) q = 0; continue; }
    if (ch === 34 || ch === 39) { q = ch; continue; }
    if (ch === 40) depth++;
    else if (ch === 41) depth = depth > 0 ? depth - 1 : 0;
    if (ch === 59 && !depth) { cnt = putDecl(s, from, i, tab, cnt); from = i + 1; }
  }
  return putDecl(s, from, n, tab, cnt);
}
const low = (c) => (c >= 65 && c <= 90 ? c + 32 : c);
/** Whether the key s[a, b) is `lit` (lower case), upper case folded. */
function keyIs(s, a, b, lit) {
  if (b - a !== lit.length) return false;
  for (let i = 0; i < lit.length; i++) if (low(s.charCodeAt(a + i)) !== lit.charCodeAt(i)) return false;
  return true;
}
/** Whether two keys, one in each style, are the same property. */
function sameKey(s1, t, i, s2, u, j) {
  const a = t[i * 4], n = t[i * 4 + 1] - a, b = u[j * 4];
  if (u[j * 4 + 1] - b !== n) return false;
  for (let k = 0; k < n; k++) if (low(s1.charCodeAt(a + k)) !== low(s2.charCodeAt(b + k))) return false;
  return true;
}
/** Whether two values, one in each style, are the same text. */
function sameVal(s1, t, i, s2, u, j) {
  const a = t[i * 4 + 2], n = t[i * 4 + 3] - a, b = u[j * 4 + 2];
  if (u[j * 4 + 3] - b !== n) return false;
  for (let k = 0; k < n; k++) if (s1.charCodeAt(a + k) !== s2.charCodeAt(b + k)) return false;
  return true;
}
/** The last declaration of tab's i-th key in the style: the index j of the last that has the same key, or -1. */
function lastOf(s1, t, i, s2, u, cnt) {
  for (let j = cnt - 1; j >= 0; j--) if (sameKey(s1, t, i, s2, u, j)) return j;
  return -1;
}
// (What may change on an element without moving anything else on the page, or anything of a glass that the motion does not put back.)
const isMoves = (s, a, b) => keyIs(s, a, b, 'transform') || keyIs(s, a, b, 'translate') || keyIs(s, a, b, 'opacity');
const isQuiet = (s, a, b) => keyIs(s, a, b, 'transition') || keyIs(s, a, b, 'transition-property') || keyIs(s, a, b, 'transition-duration') || keyIs(s, a, b, 'transition-delay')
  || keyIs(s, a, b, 'transition-timing-function') || keyIs(s, a, b, 'will-change');
/** Whether a style attribute changed from `was` to `now` only in what the glass follows each frame (a translation or an opacity whose
 *  declaration was there before and is still there, so the sheet's value it overrides never comes into it), or in what changes nothing
 *  it draws (a transition's own settings). */
export function movesOnly(was, now) {
  if (was === now) return true;
  const need = ((was.length > now.length ? was.length : now.length) >> 1) * 4 + 8;
  if (DA.length < need) { DA = new Int32Array(need * 2); DB = new Int32Array(need * 2); }   // alloc-rare: the tables grow once, to the longest style attribute seen
  const na = declsInto(was, DA), nb = declsInto(now, DB);
  for (let i = 0; i < na; i++) {
    if (lastOf(was, DA, i, was, DA, na) !== i) continue;   // (a later declaration of the same key overrides this one)
    const j = lastOf(was, DA, i, now, DB, nb), ka = DA[i * 4], kb = DA[i * 4 + 1];
    if (j >= 0 && sameVal(was, DA, i, now, DB, j)) continue;
    if (isQuiet(was, ka, kb)) continue;
    if (j >= 0 && isMoves(was, ka, kb)) continue;
    return false;
  }
  for (let j = 0; j < nb; j++) {
    if (lastOf(now, DB, j, now, DB, nb) !== j) continue;
    if (lastOf(now, DB, j, was, DA, na) >= 0) continue;   // (in both: settled above)
    if (!isQuiet(now, DB[j * 4], DB[j * 4 + 1])) return false;
  }
  return true;
}

// ── An animation's clock (2 Nov 2026, Mohammad: "MOVE. EVERYTHING. TO. GPU") ──
// Where an animation is, worked out from its timing as taken once (outside any frame: when it is first seen, and its start time when it
// has started) and the frame's time, the Web Animations model's own steps (§4.8–4.11), so no frame asks the browser for its state: its
// playState, pending, getComputedTiming() and getTiming() each bring a CSS animation's styles up to date when read.
const FILLS_BACK = /backwards|both/, FILLS_FWD = /forwards|both/;
/** An animation's clock, read once from it (its effect's timing, start or current time, rate): an object clockAt() reads, or null when
 *  its effect gives no timing. now: the timeline's time it was read at. */
export function clockOf(an, now) {
  let t;
  try { t = an?.effect?.getTiming?.() || null; } catch { t = null; }
  if (!t) return null;
  const dur = typeof t.duration === 'number' ? Math.max(0, t.duration) : 0;   // ('auto' is 0 for a keyframe effect)
  const iters = Number.isFinite(t.iterations) || t.iterations === Infinity ? Math.max(0, t.iterations) : 1;
  const ek = easingKind(t.easing || 'linear');
  const st = an.playState;
  const rate = st === 'paused' ? 0 : Number.isFinite(an.playbackRate) ? an.playbackRate : 1;
  const fill = t.fill || 'auto';
  const c = {   // alloc-rare: an animation's clock is read once, when it is first seen (and the page is read again), never in a frame
    delay: +t.delay || 0, endDelay: +t.endDelay || 0, dur, iters, iterStart: +t.iterationStart || 0, dir: t.direction || 'normal',
    // alloc-rare: an animation's easing numbers are copied once, when it is first seen
    fill, back: FILLS_BACK.test(fill), fwd: FILLS_FWD.test(fill), ek, eb: new Float64Array(EB),
    bad: ek === UNKNOWN, rate, s: null, c0: 0, w0: now, idle: st === 'idle', done: false,
  };
  const s = an.startTime, ct = an.currentTime;
  if (rate !== 0 && Number.isFinite(s)) c.s = s;
  else c.c0 = Number.isFinite(ct) ? ct : 0;   // (pending, about to start: taken from now until its start time is known)
  return c;
}
export const fillsAfter = (c) => c.fwd;
/** The clock at the timeline's time `now`, written into out: { st: 'idle' | 'running' | 'finished', has (whether it is in its active time,
 *  or in a fill), p (its transformed progress, when has), end (its end time) }. Returns out. */
export function clockAt(c, now, out) {
  const active = c.dur === 0 || c.iters === 0 ? 0 : c.dur * c.iters;
  const end = Math.max(c.delay + active + c.endDelay, 0);
  out.end = end;
  if (c.idle) { out.st = 'idle'; out.has = false; return out; }
  // (Pending, no start time yet: held where it is, not run on from when it was read. The browser starts a new transition or animation at the
  // frame it is first shown in, so its first frame is at its start, however long the frame before it took; counting on from the read
  // put the glass's fade ahead of the card's by every frame between, a frost gone a frame before its card at the start of a fade-out and
  // up before its card at the start of a fade-in. 3 Nov 2026, "Find every card trailing case".)
  const local = c.s != null ? (now - c.s) * c.rate : c.c0;
  const st = c.done || (c.rate > 0 && local >= end) || (c.rate < 0 && local <= 0) ? 'finished' : 'running';
  out.st = st;
  const beforeEnd = Math.min(c.delay, end), activeEnd = Math.min(c.delay + active, end);
  const phase = local < beforeEnd || (c.rate < 0 && local === beforeEnd) ? 'before' : local > activeEnd || (c.rate >= 0 && local === activeEnd) ? 'after' : 'active';
  let at;
  if (phase === 'before') at = c.back ? Math.max(local - c.delay, 0) : null;
  else if (phase === 'after') at = c.fwd ? Math.max(Math.min(local - c.delay, active), 0) : null;
  else at = local - c.delay;
  if (at == null) { out.has = false; return out; }
  const overall = c.dur === 0 ? (phase === 'before' ? c.iterStart : c.iterStart + c.iters) : at / c.dur + c.iterStart;
  let simple = overall === Infinity ? c.iterStart % 1 : overall % 1;
  if (simple === 0 && phase !== 'before' && at === active && c.iters !== 0 && overall !== 0) simple = 1;
  const iter = phase === 'after' && c.iters === Infinity ? Infinity : simple === 1 ? Math.floor(overall) - 1 : Math.floor(overall);
  const odd = Number.isFinite(iter) && iter % 2 === 1;
  const fwd = c.dir === 'reverse' ? false : c.dir === 'alternate' ? !odd : c.dir === 'alternate-reverse' ? odd : true;
  const d = fwd ? simple : 1 - simple;
  if (c.ek === CUBIC) { R[1] = d; bezier(c.eb, 0); out.p = R[0]; } else out.p = d;   // (an easing it does not know: the progress itself, and c.bad is set)
  out.has = true;
  return out;
}
