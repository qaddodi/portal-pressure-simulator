// The rules the browser checks judge the displayed labels by (R17), as plain functions on recorded numbers, so a unit test can show a
// frozen label fails and an edge-held one passes (tests/label-judge.test.js). No browser here.
//
// A frame row is { g: the hand's frame, L: { key: [x, y, anchorX, anchorY, w, h, opacity] } } (CSS px), from the GPU labels' snapshot.
export const TOL = 1.5;
const EDGE = 14;

const nearEdge = (q, [W, H]) => q[0] < EDGE || q[1] < EDGE || q[0] + q[4] > W - EDGE || q[1] + q[5] > H - EDGE;

/** Frames of the hand's gesture a judgement can use: both this and the frame before are the hand's. */
export function judgedFrames(rows) {
  let n = 0;
  for (let i = 1; i < rows.length; i++) if (rows[i].g && rows[i - 1].g) n++;
  return n;
}

/**
 * Frame to frame: a drawn label moved with its point (a label held at the stage's edge, within EDGE px, may stay or follow a part of it; away from an edge a label standing still while its point moves fails).
 * `loose` (a zoom, which lays the labels out again as it goes): only a move against its point counts here; frozenLabels() judges the rest.
 * Returns { judged, worst, worstAt }.
 */
export function stepJudge(rows, size, loose = false) {
  let worst = 0, worstAt = '';
  const judged = judgedFrames(rows);
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i].g || !rows[i - 1].g) continue;
    for (const [key, v] of Object.entries(rows[i].L)) {
      const u = rows[i - 1].L[key];
      if (!u || v[6] < 0.9 || u[6] < 0.9) continue;   // (new, fading in or out: not a move)
      for (const k of [0, 1]) {
        const d = v[k] - u[k], a = v[2 + k] - u[2 + k];
        const edge = nearEdge(u, size) || nearEdge(v, size);
        const off = loose ? (d * a < -TOL && Math.abs(d) > TOL ? Math.abs(d) : 0) : edge ? (d * a >= -TOL && Math.abs(d) <= Math.abs(a) + TOL ? 0 : Math.min(Math.abs(d - a), Math.abs(d))) : Math.abs(d - a);   // (away from an edge nothing holds a label still: it moves with its point)
        if (off > worst) { worst = off; worstAt = `${key} frame ${i}: moved ${d.toFixed(1)} px while its point moved ${a.toFixed(1)}`; }
      }
    }
  }
  return { judged, worst, worstAt };
}

/**
 * A label frozen while its point moves: over the hand's frames where it stood fully drawn, away from every edge, its picture travelled under
 * `still` px in all while its point travelled over `moved` px. (A zoom may glide a label to a new slot or hold it at an edge; neither is frozen.)
 */
export function frozenLabels(rows, size, { moved = 30, still = 2 } = {}) {
  const acc = new Map();
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i].g || !rows[i - 1].g) continue;
    for (const [key, v] of Object.entries(rows[i].L)) {
      const u = rows[i - 1].L[key];
      const t = acc.get(key) || { own: 0, pt: 0, ok: true };
      acc.set(key, t);
      if (!u || v[6] < 0.9 || u[6] < 0.9 || nearEdge(u, size) || nearEdge(v, size)) { t.ok = false; continue; }
      t.own += Math.hypot(v[0] - u[0], v[1] - u[1]);
      t.pt += Math.hypot(v[2] - u[2], v[3] - u[3]);
    }
  }
  const out = [];
  for (const [key, t] of acc) if (t.ok && t.pt > moved && t.own < still) out.push(`${key}: its picture moved ${t.own.toFixed(1)} px while its point moved ${t.pt.toFixed(1)} px`);
  return out;
}

/** Displayed labels (the GPU snapshot's items) over displayed cards: [{ key, card }] overlapping by more than 1 px. */
export function labelsOverCards(snapshot, cards, minOpacity = 0.05) {
  const out = [];
  for (const l of snapshot.items) {
    if (!(l.a > minOpacity)) continue;
    for (const c of cards) if (l.x < c.x1 - 1 && l.x + l.w > c.x0 + 1 && l.y < c.y1 - 1 && l.y + l.h > c.y0 + 1) out.push({ key: l.key, card: c.cls });
  }
  return out;
}
