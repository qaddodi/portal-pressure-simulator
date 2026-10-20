import { DUODENUM_LINE } from './outlines.mjs';
// The small bowel and duodenum as centre lines (pure: no DOM, runs in Node and the browser).
//
// Coiled small bowel: the loops fill the space the colon frames, packed side by side like the atlas figures. The centre
// line is one random path through every cell of a grid laid over that space, so it never crosses itself and doubles
// back in short hairpins pointing every way. It is made from a random spanning tree on a coarse grid (walking round
// the tree visits every fine cell once, a closed loop), opened into a path and then reshuffled by "backbite" moves
// until its two ends sit where the bowel starts (just under the transverse colon, below the duodenojejunal flexure)
// and where it ends (beside the cecum). The cell centres are then nudged by a gentle warp and a little jitter and
// the corners rounded, so the loops read as soft bowel rather than a maze. A seed picks the arrangement; the chosen
// one is frozen to plain points for the app (bowelCoils returns them).

const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// The space below the transverse colon, inside the ascending and descending limbs, in coarse cells (2 x 2 fine cells
// each). Rows top to bottom; a cell is '#' when the bowel may lie there. The loops tuck a little under the transverse
// colon's lower edge, rise to it only on the right (where it climbs) and keep below the kidney's label; the lower right
// stays clear of the sigmoid.
export const COILS_MASK = [
  '#########.',
  '##########',
  '##########',
  '########..',
  '######....',
];
export const COILS_GRID = { x0: 466, y0: 655, s: 25 };   // top left corner and fine cell size (units)
// Where the bowel comes out from under the transverse colon, and where the ileum meets the cecum (fine cells).
// The two ends must fall on opposite colours of the grid's checkerboard, or no path through every cell can join them.
export const COILS_ENDS = { start: [13, 0], end: [0, 8] };
export const DJ = [806, 652];          // the duodenojejunal flexure, hidden just under the transverse colon
export const ILEUM_IN = [[454, 890], [436, 888]];   // the last few units run into the cecum's inner side, under it

