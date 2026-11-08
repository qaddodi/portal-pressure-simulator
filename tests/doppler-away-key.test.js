// The Doppler's colour key (S3): which side of the baseline is "away", in two lengths, and the brighter away blue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { awayKey } from '../src/ui/dopplerColor.js';

test('the key says which side is away, and what away means for the vessel', () => {
  assert.deepEqual(awayKey('portal', false), ['below the line: away from the probe; here, hepatofugal', 'below the line: away; here, hepatofugal']);
  assert.equal(awayKey('hepatic', true)[0], 'above the line: away from the probe; here, toward the heart');
  assert.equal(awayKey('artery', false)[0], 'below the line: away from the probe');
  assert.equal(awayKey('nonsense', false)[1], 'below the line: away; here, hepatofugal', 'an unknown kind falls back to the portal key');
});

test('away is the brighter blue and the red wale one cherry red, each a token', () => {
  const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
  assert.match(css, /--dop-away: #5072E0;/);
  assert.match(css, /--red-wale: #E8404A;/);
  assert.doesNotMatch(css, /--endo-red-wale/, 'one token for the figure and the scope');
});
