import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createReversible, createStepClock, easeMove, settleAt, reducedMs, REDUCED_MOVE_MS, FIRST_FRAMES, FIRST_STEP_MAX, D_FLIP } from '../src/ui/motion.js';

// One curve and one reversible clock (animation recommendations 5, 6, 13, 19, and the view change of 22).
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/** Run the clock with steps of `dt` ms for `ms` ms of time, calling each(t, x, v) after every step. */
function run(c, dt, ms, each) {
  const n = Math.round(ms / dt);
  for (let i = 1; i <= n; i++) { c.step(dt); each?.(i * dt, c.x, c.v); }
}

test('a run takes its time: the progress reaches 1 in ms (plus the landing), rises steadily and stops at rest', () => {
  const c = createReversible({ ms: 1000 });
  c.aim(1);
  let prev = 0, doneAt = null;
  run(c, 1, 1200, (t, x, v) => {
    assert.ok(x >= prev - 1e-12 && x <= 1, 'monotone, never past the target');
    prev = x;
    if (doneAt === null && x === 1) doneAt = t;
  });
  assert.ok(doneAt >= 1000 && doneAt <= 1060, `landed at ${doneAt} ms (the 1000 ms run and a 60 ms landing)`);
  assert.equal(c.x, 1); assert.equal(c.v, 0); assert.equal(c.moving, false);
  // Without the landing it arrives at its rate, in exactly its time.
  const raw = createReversible({ ms: 1000, land: false });
  raw.aim(1); run(raw, 1, 999); assert.ok(raw.x < 1); run(raw, 1, 2); assert.equal(raw.x, 1);
});

test('a move from rest starts at its full rate at once (the shape gives the soft start), and the way back runs the other way', () => {
  const c = createReversible({ ms: 1000 });
  c.aim(1); c.step(10);
  assert.ok(Math.abs(c.x - 0.01) < 1e-12 && Math.abs(c.v - 0.001) < 1e-12);
  const d = createReversible({ ms: 2000, x: 1 });
  d.aim(0); d.step(10);
  assert.ok(Math.abs(d.x - (1 - 0.005)) < 1e-12 && d.v < 0);
});

test('a reversal slews the velocity over D_FLIP: no velocity step bigger than the slew allows, position continuous', () => {
  const ms = 1300, rate = 1 / ms, slew = (2 * rate) / D_FLIP;
  for (const dt of [1, 4, 16.7, 33]) {
    const c = createReversible({ ms });
    c.aim(1);
    while (c.x < 0.5) c.step(dt);
    c.aim(0);   // tapped back at the middle of the change
    let prevX = c.x, prevV = c.v, flipEnd = null, maxStep = 0, maxJump = 0, peak = c.x;
    for (let i = 0; i < 4000 && c.moving; i++) {
      c.step(dt);
      if (flipEnd === null) maxStep = Math.max(maxStep, Math.abs(c.v - prevV) / dt);   // (the turn itself; the landing brakes a little harder, below)
      maxJump = Math.max(maxJump, Math.abs(c.x - prevX) / dt);
      if (flipEnd === null && c.v <= -rate + 1e-12) flipEnd = (i + 1) * dt;
      peak = Math.max(peak, c.x);
      prevX = c.x; prevV = c.v;
    }
    assert.ok(maxStep <= slew * (1 + 1e-6), `dt ${dt}: velocity changed by ${maxStep} per ms, the slew allows ${slew}`);
    assert.ok(maxJump <= rate * (1 + 1e-9), 'the position never moves faster than the rate');
    assert.ok(flipEnd >= D_FLIP - dt - 1e-9 && flipEnd <= D_FLIP + dt + 1e-9, `the turn took ${flipEnd} ms`);
    assert.ok(peak - 0.5 > 0.2 * rate * D_FLIP / 4 && peak - 0.5 < 1.2 * rate * D_FLIP / 4 + dt * rate, `it ran on ${peak - 0.5} past the tap, about rate * flip / 4 = ${rate * D_FLIP / 4}`);
    assert.equal(c.x, 0); assert.equal(c.v, 0);
  }
});

test('the old clock flipped in one frame; this one, tapped back at full speed, has the velocity at zero half way through the turn', () => {
  const c = createReversible({ ms: 1000 });
  c.aim(1); run(c, 1, 400);
  c.aim(0);
  let zeroAt = null;
  for (let i = 1; i <= 200; i++) { c.step(1); if (zeroAt === null && c.v <= 0) zeroAt = i; }
  assert.ok(Math.abs(zeroAt - D_FLIP / 2) <= 1, `standstill ${zeroAt} ms after the tap`);
});

