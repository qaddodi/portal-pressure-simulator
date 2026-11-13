// The Doppler monitor's picture on the GPU: the scrolling spectral ring, the noise floor over it and the wall filter's dark band,
// one fragment per pixel of the trace. It has no WebGL context of its own (pure-GPU plan B1, 4 Nov 2026: contexts from 8 to 2): it
// draws in the context of the monitor's chart drawer (trace-gl.js, the shared pool), inside the drawer's own frame, as the first thing
// in the trace's rectangle, and the drawer lays the margins, words, ticks and calipers over it in the same picture. The ring is a
// texture of that context; the spectrum's new lines reach it as a GPU draw (doppler-synth.js) or a texture update of those columns alone.
//
// The same picture as before: the ring and the noise are read texel for texel, the noise is added and clamped as 'lighter' adds it, and
// the band darkens as the gradient's black did. There is no 2D path (the owner, 1 Nov 2026: nothing off the GPU). A drawer that cannot
// draw (no WebGL2, a lost context) shows the trace black; a context made again, or the chart moved to another pool, builds the
// programs and the ring afresh (`lost` holds until the program is published) and the monitor makes the ring whole again.

import { startProgram, checkProgram, exerciseDraw, publishWhenDone, stillCompiling } from './gl-compile.js';
import { SYNTH_VS, SYNTH_FS, SYNTH_UNIS } from './doppler-synth.js';
import { dopplerMap } from './dopplerColor.js';
import { caught } from './caught.js';

