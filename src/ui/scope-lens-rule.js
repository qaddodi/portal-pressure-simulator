// The scope view on the figure (mock C1, Mohammad 6 Nov 2026: "C1 is perfect"): which slides get it, the ring's shapes on the varices,
// the tap that opens it and where its lens opens. Plain numbers only, no DOM: the unit tests load it in Node. scope-lens.js lays the lens,
// stage-clamps.js draws the ring with the figure's marks (on the GPU, in world units, so it moves with every zoom, pan and view change as
// the bands on the same esophagus do).

// The ring sits on the varix columns of the lower esophagus (C1a runs up the wall here, anatomy.js), its centre about 38 units above the
// tear (SITES.varix 797, 232; the bleed leaves it at 805, 244, blood.js bleedShapesInto), so its lowest point stays 21 units clear of the
// tear and the stream that runs from it to the right and down (owner, 6 Nov 2026: "the circle is actually covering the bleed").
export const RING = { x: 798, y: 206, r: 17 };
// The scope badge on the ring's upper-right edge.
export const BADGE_A = -0.75;
export const BADGE_R = 6;
export const badgeAt = () => ({ x: RING.x + RING.r * Math.cos(BADGE_A), y: RING.y + RING.r * Math.sin(BADGE_A) });
// The bleed's own patch (world units): the tear, and the stream down into the stomach. The lens never opens over it.
export const BLEED_BOX = { l: 796, t: 236, r: 878, b: 330 };
// The cameras that frame the lower esophagus.
export const VARIX_CAMS = new Set(['varices', 'bleed', 'gej', 'fundus']);

/** Whether slide s shows the scope ring: an author's `scopeLens: true | false` decides; otherwise any slide framed on the varices or naming
 *  them (its labels, calipers or marked edges), unless its card already shows the scope (tool kind 'scope') or it is a visual or a table. */
export function scopeLensFor(s) {
  if (!s || s.visual || s.table) return false;
  if (s.scopeLens === false) return false;
  if (s.tool?.kind === 'scope') return false;
  if (s.scopeLens === true) return true;
  const cam = s.cam;
  if (typeof cam === 'string' && VARIX_CAMS.has(cam)) return true;
  if (Array.isArray(cam) && cam.length === 4 && cam[0] <= RING.x && cam[2] >= RING.x && cam[1] <= RING.y && cam[3] >= RING.y) return true;
  if ((s.labels || []).includes('VAR')) return true;
  if ((s.calipers || []).includes('varix')) return true;
  const marks = Array.isArray(s.mark) ? s.mark : s.mark ? [s.mark] : [];
  return marks.some((m) => (m.edges || []).some((e) => e === 'C1a' || e === 'C1b'));
}

/** Whether slide s is one where the varices grow or change as it plays (a time-lapse, a ramp, days passing): its
 *  ring stands from the first frame, whether or not they are yet the size the model calls present, so the lens can be opened at any time and shows
 *  them as they come. (Other slides keep the ring for a patient who has varices.) */
export const scopeGrows = (s) => !!(s && (s.lapse || s.ramp || s.days));

const f2 = (v) => +v.toFixed(2);
/** The ring's shapes, [tag, attributes] in world units: a dashed ring while closed (its dashes as separate strokes: the marks' GPU reader
 *  takes no dash pattern), solid while its lens is open, with the badge (a disc with the end face of a scope tip: lens, two light guides,
 *  the working channel). Each line has the labels' halo under it, so it reads on any vessel and in either theme. */
