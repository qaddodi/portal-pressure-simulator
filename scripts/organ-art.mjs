// Writes src/ui/organ-art.js: the colon, small bowel and duodenum as Mohammad picked them in the organ mock-ups
// (20 Oct: colon "folded", small bowel "Calmer pile" with a few loops in the gap by the kidney, duodenum round C),
// drawn once here from their shapes (scripts/organ-art/) so the stage only appends the markup. Colours are classes
// (styles/app.css, .oc-* .ob-* .du-*) that read the organ's tones, so every theme draws it in its own colours.
// It also writes each organ's visible outline (the highlight ring): the bowel's whole pile as one outline, cut where
// the colon, stomach, spleen and liver lie over it (the gut is hidden under those; the kidney lies on top of the colon).
//
//   node scripts/organ-art.mjs && npm run stamp

import { writeFileSync } from 'node:fs';
import { colonAtlas, colonD } from './organ-art/colon-shape.mjs';
import { COLON_OUTLINE, BOWEL_OUTLINE } from './organ-art/outlines.mjs';
import { bowelWander, WANDER_SPACE, DUODENUM, DUO_SPLIT } from './organ-art/bowel-shape.mjs';
import { CALM } from './organ-art/bowel-points.mjs';
import { gutPath } from '../src/ui/gut-proportions.js';

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
// The colon's centre lines, read off Mohammad's outline (COLON_OUTLINE, drawn in the Organ Outline Studio 20 Oct: the middle
// of each limb across his edges), in the picked figure's three limbs; the tube is drawn a little wider (r) and clipped to his
// outline, so its edge is his line. His outline is in world units already, so nothing here stretches it.
const COLON_LIMBS = [
  { id: 'ascending', z: 1, start: 'cecum', end: 'hepatic', route: [
    [462, 905], [460, 880], [458, 850], [456, 820], [455, 790], [455, 760], [456, 730], [456, 700], [457, 670], [458, 640],
    [459, 610], [462, 580], [468, 556]] },
  { id: 'transverse', z: 2, start: 'hepatic', end: 'splenic', route: [
    [468, 556], [500, 592], [530, 622], [560, 636], [600, 650], [650, 655], [700, 654], [750, 646], [800, 627], [850, 594],
    [900, 567], [940, 540], [970, 514], [992, 498], [1008, 496]] },
  { id: 'descending', z: 0, start: 'splenic', end: 'tail', route: [
    [1022, 500], [1022, 540], [1023, 575], [1023, 610], [1022, 650], [1020, 690], [1018, 730], [1014, 760], [1008, 785],
    [998, 810], [985, 835], [966, 853], [946, 868], [925, 879], [901, 886], [877, 890], [849, 893], [829, 895], [805, 893],
    [786, 905], [780, 930], [784, 960], [788, 985], [791, 1010], [796, 1035], [800, 1060]] },
];
const COLON_OPT = { joints: { hepatic: [[468, 556, 1.2]], splenic: [[1008, 496, 1], [1022, 500, 0.97]] }, r: 47, lam: 34, band: 0.3, sigmoid: [975, 845], rectum: [820, 896] };
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
  defs += `<clipPath id="oc-his"><path d="${COLON_OUTLINE}"/></clipPath>`;
  // A soft inner turn at the actual scalloped edge, lit from the upper left as the other organs are.
  // Three faint strokes build the shade without adding a blur or any work during animation.
  const rim = [1, 2, 3].map((k) => path(COLON_OUTLINE, `oc-rim-shade s${k}`, ' transform="translate(-3.5 -5)"')).join('')
    + path(COLON_OUTLINE, 'oc-rim-light', ' transform="translate(2 3)"');
  return `<defs>${defs}</defs>${path(COLON_OUTLINE, 'oc-ao')}<g clip-path="url(#oc-his)">${out}${rim}</g>`;
}

