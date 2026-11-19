// The Memory loop bench's pure parts (src/ui/gallery/benches/memory-loop.js): the leak slope, the verdict against the device envelope, the copied report, and
// the defaults (the HVPG deck's slides 5 and 6, which are the wedge's sinusoid and the result). The DOM half is not run here (no browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS, withOverview } from '../src/ui/decks.js';
import { ENVELOPES } from '../src/ui/gpu-budget.js';
import { leakSlope, verdict, memoryReport, readNow, WARMUP, CYCLE_CHOICES, DEFAULT_CYCLES, DEFAULT_DECK, DEFAULT_FROM, DEFAULT_TO, CLIMB_MB, NEAR_SHARE } from '../src/ui/gallery/benches/memory-loop.js';

const series = (f, n) => Array.from({ length: n }, (_, i) => ({ cycle: i + 1, mb: f(i + 1) }));

test('leakSlope: a line gives its slope, a flat series gives 0, and the first two cycles are ignored', () => {
  assert.ok(Math.abs(leakSlope(series((c) => 100 + 2 * c, 10)) - 2) < 1e-9);
  assert.ok(Math.abs(leakSlope(series(() => 150, 10))) < 1e-9);
  assert.ok(Math.abs(leakSlope(series((c) => 200 - 3 * c, 10)) + 3) < 1e-9);
  // warm-up: cycles 1 and 2 build 80 MB once, then it is flat
  assert.ok(Math.abs(leakSlope(series((c) => (c <= 2 ? 100 + 40 * c : 180), 10))) < 1e-9);
  assert.equal(WARMUP, 2);
});

test('leakSlope: too few cycles after the warm-up, bad numbers, and only the last cycles count', () => {
  assert.equal(leakSlope(series((c) => c, 4)), null, '2 after the warm-up');
  assert.notEqual(leakSlope(series((c) => c, 5)), null, '3 after the warm-up');
  assert.equal(leakSlope([]), null);
  assert.equal(leakSlope(undefined), null);
  assert.equal(leakSlope([{ mb: NaN }, { mb: NaN }, { mb: 1 }, { mb: NaN }, { mb: 2 }]), null);
  // 30 cycles: flat, then a late climb of 5 a cycle over the last 6: the window of 12 sees a slope, the whole series averages less
  const s = series((c) => (c <= 24 ? 100 : 100 + 5 * (c - 24)), 30);
  assert.ok(leakSlope(s, { last: 6 }) > 4.9);
  assert.ok(leakSlope(s) > leakSlope(s, { last: 30 }));
  // without a cycle number the position is the cycle
  assert.ok(Math.abs(leakSlope([{ mb: 0 }, { mb: 0 }, { mb: 10 }, { mb: 12 }, { mb: 14 }]) - 2) < 1e-9);
});

test('verdict: steady, climbing and near the envelope, with the numbers', () => {
  const env = ENVELOPES.phone;
  const steady = verdict(series((c) => 150 + (c % 2) * 0.1, 10), { envelope: env });
  assert.equal(steady.verdict, 'steady'); assert.equal(steady.enough, true);
  assert.ok(Math.abs(steady.slope) < CLIMB_MB);
  assert.match(steady.text, /^steady: 150\.0 MB \(47% of the 320 MB envelope\), .* MB per cycle after the 2 warm-up cycles/);

  const climb = verdict(series((c) => 100 + 4 * c, 10), { envelope: env });
  assert.equal(climb.verdict, 'climbing');
  assert.ok(Math.abs(climb.slope - 4) < 1e-9); assert.equal(climb.mb, 140);
  assert.equal(climb.cyclesLeft, Math.floor((320 - 140) / 4));
  assert.match(climb.text, /^climbing: 140\.0 MB \(44% of the 320 MB envelope\), \+4\.00 MB per cycle .* about 45 cycles/);

  const near = verdict(series(() => 300, 10), { envelope: env });
  assert.equal(near.verdict, 'near the envelope');
  assert.ok(near.share >= NEAR_SHARE);
  const both = verdict(series((c) => 280 + 3 * c, 8), { envelope: env });
  assert.equal(both.verdict, 'near the envelope');
  assert.match(both.text, /and climbing/);
});

