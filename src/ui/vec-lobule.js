// The lobule under the Vector vessel renderer (docs/recommendations/vector-renderer-plan.md, 9.I; workstream I).
//
// With Settings › Display › Vector chosen the lobule's vessels are drawn by Vector as the figure's are: the lobule is a second instance of
// the vessel renderer in the figure's context (veins-gl.js `who: 'lobule'`), and its API (setGeometry, setTubes, setFlow, setRadii, draw,
// drawRows, composite) keeps its meaning, so lobule-zoom.js feeds Vector the way it feeds the other two. This file is what that
// instance needs besides the figure's:
//
//  1. Its flow rows, read as the lobule writes them (lobule-zoom.js drawGL): `indexFlow` lists the rows that can show blood or lymph (a
//     BLOOD frame draws only those strips; the vessels seen end-on carry none), the lymph rows (flow texel 1.x = -1: Vector's blood
//     material draws their dashes with `lymphAt`), and counts the rows with a flow factor other than 0 (the lobule's is 0: flow texel
//     6.y stays 0, so the stream's distance and drift are the CPU's own, `flowD` and `flowDrift` return them as given).
//  2. Its kept picture (lobule-keep.js): the lobule's texture holds the tissue, the vessels with their blood and the ductules, and a
//     frame where only the blood moved repaints just the pixels inside Vector's blood boxes. `createVecLobule(...).keepBlood` does it
//     with the very shader lobule-keep.js uses (its `keepFS`, imported, so the arithmetic is one text), one scissored draw a box, and
//     under the same version stamps (`createStamp`), so a picture whose tissue, overlay, ductules, texture or vessel layer moved is
//     laid whole instead.
//  3. The tissue underneath (tissue-gl.js) and the present stay the figure's: Vector writes the lobule's vessels into the instance's own
//     picture over nothing (the lobule has no organs), and the present lays the tissue under it and the tops over it, exactly as it lays
//     them under the other two renderers. Nothing here draws a classic or mesh vessel pass.
//
// Everything is node-testable (tests/vec-lobule.test.js): the flow index and the stamps are plain JS, the pass is a program text.

import { startProgram, compileDone, checkProgram } from './gl-compile.js';
import { uniformCache } from './uniform-cache.js';
import { keepFS } from './lobule-keep.js';
import { MAX_DUCTS } from './fx-gl.js';

// ── The lobule's flow rows ──
// As veins-gl FLOW_TEXELS (a test pins the equality; this file imports no GL code).
export const FLOW_TEXELS = 8;
const ROW = FLOW_TEXELS * 4;
/** Floats of a flow row: texel 1.x (the lymph mark), texel 1.z (the strength) and texel 6.y (the flow factor). */
export const F1X = 4, F1Z = 6, FACTOR = 25;
/** A row whose flow texel 1.x is this carries lymph dashes, not blood (lobule-zoom.js; veins-gl.js lymphAt). */
export const LYMPH_MARK = -1;

/**
 * Which rows of the lobule's flow data can show blood or lymph. `out` is kept by the caller and written in place:
 * { rows: Uint16Array of the rows that show something, n, lymph: Uint16Array of the lymph rows, nLymph, anchored: rows whose flow factor
 * is not 0 }. A row shows something when its strength (texel 1.z) is above 0, the test the blood shader makes before it draws; the
 * vessels seen end-on (the portal venule, the arteriole and ductule, the central vein, the lymphatic) have strength 0 and are not listed.
 */
export function indexFlow(flow, nRows, out) {
  if (!out.rows || out.rows.length < nRows) { out.rows = new Uint16Array(nRows); out.lymph = new Uint16Array(nRows); }   // alloc-rare: grown to the lobule's row count, never on a steady frame
  let n = 0, nl = 0, anch = 0;
  for (let r = 0; r < nRows; r++) {
    const o = r * ROW;
    if (flow[o + FACTOR] !== 0) anch++;
    if (!(flow[o + F1Z] > 0)) continue;
    out.rows[n++] = r;
    if (flow[o + F1X] === LYMPH_MARK) out.lymph[nl++] = r;
  }
  out.n = n; out.nLymph = nl; out.anchored = anch;
  return out;
}

// ── The kept picture's version stamps ──
/**
 * What the picture in the lobule's texture was made from at the last whole present: the vessel layer's picture count, the texture's
 * reallocation count, and the tissue's, the overlay's and the ductules' versions (veins-gl.js keepNote and keepBlood keep the same five
 * numbers for the classic and mesh renderers). `note` records them after a whole present that went through the tissue under it; `same`
 * is true while nothing has moved; `drop` forgets them.
 */
export function createStamp() {
  const k = { on: false, pic: -1, gen: -1, v1: -1, v2: -1, v3: -1 };
  return {
    get on() { return k.on; },
    note(laid, pic, gen, ks) { k.on = false; if (!laid || !ks) return; k.on = true; k.pic = pic; k.gen = gen; k.v1 = ks.v1; k.v2 = ks.v2; k.v3 = ks.v3; },
    same(pic, gen, ks) { return k.on && !!ks && k.pic === pic && k.gen === gen && k.v1 === ks.v1 && k.v2 === ks.v2 && k.v3 === ks.v3; },
    drop() { k.on = false; },
  };
}

