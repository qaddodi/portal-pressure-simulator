// A phone sheet's ease is written by the frames (sheet-move.js on script-glide.js, 3 Nov 2026, cards trailing): every part (the plate and the
// content) carries the same inline translate in the same frame, the offset read mid-way is what was last written, and it lands in the exact text.
import { test } from 'node:test';
import assert from 'node:assert/strict';

let T = 1000, q = [];
globalThis.requestAnimationFrame = (f) => { q.push(f); return q.length; };
globalThis.cancelAnimationFrame = () => {};
performance.now = () => T;
const sm = await import('../src/ui/sheet-move.js');
const tick = (ms) => { T += ms; const f = q; q = []; f.forEach((x) => x(T)); };
const sheet = () => ({ children: [{ style: {} }, { style: {} }, { style: {} }], _sheetOff: 0 });

test('every part of a sheet carries one value in each frame, and it lands in the stylesheet\'s own text', async () => {
  const el = sheet(); let done = 0;
  sm.glideSheet(el, 120, { duration: 100, easing: 'linear', done: () => { done++; } });
  assert.equal(done, 0);
  for (let i = 0; i < 6; i++) {
    tick(8);
    const v = el.children.map((c) => c.style.translate);
    assert.ok(v.every((x) => x === v[0]), `one value across the parts: ${v}`);
  }
  const mid = sm.sheetOffset(el);
  assert.ok(mid > 0 && mid < 120, `the offset mid-way is what was written, ${mid}`);
  assert.ok(Math.abs(parseFloat(el.children[0].style.translate.split(' ')[1]) - mid) < 0.01);
  while (el.children[0].style.translate !== '0px 120px') tick(8);
  assert.equal(done, 0, 'done is not run in the frame it lands in: the page is read after it (sheet-move.js land)');
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(done, 1);
  assert.deepEqual(el.children.map((c) => c.style.translate), ['0px 120px', '0px 120px', '0px 120px']);
  assert.equal(sm.sheetOffset(el), 120);
  tick(8); tick(8);
  assert.equal(q.length, 0, 'no frame asked for after it landed');
});

test('an ease back to the sheet\'s place leaves the plain empty translate; a new ease takes over from where the first stands', () => {
  const el = sheet();
  sm.setSheetOffset(el, 90);
  sm.glideSheet(el, 0, { duration: 100, easing: 'linear' });
  for (let i = 0; i < 4; i++) tick(8);
  const mid = sm.sheetOffset(el);
  sm.glideSheet(el, 90, { duration: 100, easing: 'linear' });
  assert.ok(Math.abs(parseFloat(el.children[1].style.translate.split(' ')[1]) - mid) < 0.01, 'it goes on from where it stands');
  sm.stopSheet(el);
  const held = el.children[0].style.translate;
  tick(8);
  assert.equal(el.children[0].style.translate, held, 'a stopped ease writes nothing more');
  sm.glideSheet(el, 0, { duration: 40, easing: 'linear' });
  while (sm.sheetOffset(el) !== 0 || el.children[0].style.translate !== '') tick(8);
  assert.deepEqual(el.children.map((c) => c.style.translate), ['', '', '']);
});
