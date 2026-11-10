// The Tube vessel renderer's pass (Settings › Display › Tube vessel renderer; docs/tube-renderer.md): meshPass (veins-gl.js) with these
// differences only (docs/recommendations/tube-renderer-plan.md, "Draw order"): half tubes whose vertices carry the depth (tube-geo.js), a
// prepass that is the same program with the colour masked off in place of a key pass, no shadow and no ring, and the draw buffers set once
// (changed only around a glow, the lift and the laying of a scratch layer). The Mesh's buckets, patches and buffers are shared.
// It lives in a file of its own so veins-gl.js stays under the build's chunk limit. veins-gl.js gives it what it works on, once, in E: the
// context, the kept state (MG) and the Mesh helpers by name; the values that change (the two programs, the layer's texture, the rows'
// attributes, the frame's morph) are read through E each time, never copied.
import { MP } from './veins-mesh-glsl.js';
import { tierBuckets, patchesByTier, PG_W, PG_M } from './veins-mesh-data.js';
import { TUBE_LEVEL } from './tube-geo.js';
import { CEL } from './tube-cel-glsl.js';

/** Makes the pass for one renderer. E: gl, UC, MG, MAX_TIERS, ATTACH, KEY_PASSES, MESH_TWO, MESH_DS, MESH_GLOW_BUF, MESH_COLOR_BUF, CLR_F, gpuProbe,
 *  nTubes, the functions meshPad, meshKeyNext, meshRefNext, meshTargets, meshGeo, meshTarget, meshScratch, meshLay, vesselSet, and the
 *  readers tubeS, tubePt, baseTex, tubeNow, geo. Returns tubePass(m, look): false when it cannot draw (the classic pass draws instead). */
