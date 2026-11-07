// The phone sheet's ease is written by the frames (sheet-move.js glideSheet on script-glide.js, 3 Nov 2026, cards trailing): every part (the
// plate and the content) carries the same value in each frame, the offset mid-way is the one the glass reads, a stop leaves the end value,
// and it lands on the resting value.
import { test } from 'node:test';
import assert from 'node:assert/strict';

let T = 1000, q = [];
globalThis.requestAnimationFrame = (f) => { q.push(f); return q.length; };
globalThis.cancelAnimationFrame = () => {};
performance.now = () => T;
const sm = await import('../src/ui/sheet-move.js');
const { easeArrive } = await import('../src/ui/ease.js');
const tick = (ms) => { T += ms; const f = q; q = []; f.forEach((x) => x(T)); };
const sheet = () => ({ children: [{ style: {} }, { style: {} }, { style: {} }], _sheetOff: 0 });
const y = (c) => parseFloat(c.style.translate.split(' ')[1]);

test('every part of the sheet carries one value in each frame, from where it was drawn to the target, with no animation made', () => {
  const el = sheet();
  let done = 0;
  sm.glideSheet(el, 120, { easing: 'cubic-bezier(.2, .8, .2, 1)', duration: 200, done: () => { done++; } });
  assert.equal(el._sheetOff, 120);
  let last = -1;
  for (let i = 0; i < 40 && !done; i++) {
    tick(8);
    const v = y(el.children[0]);
    for (const c of el.children) assert.equal(y(c), v, 'one piece');
    assert.ok(v >= last, 'rises'); last = v;
    const off = sm.sheetOffset(el);
    assert.ok(Math.abs(off - v) < 1.5, `the offset worked out (${off}) is the one drawn (${v})`);
  }
  assert.equal(done, 1, 'done once');
  for (const c of el.children) assert.equal(c.style.translate, '0px 120px', 'rests as setSheetOffset writes it');
  assert.equal(sm.sheetOffset(el), 120);
});

test('a stop mid-way holds where the ease stands, nothing writes after it, and a glide back to nothing rests clear', () => {
  const el = sheet();
  sm.glideSheet(el, 90, { duration: 200 });
  tick(40);
  sm.stopSheet(el);
  const held = el.children[0].style.translate;
  assert.ok(y(el.children[0]) > 0 && y(el.children[0]) < 90, 'where it stood');
  tick(300);
  for (const c of el.children) assert.equal(c.style.translate, held, 'nothing still writing');
  let done = false;
  sm.glideSheet(el, 0, { duration: 100, done: () => { done = true; } });
  for (let i = 0; i < 30 && !done; i++) tick(8);
  assert.ok(done);
  for (const c of el.children) assert.equal(c.style.translate, '', 'no offset left');
  assert.ok(easeArrive(1) === 1);
});
