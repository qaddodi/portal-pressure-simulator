// R15: a table whose patients are still computing shows labelled placeholders of a number's size, publishes arriving rows only once the cards
// have landed, and says it was shown with rows missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PZ = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');

test('a pending cell is a bar of a value\'s width, hidden from the screen reader, beside its spoken "calculating"', () => {
  const line = PZ.slice(PZ.indexOf('  const pendEl = '), PZ.indexOf('\n', PZ.indexOf('  const pendEl = ')));
  assert.match(line, /'pz-pendbar'/);
  assert.match(line, /width: '2\.4em', height: '\.55em'/);
  assert.match(line, /'sr-only' \}, 'calculating'/);
  assert.doesNotMatch(line, /…|\.\.\./, 'no ellipsis anywhere');
});

test('a table shown with a row still computing is labelled degraded', () => {
  assert.match(PZ, /if \(rowIdx\(s\)\.some\(\(x\) => !states\[x\]\)\) degrade\('table-rows'\);/);
});

test('an arriving row waits for the cards\' landing before the table is swapped, and a layout it cannot make now is queued', () => {
  const w = PZ.slice(PZ.indexOf('  function watchRows('), PZ.indexOf('  const fpOf = '));
  assert.ok(w.indexOf('await Promise.all(throwCards().map((c) => c && throwLanded(c)))') < w.indexOf('el.replaceWith(t)'));
  assert.match(w, /if \(!cardMoving\(\)\) layout\(\); else if \(thrown\(\)\) layoutAtLanding\(\);/);
});
