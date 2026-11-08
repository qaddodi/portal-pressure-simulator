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

import { cssRGB } from './util.js';
import { PROBE } from './dop-probe.js';

export const THETA = PROBE.ANGLE;                      // beam-to-flow angle in degrees (the spectral header's θ, the figure probe's angle)
export const COS_THETA = Math.cos(THETA * Math.PI / 180);

export const DOPPLER_MODES = [
  { id: 'spectrum', label: 'Spectrum', short: 'Spectrum' },
  { id: 'velocity', label: 'Color', short: 'Color' },
  { id: 'variance', label: 'Variance', short: 'Variance' },
];
// The maps' colours are tokens (--dop-* in styles/tokens.css), read once on first use.
// (Kept arrays, filled once: a frame reads them and makes none.)
const MAP = { TOWARD: [0, 0, 0], AWAY: [0, 0, 0], VAR_TOWARD: [[0, 0, 0], [0, 0, 0]], VAR_AWAY: [[0, 0, 0], [0, 0, 0]], WHITE: [0, 0, 0] };
let mapped = false;
const take3 = (to, from) => { to[0] = from[0]; to[1] = from[1]; to[2] = from[2]; };
const map = () => {
  if (!mapped) {
    mapped = true;
    take3(MAP.TOWARD, cssRGB('--dop-toward')); take3(MAP.AWAY, cssRGB('--dop-away'));                                  // velocity map 1
    take3(MAP.VAR_TOWARD[0], cssRGB('--dop-var-toward')); take3(MAP.VAR_TOWARD[1], cssRGB('--dop-var-toward-turb'));   // variance map 1: laminar → turbulent
    take3(MAP.VAR_AWAY[0], cssRGB('--dop-var-away')); take3(MAP.VAR_AWAY[1], cssRGB('--dop-var-away-turb'));
    take3(MAP.WHITE, cssRGB('--dop-bright'));                                                                          // the spectrum's bright end
  }
  return MAP;
};

/** The maps' colours (0 to 255), for the GPU's spectrum shader (doppler-synth.js). */
export const dopplerMap = map;

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Colour for one instant, written into out ([r, g, b, a]; a of 0: nothing to draw). invert swaps toward and away. */
const OUT4 = [0, 0, 0, 0], OUT3 = [0, 0, 0];   // (the colour written when a caller gives no `out`: read at once)
export function dopplerColor(mode, { u = 0, s = 0 }, invert = false, out = OUT4) {
  if (mode !== 'velocity' && mode !== 'variance') { out[0] = out[1] = out[2] = out[3] = 0; return out; }
  const toward = (invert ? -u : u) >= 0;
  let c;
  if (mode === 'velocity') c = toward ? map().TOWARD : map().AWAY;
  else {
    const pair = toward ? map().VAR_TOWARD : map().VAR_AWAY, a = pair[0], b = pair[1], f = clamp01(s);
    out[0] = a[0] + (b[0] - a[0]) * f; out[1] = a[1] + (b[1] - a[1]) * f; out[2] = a[2] + (b[2] - a[2]) * f;
  }
  if (c) { out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; }
  out[3] = smooth(0.03, 0.12, Math.abs(u));
  return out;
}

// The trace is a tinted spectrum, not flat paint: the map's colour is softened a little and then
// modulated by the pixel's own signal brightness, with the brightest cores pulling toward the
// spectrum's own near-white. The legend is painted with the same function, so it shows what the
// trace shows.
const SOFT = 0.28;                       // how far the map colour is pulled toward its own grey
const LEGEND_T = 0.8;             // the nominal brightness the legend shows

/** Softened, brightness-modulated colour: c is a map colour, t the pixel's signal brightness 0..1, cover how much of it to show. */
export function shadeColor(c, t, cover, out = OUT3) {
  const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  const b = (0.3 + 0.7 * t) * cover, hl = 0.2 * t * t * Math.sqrt(t) * cover, W = map().WHITE;
  for (let k = 0; k < 3; k++) { const v = (c[k] * (1 - SOFT) + l * SOFT) * b + W[k] * hl; out[k] = v > 255 ? 255 : v; }
  return out;
}

const css = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
const shown = (mode, u, s) => css(shadeColor(dopplerColor(mode, { u, s }), LEGEND_T, 1));

/**
 * The legend colour as the trace shows it, by display position (above the baseline u > 0, below
 * u < 0) and, for Variance, x from laminar 0 to turbulent 1. The colours follow the trace's
 * position about the baseline, so Invert (which flips the trace) needs no change here.
 */
const legendColor = (mode, above, x = 0) => shown(mode, above ? 1 : -1, x);

/** The pill's little swatch: toward | away (Variance: laminar to turbulent in each). */
export function swatchGradient(mode) {
  if (mode === 'variance') return `linear-gradient(90deg,${legendColor(mode, true, 0)},${legendColor(mode, true, 1)} 50%,${legendColor(mode, false, 0)} 50%,${legendColor(mode, false, 1)})`;
  return `linear-gradient(90deg,${legendColor(mode, true)} 50%,${legendColor(mode, false)} 50%)`;
}
