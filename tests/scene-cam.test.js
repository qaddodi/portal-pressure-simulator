import test from 'node:test';
import assert from 'node:assert/strict';
import { camNew, camSet, camId, camAbout, camThen, sceneCam } from '../src/ui/scene-cam.js';
import { composeView } from '../src/ui/label-captions.js';
import { lerpInto } from '../src/ui/cam-arc.js';
import { easeMove, carried } from '../src/ui/ease.js';

let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const rec = () => camSet(camNew(), 0.5 + rnd() * 4, rnd() * 800 - 400, rnd() * 600 - 300);
const close = (a, b, e = 1e-12) => assert.ok(Math.abs(a - b) <= e * Math.max(1, Math.abs(a), Math.abs(b)), `${a} vs ${b}`);

test('camThen: identity on both sides, associative', () => {
  for (let i = 0; i < 200; i++) {
    const a = rec(), b = rec(), c = rec(), id = camId(camNew());
    assert.deepEqual(camThen(camNew(), id, a), a);
    assert.deepEqual(camThen(camNew(), a, id), a);
    const l = camThen(camNew(), camThen(camNew(), a, b), c), r = camThen(camNew(), a, camThen(camNew(), b, c));
    close(l.k, r.k); close(l.x, r.x); close(l.y, r.y);
  }
});
test('camThen(dive, pan) equals composeView', () => {
  for (let i = 0; i < 200; i++) {
    const dive = rec(), dx = rnd() * 50 - 25, dy = rnd() * 50 - 25, pan = camSet(camNew(), 1, dx, dy);
    const c = camThen(camNew(), dive, pan), v = composeView(dx, dy, dive.k, dive.x, dive.y);
    assert.equal(c.k, v[0]); assert.equal(c.x, v[1]); assert.equal(c.y, v[2]);
  }
});
test('camAbout keeps its point fixed', () => {
  const r = camAbout(camNew(), 3.7, 123, 45);
  close(r.k * 123 + r.x, 123); close(r.k * 45 + r.y, 45);
});
test('cover() agrees with camThen for a zoom of s <= 1', () => {
  sceneCam.set(0.8, 300, 200, 17, -9);
  const out = [0, 0]; sceneCam.cover(out, 40, 30, 1200, 800);
  const r = camThen(camNew(), camSet(camNew(), 0.8, sceneCam.tx(40), sceneCam.ty(30)), camId(camNew()));
  close(out[0], r.x); close(out[1], r.y); sceneCam.off();
});
test('lerpInto equals the lobule glide step bit for bit', () => {
  for (let i = 0; i < 200; i++) {
    const from = rec(), to = rnd() < 0.2 ? { ...rec(), k: from.k } : rec(), u = rnd(), ec = carried(easeMove(u), u, rnd() * 0.5);
    const out = lerpInto(from, to, ec, camNew());
    const k = from.k * Math.pow(to.k / from.k, ec), a = (k - from.k) / ((to.k - from.k) || 1);
    assert.equal(out.k, k);
    assert.equal(out.x, from.x + (to.x - from.x) * (to.k === from.k ? ec : a));
    assert.equal(out.y, from.y + (to.y - from.y) * (to.k === from.k ? ec : a));
  }
});
