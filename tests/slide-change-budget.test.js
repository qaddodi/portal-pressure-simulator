// The stall on slide changes (Mohammad's play-test, 16 Nov 2026: every Present change froze the main thread for 450 to 800 ms, the old view stayed up
// with the card gone, then the camera snapped). A headless profile (software GL, JS time only) found three causes, each kept out by a rule in
// scripts/rules-lint.mjs ("slide change stall"): #app's change marks written as classes, background preparation started in the change's waits, and
// the time-lapse chart calming every trace on every new day. This test runs the one piece of them that is code a node test can reach.
import test from 'node:test';
import assert from 'node:assert/strict';

test('a slide change begins and ends settling(): background work waits out the change, and is let go at its landing', async () => {
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const f = await import(`../src/ui/frame.js?t=change${Math.random()}`);
  assert.equal(f.inChange(), false);
  const end = f.beginChange();
  assert.equal(f.inChange(), true);
  assert.equal(f.settling(), true, 'a change holds background work');
  assert.equal(f.inMotion(), false, "the labels' values and the like still follow the model: only settling() waits for a change");
  end(); end();
  assert.equal(f.inChange(), false, 'ended once, ended for good');
  const e2 = f.beginChange(), e3 = f.beginChange();
  e2();
  assert.equal(f.inChange(), true, 'a newer change keeps the hold when an older one ends');
  e3();
  assert.equal(f.settling(), false);
  const cut = f.beginChange(-1);
  assert.equal(f.inChange(), false, 'a change past its longest is let go (CHANGE_MAX_MS): a lost end never holds the work for good');
  cut();
});
