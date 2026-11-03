// Perceptually uniform pressure colormap interpolated in OKLab (blueprint §5.3).
// Every ramp's stops are colour tokens (--ramp-* in styles/tokens.css); the tables are built on first use.

import { cssRamp, cssRGB } from './util.js';
import { velPos, velNormal, dopplerVel } from './velNormal.js';
// The scale shows absolute mean venous pressure at a vessel. Its ticks are plain numbers: no
// value on it is a clinical threshold (HVPG and other gradients are separate measurements).
export const PRESSURE_TICKS = [0, 10, 20, 30];

// (Every table below is built on first use, and a colour is looked up as a ready string: what a frame does here builds nothing. The
// working is scalar, in two small scratch lists, so building a table allocates only the colour strings it keeps.)
const hexDigit = (c) => (c <= 57 ? c - 48 : (c | 32) - 87);
const hexByte = (h, i) => hexDigit(h.charCodeAt(i)) * 16 + hexDigit(h.charCodeAt(i + 1));
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const delin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const ch255 = (c) => Math.round(Math.min(1, Math.max(0, delin(c))) * 255);
const rgbStr = (r, g, b) => `rgb(${r},${g},${b})`;   // alloc-rare: a colour's string is made once: a table's on first use, deltaColor's kept by its packed colour (only a channel outside 0-255, which is not kept, is made again)
const OKL = [0, 0, 0], RGB3 = [0, 0, 0];   // (scratch: an OKLab triple, an sRGB triple in 0–255)

