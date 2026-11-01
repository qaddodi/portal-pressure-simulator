// A resolution fade of the figure's own canvas done on the GPU (Mohammad, 1 Nov: "Move everything to GPU"). res-fade.js's mix
// copied the WebGL canvas into a 2D canvas on every frame of the fade (the whole screen, twice: the new picture under, the old one
// over it with 'lighter'), which on an iPhone read the GPU's picture back and drew it again at each settle after a camera move.
// Here the picture before is copied once, GPU to GPU (copyTexImage2D from the canvas just presented), and each present of the
// canvas (veins-gl top) lays it over the new picture in the same context: inside the old picture's own rectangle, where follow puts
// it now, new × (1 − a) + old × a by the blend's constant alpha (premultiplied, exactly what the 2D mix's 'lighter' gave), and the
// new picture whole outside it. The canvas stays shown; no copy of it leaves the GPU.
// The canvas keeps no picture between frames, so the old one is laid on the blank canvas at once after its resize (seed), and from
// then on only by a present (which first puts the whole current picture back): a frame that draws nothing shows the last one.

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

function program(gl) {
  const sh = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const e = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(e || 'shader'); }
    return s;
  };
  const p = gl.createProgram(), v = sh(gl.VERTEX_SHADER, VS), f = sh(gl.FRAGMENT_SHADER, FS);
  gl.attachShader(p, v); gl.attachShader(p, f); gl.bindAttribLocation(p, 0, 'c'); gl.linkProgram(p);
  gl.deleteShader(v); gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { const e = gl.getProgramInfoLog(p); gl.deleteProgram(p); throw new Error(e || 'link'); }
  return { p, m: gl.getUniformLocation(p, 'm'), box: gl.getUniformLocation(p, 'box'), t: gl.getUniformLocation(p, 't') };
}

const kits = new WeakMap();   // gl → { P, vao, buf } (made once per context)
function kit(gl) {
  let k = kits.get(gl);
  if (k) return k;
  const P = program(gl), vao = gl.createVertexArray(), buf = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
  kits.set(gl, k = { P, vao, buf });
  return k;
}

/**
 * The old picture of host's canvas (host: veins-gl top, { gl, canvas, add }), kept on the GPU, and the pass that mixes it in.
 * Call just after a present of the canvas (its picture is read from the canvas's own buffer). Null when the GPU cannot.
 *   draw(a, m, w, h, clear): lays it with weight a (0..1) at m ([a, b, c, d, e, f], CSS px), the canvas being w × h CSS px;
 *     clear first (the seed, on a canvas just resized).
 *   remove(): takes it out of the canvas's presents and frees the copy.
 */
export function keepOnGpu(host) {
  const { gl, canvas } = host || {};
  if (!gl || !canvas || gl.isContextLost?.()) return null;
  const W = canvas.width, H = canvas.height;
  if (W < 2 || H < 2) return null;
  let k, tex;
  try {
    k = kit(gl);
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.disable(gl.SCISSOR_TEST);
    gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 0, 0, W, H, 0);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    if (gl.getError() !== gl.NO_ERROR) throw new Error('copy');
  } catch { if (tex) gl.deleteTexture(tex); return null; }
  const g = { w: W, h: H, a: 1, m: null, cw: 0, ch: 0, off: null };
  function draw(a, m, w, h, clear = false) {
    if (gl.isContextLost?.() || !tex) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST); gl.disable(gl.DEPTH_TEST);
    gl.colorMask(true, true, true, true);
    if (clear) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
    if (a <= 0) return;
    const [ma, mb, mc, md, me, mf] = m || [1, 0, 0, 1, 0, 0];
    gl.useProgram(k.P.p);
    gl.uniformMatrix3fv(k.P.m, false, [ma, mb, 0, mc, md, 0, me, mf, 1]);
    gl.uniform2f(k.P.box, w, h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(k.P.t, 0);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD);
    gl.blendColor(0, 0, 0, a); gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
    gl.bindVertexArray(k.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND); gl.blendColor(0, 0, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
  // (Laid first of everything drawn over the figure in its canvas, so the glasses drawn after it blur the mix as it shows.)
  g.off = host.add({ order: -1e6, draw: () => draw(g.a, g.m, g.cw, g.ch) });
  return {
    get w() { return g.w; }, get h() { return g.h; },
    /** What the next presents lay: weight a, at m, in a canvas cw × ch CSS px. */
    set(a, m, cw, ch) { g.a = a; g.m = m; g.cw = cw; g.ch = ch; },
    draw,
    remove() { g.off?.(); g.off = null; if (tex && !gl.isContextLost?.()) gl.deleteTexture(tex); tex = null; },
  };
}
