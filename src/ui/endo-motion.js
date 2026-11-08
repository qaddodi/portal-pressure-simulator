// How the scope's view moves between states (instruments.js): every change eases, nothing cuts.
// The shaded field is a bitmap redrawn in small steps (a step of size or stigmata, each frame of a band going on); each new
// bitmap fades in over the one shown, so a step reads as a glide. The balloon and the bleeding jet fade in and out.
import { bleedPulse } from './blood.js';
import { columnAngle, depthAt } from './endo-columns.js';
import { D_FLIP, D_SMALL, easeMove } from './motion.js';
export const FADE_MS = D_SMALL;
// The scope view moves by one rule (item 23): a FOLLOW toward its target (glide() below, a time constant), never a fixed tween. The model's size
// and presence follow at SIZE_TAU_MS, the banding at BAND_TAU_MS. The band follows the deflating vein: the vein starts at once, the band
// cinches in a beat later (BAND_DELAY_MS: its target is taken that long after the change).
export const SIZE_TAU_MS = 200, DEFLATE_TAU_MS = D_FLIP, BAND_TAU_MS = D_FLIP, BAND_DELAY_MS = D_FLIP;
const ease = easeMove;
/** How far the new field has faded in, 0..1, ms after it was drawn. */
export function fadeIn(ms) { return ms >= FADE_MS ? 1 : ms <= 0 ? 0 : ease(ms / FADE_MS); }
/** cur eased toward target over dtMs (time constant tauMs, about 0.6 s to settle at 120 ms), landing exactly on it. */
export function glide(cur, target, dtMs, tauMs = 120) {
  const v = cur + (target - cur) * (1 - Math.exp(-Math.max(0, dtMs) / tauMs));
  return Math.abs(target - v) < 0.004 ? target : v;
}

// ── An active bleed as the scope sees it (endo-bleed.js draws it) ──
// The view is down a horizontal tube: the lumen runs away from the lens to the dark centre of the picture, so the wall at a
// depth z is a circle of radius 1/(z T) about it. Blood that settles lies flat: its surface at a fixed depth below the axis is a
// plane the scope sees at a grazing angle, and its two edges, where it meets the wall, run to the centre. The pool is the
// wedge between them (a sector of the picture, widening as it fills), not a band across the bottom.
const frac = (x) => ((x % 1) + 1) % 1;
const smooth = (e0, e1, x) => { const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };
export const SCOPE_DROPS = 18;
const LIFE = 0.7, GRAV = 1.5;
const hash = (i) => frac(Math.sin(i * 91.7 + 47.3) * 43758.5453);

// The tear: on the crest of varix column 3 at a depth of half the lumen's radius (units of R from the centre, x right, y down;
// `th` its angle, clockwise from the right), where the drawn column runs for this engorgement.
export const SCOPE_TEAR_RHO = 0.52, SCOPE_TEAR_COLUMN = 3;
// (One kept record, written in place and handed back: valid until the next call; the scope reads it at once and keeps neither it nor its fields.)
const TEAR = { x: 0, y: 0, th: 0 }, POOL = { h: 0, phi: 0 };
export function scopeTear(grow = 0.8) {
  const th = columnAngle(SCOPE_TEAR_COLUMN, depthAt(SCOPE_TEAR_RHO), grow);
  TEAR.x = SCOPE_TEAR_RHO * Math.cos(th); TEAR.y = SCOPE_TEAR_RHO * Math.sin(th); TEAR.th = th;
  return TEAR;
}

// The share of the lumen's cross-section lying under a flat surface h radii below the axis (h 1 the bottom, 0 the axis).
const under = (h) => (Math.acos(h) - h * Math.sqrt(1 - h * h)) / Math.PI;
/** The pool for a fill of 0..1: h, how far its surface lies below the axis (radii), and phi, the angle (clockwise from the
 *  right) at which its edges leave the centre: the wedge spans phi to PI - phi. Low and narrow at first, nearly half the
 *  lumen when full. */
export function scopePool(fill) {
  const want = 0.006 + 0.4 * Math.min(1, Math.max(0, fill)) ** 1.25;
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (under(m) > want) lo = m; else hi = m; }
  const h = (lo + hi) / 2;
  POOL.h = h; POOL.phi = Math.asin(h);   // (one kept record, valid until the next call)
  return POOL;
}
/** Whether a point (units of R from the centre, y down) lies in the pool of that phi. */
export const inScopePool = (x, y, phi) => y > 0 && y >= Math.abs(x) * Math.tan(phi);

// The drops in flight at time t, as [x, y, radius, alpha, vx, vy] in units of R from the tear (y down); `tear` is where the tear is
// (units of R from the centre). Each is thrown off at its birth into the lumen (toward the axis) as hard as the steady bleed throws
// it (no beat: blood.js BLEED_STEADY), eases in from nothing and thins to nothing before it is thrown again. `out`: a table to write them into (the rows are kept
// and rewritten, so a frame makes none); without one a new table is made (a test's).
export function scopeDrops(t, rate, hr, tear = scopeTear(), out = null) {
  const k = Math.min(1.6, Math.max(0.6, (rate || 50) / 90)), spurt = smooth(25, 70, rate || 50);
  // alloc-rare: only when a caller gives no table (the tests); the bleed's drawing passes its kept one
  const dst = out || [];
  const into = Math.atan2(-tear.y, -tear.x);
  for (let i = 0; i < SCOPE_DROPS; i++) {
    const age = frac(t / LIFE + i / SCOPE_DROPS) * LIFE, pb = bleedPulse(t - age, hr);
    const a = into + (hash(i) - 0.5) * 1.4, v = (0.12 + (0.28 + 0.5 * pb) * spurt) * k * (0.5 + 0.9 * hash(i + 5));
    const vx = Math.cos(a) * v, vy = Math.sin(a) * v + GRAV * age;
    const al = smooth(0, 0.1, age) * (1 - age / LIFE) ** 1.2 * (0.12 + 0.88 * spurt);
    // alloc-rare: a row is made the first time a table is used, then rewritten
    const row = dst[i] || (dst[i] = [0, 0, 0, 0, 0, 0]);
    row[0] = vx * age; row[1] = Math.sin(a) * v * age + 0.5 * GRAV * age * age; row[2] = (0.005 + 0.007 * hash(i + 17)) * (0.8 + 0.3 * k);
    row[3] = al; row[4] = vx; row[5] = vy;
  }
  dst.length = SCOPE_DROPS;
  return dst;
}
