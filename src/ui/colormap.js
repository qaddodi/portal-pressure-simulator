// Perceptually uniform pressure colormap interpolated in OKLab (blueprint §5.3).

const STOPS = [
  [0, '#DCEBF7'], [5, '#7CC4E4'], [10, '#6A7FD8'], [12, '#8E4FC4'], [20, '#C0307A'], [30, '#6E0B3A'],
];
export const PRESSURE_TICKS = [
  [0, 'RA / collapse'], [5, 'Upper normal'], [10, 'CSPH'], [12, 'Bleeding threshold'], [20, 'High-risk'], [30, 'Extreme'],
];

const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const delin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function rgb2oklab([r, g, b]) {
  r = lin(r); g = lin(g); b = lin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function oklab2rgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [r, g, bb].map((c) => Math.round(Math.min(1, Math.max(0, delin(c))) * 255));
}

const LAB = STOPS.map(([p, h]) => [p, rgb2oklab(hex2rgb(h))]);
const LUT_N = 256, LUT_MAX = 35;
const LUT = [];
for (let i = 0; i < LUT_N; i++) {
  const p = (i / (LUT_N - 1)) * LUT_MAX;
  let k = 0;
  while (k < LAB.length - 2 && p > LAB[k + 1][0]) k++;
  const [p0, c0] = LAB[k], [p1, c1] = LAB[k + 1];
  const t = Math.min(1, Math.max(0, (p - p0) / (p1 - p0)));
  const [r, g, b] = oklab2rgb(c0.map((v, j) => v + (c1[j] - v) * t));
  LUT.push(`rgb(${r},${g},${b})`);
}

export function pressureColor(p) {
  const i = Math.round((Math.min(LUT_MAX, Math.max(0, p)) / LUT_MAX) * (LUT_N - 1));
  return LUT[i];
}

export function gradientCss(dir = 'to top', max = LUT_MAX) {
  const parts = [];
  for (let p = 0; p <= max; p += 2.5) parts.push(`${pressureColor(p)} ${(p / max) * 100}%`);
  return `linear-gradient(${dir}, ${parts.join(', ')})`;
}

// Diverging (change vs baseline): blue ← grey → red
export function deltaColor(d) {
  const t = Math.max(-1, Math.min(1, d / 12));
  const a = [45, 108, 223], z = [150, 150, 160], b = [210, 40, 70];
  const c = t < 0 ? a.map((v, i) => z[i] + (v - z[i]) * -t) : b.map((v, i) => z[i] + (v - z[i]) * t);
  return `rgb(${c.map(Math.round).join(',')})`;
}

export function dropColor(dp) {
  return pressureColor(Math.min(35, Math.abs(dp) * 2.5));
}
