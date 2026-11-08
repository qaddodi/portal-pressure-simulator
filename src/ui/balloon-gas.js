// The tamponade tube: its path, its gastric balloon and the stomach they are fitted to (pure, no DOM).
//
// A Sengstaken–Blakemore or Minnesota tube goes down the esophagus and through the cardia into the stomach. Its gastric balloon is
// filled there first and the tube is drawn up (traction), so the balloon seats against the gastro-esophageal junction and presses on
// the veins at the cardia. The esophageal balloon (balloon-eso.js) is the second step, filled only if that does not hold.
//
// The balloon is a pear on the tube's own axis: a cone into the cardia, a round body below it, the shape a gastric balloon takes
// under traction. It is fitted to the stomach as drawn (anatomy.js ORGANS 'stomach'), never to fixed coordinates: the axis runs down
// the middle of the stomach's upper part from the cardia, and the balloon is as large as the outline leaves room for, a margin inside
// the wall, at every inflation and every stage of the traction, up to the size it is drawn at. A redrawn stomach moves and resizes it
// (tests/balloon-gas.test.js holds it inside, and fits it to a smaller outline too).
//
// Drawn up, the balloon presses on the gastro-esophageal junction from the stomach's side, and gives where it does: the wall near the
// cardia (the roof round the opening and the lesser curvature below it) holds its skin a hair's breadth off, so the cone's shoulder
// flattens against it, softly and a little more with every unit of traction, and the rest of the balloon is as it was. The give is worked
// out from the stomach's own outline (wallPress), so it follows a redrawn stomach too, and never goes through the wall.
import { ORGANS, SEAM_D } from './anatomy.js';
import { flattenPath } from './shape-gl.js';
import { esoAt, BALLOON, setTubeLine } from './balloon-eso.js';

export const GAS = {
  margin: 3.5,   // how far inside the wall the balloon stays, in world units: the wall's line and glow, and the balloon's own edge
  slack: 8,      // how far down the tube the balloon sits before the traction, in world units; the traction draws it up this far
  neck: 1.6,     // the half width of the collapsed balloon: a sheath on the tube (the esophageal one: BALLOON.sleeve)
  lead: 5,       // how far above the esophageal balloon's lower end the bend starts, in world units (a wide bend starts higher, so it still ends at the cardia)
  bend: 16,      // the radius of the tube's bend at the cardia, from the esophagus's line into the balloon's axis, in world units (a real tube curves, it does not corner; 10 read as an elbow on the phone, 2 Nov)
  tail: 7,       // the tube past the balloon's lower end
  bMax: 20,      // the half width it is drawn at when the stomach has room for it (about twice the esophagus's)
  ratio: 2.9,    // its length over its half width
  cone: 0.6,     // how far down its length it is widest
  pCone: 1.3,    // the curve of the cone into the cardia (1: straight sides) and of the round end below
  pCap: 2.2,
  seat: 1.5,     // how near the wall the balloon's skin comes where it presses on it: the two lines almost touch
  soft: 1.2,     // how softly it gives: the skin eases toward the wall over about this much more than the seat, it does not stop at it
  reach: [26, 40],   // the junction: the cardia and the roof round it, within the first distance of the cardia, and not beyond the second
  push: 5,       // the most the skin is pressed in at the junction, in world units ("a bit"): a fit that would press further is turned down
  snug: [14, 24],   // the balloon drawn up fills the junction: skin within the first distance of the wall at the cardia is drawn out to it, the pull easing off to nothing by the second
  nudge: 0.9,    // and the most anywhere else (the softness of the margin itself): the balloon is fitted not to press on the rest of the wall
};