function hamiltonPath(mask, rand, ends) {
  const R = mask.length, C = mask[0].length, on = (i, j) => j >= 0 && j < R && i >= 0 && i < C && mask[j][i] === '#';
  // Random spanning tree (randomised Prim): more branching than a depth-first maze, so shorter straight runs.
  const key = (i, j) => j * C + i, inT = new Set(), tree = new Set(), front = [];
  const add = (i, j) => { inT.add(key(i, j)); for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (on(i + di, j + dj) && !inT.has(key(i + di, j + dj))) front.push([i, j, i + di, j + dj]); };
  const j0 = mask.findIndex((row) => row.includes('#')); add(mask[j0].indexOf('#'), j0);
  while (front.length) {
    const [a, b, c, d] = front.splice(Math.floor(rand() * front.length), 1)[0];
    if (inT.has(key(c, d))) continue;
    tree.add(`${a},${b},${c},${d}`); tree.add(`${c},${d},${a},${b}`); add(c, d);
  }
  const has = (a, b, c, d) => tree.has(`${a},${b},${c},${d}`);
  // Fine cells and the closed loop round the tree.
  const FC = 2 * C, FR = 2 * R, fk = (x, y) => y * FC + x, adj = new Map(), link = (p, q) => { adj.get(p).push(q); adj.get(q).push(p); };
  const fon = (x, y) => on(x >> 1, y >> 1);
  for (let y = 0; y < FR; y++) for (let x = 0; x < FC; x++) if (fon(x, y)) adj.set(fk(x, y), []);
  for (let j = 0; j < R; j++) for (let i = 0; i < C; i++) {
    if (!on(i, j)) continue;
    const TL = fk(2 * i, 2 * j), TR = fk(2 * i + 1, 2 * j), BL = fk(2 * i, 2 * j + 1), BR = fk(2 * i + 1, 2 * j + 1);
    if (!has(i, j, i, j - 1)) link(TL, TR);
    if (!has(i, j, i, j + 1)) link(BL, BR);
    if (!has(i, j, i - 1, j)) link(TL, BL);
    if (!has(i, j, i + 1, j)) link(TR, BR);
    if (has(i, j, i + 1, j)) { link(TR, fk(2 * i + 2, 2 * j)); link(BR, fk(2 * i + 2, 2 * j + 1)); }
    if (has(i, j, i, j + 1)) { link(BL, fk(2 * i, 2 * j + 2)); link(BR, fk(2 * i + 1, 2 * j + 2)); }
  }
  // Open the loop into a path.
  const first = adj.keys().next().value, P = [first];
  let prev = -1, cur = first;
  for (;;) { const nx = adj.get(cur).find((q) => q !== prev); if (nx === first) break; P.push(nx); prev = cur; cur = nx; }
  // Backbite: join an end to a grid neighbour it is not yet joined to and cut the path just before that neighbour.
  const nbr = (p) => { const x = p % FC, y = (p / FC) | 0; return [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => fon(x + dx, y + dy)).map(([dx, dy]) => fk(x + dx, y + dy)); };
  let path = P;
  const bite = () => {
    const e = path[0], opts = nbr(e).filter((q) => q !== path[1]);
    const v = opts[Math.floor(rand() * opts.length)], i = path.indexOf(v);
    path = [...path.slice(0, i).reverse(), ...path.slice(i)];
  };
  const flip = () => { path = path.slice().reverse(); };
  for (let n = 0; n < 40 * path.length; n++) { if (rand() < 0.5) flip(); bite(); }
  const S = fk(...ends.start), E = fk(...ends.end);
  if (path[0] === E || path[path.length - 1] === S) flip();
  flip(); for (let n = 0; n < 200000 && path[0] !== E; n++) bite(); flip();      // walk the far end onto the cecum
  for (let n = 0; n < 200000 && path[0] !== S; n++) bite();                       // then the near end under the colon
  if (path[0] !== S || path[path.length - 1] !== E) return null;
  return path.map((p) => [p % FC, (p / FC) | 0]);
}

const chaikin = (P, n) => {
  for (let k = 0; k < n; k++) {
    const Q = [P[0]];
    for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1]; Q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
    Q.push(P[P.length - 1]); P = Q;
  }
  return P;
};

// Relax a centre line into soft bowel: each pass pulls every point toward the middle of its two neighbours (rounding
// corners and easing straight runs) while points on loops that press closer than D push each other apart (so arms
// stay a tube's width apart and hairpins open into round ends). No point strays more than `hold` from where it began,
// so the layout keeps to its space. Ends stay put.
function relax(P0, { D = 26, iters = 60, pull = 0.35, push = 0.5, hold = 12, step = 3 } = {}) {
  let P = [P0[0]], carry = 0;   // resample every `step` units along the line
  for (let i = 1; i < P0.length; i++) {
    const a = P0[i - 1], b = P0[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t = step - carry;
    for (; t <= L; t += step) P.push([a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L]);
    carry = L - (t - step);
  }
  P.push(P0[P0.length - 1].slice());
  const O = P.map((p) => p.slice()), n = P.length, skip = Math.ceil(1.6 * D / step);
  for (let it = 0; it < iters; it++) {
    const Q = P.map((p) => p.slice());
    for (let i = 1; i < n - 1; i++) for (let k = 0; k < 2; k++) Q[i][k] += pull * ((P[i - 1][k] + P[i + 1][k]) / 2 - P[i][k]);
    const cell = new Map(), key = (x, y) => `${Math.floor(x / D)},${Math.floor(y / D)}`;
    P.forEach((p, i) => { const kk = key(p[0], p[1]); if (!cell.has(kk)) cell.set(kk, []); cell.get(kk).push(i); });
    for (let i = 1; i < n - 1; i++) {
      const cx = Math.floor(P[i][0] / D), cy = Math.floor(P[i][1] / D);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const j of cell.get(`${cx + dx},${cy + dy}`) || []) {
        if (Math.abs(i - j) < skip) continue;
        const ex = P[i][0] - P[j][0], ey = P[i][1] - P[j][1], d = Math.hypot(ex, ey);
        if (d >= D || d < 1e-6) continue;
        const f = push * (D - d) / 2 / d; Q[i][0] += ex * f; Q[i][1] += ey * f;
      }
      const hx = Q[i][0] - O[i][0], hy = Q[i][1] - O[i][1], h = Math.hypot(hx, hy);
      if (h > hold) { Q[i][0] = O[i][0] + hx * hold / h; Q[i][1] = O[i][1] + hy * hold / h; }
    }
    P = Q;
  }
  return P;
}