export function ringShapes(open) {
  const out = [], { x, y, r } = RING;
  let d = '';
  if (open) d = `M${f2(x + r)} ${f2(y)}` + Array.from({ length: 48 }, (_, k) => { const a = ((k + 1) / 48) * 2 * Math.PI; return ` L${f2(x + r * Math.cos(a))} ${f2(y + r * Math.sin(a))}`; }).join('') + ' Z';
  else {
    const N = 16, on = 0.55;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * 2 * Math.PI, a1 = a0 + (on / N) * 2 * Math.PI;
      for (let k = 0; k <= 4; k++) { const a = a0 + ((a1 - a0) * k) / 4; d += `${k ? ' L' : ' M'}${f2(x + r * Math.cos(a))} ${f2(y + r * Math.sin(a))}`; }
    }
    d = d.trim();
  }
  out.push(['path', { d, fill: 'none', stroke: 'var(--label-halo)', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }]);
  out.push(['path', { d, fill: 'none', stroke: 'var(--text)', 'stroke-width': 0.85, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }]);
  const b = badgeAt(), k = BADGE_R / 17, ink = open ? 'var(--surface)' : 'var(--text)';
  out.push(['circle', { cx: f2(b.x), cy: f2(b.y), r: BADGE_R + 0.6, fill: 'var(--label-halo)' }]);
  out.push(['circle', { cx: f2(b.x), cy: f2(b.y), r: BADGE_R, fill: open ? 'var(--text)' : 'var(--surface)', stroke: 'var(--text)', 'stroke-width': 0.6 }]);
  out.push(['circle', { cx: f2(b.x), cy: f2(b.y), r: f2(10.5 * k), fill: 'none', stroke: ink, 'stroke-width': f2(2.4 * k) }]);
  out.push(['circle', { cx: f2(b.x - 3.2 * k), cy: f2(b.y - 2 * k), r: f2(3.6 * k), fill: ink }]);
  out.push(['circle', { cx: f2(b.x + 4.6 * k), cy: f2(b.y - 4.4 * k), r: f2(1.7 * k), fill: ink }]);
  out.push(['circle', { cx: f2(b.x + 4.2 * k), cy: f2(b.y + 4.4 * k), r: f2(1.7 * k), fill: ink }]);
  out.push(['circle', { cx: f2(b.x - 2.6 * k), cy: f2(b.y + 5.6 * k), r: f2(2 * k), fill: 'none', stroke: ink, 'stroke-width': f2(1.5 * k) }]);
  return out;
}

/** Whether a tap at (px, py) (screen px) is on the ring: inside it or on its badge, with a finger's margin (a ring drawn small at a far zoom
 *  still takes a 44 px tap). ring: { x, y, r, bx, by, br } on screen. */
export function ringHit(px, py, ring) {
  if (!ring) return false;
  const reach = Math.max(ring.r + 8, 22);
  if (Math.hypot(px - ring.x, py - ring.y) <= reach) return true;
  return Math.hypot(px - ring.bx, py - ring.by) <= Math.max(ring.br + 8, 22);
}

// (The sizes tried in turn, and the gap between the ring and its lens, screen px. `fixed`: an open lens keeps its size: only its place is looked for.)
const SHRINK = [1, 0.85, 0.7, 0.6], FULL = [1], GAP = 34;
export { GAP as LENS_GAP };
const circleRect = (x, y, r, q) => { const cx = Math.max(q.l, Math.min(x, q.r)), cy = Math.max(q.t, Math.min(y, q.b)); return Math.hypot(x - cx, y - cy) < r; };
const overlap = (x, y, r, q) => { const w = Math.max(0, Math.min(x + r, q.r) - Math.max(x - r, q.l)), h = Math.max(0, Math.min(y + r, q.b) - Math.max(y - r, q.t)); return w * h; };
// The directions the lens tries, in turn: up and right first (open black beside the esophagus), then right, up, left, below.
const DIRS = [-40, 0, -75, -140, 180, 35, 140, 90].map((d) => (d * Math.PI) / 180);

/**
 * Where the lens opens (screen px, the stage's own corner as 0, 0): { x, y, r } of the lens, the nearest free spot beside the ring.
 * ring: { x, y, r } on screen; bounds: { l, t, r, b } it must stay inside; avoid: rectangles it must not cover (the cards, the bar, the
 * bleed); size: the lens radius wanted. It tries each direction at the full size, then smaller (down to 60%); with no free spot at all it
 * takes the one that covers least (a phone held upright, where the cards leave a strip).
 */
