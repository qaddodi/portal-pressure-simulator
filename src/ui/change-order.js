// One order for every change (N1, Mohammad 13 Nov 2026: "one order for every change (cause, then pressure, then numbers)").
//
// The sequence on screen is the pathophysiology, so a change of patient, a treatment and a slide all show their steps in this
// order, written once here and read by the places that move them:
//
//   1. name         the name of what is changing (the patient's name in the top bar)        main.js loadPreset
//   2. cause        the cause on the figure (the liver stiffens, a clot, the stent appears) the model's new state, first drawn
//   3. pressure     pressure colour along the vessels, from the cause outward               stage-vessels.js (the colour front)
//   4. collaterals  a collateral opens (from its high-pressure end, collateral-front.js)    stage-transitions.js
//   5. numbers      the readings roll to their new values (COUNT_MS, 0.4 s)                 main.js (the readings' hold)
//
// The rule: nothing in a later step moves before an earlier one has started. STEP_AT is each step's start, in ms after the new
// state is first drawn (the name leads that moment: the new state is asked for only once the new name is in, or NAME_LEAD_MS at
// most). tests/change-order.test.js holds the order and the times to it.

import { EDGES } from '../engine/topology.js';

/** The steps, in the order they start. */
export const CHANGE_STEPS = Object.freeze(['name', 'cause', 'pressure', 'collaterals', 'numbers']);

/** The longest the new state waits for the new name to be in (ms): the name's own swap is D_FLIP out, then its new words. */
export const NAME_LEAD_MS = 240;

/** When each step after the name starts, ms after the new state is first drawn. */
export const STEP_AT = Object.freeze({ cause: 0, pressure: 0, collaterals: 260, numbers: 420 });

/** The colour front: how long it takes to go one vessel further from the cause (ms), and the most the farthest vessel waits. */
export const FRONT_HOP_MS = 55, FRONT_MAX_MS = 600;

/** How long the pressure colour waits at a vessel `hops` vessels from the cause (0 at the cause itself). */
// (A vessel the cause's links do not reach, Infinity, waits the longest.)
export const frontDelay = (hops) => (hops > 0 ? Math.min(FRONT_MAX_MS, hops * FRONT_HOP_MS) : 0);

/** A promise that settles when `p` does or after `ms`, whichever comes first (a wait that can never hold a change for good). */
export function atMost(p, ms) {
  if (!p) return Promise.resolve();
  let t = 0;
  return Promise.race([p, new Promise((r) => { t = setTimeout(r, ms); })]).finally(() => clearTimeout(t));
}

// ── Step 2: the cause, read from what changed ──
// A change's cause is where on the circuit it is made: the vessels or the bed whose parameter changed (a clot, a stent, the scarred
// sinusoids, the heart). It is found from the parameters before and after, so every way in (a patient, a treatment, a slide's state,
// a shared link) gets the same answer without saying it. Nodes are topology.js's.
const SPLANCHNIC = ['INT', 'SPL', 'STO', 'COL'];   // (the gut and spleen beds the splanchnic arterioles feed: tone, a meal, a drug)
const ends = (id, out) => { const e = EDGES.find((x) => x.id === id); if (e) out.add(e.from).add(e.to); };
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const keysChanged = (a = {}, b = {}) => [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].filter((k) => !same(a?.[k], b?.[k]));

/** The nodes where the change from params `a` to params `b` is made, or null when nothing on the circuit says where (a time jump,
 *  albumin alone): such a change recolours the figure at once, as before. */
export function causeOf(a, b) {
  if (!a || !b || a === b) return null;
  const out = new Set();
  for (const k of ['thrombus', 'stenosis', 'occluded', 'spontaneous']) for (const id of keysChanged(a[k], b[k])) ends(id, out);
  if (!same(a.cirrhosis, b.cirrhosis)) out.add('SIN_R').add('SIN_L');
  for (const lobe of ['R', 'L']) {
    const fa = a.fibrosis?.[lobe] || {}, fb = b.fibrosis?.[lobe] || {};
    if (!same(fa.pre, fb.pre)) ends(`PRE_${lobe}`, out);
    if (!same(fa.sin, fb.sin)) out.add(`SIN_${lobe}`);
    if (!same(fa.post, fb.post)) out.add(`CV_${lobe}`);
  }
  if (!same(a.contractility, b.contractility) || !same(a.tr, b.tr) || !same(a.pericardial, b.pericardial)) out.add('RA');
  const SHUNTS = [['tips', 'TIPS'], ['dips', 'DIPS'], ['portocaval', 'S_PC'], ['dsrs', 'S_DSR'], ['mesocaval', 'S_MC'], ['rex', 'REX']];
  for (const [k, id] of SHUNTS) if (!same(a[k], b[k])) ends(id, out);
  for (const id of keysChanged(a.customShunts, b.customShunts)) { const m = /^X_([A-Z_]+?)_([A-Z][A-Z_]*)$/.exec(id); if (m) out.add(m[1]).add(m[2]); }
  if (!same(a.splanchnicTone, b.splanchnicTone) || !same(a.meal, b.meal) || !same(a.drugs, b.drugs) || !same(a.gestation, b.gestation)) for (const n of SPLANCHNIC) out.add(n);
  if (!same(a.splenicRx, b.splenicRx)) out.add('SPL');
  if (!same(a.apShunt, b.apShunt) || !same(a.habrStrength, b.habrStrength)) out.add('HA');
  if (!same(a.balloonEso, b.balloonEso)) out.add('VAR');
  if (!same(a.balloonGas, b.balloonGas)) out.add('GV');
  return out.size ? [...out] : null;
}

