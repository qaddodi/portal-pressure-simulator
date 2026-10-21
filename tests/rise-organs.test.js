// Out of the lobule (HVPG 7 to 8): the stomach and gut were missing through the zoom out and popped in partway (Mohammad, 20 Oct).
// The organs' picture was dropped as stale when the rise began, and the live drawing, scaled up by the zoom, lost its masked groups
// in Safari. The picture now stays through the whole rise and is brought up to date once it has landed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const st = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const poke = st.match(/function platePoke\(\) \{[\s\S]*?\n {2}\}\n/)[0];

test('nothing drops the organs\' picture while the rise zooms out', () => {
  assert.match(st, /const rising = \(\) => !lobuleOn && diveT > 0;/);
  // Held before any path in platePoke that can drop the picture (stale, a moving liver, spleen or fluid) or raster it again.
  const hold = poke.indexOf('if (rising()) { plateAfterRise = true; return; }');
  assert.ok(hold > 0, 'held at the start');
  for (const at of ['hidePlate()', 'const stale = plateStale', 'plateTimer = setTimeout']) assert.ok(poke.indexOf(at) > hold, `${at} comes after the hold`);
  // A raster already waiting when the rise begins waits too.
  const timer = poke.slice(poke.indexOf('plateTimer = setTimeout'));
  assert.ok(timer.indexOf('if (rising()) { plateAfterRise = true; return; }') >= 0 && timer.indexOf('if (rising())') < timer.indexOf('rasterPlate('));
});

test('the held picture catches up once the rise has landed, and only then', () => {
  const end = st.match(/else if \(!on\) \{\n\s+setDiveScale\(1\);[\s\S]*?if \(plateAfterRise\) \{ plateAfterRise = false; platePoke\(\); \}/);
  assert.ok(end, 'poked at the end of the rise (diveT is 0 there, so it goes ahead)');
  assert.equal((st.match(/plateAfterRise = true/g) || []).length, 2);
});
