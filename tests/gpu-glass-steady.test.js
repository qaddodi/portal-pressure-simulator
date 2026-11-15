// The frosted glass drawn in the figure's canvas holds steady (1 Nov 2026, "Move the whole figure onto the GPU"): the causes of the iPhone's
// sheet, card, callout and (since gone) lobule pill flicker found by watching the glass frame by frame in a browser, each pinned here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sheetPanes } from '../src/ui/sheet-glass.js';
import { parseColour } from '../src/ui/glass-gl.js';

const box = (l, t, w, h) => ({ left: l, top: t, width: w, height: h, right: l + w, bottom: t + h });

test('a colour mixed by color-mix() (the cards\' tint), as the canvas gives it back, is read as that colour, not as none', () => {
  assert.deepEqual(parseColour('color(srgb 1 0.5 0.25 / 0.58)'), [1, 0.5, 0.25, 0.58]);
  assert.deepEqual(parseColour('color(srgb 0.1 0.2 0.3)'), [0.1, 0.2, 0.3, 1]);
  assert.deepEqual(parseColour('color(srgb 0.1 0.2 0.3 / 50%)'), [0.1, 0.2, 0.3, 0.5]);
  assert.deepEqual(parseColour('rgba(255, 0, 0, 0.5)'), [1, 0, 0, 0.5]);
  assert.deepEqual(parseColour('#00ff00'), [0, 1, 0, 1]);
  assert.deepEqual(parseColour('color(display-p3 1 0 0)'), [0, 0, 0, 0]);
});

test('the sheet\'s tint comes from its CSS custom property, which the GPU\'s mark ([data-gl]) leaves alone', () => {
  // (Their computed background is none while the GPU draws their glass: read from there, the next look found no tint and gave the glass
  // back to the browser's, then found it again, every other frame.)
  const pe = (o) => ({ content: '""', display: 'block', visibility: 'visible', opacity: '1', left: '0px', top: '0px', right: '0px', bottom: '0px', borderTopLeftRadius: '18px', borderTopRightRadius: '18px', borderBottomRightRadius: '18px', borderBottomLeftRadius: '18px', backgroundColor: 'rgba(0, 0, 0, 0)', getPropertyValue: (k) => (k === '--gl-tint' ? 'rgba(250, 250, 250, 0.58)' : ''), ...o });
  const el = { classList: { contains: (c) => c === 'pz-sheet' }, closest: () => ({}), getBoundingClientRect: () => box(10, 100, 300, 200), ps: { '::before': pe({ bottom: '40px' }), '::after': pe({ top: '120px' }) } };
  const gcs = (e, p) => (p ? e.ps[p] : { borderLeftWidth: '0px', borderTopWidth: '0px', borderRightWidth: '0px', borderBottomWidth: '0px', getPropertyValue: () => '0' });
  for (const pane of sheetPanes(el, gcs)) assert.equal(pane.tint, 'rgba(250, 250, 250, 0.58)');
});


