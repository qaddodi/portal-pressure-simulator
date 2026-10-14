import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The endoscopy data card on Mac and iPad landscape: a large view, its readings in one compact row.
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const src = readFileSync(new URL('../src/ui/instruments.js', import.meta.url), 'utf8');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({ sel: sel.trim().replace(/^\/\*[\s\S]*?\*\/\s*/, ''), body }));
const rule = (sel) => rules.filter((r) => r.sel === sel).map((r) => r.body).join(' ');
const ROW = '.pz:not(.stack) .pz-tool[data-kind="scope"] .endo-read';

test('the readings sit on the card\'s tile grid: two columns on a narrow card, three on a wider one, every row full', () => {
  assert.match(rule(ROW), /repeat\(2,/);
  assert.match(css, /@container pzd \(min-width: 420px\) \{[^}]*\}[^@]*\.pz:not\(\.stack\) \.pz-tool\[data-kind="scope"\] \.endo-read \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/);
  assert.doesNotMatch(css, /1\.2fr 1fr 1fr \.9fr 1\.2fr/, 'no uneven columns');
  assert.doesNotMatch(rule(`${ROW} > .endo-g`), /1 \/ -1/, 'the grade no longer takes a row of its own');
  assert.doesNotMatch(src, /\\u00AD/, 'no name is hyphenated');
});

test('the order of the readings is grade, diameter, wall thickness, bands, stigmata', () => {
  const scope = src.slice(src.indexOf('const stats = h('), src.indexOf('const side = h('));
  const dts = [...scope.matchAll(/h\('dt', \{\}, '([^']+)'\)/g)].map((m) => m[1].replace(/\\u00AD/, ''));
  assert.deepEqual(dts, ['Bands placed', 'Grade', 'Diameter', 'Wall thickness', 'Stigmata']);
  assert.match(rule('.pz-tool[data-kind="scope"] .endo-read > .endo-g'), /order:\s*0/);
  assert.match(rule('.pz-tool[data-kind="scope"] .endo-read > .endo-chip'), /order:\s*1/);
});

test('the view is bigger than before and the card spans the full width for the row', () => {
  assert.match(rule('.pz-tool[data-kind="scope"] .endo-stage'), /calc\(40 \* var\(--pzh\)\), 30vw\)/);
  assert.match(rule('.pz:not(.stack) .pz-data.col > .pz-tool[data-kind="scope"]'), /width:\s*100%/);
});

test('a value is one line in a fixed shape, and the stigmata read as a short sign in the row', () => {
  assert.match(rule(`${ROW} dt`), /font-size:\s*max\(calc\(12px/);
  assert.match(css, /\.pz:not\(\.stack\) \.pz-tool\[data-kind="scope"\] :is\(\.endo-num[^{]*\{[^}]*white-space:\s*nowrap/);
  assert.match(rule('.pz:not(.stack) .pz-tool[data-kind="scope"] .endo-more'), /display:\s*none/);
  assert.match(src, /'Red wale'/);
  assert.match(src, /', cherry spots'/);
});

test('the phone layout keeps its own compact scope rules', () => {
  assert.match(rule('.pz.stack .pz-tool[data-kind="scope"] .endo-stage'), /width:\s*min\(40%, 24vh\)/);
});