// ── The small bowel: the pile laid in short pieces in order, later loops over earlier ones, over a deep-toned bed ──
function pileArt(P, space, { piece = 36, step = 2, back = 28 } = {}) {
  const Q = resample(P, step), n = Q.length, k = (u) => Math.round(u / step);
  const dir = (i) => { const a = Q[Math.max(0, i - 1)], b = Q[Math.min(n - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; };
  const shade = offsetLine(Q, dir, 1.5, 3), hi = offsetLine(Q, dir, -2, -3.5);
  let rm = 0; for (const p of Q) rm += p[2]; rm /= n;
  const bed = path(lineD(Q), 'ob-ao', sw(2 * rm + back + 8)) + path(lineD(Q), 'ob-deep', sw(2 * rm + back))
    + path(`M${space.map((p) => p.join(' ')).join('L')}Z`, 'ob-space', sw(rm));
  const per = k(piece), pieces = [];
  for (let s = 0; s < n - 1; s += per) {
    const e = Math.min(n - 1, s + per), r = Q[Math.min(n - 1, s + (per >> 1))][2];
    const sa = (A, x) => A.slice(Math.max(0, s - k(x)), Math.min(n, e + k(x) + 1)), sl = (A, x) => lineD(sa(A, x));
    pieces.push({
      svg: path(sl(Q, 2), 'ob-rim', sw(2 * r + 2.5)) + path(sl(Q, 2), 'ob-edge', sw(2 * r)) + path(sl(Q, 4), 'ob-wall', sw(2 * r * 19 / 21))
        + path(sl(shade, 4), 'ob-shade', sw(2 * r * 11 / 21)) + path(sl(hi, 4), 'ob-hi', sw(3 * r / 10.5)),
      // (its strokes as lines and half widths, for culling the pieces later loops hide: cullHidden)
      strokes: [[sa(Q, 2), r + 1.25], [sa(Q, 4), r * 19 / 21], [sa(shade, 4), r * 11 / 21], [sa(hi, 4), 1.5 * r / 10.5]],
    });
  }
  // (the bed's opaque parts, drawn over every earlier layer's pieces: the deep-toned line and the space's fill)
  return { bed, pieces, cover: { strokes: [[Q, rm + back / 2]], fill: space }, Q, rm, back };
}
// The pieces no one ever sees: every pixel of each lies under the opaque strokes and beds drawn after it (all of the pile's
// strokes are solid colours; only ob-ao is see-through, and it covers nothing). The gut moves only as a whole (the ascites
// lifts the bowel's group), so what lies under what never changes, and a hidden piece only made the browser paint the gut
// longer on every repaint (the liver's ease repaints it each frame: its cut-out is the gut's mask). A piece counts as hidden
// only if its whole footprint (round caps, a superset) lies at least CULL_M inside the later strokes (butt caps, round joins,
// as drawn), so their anti-aliased edges, at any zoom down to 1 pixel per 3 units, never let it show.
const CULL_M = 3, CULL_RES = 0.5;
function cullHidden(layers) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const L of layers) for (const [x, y] of L.Q) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  x0 -= 60; y0 -= 60; x1 += 60; y1 += 60;
  const W = Math.ceil((x1 - x0) / CULL_RES) + 1, H = Math.ceil((y1 - y0) / CULL_RES) + 1, cover = new Uint8Array(W * H);
  const box = (ax, ay, bx, by, h, f) => {
    for (let gy = Math.max(0, Math.floor((Math.min(ay, by) - h - y0) / CULL_RES)); gy <= Math.min(H - 1, Math.ceil((Math.max(ay, by) + h - y0) / CULL_RES)); gy++)
      for (let gx = Math.max(0, Math.floor((Math.min(ax, bx) - h - x0) / CULL_RES)); gx <= Math.min(W - 1, Math.ceil((Math.max(ax, bx) + h - x0) / CULL_RES)); gx++)
        if (f(x0 + gx * CULL_RES, y0 + gy * CULL_RES)) { if (f.stop) return false; else cover[gy * W + gx] = 1; }
    return true;
  };
  // Cells inside a stroke: within h across a segment (butt ends) or of an inner vertex (round joins).
  const addStroke = (P, h) => {
    if (h <= 0) return;
    for (let i = 1; i < P.length; i++) {
      const [ax, ay] = P[i - 1], [bx, by] = P[i], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      if (L2 > 0) box(ax, ay, bx, by, h, (x, y) => { const t = ((x - ax) * dx + (y - ay) * dy) / L2; if (t < 0 || t > 1) return false; const ex = ax + dx * t - x, ey = ay + dy * t - y; return ex * ex + ey * ey <= h * h; });
      if (i < P.length - 1) box(bx, by, bx, by, h, (x, y) => (x - bx) ** 2 + (y - by) ** 2 <= h * h);
    }
  };
  // Cells inside a closed polygon by at least CULL_M (even-odd, then kept clear of its edges).
  const addFill = (R) => {
    const near = (x, y) => R.some(([ax, ay], i) => { const [bx, by] = R[(i + 1) % R.length], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)); return (ax + dx * t - x) ** 2 + (ay + dy * t - y) ** 2 < CULL_M * CULL_M; });
    for (let gy = 0; gy < H; gy++) {
      const y = y0 + gy * CULL_RES, xs = [];
      for (let i = 0; i < R.length; i++) { const [ax, ay] = R[i], [bx, by] = R[(i + 1) % R.length]; if ((ay > y) !== (by > y)) xs.push(ax + (y - ay) * (bx - ax) / (by - ay)); }
      xs.sort((a, b) => a - b);
      for (let q = 0; q + 1 < xs.length; q += 2) for (let gx = Math.max(0, Math.ceil((xs[q] - x0) / CULL_RES)); gx <= Math.min(W - 1, Math.floor((xs[q + 1] - x0) / CULL_RES)); gx++) {
        const x = x0 + gx * CULL_RES;
        if (!near(x, y)) cover[gy * W + gx] = 1;
      }
    }
  };
  // Is every cell within h of the line (round caps) covered?
  const hidden = (P, h) => P.every(([px, py], i) => {
    const [qx, qy] = P[Math.max(0, i - 1)];
    const f = (x, y) => { const dx = px - qx, dy = py - qy, L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - qx) * dx + (y - qy) * dy) / L2)); return (qx + dx * t - x) ** 2 + (qy + dy * t - y) ** 2 <= h * h && !cover[Math.round((y - y0) / CULL_RES) * W + Math.round((x - x0) / CULL_RES)]; };
    f.stop = true;
    return box(qx, qy, px, py, h, f);
  });
  const kept = layers.map(() => []);
  let dropped = 0;
  for (let li = layers.length - 1; li >= 0; li--) {
    const L = layers[li];
    for (let pi = L.pieces.length - 1; pi >= 0; pi--) {
      const pc = L.pieces[pi];
      if (pc.strokes.every(([P, h]) => hidden(P, h))) { dropped++; continue; }
      for (const [P, h] of pc.strokes) addStroke(P, h - CULL_M);
      kept[li].unshift(pc);
    }
    // (this layer's bed lies over the earlier layers' pieces)
    for (const [P, h] of L.cover.strokes) addStroke(P, h - CULL_M);
    addFill(L.cover.fill);
  }
  // (the tubes' width as the stage's glow reads it, the middle of every piece's edge width, hidden ones included, so the
  // glow keeps the radius it had with them drawn: stage.js warmR)
  const ew = layers.flatMap((L) => L.pieces.map((pc) => +pc.svg.match(/class="ob-edge"[^>]* stroke-width="([\d.]+)"/)[1])).filter((w) => w > 0).sort((a, b) => a - b);
  return { svg: layers.map((L, li) => L.bed + kept[li].map((pc) => pc.svg).join('')), edgeW: ew[ew.length >> 1], dropped, total: layers.reduce((a, L) => a + L.pieces.length, 0) };
}
// Liver round 36 (his pick, option 2): a few loops of the same tube in the empty space by the kidney, under the pile.
const GAP_SPACE0 = [[850, 640], [880, 606], [915, 586], [950, 572], [984, 566], [998, 604], [1000, 700], [996, 790], [958, 790], [930, 730], [900, 700], [860, 680]];
const gap0 = bowelWander({ seed: 5, space: GAP_SPACE0, r: 13, bend: 22, fill: 1.3, cross: 2, jitter: 0.4, start: [890, 690], end: [[952, 772], [956, 782]] });
// The picked pile and its gap loops, narrowed (GUT_SX about the rectum's line, x 786) and stretched (BOWEL_SY about y 600), drawn
// over a bed that fills Mohammad's outline of the small bowel (BOWEL_OUTLINE) and clipped to it; the pile's first stretch is
// eased back onto the duodenum's end.
const GUT_X = 786, GUT_SX = 0.9, BOWEL_SY = 0.9 * 1.06;
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
// Loops of the same tube under both, wandering over the whole of his outline, so no stretch inside it is left bare
// where the picked pile and gap loops do not reach (they kept to the old frame).
const HIS_SPACE = sample(BOWEL_OUTLINE, 4)[0].map(([x, y]) => [x, y]);
const under0 = bowelWander({ seed: 9, space: HIS_SPACE, r: 13, bend: 22, fill: 1.1, cross: 2, jitter: 0.4, start: [972, 590], end: [[520, 900], [510, 910]] });
const under = pileArt(taper(under0, 13, 12.4), HIS_SPACE);
const bowelCull = cullHidden([under, gap, pile]);

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

