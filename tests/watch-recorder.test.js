// The ?watch recorder (src/ui/watch/recorder.js), its history JSON (history.js) and the replay (replay.js), in Node with a fake clock and frame hook.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWatch } from '../src/ui/watch/recorder.js';
import { exportHistory, decodeHistory, packSamples, unpackSamples } from '../src/ui/watch/history.js';
import { replayHistory } from '../src/ui/watch/replay.js';
import { createDot } from '../src/ui/watch/dot.js';

/** A recorder on a clock we move; `frame()` runs one frame (16 ms). */
function rig(sources, extra = {}) {
  let t = 5000, cb = null;
  const w = createWatch({ now: () => t, onFrames: (f) => { cb = f; return () => { cb = null; }; }, rest: (fn) => fn(), sources, ...extra });
  w.start();
  return { w, frame: (n = 1) => { for (let i = 0; i < n; i++) { t += 16; cb && cb(); } }, at: () => t };
}

test('the recorder samples once a frame the scheduler runs, keeps 20 s, and reads nothing when stopped', () => {
  let reads = 0;
  const r = rig({ cam: () => { reads++; return [1, 0, 0]; }, labels: () => [], cards: () => [] });
  r.frame(10);
  assert.equal(r.w.raw().samples.length, 10); assert.equal(reads, 10);
  r.frame(1500);   // (24 s)
  const s = r.w.raw().samples;
  assert.ok(s[s.length - 1].t - s[0].t <= 20100, 'the oldest is dropped');
  r.w.stop(); const n = reads; r.frame(5);
  assert.equal(reads, n, 'a stopped recorder reads nothing');
});

test('an unreadable source is null (unknown), not an empty list; a throwing one does not stop the recorder', () => {
  const r = rig({ cam: () => { throw new Error('no camera'); }, labels: () => null });
  r.frame(3);
  const s = r.w.raw().samples[0];
  assert.equal(s.c, null); assert.equal(s.L, null); assert.equal(s.K, null);
});

test('a label that blinks is found within a second and reported once (the dot is asked once), then again only after the cool-down', () => {
  let a = 1; const seen = [];
  const r = rig({ labels: () => [['n:splenic-vein', 100, 100, 40, 12, a]] }, { onFinding: (f) => seen.push(f) });
  r.frame(20);
  a = 0; r.frame(3); a = 1; r.frame(20);
  r.frame(70);   // (a second of frames: the judge runs)
  assert.equal(seen.length, 1); assert.equal(seen[0].rule, 'flash');
  r.frame(70);
  assert.equal(seen.length, 1, 'the same finding is not said again');
  assert.equal(r.w.findings().length, 1);
});

test('a calm screen leaves no finding', () => {
  const r = rig({ cam: () => [1, 0, 0], labels: () => [['n:a', 100, 100, 40, 12, 1, 100, 100]], cards: () => [['pz-text', 0, 0, 300, 100, 1]] });
  r.frame(300);
  assert.deepEqual(r.w.findings(), []);
});

test('slide camera traces are taken once, when closed, and judged', () => {
  const trace = (t0, end) => ({ t0, end, why: 'slide', plan: { from: { k: 1, x: 0, y: 0 }, to: { k: 1, x: 0, y: 0 }, ms: 0 }, frames: [[0, 1, 0, 0]], held: [], blocked: [], vb: { w: 1, h: 0, cx: 0, cy: 0 } });
  let list = [trace(5100, '')];
  const r = rig({ traces: () => list });
  r.frame(2); r.w.judge();
  assert.equal(r.w.raw().traces.length, 0, 'an open run is not taken');
  list = [trace(5100, 'landed')];
  r.w.judge(); r.w.judge();
  assert.equal(r.w.raw().traces.length, 1, 'a closed run once');
});

test('the history is plain JSON, under its size cap, round-trips, and the Node replay finds what the page did', () => {
  let a = 1;
  const labels = () => { const out = []; for (let i = 0; i < 40; i++) out.push([`n:v${i}`, 100 + i * 7, 100 + i * 3 + (a ? 0 : 1), 40, 12, i === 0 ? a : 1]); return out; };
  const r = rig({ cam: () => [1, 0, 0], labels });
  r.frame(100); a = 0; r.frame(3); a = 1; r.frame(100);
  const h = r.w.history({ seconds: 10, maxBytes: 20000 });
  assert.equal(h.v, 1);
  const text = JSON.stringify(h);
  assert.ok(text.length <= 20000 || h.step === 64, `${text.length} bytes`);
  const back = decodeHistory(JSON.parse(text));
  assert.equal(back.samples.length, h.samples.length);
  assert.ok(back.samples.every((s) => Array.isArray(s.L)), 'every sample is whole again');
  const f = replayHistory(text);
  assert.ok(f.some((x) => x.rule === 'flash' && /n:v0/.test(x.what)), JSON.stringify(f));
  assert.deepEqual(replayHistory(h, { rules: ['stuck-mid'] }), []);
  assert.throws(() => decodeHistory({ v: 9 }), /version/);
});

test('packSamples leaves out what did not change and unpackSamples puts it back, null kept as null', () => {
  const s = [{ t: 0, c: [1, 0, 0], L: [['a', 1, 1, 1, 1, 1]], K: null }, { t: 16, c: [1, 0, 0], L: [['a', 1, 1, 1, 1, 1]], K: null }, { t: 32, c: [2, 0, 0], L: null, K: null }];
  const p = packSamples(s);
  assert.deepEqual(Object.keys(p[1]), ['t']);
  assert.deepEqual(unpackSamples(p), s);
});

test('exportHistory thins the samples to fit the cap and keeps the last', () => {
  const samples = Array.from({ length: 600 }, (_, i) => ({ t: i * 16, c: [1 + i / 1000, i, 0], L: Array.from({ length: 30 }, (_, k) => [`n:${k}`, i + k, k, 40, 12, 1]), K: [] }));
  const h = exportHistory({ samples }, { seconds: 10, maxBytes: 30000 });
  assert.ok(h.step > 1, 'thinned');
  assert.equal(decodeHistory(h).samples.at(-1).t, 599 * 16);
});

test('the dot shows only when a finding arrives, and Copy gives the findings with the history', () => {
  const r = rig({ labels: () => [] });
  const copied = [];
  const doc = fakeDoc();
  const dot = createDot({ doc, watch: r.w, copy: (t) => copied.push(t) });
  assert.equal(dot.el.hidden, true);
  r.w.raw();
  dot.add();
  assert.equal(dot.el.hidden, false);
  assert.match(dot.text(), /Motion findings \(0\)[\s\S]*History \(last 10 s, JSON\)/);
});

/** A document with just enough for the dot. */
function fakeDoc() {
  const el = () => { const e = { children: [], style: {}, hidden: false, textContent: '', listeners: {}, setAttribute() {}, append(...c) { this.children.push(...c); }, remove() {}, addEventListener(n, f) { this.listeners[n] = f; } }; return e; };
  return { createElement: () => el() };
}