/** sRGB (0–1 each) to OKLab, written into `out` (three slots). */
export function toOklab(r, g, b, out) {
  r = lin(r); g = lin(g); b = lin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  out[0] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  out[1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  out[2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return out;
}
/** OKLab to sRGB in whole numbers 0–255, written into `out` (three slots). */
export function fromOklab(L, a, b, out) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  out[0] = ch255(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  out[1] = ch255(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  out[2] = ch255(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return out;
}
// (The two above, as they were: a fresh triple per call, for a caller that keeps it.)
export const rgb2oklab = ([r, g, b]) => toOklab(r, g, b, [0, 0, 0]);   // alloc-rare: once per lens, mode or reference switch (legend-morph.js builds a key's stops and keeps each triple), never per frame
export const oklab2rgb = ([L, a, b]) => fromOklab(L, a, b, [0, 0, 0]);   // alloc-rare: once per lens, mode or reference switch (legend-morph.js writes a key's gradient), never per frame

// A ramp token's stops: positions and OKLab triples, in these two lists (RAMP_L three to a stop); returns how many stops.
const RAMP_P = [], RAMP_L = [];
function loadRamp(token) {
  const ramp = cssRamp(token);
  if (ramp.length < 2) throw new TypeError('a colour ramp needs two stops');
  for (let k = 0; k < ramp.length; k++) {
    const h = ramp[k][1];
    toOklab(hexByte(h, 1) / 255, hexByte(h, 3) / 255, hexByte(h, 5) / 255, OKL);
    RAMP_P[k] = ramp[k][0]; RAMP_L[3 * k] = OKL[0]; RAMP_L[3 * k + 1] = OKL[1]; RAMP_L[3 * k + 2] = OKL[2];
  }
  return ramp.length;
}
// n colours along the loaded ramp (m stops), from 0 to `top`, as ready strings in lut.
function fillLut(lut, m, n, top) {
  for (let i = 0; i < n; i++) {
    const p = (i / (n - 1)) * top;
    let k = 0;
    while (k < m - 2 && p > RAMP_P[k + 1]) k++;
    const p0 = RAMP_P[k], t = Math.min(1, Math.max(0, (p - p0) / (RAMP_P[k + 1] - p0))), j = 3 * k;
    const L = RAMP_L[j] + (RAMP_L[j + 3] - RAMP_L[j]) * t, A = RAMP_L[j + 1] + (RAMP_L[j + 4] - RAMP_L[j + 1]) * t, B = RAMP_L[j + 2] + (RAMP_L[j + 5] - RAMP_L[j + 2]) * t;
    fromOklab(L, A, B, RGB3);
    lut[i] = rgbStr(RGB3[0], RGB3[1], RGB3[2]);
  }
}

const LUT_N = 256, LUT_MAX = 35;
const LUT = [];
let lutBuilt = false;
function pressureLut() {
  fillLut(LUT, loadRamp('--ramp-pressure'), LUT_N, LUT_MAX);
  lutBuilt = true;
}

export function pressureColor(p) {
  if (!lutBuilt) pressureLut();
  return LUT[Math.round((Math.min(LUT_MAX, Math.max(0, p)) / LUT_MAX) * (LUT_N - 1))];
}

// A gradient is built once for each direction (and top) it is asked for and kept: the table it reads never changes.
const GRADS = new Map();   // direction -> (top -> css)
export function gradientCss(dir = 'to top', max = LUT_MAX) {
  let byMax = GRADS.get(dir);
  if (!byMax) GRADS.set(dir, byMax = new Map());   // alloc-rare: the first ask for a direction
  const kept = byMax.get(max);
  if (kept !== undefined) return kept;
  let css = `linear-gradient(${dir}, `;   // alloc-rare: the first ask for this direction and top, kept after
  for (let p = 0; p <= max; p += 2.5) css += `${p ? ', ' : ''}${pressureColor(p)} ${(p / max) * 100}%`;   // alloc-rare: the first ask for this direction and top, kept after
  css = `${css})`;   // alloc-rare: the first ask for this direction and top, kept after
  byMax.set(max, css);
  return css;
}

// Diverging (change vs baseline): blue ← grey → red. The three end colours' channels (low, mid, high) in a list; a colour seen before is
// handed back as its kept string (the rounded channels pack into one number).
const DELTA = [0, 0, 0, 0, 0, 0, 0, 0, 0], DELTA_STR = new Map();
let deltaReady = false;
function loadDelta() {
  const lo = cssRGB('--delta-low'), mid = cssRGB('--delta-mid'), hi = cssRGB('--delta-high');
  for (let i = 0; i < 3; i++) { DELTA[i] = lo[i]; DELTA[3 + i] = mid[i]; DELTA[6 + i] = hi[i]; }
  deltaReady = true;
}
export function deltaColor(d) {
  const t = Math.max(-1, Math.min(1, d / 12));
  if (!deltaReady) loadDelta();
  const e = t < 0 ? 0 : 6, f = t < 0 ? -t : t;   // (toward the low end below zero, the high end above)
  const r = Math.round(DELTA[3] + (DELTA[e] - DELTA[3]) * f), g = Math.round(DELTA[4] + (DELTA[e + 1] - DELTA[4]) * f), b = Math.round(DELTA[5] + (DELTA[e + 2] - DELTA[5]) * f);
  if ((r & 255) !== r || (g & 255) !== g || (b & 255) !== b) return rgbStr(r, g, b);   // (a channel outside 0–255, or not a number: not kept)
  const key = (r << 16) | (g << 8) | b;
  let str = DELTA_STR.get(key);
  if (str === undefined) { str = rgbStr(r, g, b); DELTA_STR.set(key, str); }
  return str;
}


// ── Data layers (city-builder style views of the same network) ──────────────
// Each is a sequential scale interpolated in OKLab, like the pressure map.
function makeScale(token) {
  const lut = [];
  let built = false;
  const cssKept = new Map();   // direction -> css
  const at = (u) => {
    if (!built) { fillLut(lut, loadRamp(token), 128, 1); built = true; }
    return lut[Math.round(Math.min(1, Math.max(0, u)) * 127)];
  };
  // (The bar's gradient is built once for each direction asked and kept: the table never changes.)
  at.css = (dir = 'to right') => {
    const kept = cssKept.get(dir);
    if (kept !== undefined) return kept;
    let css = `linear-gradient(${dir}, `;   // alloc-rare: the first ask for this direction, kept after
    for (let i = 0; i <= 10; i++) css += `${i ? ', ' : ''}${at(i / 10)} ${i * 10}%`;   // alloc-rare: the first ask for this direction, kept after
    css = `${css})`;   // alloc-rare: the first ask for this direction, kept after
    cssKept.set(dir, css);
    return css;
  };
  return at;
}

// Flow volume, L/min on a log scale from 0.02 to 6: soft sage (a trickle) to deep blue (the
// cavae). The low end stays dark enough to read against the light plate.
export const FLOW_MIN = 0.02, FLOW_MAX = 6;
const flowScale = makeScale('--ramp-flow');
export const flowPos = (lpm) => Math.log10(Math.max(FLOW_MIN, lpm) / FLOW_MIN) / Math.log10(FLOW_MAX / FLOW_MIN);
export const flowColor = (lpm) => flowScale(flowPos(lpm));
export const flowCss = (dir) => flowScale.css(dir);

// Mean velocity against the vessel's normal range (velNormal.js), as the Doppler reads it, on one continuous scale:
// teal at the middle of the normal range, shading toward sand as it falls below normal and deepening toward violet as
// it rises above (deepest at twice the top of the range). The further outside normal, the stronger the colour, and
// red never means slow. A vessel with no normal (a collateral, a surgical shunt) stays neutral.
const velScale = makeScale('--ramp-velocity');
export const velocityColor = (v, normal) => (normal ? velScale(velPos(v, normal)) : 'var(--lens-neutral)');
// Vessel k of frame f against its normal (velNormal.js), with the healthy frame for the veins no range covers.
export const velColorOf = (f, k, healthy) => velocityColor(dopplerVel(f, k), velNormal(k, f, healthy));
// The key's bar: the same continuous gradient.
export const velocityCss = (dir) => velScale.css(dir);

// Congestion heat: pressure above the reference, 0 to 15 mmHg. Neutral grey when none.
export const HEAT_MAX = 15;
const heatScale = makeScale('--ramp-heat');
export const heatColor = (d) => heatScale(Math.max(0, d) / HEAT_MAX);
export const heatCss = (dir) => heatScale.css(dir);

// Pressure drop across a vessel, 0 to 12+ mmHg: its own green ramp, so switching from Pressure
// visibly changes the figure (pale = no resistance, deep green = where the resistance lives).
export const DROP_MAX = 12;
const dropScale = makeScale('--ramp-drop');
export const dropColor = (dp) => dropScale(Math.abs(dp) / DROP_MAX);
export const dropCss = (dir) => dropScale.css(dir);

// Oxygen saturation, 60 to 100 %: deoxygenated blue (hepatic venous blood, about 65 %) through to oxygenated
// cerise (arterial, 98 %), the textbook convention of blue veins and red arteries.
export const OXY_MIN = 0.6;
const oxyScale = makeScale('--ramp-oxygen');
export const oxygenPos = (s) => Math.min(1, Math.max(0, (s - OXY_MIN) / (1 - OXY_MIN)));
export const oxygenColor = (s) => oxyScale(oxygenPos(s));
export const oxygenCss = (dir) => oxyScale.css(dir);
