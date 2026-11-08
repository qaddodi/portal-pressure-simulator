// A chart's still parts (laptop-heat recs H3, 31 Oct 2026; back on the GPU by performance recs B1, 8 Nov 2026): the panel, grid, thresholds and
// column of readings, drawn by the chart's own drawing code. They were once drawn into a 2D picture of their own and laid down whole each
// frame; the 2D picture is gone (1 Nov 2026: nothing off the GPU) and the GPU's own cache took its place: keepLayer (trace-gl.js) draws the
// parts into a texture of the chart's context only when their version moves, and every other frame lays that texture as one quad. A pen with
// no such cache (the chart is not on the GPU, or a clip is open) draws them straight onto the chart, between a save and a restore, as the
// kept layer's draw is, so the same drawing calls reach the canvas in the same state either way.
import { keepLayer } from './trace-gl.js';

/**
 * @param host  the chart's canvas (unused: kept for the callers' signature)
 * @param on    false: the parts are drawn straight onto the chart every frame, whatever the pen
 */
export function createStill(host, { on = true } = {}) {
  let builds = 0;
  // (What the kept layer's draw runs, held here so a frame makes no closure.)
  let curCtx = null, curBuild = null;
  const run = () => { builds++; curBuild(curCtx); };
  return {
    /**
     * Draws the still parts on `ctx` (the chart's context, its transform set for the frame): `build(c)` draws them on the context given.
     * `ver` is a counter the caller moves whenever anything the parts print or lay out changes (a field-by-field compare, never a string made
     * for the frame); `name` tells this chart's layers apart (the pool holds four to a context).
     */
    lay(ctx, name, ver, build) {
      if (on && typeof ctx.keep === 'function') {
        curCtx = ctx; curBuild = build;
        try { keepLayer(ctx, name, ver, run); } finally { curCtx = null; curBuild = null; }
        return;
      }
      ctx.save(); build(ctx); ctx.restore(); builds++;
    },
    /** How many times the parts were drawn (for the ?perf readout). */
    get builds() { return builds; },
    /** Nothing is held here: the layers go with the chart's context. */
    drop() {},
  };
}
