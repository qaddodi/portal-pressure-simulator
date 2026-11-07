import test from 'node:test';
import assert from 'node:assert/strict';

// The scheduler hands a watcher each frame's timing: its interval, the script time, and every callback's surface, phase and ms
// (recs R5/P4). A fake requestAnimationFrame drives it.
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
let rafs = [];
globalThis.requestAnimationFrame = (cb) => { rafs.push(cb); return rafs.length; };
const { frame, lateFrame, finalFrame, watchFrames, perf } = await import('../src/ui/frame.js');

/** Runs the frame the scheduler asked for, at timestamp `ts`; false if it asked for none. */
function tick(ts) {
  const cbs = rafs; rafs = [];
  cbs.forEach((cb) => cb(ts));
  return cbs.length > 0;
}

test('a watcher gets every callback with its surface and phase, in the order the phases run', () => {
  const seen = [];
  const stop = watchFrames((f) => seen.push(f));
  frame(() => {}, 'figure');
  finalFrame(() => {}, 'glass');
  lateFrame(() => {}, 'labels');
  frame(() => {}, 'blood');
  assert.ok(tick(100));
  stop();
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].parts.map(([tag, phase]) => [tag, phase]), [['figure', 'early'], ['blood', 'early'], ['labels', 'late'], ['glass', 'final']]);
  assert.ok(seen[0].parts.every(([, , ms]) => ms >= 0));
  assert.ok(seen[0].script >= 0);
  assert.equal(seen[0].now, 100);
  assert.equal(seen[0].gap, 0, 'the scheduler had been idle: no frame interval');
});

test('the interval is reported only while the scheduler runs frame after frame', () => {
  const gaps = [];
  const stop = watchFrames((f) => gaps.push(f.gap));
  const again = (n) => { frame(() => { if (n) again(n - 1); }, 'loop'); };
  again(2);
  tick(1000); tick(1016); tick(1033);   // three frames in a row: the last asks for none
  assert.deepEqual(gaps, [0, 16, 17]);
  frame(() => {}, 'later');
  tick(5000);                            // asked for after a stop: not an interval
  stop();
  assert.equal(gaps.at(-1), 0);
});

test('nothing is timed for a watcher that is not there', () => {
  let called = 0;
  const stop = watchFrames(() => called++);
  stop();
  frame(() => {}, 'quiet');
  tick(10);
  assert.equal(called, 0);
});

test('one watcher that throws does not stop the others or the frame', () => {
  const errors = [];
  const orig = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => { try { fn(); } catch (e) { errors.push(e.message); } return 0; };
  try {
    const seen = [];
    const a = watchFrames(() => { throw new Error('bad watcher'); });
    const b = watchFrames((f) => seen.push(f));
    let ran = false;
    frame(() => { ran = true; }, 'x');
    tick(20);
    a(); b();
    assert.ok(ran);
    assert.equal(seen.length, 1);
    assert.deepEqual(errors, ['bad watcher']);
  } finally { globalThis.setTimeout = orig; }
});

test('perf() carries the frame recorder and the input measure', () => {
  const p = perf();
  assert.equal(typeof p.frames.start, 'function');
  assert.equal(typeof p.frames.stop, 'function');
  assert.equal(p.inputToPaint, null, 'no window here: the measure is the browser’s');
  p.frames.start();
  frame(() => {}, 'figure');
  finalFrame(() => {}, 'glass');
  tick(100);
  const r = p.frames.stop();
  assert.equal(r.frames, 1);
  assert.deepEqual(Object.keys(r.byTag).sort(), ['figure', 'glass']);
  assert.equal(r.phases.final.length, 1);
  assert.deepEqual(perf().frames.stop().frames, 1, 'stopping again returns the same recording');
  frame(() => {}, 'after');
  tick(200);
  assert.equal(p.frames.stop().frames, 1, 'nothing is recorded after a stop');
});