const VS = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D ring;
uniform ivec2 size;      // the trace's width and height (device px; the ring's too)
uniform ivec2 org;       // the trace's bottom-left corner in the canvas (device px, from the bottom)
uniform int p;           // the ring column of the newest line: the screen's left edge shows column p + 1
uniform ivec2 nOff;      // where the noise floor is read from (its view, moved a few times a second)
uniform float nBin;      // the noise's frequency bin, px
uniform int nRun;        // how many columns share one noise line
uniform float noiseA;    // the noise's share (1 on the grey spectrum, 0.3 under the colour modes)
uniform vec2 wall;       // the wall filter's band: the baseline's row from the top, its half height (px)
uniform float rule;      // the baseline's own thin line (0 for none: a stent's clean background shows the baseline by it)
out vec4 o;
// The noise floor, worked out here where it was a texture built on the CPU (a log and a pow for each of 2 M pixels, at every size change):
// exponential power, one draw for each noise line (a few columns) and frequency bin, smooth over the bins, log-compressed.
uint nh(uint a, uint b) {
  uint h = a * 747796405u + b * 2891336453u + 1013904223u;
  h ^= h >> 15; h *= 2246822519u; h ^= h >> 13; h *= 3266489917u; h ^= h >> 16;
  return h;
}
float nexpo(uint g, uint b) { return -log(1.0 - float(nh(g, b) >> 8) * (1.0 / 16777216.0) * 0.999999); }
vec3 floorAt(ivec2 t) {
  uint g = uint(t.x / nRun);
  float fb = float(t.y) / nBin, f0 = fract(fb), f = f0 * f0 * (3.0 - 2.0 * f0);
  uint b0 = uint(floor(fb));
  float N = nexpo(g, b0) + (nexpo(g, b0 + 1u) - nexpo(g, b0)) * f;
  float I = (log(N) * 4.342944819032518 - 2.5) / 30.0;
  I = I <= 0.0 ? 0.0 : pow(min(1.0, I), 1.2);
  return vec3(236.0, 240.0, 250.0) / 255.0 * I;
}
void main() {
  int lx = int(gl_FragCoord.x) - org.x, ly = size.y - 1 - (int(gl_FragCoord.y) - org.y);
  int c = lx + p + 1;
  if (c >= size.x) c -= size.x;
  vec3 r = texelFetch(ring, ivec2(c, ly), 0).rgb;
  vec3 n = floorAt(nOff + ivec2(lx, ly));
  vec3 col = min(vec3(1.0), r + n * noiseA);
  float a = wall.y > 0.0 ? 0.9 * max(0.0, 1.0 - abs(float(ly) + 0.5 - wall.x) / wall.y) : 0.0;
  float ln = rule * max(0.0, 1.0 - abs(float(ly) + 0.5 - wall.x));
  o = vec4(min(vec3(1.0), col * (1.0 - a) + ln * vec3(0.2, 0.21, 0.23)), 1.0);
}`;

/**
 * The monitor's GPU drawer, or null where WebGL2 is missing. attach(pen) is called at the start of each of the monitor's frames with the
 * chart drawer (trace-gl.js, `ctx.gpu`) the frame is drawn through, or null where there is none.
 */
export function createDopplerGL({ onReady = null } = {}) {
  if (typeof document === 'undefined' || typeof WebGL2RenderingContext === 'undefined') return null;
  let pen = null, gl = null, gen = -1, dead = false;
  // (lost: the GPU does not draw the monitor, from no drawer (or a drawer that cannot draw) until the rebuilt program is published.)
  let lost = true, waitingDraw = false;
  let started = null, startedL = null, quad = null, vao = null, ringT = null, stopPoll = null;
  let prog = null, U = null, failed = false;
  // (The spectrum's lines worked out on the GPU, doppler-synth.js: its program, the two textures of each line's numbers by ring column, the arrays
  // they are sent from, and the framebuffer that draws into the ring. synthFailed: the shader did not build, and the CPU writes the lines.)
  let startedLS = null, startedS = null, stopPollS = null, progS = null, synthFailed = false, colAT = null, colBT = null, colAArr = null, colBArr = null, cw = 0, synthFb = null;
  const SU = {}, SEED = (Math.random() * 4294967296) >>> 0;
  let rw = 0, rh = 0;
  const tex = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
  // (Kept for the life of the drawer, so publishing the program and drawing make no objects: the uniforms' places, and the 1 × 1 texel of the warm-up draw.)
  const UNI = { ring: null, nBin: null, nRun: null, size: null, org: null, p: null, nOff: null, noiseA: null, wall: null, rule: null };
  const DOT = new Uint8Array([0, 0, 0, 255]);
  const oneTexel = (t) => { gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, DOT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); };
  // What the drawer's context holds for this monitor: the program (started now, published once the driver has finished it, gl-compile.js;
  // render() publishes it if it comes first), the quad and the textures. Made when the monitor first draws through a drawer, and again
  // whenever the drawer's context is made again or the drawer moves to another context (its `gen` changes): none of it survives that.
  // The ring is made whole by the monitor on its next GPU frame (it marks it while `lost` holds).
  // (Called inside a frame, with the drawer's state entered, or outside any: nothing here draws.)
  function build(g, n) {
    prog = null; U = null; failed = false; rw = rh = 0; lost = true; gl = g; gen = n;
    started = startProgram(gl, VS, FS, [['p', 0]]);
    startedS = startProgram(gl, SYNTH_VS, SYNTH_FS, [['p', 0]]); startedLS = null;
    progS = null; synthFailed = false; cw = 0; colAArr = colBArr = null;
    startedL = [started];   // (the list each frame's status ask is given while the program is compiling: made here, once for each program)
    quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    ringT = tex(); colAT = tex(); colBT = tex(); synthFb = gl.createFramebuffer();
    stopPoll?.(); stopPoll = publishWhenDone(gl, [started], publish);
    stopPollS?.(); stopPollS = publishWhenDone(gl, [startedS], publishSynth);   // (its own: the monitor draws without it, the CPU writing the lines, until it is published)
  }
  // The drawer this frame is drawn through, and the build for its context: false where the drawer cannot draw now.
  function attach(p) {
    if (dead) return false;
    pen = p || null;
    const g = pen?.glNow?.() || null;
    if (!g || g.isContextLost()) { if (gl) { gl = null; lost = true; } return false; }
    if (g !== gl || pen.gen !== gen) {
      try { build(g, pen.gen); } catch (e) { failed = true; lost = false; console.warn('Doppler on the GPU: could not be built; the trace stays black.', e); return false; }
    }
    return true;
  }
  const startedL2 = () => (startedLS ||= [startedS]);   // (the list the status ask is given: made once for each program)
  function publishSynth() {
    if (progS || synthFailed || !gl || gl.isContextLost()) return;
    const mine = gl;
    try {
      const p = checkProgram(gl, startedS);
      for (const n of SYNTH_UNIS) SU[n] = gl.getUniformLocation(p, n);
      progS = p;
      // (One 1 × 1 draw, so the browser builds the shader's GPU pipeline now, beside the page, not in the first frame that draws lines.)
      exerciseDraw(gl, () => { gl.useProgram(p); gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null); });
    } catch (e) { if (mine.isContextLost()) return; synthFailed = true; console.warn('Doppler on the GPU: the spectrum shader failed; the lines are made on the CPU.', e); }
  }
  function publish() {
    if (prog || failed || !gl || gl.isContextLost()) return;
    try {
      prog = checkProgram(gl, started);
      U = UNI;
      U.ring = gl.getUniformLocation(prog, 'ring'); U.nBin = gl.getUniformLocation(prog, 'nBin'); U.nRun = gl.getUniformLocation(prog, 'nRun'); U.size = gl.getUniformLocation(prog, 'size'); U.org = gl.getUniformLocation(prog, 'org');
      U.p = gl.getUniformLocation(prog, 'p'); U.nOff = gl.getUniformLocation(prog, 'nOff'); U.noiseA = gl.getUniformLocation(prog, 'noiseA'); U.wall = gl.getUniformLocation(prog, 'wall'); U.rule = gl.getUniformLocation(prog, 'rule');
      const d0 = gl.createTexture();
      oneTexel(d0);
      // alloc-rare: once for a program, as it is published (a frame comes here only while no program is published; the guard at the top returns after)
      exerciseDraw(gl, () => {
        gl.useProgram(prog);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, d0); gl.uniform1i(U.ring, 0);
        gl.uniform1f(U.nBin, 2); gl.uniform1i(U.nRun, 1);
        gl.uniform2i(U.size, 1, 1);
        gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null);
      });
      gl.deleteTexture(d0);
      lost = false;   // (after a rebuild: the GPU draws the monitor again from the next frame)
      if (waitingDraw) { waitingDraw = false; try { onReady?.(); } catch (e2) { console.warn('Doppler on the GPU: the redraw failed.', e2); } }
    } catch (e) {
      if (gl.isContextLost()) { prog = null; U = null; return; }   // (lost while it was read: the rebuild makes it again)
      failed = true; console.warn('Doppler on the GPU: shader failed; the trace stays black.', e);
    }
  }
  // (A blit between two textures through the framebuffers of the stretch under way: rf to read, df to draw.)
  let rf = null, df = null;
  const blit = (src, dst, sx0, sx1, dx0, dx1, sh, dh, filter) => {
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, rf); gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, src, 0);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, df); gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst, 0);
    gl.blitFramebuffer(sx0, 0, sx1, sh, dx0, 0, dx1, dh, gl.COLOR_BUFFER_BIT, filter);
  };
  // (An ImageData's own array is the same object each time it is asked for: its Uint8Array view is made once for it, not on every send.)
  let viewOf = null, viewAs = null;
  const bytes = (d) => {
    if (d instanceof Uint8Array) return d;
    if (d !== viewOf) { viewOf = d; viewAs = new Uint8Array(d.buffer, d.byteOffset, d.byteLength); }   // alloc-rare: once for each ImageData given (the noise floor's, set once, or again for a new one)
    return viewAs;
  };
  // Enters the drawer's open frame for a pass of this monitor's own (its draws laid, its scissor and clip off); leave() gives its state back.
  const enter = () => (gl && pen && !dead && !failed ? pen.enter() : null);
  return {
    get lost() { return lost || failed || !gl; },
    attach,
    /** The whole ring from an ImageData or a canvas of the ring's size (its first row the top). */
    ringAll(src, w, h) {
      if (!enter()) return;
      try {
        rw = w; rh = h;
        gl.bindTexture(gl.TEXTURE_2D, ringT);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        if (src instanceof ImageData) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes(src.data));
        else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      } finally { pen.leave(); }
    },
    /**
     * A ring of a new size (w × h) from the one the GPU holds, stretched as the 2D canvas's copies did: the ring turned so its oldest line
     * (column po + 1) is on the left, then laid with that line at column sx, scaled to the new size. Two blits each way, on the GPU.
     * False where there is nothing to stretch (the ring is then sent whole).
     */
    stretch(w, h, po, sx) {
      if (lost || failed || !rw || !rh || w < 1 || h < 1 || !enter()) return false;
      try {
        const oW = rw, oH = rh, T = tex(), N = tex();
        gl.bindTexture(gl.TEXTURE_2D, T); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, oW, oH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindTexture(gl.TEXTURE_2D, N); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        rf = gl.createFramebuffer(); df = gl.createFramebuffer();
        gl.disable(gl.SCISSOR_TEST);
        // (turned: old columns po + 1 … end first, then 0 … po)
        if (po + 1 < oW) blit(ringT, T, po + 1, oW, 0, oW - po - 1, oH, oH, gl.NEAREST);
        blit(ringT, T, 0, po + 1, oW - po - 1, oW, oH, oH, gl.NEAREST);
        // (laid: the turned ring scaled into new columns sx … end, then 0 … sx − 1)
        const fx = oW / w, cut = Math.round((w - sx) * fx);
        if (w - sx > 0) blit(T, N, 0, cut, sx, w, oH, h, gl.LINEAR);
        if (sx > 0) blit(T, N, cut, oW, 0, sx, oH, h, gl.LINEAR);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
        gl.deleteFramebuffer(rf); gl.deleteFramebuffer(df); rf = df = null; gl.deleteTexture(T); gl.deleteTexture(ringT);
        ringT = N; rw = w; rh = h;
        return true;
      } finally { pen.leave(); }
    },
    /** Columns x0 … x0 + n − 1 of the ring from the ImageData img (the ring's size), as synthesised. */
    ringCols(img, x0, n) {
      if (img.width !== rw || img.height !== rh || n <= 0 || !enter()) return;
      try {
        gl.bindTexture(gl.TEXTURE_2D, ringT);
        gl.pixelStorei(gl.UNPACK_ROW_LENGTH, img.width);
        gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x0);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, 0, n, rh, gl.RGBA, gl.UNSIGNED_BYTE, bytes(img.data));
        gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
        gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
      } finally { pen.leave(); }
    },
    /** Whether the GPU writes the spectrum's lines (its program is published, the context is whole). */
    canSynth() {
      if (lost || failed || synthFailed || !gl || gl.isContextLost()) return false;
      // (Its poll waits for the page to be left alone, which a busy phone may not be for long: once the driver is done compiling it, the
      // program is published here, as the monitor's own is in render(), never waiting for the driver inside a frame.)
      if (!progS && startedS) { if (stillCompiling(gl, startedL2())) { stopPollS?.want?.(); return false; } publishSynth(); }
      return !!progS;
    },
    /** The ring at this size (an empty texture of it where it is another size): the lines are then drawn into it by synth(). */
    ringSize(w, h) {
      if (rw === w && rh === h) return;
      if (!enter()) return;
      try {
        gl.bindTexture(gl.TEXTURE_2D, ringT); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        rw = w; rh = h;
      } finally { pen.leave(); }
    },
    /** One line's numbers, by ring column x (the ring's width must have been given to ringSize). */
    setCol(x, P, L, sigHi, sigLo, gain, lineS, flags, cn) {
      if (cw !== rw) {
        if (!rw || !enter()) return;
        try {
          cw = rw; colAArr = new Float32Array(cw * 4); colBArr = new Float32Array(cw * 4);   // alloc-rare: once for each ring width
          gl.bindTexture(gl.TEXTURE_2D, colAT); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, cw, 1, 0, gl.RGBA, gl.FLOAT, null);
          gl.bindTexture(gl.TEXTURE_2D, colBT); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, cw, 1, 0, gl.RGBA, gl.FLOAT, null);
        } finally { pen.leave(); }
      }
      const q = x * 4;
      colAArr[q] = P; colAArr[q + 1] = L; colAArr[q + 2] = sigHi; colAArr[q + 3] = sigLo;
      colBArr[q] = gain; colBArr[q + 1] = lineS; colBArr[q + 2] = flags; colBArr[q + 3] = cn;
    },
    /** The lines of ring columns x0 … x0 + n − 1 (set by setCol) drawn into the ring, with the geometry G, on the GPU. */
    synth(x0, n, G) {
      if (n <= 0 || !progS || cw !== rw || !enter()) return;
      try {
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, colAT); gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, 0, n, 1, gl.RGBA, gl.FLOAT, colAArr, x0 * 4);
        gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, colBT); gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, 0, n, 1, gl.RGBA, gl.FLOAT, colBArr, x0 * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, synthFb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ringT, 0);
        gl.viewport(0, 0, rw, rh);
        gl.enable(gl.SCISSOR_TEST); gl.scissor(x0, 0, n, rh);
        gl.disable(gl.BLEND);
        gl.useProgram(progS);
        gl.uniform1i(SU.colA, 2); gl.uniform1i(SU.colB, 3);
        gl.uniform1f(SU.rBase, G.rBase); gl.uniform1f(SU.rPxPerV, G.rPxPerV); gl.uniform1f(SU.fade, G.fade); gl.uniform1f(SU.wfV, G.wfV);
        gl.uniform1f(SU.spkPx, G.spkPx); gl.uniform1f(SU.spkMix, G.spkMix); gl.uniform1f(SU.span, G.span); gl.uniform1f(SU.uK, G.uK);
        gl.uniform1i(SU.venous, G.venous ? 1 : 0); gl.uniform1i(SU.stent, G.stent ? 1 : 0); gl.uniform1i(SU.mode, G.mode); gl.uniform1ui(SU.seed, SEED);
        const M = dopplerMap();
        gl.uniform3fv(SU.cToward, M.TOWARD); gl.uniform3fv(SU.cAway, M.AWAY);
        gl.uniform3fv(SU.cVarT0, M.VAR_TOWARD[0]); gl.uniform3fv(SU.cVarT1, M.VAR_TOWARD[1]);
        gl.uniform3fv(SU.cVarA0, M.VAR_AWAY[0]); gl.uniform3fv(SU.cVarA1, M.VAR_AWAY[1]); gl.uniform3fv(SU.cWhite, M.WHITE);
        gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null);
        gl.disable(gl.SCISSOR_TEST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.activeTexture(gl.TEXTURE0);
      } finally { pen.leave(); }
    },
    /**
     * The trace drawn into the drawer's frame at (dx, dy) of its W × H target (device px, from the top left): the ring from column p + 1 on
     * the left, the noise view at (nx, ny) added with share noiseA, and the wall filter's band about the baseline (base px from the trace's
     * top, half height wf px). Only the trace's rectangle is drawn, opaque; the drawer's margins and words are laid by the monitor, round it.
     */
    render({ W, H, dx, dy, RW, RH, p, nx, ny, noiseA, rule, base, wf, nBin, nRun }) {
      // (Review pass 2, item 2: a frame that comes while the shader is still compiling does not publish it, where reading its status
      // waits for the driver inside the frame. It draws nothing (the trace stays black, as for a lost context), the poller publishes
      // the program the moment the driver is done, and onReady asks the monitor to draw again. ?shaderready=0: published here, as before.)
      if (!gl || !pen) return false;
      if (!prog && started && stillCompiling(gl, startedL)) { stopPoll?.want?.(); waitingDraw = true; return false; }
      publish();
      if (lost || failed || RW !== rw || RH !== rh || !enter()) return false;
      try {
        const oy = H - dy - RH;
        gl.viewport(dx, oy, RW, RH);
        gl.disable(gl.BLEND);
        gl.useProgram(prog);
        gl.uniform2i(U.org, dx, oy);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, ringT); gl.uniform1i(U.ring, 0);
        gl.uniform1f(U.nBin, nBin); gl.uniform1i(U.nRun, nRun);
        gl.uniform2i(U.size, RW, RH);
        gl.uniform1i(U.p, p);
        gl.uniform2i(U.nOff, nx, ny);
        gl.uniform1f(U.noiseA, noiseA); gl.uniform1f(U.rule, rule || 0);
        gl.uniform2f(U.wall, base, wf);
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);
        return true;
      } finally { pen.leave(); }
    },
    dispose() {
      dead = true; stopPoll?.(); stopPollS?.();
      if (gl && !gl.isContextLost()) {
        try { gl.deleteTexture(ringT); gl.deleteTexture(colAT); gl.deleteTexture(colBT); gl.deleteFramebuffer(synthFb); gl.deleteBuffer(quad); gl.deleteVertexArray(vao); gl.deleteProgram(prog); gl.deleteProgram(progS); } catch (e) { caught('doppler-gl:dispose', e); /* a lost context holds nothing */ }
      }
      gl = pen = null;   // (the drawer's context is shared: it stays for the others)
    },
  };
}
