import { stageSource } from './stage-src.js';
// A view moved by a frame's own callback (a glide's step, the catheter's camera following the tip in a procedure) is synced with the
// figure's draw in that same frame: the labels, their lines and the vessels all show one view (2 Nov 2026, "the TIPS animation: the
// callout lines don't stick to the camera"). frame.js runs a callback asked for during the frame in the next one, so the sync waiting
// there is run first by the figure's draw pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const STAGE = stageSource();

test('the figure\'s draw pass runs a waiting view sync first, before the catheter\'s readings and the vessels', () => {
  assert.match(STAGE, /function animate\(now\) \{\n\s+animRaf = 0;\n(?:\s+\/\/[^\n]*\n)+\s+if \(viewRaf\) \{ cancelFrame\(viewRaf\); syncView\(\); \}\n\s+cathLabelsNow\(\);/);
});

test('a view change still asks its sync for the frame (applyVT), and syncView clears the ask', () => {
  assert.match(STAGE, /if \(!(?:live\.)?(?:live\.)?viewRaf\) (?:live\.)?(?:live\.)?viewRaf = nextFrame\(syncView\);/);
  assert.match(STAGE, /function syncView\(\) \{\n\s+(?:live\.)?viewRaf = 0;/);
});
