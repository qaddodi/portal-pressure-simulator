// A popover's or menu's look, and a tooltip, drawn on the GPU (plate-gl.js, tip-gl.js): the layout is script, the look is the stylesheet's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shadowsOf } from '../src/ui/shadow-parse.js';
import { layoutTip, covers } from '../src/ui/tip-layout.js';
import { measure } from '../src/ui/glyph-measure.js';

const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('shadowsOf reads a computed box-shadow: blurred layers, a ring, an inset ring', () => {
  const s = shadowsOf('rgba(46, 22, 34, 0.16) 8.28px 18px 48px 0px, rgba(46, 22, 34, 0.08) 1.84px 4px 12px 0px, rgba(40, 20, 30, 0.1) 0px 0px 0px 1px, rgba(0, 0, 0, 0.2) 0px 0px 0px 1px inset');
  assert.equal(s.length, 4);
  assert.deepEqual([s[0].x, s[0].y, s[0].blur, s[0].spread, s[0].inset], [8.28, 18, 48, 0, false]);
  assert.equal(s[0].c, 'rgba(46, 22, 34, 0.16)');
  assert.deepEqual([s[2].blur, s[2].spread], [0, 1]);
  assert.equal(s[3].inset, true);
  assert.deepEqual(shadowsOf('none'), []);
  assert.equal(shadowsOf('0px 0px 4px 1px'), null, 'a layer with no colour it knows is not drawn');
});

test('layoutTip: as wide as its words up to 300 px, then wrapped to the full width; words on a 1.45 line under 6 px of padding', () => {
  const one = layoutTip('Fit the figure to the view (0)', null, 1440);
  assert.equal(one.lines.length, 1);
  assert.ok(Math.abs(one.w - (measure('Fit the figure to the view (0)', '500 12px Inter') + 30 * 0.06 + 20)) < 0.5);
  assert.ok(Math.abs(one.h - (6 + 12 * 1.45 + 7)) < 1e-9);
  const long = layoutTip('A tooltip with far more words than fit on one line of three hundred pixels, so it wraps to a second line at least.', null, 1440);
  assert.ok(long.lines.length >= 2); assert.equal(long.w, 300);
  assert.ok(long.h > one.h);
  const narrow = layoutTip('Fit the figure to the view (0)', null, 170);
  assert.ok(narrow.w <= 154 + 1e-9 && narrow.lines.length >= 2, 'the window less 16');
  const keyed = layoutTip('Play', 'Space', 1440);
  assert.ok(keyed.key && keyed.key.x > 10 + measure('Play', '500 12px Inter'));
  assert.equal(covers('Zoom in (+)'), true);
  assert.equal(covers('Search (⌥K)'), false, 'a character the atlas lacks leaves the tip to the page');
});