// ── The stomach's outline ─────────────────────────────
/** A path as a polygon: the points of its first subpath, [[x, y], …]. */
export function outlineOf(d) {
  const f = flattenPath(d, 0.25)[0].pts, out = [];
  for (let i = 0; i < f.length; i += 2) out.push([f[i], f[i + 1]]);
  return out;
}
let STOMACH = null, PAINTED = null;
/** The stomach's own outline (anatomy.js ORGANS 'stomach', which the highlights and the diaphragm's cut use), as a polygon. It closes across the cardia. */
export function stomachOutline() {
  return STOMACH || (STOMACH = outlineOf(ORGANS.find((o) => o.id === 'stomach').d));
}
/**
 * The outline the stage paints: the esophagus and the stomach as one shape (anatomy.js SEAM_D), open at the cardia, the esophagus's edges running
 * on into the stomach's roof and its lesser curvature. This is the wall the balloon is fitted to and presses on: it is the one on the screen.
 */
export function paintedOutline() {
  return PAINTED || (PAINTED = outlineOf(SEAM_D));
}
const inside = (poly, [x, y]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
};
/** How far inside the polygon a point stands: its distance to the nearest wall, negative outside. */
export function clearance(p, poly = paintedOutline()) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const u = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dy));
  }
  return inside(poly, p) ? best : -best;
}
/** Where a point stands against the wall: { c: its clearance (negative outside), n: the unit vector at the nearest wall point, pointing into the stomach }. */
function probe(p, poly) {
  let best = Infinity, qx = 0, qy = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const u = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    const x = a[0] + u * dx, y = a[1] + u * dy, d = Math.hypot(p[0] - x, p[1] - y);
    if (d < best) { best = d; qx = x; qy = y; }
  }
  const out = !inside(poly, p), l = best || 1;
  return { c: out ? -best : best, n: best > 1e-9 ? [((out ? -1 : 1) * (p[0] - qx)) / l, ((out ? -1 : 1) * (p[1] - qy)) / l] : [0, 1] };
}
const smooth = (t) => t * t * (3 - 2 * t);
/** How much more clearly a point has one wall to press on than another (0 mid way between two walls, 1 clearly nearer one): the nearest wall point q (clearance c) and the nearest one more than 8 units from it. */
function lean(p, poly, q, c) {
  let other = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const u = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0, x = a[0] + u * dx, y = a[1] + u * dy;
    if (Math.hypot(x - q[0], y - q[1]) > 8) other = Math.min(other, Math.hypot(p[0] - x, p[1] - y));
  }
  return smooth(Math.min(1, Math.max(0, (other - c) / 4)));
}
/** How much the junction counts at a point: 1 within GAS.reach[0] of the cardia, 0 beyond GAS.reach[1], eased between. */
const giveAt = (p, mouth) => 1 - smooth(Math.min(1, Math.max(0, (Math.hypot(p[0] - mouth[0], p[1] - mouth[1]) - GAS.reach[0]) / (GAS.reach[1] - GAS.reach[0]))));
/** How near the wall the skin may come at a point: the seat at the junction, the margin away from it, eased between. */
const standoff = (w) => GAS.seat + (GAS.margin - GAS.seat) * (1 - w);
/** How near the wall the skin may come at a point p (given the cardia): the seat within the junction's reach, GAS.margin beyond it. */
export const standoffAt = (p, mouth = [esoAt(251).c, 251]) => standoff(giveAt(p, mouth));
/**
 * A balloon's outline (a ring of points) pressed on the wall: each point is eased back along the wall's normal to stand off the wall by at
 * least the standoff for where it is (the seat at the cardia, GAS.margin away from it), and softly: clearance c becomes
 * s + soft·ln(1 + e^((c − s)/soft)) for a standoff s, so there is no edge where the skin meets the wall, and a point that had gone through
 * the wall is brought back in. A balloon that is clear of the wall is untouched (to a hair); the give comes only where it presses.
 * → { ring, deepest (the most any point moved), over (how far past what the place allows the most-moved point went: GAS.nudge away from
 * the junction, up to GAS.push at it; a fit wants this at 0 or below) }
 */
