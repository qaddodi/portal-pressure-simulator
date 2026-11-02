// The lobule field's toned copies made on the GPU. Each tile of the field (lobule-zoom.js drawTile) had two copies made from it on
// the main thread: the liver-toned one the dive starts from (drained and tinted like the liver it zooms into) and the quiet one the
// neighbouring lobules rest in (blurred, wrapping round the repeat, then drained and flattened toward the page). The quiet copy's blur
// read the whole tile back (getImageData), blurred it in script and wrote it again: tens of ms for each large tile, on the frames
// before a dive or a rise, and two more canvases of up to 12 MB each held in memory, sent to each GPU context that drew them.
//
// Here the tile is sent to the GPU once, and each copy is drawn from it there, into its own texture, by one small program: the same
// steps in the same order (lobule-look.js neighbourBlur's softness, as a true Gaussian; the saturation blend with grey, 0.45; the
// page's colour at 0.42; NEIGHBOUR_FLAT), wrapping at the repeat, so the copy is the same picture, seamless where the pattern tiles.
// The copy never exists as a canvas: lobule-zoom.js hands the GPU contexts a small description of it (tileCopy) in place of a canvas,
// and each context makes its texture from that the first time it is drawn, keeping it until the description is given back (width 0),
// as for a canvas. The tile itself is a picture recorded for the GPU (lobule-zoom.js drawTile, paint-gl.js), painted into the copier's
// texture: no 2D canvas anywhere (1 Nov 2026). (No 2D copies since then.)

import { glGet, glOn } from './gl-state.js?v=7962476b4a';
import { prestart, linkProgram } from './gl-compile.js?v=e48e05cdb3';
import { isGpuPicture, paintGL } from './paint-gl.js?v=a99fe43a10';

/** A copy of tile canvas src made on the GPU. look: { blur (Gaussian sigma, tile px; 0 for none), sat (the grey blend's share),
 *  tone ([r, g, b] 0–1, the colour laid over it), toneA (its opacity), flat (a second layer of the same colour, 0 for none) }.
 *  w, h: the tile's size. blank: the tile had no picture, so the copy is clear. It has the tile's size, so
 *  it stands where a canvas did; free() (width 0) gives its textures back. */
export function tileCopy(src, w, h, look, blank = false) {
  return { width: w, height: h, src, look, blank, tileCopy: true };
}
export const isTileCopy = (cv) => !!cv && cv.tileCopy === true;

const VS = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

// One pass. The Gaussian along uDir (texels), wrapping at the tile's edges (the pattern repeats); with uTone.w, the tones after it.
// texelFetch: no filtering, and row j of the target is row j of the source, so nothing is flipped.
export const copyFS = `#version 300 es
precision highp float;
uniform sampler2D uS;
uniform ivec2 uDir;     // (1, 0) across, (0, 1) down, (0, 0) no blur
uniform float uSigma;
uniform int uN;         // taps either side
uniform vec4 uTone;     // the page's colour, laid over (1) or not (0)
uniform vec3 uK;        // the grey blend's share, the colour's opacity, the second layer's
out vec4 o;
void main() {
  ivec2 size = textureSize(uS, 0), q = ivec2(gl_FragCoord.xy);
  vec4 c = texelFetch(uS, q, 0);
  if (uN > 0) {
    float wsum = 1.0;
    for (int i = 1; i <= 64; i++) {
      if (i > uN) break;
      float w = exp(-float(i * i) / (2.0 * uSigma * uSigma));
      ivec2 a = (q + uDir * i) % size, b = (q - uDir * i + size * 64) % size;
      c += (texelFetch(uS, a, 0) + texelFetch(uS, b, 0)) * w;
      wsum += 2.0 * w;
    }
    c /= wsum;
  }
  if (uTone.w > 0.0) {
    // The 2D canvas's saturation blend with grey (its luma, by the W3C's weights), then the colour laid over at its opacity, twice.
    float l = dot(c.rgb, vec3(0.3, 0.59, 0.11));
    vec3 t = mix(c.rgb, vec3(l), uK.x);
    t = mix(t, uTone.rgb, uK.y);
    t = mix(t, uTone.rgb, uK.z);
    c.rgb = t;
  }
  o = c;
}`;

/** The copier for one GPU context: make(copy) returns a new texture holding the copy (repeating, mipmapped), or null if the GPU could
 *  not take it (the caller draws that frame on the 2D canvas, as for a canvas whose send failed). The tile itself is kept on the GPU
 *  only between copies made from it (one at a time: the large tiles are 12 MB each), and the program is made on first use. */
