// The placement rules every label layer shares (Mohammad, 3 Nov 2026: "Same engine for labels everywhere"): the boxes a label may not
// overlap, may not leave, and the lines that may not cross it. Boxes are { x0, y0, x1, y1 } in the layer's px. Circuit's and Anatomy's layout
// (stage.js layoutLabels) and the lobule's and sinusoid's (lobule-zoom.js) ask these, so one rule decides a clash on every figure.

/** Whether two boxes overlap. */
export const hits = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
/** Whether the segment (x0, y0) → (x1, y1) passes through the box (clipped against it, Liang–Barsky). */
export const crosses = (x0, y0, x1, y1, b) => {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  for (let n = 0; n < 4; n++) {
    const p = n === 0 ? -dx : n === 1 ? dx : n === 2 ? -dy : dy, q = n === 0 ? x0 - b.x0 : n === 1 ? b.x1 - x0 : n === 2 ? y0 - b.y0 : b.y1 - y0;
    if (!p) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
};
/** Whether box r lies wholly inside box B (the visible area). */
export const within = (r, B) => r.x0 >= B.x0 && r.y0 >= B.y0 && r.x1 <= B.x1 && r.y1 <= B.y1;
/** The area where two boxes overlap (0 for none). */
export const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
/** The same, for a box kept as { l, r, t, b } (the lobule's own). */
export const overlapLRTB = (p, q) => Math.max(0, Math.min(p.r, q.r) - Math.max(p.l, q.l)) * Math.max(0, Math.min(p.b, q.b) - Math.max(p.t, q.t));
/** How far a disc { x, y, r } reaches into a { l, r, t, b } box (0 for none). */
export const discInto = (q, b) => Math.max(0, q.r - Math.hypot(Math.max(b.l - q.x, 0, q.x - b.r), Math.max(b.t - q.y, 0, q.y - b.b)));

// A label's candidate spots round its point: the compass, then a ring of sixteenths of a turn (R0 due east), nearest the level first.
export const RING_DIRS = [0, 8, 1, 15, 7, 9, 2, 14, 6, 10, 3, 13, 5, 11, 4, 12].map((k) => 'R' + k);
const RING_K = {};   // (each spot's sixteenths of a turn, looked up by offset: the spot's name is not cut up on every call)
for (let k = 0; k < 16; k++) RING_K['R' + k] = k;
// (The offset goes into one kept pair, which its one caller reads at once.)
const OFF_XY = [0, 0];
export function offset(dir, it, gap) {
  const w = it.w, hh = it.h, d = gap * 0.72;
  let x = -w / 2, y = -hh / 2;   // 'C': centered on the anchor
  switch (dir) {
    case 'N': x = -w / 2; y = -gap - hh; break;
    case 'S': x = -w / 2; y = gap; break;
    case 'E': x = gap; y = -hh / 2; break;
    case 'W': x = -gap - w; y = -hh / 2; break;
    case 'EL': x = gap; y = -hh * 0.2; break;   // (beside it, a little low: a one-line reading at the top edge of the free space)
    case 'WL': x = -gap - w; y = -hh * 0.2; break;
    case 'NE': x = d; y = -d - hh; break;
    case 'NW': x = -d - w; y = -d - hh; break;
    case 'SE': x = d; y = d; break;
    case 'SW': x = -d - w; y = d; break;
    default:
      // 'R<k>': centred on a ring of radius gap around the anchor, k sixteenths of a turn from due east (RING_DIRS)
      if (dir[0] === 'R') { const a = (RING_K[dir] * Math.PI) / 8; x = gap * Math.cos(a) - w / 2; y = gap * Math.sin(a) - hh / 2; }
  }
  OFF_XY[0] = x; OFF_XY[1] = y;
  return OFF_XY;
}


// When a name gets a leader (one rule for every view, Mohammad 4 Nov 2026): a region's name never does (organs, zone titles, lobule zones,
// sinusoid regions: it is drawn inside what it names); a name for a point or a thin vessel does only once it stands clear of it, past
// LEAD_ON px, and keeps it until it comes within LEAD_OFF px, so a pan or pinch never makes the line flicker. gapPx is measured from the
// label's box to the target as drawn. Decided at layout and carried (hadLeader) until the next one.
export const LEAD_ON = 12, LEAD_OFF = 8;
export const needsLeader = (region, gapPx, hadLeader) => !region && (gapPx > LEAD_ON || (!!hadLeader && gapPx >= LEAD_OFF));
// The gap needsLeader is given: how far the point (x, y) stands from the box { x0, y0, x1, y1 }, 0 when it lies inside.
export const boxGap = (b, x, y) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1));
// The two costs a leader pays in a placement: free up to SHORT_LEAD px, dearer to LONG_LEAD, never beyond.
export const SHORT_LEAD = 45, LONG_LEAD = 140;
// How far (x, y) is from the triangle: 0 inside it.
function triSide(a, b, x, y) { return (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]); }
export function triDist(x, y, tri) {
  const s0 = triSide(tri[0], tri[1], x, y), s1 = triSide(tri[1], tri[2], x, y), s2 = triSide(tri[2], tri[0], x, y);
  if ((s0 >= 0 && s1 >= 0 && s2 >= 0) || (s0 <= 0 && s1 <= 0 && s2 <= 0)) return 0;
  let m = Infinity;
  for (let k = 0; k < 3; k++) {
    const a = tri[k], b = tri[(k + 1) % 3], ex = b[0] - a[0], ey = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / (ex * ex + ey * ey || 1)));
    m = Math.min(m, Math.hypot(x - a[0] - ex * t, y - a[1] - ey * t));
  }
  return m;
}

