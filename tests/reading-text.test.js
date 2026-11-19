import { test } from 'node:test';
import assert from 'node:assert/strict';
import { padDigits } from '../src/ui/reading-text.js';
import { badgeOff, badgeOn, DELTA_MIN } from '../src/ui/change-badge.js';

test('a station ticking from 9.9 to 10.0 keeps its label key, so no re-measure and no new label search', () => {
  const html = (v) => `<span class="lb-name">Sinusoids</span><b class="lb-val">${v}</b>`;
  assert.equal(padDigits(html('9.9')), padDigits(html('10.0')));
  assert.equal(padDigits(html('9.5')), padDigits(html('10.4')));
  assert.notEqual(padDigits(html('99.9')), padDigits(html('100.0')), 'a third digit is a wider box and does change it');
  assert.notEqual(padDigits(html('9.9')), padDigits(html('9.9 mmHg')), 'words still count');
});

test('digits elsewhere in a label are zeros, as before', () => {
  assert.equal(padDigits('Zone 3 +12 mmHg'), 'Zone 00 +00 mmHg');
  assert.equal(padDigits(''), '');
});

test('the figure\'s labels and the lobule\'s stations show a change badge by one rule', () => {
  assert.equal(DELTA_MIN, 5);
  assert.deepEqual([badgeOn(false), badgeOff(false)], [5, 4]);
  assert.deepEqual([badgeOn(true), badgeOff(true)], [1, 0.7]);
});
