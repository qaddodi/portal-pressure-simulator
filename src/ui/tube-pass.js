// The Tube vessel renderer's pass (Settings › Display › Tube vessel renderer; docs/tube-renderer.md): meshPass (veins-gl.js) with these
// differences only (docs/recommendations/tube-renderer-plan.md, "Draw order"): half tubes whose vertices carry the depth (tube-geo.js), a
// prepass that is the same program with the colour masked off in place of a key pass, no shadow and no ring, and the draw buffers set once
// (changed only around a glow, the lift and the laying of a scratch layer). The Mesh's buckets, patches and buffers are shared.
// It lives in a file of its own so veins-gl.js stays under the build's chunk limit. veins-gl.js gives it what it works on, once, in E: the
// context, the kept state (MG) and the Mesh helpers by name; the values that change (the two programs, the layer's texture, the rows'
// attributes, the frame's morph) are read through E each time, never copied.
import { MP } from './veins-mesh-glsl.js';
import { tierBuckets, patchesByTier, PG_W, PG_M } from './veins-mesh-data.js';
import { CEL } from './tube-cel-glsl.js';
import { WEB_FLOATS } from './tube-joint.js';
import { tubeStage, stage1Why, createStage2Data, tubeJoinCut } from './tube-stage2.js';

/** Makes the pass for one renderer. E: gl, UC, MG, MAX_TIERS, ATTACH, KEY_PASSES, MESH_TWO, MESH_DS, MESH_GLOW_BUF, MESH_COLOR_BUF, CLR_F, gpuProbe,
 *  nTubes, the functions meshPad, meshKeyNext, meshRefNext, meshTargets, meshGeo, meshTarget, meshScratch, meshLay, vesselSet, and the
 *  readers tubeS, tubePt, tube2 (the four stage 2 programs, or null), tube2Failed, baseTex, tubeNow, geo. Returns tubePass(m, look): false when it cannot draw
 *  (the classic pass draws instead). Stage 2 (tube-stage2.js, docs/tube-renderer.md) is drawn when tube2 is ready; the pass is stage 1 otherwise, never the Mesh's or the classic. */
