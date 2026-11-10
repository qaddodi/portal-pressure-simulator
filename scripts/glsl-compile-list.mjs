// The shader programs `node scripts/glsl-compile.mjs` compiles and links (brief S0-K, 10 Nov 2026): `programs()` returns an array of
// { name, vs, fs }, built by importing the app's own modules in node, the way the unit tests do (no page, no DOM beyond the few stubs below).
//
// HOW A LATER THREAD ADDS ITS PROGRAMS: add ONE line above the marker near the bottom, `add('name', { '../src/ui/x.js': ['exportA', 'exportB'] }, (x) => ({ vs, fs }))`.
//   * The modules are named by their path from this file, each with the exports it needs; `build` gets the modules in that order. If a file or
//     an export is missing (the thread that owns it has not pushed yet) the entry is SKIPPED with a note, not failed, so the list can name
//     programs before their files land.
//   * Anything else that throws while building the strings (a bug in the builder) is a FAILURE and is printed.
//   * `vs: null` means the vertex shader is not exported yet: the fragment shader is compiled alone and the program is not linked. The
//     entry says which export it waits for in `note`; give it the vertex shader as soon as the owner exports it, and the program links.
// Only compile-and-link text goes here: nothing in this file draws, loads the app or measures anything.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

// (The few globals the app's modules read when they are imported, as tests/vessel-fs-old-builds.test.js sets them.)
globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });

const cache = new Map();
const load = async (rel) => {
  if (!cache.has(rel)) {
    cache.set(rel, import(pathToFileURL(resolve(HERE, rel)).href).then((m) => m, (e) => {
      if (e && (e.code === 'ERR_MODULE_NOT_FOUND' || e.code === 'ENOENT')) return null;   // the file has not landed yet
      throw e;
    }));
  }
  return cache.get(rel);
};

const entries = [];
/** add(name, { module path: [export names] }, build(...modules) => { vs, fs, note? }) */
const add = (name, needs, build) => { entries.push({ name, needs, build }); };
const mods = new Map();

// ---- the list ---------------------------------------------------------------------------------------------------------------------
// Programs that already run on devices come first, so the check is proven on known-good text before a new program is judged by it.

// The classic vessel programs. Their vertex shader (`VS` in veins-gl.js) is not exported: the fragment shaders compile alone for now.
const vesNote = (g) => (g.VESSEL_VS ? '' : 'fragment only: veins-gl.js does not export its vessel vertex shader (VS)');
add('classic vessel (general) vesselFS(false)', { '../src/ui/veins-gl.js': ['vesselFS'] }, (g) => ({ vs: g.VESSEL_VS ?? null, fs: g.vesselFS(false), note: vesNote(g) }));
add('classic vessel (one vessel) vesselFS(true)', { '../src/ui/veins-gl.js': ['vesselFS'] }, (g) => ({ vs: g.VESSEL_VS ?? null, fs: g.vesselFS(true), note: vesNote(g) }));

// The Mesh: a vessel's strip and the join patch.
add('mesh strip', { '../src/ui/veins-gl.js': ['vesselFS', 'F_SEL'], '../src/ui/veins-mesh.js': ['STRIP_VS_GLSL'], '../src/ui/veins-mesh-glsl.js': ['meshStripVS'] },
  (g, mm, mg) => ({ vs: mg.meshStripVS(mm.STRIP_VS_GLSL, g.F_SEL), fs: g.vesselFS(true, 1) }));
add('mesh patch', { '../src/ui/veins-gl.js': ['vesselFS'], '../src/ui/veins-mesh.js': ['STRIP_VS_GLSL'], '../src/ui/veins-mesh-glsl.js': ['meshPatchVS'] },
  (g, mm, mg) => ({ vs: mg.meshPatchVS(mm.STRIP_VS_GLSL), fs: g.vesselFS(false, 2) }));

// The Tube (stage 1): its strip and its patch.
add('tube strip', { '../src/ui/veins-gl.js': ['vesselFS', 'F_SEL'], '../src/ui/veins-mesh.js': ['STRIP_VS_GLSL'], '../src/ui/tube-geo.js': ['tubeStripVS'] },
  (g, mm, tg) => ({ vs: tg.tubeStripVS(mm.STRIP_VS_GLSL, g.F_SEL), fs: g.vesselFS(true, 1, 1) }));
add('tube patch', { '../src/ui/veins-gl.js': ['vesselFS'], '../src/ui/veins-mesh.js': ['STRIP_VS_GLSL'], '../src/ui/veins-mesh-glsl.js': ['meshPatchVS'] },
  (g, mm, mg) => ({ vs: mg.meshPatchVS(mm.STRIP_VS_GLSL), fs: g.vesselFS(false, 2, 1) }));

// The compositor's builds (COMP_FS with the arguments the app uses). Its vertex shader (COMP_VS) is not exported: fragment only for now.
const compNote = (g) => (g.COMP_VS ? '' : 'fragment only: veins-gl.js does not export COMP_VS');
add('compositor COMP_FS()', { '../src/ui/veins-gl.js': ['COMP_FS'] }, (g) => ({ vs: g.COMP_VS ?? null, fs: g.COMP_FS(), note: compNote(g) }));
add('compositor COMP_FS(plain)', { '../src/ui/veins-gl.js': ['COMP_FS'] }, (g) => ({ vs: g.COMP_VS ?? null, fs: g.COMP_FS(true), note: compNote(g) }));
add('compositor COMP_FS(streak)', { '../src/ui/veins-gl.js': ['COMP_FS'] }, (g) => ({ vs: g.COMP_VS ?? null, fs: g.COMP_FS(false, true), note: compNote(g) }));

