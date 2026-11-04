// The lobule's overlay on the GPU: the bile ductules' epithelium and, with the Lymph layer on, the lymph's drops and their albumin
// beads, cut away under the blood vessels, and the sinusoids' collagen lining. paintFx (lobule-zoom.js) draws the same picture with
// the 2D canvas over the whole screen: every frame while the lymph moves, and every frame of a pan, a pinch or a slide's camera move
// for the ductules alone, each a full-screen clear, thousands of paths filled and stroked on the main thread, and a full-screen
// canvas the browser then sends to the screen again. Here it is a few instanced draws and one pass over the screen.
//
// The same layers in the same order as paintFx: the ductules (lumen, the ring of 16 cells, their edges, their nuclei, all at 0.72),
// the drops, the beads' rings then their fill, the eraser (destination-out) and the lining. A layer that the 2D canvas fills as one
// path (the drops, the beads, the eraser, the lining) is one union: its pieces are drawn into one channel of a coverage target with
// MAX blending (overlaps never darken, as in one path's fill), and the last pass lays each layer's colour over by its coverage. The
// ductules are drawn analytically in that pass (six discs; every pixel tests the few near it).
//
// Without WebGL2, on a software renderer or once the context is lost, createFxGL returns null / reports lost, and paintFx draws.

import { startProgram, checkProgram } from './gl-compile.js';
import { fbComplete } from './gl-state.js';
import { uniformCache } from './uniform-cache.js';

export const FX_GPU = true;   // (switch deleted; kept for lobule-zoom.js until its own pass)
export const MAX_DUCTS = 8;

// A capsule (a segment with round ends, or a disc where both ends meet), filled or as a ring, drawn into one coverage channel.
// Instance: a = (x0, y0, x1, y1) world, b = (radius, unused). The quad covers the capsule and a margin, in device px.
const capVS = `#version 300 es
in vec4 a; in vec2 b;
uniform vec4 uView;     // k, x, y, dpr: device = (world · k + (x, y)) · dpr
uniform vec2 uSize;     // the canvas (device px)
uniform float uAdd;     // added to every radius (world): the eraser's wall grows with 0.6 / k
uniform float uRing;    // half the ring's width (world): a ring round each disc, not the disc (0: filled)
flat out vec4 vA; flat out vec2 vB;
void main() {
  int i = gl_VertexID;
  vec2 c = vec2(float(i & 1), float((i >> 1) & 1));
  float r = b.x + uAdd + uRing + 2.0 / (uView.x * uView.w);
  vec2 lo = min(a.xy, a.zw) - r, hi = max(a.xy, a.zw) + r;
  vec2 w = mix(lo, hi, c), d = (w * uView.x + uView.yz) * uView.w;
  gl_Position = vec4(d.x / uSize.x * 2.0 - 1.0, 1.0 - d.y / uSize.y * 2.0, 0.0, 1.0);
  vA = a; vB = vec2(b.x + uAdd, b.y);
}`;
const capFS = `#version 300 es
precision highp float;
uniform vec4 uView; uniform vec2 uSize; uniform float uRing;
flat in vec4 vA; flat in vec2 vB;
out vec4 o;
void main() {
  vec2 p = (vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y) / uView.w - uView.yz) / uView.x;
  vec2 ab = vA.zw - vA.xy, ap = p - vA.xy;
  float t = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-12), 0.0, 1.0);
  float d = length(ap - ab * t), s = uView.x * uView.w;
  float e = uRing > 0.0 ? abs(d - vB.x) - uRing : d - vB.x;
  float cov = clamp(0.5 - e * s, 0.0, 1.0);
  if (cov <= 0.0) discard;
  o = vec4(cov);
}`;

