// The figure's canvas without preserveDrawingBuffer (f56992f, 8 Nov 2026: Mohammad's Mac went from 26 to 58 fps) is cleared by the browser
// each time it is shown. A write to it in a display cycle where the whole kept picture was not laid first (a warm-up's small draw, a pass's
// clear, a blit left bound to the canvas) is then shown over a cleared canvas: the figure blinks out for a frame (his Mac, the same day:
// "the figure is intermittently flickering"). With preserveDrawingBuffer the same write landed on the last picture and nobody saw it.
//
// guardCanvas(gl, allowed) watches the draw framebuffer binding and, for every call that writes the bound draw framebuffer (draws, clears,
// a blit into it), sends a write meant for the canvas to a 1x1 framebuffer of its own instead whenever allowed() says no whole picture has
// been laid in this display cycle. A write after the lay lands on the canvas as before. The browser then only shows the canvas in cycles
// where it holds the whole picture. Everything stays on the GPU: nothing is read back, the stray write is drawn where nobody sees it.
//
// Arguments are passed on as given (pass): no argument array is made in a frame.

/** Wraps `gl`'s framebuffer writes in place (the context object itself, so every host drawing in it is covered). Returns { redirected }. */
export function guardCanvas(gl, allowed, canvas = null) {
  const stats = { redirected: 0, first: '' };
  const bind = gl.bindFramebuffer.bind(gl);
  let drawCanvas = true, park = null;
  gl.bindFramebuffer = function bindFramebuffer(t, fb) {
    if (t === gl.FRAMEBUFFER || t === gl.DRAW_FRAMEBUFFER) drawCanvas = !fb;
    bind(t, fb);
  };
  function parkFB() {
    if (park) return park;
    // alloc-rare: once per context (a 1x1 target the stray writes go to)
    const tex = gl.createTexture(), fb = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    bind(gl.DRAW_FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    park = fb;
    return park;
  }
  canvas?.addEventListener?.('webglcontextlost', () => { park = null; drawCanvas = true; });
  canvas?.addEventListener?.('webglcontextrestored', () => { park = null; drawCanvas = true; });
  // (The call with exactly the arguments it was given: no array made, and a call reads the same as unwrapped.)
  function pass(f, n, a, b, c, d, e, g, h, i, j, k) {
    switch (n) {
      case 0: return f();
      case 1: return f(a);
      case 2: return f(a, b);
      case 3: return f(a, b, c);
      case 4: return f(a, b, c, d);
      case 5: return f(a, b, c, d, e);
      case 6: return f(a, b, c, d, e, g);
      default: return f(a, b, c, d, e, g, h, i, j, k);
    }
  }
  const wrap = (name) => {
    const f = gl[name];
    if (typeof f !== 'function') return;
    const call = f.bind(gl);
    gl[name] = function guarded(a, b, c, d, e, g, h, i, j, k) {
      const n = arguments.length;
      if (!drawCanvas || allowed()) return pass(call, n, a, b, c, d, e, g, h, i, j, k);
      stats.redirected++;
      if (!stats.first) { stats.first = name; console.info(`Figure canvas: a ${name} before the picture was laid went off screen (the canvas would have shown cleared).`); }
      bind(gl.DRAW_FRAMEBUFFER, parkFB());
      try { return pass(call, n, a, b, c, d, e, g, h, i, j, k); } finally { bind(gl.DRAW_FRAMEBUFFER, null); }
    };
  };
  for (const n of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'clear', 'clearBufferfv', 'clearBufferiv', 'clearBufferuiv', 'clearBufferfi', 'blitFramebuffer']) wrap(n);
  return stats;
}
