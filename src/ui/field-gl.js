// The lobule dive's field on the GPU: the picture paintField (lobule-zoom.js) lays down with the 2D canvas, one fragment per
// pixel in a single pass. On the 2D canvas each frame of the dive took four passes over the whole screen on the main thread
// (the liver-toned tile, the quieted tile over it, the fade into the page, the emerging mask); here the same picture is drawn
// by the GPU, with the tiles kept on it as textures (sent once, ahead of the dive), so a frame costs the page almost nothing.
//
// The tiles are drawn at sizes a factor of 2 apart, each with its own detail (simple lobules small, the sinusoids and fibres
// only on the large ones). The 2D canvas showed one size at a time and switched to the next as the zoom passed it; here the two
// nearest are blended by where the zoom is between them (fieldBlend, lobule-look.js), so the lobules gain their detail gradually
// as they grow, never in a step. Both are drawn at or above the size on screen, and mipmapped, so nothing is shown blurrier.
//
// Without WebGL2 (or on a software renderer, or once the context is lost) createFieldGL returns null / reports lost, and the
// field is drawn on the 2D canvas as before.

import { startProgram, checkProgram, exerciseDraw, publishWhenDone, compileDone, SHADER_WARM } from './gl-compile.js';
import { isTileCopy, createTileCopier } from './tile-gl.js';
import { uniformCache } from './uniform-cache.js';

const VS = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

// Mirrors paintField's 2D passes. The tile's pattern puts one repeat (two lobules wide, two high: 6 R by 2√3 R) per
// 6 rd by 2√3 rd device px, with the landing lobule's centre at uO, the same for every size of tile.
// (A tile is opaque everywhere it is drawn, so laying it over the page's colour by its own alpha changes nothing. But a tile canvas the
// browser could not give memory to (iPhone Safari, at the peak of the way out of a zoomed-in lobule, with the wide copy still held) is
// transparent, and its rgb, read alone, is 0: the neighbouring lobules flashed solid black (Mohammad, 1 Nov). Laid over the page, such a
// tile shows the page's colour for the frame or two until it is drawn again (lobule-zoom.js tileDue).)
const R = (s) => `over(texture(${s}, uv, bias))`;
// A canvas sent to the bound texture, level 0. A canvas the browser had no memory for, or a send the GPU had no memory for, left the
// texture without a picture, and a texture without its level reads opaque black: the lobule's hepatocytes and its neighbours went
// black for a moment once it settled, as the sharper bitmap was sent (Mohammad, 1 Nov, iPhone). So the level is made first, clear, and
// the canvas laid into it (an unsent canvas leaves it clear, never black), and the GPU is asked whether it all went: false if not, and
// the caller draws that frame on the 2D canvas instead.
export function sendCanvas(gl, cv) {
  for (let i = 0; i < 8 && gl.getError() !== gl.NO_ERROR; i++);   // (errors left by earlier calls are not this send's)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cv.width, cv.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, cv);
  return gl.getError() === gl.NO_ERROR;
}
// (A texture whose send failed is asked for again at most this often: each try is a whole canvas's worth of GPU memory.)
export const SEND_RETRY = 250;
export const fieldFS = () => `#version 300 es
precision highp float;
uniform sampler2D uA, uB, uQA, uQB;   // the liver-toned and the quieted tiles, at the two sizes blended
uniform float uMix;                    // how much of the larger size (0 … 1)
uniform float uQuiet;                  // the quieted tile laid over the liver-toned one (globalAlpha d.quiet)
uniform vec2 uO;                       // the landing lobule's centre (device px, from the top left)
uniform float uRd, uH;                 // its radius (device px); the canvas's height
uniform vec4 uFade;                    // r0, r1, q (the fade into the page's strength), on (1 / 0)
uniform float uMid;                    // FADE_MID: the fade's middle stop
uniform vec3 uBg;                      // the page's colour
uniform vec4 uMask;                    // ox, oy, rho (the emerging mask), on (1 / 0)
uniform vec4 uDof;                     // the softness as mip biases: the whole field's, depth of field from r0 to r1, its bias there
uniform vec2 uGrey;                    // the grade in a lens other than Pressure: saturation, opacity (1, 1: as drawn)
out vec4 o;
vec3 over(vec4 t) { return t.rgb * t.a + uBg * (1.0 - t.a); }   // (a tile over the page: its own rgb where it is opaque)
void main() {
  vec2 p = vec2(gl_FragCoord.x, uH - gl_FragCoord.y);
  vec2 uv = (p - uO) / (uRd * vec2(6.0, 3.4641016151377544));
  // Soft by sampling a coarser level of the tiles' mipmaps (no extra pass): the field arrives blurred and sharpens, and the lobules
  // far from the landing one stay a little soft (fieldDof, lobule-look.js).
  float bias = uDof.x + uDof.w * smoothstep(uDof.y, uDof.z, length(p - uO));
  vec3 c = mix(${R('uA')}, ${R('uB')}, uMix);
  if (uQuiet > 0.0) c = mix(c, mix(${R('uQA')}, ${R('uQB')}, uMix), uQuiet);
  // Grey as the anatomy's liver is in this lens (lobule-look.js surroundGrade): toward its luma, then toward the page, so the field
  // coming in over the grey organs is the same grey.
  if (uGrey.x < 1.0 || uGrey.y < 1.0) c = mix(uBg, mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, uGrey.x), uGrey.y);
  // The fade into the page: a radial gradient from r0 (clear) through FADE_MID · q halfway to q at r1 and beyond.
  if (uFade.w > 0.0) {
    float s = clamp((length(p - uO) - uFade.x) / max(uFade.y - uFade.x, 1e-6), 0.0, 1.0);
    float a = s < 0.5 ? uMid * uFade.z * (s * 2.0) : mix(uMid * uFade.z, uFade.z, s * 2.0 - 1.0);
    c = mix(c, uBg, a);
  }
  // Emerging: whole inside rho · 0.35, gone at rho.
  float m = 1.0;
  if (uMask.w > 0.0) m = 1.0 - clamp((length(p - uMask.xy) - uMask.z * 0.35) / max(uMask.z * 0.65, 1e-6), 0.0, 1.0);
  o = vec4(c * m, m);
}`;

