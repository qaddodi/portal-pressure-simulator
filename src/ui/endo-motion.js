// How the scope's view moves between states (instruments.js): every change eases, nothing cuts.
// The shaded field is a bitmap redrawn in small steps (a step of size or stigmata, each frame of a band going on); each new
// bitmap fades in over the one shown, so a step reads as a glide. The balloon and the bleeding jet fade in and out.
import { bleedPulse } from './blood.js?v=856babbc01';
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
const frac = (x) => ((x % 1) + 1) % 1;
const smooth = (e0, e1, x) => { const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };
export const SCOPE_DROPS = 40;
const LIFE = 0.6;
const hash = (i) => frac(Math.sin(i * 91.7 + 47.3) * 43758.5453);

// The pool's surface (px down from the lumen's centre) for a fill of 0..1: a rim of blood at the bottom at first, half
// the lumen by 1.5 L.
export const scopePoolY = (cy, R, fill) => cy + R - R * (0.16 + 0.84 * fill);

// The drops in flight at time t, as [x, y, radius, alpha] in units of R from the tear (y down). Each is thrown off at its
// birth as hard as that moment's surge throws it, eases in from nothing and thins to nothing before it is thrown again.
export function scopeDrops(t, rate, hr) {
  const k = Math.min(1.6, Math.max(0.6, (rate || 50) / 90)), spurt = smooth(25, 70, rate || 50), out = [];
  for (let i = 0; i < SCOPE_DROPS; i++) {
    const age = frac(t / LIFE + i / SCOPE_DROPS) * LIFE, pb = bleedPulse(t - age, hr);
    const a = -1.95 + (hash(i) - 0.5) * 0.7, v = (0.35 + (0.6 + 1.5 * pb) * spurt) * k;
    const x = Math.cos(a) * v * age, y = Math.sin(a) * v * age + 1.6 * age * age;
    const al = smooth(0, 0.1, age) * (1 - age / LIFE) ** 1.3 * (0.35 + 0.65 * spurt);
    out.push([x, y, (0.008 + 0.014 * hash(i + 17)) * (1 - 0.35 * age / LIFE) * (0.8 + 0.3 * k), al]);
  }
  return out;
}
