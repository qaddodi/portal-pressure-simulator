// The glass-motion.js of 93a7c877, kept verbatim as the oracle tests/glass-motion.test.js compares the allocation-free version against.
// (Not source: nothing in src/ imports it, and the off-GPU scan does not read tests/.)
// The glass's motion without reading the page (1 Nov 2026, Mohammad: "Move everything to GPU"; the coordinator: snapshot the geometry
// once before motion starts, then drive the glass from the transforms and fades it is given). A glass's box and fade are read once
// (glass-gl measureGeo, outside any frame) with every moving part taken out; each frame then puts back what moves: a translation or an
// opacity written inline on the glass or on anything holding it, or a running animation of either (a CSS transition, a CSS keyframe
// animation, a script's animate()), worked out from its keyframes and its timing, with no read of layout or style.

const NUM = (v) => parseFloat(v) || 0;
const PX = /^(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)(px)?$/i;
const len = (v) => {
  if (v == null) return 0;
  const s = String(v).trim();
  if (!s || s === '0') return 0;
  const m = PX.exec(s);
  return m && (m[2] || +m[1] === 0) ? +m[1] : NaN;
};

/** A CSS transform as a pure translation [x, y] (px), or null when it is anything else (a scale, a turn, a percentage). '' and 'none': [0, 0]. */
export function shiftOf(t) {
  const s = (t || '').trim();
  if (!s || s === 'none') return [0, 0];
  const re = /(translate3d|translateX|translateY|translate|matrix3d|matrix)\(([^)]*)\)/g;
  let x = 0, y = 0, m, rest = s;
  while ((m = re.exec(s))) {
    rest = rest.replace(m[0], '');
    const a = m[2].split(',').map((v) => v.trim());
    if (m[1] === 'translateX') x += len(a[0]);
    else if (m[1] === 'translateY') y += len(a[0]);
    else if (m[1] === 'translate' || m[1] === 'translate3d') { x += len(a[0]); y += len(a[1]); if (m[1] === 'translate3d' && len(a[2]) !== 0) return null; }
    else if (m[1] === 'matrix') {
      const n = a.map(Number);
      if (n.length !== 6 || n[0] !== 1 || n[1] !== 0 || n[2] !== 0 || n[3] !== 1) return null;
      x += n[4]; y += n[5];
    } else {
      const n = a.map(Number);
      if (n.length !== 16 || n.some((v, i) => [0, 5, 10, 15].includes(i) ? v !== 1 : ![12, 13].includes(i) && v !== 0)) return null;
      x += n[12]; y += n[13];
    }
  }
  if (rest.trim()) return null;
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

/** The CSS translate property ("10px", "10px 4px", "none", '') as [x, y], or null. */
export function translateOf(t) {
  const s = (t || '').trim();
  if (!s || s === 'none') return [0, 0];
  const p = s.split(/\s+/), x = len(p[0]), y = len(p[1] ?? '0');
  return p.length <= 3 && Number.isFinite(x) && Number.isFinite(y) && (p[2] == null || len(p[2]) === 0) ? [x, y] : null;
}

