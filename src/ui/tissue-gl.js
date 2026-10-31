// The open lobule's tissue on the GPU: the picture paintTissue (lobule-zoom.js) lays down with the 2D canvas, one fragment per
// pixel in a single pass. On the 2D canvas every pan and zoom of the lobule filled the whole screen two or three times on the main
// thread (the quiet surround's pattern, the lobule's bitmap, the fade into the page; Safari draws those on the CPU); here the GPU
// draws the same picture from textures sent once (the tiles, and the lobule's bitmap each time it is painted), so a frame of a
// pan or a pinch costs the page almost nothing.
//
// The lobule's bitmap is mipmapped, so a bitmap painted for a closer zoom stays sharp when it is shown smaller (a pinch out, or the
// sharper bitmap painted ahead for zooming in: paintTissue). The surround blends the two tile sizes nearest its size on screen,
// as the dive's field does (fieldBlend), so its detail never changes in a step.
//
// Without WebGL2 (or on a software renderer, or once the context is lost) createTissueGL returns null / reports lost, and the
// tissue is drawn on the 2D canvas as before.

import { startProgram, checkProgram, exerciseDraw, publishWhenDone } from './gl-compile.js?v=5c4cd6c14c';
import { LIVE_FS, CELLS_PER_ROW, IDX_ROW, SEG_ROW, K_ROW, BIN } from './lobule-live.js?v=9512cbf33d';

const VS = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

// Mirrors paintTissue's 2D passes: the quiet surround (its pattern puts one repeat, two lobules wide and two high, per 6 rd by
// 2√3 rd device px, the lobule's centre at uO), the lobule's bitmap over it (premultiplied, mixed with the last state's while a
// new one fades in), then the fade into the page from r0 (clear) through FADE_MID halfway to whole at r1 and past it.
const FS = `#version 300 es
precision highp float;
uniform sampler2D uQA, uQB, uQO, uW, uWO;   // the quiet tiles at the two sizes blended, the last state's tile; the bitmap, the last state's
uniform float uMix, uQOld;                   // how much of the larger tile; how much of the last state's tile is left
uniform vec2 uO;                             // the lobule's centre (device px, from the top left)
uniform float uRd, uH;                       // its radius (device px); the canvas's height
uniform vec3 uRect;                          // the bitmap's box: x, y, side (device px)
uniform vec2 uWMix;                          // the new bitmap's share, the old one's (1, 0 when nothing fades)
uniform vec2 uFade;                          // r0, r1
uniform float uMid;                          // FADE_MID
uniform vec3 uBg;                            // the page's colour
uniform vec2 uGrey;                          // the surround's grade in a lens other than Pressure: saturation, opacity (1, 1: as drawn)
out vec4 o;
${LIVE_FS}
void main() {
  vec2 p = vec2(gl_FragCoord.x, uH - gl_FragCoord.y);
  vec2 uv = (p - uO) / (uRd * vec2(6.0, 3.4641016151377544));
  vec3 c = mix(texture(uQA, uv).rgb, texture(uQB, uv).rgb, uMix);
  if (uQOld > 0.0) c = mix(c, texture(uQO, uv).rgb, uQOld);
  // Grey as the anatomy's liver is in this lens (lobule-look.js surroundGrade): toward its luma, then toward the page. Only the surround:
  // the lobule's bitmap, laid over it next, keeps the lens's colours.
  if (uGrey.x < 1.0 || uGrey.y < 1.0) c = mix(uBg, mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, uGrey.x), uGrey.y);
  vec2 w = (p - uRect.xy) / uRect.z;
  vec3 c0 = c;
  if (w.x >= 0.0 && w.y >= 0.0 && w.x <= 1.0 && w.y <= 1.0) {
    // The bitmap's lookups sit in a branch only the pixels inside its box take, where the implicit derivatives that pick a mipmap level
    // are undefined: along the box's edge the first pixel of each pair read the coarsest level (the bitmap's average colour) and drew a
    // faint line round the whole box. So the step of one device px is given outright, and the outermost two pixels fade out (the lobule
    // itself lies well within the box, so nothing of the picture is lost).
    vec2 gx = vec2(1.0 / uRect.z, 0.0), gy = vec2(0.0, 1.0 / uRect.z);
    float e = clamp(min(min(w.x, 1.0 - w.x), min(w.y, 1.0 - w.y)) * uRect.z / 2.0, 0.0, 1.0);
    vec4 l = textureGrad(uW, w, gx, gy) * uWMix.x;
    if (uWMix.y > 0.0) l += textureGrad(uWO, w, gx, gy) * uWMix.y;
    l *= e;
    c = l.rgb + c * (1.0 - l.a);
    // The lobule drawn live (lobule-live.js) in the share uLive: (1 − u)·(bitmap over the surround) + u·(live over it), the same as
    // mixing the two pictures before laying them, as over is linear in the top picture.
    if (uLive > 0.0) { vec4 ls = liveTissue(w) * e; c = mix(c, ls.rgb + c0 * (1.0 - ls.a), uLive); }
  }
  float s = clamp((length(p - uO) - uFade.x) / max(uFade.y - uFade.x, 1e-6), 0.0, 1.0);
  float a = s < 0.5 ? uMid * s * 2.0 : uMid + (1.0 - uMid) * (s - 0.5) * 2.0;
  o = vec4(mix(c, uBg, a), 1.0);
}`;

