import test from 'node:test';
import assert from 'node:assert/strict';
import { percentile, summarize, createFrameRecorder, summarizeRaw, mergeRaw, topSurfaces, longFrameLine, LONG_FRAME_MS } from '../src/ui/frame-stats.js';

// The numbers the frame-time gate (scripts/frame-gate.mjs) and the ?perf long-frame log are built from.
const frame = (o = {}) => ({ now: 1000, gap: 16.7, script: 4, parts: [['stage', 'early', 3], ['glass', 'final', 1]], ...o });

test('percentile is the nearest rank, as scripts/perf.mjs takes it', () => {
  const v = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(percentile(v, 0.5), 51);
  assert.equal(percentile(v, 0.95), 96);
  assert.equal(percentile(v, 1), 100, 'never past the end');
  assert.equal(percentile([], 0.95), 0, 'an empty list reads as zero');
});

test('summarize gives n, p50, p95, p99, max and mean of an unsorted list', () => {
  const s = summarize([5, 1, 3, 2, 4]);
  assert.deepEqual([s.n, s.p50, s.max, s.mean], [5, 3, 5, 3]);
  assert.deepEqual(summarize([]), { n: 0, p50: 0, p95: 0, p99: 0, max: 0, mean: 0 });
});

test('the recorder keeps intervals, script times, each surface in the frames it ran in, and each phase', () => {
  const r = createFrameRecorder();
  r.add(frame());
  r.add(frame({ gap: 33.3, script: 6, parts: [['stage', 'early', 5], ['stage', 'late', 1]] }));
  r.add(frame({ gap: 0, script: 2, parts: [['glass', 'final', 2]] }));
  const raw = r.raw();
  assert.equal(raw.frames, 3);
  assert.deepEqual(raw.gaps, [16.7, 33.3], 'a frame with no interval (the scheduler had been idle) adds none');
  assert.deepEqual(raw.scripts, [4, 6, 2]);
  assert.deepEqual(raw.byTag.stage, [3, 6], "one entry per frame the surface ran in, its callbacks summed");
  assert.deepEqual(raw.byTag.glass, [1, 2]);
  assert.deepEqual(raw.phases.early, [3, 5, 0]);
  assert.deepEqual(raw.phases.late, [0, 1, 0]);
  assert.deepEqual(raw.phases.final, [1, 0, 2]);
  const s = r.snapshot();
  assert.equal(s.gap.max, 33.3);
  assert.equal(s.surfaces.stage.max, 6);
  assert.equal(s.phases.early.n, 3);
});

test('an interval is dropped only when the page was suspended in it; a long foreground stall is kept (R02)', () => {
  const r = createFrameRecorder();
  r.add(frame({ gap: 2001, suspended: true }));
  r.add(frame({ gap: 2500, script: 1 }));
  r.add(frame({ gap: 1999 }));
  assert.deepEqual(r.raw().gaps, [2500, 1999]);
  assert.equal(r.raw().whole.suspended, 1);
});

test('streaming histograms keep the whole session past the raw ring, and misses count against the cadence (R02)', () => {
  const r = createFrameRecorder({ keepFrames: 100 });
  for (let i = 0; i < 1000; i++) r.add(frame({ now: i * 8.33, gap: 8.33, parts: [] }));
  r.add(frame({ now: 9000, gap: 41.65, parts: [] }));
  const raw = r.raw(), s = r.snapshot();
  assert.ok(raw.gaps.length <= 125, 'the raw lists are a bounded ring');
  assert.equal(s.whole.gap.n, 1001, 'every frame is in the histogram');
  assert.ok(Math.abs(s.whole.gap.p50 - 8.33) / 8.33 < 0.05);
  assert.equal(s.whole.gap.max, 41.65);
  assert.equal(s.whole.misses.misses, 1);
  assert.equal(s.whole.misses.missed, 4);
  const m = summarizeRaw(mergeRaw([raw, raw]));
  assert.equal(m.whole.gap.n, 2002);
});

test('a frame is long past 50 ms of interval or of script, and the log keeps the newest', () => {
  const r = createFrameRecorder({ keepLong: 3 });
  r.add(frame({ gap: LONG_FRAME_MS }));
  assert.equal(r.long.length, 0, 'exactly 50 ms is not long');
  r.add(frame({ now: 2000, gap: 90, script: 30, parts: [['lobule-zoom', 'early', 25], ['stage', 'late', 5]] }));
  r.add(frame({ now: 3000, gap: 16, script: 70, parts: [['presenter', 'early', 70]] }));
  assert.equal(r.long.length, 2);
  const [a, b] = r.long;
  assert.deepEqual(a.top[0], ['lobule-zoom', 'early', 25], 'the biggest callback first');
  assert.equal(a.outside, 60, 'the interval the scheduler does not account for');
  assert.equal(b.outside, 0, 'a frame whose script is the whole of it');
  for (let i = 0; i < 5; i++) r.add(frame({ now: 4000 + i, gap: 80 }));
  assert.equal(r.long.length, 3, 'the oldest drop off');
  assert.equal(r.long.at(-1).at, 4004);
});

test('reset clears the recording and its log', () => {
  const r = createFrameRecorder();
  r.add(frame({ gap: 200 }));
  r.reset();
  assert.equal(r.raw().frames, 0);
  assert.equal(r.long.length, 0);
});

test('recordings merge before they are judged', () => {
  const a = createFrameRecorder(), b = createFrameRecorder();
  a.add(frame({ gap: 10, script: 2, parts: [['x', 'early', 2]] }));
  b.add(frame({ gap: 40, script: 9, parts: [['x', 'early', 9], ['y', 'late', 0]] }));
  const m = mergeRaw([a.raw(), b.raw()]);
  assert.equal(m.frames, 2);
  assert.deepEqual(m.gaps, [10, 40]);
  assert.deepEqual(m.byTag.x, [2, 9]);
  const s = summarizeRaw(m);
  assert.equal(s.script.max, 9);
  assert.deepEqual(topSurfaces(s.surfaces, 1).map(([k]) => k), ['x']);
});

test('a long frame reads as one line to paste', () => {
  const line = longFrameLine({ at: 12400, gap: 84, script: 61, phases: { early: 41, late: 15, final: 5 }, top: [['lobule-zoom', 'early', 41], ['stage', 'late', 15]], outside: 23 }, 400);
  assert.match(line, /^ {2}12\.0 s: 84 ms between frames, script 61 ms \(early 41 \/ late 15 \/ final 5\): lobule-zoom early 41, stage late 15; outside the scheduler 23 ms$/);
  const lone = longFrameLine({ at: 1000, gap: 0, script: 120, phases: { early: 120, late: 0, final: 0 }, top: [['presenter', 'early', 120]], outside: 0 });
  assert.match(lone, /120 ms in one frame, script 120 ms \(early 120\): presenter early 120$/);
});
