// The vector renderer's render targets (plan section 7; workstream E): the picture framebuffer with its one DEPTH24_STENCIL8, and the kept
// base. Apple's tiled GPUs store and reload every attachment at each framebuffer switch (the mesh renderer's first slowdown), so:
//   - there is ONE depth/stencil renderbuffer, attached to both framebuffers (the picture's and the base's); it holds the strips' per-row
//     depth and the organs' clips, and is never stored (invalidated at the end of every pass);
//   - a pass that writes every pixel invalidates its colour attachment first (nothing is loaded);
//   - no pass switches framebuffer inside itself: a pass binds its target once.
// The picture's colour texture belongs to the figure (its own kept picture, or the shared screen texture): attached here, not made here.
// Everything is made once per size, nothing per frame (the attachment lists below are kept arrays).

import { fbComplete } from './gl-state.js';

/**
 * @param {WebGL2RenderingContext} gl
 * @returns the targets: ensure(w, h, pictureTex), bindPicture(), bindBase(), base texture, invalidation calls, counters.
 */
export function createVecTargets(gl) {
  let w = 0, h = 0, pictureTex = null;
  let picFbo = null, baseFbo = null, baseTex = null, rb = null;
  let sized = 0;                       // how many times the targets were made at a new size (the ?perf counter "targets: sized again")
  let bound = null;                    // the framebuffer last bound (a pass binds its own once)
  let complete = false, baseComplete = false;
  // The attachment lists the invalidate calls take (kept: a call must not make an array).
  const A_COLOR = [gl.COLOR_ATTACHMENT0];
  const A_DS = [gl.DEPTH_STENCIL_ATTACHMENT];
  const A_ALL = [gl.COLOR_ATTACHMENT0, gl.DEPTH_STENCIL_ATTACHMENT];

  function freeAll() {
    if (picFbo) gl.deleteFramebuffer(picFbo);
    if (baseFbo) gl.deleteFramebuffer(baseFbo);
    if (baseTex) gl.deleteTexture(baseTex);
    if (rb) gl.deleteRenderbuffer(rb);
    picFbo = baseFbo = baseTex = rb = null; complete = baseComplete = false; bound = null;
  }

  function build() {
    freeAll();
    rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, w, h);
    baseTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, baseTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    baseFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, baseFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, baseTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, rb);
    baseComplete = fbComplete(gl, gl.FRAMEBUFFER, 'rgba8+ds', w, h);   // (the per-generation verdict, gl-state.js)
    picFbo = gl.createFramebuffer();
    attachPicture();
    sized++;
  }

  function attachPicture() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, picFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pictureTex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, rb);
    complete = baseComplete && fbComplete(gl, gl.FRAMEBUFFER, 'rgba8+ds', w, h);
    bound = picFbo;
  }

  const api = {
    /**
     * The picture is w × h and its colour texture is tex. Makes the base, the depth/stencil and the picture framebuffer when the size is
     * new, attaches tex when it is a different texture. Returns true when anything was made (the kept base is then empty: stale).
     */
    ensure(width, height, tex) {
      if (!(width > 0 && height > 0) || !tex) return false;
      let made = false;
      if (width !== w || height !== h || !picFbo) { w = width; h = height; pictureTex = tex; build(); made = true; }
      else if (tex !== pictureTex) { pictureTex = tex; attachPicture(); made = true; }
      return made;
    },
    get ready() { return !!picFbo && complete; },
    get width() { return w; },
    get height() { return h; },
    get baseTex() { return baseTex; },
    get sized() { return sized; },
    /** Binds the picture's framebuffer for a pass (one bind a pass). */
    bindPicture() { if (bound !== picFbo) { gl.bindFramebuffer(gl.FRAMEBUFFER, picFbo); bound = picFbo; } },
    /** Binds the kept base's framebuffer for a pass. */
    bindBase() { if (bound !== baseFbo) { gl.bindFramebuffer(gl.FRAMEBUFFER, baseFbo); bound = baseFbo; } },
    /** The caller bound something else (the figure's other passes run between ours): forget what we last bound. */
    unbound() { bound = null; },
    /** A pass about to write every pixel of the bound target: its colour is not loaded. */
    invalidateColor() { gl.invalidateFramebuffer(gl.FRAMEBUFFER, A_COLOR); },
    /** The pass is over: depth and stencil are not stored (nothing reads them after). */
    invalidateDepth() { gl.invalidateFramebuffer(gl.FRAMEBUFFER, A_DS); },
    /** Both (a whole pass writing everything, then ending). */
    invalidateAll() { gl.invalidateFramebuffer(gl.FRAMEBUFFER, A_ALL); },
    dispose() { freeAll(); w = h = 0; pictureTex = null; },
  };
  return api;
}
