// Three scales on one plate (slide field `cutouts`, opt-in; docs/cutouts.md, docs/recommendations/first-principles-next.md item 1).
// A slide whose cause and effect sit at different scales lays out as an atlas plate: the anatomy stays the main figure, a round window
// beside it shows the lobule, a smaller one the sinusoid, each the real view drawn from the one model state. A ring on the figure and
// two thin lines (a magnifier's cone) join a window to the spot it was taken from. One scale is the subject (the slide names it): only
// it runs its blood, the others hold still. A tap on a window dives into it, and the scale it left becomes a small round window in the
// corner, so the way back is on screen.
// No DOM, no GPU here: what a slide offers, where each window sits (the mock's layouts, scaled to the room the cards leave), the cone, and
// what runs. The drawing is the figure's context's (the lobule's and the sinusoid's own passes laid through a window, see docs/cutouts.md).
//
//   cutouts: ['lobule', 'sinusoid']        the windows beside the anatomy, in the order they hang off each other
//   cutoutSubject: 'anatomy'               the scale that runs its blood: 'anatomy' (the default), 'lobule' or 'sinusoid'

export const CUTOUT_KINDS = ['lobule', 'sinusoid'];
export const SUBJECTS = ['anatomy', ...CUTOUT_KINDS];

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** The windows a slide asks for, in plate order (the lobule first, then the sinusoid), from `cutouts` (a list of kinds). */
export function cutoutKinds(s) {
  const x = s?.cutouts;
  if (!Array.isArray(x)) return [];
  return CUTOUT_KINDS.filter((k) => x.includes(k));
}

/** The scale that runs its blood on slide s (cutoutSubject, the anatomy when it names none or names one it has no window for). */
export function cutoutSubject(s) {
  const k = s?.cutoutSubject;
  return k === 'lobule' || k === 'sinusoid' ? (cutoutKinds(s).includes(k) ? k : 'anatomy') : 'anatomy';
}

/** How much blood a scale runs on the plate (1 for the subject, 0 for the others: they hold still, three busy pictures split the eye). */
export const bloodShare = (scale, subject) => (scale === subject ? 1 : 0);

/** The windows slide s shows now, or [] for none. Mac and iPad on its side only (a phone, and an iPad held upright, keep the scale
 *  pill). Only on a slide whose main figure is the anatomy and that is not a visual, a question (the windows would give the answer away)
 *  or a non-anatomic view (the Circuit). The sinusoid draws pressure colours only: it is offered on a pressure-lens slide, and only
 *  where the device can draw it (sinusoid: false). A catheter, Doppler probe or calipers stay: the anatomy stays on screen beside them.
 *  env: { landscape (a wide screen, not a phone), lens, sinusoid }. */
export function offeredCutouts(s, { landscape = true, lens = 'pressure', sinusoid = true } = {}) {
  const kinds = cutoutKinds(s);
  if (!kinds.length || !landscape) return [];
  if (s.visual || s.question || (s.view && s.view !== 'anatomic')) return [];
  if (/^(lobule|sinusoid)/.test(typeof s.cam === 'string' ? s.cam : '')) return [];
  return kinds.filter((k) => k !== 'sinusoid' || (sinusoid && lens === 'pressure'));
}

/** What is wrong with a slide's cutouts (deck checks): not a list, an unknown or repeated window, a subject without a window, or a
 *  sinusoid window on a slide that is not coloured by pressure. */
export function cutoutsProblems(s, lens = 'pressure') {
  const x = s.cutouts;
  if (x === undefined) return s.cutoutSubject === undefined ? [] : ['cutoutSubject needs cutouts'];
  const out = [];
  if (!Array.isArray(x) || !x.length) return ['cutouts must list at least one window'];
  x.forEach((k, i) => {
    if (!CUTOUT_KINDS.includes(k)) out.push(`no window ${k}`);
    else if (x.indexOf(k) !== i) out.push(`${k} listed twice`);
  });
  if (s.cutoutSubject !== undefined && (!SUBJECTS.includes(s.cutoutSubject) || (s.cutoutSubject !== 'anatomy' && !x.includes(s.cutoutSubject)))) out.push(`subject ${s.cutoutSubject} has no window`);
  if (x.includes('sinusoid') && lens !== 'pressure') out.push('sinusoid is offered only on a pressure-lens slide');
  if (s.visual || s.question || (s.view && s.view !== 'anatomic')) out.push('cutouts need the anatomy as the main figure (not a visual, a question or the Circuit)');
  if (/^(lobule|sinusoid)/.test(typeof s.cam === 'string' ? s.cam : '')) out.push('cutouts need the anatomy as the main figure (the slide opens inside the lobule)');
  return out;
}

