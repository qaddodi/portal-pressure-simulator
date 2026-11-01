// The lobule's wide copy on the GPU (lobule-zoom.js buildWide): a dive aimed at a station, or a rise out of a zoomed-in lobule,
// shows the whole lobule as one picture scaled through the zoom. It was a box of 2D canvases, each tile the layers drawn onto it on
// the CPU (drawImage of the tissue, the vessels and the overlay, then their edges' translucent pixels cleared), scaled by the
// compositor. Here each tile is a texture in this canvas's own context: the layers' canvases, drawn on the GPU at the tile's size,
// are sent in as they are drawn (a copy between GPU canvases), laid one over the other into the tile in a framebuffer, premultiplied,
// and mipmapped. Each frame of the zoom is one small pass: the tiles drawn as quads where the box's scale puts them, on a canvas the
// size of the stage. Nothing is drawn or copied on the CPU, and no 2D canvas holds the copy. ?widegl=0: the 2D tiles, as before.
//
// Without WebGL2 (or on a software renderer), with a tile past the GPU's texture size, or if any send or framebuffer fails, build
// returns false and the caller builds the 2D tiles instead. A context lost mid-zoom reports lost; the caller then drops the copy. When
// the browser gives the context back, the programs are made again in place, and the next copy is built on it (the lost one stays lost).

export const WIDE_GL = !(typeof location !== 'undefined' && /[?&]widegl=0\b/.test(location.search || ''));

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
in vec2 vUv;
out vec4 o;
void main() { o = texture(uT, vUv); }`;
export const wideShaders = { LAY_VS, LAY_FS, SHOW_VS, SHOW_FS };   // (for the shader lint in the unit tests)

export function createWideGL(canvas) {
  let gl = null;
  try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, failIfMajorPerformanceCaveat: true }); } catch { gl = null; }
  if (!gl) return null;
  let lost = false, stale = false;   // (stale: the copy was lost with the context, until the next begin)
  canvas.addEventListener('webglcontextlost', (e) => { lost = true; stale = true; tiles = []; e.preventDefault?.(); });
  canvas.addEventListener('webglcontextrestored', () => { try { init(); lost = false; } catch (err) { console.warn('The wide copy falls back to the 2D canvas.', err); } });
  const prog = (vs, fs) => {
    const p = gl.createProgram();
    for (const [t, s] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); gl.attachShader(p, sh); }
    gl.bindAttribLocation(p, 0, 'p');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('wide-gl: ' + gl.getProgramInfoLog(p));
    return p;
  };
  const U = (p, n) => gl.getUniformLocation(p, n);
  let lay, show, uL, uS, tri, quad, MAX, scratch;
  // (Everything the context holds but the tiles: made at the start, and again when a lost context comes back.)
  function init() {
    lay = prog(LAY_VS, LAY_FS); show = prog(SHOW_VS, SHOW_FS);
    uL = { S: U(lay, 'uS'), size: U(lay, 'uSize') }; uS = { T: U(show, 'uT'), rect: U(show, 'uRect'), cv: U(show, 'uCv'), uv: U(show, 'uUv') };
    tri = gl.createBuffer(); quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, tri); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.disable(gl.DEPTH_TEST);
    MAX = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    scratch = gl.createTexture();
  }
  try { init(); } catch (err) { console.warn('The wide copy falls back to the 2D canvas.', err); return null; }
  let tiles = [];   // { tex, x, y, w, h (CSS px in the box, its own part), pw, ph (texels), uw, uh (its own part, 0 … 1) }
  const ok = () => !lost && !gl.isContextLost() && gl.getError() === gl.NO_ERROR;
  function clear() { if (!lost) for (const t of tiles) gl.deleteTexture(t.tex); tiles = []; }
  return {
    get lost() { return lost || stale || gl.isContextLost(); },
    get count() { return tiles.length; },
    /** Starts a copy (the last one's tiles given back). */
    begin() { clear(); if (!lost && !gl.isContextLost()) stale = false; while (gl.getError() !== gl.NO_ERROR && !gl.isContextLost()); return !this.lost; },
    /** One tile: t { x, y, w, h } its own part in the box (CSS px), pw × ph its texture (device px, with the overlap), dpr; layers:
     *  the canvases to lay, bottom first, each drawn for this tile from its top left (larger ones cropped). False if the GPU refused. */
    tile(t, pw, ph, dpr, layers) {
      if (this.lost || pw > MAX || ph > MAX || pw < 1 || ph < 1) return false;
      const tex = gl.createTexture(), fbo = gl.createFramebuffer();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texStorage2D(gl.TEXTURE_2D, Math.floor(Math.log2(Math.max(pw, ph))) + 1, gl.RGBA8, pw, ph);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const done = (good) => { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fbo); if (!good) gl.deleteTexture(tex); return good; };
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE || !ok()) return done(false);
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
    /** One frame: the box (placed at (−l, −t) on the stage) scaled by k about the stage point (x, y), moved by (tx − x, ty − y), as
     *  the 2D copy's CSS transform placed it; the canvas sized W × H CSS px at dpr. */
    draw(W, H, dpr, box, k, x, y, tx, ty) {
      if (this.lost) return false;
      const cw = Math.max(1, Math.round(W * dpr)), ch = Math.max(1, Math.round(H * dpr));
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, cw, ch);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(show);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1i(uS.T, 0); gl.uniform2f(uS.cv, cw, ch);
      gl.activeTexture(gl.TEXTURE0);
      const sx = (q) => (tx + k * (q - x)) * dpr, sy = (q) => (ty + k * (q - y)) * dpr;
      for (const t of tiles) {
        const qx = t.x - box.l, qy = t.y - box.t;
        gl.bindTexture(gl.TEXTURE_2D, t.tex);
        gl.uniform4f(uS.rect, sx(qx), sy(qy), k * t.w * dpr, k * t.h * dpr);
        gl.uniform2f(uS.uv, t.uw, t.uh);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      return true;
    },
    /** Gives the copy back: its tiles, and the canvas's pixels. */
    release() { clear(); if (canvas.width) { canvas.width = 0; canvas.height = 0; } },
  };
}
