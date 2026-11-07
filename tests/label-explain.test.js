import test from 'node:test';
import assert from 'node:assert/strict';
import { hitLabel, explainText, createExplain, DIM_ALPHA } from '../src/ui/label-explain.js';

const items = [
  { key: 'n:CONF', x: 100, y: 100, w: 80, h: 30, a: 1 },
  { key: 'n:SV', x: 150, y: 110, w: 80, h: 30, a: 1 },
  { key: 'n:RA', x: 400, y: 100, w: 60, h: 30, a: 0.1 },
  { key: 'o:Liver', x: 300, y: 300, w: 60, h: 20, a: 1 },
];
test('hitLabel lands on the drawn label under the tap', () => {
  assert.equal(hitLabel(items, 110, 110)?.key, 'n:CONF');
  assert.equal(hitLabel(items, 1000, 1000), null);
});
test('hitLabel takes the nearest centre where two overlap, and a finger\'s slop', () => {
  assert.equal(hitLabel(items, 200, 125)?.key, 'n:SV');
  assert.equal(hitLabel(items, 96, 96)?.key, 'n:CONF');
  assert.equal(hitLabel(items, 96, 96, 0), null);
});
test('hitLabel ignores a label that is almost faded out, and what keep refuses', () => {
  assert.equal(hitLabel(items, 420, 115), null);
  assert.equal(hitLabel(items, 310, 310, 6, (k) => k.startsWith('n:')), null);
  assert.equal(hitLabel(items, 310, 310)?.key, 'o:Liver');
});
test('explainText joins name, value and flow, and leaves out what is missing', () => {
  assert.equal(explainText({ name: 'Portal vein', value: 22.43, flow: 1.09 }), 'Portal vein · 22.4 mmHg · 1.1 L/min');
  assert.equal(explainText({ name: 'RA', value: 3, flow: 0.01 }), 'RA · 3.0 mmHg');
  assert.equal(explainText({ name: 'SMV', value: NaN }), 'SMV');
});
test('createExplain toggles, switches and clears, calling back only on a change', () => {
  const seen = [];
  const e = createExplain((k) => seen.push(k));
  assert.equal(e.state('n:A'), '');
  assert.equal(e.tap('n:A'), 'n:A');
  assert.equal(e.state('n:A'), 'on'); assert.equal(e.state('n:B'), 'dim');
  assert.equal(e.tap('n:B'), 'n:B');
  assert.equal(e.tap('n:B'), null);   // (a second tap clears)
  e.clear(); e.clear();               // (nothing explained: no call)
  e.tap('n:C'); e.clear();
  assert.deepEqual(seen, ['n:A', 'n:B', null, 'n:C', null]);
  assert.equal(DIM_ALPHA, 0.35);
});
