import { stageSource } from './stage-src.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STOPS, STOPS_CMAP, STOP_COLS, STOP_LOOK, STOP_HASH } from '../src/ui/stop-tokens.js';
import { stopHash, stopInputs, cssRules } from '../scripts/stop-inputs.mjs';
import { LOOKS } from '../src/ui/looks.js';

const ROOT = new URL('../', import.meta.url);

test('the stop table is made from the style rules and tokens as they are now (run npm run gen:stops when this fails)', () => {
  assert.equal(stopHash(ROOT, Object.keys(STOPS)), STOP_HASH,
    'a style rule or custom property the gradient stops read has changed: run `npm run gen:stops` (it measures the page and writes src/ui/stop-tokens.js), then `npm run gen:stops -- --check`');
});

test('the table has a column for every look the page can wear, and every stop has a colour and an opacity for each column', () => {
  for (const id of [...LOOKS.map((l) => l.palette || l.theme), 'sys-light', 'sys-dark']) {
    assert.ok(Number.isInteger(STOP_LOOK[id]) && STOP_LOOK[id] >= 0 && STOP_LOOK[id] < STOP_COLS.length, `a column for the look ${id}`);
  }
  for (const [sig, row] of [...Object.entries(STOPS), ...Object.entries(STOPS_CMAP)]) {
    assert.equal(row.length, STOP_COLS.length * 2, `${sig}: a colour and an opacity for each column`);
    for (let i = 0; i < row.length; i += 2) {
      assert.match(row[i], /^(rgba?\([\d., /%]+\)|color\(srgb [^)]+\)|transparent)$/, `${sig}: a computed colour`);
      assert.ok(row[i + 1] >= 0 && row[i + 1] <= 1, `${sig}: an opacity`);
    }
  }
  for (const s of Object.keys(STOPS_CMAP)) assert.ok(STOPS[s], `${s}: the circuit view's row has an anatomy row too`);
});

test('the stops the figure builds are in the table (their class, style and presentation attributes make the signature)', () => {
  const stage = stageSource();
  // Every class a stop takes in stage.js's own markup, and the custom properties its inline styles read, have a row.
  const classes = new Set([...stage.matchAll(/<stop [^>]*?class="([\w-]+)"/g)].map((m) => m[1]));
  assert.ok(classes.size >= 15, 'the markup was read');
  const sigs = Object.keys(STOPS);
  for (const c of classes) assert.ok(sigs.some((s) => s.split('|')[0] === c), `a row for the stop class ${c}`);
  const vars = new Set([...stage.matchAll(/<stop [^>]*?style="[^"]*?var\((--[\w-]+)(?=\))/g)].map((m) => m[1]).filter((v) => !v.includes('$')));
  for (const v of vars) assert.ok(sigs.some((s) => s.includes(`var(${v})`)), `a row for a stop styled by ${v}`);
});

test('organ-paint reads a stop from the table and never asks the browser for its style', () => {
  const paint = readFileSync(new URL('src/ui/organ-paint.js', ROOT), 'utf8');
  const g = paint.slice(paint.indexOf('function readGradient('), paint.indexOf('function readPaintValue('));
  assert.ok(g.includes('stopRow(s, g)'), 'readGradient takes each stop from the table');
  assert.ok(!/readStyle|getComputedStyle|stopColor|stopOpacity/.test(g), 'readGradient has no style read');
  assert.match(paint, /import \{ STOPS, STOPS_CMAP, STOP_LOOK \} from '\.\/stop-tokens\.js';/);
});

test('the stop rules and custom properties are found whatever they sit under', () => {
  const rules = cssRules('@media (min-width: 1px) { :root { --a: red; } } .x, .y { stop-color: var(--a); stop-opacity: .5 }');
  assert.deepEqual(rules.map((r) => [r.ctx, r.sel]), [['@media (min-width: 1px)', ':root'], ['', '.x, .y']]);
  const text = stopInputs(['@media (min-width: 1px) { :root { --a: var(--b); --z: 1; } :root { --b: blue; } } .x { stop-color: var(--a); fill: red }'], []);
  assert.match(text, /--a: var\(--b\)/);
  assert.match(text, /--b: blue/);
  assert.ok(!/--z|fill/.test(text), 'what no stop reads is left out');
});
