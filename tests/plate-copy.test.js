import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subpathsIn, foldOpacity } from '../src/ui/plate-copy.js';

// The organs' copy for the GPU sends only the nodules and nutmeg spots that meet the view, and folds a part's fade into
// its one paint; neither may change what the view shows.

test('only subpaths whose box meets the window are kept, control points included', () => {
  const a = 'M10 10Q12 8 14 10Z', b = 'M200 200Q210 190 220 200Z', c = 'M95 50Q130 50 140 60';
  const d = a + b + c;
  assert.equal(subpathsIn(d, [0, 0, 100, 100], 0), a + c);
  assert.equal(subpathsIn(d, [0, 0, 1000, 1000]), d);
  assert.equal(subpathsIn(d, [215, 195, 10, 10], 0), b);
  assert.equal(subpathsIn('', [0, 0, 1, 1]), '');
});

function el(attrs) {
  const m = new Map(Object.entries(attrs));
  return { getAttribute: (k) => (m.has(k) ? m.get(k) : null), setAttribute: (k, v) => m.set(k, String(v)), removeAttribute: (k) => m.delete(k), m };
}

test('a fade folds into the one paint, and an element that fills and strokes keeps its layer', () => {
  const f = el({ fill: 'rgb(1, 2, 3)', 'fill-opacity': '0.5', stroke: 'none', opacity: '0.4' });
  assert.equal(foldOpacity(f), true);
  assert.equal(f.m.get('fill-opacity'), '0.2');
  assert.equal(f.m.has('opacity'), false);
  const s = el({ fill: 'none', stroke: 'red', opacity: '0.5' });
  foldOpacity(s);
  assert.equal(s.m.get('stroke-opacity'), '0.5');
  const both = el({ fill: 'red', stroke: 'blue', opacity: '0.5' });
  assert.equal(foldOpacity(both), false);
  assert.equal(both.m.get('opacity'), '0.5');
});
