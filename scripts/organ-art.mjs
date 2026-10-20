// Writes src/ui/organ-art.js: the colon, small bowel and duodenum as Mohammad picked them in the organ mock-ups
// (20 Oct: colon "folded", small bowel "Calmer pile" with a few loops in the gap by the kidney, duodenum round C),
// drawn once here from their shapes (scripts/organ-art/) so the stage only appends the markup. Colours are classes
// (styles/app.css, .oc-* .ob-* .du-*) that read the organ's tones, so every theme draws it in its own colours.
// It also writes each organ's visible outline (the highlight ring): the bowel's whole pile as one outline, cut where
// the colon, stomach, spleen and liver lie over it (the gut is hidden under those; the kidney lies on top of the colon).
//
//   node scripts/organ-art.mjs && npm run stamp

import { writeFileSync } from 'node:fs';
import { COLON_LIMBS_FIG, COLON_JOINTS_FIG, colonAtlas, colonD } from './organ-art/colon-shape.mjs';
import { bowelWander, WANDER_SPACE, DUODENUM, DUO_SPLIT } from './organ-art/bowel-shape.mjs';
import { CALM } from './organ-art/bowel-points.mjs';
import { ORGANS, SEAM_D } from '../src/ui/anatomy.js';

const f1 = (v) => (Math.round(v * 10) / 10).toString();
const lineD = (P) => 'M' + P.map((p) => `${f1(p[0])} ${f1(p[1])}`).join('L');

// ── Path sampling (absolute M, L, C, Q, Z: what the shapes here produce) ──
function sample(d, step = 1.5) {
  const toks = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [];
  const out = [];
  let i = 0, cmd = '', cx = 0, cy = 0, sx = 0, sy = 0, cur = null;
  const num = () => parseFloat(toks[i++]);
  const push = (p) => cur.push(p);
  const seg = (n, f) => { for (let k = 1; k <= n; k++) push(f(k / n)); };
  while (i < toks.length) {
    if (/^[a-zA-Z]$/.test(toks[i])) cmd = toks[i++];
    if (cmd === 'M') { cx = sx = num(); cy = sy = num(); cur = [[cx, cy]]; out.push(cur); cmd = 'L'; }
    else if (cmd === 'L') { const x = num(), y = num(), a = [cx, cy]; seg(Math.max(1, Math.ceil(Math.hypot(x - cx, y - cy) / step)), (t) => [a[0] + (x - a[0]) * t, a[1] + (y - a[1]) * t]); cx = x; cy = y; }
    else if (cmd === 'C') {
      const p = [[cx, cy], [num(), num()], [num(), num()], [num(), num()]];
      const est = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]) + Math.hypot(p[2][0] - p[1][0], p[2][1] - p[1][1]) + Math.hypot(p[3][0] - p[2][0], p[3][1] - p[2][1]);
      seg(Math.max(2, Math.ceil(est / step)), (t) => { const u = 1 - t; return [0, 1].map((j) => u * u * u * p[0][j] + 3 * u * u * t * p[1][j] + 3 * u * t * t * p[2][j] + t * t * t * p[3][j]); });
      [cx, cy] = p[3];
    } else if (cmd === 'Q') {
      const p = [[cx, cy], [num(), num()], [num(), num()]];
      seg(Math.max(2, Math.ceil((Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]) + Math.hypot(p[2][0] - p[1][0], p[2][1] - p[1][1])) / step)), (t) => { const u = 1 - t; return [0, 1].map((j) => u * u * p[0][j] + 2 * u * t * p[1][j] + t * t * p[2][j]); });
      [cx, cy] = p[2];
    } else if (cmd === 'Z' || cmd === 'z') { cx = sx; cy = sy; cmd = ''; }
    else i++;
  }
  return out;
}

// Resample a polyline every `step` units, carrying a third value (half width) along.
function resample(P, step) {
  const out = [P[0]];
  let carry = 0;
  for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = step - carry;
    while (t <= L) { const u = t / L; out.push(a.map((v, k) => v + (b[k] - v) * u)); t += step; }
    carry = L - (t - step);
  }
  out.push(P[P.length - 1]);
  return out;
}
const taper = (P, r0, r1) => { let L = 0; const acc = P.map((p, i) => (L += i ? Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]) : 0)); return P.map((p, i) => [p[0], p[1], r0 + (r1 - r0) * acc[i] / L]); };
// The line moved across the tube (along its normal) by the app's tube offsets, scaled to each point's width.
const offsetLine = (Q, dir, tx, ty) => Q.map((p, i) => { const [ux, uy] = dir(i), nx = -uy, ny = ux, s = p[2] / 10.5, kk = (nx * tx + ny * ty) * s; return [p[0] + nx * kk, p[1] + ny * kk]; });
const path = (d, cls, extra = '') => (d ? `<path class="${cls}" d="${d}"${extra}/>` : '');
const sw = (w) => ` stroke-width="${f1(w)}"`;