// Centre line of the coiled small bowel, jejunum first. warp: units of slow bend laid over the grid; jitter: units each
// cell centre moves at random.
export function bowelCoils({ seed = 7, mask = COILS_MASK, grid = COILS_GRID, ends = COILS_ENDS, warp = 9, jitter = 3, soft = null } = {}) {
  let cells = null, s = seed;
  while (!cells && s < seed + 20) cells = hamiltonPath(mask, rng(s++), ends);
  if (!cells) throw new Error('no bowel path joins those ends');
  const rand = rng(seed * 31 + 5), { x0, y0, s: c } = grid;
  const ph = [rand() * 6.28, rand() * 6.28, rand() * 6.28, rand() * 6.28];
  const pos = ([i, j]) => {
    const x = x0 + (i + 0.5) * c, y = y0 + (j + 0.5) * c;
    return [x + warp * Math.sin(y / 53 + ph[0]) + 0.6 * warp * Math.sin(x / 97 + ph[1]) + (rand() - 0.5) * 2 * jitter,
      y + warp * Math.sin(x / 61 + ph[2]) + 0.6 * warp * Math.sin(y / 83 + ph[3]) + (rand() - 0.5) * 2 * jitter];
  };
  const mid = cells.map(pos);
  const line = chaikin([DJ, [DJ[0] + 4, DJ[1] + 10], ...mid, ...ILEUM_IN], 4);
  return soft ? relax(line, soft) : line;
}

// The duodenum: the bulb leaves the pylorus toward the viewer's left, the descending part runs down beside the
// pancreatic head, the horizontal part crosses under it and the ascending part climbs to the duodenojejunal flexure,
// the last two mostly behind the transverse colon. r is the tube half width at each point (the bulb a little wider).
// The duodenum (round 5, his ask: a seamless join to the stomach and a rounder curve, not straight down): it begins
// inside the stomach's pyloric tip at the antrum's width, narrows at the pylorus, swells into the bulb and turns down
// in one round C round the pancreatic head, then runs right to the duodenojejunal flexure behind the transverse colon
// (his line since 20 Oct). Points are [x, y, half width].
export const DUODENUM = (() => {
  // His line (Organ Outline Studio, 20 Oct): the bulb's widths up to the pylorus, then along the C as before (widening
  // to 15.2 round the pancreatic head, back to 13.5), 13.5 on to the flexure.
  const L = [0];
  for (let i = 1; i < DUODENUM_LINE.length; i++) L.push(L[i - 1] + Math.hypot(DUODENUM_LINE[i][0] - DUODENUM_LINE[i - 1][0], DUODENUM_LINE[i][1] - DUODENUM_LINE[i - 1][1]));
  const bulb = [14.2, 12.8, 11.8, 11.6], c0 = L[3], c1 = L.at(-1) * 0.62;
  return DUODENUM_LINE.map(([x, y], i) => {
    const t = (L[i] - c0) / (c1 - c0);
    const r = i < 4 ? bulb[i] : t < 0.17 ? 11.6 + 3.6 * t / 0.17 : t < 0.4 ? 15.2 : t < 0.6 ? 15.2 - 1.7 * (t - 0.4) / 0.2 : 13.5;
    return [x, y, Math.round(r * 10) / 10];
  });
})();
// The duodenum is split where the portal vein crosses it, along the vein's own line, so the join is hidden under the
// vein: the first part is drawn in the stomach's group (over the stomach's tip, fading into it), the rest with the
// small bowel and colon (behind the transverse colon). Two points on the vein line (PV_TRUNK near the crossing).
export const DUO_SPLIT = [[676, 523], [640, 482]];