// ── Layout ──
// Shapes are { x, y, w, h, r } in CSS px (r: the corner radius; a round window has r = w / 2), so a dive is one shape eased into another.
// The proportions are the approved mock's (640 x 400 plate): the figure 62.5% of the width, the lobule's window a circle as wide as the
// column (30.6%), the sinusoid's two thirds of it, hung off the lobule's window at the column's right edge.
const COL = 0.306, SIN_RATIO = 0.663, GAP_X = 16, GAP_Y = 0.143, FIG_R = 16, EDGE = 6;

const shape = (x, y, w, h, r) => ({ x, y, w, h, r });
const circle = (x, y, d) => shape(x, y, d, d, d / 2);

/** The room the windows' column takes on slide s's free rect (CSS px { l, t, r, b }): its width, and the diameters of the lobule's
 *  window and the sinusoid's. */
export function columnOf(free, kinds) {
  const W = free.r - free.l, H = free.b - free.t;
  const colW = clamp(Math.round(W * COL), 140, 320);
  const both = kinds.length > 1;
  const d1 = Math.round(Math.min(colW, H * (both ? 0.5 : 0.62)));
  return { colW, lobule: kinds.includes('lobule') ? d1 : 0, sinusoid: kinds.includes('sinusoid') ? Math.round(kinds.includes('lobule') ? d1 * SIN_RATIO : d1) : 0 };
}

/** Where each scale sits on the plate when `view` is the one shown whole ('plate': the anatomy with its windows; 'lobule' or 'sinusoid':
 *  that window grown to fill the free rect, the scales it left small and round in the corner, the way back). Keys: anatomy, then
 *  each window slide s offers. free: { l, t, r, b } (CSS px). */
export function plateRects(free, kinds, view = 'plate') {
  const W = free.r - free.l, H = free.b - free.t, col = columnOf(free, kinds);
  const right = free.r - EDGE, top = free.t + EDGE;
  const plate = { anatomy: shape(free.l, free.t, W - col.colW - GAP_X, H, FIG_R) };
  let y = top;
  for (const k of kinds) {
    const d = col[k];
    plate[k] = circle(right - d, y, d);
    y += d + Math.round(col.lobule * GAP_Y);
  }
  if (view === 'plate' || !plate[view]) return plate;
  const full = shape(free.l + 8, free.t + 8, W - 16, H - 16, FIG_R);
  const C = clamp(Math.round(H * 0.3), 72, 140);
  const corner = (n) => circle(free.l + 12, free.b - 12 - C - n * (C + 8), C);
  const out = { [view]: full };
  // (The scale the dive left is the nearest corner window, the one before it above; the other window stays where the plate had it.)
  const left = ['anatomy', ...kinds.filter((k) => k !== view)];
  let n = 0;
  for (const k of left) {
    if (k === 'anatomy' || (view === 'sinusoid' && k === 'lobule')) out[k] = corner(n++);
    else out[k] = plate[k];
  }
  return out;
}

/** One shape eased to another (p: 0 … 1, already eased). */
export function lerpShape(a, b, p, out = { x: 0, y: 0, w: 0, h: 0, r: 0 }) {
  out.x = a.x + (b.x - a.x) * p; out.y = a.y + (b.y - a.y) * p; out.w = a.w + (b.w - a.w) * p; out.h = a.h + (b.h - a.h) * p; out.r = a.r + (b.r - a.r) * p;
  return out;
}

/** The corner radius a shape can really have: a window never rounder than half its short side. */
export const shapeRadius = (s) => Math.min(s.r, s.w / 2, s.h / 2);

/** The magnifier's cone from the point p = [x, y] on the figure to the round window of centre c = [x, y] and radius R: the two tangent
 *  points (the cone's edges), or null when the point lies inside the window (no cone to draw). */
export function coneTangents(p, c, R, out = { a: [0, 0], b: [0, 0] }) {
  const dx = c[0] - p[0], dy = c[1] - p[1], d = Math.hypot(dx, dy);
  if (d <= R + 2) return null;
  const ang = Math.atan2(dy, dx), half = Math.asin(R / d), L = Math.sqrt(d * d - R * R);
  out.a[0] = p[0] + L * Math.cos(ang - half); out.a[1] = p[1] + L * Math.sin(ang - half);
  out.b[0] = p[0] + L * Math.cos(ang + half); out.b[1] = p[1] + L * Math.sin(ang + half);
  return out;
}
