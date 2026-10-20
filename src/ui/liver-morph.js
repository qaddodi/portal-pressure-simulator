// The liver's outline as cirrhosis and congestion reshape it (pure: no DOM, so the tests can check the vessels stay inside it).
import { seeded } from './liver-geo.js?v=977185f80a';
import { EDGE_PATH, LIVER_EDGES, HIDDEN_EDGES, ANAT_HIDDEN, STRANDS } from './anatomy.js?v=76531bbbc2';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const smooth01 = (v) => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); };

// Cirrhosis as picked in the organ mock-ups (20 Oct): the liver shrinks and reshapes (field: the pull toward the hilum and the
// left lobe's growth; scale: the whole organ's shrink), its edge has longer, deeper bumps (lam, nod), and the nodules are larger
// (liver-geo.js NODULE_SIZE), with their gaps in step (sep). Field and scale are gentle (Mohammad, 20 Oct: "don't shrink it that
// much in cirrhosis, to keep the vessels inside it"): the vessels never move, and the edge keeps KEEP clear of them.
export const CIRR = { field: 0.5, scale: 0.8, nod: 5.5, lam: 1.4, sep: 1.6 };

/** The liver's scale about (560, 350): a cirrhotic liver shrinks a little; a congested one swells. */
export const liverShrink = (c, g) => 1 - 0.035 * c * CIRR.scale + 0.035 * g;

// The displacement of the whole organ (interior and outline): the right lobe atrophies toward
// the hilum and the lateral left lobe hypertrophies with cirrhosis.
export function liverField(x, y, c) {
  c *= CIRR.field;
  const wr = smooth01((610 - x) / 260), wl = smooth01((x - 700) / 140);
  return [x + (600 - x) * 0.15 * c * wr + (x - 720) * 0.12 * c * wl, y + (360 - y) * 0.11 * c * wr + (y - 280) * 0.14 * c * wl];
}

/** The outward normal at each of the outline's points, for either winding. */
export function outlineNormals(pts) {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n]; area += ax * by - bx * ay; }
  const sg = area > 0 ? 1 : -1;
  return pts.map((_, i) => {
    const [ax, ay] = pts[(i + n - 1) % n], [bx, by] = pts[(i + 1) % n];
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
    return [(sg * dy) / l, (-sg * dx) / l];
  });
}

/** Contour nodules: irregular lengths along the edge (L long, n points), fixed per point: [where in its nodule, depth]. */
export function contourNodules(L, n) {
  const rnd = seeded(7);
  let start = 0, lam = (18 + 10 * rnd()) * CIRR.lam;
  const step = L / n, nod = [];
  for (let i = 0; i < n; i++) {
    const acc = i * step;
    if (acc - start > lam) { start = acc; lam = (15 + 12 * rnd()) * CIRR.lam; }
    nod.push([(acc - start) / lam, 0.7 + 0.6 * rnd()]);
  }
  return nod;
}

// The vessels never move (Mohammad, 20 Oct): the liver is drawn round them, moved to the patient's right and shrunken less in
// cirrhosis, so every vessel drawn inside it keeps this much of the liver round it (world units) at every cirrhosis and
// congestion (tests/liver-vessels.test.js measures it over the whole morph). Each is a fixed number, not a nudge of the edge.
export const KEEP = { vessel: 13, strand: 8 };

/** The reshaped outline (in the liver's own frame, before liverShrink) and the same without its nodular bumps (`dome`). */
export function morphOutline({ pts, nm, nod }, c, g) {
  const out = [], dome = [];
  pts.forEach((p0, i) => {
    const [x, y] = liverField(p0[0], p0[1], c);
    const [nx, ny] = nm[i], inf = clamp(ny, 0, 1);
    // Cirrhosis: the inferior edge draws up and rounds off; the thin left lobe tip thickens.
    const tip = smooth01((p0[0] - 750) / 70);
    let push = -8 * c * inf + 5 * c * tip;
    // Congestion: the organ swells, most along its free inferior edge, and its tip rounds. Its top stays where it is (sup:
    // the swelling and liverShrink's lift cancel there), held under the diaphragm the heart rests on (20 Oct review).
    const sup = clamp(-ny, 0, 1);
    push += g * (5 + 9 * inf + 4 * tip - 11 * sup);
    dome.push([x + nx * push, y + ny * push]);
    // Nodular contour: rounded bulges with notches between them (a cusp at each notch).
    const [u, a] = nod[i];
    push += (Math.pow(Math.sin(Math.PI * u), 0.5) - 0.72) * CIRR.nod * a * smooth01(c / 0.7) * (0.45 + 0.55 * c);
    out.push([x + nx * push, y + ny * push]);
  });
  return { out, dome };
}
