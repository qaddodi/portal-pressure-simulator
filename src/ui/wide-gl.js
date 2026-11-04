// The lobule's wide copy on the GPU (lobule-zoom.js buildWide): a dive aimed at a station, or a rise out of a zoomed-in lobule,
// shows the whole lobule as one picture scaled through the zoom. It was a box of 2D canvases, each tile the layers drawn onto it on
// the CPU (drawImage of the tissue, the vessels and the overlay, then their edges' translucent pixels cleared), scaled by the
// compositor. Here each tile is a texture in this canvas's own context: the layers' canvases, drawn on the GPU at the tile's size,
// are sent in as they are drawn (a copy between GPU canvases), laid one over the other into the tile in a framebuffer, premultiplied,
// and mipmapped. Each frame of the zoom is one small pass: the tiles drawn as quads where the box's scale puts them, on a canvas the
// size of the stage. Nothing is drawn or copied on the CPU, and no 2D canvas holds the copy.
//
// Without WebGL2 (or on a software renderer), with a tile past the GPU's texture size, or if any send or framebuffer fails, build
// returns false and the caller builds the 2D tiles instead. A context lost mid-zoom reports lost; the caller then drops the copy. When
// the browser gives the context back, the programs are made again in place, and the next copy is built on it (the lost one stays lost).

import { startProgram, checkProgram } from './gl-compile.js';
import { fbComplete, glCap, glOkBefore, glOkAfter } from './gl-state.js';

export const WIDE_GL = true;   // (switch deleted; kept for lobule-zoom.js until its own pass)

// Laying a layer into a tile: one texel of the layer per texel of the tile, from the layer's top left (a layer larger than the
// tile, the vessels' canvas sized once for every tile, is cropped, as drawImage cropped it).
const LAY_VS = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
const LAY_FS = `#version 300 es
precision highp float;
uniform sampler2D uS;
uniform vec2 uSize;   // the layer's size (texels)
out vec4 o;
void main() { o = texture(uS, gl_FragCoord.xy / uSize); }`;
// Showing the tiles: each a quad at its place on the stage (device px from the top left), its own part of the texture (the
// overlap past it, under its right and lower neighbours, only feeds the filtering at its edge).
const SHOW_VS = `#version 300 es
in vec2 p;
uniform vec4 uRect;   // x, y, w, h (device px, from the top left)
uniform vec2 uCv;     // the canvas's size
uniform vec2 uUv;     // the tile's own part of its texture (0 … 1)
out vec2 vUv;
void main() {
  vec2 q = uRect.xy + p * uRect.zw;
  vUv = p * uUv;
  gl_Position = vec4(q.x / uCv.x * 2.0 - 1.0, 1.0 - q.y / uCv.y * 2.0, 0.0, 1.0);
}`;
const SHOW_FS = `#version 300 es
precision highp float;
uniform sampler2D uT;
uniform float uA;     // its opacity (1 but while it fades out over the layers, hosted)
in vec2 vUv;
out vec4 o;
void main() { o = texture(uT, vUv) * uA; }`;
export const wideShaders = { LAY_VS, LAY_FS, SHOW_VS, SHOW_FS };   // (for the shader lint in the unit tests)

/** host ({ gl, canvas }: the lobule's vessel renderer's top, veins-gl.js): no canvas or context of its own. Each tile is copied
 *  from the host's canvas, inside the context, right after the layers were laid there for it (tile(…, 'host')), and each frame of the
 *  zoom is drawn on the host's canvas at its present (draw, from the host's replace or top), leaving the context as the host's passes
 *  expect it. The owner makes it again with the renderer it makes after a lost context. */
