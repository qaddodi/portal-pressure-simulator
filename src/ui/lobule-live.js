// The lobule's tissue drawn live by the GPU (performance review A5b, 31 Oct): the same picture lobule-paint.js paintLobule lays into
// the bitmap, worked out per pixel by tissue-gl.js from the lobule's shapes, so it is sharp at every zoom and its colours ease every
// frame. This file holds what has no page in it: the shapes packed for the shader (the hepatocytes in a grid of bins, so a pixel
// reads only the few cells near it), when the shader can draw the lobule's state, and its share against the bitmap.
//
// Built in pushes. This one: the lobule's fill, the hepatocytes (membrane, nucleus, dead cells of congestion, the plates'
// disorder), the nutmeg, the zones, and the limiting plate's hairline. A state with anything else in it (the collagen of fibrosis, the
// stellate cells, septa, tracts, the central vein's cuff) is drawn from the bitmap, as before, until the shader draws that too.

import { D_SURFACE, smooth01 } from './motion.js';
import { fibHash, bandGeomInto, bandFibreInto, bandNucleusInto, bandFibreCount, bandNucleiCount, scarGrowth } from './lobule-paint.js';

export const BIN = 16;          // a bin's side, world units
export const CELLS_PER_ROW = 512;   // the cell texture: three texels a cell, so 1536 wide
export const IDX_ROW = 1024;
export const SEG_ROW = 512;    // the segment texture: two texels a segment, so 1024 wide
export const K_ROW = 1024;      // the per-state texture (radii, stellate cells, bands): a flat run of texels, K_ROW to a row

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Whether the shader draws everything this tissue state shows (paintLobule): now every state. */
export const liveEligible = () => true;

/** How much of the picture is the shader's, by how large a cell is on screen (device px per world unit s, the lobule's radius R):
 *  below about 3.5 px a cell the bitmap's mipmaps average the detail where a shader would shimmer, so the bitmap shows; whole
 *  from 6 px. (The lobule's cells are 0.052 R long.) */
export const liveZoomShare = (s, R) => smooth(3.5, 6, s * R * 0.052);

/** How long the shader's share takes to ease between 0 and 1 when the shader arrives (or is lost) or the state changes it, ms. */
export const LIVE_MS = D_SURFACE;
/** One step of that easing from e toward goal (0 or 1) after dtMs: a gap longer than 100 ms (a pause, a hidden tab) counts as 100,
 *  so nothing jumps when drawing starts again. */
export function liveEase(e, goal, dtMs, ms = LIVE_MS) {
  if (e === goal) return e;
  const dt = Math.min(100, Math.max(0, dtMs)) / ms;
  return goal > e ? Math.min(goal, e + dt) : Math.max(goal, e - dt);
}
/** The shader's share of the picture from the eased goal e (0 … 1, smoothed) and the zoom's own share (liveZoomShare): 0 when either is 0. */
export const liveShareOf = (e, zoom) => Math.min(smooth01(e), zoom);

/** How far a pan may be from a whole number of device px and still count as one: only the rounding of the sums that make it (about
 *  1e-12 for a drag of whole CSS px), and under the 0.0002 px a float32 steps at 3000 px, which the shader cannot tell apart either. */
export const PAN_TOL = 1e-4;
/** Whether the lobule's picture has only moved, by a whole number of device px both ways, since the kept one was drawn: [dx, dy], dx to
 *  the right and dy down, or null. ref, pos: [the lobule's centre x, y, the bitmap box's corner x, y] (device px, from the top left) then
 *  and now; the centre and the corner must have moved by the same whole number each way. Everything else about the picture being
 *  the same is the caller's to check. */
export function panShift(ref, pos, tol = PAN_TOL) {
  const dx = pos[0] - ref[0], dy = pos[1] - ref[1], rx = Math.round(dx), ry = Math.round(dy);
  const ok = Math.abs(dx - rx) <= tol && Math.abs(dy - ry) <= tol && Math.abs(pos[2] - ref[2] - rx) <= tol && Math.abs(pos[3] - ref[3] - ry) <= tol;
  return ok ? [rx, ry] : null;
}
/** What a kept W × H picture needs when it moves by (dx right, dy down) device px: the part that stays on screen (src) and where it
 *  lands (dst), and the strips it leaves bare (to be drawn), each as [x, y, w, h] in GL's coordinates (the origin at the bottom left,
 *  so a move down is a move of −dy). The part kept and the strips tile the screen exactly. Null when nothing of it stays. */
export function panPlan(W, H, dx, dy) {
  const sx = dx, sy = -dy;
  if (!(Math.abs(sx) < W && Math.abs(sy) < H)) return null;
  const x0 = Math.max(0, -sx), x1 = Math.min(W, W - sx), y0 = Math.max(0, -sy), y1 = Math.min(H, H - sy);
  const strips = [];
  if (sx > 0) strips.push([0, 0, sx, H]); else if (sx < 0) strips.push([W + sx, 0, -sx, H]);
  const c0 = Math.max(0, sx), c1 = Math.min(W, W + sx);
  if (sy > 0) strips.push([c0, 0, c1 - c0, sy]); else if (sy < 0) strips.push([c0, H + sy, c1 - c0, -sy]);
  return { src: [x0, y0, x1 - x0, y1 - y0], dst: [x0 + sx, y0 + sy, x1 - x0, y1 - y0], strips };
}

/** A colour token's value as [r, g, b, a], r g b in 0–1 ('#rgb', '#rrggbb', 'rgb()' or 'rgba()'). */
export function parseRGBA(c) {
  c = (c || '').trim();   // alloc-rare: only when a colour or the theme changed: liveColours gives the last colours back otherwise (LAST_COL), so a frame that repeats them builds none
  if (c[0] === '#') {
    const x = c.length < 6 ? [...c.slice(1, 4)].map((d) => d + d).join('') : c.slice(1, 7);   // alloc-rare: only when a colour or the theme changed: liveColours gives the last colours back otherwise (LAST_COL), so a frame that repeats them builds none
    return [0, 2, 4].map((k) => parseInt(x.slice(k, k + 2), 16) / 255).concat(1);   // alloc-rare: only when a colour or the theme changed: liveColours gives the last colours back otherwise (LAST_COL), so a frame that repeats them builds none
  }
  const n = c.match(/[\d.]+/g) || [];   // alloc-rare: only when a colour or the theme changed: liveColours gives the last colours back otherwise (LAST_COL), so a frame that repeats them builds none
  return [(+n[0] || 0) / 255, (+n[1] || 0) / 255, (+n[2] || 0) / 255, n.length > 3 ? +n[3] : 1];   // alloc-rare: only when a colour or the theme changed: liveColours gives the last colours back otherwise (LAST_COL), so a frame that repeats them builds none
}

/** The colours the shader needs, from the painting's own colours (worldInput's rgb: bg, gap, cell) and the tokens it reads (tok: a
 *  token's name → its value). The same arithmetic paintLobule does with them. */