test('verdict: the mb given wins, the envelope may be a number, and too few cycles says so', () => {
  assert.equal(verdict(series(() => 100, 10), { mb: 290, envelope: 320 }).verdict, 'near the envelope');
  assert.equal(verdict(series(() => 100, 10), { envelope: 320 }).verdict, 'steady');
  const few = verdict(series(() => 100, 3), { envelope: ENVELOPES.tablet });
  assert.equal(few.verdict, 'steady'); assert.equal(few.enough, false); assert.equal(few.slope, null);
  assert.match(few.text, /no slope yet/);
  const none = verdict([], { envelope: ENVELOPES.desktop });
  assert.equal(none.verdict, 'steady'); assert.equal(none.enough, false);
  // a falling series is steady, not climbing
  assert.equal(verdict(series((c) => 200 - 2 * c, 10), { envelope: ENVELOPES.phone }).verdict, 'steady');
});

test('defaults: 10 cycles of 5, 10, 20 or 50, and the HVPG deck\'s slides 5 and 6 (the wedge\'s sinusoid, then the result)', () => {
  assert.deepEqual([...CYCLE_CHOICES], [5, 10, 20, 50]);
  assert.equal(DEFAULT_CYCLES, 10);
  const d = DECKS.find((x) => x.id === DEFAULT_DECK);
  assert.ok(d, 'the HVPG deck exists');
  const slides = withOverview(d).slides;   // (slide n is index n - 1; the outline is 1)
  assert.equal(slides[DEFAULT_FROM - 1].id, 'wedge-sinusoid');
  assert.equal(slides[DEFAULT_TO - 1].id, 'hvpg');
});

test('the report: a row a cycle, the verdict, and the last-seen lines', () => {
  const rows = series((c) => 100 + 4 * c, 6).map((r) => ({ ...r, peak: 150, own: 2, charts: 1, heap: null, frames: r.cycle * 90, s: r.cycle * 3.2 }));
  const t = memoryReport({ move: 'Test deck, slide 5 to 6 and back', rows, base: { mb: 90, peak: 90, own: 2, charts: 0, heap: 12.5, frames: 0 }, info: { device: 'phone, 320 MB envelope', when: '2026-11-18 10:00', envelope: ENVELOPES.phone }, lastSeen: ['  41s last-seen hvpg slide 6, GPU estimate 301 MB (highest 310) of 320 MB (phone), 40 s after it opened'] });
  const lines = t.split('\n');
  assert.match(lines[0], /^Memory loop: Test deck, slide 5 to 6 and back, phone, 320 MB envelope, 2026-11-18 10:00$/);
  assert.match(lines[1], /cycle\s+MB\s+peak MB\s+contexts\s+heap MB\s+frames/);
  assert.match(lines[2], /^start\s+90\.0\s+90\.0\s+2\+0\s+12\.5\s+0/);
  assert.equal(lines.length, 2 + 1 + 6 + 1 + 1);
  assert.match(lines[3], /^\s+1\s+104\.0\s+150\.0\s+2\+1\s+n\/a\s+90/);
  assert.match(lines.at(-2), /^climbing: /);
  assert.match(lines.at(-1), /^last seen by the page before: 41s last-seen hvpg slide 6/);
  assert.equal(memoryReport({ rows: [] }).split('\n').length, 2);
});

test('readNow reads the counters without a browser: numbers, and a null heap where there is none', () => {
  const r = readNow();
  for (const k of ['own', 'charts', 'frames']) assert.ok(Number.isFinite(r[k]), k);
  assert.ok(r.heap === null || Number.isFinite(r.heap));
  assert.ok('mb' in r && 'peak' in r);
});