// ── The colon: three limbs, the transverse in front at both flexures (colon-draw.js 'figure', quiet) ──
// The gut as picked, only narrower (Mohammad, 20 Oct: "smaller, not traced"): one squeeze across, about the rectum's line (x 786,
// where the rectal veins end), applied alike to the colon, the small bowel's pile and its gap loops and the appendix, so every
// shape and the room between them stay as picked. GUT_SX is also in anatomy.js (the appendix).
// The colon and the small bowel are a little taller, stretched downward about the hepatic flexure's level (GUT_Y; Mohammad, 20 Oct):
// GUT_SY here and in anatomy.js (the appendix and the gut's covers).
const GUT_X = 786, GUT_SX = 0.9, GUT_Y = 560, GUT_SY = 1.06;
const gutFit = ([x, y, ...r]) => [GUT_X + (x - GUT_X) * GUT_SX, GUT_Y + (y - GUT_Y) * GUT_SY, ...r];
// The mock's rectum ran on to the frame's bottom edge (y 1000), past the rectal veins' end (786 928, where the anorectal
// varices sit). It ends sooner here: the centre line stops at y 916, so its rounded end meets the veins' end.
const RECTUM_END = 916;
const COLON_LIMBS = COLON_LIMBS_FIG.map((l) => ({ ...l, route: (l.end !== 'tail' ? l.route : [...l.route.filter((p) => p[1] < RECTUM_END - 8), [786, RECTUM_END]]).map(gutFit) }));
const COLON_OPT = { joints: Object.fromEntries(Object.entries(COLON_JOINTS_FIG).map(([k, v]) => [k, v.map(gutFit)])), r: 36, lam: 34, band: 0.3 };
const colonParts = colonAtlas(COLON_LIMBS.map((l) => ({ ...l, pts: sample(colonD([l]), 1.5)[0] })), COLON_OPT).parts;
function colonArt() {
  const top = Math.max(...colonParts.map((p) => p.z));
  let defs = '', out = '';
  for (const S of [...colonParts].sort((a, b) => a.z - b.z)) {
    const over = S.z < top ? colonParts.filter((q) => q.z > S.z).map((q) => q.wall).join('') : '';
    const under = S.z === top ? colonParts.filter((q) => q.z < S.z).map((q) => q.wall).join('') : '';
    out += path(S.wall, 'oc-ao') + path(S.wall, 'oc-o1') + path(S.wall, 'oc-wall')
      + path(S.pouch, 'oc-o1') + path(S.pouch, 'oc-pouch') + path(S.lit, 'oc-o1')
      + path(S.tail, 'oc-o1') + path(S.tail, 'oc-tail') + path(S.tailWalls, 'oc-line') + path(S.tailLit, 'oc-o1')
      + path(S.valves, 'oc-valve') + path(S.band, 'oc-band') + path(S.band, 'oc-band-lit');
    // Where the transverse colon lies over this limb: its outline grown and set down and right, clipped to this limb.
    if (over) { defs += `<clipPath id="oc-clip-${S.id}"><path d="${S.wall}"/></clipPath>`; out += `<g clip-path="url(#oc-clip-${S.id})" opacity=".3">${path(over, 'oc-shade', ' transform="translate(3 5)"')}</g>`; }
    // Where it lies over the limbs behind, its own edge a little firmer.
    if (under) { defs += `<clipPath id="oc-under-${S.id}"><path d="${under}"/></clipPath>`; out += `<g clip-path="url(#oc-under-${S.id})">${path(S.wall, 'oc-fold')}</g>`; }
  }
  return `<defs>${defs}</defs>${out}`;
}

