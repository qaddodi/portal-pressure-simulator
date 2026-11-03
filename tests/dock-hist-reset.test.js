// A tile's trend history is histT / histV. dock.js once cleared a `x.hist` no tile has, which threw for every unmeasured reading
// (HVPG before it is measured, a new patient's hidden readouts) and stopped the strip painting the tiles after it (3 Nov 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('dock.js clears the tiles\' own histT and histV, never an x.hist', () => {
  const src = readFileSync(new URL('../src/ui/dock.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(src, /\bx\.hist\b/);
  assert.match(src, /histT: \[\], histV: \[\]/);
  assert.match(src, /x\.histT\.length = 0; x\.histV\.length = 0;/);
});
