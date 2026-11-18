// A title stays clearly a title (17 Nov 2026, the tester: at 1440 x 780 the title of TIPS slide 20 fell to 22.4 px over 18 px words, 1.24 times, and read as a bold first line). On a laptop the title
// steps down for the data card's room only as far as TITLE_RATIO times the words, never under the card-type steps' last, and never over 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TITLE_RATIO, WIDE, titleFloorK, pairRise, dkFloorOf } from '../src/ui/card-type.js';

test('the floor keeps the title TITLE_RATIO times the words', () => {
  // (slide 20 at 1440 x 780: the title at tk 1 is about 36 px over 18 px words)
  const k = titleFloorK(36, 18);
  assert.ok(Math.abs(36 * k / 18 - TITLE_RATIO) < 1e-9, `${36 * k / 18}`);
  assert.ok(k > 0.62 && k < 0.8, `${k}: between the card-type steps, so it is one step of its own`);
});

test('never under the last card-type step, never over 1', () => {
  assert.equal(titleFloorK(60, 12), WIDE.tight, 'a very large title steps down to the last step, not lower');
  assert.equal(titleFloorK(20, 18), 1, 'a title already closer to the words than the ratio is left as it is');
  assert.equal(titleFloorK(0, 18), WIDE.tight);
  assert.equal(titleFloorK(36, 0), WIDE.tight);
});

test('every screen size: the stepped title is never under the ratio unless the last step is above it', () => {
  for (const [title, body] of [[36, 18], [52, 20.8], [67, 28], [32, 17], [44, 22]]) {
    const k = titleFloorK(title, body);
    if (k > WIDE.tight) assert.ok(title * k / body >= TITLE_RATIO - 1e-9, `${title}/${body}`);
  }
});

test('the pair rises into its top margin by what it overshoots, no further than the margin less 4 px', () => {
  assert.equal(pairRise(30, 24, 4), 20);
  assert.equal(pairRise(12, 24, 4), 12);
  assert.equal(pairRise(-5, 24, 4), 0);
});

test('the data card\'s blocks step down only while the tiles\' names stay 12 px on the screen', () => {
  assert.equal(dkFloorOf(12), 1, 'names at 12 px cannot step down at all (a step of 0.86 took them to 10.3 px: the tester, 17 Nov 2026)');
  assert.equal(dkFloorOf(0), 1, 'no names: no step');
  assert.ok(Math.abs(dkFloorOf(15) - 0.8) < 1e-9, 'names at 15 px may go to 0.8');
  assert.ok(dkFloorOf(24) >= 0.5 && dkFloorOf(24) < 1);
  for (const L of [12, 12.5, 14, 16, 20, 28]) assert.ok(L * dkFloorOf(L) >= 12 - 1e-9, `${L}`);
});
