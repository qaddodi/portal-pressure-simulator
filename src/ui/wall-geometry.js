// Where everything in the Wall mechanics picture goes (the varix cross-section, instruments.js createVarixWall).
// No DOM and no canvas here: the names' ink comes in as rows (glyph-measure.js inkBox), the answers go into kept objects, so a
// draw makes none and a unit test can ask the same questions the page does (tests/wall-geometry.test.js).
//
// The ring is sized by the picture's height (and its width where that is the smaller): a wide box gives it no more room, it gives
// the NAMES room. σ and w stand in free space beside the varix with a short leader to what they name:
//   - σ outside the wall, upper right, on the line out from the varix through the end of the stress arc;
//   - w on the line out from the wall-thickness bracket, past the ΔP arrows if they would touch it.
// Both keep their place for the whole beat (they are fitted to the largest varix and ΔP the picture can show), so they never
// slide; only the leaders' near ends follow the varix. "lumen", "muscle" and "r" keep to the rings they name.

import { clamp } from './num.js';

// ── ink, as the page reads it (each row [top, bottom, left, right], px from the name's anchor) ──
/** How far a name's ink at (x, y) is inside a circle (its edge), in px; negative where it crosses. */
export const inkIn = (rows, x, y, ox, oy, r) => {
  let m = Infinity;
  for (let i = 0; i < rows.length; i++) { const q = rows[i]; m = Math.min(m, r - Math.hypot(Math.max(Math.abs(x + q[2] - ox), Math.abs(x + q[3] - ox)), Math.max(Math.abs(y + q[0] - oy), Math.abs(y + q[1] - oy)))); }
  return m;
};
/** How far a name's ink at (x, y) is outside a circle. */
export const inkOut = (rows, x, y, ox, oy, r) => {
  let m = Infinity;
  for (let i = 0; i < rows.length; i++) { const q = rows[i]; m = Math.min(m, Math.hypot(Math.max(0, x + q[2] - ox, ox - x - q[3]), Math.max(0, y + q[0] - oy, oy - y - q[1])) - r); }
  return m;
};
/** From a box [left, top, right, bottom]. */
export const inkFrom = (rows, x, y, box) => {
  const bl = box[0], bt = box[1], br = box[2], bb = box[3];
  let m = Infinity;
  for (let i = 0; i < rows.length; i++) {
    const q = rows[i], dx = Math.max(bl - (x + q[3]), x + q[2] - br), dy = Math.max(bt - (y + q[1]), y + q[0] - bb);
    m = Math.min(m, dx > 0 && dy > 0 ? Math.hypot(dx, dy) : Math.max(dx, dy));
  }
  return m;
};
/** The least / the most of column k (0 top, 1 bottom, 2 left, 3 right) over a name's rows. */
export const colMin = (rows, k) => { let m = Infinity; for (let i = 0; i < rows.length; i++) m = Math.min(m, rows[i][k]); return m; };
export const colMax = (rows, k) => { let m = -Infinity; for (let i = 0; i < rows.length; i++) m = Math.max(m, rows[i][k]); return m; };
/** The ink box of rows set at (x, y), into out as [left, top, right, bottom]. */
export const inkBoxInto = (out, rows, x, y) => { out[0] = x + colMin(rows, 2); out[1] = y + colMin(rows, 0); out[2] = x + colMax(rows, 3); out[3] = y + colMax(rows, 1); };

// ── a line segment against a box ──
const ptBox = (px, py, l, t, r, b) => Math.hypot(Math.max(l - px, 0, px - r), Math.max(t - py, 0, py - b));
const ptSeg = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, d2 = dx * dx + dy * dy, t = d2 ? clamp(((px - ax) * dx + (py - ay) * dy) / d2, 0, 1) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
let T0 = 0, T1 = 1;
const clipT = (p, q) => {
  if (p === 0) return q >= 0;
  const u = q / p;
  if (p < 0) { if (u > T1) return false; if (u > T0) T0 = u; } else { if (u < T0) return false; if (u < T1) T1 = u; }
  return true;
};
/** The gap between a segment and a box [l, t, r, b]: 0 where they cross. */
const segBox = (ax, ay, bx, by, l, t, r, b) => {
  T0 = 0; T1 = 1;
  const dx = bx - ax, dy = by - ay;
  if (clipT(-dx, ax - l) && clipT(dx, r - ax) && clipT(-dy, ay - t) && clipT(dy, b - ay)) return 0;
  return Math.min(ptBox(ax, ay, l, t, r, b), ptBox(bx, by, l, t, r, b), ptSeg(l, t, ax, ay, bx, by), ptSeg(r, t, ax, ay, bx, by), ptSeg(r, b, ax, ay, bx, by), ptSeg(l, b, ax, ay, bx, by));
};