export function placeLens(ring, bounds, avoid, size, fixed = false) {
  const M = 10, gap = GAP;
  let best = null, bestCost = Infinity;
  for (const k of fixed ? FULL : SHRINK) {
    const R = Math.round(size * k);
    for (const a of DIRS) {
      const D = ring.r + R + gap, x = ring.x + D * Math.cos(a), y = ring.y + D * Math.sin(a);
      const inside = x - R >= bounds.l + M && x + R <= bounds.r - M && y - R >= bounds.t + M && y + R <= bounds.b - M;
      const hits = avoid.filter((q) => circleRect(x, y, R + 6, q));
      if (inside && !hits.length) return { x: Math.round(x), y: Math.round(y), r: R };
      // (Cost of a spot that does not fit: what it covers, and how far it runs off the stage.)
      const off = Math.max(0, bounds.l + M - (x - R)) + Math.max(0, x + R - (bounds.r - M)) + Math.max(0, bounds.t + M - (y - R)) + Math.max(0, y + R - (bounds.b - M));
      const cost = avoid.reduce((c, q) => c + overlap(x, y, R, q), 0) + off * R * 4 + (1 - k) * 1000;
      if (cost < bestCost) { bestCost = cost; best = { x: Math.round(x), y: Math.round(y), r: R }; }
    }
  }
  if (best) {   // (kept on the stage)
    best.x = Math.min(Math.max(best.x, bounds.l + M + best.r), bounds.r - M - best.r);
    best.y = Math.min(Math.max(best.y, bounds.t + M + best.r), bounds.b - M - best.r);
  }
  return best;
}

/** Whether a lens of radius R centred at (x, y) stands inside the bounds and clear of every rectangle (the test placeLens makes of a spot,
 *  asked of a lens that has moved with its ring: it keeps its place while it fits). */
export function lensFits(x, y, R, bounds, avoid) {
  const M = 10;
  if (!(x - R >= bounds.l + M && x + R <= bounds.r - M && y - R >= bounds.t + M && y + R <= bounds.b - M)) return false;
  for (let i = 0; i < avoid.length; i++) if (circleRect(x, y, R + 6, avoid[i])) return false;
  return true;
}

/** The cone from the ring to the lens: the two outer tangents of the two circles, [x0, y0, x1, y1] each (ring end, lens end), or null when
 *  one circle holds the other. */
export function coneLines(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (d <= Math.abs(a.r - b.r) + 1) return null;
  const base = Math.atan2(dy, dx), phi = Math.acos((a.r - b.r) / d);
  return [1, -1].map((s) => { const t = base + s * phi; return [a.x + a.r * Math.cos(t), a.y + a.r * Math.sin(t), b.x + b.r * Math.cos(t), b.y + b.r * Math.sin(t)]; });
}

/** The ring on screen (stage.scopeRingAt): { x, y, r, bx, by, br } in stage px from the stage's corner, the badge's centre and radius too,
 *  the bleed's patch as { l, t, r, b }, and the stage's corner on the page (ox, oy). toLocal: world to stage px; ctm: the figure's matrix
 *  (sc, its scale); wrap: the stage's box. null without a scale. */
export function ringOnScreen(toLocal, ctm, wrap) {
  const sc = ctm?.sc || 0;
  if (!(sc > 0)) return null;
  const c = toLocal(RING.x, RING.y), b = badgeAt(), bp = toLocal(b.x, b.y), q0 = toLocal(BLEED_BOX.l, BLEED_BOX.t), q1 = toLocal(BLEED_BOX.r, BLEED_BOX.b);
  return { x: c[0], y: c[1], r: RING.r * sc, bx: bp[0], by: bp[1], br: BADGE_R * sc, ox: wrap?.left || 0, oy: wrap?.top || 0,
    bleed: { l: Math.min(q0[0], q1[0]), t: Math.min(q0[1], q1[1]), r: Math.max(q0[0], q1[0]), b: Math.max(q0[1], q1[1]) } };
}

/** The ring's centre and radius on screen, written into `o` (a kept record: asked for on every step of a camera move, so it makes nothing):
 *  o.x, o.y, o.r in stage px from the stage's corner. toLocalInto(out, x, y): world to stage px; ctm: the figure's matrix. false without a scale. */
export function ringInto(o, toLocalInto, ctm, tmp) {
  const sc = ctm?.sc || 0;
  if (!(sc > 0)) return false;
  toLocalInto(tmp, RING.x, RING.y);
  o.x = tmp[0]; o.y = tmp[1]; o.r = RING.r * sc;
  return true;
}

/** Where the lens's centre stands for a ring at (ring.x, ring.y) of radius ring.r: the same direction (a.ux, a.uy) from the ring and the same
 *  gap (a.gap) past its edge, the lens's own radius a.R unchanged, so a ring that is carried, zoomed or pinched takes its lens with it and
 *  they never overlap. Written into `o`. */
export function lensCentre(o, ring, a) {
  const D = ring.r + a.R + a.gap;
  o.x = ring.x + a.ux * D; o.y = ring.y + a.uy * D;
  return o;
}