// ── The small bowel: the pile laid in short pieces in order, later loops over earlier ones, over a deep-toned bed ──
function pileArt(P, space, { piece = 36, step = 2, back = 28 } = {}) {
  const Q = resample(P, step), n = Q.length, k = (u) => Math.round(u / step);
  const dir = (i) => { const a = Q[Math.max(0, i - 1)], b = Q[Math.min(n - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; };
  const shade = offsetLine(Q, dir, 1.5, 3), hi = offsetLine(Q, dir, -2, -3.5);
  let rm = 0; for (const p of Q) rm += p[2]; rm /= n;
  let out = path(lineD(Q), 'ob-ao', sw(2 * rm + back + 8)) + path(lineD(Q), 'ob-deep', sw(2 * rm + back))
    + path(`M${space.map((p) => p.join(' ')).join('L')}Z`, 'ob-space', sw(rm));
  const per = k(piece);
  for (let s = 0; s < n - 1; s += per) {
    const e = Math.min(n - 1, s + per), r = Q[Math.min(n - 1, s + (per >> 1))][2];
    const sl = (A, x) => lineD(A.slice(Math.max(0, s - k(x)), Math.min(n, e + k(x) + 1)));
    out += path(sl(Q, 2), 'ob-rim', sw(2 * r + 2.5)) + path(sl(Q, 2), 'ob-edge', sw(2 * r)) + path(sl(Q, 4), 'ob-wall', sw(2 * r * 19 / 21))
      + path(sl(shade, 4), 'ob-shade', sw(2 * r * 11 / 21)) + path(sl(hi, 4), 'ob-hi', sw(3 * r / 10.5));
  }
  return { svg: out, Q, rm, back };
}
// Liver round 36 (his pick, option 2): a few loops of the same tube in the empty space by the kidney, under the pile.
const GAP_SPACE0 = [[850, 640], [880, 606], [915, 586], [950, 572], [984, 566], [998, 604], [1000, 700], [996, 790], [958, 790], [930, 730], [900, 700], [860, 680]];
const gap0 = bowelWander({ seed: 5, space: GAP_SPACE0, r: 13, bend: 22, fill: 1.3, cross: 2, jitter: 0.4, start: [890, 690], end: [[952, 772], [956, 782]] });
// The picked pile and its gap loops take the same squeeze and a little less height (BOWEL_SY, about y 600; then the gut's stretch), so the pile
// sits in the colon's frame and never hangs below the sigmoid and rectum (Mohammad, 20 Oct); the pile's first stretch is eased
// back onto the duodenum's end.
const BOWEL_SY = 0.9 * GUT_SY;
const bowelFit = ([x, y, ...r]) => [GUT_X + (x - GUT_X) * GUT_SX, 600 + (y - 600) * BOWEL_SY, ...r];
function fitPath(P, from) {
  const Q = P.map(bowelFit);
  let L = 0; const acc = Q.map((p, i) => (L += i ? Math.hypot(p[0] - Q[i - 1][0], p[1] - Q[i - 1][1]) : 0));
  const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const d0 = from ? [from[0] - Q[0][0], from[1] - Q[0][1]] : [0, 0];
  return Q.map((p, i) => { const a = 1 - sm(acc[i] / 70); return [p[0] + d0[0] * a, p[1] + d0[1] * a, ...p.slice(2)]; });
}
const GAP_SPACE = GAP_SPACE0.map(bowelFit), PILE_SPACE = WANDER_SPACE.map(bowelFit);
const gapPts = taper(fitPath(gap0), 13, 13);
const pilePts = taper(fitPath(CALM, CALM[0]), 13, 11.8);
const gap = pileArt(gapPts, GAP_SPACE), pile = pileArt(pilePts, PILE_SPACE);

// ── The duodenum: one outlined tube whose width follows its points, split under the portal vein ──
const DQ = resample(DUODENUM, 1.5);
function duodenumArt(part) {
  const Q = DQ, n = Q.length;
  const nrm = (i) => { const a = Q[Math.max(0, i - 1)], b = Q[Math.min(n - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [-(b[1] - a[1]) / L, (b[0] - a[0]) / L]; };
  const side = (sg) => Q.map((p, i) => { const [nx, ny] = nrm(i); return [p[0] + sg * nx * p[2], p[1] + sg * ny * p[2]]; });
  const outline = lineD([...side(1), ...side(-1).reverse()]) + 'Z';
  let rm = 0; for (const p of Q) rm += p[2]; rm /= n;
  const [[ax, ay], [bx, by]] = DUO_SPLIT, L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L;
  let nx = -uy, ny = ux;
  const pyl = (DUODENUM[3][0] - ax) * nx + (DUODENUM[3][1] - ay) * ny;
  if ((pyl > 0) !== (part === 'A')) { nx = -nx; ny = -ny; }
  const F = 1500, half = [[ax - ux * F, ay - uy * F], [ax + ux * F, ay + uy * F], [ax + ux * F + nx * F, ay + uy * F + ny * F], [ax - ux * F + nx * F, ay - uy * F + ny * F]];
  const dirQ = (i) => { const [x, y] = nrm(i); return [y, -x]; };
  const sh = offsetLine(Q, dirQ, 1.5, 3), hi = offsetLine(Q, dirQ, -2, -3.5);
  const body = path(outline, 'du-ao') + path(outline, 'du-wall') + path(lineD(sh), 'ob-shade', sw(2 * rm * 11 / 21)) + path(lineD(hi), 'ob-hi', sw(3 * rm / 10.5));
  return { clip: `<clipPath id="du-${part}c"><path d="${lineD(half)}Z"/></clipPath>`, body };
}
const duoA = duodenumArt('A'), duoB = duodenumArt('B');

// ── Visible outlines (the highlight rings), from a raster of each organ's area ──
const RES = 0.5, X0 = 360, Y0 = 440, W = Math.round(760 / RES), H = Math.round(600 / RES);
const grid = () => new Uint8Array(W * H);
const cell = (x, y) => [Math.round((x - X0) / RES), Math.round((y - Y0) / RES)];
function fillPoly(g, rings, val = 1) {   // even-odd over all rings (scanline)
  const edges = [];
  for (const R of rings) for (let i = 0, j = R.length - 1; i < R.length; j = i++) edges.push([R[j], R[i]]);
  for (let gy = 0; gy < H; gy++) {
    const y = Y0 + gy * RES, xs = [];
    for (const [[xa, ya], [xb, yb]] of edges) if ((ya > y) !== (yb > y)) xs.push(xa + (y - ya) * (xb - xa) / (yb - ya));
    xs.sort((a, b) => a - b);
    for (let q = 0; q + 1 < xs.length; q += 2) {
      for (let gx = Math.max(0, Math.ceil((xs[q] - X0) / RES)); gx <= Math.min(W - 1, Math.floor((xs[q + 1] - X0) / RES)); gx++) g[gy * W + gx] = val;
    }
  }
}
function strokeLine(g, P, half, val = 1) {   // every cell within `half` of the polyline (round caps and joins)
  const h2 = half * half;
  for (let i = 1; i < P.length; i++) {
    const [ax, ay] = P[i - 1], [bx, by] = P[i], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
    const [c0, r0] = cell(Math.min(ax, bx) - half, Math.min(ay, by) - half), [c1, r1] = cell(Math.max(ax, bx) + half, Math.max(ay, by) + half);
    for (let gy = Math.max(0, r0); gy <= Math.min(H - 1, r1); gy++) for (let gx = Math.max(0, c0); gx <= Math.min(W - 1, c1); gx++) {
      const x = X0 + gx * RES, y = Y0 + gy * RES, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)), ex = ax + dx * t - x, ey = ay + dy * t - y;
      if (ex * ex + ey * ey <= h2) g[gy * W + gx] = val;
    }
  }
}
// The outline loops of the set cells (marching squares), smoothed and simplified; loops enclosing less than minA are dropped.
function contour(g, minA = 120) {
  const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? g[y * W + x] : 0);
  const segs = new Map(), key = (p) => p[0] * 100000 + p[1];
  // Edge midpoints in doubled cell units; each square adds segments that keep the set cells on the left.
  for (let y = -1; y < H; y++) for (let x = -1; x < W; x++) {
    const a = at(x, y), b = at(x + 1, y), c = at(x + 1, y + 1), d = at(x, y + 1), m = a | (b << 1) | (c << 2) | (d << 3);
    if (m === 0 || m === 15) continue;
    const T = [2 * x + 1, 2 * y], R = [2 * x + 2, 2 * y + 1], B = [2 * x + 1, 2 * y + 2], Lf = [2 * x, 2 * y + 1];
    const S = { 1: [[Lf, T]], 2: [[T, R]], 3: [[Lf, R]], 4: [[R, B]], 5: [[Lf, T], [R, B]], 6: [[T, B]], 7: [[Lf, B]], 8: [[B, Lf]], 9: [[B, T]], 10: [[T, R], [B, Lf]], 11: [[B, R]], 12: [[R, Lf]], 13: [[R, T]], 14: [[T, Lf]] }[m];
    for (const [p, q] of S) segs.set(key(p), [p, q]);
  }
  const loops = [];
  while (segs.size) {
    const [k0, [p0]] = segs.entries().next().value;
    const loop = [p0];
    let k = k0;
    for (;;) { const s = segs.get(k); if (!s) break; segs.delete(k); loop.push(s[1]); k = key(s[1]); if (k === k0) break; }
    loops.push(loop.map(([x, y]) => [X0 + (x / 2) * RES, Y0 + (y / 2) * RES]));
  }
  const area = (P) => { let s = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };
  const smooth = (P) => { for (let it = 0; it < 3; it++) P = P.map((p, i) => { const a = P[(i + P.length - 1) % P.length], b = P[(i + 1) % P.length]; return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4]; }); return P; };
  const simplify = (P, eps) => {   // Douglas-Peucker on the open chain
    if (P.length < 3) return P;
    const [a, b] = [P[0], P[P.length - 1]], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    let bi = 0, bd = 0;
    for (let i = 1; i < P.length - 1; i++) { const d = Math.abs((P[i][0] - a[0]) * dy - (P[i][1] - a[1]) * dx) / L; if (d > bd) { bd = d; bi = i; } }
    return bd > eps ? [...simplify(P.slice(0, bi + 1), eps).slice(0, -1), ...simplify(P.slice(bi), eps)] : [a, b];
  };
  // (A closed loop is simplified as two chains, split at its point farthest from its start.)
  return loops.filter((P) => Math.abs(area(P)) >= minA).map((P) => {
    const S = smooth(P.slice(0, -1));
    let far = 0;
    S.forEach((p, i) => { if (Math.hypot(p[0] - S[0][0], p[1] - S[0][1]) > Math.hypot(S[far][0] - S[0][0], S[far][1] - S[0][1])) far = i; });
    return [...simplify(S.slice(0, far + 1), 0.35).slice(0, -1), ...simplify([...S.slice(far), S[0]], 0.35).slice(0, -1)];
  });
}
const ringD = (loops) => loops.map((P) => lineD(P) + 'Z').join('');
const shapeRings = (d) => sample(d, 1).filter((R) => R.length > 2);
const organD = (id) => ORGANS.find((o) => o.id === id).d;
const OVER = [organD('liver'), SEAM_D, organD('spleen')];   // the gut is hidden under these (the kidney lies on top of the colon, which runs whole under it)

