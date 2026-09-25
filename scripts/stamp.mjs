// Cache-busting without a build step.
//
// GitHub Pages lets browsers cache each file for ~10 minutes, and ES modules are fetched one file
// at a time. Right after a deploy a browser can therefore combine a new index.html / main.js with
// an old cached dock.js (or stage.js, or the engine in the worker) and break. To prevent that,
// every local URL (module imports, the worker, the stylesheets and the entry script) carries a
// hash of the file it points to: `./dock.js?v=3f9a1c2e`. A file whose content changed gets a new
// URL that no cache holds, and because the hash of a file covers the stamped URLs inside it, a
// change anywhere propagates up to index.html. Old and new module graphs can never mix.
//
//   node scripts/stamp.mjs          rewrite the stamps in place
//   node scripts/stamp.mjs --check  exit 1 if any stamp is out of date (used by npm test)

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : [];
});
const files = [...walk(join(ROOT, 'src')), join(ROOT, 'index.html')];

// Local references: module specifiers, dynamic imports, new URL(…, import.meta.url) in JS;
// script src / stylesheet href in the HTML.
const JS_REF = /((?:\bfrom|\bimport)\s*\(?\s*|new URL\(\s*)(['"])(\.{1,2}\/[^'"?]+\.js)(\?v=[0-9a-f]+)?\2/g;
const HTML_REF = /((?:src|href)=)(")((?:src|styles)\/[^"?]+\.(?:js|css))(\?v=[0-9a-f]+)?"/g;
const refRe = (file) => (file.endsWith('.html') ? HTML_REF : JS_REF);
const target = (file, spec) => resolve(dirname(file), spec);

const original = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));
const hashes = new Map();
const stamped = new Map();
const visiting = new Set();
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 10);

// Hash of a file = hash of its content with its own references already stamped (depth first).
function hashOf(file) {
  if (hashes.has(file)) return hashes.get(file);
  if (!original.has(file)) { const h = sha(readFileSync(file, 'utf8')); hashes.set(file, h); return h; } // e.g. CSS
  if (visiting.has(file)) return sha(original.get(file).replace(/\?v=[0-9a-f]+/g, '')); // import cycle
  visiting.add(file);
  const out = original.get(file).replace(refRe(file), (m, pre, q, spec) => `${pre}${q}${spec}?v=${hashOf(target(file, spec))}${q}`);
  visiting.delete(file);
  stamped.set(file, out);
  const h = sha(out);
  hashes.set(file, h);
  return h;
}
files.forEach(hashOf);

const stale = files.filter((f) => stamped.get(f) !== original.get(f));
if (check) {
  if (stale.length) {
    console.error(`Out-of-date cache stamps in: ${stale.map((f) => relative(ROOT, f)).join(', ')}\nRun: npm run stamp`);
    process.exit(1);
  }
  console.log('Cache stamps are current.');
} else {
  for (const f of stale) writeFileSync(f, stamped.get(f));
  console.log(stale.length ? `Stamped ${stale.length} file(s).` : 'Cache stamps were already current.');
}
