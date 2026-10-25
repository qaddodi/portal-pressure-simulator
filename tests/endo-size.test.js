// The scope draws a large varix (5 mm or more, Large) plainly large and bulging, and every varix under 5 mm exactly as before:
// engorgement (d − 2) / 10 (Mohammad, 17 Oct: a 5.5 mm "Large" varix was drawn a third of the way up and looked thin).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { endoGrow, LARGE_MM } from '../src/ui/endo-size.js';
import { varixGrade } from '../src/engine/metrics.js';

const old = (d) => Math.min(1, Math.max(0, (d - 2) / 10));

test('a varix under 5 mm is drawn exactly as before', () => {
  for (let d = -1; d < 4.95; d += 0.001) {
    if (varixGrade(d).label === 'Large') continue;
    assert.equal(endoGrow(d), old(d), `d ${d}`);
  }
  assert.equal(endoGrow(4.9), old(4.9));
});

test('a large varix is drawn plainly large, growing to full at 12 mm', () => {
  assert.equal(LARGE_MM, 5);
  assert.ok(endoGrow(5) >= 0.5, 'as engorged as a 7 mm varix on the old scale');
  assert.equal(endoGrow(12), 1);
  assert.equal(endoGrow(20), 1);
  let prev = endoGrow(5);
  for (let d = 5; d <= 13; d += 0.01) { const g = endoGrow(d); assert.ok(g >= prev - 1e-12 && g <= 1); prev = g; }
  // The drawing switches where the grade does, so the picture and the "Large" label always agree.
  for (let d = 4.9; d < 5.1; d += 0.001) assert.equal(endoGrow(d) >= 0.5, varixGrade(d).label !== 'Small', `d ${d}`);
});

test('the scope takes its engorgement from endoGrow', () => {
  const src = readFileSync(new URL('../src/ui/instruments.js', import.meta.url), 'utf8');
  assert.match(src, /const gNow = endoGrow\(mv\.d\);/);
});
