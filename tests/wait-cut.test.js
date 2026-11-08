// Push B, item 2: the presenter's waits a newer press can cut (src/ui/wait-cut.js), on a fake clock and a fake frame queue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWaits, POLL_MS } from '../src/ui/wait-cut.js';

// A scheduler by hand: timers run when the clock passes them, frames run when the test says a frame painted.
function rig() {
  let now = 0, id = 0;
  const timers = new Map(), frames = [];
  const later = (fn, ms) => { const k = ++id; timers.set(k, { at: now + ms, fn }); return k; };
  const clear = (k) => { timers.delete(k); };
  const frame = (fn) => { frames.push(fn); return frames.length; };
  const tick = (ms) => {   // advance the clock, running each timer at its time, in order
    const end = now + ms;
    for (;;) {
      let next = null;
      for (const [k, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [k, t];
      if (!next) break;
      timers.delete(next[0]); now = Math.max(now, next[1].at); next[1].fn();
    }
    now = end;
  };
  const paint = () => { const q = frames.splice(0); for (const f of q) f(); };
  return { ...createWaits({ frame, later, clear }), tick, paint, timers, frames, now: () => now };
}
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const flag = (p) => { const o = { done: false }; p.then(() => { o.done = true; }); return o; };

test('waitCut ends at its time when nothing cuts it', async () => {
  const r = rig(), f = flag(r.waitCut(300, () => false));
  r.tick(299); r.paint(); await settle(); assert.equal(f.done, false, 'not before its time');
  r.tick(1); await settle(); assert.equal(f.done, true, 'at its time');
  assert.equal(r.timers.size, 0, 'no timer left behind');
});

test('waitCut ends at the first frame in which cut() holds, long before its time', async () => {
  const r = rig();
  let cut = false;
  const f = flag(r.waitCut(1500, () => cut));
  r.tick(16); r.paint(); await settle(); assert.equal(f.done, false);
  cut = true;
  r.tick(16); await settle(); assert.equal(f.done, false, 'looked at by a frame, not by the clock alone');
  r.paint(); await settle();
  assert.equal(f.done, true, 'cut in the next frame');
  assert.ok(r.now() < 100, 'about two frames in, not 1500 ms');
  assert.equal(r.timers.size, 0, 'its end timer and its poll are cleared');
});

test('waitCut with cut() already true ends at once, and asks cut() first (a Next that came before the wait began)', async () => {
  const r = rig(), f = flag(r.waitCut(1000, () => true));
  await settle(); assert.equal(f.done, true);
  assert.equal(r.timers.size, 0);
  assert.equal(r.frames.length, 0, 'no frame was asked for');
});

test('a hidden tab (no frames): the slow poll sees the cut, and the timer still ends the wait', async () => {
  const r = rig();
  let cut = false;
  const f = flag(r.waitCut(2000, () => cut));
  r.tick(500); await settle(); assert.equal(f.done, false);
  cut = true;
  r.tick(POLL_MS); await settle();
  assert.equal(f.done, true, 'seen within POLL_MS with no frame painted');
  const r2 = rig(), g = flag(r2.waitCut(400, () => false));
  r2.tick(400); await settle(); assert.equal(g.done, true, 'and a wait nobody cuts is held no longer than its time');
});

test('a frame and the poll for the same look do not double up', async () => {
  const r = rig();
  let looks = 0;
  const f = flag(r.waitCut(5000, () => { looks++; return false; }));
  const l0 = looks;
  r.paint(); r.tick(POLL_MS); r.paint(); await settle();
  assert.ok(looks - l0 <= 3, `one look per frame or poll, saw ${looks - l0}`);
  r.tick(5000); await settle(); assert.equal(f.done, true);
  r.paint(); r.tick(1000);   // (frames asked before the end find the wait over and do nothing)
  assert.equal(r.timers.size, 0);
});

test('a cut() that throws ends the wait (the step that asked will see the error itself)', async () => {
  const r = rig(), f = flag(r.waitCut(1000, () => { throw new Error('gone'); }));
  await settle(); assert.equal(f.done, true);
});

test('until(fn, ms) is polled by frame: it ends in the frame fn holds, not up to 40 ms later', async () => {
  const r = rig();
  let ok = false;
  const f = flag(r.until(() => ok, 3000));
  r.tick(10); ok = true; r.paint(); await settle();
  assert.equal(f.done, true, 'the frame after fn became true');
  assert.ok(r.now() <= 16, 'the old 40 ms timer would have answered at 40');
  const g = flag(r.until(() => false, 250));
  r.tick(250); await settle(); assert.equal(g.done, true, 'and gives up at ms as before');
});
