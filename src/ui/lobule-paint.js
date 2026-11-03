// The lobule's tissue as the lobule view paints it into its bitmap (lobule-zoom.js paintWorld): the plates, the zones, the collagen
// of fibrosis and cirrhosis, the stellate cells and the nutmeg of congestion. Kept apart from the view, with no page and no styles
// in it: it draws through a 2D-context API that paint-gl.js records and the GPU paints (1 Nov 2026, nothing off the GPU), from
// the same plain values (the view's worldInput).

import { cordToneInto, bandOutlineFlat } from './lobule-look.js';

const TAU = Math.PI * 2;
const TONE = [0, 0, 0];   // (a cell's tone, written anew for each cell and read at once)
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));   // (as util.js clamp)
// A band's centre line along the septum's points o.pts, written into out (the `path` of a band's options: (o, u, out)).
function septumPath(o, u, out) {
  const pts = o.pts, f = clamp(u, 0, 1) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), t = f - i;
  out[0] = lerp(pts[i][0], pts[i + 1][0], t); out[1] = lerp(pts[i][1], pts[i + 1][1], t);
}
export const css = (a, al = 1) => `rgba(${Math.round(a[0] * 255)},${Math.round(a[1] * 255)},${Math.round(a[2] * 255)},${al})`;   // alloc-rare: only a context without setFillRGBA / setStrokeRGBA (a test's stand-in) comes here; the recorder (paint-gl.js PaintRecorder) takes the numbers
/** The fill (or stroke) colour a (r, g, b in 0 ... 1) at alpha al, handed to the recorder as numbers: the colour css(a, al) names, with no text. */
function fillRGB(c, a, al) { if (c.setFillRGBA) c.setFillRGBA(Math.round(a[0] * 255), Math.round(a[1] * 255), Math.round(a[2] * 255), al); else c.fillStyle = css(a, al); }
function strokeRGB(c, a, al) { if (c.setStrokeRGBA) c.setStrokeRGBA(Math.round(a[0] * 255), Math.round(a[1] * 255), Math.round(a[2] * 255), al); else c.strokeStyle = css(a, al); }

// The colour tokens the painting reads (a token, optionally with an alpha): on the page the live tokens (lobule-zoom.js tk), in the
// worker the same tokens' values, sent with each job (TOKENS, tokenReader).
let tk = () => { throw new Error('lobule-paint: no tokens'); };
export const useTokens = (f) => { tk = f; };
/** Every token the painting reads (the worker is sent exactly these). */
export const TOKENS = ['--lz-plate-line', '--lz-nodule-ink', '--lz-nutmeg', '--lz-zone-1', '--lz-zone-2', '--lz-zone-3', '--lz-zone-line', '--lz-hsc-body', '--lz-hsc-nucleus', '--lz-nodule-shadow', '--lz-shade'];
/** A reader over sent values ({ name: [value, [r, g, b]] }) that gives the same strings as util.js cssVar and cssAlpha. */
export const tokenReader = (T) => (n, a) => {
  const t = T[n];
  if (!t) throw new Error(`lobule-paint: token ${n} not sent`);
  return a === undefined ? t[0] : `rgba(${t[1].join(',')},${a})`;
};

