// The device lap (?lap, src/ui/lap.js; recs P2, 13 Nov 2026): the route is about 90 seconds, each step is measured from its own two edges and
// the frames recorded between them, and the report names the device, every step, the rest cost at the start against the end, the frames over
// 50 ms with the surfaces that ran in them, what was caught, and the slides shown unprepared. Node: a fake clock and fake frames; the page's
// own driving (setViewKey, the Tests tab, the talk) is the app's and is not run here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFrameRecorder } from '../src/ui/frame-stats.js';

globalThis.location ??= { search: '' };
const lap = await import('../src/ui/lap.js');

const edge = (o = {}) => ({ draw: 0, composite: 0, whole: 0, blur: 0, present: 0, asks: {}, drawn: {}, frames: 0, ...o });

test('the route is about 90 seconds and covers load, the three views, a patient change, Tests, six slides and a rest at each end', () => {
  const route = lap.buildRoute({ loadPreset: async () => {}, presenter: { start: async () => {}, go() {}, stop() {} } }, () => {});
  const secs = route.reduce((a, s) => a + s.hold, 0) / 1000;
  assert.ok(secs >= 75 && secs <= 100, `the route holds ${secs} s`);
  const names = route.map((s) => s.name);
  for (const want of ['rest, start', 'Anatomy to Circuit', 'Circuit to Anatomy', 'Anatomy to Lobule', 'patient change', 'Tests open', 'Tests closed', 'talk: slide 1', 'talk: slide 6', 'rest, end']) assert.ok(names.includes(want), `${want} is on the route`);
  assert.equal(names.filter((n) => n.startsWith('talk: slide')).length, 6, 'six slides of one deck');
  assert.equal(names[0], 'rest, start'); assert.equal(names.at(-1), 'rest, end');
});

test('a step is measured from its two edges and its own frames; a long frame is kept with the surfaces that ran in it', () => {
  const rec = createFrameRecorder({ keepLong: 8 });
  for (let i = 0; i < 100; i++) rec.add({ now: 1000 + i * 16.7, gap: 16.7, script: 3, parts: [['stage', 'early', 2], ['glass', 'final', 1]] });
  rec.add({ now: 3000, gap: 120, script: 90, parts: [['presenter', 'early', 70], ['stage', 'late', 20]] });
  const m = lap.measureStep('slide 2', 0, 5000, edge(), edge({ draw: 50, composite: 100, present: 150, frames: 101, asks: { stage: 101 }, drawn: { stage: 90 } }), rec);
  assert.equal(m.frames, 101); assert.equal(Math.round(m.fps), 20);
  assert.equal(m.composites, 20); assert.equal(m.presents, 30); assert.equal(m.vesselDraws, 10);
  assert.equal(m.long, 1); assert.equal(m.longList[0].top[0][0], 'presenter');
  assert.ok(m.gapMax >= 120 && m.surfaces.includes('stage 101 / 90'), m.surfaces);
});

test('runSteps cuts the recorder per step, writes a failed step down and goes on, holds each step, and stops when told', async () => {
  let t = 0, frames = 0, watcher = null;
  const slept = [];
  const steps = [
    { name: 'a', hold: 1000, run: () => { frames += 10; watcher({ now: t, gap: 16.7, script: 2, parts: [] }); } },
    { name: 'b', hold: 2000, run: () => { throw new Error('no deck'); } },
    { name: 'c', hold: 500, run: async () => { frames += 5; } },
  ];
  const res = await lap.runSteps(steps, {
    sleep: async (ms) => { slept.push(ms); t += ms; }, now: () => t, read: () => edge({ frames }),
    watch: (fn) => { watcher = fn; return () => { watcher = null; }; }, onStep: () => {},
  });
  assert.deepEqual(slept, [1000, 2000, 500]);
  assert.deepEqual(res.map((s) => s.name), ['a', 'b', 'c']);
  assert.equal(res[0].frames, 10); assert.equal(res[1].failed, 'no deck'); assert.equal(res[1].frames, 0); assert.equal(res[2].frames, 5);
  assert.equal(watcher, null, 'the frame watcher is let go');
  // Stopped after the first step.
  const got = [];
  const part = await lap.runSteps(steps.map((s) => ({ ...s, run: undefined })), { sleep: async () => {}, now: () => 0, read: () => edge(), watch: () => () => {}, stopped: () => got.length >= 1, onStep: (n) => got.push(n) });
  assert.equal(part.length, 1);
});

