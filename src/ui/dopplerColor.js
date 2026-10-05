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
  { id: 'spectrum', label: 'Spectrum' },
  { id: 'direction', label: 'Direction' },
  { id: 'power', label: 'Power' },
  { id: 'dirpower', label: 'Directional Power' },
  { id: 'variance', label: 'Variance' },
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
const at = (lut, x) => { const i = Math.round(clamp01(x) * 255) * 3; return [lut[i], lut[i + 1], lut[i + 2]]; };
const lerp = (c, d, f) => [c[0] + (d[0] - c[0]) * f, c[1] + (d[1] - c[1]) * f, c[2] + (d[2] - c[2]) * f];

/** Colour for one instant. invert swaps toward and away colours (the physiology is untouched). */
export function dopplerColor(mode, { u = 0, p = 0, s = 0 }, invert = false) {
  if (mode === 'power') return [...at(POWER, p), smooth(0.02, 0.12, p)];
  const toward = (invert ? -u : u) >= 0;
  const a = Math.abs(u);
  if (mode === 'dirpower') return [...at(toward ? TOWARD : AWAY, p), smooth(0.02, 0.12, p) * smooth(0.03, 0.12, a)];
  if (mode === 'direction' || mode === 'variance') {
    let c = at(toward ? TOWARD : AWAY, a);
    if (mode === 'variance') {
      const v = at(toward ? VAR_TOWARD : VAR_AWAY, s);
      c = lerp(c, v, smooth(0.04, 0.4, s));
    }
    return [...c, smooth(0.03, 0.12, a)];
  }
  return [0, 0, 0, 0];
}

/** A CSS gradient of the colour map for the legend: away (left) to toward (right), or weak to strong for Power. */
export function legendGradient(mode, invert = false) {
  const n = 9, out = [];
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1), u = 2 * x - 1 || 0.001;
    const c = mode === 'power' ? dopplerColor('power', { p: x })
      : mode === 'dirpower' ? dopplerColor('dirpower', { u, p: 0.85 }, invert)
      : dopplerColor('direction', { u }, invert);
    const k = c[3] < 0.5 ? [0, 0, 0] : c;
    out.push(`rgb(${k[0] | 0},${k[1] | 0},${k[2] | 0}) ${(x * 100).toFixed(0)}%`);
  }
  return `linear-gradient(90deg,${out.join(',')})`;
}
