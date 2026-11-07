// The lobule's resolution-change cover on the GPU (lobule-zoom.js resSwap; Mohammad, 1 Nov: "Move everything to GPU"), inside the figure's
// own WebGL context (L2, docs/gpu-two-contexts-plan.md): it has no canvas and no context of its own. At a change the figure's present is
// copied on the GPU (blitFramebuffer, canvas to a texture of the same context) as it stands at the cover's place in the pass order:
// the tissue, vessels, overlay and effects of the lobule at the old share, with any cover still fading laid in it at its weight and place
// (so a second change while one fades keeps the blend, nothing jumps). Then it is a pass of each present, laid over the layers drawn again
// at the new share (veins-gl top.lay), faded out by its weight and carried by the view's follow. Nothing is copied in from a canvas.
// Where the figure's context cannot be had, the new share is taken at once (the caller's fallback); no other draw is ever made.
import { LZ_COVER_ORDER } from './lobule-order.js';

/** A cover kept for the lobule in the figure's context `top` (veins-gl .top): { prepare(), ready, build(), show(a, m), drop() }; null with no host. */
export function createResCover(top) {   // alloc-rare: once per cover, on its first use
  if (!top?.gl || !top.add || !top.lay || typeof top.screen !== 'function') return null;
  const gl = top.gl;
  let off = null, lost = false, kept = null, cap = false, a = 1;   // kept: { tex, fbo, w, h } the picture the pass lays; cap: the next present copies the canvas into it
  const m = [1, 0, 0, 0, 1, 0, 0, 0, 1];   // (the weight and place the pass lays at, written in place)
  const onLost = () => { lost = true; kept = null; cap = false; };   // alloc-rare: once per cover
  const onBack = () => { lost = false; };   // alloc-rare: once per cover
  top.canvas.addEventListener('webglcontextlost', onLost);
  top.canvas.addEventListener('webglcontextrestored', onBack);
  const free = (t) => { if (t) { gl.deleteFramebuffer(t.fbo); gl.deleteTexture(t.tex); } };   // alloc-rare: once per cover
  const lay = (k, wt, mm) => {
    const cw = top.canvas.width, ch = top.canvas.height, r = mm[0];
    top.lay(k.tex, r, 0, 0, r, mm[6] * cw, mm[7] * ch, wt);
  };
  function capture() {
    const cw = top.canvas.width, ch = top.canvas.height;
    if (!(cw > 0 && ch > 0)) return;
    if (kept) lay(kept, a, m);   // (the cover before, at the weight and place it shows now, is part of the picture kept)
    const tex = gl.createTexture();   // alloc-rare: once per resolution change (a swap)
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, cw, ch);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, top.screen());
    gl.disable(gl.SCISSOR_TEST);
    gl.blitFramebuffer(0, 0, cw, ch, 0, 0, cw, ch, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, top.screen());
    free(kept); kept = { tex, fbo, w: cw, h: ch };
    a = 1; m[0] = 1; m[6] = 0; m[7] = 0;
  }
  return {   // alloc-rare: once per cover
    /** Puts the pass into the figure's present (once); where the lobule comes to rest, before a change is asked for. */
    prepare() { if (!off && !lost) off = top.add({ order: LZ_COVER_ORDER, draw: () => { if (cap) { cap = false; capture(); } else if (kept && a > 0) lay(kept, a, m); } }); },   // alloc-rare: once per cover
    get ready() { return !!off && !lost && !gl.isContextLost(); },   // alloc-rare: once per cover
    /** Keeps the figure's picture as it now stands (one present, which the pass copies). False when nothing could be kept: the caller takes the change at once. */
    build() {
      if (!this.ready) return false;
      cap = true;
      try { top.present(); } catch { cap = false; return false; }
      cap = false;
      return !!kept;
    },
    /** Lays the kept picture at weight w and carried by mm (3 × 3 column-major over [0,1]²) in a present. False when nothing is kept or the context is lost (the caller ends the cover). */
    show(w, mm) {
      if (lost || !kept || gl.isContextLost() || !off) return false;
      a = w; for (let i = 0; i < 9; i++) m[i] = mm ? mm[i] : (i % 4 === 0 ? 1 : 0);
      top.present();
      return true;
    },
    /** Lets the kept picture go, and presents again without it. */
    drop() {
      if (!kept) return;
      if (!lost && !gl.isContextLost()) free(kept);
      kept = null;
      if (!lost) { try { top.present(); } catch { /* (the next present lays the figure without it) */ } }
    },
  };
}

/** The 3 × 3 (column-major) that carries the cover drawn at view v0 to where view v puts it, over the box's [0,1]² (box W × H CSS px). */
export function coverFollow(v0, v, W, H) {
  const r = v.k / v0.k;
  return [r, 0, 0, 0, r, 0, (v.x - v0.x * r) / W, (v.y - v0.y * r) / H, 1];   // alloc-rare: once per resolution change (lobule-zoom resSwap), the place the kept picture starts from
}

/** coverFollow written into out (a kept 9-array): the same matrix, with no new array. */
export function coverFollowInto(out, v0, v, W, H) {
  const r = v.k / v0.k;
  out[0] = r; out[1] = 0; out[2] = 0; out[3] = 0; out[4] = r; out[5] = 0; out[6] = (v.x - v0.x * r) / W; out[7] = (v.y - v0.y * r) / H; out[8] = 1;
  return out;
}
