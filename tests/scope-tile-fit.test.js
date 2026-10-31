// The readings card's fit skips the endoscopic view's tile: its number and unit are never placed (scope-tile.js), so reading
// their parent's style threw "getComputedStyle: parameter 1 is not of type 'Element'" on every refit (Varices 3's time-lapse).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');

test('the tiles fit skips a picture tile before it reads the number and unit', () => {
  const fit = src.slice(src.indexOf('function fit() {'), src.indexOf('function fit() {') + 900);
  const skip = fit.indexOf('if (p.pic) continue;'), read = fit.indexOf('p.v.parentNode');
  assert.ok(skip > 0, 'fit() has no picture-tile skip');
  assert.ok(skip < read, 'the skip comes after the number is read');
  assert.match(src, /const pic = k === 'scope' \? createScopeTile\(\) : null;/);
});
