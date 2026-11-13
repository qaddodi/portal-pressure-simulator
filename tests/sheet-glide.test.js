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
const rest = () => new Promise((r) => setTimeout(r, 40));   // (the landing's done runs in a task between frames: sheet-move.js `land`, rest-pass.js)

test('every part of the sheet carries one value in each frame, from where it was drawn to the target, with no animation made', async () => {
  const el = sheet();
  let done = 0;
  sm.glideSheet(el, 120, { easing: 'cubic-bezier(.2, .8, .2, 1)', duration: 200, done: () => { done++; } });
  assert.equal(el._sheetOff, 120);
  let last = -1;
  let landed = false;
  for (let i = 0; i < 40 && !landed; i++) {
    tick(8);
    const v = y(el.children[0]);
    for (const c of el.children) assert.equal(y(c), v, 'one piece');
    assert.ok(v >= last, 'rises'); last = v;
    const off = sm.sheetOffset(el);
    assert.ok(Math.abs(off - v) < 1.5, `the offset worked out (${off}) is the one drawn (${v})`);
    landed = v === 120;
  }
  assert.equal(done, 0, 'done is not run inside the frame the ease lands in');
  await rest();
  assert.equal(done, 1, 'done once, in a task after it');
  for (const c of el.children) assert.equal(c.style.translate, '0px 120px', 'rests as setSheetOffset writes it');
  assert.equal(sm.sheetOffset(el), 120);
});

test('a stop mid-way holds where the ease stands, nothing writes after it, and a glide back to nothing rests clear', async () => {
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
  for (let i = 0; i < 30 && el.children[0].style.translate !== ''; i++) tick(8);
  await rest();
  assert.ok(done);
  for (const c of el.children) assert.equal(c.style.translate, '', 'no offset left');
  assert.ok(easeArrive(1) === 1);
});

test('a landing that something took the sheet over before it ran never runs', async () => {
  const el = sheet();
  let done = 0;
  sm.glideSheet(el, 60, { duration: 50, done: () => { done++; } });
  for (let i = 0; i < 12 && y(el.children[0]) !== 60; i++) tick(8);
  assert.equal(y(el.children[0]), 60);
  sm.stopSheet(el);   // (a new touch caught it in the gap between the frame and the task)
  await rest();
  assert.equal(done, 0, 'out of date: not run');
});