// A vessel whose middle lies outside the stage but part of it is in view takes its label at the middle of the part in view: the label's point slides
// along the vessel (it.au, which the GPU pins to), so the label is not lost off the edge with its point. The longest run in view, 18 px clear of the
// edges; none in view, and the middle stays (the label is hidden with its vessel, as before). 13 Nov 2026: the left portal vein with the camera in
// on the portal bifurcation had only its tail on the stage, and its label stood off it.
const VIS_STEPS = 100, VIS_INSET = 18;
export function createSlideInView({ geo, worldToLocalInto, arcMid, LABEL_VESSEL }) {
  const P0 = [0, 0];
  return function slideInView(it, id, view) {
    const eid = it.vw > 0 && LABEL_VESSEL[id], P = eid && geo[eid]?.cur;
    if (!(P?.length > 1)) return;
    const inside = (x, y) => x >= view.x0 + VIS_INSET && x <= view.x1 - VIS_INSET && y >= view.y0 + VIS_INSET && y <= view.y1 - VIS_INSET;
    if (inside(it.ax, it.ay)) return;
    const seglen = (k) => Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]);
    let total = 0;
    for (let k = 1; k < P.length; k++) total += seglen(k);
    if (!(total > 0)) return;
    let seg = 1, run = 0, from = -1, best0 = -1, best1 = -1;
    for (let n = 0; n <= VIS_STEPS; n++) {
      const want = (total * n) / VIS_STEPS;
      while (seg < P.length - 1 && run + seglen(seg) < want) { run += seglen(seg); seg++; }
      const u = Math.min(1, Math.max(0, (want - run) / (seglen(seg) || 1)));
      worldToLocalInto(P0, P[seg - 1][0] + (P[seg][0] - P[seg - 1][0]) * u, P[seg - 1][1] + (P[seg][1] - P[seg - 1][1]) * u);
      if (inside(P0[0], P0[1])) { if (from < 0) from = n; if (best0 < 0 || n - from > best1 - best0) { best0 = from; best1 = n; } } else from = -1;
    }
    if (best0 < 0) return;
    const au = (best0 + best1) / 2 / VIS_STEPS, m = arcMid(P, au);
    worldToLocalInto(P0, m[0], m[1]);
    it.ax = P0[0]; it.ay = P0[1]; it.au = au;
  };
}
