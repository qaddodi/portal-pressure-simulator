import { stageSource } from './stage-src.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Cached labels while something moves (recs.md item 6, 2 Nov 2026): a laid-out label's values are not rebuilt or written during a
// transition, and catch up in the first frame after it.
const stage = stageSource();
test('a moving frame leaves laid-out labels alone, and the values catch up after the move', () => {
  assert.match(stage, /sameKey\(key\) && \(inMotion\(\) \? holdValues\(f\) : refreshValues\(f\)\)/);
  assert.doesNotMatch(stage, /LABEL_HOLD|labelhold=/);
  assert.match(stage, /heldWait \|\|= afterMotion\(/);
  assert.match(stage, /if \(!refreshValues\(g\)\) (?:live\.)?(?:live\.)?labelKey = null; (?:live\.)?(?:live\.)?labelGlSync\(\);/);
});
