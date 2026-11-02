// The lobule's resolution-change cover on the GPU (lobule-zoom.js resSwap; Mohammad, 1 Nov: "Move everything to GPU"). The cover is the
// lobule's layers as they stood, stacked as the page stacks them (premultiplied source-over, each stretched over the whole box) and laid
// over the layers while they are drawn again at the new share, fading out by its CSS opacity (the compositor). It used to be stacked in a
// 2D canvas with drawImage, the previous cover blended in by 2D too. Here each layer is taken into a texture of the cover's own WebGL
// context once, at the change, and stacked by a shader into a texture the context keeps (a retained target); the canvas shows that.
// A second change while one fades lays the kept picture over the new stack at its weight and place, inside the GPU, so nothing jumps.
// The programs are started when a change is asked for (prepare), before the lobule stands still for it; a change that comes before they
// are ready takes the new share at once rather than wait on a compile in a frame.
import { startProgram, compileDone, checkProgram } from './gl-compile.js?v=0ca233872f';

const VS = `#version 300 es
in vec2 c;
uniform mat3 m;      // the quad's [0,1]² → the target's [0,1]² (y down)
uniform float flip;  // 1: a texture drawn by this context (its first row the bottom); 0: one taken from a canvas (its first row the top)
out vec2 uv;
void main() {
  vec2 p = (m * vec3(c, 1.0)).xy;
  uv = vec2(c.x, mix(c.y, 1.0 - c.y, flip));
  gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
}`;
const FS = `#version 300 es
precision mediump float;
uniform sampler2D t;
uniform float a;
in vec2 uv;
out vec4 o;
void main() { o = texture(t, uv) * a; }`;
const ID = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Whether a layer shows (as stackInto judged it): in the page, with pixels, not hidden by its inline opacity or visibility. */
export const layerShows = (l) => !!l?.isConnected && l.width > 0 && l.height > 0 && l.style.opacity !== '0' && l.style.visibility !== 'hidden';

/** A cover kept for the lobule: { cv, prepare(), ready, build(layers, prev), drop() }; null where WebGL 2 cannot be had. */
export function createResCover(make = () => document.createElement('canvas')) {
  if (typeof WebGL2RenderingContext === 'undefined') return null;
  const cv = make();
  let gl = null;
  try { gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false }); } catch { gl = null; }
  if (!gl) return null;
  let K = null, handle = null, lost = false, kept = null;   // kept: { tex, fbo, w, h } the picture the canvas shows
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; K = null; handle = null; kept = null; });
  cv.addEventListener('webglcontextrestored', () => { lost = false; });

  function prepare() { if (!lost && !K && !handle) handle = startProgram(gl, VS, FS, [['c', 0]]); }
  function ready() {
    if (K) return true;
    if (lost || !handle || !compileDone(gl, handle)) return false;
    try { checkProgram(gl, handle); } catch { handle = null; return false; }
    const p = handle.p, vao = gl.createVertexArray(), buf = gl.createBuffer();
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    K = { p, vao, m: gl.getUniformLocation(p, 'm'), t: gl.getUniformLocation(p, 't'), a: gl.getUniformLocation(p, 'a'), flip: gl.getUniformLocation(p, 'flip'), src: gl.createTexture() };
    return true;
  }
  const params = (tex) => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };
  function target(w, h) {
    const tex = gl.createTexture(); params(tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo, w, h };
  }
  const free = (t) => { if (t) { gl.deleteFramebuffer(t.fbo); gl.deleteTexture(t.tex); } };
  function quad(tex, a, m, flip) {
    gl.useProgram(K.p); gl.uniformMatrix3fv(K.m, false, m || ID); gl.uniform1i(K.t, 0); gl.uniform1f(K.a, a); gl.uniform1f(K.flip, flip ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.bindVertexArray(K.vao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  return {
    cv,
    prepare,
    get ready() { return ready(); },
    /**
     * Stacks the layers that show into a new kept picture and shows it on the cover's canvas. prev ({ a, m }: the weight the cover before
     * shows at and its place now, m a 3 × 3 column-major matrix over [0,1]²) lays the picture before over it, so the screen does not jump.
     * False when nothing shows, the programs are not ready or the context is lost (the caller then takes the change at once).
     */
    build(layers, prev = null) {
      if (lost || gl.isContextLost() || !ready()) return false;
      const shown = layers.filter(layerShows);
      if (!shown.length) return false;
      const w = Math.max(...shown.map((l) => l.width)), h = Math.max(...shown.map((l) => l.height));
      const next = target(w, h);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      try {
        for (const l of shown) {
          params(K.src);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, l);
          gl.bindFramebuffer(gl.FRAMEBUFFER, next.fbo);
          quad(K.src, 1, null, false);
        }
      } catch { free(next); gl.bindFramebuffer(gl.FRAMEBUFFER, null); return false; }
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      if (prev && kept) { gl.bindFramebuffer(gl.FRAMEBUFFER, next.fbo); quad(kept.tex, prev.a, prev.m, true); }
      // (The source texture let go of its pixels: a 1 × 1 keeps the name.)
      gl.bindTexture(gl.TEXTURE_2D, K.src); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      free(kept); kept = next;
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      gl.disable(gl.BLEND);
      quad(kept.tex, 1, null, true);
      gl.bindVertexArray(null);
      return true;
    },
    /** Lets the kept picture go (the canvas is taken out of the page by the caller). */
    drop() { if (!lost && kept) free(kept); kept = null; },
  };
}

/** The 3 × 3 (column-major) that carries the cover drawn at view v0 to where view v puts it, over the box's [0,1]² (box W × H CSS px). */
export function coverFollow(v0, v, W, H) {
  const r = v.k / v0.k;
  return [r, 0, 0, 0, r, 0, (v.x - v0.x * r) / W, (v.y - v0.y * r) / H, 1];
}
