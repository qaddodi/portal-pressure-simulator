// The figure's canvas kept by the renderer itself, and handed to the browser in one copy a frame (8 Nov 2026, Mohammad's Mac).
//
// With preserveDrawingBuffer the browser keeps the canvas's picture in a buffer of its own: the Mac ran at 15-26 fps, every frame waiting on
// that canvas. Without it (f56992f) the same frames ran at 58 fps, but the figure flickered: the shown surface itself was drawn on all
// through the frame (the copy of the kept picture, the overlays, the labels, the glasses reading it back for their blur), and a canvas not
// kept is cleared each time it is shown. Two patches on that path (a guard sending stray writes off screen, 3f414f4; no invalidate of the
// canvas, ebb62bb) did not end it.
//
// keepScreen(gl, canvas) puts a texture the canvas's size (the screen) wherever the context's own code binds the canvas: every
// bindFramebuffer(target, null) binds the screen instead. Every pass that drew on the canvas, read it or cleared it (the figure's present,
// its overlays, the labels, the glasses and their blur, the resolution fade) does so on the screen, which keeps its picture as a kept canvas
// does. Once a frame, at its very end (the scheduler's frame end, right before the browser shows the canvas), the screen is copied whole
// onto the canvas in one blit: the only write the shown surface gets, and a whole one. A write outside a frame asks for one (ask), so it is
// shown at that frame's end. All on the GPU: nothing is read back.

import { glOn } from './gl-state.js';

/** Installs the screen on `gl` (the context object itself, so every host drawing in it is covered). `onEnd(fn)`: registers fn at the
 *  scheduler's frame end, returns its removal; `ask()`: asks for a frame. */
export function keepScreen(gl, canvas, { onEnd = null, ask = null } = {}) {
  const bind = gl.bindFramebuffer.bind(gl);
  const blit = gl.blitFramebuffer.bind(gl);
  const st = { tex: null, fb: null, w: 0, h: 0, dirty: false, flushes: 0 };
  let boundR = null, boundD = null;   // (what the context really has bound: the screen's fb where the code bound the canvas)
  function size() {
    const w = Math.max(1, canvas.width | 0), h = Math.max(1, canvas.height | 0);
    if (st.fb && st.w === w && st.h === h) return st.fb;
    // alloc-rare: the screen is made once, and its storage again only when the canvas is resized (which clears the canvas as well)
    if (!st.tex) st.tex = gl.createTexture();
    if (!st.fb) st.fb = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, st.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    bind(gl.DRAW_FRAMEBUFFER, st.fb);
    gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, st.tex, 0);
    bind(gl.DRAW_FRAMEBUFFER, boundD);
    st.w = w; st.h = h;
    return st.fb;
  }
  gl.bindFramebuffer = function bindFramebuffer(t, fb) {
    const real = fb === null ? size() : fb;
    if (t === gl.FRAMEBUFFER || t === gl.READ_FRAMEBUFFER) boundR = real;
    if (t === gl.FRAMEBUFFER || t === gl.DRAW_FRAMEBUFFER) boundD = real;
    bind(t, real);
  };
  // (The canvas's own name for its colour (COLOR) means the screen's attachment while the screen stands in for it.)
  const inv = gl.invalidateFramebuffer ? gl.invalidateFramebuffer.bind(gl) : null;
  if (inv) {
    const one = [0];
    gl.invalidateFramebuffer = function invalidateFramebuffer(t, list) {
      const fb = t === gl.READ_FRAMEBUFFER ? boundR : boundD;
      if (fb && fb === st.fb && list && list.length === 1 && list[0] === gl.COLOR) { one[0] = gl.COLOR_ATTACHMENT0; return inv(t, one); }
      return inv(t, list);
    };
  }
  const mark = (name) => {
    const f = gl[name];
    if (typeof f !== 'function') return;
    const call = f.bind(gl);
    gl[name] = function written(a, b, c, d, e, g, h, i, j, k) {
      if (!st.dirty && st.fb && boundD === st.fb) { st.dirty = true; if (ask) ask(); }
      switch (arguments.length) {   // (the call with exactly its own arguments: no array made in a frame)
        case 0: return call();
        case 1: return call(a);
        case 2: return call(a, b);
        case 3: return call(a, b, c);
        case 4: return call(a, b, c, d);
        case 5: return call(a, b, c, d, e);
        case 6: return call(a, b, c, d, e, g);
        default: return call(a, b, c, d, e, g, h, i, j, k);
      }
    };
  };
  for (const n of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'clear', 'clearBufferfv', 'clearBufferiv', 'clearBufferuiv', 'clearBufferfi', 'blitFramebuffer']) mark(n);
  /** The screen onto the canvas, whole, in one blit, when anything was written on it since the last. */
  function flush() {
    if (!st.dirty || !st.fb) return;
    st.dirty = false;
    if (gl.isContextLost && gl.isContextLost()) return;
    if (st.w !== canvas.width || st.h !== canvas.height) size();   // (resized since: the canvas is cleared, the screen made again with it)
    // (From the context's own record (gl-state.js glOn), never gl.isEnabled: in Safari a state query is a synchronous trip that waits for
    // the GPU to work through everything the frame queued. 8 Nov 2026, Mohammad's Safari recording: 7.6 of 10.9 s of sampled script sat in
    // these two reads, about three quarters of every frame.)
    const sc = glOn(gl, gl.SCISSOR_TEST), rd = glOn(gl, gl.RASTERIZER_DISCARD);
    if (sc) gl.disable(gl.SCISSOR_TEST);
    if (rd) gl.disable(gl.RASTERIZER_DISCARD);
    bind(gl.READ_FRAMEBUFFER, st.fb);
    bind(gl.DRAW_FRAMEBUFFER, null);
    blit(0, 0, st.w, st.h, 0, 0, st.w, st.h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    bind(gl.READ_FRAMEBUFFER, boundR);
    bind(gl.DRAW_FRAMEBUFFER, boundD);
    if (sc) gl.enable(gl.SCISSOR_TEST);
    if (rd) gl.enable(gl.RASTERIZER_DISCARD);
    st.flushes++;
  }
  const reset = () => { st.tex = st.fb = null; st.w = st.h = 0; st.dirty = false; boundR = boundD = null; };
  if (canvas && canvas.addEventListener) { canvas.addEventListener('webglcontextlost', reset); canvas.addEventListener('webglcontextrestored', reset); }
  const off = onEnd ? onEnd(flush) : null;
  return {   // alloc-rare: once per context
    flush,
    get fb() { return st.fb; },
    get flushes() { return st.flushes; },
    dispose() { if (off) off(); },
  };
}
