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

// ── The lobule's records (push A): read from the source
import { readFileSync } from 'node:fs';
const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
test('the lobule keeps its view and its pan, dive and card cameras as scene-cam records', () => {
  assert.match(lz, /const V = cams\.lobule\.base = \{ k: 1, x: 0, y: 0 \};/);
  for (const gone of ['zK', 'zE', 'zF', 'diveK', 'diveE', 'diveF', 'panDX', 'panDY', 'zoomCam']) assert.doesNotMatch(lz, new RegExp(`\\b${gone}\\b`), gone);
  assert.match(lz, /camThen\(VIEWC, CARD, camThen\(VIEWC, DIVE, PAN\)\)/);
});
test('each record has its own writer: zoomAt writes only the card, setDive only the dive, zoomEnd never the dive or the base', () => {
  const body = (head) => { const i = lz.indexOf(head); assert.ok(i >= 0, head); return lz.slice(i, lz.indexOf('\n    },', i)); };
  const zoomAt = body('    zoomAt(S, px, py, dx, dy) {'), zoomEnd = body('    zoomEnd() {');
  assert.match(zoomAt, /camAbout\(CARD, S, snap\.w \/ 2, snap\.h \/ 2\)/, 'the lobule scales about the stage middle (4 Nov)');
  assert.doesNotMatch(zoomAt, /\b(DIVE|PAN)\b|\bV\.[kxy] =/);
  assert.doesNotMatch(zoomEnd, /\b(DIVE|PAN)\b|\bV\.[kxy] =/);
  assert.match(lz, /const setDive = [^\n]*camSet\(DIVE, k, e, f\)/);
});

test('a card zoom scales the scene about the card with no move, so the stage is always covered and cover never clamps (5 Nov)', () => {
  const out = [0, 0];
  for (let i = 0; i < 200; i++) {
    const w = 400 + rnd() * 1200, h = 300 + rnd() * 800, left = rnd() * 50, top = rnd() * 50;
    const ox = left + rnd() * w, oy = top + rnd() * h, S = 1 + rnd() * 1.2;
    sceneCam.set(S, ox, oy, 0, 0);
    const tx = sceneCam.tx(left), ty = sceneCam.ty(top);
    sceneCam.cover(out, left, top, w, h);
    close(out[0], tx); close(out[1], ty);
  }
  sceneCam.off();
});
test('card-zoom.js asks for no figure camera: the cards zoom, the figure holds still (5 Nov)', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/ui/card-zoom.js', import.meta.url), 'utf8');
  assert.match(src, /cam: false \}/);
  assert.match(src, /sceneCam\.aim = null;/);
  assert.doesNotMatch(src, /camera\?\.open\(\)/);
});
