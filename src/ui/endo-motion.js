// How the scope's view moves between states (instruments.js): every change eases, nothing cuts.
// The shaded field is a bitmap redrawn in small steps (a step of size or stigmata, each frame of a band going on); each new
// bitmap fades in over the one shown, so a step reads as a glide. The balloon and the bleeding jet fade in and out.
import { bleedPulse } from './blood.js?v=2667e8cf8d';
import { columnAngle, depthAt } from './endo-columns.js?v=381d1443b7';
export const FADE_MS = 280;
// The band follows the deflating vein: the vein starts at once, the band cinches in a beat later.
export const DEFLATE_MS = 500, BAND_MS = 420, BAND_DELAY_MS = 140;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
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
export function scopeTear(grow = 0.8) {
  const th = columnAngle(SCOPE_TEAR_COLUMN, depthAt(SCOPE_TEAR_RHO), grow);
  return { x: SCOPE_TEAR_RHO * Math.cos(th), y: SCOPE_TEAR_RHO * Math.sin(th), th };
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
  return { h, phi: Math.asin(h) };
}
/** Whether a point (units of R from the centre, y down) lies in the pool of that phi. */
export const inScopePool = (x, y, phi) => y > 0 && y >= Math.abs(x) * Math.tan(phi);

// The drops in flight at time t, as [x, y, radius, alpha, vx, vy] in units of R from the tear (y down); `tear` is where the tear is
// (units of R from the centre). Each is thrown off at its birth into the lumen (toward the axis) as hard as that moment's surge throws
// it, eases in from nothing and thins to nothing before it is thrown again.
export function scopeDrops(t, rate, hr, tear = scopeTear()) {
  const k = Math.min(1.6, Math.max(0.6, (rate || 50) / 90)), spurt = smooth(25, 70, rate || 50), out = [];
  const into = Math.atan2(-tear.y, -tear.x);
  for (let i = 0; i < SCOPE_DROPS; i++) {
    const age = frac(t / LIFE + i / SCOPE_DROPS) * LIFE, pb = bleedPulse(t - age, hr);
    const a = into + (hash(i) - 0.5) * 1.4, v = (0.12 + (0.28 + 0.5 * pb) * spurt) * k * (0.5 + 0.9 * hash(i + 5));
    const vx = Math.cos(a) * v, vy = Math.sin(a) * v + GRAV * age;
    const al = smooth(0, 0.1, age) * (1 - age / LIFE) ** 1.2 * (0.12 + 0.88 * spurt);
    out.push([vx * age, Math.sin(a) * v * age + 0.5 * GRAV * age * age, (0.005 + 0.007 * hash(i + 17)) * (0.8 + 0.3 * k), al, vx, vy]);
  }
  return out;
}
