// The label gate's rules (W1, 3 Nov 2026), as plain functions on recorded numbers, so a unit test can show each rule can fail
// (tests/label-gate-judge.test.js). No browser here. The owner's bar: a label stands 100 % on its figure through a pinch, a pan, a
// presenter glide and a view switch, in Anatomy, Circuit, the lobule and the sinusoid.
//
// A frame row is { g: 1 when the frame belongs to the gesture/glide being judged, view, L: { key: P } } where P, per label drawn that frame:
//   { x, y, w, h, a        the label's box, page CSS px (what the GPU drew: label-gl snapshot, or caption-gl snapshot),
//     ax, ay               the point on the figure it names, same px, same frame (stage.labelAnchorOf / the caption's leader near end),
//     dx, dy               where the GPU drew that point's dot (label-gl marks), or null when this kind draws none,
//     glide                true while the label is easing to a new slot by design (a landing glide: judged by rest-offset, not by step),
//     foreign              true when the label's layout was made for another view than the one on screen }
// All limits are in DEVICE px (css px × dpr): the owner's 0.5 device px is a fraction of a pixel on any screen.
export const LIMIT_DEV_PX = 0.5;
const EDGE = 14;

const nearEdge = (p, [W, H]) => p.x < EDGE || p.y < EDGE || p.x + p.w > W - EDGE || p.y + p.h > H - EDGE;

/** Frames where both this and the previous are the judged motion's. */
export function judgedFrames(rows) { let n = 0; for (let i = 1; i < rows.length; i++) if (rows[i].g && rows[i - 1].g) n++; return n; }

/**
 * Rule 1, per-frame anchor error: a label must keep its offset from the point it names. From one frame to the next, the change of
 * (label − point) is the lag/jitter, in device px. Skipped: a label fading (a < .9), easing by design (glide), or held at the stage edge
 * (the screen's edge holds it by design). Returns { judged, worst, worstAt, frames (frames with any label judged), over (frames over the limit) }.
 */
export function anchorError(rows, size, dpr, limit = LIMIT_DEV_PX) {
  let worst = 0, worstAt = '', frames = 0, over = 0;
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i].g || !rows[i - 1].g) continue;
    let any = false, bad = false;
    for (const [key, p] of Object.entries(rows[i].L)) {
      const q = rows[i - 1].L[key];
      if (!q || p.a < 0.9 || q.a < 0.9 || p.glide || q.glide || p.ax == null || q.ax == null || nearEdge(p, size) || nearEdge(q, size)) continue;
      any = true;
      const e = Math.hypot((p.x - p.ax) - (q.x - q.ax), (p.y - p.ay) - (q.y - q.ay)) * dpr;
      if (e > limit) bad = true;
      if (e > worst) { worst = e; worstAt = `${key} frame ${i}: its offset from its point changed by ${e.toFixed(2)} device px`; }
    }
    if (any) frames++;
    if (bad) over++;
  }
  return { judged: judgedFrames(rows), worst, worstAt, frames, over };
}

/** Rule 2, the dots: where the GPU drew each label's dot against the point it names, in device px (every frame, moving or not). */
export function dotError(rows, dpr) {
  let worst = 0, worstAt = '', n = 0;
  rows.forEach((r, i) => {
    for (const [key, p] of Object.entries(r.L)) {
      if (p.dx == null || p.ax == null || p.a < 0.5) continue;
      n++;
      const e = Math.hypot(p.dx - p.ax, p.dy - p.ay) * dpr;
      if (e > worst) { worst = e; worstAt = `${key} frame ${i}: its dot stands ${e.toFixed(2)} device px from its point`; }
    }
  });
  return { n, worst, worstAt };
}

/** Rule 3: frames that drew a label laid out for another view (shown at all: opacity over .05). Zero allowed. */
export function foreignFrames(rows) {
  const out = [];
  rows.forEach((r, i) => { const k = Object.entries(r.L).filter(([, p]) => p.foreign && p.a > 0.05).map(([key]) => key); if (k.length) out.push(`frame ${i} (${r.view}): ${k.join(', ')}`); });
  return out;
}

/** Rule 4, at rest: where the glide ended, each label stands at the same offset from its point as the frame before (no drift after landing). Rows at rest only. */
export function restDrift(rows, dpr) {
  let worst = 0, worstAt = '';
  for (let i = 1; i < rows.length; i++) for (const [key, p] of Object.entries(rows[i].L)) {
    const q = rows[i - 1].L[key];
    if (!q || p.a < 0.9 || q.a < 0.9 || p.ax == null || q.ax == null) continue;
    const e = Math.hypot((p.x - p.ax) - (q.x - q.ax), (p.y - p.ay) - (q.y - q.ay)) * dpr;
    if (e > worst) { worst = e; worstAt = `${key} frame ${i}: moved ${e.toFixed(2)} device px at rest`; }
  }
  return { worst, worstAt };
}

/** Gap from a point to a box (0 inside), css px. */
export const gapToBox = (b, x, y) => Math.hypot(Math.max(b.x - x, 0, x - (b.x + b.w)), Math.max(b.y - y, 0, y - (b.y + b.h)));

/** How far the points moved over the judged frames, css px (the largest of any label): a motion that moved nothing proves nothing. */
export function pointTravel(rows) {
  let best = 0;
  const acc = new Map();
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i].g || !rows[i - 1].g) continue;
    for (const [key, p] of Object.entries(rows[i].L)) { const q = rows[i - 1].L[key]; if (q && p.ax != null && q.ax != null) { const t = (acc.get(key) || 0) + Math.hypot(p.ax - q.ax, p.ay - q.ay); acc.set(key, t); best = Math.max(best, t); } }
  }
  return best;
}