// Round 3 (his ask: rounder curves, loops lying over each other, no gaps): the small bowel as one wandering tube that
// never bends tighter than `bend` units of radius, steers toward the emptiest ground ahead, and crosses over its own
// earlier loops once the space is full, until it has run `fill` times the length needed to cover the space once; then
// it turns for the cecum. Drawn in order, each later loop lies over the earlier ones.
export const WANDER_SPACE = [   // where the centre line may run (it tucks a little under the colon's edges)
  [472, 640], [530, 664], [600, 680], [680, 684], [760, 672], [830, 646], [884, 616], [936, 606], [950, 690], [975, 760],
  [982, 806], [944, 830], [880, 842], [820, 856], [774, 884], [766, 916], [470, 916]];
// Liver round 35 (his 15:35Z: "Can we also have the small intestine? Fill in that gap. And the right upper portion where
// the kidney is sitting. It seems like an empty space."): the space reaches up under the transverse colon on the right and
// out to the descending colon, behind the kidney (the kidney is drawn over the gut).
export const WANDER_WIDE = [
  [472, 640], [530, 664], [600, 680], [680, 684], [760, 672], [830, 646], [872, 614], [912, 590], [950, 574], [984, 568],
  [998, 604], [998, 690], [992, 760], [982, 806], [944, 830], [880, 842], [820, 856], [774, 884], [766, 916], [470, 916]];
