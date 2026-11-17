// F46 (play-test 17 Nov 2026): with the vessel's card (a strip) and the Tests sheet both open, the figure keeps a band of at least about 200 px, on an iPad held upright and on a phone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { testsHalfPx, figureBand, BAND, STRIP, MIN_HALF } from '../src/ui/stack-plan.js';

// [name, app height, top bar's foot (--top-safe), tab row's room (--nb-occ), Tests' Half with no card above: the phone's fixed 520 px, a tablet's 45 % of the height]
const DEVICES = [['iPad portrait 768 x 1024', 1024, 112, 84, 0.45 * 1024], ['iPhone 375 x 812', 812, 100, 76, 520], ['iPhone SE 320 x 568', 568, 84, 70, 520], ['iPad mini 744 x 1133', 1133, 112, 84, 0.45 * 1133]];

test('both cards open: the figure keeps a band of about 200 px (768 x 1024 and 375 x 812)', () => {
  for (const [name, H, top, nb, wanted] of DEVICES) {
    const room = H - top - nb - 22, half = testsHalfPx(room, wanted, true), band = figureBand(room, half);
    assert.ok(half <= wanted, `${name}: Tests never grows for the strip`);
    if (H >= 800) assert.ok(band >= BAND - 1, `${name}: the band is ${Math.round(band)} px`);
    else assert.ok(half >= MIN_HALF && band >= 0, `${name}: a short phone keeps Tests usable (${Math.round(half)} px), band ${Math.round(band)} px`);
  }
});

test('with no vessel card nothing changes: Tests keeps its own Half', () => {
  for (const [, H, top, nb, wanted] of DEVICES) assert.equal(testsHalfPx(H - top - nb - 22, wanted, false), wanted);
  assert.equal(testsHalfPx(0, 500, true), 500, 'no room read yet: left alone');
});

test('the strip is the card\'s whole height: its rule and the plan agree', () => {
  assert.equal(STRIP, 56);
});
