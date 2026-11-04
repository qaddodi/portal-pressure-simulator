import { stageSource } from './stage-src.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The figure's idle loop (review item 27): its safety look comes once a second, its still-key reads the blood setting's text
// only after a store write, and every organ picture that lands outside a frame wakes it, so nothing waits on the look.
const st = stageSource();

test('the idle loop looks again once a second while shown and still, and keys the blood setting on the store version', () => {
  assert.match(st, /function sleep\(\) \{\s+(?:live\.)?sleeping = true; clearTimeout\((?:live\.)?sleepTimer\); (?:live\.)?sleepTimer = 0;\s+const ms = sleepLook\(\);\s+if \(ms\) (?:live\.)?sleepTimer = setTimeout\(wake, ms\);/);
  // (C5: the once-a-second look is kept only for a still figure on screen; a figure not shown looks once, at the warm window's end)
  assert.match(st, /function sleepLook\(\) \{\s+if \(!unseen\(\)\) return 1000;/);
  assert.match(st, /return Math\.max\(0, WARM_MS - \(performance\.now\(\) - (?:live\.)?hiddenAt\)\) \+ 1;/);
  assert.match(st, /if \(still && bloodKeyVer !== (?:live\.)?storeVer\) \{ bloodKey = JSON\.stringify\(st\.blood\); bloodKeyVer = (?:live\.)?storeVer; \}/);
  assert.doesNotMatch(st, /\$\{JSON\.stringify\(st\.blood\)\}/);
  // (rev 2 step 3: a model frame alone does not bump it; nothing it keys on is in the frame)
  assert.match(st, /store\.on\('\*', \(\) => \{ (?:live\.)?storeVer\+\+; \}, \{ frames: false \}\);/);
});

test('organ pictures that land outside a frame wake the loop', () => {
  assert.match(st, /dropViewKeep\(\); {3}\/\/ \(a picture of the state before[^\n]*\n\s+(?:live\.)?(?:live\.)?veinsDirty = true; (?:live\.)?(?:live\.)?stageWake\(\);/);
  assert.match(st, /(?:live\.)?veins\.dropPlate\(1\); (?:live\.)?veinsDirty = true; (?:live\.)?stageWake\(\); \} return; \}/);
  assert.match(st, /(?:live\.)?plateView = \[x0, y0, x1, y1, scale\]; (?:live\.)?veinsDirty = true; (?:live\.)?stageWake\(\); \}/);
});
