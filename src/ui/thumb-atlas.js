// The slide overview's pictures, kept on the GPU (N5, 3 Nov 2026; Mohammad: "do all new features"). When a slide has landed, the figure's
// GL canvases (the vessel canvas or the lobule's, and the label layer over them) are taken into a texture of this module's own WebGL 2
// context, stacked by a shader into that slide's tile of one atlas texture (a GPU to GPU copy, no 2D canvas, no CPU pixel read), and
// the overview strip draws its visible tiles from the atlas onto the strip's canvas. A slide that has not been shown has no tile (the
// strip shows its title only). One context, made on the first picture; the atlas is sized by the deck (at most MAX_TILES slides), and
// drop() gives all of it back when the deck closes.
// Tile pictures are fitted whole (contain) in a TILE_W × TILE_H tile; the source is mipmapped so a big figure canvas shrinks smoothly.
import { startProgram, compileDone, checkProgram } from './gl-compile.js';
import { budgetOwner } from './gpu-budget.js';

export const TILE_W = 320, TILE_H = 200, COLS = 8, MAX_TILES = 128;

/** Rows of tiles an atlas of n slides needs. */
export const atlasRows = (n) => Math.max(1, Math.ceil(Math.min(Math.max(0, n | 0), MAX_TILES) / COLS));
/** Tile i's top-left corner in the atlas, in px (y down). */
export const tileAt = (i) => [(i % COLS) * TILE_W, Math.floor(i / COLS) * TILE_H];
/** Where a picture of sw × sh sits in a tile, whole and centred: [x, y, w, h] in tile px. */
export function fitTile(sw, sh, tw = TILE_W, th = TILE_H) {
  if (!(sw > 0) || !(sh > 0)) return [0, 0, tw, th];
  const k = Math.min(tw / sw, th / sh), w = sw * k, h = sh * k;
  return [(tw - w) / 2, (th - h) / 2, w, h];
}

const VS = `#version 300 es
in vec2 c;
uniform vec4 r;      // where the quad lands on the target: x, y, w, h over [0,1], y down
uniform vec2 uo, us; // the texture coordinate of the quad's corner (0,0) and its size: uv = uo + c * us
out vec2 uv;
void main() {
  vec2 p = r.xy + c * r.zw;
  uv = uo + c * us;
  gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
}`;
const FS = `#version 300 es
precision mediump float;
uniform sampler2D t;
uniform vec4 lim;    // the texture coordinates a read may not leave (a tile's own texels)
in vec2 uv;
out vec4 o;
void main() { o = texture(t, clamp(uv, lim.xy, lim.zw)); }`;

/** Whether a canvas can be a layer of a picture: in the page, with pixels. */
const shows = (l) => !!l && l.width > 0 && l.height > 0 && (l.isConnected !== false);
/** Whether layer l lies over the picture of `first` (the same shape: a canvas not yet sized to the stage, or another view's, is left out). */
const fits = (l, first) => Math.abs(l.width / l.height - first.width / first.height) < 0.02;

/**
 * { cv, count, ready, capture(i, layers), has(i), forget(i), resize(w, h, dpr), draw(cells, n), drop() } or null without WebGL 2.
 * cv is the strip's canvas (the caller puts it in the page); cells is a flat list [i, x, y, w, h, …] in css px over the canvas.
 */
