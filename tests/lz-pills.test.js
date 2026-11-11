// The lobule's label pills read for their frost on the GPU (lz-pills.js, recs B4): boxes from the label and its ::before insets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPills, ringOf } from '../src/ui/lz-pills.js';

test('an inset ring is read in either order the browsers serialise it', () => {
  assert.deepEqual(ringOf('rgb(10, 20, 30) 0px 0px 0px 2px inset'), { w: 2, colour: 'rgb(10, 20, 30)' });
  assert.deepEqual(ringOf('inset 0px 0px 0px 2px rgb(10, 20, 30)'), { w: 2, colour: 'rgb(10, 20, 30)' });
  assert.equal(ringOf('none'), null);
  assert.equal(ringOf('rgb(0, 0, 0) 0px 1px 2px 0px'), null, 'an outer shadow is no ring');
});

test('a pill shows a set gap outside its label, at its fades\' opacity; hidden or faded-out ones are left out', () => {
  const el = (cls, box, ps, hidden = false) => ({ cls, hidden, ps, getBoundingClientRect: () => ({ ...box, right: box.left + box.width, bottom: box.top + box.height }) });
  const lit = el('lz-lab', { left: 110, top: 220, width: 80, height: 30 }, { opacity: '0.5', left: '-5px', top: '-6px', right: '-5px', bottom: '-6px', borderTopLeftRadius: '12px', backgroundColor: 'rgba(1, 2, 3, 0.4)', boxShadow: 'rgb(9, 9, 9) 0px 0px 0px 2px inset' });
  const off = el('lz-lab', { left: 0, top: 0, width: 50, height: 20 }, { opacity: '0' });
  const gone = el('lz-zone', { left: 0, top: 0, width: 50, height: 20 }, { opacity: '1', content: 'none' });
  const hid = el('sv-region', { left: 0, top: 0, width: 50, height: 20 }, { opacity: '1' }, true);
  const root = { querySelectorAll: () => [lit, off, gone, hid] };
  const gcs = (e, p) => (p ? e.ps : { borderLeftWidth: '1px', borderTopWidth: '1px', borderRightWidth: '1px', borderBottomWidth: '1px' });
  const out = readPills(root, { left: 100, top: 200 }, gcs);
  assert.equal(out.length, 1);
  const [p] = out;
  assert.equal(p.el, lit);
  assert.deepEqual([p.x, p.y, p.w, p.h, p.r, p.a], [6, 15, 88, 40, 12, 0.5]);
  assert.equal(p.tint, 'rgba(1, 2, 3, 0.4)');
  assert.deepEqual(p.ring, { w: 2, colour: 'rgb(9, 9, 9)' });
});

test('a colour serialised as color(srgb …) is given to the glass as rgba()', async () => {
  const { rgbaOf } = await import('../src/ui/lz-pills.js');
  assert.equal(rgbaOf('color(srgb 1 0.5 0 / 0.47)'), 'rgba(255, 128, 0, 0.47)');
  assert.equal(rgbaOf('color(srgb 0 0 1)'), 'rgba(0, 0, 255, 1)');
  assert.equal(rgbaOf('rgba(1, 2, 3, 0.4)'), 'rgba(1, 2, 3, 0.4)');
});

test('halving: each step at most halves, and the last lands on the size asked for', () => {
  // (pillDown's loop, as numbers: a 2× screen's 3000 px wide canvas to the copy's 750 px.)
  const steps = (cw, ch, w, h) => { const out = []; while (cw > w * 2 || ch > h * 2) { cw = Math.max(w, Math.ceil(cw / 2)); ch = Math.max(h, Math.ceil(ch / 2)); out.push([cw, ch]); } out.push([w, h]); return out; };
  assert.deepEqual(steps(3000, 1800, 750, 450), [[1500, 900], [750, 450]]);
  assert.deepEqual(steps(1500, 900, 750, 450), [[750, 450]], 'a 1× screen: one draw at exactly half');
  assert.deepEqual(steps(4500, 2700, 750, 450), [[2250, 1350], [1125, 675], [750, 450]]);
});

// (Laptop-heat Q4, 31 Oct: with the frost drawn on the GPU (?lzpills=1), a new copy of the lobule every frame sampled the moving streaks a
// different way each time and the frost shimmered. The copy is kept while only the blood moves; the pills stay on the browser's blur by default.)
test('the pills\' copy is kept while only the blood moves, and taken again for anything else', async () => {
  const { pillHold } = await import('../src/ui/lz-pills.js');
  assert.equal(pillHold('a', 'a', true, false), true, 'the same state, the tissue not painted since: kept');
  assert.equal(pillHold('a', 'b', true, false), false, 'the model, the view, an ease or a fade changed it');
  assert.equal(pillHold('a', 'a', true, true), false, 'the tissue was painted in this frame');
  assert.equal(pillHold('a', 'a', false, false), false, 'no copy yet, or the tissue\'s part is not in');
  assert.equal(pillHold('', '', false, false), false);
});