export function createTubePass(E) {
  const { gl, UC, MG, MAX_TIERS, ATTACH, KEY_PASSES, MESH_TWO, MESH_DS, MESH_GLOW_BUF, MESH_COLOR_BUF, CLR_F, gpuProbe,
    meshPad, meshKeyNext, meshRefNext, meshTargets, meshGeo, meshTarget, meshScratch, meshLay, vesselSet } = E;
  // (What orders the surfaces of a tier: the anatomy by height (zK 0, hK 1, hRef 64); the lobule, one tier, by each row's z first and the height only to settle
  // a tie (zK 1, hK .008: under the smallest gap between two kinds' z, .01), hRef its largest radius, 21.42 (node scripts/lobule-joins.mjs), rounded up.)
  const LV = E.lobule ? { hRef: 22, zK: 1, hK: 0.008 } : { hRef: 64, zK: 0, hK: 1 };
  let glowP = null;   // the program the glow pairs draw strips with this frame: E.tubeGlow, or E.tubeS (set by tubePass)
  let keyPre = 0;   // tubeKey: 1 while a glow's depth prepass runs (a lit vessel's own wall keeps its depth, so no other glow shows inside it), 2 while a shape's (a patch keeps the depth of the pixels inside its shape it leaves clear), else 0
  // What this frame draws from (set by tubePass): the stage and the joins, the rows and webs by tier, the stage 2 buffers.
  const FR = { two: false, web: false, tb: null, pb: null, wb: null, D: null };
  let lastText = '', lastP, lastP3, choice = tubeStage(null);   // (the choice is read again only when the stage 2 or stage 3 programs change)
  // The layer's draw buffers: the four, or in stage 3 without the second flow target (the lumen layer carries what it carried; the first stays for the arrowheads' quads and picking).
  const A3 = [ATTACH[0], ATTACH[1], gl.NONE, ATTACH[3]];
  let AT = ATTACH;
  // Sets a vertex stage's pass uniforms on program P and draws n strips from record `first` of buf (size floats of each stride bytes: 1 for the stage 1 rows, 4 for J's).
  function stripCall(P, pass, t, base, H, px, look, vao, buf, size, stride, first, n) {
    const u = P.u;
    gl.useProgram(P.p);
    UC.i1(u.mPass, pass); UC.i1(u.tierNow, t); UC.f1(u.tubeBase, base); UC.f1(u.tubeH, H);
    UC.f1(u.keyBase, base); UC.f1(u.keyH, H); UC.f1(u.keyShape, 0);
    UC.f1(u.padU, meshPad(pass, look, px)); UC.f1(u.selPad, pass >= MP.SHAPE_K ? 4 : 0); UC.i1(u.tubeKey, keyPre);
    UC.i1(u.isWeb, 0);   // (the lean fragment shader's tier test: a strip is drawn in its own tier)
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.vertexAttribPointer(1, size, gl.FLOAT, false, stride, first * stride);
    gl.drawElementsInstanced(gl.TRIANGLES, MG.tubeIndexN, gl.UNSIGNED_SHORT, 0, n);
    if (!keyPre) MG.strips += n;   // (counted once, in the colour draw: the prepass draws the same rows again)
  }
  // n webs of tier t from record `first` of the web buffer (stage 2).
  function webCall(P, pass, t, base, H, px, look, first, n) {
    const u = P.u, D = FR.D, o = first * WEB_FLOATS * 4;
    gl.useProgram(P.p);
    UC.i1(u.mPass, pass); UC.i1(u.tierNow, t); UC.f1(u.tubeBase, base); UC.f1(u.tubeH, H);
    UC.f1(u.padU, meshPad(pass, look, px)); UC.f1(u.selPad, pass >= MP.SHAPE_K ? 4 : 0);
    UC.i1(u.isWeb, 1);   // (a web is drawn in the higher of its rows' tiers, whatever its owner row's: the lean fragment shader skips the tier test)
    gl.bindVertexArray(D.webVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, D.webBuf);
    for (let a = 1; a <= 3; a++) gl.vertexAttribPointer(a, 4, gl.FLOAT, false, WEB_FLOATS * 4, o + (a - 1) * 16);
    gl.drawElementsInstanced(gl.TRIANGLES, D.webIndexN, gl.UNSIGNED_SHORT, 0, n);
    if (!keyPre) MG.webs += n;
  }
  // Tier t's patches (stage 1's joins, and stage 2's with ?tubejoin=patch).
  function patchCall(pass, t, base, H) {
    const pb = FR.pb, u = E.tubePt.u;
    gl.useProgram(E.tubePt.p);
    UC.i1(u.mPass, pass); UC.i1(u.tierNow, t); UC.f1(u.keyBase, base); UC.f1(u.keyH, H); UC.f1(u.keyShape, 0); UC.i1(u.tubeKey, keyPre);
    gl.bindVertexArray(MG.patchVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, MG.patchBuf);
    const o = pb.start[t] * PG_W * 4;
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, PG_W * 4, o + 16);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, PG_W * 4, o + 32);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, PG_W * 4, o + 48);
    // (Two draws: the patch's outline, at a depth under every lumen (over every casing), then its lumen, over them all: a join's outline never
    // shows across another vessel's inside. tubePart in the shader keeps each pixel to one of them, and the fragment writes the depth of each: no zU.)
    for (let part = 0; part < 2; part++) {
      UC.i1(u.tubePart, part);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, pb.count[t]);
    }
    if (!keyPre) MG.patches += pb.count[t];
  }
  // One draw of tier t's strips (and its patches) for a pass, in the band that starts at base: stage 1's, and a glow's in stage 2 (the stage 1
  // strip program over the rows of the stage 2 buffer, read as one float a record). Sets no draw buffers.
  function tubeDraw(pass, t, base, H, px, look, patches) {
    const tb = FR.tb;
    if (tb.count[t]) {
      const P = pass === MP.GLOW || pass === MP.UP ? glowP : E.tubeS;   // (a glow pair: the short glow program when it is ready, else the strip program)
      if (FR.two) stripCall(P, pass, t, base, H, px, look, MG.tubeVAO, FR.D.rowBuf, 1, 16, tb.start[t], tb.count[t]);
      else stripCall(P, pass, t, base, H, px, look, MG.tubeVAO, MG.rowBuf, 1, 4, tb.start[t], tb.count[t]);
    }
    if (patches && FR.pb && FR.pb.count[t]) patchCall(pass, t, base, H);
    MG.passes++;
  }
  // Stage 2's draw of tier t for a shape pass or the lift: the prepass (pre) draws the plain rows with the depth program (no fragment work), the exact rows
  // with the lean program, the webs with the web depth program; the colour pass draws all rows with the lean program and the webs with the web program.
  // With ?tubejoin=patch the patches are drawn in the webs' place, as stage 1 draws them.
  function draw2(pass, t, base, H, px, look, pre) {
    const tb = FR.tb, P = E.tube2, D = FR.D, n = tb.count[t], pl = tb.plain[t], s0 = tb.start[t];
    const en = tb.ends ? tb.ends[t] : 0;
    if (pre) {
      if (pl) stripCall(P.depth, pass, t, base, H, px, look, D.stripVAO, D.rowBuf, 4, 16, s0, pl);
      if (en) stripCall(P.joinDepth || P.lean, pass, t, base, H, px, look, D.stripVAO, D.rowBuf, 4, 16, s0 + pl, en);   // (the rows exact only for a join end: the join-only depth program)
      if (n > pl + en) stripCall(P.lean, pass, t, base, H, px, look, D.stripVAO, D.rowBuf, 4, 16, s0 + pl + en, n - pl - en);
    } else if (n) { stripCall(P.lean, pass, t, base, H, px, look, D.stripVAO, D.rowBuf, 4, 16, s0, n); MG.plain += pl + en; }   // (the plain ones among them, and the rows exact only for a join end, are the rows whose prepass cost next to no fragment work)
    if (FR.web) { if (FR.wb.count[t]) webCall(pre ? P.webDepth : P.web, pass, t, base, H, px, look, FR.wb.start[t], FR.wb.count[t]); }
    else if (FR.pb.count[t]) patchCall(pass, t, base, H);
    MG.passes++;
  }
  // A pass and its prepass for tier t, in the layer's framebuffer, in a band of depth of its own (later bands are nearer). The prepass is the
  // same program on the same inputs with the colour masked off: it keeps the nearest surface's depth only where the pass will draw; returns
  // the band's base the pass drew with. In stage 2 a shape pair (not a glow's) is draw2.
  function tubePair(pass, t, px, look, patches, glow) {
    const base = meshKeyNext(), H = 0.999 / KEY_PASSES;
    gl.colorMask(false, false, false, false);
    gl.disable(gl.BLEND); gl.disable(gl.STENCIL_TEST);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
    keyPre = glow ? 1 : 2;
    if (FR.two && patches) draw2(pass, t, base, H, px, look, true); else tubeDraw(pass, t, base, H, px, look, patches);
    keyPre = 0;
    tubeColour(pass, t, base, px, look, patches, glow ? MESH_GLOW_BUF : null);
    return base;
  }
  // The colour pass over the kept depth (stage 1: EQUAL, only the surface that was kept; stage 2's shape: LEQUAL, the kept surface or a tie), blended
  // premultiplied, each pixel once (the stencil); bufs: the draw buffers for this pass alone (a glow's, the lift's), or null to keep the pass's four.
  function tubeColour(pass, t, base, px, look, patches, bufs) {
    const two = FR.two && patches;
    gl.colorMask(true, true, true, true);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(two ? gl.LEQUAL : gl.EQUAL); gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.STENCIL_TEST); gl.stencilFunc(gl.NOTEQUAL, meshRefNext(), 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE); gl.stencilMask(0xff);
    if (bufs) gl.drawBuffers(bufs);
    if (two) draw2(pass, t, base, 0.999 / KEY_PASSES, px, look, false); else tubeDraw(pass, t, base, 0.999 / KEY_PASSES, px, look, patches);
    if (bufs) gl.drawBuffers(AT);
    gl.disable(gl.STENCIL_TEST); gl.disable(gl.DEPTH_TEST);
  }
  // Whether tier t has anything to draw this frame (rows, patches or webs).
  const has = (t) => FR.tb.count[t] > 0 || (FR.pb !== null && FR.pb.count[t] > 0) || (FR.two && FR.web && FR.wb.count[t] > 0);
  // The stage this frame draws with (memoised on the programs, so the answer is read from the address once).
  const stageNow = () => {
    if (E.tube2 !== lastP || E.tube3 !== lastP3) { lastP = E.tube2; lastP3 = E.tube3; choice = tubeStage(lastP, undefined, !!lastP3); }
    return choice;
  };
  // A program's uniforms and textures for the pass: the vessel set, then the points (the figure's own texture, or the morph set's frame rows).
  function setProgram(P, m, look, px) {
    vesselSet(P, m, look, false, false);
    if (!E.geo.morph) { UC.i1(P.u.posBase, 0); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, MG.tex); }
    UC.f1(P.u.reachU, look.reach);
    UC.i1(P.u.pjTex, 9);
    UC.f1(P.u.celK, CEL.K);
    UC.f1(P.u.zK, LV.zK); UC.f1(P.u.hK, LV.hK);   // (an unset uniform is 0, so every program is given both)
    UC.i1(P.u.joinCut, tubeJoinCut() && !E.lobule ? 1 : 0);   // (0 in the lobule always: no row has an end, none of the join work runs and no row is exact for one; the figure has them unless ?tubejoin=off)
    UC.f1(P.u.hRef, LV.hRef); UC.f1(P.u.aaPad, 2 * px);
    UC.f1(P.u.pxW, px);   // (the compositor's zoom numbers, ZOOM_VS, which the vertex shaders hand on as zoomA and zoomB: the world size of a device pixel)
  }
  // Stage 2's data for this frame (tube-stage2.js createStage2Data): the rows by tier, the webs, the buffers. The rows wholly outside the layer (the view: veins-gl.js layerView)
  // are left out of the buckets, so neither pass draws them (not while the change between the views moves the points).
  const VIEW = { rect: new Float64Array(4), ok: false, pad: 0, rmax: null };
  function frameD(m, look) {
    const mj = E.geo.morph, D = FR.D ||= (MG.stage2 = createStage2Data(gl, MG));
    D.frame(meshGeo(), E.tubeNow, E.nTubes, mj ? mj.joinBase : -1, E.layerView ? E.layerView(m, look, VIEW) : null);
    return D;
  }
  // The Tube's whole vessel pass into the layer (fbo bound, its viewport; the caller's scissor, if any, kept): false when it cannot draw, and the
  // classic pass draws instead.
  function tubePass(m, look) {
    if (!meshTargets()) return false;
    const G = meshGeo();
    // (The stage: 2 when the four lean programs are ready and ?tube=1 is not set, else 1; the joins: webs in stage 2 unless ?tubejoin=patch.)
    stageNow();
    const two = choice.stage >= 2, web = choice.joins === 'web';
    AT = choice.stage === 3 ? A3 : ATTACH;
    let tb, pb = null;
    if (two) {
      // (Stage 2: J's rows by tier, plain first, and the webs by tier, into buffers of their own; the patches only when ?tubejoin=patch.)
      frameD(m, look);
      tb = FR.D.tb; FR.wb = FR.D.wb;
      if (!web) pb = patchesByTier(G.patch.data, G.patch.count, E.tubeNow, G.pb, PG_W, PG_M);
    } else {
      tb = tierBuckets(E.tubeNow, G.pts.on, E.nTubes, G.tb); pb = patchesByTier(G.patch.data, G.patch.count, E.tubeNow, G.pb, PG_W, PG_M);
      // (The rows by tier, into the buffer kept at its largest.)
      gl.bindBuffer(gl.ARRAY_BUFFER, MG.rowBuf);
      if (MG.rowCap < tb.rows.length) { MG.rowCap = tb.rows.length; gl.bufferData(gl.ARRAY_BUFFER, MG.rowCap * 4, gl.DYNAMIC_DRAW); }
      if (tb.n) gl.bufferSubData(gl.ARRAY_BUFFER, 0, tb.rows, 0, tb.n);
    }
    if (pb) {
      gl.bindBuffer(gl.ARRAY_BUFFER, MG.patchBuf);
      if (MG.patchCap < pb.n * PG_W) { MG.patchCap = Math.max(pb.n * PG_W, PG_W); gl.bufferData(gl.ARRAY_BUFFER, MG.patchCap * 4, gl.DYNAMIC_DRAW); }
      if (pb.n) gl.bufferSubData(gl.ARRAY_BUFFER, 0, pb.data, 0, pb.n * PG_W);
    }
    FR.two = two; FR.web = web; FR.tb = tb; FR.pb = pb;
    MG.passes = 0; MG.strips = 0; MG.patches = 0; MG.plain = 0; MG.webs = 0;
    const px = 1 / Math.max(1e-6, Math.hypot(m[0], m[1]));
    // (The programs this frame draws with, each given the pass's uniforms and textures.)
    glowP = E.tubeGlow || E.tubeS;
    let glowAny = false;
    for (let t = 0; t < MAX_TIERS; t++) if (tb.lit[t] || tb.litUp[t]) glowAny = true;
    if (two) {
      const P = E.tube2;
      setProgram(P.lean, m, look, px); setProgram(P.depth, m, look, px);
      if (P.joinDepth) setProgram(P.joinDepth, m, look, px);
      if (web) { setProgram(P.web, m, look, px); setProgram(P.webDepth, m, look, px); } else setProgram(E.tubePt, m, look, px);
      if (glowAny) setProgram(glowP, m, look, px);
    } else { setProgram(E.tubePt, m, look, px); setProgram(E.tubeS, m, look, px); if (glowP !== E.tubeS) setProgram(glowP, m, look, px); }
    gl.activeTexture(gl.TEXTURE9); gl.bindTexture(gl.TEXTURE_2D, MG.pj);
    // (The depth and stencil, cleared within the caller's scissor.)
    gl.depthMask(true); gl.stencilMask(0xff);
    gl.clearBufferfi(gl.DEPTH_STENCIL, 0, 1, 0);
    MG.kP = 0; MG.ref = 0;
    gl.drawBuffers(AT);
    const TG = look.tierGroup, dim = look.netAlpha < 0.999;
    for (let g = 0; g < 3; g++) {
      let any = false, sel = false, up = false;
      for (let t = 0; t < MAX_TIERS; t++) if (TG[t] === g && has(t)) { any = true; if (tb.sel[t]) sel = true; if (tb.litUp[t]) up = true; }
      if (!any) continue;
      // (The network while a vessel is focused: drawn apart and laid faded as one, so its vessels do not show through one another; the
      // selected vessel's lift drawn apart too, laid over the network.)
      const toN = g === 1 && dim, lift = g === 1 && sel;
      if (lift || toN) gl.drawBuffers(AT);
      if (lift) { meshTarget(meshScratch(1)); gl.clearBufferfv(gl.COLOR, 0, CLR_F); meshTarget(E.baseTex); }
      if (toN) { meshTarget(meshScratch(0)); gl.clearBufferfv(gl.COLOR, 0, CLR_F); }
      for (let t = 0; t < MAX_TIERS; t++) {
        if (TG[t] !== g || !has(t)) continue;
        if (tb.lit[t]) tubePair(MP.GLOW, t, px, look, false, true);
        const sb = tubePair(MP.SHAPE, t, px, look, true, false);
        if (lift && tb.sel[t]) { meshTarget(MG.scrT); tubeColour(MP.LIFT, t, sb, px, look, true, MESH_COLOR_BUF); meshTarget(toN ? MG.scrN : E.baseTex); }
      }
      if (up) for (let t = 0; t < MAX_TIERS; t++) if (TG[t] === g && tb.litUp[t]) tubePair(MP.UP, t, px, look, false, true);
      if (toN) { meshTarget(E.baseTex); meshLay(MG.scrN, look.netAlpha); gl.drawBuffers(AT); }
      if (lift) { meshLay(MG.scrT, 1); gl.drawBuffers(AT); }
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
      // (tube 2: the passes, the strips (the plain ones among them, drawn by the depth program in a prepass), the webs; tube 1: why stage 2 is not drawing.)
      const what = two ? `${MG.passes} passes, strips drawn ${FR.D.cull.drawn} of ${FR.D.cull.total}${FR.D.cull.off ? ' (not culled)' : ''}, ${MG.strips} strip draws (${MG.plain} plain), ${web ? `${MG.webs} webs` : `${MG.patches} patches`}` : `${MG.passes} passes, ${MG.strips} strips, ${MG.patches} patches drawn`;
      const why = two ? '' : stage1Why(!!E.tube2, E.tube2Failed, !E.tube2 && !(E.tube2Failed && E.tube2Failed.length));
      const why3 = choice.stage === 2 && web && E.tube3Failed && E.tube3Failed.length ? `, stage 3: ${E.tube3Failed.join(', ')} failed` : '';
      const whyG = E.tubeGlowFailed && E.tubeGlowFailed.length ? `, ${E.tubeGlowFailed.join(', ')} failed (glow on the strip program)` : '';
      lastText = `tube ${choice.stage}: ${why ? `${why}, ` : ''}${what}${why3}${whyG}`;
      gpuProbe.gauge(E.lobule ? 'lobule vessel renderer' : 'vessel renderer', lastText);
    }
    tubePass.drew = choice.stage;   // (the stage that drew the layer: veins-gl.js zeroes it before each layer draw, and its tubeStage() reads it)
    return true;
  }
  // ---- Stage 3: the lumen layer (docs/tube-renderer.md "Stage 3") ----
  // The lumen of the surface in front at every pixel, drawn into the lumen target (bound by the caller, cleared in colour, its viewport; one piece of it at a time
  // through the layer's own pieces, scissors and lOff). All tiers' prepasses first (depth only, the layer pass's order and bands), then all tiers' lumens over the
  // kept depth (LEQUAL, no blend, no stencil): a lumen is drawn only where its surface is the nearest of all tiers, so a later tier's casing or outline over it
  // leaves it out. Draws nothing in stages 1 and 2 (returns false).
  const BASES = new Float64Array(MAX_TIERS), ONE1 = new Float32Array([1]);
  function tubeLumenPass(m, look, redo = true) {
    if (stageNow().stage !== 3) return false;
    const D = frameD(m, look);
    FR.two = true; FR.web = true; FR.tb = D.tb; FR.wb = D.wb; FR.pb = null;
    const tb = D.tb, P = E.tube2, P3 = E.tube3, keep = MG.passes;
    const px = 1 / Math.max(1e-6, Math.hypot(m[0], m[1]));
    for (const Q of [P.lean, P.depth, P.webDepth, P.joinDepth, P3.lumen, P3.webLumen]) if (Q) setProgram(Q, m, look, px);
    E.lumenBind(P3.lumen); E.lumenBind(P3.webLumen);
    MG.kP = 0; MG.lumStrips = 0; MG.lumWebs = 0;
    gl.disable(gl.BLEND); gl.disable(gl.STENCIL_TEST); gl.enable(gl.DEPTH_TEST);
    const TG = look.tierGroup, H = 0.999 / KEY_PASSES;
    keyPre = 2;   // (not counted in the layer pass's numbers)
    // The depth, only when it is stale (the vessel layer was drawn, or the target or its mapping changed: tube-stage2.js createDepthStamp): cleared, then every tier's prepass.
    // A fresh depth is the last pass's, kept (never invalidated), with the bands (BASES) it was drawn with.
    if (redo) {
      gl.depthMask(true);
      gl.clearBufferfv(gl.DEPTH, 0, ONE1);
      gl.colorMask(false, false, false, false); gl.depthFunc(gl.LESS);
      for (let g = 0; g < 3; g++) for (let t = 0; t < MAX_TIERS; t++) {
        if (TG[t] !== g || !has(t)) continue;
        BASES[t] = meshKeyNext();
        draw2(MP.SHAPE, t, BASES[t], H, px, look, true);
      }
    }
    gl.colorMask(true, true, true, true); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
    for (let g = 0; g < 3; g++) for (let t = 0; t < MAX_TIERS; t++) {
      if (TG[t] !== g || !has(t)) continue;
      const n = tb.count[t], w = FR.wb.count[t];
      if (n) { stripCall(P3.lumen, MP.SHAPE, t, BASES[t], H, px, look, D.stripVAO, D.rowBuf, 4, 16, tb.start[t], n); MG.lumStrips += n; }
      if (w && tubePass.webColour) { webCall(P3.webLumen, MP.SHAPE, t, BASES[t], H, px, look, FR.wb.start[t], w); MG.lumWebs += w; }
    }
    keyPre = 0;
    gl.disable(gl.DEPTH_TEST); gl.depthMask(true);
    gl.bindVertexArray(null);
    MG.passes = keep;
    return true;
  }
  tubePass.drew = 0;
  // Whether the lumen pass's colour draw includes the webs (set by veins-gl.js lumenFrame): a web's lumen pixel is the plain fill unless the origin colours or the dye are on (the wall
  // takes no streak, the lymph's dashes cover nothing there), which the layer already holds, so the webs stay in the depth prepass alone.
  tubePass.webColour = true;
  tubePass.stage = () => stageNow().stage;
  tubePass.lumen = tubeLumenPass;
  // The lumen pass's counts for the ?perf panel (gpu-fence.js fenceLumen, on a sampled frame): out = [strips, webs, rows in the pass, exact rows, rows with a join end].
  tubePass.lumenCounts = (out) => {
    const D = FR.D, tb = D && D.tb, B = MG.B || MG, R = B.s2 && B.s2.R;
    let exact = 0;
    if (tb && tb.count) for (let t = 0; t < MAX_TIERS; t++) exact += tb.count[t] - tb.plain[t];
    out[0] = MG.lumStrips || 0; out[1] = MG.lumWebs || 0; out[2] = tb ? tb.n || 0 : 0; out[3] = exact; out[4] = R ? R.ended || 0 : 0;
  };
  tubePass.gaugeText = () => `${lastText}${choice.stage === 3 ? `, lumen pass ${MG.lumStrips} strips ${MG.lumWebs} webs` : ''}`;
  return tubePass;
}