// The ΔP arrows: eight, a quarter-turn apart from -π (the drawing's own loop, instruments.js).
const COS8 = [], SIN8 = [];
for (let k = 0; k < 8; k++) { COS8.push(Math.cos(-Math.PI + k * Math.PI / 4)); SIN8.push(Math.sin(-Math.PI + k * Math.PI / 4)); }

/** The stress arcs' end (σ's line out) and the wall-thickness bracket's direction, in radians from +x, y down. */
export const SIGMA_A = -Math.PI / 2 + 1.05;
export const BRACKET_A = Math.PI * 0.62;
// (other lines a name falls back to where its first does not reach the canvas: a shorter, flatter or steeper line out)
const SIGMA_TRY = [SIGMA_A, SIGMA_A - 0.35, SIGMA_A + 0.3, SIGMA_A - 0.7, -0.05];
const BRACKET_TRY = [BRACKET_A, BRACKET_A + 0.3, BRACKET_A - 0.3, BRACKET_A + 0.7, BRACKET_A - 0.7];

/** What every name must keep (px), for the picture's checks (the unit test and the checks read the same table). */
export const WALL_LEAST = {
  'σ': { ring: 2, arrows: 2, canvas: 1, hub: 0 },
  w: { arrows: 2, canvas: 1, edge: 1 },
  r: { fill: 1, dash: 2 },
  lumen: { edge: 1, w: 2, arrows: 2 },
  muscle: { outer: 1, band: 1 },
};

