// The vector vessel renderer's core (docs/recommendations/vector-renderer-plan.md sections 3, 4 and 7; workstream E): the programs, the
// cell and region textures, the strip buffers, the frame, the caches and the timers. It draws what vec-frame.js plans, into the picture the
// figure's composite writes today, in one render pass per frame kind and no framebuffer switch inside a pass (vec-targets.js).
//
// createVecRenderer(gl, shared) returns the same API as veins-gl's instance for the calls the figure makes (draw, drawRows, composite and
// the setters), so the seam (workstream H) hands over at one place. A vector frame:
//   FULL  organs, under-overlays, strips, regions, heads, over-overlays, blood, in one pass into the picture (camera, morph, deforming)
//   BASE  the same without the blood and what lies over it, into the kept base (written once when the view comes to rest)
//   BLOOD lumen strips and lumen regions only, over the kept base, into the picture (frames where only the blood moved)
//
// ── The ports (what the renderer is given; other workstreams code against these) ──
// shared (H builds it from the veins-gl instance; read, never written here):
//   nTubes            vessel rows
//   who               'stage' | 'lobule'
//   picture()         { tex, w, h }: the figure's picture (its own kept picture, or the shared screen texture), device px
//   tex               { ent, rad, rmax, tube, flow, bend, dye, noiseT, organ }: each a WebGLTexture or a function returning one
//   uniforms          { name: value }: anything else a program declares (kept current by the seam; look and blood come with each draw)
//   isLost()          the context is lost
//   parts.stretch     { vs, fs(variant) }   workstream B: strings (vs may be a function returning one)
//   parts.region      { vs, fs(variant) }   workstream C
//   parts.compile     { build(bins, nTubes) → grid, patch(bins) → grid|null, rows(rowList) → grid|null, morph(bins) → grid, exceeds(row, r) → bool }  workstream A
//                     grid = { cells: Uint16Array, regions: Float32Array, nRegions, gridO: [x, y], gridN: [w, h], rowsH, dirtyRows?: [r0, r1] }
//                     (cells: RGBA16UI texels, GRID_W across, in the contract's layout; regions: REGION_TEXELS RGBA32F texels a region)
//   parts.organs      { draw(pass, m), setOrgans(...), ready?() }   workstream F
//   parts.overlays    { draw(pass, m, phase), setOverlays(...), ready?() }   workstream G, phase: PHASE.UNDER | HEADS | OVER
// pass: the record handed to organs and overlays while a pass is open: { variant, w, h, m, box: [x0, y0, x1, y1] | null, look }.
// Organs (F) are also called outside a pass: update() before the passes of a frame that draws organs, prepare(undefined, scale) and step(deadline)
// on idle frames (an idle frame draws nothing), setCovers(...) forwarded, covers() -> { tex, rect } read for the vessels' veil (the organ sampler, organRect, useOrgan).
//
// Attributes of the programs it draws (the programs bind these locations):
//   stretch: layout(location=0) in vec4 aV (the mesh's stripIndex attribute); layout(location=1) in float aRow (instance, the vessel row)
//   region:  layout(location=0) in vec2 aC (unit corner, 0..1); layout(location=1) in vec2 aCell (instance: the cell's integer (x, y))
// Uniforms: VEC_OWN_UNIFORMS (set here), then the look and blood by name (LOOK_UNIFORMS, BLOOD_UNIFORMS), then shared.uniforms, then the
// samplers by name from shared.tex. A uniform none of them names is left as it is.
import { V_FULL, V_BASE, V_BLOOD, GRID_W, REGION_TEXELS, CELL_REGION, CELL_SIMPLE, K_JOIN, K_CROSS, K_HAIRPIN, K_NEAR, K_MORPH, K_CROSSTIER, K_LONG } from './vec-contract.js';
import { CELL } from './veins-bin.js';
import { stripIndex } from './veins-mesh.js';
import { startProgram, compileDone, checkProgram } from './gl-compile.js';
import { gpuProbe } from './gpu-probe.js';
import { VEC_BLOOD_UNIFORMS } from './vec-blood-glsl.js';
import { createVecTargets } from './vec-targets.js';
import { createVecFrame, addBox, D, REFUSED, MAX_BOXES } from './vec-frame.js';

/** The overlays' phases (workstream G draws one per call). BEHIND: the glow and the map, first of all (V_FULL, V_BASE); UNDER: the warm glow, between the organs and the strips (G
 *  uses depth and stencil bit 0x80 there and clears both after it); HEADS: after the lumens (V_FULL, V_BLOOD; in V_BLOOD limited by the stencil the lumens wrote); OVER: last (V_FULL). */
export const PHASE = Object.freeze({ UNDER: 0, HEADS: 1, OVER: 2, BEHIND: 3 });
export const KINDS = Object.freeze(['FULL', 'BASE', 'BLOOD']);

/** The uniforms this file sets itself (name → GLSL type); the shader workstreams' `uniformsOf` lists must stay inside these plus the look, blood and shared sets. */
export const VEC_OWN_UNIFORMS = Object.freeze({
  world: 'mat3',        // world → device px (y down)
  inv: 'mat3',          // gl_FragCoord.xy (y up) → world: the one rule every program finds its cell with
  size: 'vec2',         // the picture, device px
  H: 'float',           // the picture's height, device px
  px: 'float',          // world units per device px
  pxW: 'float',
  cell: 'float',        // CELL, world units
  gridO: 'vec2',        // the cell grid's origin (world)
  gridN: 'vec2',        // cells across, cells down
  padU: 'float',        // world units the strip is widened by past the lumen: |shOff| + the glow's reach (12 × 1.3) + 2 px; the BLOOD pass's lumen strip: 2 px
  selPad: 'float',      // and more for a selected vessel's ring: 4 + 2 px (0 in the BLOOD pass)
  lOff: 'vec2',         // (0, 0): the vector picture has no wrapped layer
  variant: 'int',       // V_FULL | V_BASE | V_BLOOD
  cellTex: 'usampler2D',
  regionTex: 'sampler2D',
  vecBase: 'sampler2D', // the kept base (the BLOOD pass reads it)
  morphOn: 'int', posBase: 'int', joinBase: 'int',   // the morph set in use, as veins-gl's
});
/** look.field → uniform name (the names veins-gl's vessel pass uses). */
export const LOOK_UNIFORMS = Object.freeze({
  reach: 'reachU', shOff: 'shOff', casing: 'casing', shadow: 'shadow', sheen: 'sheenInk', shade: 'shadeInk', rim: 'rimInk', paper: 'paperInk', ring: 'ring',
  light: 'light', netAlpha: 'netAlpha', fx: 'fx', tierAlpha: 'tierAlpha', tierGroup: 'tierGroup', organs: 'organK',
});
/** blood.field → uniform name (the composite's). */
export const BLOOD_UNIFORMS = Object.freeze({
  on: 'blood', chev: 'chev', still: 'still', alpha: 'flowA', chevInk: 'chevInk', chevLight: 'chevLight', vdpr: 'cssPx', streakLen: 'lenOn', origin: 'origin',
  clock: 'clock', bt: 'bT', originCol: 'originCol', dyeCol: 'dyeCol', revCol: 'revCol', inkLight: 'inkLight', inkDark: 'inkDark', style: 'bloodStyle',
});
const BLOOD_VEC3 = { blendA: ['streakA', 'chevA', 'originA'] };

