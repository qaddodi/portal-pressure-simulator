// Which modules of src/ no entry reaches (SHL-8, bible review 19 Nov 2026). A module that only a unit test imports is dead code the test keeps alive: deleting it used to
// break its own pin. Entries: the page (index.html's script and main.js), the two workers, every script in scripts/ and every browser tool in tests/e2e/ (those are local
// tools that still run the app's modules; an address in a page.evaluate, '/src/ui/x.js', counts). Unit tests under tests/*.test.js are not entries, which is the point. `node scripts/reachability.mjs` lists what is unreachable.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (p) => (statSync(p).isDirectory() ? readdirSync(p).flatMap((f) => walk(join(p, f))) : [p]);
const SPEC = /(?:\bfrom\s*|\bimport\s*\(?\s*|new URL\()\s*(['"`])((?:\.{1,2}\/|\/src\/)[^'"`]+?)\1/g;
const importsOf = (file) => [...readFileSync(file, 'utf8').matchAll(SPEC)].map((m) => (m[2].startsWith('/src/') ? join(ROOT, m[2]) : resolve(dirname(file), m[2])).replace(/\?.*$/, '')).filter((p) => existsSync(p) && statSync(p).isFile());

export function unreachable(root = ROOT) {
  const q = [join(root, 'src/ui/main.js'), join(root, 'src/worker.js'), join(root, 'src/worker-core.js')];
  for (const m of readFileSync(join(root, 'index.html'), 'utf8').matchAll(/src="(src\/[^"?]+)"/g)) q.push(join(root, m[1]));
  for (const d of ['scripts', 'tests/e2e']) if (existsSync(join(root, d))) q.push(...walk(join(root, d)).filter((f) => /\.m?js$/.test(f)));
  const seen = new Set();
  while (q.length) { const f = q.pop(); if (seen.has(f)) continue; seen.add(f); if (/\.m?js$/.test(f)) q.push(...importsOf(f)); }
  return walk(join(root, 'src')).filter((f) => f.endsWith('.js') && !seen.has(f)).map((f) => f.slice(root.length + 1).replace(/\\/g, '/')).sort();
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(unreachable().join('\n') || 'every module of src/ is reached by an entry');