// The Tube's stage 2 (brief S2-B): the short fragment shader over the strip's vertex shader, and the depth shader. Until S2-A's vertex shader writes the
// contract's varyings (vD, vG, vRad, vEnd) the pair cannot link, so the entry takes the stand-in below; the entry switches to tubeStripVS by itself once it does.
const alongText = (N) => `
float alongAt(int id, float u) {
  float ui = u * ${N - 1}.0;
  int i0 = min(int(ui), ${N - 2});
  vec2 a = texelFetch(rad, ivec2(i0, id), 0).ba;
  return a.x < 0.0 ? u : mix(a.x, a.y, ui - float(i0));
}`;
const leanVaryings = `#version 300 es
precision highp float;
layout(location=0) in vec4 aV;
layout(location=1) in float aRow;
out float vI; flat out int vRow; out float vD; out vec2 vG; out float vRad; flat out vec2 vEnd;
void main() { vI = aV.x; vRow = int(aRow); vD = aV.y; vG = aV.zw; vRad = aV.w; vEnd = aV.xy; gl_Position = vec4(aV.xy, 0.0, 1.0); }`;
add('tube lean (tubeLeanFS)', {
  '../src/ui/veins-gl.js': ['F_SEL', 'F_DIFFUSE', 'F_SHADOW', 'F_DOTTED', 'F_NOCASE', 'F_SPEC', 'F_EDGE', 'F_VEIL', 'F_WHOLE', 'VEIL_K', 'MAX_TIERS', 'N_SAMPLES', 'LUMEN2', 'ROW2_BITS'],
  '../src/ui/edge.js': ['EDGE_GLSL'], '../src/ui/veins-bin.js': ['ENT_W'], '../src/ui/highlight-math.js': ['LIFT_EASE_SHARE', 'LIFT_EASE_MAX'],
  '../src/ui/tube-lean-glsl.js': ['tubeLeanFS'], '../src/ui/veins-mesh.js': ['STRIP_VS_GLSL'], '../src/ui/tube-geo.js': ['tubeStripVS'],
}, (g, edge, bin, hl, lean, mm, tg) => {
  const K = { F_DIFFUSE: g.F_DIFFUSE, F_EDGE: g.F_EDGE, F_SHADOW: g.F_SHADOW, F_SPEC: g.F_SPEC, F_VEIL: g.F_VEIL, F_WHOLE: g.F_WHOLE, F_SEL: g.F_SEL, F_DOTTED: g.F_DOTTED,
    F_NOCASE: g.F_NOCASE, LIFT_EASE_MAX: hl.LIFT_EASE_MAX, LIFT_EASE_SHARE: hl.LIFT_EASE_SHARE, LUMEN2: g.LUMEN2, ROW2_BITS: g.ROW2_BITS, VEIL_K: g.VEIL_K,
    EDGE: edge.EDGE_GLSL, ENT_W: bin.ENT_W, N_SAMPLES: g.N_SAMPLES, MAX_TIERS: g.MAX_TIERS, S_OFF: 96, ALONG_GLSL: alongText(g.N_SAMPLES) };
  const vs = tg.tubeStripVS(mm.STRIP_VS_GLSL, g.F_SEL);
  const real = /out float vD;/.test(vs) && /out vec2 vG;/.test(vs) && /out float vRad;/.test(vs) && /out vec2 vEnd;/.test(vs.replace('flat out vec2 vEnd', 'out vec2 vEnd'));
  return { vs: real ? vs : leanVaryings, fs: lean.tubeLeanFS(K), note: real ? '' : 'linked with a stand-in vertex shader: tubeStripVS does not write vD, vG, vRad, vEnd yet (S2-A)' };
});
add('tube depth (TUBE_DEPTH_FS)', { '../src/ui/veins-gl.js': ['F_SEL'], '../src/ui/veins-mesh.js': ['STRIP_VS_GLSL'], '../src/ui/tube-geo.js': ['tubeStripVS'], '../src/ui/tube-lean-glsl.js': ['TUBE_DEPTH_FS'] },
  (g, mm, tg, lean) => ({ vs: tg.tubeStripVS(mm.STRIP_VS_GLSL, g.F_SEL), fs: lean.TUBE_DEPTH_FS }));

// ---- later threads: add yours above this line, one line each ------------------------------------------------------------------------
// (S2-A/B/J/D: tubeLean, the web, ...; S3-X: COMP_FS with its new last argument; S3-C: the lumen shader; L-A/L-D: the lobule's.)

// Load every module the entries name, once (top-level await, so that programs() is synchronous and returns the array).
for (const e of entries) {
  for (const rel of Object.keys(e.needs)) {
    if (!mods.has(rel)) mods.set(rel, await load(rel));
  }
}

/** The programs, as { name, vs, fs, note, error? }; `programs.skipped` lists { name, why } for entries whose module or export is not there yet. */
export function programs() {
  const out = [];
  programs.skipped = [];
  for (const e of entries) {
    let why = '';
    const ms = [];
    for (const [rel, names] of Object.entries(e.needs)) {
      const mod = mods.get(rel);
      if (!mod) { why = `${rel} is not there yet`; break; }
      const lost = names.find((n) => !(n in mod));
      if (lost) { why = `${rel} does not export ${lost} yet`; break; }
      ms.push(mod);
    }
    if (why) { programs.skipped.push({ name: e.name, why }); continue; }
    try {
      const r = e.build(...ms);
      out.push({ name: e.name, vs: r.vs, fs: r.fs, note: r.note || '' });
    } catch (err) {
      out.push({ name: e.name, vs: '', fs: '', note: '', error: `building the strings threw: ${err && err.stack ? err.stack : err}` });
    }
  }
  return out;
}