export function liveColours(rgb, dark, tok) {
  // (The same colours as the last call give that call's object back: it is asked for in every frame the tissue is drawn, and the colours
  // change only with the theme or a token, so the work below is done then. The caller reads it at once and keeps no copy to change.)
  const hit = LAST_COL;
  if (hit.out && colourSame(hit, rgb, dark, tok)) return hit.out;
  return remakeColours(rgb, dark, tok);
}
const COL_TOKENS = ['--lz-plate-line', '--lz-nodule-ink', '--lz-zone-line', '--lz-nodule-shadow', '--lz-shade', '--lz-hsc-body', '--lz-hsc-nucleus', '--lz-nutmeg', '--lz-zone-1', '--lz-zone-2', '--lz-zone-3'];
// What the last colours were made from: the painting's own colours as numbers, the theme, and each token's text.
const LAST_COL = { out: null, dark: false, nums: new Float64Array(15), toks: new Array(COL_TOKENS.length).fill('') };
function colourSame(h, rgb, dark, tok) {
  if (h.dark !== dark) return false;
  const n = h.nums;
  for (let i = 0; i < 3; i++) if (n[i] !== rgb.bg[i] || n[3 + i] !== rgb.gap[i] || n[6 + i] !== rgb.cell[i] || n[9 + i] !== (rgb.col || rgb.gap)[i] || n[12 + i] !== (rgb.dis || rgb.gap)[i]) return false;
  for (let i = 0; i < COL_TOKENS.length; i++) if (h.toks[i] !== tok(COL_TOKENS[i])) return false;
  return true;
}
function remakeColours(rgb, dark, tok) {
  const h = LAST_COL, n = h.nums;
  h.dark = dark;
  for (let i = 0; i < 3; i++) { n[i] = rgb.bg[i]; n[3 + i] = rgb.gap[i]; n[6 + i] = rgb.cell[i]; n[9 + i] = (rgb.col || rgb.gap)[i]; n[12 + i] = (rgb.dis || rgb.gap)[i]; }
  for (let i = 0; i < COL_TOKENS.length; i++) h.toks[i] = tok(COL_TOKENS[i]);
  return (h.out = liveColoursOf(rgb, dark, tok));
}
function liveColoursOf(rgb, dark, tok) {
  const { bg, gap, cell } = rgb;
  const t3 = (n) => parseRGBA(tok(n)).slice(0, 3);   // alloc-rare: only when a colour or the theme changed: liveColours gives the last colours back otherwise (LAST_COL), so a frame that repeats them builds none
  return {   // alloc-rare: only when a colour or the theme changed: liveColours gives the last colours back otherwise (LAST_COL), so a frame that repeats them builds none
    gap, gap55: gap.map((x, i) => lerp(bg[i], x, 0.55)),   // alloc-rare: only when a colour or the theme changed: liveColours gives the last colours back otherwise (LAST_COL), so a frame that repeats them builds none
    base: dark ? cell.map((x, i) => lerp(gap[i], x, 0.28)) : cell,   // alloc-rare: only when a colour or the theme changed: liveColours gives the last colours back otherwise (LAST_COL), so a frame that repeats them builds none
    plate: parseRGBA(tok('--lz-plate-line')), ink: parseRGBA(tok('--lz-nodule-ink')), zl: parseRGBA(tok('--lz-zone-line')),
    col: rgb.col || gap, dis: rgb.dis || gap, shd: parseRGBA(tok('--lz-nodule-shadow')), shade: t3('--lz-shade'), body: t3('--lz-hsc-body'), nuc: t3('--lz-hsc-nucleus'),
    nut: t3('--lz-nutmeg'), z1: t3('--lz-zone-1'), z2: t3('--lz-zone-2'), z3: t3('--lz-zone-3'),
  };
}

/** The lobule's shapes packed for the shader (shape: lobule-zoom.js worldShape). Done once per shape.
 *  cells: three RGBA32F texels a cell, CELLS_PER_ROW cells to a row: (x, y, angle, length) (width, tone, nucleus, q) (drop, jx, jy, ja).
 *  bins: RGBA32F, one texel per bin of the box (1.3 R each way about the centre): where its cells start in idx, and how many, then where its sinusoid segments start in idx, and how many. A bin lists
 *  every cell that can reach it in any state (the cells grow and wander with the plates' disorder), in the order they are drawn.
 *  idx: R32F, IDX_ROW wide. edges: the lobule's six sides, each (outward normal x, y, distance from the centre). */
export function buildLive(shape) {
  const { R, cx, cy, lobules, cells } = shape, l = lobules[0], B = 1.3 * R, bx = cx - B, by = cy - B, side = 2 * B;
  const nb = Math.ceil(side / BIN);
  const edges = new Float32Array(18);   // alloc-rare: built once per lobule shape and kept (lobule-zoom liveArgs: liveData WeakMap, the 'if (!data)' guard)
  for (let i = 0; i < 6; i++) {
    const [x0, y0] = l.corners[i], [x1, y1] = l.corners[(i + 1) % 6], ex = x1 - x0, ey = y1 - y0, L = Math.hypot(ex, ey) || 1;
    let nx = ey / L, ny = -ex / L;
    if (nx * (x0 - l.x) + ny * (y0 - l.y) < 0) { nx = -nx; ny = -ny; }
    edges.set([nx, ny, nx * (x0 - l.x) + ny * (y0 - l.y)], i * 3);   // alloc-rare: built once per lobule shape and kept (lobule-zoom liveArgs: liveData WeakMap, the 'if (!data)' guard)
  }
  const rows = Math.max(1, Math.ceil(cells.length / CELLS_PER_ROW)), cellData = new Float32Array(CELLS_PER_ROW * 3 * rows * 4);   // alloc-rare: built once per lobule shape and kept (lobule-zoom liveArgs: liveData WeakMap, the 'if (!data)' guard)
  const lists = Array.from({ length: nb * nb }, () => []);   // alloc-rare: built once per lobule shape and kept (lobule-zoom liveArgs: liveData WeakMap, the 'if (!data)' guard)
  cells.forEach((k, i) => {   // alloc-rare: built once per lobule shape and kept (lobule-zoom liveArgs: liveData WeakMap, the 'if (!data)' guard)
    const o = ((Math.floor(i / CELLS_PER_ROW) * CELLS_PER_ROW * 3) + (i % CELLS_PER_ROW) * 3) * 4;
    cellData.set([k.x, k.y, k.a, k.l, k.w, k.tone, k.nu, k.q, k.drop, k.jx, k.jy, k.ja], o);   // alloc-rare: built once per lobule shape and kept (lobule-zoom liveArgs: liveData WeakMap, the 'if (!data)' guard)
    const reach = cellReach(k);
    const i0 = Math.max(0, Math.floor((k.x - reach - bx) / BIN)), i1 = Math.min(nb - 1, Math.floor((k.x + reach - bx) / BIN));
    const j0 = Math.max(0, Math.floor((k.y - reach - by) / BIN)), j1 = Math.min(nb - 1, Math.floor((k.y + reach - by) / BIN));
    for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) lists[j * nb + ii].push(i);
  });
  // The sinusoids' segments (for the collagen of the space of Disse): two texels each, (x0, y0, x1, y1) and (tube, 0, 0, 0), SEG_ROW
  // segments to a row; binned like the cells, each segment into every bin its widest stroke can reach, tube by tube in drawing order.
  const sinTubes = shape.sin || [], mar = 5 * (shape.rs0 || 3) + 4, segList = [];   // alloc-rare: built once per lobule shape and kept (lobule-zoom liveArgs: liveData WeakMap, the 'if (!data)' guard)
  sinTubes.forEach((t, ti) => { for (let i = 0; i + 1 < t.pts.length; i++) segList.push([t.pts[i][0], t.pts[i][1], t.pts[i + 1][0], t.pts[i + 1][1], ti]); });   // alloc-rare: built once per lobule shape and kept (lobule-zoom liveArgs: liveData WeakMap, the 'if (!data)' guard)
  const segRows = Math.max(1, Math.ceil(segList.length / SEG_ROW)), segData = new Float32Array(SEG_ROW * 2 * segRows * 4);   // alloc-rare: built once per lobule shape and kept (lobule-zoom liveArgs: liveData WeakMap, the 'if (!data)' guard)
  const slists = Array.from({ length: nb * nb }, () => []);   // alloc-rare: built once per lobule shape and kept (lobule-zoom liveArgs: liveData WeakMap, the 'if (!data)' guard)
  segList.forEach((g, i) => {   // alloc-rare: built once per lobule shape and kept (lobule-zoom liveArgs: liveData WeakMap, the 'if (!data)' guard)
    const o = ((Math.floor(i / SEG_ROW) * SEG_ROW * 2) + (i % SEG_ROW) * 2) * 4;
    segData.set([g[0], g[1], g[2], g[3], g[4], 0, 0, 0], o);   // alloc-rare: built once per lobule shape and kept (lobule-zoom liveArgs: liveData WeakMap, the 'if (!data)' guard)
    const i0 = Math.max(0, Math.floor((Math.min(g[0], g[2]) - mar - bx) / BIN)), i1 = Math.min(nb - 1, Math.floor((Math.max(g[0], g[2]) + mar - bx) / BIN));
    const j0 = Math.max(0, Math.floor((Math.min(g[1], g[3]) - mar - by) / BIN)), j1 = Math.min(nb - 1, Math.floor((Math.max(g[1], g[3]) + mar - by) / BIN));
    for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) slists[j * nb + ii].push(i);
  });
  const total = lists.reduce((s, a) => s + a.length, 0) + slists.reduce((s, a) => s + a.length, 0), irows = Math.max(1, Math.ceil(total / IDX_ROW));   // alloc-rare: built once per lobule shape and kept (lobule-zoom liveArgs: liveData WeakMap, the 'if (!data)' guard)
  const bins = new Float32Array(nb * nb * 4), idx = new Float32Array(IDX_ROW * irows);   // alloc-rare: built once per lobule shape and kept (lobule-zoom liveArgs: liveData WeakMap, the 'if (!data)' guard)
  let at = 0;
  lists.forEach((a, b) => { bins[b * 4] = at; bins[b * 4 + 1] = a.length; for (const c of a) idx[at++] = c; });   // alloc-rare: built once per lobule shape and kept (lobule-zoom liveArgs: liveData WeakMap, the 'if (!data)' guard)
  slists.forEach((a, b) => { bins[b * 4 + 2] = at; bins[b * 4 + 3] = a.length; for (const c of a) idx[at++] = c; });   // alloc-rare: built once per lobule shape and kept (lobule-zoom liveArgs: liveData WeakMap, the 'if (!data)' guard)
  return { nb, box: [bx, by, side], edges, ctr: [l.x, l.y], cellData, cellRows: rows, bins, idx, idxRows: irows, segData, segRows };   // alloc-rare: built once per lobule shape and kept (lobule-zoom liveArgs: liveData WeakMap, the 'if (!data)' guard)
}

