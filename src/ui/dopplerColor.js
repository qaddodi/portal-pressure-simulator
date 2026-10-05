// Colour Doppler display: the modes and their colour maps, in one place.
//
// The maps are the scanner's own "map 1" pair: velocity in flat bands (toward the transducer
// orange-red, away blue, black where there is no shift) and variance (toward orange → yellow,
// away blue-purple → green, laminar to turbulent, black where there is no shift).
//
// The display takes plain numbers per instant, none of them from a vessel's name:
//   u  signed Doppler velocity as a fraction of the colour scale, from −1 to 1; positive is flow
//      toward the transducer (the beam), negative away: v · cos θ over the scale
//   s  velocity variance from 0 (laminar) to 1 (turbulent)
// and returns [r, g, b, a] (a of 0: black, nothing to draw). The Spectrum mode has no colour.

export const THETA = 60;                               // beam-to-flow angle in degrees (the spectral header's θ)
export const COS_THETA = Math.cos(THETA * Math.PI / 180);

export const DOPPLER_MODES = [
  { id: 'spectrum', label: 'Spectrum', short: 'Spectrum' },
  { id: 'velocity', label: 'Velocity', short: 'VEL' },
  { id: 'variance', label: 'Variance', short: 'Variance' },
];
export const isDirectional = (mode) => mode === 'velocity' || mode === 'variance';

const TOWARD = [224, 90, 48], AWAY = [58, 75, 168];                    // velocity map 1
const VAR_TOWARD = [[240, 138, 40], [255, 232, 48]];                   // variance map 1: laminar → turbulent
const VAR_AWAY = [[107, 88, 168], [46, 154, 92]];

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Colour for one instant, written into out ([r, g, b, a]; a of 0: nothing to draw). invert swaps toward and away. */
export function dopplerColor(mode, { u = 0, s = 0 }, invert = false, out = [0, 0, 0, 0]) {
  if (mode !== 'velocity' && mode !== 'variance') { out[0] = out[1] = out[2] = out[3] = 0; return out; }
  const toward = (invert ? -u : u) >= 0;
  let c;
  if (mode === 'velocity') c = toward ? TOWARD : AWAY;
  else {
    const [a, b] = toward ? VAR_TOWARD : VAR_AWAY, f = clamp01(s);
    out[0] = a[0] + (b[0] - a[0]) * f; out[1] = a[1] + (b[1] - a[1]) * f; out[2] = a[2] + (b[2] - a[2]) * f;
  }
  if (c) { out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; }
  out[3] = smooth(0.03, 0.12, Math.abs(u));
  return out;
}

const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

/** The Velocity legend as a CSS gradient: away (left), no shift (black), toward (right), in flat bands. */
export function legendGradient(mode, invert = false) {
  const a = rgb(invert ? TOWARD : AWAY), t = rgb(invert ? AWAY : TOWARD);
  return `linear-gradient(90deg,${a} 0 42%,#000 42% 58%,${t} 58% 100%)`;
}

/** One row of the Variance legend: laminar (left) to turbulent (right) for flow toward (u > 0) or away (u < 0). */
export function varianceGradient(u, invert = false) {
  const toward = (invert ? -u : u) >= 0, [a, b] = toward ? VAR_TOWARD : VAR_AWAY;
  return `linear-gradient(90deg,${rgb(a)},${rgb(b)})`;
}
