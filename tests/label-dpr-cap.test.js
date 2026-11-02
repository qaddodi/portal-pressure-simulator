import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The label layer's own canvas never exceeds 2 device px per CSS px; ?labeldpr=0 keeps the full density.
const src = readFileSync(new URL('../src/ui/label-gl.js', import.meta.url), 'utf8');
const m = src.match(/export const LABEL_DPR_MAX = (\d+);\nexport const labelDensity = [^\n]+/);
test('label density is capped at 2x unless labeldpr=0', () => {
  assert.ok(m, 'cap helper present');
  const { labelDensity, LABEL_DPR_MAX } = new Function(`${m[0].replace(/export /g, '')}; return { labelDensity, LABEL_DPR_MAX };`)();
  assert.equal(LABEL_DPR_MAX, 2);
  assert.equal(labelDensity(3), 2);
  assert.equal(labelDensity(2), 2);
  assert.equal(labelDensity(1), 1);
  assert.equal(labelDensity(undefined), 1);
  assert.equal(labelDensity(3, true), 3);
});
test('size() uses the capped density for the canvas', () => {
  assert.match(src, /k = labelDensity\(devicePixelRatio, FULL_DPR\)/);
});