const ramp = (a, b, x) => smooth(a, b, x);
const TAU = Math.PI * 2, KB = 32;   // (KB: the bands' bins' side, world units)

// The items and the per-state texels are made again whenever the septa, the tracts or the colour move (every frame of a fibrosis drag),
// so they are written in place: the items are pooled objects (grown only to the most the lobule has, about 220, and then reused), their
// points flat Float64Arrays, and buildDyn writes its one result object and its one Float32Array over. Nothing here makes an object per call.

// A band's centre line when it is not the straight chord, written into out: the arc of a collar's bundle (pk 1), of a tract's bundle
// (pk 2, in the tract's own frame), or along the septum's points (pk 3). What the bitmap's opt.path gave, from the fields of OPT.
function itemPath(o, u, out) {
  if (o.pk === 1) {
    const an = o.a0 + o.span * u, r = o.r0 + o.th * 0.1 * Math.sin(an * 5 + fibHash(o.seed + 5) * TAU);
    out[0] = o.x + Math.cos(an) * r; out[1] = o.y + Math.sin(an) * r;
  } else if (o.pk === 2) {
    const an = o.a0 + o.span * u, r = o.r0 + 0.09 * Math.sin(5 * an + o.phase) + 0.12 * Math.sin(Math.PI * u);
    out[0] = Math.cos(an) * o.rt * r; out[1] = Math.sin(an) * o.rt * r;
  } else {
    const pts = o.pts, f = Math.min(1, Math.max(0, u)) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), t = f - i;
    out[0] = lerp(pts[i][0], pts[i + 1][0], t); out[1] = lerp(pts[i][1], pts[i + 1][1], t);
  }
}
// The band being made (bandGeomInto's options, and what builds its path), and what an item takes besides: its fade, its shadow, its clip
// (kind, x, y, r, r2) and the transform of a tract's bundle. Module objects, written over for each band.
const OPT = { w: 0, rgb: null, a: 1, e0: 1.5, e1: 1.5, amp: 0, seed: 0, pk: 0, x: 0, y: 0, a0: 0, span: 0, r0: 0, th: 0, phase: 0, rt: 0, pts: null };
const EX = { fade: 1, shadow: 0, ck: 0, cx: 0, cy: 0, cr: 0, cr2: 0, xf: false, tx: 0, ty: 0, ta: 0 };
const G = { P: new Float64Array(54), N: new Float64Array(54), Wd: new Float64Array(27), n: 26, L0: 1 };
const PA = [0, 0], PB = [0, 0], PM = [0, 0];
const ITEMS = [], POOL = [];
const PRE_DARK = [0.86, 0.78, 0.6], PRE_LIGHT = [0.78, 0.64, 0.44], SPURS = [1, 3, 5];
let nUsed = 0;
function newItem() {
  // alloc-rare: the pool grows only to the most items the lobule has (about 220), once; every later build reuses the items
  return { type: 0, rgb: null, a: 0, clip: [0, 0, 0, 0, 0], shadow: 0, w: 0, band: { P: new Float64Array(54), N: new Float64Array(54), Wd: new Float64Array(27) }, fibres: [], nuclei: [], fPool: [], nPool: [], bc: [0, 0, 0] };
}
function nextItem() {
  const it = POOL[nUsed] || (POOL[nUsed] = newItem());
  nUsed++; ITEMS.push(it);
  it.fibres.length = 0; it.nuclei.length = 0;
  return it;
}
function setClip(it) { const c = it.clip; c[0] = EX.ck; c[1] = EX.cx; c[2] = EX.cy; c[3] = EX.cr; c[4] = EX.cr2; }
function plain() { EX.fade = 1; EX.shadow = 0; EX.ck = 0; EX.cx = 0; EX.cy = 0; EX.cr = 0; EX.cr2 = 0; EX.xf = false; }
function opt(w, rgb, a, e0, e1, amp, seed, pk) { OPT.w = w; OPT.rgb = rgb; OPT.a = a; OPT.e0 = e0; OPT.e1 = e1; OPT.amp = amp; OPT.seed = seed; OPT.pk = pk; }
// A band from A to B by OPT and EX, as the bitmap's fibrousBand draws it (bandGeomInto, bandFibreInto, bandNucleusInto).
function band(A, B) {
  const w = OPT.w, seed = OPT.seed || 0;
  bandGeomInto(G, A, B, OPT, OPT.pk ? itemPath : null);
  const it = nextItem(), nf = bandFibreCount(w), nn = bandNucleiCount(G, w);
  it.type = 0; it.rgb = OPT.rgb; it.a = OPT.a * EX.fade; it.shadow = EX.shadow; it.w = w; setClip(it);
  for (let f = 0; f < nf; f++) {
    // alloc-rare: a band's fibre pool grows only to the most fibres a band has (10), once
    const o = it.fPool[f] || (it.fPool[f] = { off: 0, fp: 0, wav: 0, iA: 0, iB: 0, lw: 0, deep: false });
    it.fibres.push(bandFibreInto(o, seed, f, w));
  }
  const c = EX.xf ? Math.cos(EX.ta) : 1, s = EX.xf ? Math.sin(EX.ta) : 0, bP = it.band.P, bN = it.band.N, bW = it.band.Wd;
  for (let k = 0; k < nn; k++) {
    // alloc-rare: a band's nucleus pool grows only to the most nuclei a band has, once
    const o = it.nPool[k] || (it.nPool[k] = { x: 0, y: 0, rx: 0, ry: 0, ang: 0 });
    bandNucleusInto(o, G, seed, k, w);
    if (EX.xf) { const x = o.x, y = o.y; o.x = EX.tx + c * x - s * y; o.y = EX.ty + s * x + c * y; o.ang += EX.ta; }
    it.nuclei.push(o);
  }
  for (let i = 0; i < 27; i++) {
    const x = G.P[2 * i], y = G.P[2 * i + 1], nx = G.N[2 * i], ny = G.N[2 * i + 1];
    if (EX.xf) { bP[2 * i] = EX.tx + c * x - s * y; bP[2 * i + 1] = EX.ty + s * x + c * y; bN[2 * i] = c * nx - s * ny; bN[2 * i + 1] = s * nx + c * ny; }
    else { bP[2 * i] = x; bP[2 * i + 1] = y; bN[2 * i] = nx; bN[2 * i + 1] = ny; }
    bW[i] = G.Wd[i];
  }
}
function fill(type, rgb, a) { const it = nextItem(); it.type = type; it.rgb = rgb; it.a = a; it.shadow = 0; it.w = 0; setClip(it); }
function cuff(x, y, inner, outer, rgb, fib) {
  plain(); EX.ck = 2; EX.cx = x; EX.cy = y; EX.cr = outer; EX.cr2 = inner;
  fill(2, rgb, 0.4 * fib);
  const th = outer - inner;
  for (let ring = 0; ring < 3; ring++) for (let k = 0; k < 6; k++) {
    const seed = 211 + ring * 17 + k;
    OPT.x = x; OPT.y = y; OPT.a0 = TAU * k / 6 + ring * 0.27; OPT.span = TAU / 6 * (1.2 + 0.5 * fibHash(seed)); OPT.r0 = inner + th * (0.18 + ring * 0.3); OPT.th = th;
    opt(th * 0.34, rgb, Math.min(1, 1.0 * fib), 0.45, 0.5, 0, seed, 1);
    itemPath(OPT, 0, PA); itemPath(OPT, 1, PB);
    band(PA, PB);
  }
}

