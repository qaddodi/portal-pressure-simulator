// Shared state executor for lessons and presenter slides (curriculum blueprint F1).
// One step resolves in a fixed order, and the result is only exposed after the worker has
// acknowledged every command (the worker queue is serial, so the snapshot request is the barrier):
//   reset → patch → settle → optional action → post-patch disease days → settle → snapshot.
// Three clocks stay separate: `presetDays` is native pre-aging inside the preset load, `days` is
// extra disease days AFTER the patch, and observation seconds belong to the caller (hemodynamic time).

import { store, updateParams, replaceParams } from './store.js?v=5edd069b32';
import { host } from './host.js?v=10a9e8b390';

/**
 * @param step { preset?, presetDays?, params?, action?, days?, label? }
 * @param ctx { loadPreset, action }
 * @param opts { reset: false to keep the current patient (a replayed step) }
 * @returns {{ snap, params, presetId }} the canonical state this step produced
 */
export async function runSequence(step, { loadPreset, action }, { reset = true } = {}) {
  if (step.preset && reset) await loadPreset(step.preset, { keepLesson: true, days: step.presetDays });
  if (step.params) updateParams(step.params, { settle: true, history: false, label: step.label });
  if (step.action) action?.(step.action);
  if (step.days) host.send({ type: 'advance', days: step.days });
  if (step.preset || step.params || step.days) host.send({ type: 'settle' });
  const { snap } = await host.request('snapshot');
  return { snap, params: structuredClone(store.get().params), presetId: store.get().presetId };
}

/** Put the worker and the UI back on a state `runSequence` returned. */
export function restoreSequence(s) {
  host.send({ type: 'restore', snap: s.snap });
  replaceParams(structuredClone(s.params));
  store.set({ presetId: s.presetId, historyTick: (store.get().historyTick || 0) + 1 });
}
