// The vector renderer's scene overlays and soft effects (workstream G; docs/recommendations/vector-renderer-plan.md section 9.G).
// Everything COMP_FS lays that is not a vessel, an organ or the blood, kept as retained geometry or drawn as a bounded analytic pass, straight
// into the figure's picture (no layers, no render target of its own):
//
//   under the vessels   drawBehind  the glow behind the organs (stroke mesh), then the circuit's map (one analytic quad)
//                       [F draws the organs here, each fragment through vecPlate: the plate's grey-down]
//                       drawWarm    the warm glow on the organs (stroke mesh, its overlaps taking the strongest)
//   over the vessels    drawFluid   the ascites (a quad over the cavity's rectangle, fluidAt)
//                       drawCath    the HVPG catheter (mesh)
//                       drawLines   the organ outlines (stroke mesh)
//
// The renderer core (E) calls these in OVERLAY_ORDER inside its one pass. Retained: the strokes' and the catheter's vertices go up once
// (setLines, setCath: the same specs stage.js hands veins-gl today), and a camera move changes only the matrix the vertex shader reads, so a
// pinch or a pan flattens and uploads nothing. The ascites' cavity rows are a small texture kept the same way.
//
// State left on return (E sets what it needs next): BLEND, DEPTH_TEST and STENCIL_TEST off, depthMask on, stencilMask 0xff, colorMask on,
// no vertex array bound, the draw's program still current; the scissor is never touched (E's dirty boxes cut every call here).
// Texture units: the ascites reads its cavity rows from unit 0 and (rebase) the kept base from unit 1; unit 0 is active on return.
// The warm glow's exact union needs the picture framebuffer's depth and stencil (E's DEPTH24_STENCIL8); it uses depth, and stencil bit
// STENCIL_BIT, and clears both afterwards (so it is drawn before the vessels, which then find the depth buffer cleared).
import { linkProgram } from './gl-compile.js';
import { ucOf } from './uniform-cache.js';
import { LIGHT } from './light.js';
import { CATH_VS, CATH_FS, LINE_VS, lineFS, MAP_VS, MAP_FS, FLUID_VS, fluidFS, STENCIL_BIT, OVERLAY_ORDER } from './vec-overlays-glsl.js';

export { OVERLAY_ORDER, STENCIL_BIT };

/** The programs' sources, [vertex, fragment] by name, for the renderer core to prestart (gl-compile.js prestart) with the others. */
export const OVERLAY_SOURCES = Object.freeze({
  line: [LINE_VS, lineFS(false)], warm: [LINE_VS, lineFS(true)], cath: [CATH_VS, CATH_FS],
  map: [MAP_VS, MAP_FS], fluid: [FLUID_VS, fluidFS(false)], rebase: [FLUID_VS, fluidFS(true)],
});

const QUAD = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
const R_UNIT = [0, 0, 1, 1], V4_ZERO = [0, 0, 0, 0], LV_DEF = [1, 0];

/** The plate's grey-down for a program of F's: alpha and saturation from the look (a plate faded out whole is no plate: alpha 0). */
export function setPlate(gl, locs, look) {
  const plate = look?.plate && look.plate.alpha > 0 ? look.plate : null, uc = ucOf(gl);
  uc.f1(locs.plateAlpha, plate ? plate.alpha : 0);
  uc.f1(locs.plateSat, plate ? plate.sat ?? 1 : 1);
}

/**
 * The overlays on one WebGL2 context. gl: the figure's context. Returns the draws and setters below; `ok` is false where no program built
 * (a draw then does nothing, and canLines / canCath say so, as veins-gl's do, so stage.js keeps its SVG outlines and catheter there).
 */
