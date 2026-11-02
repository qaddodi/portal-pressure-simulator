// The credit reads no figure shape while the figure is pinched, panned or glided (2 Nov 2026, "zoom is miserable": a pinch read every
// organ's and vessel's box and style again, a few times a gesture). ?creditstill=0 reads them as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/credit.js', import.meta.url), 'utf8');

test('a look in a gesture waits for it to end instead of starting a read of the shapes', () => {
  assert.match(src, /if \(!fresh && figureMoving\(world\)\) \{ whenStill\(world, done\); return PENDING; \}/);
  assert.match(src, /setTimeout\(go, 120\)/, 'polled with a timer, never a frame');
});

test('a read under way stops while the figure moves, part-way too, and its hold restarts', () => {
  assert.match(src, /if \(j\.stage === 0 && figureMoving\(j\.world\)\) \{ j\.quiet = false; setTimeout\(/);
  assert.match(src, /if \(figureMoving\(world\)\) \{ j\.at = j\.armed = now; return true; \}/);
});

test('moving: the app is busy or the stage carries a gesture class; ?creditstill=0 turns it off', () => {
  assert.match(src, /classList\.contains\('stage-busy'\)/);
  assert.match(src, /for \(const c of GESTURE_LOOK\) if \(sv\.classList\.contains\(c\)\) return true;/);
  assert.match(src, /\[\?&\]creditstill=0\\b/);
});