const quadVS = `#version 300 es
void main() { vec2 c = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1)); gl_Position = vec4(c * 2.0 - 1.0, 0.0, 1.0); }`;
// The last pass: the ductules, then each union layer's colour by its coverage, in paintFx's order. Premultiplied out.
const compFS = `#version 300 es
precision highp float;
uniform vec4 uView; uniform vec2 uSize;
uniform sampler2D uCov, uLin;          // drops, rings, beads, eraser; the lining (r)
uniform int uLy, uLine;                 // the lymph's layers drawn (1 / 0); the lining
uniform vec4 uCLy, uCRing, uCBead, uCLine;   // their colours (rgba, not premultiplied)
uniform int uND;                        // ductules
uniform vec4 uD0[${MAX_DUCTS}], uD1[${MAX_DUCTS}];   // x, y, rin, rout; rm, nucleus r, phase, -
uniform vec4 uCLum, uCCell, uCEdge, uCNuc;
uniform float uEdge, uAlpha;            // the cells' edge width (world); the ductules' opacity (0.72)
out vec4 o;
const float TAU = 6.283185307179586, NC = 16.0;
vec4 over(vec4 c, vec4 col, float a) { a *= col.a; return vec4(col.rgb * a + c.rgb * (1.0 - a), a + c.a * (1.0 - a)); }
void main() {
  vec2 fc = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
  vec2 p = (fc / uView.w - uView.yz) / uView.x;
  float s = uView.x * uView.w, hl = uEdge * 0.5;
  vec4 c = vec4(0.0);
  for (int j = 0; j < ${MAX_DUCTS}; j++) {
    if (j >= uND) break;
    vec4 A = uD0[j], B = uD1[j];
    vec2 q = p - A.xy;
    float d = length(q);
    if ((d - A.w - hl) * s > 2.0) continue;
    float lum = clamp(0.5 - (d - A.z) * s, 0.0, 1.0);
    float cell = clamp(0.5 - (A.z - d) * s, 0.0, 1.0) * clamp(0.5 - (d - A.w) * s, 0.0, 1.0);
    // The cells' edges: the radial lines between them (each stroked by both its cells) and their inner and outer arcs.
    float ang = atan(q.y, q.x) - B.z, u = ang * NC / TAU, f = fract(u + 0.5) - 0.5;
    float rad = d < A.z ? length(q - vec2(cos(ang + B.z - f * TAU / NC), sin(ang + B.z - f * TAU / NC)) * A.z)
              : d > A.w ? length(q - vec2(cos(ang + B.z - f * TAU / NC), sin(ang + B.z - f * TAU / NC)) * A.w)
              : abs(d * sin(f * TAU / NC));
    float eR = clamp(0.5 - (rad - hl) * s, 0.0, 1.0);
    float eA = max(clamp(0.5 - (abs(d - A.z) - hl) * s, 0.0, 1.0), clamp(0.5 - (abs(d - A.w) - hl) * s, 0.0, 1.0));
    // The nucleus of the cell the pixel is in: at the middle of its arc, on radius rm.
    float ac = (floor(u) + 0.5) * TAU / NC + B.z;
    float nuc = clamp(0.5 - (length(q - vec2(cos(ac), sin(ac)) * B.x) - B.y) * s, 0.0, 1.0);
    c = over(c, uCLum, lum * uAlpha);
    c = over(c, uCCell, cell * uAlpha);
    c = over(c, uCEdge, eA * uAlpha);
    c = over(c, uCEdge, eR * uAlpha);
    c = over(c, uCEdge, eR * uAlpha);
    c = over(c, uCNuc, nuc * uAlpha);
  }
  if (uLy > 0) {
    vec4 k = texelFetch(uCov, ivec2(gl_FragCoord.xy), 0);
    c = over(c, uCLy, k.r);
    c = over(c, uCRing, k.g);
    c = over(c, uCBead, k.b);
    c *= 1.0 - k.a;
  }
  if (uLine > 0) c = over(c, uCLine, texelFetch(uLin, ivec2(gl_FragCoord.xy), 0).r);
  o = c;
}`;

// (Through gl-compile.js: both programs started before either is read, so the driver compiles them side by side, and only the link's
// status read (?shaderwarm=0: one after the other, each shader's status first, as before).)
// alloc-rare: built once per program start (createFxGL setup), not per frame
const startOf = (gl, vs, fs, attrs = []) => startProgram(gl, vs, fs, attrs.map((n, i) => [n, i]));
// (The colour masks of the coverage channels, one array each, shared: a layer is drawn into one channel.)
const M_R = [true, false, false, false], M_G = [false, true, false, false], M_B = [false, false, true, false], M_A = [false, false, false, true];
export const fxShaders = { capVS, capFS, quadVS, compFS };   // (for the shader checks in the unit tests)

/** host ({ gl, canvas }: the lobule's vessel renderer's top, veins-gl.js): no canvas or context of its own; each draw lays the overlay
 *  over what is in the host's canvas (it is called at the end of each picture the host lays), and leaves the context as the host's
 *  own passes expect to find it. */
