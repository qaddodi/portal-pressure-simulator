// A chart's still parts (laptop-heat recs H3, 31 Oct 2026): the panel, grid, thresholds and column of readings, drawn by the chart's own
// drawing code. They were drawn once into a 2D picture of their own and laid down whole each frame as one copy; since the charts
// draw through the GPU's pen (trace-gl.js), drawing them again each frame costs the GPU, not a copy, and the 2D picture is gone (1 Nov
// 2026: nothing off the GPU). They are drawn straight onto the chart's context, between a save and a restore, as the picture's own
// context was kept apart, so the same drawing calls reach the canvas in the same state as before.

/**
 * @param host  the chart's canvas (unused: kept for the callers' signature)
 * @param on    kept for the callers' signature: the parts are drawn straight onto the chart either way
 */
export function createStill(host, { on = true } = {}) {
  let builds = 0;
  return {
    /** Draws the still parts on `ctx` (the chart's context, its transform set for the frame): `build(c)` draws them on the context given. */
    lay(ctx, k, build) { ctx.save(); build(ctx); ctx.restore(); builds++; },
    /** How many times the parts were drawn (for the ?perf readout). */
    get builds() { return builds; },
    /** Nothing is held. */
    drop() {},
  };
}