export function createWallGeometry() {
  const geo = { w: NaN, hh: NaN, fs: NaN, wc: NaN, R: 0, cy: 0, off: new Set() };   // (the size, type size and wall the picture is fitted to; the names left out at it)
  const S = { w: 0, hh: 0, cx: 0, fs: 12, v: null, ink: null };
  const mkParts = () => ({ Rl: 0, rr: 0, vy: 0, lw: 0, ro: 0, len: 0, tip: 0, top: 0 });
  const P = mkParts(), M = mkParts(), Q = mkParts();   // this beat's, the largest the picture shows, and a trial's
  // A name kept at its place for the picture's size: where its centre is, where its leader ends, and its clearances.
  const mkFix = () => ({ ok: false, x: 0, y: 0, ex: 0, ey: 0, ux: 0, uy: 0, ring: 0, arrows: 0, canvas: 0, hub: 0, edge: 0 });
  const FS = mkFix(), FW = mkFix();
  const BX = [0, 0, 0, 0], boxDash = [0, 0, 0, 0], boxW = [0, 0, 0, 0], boxBrk = [0, 0, 0, 0];
  const gR = { fill: 0, dash: 0 }, gSig = { ring: 0, arrows: 0, canvas: 0, hub: 0 }, gW = { arrows: 0, canvas: 0, edge: 0 };
  const gLumen = { edge: 0, w: 0, arrows: 0 }, gMuscle = { outer: 0, band: 0 }, gPic = { R: 0, cy: 0, h: 0, w: 0 };
  const gaps = { r: undefined, 'σ': undefined, w: undefined, lumen: undefined, muscle: undefined, picture: gPic };
  // What a draw reads: the ring and varix, and each name's place (kept objects: a draw makes none).
  const L = {
    cx: 0, cy: 0, R: 0, Rl: 0, rr: 0, vy: 0, lw: 0, ro: 0, len: 0, hdS: 0,
    r: { show: false, x: 0, y: 0 }, sigma: { show: false, x: 0, y: 0, sx: 0, sy: 0, ex: 0, ey: 0, lead: false },
    w: { show: false, x: 0, y: 0, sx: 0, sy: 0, ex: 0, ey: 0, lead: false, bx0: 0, by0: 0, bx1: 0, by1: 0 },
    lumen: { show: false, y: 0 }, muscle: { show: false, y: 0 }, drawn: 0, gaps,
  };

  // The varix and its marks for a picture of radius R round (cx, cy), at this beat's radius, wall and ΔP, into t.
  // (most: the largest varix and ΔP the picture can show, which set its size, so the ring holds still through every beat)
  const parts = (R, cy, most, t) => {
    const v = S.v;
    t.Rl = R * 0.52; t.rr = most ? R * 0.3 : clamp(v.r * R * 0.05, 4, R * 0.3);
    t.vy = cy - t.Rl - t.rr * 0.25;
    t.lw = clamp((most ? Math.ceil(v.w * 10) / 10 : v.w) * R / 20, 1, 10);
    t.ro = t.rr + t.lw / 2 + Math.max(5, R / 30);
    t.len = (most ? 30 : clamp(v.ptm, 0, 30)) / 30 * t.rr * 0.9 + 4;
    t.tip = t.rr + 3 + t.len;
    t.top = t.vy - Math.max(t.rr + t.lw / 2, t.ro + 2.5, t.tip + 1);
    return t;
  };
  const arrowClear = (bx, m) => {
    let g = Infinity;
    for (let k = 0; k < 8; k++) g = Math.min(g, segBox(S.cx + COS8[k] * (m.rr + 3), m.vy + SIN8[k] * (m.rr + 3), S.cx + COS8[k] * m.tip, m.vy + SIN8[k] * m.tip, bx[0], bx[1], bx[2], bx[3]));
    return g - 0.43 * (4 + M.R / 60);   // (less the arrowheads' half width)
  };
  // Is a name's ink at (x, y) clear? mode 0: σ, outside the wall's ring and the stress arcs; mode 1: w, wholly in the lumen or wholly out of it.
  const probe = (ink, x, y, R, cy, m, mode, g) => {
    inkBoxInto(BX, ink, x, y);
    g.canvas = Math.min(BX[0], S.w - BX[2], BX[1], S.hh - BX[3]);
    if (g.canvas < 1) return false;
    const hubR = mode === 0 ? m.ro + 5 + R / 50 + 2 : m.rr + m.lw / 2 + 3 + 6 + 2;   // (the stress arcs and their heads / the wall's bracket and its ticks)
    g.hub = inkOut(ink, x, y, S.cx, m.vy, hubR);
    if (g.hub < 0) return false;
    g.arrows = arrowClear(BX, m);
    if (g.arrows < 2) return false;
    if (mode === 0) { g.ring = inkOut(ink, x, y, S.cx, cy, R + 0.5); return g.ring >= 2; }
    g.edge = Math.max(inkIn(ink, x, y, S.cx, cy, m.Rl - 0.35), inkOut(ink, x, y, S.cx, cy, m.Rl + 0.35));
    return g.edge >= 1;
  };
  // The nearest place along a line out from the varix (at angle a, from distance d0) where the name's ink is clear. A line that has
  // left the canvas in its own direction has no place further out.
  const scan = (ink, a, d0, R, cy, m, mode, g) => {
    const ux = Math.cos(a), uy = Math.sin(a), dMax = Math.hypot(S.w, S.hh);
    for (let d = d0; d < dMax; d += 0.5) {
      const x = S.cx + ux * d, y = m.vy + uy * d;
      if (probe(ink, x, y, R, cy, m, mode, g)) { g.x = x; g.y = y; g.ux = ux; g.uy = uy; return true; }
      if ((ux > 0 && BX[2] > S.w) || (ux < 0 && BX[0] < 0) || (uy < 0 && BX[1] < 0) || (uy > 0 && BX[3] > S.hh)) return false;
    }
    return false;
  };
  const placeName = (ink, tries, d0, R, cy, mode, g) => {
    g.ok = false;
    for (let i = 0; i < tries.length && !g.ok; i++) g.ok = scan(ink, tries[i], d0, R, cy, M, mode, g);
    if (!g.ok) return false;
    // (the leader ends just short of the name's ink, on its line out)
    const rad = Math.min((Math.max(-colMin(ink, 2), colMax(ink, 3))) / Math.max(0.05, Math.abs(g.ux)), (Math.max(-colMin(ink, 0), colMax(ink, 1))) / Math.max(0.05, Math.abs(g.uy))) + 2;
    g.ex = g.x - g.ux * rad; g.ey = g.y - g.uy * rad;
    return true;
  };
  const sigmaAt = (R, cy) => { M.R = R; parts(R, cy, true, M); return placeName(S.ink.T, SIGMA_TRY, M.ro + 5 + R / 50 + 2, R, cy, 0, FS); };
  // A ring is the picture's if the arrows and arcs stay inside the canvas and σ has a clear place outside the wall.
  const atR = (R) => { const c0 = S.hh - 6 - R; return Math.min(S.hh - 1 - R, c0 + Math.max(0, 1 - parts(R, c0, true, Q).top)); };
  const okR = (R) => { const cy = atR(R); return parts(R, cy, true, Q).top >= 1 && sigmaAt(R, cy); };
  // (A name that once misses at this size stays out until the size changes: r moves with the beat, and a name blinking in and out with
  // it would read as a glitch.)
  const keepName = (t, ok) => { if (!ok) geo.off.add(t); return !geo.off.has(t); };

  function fit(wc) {
    let lo = 20, hi = Math.min(S.w, S.hh) / 2 - 6;
    if (okR(hi)) lo = hi; else for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (okR(m)) lo = m; else hi = m; }
    if (geo.w !== S.w || geo.hh !== S.hh || geo.fs !== S.fs) geo.off.clear();
    geo.w = S.w; geo.hh = S.hh; geo.fs = S.fs; geo.wc = wc; geo.R = lo; geo.cy = atR(lo);
    // σ and w, at the largest varix, for this size (they hold still through the beat)
    const R = geo.R, cy = geo.cy;
    sigmaAt(R, cy);
    M.R = R; parts(R, cy, true, M);
    placeName(S.ink.W, BRACKET_TRY, M.rr + M.lw / 2 + 3 + 6 + 0.6 * S.fs, R, cy, 1, FW);
  }

  /**
   * The picture's layout for a canvas w × hh with type size fs, at this beat's varix v ({ r, w, ptm }); ink: the names' rows
   * ({ T: σ, R: r, W: w, L: lumen, M: muscle }). Returns L (kept: written again by each call).
   */
  function place(w, hh, fs, ink, v) {
    S.w = w; S.hh = hh; S.cx = w / 2; S.fs = fs; S.ink = ink; S.v = v;
    const wc = Math.ceil(v.w * 10);
    if (geo.w !== w || geo.hh !== hh || geo.fs !== fs || geo.wc !== wc || geo.ink !== ink) { fit(wc); geo.ink = ink; }
    const { R, cy } = geo, cx = S.cx;
    parts(R, cy, false, P);
    const { Rl, rr, vy, lw, ro, len } = P, { R: inkR, W: inkW, L: inkL, M: inkM } = ink;
    L.cx = cx; L.cy = cy; L.R = R; L.Rl = Rl; L.rr = rr; L.vy = vy; L.lw = lw; L.ro = ro; L.len = len; L.hdS = 5 + R / 50;
    gaps.r = gaps['σ'] = gaps.w = gaps.lumen = gaps.muscle = undefined;
    L.r.show = L.sigma.show = L.w.show = L.lumen.show = L.muscle.show = false;
    let drawn = 0;   // (bit i: WALL_NAMES[i] is drawn, instruments.js)
    // "r" just under the dashed radius, its ink 2 px or more clear of the dashes and 1 px or more inside the varix's fill;
    // on a small varix it moves in toward the centre, still under the dashes.
    const rTop = colMin(inkR, 0), rL = colMin(inkR, 2), ry = vy + 3.4 - rTop;
    boxDash[0] = cx; boxDash[1] = vy - 1.1; boxDash[2] = cx + rr; boxDash[3] = vy + 1.1;   // (the dashes' soft edge included)
    let rx = cx + rr / 2, rFill = inkIn(inkR, rx, ry, cx, vy, rr - lw / 2 - 0.5), rDash = inkFrom(inkR, rx, ry, boxDash);
    if (rFill < 2) {
      const qx = cx + 1.5 - rL, qFill = inkIn(inkR, qx, ry, cx, vy, rr - lw / 2 - 0.5);
      if (qFill > rFill) { rx = qx; rFill = qFill; rDash = inkFrom(inkR, qx, ry, boxDash); }
    }
    if (keepName('r', rFill >= 1 && rDash >= 2)) { L.r.show = true; L.r.x = rx; L.r.y = ry; drawn |= 1; gR.fill = rFill; gR.dash = rDash; gaps.r = gR; }
    // σ: its line out from the varix through the stress arc's end; the leader runs from just outside the arc's head to the name.
    const bx = Math.cos(BRACKET_A), by = Math.sin(BRACKET_A), i0 = rr - lw / 2, o0 = rr + lw / 2 + 3;
    if (FS.ok) {
      const s = L.sigma, d = ro + L.hdS * 0.55 + 1.5;
      s.show = true; s.x = FS.x; s.y = FS.y; s.ex = FS.ex; s.ey = FS.ey;
      s.sx = cx + Math.cos(SIGMA_A) * d; s.sy = vy + Math.sin(SIGMA_A) * d;
      s.lead = Math.hypot(s.ex - s.sx, s.ey - s.sy) >= 3 && (s.ex - s.sx) * FS.ux + (s.ey - s.sy) * FS.uy > 0;
      drawn |= 2; gSig.ring = FS.ring; gSig.arrows = FS.arrows; gSig.canvas = FS.canvas; gSig.hub = FS.hub; gaps['σ'] = gSig;
    }
    // w: the thickness bracket across the varix's rim (in the lumen's side), the name on its line out.
    boxW[0] = boxW[2] = -1e9; boxW[1] = boxW[3] = -1e9;
    boxBrk[0] = cx + bx * (o0 + 6) - 3.5; boxBrk[1] = vy + by * i0 - 3.5; boxBrk[2] = cx + bx * i0 + 3.5; boxBrk[3] = vy + by * (o0 + 6) + 3.5;
    const wl = L.w;
    wl.bx0 = cx + bx * i0; wl.by0 = vy + by * i0; wl.bx1 = cx + bx * (o0 + 6); wl.by1 = vy + by * (o0 + 6);   // (the bracket's two ends)
    if (FW.ok) {
      wl.show = true; wl.x = FW.x; wl.y = FW.y; wl.ex = FW.ex; wl.ey = FW.ey; wl.sx = wl.bx1; wl.sy = wl.by1;
      wl.lead = Math.hypot(wl.ex - wl.sx, wl.ey - wl.sy) >= 3 && (wl.ex - wl.sx) * FW.ux + (wl.ey - wl.sy) * FW.uy > 0;
      drawn |= 4; gW.arrows = FW.arrows; gW.canvas = FW.canvas; gW.edge = FW.edge; gaps.w = gW;
      inkBoxInto(boxW, inkW, wl.x, wl.y);
      if (wl.lead) {
        boxBrk[0] = Math.min(boxBrk[0], wl.ex - 3.5); boxBrk[1] = Math.min(boxBrk[1], wl.ey - 3.5);
        boxBrk[2] = Math.max(boxBrk[2], wl.ex + 3.5); boxBrk[3] = Math.max(boxBrk[3], wl.ey + 3.5);
      }
    }
    // "lumen" as high in the lumen as its ink keeps 1 px inside the lumen's edge and 2 px clear of the w label, its bracket and
    // leader and the ΔP arrows; "muscle" where its ink keeps the most room inside the muscle ring, 1 px or more on each side.
    // A name is drawn only where its ink fits, never across a ring's edge.
    let lumenY = 0, lumenFound = false;
    for (let y = cy + Rl * 0.35; y < cy + Rl; y += 0.25) {
      const edge = inkIn(inkL, cx, y, cx, cy, Rl - 0.35), gw = Math.min(inkFrom(inkL, cx, y, boxW), inkFrom(inkL, cx, y, boxBrk)), arrows = inkOut(inkL, cx, y, cx, vy, rr + 3 + len + 1);
      if (edge < 1) break;
      if (gw >= 2.5 && arrows >= 2) { lumenFound = true; lumenY = y; gLumen.edge = edge; gLumen.w = gw; gLumen.arrows = arrows; break; }   // (2.5: both names' soft edges)
    }
    if (keepName('lumen', lumenFound)) { L.lumen.show = true; L.lumen.y = lumenY; drawn |= 8; gaps.lumen = gLumen; }
    let muscleY = 0, muscleOuter = 0, muscleBand = 0, muscleFound = false;
    for (let y = cy + R * 0.74; y < cy + R; y += 0.25) {
      const outer = inkIn(inkM, cx, y, cx, cy, R - 0.5), band = inkOut(inkM, cx, y, cx, cy, R * 0.74);
      if (!muscleFound || Math.min(outer, band) > Math.min(muscleOuter, muscleBand)) { muscleFound = true; muscleY = y; muscleOuter = outer; muscleBand = band; }
    }
    if (keepName('muscle', muscleFound && Math.min(muscleOuter, muscleBand) >= 1)) { L.muscle.show = true; L.muscle.y = muscleY; drawn |= 16; gMuscle.outer = muscleOuter; gMuscle.band = muscleBand; gaps.muscle = gMuscle; }
    L.drawn = drawn;
    gPic.R = R; gPic.cy = cy; gPic.h = hh; gPic.w = w;
    return L;
  }
  return { place, geo };
}
