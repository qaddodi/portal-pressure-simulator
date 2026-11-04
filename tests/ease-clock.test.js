import { stageSource } from './stage-src.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The eases' clock (frame.js easeNow): one time per frame (tests/honest-clock.test.js checks that a long
// frame is not held back). And holdMotion keeps the work that can wait out of a slide's cards fading in.
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location = { search: '', href: 'http://x/', hostname: 'x', pathname: '/' };
let T = 1000;
Object.defineProperty(performance, 'now', { value: () => T, configurable: true, writable: true });
let rafs = [];
globalThis.requestAnimationFrame = (cb) => { rafs.push(cb); return rafs.length; };
const { frame, easeNow, PACED, holdMotion, inMotion, afterMotion } = await import('../src/ui/frame.js');
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

test('one value inside a frame', () => {
  T = 5000; let inside = [];
  frame(() => { inside.push(easeNow()); T += 300; inside.push(easeNow()); });
  const cbs = rafs; rafs = []; cbs.forEach((cb) => cb(5000));
  assert.equal(inside[0], inside[1]);
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

test('the zooms, the lobule crossfades and the cards use it', () => {
  const stage = stageSource(), lz = read('src/ui/lobule-zoom.js'), pz = read('src/ui/presenter.js'), fr = read('src/ui/frame.js');
  assert.match(fr, /export const PACED = true;/);
  assert.match(stage, /const t0 = PACED \? easeNow\(\) : performance\.now\(\);\s*(?:live\.)?(?:live\.)?lobOn = on;/);
  assert.match(stage, /function lobuleStep\(now, end = false\)/);
  assert.match(stage, /const lobulePoke = \(\) => \{ if \((?:live\.)?lobuleOn && (?:live\.)?lz\.isOpen\(\)\) (?:live\.)?platePoke\(\); \};\s*const lobuleRasterSoon = \(\) => afterMotion\(lobulePoke\);/);
  assert.match(lz, /const xfNow = \(now\) => \(PACED \? easeNow\(\) : now\);/);
  assert.doesNotMatch(lz, /xfT0 = now;|surT0 = now;|now - xfT0/);
  assert.match(lz, /\(\(PACED \? easeNow\(\) : now\) - t0\) \/ ms/);
  assert.match(pz, /holdMotion\(D_SURFACE \+ 220\)/);
});
