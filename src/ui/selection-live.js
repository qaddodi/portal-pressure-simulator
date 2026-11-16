// A card never outlives what it is about (16 Nov 2026, play-test: a TIPS placed on Decompensated cirrhosis, then Cirrhosis with gastrorenal shunt picked, left the TIPS
// card open with "0.0 mm", a live width slider, and Remove and Doppler buttons for a stent that no longer existed). The one place it is decided: whenever the
// parameters change (a patient, a restore, an undo, a take-down, a slide), a selected device that is no longer in the patient is let go.
import { EDGES, deviceInPlace } from '../engine/topology.js';

/** True when `sel` names a placed device (a stent, a surgical or own shunt) that `params` do not place. */
export function selectionGone(sel, params) {
  if (!sel || sel.type !== 'edge' || !params) return false;
  const e = EDGES.find((x) => x.id === sel.id);   // (a list that grows as the learner makes shunts of their own, so searched, not indexed)
  return !!e && !deviceInPlace(e, params);
}

/** Keep the store's selection honest: on every parameter change, clear it if its device is gone. */
export function watchSelection(store) {
  return store.on('params', () => { const st = store.get(); if (selectionGone(st.selection, st.params)) store.set({ selection: null }); });
}