// A fibrous septum, the way it looks under the microscope: a band of pale collagen, uneven in
// width, soft at its edges, swelling where it leaves a portal tract, with wavy fibres running along
// it and a few spindle-shaped fibroblast nuclei. Drawn once into a cached canvas, never per frame.
// A, B: ends; w: mean width; e0, e1: width at each end (1.5 at a tract, ~0.2 for a septum that
// stops in the parenchyma); seed: a fixed number so the same septum always looks the same;
// detail: 0 … 1, fewer fibres and no nuclei when small on screen.
export const fibHash = (i) => { let q = (i * 374761393 + 668265263) >>> 0; q = ((q ^ (q >>> 13)) * 1274126177) >>> 0; return (q >>> 8) / 16777216; };
/** A band's centre line and widths: 27 samples (n = 26), each with its point P, unit normal N and width Wd; L0, the chord's length. */
export function bandGeom(A, B, { w, seed = 0, e0 = 1.5, e1 = 1.5, amp = 0, path = null }) {
  const n = 26, P = [], N = [], Wd = [];
  const ph = fibHash(seed) * TAU, ph2 = fibHash(seed + 9) * TAU;
  const dx = B[0] - A[0], dy = B[1] - A[1], L0 = Math.hypot(dx, dy) || 1;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    if (path) P.push(path(u));
    else { const e = amp * Math.sin(Math.PI * u) * (0.75 * Math.sin(3 * Math.PI * u + ph) + 0.25 * Math.sin(7 * Math.PI * u + ph2)); P.push([A[0] + dx * u - (dy / L0) * e, A[1] + dy * u + (dx / L0) * e]); }
  }
  for (let i = 0; i <= n; i++) {
    const p = P[Math.max(0, i - 1)], q = P[Math.min(n, i + 1)], ex = q[0] - p[0], ey = q[1] - p[1], L = Math.hypot(ex, ey) || 1, u = i / n;
    N.push([-ey / L, ex / L]);
    const lump = 0.78 + 0.22 * Math.sin(TAU * 1.4 * u + ph) + 0.14 * Math.sin(TAU * 3.3 * u + ph2);
    const end = 1 + (e0 - 1) * Math.max(0, 1 - u * 3) ** 2 + (e1 - 1) * Math.max(0, u * 3 - 2) ** 2;
    Wd.push(Math.max(0, w * lump * end));
  }
  return { n, P, N, Wd, L0 };
}
/**
 * bandGeom written into `g`, an object the caller keeps: { P, N, Wd } flat Float64Arrays (P and N hold x, y pairs: 27 points, 54 numbers; Wd 27),
 * then n and L0 set. The same numbers bandGeom gives, with no array made. `opt` is bandGeom's ({ w, seed, e0, e1, amp }, each already
 * set), and `pathFn(opt, u, out)`, when given, writes the centre line's point at u into out (out[0], out[1]) as opt.path did.
 */
