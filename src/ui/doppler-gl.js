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
// There is no 2D path any more (the owner, 1 Nov 2026: nothing off the GPU): a monitor with no WebGL2 shows its words over a black trace,
// and a lost context shows the trace black until the ring is sent again.

import { startProgram, checkProgram, exerciseDraw, publishWhenDone, stillCompiling } from './gl-compile.js?v=63e54c6c92';

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

/** The monitor's GPU drawer, or null where WebGL2 is missing (the trace then stays black: nothing of it is drawn on the CPU). */
export function createDopplerGL({ onReady = null } = {}) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
  if (!gl) return null;
  // (lost: the GPU does not draw the monitor, from the loss until the rebuilt program is published.)
  let lost = false, dead = false;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
  let started = null, quad = null, vao = null, ringT = null, noiseT = null, stopPoll = null, waitingDraw = false;
  let prog = null, U = null, failed = false;
  let rw = 0, rh = 0, noiseSrc = null;   // (noiseSrc: the noise floor as last sent, to send it again to a context that came back)
  const tex = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); return t; };
  // What the context holds: the program (started now, published once the driver has finished it, gl-compile.js; render() publishes it if
  // it comes first), the quad and the two textures. Made at the start, and again when a lost context comes back (webglcontextrestored):
  // none of it survives a loss. The ring is sent whole by doppler.js on its next GPU frame (it draws the 2D path until then and marks it),
  // the noise floor is sent again here.
  function build() {
    prog = null; U = null; failed = false; rw = rh = 0;
    started = startProgram(gl, VS, FS, [['p', 0]]);
    quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    ringT = tex(); noiseT = tex();
    stopPoll?.(); stopPoll = publishWhenDone(gl, [started], publish);
  }
  // The finished program read, and one draw of it into a throwaway 1 × 1 target: the browser builds the shader's GPU pipeline at its
  // first draw (Safari's Metal does it then, not at the link), which fell on the monitor's first frame as it opened. The ring's and the
  // noise's textures are not touched (they may already hold the monitor's data); render() binds both again.
  function publish() {
    if (prog || failed || gl.isContextLost()) return;
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
      lost = false;   // (after a restore: the GPU draws the monitor again from the next frame)
      if (waitingDraw) { waitingDraw = false; try { onReady?.(); } catch (e2) { console.warn('Doppler on the GPU: the redraw failed.', e2); } }
    } catch (e) {
      if (gl.isContextLost()) { prog = null; U = null; return; }   // (lost while it was read: the restore makes it again)
      failed = true; console.warn('Doppler on the GPU: shader failed; the 2D monitor stays.', e);
    }
  }
  try { build(); } catch (e) { console.warn('Doppler on the GPU: shader failed; the 2D monitor stays.', e); gl.getExtension('WEBGL_lose_context')?.loseContext(); return null; }
  const putNoise = (fi) => {
    gl.bindTexture(gl.TEXTURE_2D, noiseT);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fi.width, fi.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes(fi.data));
  };
  // A context the browser gives back (iOS Safari returns to the page, or a GPU process restarts) is built afresh. The monitor stays on the
  // 2D path (doppler.js reads lost) until the program is published, at an idle moment as at the start, not in a frame; the ring goes up
  // whole with the first GPU frame (rw and rh are zero, and doppler.js marks it while the GPU is not drawing).
  canvas.addEventListener('webglcontextrestored', () => {
    if (dead) return;
    try { build(); if (noiseSrc) putNoise(noiseSrc); } catch (e) { failed = true; console.warn('Doppler on the GPU: could not be rebuilt; the 2D monitor stays.', e); }
  });
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
    /**
     * A ring of a new size (w × h) from the one the GPU holds, stretched as the 2D canvas's copies did: the ring turned so its oldest line
     * (column po + 1) is on the left, then laid with that line at column sx, scaled to the new size. Two blits each way, on the GPU.
     * False where there is nothing to stretch (the ring is then sent whole).
     */
    stretch(w, h, po, sx) {
      if (lost || failed || gl.isContextLost() || !rw || !rh || w < 1 || h < 1) return false;
      const oW = rw, oH = rh, T = tex(), N = tex();
      gl.bindTexture(gl.TEXTURE_2D, T); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, oW, oH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindTexture(gl.TEXTURE_2D, N); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const rf = gl.createFramebuffer(), df = gl.createFramebuffer();
      const blit = (src, dst, sx0, sx1, dx0, dx1, sh, dh, filter) => {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, rf); gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, src, 0);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, df); gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst, 0);
        gl.blitFramebuffer(sx0, 0, sx1, sh, dx0, 0, dx1, dh, gl.COLOR_BUFFER_BIT, filter);
      };
      gl.disable(gl.SCISSOR_TEST);
      // (turned: old columns po + 1 … end first, then 0 … po)
      if (po + 1 < oW) blit(ringT, T, po + 1, oW, 0, oW - po - 1, oH, oH, gl.NEAREST);
      blit(ringT, T, 0, po + 1, oW - po - 1, oW, oH, oH, gl.NEAREST);
      // (laid: the turned ring scaled into new columns sx … end, then 0 … sx − 1)
      const fx = oW / w, cut = Math.round((w - sx) * fx);
      if (w - sx > 0) blit(T, N, 0, cut, sx, w, oH, h, gl.LINEAR);
      if (sx > 0) blit(T, N, cut, oW, 0, sx, oH, h, gl.LINEAR);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.deleteFramebuffer(rf); gl.deleteFramebuffer(df); gl.deleteTexture(T); gl.deleteTexture(ringT);
      ringT = N; rw = w; rh = h;
      return true;
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
    noise(fi) { noiseSrc = fi; if (!lost && !gl.isContextLost()) putNoise(fi); },
    /**
     * The trace drawn at (dx, dy) of a canvas W × H (device px, from the top left): the ring from column p + 1 on the left,
     * the noise view at (nx, ny) added with share noiseA, and the wall filter's band about the baseline (base px from the
     * trace's top, half height wf px). The rest of the canvas is black (the 2D canvas covers it anyway).
     */
    render({ W, H, dx, dy, RW, RH, p, nx, ny, noiseA, base, wf }) {
      // (Review pass 2, item 2: a frame that comes while the shader is still compiling does not publish it, where reading its status
      // waits for the driver inside the frame. It draws nothing (the trace stays black, as for a lost context), the poller publishes
      // the program the moment the driver is done, and onReady asks the monitor to draw again. ?shaderready=0: published here, as before.)
      if (!prog && started && stillCompiling(gl, [started])) { stopPoll?.want?.(); waitingDraw = true; return false; }
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
      dead = true; noiseSrc = null; stopPoll?.();
      gl.deleteTexture(ringT); gl.deleteTexture(noiseT); gl.deleteBuffer(quad); gl.deleteVertexArray(vao); gl.deleteProgram(prog);
      canvas.width = canvas.height = 0;
      gl.getExtension('WEBGL_lose_context')?.loseContext();   // (the context given back at once, as endo-gl.js does, not when the browser gets to it)
    },
  };
}
