// A figure callout that goes lets go of its glass and its GPU words, their observers, timers and pictures (recs-production-120hz §8).
//
// The HVPG summary is one callout made of others: its two readings and the difference are pills of their own (stage.js cathLabels,
// el._rows and el._calc), each with a glass and GPU words. Letting go of the summary alone left those three pills' glass and words
// alive, a GPU drawer each, every time the summary was dismissed (2 Nov 2026, code sweep for glitches: GPU memory grows with every
// measurement, the pressure under which the glass is the first thing the GPU gives up). No DOM here, so tests can run it.

const own = (el) => {
  el._glass?.dispose?.();
  for (const w of [el._kW, el._bW, el._uW, ...(el._spW || [])]) w?.dispose?.();   // (kept, disposed: a late set on them does nothing)
};

/** Disposes everything a callout holds, and that of the callouts it is made of. Safe to call again. */
export function dropLabel(el) {
  if (!el) return;
  own(el);
  for (const p of el._rows || []) if (p) own(p);
  if (el._calc) own(el._calc);
}