export function bandGeomInto(g, A, B, opt, pathFn) {
  const { w, seed = 0, e0 = 1.5, e1 = 1.5, amp = 0 } = opt, n = 26, P = g.P, N = g.N, Wd = g.Wd, T = TMP2;
  const ph = fibHash(seed) * TAU, ph2 = fibHash(seed + 9) * TAU;
  const dx = B[0] - A[0], dy = B[1] - A[1], L0 = Math.hypot(dx, dy) || 1;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    if (pathFn) { pathFn(opt, u, T); P[2 * i] = T[0]; P[2 * i + 1] = T[1]; }
    else { const e = amp * Math.sin(Math.PI * u) * (0.75 * Math.sin(3 * Math.PI * u + ph) + 0.25 * Math.sin(7 * Math.PI * u + ph2)); P[2 * i] = A[0] + dx * u - (dy / L0) * e; P[2 * i + 1] = A[1] + dy * u + (dx / L0) * e; }
  }
  for (let i = 0; i <= n; i++) {
    const a = 2 * Math.max(0, i - 1), b = 2 * Math.min(n, i + 1), ex = P[b] - P[a], ey = P[b + 1] - P[a + 1], L = Math.hypot(ex, ey) || 1, u = i / n;
    N[2 * i] = -ey / L; N[2 * i + 1] = ex / L;
    const lump = 0.78 + 0.22 * Math.sin(TAU * 1.4 * u + ph) + 0.14 * Math.sin(TAU * 3.3 * u + ph2);
    const end = 1 + (e0 - 1) * Math.max(0, 1 - u * 3) ** 2 + (e1 - 1) * Math.max(0, u * 3 - 2) ** 2;
    Wd[i] = Math.max(0, w * lump * end);
  }
  g.n = n; g.L0 = L0;
  return g;
}
const TMP2 = [0, 0];
/** bandFibre written into `out` (an object the caller keeps); returns out. */
export function bandFibreInto(out, seed, f, w, n = 26) {
  out.off = (fibHash(seed * 31 + f) - 0.5) * 0.9; out.fp = fibHash(seed * 17 + f) * TAU; out.wav = 0.05 + 0.08 * fibHash(seed * 7 + f);
  const u0 = fibHash(seed * 13 + f) * 0.25, u1 = 1 - fibHash(seed * 19 + f) * 0.25;
  out.iA = Math.floor(u0 * n); out.iB = Math.ceil(u1 * n); out.lw = Math.max(0.45, w * (0.035 + 0.03 * fibHash(seed * 5 + f))); out.deep = f % 3 === 0;
  return out;
}
/** bandNucleus of a band made by bandGeomInto, written into `out` (an object the caller keeps); returns out. */
export function bandNucleusInto(out, g, seed, k, w) {
  const { n, P, N, Wd } = g;
  const i = Math.min(n - 1, Math.max(1, Math.round(fibHash(seed * 41 + k) * n))), h = Wd[i] * (fibHash(seed * 43 + k) - 0.5) * 0.7;
  out.x = P[2 * i] + N[2 * i] * h; out.y = P[2 * i + 1] + N[2 * i + 1] * h; out.rx = Math.max(0.8, w * 0.16); out.ry = Math.max(0.35, w * 0.045); out.ang = Math.atan2(N[2 * i], -N[2 * i + 1]);
  return out;
}
/** Fibre f of a band: its offset across the band (in widths), phase, waviness, where along it (samples iA … iB) and how thick (world units). */
export function bandFibre(seed, f, w, n = 26) {
  const off = (fibHash(seed * 31 + f) - 0.5) * 0.9, fp = fibHash(seed * 17 + f) * TAU, wav = 0.05 + 0.08 * fibHash(seed * 7 + f);
  const u0 = fibHash(seed * 13 + f) * 0.25, u1 = 1 - fibHash(seed * 19 + f) * 0.25;
  return { off, fp, wav, iA: Math.floor(u0 * n), iB: Math.ceil(u1 * n), lw: Math.max(0.45, w * (0.035 + 0.03 * fibHash(seed * 5 + f))), deep: f % 3 === 0 };
}
/** How many fibres a band has, and how many nuclei (0 when it is too small on screen or too narrow to show them). */
export const bandFibreCount = (w, detail = 1) => (detail <= 0 || w < 1.2 ? 0 : Math.round((3 + Math.min(7, w / 1.6)) * detail));
export const bandNucleiCount = (g, w, detail = 1) => (detail <= 0 || w < 1.2 || detail < 0.6 || w < 3 ? 0 : Math.round((g.L0 / (w * 2.6)) * detail));
/** Nucleus k of a band: its centre, half axes and angle. */
export function bandNucleus(g, seed, k, w) {
  const { n, P, N, Wd } = g;
  const i = Math.min(n - 1, Math.max(1, Math.round(fibHash(seed * 41 + k) * n))), h = Wd[i] * (fibHash(seed * 43 + k) - 0.5) * 0.7;
  return { x: P[i][0] + N[i][0] * h, y: P[i][1] + N[i][1] * h, rx: Math.max(0.8, w * 0.16), ry: Math.max(0.35, w * 0.045), ang: Math.atan2(N[i][0], -N[i][1]) };
}
// The band being drawn, kept: its geometry (flat), a fibre and a nucleus, the two passes' fibre colours, and the points of a bundle's ends.
const GB = { P: new Float64Array(54), N: new Float64Array(54), Wd: new Float64Array(27), n: 26, L0: 1 };
const FB = { off: 0, fp: 0, wav: 0, iA: 0, iB: 0, lw: 0, deep: false }, NB = { x: 0, y: 0, rx: 0, ry: 0, ang: 0 };
const LITE = [0, 0, 0], DEEP = [0, 0, 0], DEEP_K = [0.78, 0.74, 0.7], PASS_K = [2.1, 1.45, 1], PASS_A = [0.12, 0.24, 0.5];
const BA = [0, 0], BB = [0, 0];
/** o: { w, rgb, a, seed, e0, e1, amp, detail, path } as before, but a `path` is (o, u, out): it writes the centre line's point at u into out. */
export function fibrousBand(c, A, B, o) {
  const { w, rgb, a = 1, seed = 0, detail = 1 } = o, g = bandGeomInto(GB, A, B, o, o.path || null), n = g.n, P = g.P, N = g.N, Wd = g.Wd;
  // (Round ends, so bands meeting at a tract blend; the widest, faintest pass narrows to the middle one's width at the
  // ends, so it leaves no outer halo round the tract.)
  // Soft edges: the band laid down in three passes, wide and faint to narrow and dense.
  const sb = c.shadowBlur;   // a shade (set by the caller) is cast by the faint outer pass only
  for (let q = 0; q < 3; q++) { const k = PASS_K[q]; fillRGB(c, rgb, PASS_A[q] * a); bandOutlineFlat(c, P, N, Wd, k, Math.min(k, 1.45)); c.fill(); c.shadowBlur = 0; }
  c.shadowBlur = sb;
  if (detail <= 0 || w < 1.2) return;
  // Fibres: thin wavy strands along the band, some brighter, some deeper.
  for (let j = 0; j < 3; j++) { LITE[j] = rgb[j] + (1 - rgb[j]) * 0.45; DEEP[j] = rgb[j] * DEEP_K[j]; }
  const nf = bandFibreCount(w, detail);
  c.lineCap = 'round'; c.shadowBlur = 0;
  for (let f = 0; f < nf; f++) {
    const { off, fp, wav, iA, iB, lw, deep: isDeep } = bandFibreInto(FB, seed, f, w, n);
    strokeRGB(c, isDeep ? DEEP : LITE, (isDeep ? 0.32 : 0.55) * a);
    c.lineWidth = lw;
    c.beginPath();
    for (let i = iA; i <= iB; i++) {
      const u = i / n, h = Wd[i] * (off + wav * Math.sin(TAU * 4 * u + fp));
      c[i === iA ? 'moveTo' : 'lineTo'](P[2 * i] + N[2 * i] * h, P[2 * i + 1] + N[2 * i + 1] * h);
    }
    c.stroke();
  }
  if (detail < 0.6 || w < 3) { c.shadowBlur = sb; return; }
  // Fibroblast nuclei: small dark spindles lying along the fibres.
  const nn = bandNucleiCount(g, w, detail);
  c.fillStyle = tk('--lz-shade', 0.32 * a);
  for (let k = 0; k < nn; k++) {
    const { x, y, rx, ry, ang } = bandNucleusInto(NB, g, seed, k, w);
    c.beginPath(); c.ellipse(x, y, rx, ry, ang, 0, TAU); c.fill();
  }
  c.shadowBlur = sb;
}

