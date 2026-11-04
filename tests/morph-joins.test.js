import { stageSource } from './stage-src.js';
// A change between the views draws every frame from the stretches made ahead; a frame with a join no stretch had falls back to binning on the CPU
// (66-86 ms headless, once or twice a change). The stretches' joins are therefore found at the widths the frames will have, and also hold the
// contacts just past the limit and a pair's every contact (measured 2 Nov 2026, headless iPhone: 0 CPU re-binned frames in five changes, from 1-3 each).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const st = stageSource();
const vj = readFileSync(new URL('../src/ui/vein-joins.js', import.meta.url), 'utf8');

test('stretch joins: found at the widths between the views, with the contacts just past the limit', () => {
  assert.match(st, /x\.wAn = x\.isArt \?[^;]*; x\.wCi = x\.isArt \?/);
  assert.match(st, /function widthRatio\(x, t\)/);
  assert.match(st, /function joinsAhead\(items, t\)/);
  assert.match(st, /const wide = veinJoins\(items, newJoinStore\(\), MORPH_NEAR\)/);
  assert.match(vj, /\(!margin && pairHas\(it\.row, y\.row\)\)/);
  assert.match(st, /joinsAhead\(w\.own, t\)/);
  assert.match(st, /joinsAhead\(w\.items, t\)/);
  assert.match(st, /joinsAhead\(itemsAt\(u, pc\.anat, false\), u\)/);
});

test('a frame\'s own joins are found as before: no margin, no width scaling', () => {
  assert.match(st, /const \{ J, smooth \} = joinsOf\(items, FR_STORES\[frFlip\]\);/);
});