export function createThumbAtlas({ make = () => document.createElement('canvas') } = {}) {
  if (typeof WebGL2RenderingContext === 'undefined') return null;
  const cv = make();
  let gl = null;
  try { gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false }); } catch { gl = null; }   // alloc-rare: once per overview, its context's options
  if (!gl) return null;
  budgetOwner(gl, 'slide thumbs');
  const have = new Set();     // the slides with a picture in the atlas
  let K = null, handle = null, atlas = null, src = null, lost = false, rows = 1, started = false;
  let dpr = 1;
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; K = null; handle = null; atlas = null; src = null; started = false; have.clear(); });   // alloc-rare: once per overview
  cv.addEventListener('webglcontextrestored', () => { lost = false; });   // alloc-rare: once per overview

  function start() { if (!lost && !started) { handle = startProgram(gl, VS, FS, [['c', 0]]); started = true; } }   // alloc-rare: starts the program once
  function ready() {
    if (K) return true;
    if (lost) return false;
    start();
    if (!handle || !compileDone(gl, handle)) return false;
    try { checkProgram(gl, handle); } catch { handle = null; started = false; return false; }
    const p = handle.p, vao = gl.createVertexArray(), buf = gl.createBuffer();
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);   // alloc-rare: once, when the program is first ready
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    K = { p, vao, r: gl.getUniformLocation(p, 'r'), uo: gl.getUniformLocation(p, 'uo'), us: gl.getUniformLocation(p, 'us'), t: gl.getUniformLocation(p, 't'), lim: gl.getUniformLocation(p, 'lim') };   // alloc-rare: once, when the program is first ready
    return true;
  }
  const params = (tex, mip) => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };
  function atlasFor(n) {
    const want = atlasRows(n);
    if (atlas && atlas.rows >= want) return atlas;
    // (A bigger deck than the atlas was made for: a new atlas, the pictures taken so far lost; they are taken again as the slides land.)
    if (atlas) { gl.deleteFramebuffer(atlas.fbo); gl.deleteTexture(atlas.tex); have.clear(); }
    rows = want;
    const tex = gl.createTexture(); params(tex, false);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, COLS * TILE_W, rows * TILE_H);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    atlas = { tex, fbo, rows, w: COLS * TILE_W, h: rows * TILE_H };   // alloc-rare: once per deck (or a bigger deck)
    return atlas;
  }

  const api = {
    cv,
    /** Starts the program (the overview is opened or a first slide has landed). */
    prepare: start,
    get ready() { return ready(); },   // alloc-rare: once per overview
    has: (i) => have.has(i),
    forget: (i) => { have.delete(i); },
    clear: () => { have.clear(); },
    get count() { return have.size; },
    /** Size of the strip's canvas: css px and the device ratio. */
    resize(w, h, ratio = 1) {
      dpr = ratio > 0 ? ratio : 1;
      const pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
      if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    },
    /**
     * Takes slide i's picture: the canvases in `layers` (bottom first) stacked, premultiplied, into its tile, fitted whole. n is the deck's
     * slide count (it sizes the atlas). False when nothing shows, the program is not ready or the context is lost: the tile is then
     * left as it was, and the caller tries again later.
     */
    capture(i, layers, n) {
      if (lost || gl.isContextLost() || i < 0 || i >= MAX_TILES || !ready()) return false;
      let first = null;
      for (let k = 0; k < layers.length; k++) if (shows(layers[k])) { first = layers[k]; break; }
      if (!first) return false;
      const a = atlasFor(Math.max(n | 0, i + 1));
      const [tx, ty] = tileAt(i), [fx, fy, fw, fh] = fitTile(first.width, first.height);
      if (!src) { src = gl.createTexture(); }
      gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
      gl.viewport(0, 0, a.w, a.h);
      gl.enable(gl.SCISSOR_TEST); gl.scissor(tx, a.h - ty - TILE_H, TILE_W, TILE_H);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.SCISSOR_TEST);
      gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      let ok = true, drew = 0;
      gl.useProgram(K.p); gl.bindVertexArray(K.vao); gl.uniform1i(K.t, 0); gl.activeTexture(gl.TEXTURE0);
      gl.uniform4f(K.lim, 0, 0, 1, 1);
      gl.uniform2f(K.uo, 0, 0); gl.uniform2f(K.us, 1, 1);
      gl.uniform4f(K.r, (tx + fx) / a.w, (ty + fy) / a.h, fw / a.w, fh / a.h);
      try {
        for (let k = 0; k < layers.length; k++) {
          const l = layers[k];
          if (!shows(l) || !fits(l, first)) continue;
          params(src, true);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, l);
          gl.generateMipmap(gl.TEXTURE_2D);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          drew++;
        }
      } catch { ok = false; }
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.disable(gl.BLEND);
      // (The source let go of its pixels: a 1 × 1 keeps the name.)
      gl.bindTexture(gl.TEXTURE_2D, src); params(src, false); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindVertexArray(null);
      if (!ok || !drew) return false;
      have.add(i);
      return true;
    },
    /**
     * Draws the strip: each cell [i, x, y, w, h, …] (css px over the canvas) that has a picture is laid from its tile; the rest of the canvas is
     * clear. False when nothing could be drawn (no atlas yet, program not ready, context lost).
     */
    draw(cells) {
      if (lost || gl.isContextLost()) return false;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, cv.width, cv.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      if (!atlas || !ready()) return false;
      const W = cv.width / dpr, H = cv.height / dpr;
      gl.disable(gl.BLEND);
      gl.useProgram(K.p); gl.bindVertexArray(K.vao); gl.uniform1i(K.t, 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, atlas.tex);
      const hx = 0.5 / atlas.w, hy = 0.5 / atlas.h;
      for (let k = 0; k + 4 < cells.length; k += 5) {
        const i = cells[k];
        if (!have.has(i)) continue;
        const x = cells[k + 1], y = cells[k + 2], w = cells[k + 3], h = cells[k + 4];
        if (x + w <= 0 || x >= W || y + h <= 0 || y >= H) continue;
        const [tx, ty] = tileAt(i);
        // (The tile's rows from the top: the atlas was drawn with y down, so its texture row 1 is the top.)
        const u0 = tx / atlas.w, v0 = 1 - ty / atlas.h, du = TILE_W / atlas.w, dv = -TILE_H / atlas.h;
        gl.uniform4f(K.r, x / W, y / H, w / W, h / H);
        gl.uniform2f(K.uo, u0, v0); gl.uniform2f(K.us, du, dv);
        gl.uniform4f(K.lim, u0 + hx, v0 + dv + hy, u0 + du - hx, v0 - hy);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.bindVertexArray(null);
      return true;
    },
    /** Estimated bytes held (the atlas). */
    bytes: () => (atlas ? atlas.w * atlas.h * 4 : 0),
    /** The deck closed: the atlas, the program and the context go. */
    drop() {
      have.clear();
      if (!lost && !gl.isContextLost()) {
        if (atlas) { gl.deleteFramebuffer(atlas.fbo); gl.deleteTexture(atlas.tex); }
        if (src) gl.deleteTexture(src);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
      atlas = null; src = null; K = null; handle = null; started = false;
      cv.remove?.();
    },
  };
  return api;
}
