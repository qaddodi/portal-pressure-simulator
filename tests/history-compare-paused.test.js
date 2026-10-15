// Review #22 (timeline.js and compare.js need a DOM to import, so they are read as text). In a browser on the old
// build, paused on a Mac: the newest History row had no buttons, and Compare > Differences had 0 rows (11 now).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const timeline = readFileSync(new URL('../src/ui/timeline.js', import.meta.url), 'utf8');
const compare = readFileSync(new URL('../src/ui/compare.js', import.meta.url), 'utf8');

test('#22 the History card repaints once a new row has its snapshot (its day and buttons)', () => {
  const snap = timeline.slice(timeline.indexOf('async function snapInto'), timeline.indexOf('function truncateFuture'));
  assert.match(snap, /render\(true\);[\s\S]*for \(const fn of listeners\) fn\(\);/);
});

test('#22 Compare fills its table when it is built, not only on the next frame (none come while paused)', () => {
  assert.match(compare, /if \(f\) update\(f, true\);/);
  assert.match(compare, /function update\(f, building = false\) \{[\s\S]{0,80}if \(!tableEl \|\| \(!building && !tableEl\.isConnected\)/);
});