/** Every band, tract disc and collar of the collagen in the order paintLobule lays them (the septa, then each portal tract's disc, its
 *  bands and its collar, then the central vein's collar), from the same geometry fibrousBand draws (bandGeom, bandFibre, bandNucleus).
 *  m: the tissue values; o: { col (the septa's and the central collar's colour), dark, cvIn (the central vein's open lumen), cvOut (its wall: the collagen collar starts there and the fibrosis fills in from it to cvIn) }.
 *  An item: { type 0 band, 1 disc fill, 2 annulus fill; rgb, a; clip: [kind 0 none / 1 disc / 2 annulus, x, y, r, r2]; shadow (blur, px);
 *  band: { P, N (x, y pairs), Wd } in the world, fibres, nuclei }. Septa that have just begun, and the like, ease in rather than pop.
 *  The list is one kept by this module and written over by each call that has something new to make (it carries `ver`, moved each
 *  time it was), and its items are the module's too: read them before the next call, copy to keep. */
export function buildItems(shape, m, o) {
  // (The same shape, strengths, colour and theme as the last call give the list back as it is: the items do not depend on the sinusoids'
  // radii, which move on every frame of a caliber ease and are what asks for them again. They are made again when one of these changes.)
  const h = LAST_ITEMS, c = o.col;
  if (h.valid && h.shape === shape && h.su === m.septU && h.pre === m.fibPre && h.post === m.fibPost && h.dark === o.dark && h.cvIn === o.cvIn && h.cvOut === o.cvOut && h.c0 === c?.[0] && h.c1 === c?.[1] && h.c2 === c?.[2]) return ITEMS;
  h.valid = true; h.shape = shape; h.su = m.septU; h.pre = m.fibPre; h.post = m.fibPost; h.dark = o.dark; h.cvIn = o.cvIn; h.cvOut = o.cvOut; h.c0 = c?.[0]; h.c1 = c?.[1]; h.c2 = c?.[2];
  ITEMS.length = 0; nUsed = 0;
  ITEMS.ver = (ITEMS.ver || 0) + 1;
  fillItems(shape, m, o);
  return ITEMS;
}
const LAST_ITEMS = { valid: false, shape: null, su: 0, pre: 0, post: 0, dark: false, cvIn: 0, cvOut: 0, c0: 0, c1: 0, c2: 0 };
function fillItems(shape, m, o) {
  const { R, cx, cy, rcv0, lobules } = shape, crn = lobules[0].corners, COL = o.col;
  const PRE = o.dark ? PRE_DARK : PRE_LIGHT;
  const su = m.septU;
  if (su > 0) {
    const w = R * (0.045 + 0.075 * su), reach = Math.min(1, 0.3 + 2.4 * su), fade = ramp(0, 0.05, su), sh = R * 0.06 * su;
    for (let i = 0; i < crn.length; i++) {
      const A = crn[i], B = crn[(i + 1) % 6], aa = 0.55 + 0.45 * su, amp = R * 0.025;
      plain(); EX.fade = fade; EX.shadow = sh;
      if (reach >= 1) { opt(w, COL, aa, 1.5, 1.5, amp, 11 + i, 0); band(A, B); }
      else {
        const h = reach / 2;
        opt(w, COL, aa, 1.5, 0.2, amp, 11 + i, 0); PM[0] = lerp(A[0], B[0], h); PM[1] = lerp(A[1], B[1], h); band(A, PM);
        opt(w, COL, aa, 1.5, 0.2, amp, 61 + i, 0); PM[0] = lerp(B[0], A[0], h); PM[1] = lerp(B[1], A[1], h); band(B, PM);
      }
    }
    if (su > 0.18) {
      const g = Math.min(1, (su - 0.18) / 0.4);
      for (let k = 0; k < shape.septaPC.length; k++) {
        const P = shape.septaPC[k].pts, q = P.length - 1;
        plain(); EX.fade = fade; EX.shadow = sh;
        opt(w * (0.6 + 0.3 * g), COL, 0.45 + 0.5 * g, 1.5, 0.9, 0, 31 + k, 3); OPT.pts = P;
        band(P[0], P[q]);
      }
      if (su > 0.6) for (let k = 0; k < 3; k++) {
        const A = crn[SPURS[k]], t = 0.25 + 0.3 * Math.min(1, (su - 0.6) / 0.3);
        plain(); EX.fade = fade; EX.shadow = sh;
        PM[0] = lerp(A[0], cx, t); PM[1] = lerp(A[1], cy, t);
        opt(w * 0.55, COL, 0.6, 1.5, 0.15, R * 0.03, 41 + k, 0);
        band(A, PM);
      }
    }
  }
  for (let ci = 0; ci < crn.length; ci++) {
    const x = crn[ci][0], y = crn[ci][1];
    let dup = false;   // (a corner that rounds to an earlier one is drawn once)
    for (let j = 0; j < ci && !dup; j++) dup = Math.round(crn[j][0]) === Math.round(x) && Math.round(crn[j][1]) === Math.round(y);
    if (dup) continue;
    const gp = scarGrowth(m.fibPre), rt = shape.rt * (0.8 + 0.9 * gp);
    if (!(m.fibPre > 0.03)) continue;
    const ang = Math.atan2(y - cy, x - cx), seed0 = 900 + ci * 71;
    plain(); EX.ck = 1; EX.cx = x; EX.cy = y; EX.cr = rt; EX.cr2 = 0;
    fill(1, PRE, gp * 0.24);
    const phase = fibHash(seed0) * TAU;
    for (let k = 0; k < 10; k++) {
      const sd = seed0 + k * 37;
      OPT.a0 = fibHash(sd) * TAU; OPT.span = 1.2 + 2 * fibHash(sd + 1); OPT.r0 = 0.25 + 0.65 * fibHash(sd + 2); OPT.phase = phase; OPT.rt = rt;
      opt(rt * (0.08 + 0.085 * gp) * (0.7 + fibHash(sd + 3)), PRE, Math.min(1, gp * (0.75 + 0.35 * fibHash(sd + 4))), 0.2, 0.25, 0, sd, 2);
      itemPath(OPT, 0, PA); itemPath(OPT, 1, PB);
      EX.xf = true; EX.tx = x; EX.ty = y; EX.ta = ang;
      band(PA, PB);
    }
    cuff(x, y, rt * 0.62, rt * 1.08, PRE, gp);
  }
  if (m.fibPost > 0.05) {
    const growth = scarGrowth(m.fibPost), inner = o.cvIn, outer = Math.max(inner, o.cvOut || 0) + rcv0 * (0.1 + 0.85 * growth);
    cuff(cx, cy, inner, outer, COL, growth);
  }
}

