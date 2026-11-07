// The static checks, no browser, about a second (Quick runs it on every push; ci.yml too): a conflict marker in any file git
// tracks, and the app and the engine worker bundled the way the build bundles them (a missing export or file, a syntax error,
// an import that is always undefined). The checks themselves are scripts/gate-static.mjs.
//
//   node scripts/check-static.mjs

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findMarkers, checkBundle } from './gate-static.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const found = [
  ...findMarkers().map((m) => `${m.file}:${m.line}: merge conflict marker "${m.text}"`),
  ...(await checkBundle()).map((p) => `${p.where.replace(`${ROOT}/`, '')}: ${p.text}`),
];
for (const f of found) console.log(process.env.GITHUB_ACTIONS ? `::error title=Static check::${f}` : `FAIL ${f}`);
console.log(found.length ? `static checks: ${found.length} finding(s)` : 'static checks passed');
process.exit(found.length ? 1 : 0);
