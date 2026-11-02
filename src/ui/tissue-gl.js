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
// Without WebGL2 (or once the context is lost) createTissueGL returns null / reports lost, and the tissue is not drawn until the
// context is back: there is no 2D drawing of it (1 Nov 2026, nothing off the GPU). A software renderer draws it too.

import { startProgram, checkProgram, exerciseDraw, publishWhenDone, compileDone, SHADER_WARM } from './gl-compile.js?v=5096509185';
import { TILE_OVER, sendCanvas, SEND_RETRY } from './field-gl.js?v=c2033d32e0';
import { isTileCopy, createTileCopier } from './tile-gl.js?v=707c7f2df9';
import { isGpuPicture, paintGL } from './paint-gl.js?v=01a776d883';
import { LIVE_FS, CELLS_PER_ROW, IDX_ROW, SEG_ROW, K_ROW, BIN, panShift, panPlan } from './lobule-live.js?v=b585d4fb63';
import { fbComplete } from './gl-state.js?v=fb0dea79ba';

const VS = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
export const tissueVS = VS;   // (for the shader lint in the unit tests)

// Mirrors paintTissue's 2D passes: the quiet surround (its pattern puts one repeat, two lobules wide and two high, per 6 rd by
// 2√3 rd device px, the lobule's centre at uO), the lobule's bitmap over it (premultiplied, mixed with the last state's while a
// new one fades in), then the fade into the page from r0 (clear) through FADE_MID halfway to whole at r1 and past it.
// (A tile laid over the page's colour by its own alpha: the same picture for an opaque tile, the page's colour, not black, for one the
// browser could not give memory to. See field-gl.js TILE_OVER; ?tileover=0 reads the rgb alone, as before.)
const Q = (over, s) => (over ? `over(texture(${s}, uv))` : `texture(${s}, uv).rgb`);
// The dive and the rise on the GPU (?divegpu=0: their copies made from the 2D canvas, as before). While the zoom scales the lobule's
// layers down, the screen's picture would show its surround as a pale card: so past the lobule's rim the picture is cleared (opaque to
// DIVE_RIM.solid of the radius, gone by DIVE_RIM.clear), and only the lobule's own layer (the bitmap, and its live share) is kept whole
// there, its portal tracts and the corners' triads reaching past the rim. The same picture as the 2D copy (lobule-zoom.js diveCopy):
// the tissue × the fade, plus the lobule's own layer × the rest, premultiplied. Drawn once as the zoom starts; the compositor scales it.
export const DIVE_GPU = !(typeof location !== 'undefined' && /[?&]divegpu=0\b/.test(location.search || ''));
export const tissueFS = (live, over = TILE_OVER, rim = DIVE_GPU) => `#version 300 es
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
uniform vec2 uGrey;                          // the surround's grade in a lens other than Pressure: saturation, opacity (1, 1: as drawn)${rim ? `
uniform vec4 uRim;                           // the dive's rim: centre (device px), solid to clear radii (w 0: none)` : ''}
out vec4 o;${live ? '\n' + LIVE_FS : ''}${over ? '\nvec3 over(vec4 t) { return t.rgb * t.a + uBg * (1.0 - t.a); }' : ''}
void main() {
  vec2 p = vec2(gl_FragCoord.x, uH - gl_FragCoord.y);
  vec2 uv = (p - uO) / (uRd * vec2(6.0, 3.4641016151377544));
  vec3 c = mix(${Q(over, 'uQA')}, ${Q(over, 'uQB')}, uMix);
  if (uQOld > 0.0) c = mix(c, ${Q(over, 'uQO')}, uQOld);
  // Grey as the anatomy's liver is in this lens (lobule-look.js surroundGrade): toward its luma, then toward the page. Only the surround:
  // the lobule's bitmap, laid over it next, keeps the lens's colours.
  if (uGrey.x < 1.0 || uGrey.y < 1.0) c = mix(uBg, mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, uGrey.x), uGrey.y);