test('a shaped value (easeMove of the clock) stays smooth through a reversal: its speed has no jump', () => {
  const c = createReversible({ ms: 1300 });
  c.aim(1);
  let prevP = easeMove(c.x), prevS = null, maxJump = 0, t = 0;
  for (let i = 0; i < 4000 && (c.moving || t < 10); i++) {
    t += 4; c.step(4);
    if (Math.abs(t - 560) < 2) c.aim(0);
    const p = easeMove(c.x), s = (p - prevP) / 4;
    if (prevS !== null) maxJump = Math.max(maxJump, Math.abs(s - prevS));
    prevP = p; prevS = s;
  }
  // (The shaped speed falls by about 9e-5 a frame while the clock slows; a flip in one frame would change it by twice its value, about 2.8e-3.)
  assert.ok(maxJump < 1.5e-4, `the shaped speed changed by at most ${maxJump} a 4 ms frame (a flip in one frame: about 0.0028)`);
  assert.equal(c.x, 0);
});

test('the landing is settleAt\'s Hermite: a constant braking from the rate to rest, exactly on the target', () => {
  const ms = 1000, rate = 1 / ms;
  const c = createReversible({ ms });
  c.aim(1);
  const vs = [];
  run(c, 1, 1100, (_t, _x, v) => vs.push(v));
  // The speed falls linearly to 0 over the last 60 ms (a constant deceleration, settleAt(k, 2)).
  const last = vs.findIndex((v) => v < rate - 1e-12);
  assert.ok(last > 0);
  const tail = vs.slice(last - 1, vs.findIndex((v, i) => i > last && v === 0) + 1);
  assert.ok(tail.length >= 55 && tail.length <= 66, `${tail.length} ms of braking`);
  for (let i = 1; i < tail.length; i++) assert.ok(tail[i] <= tail[i - 1] + 1e-15, 'never speeds up while landing');
  const drops = tail.slice(1).map((v, i) => tail[i] - v);
  const mid = drops.slice(3, -3);
  assert.ok(Math.max(...mid) - Math.min(...mid) < 1e-9, 'the same deceleration all the way');
  assert.equal(c.x, 1);
  // settleAt itself: the Hermite with starting slope 2 is 1 - (1 - k)^2.
  for (const k of [0, 0.25, 0.5, 0.9, 1]) assert.ok(Math.abs(settleAt(k, 2) - (1 - (1 - k) ** 2)) < 1e-12);
});

test('a target moved while braking, or beyond a bound, turns round from where it is', () => {
  const c = createReversible({ ms: 1000 });
  c.aim(1); run(c, 1, 985);   // in its landing
  const x0 = c.x; assert.ok(x0 > 0.97 && x0 < 1);
  c.aim(0);
  let prev = c.v, maxStep = 0;
  for (let i = 0; i < 3000 && c.moving; i++) { c.step(1); maxStep = Math.max(maxStep, Math.abs(c.v - prev)); prev = c.v; assert.ok(c.x >= 0 && c.x <= 1); }
  assert.equal(c.x, 0); assert.ok(maxStep <= (2 / 1000 / D_FLIP) * 1.01 + 1e-12, 'the velocity moved by the slew only');
});

test('a long run of random taps keeps the progress inside its bounds and its speed inside the rate, and always lands', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const c = createReversible({ ms: 900 });
  for (let i = 0; i < 6000; i++) {
    if (rnd() < 0.02) c.aim(rnd() < 0.5 ? 0 : 1, rnd() < 0.1 ? 500 + rnd() * 1500 : undefined);
    c.step(1 + rnd() * 60);
    assert.ok(c.x >= 0 && c.x <= 1 && Number.isFinite(c.v) && Math.abs(c.v) <= 1 / 500 + 1e-12, `step ${i}: x ${c.x} v ${c.v}`);
  }
  c.aim(1);
  for (let i = 0; i < 400 && c.moving; i++) c.step(16);
  assert.equal(c.x, 1); assert.equal(c.v, 0);
});