// ── How well the art fills the visible outlines (the highlight rings), from a raster of each organ's area ──
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
const shapeRings = (d) => sample(d, 1).filter((R) => R.length > 2);
// The highlight rings are Mohammad's outlines as he drew them; the drawn areas only report how well the art fills them.
const bowelG = grid();
for (const B of [pile, gap, under]) strokeLine(bowelG, B.Q, B.rm);
const colonG = grid();
for (const S of colonParts) { for (const d of [S.wall, S.pouch, S.tail]) if (d) for (const R of shapeRings(d)) fillPoly(colonG, [R]); }
const hisG = (d) => { const g = grid(); for (const R of shapeRings(d)) fillPoly(g, [R]); return g; };
const fillRep = (art, his) => {
  let inHis = 0, miss = 0; const at = {};
  for (let i = 0; i < his.length; i++) if (his[i]) { inHis++; if (!art[i]) { miss++; const k = `${Math.round((X0 + (i % W) * RES) / 20) * 20},${Math.round((Y0 + Math.floor(i / W) * RES) / 20) * 20}`; at[k] = (at[k] || 0) + 1; } }
  return `${(100 * miss / inHis).toFixed(1)}% of the outline unfilled ` + Object.entries(at).filter(([, n]) => n > 40).map(([k, n]) => `${k}:${n}`).join(' ');
};
console.log('colon:', fillRep(colonG, hisG(COLON_OUTLINE)), '| bowel:', fillRep(bowelG, hisG(BOWEL_OUTLINE)));
const BOWEL_RING = BOWEL_OUTLINE, COLON_RING = COLON_OUTLINE;

