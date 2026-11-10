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
