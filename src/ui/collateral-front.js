// A collateral opens from its high-pressure end (first-principles item 22, Mohammad, 11 Nov 2026). The pressure is what opens the vessel,
// so the opening starts at its portal end and runs to its systemic end over about a second, and a closing runs the other way (the
// systemic end shuts first). It is a taper along the tube driven by one number, the share p of the change's time that has gone: the
// vessel keeps its whole length and a front of width runs down it, a hairline ahead of the front and the vessel's own caliber behind it.
// The radii are the ones the GPU already draws every tube from (the per-sample radii of sendRadii), so Classic, Mesh and Tube all show it,
// and no shader is touched. The vessel's reveal record (stage-transitions.js) keeps the time, the direction of its flow and the way
// (opening or leaving); this file is only the arithmetic, so a node test can hold it.
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** How long a collateral takes to open or to close (ms): "about a second". */
export const FRONT_MS = 1150;
/** The front's own length, as a share of the vessel: the width eases from hairline to full over this much of it. */
export const FRONT_SPAN = 0.35;
/** The hairline a closed stretch is drawn at, as a share of the vessel's caliber (the mock's 0.9 of 7). */
export const FRONT_FLOOR = 0.14;
// The front starts at the first end and must be past the other end, with its whole length, when p is 1.
const REACH = 1 + FRONT_SPAN;
const sstep = (x) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

/** How open the vessel is (0 hairline, 1 its caliber) at s, its distance from the high-pressure end as a share of its length,
 *  when p of an opening (out false) or of a closing (out true) has gone. */
export const frontOpen = (p, out, s) => (out ? 1 - sstep((p * REACH - (1 - s)) / FRONT_SPAN) : sstep((p * REACH - s) / FRONT_SPAN));
/** The radius factor at s (see frontOpen), from the hairline up to 1. */
export const frontScale = (p, out, s) => FRONT_FLOOR + (1 - FRONT_FLOOR) * frontOpen(p, out, s);
/** The share of the change gone at `now` for a reveal record {t0, dur}. */
export const frontP = (r, now) => clamp((now - r.t0) / r.dur, 0, 1);
/** s for the sample at u (0 at the vessel's first point): a record's dir is 1 when the flow runs from the first point, -1 when it runs to it. */
export const frontS = (r, u) => (r.dir > 0 ? u : 1 - u);
/** Whether a vessel's reveal is drawn as this front (the collaterals) and not as a stroke drawing on. */
export const fronted = (x) => !!x.reveal && x.e.kind === 'collateral';
/** A number that changes when the picture of the front does (0 when there is none): the radii key. 120 steps over the change, a frame at 100 Hz. */
export const frontKey = (x, now) => (fronted(x) ? 1 + Math.round(frontP(x.reveal, now) * 120) + (x.reveal.out ? 1000 : 0) : 0);

// Two collaterals that run on into one another at a varix (the coronary vein to the esophageal varices to the azygos, the gastric veins to
// the gastrorenal shunt) open as one: the front runs the whole course, from the first's high-pressure end through the join to the second's
// systemic end, so the join never pinches while one is open and the other not. id -> [the other, this one's own place in the topology (0 first)].
export const FRONT_CHAIN = { C1a: ['C1b', 0], C1b: ['C1a', 1], C2: ['C5', 0], C5: ['C2', 1] };
/** s over a chain's whole course: sl is the sample's distance along its own vessel from where the flow comes in (frontS); order 0 is the
 *  vessel the flow reaches first, 1 the one after it; wFirst the first one's share of the course's length. */
export const chainS = (sl, order, wFirst) => (order === 0 ? sl * wFirst : wFirst + sl * (1 - wFirst));
