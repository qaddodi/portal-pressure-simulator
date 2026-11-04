// A figure callout that goes lets go of its glass and its GPU words, their observers, timers and pictures (recs-production-120hz §8).
//
// The HVPG summary is one callout made of others: its two readings and the difference are pills of their own (stage.js cathLabels,
// el._rows and el._calc), each with a glass and GPU words. Letting go of the summary alone left those three pills' glass and words
// alive, a GPU drawer each, every time the summary was dismissed (2 Nov 2026, code sweep for glitches: GPU memory grows with every
// measurement, the pressure under which the glass is the first thing the GPU gives up). No DOM here, so tests can run it.

// The glass renderers (glass-gl.js) that keep a GPU mask for each callout; each adds its forget(glassEl) here and removes it on dispose.
// dropLabel tells them all, so a dropped callout's mask texture and framebuffer are deleted (4 Nov 2026), not kept for the life of the figure.
export const glassForgetters = new Set();

const own = (el) => {
  const gl = el.firstElementChild;
  if (gl && glassForgetters.size) for (const f of glassForgetters) f(gl);
  el._glass?.dispose?.();
  // (Kept, disposed: a late set on them does nothing.)
  el._kW?.dispose?.(); el._bW?.dispose?.(); el._uW?.dispose?.();
  const sp = el._spW;
  if (sp) for (const w of sp) w?.dispose?.();
};

/** Disposes everything a callout holds, and that of the callouts it is made of. Safe to call again. */
export function dropLabel(el) {
  if (!el) return;
  own(el);
  const rows = el._rows;
  if (rows) for (const p of rows) if (p) own(p);
  if (el._calc) own(el._calc);
}
