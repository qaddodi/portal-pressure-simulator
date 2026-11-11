// Tiny observable store + parameter history (undo/redo, blueprint §3).

import { defaultParams, deepMerge } from '../engine/scenario.js';
import { runSoon } from './class-soon.js';

const listeners = new Map();
const gone = new Map();   // (B9: key -> the listeners unsubscribed from it while a change is being told; that change skips them, only for that key. Emptied when the telling ends.)
const isGone = (key, fn) => { const g = gone.get(key); return g !== undefined && g.has(fn); };
let waking = 0;
const state = {
  mode: 'explore',
  tool: 'select',
  view: 'anatomic',
  lobule: false,              // the Lobule view is open (over the anatomy)
  sinusoid: false,            // inside the Lobule view, zoomed on into one sinusoid
  selection: null,            // { type: 'edge' | 'node' | 'organ', id } — the structure whose action card is open
  details: null,              // a selection shown in full in the side panel ('Details ›')
  shunting: null,             // { src, only } while a shunt waits for its drop target
  layers: { flow: false, chips: true, collaterals: false, organs: true, labels: true, grid: false },
  labelLevel: (() => { try { const v = localStorage.getItem('pps.labels'); return ['key', 'all', 'none'].includes(v) ? v : 'key'; } catch { return 'key'; } })(),   // station labels: key | all | none (Blood menu)
  lobuleLayers: { zones: false, lymph: true },   // the Lobule view's own layers (toolbar Layers menu): zone bands, hepatic lymph
  blood: { look: 'shimmer', phasic: false, chevrons: false, keyChevrons: false },   // look: parcels | shimmer
  colorMode: 'pressure',      // pressure | delta | heat | drop | flow | velocity | direction | oxygen | origin | firstpass
  params: defaultParams(),
  frame: null,
  running: true,
  speed: 1,
  lapse: 0, // time-lapse rate in sim days per real second (0 = real time)
  clock: 'hemo',
  theme: null,
  fibrosisZone: 'sin',
  compareSnap: null,
  compareView: 'B',           // With A pinned, what the figure shows: A | B (now) | D (change A→now)
  imaging: false,             // Imaging view: anatomy only, pressures unmeasured
  found: null,                // Set of findings a test has shown ('eso','gv','coll','clot','flow'); null shows all
  focus: null,                // { edges: [ids], label } where the figure asks the viewer to look
  stented: [],                // edge ids a presenter slide shows stented, a vein with a device the model does not carry (the figure draws the mesh, the cross-section its ring)
  compareMetrics: null,
  healthy: null,
  presetId: 'healthy',
  hiddenReadouts: null,       // Set of hidden metrics
  hiddenEvents: null,         // Set of event ids kept out of the story (model-only knowledge)
  hvpgMeasured: false,        // Explore: the HVPG catheter procedure has run for this patient (the live HVPG shows)
  showHvpg: (() => { try { localStorage.removeItem('pps.showHvpg'); } catch { /* storage unavailable */ } return true; })(),   // The HVPG always shows without measuring it (Settings switch removed 11 Nov 2026; an old saved choice is dropped)
  presenting: false,          // a Presenter script or the tour is running
  dopGate: 'mid',             // where along a stent the Doppler samples: proximal | mid | distal | site (its narrowing)
};

// The Doppler's last mean per vessel (cm/s, with when it was read), so the figure's callout shows the same number.
export const shownVel = new Map();

