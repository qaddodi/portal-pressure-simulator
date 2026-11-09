// The vector vessel renderer's core (docs/recommendations/vector-renderer-plan.md sections 3, 4 and 7, and plan r1; workstream E): the programs, the
// hierarchy's tables and their uploads, the strip and leaf-quad instances, the frame, the caches and the timers. It draws what vec-frame.js plans, into
// the picture the figure's composite writes today, in one render pass per frame kind and no framebuffer switch inside a pass (vec-targets.js).
//
// createVecRenderer(gl, shared) returns the same API as veins-gl's instance for the calls the figure makes (draw, drawRows, composite and
// the setters), so the seam (workstream H) hands over at one place. A vector frame:
//   FULL  organs, under-overlays, strips, leaf regions, heads, over-overlays, blood, in one pass into the picture (camera, morph, deforming)
//   BASE  the same without the blood and what lies over it, into the kept base (written once when the view comes to rest)
//   BLOOD lumen strips and lumen regions only, over the kept base, into the picture (frames where only the blood moved)
//
// ── The structure it draws (plan r1) ──
// vec-hier.js owns the chain: the graph (A) -> the runs and their bounds (A) -> the adaptive leaves (K). vec-hier-gpu.js uploads K's tables and A's runs and
// joins in part (the dirty rows) and keeps the instance lists. Drawn: one instanced call of vessel strips (B's leaf strip: a vessel row that owns an L_SINGLE
// leaf is an instance), then one instanced call per leaf class (C's programs; an instance is a leaf's square). Every pixel is owned by exactly one leaf
// (vecLeafAt of inv x gl_FragCoord), so the calls never draw a pixel twice. A camera change uploads nothing; a glow, selection, casing, shadow, tier, a
// point that moved or a radius past BOUND_HEADROOM rebuilds the rows it touches (flush), and only the leaves they reach are written again.
//
// ── The ports (what the renderer is given; other workstreams code against these) ──
// shared (H builds it from the veins-gl instance; read, never written here):
//   nTubes            vessel rows
//   who               'stage' | 'lobule'
//   picture()         { tex, w, h }: the figure's picture (its own kept picture, or the shared screen texture), device px
//   tex               { ent, rad, rmax, tube, flow, bend, dye, noiseT, organ }: each a WebGLTexture or a function returning one
//   uniforms          { name: value }: anything else a program declares (kept current by the seam; look and blood come with each draw)
//   tubeNow, radAll   the instance's mirrors of the tube attributes and the radii: read in place when a geometry is set
//   isLost()          the context is lost
//   parts.stretch     { vs, fs(variant) }   workstream B: strings (vs may be a function returning one); the leaf strip
//   parts.region      { vs, fs(variant, leafClass), classes }   workstream C: the leaf class programs
//   parts.organs      { draw(pass, m), setOrgans(...), ready?() }   workstream F
//   parts.overlays    { draw(pass, m, phase), setOverlays(...), ready?() }   workstream G, phase: PHASE.UNDER | HEADS | OVER
// pass: the record handed to organs and overlays while a pass is open: { variant, w, h, m, box: [x0, y0, x1, y1] | null, look }.
// Organs (F) are also called outside a pass: update() before the passes of a frame that draws organs, prepare(undefined, scale) and step(deadline)
// on idle frames (an idle frame draws nothing), setCovers(...) forwarded, covers() -> { tex, rect } read for the vessels' veil (the organ sampler, organRect, useOrgan).
//
// Attributes of the programs it draws (the programs bind these locations):
//   strip:   layout(location=0) in vec4 aV (the mesh's stripIndex attribute); layout(location=1) in float aRow (instance, the vessel row)
//   region:  layout(location=0) in vec2 aC (unit corner, 0..1); layout(location=1) in vec4 aBox (instance: the leaf's x0, y0, size, index)
// Uniforms: VEC_OWN_UNIFORMS (set here), then the look and blood by name (LOOK_UNIFORMS, BLOOD_UNIFORMS), then shared.uniforms, then the
// samplers by name from shared.tex and the hierarchy's. A uniform none of them names is left as it is.
import { V_FULL, V_BASE, V_BLOOD } from './vec-contract.js';
import { stripIndex, N_SAMPLES } from './veins-mesh.js';
import { startProgram, compileDone, checkProgram } from './gl-compile.js';
import { gpuProbe } from './gpu-probe.js';
import { VEC_BLOOD_UNIFORMS } from './vec-blood-glsl.js';
import { createVecTargets } from './vec-targets.js';
import { createVecFrame, addBox, D, REFUSED, MAX_BOXES } from './vec-frame.js';
import { createHierGraph, createHier } from './vec-hier.js';
import { createHierGpu, CLASS_FIRST, CLASS_LAST } from './vec-hier-gpu.js';
import { createVecMeasure, setCurrentMeasure, COMP } from './vec-measure.js';

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
  uVecGridO: 'vec2',    // the broad cell grid's origin (world)
  uVecGridN: 'ivec2',   // cells across, cells down
  uVecJoinRow0: 'int',  // the row of the run table where the joins begin (= the vessel rows)
  uVecShOff: 'vec2',    // the shadow offset the runs' bounds were made with (the look's)
  padU: 'float',        // world units the strip is widened by past the lumen: |shOff| + the glow's reach (12 × 1.3) + 2 px; the BLOOD pass's lumen strip: 2 px
  selPad: 'float',      // and more for a selected vessel's ring: 4 + 2 px (0 in the BLOOD pass)
  lOff: 'vec2',         // (0, 0): the vector picture has no wrapped layer
  variant: 'int',       // V_FULL | V_BASE | V_BLOOD
  // the hierarchy's tables (HIER_UNIFORMS: uVecCells, uVecNodes, uVecLeaves, uVecRunRefs, uVecJoinRefs, uVecRuns, uVecJoins) are the active hierarchy's textures
  cell: 'float', gridO: 'vec2', gridN: 'vec2', cellTex: 'usampler2D', regionTex: 'sampler2D',   // (legacy: the fixed-cell programs' names, which only B's and C's retired programs and their tests still declare)
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
const SCALARS = ['px', 'pxW', 'H', 'uVecJoinRow0', 'padU', 'selPad', 'variant', 'morphOn', 'posBase', 'joinBase',
  'vbOn', 'vbChev', 'vbChevQuad', 'vbStill', 'vbLenOn', 'vbOrigin', 'vbDyeOn', 'vbStyle', 'vbFlowA', 'vbClock', 'vbBT', 'vbCssPx', 'vbDyeRows', 'vbBleedN', 'vbNoChevN', 'vbChevHoleN'];