export function wallPress(ring, poly = paintedOutline(), mouth = [esoAt(251).c, 251]) {
  const { soft, nudge, push } = GAS;
  let deepest = 0, over = -Infinity;
  const out = ring.map((p) => {
    const w = giveAt(p, mouth), s = standoff(w), { c, n } = probe(p, poly);
    if (c > s + 9 * soft) { over = Math.max(over, -nudge); return p; }
    const d = s + soft * Math.log1p(Math.exp((c - s) / soft)) - c;
    deepest = Math.max(deepest, d); over = Math.max(over, d - (nudge + (push - nudge) * w));
    return d < 1e-4 ? p : [p[0] + n[0] * d, p[1] + n[1] * d];
  });
  return { ring: out, deepest, over };
}
/**
 * The balloon drawn up against the cardia does not stand off it: it is soft, the traction holds it to the junction, and it spreads across the whole of the
 * opening, the lesser curvature below it and the roof beside it, not only where the pear happened to meet them. Each point of the ring within the junction's reach
 * and within GAS.snug[0] of the wall is drawn out along the wall's normal until it stands the seat off it (a gap of GAS.snug[1] or more is left alone, the pull
 * easing off between), by `amount` (0 … 1, the traction's and the filling's): the cone's shoulder lies against the wall all across the cardia, and the flat top
 * of the balloon closes the opening. Away from the junction nothing moves.
 */
export function snugPress(ring, amount, poly = paintedOutline(), mouth = [esoAt(251).c, 251]) {
  if (amount <= 0) return ring;
  const [near, far] = GAS.snug, n = ring.length;
  const hold = (p) => standoff(giveAt(p, mouth)) + 0.3;   // (the nearest the skin comes to the wall at a point)
  const apex = (p) => smooth(Math.min(1, Math.max(0, (Math.hypot(p[0] - mouth[0], p[1] - mouth[1]) - 4) / 8)));   // (not the neck at the tube: that stays on it)
  // How far each point is drawn, as a vector along the wall's normal to it: out to the wall.
  let move = ring.map((p) => {
    const w = giveAt(p, mouth) * apex(p);
    if (w <= 0) return [0, 0];
    const { c, n: nr } = probe(p, poly), gap = c - hold(p);
    if (gap <= 0) return [0, 0];
    const d = gap * w * amount * lean(p, poly, [p[0] - nr[0] * c, p[1] - nr[1] * c], c) * (1 - smooth(Math.min(1, Math.max(0, (gap - near) / (far - near)))));
    return [-nr[0] * d, -nr[1] * d];
  });
  // The pull itself is eased along the skin (a few passes of its neighbours' average), so the skin follows the wall in one smooth sweep, no corner where the pull begins.
  for (let pass = 0; pass < 8; pass++) move = move.map((m, i) => { const a = move[(i + n - 1) % n], b = move[(i + 1) % n]; return [(a[0] + 2 * m[0] + b[0]) / 4, (a[1] + 2 * m[1] + b[1]) / 4]; });
  // (Never through the wall: where the skin would come nearer than its standoff, the pull is eased back until it does not.)
  const drawn = ring.map((p, i) => {
    let f = 1;
    for (let k = 0; k < 6; k++, f *= 0.6) {
      const q = [p[0] + move[i][0] * f, p[1] + move[i][1] * f];
      if (clearance(q, poly) >= Math.min(hold(q), clearance(p, poly))) return q;
    }
    return p;
  });
  // Where the skin was drawn out to a wall, a long stretch between two points is stepped, so a curve drawn through them does not swing.
  const out = [];
  drawn.forEach((p, i) => {
    out.push(p);
    const q = drawn[(i + 1) % n], m = Math.floor(Math.hypot(q[0] - p[0], q[1] - p[1]) / 3.5);
    for (let j = 1; j <= m; j++) out.push([p[0] + ((q[0] - p[0]) * j) / (m + 1), p[1] + ((q[1] - p[1]) * j) / (m + 1)]);
  });
  // (And a last look: a point the stepping left nearer the wall than its standoff is eased back off it.)
  return out.map((p) => {
    const { c, n: nr } = probe(p, poly), s = standoff(giveAt(p, mouth)) + 0.05;
    return c >= s ? p : [p[0] + nr[0] * (s - c), p[1] + nr[1] * (s - c)];
  });
}