export function createTissueGL(canvas) {
  let gl = null;
  try { gl = canvas.getContext('webgl2', { alpha: false, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, failIfMajorPerformanceCaveat: true }); } catch { gl = null; }
  if (!gl) return null;
  // The program is started here and published once the driver has finished it (gl-compile.js); a draw that comes first publishes it.
  let started;
  try { started = startProgram(gl, VS, FS, [['p', 0]]); } catch (err) { console.warn('The lobule tissue falls back to the 2D canvas.', err); gl.getExtension('WEBGL_lose_context')?.loseContext(); return null; }
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // one triangle over the whole canvas
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
  // (A 1 px clear texture for a bitmap or tile not given: every sampler is bound to something.)
  const none = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, none);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  // (One level and a mipmap filter would leave it incomplete, and an incomplete texture reads opaque black.)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => { lost = true; texs.clear(); liveTex = null; e.preventDefault?.(); });
  let prog = null, U = null, failed = false, liveTex = null;   // (liveTex: the lobule's shapes on the GPU, for the shape liveTex.for)
  // Reads the finished program, sets its samplers and runs one small offscreen draw, so the first real draw has no driver work left.
  function publish() {
    if (prog || failed || lost) return;
    try {
      prog = checkProgram(gl, started);
      U = Object.fromEntries(['uQA', 'uQB', 'uQO', 'uW', 'uWO', 'uMix', 'uQOld', 'uO', 'uRd', 'uH', 'uRect', 'uWMix', 'uFade', 'uMid', 'uBg', 'uGrey'].map((n) => [n, gl.getUniformLocation(prog, n)]));
      for (const n of ['uLC', 'uLB', 'uLI', 'uLBox', 'uLN', 'uLEdge', 'uLCtr', 'uLCen', 'uLSt', 'uLGap', 'uLGap55', 'uLBase', 'uLNut', 'uLZ1', 'uLZ2', 'uLZ3', 'uLPlate', 'uLInk', 'uLZl', 'uLive', 'uLS', 'uLK', 'uLSin', 'uLFib', 'uLKB', 'uLShd', 'uLShade', 'uLHs', 'uLHB', 'uLHN']) U[n] = gl.getUniformLocation(prog, n);   // (the lobule drawn live, lobule-live.js)
      gl.useProgram(prog);
      gl.uniform1i(U.uQA, 0); gl.uniform1i(U.uQB, 1); gl.uniform1i(U.uQO, 2); gl.uniform1i(U.uW, 3); gl.uniform1i(U.uWO, 4);
      gl.uniform1i(U.uLC, LIVE_UNIT); gl.uniform1i(U.uLB, LIVE_UNIT + 1); gl.uniform1i(U.uLI, LIVE_UNIT + 2); gl.uniform1i(U.uLS, LIVE_UNIT + 3); gl.uniform1i(U.uLK, LIVE_UNIT + 4);   // (the lobule's shapes, lobule-live.js)
      exerciseDraw(gl, () => gl.drawArrays(gl.TRIANGLES, 0, 3));
    } catch (err) { failed = true; console.warn('The lobule tissue falls back to the 2D canvas.', err); gl.getExtension('WEBGL_lose_context')?.loseContext(); }
  }
  publishWhenDone(gl, [started], publish);
  // A canvas's texture, sent again only when the canvas was painted again (ver, the caller's count of its paints) or resized.
  // Tiles repeat; the lobule's bitmap is premultiplied (as the 2D canvas lays it) and stops at its edges.
  const texs = new Map(), SCRATCH = 7, LIVE_UNIT = 8;
  function texFor(cv, ver, tile) {
    let t = texs.get(cv);
    if (t && t.w === cv.width && t.h === cv.height && t.ver === ver) return t.tex;
    if (!t) { t = { tex: gl.createTexture() }; texs.set(cv, t); }
    gl.activeTexture(gl.TEXTURE0 + SCRATCH);   // (a unit no draw uses, so sending a canvas never replaces a texture already bound for the frame)
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !tile);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    const wrap = tile ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    Object.assign(t, { w: cv.width, h: cv.height, ver });
    return t.tex;
  }
  // The lobule's shapes (lobule-live.js buildLive) as float textures, sent once per shape. NEAREST and texelFetch: no filtering.
  function liveFor(shape, data) {
    if (liveTex && liveTex.for === shape) return liveTex;
    if (liveTex) for (const t of liveTex.t) gl.deleteTexture(t);
    const make = (unit, fmt, base, w, h, arr) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, fmt, w, h, 0, base, gl.FLOAT, arr);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    liveTex = { for: shape, data, t: [
      make(LIVE_UNIT, gl.RGBA32F, gl.RGBA, CELLS_PER_ROW * 3, data.cellRows, data.cellData),
      make(LIVE_UNIT + 1, gl.RGBA32F, gl.RGBA, data.nb, data.nb, data.bins),
      make(LIVE_UNIT + 2, gl.R32F, gl.RED, IDX_ROW, data.idxRows, data.idx),
      make(LIVE_UNIT + 3, gl.RGBA32F, gl.RGBA, SEG_ROW * 2, data.segRows, data.segData),
      make(LIVE_UNIT + 4, gl.RGBA32F, gl.RGBA, K_ROW, 1, new Float32Array(K_ROW * 4)),   // (the per-state texels: sent by liveDyn)
    ], dyn: null };
    return liveTex;
  }
  // The per-state texels (lobule-live.js buildDyn), sent again only when they changed.
  function liveDyn(T, dyn) {
    if (T.dyn === dyn) return;
    gl.activeTexture(gl.TEXTURE0 + LIVE_UNIT + 4); gl.bindTexture(gl.TEXTURE_2D, T.t[4]);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, K_ROW, dyn.rows, 0, gl.RGBA, gl.FLOAT, dyn.k);
    T.dyn = dyn;
  }
  return {
    get lost() { return lost || failed || gl.isContextLost(); },
    /** Sends a canvas to the GPU now (painted ahead, so no frame of a gesture waits for it). */
    upload(cv, ver = 0, tile = false) { if (!this.lost && cv?.width) texFor(cv, ver, tile); },
    /** A bitmap painted off the page (the tissue worker, tissue-worker.js) and sent in tiles, a few a frame: begin(cv) makes the
     *  canvas's texture at its size, put(cv, x, y, bmp) lays one tile (an ImageBitmap, premultiplied as the canvas's own upload is),
     *  done(cv, ver) builds its mipmaps. From then on it is the canvas's texture for that version, as if sent from the canvas (texFor);
     *  until then a draw of the canvas would send it whole, so a texture half laid is never sampled. */
    begin(cv) {
      if (this.lost || !cv?.width) return;
      let t = texs.get(cv);
      if (!t) { t = { tex: gl.createTexture() }; texs.set(cv, t); }
      gl.activeTexture(gl.TEXTURE0 + SCRATCH);
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cv.width, cv.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      Object.assign(t, { w: cv.width, h: cv.height, ver: NaN });
    },
    put(cv, x, y, bmp) {
      const t = texs.get(cv);
      if (this.lost || !t || t.w !== cv.width || t.h !== cv.height) return;
      gl.activeTexture(gl.TEXTURE0 + SCRATCH);
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
    },
    done(cv, ver) {
      const t = texs.get(cv);
      if (this.lost || !t || t.w !== cv.width || t.h !== cv.height) return;
      gl.activeTexture(gl.TEXTURE0 + SCRATCH);
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.generateMipmap(gl.TEXTURE_2D);
      t.ver = ver;
    },
    /** Gives back every texture whose canvas was given back (width 0) or is no longer wanted (keep(cv) false). */
    sweep(keep = () => true) {
      for (const [cv, t] of texs) if (!cv.width || !keep(cv)) { if (!lost) gl.deleteTexture(t.tex); texs.delete(cv); }
    },
    /** One frame of the tissue. W, H: the canvas's size (device px); qa, qb, mix: the quiet tiles' canvases and the blend; qo, qOld:
     *  the last state's tile and how much of it is left; w, wVer, wo, woVer, wMix: the bitmap, the last state's, the new one's share;
     *  rect: [x, y, side] of the bitmap; ox, oy, rd: the lobule's centre and radius; fade: [r0, r1]; mid: FADE_MID; bg: [r, g, b];
     *  grey: the surround's grade [saturation, opacity] (surroundGrade), null as drawn; live: the lobule drawn by the shader in a share
     *  of the picture, null for none (lobule-live.js): { shape, data (buildLive), share, cu, sj, zones, dark, cen: [x, y, R], col (liveColours) }. */
    draw({ W, H, qa, qb, mix, qo = null, qOld = 0, w, wVer, wo = null, woVer = 0, wMix = 1, rect, ox, oy, rd, fade, mid, bg, live = null, grey = null }) {
      publish();
      if (this.lost) return false;
      // (A tile given back, or a zero-sized canvas, would be sampled as black: the 2D canvas draws this frame instead.)
      if (!qa?.width || (qb && !qb.width)) return false;
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      gl.viewport(0, 0, W, H);
      gl.useProgram(prog);
      const bind = (unit, tex) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); };
      bind(0, texFor(qa, 0, true)); bind(1, qb ? texFor(qb, 0, true) : texFor(qa, 0, true));
      bind(2, qo && qOld > 0 ? texFor(qo, 0, true) : none);
      bind(3, w?.width ? texFor(w, wVer, false) : none);
      const old = wo?.width && wMix < 1;
      bind(4, old ? texFor(wo, woVer, false) : none);
      gl.uniform1f(U.uMix, qb ? mix : 0); gl.uniform1f(U.uQOld, qo ? qOld : 0);
      gl.uniform2f(U.uO, ox, oy); gl.uniform1f(U.uRd, rd); gl.uniform1f(U.uH, H);
      gl.uniform3f(U.uRect, rect[0], rect[1], Math.max(rect[2], 1e-6));
      gl.uniform2f(U.uWMix, old ? wMix : 1, old ? 1 - wMix : 0);
      gl.uniform2f(U.uFade, fade[0], fade[1]); gl.uniform1f(U.uMid, mid);
      gl.uniform3f(U.uBg, bg[0], bg[1], bg[2]);
      gl.uniform2f(U.uGrey, grey ? grey[0] : 1, grey ? grey[1] : 1);
      if (live && live.share > 0) {
        const T = liveFor(live.shape, live.data), D = live.data, C = live.col;
        T.t.forEach((t, i) => { gl.activeTexture(gl.TEXTURE0 + LIVE_UNIT + i); gl.bindTexture(gl.TEXTURE_2D, t); });
        gl.uniform3f(U.uLBox, D.box[0], D.box[1], D.box[2]); gl.uniform2f(U.uLN, D.nb, BIN);
        gl.uniform3fv(U.uLEdge, D.edges); gl.uniform2f(U.uLCtr, D.ctr[0], D.ctr[1]);
        gl.uniform4f(U.uLCen, live.cen[0], live.cen[1], live.cen[2], live.dark ? 1 : 0);
        gl.uniform4f(U.uLSt, live.cu, live.sj, live.zones ? 1 : 0, 0);
        gl.uniform3fv(U.uLGap, C.gap); gl.uniform3fv(U.uLGap55, C.gap55); gl.uniform3fv(U.uLBase, C.base);
        gl.uniform3fv(U.uLNut, C.nut); gl.uniform3fv(U.uLZ1, C.z1); gl.uniform3fv(U.uLZ2, C.z2); gl.uniform3fv(U.uLZ3, C.z3);
        gl.uniform4fv(U.uLPlate, C.plate); gl.uniform4fv(U.uLInk, C.ink); gl.uniform4fv(U.uLZl, C.zl);
        liveDyn(T, live.dyn);
        const F = live.fib, ac = { fibSin: F.fibSin, act: F.actV };   // (liveFibre: the sinusoid collagen's and the stellate cells' strengths)
        gl.uniform4f(U.uLSin, C.dis[0], C.dis[1], C.dis[2], 0.75 * ac.fibSin * F.sin); gl.uniform4f(U.uLFib, ac.fibSin, live.dyn.margin, 0, 0);
        gl.uniform4f(U.uLKB, live.dyn.nItems ? live.dyn.nk : 0, 32, live.dyn.bOff, live.dyn.iOff);
        gl.uniform4f(U.uLShd, C.shd[0], C.shd[1], C.shd[2], C.shd[3]); gl.uniform4f(U.uLShade, C.shade[0], C.shade[1], C.shade[2], 1);
        gl.uniform4f(U.uLHs, F.act > 0 ? live.dyn.nH : 0, ac.act, live.rs0, live.dyn.hOff);
        gl.uniform4f(U.uLHB, C.body[0], C.body[1], C.body[2], (0.22 + 0.3 * ac.act) * F.act);
        gl.uniform4f(U.uLHN, C.nuc[0], C.nuc[1], C.nuc[2], (0.3 + 0.3 * ac.act) * F.act);
        gl.uniform1f(U.uLive, live.share);
      } else gl.uniform1f(U.uLive, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return true;
    },
  };
}