// Visual scar growth is eased independently of the physiology and stays close to the vessels.
export const scarGrowth = (fibrosis) => clamp(fibrosis, 0, 1) ** 1.1;

// Portal fibrosis has a compact circular footprint with interwoven collagen inside.
// Cached with the tissue; fixed seeds keep the texture still as pressure changes.
// A tract's bundle k: its options (kept) and its centre line in the tract's own frame (rx, ry: the tract's radius), written into out.
const TRACT_O = { w: 0, rgb: null, a: 1, e0: 0.2, e1: 0.25, seed: 0, detail: 1, path: tractPath, a0: 0, span: 0, r0: 0, phase: 0, rx: 0, ry: 0 };
function tractPath(o, u, out) {
  const a = o.a0 + o.span * u, r = o.r0 + 0.09 * Math.sin(5 * a + o.phase) + 0.12 * Math.sin(Math.PI * u);
  out[0] = Math.cos(a) * o.rx * r; out[1] = Math.sin(a) * o.ry * r;
}
export function fibrousTract(c, x, y, radius, angle, rgb, fibrosis, seed, detail = 1) {
  c.save(); c.translate(x, y); c.rotate(angle);
  const rx = radius, ry = radius;
  const phase = fibHash(seed) * TAU;
  c.beginPath(); c.arc(0, 0, radius, 0, TAU);
  fillRGB(c, rgb, fibrosis * 0.24); c.fill(); c.clip();
  // Broken curving bundles cross each other instead of forming a circular halo.
  const count = Math.round(10 * detail), o = TRACT_O;
  for (let k = 0; k < count; k++) {
    const sd = seed + k * 37;
    o.a0 = fibHash(sd) * TAU; o.span = 1.2 + 2 * fibHash(sd + 1); o.r0 = 0.25 + 0.65 * fibHash(sd + 2); o.phase = phase; o.rx = rx; o.ry = ry;
    o.w = radius * (0.08 + 0.085 * fibrosis) * (0.7 + fibHash(sd + 3)); o.rgb = rgb; o.a = Math.min(1, fibrosis * (0.75 + 0.35 * fibHash(sd + 4))); o.seed = sd; o.detail = detail;
    tractPath(o, 0, BA); tractPath(o, 1, BB);
    fibrousBand(c, BA, BB, o);
  }
  c.restore();
}