// workstream D's blood uniforms (vec-blood-glsl.js VEC_BLOOD_UNIFORMS): each names the composite uniform it stands for (`from`), set from the blood.
const VB_FROM = Object.freeze(Object.fromEntries(VEC_BLOOD_UNIFORMS.filter((u) => u.from).map((u) => [u.name, u.from])));
const SC_AT = Object.freeze(Object.fromEntries(SCALARS.map((k, i) => [k, i])));
const GLOW_REACH = 12 * 1.3;   // (the widest glow, as veins-gl's pad has it)
const UNIFORM_RE = /uniform\s+(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+([^;]+);/g;
const TUBE_FLOATS = 52;
const NS = N_SAMPLES;

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
  const M = createVecMeasure(gl);   // L's per-component GPU timers: they do nothing unless ?perf is on
  setCurrentMeasure(M);
  let lost = false, disposed = false;

  // ── Programs: the leaf strip (B) and one region program per leaf class (C), each a variant, started together (gl-compile.js) and published when the driver is done ──
  const handles = [];
  const progs = { strip: [null, null, null], region: [[], [], []] };   // region[variant][leafClass]
  let ready = false, failure = '', started = false;
  const missing = () => ['stretch', 'region'].filter((k) => !parts[k]);
  function start() {
    if (started || !parts.stretch || !parts.region) return;
    started = true;
    const vsOf = (p) => (typeof p.vs === 'function' ? p.vs() : p.vs);
    for (let v = 0; v < 3; v++) {
      const sfs = parts.stretch.fs(v);
      const sh = startProgram(gl, vsOf(parts.stretch), sfs, [['aV', 0], ['aRow', 1]]);
      handles.push(sh);
      progs.strip[v] = { h: sh, p: null, u: null, vs: vsOf(parts.stretch), fs: sfs };
      for (let c = CLASS_FIRST; c <= CLASS_LAST; c++) {
        const rfs = parts.region.fs(v, c);
        const rh = startProgram(gl, vsOf(parts.region), rfs, [['aC', 0], ['aBox', 1]]);
        handles.push(rh);
        progs.region[v][c] = { h: rh, p: null, u: null, vs: vsOf(parts.region), fs: rfs };
      }
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
  function eachProgram(fn) {
    for (let v = 0; v < 3; v++) {
      if (progs.strip[v]) fn(progs.strip[v]);
      for (let c = CLASS_FIRST; c <= CLASS_LAST; c++) if (progs.region[v][c]) fn(progs.region[v][c]);
    }
  }
  function prepare() {
    if (ready || failure || disposed) return ready;
    start();
    if (!started) return false;
    if (!compileDone(gl, handles)) return false;
    try {
      eachProgram(publish);
      for (const h of handles) for (const s of h.sh) gl.deleteShader(s);
      ready = true;
    } catch (e) { failure = String(e?.message || e).slice(0, 200); }   // alloc-rare: once, on a program that failed to link
    return ready;
  }

  // ── The static buffers: the mesh's strip vertices and indices, the leaf quad's unit corners (the instance lists are the hierarchy's, vec-hier-gpu.js) ──
  const strip = stripIndex(Math.max(nTubes, 1));
  const stripAttr = gl.createBuffer(), stripIdx = gl.createBuffer(), quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, stripAttr);
  gl.bufferData(gl.ARRAY_BUFFER, strip.attr, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, stripIdx);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, strip.index, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  const BUFS = { quadBuf, stripAttr, stripIndex: stripIdx };
  // A 1 × 1 texture for a sampler nothing real stands behind (and for the base while it is being written).
  const blank = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, blank);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));

  // ── The hierarchies: the figure's, and one a morph set (they share the graph) ──
  const graph = createHierGraph();
  const hiers = [];   // (an array: a setter that walks it every frame must not make an iterator)
  let main = null, active = null;
  const counts = { single: 0, layered: 0, cross: 0, join: 0, wide: 0, morph: 0, leaves: 0, rebuilds: 0 };
  const leafCounts = new Float64Array(6);
  function newHier(opts) {
    const h = createHier(graph, opts);
    h.gpu = createHierGpu(gl, BUFS);
    h.want = true;
    hiers.push(h);
    return h;
  }
  function freeHier(h) { const i = hiers.indexOf(h); if (i >= 0) hiers.splice(i, 1); h.gpu?.dispose(); }
  const wantAll = () => { for (let i = 0; i < hiers.length; i++) hiers[i].want = true; };
  function tally(h) {
    h.counts(leafCounts);
    counts.single = leafCounts[0]; counts.layered = leafCounts[1]; counts.cross = leafCounts[2]; counts.join = leafCounts[3]; counts.wide = leafCounts[4]; counts.morph = leafCounts[5];
    counts.leaves = leafCounts[0] + leafCounts[1] + leafCounts[2] + leafCounts[3] + leafCounts[4] + leafCounts[5];
    M.noteLeaves(leafCounts, h.box ? 'morph set' : '');
  }
  /** Brings a hierarchy up to date: built (or built again for another shadow offset), then flushed when something was noted. */
  function refresh(h) {
    const so = curLook?.shOff;
    if (so && (h.shOff[0] !== so[0] || h.shOff[1] !== so[1])) { h.shOff[0] = so[0]; h.shOff[1] = so[1]; h.invalidate(); }
    if (!h.built) {
      if (!so || graph.nRows === 0) return;
      h.build(); h.want = false; counts.rebuilds++; tally(h);
      return;
    }
    if (h.want) { h.want = false; if (h.flush()) { counts.rebuilds++; tally(h); } }
  }

  // ── State kept between frames ──
  const curM = new Float64Array(6);
  let haveM = false, curLook = null, curBlood = null;
  const WORLD = new Float32Array(9), INV = new Float32Array(9), SIZE = new Float32Array(2), GRIDO = new Float32Array(2), GRIDN = new Int32Array(2), LOFF = new Float32Array(2);
  const SHOFF = new Float32Array(2);
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
  // The rows that show blood (the lobule leaves out the vessels seen end-on): the BLOOD pass is limited to the boxes of their runs. Their
  // boxes are worked out again only when the rows, the hierarchy or the view change. lastBlood: the last BLOOD pass's boxes (picture px, y from the
  // bottom) for the seam to repaint a kept picture in just those.
  const bloodMarks = new Uint8Array(Math.max(nTubes, 1)), bloodKeyM = new Float64Array(6);
  let bloodRowsSet = false, bloodVer = 0, bloodKeyVer = -1, bloodKeyHier = -1, bloodKeyW = 0, bloodKeyH = 0;
  const lastBlood = { boxes: new Float32Array(MAX_BOXES * 4), n: 0 };
  let rowsStatus = 'drawn';
  const stats = { passes: 0, frames: 0, byKind: [0, 0, 0], draws: 0, programsUsed: [0, 0, 0, 0, 0, 0], skipped: 0, lastKinds: '', uploads: 0 };

  // ── Camera uniforms ──
  function setCamera(m) {
    for (let i = 0; i < 6; i++) curM[i] = m[i];
    haveM = true;
    const a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5];
    const det = a * d - b * c || 1e-9;
    const ia = d / det, ib = -b / det, ic = -c / det, id = a / det, ie = -(ia * e + ic * f), iff = -(ib * e + id * f);
    WORLD[0] = a; WORLD[1] = b; WORLD[2] = 0; WORLD[3] = c; WORLD[4] = d; WORLD[5] = 0; WORLD[6] = e; WORLD[7] = f; WORLD[8] = 1;
    // (world = M⁻¹ · (fx, H − fy): the y flip is in the matrix, so the leaf test is inv × gl_FragCoord.xy with no further arithmetic.)
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
      case 'vecBase': return variantNow === V_BLOOD ? targets.baseTex || blank : blank;   // (never the base while it is being written: a feedback loop)
      case 'organ': if (cov?.tex) return cov.tex;   // falls through to the shared one
      // eslint-disable-next-line no-fallthrough
      default: {
        if (name.startsWith('uVec')) return active?.gpu.texOf(name) || blank;
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
      case 'uVecGridO': return GRIDO;
      case 'uVecGridN': return GRIDN;
      case 'uVecShOff': return SHOFF;
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
    SC[SC_AT.pxW] = pxv; SC[SC_AT.H] = hNow; SC[SC_AT.variant] = variantNow;
    const so = curLook?.shOff;
    SC[SC_AT.padU] = variantNow === V_BLOOD ? 2 * pxv : Math.hypot(so ? so[0] : 0, so ? so[1] : 0) + GLOW_REACH + 2 * pxv;
    SC[SC_AT.selPad] = variantNow === V_BLOOD ? 0 : 4 + 2 * pxv;
    const b = curBlood;
    SC[SC_AT.vbOn] = b && b.on ? 1 : 0; SC[SC_AT.vbChev] = b && b.chev ? 1 : 0; SC[SC_AT.vbChevQuad] = shared.uniforms?.chevQuad ? 1 : 0;   // (arrowheads in the lumen until the heads' quads are wired)
    SC[SC_AT.vbStill] = b && b.still ? 1 : 0; SC[SC_AT.vbLenOn] = b && b.streakLen ? 1 : 0; SC[SC_AT.vbOrigin] = b && b.origin ? 1 : 0;
    SC[SC_AT.vbDyeOn] = b && b.dye !== false ? 1 : 0; SC[SC_AT.vbStyle] = b ? b.style | 0 : 0;
    SC[SC_AT.vbFlowA] = b ? b.alpha ?? 1 : 1; SC[SC_AT.vbClock] = b ? b.clock || 0 : 0; SC[SC_AT.vbBT] = b ? b.bt || 0 : 0; SC[SC_AT.vbCssPx] = b ? b.vdpr || 1 : 1;
    SC[SC_AT.vbDyeRows] = nTubes; SC[SC_AT.vbBleedN] = nBleed; SC[SC_AT.vbNoChevN] = nNoChev; SC[SC_AT.vbChevHoleN] = nHoles;
    SC[SC_AT.uVecJoinRow0] = active ? active.runTable.joinRow0 : 0;
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

  // ── Boxes: the device boxes of the runs of the marked rows (what each reaches, and what a rebuilt row reached before) ──
  let bxOut = null, bxN = 0, bxM = null;
  const boxFn = (x0, y0, x1, y1) => {
    const m = bxM;
    let lx = Infinity, ly = Infinity, hx = -Infinity, hy = -Infinity;
    for (let q = 0; q < 4; q++) {
      const wx = q & 1 ? x1 : x0, wy = q & 2 ? y1 : y0;
      const dx = m[0] * wx + m[2] * wy + m[4], dy = m[1] * wx + m[3] * wy + m[5];
      if (dx < lx) lx = dx; if (dx > hx) hx = dx; if (dy < ly) ly = dy; if (dy > hy) hy = dy;
    }
    const bx0 = Math.max(0, Math.floor(lx) - 1), by0 = Math.max(0, Math.floor(ly) - 1), bx1 = Math.min(wNow, Math.ceil(hx) + 1), by1 = Math.min(hNow, Math.ceil(hy) + 1);
    if (bx1 <= bx0 || by1 <= by0) return;
    bxN = addBox(bxOut, bxN, bx0, by0, bx1, by1);
  };
  function rowBoxes(marks, m, out) {
    const h = active;
    if (!h || !h.built) return -1;
    bxOut = out; bxN = 0; bxM = m;
    h.eachRunBox(marks, boxFn);
    return bxN;
  }

  function report(P) {
    if (!gpuProbe.on) return;
    M.poll();
    const c = counts;
    const sub = `${c.single} single, ${c.layered} layered, ${c.cross} cross, ${c.join} join, ${c.wide} wide, ${c.morph} morph`;   // alloc-rare: only while ?perf measures
    gpuProbe.gauge('vessel renderer', `vector: ${nTubes} rows, ${c.leaves} leaves (${sub}), ${P ? P.passes : 0} passes`);   // alloc-rare: only while ?perf measures
    gpuProbe.gauge('vector frame', P ? P.why : 'none');
    gpuProbe.gauge('vector tables', `${active ? active.gpu.stats.uploads : 0} uploads, ${c.rebuilds} rebuilds`);   // alloc-rare: only while ?perf measures
    gpuProbe.gauge('vector targets sized', targets.sized);
  }

  // ── Passes ──
  function scissorBox(o, list) {
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(list[o], hNow - list[o + 3], list[o + 2] - list[o], list[o + 3] - list[o + 1]);
  }
  const overlay = (phase, m) => { M.begin(COMP.overlays); parts.overlays.draw(PASS, m, phase); M.end(COMP.overlays); unitTex.fill(null); };
  function scene(variant, m) {
    variantNow = variant;
    cov = parts.organs?.covers?.() || null;
    PASS.look = curLook;
    fillScalars();
    const h = active, gpu = h.gpu, T = h.set.tables.grid;
    GRIDO[0] = T.x0; GRIDO[1] = T.y0; GRIDN[0] = T.nx; GRIDN[1] = T.ny;
    SHOFF[0] = curLook?.shOff?.[0] ?? 0; SHOFF[1] = curLook?.shOff?.[1] ?? 0;
    const s = progs.strip[variant];
    const base = variant !== V_BLOOD;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (variant === V_BLOOD) gl.disable(gl.BLEND);   // (the BLOOD pass writes the final pixel over the base it read)
    if (base) {
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.STENCIL_TEST);
      if (parts.overlays) {
        overlay(PHASE.BEHIND, m);   // (the glow and the map: under the organs; G leaves blending off)
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      }
      if (parts.organs) { M.begin(COMP.organs); parts.organs.draw(PASS, m); M.end(COMP.organs); unitTex.fill(null); }
      if (parts.overlays) overlay(PHASE.UNDER, m);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.disable(gl.STENCIL_TEST);
    }
    // The strips: depth LESS with a constant depth a vessel row, so a vessel's overlapping triangles write a pixel once. An instance is a vessel row that owns an L_SINGLE leaf.
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
    // In the BLOOD pass the lumens write stencil 1, so G redraws the outlines and the catheter over exactly those pixels in HEADS.
    if (variant === V_BLOOD) { gl.enable(gl.STENCIL_TEST); gl.stencilMask(0xff); gl.stencilFunc(gl.ALWAYS, 1, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE); }
    else gl.disable(gl.STENCIL_TEST);
    if (base) M.begin(COMP.strips);
    if (gpu.nStrip > 0) {
      gl.useProgram(s.p);
      setUniforms(s);
      gl.bindVertexArray(gpu.vaoStrip);
      gl.drawElementsInstanced(gl.TRIANGLES, strip.nIndex, gl.UNSIGNED_SHORT, 0, gpu.nStrip);
      stats.programsUsed[variant * 2]++;
      stats.draws++;
    }
    if (base) M.end(COMP.strips);
    // The leaf regions: one instanced quad call a class. The leaves partition the picture (a pixel is owned by one), so no depth.
    gl.disable(gl.DEPTH_TEST);
    for (let c = CLASS_FIRST; c <= CLASS_LAST; c++) {
      const n = gpu.counts[c];
      if (!n) continue;
      const r = progs.region[variant][c];
      if (base) M.begin(c - 1);   // (L's COMP values for the classes are the class value − 1)
      gl.useProgram(r.p);
      setUniforms(r);
      gl.bindVertexArray(gpu.vaoClass(c));
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
      if (base) M.end(c - 1);
      stats.programsUsed[variant * 2 + 1]++;
      stats.draws++;
    }
    gl.bindVertexArray(null);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.STENCIL_TEST);   // (G sets its own stencil test for HEADS)
    if (variant !== V_BASE && parts.overlays) {
      if (variant === V_BLOOD) gl.disable(gl.BLEND); else { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); }
      overlay(PHASE.HEADS, m);
      if (variant === V_FULL) overlay(PHASE.OVER, m);
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
    if (variant === V_BLOOD) M.begin(COMP.blood);   // (the blood pass is timed whole: its strips and regions are the lumens')
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
    if (variant === V_BLOOD) M.end(COMP.blood);
    targets.invalidateDepth();   // (depth and stencil are never stored)
  }
  function runPlan(P) {
    // The kept base first (BLOOD reads it), then the picture's boxes or whole, then the blood over it. The organs' frame changes are written first, outside any pass.
    if ((P.base || P.full) && parts.organs?.update) { parts.organs.update(); unitTex.fill(null); }
    if (P.base) pass(V_BASE, P.base, P.baseBoxes, P.nBase);
    if (P.full) pass(V_FULL, P.full, P.fullBoxes, P.nFull);
    if (P.blood) {
      if (bloodRowsSet) {
        const hv = active.leafVer * 2 + (active === main ? 0 : 1);
        let same = bloodKeyVer === bloodVer && bloodKeyHier === hv && bloodKeyW === wNow && bloodKeyH === hNow;
        for (let i = 0; same && i < 6; i++) same = bloodKeyM[i] === curM[i];
        if (!same) {
          nBloodBoxes = rowBoxes(bloodMarks, curM, bloodBoxes);
          bloodKeyVer = bloodVer; bloodKeyHier = hv; bloodKeyW = wNow; bloodKeyH = hNow;
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
    if (!main || !active || !curLook) { stats.skipped++; return false; }
    if (!prepare()) { stats.skipped++; return false; }
    if (gpuProbe.skipGL) return false;
    lastBlood.n = 0;   // (set again by this frame's BLOOD pass, if it has one)
    const pic = shared.picture?.();
    if (!pic || !pic.tex || !(pic.w > 0 && pic.h > 0)) return false;
    // The hierarchy, up to date before anything is planned from it (a build or a flush happens here and nowhere else), and its changed tables on the GPU.
    refresh(active);
    if (!active.built || active.tooWide) { stats.skipped++; return false; }
    stats.uploads += active.gpu.sync(active);
    wNow = pic.w; hNow = pic.h; SIZE[0] = wNow; SIZE[1] = hNow;
    if (targets.ensure(wNow, hNow, pic.tex)) frame.note(D.SIZE);
    if (!targets.ready) return false;
    setCamera(curM);
    M.frame();
    const P = frame.plan(curM, wNow, hNow, curLook, curBlood, false, wholeAsked, rowBoxes);
    if (P.passes) { targets.unbound(); runPlan(P); } else idleWork();
    frame.done();
    active.forgetOld();
    report(P);
    return P.passes > 0;
  }

  // ── Notes of what changed (the seam forwards veins-gl's setters here) ──
  const rowsScratch = [];
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
    set lost(v) { lost = !!v; if (lost) { frame.lose(); targets.dispose(); for (const h of hiers) h.gpu.dispose(); hiers.length = 0; main = active = null; morphSet = null; ready = false; started = false; handles.length = 0; } },
    get rowsStatus() { return rowsStatus; },
    get stats() { return stats; },
    get counts() { return counts; },
    get frame() { return frame; },
    get targets() { return targets; },
    /** For the tests: the active hierarchy (CPU: graph, runs, leaf set; gpu: the tables' uploads and instance counts), and the figure's. */
    get hier() { return active; },
    get figureHier() { return main; },
    get measure() { return M; },
    /** For the tests: the program of a kind (0 strip, 1 region), variant and (for a region) leaf class. */
    programOf(kind, variant, leafClass = CLASS_FIRST) { return kind === 0 ? progs.strip[variant]?.p || null : progs.region[variant]?.[leafClass]?.p || null; },

    setGeometry(bins) {
      frame.note(D.GEOM);
      if (morphSet) { morphSet = null; morph.on = 0; }
      graph.fromBins(bins, nTubes);
      if (shared.tubeNow) graph.attrs(shared.tubeNow);
      if (shared.radAll) graph.radii(shared.radAll);
      if (!main) main = newHier({ look: curLook });
      main.invalidate(); main.want = true;
      active = main;
      for (const h of hiers) if (h !== main) h.want = true;   // (a morph set over the old rows: made again by its flush)
    },
    patchGeometry(bins) {
      if (graph.nRows) {
        graph.patch(bins);
        // The rows whose points moved, and the members of the joins that changed (their required runs may have).
        const J = graph.joins;
        rowsScratch.length = 0;
        for (let i = 0; i < graph.n; i++) rowsScratch.push(graph.list[i]);   // alloc-rare: a patch of the binning, not a frame
        for (let q = 0; q < graph.nj; q++) for (let m = 0; m < 4; m++) { const r = J.mem[graph.jlist[q] * 4 + m]; if (r >= 0) rowsScratch.push(r); }   // alloc-rare: as above
        for (const h of hiers) { h.note(rowsScratch, rowsScratch.length, graph.jlist, graph.nj); h.want = true; }
      }
      if (bins?.patchTubes?.length) frame.note(D.TUBES | D.RADII, bins.patchTubes); else frame.note(D.GEOM);
    },
    /** A morph set from the sweep's binning; `tubes`: the sweep's input [{ id, path, ... }] (A's morphBoxes reads the courses), as the stage gave the worker. */
    makeMorphSet(bins, tubes) {
      const h = newHier({ look: curLook, tubes: tubes || [] });
      return { owner: api, hier: h, morph: { posBase: bins.posBase, joinBase: bins.joinBase, tight: !!bins.tight } };
    },
    useMorphSet(S) {
      if (S && S.owner !== api) return;
      morphSet = S || null;
      morph.on = S ? (S.morph.tight ? 2 : 1) : 0;
      morph.posBase = S ? S.morph.posBase : 0; morph.joinBase = S ? S.morph.joinBase : 0;
      frame.setMorph(!!S);
      active = S ? S.hier : main;
      if (active) active.want = true;
    },
    dropMorphSet(S) {
      if (!S || S.owner !== api) return;
      if (S === morphSet) api.useMorphSet(null);
      freeHier(S.hier);
    },
    setMorphFrame() { frame.note(D.MORPH); },
    setRadii(row, r) {
      if (!(row >= 0 && row < nTubes)) return;
      // (The radii go into the graph; a radius past a run's bound (BOUND_HEADROOM) is found by the next flush, which rebuilds that row's runs and only the leaves they reach.)
      if (r && graph.nRows > row) for (let i = 0; i < NS; i++) graph.rad[row * NS + i] = r[i];
      wantAll();
      frame.noteRow(row, D.TUBES | D.RADII);
    },
    setBend() { frame.note(D.BEND); },
    /** The tube table (TUBE_FLOATS a row): the rows that differ from the last upload are marked, nothing else. */
    setTubes(data) {
      if (!data) return;
      const n = Math.min(nTubes, Math.floor(data.length / TUBE_FLOATS));
      if (!tubesSeen) { tubesSeen = true; for (let i = 0; i < n * TUBE_FLOATS; i++) tubeLast[i] = data[i]; frame.note(D.GEOM); return; }
      let any = false;
      for (let r = 0; r < n; r++) {
        const o = r * TUBE_FLOATS;
        let same = true;
        for (let k = 0; k < TUBE_FLOATS; k++) if (data[o + k] !== tubeLast[o + k]) { same = false; tubeLast[o + k] = data[o + k]; }
        if (!same) { frame.noteRow(r, D.TUBES); any = true; }
      }
      if (any && graph.nRows) { graph.attrs(data); wantAll(); }   // (a row whose glow, selection, casing or tier changed has its runs looked at by the next flush)
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
    /** The rows that show blood or lymph (the lobule's: vec-lobule.js indexFlow): BLOOD frames draw only the boxes of their runs. list[0 … n); none given: every row. */
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
      for (const h of hiers) h.gpu.dispose();
      hiers.length = 0;
      if (blank) gl.deleteTexture(blank);
      for (const b of [stripAttr, stripIdx, quadBuf]) if (b) gl.deleteBuffer(b);
      eachProgram((pr) => { if (pr.p) gl.deleteProgram(pr.p); });
      setCurrentMeasure(null);
    },
  };
  return api;
}
