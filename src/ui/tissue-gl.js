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

import { startProgram, checkProgram, exerciseDraw, publishWhenDone, compileDone } from './gl-compile.js';
import { sendCanvas, SEND_RETRY } from './field-gl.js';
import { isTileCopy, createTileCopier } from './tile-gl.js';
import { isGpuPicture, paintGL } from './paint-gl.js';
import { LIVE_FS, CELLS_PER_ROW, IDX_ROW, SEG_ROW, K_ROW, BIN, panShift, panPlan } from './lobule-live.js';
import { fbComplete } from './gl-state.js';
import { uniformCache } from './uniform-cache.js';

const VS = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
export const tissueVS = VS;   // (for the shader lint in the unit tests)

// Mirrors paintTissue's 2D passes: the quiet surround (its pattern puts one repeat, two lobules wide and two high, per 6 rd by
// 2√3 rd device px, the lobule's centre at uO), the lobule's bitmap over it (premultiplied, mixed with the last state's while a
// new one fades in), then the fade into the page from r0 (clear) through FADE_MID halfway to whole at r1 and past it.
// (A tile laid over the page's colour by its own alpha: the same picture for an opaque tile, the page's colour, not black, for one the
// browser could not give memory to. See field-gl.js.)
const Q = (s) => `over(texture(${s}, uv))`;   // alloc-rare: the shader source is built once, when the program is compiled
// The dive and the rise on the GPU. While the zoom scales the lobule's
// layers down, the screen's picture would show its surround as a pale card: so past the lobule's rim the picture is cleared (opaque to
// DIVE_RIM.solid of the radius, gone by DIVE_RIM.clear), and only the lobule's own layer (the bitmap, and its live share) is kept whole
// there, its portal tracts and the corners' triads reaching past the rim. The same picture as the 2D copy (lobule-zoom.js diveCopy):
// the tissue × the fade, plus the lobule's own layer × the rest, premultiplied. Drawn once as the zoom starts; the compositor scales it.
// (The two sources are built once, when this file loads; tissueFS hands back the one asked for.)
const tissueSource = (live) => `#version 300 es
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
uniform vec4 uRim;                           // the dive's rim: centre (device px), solid to clear radii (w 0: none)
out vec4 o;${live ? '\n' + LIVE_FS : ''}
vec3 over(vec4 t) { return t.rgb * t.a + uBg * (1.0 - t.a); }
void main() {
  vec2 p = vec2(gl_FragCoord.x, uH - gl_FragCoord.y);
  vec2 uv = (p - uO) / (uRd * vec2(6.0, 3.4641016151377544));
  vec3 c = mix(${Q('uQA')}, ${Q('uQB')}, uMix);
  if (uQOld > 0.0) c = mix(c, ${Q('uQO')}, uQOld);
  // Grey as the anatomy's liver is in this lens (lobule-look.js surroundGrade): toward its luma, then toward the page. Only the surround:
  // the lobule's bitmap, laid over it next, keeps the lens's colours.
  if (uGrey.x < 1.0 || uGrey.y < 1.0) c = mix(uBg, mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, uGrey.x), uGrey.y);
  vec4 own = vec4(0.0);   // (the lobule's own layer, for the rim)
  vec2 w = (p - uRect.xy) / uRect.z;${live ? '\n  vec3 c0 = c;' : ''}
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
    own = l;${live ? `
    // The lobule drawn live (lobule-live.js) in the share uLive: (1 − u)·(bitmap over the surround) + u·(live over it), the same as
    // mixing the two pictures before laying them, as over is linear in the top picture.
    if (uLive > 0.0) { vec4 ls = liveTissue(w) * e; c = mix(c, ls.rgb + c0 * (1.0 - ls.a), uLive); own = mix(own, ls, uLive); }` : ''}
  }
  float s = clamp((length(p - uO) - uFade.x) / max(uFade.y - uFade.x, 1e-6), 0.0, 1.0);
  float a = s < 0.5 ? uMid * s * 2.0 : uMid + (1.0 - uMid) * (s - 0.5) * 2.0;
  o = vec4(mix(c, uBg, a), 1.0);
  if (uRim.w > 0.0) { float f = clamp((uRim.w - length(p - uRim.xy)) / max(uRim.w - uRim.z, 1e-6), 0.0, 1.0); o = o * f + own * (1.0 - f); }
}`;
const FS_PLAIN = tissueSource(false), FS_LIVE = tissueSource(true);
export const tissueFS = (live) => (live ? FS_LIVE : FS_PLAIN);