/** The per-state texture (uLK), in texels: the sinusoids' radii now (four to a texel, in the order of shape.sin); the stellate cells
 *  (two each: x, y, angle, normal x / normal y); the bands' bins (KB wide, start and count) and their lists; then the items.
 *  An item: five header texels (type, 0, clip kind, alpha / colour, width / bound radius, fibre count, nucleus count, shadow blur /
 *  the clip (x, y, r, r2) / the bound's centre), then for a band 27 points (x, y, width, the normal's angle), two texels a fibre
 *  (offset, phase, waviness, first sample / last sample, thickness, deep) and two a nucleus (x, y, rx, ry / angle).
 *  The result is one object kept by this module (its texels in one Float32Array, at least as long as the rows hold) and written over
 *  by each call; its `ver` moves each time, so tissue-gl.js sends the texels again. Read it before the next call, copy to keep. */
export function buildDyn(shape, radii, items = NO_ITEMS) {
  // (Only the radii moved since the last call, as on every frame of a caliber ease: they are written over the last texels.)
  const l = LAST_DYN;
  if (DYN.k && l.shape === shape && l.items === items && l.iver === items.ver && l.hsc === shape.hsc && l.nr === radii.length) {
    const k = DYN.k;
    for (let i = 0; i < radii.length; i++) k[i] = radii[i];
    DYN.ver++;
    return DYN;
  }
  l.shape = shape; l.items = items; l.iver = items.ver; l.hsc = shape.hsc; l.nr = radii.length;
  dynOf(shape, radii, items);
  return DYN;
}
const NO_ITEMS = [], NO_HSC = [];
const LAST_DYN = { shape: null, items: null, iver: undefined, hsc: null, nr: 0 };
const DYN = { k: null, rows: 0, hOff: 0, nH: 0, nk: 0, bOff: 0, iOff: 0, margin: 0, nItems: 0, ver: 0 };
// Scratch of the build, grown to what is wanted and kept: the count, the start and the fill of each bin; each item's start and its bins.
let SC_CNT = new Int32Array(0), SC_START = new Int32Array(0), SC_FILL = new Int32Array(0), SC_HEAD = new Int32Array(0), SC_BOX = new Int32Array(0);
let KO = 0, KK = null;
const put = (a, b, c, d) => { KK[KO] = a; KK[KO + 1] = b; KK[KO + 2] = c; KK[KO + 3] = d; KO += 4; };
function dynOf(shape, radii, items) {
  const hsc = shape.hsc || NO_HSC, hOff = Math.ceil(radii.length / 4), bOff = hOff + hsc.length * 2, nI = items.length;
  const B = 1.3 * shape.R, bx = shape.cx - B, by = shape.cy - B, nk = Math.max(1, Math.ceil(2 * B / KB)), nb = nk * nk;
  const iOff = bOff + nb;
  // alloc-rare: grown only when a lobule needs more bins than any before (a change of stage size), never by a drag
  if (SC_CNT.length < nb) { SC_CNT = new Int32Array(nb); SC_START = new Int32Array(nb); SC_FILL = new Int32Array(nb); }
  // alloc-rare: grown only when there are more items than ever before (the most a lobule has, about 220)
  if (SC_HEAD.length < nI) { SC_HEAD = new Int32Array(nI); SC_BOX = new Int32Array(nI * 4); }
  SC_CNT.fill(0, 0, nb);
  // Each item's bounding disc: a band's points and their widest reach, with the shadow; a fill's disc.
  let margin = 2, at = 0, ap = 0;
  const l0 = shape.lobules[0], ctrX = l0.x, ctrY = l0.y;
  if (l0.corners.length) {
    ap = Infinity;
    for (let i = 0; i < 6; i++) { const c = l0.corners[i], d = l0.corners[(i + 1) % 6]; ap = Math.min(ap, Math.hypot((c[0] + d[0]) / 2 - ctrX, (c[1] + d[1]) / 2 - ctrY)); }
  }
  for (let n = 0; n < nI; n++) {
    const it = items[n], bc = it.bc;
    if (it.type === 0) {
      const P = it.band.P, Wd = it.band.Wd;
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, wm = 0;
      for (let i = 0; i < 27; i++) { const x = P[2 * i], y = P[2 * i + 1]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); wm = Math.max(wm, Wd[i]); }
      const cxx = (x0 + x1) / 2, cyy = (y0 + y1) / 2;
      let r = 0; for (let i = 0; i < 27; i++) r = Math.max(r, Math.hypot(P[2 * i] - cxx, P[2 * i + 1] - cyy));
      bc[0] = cxx; bc[1] = cyy; bc[2] = r + wm * 1.1 + it.shadow * 1.5 + 3;
    } else { bc[0] = it.clip[1]; bc[1] = it.clip[2]; bc[2] = (it.type === 2 ? it.clip[3] * 1.07 : it.clip[3]) + 3; }
    margin = Math.max(margin, Math.hypot(bc[0] - ctrX, bc[1] - ctrY) + bc[2] - 1.015 * ap);
    SC_HEAD[n] = at; at += it.type === 0 ? 5 + 27 + 2 * it.fibres.length + 2 * it.nuclei.length : 5;
    const x = bc[0], y = bc[1], r = bc[2];
    const i0 = Math.max(0, Math.floor((x - r - bx) / KB)), i1 = Math.min(nk - 1, Math.floor((x + r - bx) / KB));
    const j0 = Math.max(0, Math.floor((y - r - by) / KB)), j1 = Math.min(nk - 1, Math.floor((y + r - by) / KB));
    SC_BOX[4 * n] = i0; SC_BOX[4 * n + 1] = i1; SC_BOX[4 * n + 2] = j0; SC_BOX[4 * n + 3] = j1;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) SC_CNT[j * nk + i]++;
  }
  let entries = 0;
  for (let b = 0; b < nb; b++) { SC_START[b] = entries; SC_FILL[b] = entries; entries += SC_CNT[b]; }
  const itemsOff = iOff + entries, total = itemsOff + at, rows = Math.max(1, Math.ceil(total / K_ROW)), size = K_ROW * rows * 4;
  let k = DYN.k;
  // alloc-rare: only when the texels need more rows than any build before (the array is kept at the most it has needed; a drag stays within it)
  if (!k || k.length < size) k = new Float32Array(size);
  else k.fill(0, 0, size);
  KK = k; KO = 0;
  for (let i = 0; i < radii.length; i++) k[i] = radii[i];
  for (let i = 0; i < hsc.length; i++) { const h = hsc[i]; KO = (hOff + i * 2) * 4; put(h.x, h.y, h.a, h.nx); put(h.ny, 0, 0, 0); }
  for (let b = 0; b < nb; b++) { KO = (bOff + b) * 4; put(SC_START[b], SC_CNT[b], 0, 0); }
  for (let n = 0; n < nI; n++) {
    for (let j = SC_BOX[4 * n + 2]; j <= SC_BOX[4 * n + 3]; j++) for (let i = SC_BOX[4 * n]; i <= SC_BOX[4 * n + 1]; i++) k[(iOff + SC_FILL[j * nk + i]++) * 4] = itemsOff + SC_HEAD[n];
  }
  for (let n = 0; n < nI; n++) {
    const it = items[n], nf = it.fibres ? it.fibres.length : 0, nn = it.nuclei ? it.nuclei.length : 0;
    KO = (itemsOff + SC_HEAD[n]) * 4;
    put(it.type, 0, it.clip[0], it.a);
    put(it.rgb[0], it.rgb[1], it.rgb[2], it.w || 0);
    put(it.bc[2], nf, nn, it.shadow);
    put(it.clip[1], it.clip[2], it.clip[3], it.clip[4]);
    put(it.bc[0], it.bc[1], 0, 0);
    if (it.type !== 0) continue;
    const P = it.band.P, N = it.band.N, Wd = it.band.Wd;
    for (let i = 0; i < 27; i++) put(P[2 * i], P[2 * i + 1], Wd[i], Math.atan2(N[2 * i + 1], N[2 * i]));
    for (let i = 0; i < nf; i++) { const f = it.fibres[i]; put(f.off, f.fp, f.wav, f.iA); put(f.iB, f.lw, f.deep ? 1 : 0, 0); }
    for (let i = 0; i < nn; i++) { const q = it.nuclei[i]; put(q.x, q.y, q.rx, q.ry); put(q.ang, 0, 0, 0); }
  }
  DYN.k = k; DYN.rows = rows; DYN.hOff = hOff; DYN.nH = hsc.length; DYN.nk = nk; DYN.bOff = bOff; DYN.iOff = iOff; DYN.margin = margin; DYN.nItems = nI;
  DYN.ver++;
}
/** The sinusoid collagen's and the stellate cells' strengths from the tissue values (the bitmap's own thresholds, eased), written into
 *  `out`, an object the caller keeps (returned). */
