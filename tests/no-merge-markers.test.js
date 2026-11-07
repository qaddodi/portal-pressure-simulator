// A rebase that leaves a conflict marker in a source file ships a page that does not load (stage.js, 31 Oct). Every file the
// page or the build reads is checked for one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const files = [];
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(js|mjs|css|html|json|yml)$/.test(n)) files.push(p); } };
for (const d of ['src', 'styles', 'scripts', 'tests', '.github']) walk(join(ROOT, d));
files.push(join(ROOT, 'index.html'), join(ROOT, 'package.json'));

test('no file the app or its tooling reads carries a merge conflict marker', () => {
  const bad = files.filter((f) => /^(<{7}|={7}|>{7})( |$)/m.test(readFileSync(f, 'utf8')));
  assert.deepEqual(bad.map((f) => f.slice(ROOT.length)), []);
});