export function createTubePass(E) {
  const { gl, UC, MG, MAX_TIERS, ATTACH, KEY_PASSES, MESH_TWO, MESH_DS, MESH_GLOW_BUF, MESH_COLOR_BUF, CLR_F, gpuProbe,
    meshPad, meshKeyNext, meshRefNext, meshTargets, meshGeo, meshTarget, meshScratch, meshLay, vesselSet } = E;
  // One draw of tier t's strips (and its patches) for a pass, in the band that starts at base. Sets no draw buffers.
  function tubeDraw(pass, t, base, H, px, look, patches) {
    const tb = MG.tb, pb = MG.pb, SP = E.tubeS, PP = E.tubePt;
    if (tb.count[t]) {
      const u = SP.u;
      gl.useProgram(SP.p);
      UC.i1(u.mPass, pass); UC.i1(u.tierNow, t); UC.f1(u.tubeBase, base); UC.f1(u.tubeH, H);
      UC.f1(u.keyBase, base); UC.f1(u.keyH, H); UC.f1(u.keyShape, 0);
      UC.f1(u.padU, meshPad(pass, look, px)); UC.f1(u.selPad, pass >= MP.SHAPE_K ? 4 : 0);
      gl.bindVertexArray(MG.tubeVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, MG.rowBuf);
      gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 4, tb.start[t] * 4);
      gl.drawElementsInstanced(gl.TRIANGLES, MG.tubeIndexN, gl.UNSIGNED_SHORT, 0, tb.count[t]);
      MG.strips += tb.count[t];
    }
    if (patches && pb.count[t]) {
      const u = PP.u;
      gl.useProgram(PP.p);
      UC.i1(u.mPass, pass); UC.i1(u.tierNow, t); UC.f1(u.keyBase, base); UC.f1(u.keyH, H); UC.f1(u.keyShape, 0);
      UC.f1(u.zU, 2 * (base + (1 - TUBE_LEVEL.PATCH) * H) - 1);
      gl.bindVertexArray(MG.patchVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, MG.patchBuf);
      const o = pb.start[t] * PG_W * 4;
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, PG_W * 4, o + 16);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, PG_W * 4, o + 32);
      gl.vertexAttribPointer(3, 2, gl.FLOAT, false, PG_W * 4, o + 48);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, pb.count[t]);
      MG.patches += pb.count[t];
    }
    MG.passes++;
  }
  // A pass and its prepass for tier t, in the layer's framebuffer, in a band of depth of its own (later bands are nearer). The prepass is the
  // same program on the same inputs with the colour masked off: it keeps the nearest surface's depth only where the pass will draw; returns
  // the band's base the pass drew with.
  function tubePair(pass, t, px, look, patches, glow) {
    const base = meshKeyNext(), H = 0.999 / KEY_PASSES;
    gl.colorMask(false, false, false, false);
    gl.disable(gl.BLEND); gl.disable(gl.STENCIL_TEST);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
    tubeDraw(pass, t, base, H, px, look, patches);
    tubeColour(pass, t, base, px, look, patches, glow ? MESH_GLOW_BUF : null);
    return base;
  }
  // The colour pass over the kept depth (EQUAL: only the surface that was kept), blended premultiplied, each pixel once (the stencil); bufs: the
  // draw buffers for this pass alone (a glow's, the lift's), or null to keep the pass's four.
  function tubeColour(pass, t, base, px, look, patches, bufs) {
    gl.colorMask(true, true, true, true);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.EQUAL); gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.STENCIL_TEST); gl.stencilFunc(gl.NOTEQUAL, meshRefNext(), 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE); gl.stencilMask(0xff);
    if (bufs) gl.drawBuffers(bufs);
    tubeDraw(pass, t, base, 0.999 / KEY_PASSES, px, look, patches);
    if (bufs) gl.drawBuffers(ATTACH);
    gl.disable(gl.STENCIL_TEST); gl.disable(gl.DEPTH_TEST);
  }
  // The Tube's whole vessel pass into the layer (fbo bound, its viewport; the caller's scissor, if any, kept): false when it cannot draw, and the
  // classic pass draws instead.
  function tubePass(m, look) {
    if (!meshTargets()) return false;
    const G = meshGeo();
    const tb = tierBuckets(E.tubeNow, G.pts.on, E.nTubes, G.tb), pb = patchesByTier(G.patch.data, G.patch.count, E.tubeNow, G.pb, PG_W, PG_M);
    // (The rows and patches by tier, into buffers kept at their largest.)
    gl.bindBuffer(gl.ARRAY_BUFFER, MG.rowBuf);
    if (MG.rowCap < tb.rows.length) { MG.rowCap = tb.rows.length; gl.bufferData(gl.ARRAY_BUFFER, MG.rowCap * 4, gl.DYNAMIC_DRAW); }
    if (tb.n) gl.bufferSubData(gl.ARRAY_BUFFER, 0, tb.rows, 0, tb.n);
    gl.bindBuffer(gl.ARRAY_BUFFER, MG.patchBuf);
    if (MG.patchCap < pb.n * PG_W) { MG.patchCap = Math.max(pb.n * PG_W, PG_W); gl.bufferData(gl.ARRAY_BUFFER, MG.patchCap * 4, gl.DYNAMIC_DRAW); }
    if (pb.n) gl.bufferSubData(gl.ARRAY_BUFFER, 0, pb.data, 0, pb.n * PG_W);
    MG.passes = 0; MG.strips = 0; MG.patches = 0;
    const px = 1 / Math.max(1e-6, Math.hypot(m[0], m[1]));
    // (Both programs' uniforms and textures as the classic pass's, then the points: the figure's own texture, or the morph set's frame rows.)
    MESH_TWO[0] = E.tubePt; MESH_TWO[1] = E.tubeS;
    for (const P of MESH_TWO) {
      vesselSet(P, m, look, false, false);
      if (!E.geo.morph) { UC.i1(P.u.posBase, 0); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, MG.tex); }
      UC.f1(P.u.reachU, look.reach);
      UC.i1(P.u.pjTex, 9);
      UC.f1(P.u.celK, CEL.K);
    }
    UC.f1(E.tubeS.u.hRef, 64); UC.f1(E.tubeS.u.aaPad, 2 * px);
    gl.activeTexture(gl.TEXTURE9); gl.bindTexture(gl.TEXTURE_2D, MG.pj);
    // (The depth and stencil, cleared within the caller's scissor.)
    gl.depthMask(true); gl.stencilMask(0xff);
    gl.clearBufferfi(gl.DEPTH_STENCIL, 0, 1, 0);
    MG.kP = 0; MG.ref = 0;
    gl.drawBuffers(ATTACH);
    const TG = look.tierGroup, dim = look.netAlpha < 0.999;
    for (let g = 0; g < 3; g++) {
      let any = false, sel = false, up = false;
      for (let t = 0; t < MAX_TIERS; t++) if (TG[t] === g && (tb.count[t] || pb.count[t])) { any = true; if (tb.sel[t]) sel = true; if (tb.litUp[t]) up = true; }
      if (!any) continue;
      // (The network while a vessel is focused: drawn apart and laid faded as one, so its vessels do not show through one another; the
      // selected vessel's lift drawn apart too, laid over the network.)
      const toN = g === 1 && dim, lift = g === 1 && sel;
      if (lift || toN) gl.drawBuffers(ATTACH);
      if (lift) { meshTarget(meshScratch(1)); gl.clearBufferfv(gl.COLOR, 0, CLR_F); meshTarget(E.baseTex); }
      if (toN) { meshTarget(meshScratch(0)); gl.clearBufferfv(gl.COLOR, 0, CLR_F); }
      for (let t = 0; t < MAX_TIERS; t++) {
        if (TG[t] !== g || !(tb.count[t] || pb.count[t])) continue;
        if (tb.lit[t]) tubePair(MP.GLOW, t, px, look, false, true);
        const sb = tubePair(MP.SHAPE, t, px, look, true, false);
        if (lift && tb.sel[t]) { meshTarget(MG.scrT); tubeColour(MP.LIFT, t, sb, px, look, true, MESH_COLOR_BUF); meshTarget(toN ? MG.scrN : E.baseTex); }
      }
      if (up) for (let t = 0; t < MAX_TIERS; t++) if (TG[t] === g && tb.litUp[t]) tubePair(MP.UP, t, px, look, false, true);
      if (toN) { meshTarget(E.baseTex); meshLay(MG.scrN, look.netAlpha); gl.drawBuffers(ATTACH); }
      if (lift) { meshLay(MG.scrT, 1); gl.drawBuffers(ATTACH); }
    }
    gl.disable(gl.BLEND); gl.disable(gl.STENCIL_TEST); gl.disable(gl.DEPTH_TEST);
    gl.colorMask(true, true, true, true);
    gl.drawBuffers(ATTACH);
    gl.bindVertexArray(null);
    gl.depthMask(true);
    // (The depth and the stencil are not wanted after the draw (the next one clears them): a tiled GPU need not write them out.)
    gl.invalidateFramebuffer(gl.FRAMEBUFFER, MESH_DS);
    gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, null);
    if (gpuProbe.on) {
      gpuProbe.note('vessels: tube');
      gpuProbe.gauge('vessel renderer', `tube: ${MG.passes} passes, ${MG.strips} strips, ${MG.patches} patches drawn`);
    }
    return true;
  }
  return tubePass;
}
