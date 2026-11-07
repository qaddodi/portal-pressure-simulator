// Compare polish (1 Nov 2026): the Differences table reads as four short groups, each name sits above its unit, the change
// leads with its signed number behind a small triangle, and the Tests strip names the moment by its time, not "baseline".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const compare = src('src/ui/compare.js'), css = src('styles/app.css'), dock = src('src/ui/dock.js');

test('the groups cover every row of the table, in order', () => {
  const groups = [...compare.match(/const GROUPS = \[(.*)\];/)[1].matchAll(/\['(\w+)', (\d+)\]/g)].map((m) => [m[1], +m[2]]);
  assert.deepEqual(groups.map((g) => g[0]), ['Pressure', 'Flow', 'Consequences', 'Systemic']);
  const rows = compare.slice(compare.indexOf('const ROWS = ['), compare.indexOf('];', compare.indexOf('const ROWS = [')));
  const n = (rows.match(/\['[^']+', \(m/g) || []).length;
  assert.equal(groups.reduce((s, g) => s + g[1], 0), n);
  assert.equal(n, 11);
});

test('a name sits above its unit; the triangle is 12 px and comes before the signed number', () => {
  assert.match(css, /\.cmp-table td \.unit \{ display: block;[^}]*font-size: var\(--fs-12\)/);
  assert.match(css, /\.cmp-table td\.d \.tri \{[^}]*font-size: var\(--fs-12\)/);
  assert.match(compare, /same \? '' : dd > 0 \? '▲' : '▼', same \? '—' : `\$\{dd > 0 \? '\+' : '−'\}/);
  assert.doesNotMatch(compare, /'▲ \+'/);
});

test('the Tests strip names the moment by its time', () => {
  assert.doesNotMatch(dock, /Change since baseline/);
  assert.match(dock, /`Since \$\{cmpWhen\}`/);
  assert.match(dock, /cmpWhen = st\.compareSnap\.when;/);
});