export function createOverlays(gl) {
  const UC = ucOf(gl);
  const prog = {};
  for (const k of Object.keys(OVERLAY_SOURCES)) {
    try {
      const p = linkProgram(gl, OVERLAY_SOURCES[k][0], OVERLAY_SOURCES[k][1]);
      const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, name); }
      prog[k] = { p, u };
    } catch (e) { prog[k] = null; console.warn(`Vector overlays: the ${k} shader failed.`, e); }
  }
  const P = prog;

  // ── Kept buffers ──
  const quad = gl.createBuffer(), quadVAO = gl.createVertexArray();
  gl.bindVertexArray(quadVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const stroked = () => {   // (the strokes' and the catheter's layout: pos, direction or normal, uv or side and half width; 24 bytes a vertex)
    const buf = gl.createBuffer(), va = gl.createVertexArray();
    gl.bindVertexArray(va);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    for (let i = 0; i < 3; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, 2, gl.FLOAT, false, 24, i * 8); }
    return { buf, va };
  };
  const lineGeo = stroked(), cathGeo = stroked();
  gl.bindVertexArray(null);
  const fluidTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, fluidTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // ── Versions: what E reads to know the kept picture is out of date (under the vessels: glow, warm, map; over: lines, cath, fluid) ──
  const ver = { glow: 0, warm: 0, lines: 0, cath: 0, fluid: 0 };
  const stats = { lineUploads: 0, cathUploads: 0, fluidUploads: 0 };

  // ── The strokes (organ outlines, glow, warm glow) ──
  let lines = null;
  const SIG_NOW = [new Float64Array(64), new Float64Array(64), new Float64Array(64)], SIG_KEPT = [new Float64Array(64), new Float64Array(64), new Float64Array(64)];
  const SIG_N = [0, 0, 0], SIG_KN = [0, 0, 0];
  const LAYER_OF = ['lines', 'glow', 'warm'];
  const sigPut = (i, x) => {
    let a = SIG_NOW[i];
    if (SIG_N[i] >= a.length) { const b = new Float64Array(a.length * 2); b.set(a); SIG_NOW[i] = a = b; }   // alloc-rare: a list longer than any before
    a[SIG_N[i]++] = x;
  };
  const hasKind = (k) => { if (lines) for (let i = 0; i < lines.draws.length; i++) { const d = lines.draws[i]; if ((k === 0 ? !d.soft : k === 1 ? d.soft && !d.warm : !!d.warm)) return true; } return false; };
  function setLines(spec) {
    if (!P.line) return;
    const fresh = spec && (spec.verts !== lines?.verts || spec.rev !== lines?.rev);
    const was = lines;
    lines = spec?.draws?.length ? spec : null;
    if (!lines) {   // (the strokes gone: every layer that had a draw is out of date)
      if (was) for (let i = 0; i < 3; i++) { ver[LAYER_OF[i]]++; SIG_KN[i] = 0; }
      return;
    }
    SIG_N[0] = SIG_N[1] = SIG_N[2] = 0;
    for (let k = 0; k < lines.draws.length; k++) {
      const d = lines.draws[k], i = d.warm ? 2 : d.soft ? 1 : 0, c = d.col;
      sigPut(i, d.first); sigPut(i, d.count); sigPut(i, d.alpha); sigPut(i, c.length);
      for (let j = 0; j < c.length; j++) sigPut(i, c[j]);
      sigPut(i, d.tri ? 1 : 0); sigPut(i, d.endFade ? 1 : 0);
    }
    for (let i = 0; i < 3; i++) {
      let same = SIG_N[i] === SIG_KN[i];
      for (let k = 0; same && k < SIG_N[i]; k++) { const a = SIG_NOW[i][k], b = SIG_KEPT[i][k]; if (a !== b && !(a !== a && b !== b)) same = false; }
      if (fresh || !same) { const t = SIG_KEPT[i]; SIG_KEPT[i] = SIG_NOW[i]; SIG_NOW[i] = t; SIG_KN[i] = SIG_N[i]; ver[LAYER_OF[i]]++; }
    }
    if (!fresh) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, lineGeo.buf);
    gl.bufferData(gl.ARRAY_BUFFER, lines.verts, gl.DYNAMIC_DRAW);
    stats.lineUploads++;
  }

  // World matrix (a, b, c, d, e, f: canvas px, y down) as a column-major mat3, and its inverse, in kept arrays.
  const WORLD = new Float32Array(9), INV = new Float32Array(9);
  const m3put = (dst, a, b, c, d, e, f) => { dst[0] = a; dst[1] = b; dst[2] = 0; dst[3] = c; dst[4] = d; dst[5] = 0; dst[6] = e; dst[7] = f; dst[8] = 1; return dst; };
  const invPut = (m) => {
    const det = m[0] * m[3] - m[1] * m[2] || 1e-9;
    const ia = m[3] / det, ib = -m[1] / det, ic = -m[2] / det, id = m[0] / det;
    return m3put(INV, ia, ib, ic, id, -(ia * m[4] + ic * m[5]), -(ib * m[4] + id * m[5]));
  };
  const pxWOf = (m) => 1 / Math.max(1e-6, Math.hypot(m[0], m[1]));

  const off = () => { gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.STENCIL_TEST); gl.depthMask(true); gl.stencilMask(0xff); gl.colorMask(true, true, true, true); gl.bindVertexArray(null); };
  const lay = () => { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); };

  // Draws one kind of stroke: 0 outlines, 1 the glow behind the organs, 2 the warm glow. P: the program (plain or the warm glow's depth one).
  function strokes(kind, p, m, pw, ph) {
    const U = p.u;
    gl.useProgram(p.p);
    UC.m3(U.world, m3put(WORLD, m[0], m[1], m[2], m[3], m[4], m[5]));
    UC.f2(U.size, pw, ph);
    UC.f1(U.soft, kind ? 1 : 0);
    UC.f1(U.pack, kind === 2 ? 1 : 0);
    gl.bindVertexArray(lineGeo.va);
    for (let i = 0; i < lines.draws.length; i++) {
      const d = lines.draws[i];
      if (d.alpha <= 0 || !!d.soft !== (kind > 0) || !!d.warm !== (kind === 2)) continue;
      UC.f4(U.col, d.col[0], d.col[1], d.col[2], d.alpha);
      UC.f2(U.endFade, d.endFade ? d.endFade[0] : 0, d.endFade ? d.endFade[1] : 0);
      gl.drawArrays(d.tri ? gl.TRIANGLES : gl.TRIANGLE_STRIP, d.first, d.count);
    }
  }
  const ready = (kind, p) => !!lines && !!p && hasKind(kind);

  // ── The catheter ──
  let cath = null, cathCap = 0, cathBase = null;
  function setCath(spec) {
    if (!P.cath) return;
    const was = cath;
    cath = spec?.draws?.length ? spec : null;
    if (!cath) { if (was) ver.cath++; return; }
    ver.cath++;   // (the catheter moves and fades by itself: every set is a change)
    const base = cath.base || null, at = base ? base.byteLength : 0, need = at + cath.verts.byteLength;
    gl.bindBuffer(gl.ARRAY_BUFFER, cathGeo.buf);
    if (need > cathCap) { cathCap = need * 2; gl.bufferData(gl.ARRAY_BUFFER, cathCap, gl.DYNAMIC_DRAW); cathBase = null; stats.cathUploads++; }
    if (base && base !== cathBase) { gl.bufferSubData(gl.ARRAY_BUFFER, 0, base); stats.cathUploads++; }
    cathBase = base;
    if (cath.verts.byteLength) gl.bufferSubData(gl.ARRAY_BUFFER, at, cath.verts);
  }
  // The catheter's box on the picture under m ([x0, y0, x1, y1], device px, y down, whole pixels, 2 px of margin), from every vertex its draws
  // use, clamped to the picture; null when it has none on it. `into`: the kept box it is written to and returned as.
  function cathBox(m, pw, ph, into) {
    if (!cath) return null;
    const base = cath.base, nb = base ? base.length / 6 : 0, V = cath.verts;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let k = 0; k < cath.draws.length; k++) {
      const d = cath.draws[k];
      for (let i = d.first, e = d.first + d.count; i < e; i++) {
        const a = i < nb ? base : V, o = (i < nb ? i : i - nb) * 6;
        if (o + 1 >= a.length) continue;
        const x = m[0] * a[o] + m[2] * a[o + 1] + m[4], y = m[1] * a[o] + m[3] * a[o + 1] + m[5];
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (!(x1 >= x0 && y1 >= y0)) return null;
    into[0] = Math.max(0, Math.floor(x0) - 2); into[1] = Math.max(0, Math.floor(y0) - 2); into[2] = Math.min(pw, Math.ceil(x1) + 2); into[3] = Math.min(ph, Math.ceil(y1) + 2);
    return into[2] > into[0] && into[3] > into[1] ? into : null;
  }

  // ── The ascites' cavity ──
  let fluidRect = null, fluidN = 0, fluidTexN = 0, fluidRows = null, fluidLiver = null;
  function setFluidSpans(halfWidths, rect) {
    ver.fluid++;
    const n = halfWidths.length;
    const rows = fluidRows?.length === n * 2 ? fluidRows : (fluidRows = new Float32Array(n * 2));   // alloc-rare: once per cavity resolution
    rows.fill(-1e4); rows.set(halfWidths);
    if (fluidLiver?.length === n) rows.set(fluidLiver, n);
    gl.bindTexture(gl.TEXTURE_2D, fluidTex);
    if (fluidN === n && fluidTexN === n) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, n, 2, gl.RED, gl.FLOAT, rows);
    else { gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, n, 2, 0, gl.RED, gl.FLOAT, rows); fluidTexN = n; }
    stats.fluidUploads++;
    fluidRect = rect; fluidN = n;
  }
  function setFluidLiver(bottoms) {
    ver.fluid++;
    fluidLiver = bottoms;
    if (fluidN !== bottoms.length) return;
    gl.bindTexture(gl.TEXTURE_2D, fluidTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 1, fluidN, 1, gl.RED, gl.FLOAT, bottoms);
    stats.fluidUploads++;
  }
  const fluidOf = (look) => (look?.fluid && fluidRect && look.fluid.ink && look.fluid.ink[3] > 0 ? look.fluid : null);
  // The cavity's box on the picture under m (device px, y down, whole pixels, 1 px of margin); null when there is none or it is off the picture.
  function fluidBox(m, pw, ph, into) {
    if (!fluidRect) return null;
    const [rx, ry, rw, rh] = fluidRect;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let k = 0; k < 4; k++) {
      const wx = rx + (k & 1) * rw, wy = ry + (k >> 1) * rh, x = m[0] * wx + m[2] * wy + m[4], y = m[1] * wx + m[3] * wy + m[5];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    into[0] = Math.max(0, Math.floor(x0) - 1); into[1] = Math.max(0, Math.floor(y0) - 1); into[2] = Math.min(pw, Math.ceil(x1) + 1); into[3] = Math.min(ph, Math.ceil(y1) + 1);
    return into[2] > into[0] && into[3] > into[1] ? into : null;
  }

  // ── The draws ──
  /** The glow behind the organs, then the circuit's map over it (COMP_FS: pl = over(pl, mapAt); pl = over(pl, glowL): the glow lies lowest). */
  function drawBehind(m, look, pw, ph) {
    if (ready(1, P.line)) { lay(); strokes(1, P.line, m, pw, ph); off(); }
    drawMap(m, look, pw, ph);
  }
  function drawMap(m, look, pw, ph) {
    const map = look?.map && look.map.a > 0 ? look.map : null;
    if (!map || !P.map) return false;
    const U = P.map.u;
    gl.useProgram(P.map.p);
    UC.m3(U.inv, invPut(m));
    UC.f1(U.H, ph);
    UC.f1(U.pxW, pxWOf(m));
    UC.f1(U.mapA, map.a);
    UC.f4a(U.mapDot, map.dot); UC.fv4(U.mapZone, map.zone); UC.f4a(U.mapFx, map.fx); UC.f4a(U.mapAlt, map.alt); UC.f2a(U.mapFxX, map.fxX); UC.f4a(U.mapRot, map.rot);
    lay();
    gl.bindVertexArray(quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    off();
    return true;
  }
  /**
   * The warm glow on the organs, under the vessels. Its strips take the strongest where they meet (COMP_FS's warm layer was drawn with blend
   * MAX): with `exact` (the picture has depth and stencil) that is two passes of the same strips, the first keeping each pixel's strongest alpha in
   * the depth buffer (depth = 1 − alpha, test LESS), the second laying the colour of the fragment that is equal to it, once (stencil bit). Without
   * them the strips lay over each other, stacking where they overlap. Both buffers are cleared after, for the vessels.
   */
  function drawWarm(m, pw, ph, exact = true) {
    if (!lines || !hasKind(2)) return false;
    if (!exact || !P.warm) { if (!P.line) return false; lay(); strokes(2, P.line, m, pw, ph); off(); return true; }
    gl.disable(gl.BLEND);
    gl.depthMask(true); gl.stencilMask(STENCIL_BIT);
    gl.clear(gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);   // (our stencil bit only: the mask holds the others)
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS);
    gl.colorMask(false, false, false, false);
    strokes(2, P.warm, m, pw, ph);
    gl.colorMask(true, true, true, true);
    gl.depthMask(false); gl.depthFunc(gl.EQUAL);
    gl.enable(gl.STENCIL_TEST); gl.stencilMask(STENCIL_BIT); gl.stencilFunc(gl.EQUAL, 0, STENCIL_BIT); gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
    lay();
    strokes(2, P.warm, m, pw, ph);
    gl.depthMask(true); gl.stencilMask(STENCIL_BIT);
    gl.clear(gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    off();
    return true;
  }
  /**
   * The ascites over the picture. base null: laid over what is there (V_FULL, after the vessels). base a texture (the kept base, the picture's size):
   * the cavity's pixels written as the base with the fluid over it, no blending (a frame where only the fluid moved; E scissors to fluidBox, then
   * draws the blood's pixels, which lay vecAboveAt themselves).
   */
  function drawFluid(m, look, pw, ph, base = null) {
    const fl = fluidOf(look), p = base ? P.rebase : P.fluid;
    if (!fl || !p) return false;
    const U = p.u;
    gl.useProgram(p.p);
    UC.m3(U.world, m3put(WORLD, m[0], m[1], m[2], m[3], m[4], m[5]));
    UC.f2(U.size, pw, ph);
    UC.m3(U.inv, invPut(m));
    UC.f1(U.H, ph);
    UC.f1(U.pxW, pxWOf(m));
    UC.f4a(U.fluidRect, fluidRect || R_UNIT);
    UC.f4a(U.fluidS, fl.s || V4_ZERO);
    UC.f4a(U.fluidInk, fl.ink);
    UC.f2a(U.fluidLv, fl.lv || LV_DEF);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, fluidTex); UC.i1(U.fluidMask, 0);
    if (base) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, base); UC.i1(U.vecBase, 1); gl.activeTexture(gl.TEXTURE0); gl.disable(gl.BLEND); }
    else lay();
    gl.bindVertexArray(quadVAO);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    off();
    return true;
  }
  function drawCath(m, pw, ph) {
    if (!cath || !P.cath) return false;
    const U = P.cath.u;
    gl.useProgram(P.cath.p);
    UC.m3(U.world, m3put(WORLD, m[0], m[1], m[2], m[3], m[4], m[5]));
    UC.f2(U.size, pw, ph);
    UC.f2a(U.light, cath.light || LIGHT);
    lay();
    gl.bindVertexArray(cathGeo.va);
    for (let i = 0; i < cath.draws.length; i++) {
      const d = cath.draws[i];
      UC.i1(U.mode, d.mode);
      UC.f3a(U.col, d.col);
      UC.f1(U.alpha, d.alpha);
      UC.f2a(U.fade, d.fade || V4_ZERO);
      UC.f1(U.len, d.len ?? 1e9);
      gl.drawArrays(d.tri ? gl.TRIANGLES : gl.TRIANGLE_STRIP, d.first, d.count);
    }
    off();
    return true;
  }
  /**
   * The organ outlines. stencilRef null: laid over the whole of what the scissor allows. A number: laid only where the stencil equals it (a frame
   * where only the blood moved: E marks the lumen pixels it wrote with that value, and the outlines over those are laid again, exactly once).
   */
  function drawLines(m, pw, ph, stencilRef = null) {
    if (!ready(0, P.line)) return false;
    if (stencilRef !== null) { gl.enable(gl.STENCIL_TEST); gl.stencilFunc(gl.EQUAL, stencilRef, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP); gl.stencilMask(0); }
    lay();
    strokes(0, P.line, m, pw, ph);
    off();
    return true;
  }
  /** Everything over the vessels, in order: the ascites, the catheter, the outlines (a V_FULL frame). */
  function drawOver(m, look, pw, ph) {
    drawFluid(m, look, pw, ph);
    drawCath(m, pw, ph);
    drawLines(m, pw, ph);
  }
  function dispose() {
    for (const b of [quad, lineGeo.buf, cathGeo.buf]) gl.deleteBuffer(b);
    for (const v of [quadVAO, lineGeo.va, cathGeo.va]) gl.deleteVertexArray(v);
    gl.deleteTexture(fluidTex);
    for (const k of Object.keys(P)) if (P[k]) gl.deleteProgram(P[k].p);
  }

  return {
    ok: !!(P.line || P.cath || P.map || P.fluid),
    /** Whether outlines / the catheter can be drawn here (else stage.js keeps its SVG ones). */
    get canLines() { return !!P.line; }, get canCath() { return !!P.cath; },
    setLines, setCath, setFluidSpans, setFluidLiver,
    /** Counters that rise when a layer's picture changes (its geometry, its colours or alphas, the cavity): E redraws the kept base when glow, warm
     *  (or the look's map) rise, and the over layers when lines, cath or fluid do. Kept, written in place. */
    ver, stats,
    hasGlow: () => hasKind(1), hasWarm: () => hasKind(2), hasLines: () => hasKind(0), hasCath: () => !!cath, hasFluid: (look) => !!fluidOf(look),
    drawBehind, drawMap, drawWarm, drawFluid, drawCath, drawLines, drawOver,
    cathBox, fluidBox, dispose,
  };
}
