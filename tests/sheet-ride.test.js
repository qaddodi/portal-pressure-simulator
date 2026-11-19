// A menu sheet's entrance and exit written by the frames (sheet-ride.js, 16 Nov 2026, iPhone: the Patients menu's search row floated over the figure
// with no card behind it while the sheet rose): the inline translate is written in the frame the glass reads it in, from the sheet's own height
// (and its --edge-y, and the dock's 8 px) to rest, an exit goes on from wherever the entrance had got to, a finger takes the sheet from there, and
// Reduce Motion only fades.
import { test } from 'node:test';
import assert from 'node:assert/strict';

let T = 1000, q = [];
globalThis.requestAnimationFrame = (f) => { q.push(f); return q.length; };
globalThis.cancelAnimationFrame = () => {};
performance.now = () => T;
const props = new Map();
globalThis.getComputedStyle = () => ({ getPropertyValue: (n) => props.get(n) || '' });
const ride = await import('../src/ui/sheet-ride.js');
const tick = (ms) => { T += ms; const f = q; q = []; f.forEach((x) => x(T)); };
const sheet = (h = 400) => {
  const st = {};
  return { offsetHeight: h, style: Object.assign(st, { removeProperty(n) { delete st[n]; } }) };
};
const y = (el) => parseFloat(String(el.style.translate).split(' ')[1]);
const run = (el, n = 60) => { for (let i = 0; i < n; i++) tick(8); };

test('a sheet comes up from its own height to rest, one value in each frame, and its inline translate is taken off at the end', () => {
  props.clear();
  const el = sheet(400);
  ride.rideIn(el, false);
  assert.equal(y(el), 400, 'written at once, where it starts: not a frame of it at rest first');
  assert.ok(ride.riding(el));
  let last = 400;
  for (let i = 0; i < 40 && ride.riding(el); i++) { tick(8); if (el.style.translate !== undefined) { const v = y(el); assert.ok(v <= last + 1e-9, 'it only rises'); last = v; } }
  run(el, 10);
  assert.equal(el.style.translate, undefined, 'at rest nothing is left inline');
  assert.ok(!ride.riding(el));
});

test("the stylesheet's own --edge-y and the dock's 8 px are in its start", () => {
  props.clear(); props.set('--edge-y', 'calc(100% + 8px)');
  const a = sheet(300); ride.rideIn(a, false);
  assert.equal(y(a), 308);
  props.clear();
  const b = sheet(300); ride.rideIn(b, false, 240, 8);
  assert.equal(y(b), 308, 'a menu sheet over the dock starts 8 px further down');
});

test('an exit goes on from where the entrance had got to, and ends below the sheet', () => {
  props.clear();
  const el = sheet(400);
  ride.rideIn(el, false);
  for (let i = 0; i < 5; i++) tick(8);
  const mid = y(el);
  assert.ok(mid > 0 && mid < 400, `part way (${mid})`);
  ride.rideOut(el, false);
  assert.equal(y(el), mid, 'it carries on from where it stands, never a jump to rest');
  run(el);
  assert.equal(y(el), 400, 'it ends a whole height down');
  assert.equal(q.length, 0, 'no frame is asked for after it has landed');
});

test('a finger takes a riding sheet from where it is; a sheet that is not riding is left alone', () => {
  props.clear();
  const el = sheet(400);
  ride.rideIn(el, false);
  for (let i = 0; i < 4; i++) tick(8);
  const here = y(el);
  assert.ok(Math.abs(ride.rideStop(el) - here) < 0.01, 'it says where the sheet stood');
  assert.equal(el.style.translate, undefined, 'its inline translate is off, the finger owns it now');
  run(el, 10);
  assert.equal(el.style.translate, undefined, 'and nothing writes it again');
  const other = sheet(400); other.style.translate = '0px 12px';
  assert.equal(ride.rideStop(other), 0);
  assert.equal(other.style.translate, '0px 12px', 'a sheet that was not riding keeps its own style');
});

test('with Reduce Motion the sheet only fades, in and out, and never moves', async () => {
  props.clear();
  const el = sheet(400);
  ride.rideIn(el, true);
  assert.equal(el.style.opacity, '0.000');
  assert.equal(el.style.translate, undefined);
  run(el, 40);
  await Promise.resolve();
  assert.equal(el.style.opacity, undefined, 'at rest nothing is left inline');
  ride.rideOut(el, true);
  assert.equal(el.style.opacity, '1.000');
  run(el, 40);
  assert.equal(el.style.opacity, '0.000');
  assert.equal(el.style.translate, undefined);
});

test('an entrance that ends after an exit has begun does not take the exit away', async () => {
  props.clear();
  const el = sheet(400);
  ride.rideIn(el, true);
  tick(8);
  ride.rideOut(el, true);
  await Promise.resolve(); await Promise.resolve();
  assert.notEqual(el.style.opacity, undefined, "the old entrance's end leaves the exit's opacity alone");
});