const NO_RIM = [0, 0, 0, 0];
// The own scalar uniforms, read from one kept Float64Array (a double returned from a function or kept in a variable is a heap number made each frame).
const SCALARS = ['px', 'pxW', 'H', 'cell', 'padU', 'selPad', 'variant', 'morphOn', 'posBase', 'joinBase',
  'vbOn', 'vbChev', 'vbChevQuad', 'vbStill', 'vbLenOn', 'vbOrigin', 'vbDyeOn', 'vbStyle', 'vbFlowA', 'vbClock', 'vbBT', 'vbCssPx', 'vbDyeRows', 'vbBleedN', 'vbNoChevN', 'vbChevHoleN'];
// workstream D's blood uniforms (vec-blood-glsl.js VEC_BLOOD_UNIFORMS): each names the composite uniform it stands for (`from`), set from the blood.
const VB_FROM = Object.freeze(Object.fromEntries(VEC_BLOOD_UNIFORMS.filter((u) => u.from).map((u) => [u.name, u.from])));
const SC_AT = Object.freeze(Object.fromEntries(SCALARS.map((k, i) => [k, i])));
const GLOW_REACH = 12 * 1.3;   // (the widest glow, as veins-gl's pad has it)
const UNIFORM_RE = /uniform\s+(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+([^;]+);/g;
const TUBE_FLOATS = 52;

/** The uniforms a program's two shader sources declare: [{ name, type, size }] (size > 0: an array). */
export function declaredUniforms(...sources) {
  const out = [], seen = new Set();
  for (const src of sources) {
    for (const m of String(src).replace(/\/\/.*$/gm, '').matchAll(UNIFORM_RE)) {
      for (const part of m[2].split(',')) {
        const n = part.trim().match(/^(\w+)\s*(?:\[\s*(\d+)\s*\])?/);
        if (n && !seen.has(n[1])) { seen.add(n[1]); out.push({ name: n[1], type: m[1], size: n[2] ? +n[2] : 0 }); }
      }
    }
  }
  return out;
}

export function createVecRenderer(gl, shared) {
  const nTubes = shared.nTubes | 0;
  const parts = shared.parts || {};
  const targets = createVecTargets(gl);
  const frame = createVecFrame(nTubes);
  const who = shared.who || 'stage';
  let lost = false, disposed = false;

  // ── Programs: stretch and region, one a variant, started together (gl-compile.js) and published when the driver is done ──
  const handles = [], progs = [[null, null, null], [null, null, null]];   // progs[0] stretch, progs[1] region, by variant
  let ready = false, failure = '', started = false;
  const missing = () => ['stretch', 'region', 'compile'].filter((k) => !parts[k]);
  function start() {
    if (started || !parts.stretch || !parts.region) return;
    started = true;
    const vsOf = (p) => (typeof p.vs === 'function' ? p.vs() : p.vs);
    for (let v = 0; v < 3; v++) {
      const sfs = parts.stretch.fs(v), rfs = parts.region.fs(v);
      const sh = startProgram(gl, vsOf(parts.stretch), sfs, [['aV', 0], ['aRow', 1]]);
      const rh = startProgram(gl, vsOf(parts.region), rfs, [['aC', 0], ['aCell', 1]]);
      handles.push(sh, rh);
      progs[0][v] = { h: sh, p: null, u: null, vs: vsOf(parts.stretch), fs: sfs };
      progs[1][v] = { h: rh, p: null, u: null, vs: vsOf(parts.region), fs: rfs };
    }
  }
  // One uniform: its location, GLSL type, array size, the texture unit (a sampler) and the name the value is looked up by.
  function publish(pr) {
    pr.p = checkProgram(gl, pr.h);
    const list = declaredUniforms(pr.vs, pr.fs), u = [];
    let unit = 0;
    for (const d of list) {
      const loc = gl.getUniformLocation(pr.p, d.size ? `${d.name}[0]` : d.name);
      if (!loc) continue;
      const sampler = /sampler/.test(d.type);
      u.push({ loc, name: d.name, type: d.type, size: d.size, unit: sampler ? unit++ : -1, sc: !d.size && d.name in SC_AT ? SC_AT[d.name] : -1 });
    }
    pr.u = u;
  }
  function prepare() {
    if (ready || failure || disposed) return ready;
    start();
    if (!started) return false;
    if (!compileDone(gl, handles)) return false;
    try {
      for (let k = 0; k < 2; k++) for (let v = 0; v < 3; v++) publish(progs[k][v]);
      for (const h of handles) for (const s of h.sh) gl.deleteShader(s);
      ready = true;
    } catch (e) { failure = String(e?.message || e).slice(0, 200); }   // alloc-rare: once, on a program that failed to link
    return ready;
  }

  // ── The compiled grid (workstream A): the cell and region textures, the region cells' instance list ──
  let grid = null, hadGrid = false;
  let cellTex = null, regionTex = null, cellTexH = 0, regionTexH = 0;
  let regionCells = new Float32Array(256), nRegionCells = 0, regionBuf = null;
  const counts = { join: 0, cross: 0, hairpin: 0, near: 0, morph: 0, regions: 0 };
  function sampler(t, internal, w, h, filter) {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, internal, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  function uploadGrid(g, r0 = 0, r1 = g.rowsH - 1) {
    if (!cellTex || cellTexH < g.rowsH) {
      if (cellTex) gl.deleteTexture(cellTex);
      cellTex = gl.createTexture(); cellTexH = Math.max(g.rowsH, 1);
      sampler(cellTex, gl.RGBA16UI, GRID_W, cellTexH, gl.NEAREST);
      r0 = 0; r1 = g.rowsH - 1;
    }
    if (g.rowsH > 0) {
      gl.bindTexture(gl.TEXTURE_2D, cellTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, r0, GRID_W, r1 - r0 + 1, gl.RGBA_INTEGER, gl.UNSIGNED_SHORT, g.cells, r0 * GRID_W * 4);
    }
    const nR = Math.max(g.nRegions | 0, 1);
    if (!regionTex || regionTexH < nR) {
      if (regionTex) gl.deleteTexture(regionTex);
      regionTex = gl.createTexture(); regionTexH = nR;
      sampler(regionTex, gl.RGBA32F, REGION_TEXELS, regionTexH, gl.NEAREST);
    }
    if (g.nRegions > 0) {
      gl.bindTexture(gl.TEXTURE_2D, regionTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, REGION_TEXELS, g.nRegions, gl.RGBA, gl.FLOAT, g.regions);
    }
  }
  // The region cells (the instances of the region quad) and the counts the gauge reports, found from the cell and region texels.
  function scanGrid(g) {
    counts.join = counts.cross = counts.hairpin = counts.near = counts.morph = 0; counts.regions = g.nRegions | 0;
    for (let r = 0; r < counts.regions; r++) {
      const k = g.regions[r * REGION_TEXELS * 4] | 0;
      if (k & (K_JOIN | K_CROSSTIER)) counts.join++;
      if (k & K_CROSS) counts.cross++;
      if (k & (K_HAIRPIN | K_LONG)) counts.hairpin++;
      if (k & K_NEAR) counts.near++;
      if (k & K_MORPH) counts.morph++;
    }
    const gw = g.gridN[0], gh = g.gridN[1];
    let n = 0;
    for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) if (g.cells[(cy * GRID_W + cx) * 4] === CELL_REGION) n++;
    if (regionCells.length < n * 2) regionCells = new Float32Array(Math.max(n * 2, regionCells.length * 2));   // alloc-rare: when a compile has more region cells than ever before
    n = 0;
    for (let cy = 0; cy < gh; cy++) for (let cx = 0; cx < gw; cx++) if (g.cells[(cy * GRID_W + cx) * 4] === CELL_REGION) { regionCells[n * 2] = cx; regionCells[n * 2 + 1] = cy; n++; }
    nRegionCells = n;
    gl.bindBuffer(gl.ARRAY_BUFFER, regionBuf);
    gl.bufferData(gl.ARRAY_BUFFER, regionCells, gl.DYNAMIC_DRAW, 0, n * 2);
  }
  function takeGrid(g) {
    if (!g || !g.cells) return;
    grid = g; hadGrid = true; gridVer++;
    const rows = g.dirtyRows;
    uploadGrid(g, rows ? rows[0] : 0, rows ? rows[1] : g.rowsH - 1);
    scanGrid(g);
  }

  // ── The strips: the mesh's static strip buffers, one instance a vessel row (kept for the life of the instance) ──
  const strip = stripIndex(Math.max(nTubes, 1));
  const stripVao = gl.createVertexArray(), regionVao = gl.createVertexArray();
  const stripBufs = [gl.createBuffer(), gl.createBuffer(), gl.createBuffer()];
  regionBuf = gl.createBuffer();
  const quadBuf = gl.createBuffer();
  gl.bindVertexArray(stripVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, stripBufs[0]);
  gl.bufferData(gl.ARRAY_BUFFER, strip.attr, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, stripBufs[1]);
  gl.bufferData(gl.ARRAY_BUFFER, strip.rows, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 1);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, stripBufs[2]);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, strip.index, gl.STATIC_DRAW);
  gl.bindVertexArray(regionVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, regionBuf);
  gl.bufferData(gl.ARRAY_BUFFER, regionCells, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(1, 1);
  gl.bindVertexArray(null);
  // A 1 × 1 texture for a sampler nothing real stands behind (and for the base while it is being written).
  const blank = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, blank);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));

  // ── State kept between frames ──
  const curM = new Float64Array(6);
  let haveM = false, curLook = null, curBlood = null;
  const WORLD = new Float32Array(9), INV = new Float32Array(9), SIZE = new Float32Array(2), GRIDO = new Float32Array(2), GRIDN = new Float32Array(2), LOFF = new Float32Array(2);
  const SC = new Float64Array(SCALARS.length);
  let wNow = 0, hNow = 0, variantNow = 0, cov = null, lastPrepScale = 0, idleMore = false;
  const morph = { on: 0, posBase: 0, joinBase: 0 };
  let morphSet = null;
  const unitTex = new Array(16).fill(null);
  const PASS = { variant: 0, w: 0, h: 0, m: curM, box: null, look: null };
  const BOX = [0, 0, 0, 0];
  const tubeLast = new Float32Array(TUBE_FLOATS * Math.max(nTubes, 1)), flowLast = new Float32Array(8 * 4 * Math.max(nTubes, 1));
  let tubesSeen = false, flowSeen = false;
  const bloodBoxes = new Int32Array(MAX_BOXES * 4);
  let nBloodBoxes = 0;
  // The rows that show blood (the lobule leaves out the vessels seen end-on): the BLOOD pass is limited to the cells that list them. Their
  // boxes are worked out again only when the rows, the grid or the view change. lastBlood: the last BLOOD pass's boxes (picture px, y from the
  // bottom) for the seam to repaint a kept picture in just those.
  const bloodMarks = new Uint8Array(Math.max(nTubes, 1)), bloodKeyM = new Float64Array(6);
  let bloodRowsSet = false, bloodVer = 0, gridVer = 0, bloodKeyVer = -1, bloodKeyGrid = -1, bloodKeyW = 0, bloodKeyH = 0;
  const lastBlood = { boxes: new Float32Array(MAX_BOXES * 4), n: 0 };
  let rowsStatus = 'drawn';
  const stats = { passes: 0, frames: 0, byKind: [0, 0, 0], draws: 0, programsUsed: [0, 0, 0, 0, 0, 0], skipped: 0, lastKinds: '' };

  // ── Camera uniforms ──
  function setCamera(m) {
    for (let i = 0; i < 6; i++) curM[i] = m[i];
    haveM = true;
    const a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5];
    const det = a * d - b * c || 1e-9;
    const ia = d / det, ib = -b / det, ic = -c / det, id = a / det, ie = -(ia * e + ic * f), iff = -(ib * e + id * f);
    WORLD[0] = a; WORLD[1] = b; WORLD[2] = 0; WORLD[3] = c; WORLD[4] = d; WORLD[5] = 0; WORLD[6] = e; WORLD[7] = f; WORLD[8] = 1;
    // (world = M⁻¹ · (fx, H − fy): the y flip is in the matrix, so the cell test is inv × gl_FragCoord.xy with no further arithmetic.)
    INV[0] = ia; INV[1] = ib; INV[2] = 0; INV[3] = -ic; INV[4] = -id; INV[5] = 0;
    INV[6] = ic * hNow + ie; INV[7] = id * hNow + iff; INV[8] = 1;
    SC[SC_AT.px] = 1 / Math.sqrt(Math.abs(det));
  }

  // ── Setting a program's uniforms and samplers ──
  const bindTex = (u, t) => {
    if (unitTex[u] === t) return;
    gl.activeTexture(gl.TEXTURE0 + u);
    gl.bindTexture(gl.TEXTURE_2D, t);
    unitTex[u] = t;
  };
  const texOf = (name) => {
    switch (name) {
      case 'cellTex': return cellTex || blank;
      case 'regionTex': return regionTex || blank;
      case 'vecBase': return variantNow === V_BLOOD ? targets.baseTex || blank : blank;   // (never the base while it is being written: a feedback loop)
      case 'organ': if (cov?.tex) return cov.tex;   // falls through to the shared one
      // eslint-disable-next-line no-fallthrough
      default: {
        const t = shared.tex?.[VB_FROM[name] || name];
        return (typeof t === 'function' ? t() : t) || blank;
      }
    }
  };
  const lookKey = {};
  for (const k of Object.keys(LOOK_UNIFORMS)) lookKey[LOOK_UNIFORMS[k]] = k;
  const bloodKey = {};
  for (const k of Object.keys(BLOOD_UNIFORMS)) bloodKey[BLOOD_UNIFORMS[k]] = k;
  function valueOf(name) {
    switch (name) {
      case 'world': return WORLD;
      case 'inv': return INV;
      case 'size': return SIZE;
      case 'gridO': return GRIDO;
      case 'gridN': return GRIDN;
      case 'lOff': return LOFF;
      case 'rimInk': return curLook?.rim || NO_RIM;
      case 'paperInk': return curLook?.paper || NO_RIM;
      case 'organRect': if (cov?.rect) return cov.rect; break;
      case 'useOrgan': if (cov) return curLook && curLook.organs > 0 ? 1 : 0; break;
      case 'blendA': case 'vbBlendA': return BLEND_A;
      case 'bleedE': return BLEEDE;
      case 'bleedB': return BLEEDB;
      case 'noChev': return NOCHEV;
      case 'chevHole': return HOLES;
      case 'chevHoleR': return HOLER;
      case 'originCol': return curBlood?.originCol ? ORIGINCOL : undefined;
      case 'dyeOn': return curBlood && curBlood.dye !== false ? 1 : 0;
      default: break;
    }
    const fr = VB_FROM[name];
    if (fr !== undefined) return valueOf(fr);
    const lk = lookKey[name];
    if (lk !== undefined && curLook) { const v = curLook[lk]; if (v !== undefined) return v; }
    const bk = bloodKey[name];
    if (bk !== undefined && curBlood) { const v = curBlood[bk]; if (v !== undefined) return v; }
    return shared.uniforms?.[name];
  }
  const BLEND_A = new Float32Array(3);
  // The blood's lists packed into kept arrays once a frame (the composite's: bleeds, figure-reading boxes, holes, the five origin colours).
  const BLEEDE = new Float32Array(96), BLEEDB = new Float32Array(96), NOCHEV = new Float32Array(48), HOLES = new Float32Array(64), HOLER = new Float32Array(16), ORIGINCOL = new Float32Array(15);
  let nBleed = 0, nNoChev = 0, nHoles = 0;
  function packBlood() {
    const b = curBlood;
    nBleed = 0; nNoChev = 0; nHoles = 0;
    if (!b) return;
    const bl = b.bleed;
    if (bl) { nBleed = Math.min(24, bl.length); for (let i = 0; i < nBleed; i++) for (let j = 0; j < 4; j++) { BLEEDE[i * 4 + j] = bl[i][j]; BLEEDB[i * 4 + j] = bl[i][4 + j]; } }
    const nc = b.noChev;
    if (nc) { nNoChev = Math.min(12, nc.length); for (let i = 0; i < nNoChev; i++) for (let j = 0; j < 4; j++) NOCHEV[i * 4 + j] = nc[i][j]; }
    const ho = b.holes;
    if (ho) { nHoles = Math.min(16, ho.length); for (let i = 0; i < nHoles; i++) { for (let j = 0; j < 4; j++) HOLES[i * 4 + j] = ho[i][j] ?? 0; HOLER[i] = ho[i][4] || 0; } }
    const oc = b.originCol;
    if (oc) for (let i = 0; i < 5; i++) { const c = oc[i]; if (c) { ORIGINCOL[i * 3] = c[0]; ORIGINCOL[i * 3 + 1] = c[1]; ORIGINCOL[i * 3 + 2] = c[2]; } }
  }
  function fillScalars() {
    const pxv = SC[SC_AT.px];
    SC[SC_AT.pxW] = pxv; SC[SC_AT.H] = hNow; SC[SC_AT.cell] = CELL; SC[SC_AT.variant] = variantNow;
    const so = curLook?.shOff;
    SC[SC_AT.padU] = variantNow === V_BLOOD ? 2 * pxv : Math.hypot(so ? so[0] : 0, so ? so[1] : 0) + GLOW_REACH + 2 * pxv;
    SC[SC_AT.selPad] = variantNow === V_BLOOD ? 0 : 4 + 2 * pxv;
    const b = curBlood;
    SC[SC_AT.vbOn] = b && b.on ? 1 : 0; SC[SC_AT.vbChev] = b && b.chev ? 1 : 0; SC[SC_AT.vbChevQuad] = shared.uniforms?.chevQuad ? 1 : 0;   // (arrowheads in the lumen until the heads' quads are wired)
    SC[SC_AT.vbStill] = b && b.still ? 1 : 0; SC[SC_AT.vbLenOn] = b && b.streakLen ? 1 : 0; SC[SC_AT.vbOrigin] = b && b.origin ? 1 : 0;
    SC[SC_AT.vbDyeOn] = b && b.dye !== false ? 1 : 0; SC[SC_AT.vbStyle] = b ? b.style | 0 : 0;
    SC[SC_AT.vbFlowA] = b ? b.alpha ?? 1 : 1; SC[SC_AT.vbClock] = b ? b.clock || 0 : 0; SC[SC_AT.vbBT] = b ? b.bt || 0 : 0; SC[SC_AT.vbCssPx] = b ? b.vdpr || 1 : 1;
    SC[SC_AT.vbDyeRows] = nTubes; SC[SC_AT.vbBleedN] = nBleed; SC[SC_AT.vbNoChevN] = nNoChev; SC[SC_AT.vbChevHoleN] = nHoles;
    SC[SC_AT.morphOn] = morph.on; SC[SC_AT.posBase] = morph.posBase; SC[SC_AT.joinBase] = morph.joinBase;
  }
  function setUniforms(pr) {
    BLEND_A[0] = curBlood?.[BLOOD_VEC3.blendA[0]] ?? 1; BLEND_A[1] = curBlood?.[BLOOD_VEC3.blendA[1]] ?? 1; BLEND_A[2] = curBlood?.[BLOOD_VEC3.blendA[2]] ?? 1;
    const U = pr.u;
    for (let i = 0; i < U.length; i++) {
      const e = U[i];
      if (e.unit >= 0) { gl.uniform1i(e.loc, e.unit); bindTex(e.unit, texOf(e.name)); continue; }
      if (e.sc >= 0) { if (e.type === 'float') gl.uniform1f(e.loc, SC[e.sc]); else gl.uniform1i(e.loc, SC[e.sc] | 0); continue; }
      const v = valueOf(e.name);
      if (v === undefined || v === null) continue;
      switch (e.type) {
        case 'float': if (e.size) gl.uniform1fv(e.loc, v); else gl.uniform1f(e.loc, +v); break;
        case 'int': case 'bool': if (e.size) gl.uniform1iv(e.loc, v); else gl.uniform1i(e.loc, v === true ? 1 : v === false ? 0 : v | 0); break;
        case 'vec2': gl.uniform2fv(e.loc, v); break;
        case 'vec3': gl.uniform3fv(e.loc, v); break;
        case 'vec4': gl.uniform4fv(e.loc, v); break;
        case 'ivec2': gl.uniform2iv(e.loc, v); break;
        case 'ivec3': gl.uniform3iv(e.loc, v); break;
        case 'ivec4': gl.uniform4iv(e.loc, v); break;
        case 'mat3': gl.uniformMatrix3fv(e.loc, false, v); break;
        default: break;
      }
    }
  }

  // ── Boxes: the device boxes of the cells that list a marked row ──
  function rowBoxes(marks, m, out, max) {
    const g = grid;
    if (!g) return -1;
    const gw = g.gridN[0], gh = g.gridN[1], ox = g.gridO[0], oy = g.gridO[1];
    let n = 0;
    for (let cy = 0; cy < gh; cy++) {
      for (let cx = 0; cx < gw; cx++) {
        const o = (cy * GRID_W + cx) * 4, kind = g.cells[o];
        let hit = false;
        if (kind === CELL_SIMPLE) hit = marks[g.cells[o + 1]] === 1;
        else if (kind === CELL_REGION) {
          const rb = g.cells[o + 1] * REGION_TEXELS * 4, cnt = g.regions[rb + 1] | 0;
          for (let k = 0; k < cnt && !hit; k++) hit = marks[g.regions[rb + (1 + k) * 4]] === 1;
        }
        if (!hit) continue;
        const x0 = ox + cx * CELL, y0 = oy + cy * CELL, x1 = x0 + CELL, y1 = y0 + CELL;
        let lx = Infinity, ly = Infinity, hx = -Infinity, hy = -Infinity;
        for (let q = 0; q < 4; q++) {
          const wx = q & 1 ? x1 : x0, wy = q & 2 ? y1 : y0;
          const dx = m[0] * wx + m[2] * wy + m[4], dy = m[1] * wx + m[3] * wy + m[5];
          if (dx < lx) lx = dx; if (dx > hx) hx = dx; if (dy < ly) ly = dy; if (dy > hy) hy = dy;
        }
        const bx0 = Math.max(0, Math.floor(lx) - 1), by0 = Math.max(0, Math.floor(ly) - 1), bx1 = Math.min(wNow, Math.ceil(hx) + 1), by1 = Math.min(hNow, Math.ceil(hy) + 1);
        if (bx1 <= bx0 || by1 <= by0) continue;
        n = addBox(out, n, bx0, by0, bx1, by1);
      }
    }
    void max;
    return n;
  }

  // ── GPU timers (EXT_disjoint_timer_query_webgl2), per frame kind, only while ?perf measures, read asynchronously ──
  const TQ = { ext: undefined, q: [[], [], []], pend: [[], [], []], ms: new Float32Array(3), live: -1 };
  function timerExt() {
    if (TQ.ext === undefined) TQ.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') || null;
    return TQ.ext;
  }
  function timerBegin(kind) {
    if (!gpuProbe.on || !timerExt()) return;
    const pool = TQ.q[kind], pend = TQ.pend[kind];
    if (pend.length >= 4) return;
    let q = pool.pop();
    if (!q) q = gl.createQuery();   // alloc-rare: a few queries per kind, made while ?perf measures
    gl.beginQuery(TQ.ext.TIME_ELAPSED_EXT, q);
    pend.push(q);   // alloc-rare: the pending list holds at most four, only while ?perf measures
    TQ.live = kind;
  }
  function timerEnd() {
    if (TQ.live < 0) return;
    gl.endQuery(TQ.ext.TIME_ELAPSED_EXT);
    TQ.live = -1;
  }
  function timerPoll() {
    if (!TQ.ext) return;
    for (let k = 0; k < 3; k++) {
      const pend = TQ.pend[k];
      while (pend.length && !(TQ.live === k && pend.length === 1)) {
        const q = pend[0];
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
        const disjoint = gl.getParameter(TQ.ext.GPU_DISJOINT_EXT);
        if (!disjoint) TQ.ms[k] = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;   // (a disjoint result is dropped: it is not a time)
        pend.shift(); TQ.q[k].push(q);   // alloc-rare: at most four queries, only while ?perf measures
      }
    }
  }
  function report(P) {
    if (!gpuProbe.on) return;
    timerPoll();
    const sub = `${counts.join} join, ${counts.cross} cross, ${counts.hairpin} hairpin, ${counts.near} near, ${counts.morph} morph`;   // alloc-rare: only while ?perf measures
    gpuProbe.gauge('vessel renderer', `vector: ${nTubes} strips, ${counts.regions} regions (${sub}), ${P ? P.passes : 0} passes`);   // alloc-rare: only while ?perf measures
    gpuProbe.gauge('vector frame', P ? P.why : 'none');
    for (let k = 0; k < 3; k++) if (TQ.ms[k] > 0) gpuProbe.gauge(`vector GPU ms: ${KINDS[k]}`, +TQ.ms[k].toFixed(2));   // alloc-rare: only while ?perf measures
    gpuProbe.gauge('vector targets sized', targets.sized);
  }

  // ── Passes ──
  function scissorBox(o, list) {
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(list[o], hNow - list[o + 3], list[o + 2] - list[o], list[o + 3] - list[o + 1]);
  }
  function scene(variant, m) {
    variantNow = variant;
    cov = parts.organs?.covers?.() || null;
    PASS.look = curLook;
    fillScalars();
    const s = progs[0][variant], r = progs[1][variant];
    const base = variant !== V_BLOOD;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (variant === V_BLOOD) gl.disable(gl.BLEND);   // (the BLOOD pass writes the final pixel over the base it read)
    if (base) {
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.STENCIL_TEST);
      if (parts.overlays) {
        parts.overlays.draw(PASS, m, PHASE.BEHIND); unitTex.fill(null);   // (the glow and the map: under the organs; G leaves blending off)
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      }
      if (parts.organs) { parts.organs.draw(PASS, m); unitTex.fill(null); }
      if (parts.overlays) { parts.overlays.draw(PASS, m, PHASE.UNDER); unitTex.fill(null); }
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.STENCIL_TEST);
    }
    // The strips: depth LESS with a constant depth a vessel row, so a vessel's overlapping triangles write a pixel once.
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
    // In the BLOOD pass the lumens write stencil 1, so G redraws the outlines and the catheter over exactly those pixels in HEADS.
    if (variant === V_BLOOD) { gl.enable(gl.STENCIL_TEST); gl.stencilMask(0xff); gl.stencilFunc(gl.ALWAYS, 1, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE); }
    else gl.disable(gl.STENCIL_TEST);
    gl.useProgram(s.p);
    setUniforms(s);
    gl.bindVertexArray(stripVao);
    gl.drawElementsInstanced(gl.TRIANGLES, strip.nIndex, gl.UNSIGNED_SHORT, 0, nTubes);
    stats.programsUsed[variant * 2]++;
    stats.draws++;
    // The regions: quads over their cells; the cells partition the picture, so no depth.
    if (nRegionCells > 0) {
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(r.p);
      setUniforms(r);
      gl.bindVertexArray(regionVao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nRegionCells);
      stats.programsUsed[variant * 2 + 1]++;
      stats.draws++;
    }
    gl.bindVertexArray(null);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.STENCIL_TEST);   // (G sets its own stencil test for HEADS)
    if (variant !== V_BASE && parts.overlays) {
      if (variant === V_BLOOD) gl.disable(gl.BLEND); else { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); }
      parts.overlays.draw(PASS, m, PHASE.HEADS); unitTex.fill(null);
      if (variant === V_FULL) { parts.overlays.draw(PASS, m, PHASE.OVER); unitTex.fill(null); }
    }
  }
  // One pass: bind the target once, clear, draw the scene whole or once a box.
  function pass(variant, mode, list, n) {
    stats.passes++; stats.byKind[variant]++;
    const toBase = variant === V_BASE;
    if (toBase) targets.bindBase(); else targets.bindPicture();
    gl.viewport(0, 0, wNow, hNow);
    PASS.variant = variant; PASS.w = wNow; PASS.h = hNow;
    unitTex.fill(null);
    timerBegin(variant);
    gl.depthMask(true); gl.stencilMask(0xff); gl.colorMask(true, true, true, true);   // (what F and G left on exit must not blunt the clears)
    const whole = mode === 1;
    if (whole) {
      gl.disable(gl.SCISSOR_TEST);
      PASS.box = null;
      if (variant !== V_BLOOD) {
        targets.invalidateColor();   // (every pixel is written: nothing is loaded)
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      } else gl.clear(gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      scene(variant, curM);
    } else {
      for (let i = 0; i < n; i++) {
        const o = i * 4;
        scissorBox(o, list);
        BOX[0] = list[o]; BOX[1] = list[o + 1]; BOX[2] = list[o + 2]; BOX[3] = list[o + 3]; PASS.box = BOX;
        if (variant !== V_BLOOD) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT); } else gl.clear(gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
        scene(variant, curM);
      }
      gl.disable(gl.SCISSOR_TEST);
      PASS.box = null;
    }
    timerEnd();
    targets.invalidateDepth();   // (depth and stencil are never stored)
  }
  function runPlan(P) {
    // The kept base first (BLOOD reads it), then the picture's boxes or whole, then the blood over it. The organs' frame changes are written first, outside any pass.
    if ((P.base || P.full) && parts.organs?.update) { parts.organs.update(); unitTex.fill(null); }
    if (P.base) pass(V_BASE, P.base, P.baseBoxes, P.nBase);
    if (P.full) pass(V_FULL, P.full, P.fullBoxes, P.nFull);
    if (P.blood) {
      if (bloodRowsSet) {
        let same = bloodKeyVer === bloodVer && bloodKeyGrid === gridVer && bloodKeyW === wNow && bloodKeyH === hNow;
        for (let i = 0; same && i < 6; i++) same = bloodKeyM[i] === curM[i];
        if (!same) {
          nBloodBoxes = rowBoxes(bloodMarks, curM, bloodBoxes, MAX_BOXES);
          bloodKeyVer = bloodVer; bloodKeyGrid = gridVer; bloodKeyW = wNow; bloodKeyH = hNow;
          for (let i = 0; i < 6; i++) bloodKeyM[i] = curM[i];
        }
      }
      if (nBloodBoxes > 0) {
        pass(V_BLOOD, 2, bloodBoxes, nBloodBoxes);
        for (let i = 0; i < nBloodBoxes; i++) {
          lastBlood.boxes[i * 4] = bloodBoxes[i * 4]; lastBlood.boxes[i * 4 + 1] = hNow - bloodBoxes[i * 4 + 3];
          lastBlood.boxes[i * 4 + 2] = bloodBoxes[i * 4 + 2]; lastBlood.boxes[i * 4 + 3] = hNow - bloodBoxes[i * 4 + 1];
        }
        lastBlood.n = nBloodBoxes;
      } else if (bloodRowsSet) lastBlood.n = 0;   // (no vessel shows blood: no pass)
      else {
        pass(V_BLOOD, 1, null, 0);
        lastBlood.boxes[0] = 0; lastBlood.boxes[1] = 0; lastBlood.boxes[2] = wNow; lastBlood.boxes[3] = hNow; lastBlood.n = 1;
      }
    }
    stats.frames++;
    stats.lastKinds = (P.base ? 'B' : '') + (P.full ? 'F' : '') + (P.blood ? 'L' : '');
  }

  // ── Idle frames: the organs prepare their detail levels ahead (F), a few ms at a time ──
  const IDLE_MS = 4;
  function idleWork() {
    const o = parts.organs;
    if (!o?.step) return;
    const sc = Math.sqrt(Math.abs(curM[0] * curM[3] - curM[1] * curM[2])) || 1;
    if (sc !== lastPrepScale && o.prepare) { lastPrepScale = sc; o.prepare(undefined, sc); idleMore = true; }
    if (idleMore) idleMore = !o.step(performance.now() + IDLE_MS);
  }

  // ── The frame ──
  function step(wholeAsked) {
    if (disposed || lost || !haveM) return false;
    if (!parts.compile || !hadGrid) { stats.skipped++; return false; }
    if (!prepare()) { stats.skipped++; return false; }
    if (gpuProbe.skipGL) return false;
    lastBlood.n = 0;   // (set again by this frame's BLOOD pass, if it has one)
    const pic = shared.picture?.();
    if (!pic || !pic.tex || !(pic.w > 0 && pic.h > 0)) return false;
    wNow = pic.w; hNow = pic.h; SIZE[0] = wNow; SIZE[1] = hNow;
    if (targets.ensure(wNow, hNow, pic.tex)) frame.note(D.SIZE);
    if (!targets.ready) return false;
    setCamera(curM);
    GRIDO[0] = grid.gridO[0]; GRIDO[1] = grid.gridO[1]; GRIDN[0] = grid.gridN[0]; GRIDN[1] = grid.gridN[1];
    const P = frame.plan(curM, wNow, hNow, curLook, curBlood, false, wholeAsked, rowBoxes);
    if (P.passes) { targets.unbound(); runPlan(P); } else idleWork();
    frame.done();
    report(P);
    return P.passes > 0;
  }

  // ── Notes of what changed (the seam forwards veins-gl's setters here) ──
  const anyRows = [];
  const api = {
    who,
    /** Whether the programs are built; failure says why not (the Settings choice shows it unavailable). */
    get ready() { return ready; },
    get failure() { return failure; },
    status() {
      if (failure) return `failed: ${failure}`;   // alloc-rare: a status read by Settings
      const miss = missing();
      if (miss.length) return `waiting for ${miss.join(', ')}`;   // alloc-rare: a status read by Settings
      return ready ? 'ready' : 'compiling';
    },
    /** Compiles at once (boot with Vector the stored choice, or the switch). */
    start() { start(); },
    prepare,
    get lost() { return lost; },
    set lost(v) { lost = !!v; if (lost) { frame.lose(); targets.dispose(); cellTex = regionTex = null; cellTexH = regionTexH = 0; ready = false; started = false; handles.length = 0; } },
    get rowsStatus() { return rowsStatus; },
    get stats() { return stats; },
    get counts() { return counts; },
    get frame() { return frame; },
    get targets() { return targets; },
    /** For the tests: the program of a kind (0 stretch, 1 region) and variant. */
    programOf(kind, variant) { return progs[kind][variant]?.p || null; },

    setGeometry(bins) {
      frame.note(D.GEOM);
      morphSet = null; morph.on = 0;
      if (parts.compile) takeGrid(parts.compile.build(bins, nTubes));
    },
    patchGeometry(bins) {
      const g = parts.compile?.patch?.(bins);
      if (g) takeGrid(g);
      if (bins?.patchTubes?.length) frame.note(D.TUBES | D.RADII, bins.patchTubes); else frame.note(D.GEOM);
    },
    makeMorphSet(bins) {
      if (!parts.compile?.morph) return null;
      const g = parts.compile.morph(bins);
      return { owner: api, grid: g, morph: { posBase: bins.posBase, joinBase: bins.joinBase, tight: !!bins.tight } };
    },
    useMorphSet(S) {
      if (S && S.owner !== api) return;
      morphSet = S || null;
      morph.on = S ? (S.morph.tight ? 2 : 1) : 0;
      morph.posBase = S ? S.morph.posBase : 0; morph.joinBase = S ? S.morph.joinBase : 0;
      frame.setMorph(!!S);
      if (S) takeGrid(S.grid);
      else if (parts.compile?.current) takeGrid(parts.compile.current());
    },
    dropMorphSet(S) { if (S && S === morphSet) api.useMorphSet(null); },
    setMorphFrame() { frame.note(D.MORPH); },
    setRadii(row, r) {
      if (!(row >= 0 && row < nTubes)) return;
      // (A radius past the row's compiled reach recompiles that row's cells (workstream A); inside it only its cells are redrawn.)
      if (parts.compile?.exceeds?.(row, r)) {
        anyRows[0] = row;
        const g = parts.compile.rows?.(anyRows);
        if (g) takeGrid(g);
      }
      frame.noteRow(row, D.TUBES | D.RADII);
    },
    setBend() { frame.note(D.BEND); },
    /** The tube table (TUBE_FLOATS a row): the rows that differ from the last upload are marked, nothing else. */
    setTubes(data) {
      if (!data) return;
      const n = Math.min(nTubes, Math.floor(data.length / TUBE_FLOATS));
      if (!tubesSeen) { tubesSeen = true; for (let i = 0; i < n * TUBE_FLOATS; i++) tubeLast[i] = data[i]; frame.note(D.GEOM); return; }
      for (let r = 0; r < n; r++) {
        const o = r * TUBE_FLOATS;
        let same = true;
        for (let k = 0; k < TUBE_FLOATS; k++) if (data[o + k] !== tubeLast[o + k]) { same = false; tubeLast[o + k] = data[o + k]; }
        if (!same) frame.noteRow(r, D.TUBES);
      }
    },
    /** The flow table (8 texels a row): the blood pass is due when any differs. */
    setFlow(data) {
      if (!data) return;
      const n = Math.min(flowLast.length, data.length);
      let changed = !flowSeen;
      flowSeen = true;
      for (let i = 0; i < n; i++) if (data[i] !== flowLast[i]) { flowLast[i] = data[i]; changed = true; }
      if (changed) frame.note(D.FLOW);
    },
    /** The dye table: the blood pass is due (the bolus moves with the blood clock). */
    setDye(data) { if (data) frame.note(D.DYE); },
    /** The organ stack's input (workstream F): it answers with the box that changed, true for everywhere, or nothing. */
    setOrgans(...args) {
      const r = parts.organs?.setOrgans?.(...args);
      lastPrepScale = 0;   // (new organs: their detail levels are wanted again, prepared on idle frames)
      if (r === false) return;
      if (Array.isArray(r) && r.length >= 4) frame.noteBox(D.ORGANS, r[0], r[1], r[2], r[3]); else frame.noteBox(D.ORGANS);
    },
    /** The organ covers the vessels' veil reads (F): forwarded; the vessels are drawn again with the new covers. */
    setCovers(...args) { const r = parts.organs?.setCovers?.(...args); if (r !== false) frame.noteBox(D.ORGANS); },
    /** True while the organs still have detail levels to prepare on idle frames (the figure asks for another frame while it does). */
    get idleWanted() { return idleMore; },
    /** The overlays' input (workstream G): { under, over } each a box, true or nothing; a box or true alone is both. */
    setOverlays(...args) {
      const r = parts.overlays?.setOverlays?.(...args);
      const note = (bit, b) => { if (!b) return; if (Array.isArray(b) && b.length >= 4) frame.noteBox(bit, b[0], b[1], b[2], b[3]); else frame.noteBox(bit); };
      if (r && (r.under !== undefined || r.over !== undefined)) { note(D.UNDER, r.under); note(D.OVER, r.over); } else { note(D.UNDER, r); note(D.OVER, r); }
    },
    /** The boxes the blood moved in this frame (device px, y down), as the figure's blood tiles name them; none: every lumen. */
    setBloodBoxes(list, n) {
      nBloodBoxes = Math.min(n | 0, MAX_BOXES);
      for (let i = 0; i < nBloodBoxes * 4; i++) bloodBoxes[i] = list[i];
    },
    /** The rows that show blood or lymph (the lobule's: vec-lobule.js indexFlow): BLOOD frames draw only the cells that list them. list[0 … n); none given: every row. */
    setBloodRows(list, n = list ? list.length : 0) {
      bloodMarks.fill(0);
      bloodRowsSet = !!list;
      if (list) for (let i = 0; i < n; i++) if (list[i] >= 0 && list[i] < nTubes) bloodMarks[list[i]] = 1;
      bloodVer++; nBloodBoxes = 0;
      frame.note(D.FLOW);
    },
    /** The boxes the last BLOOD pass drew in: { boxes: Float32Array (x0, y0, x1, y1 in picture px, y from the bottom), n } (one kept record; n 0: none). */
    lastBloodBoxes() { return lastBlood; },
    /** The organ deforms every frame while it does (the liver's outline morph). */
    setDeforming(on) { frame.setDeforming(on); },

    /** The whole frame for the view m (as veins-gl's draw): rows, the vessel rows whose attributes alone changed. */
    draw(m, look, blood, rows = null) {
      curLook = look; curBlood = blood || null; packBlood();
      setCamera(m);
      if (rows && rows.length) frame.note(D.TUBES, rows);
      step(false);
    },
    /** A partial redraw for the named rows: false, drawing nothing, when it cannot stand in for draw() (rowsStatus says why). */
    drawRows(m, look, blood, rows, full = false) {
      const pic = shared.picture?.();
      const why = !pic ? REFUSED.NO_KEPT : frame.refusal(m, pic.w, pic.h, lost, rows);
      if (why) { rowsStatus = why; return false; }
      curLook = look; curBlood = blood || null; packBlood();
      setCamera(m);
      if (rows && rows.length) frame.note(D.TUBES, rows);
      rowsStatus = 'drawn';
      step(!!full);
      return true;
    },
    /** A frame of the moving blood (as veins-gl's composite): `full` repaints the whole picture. */
    composite(look, blood = null, full = false) {
      if (!haveM) return;
      if (look) curLook = look;
      curBlood = blood || curBlood; packBlood();
      step(!!full);
    },
    dispose() {
      disposed = true;
      targets.dispose();
      for (const t of [cellTex, regionTex, blank]) if (t) gl.deleteTexture(t);
      for (const b of [...stripBufs, regionBuf, quadBuf]) if (b) gl.deleteBuffer(b);
      gl.deleteVertexArray(stripVao); gl.deleteVertexArray(regionVao);
      for (const row of progs) for (const pr of row) if (pr?.p) gl.deleteProgram(pr.p);
      for (const pool of [...TQ.q, ...TQ.pend]) for (const q of pool) gl.deleteQuery(q);
    },
  };
  void CELL_SIMPLE; void K_MORPH;
  return api;
}
