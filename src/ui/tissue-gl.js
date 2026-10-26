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
void main() {
  vec2 p = vec2(gl_FragCoord.x, uH - gl_FragCoord.y);
  vec2 uv = (p - uO) / (uRd * vec2(6.0, 3.4641016151377544));
  vec3 c = mix(texture(uQA, uv).rgb, texture(uQB, uv).rgb, uMix);
  if (uQOld > 0.0) c = mix(c, texture(uQO, uv).rgb, uQOld);
  // Grey as the anatomy's liver is in this lens (lobule-look.js surroundGrade): toward its luma, then toward the page. Only the surround:
  // the lobule's bitmap, laid over it next, keeps the lens's colours.
  if (uGrey.x < 1.0 || uGrey.y < 1.0) c = mix(uBg, mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, uGrey.x), uGrey.y);
  vec2 w = (p - uRect.xy) / uRect.z;
  if (w.x >= 0.0 && w.y >= 0.0 && w.x <= 1.0 && w.y <= 1.0) {
    vec4 l = texture(uW, w) * uWMix.x;
    if (uWMix.y > 0.0) l += texture(uWO, w) * uWMix.y;
    c = l.rgb + c * (1.0 - l.a);
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
  canvas.addEventListener('webglcontextlost', (e) => { lost = true; texs.clear(); e.preventDefault?.(); });
  let prog = null, U = null, failed = false;
  // Reads the finished program, sets its samplers and runs one small offscreen draw, so the first real draw has no driver work left.
  function publish() {
    if (prog || failed || lost) return;
    try {
      prog = checkProgram(gl, started);
      U = Object.fromEntries(['uQA', 'uQB', 'uQO', 'uW', 'uWO', 'uMix', 'uQOld', 'uO', 'uRd', 'uH', 'uRect', 'uWMix', 'uFade', 'uMid', 'uBg', 'uGrey'].map((n) => [n, gl.getUniformLocation(prog, n)]));
      gl.useProgram(prog);
      gl.uniform1i(U.uQA, 0); gl.uniform1i(U.uQB, 1); gl.uniform1i(U.uQO, 2); gl.uniform1i(U.uW, 3); gl.uniform1i(U.uWO, 4);
      exerciseDraw(gl, () => gl.drawArrays(gl.TRIANGLES, 0, 3));
    } catch (err) { failed = true; console.warn('The lobule tissue falls back to the 2D canvas.', err); gl.getExtension('WEBGL_lose_context')?.loseContext(); }
  }
  publishWhenDone(gl, [started], publish);
  // A canvas's texture, sent again only when the canvas was painted again (ver, the caller's count of its paints) or resized.
  // Tiles repeat; the lobule's bitmap is premultiplied (as the 2D canvas lays it) and stops at its edges.
  const texs = new Map(), SCRATCH = 7;
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
  return {
    get lost() { return lost || failed || gl.isContextLost(); },
    /** Sends a canvas to the GPU now (painted ahead, so no frame of a gesture waits for it). */
    upload(cv, ver = 0, tile = false) { if (!this.lost && cv?.width) texFor(cv, ver, tile); },
    /** Gives back every texture whose canvas was given back (width 0) or is no longer wanted (keep(cv) false). */
    sweep(keep = () => true) {
      for (const [cv, t] of texs) if (!cv.width || !keep(cv)) { if (!lost) gl.deleteTexture(t.tex); texs.delete(cv); }
    },
    /** One frame of the tissue. W, H: the canvas's size (device px); qa, qb, mix: the quiet tiles' canvases and the blend; qo, qOld:
     *  the last state's tile and how much of it is left; w, wVer, wo, woVer, wMix: the bitmap, the last state's, the new one's share;
     *  rect: [x, y, side] of the bitmap; ox, oy, rd: the lobule's centre and radius; fade: [r0, r1]; mid: FADE_MID; bg: [r, g, b];
     *  grey: the surround's grade [saturation, opacity] (surroundGrade), null as drawn. */
    draw({ W, H, qa, qb, mix, qo = null, qOld = 0, w, wVer, wo = null, woVer = 0, wMix = 1, rect, ox, oy, rd, fade, mid, bg, grey = null }) {
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
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return true;
    },
  };
}
