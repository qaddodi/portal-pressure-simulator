// The lobule's kept picture (lobule lag rec 1, 6 Nov 2026; /mnt/project-files/portal-reliability/lobule-lag-recs.md).
//
// The lobule is laid in the stage's context as one texture (the vessels' renderer's scr, veins-gl.js): the tissue blitted in, the vessel
// layer with its blood laid over it, the ductules over that, then the stage lays the texture under the labels and the glass. A frame where
// only the blood moved used to rebuild all of it (clear, blit, lay, a full-screen ductule pass) to change the pixels inside the lumens.
//
// Now that texture is kept. After a present that laid everything, a blood-only frame repaints only the blood's own squares in it, by one
// pass over exactly the squares the composite has just drawn: each pixel is worked out from the three things it is made of, as the present
// laid them, in the same order and the same arithmetic: the vessel layer (premultiplied, over), the tissue under it, and the ductules over
// both. Pixels outside the squares are not touched: nothing under them has changed. The ductules are shaded here by the same code as
// fx-gl.js shades them (a ductule reaching a lumen's edge is laid again over the blood, once, not twice); with the sinusoids' lining on
// (low protein) the kept picture is not used and the frame is laid whole as before.
//
// What the kept picture depends on is a handful of version numbers (veins-gl.js keepNote/keepBlood): the vessel layer's picture count,
// the tissue's, the overlay's arguments, the texture's own reallocation. Any of them moving, or anything the pass does not know about
// being on (a pass added over the figure that does not say it is `still`, the wide copy fading, a camera), lays the frame whole.

import { startProgram, compileDone, checkProgram } from './gl-compile.js';
import { uniformCache } from './uniform-cache.js';
import { MAX_DUCTS, PLUG_GLSL } from './fx-gl.js';

// The blood's squares (the composite's cell vertex shader without its zoom numbers): the same device corners, so the pass lands on the
// pixels the blood's own pass drew.
export const KEEP_VS = `#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in vec2 org;
uniform mat3 world;
uniform vec2 size;
uniform float cell;
void main() {
  vec3 d = world * vec3(org + corner * cell, 1.0);
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
}`;

// The ductules, as fx-gl.js shades them (its ductFS, one quad each; here a loop over them, the same lines in the same order: laid one after
// another over the picture they come out as the loop's one accumulated layer laid over it). tests/lobule-keep.test.js pins the two together.
export const DUCT_GLSL = `
  for (int j = 0; j < ${MAX_DUCTS}; j++) {
    if (j >= uND) break;
    vec4 A = uD0[j], B = uD1[j];
    vec2 q = p - A.xy;
    float d = length(q);
    if ((d - A.w - hl) * s > 2.0) continue;
    float lum = clamp(0.5 - (d - A.z) * s, 0.0, 1.0);
    float cell = clamp(0.5 - (A.z - d) * s, 0.0, 1.0) * clamp(0.5 - (d - A.w) * s, 0.0, 1.0);
    float ang = atan(q.y, q.x) - B.z, u = ang * NC / TAU, f = fract(u + 0.5) - 0.5;
    float rad = d < A.z ? length(q - vec2(cos(ang + B.z - f * TAU / NC), sin(ang + B.z - f * TAU / NC)) * A.z)
              : d > A.w ? length(q - vec2(cos(ang + B.z - f * TAU / NC), sin(ang + B.z - f * TAU / NC)) * A.w)
              : abs(d * sin(f * TAU / NC));
    float eR = clamp(0.5 - (rad - hl) * s, 0.0, 1.0);
    float eA = max(clamp(0.5 - (abs(d - A.z) - hl) * s, 0.0, 1.0), clamp(0.5 - (abs(d - A.w) - hl) * s, 0.0, 1.0));
    float ac = (floor(u) + 0.5) * TAU / NC + B.z;
    float nuc = clamp(0.5 - (length(q - vec2(cos(ac), sin(ac)) * B.x) - B.y) * s, 0.0, 1.0);
    c = over(c, uCLum, lum * uAlpha);
    c = over(c, uCCell, cell * uAlpha);
    c = over(c, uCEdge, eA * uAlpha);
    c = over(c, uCEdge, eR * uAlpha);
    c = over(c, uCEdge, eR * uAlpha);
    c = over(c, uCNuc, nuc * uAlpha);
  }`;