export function createTileCopier(gl) {
  try { prestart(gl, VS, copyFS, [['p', 0]]); } catch { /* (compiled at the first copy, as before) */ }
  let prog = null, U = null, vao = null, raw = null, failed = false;
  gl.canvas?.addEventListener?.('webglcontextlost', () => { prog = null; U = null; vao = null; raw = null; });
  function ready() {
    if (prog) return true;
    if (failed || gl.isContextLost()) return false;
    try {
      // (Started with its context by createTileCopier, gl-compile.js prestart, and taken up here, its compile long done.)
      const p = linkProgram(gl, VS, copyFS, [['p', 0]]);
      U = Object.fromEntries(['uS', 'uDir', 'uSigma', 'uN', 'uTone', 'uK'].map((n) => [n, gl.getUniformLocation(p, n)]));
      // (Its own vertex array, so the context's own attribute set-up is never changed.)
      vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      prog = p;
      return true;
    } catch (err) { failed = true; console.warn('The lobule field\'s copies are made on the main thread.', err); return false; }
  }
  const texture = (w, h, filter) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    return t;
  };
  // The tile on the GPU, kept for the next copy of it: a picture recorded for the GPU (paint-gl.js), painted straight into its texture.
  function rawFor(src) {
    if (raw && raw.src === src && raw.w === src.width && raw.h === src.height) return raw.tex;
    if (raw) { gl.deleteTexture(raw.tex); raw = null; }
    if (isGpuPicture(src)) {
      const tex = paintGL(gl).paint(src.rec, { mip: false });
      if (!tex) return null;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      raw = { src, w: src.width, h: src.height, tex };
      return tex;
    }
    return null;   // (every tile is a recorded picture: no canvas is sent)
  }
  // One pass from texture `from` into texture `to` (w × h).
  function pass(fbo, from, to, w, h, dir, sigma, n, look) {
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, to, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return false;
    gl.bindTexture(gl.TEXTURE_2D, from);
    gl.uniform2i(U.uDir, dir[0], dir[1]); gl.uniform1f(U.uSigma, Math.max(sigma, 1e-3)); gl.uniform1i(U.uN, n);
    if (look) { const c = look.tone; gl.uniform4f(U.uTone, c[0], c[1], c[2], 1); gl.uniform3f(U.uK, look.sat, look.toneA, look.flat || 0); }
    else gl.uniform4f(U.uTone, 0, 0, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }
  function make(copy) {
    if (!ready() || !copy?.width || (!copy.blank && copy.src?.width !== copy.width)) return null;
    const { width: w, height: h, look } = copy;
    // (Everything the context had set is put back: a copy is made from inside its draws, between their own settings.)
    // (From the renderer's own record of the context, gl-state.js: no query reaches the driver.)
    const was = { prog: glGet(gl, gl.CURRENT_PROGRAM), fb: glGet(gl, gl.FRAMEBUFFER_BINDING), vp: glGet(gl, gl.VIEWPORT), unit: glGet(gl, gl.ACTIVE_TEXTURE), blend: glOn(gl, gl.BLEND), scissor: glOn(gl, gl.SCISSOR_TEST) };
    gl.activeTexture(gl.TEXTURE0 + 15);   // (a unit no draw of the lobule uses)
    const held = glGet(gl, gl.TEXTURE_BINDING_2D);
    const out = texture(w, h, gl.LINEAR_MIPMAP_LINEAR);
    let ok = false, mid = null;
    const fbo = gl.createFramebuffer();
    try {
      gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, w, h);
      if (copy.blank) {
        // (A tile with no picture: the copy is clear, so the shaders lay the page's colour where it would be, as for the canvas copy.)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, out, 0);
        ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        if (ok) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
      } else {
        const src = rawFor(copy.src);
        if (src) {
          gl.useProgram(prog); gl.bindVertexArray(vao); gl.uniform1i(U.uS, 15);
          const sigma = look.blur || 0, n = sigma > 0.5 ? Math.min(64, Math.ceil(sigma * 3)) : 0;
          if (n > 0) {
            mid = texture(w, h, gl.NEAREST);
            ok = pass(fbo, src, mid, w, h, [1, 0], sigma, n, null) && pass(fbo, mid, out, w, h, [0, 1], sigma, n, look);
          } else ok = pass(fbo, src, out, w, h, [0, 0], 1, 0, look);
          gl.bindVertexArray(null);
        }
      }
      if (ok) { gl.bindTexture(gl.TEXTURE_2D, out); gl.generateMipmap(gl.TEXTURE_2D); }
    } catch (err) { ok = false; console.warn(err); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, was.fb);
    gl.deleteFramebuffer(fbo);
    if (mid) gl.deleteTexture(mid);
    gl.bindTexture(gl.TEXTURE_2D, held);
    gl.activeTexture(was.unit);
    gl.useProgram(was.prog);
    gl.viewport(was.vp[0], was.vp[1], was.vp[2], was.vp[3]);
    if (was.blend) gl.enable(gl.BLEND);
    if (was.scissor) gl.enable(gl.SCISSOR_TEST);
    if (!ok) { gl.deleteTexture(out); return null; }
    return out;
  }
  return {
    make,
    /** Gives back the tile kept for the next copy (its canvas given back, or not wanted any more). */
    sweep() { if (raw && (!raw.src.width || raw.w !== raw.src.width)) { if (!gl.isContextLost()) gl.deleteTexture(raw.tex); raw = null; } },
    /** The tile kept for copies, let go of (after a dive's copies are made: up to 12 MB of the GPU's memory). */
    drop() { if (raw) { if (!gl.isContextLost()) gl.deleteTexture(raw.tex); raw = null; } },
  };
}