// Stretch the finished paths together, including their clips and highlight rings, so they stay aligned.
// Leave the duodenum in place where it joins the stomach.
const gutArt = (svg) => svg.replace(/\bd="([^"]*)"/g, (_, d) => `d="${gutPath(d)}"`);
const js = (s) => JSON.stringify(s);
writeFileSync('src/ui/organ-art.js', `// Generated by scripts/organ-art.mjs: do not edit. The colon, small bowel and duodenum as picked in the organ
// mock-ups (20 Oct), as markup for the stage's organ groups (classes in styles/app.css), and their visible outlines.
/* The colon's centre lines (three limbs), the organ's d. */
export const COLON_D = ${js(gutPath(colonD(COLON_LIMBS)))};
/* The colon's visible outline (its highlight ring). */
export const COLON_RING = ${js(gutPath(COLON_RING))};
export const COLON_ART = ${js(gutArt(colonArt()))};
/* The small bowel's visible outline: the whole pile as one (its highlight ring). */
export const BOWEL_RING = ${js(gutPath(BOWEL_RING))};
/* The gap loops (under the pile), then the pile. */
export const BOWEL_ART = ${js(gutArt(`<defs><clipPath id="ob-his"><path d="${BOWEL_OUTLINE}"/></clipPath></defs><g clip-path="url(#ob-his)" data-edge-w="${bowelCull.edgeW}"><path class="ob-space" d="${BOWEL_OUTLINE}" stroke-width="0"/>${bowelCull.svg.join('')}</g>`))};
/* The duodenum's centre line, the organ's d. */
export const DUO_D = ${js(lineD(DQ))};
export const DUO_CLIPS = ${js(duoA.clip + duoB.clip)};
/* Part A, in the stomach's group (fading in over the stomach's tip: the stage's #duFade mask), and part B, with the gut. */
export const DUO_A = ${js(duoA.body)};
export const DUO_B = ${js(duoB.body)};
`);
console.log('organ-art.js', [COLON_RING, BOWEL_RING].map((r) => (r.match(/M/g) || []).length + ' loops'), 'bytes', bowelCull.svg.join('').length, colonArt().length, 'bowel pieces hidden and left out', bowelCull.dropped, 'of', bowelCull.total);
