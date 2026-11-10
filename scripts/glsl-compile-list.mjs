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

// The Tube's stage 2 (briefs S2-B, S2-J, S2-D): the four programs, built by tube-stage2.js from the constants veins-gl.js gives them, the very text the app starts
// (the strip's and the web's vertex shaders, with ZOOM_VS, over the lean fragment shader and the depth one).
const stage2Needs = {
  '../src/ui/veins-gl.js': ['F_SEL', 'F_DIFFUSE', 'F_SHADOW', 'F_DOTTED', 'F_NOCASE', 'F_SPEC', 'F_EDGE', 'F_VEIL', 'F_WHOLE', 'VEIL_K', 'MAX_TIERS', 'N_SAMPLES', 'LUMEN2', 'ROW2_BITS', 'ZOOM_VS'],
  '../src/ui/edge.js': ['EDGE_GLSL'], '../src/ui/veins-bin.js': ['ENT_W'], '../src/ui/highlight-math.js': ['LIFT_EASE_SHARE', 'LIFT_EASE_MAX'],
  '../src/ui/comp-glsl.js': ['S_OFF', 'ALONG_GLSL'], '../src/ui/tube-stage2.js': ['stage2Sources'],
};
const stage2 = (name) => (g, edge, bin, hl, cg, t2) => {
  const K = { F_DIFFUSE: g.F_DIFFUSE, F_EDGE: g.F_EDGE, F_SHADOW: g.F_SHADOW, F_SPEC: g.F_SPEC, F_VEIL: g.F_VEIL, F_WHOLE: g.F_WHOLE, F_SEL: g.F_SEL, F_DOTTED: g.F_DOTTED,
    F_NOCASE: g.F_NOCASE, LIFT_EASE_MAX: hl.LIFT_EASE_MAX, LIFT_EASE_SHARE: hl.LIFT_EASE_SHARE, LUMEN2: g.LUMEN2, ROW2_BITS: g.ROW2_BITS, VEIL_K: g.VEIL_K,
    EDGE: edge.EDGE_GLSL, ENT_W: bin.ENT_W, N_SAMPLES: g.N_SAMPLES, MAX_TIERS: g.MAX_TIERS, S_OFF: cg.S_OFF, ALONG_GLSL: cg.ALONG_GLSL };
  return t2.stage2Sources(K, g.ZOOM_VS)[name];
};
add('tube lean (tubeLeanFS)', stage2Needs, stage2('tubeLean'));
add('tube depth (TUBE_DEPTH_FS)', stage2Needs, stage2('tubeDepth'));
add('tube web (tubeWebVS + tubeLeanFS)', stage2Needs, stage2('tubeWeb'));
add('tube web depth (tubeWebVS + TUBE_DEPTH_FS)', stage2Needs, stage2('tubeWebDepth'));
add('tube join depth (strip + tubeJoinDepthFS)', stage2Needs, stage2('tubeJoinDepth'));

// The Tube's stage 3 (briefs S3-C, S3-X, S3-D):
const stage3Needs = { ...stage2Needs, '../src/ui/veins-gl.js': [...stage2Needs['../src/ui/veins-gl.js'], 'COMP_FS', 'COMP_VS', 'COMP_CELL_VS'] };
// (The six programs of stage 3, built by tube-stage2.js from the same constants and the compositor's own texts: the very text the app starts.)
const stage3 = (name) => (g, edge, bin, hl, cg, t2) => {
  const K = { F_DIFFUSE: g.F_DIFFUSE, F_EDGE: g.F_EDGE, F_SHADOW: g.F_SHADOW, F_SPEC: g.F_SPEC, F_VEIL: g.F_VEIL, F_WHOLE: g.F_WHOLE, F_SEL: g.F_SEL, F_DOTTED: g.F_DOTTED,
    F_NOCASE: g.F_NOCASE, LIFT_EASE_MAX: hl.LIFT_EASE_MAX, LIFT_EASE_SHARE: hl.LIFT_EASE_SHARE, LUMEN2: g.LUMEN2, ROW2_BITS: g.ROW2_BITS, VEIL_K: g.VEIL_K,
    EDGE: edge.EDGE_GLSL, ENT_W: bin.ENT_W, N_SAMPLES: g.N_SAMPLES, MAX_TIERS: g.MAX_TIERS, S_OFF: cg.S_OFF, ALONG_GLSL: cg.ALONG_GLSL };
  return t2.stage3Sources(K, g.ZOOM_VS, { COMP_FS: g.COMP_FS, COMP_VS: g.COMP_VS, COMP_CELL_VS: g.COMP_CELL_VS })[name];
};
const zoomNote = 'zoomA and zoomB written by the vertex shader (ZOOM_VS)';
add('tubeLumen (strip + tubeLumenFS)', { ...stage3Needs, '../src/ui/tube-stage2.js': ['stage3Sources'] }, (...m) => ({ ...stage3('tubeLumen')(...m), note: zoomNote }));
add('tubeWebLumen (web + tubeLumenFS)', { ...stage3Needs, '../src/ui/tube-stage2.js': ['stage3Sources'] }, (...m) => ({ ...stage3('tubeWebLumen')(...m), note: zoomNote }));
// (The lumen text with PLAIN set: the build without the dye or the origin colours; not started by the app yet, kept so the variant stays compilable.)
const lumenK = (g, edge, bin, hl) => ({ F_DIFFUSE: g.F_DIFFUSE, F_EDGE: g.F_EDGE, F_SHADOW: g.F_SHADOW, F_SPEC: g.F_SPEC, F_VEIL: g.F_VEIL, F_WHOLE: g.F_WHOLE, F_SEL: g.F_SEL,
  F_DOTTED: g.F_DOTTED, F_NOCASE: g.F_NOCASE, LIFT_EASE_MAX: hl.LIFT_EASE_MAX, LIFT_EASE_SHARE: hl.LIFT_EASE_SHARE, LUMEN2: g.LUMEN2, ROW2_BITS: g.ROW2_BITS,
  VEIL_K: g.VEIL_K, EDGE: edge.EDGE_GLSL, ENT_W: bin.ENT_W, N_SAMPLES: g.N_SAMPLES, MAX_TIERS: g.MAX_TIERS, S_OFF: 96 });
