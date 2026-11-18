// No label shows before a fresh load's first framing has settled, and none ever shows twice (F24, iPhone, 17 Nov 2026: a faded "Right hepatic
// vein 4.6" over RIGHT ATRIUM and a solid one at the left for seconds while the first fit moved the figure). The labels fade in once, at their spot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('labels wait for the first fit to settle, then show once', { timeout: 320000 }, () => {
  const out = execFileSync(process.execPath, ['tests/labels-first-fit-run.mjs'], { encoding: 'utf8', maxBuffer: 1 << 24, timeout: 300000 });
  const r = JSON.parse(out.split('\n').find((l) => l.startsWith('FIT')).slice(3));
  assert.ok(r.moved > 20, `the camera moved in the first frames (last at ${r.moved})`);
  assert.ok(r.first > r.moved, `no label before the camera rested: first at ${r.first}, camera last moved at ${r.moved}`);
  assert.equal(r.last, 119, 'the labels show once it has');
  assert.deepEqual(r.twice, []);
});