// cubic-bezier(x1, y1, x2, y2) at x (0..1), solved for t by Newton's method with bisection behind it.
function bezier(x1, y1, x2, y2, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const fx = (t) => ((ax * t + bx) * t + cx) * t, dfx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  let t = x;
  for (let i = 0; i < 8; i++) { const e = fx(t) - x; if (Math.abs(e) < 1e-6) break; const d = dfx(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
  if (!(t >= 0 && t <= 1) || Math.abs(fx(t) - x) > 1e-4) { let lo = 0, hi = 1; t = x; for (let i = 0; i < 30; i++) { if (fx(t) < x) lo = t; else hi = t; t = (lo + hi) / 2; } }
  return ((ay * t + by) * t + cy) * t;
}
const NAMED = { ease: [0.25, 0.1, 0.25, 1], 'ease-in': [0.42, 0, 1, 1], 'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1] };
/** A CSS easing as a function of progress, or null for one it cannot follow (steps(), linear() with stops). */
export function easeOf(e) {
  const s = (e || 'linear').trim();
  if (s === 'linear') return (p) => p;
  const k = NAMED[s] || (/^cubic-bezier\(([^)]*)\)$/.exec(s)?.[1].split(',').map(Number));
  if (!k || k.length !== 4 || k.some((v) => !Number.isFinite(v))) return null;
  return (p) => bezier(k[0], k[1], k[2], k[3], p);
}

/** One animation's effect on the glass at transformed progress p: { t: [x, y] | undefined, o: number | undefined }, or null when its
 *  keyframes hold something it cannot follow (a transform that is not a translation, an implicit keyframe, an easing it does not know).
 *  kf: the effect's getKeyframes() (computedOffset, easing, transform, opacity). */
export function motionAt(kf, p) {
  if (!kf?.length || !Number.isFinite(p)) return null;
  const hasT = kf.some((k) => k.transform != null), hasO = kf.some((k) => k.opacity != null);
  if (!hasT && !hasO) return { t: undefined, o: undefined };
  if ((hasT && kf.some((k) => k.transform == null)) || (hasO && kf.some((k) => k.opacity == null))) return null;
  const off = (k, i) => k.computedOffset ?? k.offset ?? (kf.length > 1 ? i / (kf.length - 1) : 0);
  let i = 0;
  while (i < kf.length - 2 && p > off(kf[i + 1], i + 1)) i++;
  const a = kf[i], b = kf[Math.min(i + 1, kf.length - 1)], oa = off(a, i), ob = off(b, Math.min(i + 1, kf.length - 1));
  const ease = easeOf(a.easing);
  if (!ease) return null;
  const u = ob > oa ? ease(Math.min(1, Math.max(0, (p - oa) / (ob - oa)))) : p >= ob ? 1 : 0;
  const out = { t: undefined, o: undefined };
  if (hasT) {
    const ta = shiftOf(a.transform), tb = shiftOf(b.transform);
    if (!ta || !tb) return null;
    out.t = [ta[0] + (tb[0] - ta[0]) * u, ta[1] + (tb[1] - ta[1]) * u];
  }
  if (hasO) out.o = NUM(a.opacity) + (NUM(b.opacity) - NUM(a.opacity)) * u;
  return out;
}

// An inline style's declarations as a map (a value's own ';' inside brackets or quotes kept).
export function declsOf(s) {
  const out = new Map();
  if (!s) return out;
  let depth = 0, q = '', cur = '';
  const put = () => { const i = cur.indexOf(':'); if (i > 0) out.set(cur.slice(0, i).trim().toLowerCase(), cur.slice(i + 1).trim()); cur = ''; };
  for (const ch of s) {
    if (q) { if (ch === q) q = ''; cur += ch; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ';' && !depth) { put(); continue; }
    cur += ch;
  }
  put();
  return out;
}
// (What may change on an element without moving anything else on the page, or anything of a glass that the motion does not put back.)
const MOVES = new Set(['transform', 'translate', 'opacity']);
const QUIET = new Set(['transition', 'transition-property', 'transition-duration', 'transition-delay', 'transition-timing-function', 'will-change']);
/** Whether a style attribute changed from `was` to `now` only in what the glass follows each frame (a translation or an opacity whose
 *  declaration was there before and is still there, so the sheet's value it overrides never comes into it), or in what changes nothing
 *  it draws (a transition's own settings). */
export function movesOnly(was, now) {
  if (was === now) return true;
  const a = declsOf(was), b = declsOf(now);
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    if (a.get(k) === b.get(k) || QUIET.has(k)) continue;
    if (MOVES.has(k) && a.has(k) && b.has(k)) continue;
    return false;
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
  const ease = easeOf(t.easing || 'linear');
  const st = an.playState;
  const rate = st === 'paused' ? 0 : Number.isFinite(an.playbackRate) ? an.playbackRate : 1;
  const c = {
    delay: +t.delay || 0, endDelay: +t.endDelay || 0, dur, iters, iterStart: +t.iterationStart || 0, dir: t.direction || 'normal',
    fill: t.fill || 'auto', ease, bad: !ease, rate, s: null, c0: 0, w0: now, idle: st === 'idle', done: false,
  };
  const s = an.startTime, ct = an.currentTime;
  if (rate !== 0 && Number.isFinite(s)) c.s = s;
  else c.c0 = Number.isFinite(ct) ? ct : 0;   // (pending, about to start: taken from now until its start time is known)
  return c;
}
export const fillsAfter = (c) => FILLS_FWD.test(c.fill);
/** The clock at the timeline's time `now`: { st: 'idle' | 'running' | 'finished', p (its transformed progress, or null outside its
 *  active time with no fill there), end (its end time) }. */
export function clockAt(c, now) {
  const active = c.dur === 0 || c.iters === 0 ? 0 : c.dur * c.iters;
  const end = Math.max(c.delay + active + c.endDelay, 0);
  if (c.idle) return { st: 'idle', p: null, end };
  const local = c.s != null ? (now - c.s) * c.rate : c.c0;   // (3 Nov 2026: a pending animation is held at its current time until its start is known)
  const st = c.done || (c.rate > 0 && local >= end) || (c.rate < 0 && local <= 0) ? 'finished' : 'running';
  const beforeEnd = Math.min(c.delay, end), activeEnd = Math.min(c.delay + active, end);
  const phase = local < beforeEnd || (c.rate < 0 && local === beforeEnd) ? 'before' : local > activeEnd || (c.rate >= 0 && local === activeEnd) ? 'after' : 'active';
  let at;
  if (phase === 'before') at = FILLS_BACK.test(c.fill) ? Math.max(local - c.delay, 0) : null;
  else if (phase === 'after') at = FILLS_FWD.test(c.fill) ? Math.max(Math.min(local - c.delay, active), 0) : null;
  else at = local - c.delay;
  if (at == null) return { st, p: null, end };
  const overall = c.dur === 0 ? (phase === 'before' ? c.iterStart : c.iterStart + c.iters) : at / c.dur + c.iterStart;
  let simple = overall === Infinity ? c.iterStart % 1 : overall % 1;
  if (simple === 0 && phase !== 'before' && at === active && c.iters !== 0 && overall !== 0) simple = 1;
  const iter = phase === 'after' && c.iters === Infinity ? Infinity : simple === 1 ? Math.floor(overall) - 1 : Math.floor(overall);
  const odd = Number.isFinite(iter) && iter % 2 === 1;
  const fwd = c.dir === 'reverse' ? false : c.dir === 'alternate' ? !odd : c.dir === 'alternate-reverse' ? odd : true;
  const d = fwd ? simple : 1 - simple;
  return { st, p: c.ease ? c.ease(d) : d, end };
}