// ── The kept picture's repaint over boxes ──
// One triangle that covers the target; the scissor box cuts it to the blood's box, so the fragment shader is lobule-keep.js's own.
export const KEEP_BOX_VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
const NAMES = ['uOwn', 'uTis', 'uView', 'uSize', 'uND', 'uD0', 'uD1', 'uCLum', 'uCCell', 'uCEdge', 'uCNuc', 'uEdge', 'uAlpha'];

/**
 * The lobule's pieces for a Vector instance, made for a context.
 *   read():   the lobule's account of what its picture is made of, as veins-gl keepRead gives it (the record `ks` of lobule-keep.js),
 *             or null when the picture cannot be kept now (a pass that is not `still`, a camera, an upscale, the wide copy fading...).
 *   target(): { fbo, gen, w, h } the framebuffer the picture is laid in (the instance's `scr`) and how many times it was made again.
 *   seq():    the vessel layer's picture count.
 *   laid():   asks the host to lay the picture (veins-gl `share.present`).
 * Returns { start, ready, noteLaid, keepBlood, release, stamp }; `keepBlood(boxes, n, own)` is false when the picture is not kept or
 * anything it is made of has moved: the caller then lays the frame whole.
 */
export function createVecLobule(gl, { read, target, seq, laid }) {
  const UC = uniformCache(gl);
  const stamp = createStamp();
  const D0 = new Float32Array(MAX_DUCTS * 4), D1 = new Float32Array(MAX_DUCTS * 4);   // alloc-rare: the ductules' two uniform arrays, made once and refilled
  let st = null, P = null, failed = false;
  const free = () => { if (st) { for (const x of st.sh) gl.deleteShader(x); st = null; } };
  function start() {
    if (st || P || failed) return;
    try { st = startProgram(gl, KEEP_BOX_VS, keepFS()); } catch { failed = true; st = null; }   // alloc-rare: once, when the lobule's picture is first kept
  }
  function ready() {
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
  }
  /** A whole picture was just laid (laidThrough: through the tissue under it, with everything over it): what the texture holds is kept. */
  function noteLaid(laidThrough) {
    stamp.drop();
    if (!laidThrough || !ready()) return;
    const t = target();
    if (!t || !t.fbo) return;
    const ks = read();
    if (ks) stamp.note(true, seq(), t.gen, ks);
  }
  /**
   * A frame where only the blood moved: the texture repainted inside each of the n boxes in `boxes` (4 numbers a box: x0, y0, x1, y1 in
   * the target's pixels, y from the bottom) from the vessel layer `own`, the tissue and the ductules. False when the picture is not kept.
   */
  function keepBlood(boxes, n, own) {
    if (!P || !stamp.on) return false;
    const ks = read(), t = target();
    if (!ks || !t || !t.fbo || !stamp.same(seq(), t.gen, ks)) return false;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.viewport(0, 0, t.w, t.h);
    gl.disable(gl.STENCIL_TEST); gl.disable(gl.BLEND);
    if (n > 0) {
      const U = P.U;
      gl.useProgram(P.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, own); UC.i1(U.uOwn, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, ks.tex); UC.i1(U.uTis, 1);
      const nd = ks.ducts ? Math.min(MAX_DUCTS, ks.ducts.length / 8) : 0;
      UC.i1(U.uND, nd);
      if (nd) {
        const v = ks.view, d = ks.ducts;
        UC.f4(U.uView, v[0], v[1], v[2], v[3]); UC.f2(U.uSize, t.w, t.h);
        D0.fill(0); D1.fill(0);
        for (let j = 0; j < nd; j++) for (let q = 0; q < 4; q++) { D0[j * 4 + q] = d[j * 8 + q]; D1[j * 4 + q] = d[j * 8 + 4 + q]; }
        UC.fv4(U.uD0, D0); UC.fv4(U.uD1, D1);
        UC.fv4(U.uCLum, ks.lum); UC.fv4(U.uCCell, ks.cell); UC.fv4(U.uCEdge, ks.edge); UC.fv4(U.uCNuc, ks.nuc);
        UC.f1(U.uEdge, ks.width); UC.f1(U.uAlpha, ks.alpha);
      }
      gl.enable(gl.SCISSOR_TEST);
      for (let i = 0; i < n; i++) {
        const x0 = Math.max(0, boxes[i * 4]), y0 = Math.max(0, boxes[i * 4 + 1]), x1 = Math.min(t.w, boxes[i * 4 + 2]), y1 = Math.min(t.h, boxes[i * 4 + 3]);
        if (!(x1 > x0 && y1 > y0)) continue;
        gl.scissor(x0, y0, x1 - x0, y1 - y0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.SCISSOR_TEST);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null);
    }
    laid?.();
    return true;
  }
  return {
    start, ready, noteLaid, keepBlood, stamp,
    /** Gives the program back (the renderer is let go of). */
    release() { free(); if (P && !gl.isContextLost()) gl.deleteProgram(P.p); P = null; stamp.drop(); },
  };
}