export const keepFS = () => `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D uOwn, uTis;          // the vessel layer with its blood (premultiplied); the tissue under it (opaque)
uniform vec4 uView; uniform vec2 uSize;   // the overlay's view (k, x, y, dpr) and the canvas, as fx-gl.js takes them
uniform int uND;                       // ductules
uniform vec4 uD0[${MAX_DUCTS}], uD1[${MAX_DUCTS}];
uniform vec4 uCLum, uCCell, uCEdge, uCNuc;
uniform float uEdge, uAlpha;
uniform int uPOn;                      // SOS: the scar inside the central vein (fx-gl.js plugAt), laid over everything
uniform vec4 uP, uPCol; uniform float uPG;
out vec4 o;
const float TAU = 6.283185307179586, NC = 16.0;
vec4 over(vec4 c, vec4 col, float a) { a *= col.a; return vec4(col.rgb * a + c.rgb * (1.0 - a), a + c.a * (1.0 - a)); }
${PLUG_GLSL}
void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  vec4 v = texelFetch(uOwn, ip, 0);
  vec4 r = v + texelFetch(uTis, ip, 0) * (1.0 - v.a);   // (the vessel layer laid over the tissue, premultiplied)
  if (uND > 0) {
    vec2 fc = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
    vec2 p = (fc / uView.w - uView.yz) / uView.x;
    float s = uView.x * uView.w, hl = uEdge * 0.5;
    vec4 c = vec4(0.0);${DUCT_GLSL}
    r = c + r * (1.0 - c.a);   // (the ductules laid over that, premultiplied)
  }
  if (uPOn > 0) {   // (then the scar over the vein, as fx-gl.js lays it after the ductules)
    vec2 fc = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
    vec4 pl = plugAt((fc / uView.w - uView.yz) / uView.x, uView.x * uView.w, uP, uPCol, uPG);
    r = pl + r * (1.0 - pl.a);
  }
  o = r;
}`;

const NAMES = ['world', 'size', 'cell', 'uOwn', 'uTis', 'uView', 'uSize', 'uND', 'uD0', 'uD1', 'uCLum', 'uCCell', 'uCEdge', 'uCNuc', 'uEdge', 'uAlpha', 'uPOn', 'uP', 'uPCol', 'uPG'];

/** The pass, made for a context. start() begins the program's compile; ready() is true once it has finished (never waited on: false
 *  means the frame is laid whole); draw() paints the squares. */
export function createKeep(gl) {
  const UC = uniformCache(gl);
  const D0 = new Float32Array(MAX_DUCTS * 4), D1 = new Float32Array(MAX_DUCTS * 4);   // alloc-rare: the ductules' two uniform arrays, made once and refilled
  let st = null, P = null, failed = false;
  const free = () => { if (st) { for (const x of st.sh) gl.deleteShader(x); st = null; } };
  return {
    start() {
      if (st || P || failed) return;
      try { st = startProgram(gl, KEEP_VS, keepFS()); } catch { failed = true; st = null; }   // alloc-rare: once, when the lobule's picture is first kept
    },
    ready() {
      if (P) return true;
      if (failed || !st) return false;
      let done;
      try { done = compileDone(gl, st); } catch { done = true; }
      if (!done) return false;
      try {
        const p = checkProgram(gl, st);
        const U = {};   // alloc-rare: once, when the program is published
        for (const n of NAMES) U[n] = gl.getUniformLocation(p, n);
        P = { p, U };   // alloc-rare: once, when the program is published
      } catch (e) { failed = true; console.warn('The lobule\'s kept picture falls back to laying the frame whole.', e); gl.deleteProgram(st.p); }
      free();
      return !!P;
    },
    /** world: the composite's 3 × 3 (a Float32Array); w, h: the canvas; cell: the squares' side; vao, n: the blood's squares; own, tis: the
     *  textures; ks: the overlay's record (nd, ducts, view, lum, cell, edge, nuc, width, alpha: veins-gl.js KS). */
    draw(world, w, h, cell, vao, n, own, tis, ks) {
      const U = P.U;
      gl.useProgram(P.p);
      UC.m3(U.world, world); UC.f2(U.size, w, h); UC.f1(U.cell, cell);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, own); UC.i1(U.uOwn, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tis); UC.i1(U.uTis, 1);
      const nd = ks.ducts ? Math.min(MAX_DUCTS, ks.ducts.length / 8) : 0;
      UC.i1(U.uND, nd);
      if (nd) {
        const v = ks.view, d = ks.ducts;
        UC.f4(U.uView, v[0], v[1], v[2], v[3]); UC.f2(U.uSize, w, h);
        D0.fill(0); D1.fill(0);
        for (let j = 0; j < nd; j++) for (let q = 0; q < 4; q++) { D0[j * 4 + q] = d[j * 8 + q]; D1[j * 4 + q] = d[j * 8 + 4 + q]; }
        UC.fv4(U.uD0, D0); UC.fv4(U.uD1, D1);
        UC.fv4(U.uCLum, ks.lum); UC.fv4(U.uCCell, ks.cell); UC.fv4(U.uCEdge, ks.edge); UC.fv4(U.uCNuc, ks.nuc);
        UC.f1(U.uEdge, ks.width); UC.f1(U.uAlpha, ks.alpha);
      }
      const pl = ks.plug, plOn = !!(pl && pl.on && ks.view);
      UC.i1(U.uPOn, plOn ? 1 : 0);
      if (plOn) {
        const v = ks.view;
        UC.f4(U.uView, v[0], v[1], v[2], v[3]); UC.f2(U.uSize, w, h);   // (the view is the overlay's, set for the scar even with no ductule listed)
        UC.f4(U.uP, pl.x, pl.y, pl.wall, pl.open); UC.fv4(U.uPCol, pl.col); UC.f1(U.uPG, pl.grow);
      }
      gl.bindVertexArray(vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
      gl.bindVertexArray(null);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null);
    },
    /** Gives the program back (the renderer is let go of). */
    release() { free(); if (P && !gl.isContextLost()) gl.deleteProgram(P.p); P = null; },
  };
}