const insidePoly = (P, x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
export function bowelWander({ seed = 1, space = WANDER_SPACE, r = 13, bend = 19, fill = 1.25, step = 2, start = DJ, end = ILEUM_IN, level = 0, cross = 1, jitter = 1.5 } = {}) {
  const rand = rng(seed), cs = 6, X0 = 440, Y0 = 540, W = 100, H = 70, cov = new Float32Array(W * H);
  const cellOf = (x, y) => { const i = Math.floor((x - X0) / cs), j = Math.floor((y - Y0) / cs); return i >= 0 && j >= 0 && i < W && j < H ? j * W + i : -1; };
  const inside = (x, y) => insidePoly(space, x, y);
  let area = 0; for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (inside(X0 + (i + 0.5) * cs, Y0 + (j + 0.5) * cs)) area += cs * cs;
  const mark = (x, y) => { for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) { const c = cellOf(x + di * cs, y + dj * cs); if (c >= 0 && Math.hypot(di, dj) * cs <= r) cov[c] += 1; } };
  const kmax = 1 / bend, total = fill * area / (2 * r);
  let [x, y] = start, th = Math.PI / 2, k = 0, L = 0;
  const P = [[x, y]];
  const go = () => { th += k * step; x += Math.cos(th) * step; y += Math.sin(th) * step; L += step; P.push([x, y]); mark(x, y); };
  for (let n = 0; n < 12; n++) go();   // out from under the transverse colon
  // A goal: the middle of the biggest stretch of empty ground near by, picked afresh every so often; in the last part
  // of the run the goal is the cecum. Turn rates are scored by the ground they would run over (covered cells cost,
  // leaving the space costs a lot) and by how far they leave the tube heading away from the goal.
  const [tx, ty] = end[0];
  let gx = x, gy = y + 60, nextGoal = 0;
  const pickGoal = () => {
    let best = -Infinity;
    for (let j = 2; j < H - 2; j += 2) for (let i = 2; i < W - 2; i += 2) {
      const cx = X0 + (i + 0.5) * cs, cy = Y0 + (j + 0.5) * cs;
      if (!inside(cx, cy)) continue;
      let e = 0; for (let dj = -5; dj <= 5; dj++) for (let di = -5; di <= 5; di++) { const c = cellOf(cx + di * cs, cy + dj * cs); if (c >= 0 && inside(cx + di * cs, cy + dj * cs) && cov[c] === 0) e++; }
      const v = e - Math.hypot(cx - x, cy - y) * 0.12;
      if (v > best) { best = v; gx = cx; gy = cy; }
    }
  };
  const score = (kk, wg) => {
    let s = 0, a = th, px = x, py = y;
    for (let d = step; d <= 64; d += step) {
      a += kk * step; px += Math.cos(a) * step; py += Math.sin(a) * step;
      if (!inside(px, py)) { s += 30; continue; }
      if (d > 1.5 * r) { const c = cellOf(px, py); s += c >= 0 ? cov[c] * cross : 30; }
    }
    s += level * Math.abs(Math.sin(a));   // `level` > 0: loops lie in mostly level folds, as in the textbook figures
    let off = Math.atan2(gy - py, gx - px) - a; off = Math.abs(Math.atan2(Math.sin(off), Math.cos(off)));
    return s + wg * off;
  };
  while (L < total) {
    const homing = L > 0.88 * total;
    if (homing) { gx = tx; gy = ty; } else if (L >= nextGoal || Math.hypot(gx - x, gy - y) < 30) { pickGoal(); nextGoal = L + 140; }
    let best = 0, bs = Infinity;
    for (let t = -1; t <= 1.0001; t += 0.2) { const sc = score(t * kmax, homing ? 14 : 8) + rand() * jitter; if (sc < bs) { bs = sc; best = t * kmax; } }
    k += 0.2 * (best - k) + (rand() - 0.5) * 0.004;
    k = Math.max(-kmax, Math.min(kmax, k));
    go();
  }
  // Last stretch into the cecum, still never turning tighter than `bend`.
  // (It stops some way short and the end points join on directly: a tube that cannot turn tighter than `bend` could
  // otherwise circle the cecum without reaching it.)
  for (let n = 0; n < 400 && Math.hypot(tx - x, ty - y) > 24; n++) {
    let want = Math.atan2(ty - y, tx - x) - th; want = Math.atan2(Math.sin(want), Math.cos(want));
    k = Math.max(-kmax, Math.min(kmax, want / 20));
    go();
  }
  return [...P, ...end];
}

