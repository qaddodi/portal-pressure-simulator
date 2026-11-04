import { stageSource } from './stage-src.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The figure's idle loop (review item 27): its safety look comes once a second, its still-key reads the blood setting's text
// only after a store write, and every organ picture that lands outside a frame wakes it, so nothing waits on the look.
const st = stageSource();

test('the idle loop looks again once a second and keys the blood setting on the store version', () => {
  assert.match(st, /function sleep\(\) \{\s+sleeping = true; clearTimeout\(sleepTimer\); sleepTimer = setTimeout\(wake, 1000\);/);
  assert.match(st, /if \(still && bloodKeyVer !== storeVer\) \{ bloodKey = JSON\.stringify\(st\.blood\); bloodKeyVer = storeVer; \}/);
  assert.doesNotMatch(st, /\$\{JSON\.stringify\(st\.blood\)\}/);
  // (rev 2 step 3: a model frame alone does not bump it; nothing it keys on is in the frame)
  assert.match(st, /store\.on\('\*', \(\) => \{ storeVer\+\+; \}, \{ frames: false \}\);/);
});

test('organ pictures that land outside a frame wake the loop', () => {
  assert.match(st, /dropViewKeep\(\); {3}\/\/ \(a picture of the state before[^\n]*\n\s+veinsDirty = true; stageWake\(\);/);
  assert.match(st, /veins\.dropPlate\(1\); veinsDirty = true; stageWake\(\); \} return; \}/);
  assert.match(st, /plateView = \[x0, y0, x1, y1, scale\]; veinsDirty = true; stageWake\(\); \}/);
});