// R04 (review pass 2): a revision number for everything but the model's frame, so a reader that depends on the state (the
// figure's label signature) can tell "nothing changed" by one number instead of rebuilding a string from it. The frame is left
// out: a reader that follows the frame takes it by itself (its identity changes with every model frame).
let rev = 0;
const FRAME_KEYS = Object.freeze(['frame']);
const REST = Symbol('rest');   // ('*' listeners that a model frame alone does not wake)
const hasOwn = Object.prototype.hasOwnProperty;
const KEYS = [];
let depth = 0;
// The listeners of a change: those of each key, then '*', then the rest-of-the-state ones when something besides the frame changed.
function wake(keys) {
  if (!keys.length) return;
  waking++;
  try { wakeAll(keys); } finally { if (--waking === 0) gone.clear(); }
}
function wakeAll(keys) {
  let rest = false;
  // (B9: a listener removed while this change is being told, by one that ran before it, is not called: the removal marks it.)
  for (let j = 0; j < keys.length; j++) { const k = keys[j], l = listeners.get(k); if (k !== 'frame') rest = true; if (l) for (let i = 0; i < l.length; i++) if (!gone.size || !isGone(k, l[i])) l[i](state[k], state); }
  const any = listeners.get('*');
  if (any) for (let i = 0; i < any.length; i++) if (!gone.size || !isGone('*', any[i])) any[i](keys, state);
  if (rest) { const r = listeners.get(REST); if (r) for (let i = 0; i < r.length; i++) if (!gone.size || !isGone(REST, r[i])) r[i](keys, state); }
}
const soonKeys = new Set();   // (keys set from a frame with setSoon, their listeners still to run)
let soonAsked = false;
function wakeSoon() {
  soonAsked = false;
  const keys = [...soonKeys];   // alloc-rare: in the task after a frame, not inside it
  soonKeys.clear();
  wake(keys);
}
// The view, said once (implicit-state-machines M6/M7). Four legal states over three store fields: anatomy, circuit, lobule (over the anatomy)
// and sinusoid (inside the lobule). The fields stay readable for every listener; only the writers go through setViewKey, which writes
// them in one store.set that is always legal (and only the fields that change, so no listener hears a value it already had).
export const VIEW_KEYS = Object.freeze(['anatomy', 'circuit', 'lobule', 'sinusoid']);
export function viewKey(st = state) { return st.lobule ? (st.sinusoid ? 'sinusoid' : 'lobule') : st.view === 'circuit' ? 'circuit' : 'anatomy'; }
/** The illegal combinations of the three fields (null when legal): the lobule is over the anatomy, the sinusoid is inside the lobule. */
export function viewIllegal(st = state) {
  if (st.sinusoid && !st.lobule) return 'sinusoid without the lobule';
  if (st.lobule && st.view === 'circuit') return 'lobule over the circuit';
  return null;
}
const VIEW_PATCH = {};   // (kept: set() reads the patch's keys at once and does not keep it)
/** Go to one of the four views with a single, legal store.set. Writes only the fields that change; returns the key. */
export function setViewKey(k) {
  if (!VIEW_KEYS.includes(k)) throw new Error(`setViewKey: ${k}`);
  const lob = k === 'lobule' || k === 'sinusoid', sin = k === 'sinusoid', view = k === 'circuit' ? 'circuit' : 'anatomic';
  const p = VIEW_PATCH; for (const key in p) delete p[key];
  // (The order is the old writers': the lobule, then the sinusoid, then the view, so a listener of one hears the others already in place.)
  let n = 0;
  if (state.lobule !== lob) { p.lobule = lob; n++; }
  if (state.sinusoid !== sin) { p.sinusoid = sin; n++; }
  if (state.view !== view) { p.view = view; n++; }
  if (n) store.set(p);
  return k;
}
export const store = {
  get: () => state,
  /** Bumped by every set() that changes something besides `frame` (a camera move never sets the store). */
  get rev() { return rev; },
  set(patch) {
    // (The patch's keys are listed in a kept list, one per depth of sets made inside listeners: no key list is made for a set. A '*' listener
    // reads `keys` as it is called, as before.)
    const keys = KEYS[depth] || (KEYS[depth] = []);   // alloc-rare: one list per depth of nested sets, made the first time that depth is reached
    keys.length = 0; depth++;
    let rest = false;
    for (const k in patch) { if (!hasOwn.call(patch, k)) continue; keys.push(k); if (k !== 'frame') rest = true; }
    try {
      if (rest) rev++;
      Object.assign(state, patch);
      if (soonKeys.size) for (let i = 0; i < keys.length; i++) soonKeys.delete(keys[i]);   // (heard now, with the newest value: not again after the frame)
      wake(keys);
    } finally { depth--; }
  },
  /** set({ [key]: value }) without the patch object: for the callers that set one key (a params change is one every slider step). */
  set1(key, value) {
    const keys = KEYS[depth] || (KEYS[depth] = []);   // alloc-rare: one list per depth of nested sets, made the first time that depth is reached
    keys.length = 0; keys.push(key); depth++;
    try {
      if (key !== 'frame') rev++;
      state[key] = value;
      if (soonKeys.size) soonKeys.delete(key);
      wake(keys);
    } finally { depth--; }
  },
  /** set() for a frame callback or a motion handler: the state changes at once (store.get() and rev see it), but the listeners,
   *  which build cards, legends, pills and text in the page, run in a task of their own straight after the frame (class-soon runSoon),
   *  never inside it (docs/gpu-practices.md: no DOM work in a frame). The keys asked in one frame are heard once each, in the order
   *  first asked, with the newest value; a plain set() of a key before then hears it at once and takes it off the wait. */
  setSoon(patch) {
    let rest = false;
    for (const k in patch) { if (!hasOwn.call(patch, k)) continue; soonKeys.add(k); if (k !== 'frame') rest = true; }
    if (rest) rev++;
    Object.assign(state, patch);
    if (!soonAsked) { soonAsked = true; runSoon(wakeSoon); }
  },
  /** A model frame alone (the common set, several a second): the same as set({ frame: f }) without a patch, a key list or a
   *  closure made for it (plan "Holding 120 Hz" rev 2 step 3). The '*' listeners get one frozen ['frame']. */
  setFrame(f) {
    state.frame = f;
    const l = listeners.get('frame');
    if (l) for (let i = 0; i < l.length; i++) l[i](f, state);
    const any = listeners.get('*');
    if (any) for (let i = 0; i < any.length; i++) any[i](FRAME_KEYS, state);
  },
  /** `key` '*' hears every set; with { frames: false } it is not woken by a model frame alone (setFrame, or a set of `frame` only):
   *  a listener of the rest of the state (rev 2 step 3: the store wakes only the listeners of what changed). */
  on(key, fn, { frames = true } = {}) {
    if (key === '*' && !frames) key = REST;
    if (!listeners.has(key)) listeners.set(key, []);
    listeners.get(key).push(fn);
    gone.get(key)?.delete(fn);
    return () => { listeners.set(key, listeners.get(key).filter((f) => f !== fn)); if (waking) { let g = gone.get(key); if (!g) gone.set(key, g = new Set()); g.add(fn); } };
  },
};

