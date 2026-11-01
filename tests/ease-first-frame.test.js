import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Two easings that took their start time in a handler but ran on the frame scheduler's own time:
//  - that time is the frame's start, which can be a few ms before the handler's performance.now(), so (now - t0) / ms came out
//    slightly negative; the cubic ease out of util.js sinkTo then drew the first frame the wrong way (about 20% of the travel at the
//    sheet's 220 ms);
//  - the portal split bar (stage.js splitTo) stopped for good when its tile had left the page, leaving it part way while _shTo
//    already held the target, so the same share asked for again returned at once and the bar stayed there.
globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
let asked = null;
globalThis.requestAnimationFrame = (cb) => { asked = cb; return 1; };
globalThis.cancelAnimationFrame = () => { asked = null; };
const { sinkTo, stopSink } = await import('../src/ui/util.js');

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const fakeSheet = (sink) => {
  const v = new Map(sink == null ? [] : [['--sink', `${sink}px`]]);
  return { style: { getPropertyValue: (k) => v.get(k) ?? '', setProperty: (k, x) => v.set(k, x), removeProperty: (k) => v.delete(k) }, sink: () => parseFloat(v.get('--sink')) };
};
// Runs the frame the scheduler asked for, at a time `lead` ms before the easing began.
const frameAt = (t, lead) => { const cb = asked; asked = null; cb(t - lead); };

test('a sheet pulled back or let go does not start its first frame the wrong way', () => {
  for (const [from, to, speed] of [[0, 100, null], [80, 0, null], [0, 100, 0.3], [80, 0, 0.3]]) {
    const el = fakeSheet(from), before = performance.now();
    sinkTo(el, to, 220, undefined, speed);
    frameAt(before, 16);   // (the frame began 16 ms before the handler asked)
    const first = el.sink(), lo = Math.min(from, to), hi = Math.max(from, to);
    assert.ok(first >= lo - 1e-9 && first <= hi + 1e-9, `${from} to ${to} (speed ${speed}): first frame ${first} is outside its travel`);
    assert.ok(Math.abs(first - from) < 1e-9, `${from} to ${to}: the first frame stays where it was, not ${first}`);
    stopSink(el);
  }
});

// splitTo, as stage.js has it, with the surfaces it touches stubbed.
const stage = read('src/ui/stage.js');
const splitSrc = stage.match(/function splitTo\(el, to\) \{([\s\S]*?)\n {2}\}/)[1];
const easeSrc = stage.match(/const easeInOut = \(t\) => [^;]+;/)[0];
function splitRig({ reduce = false } = {}) {
  const shown = [], queued = new Map();
  let id = 0, clock = 0;
  const frame = (cb) => { queued.set(++id, cb); return id; };
  const cancelFrame = (i) => { queued.delete(i); };
  const performance = { now: () => clock };
  const make = new Function('portalSplit', 'splitShow', 'frame', 'cancelFrame', 'matchMedia', 'performance', 'clamp', `${easeSrc}\nreturn function splitTo(el, to) {${splitSrc}\n};`);
  const splitTo = make((s) => ({ rate: s > 0.3 ? 'hi' : 'ok' }), (el, sh) => shown.push(sh), frame, cancelFrame, () => ({ matches: reduce }), performance, (x, a, b) => Math.max(a, Math.min(b, x)));
  // Runs the next scheduled frame at time `at` (the callback's own clock, which may be before the easing began).
  const run = (at) => { const [[i, cb]] = queued; queued.delete(i); cb(at); };
  return { splitTo, shown, queued, at: (t) => { clock = t; }, run };
}

test('the split bar holds still on a frame that began before its start, then lands on its share', () => {
  const r = splitRig(), el = { dataset: {}, isConnected: true };
  r.at(1000); r.splitTo(el, 0.1);
  assert.equal(el._sh, 0.1, 'the first share shows at once');
  r.at(2000); r.splitTo(el, 0.5);
  r.run(1984);   // (16 ms early)
  assert.equal(el._sh, 0.1, 'held at its start, not nudged by an ease run on a negative time');
  r.run(2400);
  assert.ok(el._sh > 0.1 && el._sh < 0.5, 'part way mid-ease');
  r.run(2800);
  assert.equal(el._sh, 0.5);
  assert.equal(r.queued.size, 0, 'nothing is asked for after it has landed');
});

test('a tile that leaves the page mid-ease lands on its share, so asking for the same share again finds it there', () => {
  const r = splitRig(), el = { dataset: {}, isConnected: true };
  r.at(0); r.splitTo(el, 0.1);
  r.at(1000); r.splitTo(el, 0.5);
  r.run(1200);
  assert.ok(el._sh > 0.1 && el._sh < 0.5);
  el.isConnected = false;
  r.run(1300);
  assert.equal(el._sh, 0.5, 'landed, not left part way');
  assert.equal(r.shown.at(-1), 0.5, 'and drawn there');
  assert.equal(r.queued.size, 0, 'no more frames for a tile that is gone');
  el.isConnected = true;   // (back on the page with the same share)
  r.at(5000); r.splitTo(el, 0.5);
  assert.equal(el._sh, 0.5);
  assert.equal(r.shown.at(-1), 0.5, 'the bar shows the share it was asked for');
});

test('the same three easings are clamped at the source', () => {
  assert.match(read('src/ui/util.js'), /const k = clamp\(\(now - t0\) \/ ms, 0, 1\);/);
  assert.match(read('src/ui/main.js'), /const u = Math\.max\(0, Math\.min\(1, \(now - t0\) \/ ms\)\), e = easeIO3\(u\);/);
  assert.match(stage, /const k = clamp\(\(now - t0\) \/ 800, 0, 1\), landed = k >= 1 \|\| !el\.isConnected;/);
});
