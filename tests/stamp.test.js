// Cache-busting is made by the build (scripts/build.mjs: hashed asset names, a generated service worker), not committed in the source:
// a `?v=<hash>` on an import made every branch conflict on every file that imported a changed one (see scripts/stamp.mjs).
// The source imports plain addresses, so one address names one module in the page, and the build is what keeps old and new files apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { stripStamps, hasStamp } from '../scripts/stamp.mjs';

test('no cache stamp is committed in the source, the styles or index.html', () => {
  const r = spawnSync(process.execPath, ['scripts/stamp.mjs', '--check'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test('the check sees a stamp on an import, a link, a script, a worker address and a style, and strips only the stamp', () => {
  const cases = [
    ["import { a } from './dock.js?v=3f9a1c2e4b';", "import { a } from './dock.js';"],
    ["const m = () => import('./doppler.js?v=0123456789');", "const m = () => import('./doppler.js');"],
    ['<link rel="stylesheet" href="styles/app.css?v=62c54afaac" />', '<link rel="stylesheet" href="styles/app.css" />'],
    ['<script type="module" src="src/ui/main.js?v=52bfa7e306"></script>', '<script type="module" src="src/ui/main.js"></script>'],
    ["new Worker(new URL('../worker.js?v=abcdef0123', import.meta.url))", "new Worker(new URL('../worker.js', import.meta.url))"],
  ];
  for (const [from, to] of cases) {
    assert.ok(hasStamp(from), from);
    assert.equal(stripStamps(from), to);
    assert.ok(!hasStamp(to), to);
  }
  assert.ok(!hasStamp("new URLSearchParams(location.search).get('v')"), 'a query named v that is not on a file address is not a stamp');
});

test('every module imports a local file by its plain address', () => {
  const lines = [];
  const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith('.js') && lines.push(...readFileSync(`${d}/${e.name}`, 'utf8').split('\n').filter((l) => /from '\.{1,2}\/[^']+\.js\?/.test(l)))));
  walk('src');
  assert.deepEqual(lines, [], 'a local import with a query string');
});
