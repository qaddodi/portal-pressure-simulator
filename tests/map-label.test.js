// The blood pressure is never printed as its mean alone (Mohammad, 15 Nov: a slide said "the blood pressure is 93, with the MAP in parentheses",
// but 93 is the MAP). A tile value in words has ONE formatter (callout-math.js valueText: a slide's {map}, the handout, the callouts), the blood
// pressure there is written as the bedside does, systolic/diastolic (mean), and a reading that is the mean alone is named as the mean.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { valueText } from '../src/ui/callout-math.js';
import { lineText } from '../src/ui/handout.js';
import { bpText } from '../src/ui/vital-read.js';
import { TILE, numName } from '../src/ui/table-marks.js';

const FP = { map: 92.6, sbp: 119.6, dbp: 78.2 };

test('{map} in a slide\'s words is the bedside blood pressure, mean in parentheses', () => {
  assert.equal(valueText('map', FP), '120/78 (93) mmHg');
  assert.equal(valueText('map', FP, true), '120/78 (93) mmHg', '{map:0} too');
  assert.equal(lineText('His blood pressure is {map}.', FP), 'His blood pressure is 120/78 (93) mmHg.');
  assert.equal(lineText('From {map@a} to {map}.', FP, () => ({ map: 79.4, sbp: 100, dbp: 61 })), 'From 100/61 (79) mmHg to 120/78 (93) mmHg.');
});

test('a mean with no systolic or diastolic is named MAP, never "blood pressure" alone', () => {
  const only = { map: 92.6 };
  assert.equal(valueText('map', only), 'MAP 93 mmHg');
  assert.equal(bpText(NaN, 78, 92.6), 'MAP 93');
  assert.equal(lineText('Pressure {map}', only), 'Pressure MAP 93 mmHg');
});

test('a reading shown as one number takes the mean pressure\'s own name', () => {
  assert.equal(TILE.map.t, 'Blood pressure', 'the tile is the bedside pressure');
  assert.equal(numName('map'), 'Mean arterial pressure');
  assert.equal(numName('map', true), 'MAP');
  assert.equal(numName('hr'), 'Heart rate');
});

test('no deck line or note writes the blood pressure as a bare number with the MAP in brackets', () => {
  const dir = new URL('../src/ui/decks/', import.meta.url);
  const bad = /\b(?:blood pressure|BP)(?: is| was| of| to| at|:)?\s+(?:only |now |about )?\d{2,3}(?:\.\d)?(?: mmHg)?\s*\((?:MAP|mean)/i;
  const found = [];
  for (const f of readdirSync(dir)) readFileSync(new URL(f, dir), 'utf8').split('\n').forEach((l, i) => { if (bad.test(l)) found.push(`${f}:${i + 1}`); });
  assert.deepEqual(found, []);
});

test('a line that says the MAP is in parentheses prints the blood pressure through {map}', () => {
  const dir = new URL('../src/ui/decks/', import.meta.url);
  for (const f of readdirSync(dir)) for (const l of readFileSync(new URL(f, dir), 'utf8').split('\n')) {
    if (/MAP in (?:the )?parenthes/i.test(l)) assert.match(l, /\{map\}/, `${f}: "${l.slice(0, 80)}"`);
  }
});