test('the clock rule: the first frame draws the start, the next two advance at most 40 ms each, then the true wall clock', () => {
  assert.equal(FIRST_FRAMES, 2); assert.equal(FIRST_STEP_MAX, 40);
  const s = createStepClock();
  s.start();
  assert.deepEqual([s.dt(1000), s.dt(1100), s.dt(1200), s.dt(1300), s.dt(1316)], [0, 40, 40, 100, 16]);
  s.start();
  assert.deepEqual([s.dt(5000), s.dt(5016), s.dt(5032), s.dt(5400)], [0, 16, 16, 368], 'short frames are the wall clock as well');
  // The same rule inside the reversible clock.
  const c = createReversible({ ms: 1000 });
  c.aim(1);
  const xs = [c.tick(0), c.tick(100), c.tick(200), c.tick(300), c.tick(316)];
  assert.deepEqual(xs.map((x) => +x.toFixed(4)), [0, 0.04, 0.08, 0.18, 0.196]);
  // A move already under way does not get the cap again when it turns round.
  c.aim(0);
  const x = c.x; c.tick(1000);
  assert.ok(Math.abs(c.x - x) > 0.1 || c.x === 0, 'the long frame is the wall clock');
});

test('sync, set, stop and aim', () => {
  const c = createReversible({ ms: 1000 });
  c.aim(1); c.step(100);
  c.sync(c.x);                       // nothing else wrote: unchanged
  assert.ok(c.v > 0 && !c.rest);
  c.sync(0.8);                       // something else wrote the position: restart from rest there, target kept
  assert.equal(c.x, 0.8); assert.equal(c.v, 0); assert.equal(c.to, 1); assert.ok(c.rest);
  c.step(10); assert.ok(Math.abs(c.v - 0.001) < 1e-12, 'a restart goes at the full rate again');
  c.aim(1); assert.equal(c.to, 1);   // the same target: nothing changes
  c.stop(); assert.equal(c.moving, false); assert.equal(c.v, 0); assert.equal(c.to, c.x);
  c.set(0.3); assert.equal(c.x, 0.3); assert.equal(c.to, 0.3);
  assert.equal(c.step(50), 0.3, 'landed: stays');
  c.aim(0.3, 2000); assert.equal(c.ms, 2000);
});

test('a leg may have its own time: the speed slews to the new rate like any other change', () => {
  const c = createReversible({ ms: 2200 });
  c.aim(1, 2200); run(c, 1, 600);
  const v1 = c.v;
  c.aim(0, 1300);
  let prev = c.v, maxStep = 0;
  while (c.moving) { c.step(1); maxStep = Math.max(maxStep, Math.abs(c.v - prev)); prev = c.v; }
  assert.ok(v1 > 0 && maxStep <= (2 / 1300 / D_FLIP) * 1.3);
});

test('the curve: easeMove starts and ends at rest, is symmetric, peaks at 1.875 times the mean speed and has no catch in the middle', () => {
  assert.equal(easeMove(0), 0); assert.equal(easeMove(1), 1);
  const d = (t, h = 1e-6) => (easeMove(t + h) - easeMove(t - h)) / (2 * h);
  assert.ok(Math.abs(d(1e-4)) < 1e-6 && Math.abs(d(1 - 1e-4)) < 1e-6, 'speed 0 at both ends');
  assert.ok(Math.abs(d(0.5) - 1.875) < 1e-6, 'peak speed');
  let peak = 0; for (let i = 1; i < 1000; i++) peak = Math.max(peak, d(i / 1000, 1e-5));
  assert.ok(Math.abs(peak - 1.875) < 1e-4);
  for (const t of [0.1, 0.3, 0.45]) assert.ok(Math.abs(easeMove(t) + easeMove(1 - t) - 1) < 1e-12);
  // Acceleration is continuous through the middle (the quadratic in-out it replaces jumped from +4 to -4 there).
  const acc = (t) => (easeMove(t + 1e-3) - 2 * easeMove(t) + easeMove(t - 1e-3)) / 1e-6;
  assert.ok(Math.abs(acc(0.5 - 1e-3) - acc(0.5 + 1e-3)) < 0.1, 'no jump in acceleration at 0.5');
  const old = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const oacc = (t) => (old(t + 1e-3) - 2 * old(t) + old(t - 1e-3)) / 1e-6;
  assert.ok(Math.abs(oacc(0.5 - 2e-3) - oacc(0.5 + 2e-3)) > 7, 'the old curve did');
  // The change between the views now runs on it.
  assert.match(read('src/ui/stage-frame.js'), /const easeInOut = easeMove;/);
  assert.match(read('src/ui/stage-frame.js'), /import \{[^}]*\beaseMove\b[^}]*\} from '\.\/motion\.js'/);
});