/** The readouts hidden right now: a set a view hides and, in Explore, the true HVPG (wedged and free hepatic vein
 *  pressures too) until the catheter procedure (Measure › HVPG) has measured it for this patient (or Settings › Always show HVPG is on). A Presenter script or
 *  the tour shows it as it is. */
let hidCache = { base: undefined, set: null };
export function hiddenNow(st = state) {
  const base = st.hiddenReadouts;
  if (st.mode !== 'explore' || st.hvpgMeasured || st.showHvpg || st.presenting || base?.has('trueHVPG')) return base;
  if (hidCache.base !== base || !hidCache.set) hidCache = { base, set: new Set([...(base || []), 'trueHVPG']) };   // alloc-rare: when the view's hidden set changes, not per frame
  return hidCache.set;
}

/** The one test for "this patient has varices": the model's `present` flag (metrics.js): the varix diameter reaches the app's
 *  "none" cut-off (2.5 mm), or banded columns are still on the wall. The endoscopy pane, the figure, the circuit, the Tests card
 *  and the screen-reader summary all read it, so they cannot disagree. site: 'VAR' (esophageal) or 'GV' (fundal). */
export function varicesPresent(f, site = 'VAR') {
  const m = f?.metrics;
  if (!m) return false;
  return (site === 'VAR' ? m.varix : m.gastricVarix).present;
}
/** How far the varices have grown (0 at the cut-off, 1 at about 5.5 mm), for drawing their feeding channels. `mean`: the diameter's
 *  running mean (varix-look.js varixMean) in place of this frame's, which pulses with the beat; none yet, this frame's is used. */
export const varixGrowth = (f, site = 'VAR', mean) => {
  if (!varicesPresent(f, site)) return 0;
  const d = Number.isFinite(mean) ? mean : (site === 'VAR' ? f.metrics.varix : f.metrics.gastricVarix).d;
  return Math.min(1, Math.max(0.2, (d - 2.5) / 3));
};

/** Learner actions (probe, invert, endoscopy view, focus…), newest last, so a do-step can test a target and value. The log is
 *  there at once; its listeners hear it straight after (setSoon), since a frame (a procedure's last step) logs too. */
export function logAction(type, target, value) {
  const log = (state.actionLog || []).concat({ type, target, value, t: Date.now() }).slice(-60);   // alloc-rare: once per learner action, never per frame
  store.setSoon({ actionLog: log });   // alloc-rare: the patch of one learner action
}

// Parameter history
const past = [], future = [];
let sender = null;
const changeHooks = [];
export function bindParamSender(fn) { sender = fn; }
/** Called on every learner-made parameter change ({ label, history }); the timeline records them. */
export function onParamChange(fn) { changeHooks.push(fn); }

/** Apply a params patch (object or function). Records history unless {history:false}. */
const NO_OPTS = Object.freeze({});
const HOOK_ARG = { label: '', history: true };   // (what the hooks are given: they read it as they are called)
export function updateParams(patchOrFn, opts = NO_OPTS) {
  const settle = opts.settle ?? false, history = opts.history ?? true, label = opts.label ?? '';
  const prev = state.params;
  let next = typeof patchOrFn === 'function' ? patchOrFn(structuredClone(prev)) : deepMerge(prev, patchOrFn);
  if (!next) return;
  if (history) { past.push({ params: prev, label }); if (past.length > 200) past.shift(); future.length = 0; }   // alloc-rare: a history entry kept for undo; one per learner change
  store.set1('params', next);
  sender?.(next, settle);
  store.set1('historyTick', (state.historyTick || 0) + 1);
  HOOK_ARG.label = label; HOOK_ARG.history = history;
  for (const fn of changeHooks) fn(HOOK_ARG);
}
export function replaceParams(p) { store.set1('params', p); }
export function undo() {
  const h = past.pop(); if (!h) return false;
  future.push({ params: state.params, label: h.label });
  store.set({ params: h.params }); sender?.(h.params, false);
  store.set({ historyTick: (state.historyTick || 0) + 1 });
  return h.label || true;
}
export function redo() {
  const h = future.pop(); if (!h) return false;
  past.push({ params: state.params, label: h.label });
  store.set({ params: h.params }); sender?.(h.params, false);
  store.set({ historyTick: (state.historyTick || 0) + 1 });
  return h.label || true;
}
export function clearHistory() { past.length = 0; future.length = 0; }