const KEEP_ALL = () => true;   // (sweep's default: every tile is kept; one function, not a new one each call)
/** host ({ gl, canvas, screen }: the figure's renderer's top, veins-gl.js): no context of its own. Each frame is drawn into a texture of its
 *  own (target) in the host's context, which the lobule's pass lays under the lobule; `canvas` is then only the size carrier. */
export function createFieldGL(canvas, { host = null } = {}) {
  let gl = null;
  let vao = null, tgt = null;   // (hosted: its own vertex array, and the picture's texture and framebuffer)
  let ucache = null;   // (the uniform cache, made at the first draw)
  if (!host) return null;   // (hosted only, the two-contexts plan)
  gl = host.gl;
  if (!gl) return null;
  // (lost: the GPU does not draw the field, from the loss until the rebuilt program is published.)
  let pictured = false;   // (the canvas holds a frame at its present size)
  let lost = false, dead = false, started = null, stopPoll = null;
  let prog = null, U = null, failed = false;
  // Reads the finished program, sets its samplers and runs one small offscreen draw, so the first real draw has no driver work left.
  function publish() {
    if (prog || failed || gl.isContextLost()) return;
    try {
      prog = checkProgram(gl, started);
      U = Object.fromEntries(['uA', 'uB', 'uQA', 'uQB', 'uMix', 'uQuiet', 'uO', 'uRd', 'uH', 'uFade', 'uMid', 'uBg', 'uMask', 'uDof', 'uGrey'].map((n) => [n, gl.getUniformLocation(prog, n)]));
      gl.useProgram(prog);
      gl.uniform1i(U.uA, 0); gl.uniform1i(U.uB, 1); gl.uniform1i(U.uQA, 2); gl.uniform1i(U.uQB, 3);
      if (host) gl.bindVertexArray(vao);
      exerciseDraw(gl, () => gl.drawArrays(gl.TRIANGLES, 0, 3));
      if (host) gl.bindVertexArray(null);
      lost = false;   // (after a restore: the GPU draws the field again)
    } catch (err) {
      if (gl.isContextLost()) { prog = null; U = null; return; }   // (lost while it was read: the restore makes it again)
      failed = true; console.warn('The lobule field falls back to the 2D canvas.', err); gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  }
  // What the context holds: the program (started now, published once the driver has finished it, gl-compile.js; a draw that comes first
  // publishes it) and the one triangle over the canvas. Made at the start, and again when a lost context comes back. (The tiles'
  // textures are made as each is drawn, texFor, and went with the context.)
  function build() {
    prog = null; U = null; failed = false;
    started = startProgram(gl, VS, fieldFS(), [['p', 0]]);
    if (host && !vao) vao = gl.createVertexArray();
    if (host) gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // one triangle over the whole canvas
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    if (host) { gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null); }
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    stopPoll?.(); stopPoll = publishWhenDone(gl, [started], publish);
  }
  try { build(); } catch (err) { console.warn('The lobule field falls back to the 2D canvas.', err); gl.getExtension('WEBGL_lose_context')?.loseContext(); return null; }
  if (!host) canvas.addEventListener('webglcontextlost', (e) => { lost = true; pictured = false; texs.clear(); e.preventDefault?.(); });
  // A context the browser gives back is built afresh; the field stays on the 2D canvas (lost) until the program is published, at an idle
  // moment, and the tiles go up again as they are drawn.
  if (!host) canvas.addEventListener('webglcontextrestored', () => {
    if (dead) return;
    texs.clear();
    try { build(); } catch (err) { failed = true; console.warn('The lobule field could not be rebuilt; the 2D canvas stays.', err); }
  });
  // A tile's texture, made once per tile canvas (a new canvas for each tissue state and tone) and kept until that canvas is
  // given back (width 0: forget, sweep).
  const texs = new Map(), copier = createTileCopier(gl);
  // (A 1 px clear texture, made when first wanted and again after a lost context: complete (no mipmap filter), so it reads clear.)
  let clear = null;
  function clearTex() {
    if (clear && gl.isTexture(clear)) return clear;
    clear = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, clear);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return clear;
  }
  function texFor(cv) {
    let t = texs.get(cv);
    if (t && t.w === cv.width && t.h === cv.height && !t.bad) return t.tex;
    if (t?.bad && t.w === cv.width && t.h === cv.height && performance.now() < t.retryAt) return null;   // (failed: the 2D canvas, a while)
    if (t) gl.deleteTexture(t.tex);
    // (A copy of a tile made here on the GPU, tile-gl.js: drawn into its own texture from the tile, never sent from a canvas.)
    if (isTileCopy(cv)) {
      const tex = copier.make(cv);
      if (tex) texs.set(cv, { tex, w: cv.width, h: cv.height, bad: false, retryAt: 0 });
      else texs.set(cv, { tex: gl.createTexture(), w: cv.width, h: cv.height, bad: true, retryAt: performance.now() + SEND_RETRY });
      return tex;
    }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    const sent = sendCanvas(gl, cv);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    texs.set(cv, { tex, w: cv.width, h: cv.height, bad: !sent, retryAt: sent ? 0 : performance.now() + SEND_RETRY });
    return sent ? tex : null;
  }
  return {
    get lost() { return lost || failed || gl.isContextLost(); },
    /** Sends a tile to the GPU now (ahead of the dive), so no frame of it waits for one. */
    upload(cv) { if (!this.lost && cv?.width) texFor(cv); },
    /** Gives back the textures of tiles whose canvases were given back (or are no longer wanted: keep(cv) false). */
    sweep(keep = KEEP_ALL) {
      for (const [cv, t] of texs) if (!cv.width || !keep(cv)) { if (!lost) gl.deleteTexture(t.tex); texs.delete(cv); }
      copier.sweep();
    },
    /** Lets go of the tile kept on the GPU for its next copy (tile-gl.js), once a dive's copies are made. */
    dropRaw() { copier.drop(); },
    /** One frame of the field. W, H: the canvas's size (device px); a, b, qa, qb: the tiles' canvases (liver-toned and
     *  quieted, at the smaller and larger size); dof: the softness (fieldDof); grey: the grade [saturation, opacity] (surroundGrade),
     *  null as drawn; the rest as paintField's (see FS). */
    draw({ W, H, a, b, qa, qb, mix, quiet, ox, oy, rd, fade, mid, bg, mask, dof = null, grey = null, hold = false }) {
      // (Its program published by the idle poll, long before a dive. A draw that comes first publishes it only once the driver says it is
      // compiled (no wait); still compiling, the field keeps the frame it shows (hold, at this size) or the 2D canvas draws this one, and no
      // frame waits on a compile. ?shaderwarm=0: published here whatever it costs, as before.)
      if (!prog && !failed && started && !gl.isContextLost()) {
        let ready = true;
        if (SHADER_WARM) try { ready = compileDone(gl, [started]); } catch { ready = true; }
        if (ready) publish();
        else return hold && pictured && canvas.width === W && canvas.height === H ? 'held' : false;
      }
      if (this.lost || !prog) return false;
      // (A tile given back, or a zero-sized canvas, would be sampled as black: the 2D canvas draws this frame instead.)
      if (!a?.width || (b && !b.width) || (quiet > 0 && (!qa?.width || (qb && !qb.width)))) return false;
      // (Every texture first, before the canvas is touched: one the GPU could not take is never sampled (it read opaque black). Showing
      // (hold) at this size with a picture, the field keeps its last frame for this one.)
      const tx = [a, b || a, ...(quiet > 0 ? [qa, qb || qa] : [])].map((cv) => texFor(cv));
      copier.drop();   // (a tile kept on the GPU for its copies, tile-gl.js: both are made, so it goes)
      if (tx.some((t) => !t)) {
        if (hold && pictured && canvas.width === W && canvas.height === H) return 'held';
        // (No picture to keep: still drawn on the GPU, with the 1 px clear texture for what did not go: laid over the page's colour, never black.)
        for (let i = 0; i < tx.length; i++) if (!tx[i]) tx[i] = clearTex();
      }
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; pictured = false; }
      if (host) {
        if (!tgt) tgt = { tex: gl.createTexture(), fbo: gl.createFramebuffer(), w: 0, h: 0 };
        if (tgt.w !== W || tgt.h !== H) {
          gl.bindTexture(gl.TEXTURE_2D, tgt.tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.bindFramebuffer(gl.FRAMEBUFFER, tgt.fbo);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tgt.tex, 0);
          tgt.w = W; tgt.h = H; pictured = false;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, tgt.fbo); gl.bindVertexArray(vao);
        gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST); gl.disable(gl.DEPTH_TEST);
      }
      gl.viewport(0, 0, W, H);
      gl.useProgram(prog);
      tx.forEach((t, unit) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); });
      // (Uniforms go through the cache: a value the program already holds is not sent again, uniform-cache.js. Set nowhere else.)
      const UC = ucache || (ucache = uniformCache(gl));
      UC.f1(U.uMix, b ? mix : 0); UC.f1(U.uQuiet, quiet);
      UC.f2(U.uO, ox, oy); UC.f1(U.uRd, rd); UC.f1(U.uH, H);
      UC.f4(U.uFade, fade ? fade[0] : 0, fade ? fade[1] : 0, fade ? fade[2] : 0, fade ? 1 : 0); UC.f1(U.uMid, mid);
      UC.f3(U.uBg, bg[0], bg[1], bg[2]);
      UC.f4(U.uMask, mask ? mask[0] : 0, mask ? mask[1] : 0, mask ? mask[2] : 0, mask ? 1 : 0);
      UC.f4(U.uDof, dof ? dof[0] : 0, dof ? dof[1] : 0, dof ? dof[2] : 1, dof ? dof[3] : 0);
      UC.f2(U.uGrey, grey ? grey[0] : 1, grey ? grey[1] : 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      pictured = true;
      if (host) {   // (the context as the host's own passes expect to find it)
        gl.useProgram(null); gl.bindVertexArray(null); gl.bindFramebuffer(gl.FRAMEBUFFER, host.screen ? host.screen() : null);
        for (let u = 0; u < 4; u++) { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, null); }
        gl.activeTexture(gl.TEXTURE0);
      }
      return true;
    },
    /** Hosted: the picture's texture ({ tex, w, h }) once a frame was drawn, else null. */
    get target() { return host && pictured && tgt?.w ? tgt : null; },
    /** Hosted: gives back the picture's texture and framebuffer. */
    release() { if (tgt && !gl.isContextLost()) { gl.deleteTexture(tgt.tex); gl.deleteFramebuffer(tgt.fbo); } tgt = null; pictured = false; },
  };
}
