// Tiny observable store + parameter history (undo/redo, blueprint §3).

import { defaultParams, deepMerge } from '../engine/scenario.js';

const listeners = new Map();
const state = {
  mode: 'explore',
  tool: 'select',
  view: 'anatomic',
  selection: null,            // { type: 'edge' | 'node' | 'organ', id }
  layers: { particles: true, chips: true, collaterals: false, organs: true, labels: true, grid: false },
  colorMode: 'pressure',      // pressure | drop | direction | delta
  params: defaultParams(),
  frame: null,
  running: true,
  speed: 1,
  clock: 'hemo',
  theme: null,
  fibrosisZone: 'sin',
  compareSnap: null,
  compareMetrics: null,
  healthy: null,
  presetId: 'healthy',
  locked: null,               // Set of locked control keys (Learn / Cases)
  hiddenReadouts: null,       // Set of hidden metrics (Cases)
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

// Parameter history
const past = [], future = [];
let sender = null;
export function bindParamSender(fn) { sender = fn; }

/** Apply a params patch (object or function). Records history unless {history:false}. */
export function updateParams(patchOrFn, { settle = false, history = true, label = '' } = {}) {
  const prev = state.params;
  let next = typeof patchOrFn === 'function' ? patchOrFn(structuredClone(prev)) : deepMerge(prev, patchOrFn);
  if (!next) return;
  if (history) { past.push({ params: prev, label }); if (past.length > 200) past.shift(); future.length = 0; }
  store.set({ params: next });
  sender?.(next, settle);
  store.set({ historyTick: (state.historyTick || 0) + 1 });
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
export const canUndo = () => past.length > 0;
export const canRedo = () => future.length > 0;
export function clearHistory() { past.length = 0; future.length = 0; }

export const isLocked = (key) => !!(state.locked && !state.locked.has('*') && !state.locked.has(key)) || !!(state.locked && state.locked.has('!' + key));