test('the rise out of the lobule: settleAt with a starting slope of 0.5, at rest on landing, never speeding up as it lands', () => {
  const rise = (u) => 1 - settleAt(1 - u, 0.5);   // (u: the dive's progress, 1 at the lobule down to 0 at the anatomy)
  assert.equal(rise(1), 1); assert.equal(rise(0), 0);
  const slope = (u) => (rise(u + 1e-6) - rise(u - 1e-6)) / 2e-6;
  assert.ok(Math.abs(slope(1 - 1e-5) - 0.5) < 1e-3, 'it moves on the first frame, at half the mean speed');
  assert.ok(Math.abs(slope(1e-5)) < 1e-3, 'at rest at the end');
  let peak = 0, mono = true, prev = 1;
  for (let i = 0; i <= 1000; i++) { const u = 1 - i / 1000, p = rise(u); if (p > prev + 1e-12) mono = false; prev = p; peak = Math.max(peak, slope(Math.min(1 - 1e-6, Math.max(1e-6, u)))); }
  assert.ok(mono, 'monotone');
  // The first frame of the old curve u * u * (2 - u) was at 75 % of its peak (1 against 4/3); this one is at a third of its own.
  assert.ok(0.5 / peak < 0.4 && 1 / (4 / 3) > 0.7);
  const dive = read('src/ui/stage-dive.js');
  assert.match(dive, /const p = live\.riseFast \? 1 - settleAt\(1 - u, RISE_SLOPE\) : /);
  assert.match(dive, /const RISE_SLOPE = 0\.5;/);
});

test('Reduce Motion: the change between the views takes the camera\'s short form, 300 ms, and the exception is written down', () => {
  assert.equal(REDUCED_MOVE_MS, 300);
  assert.equal(reducedMs(1300, true), 300); assert.equal(reducedMs(200, true), 200); assert.equal(reducedMs(1300, false), 1300);
  // The clock at that rate: 300 ms of move, a turn still takes D_FLIP.
  const c = createReversible({ ms: reducedMs(1300, true) });
  c.aim(1); let t = 0; while (c.moving) { c.step(1); t++; }
  assert.ok(t >= 300 && t <= 330, `${t} ms`);
  const stage = read('src/ui/stage.js');
  assert.match(stage, /const viewMs = \(\) => \(reduceMotion\.matches \? REDUCED_MOVE_MS : VIEW_CHANGE_S \* 1000\);/);
  assert.match(stage, /viewClock\.aim\(morphTarget, viewMs\(\)\);\s*morph = viewClock\.tick\(now\);/);
  const motion = read('src/ui/motion.js'), acc = read('docs/ACCESSIBILITY.md');
  assert.match(motion, /camera glide[^]*REDUCED_MOVE_MS \(300 ms\)[^]*never jumps/, 'motion.js states the camera-glide exception');
  assert.match(acc, /camera's glide[^|]*runs 300 ms/);
  assert.match(acc, /Anatomy and Circuit runs 300 ms/);
});

test('the view change, the turn, the dive and the sinusoid all run on a reversible clock, and the dead PACED switch is gone', () => {
  const stage = read('src/ui/stage.js'), lz = read('src/ui/lobule-zoom.js');
  assert.match(stage, /viewClock\.sync\(morph\);/);
  assert.match(stage, /rotU = turnClock\.tick\(now\);/);
  assert.doesNotMatch(stage, /Math\.sign\(morphTarget - morph\)|Math\.sign\(rotTarget - rotU\)/, 'neither integrates the sign any more');
  assert.match(stage, /diveClock\.aim\(to, ms\)/);
  assert.match(lz, /sinClock\.sync\(sinU\); sinClock\.aim\(to, ms\);/);
  assert.doesNotMatch(lz, /sinU = lerp\(from, to, t\)/);
  for (const f of ['src/ui/frame.js', 'src/ui/stage.js', 'src/ui/stage-dive.js', 'src/ui/lobule-zoom.js', 'src/ui/presenter.js', 'src/ui/stage-vessels.js']) assert.doesNotMatch(read(f), /\bPACED\b/, f);
  assert.match(read('docs/deck-behavior-vision.md'), /first two frames of any move advance it by at most 40 ms each/);
});
