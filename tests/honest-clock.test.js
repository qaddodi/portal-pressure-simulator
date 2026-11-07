import test from 'node:test';
import assert from 'node:assert/strict';

// One honest transition clock (recs_cgpt R20, 2 Nov 2026): easeNow is the wall clock, one time per frame, never held back; what a
// paced clock would have hidden is counted; a transition begun with beginMotion holds deferrable work until it ends (or overdue).
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
let T = 1000;
Object.defineProperty(performance, 'now', { value: () => T, configurable: true, writable: true });
let rafs = [];
globalThis.requestAnimationFrame = (cb) => { rafs.push(cb); return rafs.length; };
const { frame, easeNow, clockStats, beginMotion, inMotion, PACE_CAP } = await import('../src/ui/frame.js');
function tick(t) { T = t; let seen = null; frame(() => { seen = easeNow(); }); const cbs = rafs; rafs = []; cbs.forEach((cb) => cb(t)); return seen; }

test('on by default: a long frame moves the clock on by its whole length, and the lost time is counted', () => {
  tick(1000); tick(1016.7);
  const a = tick(1033.4), b = tick(1433.4);
  assert.equal(b - a, 400, 'no stretching');
  assert.ok(clockStats.long >= 1);
  assert.ok(clockStats.lostMs >= 400 - PACE_CAP * 2 - 1e-9);
});

test('a transition holds deferrable work until it ends, and one that never ends is let go as overdue', () => {
  T = 5000;
  const end = beginMotion('card', 1000);
  assert.equal(inMotion(), true);
  end();
  assert.equal(inMotion(), false);
  assert.equal(clockStats.lastName, 'card');
  beginMotion('stuck', 100);
  assert.equal(inMotion(), true);
  T = 5200;
  assert.equal(inMotion(), false);
  assert.equal(clockStats.overdue, 1);
});
