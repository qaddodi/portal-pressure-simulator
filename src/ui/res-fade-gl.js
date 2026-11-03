// A resolution fade of the figure's own canvas done on the GPU (Mohammad, 1 Nov: "Move everything to GPU"). res-fade.js's mix
// copied the WebGL canvas into a 2D canvas on every frame of the fade (the whole screen, twice: the new picture under, the old one
// over it with 'lighter'), which on an iPhone read the GPU's picture back and drew it again at each settle after a camera move.
// Here the picture before is copied once, GPU to GPU (copyTexImage2D from the canvas just presented), and each present of the
// canvas (veins-gl top) lays it over the new picture in the same context: inside the old picture's own rectangle, where follow puts
// it now, new × (1 − a) + old × a by the blend's constant alpha (premultiplied, exactly what the 2D mix's 'lighter' gave), and the
// new picture whole outside it. The canvas stays shown; no copy of it leaves the GPU.
// The canvas keeps no picture between frames, so the old one is laid on the blank canvas at once after its resize (seed), and from
// then on only by a present (which first puts the whole current picture back): a frame that draws nothing shows the last one.

import { prestart, prestarted, linkProgram, compileDone, exerciseDraw, SHADER_WARM } from './gl-compile.js';
import { glOkBefore, glOkAfter } from './gl-state.js';
import { caught } from './caught.js';

const VS = `#version 300 es
in vec2 c;
uniform mat3 m;      // CSS px of the old picture's box → CSS px in the canvas (the follow, with the sub-pixel moves)
uniform vec2 box;    // the old picture's box, CSS px (the canvas's CSS size)
out vec2 uv;
void main() {
  vec2 p = (m * vec3(c * box, 1.0)).xy / box;
  uv = vec2(c.x, 1.0 - c.y);
  gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
}`;
const FS = `#version 300 es
precision mediump float;
uniform sampler2D t;
in vec2 uv;
out vec4 o;
void main() { o = texture(t, uv); }`;

// (Linked through gl-compile.js: the program started at the figure's context's setup (warmFade), else compiled here, as before.)
const BIND = [['c', 0]];
function program(gl) {
  const p = linkProgram(gl, VS, FS, BIND);
  return { p, m: gl.getUniformLocation(p, 'm'), box: gl.getUniformLocation(p, 'box'), t: gl.getUniformLocation(p, 't') };   // alloc-rare: once per GL context, when the fade's program is first made
}

const kits = new WeakMap();   // gl → { P, vao, buf } (made once per context)
function kit(gl) {
  let k = kits.get(gl);
  if (k) return k;
  const P = program(gl), vao = gl.createVertexArray(), buf = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);   // alloc-rare: once per GL context, the quad's corners
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
  kits.set(gl, k = { P, vao, buf });   // alloc-rare: once per GL context
  return k;
}

// The fade's draw, with the state it is drawn in (the blend's constant alpha): the program, the kit's quad, the texture on unit 0.
const MAT = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);   // (the matrix handed to the program, written in place at each draw: the driver copies it)
function lay(gl, k, a, m, w, h) {
  MAT[0] = m ? m[0] : 1; MAT[1] = m ? m[1] : 0; MAT[3] = m ? m[2] : 0; MAT[4] = m ? m[3] : 1; MAT[6] = m ? m[4] : 0; MAT[7] = m ? m[5] : 0;
  gl.useProgram(k.P.p);
  gl.uniformMatrix3fv(k.P.m, false, MAT);
  gl.uniform2f(k.P.box, w, h);
  gl.uniform1i(k.P.t, 0);
  gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD);
  gl.blendColor(0, 0, 0, a); gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
  gl.bindVertexArray(k.vao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindVertexArray(null);
  gl.disable(gl.BLEND); gl.blendColor(0, 0, 0, 0);
}

