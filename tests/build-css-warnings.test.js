// R05 (external production review, 15 Nov 2026): the strict build reported `css-syntax-error: Unexpected ")"` for the forced-colors rule of the selected
// instrument tab and still exited 0, so the rule was silently dropped. A CSS syntax error now fails the build (scripts/build-warnings.mjs), and none is left.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { fatalWarnings, refusal, FATAL_WARNINGS } from '../scripts/build-warnings.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const css = async (code) => (await build({ stdin: { contents: code, loader: 'css', resolveDir: join(ROOT, 'styles') }, bundle: true, write: false, logLevel: 'silent', minify: true, outdir: '/tmp/never-written', loader: { '.png': 'file', '.woff2': 'file', '.svg': 'file' } })).warnings;

test('esbuild reports the stray ")" as css-syntax-error, and the build treats that as fatal', async () => {
  const w = await css('@media (forced-colors: active) { :is(.a[x="true"]) :is(.b) { color: red; } .instr-tab[aria-selected="true"]) :is(.ic) { color: blue; } }');
  assert.ok(w.some((x) => x.id === 'css-syntax-error'), JSON.stringify(w.map((x) => x.id)));
  assert.equal(fatalWarnings(w).length, w.filter((x) => FATAL_WARNINGS.includes(x.id)).length);
  assert.match(refusal(fatalWarnings(w)), /^Build refused:\n {2}css-syntax-error /);
  assert.deepEqual(await css('.instr-tab[aria-selected="true"] :is(.ic) { color: blue; }'), []);
});

test('every style sheet in styles/ builds with no syntax error', async () => {
  const bad = [];
  for (const f of readdirSync(join(ROOT, 'styles')).filter((x) => x.endsWith('.css'))) {
    const w = fatalWarnings(await css(readFileSync(join(ROOT, 'styles', f), 'utf8')));
    for (const x of w) bad.push(`${f}:${x.location?.line} ${x.text}`);
  }
  assert.deepEqual(bad, []);
});

test('the fatal list is the one place the build reads: syntax errors and undefined imports', () => {
  assert.deepEqual([...FATAL_WARNINGS].sort(), ['css-syntax-error', 'import-is-undefined']);
});
