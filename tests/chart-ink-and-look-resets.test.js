// GPU-1 (an emptied readout holds no picture), 19 Nov 2026 whole-app review. (GPU-9's and GPU-13's source shapes are rules: scripts/source-shapes/gpu-memory-19nov.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './dom-shim.js';
import { inked } from '../src/ui/svg-gl.js';

const el = (localName, attrs = {}, kids = []) => {
  const e = { localName, nodeType: 1, getAttribute: (k) => (k in attrs ? attrs[k] : null), firstElementChild: null, nextElementSibling: null };
  let prev = null;
  for (const k of kids) { if (prev) prev.nextElementSibling = k; else e.firstElementChild = k; prev = k; }
  return e;
};

test('a drawing of empty paths has no ink: an emptied readout draws and hands over nothing', () => {
  assert.equal(inked(el('svg', {}, [el('path', { d: '' }), el('path'), el('g', {}, [el('path', { d: '' })])])), false);
  assert.equal(inked(el('svg')), false, 'nothing at all');
});
test('a path with a shape, or a piece that is not a path, has ink, whatever its depth', () => {
  assert.equal(inked(el('svg', {}, [el('path', { d: '' }), el('path', { d: 'M0 0L1 1' })])), true);
  assert.equal(inked(el('svg', {}, [el('g', {}, [el('g', {}, [el('rect')])])])), true);
  assert.equal(inked(el('svg', {}, [el('text')])), true);
  const kept = el('path'); kept._g = { d: 'M0 0L2 2' };   // (a shape held on the piece, as gl-words sets its glyphs)
  assert.equal(inked(el('svg', {}, [kept])), true);
});
