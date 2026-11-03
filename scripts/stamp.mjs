// No cache stamps are committed any more (2 Nov 2026).
//
// Every local import used to carry `?v=<hash of the file>` so a browser could never combine a new index.html with an old cached module
// of the GitHub Pages site. Those hashes lived in the source, so every change anywhere rewrote the stamp of every file that imports it,
// and parallel branches conflicted on them constantly. The cache-busting is now made where it belongs, when the site is built:
//   - the deployed site (live and preview) is the production build (`npm run build`): its files are bundled under names that carry their
//     own content hash (assets/<name>-<hash>.js) and its service worker is generated with the list of them, so an old and a new file
//     can never be mixed;
//   - the source tree (`npm start`, the tests of the source site) is served with `cache-control: no-cache` (scripts/serve.mjs), and
//     its service worker fetches everything unstamped from the network first.
// The source therefore imports plain addresses (`./dock.js`), and one address names one module in the page.
//
//   node scripts/stamp.mjs          take any `?v=<hash>` out of the source (what the old command put in; harmless to run)
//   node scripts/stamp.mjs --check  exit 1 if any is left (used by npm test)

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : /\.(js|html|css)$/.test(p) ? [p] : [];
});

// A stamp on a local address: ./dock.js?v=3f9a1c2e, src/ui/main.js?v=…, styles/app.css?v=… (JS and CSS files, in source and in index.html).
export const STAMP = /(\.(?:js|css))\?v=[0-9a-f]{6,}(?![0-9a-f])/g;
export const stripStamps = (text) => text.replace(STAMP, '$1');
export const hasStamp = (text) => { STAMP.lastIndex = 0; return STAMP.test(text); };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const files = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'styles')), join(ROOT, 'index.html'), join(ROOT, 'sw.js')];
  const stamped = files.filter((f) => hasStamp(readFileSync(f, 'utf8')));
  if (check) {
    if (stamped.length) {
      console.error(`Cache stamps (?v=<hash>) are not committed any more: ${stamped.map((f) => relative(ROOT, f)).join(', ')}\nRun: npm run stamp (takes them out). The build makes the cache-busting names.`);
      process.exit(1);
    }
    console.log('No committed cache stamps.');
  } else {
    for (const f of stamped) writeFileSync(f, stripStamps(readFileSync(f, 'utf8')));
    console.log(stamped.length ? `Took the stamps out of ${stamped.length} file(s).` : 'No stamps to take out.');
  }
}