/** How many vessels each node is from the nearest cause node, as a Map node → hops. The front runs along the veins and the liver's
 *  own beds, either way: never through a shunt or a collateral the patient may not have (the Meso-Rex graft would join the gut to the
 *  left portal vein in one step), nor the arteries, whose colour does not change, nor the wedge's model-only links. */
const FRONT_KINDS = new Set(['vein', 'liver', 'diode']);
export function hopsFrom(nodes) {
  const adj = new Map();
  const link = (p, q) => { if (!adj.has(p)) adj.set(p, []); adj.get(p).push(q); };
  for (const e of EDGES) if (FRONT_KINDS.has(e.kind)) { link(e.from, e.to); link(e.to, e.from); }
  const d = new Map(), q = [];
  for (const n of nodes || []) if (!d.has(n)) { d.set(n, 0); q.push(n); }
  for (let i = 0; i < q.length; i++) for (const m of adj.get(q[i]) || []) if (!d.has(m)) { d.set(m, d.get(q[i]) + 1); q.push(m); }
  return d;
}
/** A vessel's distance from the cause, in vessels: 0 for one that touches it (the nearer of its two ends). Unknown: the farthest. */
export const edgeHops = (hops, e) => {
  const a = hops.get(e?.from), b = hops.get(e?.to);
  return a == null && b == null ? Infinity : Math.min(a ?? Infinity, b ?? Infinity);
};

// ── The change under way ──
// A change of state is noted where it is asked for (noteChange: the patient loader, the presenter), drawn by the figure when its new
// state first arrives (changeDrawn: the stage's colour crossfade), and the later steps read their start from it (stepLeft).
const NOTE_KEEP_MS = 1500;   // (a change noted and never drawn, a load that brought no new pressures, is forgotten after this)
const NOTE_HOLD_MS = 800;    // (and holds the later steps no longer than this while it waits to be drawn: a Restart, whose pressures do not jump)
let noted = null, drawn = null;
const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** A change from params `a` to params `b` is about to arrive. */
export function noteChange(a, b, now = clock()) { noted = { cause: causeOf(a, b), at: now }; }

/** The figure has drawn the new state (its pressures jumped): the change's clock starts now. Returns its cause's hops (Map node →
 *  hops) for the colour front, or null when it has no cause on the circuit or none was noted. */
export function changeDrawn(now = clock()) {
  const n = noted && now - noted.at < NOTE_KEEP_MS ? noted : null;
  noted = null;
  // (A jump nobody noted (Undo, History, a time jump) has no order to keep: it recolours at once and its numbers roll at once, as before.)
  drawn = n ? { at: now, hops: n.cause ? hopsFrom(n.cause) : null } : null;
  return drawn?.hops || null;
}

/** A change that eases in rather than jumping (a slide's patient morphing under the camera, presenter.js morphTo) starts its clock as it
 *  is asked for: its pressures travel over the morph, and each vessel's colour starts to follow them once the front has reached it. */
export function startChange(a, b, now = clock()) {
  noted = null;
  const cause = causeOf(a, b);
  drawn = { at: now, hops: cause ? hopsFrom(cause) : null, gradual: true };
}
/** The easing change's front, while it is still travelling: { at, hops } (the stage reads it once per sync), or null. */
export function easingFront(now = clock()) {
  return drawn?.gradual && drawn.hops && now - drawn.at < FRONT_MAX_MS ? drawn : null;
}

/** How long, from `now`, until step `k` of the change under way may start (0: now, or no change under way). A change noted and not yet
 *  drawn holds every later step to its full time, so nothing runs ahead of the pressure. */
export function stepLeft(k, now = clock()) {
  const at = STEP_AT[k] ?? 0;
  if (noted && now - noted.at < NOTE_HOLD_MS) return at;
  if (!drawn) return 0;
  return Math.max(0, drawn.at + at - now);
}

/** (Tests: forget the change under way.) */
export function resetChange() { noted = null; drawn = null; }