// Perivenular collagen: overlapping curved bundles rather than a smooth, solid disc.
// Like the bridging bands, this texture is painted only into the cached tissue bitmap.
// A collar's bundle: its options (kept) and its centre line round (cx, cy), written into out.
const CUFF_O = { w: 0, rgb: null, a: 1, e0: 0.45, e1: 0.5, seed: 0, path: cuffPath, cx: 0, cy: 0, a0: 0, span: 0, r0: 0, th: 0 };
function cuffPath(o, u, out) {
  const a = o.a0 + o.span * u, r = o.r0 + o.th * 0.1 * Math.sin(a * 5 + fibHash(o.seed + 5) * TAU);
  out[0] = o.cx + Math.cos(a) * r; out[1] = o.cy + Math.sin(a) * r;
}
// The collar's wavy outer edge and its inner circle, as one path on c (drawn evenodd).
function cuffAnnulus(c, cx, cy, inner, outer) {
  c.beginPath();
  for (let i = 0; i <= 80; i++) {
    const a = TAU * i / 80, r = outer * (1 + 0.035 * Math.sin(3 * a) + 0.025 * Math.sin(7 * a + 0.8));
    c[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  c.closePath(); c.moveTo(cx + inner, cy); c.arc(cx, cy, inner, 0, TAU); c.closePath();
}
export function fibrousCuff(c, cx, cy, inner, outer, rgb, fibrosis) {
  c.save();
  cuffAnnulus(c, cx, cy, inner, outer); fillRGB(c, rgb, 0.4 * fibrosis); c.fill('evenodd'); c.clip('evenodd');
  const thickness = outer - inner, o = CUFF_O;
  for (let ring = 0; ring < 3; ring++) for (let k = 0; k < 6; k++) {
    const seed = 211 + ring * 17 + k;
    o.cx = cx; o.cy = cy; o.a0 = TAU * k / 6 + ring * 0.27; o.span = TAU / 6 * (1.2 + 0.5 * fibHash(seed)); o.r0 = inner + thickness * (0.18 + ring * 0.3); o.th = thickness;
    o.w = thickness * 0.34; o.rgb = rgb; o.a = Math.min(1, 1.0 * fibrosis); o.seed = seed;
    cuffPath(o, 0, BA); cuffPath(o, 1, BB);
    fibrousBand(c, BA, BB, o);
  }
  c.restore();
}

// Kept for the painting: a colour in the middle of a mix, a cell's base and tone, the stellate strands' points, the options of a septum's
// band, the middle of a short septum, the tract corners already drawn, and the tables the loops read.
const MIXC = [0, 0, 0], BASE = [0, 0, 0], CT = [0, 0, 0], DEAD_DARK = [0.42, 0.33, 0.3], DEAD_LIGHT = [0.93, 0.86, 0.72];
const PRE_DARK = [0.86, 0.78, 0.6], PRE_LIGHT = [0.78, 0.64, 0.44], SPURS = [1, 3, 5], ZONE_K = [1, 0.66, 0.36], ZONE_TOK = ['--lz-zone-1', '--lz-zone-2', '--lz-zone-3'];
const SP = new Float64Array(33), PM = [0, 0];
const SO = { w: 0, rgb: null, a: 1, e0: 1.5, e1: 1.5, amp: 0, seed: 0, pts: null, path: null };
function hexPath(c, l, k = 1) {
  c.beginPath();
  for (let i = 0; i < l.corners.length; i++) { const px = l.x + (l.corners[i][0] - l.x) * k, py = l.y + (l.corners[i][1] - l.y) * k; if (i) c.lineTo(px, py); else c.moveTo(px, py); }
  c.closePath();
}
// A band's options set in place (every field, so none of the last band's is left): a plain septum has no path, e0 is 1.5.
function septumOpt(w, rgb, a, e1, amp, seed, pts) { const o = SO; o.w = w; o.rgb = rgb; o.a = a; o.e0 = 1.5; o.e1 = e1; o.amp = amp; o.seed = seed; o.pts = pts; o.path = pts ? septumPath : null; return o; }
// A tapered strand of a stellate cell: from (x0, y0) along the wall, bowing toward the sinusoid, width w0 -> 0 (points in SP: x, y, width).
function strand(c, k, rs0, x0, y0, sgn, len, w0, bow) {
  const ux = Math.cos(k.a) * sgn, uy = Math.sin(k.a) * sgn, n = 10;
  for (let i = 0; i <= n; i++) { const u = i / n, b = bow * Math.sin(Math.PI * u * 0.8) * rs0; SP[3 * i] = x0 + ux * len * u - k.nx * b; SP[3 * i + 1] = y0 + uy * len * u - k.ny * b; SP[3 * i + 2] = w0 * (1 - u) ** 1.3; }
  c.moveTo(SP[0] + k.nx * SP[2], SP[1] + k.ny * SP[2]);
  for (let i = 0; i <= n; i++) c.lineTo(SP[3 * i] + k.nx * SP[3 * i + 2], SP[3 * i + 1] + k.ny * SP[3 * i + 2]);
  for (let i = n; i >= 0; i--) c.lineTo(SP[3 * i] - k.nx * SP[3 * i + 2], SP[3 * i + 1] - k.ny * SP[3 * i + 2]);
  c.closePath();
}

// The lobule in world space (plates, septa, tracts, lymph): drawn into the cached bitmap. P: the view's plain values (lobule-zoom.js
// worldInput): m, the model's tissue values; G, the lobule's shape; dark, zonesOn; rgb, its colours; sin, the sinusoids' paths and
// calibers; cvIn, the central vein's. (Drawn again on every step of a fibrosis or cirrhosis drag, so it makes no array, object or closure.)
export function paintLobule(c, P) {
  const { m, G, dark, zonesOn, rgb } = P, { R, cx, cy, lobules } = G;
  { const l = lobules[0], bq = rgb.bg, gq = rgb.gap; for (let i = 0; i < 3; i++) MIXC[i] = lerp(bq[i], gq[i], 0.55); fillRGB(c, MIXC, 1); c.beginPath(); for (let i = 0; i < l.corners.length; i++) { const px = l.x + (l.corners[i][0] - l.x) * 1.015, py = l.y + (l.corners[i][1] - l.y) * 1.015; if (i) c.lineTo(px, py); else c.moveTo(px, py); } c.closePath(); c.fill(); }
  const gap = rgb.gap, cell = rgb.cell;
  const COL = rgb.col;   // (light and Soft: a deeper tan than the collagen token, to read on the pale cells)
  const PRE = dark ? PRE_DARK : PRE_LIGHT;   // periportal scar: deeper than COL to read on the tissue
  const DIS = rgb.dis;   // (the space of Disse's lining keeps the paler collagen)
  // The lobule's own plates: hepatocytes in radial cords, one cell thick.
  const main = lobules[0];
  hexPath(c, main); fillRGB(c, gap, dark ? 0.55 : 0.5); c.fill();
  c.save(); hexPath(c, main); c.clip();
  const cu = m.congU;
  // Each cell's membrane: a 0.6 px line where neighbouring cells meet, so a cord reads as a row of cells (G21).
  c.strokeStyle = tk('--lz-plate-line'); c.lineWidth = Math.max(0.6, 0.6 / (c.getTransform().a || 1));
  for (let ci = 0; ci < G.cells.length; ci++) {
    const k = G.cells[ci];
    const z3 = k.q < 0.4, dead = z3 && cu > 0.12 && k.drop < cu * (1.25 - k.q * 1.6);
    const t = 0.88 + 0.12 * k.tone;
    let base = cell;
    if (dark) { for (let i = 0; i < 3; i++) BASE[i] = lerp(gap[i], cell[i], 0.28); base = BASE; }
    // (Zone 3, by the central vein, deeper and warmer than zone 1: cordTone.)
    let fill;
    if (dead) fill = dark ? DEAD_DARK : DEAD_LIGHT;
    else { for (let i = 0; i < 3; i++) CT[i] = base[i] * t + (1 - t) * (dark ? 0.15 : 1) * 0.3; fill = cordToneInto(TONE, CT, k.q, dark); }
    // In cirrhosis the plates thicken and lose their order (regenerating nodules).
    const sj = m.septU, dz = sj * Math.min(k.l, k.w) * 0.45;
    c.save(); c.translate(k.x + k.jx * dz, k.y + k.jy * dz); c.rotate(k.a + k.ja * sj * 0.9);
    const lw = (dead ? k.l * 0.7 : k.l) * (1 + 0.12 * sj), ww = (dead ? k.w * 0.7 : k.w) * (1 + 0.3 * sj);
    fillRGB(c, fill, dead ? 0.6 : dark ? 0.8 : 0.92);
    c.beginPath(); if (c.roundRect) c.roundRect(-lw / 2, -ww / 2, lw, ww, Math.min(lw, ww) * 0.38); else c.rect(-lw / 2, -ww / 2, lw, ww); c.fill();
    if (!dead) c.stroke();
    if (!dead) { c.fillStyle = tk('--lz-nodule-ink'); c.beginPath(); c.arc(k.nu * lw, 0, Math.max(0.9, ww * 0.16), 0, TAU); c.fill(); }
    c.restore();
  }
  // Zone 3 congestion: blood pooling around the central vein (nutmeg).
  if (cu > 0.04) {
    const gr = c.createRadialGradient(cx, cy, R * 0.05, cx, cy, R * 0.55);
    gr.addColorStop(0, tk('--lz-nutmeg', 0.5 * cu)); gr.addColorStop(0.6, tk('--lz-nutmeg', 0.22 * cu)); gr.addColorStop(1, tk('--lz-nutmeg', 0));
    c.fillStyle = gr; c.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  }
  // Zones of the acinus (toggle): hexagonal bands from the triads (1) to the central vein (3).
  if (zonesOn) {
    for (let i = 0; i < 3; i++) { hexPath(c, main, ZONE_K[i]); c.fillStyle = tk(ZONE_TOK[i], dark ? 0.2 : 0.17); c.fill(); }
    c.lineWidth = 1; c.strokeStyle = tk('--lz-zone-line');
    hexPath(c, main, 0.66); c.stroke(); hexPath(c, main, 0.36); c.stroke();
  }
  // Space of Disse collagen (capillarization) along every sinusoid.
  if (m.fibSin > 0.05) {
    strokeRGB(c, DIS, 0.75 * m.fibSin); c.lineCap = 'round'; c.lineJoin = 'round';
    for (let si = 0; si < P.sin.length; si++) {
      const t = P.sin[si];
      c.lineWidth = 2 * t.r + 2 + 3.5 * m.fibSin;
      c.beginPath(); for (let i = 0; i < t.pts.length; i++) { if (i) c.lineTo(t.pts[i][0], t.pts[i][1]); else c.moveTo(t.pts[i][0], t.pts[i][1]); } c.stroke();
    }
  }
  // Stellate (Ito) cells, in the space of Disse between a plate and its sinusoid: shown once fibrosis
  // starts, when they activate. A spindle-shaped body lying along the sinusoid, with long thin
  // processes hugging its wall; activated (myofibroblasts), they grow, darken and lay down collagen.
  if (m.act > 0.08) {
    const a = m.act, L = G.rs0 * (2.4 + 1.4 * a), Wb = G.rs0 * (0.42 + 0.2 * a);
    const body = tk('--lz-hsc-body', (0.22 + 0.3 * a).toFixed(3)), nuc = tk('--lz-hsc-nucleus', (0.3 + 0.3 * a).toFixed(3));
    for (let hi = 0; hi < G.hsc.length; hi++) {
      const k = G.hsc[hi];
      const ux = Math.cos(k.a), uy = Math.sin(k.a);
      c.fillStyle = body; c.beginPath();
      // Body: a slender spindle, its ends drawn out into the processes along the sinusoid.
      c.ellipse(k.x, k.y, L * 0.6, Wb, k.a, 0, TAU);
      for (let sg = 0; sg < 2; sg++) {
        const sgn = sg ? 1 : -1;
        const x0 = k.x + ux * sgn * L * 0.45, y0 = k.y + uy * sgn * L * 0.45;
        strand(c, k, G.rs0, x0, y0, sgn, L * (2 + 0.6 * a), Wb * 0.55, 0.45);
        strand(c, k, G.rs0, x0, y0, sgn, L * (1.1 + 0.4 * a), Wb * 0.35, -0.25);   // a finer branch on the plate side
      }
      c.fill();
      c.fillStyle = nuc; c.beginPath(); c.ellipse(k.x, k.y, L * 0.26, Wb * 0.5, k.a, 0, TAU); c.fill();
    }
  }
  c.restore();
  // Bridging septa in cirrhosis: fibrous bands along the borders (portal-portal) and, later, from
  // the triads to the central vein (portal-central), cutting the lobule into rounded nodules.
  const su = m.septU;
  if (su > 0) {
    const w = R * (0.045 + 0.075 * su), crn = lobules[0].corners;
    // Early: incomplete septa reaching out from the tracts; then complete portal-portal bridges.
    const reach = Math.min(1, 0.3 + 2.4 * su);
    c.save();
    c.shadowColor = tk('--lz-nodule-shadow'); c.shadowBlur = R * 0.06 * su;   // nodules bulge beside the bands
    for (let i = 0; i < crn.length; i++) {
      const A = crn[i], B = crn[(i + 1) % 6], aa = 0.55 + 0.45 * su, amp = R * 0.025;
      if (reach >= 1) fibrousBand(c, A, B, septumOpt(w, COL, aa, 1.5, amp, 11 + i, null));
      else {
        const h = reach / 2;
        PM[0] = lerp(A[0], B[0], h); PM[1] = lerp(A[1], B[1], h); fibrousBand(c, A, PM, septumOpt(w, COL, aa, 0.2, amp, 11 + i, null));
        PM[0] = lerp(B[0], A[0], h); PM[1] = lerp(B[1], A[1], h); fibrousBand(c, B, PM, septumOpt(w, COL, aa, 0.2, amp, 61 + i, null));
      }
    }
    // Portal-central bridges (advanced): from three tracts to the central vein, then spurs from the others.
    if (su > 0.18) {
      const g = Math.min(1, (su - 0.18) / 0.4);
      for (let k = 0; k < G.septaPC.length; k++) {
        const pts = G.septaPC[k].pts, q = pts.length - 1;
        fibrousBand(c, pts[0], pts[q], septumOpt(w * (0.6 + 0.3 * g), COL, 0.45 + 0.5 * g, 0.9, 0, 31 + k, pts));
      }
      if (su > 0.6) for (let k = 0; k < 3; k++) {
        const A = crn[SPURS[k]], t = 0.25 + 0.3 * Math.min(1, (su - 0.6) / 0.3);
        PM[0] = lerp(A[0], cx, t); PM[1] = lerp(A[1], cy, t);
        fibrousBand(c, A, PM, septumOpt(w * 0.55, COL, 0.6, 0.15, R * 0.03, 41 + k, null));
      }
    }
    c.restore();
  } else {
    // Healthy: just the limiting plate, a hairline.
    c.strokeStyle = tk('--lz-plate-line'); c.lineWidth = 1;
    hexPath(c, lobules[0]); c.stroke();
  }
  // Portal tracts (connective tissue), thicker with portal fibrosis.
  c.globalAlpha = 1;
  const corners = lobules[0].corners;
  for (let ci = 0; ci < corners.length; ci++) {
    const x = corners[ci][0], y = corners[ci][1];
    let dup = false;   // (a corner that rounds to an earlier one is drawn once)
    for (let j = 0; j < ci && !dup; j++) dup = Math.round(corners[j][0]) === Math.round(x) && Math.round(corners[j][1]) === Math.round(y);
    if (dup) continue;
    // (Only this lobule's own corners: every one is a near triad, drawn whole.)
    const gp = scarGrowth(m.fibPre), rt = G.rt * (0.8 + 0.9 * gp);
    // Collagen expands asymmetrically around all three structures, continuous with the septa; in presinusoidal
    // disease a denser, deeper-toned periportal collar (pipestem) rings the tract, clear of the orchid sinusoids.
    if (m.fibPre > 0.03) {
      fibrousTract(c, x, y, rt, Math.atan2(y - cy, x - cx), PRE, gp, 900 + ci * 71);
      fibrousCuff(c, x, y, rt * 0.62, rt * 1.08, PRE, gp);
    }
  }
  // Central vein wall: wavy collagen bundles, continuous with the portal-central bridges.
  if (m.fibPost > 0.05) {
    const growth = scarGrowth(m.fibPost), inner = P.cvIn;
    const outer = inner + G.rcv0 * (0.1 + 0.85 * growth);
    fibrousCuff(c, cx, cy, inner, outer, COL, growth);
  }
}

/** The lobule in world space into an n × n bitmap's context w, at sc px per world unit, its corner at world (bx, by). */
export function paintWorldInto(w, n, sc, bx, by, P) {
  w.setTransform(1, 0, 0, 1, 0, 0); w.clearRect(0, 0, n, n);
  w.setTransform(sc, 0, 0, sc, -bx * sc, -by * sc);
  paintLobule(w, P);
}
