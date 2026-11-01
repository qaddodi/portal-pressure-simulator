import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The eases' clock (frame.js easeNow, 1 Nov 2026: "the cards start popping in instead of smoothing in eased"). An ease timed by the
// wall clock leaps over a long frame; on easeNow it moves on by at most PACE_CAP from one frame to the next, so it carries on from
// where the screen last showed it. And holdMotion keeps the work that can wait out of a slide's cards fading in.
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
let T = 1000;
Object.defineProperty(performance, 'now', { value: () => T, configurable: true, writable: true });
let rafs = [];
globalThis.requestAnimationFrame = (cb) => { rafs.push(cb); return rafs.length; };
const { frame, easeNow, PACE_CAP, PACE_MAX, PACED, holdMotion, inMotion, afterMotion } = await import('../src/ui/frame.js');
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/** One scheduler frame at wall time t, with one callback that records the eases' clock. */
function tick(t) {
  T = t; let seen = null;
  frame(() => { seen = easeNow(); });
  const cbs = rafs; rafs = []; cbs.forEach((cb) => cb(t));
  return seen;
}

test('on by default; follows the wall clock while frames come promptly', () => {
  assert.equal(PACED, true);
  const a = tick(1000), b = tick(1016.7), c = tick(1033.4);
  assert.ok(Math.abs((b - a) - 16.7) < 1e-9 && Math.abs((c - b) - 16.7) < 1e-9);
});

test('a long frame moves it on by PACE_CAP only, and it keeps going from there', () => {
  const a = tick(2000), b = tick(2500), c = tick(2516.7);
  assert.equal(b - a, PACE_CAP);
  assert.ok(Math.abs((c - b) - 16.7) < 1e-9);
});

test('never runs backwards, between frames and across them; one value inside a frame', () => {
  let last = easeNow();
  for (const t of [3000, 3010, 3100, 3400, 3401, 3900]) { T = t; const v = easeNow(); assert.ok(v >= last); last = v; const f = tick(t + 5); assert.ok(f >= last); last = f; }
  T = 5000; let inside = [];
  frame(() => { inside.push(easeNow()); T += 300; inside.push(easeNow()); });
  const cbs = rafs; rafs = []; cbs.forEach((cb) => cb(5000));
  assert.equal(inside[0], inside[1]);
});

test('a device that is slow all along keeps its eases at their own speed: only a sudden long frame is held back', () => {
  // (Frames that ask for the next one, as a zoom's do: their intervals set the cap.)
  let t = 30000, v = [];
  const loop = () => { v.push(easeNow()); frame(loop); };
  frame(loop);
  const run = (gap) => { t += gap; T = t; const cbs = rafs; rafs = []; cbs.forEach((cb) => cb(t)); };
  for (let i = 0; i < 12; i++) run(100);   // (10 frames a second)
  let a = v.at(-1); run(100); assert.ok(Math.abs(v.at(-1) - a - 100) < 1e-9, 'at its own pace');
  a = v.at(-1); run(1000); assert.equal(v.at(-1) - a, 200, 'a long frame: twice the usual interval');
  for (let i = 0; i < 12; i++) run(600);
  a = v.at(-1); run(3000); assert.equal(v.at(-1) - a, PACE_MAX, 'never more than PACE_MAX');
  rafs = [];
});

test('holdMotion: the longest hold wins, and afterMotion runs once it is over', async () => {
  T = 10000; holdMotion(300); holdMotion(100);
  assert.equal(inMotion(), true);
  T = 10299; assert.equal(inMotion(), true);
  T = 10301; assert.equal(inMotion(), false);
  T = 20000; let ran = 0; afterMotion(() => ran++); assert.equal(ran, 1);   // (nothing held: at once)
  holdMotion(50); afterMotion(() => ran++, 5); assert.equal(ran, 1);
  T = 20060; await new Promise((r) => setTimeout(r, 80)); assert.equal(ran, 2);
});

test('the zooms, the lobule crossfades and the cards use it, and ?paced=0 keeps the old clock', () => {
  const stage = read('src/ui/stage.js'), lz = read('src/ui/lobule-zoom.js'), pz = read('src/ui/presenter.js'), fr = read('src/ui/frame.js');
  assert.match(fr, /paced=0/);
  assert.match(stage, /const t0 = PACED \? easeNow\(\) : performance\.now\(\);\s*const step = \(now, end = false\)/);
  assert.match(stage, /afterMotion\(\(\) => \{ if \(lobuleOn && lz\.isOpen\(\)\) platePoke\(\); \}\)/);
  assert.match(lz, /const xfNow = \(now\) => \(PACED \? easeNow\(\) : now\);/);
  assert.doesNotMatch(lz, /xfT0 = now;|surT0 = now;|now - xfT0/);
  assert.match(lz, /\(\(PACED \? easeNow\(\) : now\) - t0\) \/ ms/);
  assert.match(pz, /holdMotion\(D_SURFACE \+ 220\)/);
});
