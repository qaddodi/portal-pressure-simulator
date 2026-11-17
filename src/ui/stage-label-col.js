// The label solver's helpers for a stent called out at its three points and for the stent's own drawn dimensions (moved out of stage-label-solve.js,
// 17 Nov 2026, as it passed its 1500 lines): where a point is on the screen, the column's two sides scored, the slide's mark on the stent and its lane, a
// caliper's boxes, and the dimension words' and bracket's boxes as obstacles. Kept records only; nothing here reads the page.
import { STENT_SITES, stentGate } from '../engine/topology.js';
import { hits, within } from './label-place.js';

export function createLabelCol({ geo, pointAt, worldToLocalInto, lineHits, stenosisAt, live, E }) {
  const STENT_PTS = ['proximal', 'mid', 'distal'];
  const SB_A = [0, 0], SB_B = [0, 0], SB_C = [0, 0], SB_D = [0, 0];
  const SC_R = { x0: 0, y0: 0, x1: 0, y1: 0 };
  const LANE = { ox: 0, oy: 0, ux: 0, uy: 0 };
  // A stent's point on the screen, written into `out`.
  function pointAtLocal(out, pts, u) { const p = pointAt(pts, u); return worldToLocalInto(out, p[0], p[1]); }
  // (A slide's caliper or bracket: boxes along the line from p to q, pushed on the boxes placed.)
  function segBoxes(placed, p, q, pad) {
    worldToLocalInto(SB_A, p[0], p[1]); worldToLocalInto(SB_B, q[0], q[1]);
    const x0 = SB_A[0], y0 = SB_A[1], x1 = SB_B[0], y1 = SB_B[1], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8));
    for (let i = 0; i < n; i++) {
      const u0 = i / n, u1 = (i + 1) / n, xa = x0 + (x1 - x0) * u0, xb = x0 + (x1 - x0) * u1, ya = y0 + (y1 - y0) * u0, yb = y0 + (y1 - y0) * u1;
      placed.push({ x0: Math.min(xa, xb) - pad, y0: Math.min(ya, yb) - pad, x1: Math.max(xa, xb) + pad, y1: Math.max(ya, yb) + pad, dot: true });
    }
  }
  // How badly a stent's three points would stand in a column on `side` of their dots: off the view, under a card, over vessels.
  function colSideScore(side, col, tpl, G, wT, h, view, obstacles) {
    const padX = tpl.padX || 0, padY = tpl.padY || 0;
    let n = 0;
    for (let i = 0; i < 3; i++) {
      pointAtLocal(SB_C, geo[col].cur, STENT_SITES[STENT_PTS[i]]);
      const x = side === 'E' ? SB_C[0] + G : SB_C[0] - G - wT, y = SB_C[1] - h / 2;
      SC_R.x0 = x - padX; SC_R.y0 = y - padY; SC_R.x1 = x + wT + padX; SC_R.y1 = y + h + padY;
      let under = false;
      for (let j = 0; j < obstacles.length; j++) { const o = obstacles[j]; if (!o.probe && hits(SC_R, o)) { under = true; break; } }
      n = n + (within(SC_R, view) ? 0 : 1e3) + (under ? 1e3 : 0) + lineHits(SC_R, 2) * 10;
    }
    return n;
  }
  // The slide's mark (or the first of its marks) that stands on this stent, or null.
  function focusMarkOn(st, col) {
    const fo = st.focus;
    if (!fo) return null;
    const ms = fo.marks;
    if (ms) { for (let i = 0; i < ms.length; i++) if (ms[i].edges?.[0] === col) return ms[i]; return null; }
    return fo.edges?.[0] === col ? fo : null;
  }
  // The lane the slide's mark leaves along at the narrowing (kept record LANE), or null.
  function laneFor(col, st, f) {
    const m = focusMarkOn(st, col);
    if (!m) return null;
    const pp = f.viewParams || st.params, cur = geo[col].cur;
    const pt = pointAt(cur, stenosisAt(col, pp)), x = pt[0], y = pt[1], dx = pt[2], dy = pt[3];
    worldToLocalInto(SB_A, x, y);
    const ox = SB_A[0], oy = SB_A[1];
    pointAtLocal(SB_B, cur, m.seg ? STENT_SITES[stentGate(m.seg, pp, col)] : 0.5);
    if (Math.hypot(SB_B[0] - ox, SB_B[1] - oy) > 12) return null;
    worldToLocalInto(SB_B, x + dx, y + dy);
    const tx = SB_B[0], ty = SB_B[1], n = Math.hypot(tx - ox, ty - oy) || 1;
    pointAtLocal(SB_C, cur, STENT_SITES.mid);
    const cx = SB_C[0], cy = SB_C[1];
    const sg = (cx - ox) * (tx - ox) + (cy - oy) * (ty - oy) > 0 ? -1 : 1;
    LANE.ox = ox; LANE.oy = oy; LANE.ux = (sg * (tx - ox)) / n; LANE.uy = (sg * (ty - oy)) / n;
    return LANE;
  }
  // (A stent's dimensions drawn on the figure (stage-transitions.js stentBracket: its waist's bracket, and any words a box is marked lab for):
  // no label, slide callout or stent point sits on them, and a leader runs through none of the words (lab). Their boxes are the live figure's world boxes, so a
  // solve ahead for the other view takes none. The Doppler probe keeps off the same boxes, as of this solve (live.dimRects: stage-doppler.js dprAvoid). 17 Nov 2026.)
  function dimObstacles(placed) {
    const dr = live.dimRects;
    dr.length = 0;
    for (const [id, bs] of live.dimBoxes) {
      if (!E[id]?.vis) continue;
      for (let i = 0; i < bs.length; i++) {
        const b = bs[i];
        worldToLocalInto(SB_A, b[0], b[1]); worldToLocalInto(SB_B, b[2], b[3]); worldToLocalInto(SB_C, b[0], b[3]); worldToLocalInto(SB_D, b[2], b[1]);
        const r = { x0: Math.min(SB_A[0], SB_B[0], SB_C[0], SB_D[0]) - 2, y0: Math.min(SB_A[1], SB_B[1], SB_C[1], SB_D[1]) - 2, x1: Math.max(SB_A[0], SB_B[0], SB_C[0], SB_D[0]) + 2, y1: Math.max(SB_A[1], SB_B[1], SB_C[1], SB_D[1]) + 2, lab: !!b[4], dim: true };   // alloc-rare: a solve's, a few boxes a stent
        placed.push(r); dr.push(r);
      }
    }
  }
  return { pointAtLocal, segBoxes, colSideScore, focusMarkOn, laneFor, dimObstacles };
}
