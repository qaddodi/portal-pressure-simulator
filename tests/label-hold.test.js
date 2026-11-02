import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Cached labels while something moves (recs.md item 6, 2 Nov 2026): a laid-out label's values are not rebuilt or written during a
// transition, and catch up in the first frame after it; ?labelhold=0 writes them every frame as before.
const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
test('a moving frame leaves laid-out labels alone, and the values catch up after the move', () => {
  assert.match(stage, /\(LABEL_REV \? sameKey\(key\) : key === labelKey\) && \(LABEL_HOLD && inMotion\(\) \? holdValues\(f\) : refreshValues\(f\)\)/);
  assert.match(stage, /const LABEL_HOLD = !\/\[\?&\]labelhold=0\\b\/\.test\(location\.search\);/);
  assert.match(stage, /heldWait \|\|= afterMotion\(/);
  assert.match(stage, /if \(!refreshValues\(g\)\) labelKey = null; labelGlSync\(\);/);
});