/**
 * The fade's program started on gl when the figure's context is set up (GPU practice §2, docs/gpu-practices.md): nothing read then.
 * Returns the task that publishes it at a free moment of the renderer (veins-gl warmIn): done() once the driver says it has finished,
 * run() reads its status, makes the kit and draws it once, with the fade's own blend, into a throwaway 1 × 1 target (exerciseDraw), so
 * the first fade after a camera move neither compiles, nor waits on a link, nor has Metal build its pipeline. Null: nothing to start.
 * ?shaderwarm=0: compiled at the first fade, as before.
 */
export function warmFade(gl) {
  if (!SHADER_WARM || !gl || kits.has(gl)) return null;
  const h = prestart(gl, VS, FS, BIND);
  if (!h) return null;
  return {   // alloc-rare: once per GL context, at its setup
    done: () => kits.has(gl) || compileDone(gl, h),   // alloc-rare: once per GL context, at its setup
    run() {   // alloc-rare: once per GL context, at its setup
      if (kits.has(gl) || gl.isContextLost?.()) return;
      try { const k = kit(gl); exerciseDraw(gl, () => lay(gl, k, 0.5, null, 1, 1)); } catch (e) { caught('res-fade-gl:82', e); /* (failed: the first fade tries again, or mixes in 2D) */ }   // alloc-rare: once per GL context, the warm-up draw
    },
  };
}
/** Whether a fade on gl's canvas can be laid now without compiling: false while its started program is still compiling. */
export function fadeReady(gl) {
  if (!gl || kits.has(gl)) return true;
  const h = prestarted(gl, VS, FS);
  return !h || compileDone(gl, h);
}

/**
 * The old picture of host's canvas (host: veins-gl top, { gl, canvas, add }), kept on the GPU, and the pass that mixes it in.
 * Call just after a present of the canvas (its picture is read from the canvas's own buffer). Null when the GPU cannot; false while its
 * program, started at the context's setup, is still compiling (the canvas then takes its new picture without a fade: no frame waits
 * for a compile, and none is mixed in 2D).
 *   draw(a, m, w, h, clear): lays it with weight a (0..1) at m ([a, b, c, d, e, f], CSS px), the canvas being w × h CSS px;
 *     clear first (the seed, on a canvas just resized).
 *   release(): takes it out of the canvas's presents and frees the copy.
 */
export function keepOnGpu(host) {
  const gl = host?.gl, canvas = host?.canvas;
  if (!gl || !canvas || gl.isContextLost?.()) return null;
  const W = canvas.width, H = canvas.height;
  if (W < 2 || H < 2) return null;
  if (!fadeReady(gl)) return false;
  let k, tex;
  try {
    k = kit(gl);
    glOkBefore(gl);
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.disable(gl.SCISSOR_TEST);
    gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 0, 0, W, H, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    if (!glOkAfter(gl)) throw new Error('copy');   // (asked of the driver each time: gl-state.js)
  } catch { if (tex) gl.deleteTexture(tex); return null; }
  const g = { w: W, h: H, a: 1, m: null, cw: 0, ch: 0, off: null };   // alloc-rare: once per resolution fade (a resize), not per frame
  function draw(a, m, w, h, clear = false) {
    if (gl.isContextLost?.() || !tex) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST); gl.disable(gl.DEPTH_TEST);
    gl.colorMask(true, true, true, true);
    if (clear) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
    if (a <= 0) return;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    lay(gl, k, a, m, w, h);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
  // (Laid first of everything drawn over the figure in its canvas, so the glasses drawn after it blur the mix as it shows.)
  g.off = host.add({ order: -1e6, draw: () => draw(g.a, g.m, g.cw, g.ch) });   // alloc-rare: once per resolution fade, the pass laid in the canvas's presents
  return {   // alloc-rare: once per resolution fade, the handle its owner keeps
    get w() { return g.w; }, get h() { return g.h; },   // alloc-rare: once per resolution fade, part of the handle
    /** What the next presents lay: weight a, at m, in a canvas cw × ch CSS px. */
    set(a, m, cw, ch) { g.a = a; g.m = m; g.cw = cw; g.ch = ch; },
    draw,
    release() { g.off?.(); g.off = null; if (tex && !gl.isContextLost?.()) gl.deleteTexture(tex); tex = null; },
  };
}
