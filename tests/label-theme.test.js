// L3 P7 (5 Nov 2026): the page's look above the labels' SVGs reaches every label-gl layer from its writers, with no observer on the
// ancestors: themeChanged() for the theme, the palette and the glass; rideChanged() for the stage's ride.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addLabelLayer, themeChanged, rideChanged } from '../src/ui/label-theme.js';
import { applyLookAttrs } from '../src/ui/looks.js';
import { guardBlur } from '../src/ui/blur-guard.js';

const counter = () => { const n = { theme: 0, ride: 0 }; return { n, layer: { theme: () => { n.theme++; }, ride: () => { n.ride++; } } }; };
const fakeRoot = (attrs = []) => {
  const a = new Map(attrs.map((k) => [k, '']));
  return { a, hasAttribute: (k) => a.has(k), getAttribute: (k) => (a.has(k) ? a.get(k) : null), setAttribute: (k, v) => a.set(k, String(v)), removeAttribute: (k) => a.delete(k) };
};

test('every layer hears a theme change and a ride, and a disposed one no longer does', () => {
  const s = counter(), c = counter();
  const offS = addLabelLayer(s.layer), offC = addLabelLayer(c.layer);   // (the stage's and a caption layer's)
  themeChanged();
  assert.deepEqual([s.n, c.n], [{ theme: 1, ride: 0 }, { theme: 1, ride: 0 }]);
  rideChanged();
  assert.deepEqual([s.n, c.n], [{ theme: 1, ride: 1 }, { theme: 1, ride: 1 }]);
  offC();
  themeChanged();
  assert.deepEqual([s.n.theme, c.n.theme], [2, 1]);
  offS();
});

test('a new look tells the layers once, and the same look again does not', () => {
  const s = counter(), off = addLabelLayer(s.layer), root = fakeRoot();
  applyLookAttrs(root, 'dark');
  assert.equal(s.n.theme, 1);
  applyLookAttrs(root, 'dark');
  assert.equal(s.n.theme, 1, 'nothing changed on the page');
  applyLookAttrs(root, 'navy');   // (the palette alone)
  assert.equal(s.n.theme, 2);
  applyLookAttrs(root, null);
  assert.equal(s.n.theme, 3);
  off();
});

test('the automatic no-blur tells the layers when it comes and when it goes, not when it stays', () => {
  const s = counter(), off = addLabelLayer(s.layer), root = fakeRoot();
  guardBlur(root, { low: true, asked: null, keep: false });
  assert.equal(s.n.theme, 1);
  guardBlur(root, { low: true, asked: null, keep: false });
  assert.equal(s.n.theme, 1);
  guardBlur(root, { low: false, asked: null, keep: false });
  assert.equal(s.n.theme, 2);
  off();
});
