// Colour Doppler display: the modes and their colour maps, in one place.
//
// The display takes three plain numbers per instant, none of them from a vessel's name:
//   u  signed Doppler velocity as a fraction of the colour scale, from −1 to 1; positive is flow
//      toward the transducer (the beam), negative away. It is the flow velocity along the beam:
//      v · cos θ, then divided by the scale.
//   p  Doppler signal power from 0 to 1 (how much blood is moving, whichever way and however fast)
//   s  velocity variance from 0 to 1 (how disturbed the flow is)
// and returns [r, g, b, a] (a of 0: nothing to draw). The Spectrum mode has no colour.

export const THETA = 60;                               // beam-to-flow angle in degrees (the spectral header's θ)
export const COS_THETA = Math.cos(THETA * Math.PI / 180);

export const DOPPLER_MODES = [
  { id: 'spectrum', label: 'Spectrum', short: 'Spectrum' },
  { id: 'dirpower', label: 'Directional Power', short: 'Dir. power' },
  { id: 'variance', label: 'Variance', short: 'Variance' },
];
/** Power Doppler carries no direction, so Invert does nothing there. */
export const isDirectional = (mode) => mode === 'direction' || mode === 'dirpower' || mode === 'variance';

// A map is a list of [position, r, g, b] stops, baked into a 256-step table.
const bake = (stops) => {
  const t = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    let k = 1; while (k < stops.length - 1 && stops[k][0] < x) k++;
    const a = stops[k - 1], b = stops[k], f = Math.min(1, Math.max(0, (x - a[0]) / (b[0] - a[0])));
    for (let c = 0; c < 3; c++) t[i * 3 + c] = a[c + 1] + (b[c + 1] - a[c + 1]) * f;
  }
  return t;
};
// Toward the transducer: dark red, red, orange, yellow. Away: dark blue, blue, light blue, cyan.
const TOWARD = bake([[0, 70, 0, 0], [0.25, 150, 10, 10], [0.55, 235, 30, 20], [0.8, 255, 125, 20], [1, 255, 225, 95]]);
const AWAY = bake([[0, 0, 0, 70], [0.25, 10, 25, 150], [0.55, 25, 90, 235], [0.8, 20, 170, 255], [1, 110, 235, 255]]);
// Power Doppler: dim red through orange to yellow, whatever the direction.
const POWER = bake([[0, 90, 0, 0], [0.3, 190, 30, 10], [0.6, 250, 120, 10], [0.85, 255, 200, 30], [1, 255, 245, 145]]);
// Variance: the directional colour is mixed toward yellow (toward) or cyan (away), then green, then lime.
const VAR_TOWARD = bake([[0, 0, 0, 0], [0.4, 255, 220, 40], [0.75, 60, 215, 80], [1, 170, 245, 110]]);
const VAR_AWAY = bake([[0, 0, 0, 0], [0.4, 40, 210, 230], [0.75, 60, 215, 80], [1, 170, 245, 110]]);

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const at = (out, lut, x) => { const i = Math.round(clamp01(x) * 255) * 3; out[0] = lut[i]; out[1] = lut[i + 1]; out[2] = lut[i + 2]; return out; };
const tmp = [0, 0, 0];

/** Colour for one instant, written into out ([r, g, b, a]; a of 0: nothing to draw). invert swaps toward and away. */
export function dopplerColor(mode, { u = 0, p = 0, s = 0 }, invert = false, out = [0, 0, 0, 0]) {
  if (mode === 'power') { at(out, POWER, p); out[3] = smooth(0.02, 0.12, p); return out; }
  const toward = (invert ? -u : u) >= 0;
  const a = Math.abs(u);
  if (mode === 'dirpower') { at(out, toward ? TOWARD : AWAY, p); out[3] = smooth(0.02, 0.12, p) * smooth(0.03, 0.12, a); return out; }
  if (mode === 'direction' || mode === 'variance') {
    at(out, toward ? TOWARD : AWAY, a);
    if (mode === 'variance') {
      const f = smooth(0.04, 0.4, s);
      if (f > 0) { at(tmp, toward ? VAR_TOWARD : VAR_AWAY, s); for (let c = 0; c < 3; c++) out[c] += (tmp[c] - out[c]) * f; }
    }
    out[3] = smooth(0.03, 0.12, a);
    return out;
  }
  out[0] = out[1] = out[2] = out[3] = 0;
  return out;
}

/** The trace's power index: the pixel's signal strength, stretched so strong cores reach orange and yellow. */
export const powerIndex = (I) => (I * 1.25 > 1 ? 1 : I * 1.25);

/**
 * A CSS gradient of exactly the map the trace is drawn with, for the legend and the pill's swatch.
 * Directional Power: away (left) to toward (right), weak at the middle and strong at the ends.
 * Variance: steady flow to turbulent flow, in the toward color.
 */
export function legendGradient(mode, invert = false) {
  const n = 11, out = [];
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1), u = 2 * x - 1 || 0.001;
    const c = mode === 'dirpower' ? dopplerColor('dirpower', { u, p: Math.abs(u) }, invert)
      : dopplerColor('variance', { u: 0.6, s: x }, invert);
    const k = c[3] < 0.5 ? [0, 0, 0] : c;
    out.push(`rgb(${k[0] | 0},${k[1] | 0},${k[2] | 0}) ${(x * 100).toFixed(0)}%`);
  }
  return `linear-gradient(90deg,${out.join(',')})`;
}

/** Paints the Variance legend on a canvas: direction across (away to toward), variance up (steady to turbulent). */
export function drawVarianceLegend(cv, invert = false) {
  const ctx = cv.getContext('2d'), { width: W, height: H } = cv, im = ctx.createImageData(W, H), c = [0, 0, 0, 0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = ((x + 0.5) / W * 2 - 1) * 0.9, s = 1 - (y + 0.5) / H;
    dopplerColor('variance', { u: Math.abs(u) < 0.2 ? Math.sign(u || 1) * 0.2 : u, s }, invert, c);
    const q = (y * W + x) * 4;
    im.data[q] = c[0]; im.data[q + 1] = c[1]; im.data[q + 2] = c[2]; im.data[q + 3] = 255;
  }
  ctx.putImageData(im, 0, 0);
}
