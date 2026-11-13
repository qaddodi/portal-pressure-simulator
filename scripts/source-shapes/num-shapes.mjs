// Unification audit 19 (13 Nov 2026): clamp(x, a, b), lerp and clamp01 are src/ui/num.js's (util.js re-exports clamp and lerp). The files still
// holding a copy of their own are listed here, each with why; the list only gets shorter. Any other file that writes one fails.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
const walk = (dir) => readdirSync(join(ROOT, dir)).flatMap((n) => { const rel = `${dir}/${n}`; return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : n.endsWith('.js') ? [rel] : []; });
const KEEP = new Set([
  'src/ui/num.js',                 // (the one)
  'src/engine/physiology.js',      // (the engine imports nothing from src/ui)
  'src/ui/chart-looks/dsl.js',     // (a look's clamp() expression, not the number helper)
  'src/ui/tube-cel-glsl.js', 'src/ui/tube-glow-glsl.js', 'src/ui/tube-join-glsl.js', 'src/ui/tube-lean-glsl.js', 'src/ui/tube-lumen-glsl.js',   // (JS twins of GLSL)
  'src/ui/tube-geo.js', 'src/ui/tube-joint.js', 'src/ui/veins-mesh.js', 'src/ui/blood-particles.js',   // (mirror their shaders' clamp, min(max(x, a), b): the Tube and blood renderers' own pass)
  'src/ui/card-place.js', 'src/ui/blood.js',   // (min-outer, with bounds that can cross on a small screen: num.js clamp would answer the low bound there)
  'src/ui/css-color.js', 'src/ui/svg-morph.js', 'src/ui/varix-look.js', 'src/ui/hvpg-clock.js',   // (clamp01 that answers +0 for −0, not num.js's −0)
  'src/ui/organ-paint.js',         // (a clamp01 that parses its text first)
  'src/ui/tool-menu.js',           // (left for its owner's pass)
]);
const DEF = /^\s*(?:export\s+)?(?:const|let|function)\s+(?:clamp|lerp|clamp01)\b/m;
export default walk('src').filter((f) => !KEEP.has(f)).map((file) => ({ file, forbid: [DEF, 'clamp, lerp and clamp01 come from src/ui/num.js (util.js re-exports clamp and lerp)'] }));