// alloc-rare: built once per context (createFxGL / restore), not per frame
export function createFxGL(canvas, { host = null } = {}) {
  const SCRN = () => (host && host.screen ? host.screen() : null);   // (the framebuffer the host's canvas stands in as: null, or a shared renderer's texture)
  let gl = null;
  let ucache = null;   // (the uniform cache, made at the first draw; uniforms are set only through it, uniform-cache.js)
  // alloc-rare: built once per context (createFxGL / restore), not per frame
  const D0 = new Float32Array(MAX_DUCTS * 4), D1 = new Float32Array(MAX_DUCTS * 4);   // (the ductules' two uniform arrays, refilled each frame)
  if (host) gl = host.gl;
  // alloc-rare: built once per context (createFxGL / restore), not per frame
  else return null;   // (hosted only, the two-contexts plan)
  if (!gl) return null;
  if (host) canvas = host.canvas;
  let lost = false, failed = false, P = null;
  // (A buffer per kind of instance: the eraser and the lining are kept while their key holds; the drops and beads change each frame.)
  // alloc-rare: built once per context (createFxGL / restore), not per frame
  const bufs = {};
  let cov = null, lin = null;   // the coverage targets, at the canvas's size
  function build() {
    // alloc-rare: built once per context (createFxGL / restore), not per frame
    const hc = startOf(gl, capVS, capFS, ['a', 'b']), hk = startOf(gl, quadVS, compFS);
    const cap = checkProgram(gl, hc), comp = checkProgram(gl, hk);
    // alloc-rare: built once per context (createFxGL / restore), not per frame
    for (const x of [...hc.sh, ...hk.sh]) gl.deleteShader(x);
    // alloc-rare: built once per context (createFxGL / restore), not per frame
    const loc = (p, names) => Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)]));
    // alloc-rare: built once per context (createFxGL / restore), not per frame
    P = {
      cap, comp,
      // alloc-rare: built once per context (createFxGL / restore), not per frame
      CU: loc(cap, ['uView', 'uSize', 'uAdd', 'uRing']),
      // alloc-rare: built once per context (createFxGL / restore), not per frame
      KU: loc(comp, ['uView', 'uSize', 'uCov', 'uLin', 'uLy', 'uLine', 'uCLy', 'uCRing', 'uCBead', 'uCLine', 'uND', 'uD0', 'uD1', 'uCLum', 'uCCell', 'uCEdge', 'uCNuc', 'uEdge', 'uAlpha']),
    };
    // alloc-rare: built once per context (createFxGL / restore), not per frame
    for (const k of ['erase', 'line', 'drops', 'beads']) {
      const vao = gl.createVertexArray(), buf = gl.createBuffer();
      gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 24, 0); gl.vertexAttribDivisor(0, 1);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 16); gl.vertexAttribDivisor(1, 1);
      // alloc-rare: built once per context (createFxGL / restore), not per frame
      bufs[k] = { vao, buf, n: 0, data: null, cap: 0 };
    }
    gl.bindVertexArray(null);
  }
  try { build(); } catch (err) { console.warn('The lobule overlay falls back to the 2D canvas.', err); gl.getExtension('WEBGL_lose_context')?.loseContext(); return null; }
  // (Hosted, the host's owner makes the layer again with the renderer it makes after a loss.)
  // alloc-rare: context loss/restore listeners, made once
  if (!host) canvas.addEventListener('webglcontextlost', (e) => { lost = true; cov = null; lin = null; P = null; e.preventDefault?.(); });
  // alloc-rare: context loss/restore listeners, made once
  if (!host) canvas.addEventListener('webglcontextrestored', () => { try { build(); lost = false; for (const k in bufs) { bufs[k].arr = null; bufs[k].cap = 0; } } catch { failed = true; } });
  function target(t, w, h) {
    if (t && t.w === w && t.h === h) return t;
    if (t) { gl.deleteFramebuffer(t.fbo); gl.deleteTexture(t.tex); }
    const tex = gl.createTexture(), fbo = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = fbComplete(gl, gl.FRAMEBUFFER, 'rgba8', w, h);   // (asked per framebuffer, size and attachment set: gl-state.js)
    gl.bindFramebuffer(gl.FRAMEBUFFER, SCRN());
    // alloc-rare: a coverage target is made when the canvas size changes
    return ok ? { tex, fbo, w, h } : (gl.deleteFramebuffer(fbo), gl.deleteTexture(tex), null);
  }
  function feed(k, data) {
    const B = bufs[k];
    if (B.arr === data) return B.n;
    gl.bindBuffer(gl.ARRAY_BUFFER, B.buf);
    // (R13: the buffer's storage kept and its used part rewritten while it fits; grown, to twice, only when outgrown.)
    if (data.byteLength <= B.cap) gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    else { B.cap = Math.max(data.byteLength * 2, 1536); gl.bufferData(gl.ARRAY_BUFFER, B.cap, gl.DYNAMIC_DRAW); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data); }
    B.arr = data; B.n = data.length / 6;
    return B.n;
  }
  // One union layer: instances k into the channel of the bound target (colorMask), MAX blended.
  function layer(k, data, mask, add, ring) {
    const n = feed(k, data);
    if (!n) return;
    gl.colorMask(mask[0], mask[1], mask[2], mask[3]);
    ucache.f1(P.CU.uAdd, add); ucache.f1(P.CU.uRing, ring);
    gl.bindVertexArray(bufs[k].vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
  }
  // alloc-rare: the layer object is made once per createFxGL, its methods are kept
  return {
    // alloc-rare: the layer object is made once per createFxGL, its methods are kept
    get lost() { return lost || failed || !P || gl.isContextLost(); },
    /** Gives back the coverage targets and the canvas's memory (the overlay is not shown). */
    release() { if (cov) { gl.deleteFramebuffer(cov.fbo); gl.deleteTexture(cov.tex); cov = null; } if (lin) { gl.deleteFramebuffer(lin.fbo); gl.deleteTexture(lin.tex); lin = null; } },
    /** One frame. W, H: the canvas (device px); view: [k, x, y, dpr]; ducts: Float32Array of 8 per ductule (x, y, rin, rout, rm, nr,
     *  phase, 0) with its colours { lum, cell, edge, nuc } (rgba 0–1), edge (world) and alpha; lymph: null, or { drops, beadRings, erase,
     *  eraseAdd, ringHalf, line, colours { ly, ring, bead, line } } (instances of 6 floats: x0, y0, x1, y1, r, 0; line: null for
     *  none). False when it could not draw (the 2D canvas draws that frame). */
    draw({ W, H, view, ducts, duct, lymph }) {
      if (this.lost) return false;
      if (!ucache) ucache = uniformCache(gl);
      // (Hosted: over the whole of the host's canvas, as its owner sized it. The view places the overlay from the canvas's top left,
      // so a canvas larger than asked for (the wide copy's tiles, cropped from it) shows the same overlay there, and more of it.)
      if (host) { W = canvas.width; H = canvas.height; if (!W || !H) return false; }
      else if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.SCISSOR_TEST);
      if (lymph) {
        cov = target(cov, W, H);
        if (!cov) return false;
        gl.bindFramebuffer(gl.FRAMEBUFFER, cov.fbo);
        gl.viewport(0, 0, W, H);
        gl.colorMask(true, true, true, true); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(P.cap);
        ucache.f4(P.CU.uView, view[0], view[1], view[2], view[3]); ucache.f2(P.CU.uSize, W, H);
        gl.enable(gl.BLEND); gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
        layer('drops', lymph.drops, M_R, 0, 0);
        layer('beads', lymph.beadRings, M_G, 0, lymph.ringHalf);
        layer('beads', lymph.beadRings, M_B, 0, 0);   // (the same discs, filled)
        layer('erase', lymph.erase, M_A, lymph.eraseAdd, 0);
        if (lymph.line) {
          lin = target(lin, W, H);
          if (!lin) { gl.disable(gl.BLEND); gl.colorMask(true, true, true, true); gl.bindFramebuffer(gl.FRAMEBUFFER, SCRN()); return false; }
          gl.bindFramebuffer(gl.FRAMEBUFFER, lin.fbo);
          gl.colorMask(true, true, true, true); gl.clear(gl.COLOR_BUFFER_BIT);
          layer('line', lymph.line, M_R, 0, 0);
        }
        gl.bindVertexArray(null);
        gl.disable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.colorMask(true, true, true, true);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, SCRN());
      gl.viewport(0, 0, W, H);
      gl.useProgram(P.comp);
      const U = P.KU;
      ucache.f4(U.uView, view[0], view[1], view[2], view[3]); ucache.f2(U.uSize, W, H);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, lymph && cov ? cov.tex : null); ucache.i1(U.uCov, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, lymph?.line && lin ? lin.tex : null); ucache.i1(U.uLin, 1);
      gl.activeTexture(gl.TEXTURE0);
      ucache.i1(U.uLy, lymph ? 1 : 0); ucache.i1(U.uLine, lymph?.line ? 1 : 0);
      const C = lymph?.colours;
      if (C) { ucache.fv4(U.uCLy, C.ly); ucache.fv4(U.uCRing, C.ring); ucache.fv4(U.uCBead, C.bead); ucache.fv4(U.uCLine, C.line); }
      const nd = ducts ? Math.min(MAX_DUCTS, ducts.length / 8) : 0;
      ucache.i1(U.uND, nd);
      if (nd) {
        D0.fill(0); D1.fill(0);
        for (let j = 0; j < nd; j++) for (let q = 0; q < 4; q++) { D0[j * 4 + q] = ducts[j * 8 + q]; D1[j * 4 + q] = ducts[j * 8 + 4 + q]; }
        ucache.fv4(U.uD0, D0); ucache.fv4(U.uD1, D1);
        ucache.fv4(U.uCLum, duct.lum); ucache.fv4(U.uCCell, duct.cell); ucache.fv4(U.uCEdge, duct.edge); ucache.fv4(U.uCNuc, duct.nuc);
        ucache.f1(U.uEdge, duct.width); ucache.f1(U.uAlpha, duct.alpha);
      }
      // (Hosted: laid over the host's picture, premultiplied. On its own canvas: the canvas is the overlay alone.)
      if (host) { gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); }
      else { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (host) {
        // (The context as the host's own passes expect to find it.)
        gl.disable(gl.BLEND); gl.useProgram(null); gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null);
      }
      return true;
    },
  };
}
