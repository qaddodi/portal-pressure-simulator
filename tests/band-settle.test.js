// A reading's band changes once its number has landed (full app review A1 and PT-6, 15 Nov 2026), and a table rates a gradient at the decimal
// its tile prints (PC-7), so a scale's dot, a table's arrow and a tile never disagree on a reading on a cut-off (PC-16).
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bandStep } from '../src/ui/band-settle.js';
import { atShown, dirAbs, pressDp } from '../src/ui/table-marks.js';
import { hvpgRate, ppgRate } from '../src/engine/portal/pressure-cuts.js';

test('the band waits for its number: the roll ends, then the word cross-fades; Reduce Motion changes all at once', () => {
  assert.equal(bandStep('caution', 'caution', true, false), 'same');
  assert.equal(bandStep('caution', 'danger', true, false), 'wait', 'mid-roll the old band stays');
  assert.equal(bandStep('caution', 'danger', false, false), 'fade', 'landed: colour and a cross-fade of the word');
  assert.equal(bandStep('caution', 'danger', true, true), 'now', 'Reduce Motion: number, colour and word together');
  assert.equal(bandStep(undefined, 'ok', true, false), 'now', 'the first band paints at once');
  assert.equal(bandStep('ok', 'none', true, false), 'now', 'an unmeasured reading clears at once');
});

test('a table prints and rates HVPG, EUS-PPG and PPG at one decimal, as their tiles do; the other pressures in whole mmHg', () => {
  assert.equal(pressDp('hvpg'), 1); assert.equal(pressDp('ppg'), 1); assert.equal(pressDp('eus'), 1); assert.equal(pressDp('pv'), 0);
  assert.equal(atShown('hvpg', 9.64), 9.6, 'an amber 9.6 tile is 9.6 in the table, not a red 10');
  assert.equal(atShown('pv', 9.64), 10);
  assert.equal(dirAbs('hvpg', { hvpg: 9.64 }), 1, 'amber (↑), as the tile');
  assert.equal(dirAbs('hvpg', { hvpg: 9.96 }), 2, '10.0 prints and rates red');
  assert.equal(dirAbs('ppg', { ppg: 11.94 }), 1, 'a PPG of 11.9 is amber');
  // PC-16: an HVPG of 5.0 is normal, amber only past it (pressure-cuts.js); a scale's dot rates it the same way.
  assert.equal(hvpgRate(atShown('hvpg', 5.04)), hvpgRate(5), 'a 5.0 dot is rated as 5.0');
  assert.notEqual(hvpgRate(5), hvpgRate(5.1));
  assert.equal(ppgRate(atShown('ppg', 5.96)), ppgRate(6));
});