/** opts.onLive(): called once the program that draws the lobule live has been published (liveReady() is true) or has failed (it never
 *  will be); the caller then asks again. */
export function createTissueGL(canvas, opts = {}) {   // alloc-rare: the tissue is made once for each lobule view
  let gl = null;
  let ucache = null;   // (the uniform cache, made at the first draw)
  // Hosted (opts.host: { gl, canvas, under }, the lobule's vessel renderer's top, veins-gl.js): no context of its own. Each frame is
  // drawn into a picture of its own (hostT) in the host's context, and laid on the host's canvas under the vessels at each of its presents
  // (under). The owner makes it again with the renderer it makes after a lost context.
  const host = opts.host || null;
  if (!host) return null;   // (hosted only: the figure's context is the lobule's one, and a lost one is waited for)
  const SCRN = () => (host.screen ? host.screen() : null);   // (the framebuffer the host's canvas stands in as: null, or a shared renderer's texture)
  gl = host.gl; canvas = host.canvas;
  // (See-through, not opaque: every pixel is drawn whole (alpha 1), so the picture is the same, but a frame in which the browser has no
  // picture for the canvas (its context taken back, or its buffer let go before a frame was drawn) shows the page through it, where an
  // opaque canvas showed solid black over the whole lobule and its surround, until the next draw (Mohammad, 31 Oct and 1 Nov: the
  // hepatocytes and the background all went black while zooming).)
  // (On a software renderer too, as the lobule's vessels are (veins-gl.js force): the tissue has no other drawing; nothing is drawn on a
  // 2D canvas.)
  // (Hosted, the picture's own target, sized to each frame; tgt: the size it holds (the canvas itself, on a context of its own); scr():
  // the framebuffer a frame ends in, null for the canvas.)
  let hostT = null;
  const tgt = { width: 0, height: 0 };   // alloc-rare: made once with the tissue
  const scr = () => (hostT ? hostT.fbo : null);   // alloc-rare: made once with the tissue
  paintGL(gl);   // (the painter of the lobule's picture, paint-gl.js: its programs start compiling now, beside the tissue's)
  // The program is started here and published once the driver has finished it (gl-compile.js); a draw that comes first publishes it.
  // This one is the tissue as it was before the shader drew any of the lobule: the bitmap over the surround, nothing of lobule-live.js
  // in it. The program that also draws the lobule live is a second one (tissueFS(true)), started by the first liveReady() (the caller
  // asks as soon as this exists), so a live program that fails to compile leaves this one working: the lobule keeps its painted
  // picture, and the bitmap alone is drawn by this program wherever the zoom gives the shader no share.
  let started;
  try { started = startProgram(gl, VS, tissueFS(false), [['p', 0]]); } catch (err) { console.warn('The lobule tissue falls back to the 2D canvas.', err); return null; }   // alloc-rare: the program is started once, with the tissue
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // one triangle over the whole canvas   // alloc-rare: the program's one triangle is uploaded once
  // (Hosted, in a context whose own passes bind vertex arrays of their own: one of its own, bound for each of its draws.)
  const vao = gl.createVertexArray();
  if (vao) gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  if (vao) { gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null); }
  gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
  // (A 1 px clear texture for a bitmap or tile not given: every sampler is bound to something.)
  const none = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, none);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));   // alloc-rare: the one clear texel is made once
  // (One level and a mipmap filter would leave it incomplete, and an incomplete texture reads opaque black.)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  let lost = false, pictured = false;   // (pictured: the canvas holds a frame at its present size, drawn by draw)
  // (Hosted: the context as the host's own passes expect to find it, after each of this one's calls.)
  function hostDone() {
    gl.useProgram(null); gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null); gl.bindFramebuffer(gl.FRAMEBUFFER, SCRN());
    for (let u = 0; u <= 12; u++) { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, null); }   // (the tiles and bitmaps, SCRATCH and the live shapes: units 0–12)
    gl.activeTexture(gl.TEXTURE0);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.disable(gl.SCISSOR_TEST); gl.disable(gl.BLEND);
  }
  let prog = null, U0 = null, failed = false, liveTex = null;   // (liveTex: the lobule's shapes on the GPU, for the shape liveTex.for)
  const COMMON_U = ['uQA', 'uQB', 'uQO', 'uW', 'uWO', 'uMix', 'uQOld', 'uO', 'uRd', 'uH', 'uRect', 'uWMix', 'uFade', 'uMid', 'uBg', 'uGrey', 'uRim'];   // alloc-rare: the uniform names are listed once
  const LIVE_U = ['uLC', 'uLB', 'uLI', 'uLBox', 'uLN', 'uLEdge', 'uLCtr', 'uLCen', 'uLSt', 'uLGap', 'uLGap55', 'uLBase', 'uLNut', 'uLZ1', 'uLZ2', 'uLZ3', 'uLPlate', 'uLInk', 'uLZl', 'uLive', 'uLS', 'uLK', 'uLSin', 'uLFib', 'uLKB', 'uLShd', 'uLShade', 'uLHs', 'uLHB', 'uLHN'];   // (the lobule drawn live, lobule-live.js)   // alloc-rare: the uniform names are listed once
  const locate = (p, names) => Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)]));   // alloc-rare: the uniform locations are found once, when the program is published
  // Reads the finished program, sets its samplers and runs one small offscreen draw, so the first real draw has no driver work left.
  function publish() {
    if (prog || failed || lost) return;
    try {
      prog = checkProgram(gl, started);
      U0 = locate(prog, COMMON_U);
      gl.useProgram(prog);
      gl.uniform1i(U0.uQA, 0); gl.uniform1i(U0.uQB, 1); gl.uniform1i(U0.uQO, 2); gl.uniform1i(U0.uW, 3); gl.uniform1i(U0.uWO, 4);
      if (vao) gl.bindVertexArray(vao);
      exerciseDraw(gl, () => gl.drawArrays(gl.TRIANGLES, 0, 3));   // alloc-rare: the program is published once, when the driver is done compiling
    } catch (err) { failed = true; console.warn('The lobule tissue falls back to the 2D canvas.', err); }
    hostDone();
  }
  publishWhenDone(gl, [started], publish);   // alloc-rare: the program is published once, when the driver is done compiling
  // The program that also draws the lobule live: started the first time liveReady() is asked,
  // published like the first, and used only by draws that carry a live share. If it fails, only the live drawing is lost: liveReady()
  // stays false, the first program keeps drawing the bitmap, and the caller is told (opts.onLive) so it stops waiting.
  let liveStarted = null, liveP = null, liveFailed = false;
  function startLive() {
    if (liveStarted || liveFailed || failed || lost) return;
    try { liveStarted = startProgram(gl, VS, tissueFS(true), [['p', 0]]); } catch (err) { liveFailed = true; console.warn('The lobule cannot be drawn live; it keeps its painted picture.', err); return; }   // alloc-rare: the live program is started once, the first time the lobule is drawn live
    publishWhenDone(gl, [liveStarted], publishLive);   // alloc-rare: the live program is started once
  }
  function publishLive() {
    if (liveP || liveFailed || failed || lost) return;
    try {
      const p = checkProgram(gl, liveStarted), L = locate(p, [...COMMON_U, ...LIVE_U]);   // alloc-rare: the live program is published once
      gl.useProgram(p);
      gl.uniform1i(L.uQA, 0); gl.uniform1i(L.uQB, 1); gl.uniform1i(L.uQO, 2); gl.uniform1i(L.uW, 3); gl.uniform1i(L.uWO, 4);
      gl.uniform1i(L.uLC, LIVE_UNIT); gl.uniform1i(L.uLB, LIVE_UNIT + 1); gl.uniform1i(L.uLI, LIVE_UNIT + 2); gl.uniform1i(L.uLS, LIVE_UNIT + 3); gl.uniform1i(L.uLK, LIVE_UNIT + 4);   // (the lobule's shapes, lobule-live.js)
      if (vao) gl.bindVertexArray(vao);
      exerciseDraw(gl, () => gl.drawArrays(gl.TRIANGLES, 0, 3));   // alloc-rare: the live program is published once
      liveP = { prog: p, U: L };   // alloc-rare: the live program is published once
    } catch (err) { liveFailed = true; console.warn('The lobule cannot be drawn live; it keeps its painted picture.', err); }
    hostDone();
    try { opts.onLive?.(); } catch (err) { console.warn(err); }
  }
  // A canvas's texture, sent again only when the canvas was painted again (ver, the caller's count of its paints) or resized.
  // Tiles repeat; the lobule's bitmap is premultiplied (as the 2D canvas lays it) and stops at its edges.
  const texs = new Map(), SCRATCH = 7, LIVE_UNIT = 8, copier = createTileCopier(gl);   // alloc-rare: made once with the tissue
  // A canvas's texture record, written in place (a new one only the first time that canvas is sent).
  function setTex(cv, t, tex, ver, bad) {
    if (!t) { t = { tex, w: 0, h: 0, ver: NaN, bad: false, badVer: 0, retryAt: 0 }; texs.set(cv, t); }   // alloc-rare: the first record of a canvas
    t.tex = tex; t.w = cv.width; t.h = cv.height; t.ver = bad ? NaN : ver; t.bad = bad;
    if (bad) { t.badVer = ver; t.retryAt = performance.now() + SEND_RETRY; }
  }
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
      if (!tex) { setTex(cv, t, gl.createTexture(), ver, true); return null; }
      setTex(cv, t, tex, ver, false);
      return tex;
    }
    // (A copy of a tile made here on the GPU, tile-gl.js: drawn into its own texture from the tile, never sent from a canvas.)
    if (isTileCopy(cv)) {
      if (t) gl.deleteTexture(t.tex);
      gl.activeTexture(gl.TEXTURE0 + SCRATCH);
      const tex = copier.make(cv);
      copier.drop();   // (the surround needs one copy of each tile: the tile itself is not kept on the GPU)
      if (!tex) { setTex(cv, t, gl.createTexture(), ver, true); return null; }
      setTex(cv, t, tex, ver, false);
      return tex;
    }
    if (!t) { t = { tex: gl.createTexture(), w: 0, h: 0, ver: NaN, bad: false, badVer: 0, retryAt: 0 }; texs.set(cv, t); }   // alloc-rare: the first send of a canvas
    gl.activeTexture(gl.TEXTURE0 + SCRATCH);   // (a unit no draw uses, so sending a canvas never replaces a texture already bound for the frame)
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !tile);
    const sent = sendCanvas(gl, cv);
    const wrap = tile ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    if (!sent) { setTex(cv, t, t.tex, ver, true); return null; }
    setTex(cv, t, t.tex, ver, false);
    return t.tex;
  }
  // The lobule's shapes (lobule-live.js buildLive) as float textures, sent once per shape. NEAREST and texelFetch: no filtering.
  function liveFor(shape, data) {
    if (liveTex && liveTex.for === shape) return liveTex;
    if (liveTex) for (const t of liveTex.t) gl.deleteTexture(t);
    const make = (unit, fmt, base, w, h, arr) => {   // alloc-rare: the lobule's shape textures are made once for each shape
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, fmt, w, h, 0, base, gl.FLOAT, arr);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    liveTex = { for: shape, data, t: [   // alloc-rare: the lobule's shape textures are made once for each shape
      make(LIVE_UNIT, gl.RGBA32F, gl.RGBA, CELLS_PER_ROW * 3, data.cellRows, data.cellData),
      make(LIVE_UNIT + 1, gl.RGBA32F, gl.RGBA, data.nb, data.nb, data.bins),
      make(LIVE_UNIT + 2, gl.R32F, gl.RED, IDX_ROW, data.idxRows, data.idx),
      make(LIVE_UNIT + 3, gl.RGBA32F, gl.RGBA, SEG_ROW * 2, data.segRows, data.segData),
      make(LIVE_UNIT + 4, gl.RGBA32F, gl.RGBA, K_ROW, 1, new Float32Array(K_ROW * 4)),   // (the per-state texels: sent by liveDyn)   // alloc-rare: the lobule's shape textures are made once for each shape
    ], dyn: null };
    return liveTex;
  }
  // The per-state texels (lobule-live.js buildDyn), sent again only when they changed.
  function liveDyn(T, dyn) {
    // (buildDyn writes one object over each time and moves its `ver`, so the object alone no longer says whether the texels are the ones sent.)
    if (T.dyn === dyn && T.dynVer === dyn.ver) return;
    gl.activeTexture(gl.TEXTURE0 + LIVE_UNIT + 4); gl.bindTexture(gl.TEXTURE_2D, T.t[4]);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, K_ROW, dyn.rows, 0, gl.RGBA, gl.FLOAT, dyn.k);
    T.dyn = dyn; T.dynVer = dyn.ver;
  }
  // The kept picture (a pan of the lobule drawn live). The live shader is the costly one, and a pan of a whole number of device px moves
  // every pixel of the picture by that number and changes nothing else (the surround, the bitmap, the live lobule and the fade into
  // the page are all functions of where the pixel lies against the lobule's centre and the bitmap's corner, which move together). So a
  // frame drawn live is drawn into a texture of its own and copied to the canvas, and the next frame, when nothing but such a move
  // has changed, is that texture copied again, shifted, with only the strips the move uncovers drawn live: an exact copy of
  // pixels (a blit, no filtering), not a resampling, so it is the picture the shader would draw. Any other change, or a move
  // by a fraction of a pixel, is drawn live in full, so nothing is ever approximate. Only live frames are kept; the bitmap program
  // draws straight to the canvas as ever.
  let keepOff = false;
  let pic = null;   // { cur, spare, W, H, sig, ref }: cur holds the kept picture; spare is the other of the pair, made at the first pan
  const keepStats = { full: 0, shifted: 0, still: 0 };   // alloc-rare: made once with the tissue
  function makeTarget(w, h) {
    const tex = gl.createTexture(), fbo = gl.createFramebuffer();
    gl.activeTexture(gl.TEXTURE0 + SCRATCH);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = fbComplete(gl, gl.FRAMEBUFFER, 'rgba8', w, h);   // (asked per framebuffer, size and attachment set: gl-state.js)
    gl.bindFramebuffer(gl.FRAMEBUFFER, SCRN());
    gl.bindTexture(gl.TEXTURE_2D, null);   // (not left bound on a unit: the target is only ever drawn into and copied from)
    return { tex, fbo, ok };   // alloc-rare: a picture target is made once, when the first live frame is kept (and again if the canvas is resized)
  }
  const freeTarget = (t) => { if (t) { gl.deleteFramebuffer(t.fbo); gl.deleteTexture(t.tex); } };   // alloc-rare: made once with the tissue
  function dropKept() { if (pic) { if (!lost) { freeTarget(pic.cur); freeTarget(pic.spare); } pic = null; } }
  // Copies a rectangle [x, y, w, h] of one target to [x, y, w, h] of another (dst null: the canvas), pixel for pixel.
  function blit(src, dst, s, d) {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst ? dst.fbo : null);
    gl.blitFramebuffer(s[0], s[1], s[0] + s[2], s[1] + s[3], d[0], d[1], d[0] + d[2], d[1] + d[3], gl.COLOR_BUFFER_BIT, gl.NEAREST);
  }
  // (Two signatures alike: the same numbers and textures, NaN equal to NaN. A loop, no closure made for the compare.)
  function same(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) { const v = a[i], w = b[i]; if (v !== w && !(v !== v && w !== w)) return false; }
    return true;
  }
  const tri = () => gl.drawArrays(gl.TRIANGLES, 0, 3);   // alloc-rare: made once per context
  const TX = [null, null, null, null, null];   // alloc-rare: made once per context (the five textures of a frame, written in place)
  const POS = [0, 0, 0, 0];   // alloc-rare: made once per context (where the lobule lies, written in place each live frame)
  const FULL = [0, 0, 0, 0];   // alloc-rare: made once per context (the whole canvas as a blit rectangle, written in place)
  // The live program is in use and its uniforms are set: draw the frame (sig: everything the frame is made from except where it lies;
  // pos: the lobule's centre and the bitmap's corner, device px).
  function drawLive(W, H, sig, pos) {
    if (keepOff || (tgt.width !== W || tgt.height !== H)) { dropKept(); tri(); return; }
    if (pic && (pic.W !== W || pic.H !== H)) dropKept();
    const full = FULL; full[2] = W; full[3] = H;
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
        { const r = pic.ref; r[0] += d[0]; r[1] += d[1]; r[2] += d[0]; r[3] += d[1]; }   // (what its pixels are drawn for: whole steps from the last full frame, so no error builds up)
        keepStats.shifted++;
        return;
      }
    }
    if (!pic) { const a = makeTarget(W, H); if (!a.ok) { keepOff = true; freeTarget(a); tri(); return; } pic = { cur: a, spare: null, W, H, sig: null, ref: [0, 0, 0, 0] }; }   // alloc-rare: the kept picture is made once, when a live frame is first kept
    gl.bindFramebuffer(gl.FRAMEBUFFER, pic.cur.fbo);
    tri();
    blit(pic.cur, hostT, full, full);
    gl.bindFramebuffer(gl.FRAMEBUFFER, scr());
    // (The signature just drawn is kept, and the array it replaces becomes the next one's scratch: no array is made for each frame.)
    { const old = pic.sig; pic.sig = sig; sigBuf = old || []; }   // alloc-rare: the first kept frame only (the array is empty before it)
    { const r = pic.ref; r[0] = pos[0]; r[1] = pos[1]; r[2] = pos[2]; r[3] = pos[3]; }
    keepStats.full++;
  }
  // Everything a live frame is made from but where it lies (compared with the last one's: the same numbers, the same textures). Written
  // into a kept array, in the order the frame's parts come, and the plain parts of `live` (numbers, flags, colours: nested arrays and
  // objects) written flat after them: no array is made, and no JSON string, for each frame.
  let sigBuf = [];   // alloc-rare: made once per context
  let sigN = 0;
  function sigPut(v) { sigBuf[sigN++] = v; }
  function sigCv(c) { if (c) { sigBuf[sigN++] = c; sigBuf[sigN++] = c.width; sigBuf[sigN++] = c.height; } else { sigBuf[sigN++] = null; sigBuf[sigN++] = 0; sigBuf[sigN++] = 0; } }
  function sigFlat(v) {
    if (v === null || v === undefined || typeof v !== 'object') { sigBuf[sigN++] = v; return; }
    if (ArrayBuffer.isView(v) || Array.isArray(v)) { sigBuf[sigN++] = v.length; for (let i = 0; i < v.length; i++) sigFlat(v[i]); return; }
    for (const k in v) { sigBuf[sigN++] = k; sigFlat(v[k]); }
  }
  function liveSig(W, H, rim, qa, qb, mix, qo, qOld, w, wVer, wo, woVer, wMix, rect, rd, fade, mid, bg, grey, live) {
    sigN = 0;
    if (rim) { sigPut(rim[0]); sigPut(rim[1]); sigPut(rim[2]); sigPut(rim[3]); }
    sigPut(W); sigPut(H); sigCv(qa); sigCv(qb); sigPut(mix); sigCv(qo); sigPut(qOld); sigCv(w); sigPut(wVer); sigCv(wo); sigPut(woVer);
    sigPut(wMix); sigPut(rect[2]); sigPut(rd); sigPut(fade[0]); sigPut(fade[1]); sigPut(mid);
    sigPut(bg[0]); sigPut(bg[1]); sigPut(bg[2]); sigPut(grey ? grey[0] : 1); sigPut(grey ? grey[1] : 1); sigPut(live.shape); sigPut(live.data); sigPut(live.dyn); sigPut(live.dyn.ver);
    sigFlat(live.share); sigFlat(live.cu); sigFlat(live.sj); sigFlat(live.zones); sigFlat(live.dark); sigFlat(live.cen); sigFlat(live.rs0); sigFlat(live.fib); sigFlat(live.col);
    sigBuf.length = sigN;
    return sigBuf;
  }
  hostDone();
  return {   // alloc-rare: the tissue's handle is made once
    get lost() { return lost || failed || gl.isContextLost(); },   // alloc-rare: the tissue's handle is made once
    /** How many live frames were drawn in full, as a shifted copy of the last (with only the strips the move uncovered drawn), or as
     *  the last again. */
    get kept() { return { ...keepStats }; },   // alloc-rare: read by tests and the debug panel, never by a frame
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
     *  rim: the dive's rim [x, y, r solid, r clear] (device px), past which only the lobule's own layer is kept, null for none. */
    draw({ W, H, qa, qb, mix, qo = null, qOld = 0, w, wVer, wo = null, woVer = 0, wMix = 1, rect, ox, oy, rd, fade, mid, bg, live = null, grey = null, rim = null, hold = false }) {
      // (Published by the idle poll, long before a dive; a draw that comes first publishes it only once the driver says it is compiled, so
      // no frame waits on a compile: still compiling, the tissue keeps the frame it shows (hold, at this size) or the 2D canvas draws this one.)
      if (!prog && !failed && !lost) {
        let ready;
        try { ready = compileDone(gl, [started]); } catch { ready = true; }   // alloc-rare: only while the program is still compiling, the first frames of a view
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
      const tx = TX;
      tx[0] = texFor(qa, 0, true); tx[1] = qb ? texFor(qb, 0, true) : tx[0]; tx[2] = qo && qOld > 0 ? texFor(qo, 0, true) : none;
      tx[3] = w?.width ? texFor(w, wVer, false) : none; tx[4] = old ? texFor(wo, woVer, false) : none;
      if (!tx[0] || !tx[1] || !tx[2] || !tx[3] || !tx[4]) {
        if (hold && pictured && tgt.width === W && tgt.height === H) { hostDone(); return 'held'; }
        // (No picture to keep: still drawn on the GPU, never stepped down to the 2D canvas. What did not go is the 1 px clear texture: a tile
        // laid over the page's colour by its alpha (over) shows the page's colour, a bitmap shows the surround under it, never black.)
        for (let i = 0; i < tx.length; i++) if (!tx[i]) tx[i] = none;
      }
      if (!hostT || tgt.width !== W || tgt.height !== H) {
        if (hostT) freeTarget(hostT);
        hostT = makeTarget(W, H); tgt.width = W; tgt.height = H; pictured = false;
        if (!hostT.ok) { freeTarget(hostT); hostT = null; tgt.width = tgt.height = 0; hostDone(); return false; }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, hostT.fbo); gl.bindVertexArray(vao);
      gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST); gl.disable(gl.DEPTH_TEST);
      gl.viewport(0, 0, W, H);
      // (With a share and the live program ready, the program that has the lobule's shapes in it; otherwise the first, which is the
      // bitmap over the surround and nothing else.)
      const isLive = !!(live && live.share > 0 && liveP), U = isLive ? liveP.U : U0;
      gl.useProgram(isLive ? liveP.prog : prog);
      for (let unit = 0; unit < 5; unit++) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tx[unit]); }
      // (Uniforms go through the cache: a value the program already holds is not sent again, uniform-cache.js. Set nowhere else.)
      const UC = ucache || (ucache = uniformCache(gl));
      UC.f1(U.uMix, qb ? mix : 0); UC.f1(U.uQOld, qo ? qOld : 0);
      UC.f2(U.uO, ox, oy); UC.f1(U.uRd, rd); UC.f1(U.uH, H);
      UC.f3(U.uRect, rect[0], rect[1], Math.max(rect[2], 1e-6));
      UC.f2(U.uWMix, old ? wMix : 1, old ? 1 - wMix : 0);
      UC.f2(U.uFade, fade[0], fade[1]); UC.f1(U.uMid, mid);
      UC.f3(U.uBg, bg[0], bg[1], bg[2]);
      UC.f2(U.uGrey, grey ? grey[0] : 1, grey ? grey[1] : 1);
      if (rim) UC.f4(U.uRim, rim[0], rim[1], rim[2], rim[3]); else UC.f4(U.uRim, 0, 0, 0, 0);
      if (isLive) {
        const T = liveFor(live.shape, live.data), D = live.data, C = live.col;
        for (let i = 0; i < T.t.length; i++) { gl.activeTexture(gl.TEXTURE0 + LIVE_UNIT + i); gl.bindTexture(gl.TEXTURE_2D, T.t[i]); }
        UC.f3(U.uLBox, D.box[0], D.box[1], D.box[2]); UC.f2(U.uLN, D.nb, BIN);
        UC.fv3(U.uLEdge, D.edges); UC.f2(U.uLCtr, D.ctr[0], D.ctr[1]);
        UC.f4(U.uLCen, live.cen[0], live.cen[1], live.cen[2], live.dark ? 1 : 0);
        UC.f4(U.uLSt, live.cu, live.sj, live.zones ? 1 : 0, 0);
        UC.fv3(U.uLGap, C.gap); UC.fv3(U.uLGap55, C.gap55); UC.fv3(U.uLBase, C.base);
        UC.fv3(U.uLNut, C.nut); UC.fv3(U.uLZ1, C.z1); UC.fv3(U.uLZ2, C.z2); UC.fv3(U.uLZ3, C.z3);
        UC.fv4(U.uLPlate, C.plate); UC.fv4(U.uLInk, C.ink); UC.fv4(U.uLZl, C.zl);
        liveDyn(T, live.dyn);
        const F = live.fib, acFibSin = F.fibSin, acAct = F.actV;   // (liveFibre: the sinusoid collagen's and the stellate cells' strengths)
        UC.f4(U.uLSin, C.dis[0], C.dis[1], C.dis[2], 0.75 * acFibSin * F.sin); UC.f4(U.uLFib, acFibSin, live.dyn.margin, 0, 0);
        UC.f4(U.uLKB, live.dyn.nItems ? live.dyn.nk : 0, 32, live.dyn.bOff, live.dyn.iOff);
        UC.f4(U.uLShd, C.shd[0], C.shd[1], C.shd[2], C.shd[3]); UC.f4(U.uLShade, C.shade[0], C.shade[1], C.shade[2], 1);
        UC.f4(U.uLHs, F.act > 0 ? live.dyn.nH : 0, acAct, live.rs0, live.dyn.hOff);
        UC.f4(U.uLHB, C.body[0], C.body[1], C.body[2], (0.22 + 0.3 * acAct) * F.act);
        UC.f4(U.uLHN, C.nuc[0], C.nuc[1], C.nuc[2], (0.3 + 0.3 * acAct) * F.act);
        UC.f1(U.uLive, live.share);
      }
      if (isLive) {
        POS[0] = ox; POS[1] = oy; POS[2] = rect[0]; POS[3] = rect[1];
        drawLive(W, H, liveSig(W, H, rim, qa, qb || null, qb ? mix : 0, qo && qOld > 0 ? qo : null, qo ? qOld : 0, w?.width ? w : null, wVer, old ? wo : null, old ? woVer : 0, old ? wMix : 1, rect, rd, fade, mid, bg, grey, live), POS);
      }
      else { dropKept(); gl.drawArrays(gl.TRIANGLES, 0, 3); }
      pictured = true;
      hostDone();
      return true;
    },
    /** Hosted: whether there is a picture to lay (the last frame drawn), and laying it on the host's canvas from its top left, pixel
     *  for pixel (the host's present, under its own picture). */
    get pictured() { return pictured && !!hostT; },   // alloc-rare: the tissue's handle is made once
    under(k = 1) {
      if (!hostT || !pictured || lost || gl.isContextLost()) return;
      // (k: the host canvas's pixels per this picture's, 0.5 where the vessels draw at half density on a software renderer: the picture
      // then filtered down onto the same place. A host canvas larger than the picture (a wide copy's tile, cropped from it) gets it in its top left.)
      const ch = canvas.height, dw = Math.round(tgt.width * k), dh = Math.round(tgt.height * k);
      gl.disable(gl.SCISSOR_TEST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, hostT.fbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, SCRN());
      gl.blitFramebuffer(0, 0, tgt.width, tgt.height, 0, ch - dh, dw, ch, gl.COLOR_BUFFER_BIT, k === 1 ? gl.NEAREST : gl.LINEAR);
      gl.bindFramebuffer(gl.FRAMEBUFFER, SCRN());
    },
    /** Gives back the picture's own target (hosted), as the canvas's memory would be. */
    release() { dropKept(); if (hostT && !lost && !gl.isContextLost()) freeTarget(hostT); hostT = null; tgt.width = tgt.height = 0; pictured = false; },
    /** The context it draws in (its own, or the host's). */
    get gl() { return gl; },   // alloc-rare: the tissue's handle is made once
  };
}
