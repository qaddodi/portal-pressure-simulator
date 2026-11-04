// Push C of the one-camera record (one-camera-record-plan.md): the stage's base and card cameras each have one writer, and the label ride is one matrix.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { camNew, camThen, camSet } from '../src/ui/scene-cam.js';

const dir = new URL('../src/ui/', import.meta.url);
const src = Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => [f, readFileSync(new URL(f, dir), 'utf8')]));
const writers = (re) => Object.entries(src).filter(([, t]) => re.test(t)).map(([f]) => f).sort();

test('cams.stage.base is written only by refreshCTM (stage-camera.js)', () => {
  assert.deepEqual(writers(/camSet\(\s*cams\.stage\.base|camId\(\s*cams\.stage\.base|cams\.stage\.base\.[kxy]\s*=[^=]/), ['stage-camera.js']);
  const t = src['stage-camera.js'], i = t.indexOf('function refreshCTM'), j = t.indexOf('function applyClampFs');
  const body = t.slice(i, j);
  assert.match(body, /camSet\(cams\.stage\.base,/);
  assert.equal(t.split('cams.stage.base').length - 1, 1);
});

test('cams.stage.card is written only in stage-zoom.js: sceneSet sets it, sceneStop clears it', () => {
  assert.deepEqual(writers(/cams\.stage\.card/), ['stage-ride.js', 'stage-zoom.js']);   // (the ride only reads it)
  assert.doesNotMatch(src['stage-ride.js'], /(camSet|camId)\(\s*(K|cams\.stage\.card)/);
  const t = src['stage-zoom.js'];
  const set = t.slice(t.indexOf('function sceneSet'), t.indexOf('function zoomSharp'));
  assert.match(set, /camSet\(CARD, S, tx, ty\)/);
  const stop = t.slice(t.indexOf('function sceneStop'), t.indexOf('function cardZoomAt'));
  assert.match(stop, /camId\(CARD\)/);
  assert.equal((t.match(/camSet\(CARD|camId\(CARD/g) || []).length, 2);
});

test('the ride has one matrix: a card zoom and a glide both draw labels through rideNow', () => {
  const r = src['stage-ride.js'], z = src['stage-zoom.js'];
  assert.match(r, /function rideNow\(\)/);
  assert.match(r, /K = cams\.stage\.card/);
  assert.equal((r.match(/labelRider\.ride\(rideM6\)/g) || []).length, 2, 'the start (identity) and rideNow');
  assert.doesNotMatch(z, /labelRider\.ride\(/);
  assert.match(z, /if \(live\.rideCTM\) rideNow\(\)/);
});

test('the ride matrix: card ∘ (now · laid-out⁻¹) is the glide alone at the identity card and the card alone at an unmoved view', () => {
  const inv = (m) => { const [a, b, c, d, e, f] = m, det = a * d - b * c; return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]; };
  const mul = (n, i) => [n[0] * i[0] + n[2] * i[1], n[1] * i[0] + n[3] * i[1], n[0] * i[2] + n[2] * i[3], n[1] * i[2] + n[3] * i[3], n[0] * i[4] + n[2] * i[5] + n[4], n[1] * i[4] + n[3] * i[5] + n[5]];
  const lay = [1.7, 0.3, -0.3, 1.7, 40, 25], now = [2.1, 0.2, -0.2, 2.1, 10, 90];
  const m = mul(now, inv(lay));
  const card = camSet(camNew(), 1.5, -30, 12);
  const same = mul(lay, inv(lay));
  for (let q = 0; q < 6; q++) assert.ok(Math.abs(same[q] - [1, 0, 0, 1, 0, 0][q]) < 1e-12);
  const full = [card.k * m[0], card.k * m[1], card.k * m[2], card.k * m[3], card.k * m[4] + card.x, card.k * m[5] + card.y];
  const viaThen = camThen(camNew(), card, { k: m[0], x: m[4], y: m[5] });
  assert.ok(Math.abs(viaThen.k - full[0]) < 1e-12 && Math.abs(viaThen.x - full[4]) < 1e-12 && Math.abs(viaThen.y - full[5]) < 1e-12);
});