add('tubeLumen PLAIN (strip, no dye or origin)', { ...stage3Needs, '../src/ui/tube-geo.js': ['tubeStripVS'], '../src/ui/tube-lumen-glsl.js': ['tubeLumenFS'], '../src/ui/veins-mesh.js': ['STRIP_VS_GLSL'] },
  (g, edge, bin, hl, cg, t2, tg, lum, mm) => ({ vs: tg.tubeStripVS(mm.STRIP_VS_GLSL, g.F_SEL, g.ZOOM_VS), fs: lum.tubeLumenFS({ ...lumenK(g, edge, bin, hl), PLAIN: 1 }), note: zoomNote }));

// The Tube's glow shader (brief P6): the strip's vertex shader over the short glow fragment shader, for the passes MP.GLOW and MP.UP only.
add('tubeGlow (strip + tubeGlowFS)', { ...stage2Needs, '../src/ui/tube-geo.js': ['tubeStripVS'], '../src/ui/tube-glow-glsl.js': ['tubeGlowFS'], '../src/ui/veins-mesh.js': ['STRIP_VS_GLSL'] },
  (g, edge, bin, hl, cg, t2, tg, glow, mm) => ({ vs: tg.tubeStripVS(mm.STRIP_VS_GLSL, g.F_SEL, g.ZOOM_VS),
    fs: glow.tubeGlowFS({ ...lumenK(g, edge, bin, hl), S_OFF: cg.S_OFF, ALONG_GLSL: cg.ALONG_GLSL }), note: zoomNote }));

// The compositor's Tube builds (brief S3-X, S3-D): COMP_FS with its last argument 1 (the lumen layer in place of the lumen section), linked with the compositor's vertex shaders as the app does.
add('compositor Tube compTube (full)', { ...stage3Needs, '../src/ui/tube-stage2.js': ['stage3Sources'] }, stage3('compTube'));
add('compositor Tube compTubeCell (full, cells)', { ...stage3Needs, '../src/ui/tube-stage2.js': ['stage3Sources'] }, stage3('compTubeCell'));
add('compositor Tube plainTube', { ...stage3Needs, '../src/ui/tube-stage2.js': ['stage3Sources'] }, stage3('plainTube'));
add('compositor Tube plainTubeCell', { ...stage3Needs, '../src/ui/tube-stage2.js': ['stage3Sources'] }, stage3('plainTubeCell'));
add('compositor Tube COMP_FS(streak, tube)', { '../src/ui/veins-gl.js': ['COMP_FS'] }, (g) => ({ vs: g.COMP_VS ?? null, fs: g.COMP_FS(false, true, false, 1), note: compNote(g) }));
// (The arrowheads' quads program: blood-heads.js's vertex shader over the compositor's heads build, as veins-gl.js starts it. The Tube's stage 3 reuses the plain heads build.)
const headsNeeds = { '../src/ui/veins-gl.js': ['COMP_FS', 'ZOOM_VS', 'N_SAMPLES', 'CHEV_ORANGE_GLSL'], '../src/ui/comp-glsl.js': ['ALONG_GLSL', 'ROWS_GLSL'], '../src/ui/blood-heads.js': ['headVS'] };
const headsVS = (g, cg, bh) => bh.headVS({ zoom: g.ZOOM_VS, along: cg.ALONG_GLSL, rows: cg.ROWS_GLSL, orange: g.CHEV_ORANGE_GLSL, nSamples: g.N_SAMPLES });
add('compositor Tube COMP_FS(heads, tube)', headsNeeds, (g, cg, bh) => ({ vs: headsVS(g, cg, bh), fs: g.COMP_FS(false, false, true, 1) }));
add('compositor COMP_FS(heads)', headsNeeds, (g, cg, bh) => ({ vs: headsVS(g, cg, bh), fs: g.COMP_FS(false, false, true) }));

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
