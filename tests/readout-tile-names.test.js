// The varix tile reads "% of rupture threshold", one phrase everywhere (16 Nov 2026). (The Readouts tile name wrapping is a pin in scripts/source-shapes/pins-16nov-readouts.mjs.)
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { TILES } from '../src/ui/dock.js';
import { WALL_WORDS } from '../src/engine/portal/wall-read.js';

test('one phrase for the varix wall stress: of rupture threshold', () => {
  assert.equal(TILES.find((t) => t.id === 'varix').ux, ' of rupture threshold');
  assert.equal(WALL_WORDS.critical, 'Past rupture threshold');
});
