// The Vector renderer as veins-gl.js's seam makes it (docs/recommendations/vector-renderer-plan.md 9.H; workstream H).
//
// veins-gl.js hands draw, drawRows and composite to what createVecRenderer(gl, shared) returns (vec-renderer.js, workstream E). This file is
// the one place that puts the other workstreams' modules together for it: `vecParts(gl, K)` is the `parts` of E's `shared` accessor, built
// from the modules that exist, each under the name E's header gives it. It imports no GL state of veins-gl.js (that would be a cycle): the
// shader flags it needs come in as K, which veins-gl.js builds from its own constants (VEC_K_NAMES lists them, a test pins the list).
//
// In: parts.stretch (B), parts.region (C), parts.organs (F, via vec-organs-port.js, which gives it the organ stack's input as a layer map),
// parts.overlays (G) and parts.compile (A). A new workstream's part is one line in vecParts below, and its name in VEC_WAITING until then.
// D's blood text is the default of B's and C's shaders (vec-blood-glsl.js); nothing is passed.
import { createVecRenderer } from './vec-renderer.js';
import { vecStretchVS, vecStretchFS } from './vec-stretch-glsl.js';
import { createOverlays } from './vec-overlays.js';
import { vecRegionParts } from './vec-region-glsl.js';
import { createVecOrgans } from './vec-organs.js';
import { vecOrgansPort } from './vec-organs-port.js';
import { createVecCompiler } from './vec-compile.js';
import { createVecLobule } from './vec-lobule.js';
import { V_FULL } from './vec-contract.js';

export { createVecRenderer, createVecLobule };

/** The flags and numbers vec-shade-glsl.js takes as K (they live in veins-gl.js, which imports this file). */
export const VEC_K_NAMES = Object.freeze(['F_DIFFUSE', 'F_EDGE', 'F_SHADOW', 'F_SPEC', 'F_VEIL', 'F_WHOLE', 'F_SEL', 'F_DOTTED', 'F_NOCASE', 'VEIL_K']);
/** The parts of E's header that no module gives yet: the Vector renderer reports itself as waiting for them (status()) and is not used. */
export const VEC_WAITING = Object.freeze([]);

/** The `parts` of E's shared accessor, from the modules that exist. K: the flags (VEC_K_NAMES). shared: E's accessor (A's compiler reads the tube and radius tables from it). */
export function vecParts(gl, K, shared = null) {
  for (const k of VEC_K_NAMES) if (K[k] === undefined) throw new Error(`vec-seam: K.${k} is missing`);
  const vs = vecStretchVS(V_FULL, K);
  return {
    // (B: one vertex shader for every variant, as E's header has it; the fragment shader by variant. D's blood text and G's over-blood text
    // go in as { blood, above } when they are given; until then B's stubs.)
    stretch: { vs, fs: (variant) => vecStretchFS(variant, K, {}) },
    // (G: E calls overlays.draw(pass, m, phase) in each pass and overlays.setOverlays(look, m, w, h) with the other setters.)
    overlays: createOverlays(gl),
    // (C: the regions' vertex and fragment shaders; the same flags, D's blood text by default.)
    region: vecRegionParts(K, {}),
    // (F: the organs; the port gives them the organ stack's input as they take it.)
    organs: vecOrgansPort(createVecOrgans(gl)),
    // (A: the graph and the grid. E calls build(bins, nTubes) and patch(bins); the kept tube and radius tables are the instance's own, read through the accessor.)
    compile: vecCompile(shared),
  };
}

/** A's compiler with the instance's tube and radius tables handed to its first build (it keeps them for the attribute and radius updates). */
function vecCompile(shared) {
  const c = createVecCompiler();
  if (!shared) return c;
  const port = Object.create(c);
  port.build = (bins, nTubes) => c.build(bins, nTubes, shared);
  return port;
}