export function createWideGL(canvas, { host = null } = {}) {
  const SCRN = () => (host && host.screen ? host.screen() : null);   // (the framebuffer the host's canvas stands in as: null, or a shared renderer's texture)
  let gl = null;
  if (host) { gl = host.gl; canvas = host.canvas; }
  else return null;   // (hosted only, the two-contexts plan)
  if (!gl) return null;
  let lost = false, stale = false;   // (stale: the copy was lost with the context, until the next begin)
  if (!host) {
    canvas.addEventListener('webglcontextlost', (e) => { lost = true; stale = true; tiles = []; e.preventDefault?.(); });
    canvas.addEventListener('webglcontextrestored', () => { try { init(); lost = false; } catch (err) { console.warn('The wide copy falls back to the 2D canvas.', err); } });
  }
  // (Hosted: a vertex array of its own, as the host's passes bind theirs, and the context put back after each call.)
  let vao = null;
  function hostDone() {
    if (!host) return;
    gl.useProgram(null); gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null); gl.bindFramebuffer(gl.FRAMEBUFFER, SCRN());
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.disable(gl.BLEND);
  }
  // (Through gl-compile.js: both programs started before either is read, so the driver compiles them side by side; the copy's context is
  // made by the lobule's idle preparation, ahead of the first dive, so no dive's frame compiles them.)
  const prog = (h) => { try { return checkProgram(gl, h); } catch (e) { throw new Error('wide-gl: ' + e.message, { cause: e }); } finally { for (const s of h.sh) gl.deleteShader(s); } };
  const U = (p, n) => gl.getUniformLocation(p, n);
  let lay, show, uL, uS, tri, quad, MAX, scratch;
  // (Everything the context holds but the tiles: made at the start, and again when a lost context comes back.)
  function init() {
    const hl = startProgram(gl, LAY_VS, LAY_FS, [['p', 0]]), hs = startProgram(gl, SHOW_VS, SHOW_FS, [['p', 0]]);
    lay = prog(hl); show = prog(hs);
    uL = { S: U(lay, 'uS'), size: U(lay, 'uSize') }; uS = { T: U(show, 'uT'), rect: U(show, 'uRect'), cv: U(show, 'uCv'), uv: U(show, 'uUv'), a: U(show, 'uA') };
    tri = gl.createBuffer(); quad = gl.createBuffer();
    if (host) { vao = gl.createVertexArray(); gl.bindVertexArray(vao); }
    gl.bindBuffer(gl.ARRAY_BUFFER, tri); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.disable(gl.DEPTH_TEST);
    MAX = glCap(gl, gl.MAX_TEXTURE_SIZE);   // (asked once per context generation: gl-state.js)
    scratch = gl.createTexture();
    hostDone();
  }
  try { init(); } catch (err) { console.warn('The wide copy falls back to the 2D canvas.', err); hostDone(); return null; }
  let tiles = [];   // { tex, x, y, w, h (CSS px in the box, its own part), pw, ph (texels), uw, uh (its own part, 0 … 1) }
  // (Its calls' errors asked of the driver each time, gl-state.js glOkAfter: an earlier success proves nothing for the next tile.)
  const ok = () => !lost && !gl.isContextLost() && glOkAfter(gl);
  function clear() { if (!lost && !gl.isContextLost()) for (const t of tiles) gl.deleteTexture(t.tex); tiles = []; }
  return {
    get lost() { return lost || stale || gl.isContextLost(); },
    get count() { return tiles.length; },
    /** Starts a copy (the last one's tiles given back). */
    begin() { clear(); if (!lost && !gl.isContextLost()) stale = false; glOkBefore(gl); return !this.lost; },
    /** One tile: t { x, y, w, h } its own part in the box (CSS px), pw × ph its texture (device px, with the overlap), dpr; layers:
     *  the canvases to lay, bottom first, each drawn for this tile from its top left (larger ones cropped), or 'host' (hosted): the host's
     *  canvas, every layer laid there for this tile, copied from its top left inside the context. False if the GPU refused. */
    tile(t, pw, ph, dpr, layers) {
      if (this.lost || pw > MAX || ph > MAX || pw < 1 || ph < 1) return false;
      if (layers === 'host') return fromHost(t, pw, ph, dpr);
      const tex = gl.createTexture(), fbo = gl.createFramebuffer();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texStorage2D(gl.TEXTURE_2D, Math.floor(Math.log2(Math.max(pw, ph))) + 1, gl.RGBA8, pw, ph);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const done = (good) => { gl.bindFramebuffer(gl.FRAMEBUFFER, SCRN()); gl.deleteFramebuffer(fbo); if (!good) gl.deleteTexture(tex); return good; };
      if (!fbComplete(gl, gl.FRAMEBUFFER, 'rgba8mip', pw, ph) || !ok()) return done(false);   // (asked per framebuffer, size and attachment set: gl-state.js)
      gl.viewport(0, 0, pw, ph);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(lay);
      gl.bindBuffer(gl.ARRAY_BUFFER, tri); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // (premultiplied: each layer over the ones below, as source-over)
      gl.uniform1i(uL.S, 1);
      for (const cv of layers) {
        if (!cv?.width || !cv.height) continue;
        // (The layer sent as it is: row 0 its top, as the tile's row 0 is. Premultiplied on the way in, as the 2D canvas lays it.)
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, scratch);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, cv);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        if (!ok()) { gl.disable(gl.BLEND); return done(false); }
        gl.uniform2f(uL.size, cv.width, cv.height);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.BLEND);
      // (The layer's texture given back to a pixel: a tile's worth of GPU memory is not kept between tiles.)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.generateMipmap(gl.TEXTURE_2D);   // (shown down to a twentieth of its size through the zoom: filtered, never shimmering)
      if (!ok()) return done(false);
      tiles.push({ tex, x: t.x, y: t.y, w: t.w, h: t.h, uw: Math.min(1, (t.w * dpr) / pw), uh: Math.min(1, (t.h * dpr) / ph) });
      return done(true);
    },
    /** Hosted: the canvas holds a copy to show. */
    get shown() { return tiles.length > 0 && !this.lost; },
    /** One frame: the box (placed at (−l, −t) on the stage) scaled by k about the stage point (x, y), moved by (tx − x, ty − y), as
     *  the 2D copy's CSS transform placed it; the canvas sized W × H CSS px at dpr. */
    draw(W, H, dpr, box, k, x, y, tx, ty, alpha = 1) {
      if (this.lost) return false;
      // (Hosted: on the host's canvas as its owner sized it, over what the host cleared or laid (premultiplied); dpr its density.)
      const cw = host ? canvas.width : Math.max(1, Math.round(W * dpr)), ch = host ? canvas.height : Math.max(1, Math.round(H * dpr));
      if (!host && (canvas.width !== cw || canvas.height !== ch)) { canvas.width = cw; canvas.height = ch; }
      gl.bindFramebuffer(gl.FRAMEBUFFER, SCRN());
      gl.viewport(0, 0, cw, ch);
      if (host) { gl.bindVertexArray(vao); gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); }
      else { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
      gl.useProgram(show);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1i(uS.T, 0); gl.uniform2f(uS.cv, cw, ch); gl.uniform1f(uS.a, alpha);
      gl.activeTexture(gl.TEXTURE0);
      for (const t of tiles) {
        const qx = t.x - box.l, qy = t.y - box.t;
        gl.bindTexture(gl.TEXTURE_2D, t.tex);
        gl.uniform4f(uS.rect, (tx + k * (qx - x)) * dpr, (ty + k * (qy - y)) * dpr, k * t.w * dpr, k * t.h * dpr);
        gl.uniform2f(uS.uv, t.uw, t.uh);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      hostDone();
      return true;
    },
    /** Gives the copy back: its tiles, and the canvas's pixels (hosted: the host's canvas is its owner's). */
    release() { clear(); if (!host && canvas.width) { canvas.width = 0; canvas.height = 0; } },
  };
  // A tile copied from the host's canvas: its top left pw × ph, flipped so the texture's row 0 is the picture's top (as a layer sent from a
  // canvas is), inside the context (no copy through a canvas), then mipmapped.
  function fromHost(t, pw, ph, dpr) {
    const ch = canvas.height;
    if (pw > canvas.width || ph > ch) return false;
    const tex = gl.createTexture(), fbo = gl.createFramebuffer();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, Math.floor(Math.log2(Math.max(pw, ph))) + 1, gl.RGBA8, pw, ph);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const done = (good) => { gl.bindFramebuffer(gl.FRAMEBUFFER, SCRN()); gl.deleteFramebuffer(fbo); if (!good) gl.deleteTexture(tex); hostDone(); return good; };
    if (!fbComplete(gl, gl.DRAW_FRAMEBUFFER, 'rgba8mip', pw, ph) || !ok()) return done(false);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, SCRN());
    gl.disable(gl.SCISSOR_TEST);
    gl.blitFramebuffer(0, ch - ph, pw, ch, 0, ph, pw, 0, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.generateMipmap(gl.TEXTURE_2D);
    if (!ok()) return done(false);
    tiles.push({ tex, x: t.x, y: t.y, w: t.w, h: t.h, uw: Math.min(1, (t.w * dpr) / pw), uh: Math.min(1, (t.h * dpr) / ph) });
    return done(true);
  }
}