${rim ? '  vec4 own = vec4(0.0);   // (the lobule\'s own layer, for the rim)\n' : ''}  vec2 w = (p - uRect.xy) / uRect.z;${live ? '\n  vec3 c0 = c;' : ''}
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
    c = l.rgb + c * (1.0 - l.a);${rim ? '\n    own = l;' : ''}${live ? `
    // The lobule drawn live (lobule-live.js) in the share uLive: (1 − u)·(bitmap over the surround) + u·(live over it), the same as
    // mixing the two pictures before laying them, as over is linear in the top picture.
    if (uLive > 0.0) { vec4 ls = liveTissue(w) * e; c = mix(c, ls.rgb + c0 * (1.0 - ls.a), uLive);${rim ? ' own = mix(own, ls, uLive);' : ''} }` : ''}
  }
  float s = clamp((length(p - uO) - uFade.x) / max(uFade.y - uFade.x, 1e-6), 0.0, 1.0);
  float a = s < 0.5 ? uMid * s * 2.0 : uMid + (1.0 - uMid) * (s - 0.5) * 2.0;
  o = vec4(mix(c, uBg, a), 1.0);${rim ? `
  if (uRim.w > 0.0) { float f = clamp((uRim.w - length(p - uRim.xy)) / max(uRim.w - uRim.z, 1e-6), 0.0, 1.0); o = o * f + own * (1.0 - f); }` : ''}
}`;

/** opts.onLive(): called once the program that draws the lobule live has been published (liveReady() is true) or has failed (it never
 *  will be); the caller then asks again. */
export function createTissueGL(canvas, opts = {}) {
  let gl = null;
  // Hosted (opts.host: { gl, canvas, under }, the lobule's vessel renderer's top, veins-gl.js; LZ_ONE): no context of its own. Each frame is
  // drawn into a picture of its own (hostT) in the host's context, and laid on the host's canvas under the vessels at each of its presents
  // (under). The owner makes it again with the renderer it makes after a lost context.
  const host = opts.host || null;
  if (host) { gl = host.gl; canvas = host.canvas; }
  else
  // (See-through, not opaque: every pixel is drawn whole (alpha 1), so the picture is the same, but a frame in which the browser has no
  // picture for the canvas (its context taken back, or its buffer let go before a frame was drawn) shows the page through it, where an
  // opaque canvas showed solid black over the whole lobule and its surround, until the next draw (Mohammad, 31 Oct and 1 Nov: the
  // hepatocytes and the background all went black while zooming).)
  // (On a software renderer too, as the lobule's vessels are (veins-gl.js force): the tissue has no other drawing; nothing is drawn on a
  // 2D canvas.)
  try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, failIfMajorPerformanceCaveat: false }); } catch { gl = null; }
  if (!gl) return null;
  // (Hosted, the picture's own target, sized to each frame; tgt: the size it holds (the canvas itself, on a context of its own); scr():
  // the framebuffer a frame ends in, null for the canvas.)
  let hostT = null;
  const tgt = host ? { width: 0, height: 0 } : canvas;
  const scr = () => (hostT ? hostT.fbo : null);
  paintGL(gl);   // (the painter of the lobule's picture, paint-gl.js: its programs start compiling now, beside the tissue's)
  // The program is started here and published once the driver has finished it (gl-compile.js); a draw that comes first publishes it.
  // This one is the tissue as it was before the shader drew any of the lobule: the bitmap over the surround, nothing of lobule-live.js
  // in it. The program that also draws the lobule live is a second one (tissueFS(true)), started by the first liveReady() (the caller
  // asks as soon as this exists), so a live program that fails to compile leaves this one working: the lobule keeps its painted
  // picture, and the bitmap alone is drawn by this program wherever the zoom gives the shader no share.
  let started;
  try { started = startProgram(gl, VS, tissueFS(false), [['p', 0]]); } catch (err) { console.warn('The lobule tissue falls back to the 2D canvas.', err); if (!host) gl.getExtension('WEBGL_lose_context')?.loseContext(); return null; }
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // one triangle over the whole canvas
  // (Hosted, in a context whose own passes bind vertex arrays of their own: one of its own, bound for each of its draws.)
  const vao = host ? gl.createVertexArray() : null;
  if (vao) gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  if (vao) { gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null); }
  gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
  // (A 1 px clear texture for a bitmap or tile not given: every sampler is bound to something.)
  const none = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, none);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  // (One level and a mipmap filter would leave it incomplete, and an incomplete texture reads opaque black.)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  let lost = false, pictured = false;   // (pictured: the canvas holds a frame at its present size, drawn by draw)
  if (!host) canvas.addEventListener('webglcontextlost', (e) => { lost = true; pictured = false; texs.clear(); liveTex = null; pic = null; e.preventDefault?.(); });
  // (Hosted: the context as the host's own passes expect to find it, after each of this one's calls.)
  function hostDone() {
    if (!host) return;
    gl.useProgram(null); gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    for (let u = 0; u <= 12; u++) { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, null); }   // (the tiles and bitmaps, SCRATCH and the live shapes: units 0–12)
    gl.activeTexture(gl.TEXTURE0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.disable(gl.SCISSOR_TEST); gl.disable(gl.BLEND);
  }
  let prog = null, U0 = null, failed = false, liveTex = null;   // (liveTex: the lobule's shapes on the GPU, for the shape liveTex.for)
  const COMMON_U = ['uQA', 'uQB', 'uQO', 'uW', 'uWO', 'uMix', 'uQOld', 'uO', 'uRd', 'uH', 'uRect', 'uWMix', 'uFade', 'uMid', 'uBg', 'uGrey', ...(DIVE_GPU ? ['uRim'] : [])];
  const LIVE_U = ['uLC', 'uLB', 'uLI', 'uLBox', 'uLN', 'uLEdge', 'uLCtr', 'uLCen', 'uLSt', 'uLGap', 'uLGap55', 'uLBase', 'uLNut', 'uLZ1', 'uLZ2', 'uLZ3', 'uLPlate', 'uLInk', 'uLZl', 'uLive', 'uLS', 'uLK', 'uLSin', 'uLFib', 'uLKB', 'uLShd', 'uLShade', 'uLHs', 'uLHB', 'uLHN'];   // (the lobule drawn live, lobule-live.js)
  const locate = (p, names) => Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)]));
  // Reads the finished program, sets its samplers and runs one small offscreen draw, so the first real draw has no driver work left.
  function publish() {
    if (prog || failed || lost) return;
    try {
      prog = checkProgram(gl, started);
      U0 = locate(prog, COMMON_U);
      gl.useProgram(prog);
      gl.uniform1i(U0.uQA, 0); gl.uniform1i(U0.uQB, 1); gl.uniform1i(U0.uQO, 2); gl.uniform1i(U0.uW, 3); gl.uniform1i(U0.uWO, 4);
      if (vao) gl.bindVertexArray(vao);
      exerciseDraw(gl, () => gl.drawArrays(gl.TRIANGLES, 0, 3));
    } catch (err) { failed = true; console.warn('The lobule tissue falls back to the 2D canvas.', err); if (!host) gl.getExtension('WEBGL_lose_context')?.loseContext(); }
    hostDone();
  }
  publishWhenDone(gl, [started], publish);
  // The program that also draws the lobule live: started the first time liveReady() is asked,
  // published like the first, and used only by draws that carry a live share. If it fails, only the live drawing is lost: liveReady()
  // stays false, the first program keeps drawing the bitmap, and the caller is told (opts.onLive) so it stops waiting.
  let liveStarted = null, liveP = null, liveFailed = false;
  function startLive() {
    if (liveStarted || liveFailed || failed || lost) return;
    try { liveStarted = startProgram(gl, VS, tissueFS(true), [['p', 0]]); } catch (err) { liveFailed = true; console.warn('The lobule cannot be drawn live; it keeps its painted picture.', err); return; }
    publishWhenDone(gl, [liveStarted], publishLive);
  }
  function publishLive() {
    if (liveP || liveFailed || failed || lost) return;
    try {
      const p = checkProgram(gl, liveStarted), L = locate(p, [...COMMON_U, ...LIVE_U]);
      gl.useProgram(p);
      gl.uniform1i(L.uQA, 0); gl.uniform1i(L.uQB, 1); gl.uniform1i(L.uQO, 2); gl.uniform1i(L.uW, 3); gl.uniform1i(L.uWO, 4);
      gl.uniform1i(L.uLC, LIVE_UNIT); gl.uniform1i(L.uLB, LIVE_UNIT + 1); gl.uniform1i(L.uLI, LIVE_UNIT + 2); gl.uniform1i(L.uLS, LIVE_UNIT + 3); gl.uniform1i(L.uLK, LIVE_UNIT + 4);   // (the lobule's shapes, lobule-live.js)
      if (vao) gl.bindVertexArray(vao);
      exerciseDraw(gl, () => gl.drawArrays(gl.TRIANGLES, 0, 3));
      liveP = { prog: p, U: L };
    } catch (err) { liveFailed = true; console.warn('The lobule cannot be drawn live; it keeps its painted picture.', err); }
    hostDone();
    try { opts.onLive?.(); } catch (err) { console.warn(err); }
  }
  // A canvas's texture, sent again only when the canvas was painted again (ver, the caller's count of its paints) or resized.
  // Tiles repeat; the lobule's bitmap is premultiplied (as the 2D canvas lays it) and stops at its edges.
  const texs = new Map(), SCRATCH = 7, LIVE_UNIT = 8, copier = createTileCopier(gl);
  function texFor(cv, ver, tile) {
    let t = texs.get(cv);
    if (t && t.w === cv.width && t.h === cv.height && t.ver === ver) return t.tex;
    // (A send that failed (field-gl.js sendCanvas): the 2D canvas draws, and the send is tried again only after a while.)
    if (t?.bad && t.w === cv.width && t.h === cv.height && t.badVer === ver && performance.now() < t.retryAt) return null;
    // (The lobule's picture recorded by paint-gl.js: painted here on the GPU, into its own texture, mipmapped; never a canvas.)
    if (isGpuPicture(cv)) {
      if (t) gl.deleteTexture(t.tex);
      gl.activeTexture(gl.TEXTURE0 + SCRATCH);
      const tex = paintGL(gl).paint(cv.rec);
      if (!tex) { texs.set(cv, { tex: gl.createTexture(), w: cv.width, h: cv.height, ver: NaN, bad: true, badVer: ver, retryAt: performance.now() + SEND_RETRY }); return null; }
      texs.set(cv, { tex, w: cv.width, h: cv.height, ver, bad: false });
      return tex;
    }
    // (A copy of a tile made here on the GPU, tile-gl.js: drawn into its own texture from the tile, never sent from a canvas.)
    if (isTileCopy(cv)) {
      if (t) gl.deleteTexture(t.tex);
      gl.activeTexture(gl.TEXTURE0 + SCRATCH);
      const tex = copier.make(cv);
      copier.drop();   // (the surround needs one copy of each tile: the tile itself is not kept on the GPU)
      if (!tex) { texs.set(cv, { tex: gl.createTexture(), w: cv.width, h: cv.height, ver: NaN, bad: true, badVer: ver, retryAt: performance.now() + SEND_RETRY }); return null; }
      texs.set(cv, { tex, w: cv.width, h: cv.height, ver, bad: false });
      return tex;
    }
    if (!t) { t = { tex: gl.createTexture() }; texs.set(cv, t); }
    gl.activeTexture(gl.TEXTURE0 + SCRATCH);   // (a unit no draw uses, so sending a canvas never replaces a texture already bound for the frame)
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !tile);
    const sent = sendCanvas(gl, cv);
    const wrap = tile ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    if (!sent) { Object.assign(t, { w: cv.width, h: cv.height, ver: NaN, bad: true, badVer: ver, retryAt: performance.now() + SEND_RETRY }); return null; }
    Object.assign(t, { w: cv.width, h: cv.height, ver, bad: false });
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
  // The kept picture (a pan of the lobule drawn live). The live shader is the costly one, and a pan of a whole number of device px moves
  // every pixel of the picture by that number and changes nothing else (the surround, the bitmap, the live lobule and the fade into
  // the page are all functions of where the pixel lies against the lobule's centre and the bitmap's corner, which move together). So a
  // frame drawn live is drawn into a texture of its own and copied to the canvas, and the next frame, when nothing but such a move
  // has changed, is that texture copied again, shifted, with only the strips the move uncovers drawn live: an exact copy of
  // pixels (a blit, no filtering), not a resampling, so it is the picture the shader would draw. Any other change, or a move
  // by a fraction of a pixel, is drawn live in full, so nothing is ever approximate. Only live frames are kept; the bitmap program
  // draws straight to the canvas as ever. ?tissuekeep=0 turns it off.
  let keepOff = typeof location !== 'undefined' && /[?&]tissuekeep=0\b/.test(location.search || '');
  let pic = null;   // { cur, spare, W, H, sig, ref }: cur holds the kept picture; spare is the other of the pair, made at the first pan
  const keepStats = { full: 0, shifted: 0, still: 0 };
  function makeTarget(w, h) {
    const tex = gl.createTexture(), fbo = gl.createFramebuffer();
    gl.activeTexture(gl.TEXTURE0 + SCRATCH);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = fbComplete(gl, gl.FRAMEBUFFER, 'rgba8', w, h);   // (asked once per layout and context generation: gl-state.js)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);   // (not left bound on a unit: the target is only ever drawn into and copied from)
    return { tex, fbo, ok };
  }
  const freeTarget = (t) => { if (t) { gl.deleteFramebuffer(t.fbo); gl.deleteTexture(t.tex); } };
  function dropKept() { if (pic) { if (!lost) { freeTarget(pic.cur); freeTarget(pic.spare); } pic = null; } }
  // Copies a rectangle [x, y, w, h] of one target to [x, y, w, h] of another (dst null: the canvas), pixel for pixel.
  function blit(src, dst, s, d) {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst ? dst.fbo : null);
    gl.blitFramebuffer(s[0], s[1], s[0] + s[2], s[1] + s[3], d[0], d[1], d[0] + d[2], d[1] + d[3], gl.COLOR_BUFFER_BIT, gl.NEAREST);
  }
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i] || (v !== v && b[i] !== b[i]));
  // The live program is in use and its uniforms are set: draw the frame (sig: everything the frame is made from except where it lies;
  // pos: the lobule's centre and the bitmap's corner, device px).
  function drawLive(W, H, sig, pos) {
    const tri = () => gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (keepOff || (host ? tgt.width !== W || tgt.height !== H : gl.drawingBufferWidth !== W || gl.drawingBufferHeight !== H)) { dropKept(); tri(); return; }
    if (pic && (pic.W !== W || pic.H !== H)) dropKept();
    const full = [0, 0, W, H];
    if (pic && same(pic.sig, sig)) {
      const d = panShift(pic.ref, pos), plan = d && panPlan(W, H, d[0], d[1]);
      if (plan && !d[0] && !d[1]) {   // (nothing moved: the kept picture as it is)
        blit(pic.cur, hostT, full, full); gl.bindFramebuffer(gl.FRAMEBUFFER, scr()); keepStats.still++;
        return;
      }
      if (plan) {
        if (!pic.spare) { pic.spare = makeTarget(W, H); if (!pic.spare.ok) { keepOff = true; dropKept(); tri(); return; } }
        const B = pic.spare;
        blit(pic.cur, B, plan.src, plan.dst);
        gl.bindFramebuffer(gl.FRAMEBUFFER, B.fbo);
        gl.enable(gl.SCISSOR_TEST);
        for (const [x, y, w, h] of plan.strips) { gl.scissor(x, y, w, h); tri(); }
        gl.disable(gl.SCISSOR_TEST);
        blit(B, hostT, full, full);
        gl.bindFramebuffer(gl.FRAMEBUFFER, scr());
        pic.spare = pic.cur; pic.cur = B;
        pic.ref = [pic.ref[0] + d[0], pic.ref[1] + d[1], pic.ref[2] + d[0], pic.ref[3] + d[1]];   // (what its pixels are drawn for: whole steps from the last full frame, so no error builds up)
        keepStats.shifted++;
        return;
      }
    }
    if (!pic) { const a = makeTarget(W, H); if (!a.ok) { keepOff = true; freeTarget(a); tri(); return; } pic = { cur: a, spare: null, W, H, sig: null, ref: null }; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, pic.cur.fbo);
    tri();
    blit(pic.cur, hostT, full, full);
    gl.bindFramebuffer(gl.FRAMEBUFFER, scr());
    pic.sig = sig; pic.ref = pos.slice();
    keepStats.full++;
  }
  // Everything a live frame is made from but where it lies (compared with the last one's: the same numbers, the same textures).
  function liveSig(W, H, a, live) {
    const cv = (c) => (c ? [c, c.width, c.height] : [null, 0, 0]);
    return [...(a.rim || []), W, H, ...cv(a.qa), ...cv(a.qb), a.mix, ...cv(a.qo), a.qOld, ...cv(a.w), a.wVer, ...cv(a.wo), a.woVer, a.wMix, a.rect[2], a.rd, a.fade[0], a.fade[1], a.mid,
      a.bg[0], a.bg[1], a.bg[2], a.grey ? a.grey[0] : 1, a.grey ? a.grey[1] : 1, live.shape, live.data, live.dyn,
      JSON.stringify([live.share, live.cu, live.sj, live.zones, live.dark, live.cen, live.rs0, live.fib, live.col])];
  }
  hostDone();
  return {
    get lost() { return lost || failed || gl.isContextLost(); },
    /** How many live frames were drawn in full, as a shifted copy of the last (with only the strips the move uncovered drawn), or as
     *  the last again. */
    get kept() { return { ...keepStats }; },
    /** Whether the lobule can be drawn live now: the program for it is published. The first ask starts its compile; opts.onLive is
     *  called when it is done, either way. False for good if it failed. */
    liveReady() { startLive(); return !!liveP && !this.lost; },
    /** Sends a canvas to the GPU now (painted ahead, so no frame of a gesture waits for it). */
    upload(cv, ver = 0, tile = false) { if (!this.lost && cv?.width) { texFor(cv, ver, tile); hostDone(); } },
    /** Gives back every texture whose canvas was given back (width 0) or is no longer wanted (keep(cv) false). */
    sweep(keep = () => true) {
      for (const [cv, t] of texs) if (!cv.width || !keep(cv)) { if (!lost) gl.deleteTexture(t.tex); texs.delete(cv); }
      copier.sweep();
      if (!canvas.width) { dropKept(); if (hostT && !lost) { freeTarget(hostT); hostT = null; tgt.width = tgt.height = 0; pictured = false; } }   // (the canvas itself given back: the picture kept for it goes too)
      hostDone();
    },
    /** One frame of the tissue. W, H: the canvas's size (device px); qa, qb, mix: the quiet tiles' canvases and the blend; qo, qOld:
     *  the last state's tile and how much of it is left; w, wVer, wo, woVer, wMix: the bitmap, the last state's, the new one's share;
     *  rect: [x, y, side] of the bitmap; ox, oy, rd: the lobule's centre and radius; fade: [r0, r1]; mid: FADE_MID; bg: [r, g, b];
     *  grey: the surround's grade [saturation, opacity] (surroundGrade), null as drawn; live: the lobule drawn by the shader in a share
     *  of the picture, null for none (lobule-live.js): { shape, data (buildLive), share, cu, sj, zones, dark, cen: [x, y, R], col (liveColours) };
     *  rim: the dive's rim [x, y, r solid, r clear] (device px), past which only the lobule's own layer is kept (DIVE_GPU), null for none. */
    draw({ W, H, qa, qb, mix, qo = null, qOld = 0, w, wVer, wo = null, woVer = 0, wMix = 1, rect, ox, oy, rd, fade, mid, bg, live = null, grey = null, rim = null, hold = false }) {
      // (Published by the idle poll, long before a dive; a draw that comes first publishes it only once the driver says it is compiled, so
      // no frame waits on a compile: still compiling, the tissue keeps the frame it shows (hold, at this size) or the 2D canvas draws this one.
      // ?shaderwarm=0: published here whatever it costs, as before.)
      if (!prog && !failed && !lost && SHADER_WARM) {
        let ready;
        try { ready = compileDone(gl, [started]); } catch { ready = true; }
        if (!ready) return hold && pictured && tgt.width === W && tgt.height === H ? 'held' : false;
      }
      publish();
      if (this.lost) return false;
      // (A tile given back, or a zero-sized canvas, would be sampled as black: the 2D canvas draws this frame instead.)
      if (!qa?.width || (qb && !qb.width)) return false;
      // (Every texture first, before the canvas is touched: one the GPU could not take (null) is never sampled, which read opaque black.
      // With hold (the canvas showing) and the canvas already at this size with a picture, it keeps that picture for the frame: the
      // last frame stays on screen, untouched, and the send is tried again shortly (field-gl.js SEND_RETRY). Otherwise drawn on the GPU without it, below.)
      const old = wo?.width && wMix < 1;
      const tx = [texFor(qa, 0, true), qb ? texFor(qb, 0, true) : texFor(qa, 0, true), qo && qOld > 0 ? texFor(qo, 0, true) : none, w?.width ? texFor(w, wVer, false) : none, old ? texFor(wo, woVer, false) : none];
      if (tx.some((t) => !t)) {
        if (hold && pictured && tgt.width === W && tgt.height === H) { hostDone(); return 'held'; }
        // (No picture to keep: still drawn on the GPU, never stepped down to the 2D canvas. What did not go is the 1 px clear texture: a tile
        // laid over the page's colour by its alpha (TILE_OVER) shows the page's colour, a bitmap shows the surround under it, never black.)
        for (let i = 0; i < tx.length; i++) if (!tx[i]) tx[i] = none;
      }
      if (host) {
        if (!hostT || tgt.width !== W || tgt.height !== H) {
          if (hostT) freeTarget(hostT);
          hostT = makeTarget(W, H); tgt.width = W; tgt.height = H; pictured = false;
          if (!hostT.ok) { freeTarget(hostT); hostT = null; tgt.width = tgt.height = 0; hostDone(); return false; }
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, hostT.fbo); gl.bindVertexArray(vao);
        gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST); gl.disable(gl.DEPTH_TEST);
      } else if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; pictured = false; }
      gl.viewport(0, 0, W, H);
      // (With a share and the live program ready, the program that has the lobule's shapes in it; otherwise the first, which is the
      // bitmap over the surround and nothing else.)
      const isLive = !!(live && live.share > 0 && liveP), U = isLive ? liveP.U : U0;
      gl.useProgram(isLive ? liveP.prog : prog);
      const bind = (unit, tex) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); };
      tx.forEach((t, unit) => bind(unit, t));
      gl.uniform1f(U.uMix, qb ? mix : 0); gl.uniform1f(U.uQOld, qo ? qOld : 0);
      gl.uniform2f(U.uO, ox, oy); gl.uniform1f(U.uRd, rd); gl.uniform1f(U.uH, H);
      gl.uniform3f(U.uRect, rect[0], rect[1], Math.max(rect[2], 1e-6));
      gl.uniform2f(U.uWMix, old ? wMix : 1, old ? 1 - wMix : 0);
      gl.uniform2f(U.uFade, fade[0], fade[1]); gl.uniform1f(U.uMid, mid);
      gl.uniform3f(U.uBg, bg[0], bg[1], bg[2]);
      gl.uniform2f(U.uGrey, grey ? grey[0] : 1, grey ? grey[1] : 1);
      if (DIVE_GPU) { const r = rim || [0, 0, 0, 0]; gl.uniform4f(U.uRim, r[0], r[1], r[2], r[3]); }
      if (isLive) {
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
      }
      if (isLive) drawLive(W, H, liveSig(W, H, { rim: DIVE_GPU && rim ? rim : null, qa, qb: qb || null, mix: qb ? mix : 0, qo: qo && qOld > 0 ? qo : null, qOld: qo ? qOld : 0, w: w?.width ? w : null, wVer, wo: old ? wo : null, woVer: old ? woVer : 0, wMix: old ? wMix : 1, rect, rd, fade, mid, bg, grey }, live), [ox, oy, rect[0], rect[1]]);
      else { dropKept(); gl.drawArrays(gl.TRIANGLES, 0, 3); }
      pictured = true;
      hostDone();
      return true;
    },
    /** Hosted: whether there is a picture to lay (the last frame drawn), and laying it on the host's canvas from its top left, pixel
     *  for pixel (the host's present, under its own picture). */
    get pictured() { return pictured && !!hostT; },
    under(k = 1) {
      if (!hostT || !pictured || lost || gl.isContextLost()) return;
      // (k: the host canvas's pixels per this picture's, 0.5 where the vessels draw at half density on a software renderer: the picture
      // then filtered down onto the same place. A host canvas larger than the picture (a wide copy's tile, cropped from it) gets it in its top left.)
      const ch = canvas.height, dw = Math.round(tgt.width * k), dh = Math.round(tgt.height * k);
      gl.disable(gl.SCISSOR_TEST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, hostT.fbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.blitFramebuffer(0, 0, tgt.width, tgt.height, 0, ch - dh, dw, ch, gl.COLOR_BUFFER_BIT, k === 1 ? gl.NEAREST : gl.LINEAR);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },
    /** Gives back the picture's own target (hosted), as the canvas's memory would be. */
    release() { dropKept(); if (hostT && !lost && !gl.isContextLost()) freeTarget(hostT); hostT = null; tgt.width = tgt.height = 0; pictured = false; },
    /** The context it draws in (its own, or the host's). */
    get gl() { return gl; },
  };
}
