// The Doppler monitor's picture on the GPU: the scrolling spectral ring, the noise floor over it and the wall filter's dark band,
// one fragment per pixel of the trace, drawn into a WebGL2 canvas that sits under the monitor's 2D canvas (which clears the
// trace's rectangle to show it and keeps the margins, words, ticks and calipers), in place of the 2D canvas's three full-size
// draws (the ring in two copies, the noise floor blended over it, the gradient). The ring's new
// spectral lines reach the GPU as a texture update of those columns alone (texSubImage2D from the ImageData the lines are
// synthesised in), queued on the GPU's own time; written into a 2D canvas the browser kept on the GPU, each frame waited for
// the GPU and copied the whole ring (a phone's frame rate dipped hard with the monitor on screen; Mohammad, 22 Oct).
//
// The same picture: the ring and the noise are read texel for texel where the 2D draws copied them pixel for pixel (no
// smoothing), the noise is added and clamped as 'lighter' adds it, and the band darkens as the gradient's black did.
// doppler.js keeps its 2D path where WebGL2 is missing, on a software renderer (the browser checks), or when the context is lost.

import { startProgram, checkProgram, exerciseDraw, publishWhenDone } from './gl-compile.js?v=5c4cd6c14c';

const VS = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D ring, noise;
uniform ivec2 size;      // the trace's width and height (device px; the ring's too)
uniform ivec2 org;       // the trace's bottom-left corner in the canvas (device px, from the bottom)
uniform int p;           // the ring column of the newest line: the screen's left edge shows column p + 1
uniform ivec2 nOff;      // where the noise texture is read from (its view, moved a few times a second)
uniform float noiseA;    // the noise's share (1 on the grey spectrum, 0.3 under the colour modes)
uniform vec2 wall;       // the wall filter's band: the baseline's row from the top, its half height (px)
out vec4 o;
void main() {
  int lx = int(gl_FragCoord.x) - org.x, ly = size.y - 1 - (int(gl_FragCoord.y) - org.y);
  int c = lx + p + 1;
  if (c >= size.x) c -= size.x;
  vec3 r = texelFetch(ring, ivec2(c, ly), 0).rgb;
  vec3 n = texelFetch(noise, nOff + ivec2(lx, ly), 0).rgb;
  vec3 col = min(vec3(1.0), r + n * noiseA);
  float a = wall.y > 0.0 ? 0.9 * max(0.0, 1.0 - abs(float(ly) + 0.5 - wall.x) / wall.y) : 0.0;
  o = vec4(col * (1.0 - a), 1.0);
}`;

/** The monitor's GPU drawer, or null where WebGL2 is missing or the renderer is software (the 2D path stays). */
export function createDopplerGL() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
  if (!gl) return null;
  try {
    const ri = gl.getExtension('WEBGL_debug_renderer_info');
    if (/SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(String(gl.getParameter(ri ? ri.UNMASKED_RENDERER_WEBGL : gl.RENDERER)))) return null;
  } catch { /* the renderer's name withheld: taken as a GPU */ }
  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
  // The program is started now and published once the driver has finished it (gl-compile.js); render() publishes it if it comes first.
  let started;
  try { started = startProgram(gl, VS, FS, [['p', 0]]); } catch (e) { console.warn('Doppler on the GPU: shader failed; the 2D monitor stays.', e); return null; }
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  const tex = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); return t; };
  const ringT = tex(), noiseT = tex();
  let prog = null, U = null, failed = false;
  // The finished program read, and one draw of it into a throwaway 1 × 1 target: the browser builds the shader's GPU pipeline at its
  // first draw (Safari's Metal does it then, not at the link), which fell on the monitor's first frame as it opened. The ring's and the
  // noise's textures are not touched (they may already hold the monitor's data); render() binds both again.
  function publish() {
    if (prog || failed || lost) return;
    try {
      prog = checkProgram(gl, started);
      U = Object.fromEntries(['ring', 'noise', 'size', 'org', 'p', 'nOff', 'noiseA', 'wall'].map((k) => [k, gl.getUniformLocation(prog, k)]));
      const dummy = [gl.createTexture(), gl.createTexture()];
      for (const t of dummy) { gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255])); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); }
      exerciseDraw(gl, () => {
        gl.useProgram(prog);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, dummy[0]); gl.uniform1i(U.ring, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, dummy[1]); gl.uniform1i(U.noise, 1);
        gl.uniform2i(U.size, 1, 1);
        gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null);
      });
      for (const t of dummy) gl.deleteTexture(t);
    } catch (e) { failed = true; console.warn('Doppler on the GPU: shader failed; the 2D monitor stays.', e); }
  }
  publishWhenDone(gl, [started], publish);
  let rw = 0, rh = 0;
  const bytes = (d) => (d instanceof Uint8Array ? d : new Uint8Array(d.buffer, d.byteOffset, d.byteLength));
  return {
    get lost() { return lost || failed; },
    canvas,
    /** The whole ring from an ImageData or a canvas of the ring's size (its first row the top). */
    ringAll(src, w, h) {
      rw = w; rh = h;
      gl.bindTexture(gl.TEXTURE_2D, ringT);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      if (src instanceof ImageData) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes(src.data));
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    },
    /** Columns x0 … x0 + n − 1 of the ring from the ImageData img (the ring's size), as synthesised. */
    ringCols(img, x0, n) {
      if (img.width !== rw || img.height !== rh || n <= 0) return;
      gl.bindTexture(gl.TEXTURE_2D, ringT);
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, img.width);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x0);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, 0, n, rh, gl.RGBA, gl.UNSIGNED_BYTE, bytes(img.data));
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    },
    /** The noise floor's texture (an ImageData, makeNoise). */
    noise(fi) {
      gl.bindTexture(gl.TEXTURE_2D, noiseT);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fi.width, fi.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes(fi.data));
    },
    /**
     * The trace drawn at (dx, dy) of a canvas W × H (device px, from the top left): the ring from column p + 1 on the left,
     * the noise view at (nx, ny) added with share noiseA, and the wall filter's band about the baseline (base px from the
     * trace's top, half height wf px). The rest of the canvas is black (the 2D canvas covers it anyway).
     */
    render({ W, H, dx, dy, RW, RH, p, nx, ny, noiseA, base, wf }) {
      publish();
      if (lost || failed || RW !== rw || RH !== rh || gl.isContextLost()) return false;
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      const oy = H - dy - RH;
      gl.disable(gl.SCISSOR_TEST);
      gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.viewport(dx, oy, RW, RH);
      gl.useProgram(prog);
      gl.uniform2i(U.org, dx, oy);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, ringT); gl.uniform1i(U.ring, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, noiseT); gl.uniform1i(U.noise, 1);
      gl.uniform2i(U.size, RW, RH);
      gl.uniform1i(U.p, p);
      gl.uniform2i(U.nOff, nx, ny);
      gl.uniform1f(U.noiseA, noiseA);
      gl.uniform2f(U.wall, base, wf);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      return true;
    },
    dispose() {
      gl.deleteTexture(ringT); gl.deleteTexture(noiseT); gl.deleteBuffer(quad); gl.deleteVertexArray(vao); gl.deleteProgram(prog);
      canvas.width = canvas.height = 0;
      gl.getExtension('WEBGL_lose_context')?.loseContext();   // (the context given back at once, as endo-gl.js does, not when the browser gets to it)
    },
  };
}