export function liveFibreInto(out, m) {
  out.sin = ramp(0.05, 0.09, m.fibSin); out.act = ramp(0.08, 0.13, m.act); out.fibSin = m.fibSin; out.actV = m.act;
  return out;
}
/** liveFibreInto into a new object (tests, and a caller that makes it once). */
export const liveFibre = (m) => liveFibreInto({}, m);

/** How far from its centre a cell can reach in any state, world units: the corners of its largest box (the plates thicken with
 *  disorder: length ×1.12, width ×1.3), the farthest it wanders, the membrane's half width (at most about 1.2 in the sizes the
 *  shader is used at) and the antialiasing's edge. */
export const cellReach = (k) => 0.5 * Math.hypot(k.l * 1.12, k.w * 1.3) + Math.min(k.l, k.w) * 0.45 * Math.hypot(k.jx, k.jy) + 3;

// The shader's part of tissue-gl.js: liveTissue(w) is the lobule's bitmap as premultiplied RGBA at the box coordinate w (0–1 across
// the bitmap's box), in the order paintLobule lays it: the fill, the hexagon's gap colour, then (clipped to the hexagon) the cells,
// the nutmeg and the zones, then the hairline. Antialiased by distance: a shape covers a pixel by how far its edge lies from the
// pixel's centre in pixels (lvCov), a line thinner than a pixel by its width (lvLine).
export const LIVE_FS = `
precision highp int;
uniform highp sampler2D uLC, uLB, uLI;   // the cells, the bins, the bins' cell lists
uniform vec3 uLBox;                // the bitmap's box in world units: x, y, side
uniform vec2 uLN;                  // bins a side, a bin's side
uniform vec3 uLEdge[6];            // the lobule's sides: outward normal, distance from its centre
uniform vec2 uLCtr;                // its centre
uniform vec4 uLCen;                // the central vein's centre, the lobule's radius R, dark (1)
uniform vec4 uLSt;                 // congestion (congU), the plates' disorder (septU), zones on (1)
uniform vec3 uLGap, uLGap55, uLBase, uLNut, uLZ1, uLZ2, uLZ3;
uniform vec4 uLPlate, uLInk, uLZl; // the membrane's, the nucleus's and the zones' lines' colours, with their alphas
uniform float uLive;               // the shader's share of the lobule (the rest is the bitmap)
uniform highp sampler2D uLS, uLK;  // the sinusoids' segments; the per-state texels (radii, stellate cells)
uniform vec4 uLSin;                // the space of Disse collagen's colour and alpha (0: none)
uniform vec4 uLFib;                // the capillarization (fibSin), how far the collagen reaches past the lobule
uniform vec4 uLKB;                 // the bands' bins: a side's count, a bin's side, where the bins and their lists start in uLK
uniform vec4 uLShd, uLShade;       // the septa's shadow's and the fibroblast nuclei's colours and alphas
uniform vec4 uLHs;                 // stellate cells: how many, activation, the sinusoid's radius rs0, where they start in uLK
uniform vec4 uLHB, uLHN;           // their body's and nucleus's colour and alpha
vec4 lvK(int i) { return texelFetch(uLK, ivec2(i & 1023, i >> 10), 0); }
float lvSeg(vec2 p, vec2 a, vec2 b, float ra, float rb) {
  vec2 ba = b - a;
  float t = clamp(dot(p - a, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(p - a - ba * t) - mix(ra, rb, t);
}
float lvEll(vec2 p, vec2 ab) {
  float k0 = length(p / ab), k1 = length(p / (ab * ab));
  return k1 < 1e-9 ? -min(ab.x, ab.y) : k0 * (k0 - 1.0) / k1;
}
// A tapered strand of a stellate cell: ten segments from x0 along u, bowing by bow·rs0 toward −nn, its half width w0 narrowing to 0.
float lvStrand(vec2 p, vec2 x0, vec2 u, vec2 nn, float len, float w0, float bow, float rs0) {
  float best = 1e9, wa = w0;
  vec2 pa = x0;
  for (int i = 1; i <= 10; i++) {
    float t = float(i) / 10.0, b = bow * sin(3.14159265 * t * 0.8) * rs0, wb = w0 * pow(1.0 - t, 1.3);
    vec2 pb = x0 + u * len * t - nn * b;
    best = min(best, lvSeg(p, pa, pb, wa, wb));
    pa = pb; wa = wb;
  }
  return best;
}
float lvCov(float d, float px) { return clamp(0.5 - d / px, 0.0, 1.0); }
// A filled shape thinner than a pixel (wpx: its width in device px): lvCov spreads it over about a pixel each way, so the thinner it is
// the more its weight overshoots its real area. Scaled by this, which is 1 from a pixel wide and 4w/(1+w)² below (the weight a line of
// that width has once it is spread), detail smaller than a pixel fades out as it shrinks instead of shimmering. (Lines have their own:
// lvLine.)
float lvThin(float wpx) { float q = min(wpx, 1.0); return 4.0 * q / ((1.0 + q) * (1.0 + q)); }
float lvLine(float d, float hw, float px) { float h = max(hw, 0.5 * px); return clamp(0.5 - (abs(d) - h) / px, 0.0, 1.0) * min(1.0, hw / h); }
float lvHex(vec2 p, float k) { float m = -1e9; for (int i = 0; i < 6; i++) m = max(m, dot(uLEdge[i].xy, p - uLCtr) - k * uLEdge[i].z); return m; }
vec4 lvOver(vec4 s, vec4 d) { return s + d * (1.0 - s.a); }
vec3 lvTone(vec3 c, float q, bool dark) { float k = (dark ? 0.12 : 0.16) * (1.0 - smoothstep(0.3, 0.75, q)); return c * vec3(1.0 - 0.35 * k, 1.0 - 0.8 * k, 1.0 - k); }
vec4 lvTint(vec3 rgb, float a) { return vec4(rgb * a, a); }

// Collagen bands (septa, portal tracts, collars): items in uLK (buildDyn). A band is three passes of a variable-width curve (wide and
// faint, middle, narrow and dense; the first with a soft shadow), wavy fibres and spindle nuclei, as fibrousBand lays them.
float lvClip(vec2 wp, float px, vec4 c3, float kind) {
  if (kind < 0.5) return 1.0;
  vec2 d = wp - c3.xy;
  float r = length(d);
  if (kind < 1.5) return lvCov(r - c3.z, px);
  float an = atan(d.y, d.x), ro = c3.z * (1.0 + 0.035 * sin(3.0 * an) + 0.025 * sin(7.0 * an + 0.8));
  return lvCov(max(r - ro, c3.w - r), px);
}
vec2 lvFibV(int pb, int j, float off, float fp, float wav) {
  vec4 q = lvK(pb + j);
  float h = q.z * (off + wav * sin(6.2831853 * 4.0 * float(j) / 26.0 + fp));
  return q.xy + vec2(cos(q.w), sin(q.w)) * h;
}
vec4 lvItem(vec2 wp, float px, int o, vec4 acc) {
  vec4 h0 = lvK(o), h1 = lvK(o + 1), h2 = lvK(o + 2), h3 = lvK(o + 3), h4 = lvK(o + 4);
  if (length(wp - h4.xy) > h2.x + px) return acc;
  float cl = lvClip(wp, px, h3, h0.z);
  if (cl <= 0.0) return acc;
  float a = h0.w;
  if (h0.x > 0.5) return lvOver(lvTint(h1.rgb, a) * cl, acc);
  int pb = o + 5, nf = int(h2.y), nn = int(h2.z);
  float d1 = 1e9, d2 = 1e9, d3 = 1e9, dm = 1e9;
  int jb = 0;
  vec4 pa = lvK(pb);
  for (int i = 1; i <= 26; i++) {
    vec4 pc = lvK(pb + i);
    float ta = min(1.0, float(min(i - 1, 27 - i)) / 26.0 * 4.0), tb = min(1.0, float(min(i, 26 - i)) / 26.0 * 4.0);
    float ea = ta * ta * (3.0 - 2.0 * ta), eb = tb * tb * (3.0 - 2.0 * tb);
    vec2 ba = pc.xy - pa.xy;
    float t = clamp(dot(wp - pa.xy, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0), dd = length(wp - pa.xy - ba * t);
    d1 = min(d1, dd - 0.5 * mix(pa.z * (1.45 + 0.65 * ea), pc.z * (1.45 + 0.65 * eb), t));
    d2 = min(d2, dd - 0.5 * 1.45 * mix(pa.z, pc.z, t));
    d3 = min(d3, dd - 0.5 * mix(pa.z, pc.z, t));
    if (dd < dm) { dm = dd; jb = i - 1; }
    pa = pc;
  }
  // (The shadow: the faint pass's shape blurred, its sigma constant on the screen up to 1 px a world unit. tanh's argument is clamped:
  // zoomed in, px and so sg are small and d1 / sg runs to the thousands, where tanh (e^x − e^−x) / (e^x + e^−x) gives inf / inf, a NaN
  // that turned whole bins of the lobule black (2 Nov 2026). At ±10 tanh is ±1 to float precision, so nothing else changes.)
  float blur = h2.w;
  if (blur > 0.0) {
    float sg = max(0.5 * blur * min(px, 1.0), 1e-3);
    acc = lvOver(lvTint(uLShd.rgb, uLShd.a * 0.12 * a * (0.5 - 0.5 * tanh(clamp(0.85 * d1 / sg, -10.0, 10.0)))), acc);
  }
  float c1 = lvCov(d1, px) * cl;
  acc = lvOver(lvTint(h1.rgb, 0.12 * a) * c1, acc);
  acc = lvOver(lvTint(h1.rgb, 0.24 * a) * (lvCov(d2, px) * cl), acc);
  acc = lvOver(lvTint(h1.rgb, 0.5 * a) * (lvCov(d3, px) * cl), acc);
  if (c1 <= 0.0) return acc;
  int fb = pb + 27;
  for (int f = 0; f < 10; f++) {
    if (f >= nf) break;
    vec4 f0 = lvK(fb + 2 * f), f1 = lvK(fb + 2 * f + 1);
    int iA = int(f0.w), iB = int(f1.x);
    float df = 1e9;
    for (int j = jb - 1; j <= jb + 1; j++) {
      if (j < iA || j + 1 > iB || j < 0 || j > 25) continue;
      vec2 v0 = lvFibV(pb, j, f0.x, f0.y, f0.z), v1 = lvFibV(pb, j + 1, f0.x, f0.y, f0.z);
      df = min(df, lvSeg(wp, v0, v1, 0.0, 0.0));
    }
    if (df > 1e8) continue;
    bool deep = f1.z > 0.5;
    vec3 fc = deep ? h1.rgb * vec3(0.78, 0.74, 0.7) : h1.rgb + (1.0 - h1.rgb) * 0.45;
    acc = lvOver(lvTint(fc, (deep ? 0.32 : 0.55) * a) * (lvLine(df, 0.5 * f1.y, px) * cl), acc);
  }
  int nb2 = pb + 27 + 2 * nf;
  for (int k = 0; k < 14; k++) {
    if (k >= nn) break;
    vec4 n0 = lvK(nb2 + 2 * k), n1 = lvK(nb2 + 2 * k + 1);
    vec2 d = wp - n0.xy;
    float ca = cos(n1.x), sa = sin(n1.x);
    vec2 lp = vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y);
    acc = lvOver(lvTint(uLShade.rgb, 0.32 * a) * (lvCov(lvEll(lp, n0.zw), px) * lvThin(2.0 * min(n0.z, n0.w) / px) * cl), acc);
  }
  return acc;
}
vec4 liveTissue(vec2 w) {
  vec2 wp = uLBox.xy + w * uLBox.z;
  float px = uLBox.z / uRect.z, R = uLCen.z, cu = uLSt.x, sj = uLSt.y;
  bool dark = uLCen.w > 0.5;
  float h1 = lvHex(wp, 1.015);
  if (h1 > uLFib.y + 2.0 * px) return vec4(0.0);
  float c1 = lvCov(h1, px);
  vec4 acc = lvTint(uLGap55, 1.0) * c1;
  float hm = lvHex(wp, 1.0), clipC = lvCov(hm, px), ag = dark ? 0.55 : 0.5;
  acc = lvOver(lvTint(uLGap, ag) * clipC, acc);
  if (clipC > 0.0) {
    ivec2 ib = ivec2(floor((wp - uLBox.xy) / uLN.y));
    int nb = int(uLN.x);
    float lw0 = max(0.6, 0.6 * px);
    if (ib.x >= 0 && ib.y >= 0 && ib.x < nb && ib.y < nb) {
      vec2 hd = texelFetch(uLB, ib, 0).rg;
      int st = int(hd.x), cnt = int(hd.y);
      for (int n = 0; n < cnt; n++) {
        int j = st + n;
        int ci = int(texelFetch(uLI, ivec2(j & 1023, j >> 10), 0).r);
        int tx = 3 * (ci & 511), ty = ci >> 9;
        vec4 t0 = texelFetch(uLC, ivec2(tx, ty), 0), t1 = texelFetch(uLC, ivec2(tx + 1, ty), 0), t2 = texelFetch(uLC, ivec2(tx + 2, ty), 0);
        float q = t1.w;
        // (Dead cells of congestion: the bitmap switches a cell at its threshold, and crossfades whole pictures; here the cell's share
        // of "dead" eases in over a small step of congU about each threshold, so cells fade out one by one as it rises, never pop. Away from the
        // thresholds it is 0 or 1, as the bitmap's.)
        float dd = q < 0.4 ? smoothstep(0.105, 0.135, cu) * smoothstep(-0.015, 0.015, cu * (1.25 - q * 1.6) - t2.x) : 0.0;
        float dz = sj * min(t0.w, t1.x) * 0.45;
        float ang = t0.z + t2.w * sj * 0.9;
        float lw = mix(t0.w, t0.w * 0.7, dd) * (1.0 + 0.12 * sj), ww = mix(t1.x, t1.x * 0.7, dd) * (1.0 + 0.3 * sj);
        vec2 d = wp - (t0.xy + t2.yz * dz);
        float ca = cos(ang), sa = sin(ang);
        vec2 lp = vec2(ca * d.x + sa * d.y, -sa * d.x + ca * d.y);
        float r = min(lw, ww) * 0.38;
        vec2 qd = abs(lp) - 0.5 * vec2(lw, ww) + r;
        float sd = length(max(qd, vec2(0.0))) + min(max(qd.x, qd.y), 0.0) - r;
        if (sd > 0.5 * lw0 + px) continue;
        float tt = 0.88 + 0.12 * t1.y;
        vec3 fill = mix(lvTone(uLBase * tt + (1.0 - tt) * (dark ? 0.15 : 1.0) * 0.3, q, dark), dark ? vec3(0.42, 0.33, 0.3) : vec3(0.93, 0.86, 0.72), dd);
        float af = mix(dark ? 0.8 : 0.92, 0.6, dd), live = 1.0 - dd;
        acc = lvOver(lvTint(fill, af) * (lvCov(sd, px) * clipC), acc);
        if (live > 0.0) {
          acc = lvOver(lvTint(uLPlate.rgb, uLPlate.a) * (lvLine(sd, 0.5 * lw0, px) * clipC * live), acc);
          float dn = length(lp - vec2(t1.z * lw, 0.0)) - max(0.9, ww * 0.16);
          acc = lvOver(lvTint(uLInk.rgb, uLInk.a) * (lvCov(dn, px) * clipC * live), acc);
        }
      }
    }
    // Zone 3 congestion: blood pooling round the central vein (the radial gradient from 0.05 R to 0.55 R).
    if (cu > 0.04) {
      float u = clamp((length(wp - uLCen.xy) - 0.05 * R) / (0.5 * R), 0.0, 1.0);
      float a = u < 0.6 ? mix(0.5 * cu, 0.22 * cu, u / 0.6) : mix(0.22 * cu, 0.0, (u - 0.6) / 0.4);
      acc = lvOver(lvTint(uLNut, a) * clipC, acc);
    }
    if (uLSt.z > 0.5) {
      // Zones: the radial gradient of paintLobule (lobule-paint.js ZONE_AT): zone 3 to 0.18 R from the central vein, zone 2 at 0.5 R, zone 1 from 0.85 R.
      float zr = length(wp - uLCen.xy) / R;
      vec3 zc = zr < 0.5 ? mix(uLZ3, uLZ2, clamp((zr - 0.18) / 0.32, 0.0, 1.0)) : mix(uLZ2, uLZ1, clamp((zr - 0.5) / 0.35, 0.0, 1.0));
      acc = lvOver(lvTint(zc, dark ? 0.2 : 0.17) * clipC, acc);
    }
    // Space of Disse collagen: a round-capped stroke along each sinusoid, one alpha a tube (its segments' union), tubes laid in order.
    if (uLSin.a > 0.0 && ib.x >= 0 && ib.y >= 0 && ib.x < nb && ib.y < nb) {
      vec2 sh = texelFetch(uLB, ib, 0).ba;
      int sst = int(sh.x), scn = int(sh.y), curT = -1;
      float curC = 0.0;
      for (int n = 0; n < scn; n++) {
        int j = sst + n, si = int(texelFetch(uLI, ivec2(j & 1023, j >> 10), 0).r);
        int sx = 2 * (si & 511), sy = si >> 9;
        vec4 sg = texelFetch(uLS, ivec2(sx, sy), 0);
        int tb = int(texelFetch(uLS, ivec2(sx + 1, sy), 0).r);
        if (tb != curT) {
          if (curT >= 0) acc = lvOver(lvTint(uLSin.rgb, uLSin.a) * (curC * clipC), acc);
          curT = tb; curC = 0.0;
        }
        float hw = lvK(tb >> 2)[tb & 3] + 1.0 + 1.75 * uLFib.x;
        curC = max(curC, lvCov(lvSeg(wp, sg.xy, sg.zw, hw, hw), px));
      }
      if (curT >= 0) acc = lvOver(lvTint(uLSin.rgb, uLSin.a) * (curC * clipC), acc);
    }
    // Stellate (Ito) cells: a spindle body with four tapered strands (one fill), and a nucleus over it.
    if (uLHs.x > 0.5) {
      float ac = uLHs.y, rs0 = uLHs.z, L = rs0 * (2.4 + 1.4 * ac), Wb = rs0 * (0.42 + 0.2 * ac);
      int hOff = int(uLHs.w);
      for (int h = 0; h < 32; h++) {
        if (h >= int(uLHs.x)) break;
        vec4 h0 = lvK(hOff + 2 * h), h1 = lvK(hOff + 2 * h + 1);
        vec2 d = wp - h0.xy;
        float rr = 3.2 * L + rs0 + 2.0 * px;
        if (dot(d, d) > rr * rr) continue;
        vec2 u = vec2(cos(h0.z), sin(h0.z)), nn = vec2(h0.w, h1.x);
        vec2 lp = vec2(dot(d, u), dot(d, vec2(-u.y, u.x)));
        float sd = lvEll(lp, vec2(L * 0.6, Wb));
        for (int g = 0; g < 2; g++) {
          float sg = g == 0 ? -1.0 : 1.0;
          vec2 x0 = h0.xy + u * sg * L * 0.45;
          sd = min(sd, lvStrand(wp, x0, u * sg, nn, L * (2.0 + 0.6 * ac), Wb * 0.55, 0.45, rs0));
          sd = min(sd, lvStrand(wp, x0, u * sg, nn, L * (1.1 + 0.4 * ac), Wb * 0.35, -0.25, rs0));
        }
        acc = lvOver(lvTint(uLHB.rgb, uLHB.a) * (lvCov(sd, px) * lvThin(2.0 * Wb / px) * clipC), acc);
        acc = lvOver(lvTint(uLHN.rgb, uLHN.a) * (lvCov(lvEll(lp, vec2(L * 0.26, Wb * 0.5)), px) * lvThin(Wb / px) * clipC), acc);
      }
    }
  }
  // Healthy: just the limiting plate, a hairline (not clipped).
  if (sj < 0.05) acc = lvOver(lvTint(uLPlate.rgb, uLPlate.a * (1.0 - smoothstep(0.0, 0.05, sj))) * lvLine(hm, 0.5, px), acc);
  // The septa, the portal tracts and the central collar, in the order they are laid.
  if (uLKB.x > 0.5) {
    int nk = int(uLKB.x);
    ivec2 ik = ivec2(floor((wp - uLBox.xy) / uLKB.y));
    if (ik.x >= 0 && ik.y >= 0 && ik.x < nk && ik.y < nk) {
      vec4 bh = lvK(int(uLKB.z) + ik.y * nk + ik.x);
      int st = int(bh.x), ct = int(bh.y), ib0 = int(uLKB.w);
      for (int n = 0; n < ct; n++) acc = lvItem(wp, px, int(lvK(ib0 + st + n).x), acc);
    }
  }
  return acc;
}
`;
