// The HVPG and EUS-PPG summary's leaders and row order (pure, no DOM; kept state, so a frame makes no array or object).
//
// The stack has two readings in a column. Each reading has a leader to its point on the vein, and the leaders must never cross
// each other or run through the other reading. Which reading is the upper row cannot be known from the points alone: it depends on
// where the stack stands (above, below or beside the points) and on how the leaders leave it. So the order is chosen here, after the
// place is known: the order that follows the points is tried first (the reading whose point stands lower is the lower row: Mohammad,
// 13 Nov 2026), and the other order is taken only when the first one crosses and the other does not (review LBL-1, 15 Nov 2026).
// Both orders are worked out from the rows' own sizes (never from where the rows stand now), so the answer is the same on the frame
// the order changes as on the one after, when the rows have been measured again.
import { clamp } from './num.js';
import { segsCross, segHitsBox } from './seg-hits.js';


/** One plan, rewritten by each call: swap, the rows' rects (by reading: x, y, w, h), the leaders' points (by reading, flat x y pairs). */
export const STACK = {
  swap: false, clean: true,
  rect: [new Float64Array(4), new Float64Array(4)],
  lead: [new Float64Array(10), new Float64Array(10)],
  n: [0, 0],
  top: 0, bot: 1,        // (the readings in the upper and the lower row)
  m0: 0, m1: 0,          // (the middle of the upper and of the lower row, from the box's top, for the bracket)
};

const probe = { x0: 0, y0: 0, x1: 0, y1: 0 }, segA = { x0: 0, y0: 0, x1: 0, y1: 0 }, boxB = { x0: 0, y0: 0, x1: 0, y1: 0 };
const nrm = (v) => (v > 0 ? v : 0);

// The rows' rects for an order: the upper row (reading `top`) first, a gap between them (the gap and the rows' sizes taken from R, the measured
// layout in whatever order it was measured in; R[j] = [left, top, width, height] from the box).
function place(S, R, x, y, top) {
  const bot = 1 - top, cur = R[0][1] <= R[1][1] ? 0 : 1;   // (the reading measured as the upper row)
  const y0 = Math.min(R[0][1], R[1][1]), gap = Math.max(0, Math.max(R[0][1], R[1][1]) - y0 - R[cur][3]);
  const a = S.rect[top], b = S.rect[bot];
  a[0] = x + R[top][0]; a[1] = y + y0; a[2] = R[top][2]; a[3] = R[top][3];
  b[0] = x + R[bot][0]; b[1] = y + y0 + R[top][3] + gap; b[2] = R[bot][2]; b[3] = R[bot][3];
  S.top = top; S.bot = bot;
  S.m0 = y0 + R[top][3] / 2; S.m1 = y0 + R[top][3] + gap + R[bot][3] / 2;
}

// The leaders for the rects as placed. P: the points by reading ([[x, y], [x, y]]); box: x, y, w, h; mid: the stack stands midway between
// its points (EUS-PPG's); beside: it stands right of them (each leader runs straight out of its row's left edge).
function lead(S, P, bx, by, bh, mid, beside) {
  const a = S.rect[S.top], b = S.rect[S.bot];
  const colTop = a[1], colBot = b[1] + b[3];
  const below = (P[0][1] + P[1][1]) / 2 > by + bh / 2;
  for (let j = 0; j < 2; j++) {
    const r = S.rect[j], px = P[j][0], py = P[j][1], L = S.lead[j], rx0 = r[0], ry0 = r[1], rx1 = r[0] + r[2], ry1 = r[1] + r[3], isTop = j === S.top;
    if (mid) {
      // The upper row's leader leaves its top edge, the lower row's its bottom edge, each straight to its own point.
      L[0] = clamp(px, rx0 + 12, rx1 - 12); L[1] = isTop ? ry0 : ry1; L[2] = px; L[3] = py; S.n[j] = 2;
    } else if (beside) {
      L[0] = rx0; L[1] = (ry0 + ry1) / 2; L[2] = px; L[3] = py; S.n[j] = 2;
    } else if (isTop === !below) {
      // The row nearest the points leaves the edge that faces them.
      L[0] = clamp(px, rx0 + 12, rx1 - 12); L[1] = below ? ry1 : ry0; L[2] = px; L[3] = py; S.n[j] = 2;
    } else {
      // The other row leaves its left edge and runs beside the column, past its far end, then to its point.
      const ex = rx0 - 12, ey = below ? colBot + 14 : colTop - 14;
      L[0] = rx0; L[1] = (ry0 + ry1) / 2; L[2] = ex; L[3] = L[1]; L[4] = ex; L[5] = ey; L[6] = px; L[7] = py; S.n[j] = 4;
    }
  }
}