test('a rest step waits its lead before it is measured, so rest pacing (4 s after the last touch) is what is read', async () => {
  let t = 0, frames = 0;
  const reads = [];
  const res = await lap.runSteps([{ name: 'rest, start', lead: 5000, hold: 8000 }], {
    sleep: async (ms) => { t += ms; frames += ms / 10; }, now: () => t, read: () => { reads.push(t); return edge({ frames }); }, watch: () => () => {}, onStep: () => {},
  });
  assert.deepEqual(reads, [5000, 13000], 'counts are read after the lead and after the hold');
  assert.equal(res[0].secs, 8); assert.equal(res[0].frames, 800);
  const route = lap.buildRoute({ loadPreset: async () => {}, presenter: { start: async () => {}, go() {}, stop() {} } }, () => {});
  for (const n of ['rest, start', 'rest, end']) assert.ok(route.find((r) => r.name === n).lead >= 4000, `${n} leads by more than the 4 s before rest pacing`);
});

test('the report names the device, every step, rest against rest, the long frames, what was caught and what was shown unprepared', () => {
  const mk = (name, o) => ({ name, secs: 5, frames: 100, fps: 20, gapP50: 16.7, gapP95: 20, gapMax: 40, scriptP95: 4, long: 0, longList: [], vesselDraws: 5, composites: 2, wholes: 0, blurs: 0, presents: 3, surfaces: '  surfaces (callbacks / draws): stage 40 / 30', ...o });
  const steps = [mk('rest, start', { fps: 30, composites: 25, vesselDraws: 800 }), mk('Anatomy to Circuit', { long: 2, longList: [{ at: 4000, gap: 90, script: 70, phases: { early: 60, late: 10, final: 0 }, top: [['presenter', 'early', 60]], outside: 20 }] }),
    ...Array.from({ length: 6 }, (_, i) => mk(`s${i}`, {})), mk('patient change', { failed: 'the patient took over 15 s' }), mk('rest, end', { fps: 12, composites: 3, vesselDraws: 40 })];
  const text = lap.lapText({
    info: { release: 'v1 · abc12345', preview: 'PREVIEW · abc1234', when: '2026-11-13 15:00 UTC', ua: 'UA', screen: '390x844', dpr: 3, hz: 120, renderer: 'Apple GPU', look: 'renderer gpu, quality 0, theme light', mode: 'mode explore, view anatomic, patient healthy' },
    steps, done: steps.length, wanted: steps.length + 3, secs: 84.2,
    ex: { longFrames: 'Long frames (over 50 ms): 1', inputs: 'Inputs: none', caught: { 'trace-gl:big-layer': { n: 3, last: 'a chart layer went through the shared pool' } }, degraded: { n: 2, last: 'prep-preparing' }, contexts: 'webgl contexts: 4 live', tier: 'Quality tier: Full' },
  });
  for (const want of ['Device lap · v1 · abc12345', 'Apple GPU', 'refresh offered to the page 120 Hz', 'the lap was stopped early', 'rest, start', 'rest, end', 'Rest, start against end', 'compositions/s 25.0 then 3.0',
    'vessel-layer draws/s 800.0 then 40.0', 'Anatomy to Circuit 2', 'Steps that failed: patient change (the patient took over 15 s)', 'trace-gl:big-layer ×3', 'presenter degraded): 2, last "prep-preparing"', 'webgl contexts']) {
    assert.ok(text.includes(want), `report holds "${want}":\n${text}`);
  }
});

test('the frame rate across the route is compared first third against last third, and a fall is said', () => {
  const mk = (name, p95) => ({ name, secs: 5, fps: 50, gapP95: p95 });
  const fell = lap.heatLines([mk('rest, start', 30), ...[16, 16, 16, 20, 25, 33].map((p, i) => mk(`s${i}`, p)), mk('rest, end', 30)]);
  assert.ok(fell.some((l) => /fell by more than a seventh/.test(l)), fell.join('\n'));
  const flat = lap.heatLines([mk('rest, start', 30), ...[16, 16, 16, 16, 16, 16].map((p, i) => mk(`s${i}`, p)), mk('rest, end', 30)]);
  assert.ok(!flat.some((l) => /fell/.test(l)));
});

test('the refresh offered is the fastest median interval, to the nearest rate screens run at', () => {
  assert.equal(lap.refreshFrom([{ gapP50: 8.4 }, { gapP50: 16.7 }, { gapP50: 33 }]), 120);
  assert.equal(lap.refreshFrom([{ gapP50: 16.6 }]), 60);
  assert.equal(lap.refreshFrom([{ gapP50: 0 }]), 0);
});
