// Unification audit 9 (13 Nov 2026): every curve is a member of ease.js. The ease-out cubic is ease.js easeOut3, never written again by hand
// ((1 - u) ** 3, or (1 - u) * (1 - u) * (1 - u)), and a cubicBezier with literal numbers is made in ease.js (the family) or card-throw.js (the
// rail's own curve, decided with the cards) only: easeArrive is cubicBezier(0.2, 0.8, 0.2, 1), so a copy of it is easeArrive. The GLSL twins
// (tube-*-glsl.js) mirror their shaders and are left out.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
const walk = (dir) => readdirSync(join(ROOT, dir)).flatMap((n) => { const rel = `${dir}/${n}`; return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : n.endsWith('.js') ? [rel] : []; });
const files = walk('src').filter((f) => !/-glsl\.js$/.test(f));
const CUBE = /\(1 - ([A-Za-z_$][\w$.]*)\) \*\* 3\b|\(1 - ([A-Za-z_$][\w$.]*)\) \* \(1 - \2\) \* \(1 - \2\)/;
const LITERAL_BEZIER = /\bcubicBezier\(\s*-?\.?\d/;

export default [
  ...files.filter((f) => f !== 'src/ui/ease.js').map((file) => ({ file, forbid: [CUBE, 'the ease-out cubic is ease.js easeOut3 (motion.js re-exports it)'] })),
  ...files.filter((f) => f !== 'src/ui/ease.js' && f !== 'src/ui/card-throw.js').map((file) => ({ file, forbid: [LITERAL_BEZIER, 'a curve with its own numbers belongs in ease.js (easeArrive is cubicBezier(0.2, 0.8, 0.2, 1))'] })),
];