// How many faults the plan has: leaders that cross, and a leader through the other reading's row.
function faults(S) {
  let n = 0;
  for (let i = 0; i + 1 < S.n[0]; i++) for (let k = 0; k + 1 < S.n[1]; k++) {
    segA.x0 = S.lead[0][i * 2]; segA.y0 = S.lead[0][i * 2 + 1]; segA.x1 = S.lead[0][i * 2 + 2]; segA.y1 = S.lead[0][i * 2 + 3];
    probe.x0 = S.lead[1][k * 2]; probe.y0 = S.lead[1][k * 2 + 1]; probe.x1 = S.lead[1][k * 2 + 2]; probe.y1 = S.lead[1][k * 2 + 3];
    if (segsCross(segA, probe)) n++;
  }
  for (let j = 0; j < 2; j++) {
    const r = S.rect[1 - j]; boxB.x0 = r[0]; boxB.y0 = r[1]; boxB.x1 = r[0] + r[2]; boxB.y1 = r[1] + r[3];
    for (let i = 0; i + 1 < S.n[j]; i++) {
      segA.x0 = S.lead[j][i * 2]; segA.y0 = S.lead[j][i * 2 + 1]; segA.x1 = S.lead[j][i * 2 + 2]; segA.y1 = S.lead[j][i * 2 + 3];
      if (segHitsBox(segA, boxB, 0)) n++;
    }
  }
  return n;
}

/**
 * Plan the stack standing at (x, y), box bw x bh. P: the readings' points by reading ([[x, y], [x, y]], stage px); R: each reading's row from
 * the box ([left, top, width, height], as measured); kept: the order now shown (true: reading 1 is the upper row), or undefined; mid: EUS-PPG's.
 * Fills and returns STACK: `swap` (reading 1 is the upper row), the rects, the leaders, the brackets' two middles, `clean` (no fault).
 */
export function planStack(P, R, x, y, bw, bh, kept, mid) {
  const S = STACK, dy = P[0][1] - P[1][1];
  // The order that follows the points: the reading whose point stands lower is the lower row; a near tie keeps the order shown.
  const prefer = dy > 4 ? true : dy < -4 ? false : kept === true;
  const beside = !mid && x >= Math.max(P[0][0], P[1][0]) + 4;
  const sized = nrm(R[0][3]) > 0 && nrm(R[1][3]) > 0;   // (the rows not measured yet: nothing to judge, the order that follows the points)
  place(S, R, x, y, prefer ? 1 : 0); lead(S, P, x, y, bh, mid, beside);
  S.swap = prefer; S.clean = true;
  if (!sized) return S;
  const f0 = faults(S);
  if (!f0) return S;
  place(S, R, x, y, prefer ? 0 : 1); lead(S, P, x, y, bh, mid, beside);
  const f1 = faults(S);
  if (f1 < f0) { S.swap = !prefer; S.clean = f1 === 0; return S; }
  place(S, R, x, y, prefer ? 1 : 0); lead(S, P, x, y, bh, mid, beside);
  S.clean = false;
  return S;
}