// ── The pear ──────────────────────────────────────────
/** The pear's outline from its upper end p0 down the unit vector dir: length L, widest half width b, a sheath of half width h0 at each end. */
function pearOutline(p0, dir, L, b, h0, n) {
  const [dx, dy] = dir, nx = -dy, ny = dx, { cone, pCone, pCap } = GAS;
  const half = (u) => {
    const near = u < cone, t = near ? (cone - u) / cone : (u - cone) / (1 - cone), p = near ? pCone : pCap;
    return h0 + (b - h0) * Math.max(0, 1 - t ** p) ** (1 / p);
  };
  const A = [], B = [];
  for (let i = 0; i <= n; i++) {   // (denser toward the ends, where the outline turns)
    const u = 0.5 - 0.5 * Math.cos((Math.PI * i) / n), w = half(u), x = p0[0] + dx * u * L, y = p0[1] + dy * u * L;
    A.push([x + nx * w, y + ny * w]); B.push([x - nx * w, y - ny * w]);
  }
  return { ring: [...A, ...B.reverse()], half };
}

/** The esophagus's line where the esophageal balloon ends and the tube starts to bend: its point E and its unit direction t (down the esophagus). */
const eso = () => {
  const eb = BALLOON.bottom - GAS.lead, c = esoAt(eb).c, d = [c - esoAt(eb - 8).c, 8], l = Math.hypot(d[0], d[1]);
  return { E: [c, eb], t: [d[0] / l, d[1] / l] };
};
/**
 * The tube's bend at the cardia for a balloon axis at `deg` (below the horizontal): a circular arc of radius GAS.bend that turns the tube from the esophagus's
 * line into the axis, tangent to both, evenly stepped (about 2 units apart, so a curve drawn through the points does not kink or loop). The points after the
 * start, as offsets from E (where the esophageal balloon ends); the last one is where the axis begins, the balloon's upper end.
 */
export function bendArc(deg) {
  const { t } = eso(), n = [t[1], -t[0]], a = (deg * Math.PI) / 180, dir = [Math.cos(a), Math.sin(a)], th = Math.atan2(n[0] * dir[0] + n[1] * dir[1], t[0] * dir[0] + t[1] * dir[1]);
  const R = GAS.bend, N = Math.max(3, Math.ceil((R * th) / 2)), out = [];
  for (let i = 1; i <= N; i++) { const ph = (th * i) / N, s = R * Math.sin(ph), c = R * (1 - Math.cos(ph)); out.push([s * t[0] + c * n[0], s * t[1] + c * n[1]]); }
  return out;
}

/**
 * The balloon fitted to a stomach outline: where the tube meets the cardia (the middle of the esophagus's foot), the axis down the
 * stomach's upper part that leaves the balloon the most room, and the largest half width b (up to GAS.bMax) at which the filled balloon,
 * at every stage of the traction, stays its standoff (GAS.margin, less at the junction) inside the wall. `poly` and `mouth` default to the painted stomach (paintedOutline) and the cardia.
 * The axis is the middle of the run of angles that give the full size (not the sharpest of them), so a small change to the outline moves
 * the balloon a little, never a lot. → { mouth, dir, deg, p0 (the balloon's upper end, drawn up), b, L }
 */
