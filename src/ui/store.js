// Tiny observable store + parameter history (undo/redo, blueprint §3).

import { defaultParams, deepMerge } from '../engine/scenario.js?v=d88966abe6';

const listeners = new Map();
const state = {
  mode: 'explore',
  tool: 'select',
  view: 'anatomic',
  lobule: false,              // the Lobule view is open (over the anatomy)
  sinusoid: false,            // inside the Lobule view, zoomed on into one sinusoid
  selection: null,            // { type: 'edge' | 'node' | 'organ', id } — the structure whose action card is open
  details: null,              // a selection shown in full in the side panel ('Details ›')
  allowedVerbs: null,         // verbs a lesson or case step allows (null = all)
  shunting: null,             // { src, only } while a shunt waits for its drop target
  layers: { flow: true, chips: true, collaterals: false, organs: true, labels: true, grid: false },
  labelLevel: (() => { try { const v = localStorage.getItem('pps.labels'); return ['key', 'all', 'none'].includes(v) ? v : 'key'; } catch { return 'key'; } })(),   // station labels: key | all | none (Blood menu)
  lobuleLayers: { zones: false, lymph: true },   // the Lobule view's own layers (toolbar Layers menu): zone bands, hepatic lymph
  blood: { look: 'shimmer', phasic: false, chevrons: false },   // look: parcels | shimmer
  colorMode: 'pressure',      // pressure | delta | heat | drop | flow | velocity | direction
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
  imaging: false,             // Cases: anatomy only, pressures unmeasured
  blind: false,               // A lesson/case question is open: numbers that would answer it are hidden (learning-kit.js)
  focus: null,                // { edges: [ids], label } where a lesson step asks the learner to act
  compareMetrics: null,
  healthy: null,
  presetId: 'healthy',
  locked: null,               // Set of locked control keys (Learn / Cases)
  hiddenReadouts: null,       // Set of hidden metrics (Cases)
  hiddenEvents: null,         // Set of event ids a case keeps out of the story (model-only knowledge)
  hvpgMeasured: false,        // Explore: the HVPG catheter procedure has run for this patient (the live HVPG shows)
  showHvpg: (() => { try { return localStorage.getItem('pps.showHvpg') === '1'; } catch { return false; } })(),   // Settings: show the HVPG without measuring it
  presenting: false,          // a Presenter script or the tour is running
};

export const store = {
  get: () => state,
  set(patch) {
    const keys = Object.keys(patch);
    Object.assign(state, patch);
    for (const k of keys) (listeners.get(k) || []).forEach((fn) => fn(state[k], state));
    (listeners.get('*') || []).forEach((fn) => fn(keys, state));
  },
  on(key, fn) {
    if (!listeners.has(key)) listeners.set(key, []);
    listeners.get(key).push(fn);
    return () => listeners.set(key, listeners.get(key).filter((f) => f !== fn));
  },
};

/** The readouts hidden right now: a case's or lesson's set and, in Explore, the true HVPG (wedged and free hepatic vein
 *  pressures too) until the catheter procedure (Measure › HVPG) has measured it for this patient (or Settings › Always show HVPG is on). A Presenter script or
 *  the tour shows it as it is. */
let hidCache = { base: undefined, set: null };
export function hiddenNow(st = state) {
  const base = st.hiddenReadouts;
  if (st.mode !== 'explore' || st.hvpgMeasured || st.showHvpg || st.presenting || base?.has('trueHVPG')) return base;
  if (hidCache.base !== base || !hidCache.set) hidCache = { base, set: new Set([...(base || []), 'trueHVPG']) };
  return hidCache.set;
}

/** The one test for "this patient has varices": the model's varix diameter reaches the app's "none" cut-off (2.5 mm), or
 *  banded columns are still on the wall. The endoscopy pane, the figure and the circuit all use it, so they cannot disagree.
 *  site: 'VAR' (esophageal) or 'GV' (fundal). */
export function varicesPresent(f, site = 'VAR') {
  const m = f?.metrics;
  if (!m) return false;
  const vx = site === 'VAR' ? m.varix : m.gastricVarix;
  return vx.d >= 2.5 || (site === 'VAR' && f.bands > 0);
}
/** How far the varices have grown (0 at the cut-off, 1 at about 5.5 mm), for drawing their feeding channels. */
export const varixGrowth = (f, site = 'VAR') => (varicesPresent(f, site) ? Math.min(1, Math.max(0.2, ((site === 'VAR' ? f.metrics.varix : f.metrics.gastricVarix).d - 2.5) / 3)) : 0);

/** Learner actions (probe, invert, endoscopy view, focus…), newest last, so a do-step can test a target and value. */
export function logAction(type, target, value) {
  const log = (state.actionLog || []).concat({ type, target, value, t: Date.now() }).slice(-60);
  store.set({ actionLog: log });
}

// Parameter history
const past = [], future = [];
let sender = null;
const changeHooks = [];
export function bindParamSender(fn) { sender = fn; }
/** Called on every learner-made parameter change ({ label, history }); the timeline records them. */
export function onParamChange(fn) { changeHooks.push(fn); }

/** Apply a params patch (object or function). Records history unless {history:false}. */
export function updateParams(patchOrFn, { settle = false, history = true, label = '' } = {}) {
  const prev = state.params;
  let next = typeof patchOrFn === 'function' ? patchOrFn(structuredClone(prev)) : deepMerge(prev, patchOrFn);
  if (!next) return;
  if (history) { past.push({ params: prev, label }); if (past.length > 200) past.shift(); future.length = 0; }
  store.set({ params: next });
  sender?.(next, settle);
  store.set({ historyTick: (state.historyTick || 0) + 1 });
  for (const fn of changeHooks) fn({ label, history });
}
export function replaceParams(p) { store.set({ params: p }); }
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

export const isLocked = (key) => !!(state.locked && !state.locked.has('*') && !state.locked.has(key)) || !!(state.locked && state.locked.has('!' + key));