// The bowel's area: its bed (the deep stroke along the pile and the space it fills), the pile and the gap loops, less what lies over it.
const bowelG = grid();
for (const B of [pile, gap]) strokeLine(bowelG, B.Q, (2 * B.rm + B.back) / 2);
fillPoly(bowelG, [PILE_SPACE]); fillPoly(bowelG, [GAP_SPACE]);
const colonG = grid();
for (const S of colonParts) { for (const d of [S.wall, S.pouch, S.tail]) if (d) for (const R of shapeRings(d)) fillPoly(colonG, [R]); }
const cut = (g, by) => { for (let i = 0; i < g.length; i++) if (by[i]) g[i] = 0; };
const overG = grid();
for (const d of OVER) for (const R of shapeRings(d)) fillPoly(overG, [R]);
cut(bowelG, colonG); cut(bowelG, overG); cut(colonG, overG);
const BOWEL_RING = ringD(contour(bowelG)), COLON_RING = ringD(contour(colonG));

const js = (s) => JSON.stringify(s);
writeFileSync('src/ui/organ-art.js', `// Generated by scripts/organ-art.mjs: do not edit. The colon, small bowel and duodenum as picked in the organ
// mock-ups (20 Oct), as markup for the stage's organ groups (classes in styles/app.css), and their visible outlines.
/* The colon's centre lines (three limbs), the organ's d. */
export const COLON_D = ${js(colonD(COLON_LIMBS))};
/* The colon's visible outline (its highlight ring). */
export const COLON_RING = ${js(COLON_RING)};
export const COLON_ART = ${js(colonArt())};
/* The small bowel's visible outline: the whole pile as one (its highlight ring). */
export const BOWEL_RING = ${js(BOWEL_RING)};
/* The gap loops (under the pile), then the pile. */
export const BOWEL_ART = ${js(gap.svg + pile.svg)};
/* The duodenum's centre line, the organ's d. */
export const DUO_D = ${js(lineD(DQ))};
export const DUO_CLIPS = ${js(duoA.clip + duoB.clip)};
/* Part A, in the stomach's group (fading in over the stomach's tip: the stage's #duFade mask), and part B, with the gut. */
export const DUO_A = ${js(duoA.body)};
export const DUO_B = ${js(duoB.body)};
`);
console.log('organ-art.js', [COLON_RING, BOWEL_RING].map((r) => (r.match(/M/g) || []).length + ' loops'), 'bytes', (gap.svg + pile.svg).length, colonArt().length);
