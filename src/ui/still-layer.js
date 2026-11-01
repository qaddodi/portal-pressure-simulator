// A chart's still parts drawn once (laptop-heat recs H3, 31 Oct 2026). The Pressure chart redrew its panel, grid, thresholds and column
// of readings on every display frame, though only the traces, their ends and the markers move. The parts that do not move are drawn
// into a picture of their own, the same size as the chart's canvas, with the chart's own transform, and laid down whole each frame
// with one drawImage; the picture is drawn again only when the key it is made from changes. The key is the JSON of every number,
// colour and word the still parts are drawn from (the caller builds it from the very object its drawing reads).
//
// The pixels are the chart's own: the picture is made by the same drawing code, in the same canvas size and transform, over nothing
// (the panel, which is opaque inside its rounded corners, is the first thing in it), and laid down at one canvas pixel per pixel with the
// transform off, so every pixel of it is copied as drawn; what the moving parts then draw over it is drawn over the same pixels as before.

/**
 * @param host  the chart's canvas (its width and height are the picture's)
 * @param make  makes a canvas (a test passes its own)
 * @param on    false draws the still parts straight onto the chart's context, in the same place in the order, with no picture, between a
 *              save and a restore as the picture's own context is apart (the switch the tests use to compare the two ways)
 */
export function createStill(host, { make = () => document.createElement('canvas'), on = true } = {}) {
  let pic = null, key = '', builds = 0;
  return {
    /**
     * Lays the still parts down on `ctx` (the chart's context, its transform set for the frame). `k`: the key; `build(c)`: draws them
     * on the context it is given, which has the chart's transform and size and is clear. Called only when `k` or the size changed.
     */
    lay(ctx, k, build) {
      if (!on || ctx.onGPU === true) { ctx.save(); build(ctx); ctx.restore(); return; }   // (drawn by the GPU: its parts drawn again each frame cost the GPU, not a copy)
      const W = host.width, H = host.height;
      pic ||= make();
      const resized = pic.width !== W || pic.height !== H;
      if (resized || k !== key) {
        if (resized) { pic.width = W; pic.height = H; }
        const c = pic.getContext('2d'), m = ctx.getTransform?.() || { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, W, H);
        c.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
        build(c);
        key = k; builds++;
      }
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(pic, 0, 0);
      ctx.restore();
    },
    /** How many times the picture was drawn (for the tests and the ?perf readout). */
    get builds() { return builds; },
    /** Lets the picture go (its memory), as the chart is let go. */
    drop() { if (pic && 'width' in pic) pic.width = pic.height = 0; pic = null; key = ''; },
  };
}
