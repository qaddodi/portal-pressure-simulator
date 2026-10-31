// R13: a glide begun on another one still moving carries its speed (ease.js carryRate, carried), and a sheet let go of settles at the
// finger's speed (releaseSpeed, settleSlope, settleAt). All pure; the surfaces that use them are pinned by source below.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { easeMove, carryRate, carried, CARRY_MAX, releaseSpeed, settleSlope, settleAt } from '../src/ui/ease.js';
import { lerpVT } from '../src/ui/cam-arc.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const A = { k: 1, x: 0, y: 0 }, B = { k: 2, x: -300, y: -100 };

test('a glide with no speed to carry is the plain one, exactly', () => {
  for (let t = 0; t <= 1; t += 0.05) assert.equal(carried(easeMove(t), t, 0), easeMove(t));
  assert.equal(carryRate(null, A, B, 1000), 0);
  assert.equal(carryRate({ dlogk: 0, x: 0, y: 0 }, A, B, 1000), 0);
});

test('a view already moving toward the target starts its new glide at that speed; one moving away or across starts from rest', () => {
  // (the speed along the path A → B: its tangent at the start, by lerpVT)
  const e = 1e-4, p = lerpVT(A, B, e), toward = { dlogk: Math.log(p.k / A.k) / e / 1000, x: (p.x - A.x) / e / 1000, y: (p.y - A.y) / e / 1000 };   // per ms for a 1000 ms glide at progress 1/s
  assert.ok(Math.abs(carryRate(toward, A, B, 1000) * 1000 - 1) < 1e-3, `a view going along the path at 1 progress per s carries 1 per s, got ${carryRate(toward, A, B, 1000) * 1000}`);
  assert.equal(carryRate({ dlogk: -toward.dlogk, x: -toward.x, y: -toward.y }, A, B, 1000), 0);
  assert.ok(carryRate({ dlogk: 0, x: -(B.y - A.y), y: B.x - A.x }, A, B, 1000) < 1e-12, 'across');
  assert.equal(carryRate(toward, A, A, 1000), 0, 'nowhere to go');
});

test('the carried progress starts with the old speed, ends at rest on 1 and never passes it or goes back', () => {
  const ms = 400, rate = 0.001;   // 1 progress per second
  const c = rate * ms, p = (t) => carried(easeMove(t), t, c);
  const h = 1e-5;
  assert.ok(Math.abs((p(h) - p(0)) / h - c) < 1e-3, 'slope at the start is the carried speed per glide');
  assert.equal(p(1), 1);
  assert.ok(Math.abs((p(1) - p(1 - h)) / h) < 5e-2, 'it arrives slowly');
  let last = -1;
  for (let t = 0; t <= 1; t += 0.001) { const v = p(t); assert.ok(v <= 1 && v >= last - 1e-12, `monotone at ${t}`); last = v; }
  for (let t = 0; t <= 1; t += 0.001) assert.ok(carried(easeMove(t), t, 100) <= 1, 'a very fast one is capped');
  assert.equal(CARRY_MAX, 0.8);
});

test('a finger\'s release speed is read from its last 100 ms, and is 0 if it paused before lifting', () => {
  const trail = [[0, 100], [50, 130], [100, 190], [150, 280]];
  assert.ok(Math.abs(releaseSpeed(trail, 160) - (280 - 130) / 100) < 1e-9, '(130 → 280 over the last 100 ms)');
  assert.equal(releaseSpeed(trail, 400), 0, 'paused');
  assert.equal(releaseSpeed([], 0), 0);
  assert.equal(releaseSpeed([[10, 5]], 12), 0);
  assert.ok(releaseSpeed([[0, 300], [60, 200]], 70) < 0, 'upward');
});

test('a settle starts at the finger\'s speed toward its target, up to the limit, and rests on arriving', () => {
  assert.equal(settleSlope(0, 200, 220), 0);
  assert.equal(settleSlope(-1, 200, 220), 0, 'away from the target');
  assert.equal(settleSlope(-1, -200, 220), 220 / 200, 'toward a target above');
  assert.equal(settleSlope(10, 50, 220), 3, 'capped at the curve\'s own');
  assert.equal(settleSlope(10, 50, 220, 4), 4);
  assert.equal(settleAt(0, 1.5), 0);
  assert.equal(settleAt(1, 1.5), 1);
  const h = 1e-6;
  assert.ok(Math.abs((settleAt(h, 1.5) - settleAt(0, 1.5)) / h - 1.5) < 1e-3);
  for (const m0 of [0, 1, 3]) { let last = -1; for (let k = 0; k <= 1; k += 0.001) { const v = settleAt(k, m0); assert.ok(v <= 1 + 1e-12 && v >= last - 1e-12, `${m0} at ${k}`); last = v; } }
});

test('the camera, the lobule, the sheets and the paging take it', () => {
  const stage = read('src/ui/stage.js'), lz = read('src/ui/lobule-zoom.js'), util = read('src/ui/util.js'), main = read('src/ui/main.js'), card = read('src/ui/card.js'), menu = read('src/ui/menu.js'), dock = read('src/ui/dock.js');
  assert.match(stage, /c0 = carryRate\(v0, from, to, VIEW\.w\) \* ms;/);
  assert.match(stage, /const CARRY = !\/\[\?&\]carry=0\\b\/\.test\(location\.search\);/);
  assert.match(stage, /!drift && vtVel && vtGliding/, 'a plain glide still under way, not a drift or a dead one');
  assert.match(lz, /carryRate\(v0, from, to, Math\.max\(1, el\.clientWidth\)\) \* ms/);
  assert.match(lz, /ease !== 'in'/, 'the lobule\'s lead-in glide keeps its own curve');
  assert.match(util, /liveShift\(panel\)/, 'a sheet caught mid-ease is taken over where it is drawn');
  assert.match(util, /export function sinkTo\(el, px, ms = 220, done, speed = null\)/);
  assert.equal((main.match(/releaseSpeed\(s0\.trail/g) || []).length, 1);
  assert.match(card, /releaseSpeed\(trail, performance\.now\(\)\)/);
  assert.match(menu, /sw\.carry = resting && settle \? shiftX\(resting\) : 0;/);
  assert.match(dock, /sw\.carry = resting && settle \? shiftX\(resting\) : 0;/);
});
