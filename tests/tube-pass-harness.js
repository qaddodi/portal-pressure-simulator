// A stand-in GL and the kept state of the vessel renderer, to run the Tube's pass (src/ui/tube-pass.js) in node and read back what it draws (brief S2-D, 10 Nov 2026).
// Not a *.test.js. The GL records every call that matters in `log`: the program in use, the colour mask and depth test at each draw, the program's uniforms.
import { createTubePass } from '../src/ui/tube-pass.js';
import { MAX_TIERS, TUBE_FLOATS } from '../src/ui/veins-mesh-data.js';
import { MP } from '../src/ui/veins-mesh-glsl.js';
import { scene, ray, straight } from './tube-web-helpers.js';

/** Programs by name: { p: { name }, u: any uniform name → { prog, name } }; the stand-in uniform cache records each set value as `sets`. */
const prog = (name) => ({ p: { name }, u: new Proxy({}, { get: (t, k) => (typeof k === 'string' ? (t[k] ||= { prog: name, name: k }) : undefined) }) });

export function makeHarness({ withStage2 = true, withStage3 = false, withGlow = false, glowFailed = null, view = null, morph = null, rows, joins, tiers, tubeMutator, patches = false, capture = null, noEnds = false } = {}) {
  const log = [], sets = [], gauges = [];
  let cur = null, state = { mask: true, depthFunc: 'LESS', blend: false, stencil: false };
  const enums = new Map();
  const gl = new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) { if (!enums.has(k)) enums.set(k, k); return k; }
      return (...a) => {
        if (k === 'useProgram') cur = a[0] && a[0].name;
        else if (k === 'colorMask') state.mask = a[0];
        else if (k === 'depthFunc') state.depthFunc = a[0];
        else if (k === 'enable' && a[0] === 'BLEND') state.blend = true;
        else if (k === 'disable' && a[0] === 'BLEND') state.blend = false;
        else if (k === 'drawElementsInstanced') log.push({ call: 'strips', prog: cur, n: a[4], mask: state.mask, depth: state.depthFunc, tris: a[1] });
        else if (k === 'drawArraysInstanced') log.push({ call: 'patch', prog: cur, n: a[3], mask: state.mask, depth: state.depthFunc });
        else if (k === 'vertexAttribPointer') log.push({ call: 'attrib', loc: a[0], size: a[1], stride: a[4], offset: a[5] });
        else if (k === 'drawBuffers') log.push({ call: 'drawBuffers', bufs: a[0] });
        else if (k === 'clearBufferfv') log.push({ call: 'clear', what: a[0] });
        else if (k === 'invalidateFramebuffer') log.push({ call: 'invalidate', what: a[1] });
        else if (k === 'bindBuffer' || k === 'bufferData' || k === 'bufferSubData') log.push({ call: k, target: a[0], size: typeof a[1] === 'number' ? a[1] : a[2]?.length });
        if (k.startsWith('create')) return { obj: k };
        return undefined;
      };
    },
  });
  const UC = new Proxy({}, { get: (_, k) => (loc, ...v) => { if (loc) sets.push({ prog: loc.prog, name: loc.name, v: v[0] }); } });
  const sc = capture ? { ...capture, ent: capture.ent } : scene(rows ?? [
    { ...straight(0, 0, 100, 0, 6), tier: 0 },                 // 0 the trunk
    { ...ray(50, 0, 90, 80, 4), tier: 0 },                      // 1 a branch leaving it, plain
    { ...ray(20, 0, 60, 80, 3), tier: 0, flags: 8 },            // 2 a dotted branch (an exact row)
  ], joins ?? [{ x: 50, y: 0, reach: 20, k: 0.3, fillet: 1, members: [0, 1], trunk: 0 }, { x: 20, y: 0, reach: 20, k: 0.3, fillet: 1, members: [0, 2], trunk: 0 }]);
  if (tubeMutator) tubeMutator(sc.tube);
  const n = sc.nRows, nJoins = capture ? Math.floor(sc.ent.length / 8) : joins ? joins.length : 2;
  const tierOf = tiers ?? [];
  tierOf.forEach((t, i) => { sc.tube[i * TUBE_FLOATS + 8] = t; });
  const MG = { noEnds, tubeVB: { vb: 1 }, tubeIB: { ib: 1 }, tubeVAO: { vao: 1 }, rowBuf: { rb: 1 }, patchBuf: { pb: 1 }, patchVAO: { pv: 1 }, tubeIndexN: 24, rowCap: 0, patchCap: 0, tex: {}, pj: {},
    ent: sc.ent, jl: { n: nJoins, view: Int32Array.from({ length: nJoins }, (_, i) => i) },
    pts: { pts: sc.pts, on: new Uint8Array(n).fill(1) }, tb: {}, pb: {}, patch: patches ? { data: Float32Array.from([50, 0, 10, 0, 0, 1, -1, -1, -1, -1, -1, -1, 0, 1, 0, 0]), count: 1 } : { data: new Float32Array(0), count: 0 }, gen: 1,
    passes: 0, strips: 0, patches: 0, plain: 0, webs: 0, kP: 0, ref: 0 };
  MG.dirty = false;
  let tube2 = null;
  if (withStage2) tube2 = { lean: prog('tubeLean'), depth: prog('tubeDepth'), web: prog('tubeWeb'), webDepth: prog('tubeWebDepth'), joinDepth: prog('tubeJoinDepth') };
  let tube3 = null;
  if (withStage3) tube3 = { lumen: prog('tubeLumen'), webLumen: prog('tubeWebLumen'), comp: prog('compTube'), compCell: prog('compTubeCell'), plain: prog('plainTube'), plainCell: prog('plainTubeCell') };
  const tubeS = prog('tubeStrip'), tubePt = prog('tubePatch'), tubeGlow = withGlow ? prog('tubeGlow') : null;
  let keyN = 0;
  const E = {
    lobule: false, gl, UC, MG, MAX_TIERS, ATTACH: ['A'], KEY_PASSES: 64, MESH_TWO: [null, null], MESH_DS: ['DS'], MESH_GLOW_BUF: ['GLOW'], MESH_COLOR_BUF: ['COLOR'], CLR_F: new Float32Array(4),
    gpuProbe: { on: true, note() {}, gauge: (k, v) => gauges.push([k, v]) }, nTubes: n, tubeNow: sc.tube,
    meshPad: () => 0, meshKeyNext: () => 1 - ++keyN / 64, meshRefNext: () => 1, meshTargets: () => true, meshGeo: () => MG, meshTarget() {}, meshScratch: () => ({}), meshLay() {}, vesselSet() {},
    get tubeS() { return tubeS; }, get tubePt() { return tubePt; }, get tube2() { return tube2; }, get tube2Failed() { return withStage2 ? null : []; }, get tube3() { return tube3; }, get tube3Failed() { return tube3 || !withStage3 ? null : []; }, get layerView() { return view && ((m, look, out) => { out.ok = view.ok !== false; for (let i = 0; i < 4; i++) out.rect[i] = view.rect[i]; out.pad = view.pad || 0; out.rmax = view.rmax || []; return out; }); }, get tubeGlow() { return tubeGlow; }, get tubeGlowFailed() { return glowFailed; }, lumenBind(P) { log.push({ call: 'lumenBind', prog: P.p.name }); }, get baseTex() { return {}; }, get geo() { return { morph }; },
  };
  const tubePass = createTubePass(E);
  const look = { tierGroup: new Int32Array(MAX_TIERS), tierAlpha: new Float32Array(MAX_TIERS).fill(1), netAlpha: 1, reach: 11 };
  const run = () => { log.length = 0; sets.length = 0; gauges.length = 0; keyN = 0; const ok = tubePass([1, 0, 0, 1, 0, 0], look); return ok; };
  const runLumen = (redo = true) => { log.length = 0; sets.length = 0; gauges.length = 0; keyN = 0; return tubePass.lumen([1, 0, 0, 1, 0, 0], look, redo); };
  return { run, runLumen, tubePass, log, sets, gauges, MG, E, sc, setTube2(v) { tube2 = v; }, MP };
}