// Round 7 (his ask: "less disorganized"): the loops lie in packets of side-by-side folds, as in the textbook figures,
// instead of wandering. The space is cut into cells; the tube runs through them in a fixed order (out from under the
// transverse colon, down the right side, back along the bottom, up through the middle, across the top and down the
// left to the cecum). In each cell it folds back and forth, the folds stacked toward the next cell, each turn a half
// circle a little wider than the tube, fold lengths fitted to the space and eased so a packet has a rounded outline.
export function bowelPackets({ seed = 1, space = WANDER_SPACE, r = 13, gap = 2.15, wobble = 6, warp = 0, wave = 150, shape = 0.62, start = DJ, end = ILEUM_IN, cells } = {}) {
  const rand = rng(seed), sp = gap * r, inside = (x, y) => insidePoly(space, x, y);
  // Cells: [x0, y0, x1, y1, stack direction]: 'd' down, 'u' up, 'l' left (folds run across the stacking direction).
  cells = cells || [[840, 640, 985, 770, 'd'], [770, 750, 990, 900, 'l'], [610, 760, 790, 920, 'l'], [610, 650, 800, 770, 'u'],
    [460, 630, 625, 770, 'l'], [460, 760, 625, 920, 'd']];
  const P = [start];
  const span = (ax, ay, ux, uy, lo, hi) => {   // the stretch of the line a + t u (lo <= t <= hi) inside the space, less a margin
    let a = null, b = null;
    for (let t = lo; t <= hi; t += 2) if (inside(ax + ux * t, ay + uy * t)) { if (a === null) a = t; b = t; }
    return a === null ? null : [a + r * 0.55, b - r * 0.55];
  };
  for (const [x0, y0, x1, y1, dir] of cells) {
    const across = dir === 'l';   // folds vertical, stacked right to left
    const vlo = across ? x1 - sp / 2 : dir === 'd' ? y0 + sp / 2 : y1 - sp / 2;
    const vhi = across ? x0 + sp / 2 : dir === 'd' ? y1 - sp / 2 : y0 + sp / 2;
    const n = Math.max(2, Math.round(Math.abs(vhi - vlo) / sp) + 1), dv = (vhi - vlo) / (n - 1);
    // start each packet at the end of the folds nearer to where the tube is
    const [px, py] = P[P.length - 1];
    let flip = across ? Math.abs(py - y0) > Math.abs(py - y1) : Math.abs(px - x0) > Math.abs(px - x1), last = null;
    for (let i = 0; i < n; i++) {
      const v = vlo + dv * i, ease = Math.sin(Math.PI * (i + 0.5) / n) ** 0.5;   // middle folds longest
      const mid = across ? (y0 + y1) / 2 : (x0 + x1) / 2, half = (across ? y1 - y0 : x1 - x0) / 2 * (shape + (1 - shape) * ease) * (1 - 0.18 * rand());
      const s = across ? span(v, mid - half, 0, 1, 0, 2 * half) : span(mid - half, v, 1, 0, 0, 2 * half);
      if (!s || s[1] - s[0] < sp) continue;
      const w1 = (rand() - 0.5) * wobble, w2 = (rand() - 0.5) * wobble;
      let a = mid - half + s[0] + w1, b = mid - half + s[1] + w2; if (flip) [a, b] = [b, a];
      const pt = (t, dv2 = 0) => across ? [v + dv2, t] : [t, v + dv2];
      const L = Math.abs(b - a), m = Math.max(2, Math.round(L / 6)), sg = Math.sign(b - a);
      const F = []; for (let j = 0; j <= m; j++) { const t = a + (b - a) * j / m; F.push(pt(t, Math.sin(j / m * Math.PI * 2 + i) * wobble * 0.4)); }
      if (last) {   // a round turn from the last fold's end: leave along its heading, arrive along this fold's
        const [ex, ey] = last.p, [sx, sy] = F[0], k = Math.abs(dv) * 0.68, [ux, uy] = across ? [0, 1] : [1, 0];
        const c1 = [ex + ux * last.sg * k, ey + uy * last.sg * k], c2 = [sx - ux * sg * k, sy - uy * sg * k];
        for (let j = 1; j < 10; j++) { const t = j / 10, q = 1 - t; P.push([q * q * q * ex + 3 * q * q * t * c1[0] + 3 * q * t * t * c2[0] + t * t * t * sx, q * q * q * ey + 3 * q * q * t * c1[1] + 3 * q * t * t * c2[1] + t * t * t * sy]); }
      }
      P.push(...F); last = { p: F[F.length - 1], sg };
      flip = !flip;
    }
  }
  P.push(end[0]);
  // A slow, smooth sway bends the folds like soft bowel (the ends stay put). Sideways shift follows height and the
  // up-down shift follows the across position, so side-by-side folds bend together and keep their spacing.
  const ph = Array.from({ length: 4 }, () => rand() * 6.283), w = (t, a, b) => Math.sin(t / wave * 6.283 * a + ph[b]);
  const Q = chaikin(P, 3).map(([x, y], i, A) => {
    const e = Math.min(1, i / 40, (A.length - 1 - i) / 40);
    return [x + e * warp * (w(y, 1, 0) + 0.5 * w(y, 2.1, 1)), y + e * warp * (w(x, 1, 2) + 0.5 * w(x, 1.9, 3))];
  });
  return [...Q, ...end.slice(1)];
}
