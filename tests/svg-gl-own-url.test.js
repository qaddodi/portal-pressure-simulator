// A chart built again takes its pieces' looks from the one before (shared looks, svg-gl.js keyOf drops a drawing's ids). A look's
// url() fill or stroke still names the old chart's gradient, so the profile chart's patient line, its fill and the block hatch were
// drawn by nothing (Mohammad, 2 Nov 2026: "the chart doesn't look right", only the dashed Healthy line showing). ownPaint takes the id
// from the piece itself, or the nearest ancestor that sets it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './dom-shim.js';
import { ownPaint } from '../src/ui/svg-gl.js';

const el = (localName, attrs = {}, parentNode = null) => ({ localName, nodeType: 1, parentNode, getAttribute: (k) => (k in attrs ? attrs[k] : null) });

test('a url() stroke in a shared look is read from the piece\'s own style', () => {
  const svg = el('svg'), p = el('path', { class: 'ppf-line', style: 'stroke: url(#pzpg-new)' }, svg);
  assert.equal(ownPaint(p, 'stroke', 'url("#pzpg-old")'), 'url(#pzpg-new)');
});
test('a url() fill set as an attribute, or on an ancestor', () => {
  const svg = el('svg'), g = el('g', { fill: 'url(#pzpg-new-h)' }, svg), r = el('rect', { class: 'ppf-blk' }, g);
  assert.equal(ownPaint(r, 'fill', 'url("#pzpg-old-h")'), 'url(#pzpg-new-h)');
  const r2 = el('rect', { fill: 'url(#a)' }, svg);
  assert.equal(ownPaint(r2, 'fill', 'url("#b")'), 'url(#a)');
});
test('plain colours and pieces with no url of their own keep the look', () => {
  const p = el('path', { style: 'stroke: red' }, el('svg'));
  assert.equal(ownPaint(p, 'stroke', 'rgb(1, 2, 3)'), 'rgb(1, 2, 3)');
  assert.equal(ownPaint(p, 'stroke', 'url("#x")'), 'url("#x")');
});
