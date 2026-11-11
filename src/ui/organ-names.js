// Organ names on the anatomy plate (anatomy.js ORGAN_LABELS), kept off the vessels (pure geometry, no DOM).
//
// Each name has one fixed place (its anchor). Where a drawn vessel runs under it, as the splenic vein did under STOMACH and the colon's
// vein at the K of KIDNEY (iPad portrait, Ascites 5, 1 Nov), the name steps to the nearest other spot of its own organ, and the label
// solver (stage.js layoutLabels) takes the first of them no vessel touches. The vessels never move: only the caption does.
//
// A name whose anchor lies inside its organ stays inside it; one that stands beside its organ (the spleen's above it, the kidney's below
// it, the atrium's and the esophagus's at their side) stays within NEAR units of it. The spots are the centres of the caption's box
// on a grid, nearest the anchor first, so the label rests where it always did whenever nothing is in the way.
import { ORGANS, ORGAN_LABELS } from './anatomy.js';
import { flattenPath } from './shape-gl.js';

/** The organ outline each caption belongs to (anatomy.js ORGANS ids; a band shape such as the colon takes its ring). */
export const NAME_ORGAN = { Liver: 'liver', Stomach: 'stomach', Spleen: 'spleen', Colon: 'colon', Kidney: 'kidney-l', 'Small bowel': 'bowel', Esophagus: 'esophagus', 'Right atrium': 'heart' };

/** The captions that stand on two lines, one word each (stage.js): wider than the room their organ leaves between the vessels at its sides on one. */
export const NAME_BREAK = new Set(['Right atrium']);

/** How far past its organ's outline a name that stands beside it may step, in world units. */
export const NEAR = 28;
/** How far from its anchor a name may step, the grid it steps on, the least between two spots offered and the most of them, in world units and counts. */
export const REACH = 140, STEP = 8, APART = 22, MOST = 36;

const outlines = new Map();
function outlineOf(id) {
  if (!outlines.has(id)) {
    const o = ORGANS.find((q) => q.id === id), polys = o ? flattenPath(o.ring || o.d, 2) : [];   // alloc-rare: a caption's spots are worked out the first time that name is asked and kept in `kept` (and the outlines in `outlines`), never again
    const rings = polys.map((p) => Array.from({ length: p.pts.length / 2 }, (_, i) => [p.pts[2 * i], p.pts[2 * i + 1]])).filter((r) => r.length > 2);   // alloc-rare: a caption's spots are worked out the first time that name is asked and kept in `kept` (and the outlines in `outlines`), never again
    outlines.set(id, rings);
  }
  return outlines.get(id);
}

const inRing = (x, y, P) => {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > y) !== (P[j][1] > y) && x < ((P[j][0] - P[i][0]) * (y - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
  return c;
};
const inside = (rings, x, y) => rings.reduce((n, P) => n + (inRing(x, y, P) ? 1 : 0), 0) % 2 === 1;   // (even-odd: a ring's hole is outside)   // alloc-rare: a caption's spots are worked out the first time that name is asked and kept in `kept` (and the outlines in `outlines`), never again
const away = (rings, x, y) => {
  let d = Infinity;
  for (const P of rings) for (let i = 1; i < P.length; i++) {
    const a = P[i - 1], b = P[i], ex = b[0] - a[0], ey = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / (ex * ex + ey * ey || 1)));
    d = Math.min(d, Math.hypot(x - a[0] - ex * t, y - a[1] - ey * t));
  }
  return d;
};

const kept = new Map();
/**
 * The other places a caption may stand, as [x, y] (world units, its box's centre), nearest its anchor first. [] for a name the plate has
 * no organ for. `name` is the caption's text as ORGAN_LABELS spells it ('Small bowel').
 */
export function nameSpots(name) {
  if (kept.has(name)) return kept.get(name);
  const at = ORGAN_LABELS.find((q) => q[0] === name), rings = outlineOf(NAME_ORGAN[name]);   // alloc-rare: a caption's spots are worked out the first time that name is asked and kept in `kept` (and the outlines in `outlines`), never again
  let out = [];   // alloc-rare: a caption's spots are worked out the first time that name is asked and kept in `kept` (and the outlines in `outlines`), never again
  if (at && rings?.length) {
    const [, ax, ay] = at, own = inside(rings, ax, ay), cands = [];   // alloc-rare: a caption's spots are worked out the first time that name is asked and kept in `kept` (and the outlines in `outlines`), never again
    for (let dx = -REACH; dx <= REACH; dx += STEP) for (let dy = -REACH; dy <= REACH; dy += STEP) {
      if (!dx && !dy) continue;
      const d = Math.hypot(dx, dy), x = ax + dx, y = ay + dy;
      if (d > REACH) continue;
      if (own ? inside(rings, x, y) : inside(rings, x, y) || away(rings, x, y) <= NEAR) cands.push([x, y, d]);   // alloc-rare: a caption's spots are worked out the first time that name is asked and kept in `kept` (and the outlines in `outlines`), never again
    }
    // (Spots a caption's own width would not tell apart are offered once: the nearest of each, so the few cover the organ.)
    for (const [x, y] of cands.sort((p, q) => p[2] - q[2])) if (out.length < MOST && out.every(([u, v]) => Math.hypot(u - x, v - y) >= APART)) out.push([x, y]);   // alloc-rare: a caption's spots are worked out the first time that name is asked and kept in `kept` (and the outlines in `outlines`), never again
  }
  if (kept.size >= 200) kept.clear();   // (bounded: names are a fixed few dozen; this only guards a caller that passes free text)
  kept.set(name, out);
  return out;
}

// (Other organs: a name keeps off them where it can, RIGHT ATRIUM off the esophagus that runs behind the heart, iPhone with the Tests card
// open, 11 Nov. A family shares one outline set: the heart's chamber and grooves are the heart's. The thin bands with no ring (the
// duodenum, the appendix) and the marks on the liver are left out.)
/** How far from its anchor a name steps to get off another organ, world units (KIDNEY, under its kidney on the colon, has no such spot near: it stays). */
export const OFF_NEAR = 48;
const OTHER = ['esophagus', 'heart', 'bowel', 'colon', 'kidney-l', 'spleen', 'stomach', 'liver'];
const famOf = (id) => id.split('-')[0];
const boxOn = (rings, x0, y0, x1, y1) => {
  for (const P of rings) for (let i = 0; i < P.length; i++) if (P[i][0] > x0 && P[i][0] < x1 && P[i][1] > y0 && P[i][1] < y1) return true;   // (an edge through the box: the rings are flattened every 2 units)
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 2; j++) if (inside(rings, x0 + ((x1 - x0) * i) / 4, y0 + ((y1 - y0) * j) / 2)) return true;
  return false;
};
/** Whether a caption's box (world units) lies on an organ other than its own. */
export function onOtherOrgan(name, x0, y0, x1, y1) {
  const own = famOf(NAME_ORGAN[name] || '');
  for (const id of OTHER) if (famOf(id) !== own && boxOn(outlineOf(id), x0, y0, x1, y1)) return true;
  return false;
}