export function fitGas(poly = paintedOutline(), mouth = [esoAt(251).c, 251]) {
  const { slack, ratio, bMax, neck } = GAS;
  // (The balloon's upper end is where the tube's bend ends, the cardia being where it is on this outline: the same bend as the tube's, so the tube runs on into the balloon.)
  const { E } = eso(), start = [mouth[0] + E[0] - esoAt(251).c, mouth[1] + E[1] - 251];
  const at = (deg) => { const t = (deg * Math.PI) / 180, dir = [Math.cos(t), Math.sin(t)], end = bendArc(deg).at(-1); return { dir, p0: [start[0] + end[0], start[1] + end[1]] }; };
  // The widest half width that fits with the axis at deg (bisected; n points round the outline, a coarse look first, a fine one at the end).
  const widest = (deg, steps, n) => {
    const { dir, p0 } = at(deg);
    // (Each stage of the traction as it is drawn, the skin pressed on the wall: the junction may give it up to GAS.push, the rest of the wall hardly.)
    const fits = (b) => [0, slack / 2, slack].every((s) => {
      const q = [p0[0] + dir[0] * s, p0[1] + dir[1] * s];
      const pressed = wallPress(pearOutline(q, dir, ratio * b, b, neck, n).ring, poly, mouth);
      return pressed.over <= 0 && pressed.ring.every((pt) => clearance(pt, poly) >= standoff(giveAt(pt, mouth)) - 0.15);   // (and it has come to rest off the wall: a stomach too small to give room does not fit)
    });
    if (fits(bMax)) return bMax;
    let lo = neck, hi = bMax;
    for (let i = 0; i < steps; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
    return lo;
  };
  // First, which axes leave room for the full size: the middle of the longest run of them. Only when none does (a small stomach) is the best
  // size found angle by angle.
  const angles = [];
  for (let deg = 20; deg <= 80; deg += 2) angles.push(deg);
  const full = angles.filter((d) => widest(d, 0, 16) >= bMax);
  let deg, b;
  if (full.length) {
    const runs = [[full[0]]];
    for (let i = 1; i < full.length; i++) { if (full[i] - full[i - 1] <= 2) runs[runs.length - 1].push(full[i]); else runs.push([full[i]]); }
    const run = runs.reduce((a, r) => (r.length > a.length ? r : a));
    deg = (run[0] + run[run.length - 1]) / 2;
    b = widest(deg, 16, 32);
  } else {
    const tried = angles.map((d) => [d, widest(d, 8, 16)]), top = Math.max(...tried.map((x) => x[1]));
    deg = tried.find((x) => x[1] === top)[0];
    b = widest(deg, 16, 32);
  }
  const { dir, p0 } = at(deg);
  return { mouth, poly, dir, deg, p0, b, L: ratio * b };
}
let FIT = null;
const fit = () => FIT || (FIT = fitGas());

/**
 * The gastric balloon at inflation k (0 collapsed on the tube … 1 filled) with the traction at q (0 let go: it sits GAS.slack down the
 * tube … 1 drawn up: its cone is seated against the cardia). The outline as a closed ring of points (pressed on the wall where it meets it: wallPress; `raw`
 * is the same ring before that, the pear as it would be in free space), the upper end p0, the axis dir,
 * the length L, half(u) its half width u along its length (0 … 1), ring(f) the outline narrowed to f of its width (for the latex's
 * rims) and b the widest half width now.
 */
export function gasShape(k, q = 1, n = 40, f = fit()) {
  const b = GAS.neck + (f.b - GAS.neck) * k, s = GAS.slack * (1 - q);
  const p0 = [f.p0[0] + f.dir[0] * s, f.p0[1] + f.dir[1] * s], { ring, half } = pearOutline(p0, f.dir, f.L, b, GAS.neck, n);
  const [dx, dy] = f.dir, ease = (x) => smooth(Math.min(1, Math.max(0, x)));
  const given = wallPress(ring, f.poly, f.mouth).ring, pressed = snugPress(given, ease(q) * ease((k - 0.2) / 0.8), f.poly, f.mouth);
  const narrow = (w) => pressed.map(([x, y]) => { const a = (x - p0[0]) * dx + (y - p0[1]) * dy, l = (x - p0[0]) * -dy + (y - p0[1]) * dx; return [p0[0] + dx * a - dy * l * w, p0[1] + dy * a + dx * l * w]; });
  return { outline: pressed, given, raw: ring, p0, dir: f.dir, L: f.L, half, ring: narrow, b };
}

// ── The tube ──────────────────────────────────────────
let PATH = null;
/**
 * The tube's whole course, from above the figure down the esophagus's middle, round the bend at the cardia and along the axis through
 * the balloon to its tip, and GAS.slack further (where the tip rests before the traction draws it up): { pts, arc (the length to each point),
 * total, final (the length with the tube drawn up: its tip at rest), p0Arc (where the balloon's upper end is then), mouth }. Kept inside the esophagus
 * and, past the cardia, inside the stomach.
 */
export function tubePath(f = fit()) {
  if (PATH && PATH.f === f) return PATH;
  const pts = [];
  const { E } = eso();
  // (Stepped up from where the bend starts, at the bend's own step (about 2) for the last stretch into it and 4 above: a curve drawn through
  // steps that change length sharply kinks where they do.)
  const ys = [];
  for (let y = E[1], st = 0; y > BALLOON.from + 1; y -= (st += 1) <= 6 ? 2 : 4) ys.push(y);
  pts.push([esoAt(BALLOON.from).c, BALLOON.from]);
  for (const y of ys.reverse()) pts.push([esoAt(y).c, y]);
  // The bend: a circular arc from the esophagus's middle at the esophageal balloon's lower end (so the balloon lies on the tube all its length) into the axis
  // at the gastric balloon's upper end (bendArc), then the axis itself.
  for (const [dx, dy] of bendArc(f.deg)) pts.push([E[0] + dx, E[1] + dy]);
  const p0i = pts.length - 1, run = f.L + GAS.tail + GAS.slack;
  for (let u = 2; u < run; u += u < 12 ? 2 : 4) pts.push([f.p0[0] + f.dir[0] * u, f.p0[1] + f.dir[1] * u]);   // (the bend's step for the first stretch out of it, as above)
  pts.push([f.p0[0] + f.dir[0] * run, f.p0[1] + f.dir[1] * run]);
  const arc = [0];
  for (let i = 1; i < pts.length; i++) arc.push(arc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = arc[arc.length - 1];
  PATH = { f, pts, arc, total, final: total - GAS.slack, p0Arc: arc[p0i], mouth: f.mouth };
  // (The esophageal balloon lies on this line where the bend has begun inside it: balloon-eso.js.)
  setTubeLine((y) => (y <= E[1] ? esoAt(y).c : pathAt(arcAtY(y, PATH), PATH).p[0]));
  return PATH;
}
/** The point and the unit tangent at length s along the path (clamped to its ends). */
export function pathAt(s, path = tubePath()) {
  const g = Math.min(path.total, Math.max(0, s));
  let i = 1;
  while (i < path.pts.length - 1 && path.arc[i] <= g) i++;   // (at a vertex, the stretch after it)
  const p = path.pts[i - 1], q = path.pts[i], len = path.arc[i] - path.arc[i - 1] || 1, u = (g - path.arc[i - 1]) / len;
  return { p: [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u], t: [(q[0] - p[0]) / len, (q[1] - p[1]) / len] };
}
/** How far down the path a height y on the esophagus's side of the cardia is. */
export function arcAtY(y, path = tubePath()) {
  let i = 1;
  while (i < path.pts.length - 1 && path.pts[i][1] < y) i++;
  const p = path.pts[i - 1], q = path.pts[i], u = (y - p[1]) / ((q[1] - p[1]) || 1);
  return path.arc[i - 1] + (path.arc[i] - path.arc[i - 1]) * u;
}
/**
 * Where the tube's tip is, as a length along the path: it slides in (a, 0 … 1) to GAS.slack past where it rests, then the traction (q, 0 … 1) draws
 * it up by that much, the gastric balloon seating against the cardia. Everything on the tube sits at its own distance behind the tip.
 */
export function tubeTip(a, q = 0, path = tubePath()) {
  const g = Math.min(1, Math.max(0, a));
  return g * path.total - GAS.slack * Math.min(1, Math.max(0, q)) * g;
}
/** The tube's points as far as its tip has gone (tubeTip): the last point is the tip itself, and no two of the last are closer than a point or two apart. */
export function tubeTo(a, q = 0, path = tubePath()) {
  const goal = tubeTip(a, q, path), out = [];
  for (let i = 0; i < path.pts.length; i++) {
    if (path.arc[i] <= goal) { out.push(path.pts[i]); continue; }
    const u = (goal - path.arc[i - 1]) / (path.arc[i] - path.arc[i - 1]), p = path.pts[i - 1], r = path.pts[i];
    out.push([p[0] + (r[0] - p[0]) * u, p[1] + (r[1] - p[1]) * u]);
    break;
  }
  // (A tip a hair past a point would make a curve drawn through them loop there, its last piece being so short: that point is dropped, the tip standing for it.)
  if (out.length > 2 && Math.hypot(out.at(-1)[0] - out.at(-2)[0], out.at(-1)[1] - out.at(-2)[1]) < 1.5) out.splice(-2, 1);
  if (out.length < 2) out.push([path.pts[0][0], path.pts[0][1] + 0.01]);
  return out;
}
/**
 * A sheath on the tube between two lengths along it (s0 above s1), its half width half(t) at t (0 … 1) of the way down it: the balloon collapsed
 * on the tube, riding it as it slides in. { ring: a closed ring of points, narrow(f): the ring at f of its width }, the part above the path's start
 * (the figure's top) cut; null if none is left.
 */
export function sheath(s0, s1, half, path = tubePath()) {
  const lo = Math.max(0, s0), hi = Math.min(path.total, s1);
  if (hi - lo < 0.5) return null;
  const n = Math.max(3, Math.ceil((hi - lo) / 3)), mid = [], nor = [], w = [];
  for (let i = 0; i <= n; i++) {
    const s = lo + ((hi - lo) * i) / n, { p, t } = pathAt(s, path);
    mid.push(p); nor.push([-t[1], t[0]]); w.push(half((s - s0) / (s1 - s0)));
  }
  const at = (f) => {
    const A = mid.map((p, i) => [p[0] + nor[i][0] * w[i] * f, p[1] + nor[i][1] * w[i] * f]), B = mid.map((p, i) => [p[0] - nor[i][0] * w[i] * f, p[1] - nor[i][1] * w[i] * f]);
    return [...A, ...B.reverse()];
  };
  return { ring: at(1), narrow: at };
}
/**
 * Where the tube's two balloons lie on it, as lengths along the path for the tip at `tip`: { eso: [top, bottom], gas: [top, bottom] }.
 * The esophageal one is where balloon-eso.js has it once the tube is drawn up; the gastric one runs from the balloon's upper end for its length.
 */
export function sheathArcs(tip, path = tubePath()) {
  const shift = tip - path.final;
  return { eso: [arcAtY(BALLOON.top, path) + shift, arcAtY(BALLOON.bottom, path) + shift], gas: [path.p0Arc + shift, path.p0Arc + path.f.L + shift] };
}

// ── The pull ──────────────────────────────────────────
/** The traction's arrow: up the esophagus's side, clear of its wall, beside the bare tube above the esophageal balloon. */
export const PULL = { from: 152, to: 124, side: 17, head: 6.5, spread: 3 };
/** { line: the shaft's points, head: the triangle's three points } of the arrow that shows the tube being drawn up. */
export function pullArrow() {
  const { from, to, side, head, spread } = PULL, at = (y) => [esoAt(y).c + side, y], line = [];
  for (let y = from; y >= to + head - 0.5; y -= 7) line.push(at(y));
  line.push(at(to + head - 0.5));
  const tip = at(to), base = at(to + head);
  return { line, head: [tip, [base[0] - spread, base[1]], [base[0] + spread, base[1]]] };
}
