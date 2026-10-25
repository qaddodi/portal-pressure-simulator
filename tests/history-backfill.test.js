// A recording instrument (the beat trace's pressures and EKG strip, the vitals monitor, the Doppler) opens on a steady state with its window
// already full: the model sends the last seconds of that state (worker-core.js, History), ending on the last sample it posted, on the live
// beat and breath, and the instrument takes them in front of what it has recorded (backfill.js). The live samples then follow on.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCore } from '../src/worker-core.js';
import { createBeatClock, ekgRate, ekgSeries } from '../src/ui/ekg.js';
import { olderThan, inFront } from '../src/ui/backfill.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// A core running a patient for a while, collecting what it posts.
async function runCore(preset, ms) {
  const msgs = [];
  const core = createCore((m) => msgs.push(m));
  await core.handle({ type: 'preset', id: preset });
  core.handle({ type: 'run', running: true });
  await wait(ms);
  return { core, msgs, frames: () => msgs.filter((m) => m.type === 'frame'), samples: () => msgs.filter((m) => m.type === 'frame' && m.samples?.t.length).map((m) => m.samples) };
}
async function askHistory(core, msgs, secs, reqId = 7) {
  const before = msgs.length;
  core.handle({ type: 'history', secs, reqId });
  for (let i = 0; i < 200; i++) { const m = msgs.slice(before).find((x) => x.type === 'history' && x.reqId === reqId); if (m) return m; await wait(20); }
  throw new Error('no history');
}

test('the history ends on the last sample posted, one 4 ms sample after another, and the live samples that follow carry on from it', async (t) => {
  const { core, msgs, samples } = await runCore('cirr-decomp', 1200);
  t.after(() => core.dispose());
  core.handle({ type: 'run', running: false });
  await wait(100);
  const last = samples().at(-1), posted = last.t.at(-1);
  const m = await askHistory(core, msgs, 10);
  const h = m.samples;
  assert.ok(h, 'a steady state is lent a past');
  assert.ok(Math.abs(h.t.at(-1) - posted) < 1e-9, `the history ends on the last posted sample (${h.t.at(-1)} against ${posted})`);
  assert.ok(Math.abs(h.t[0] - (posted - 10 + 0.004)) < 0.01 && h.t.length >= 2499 && h.t.length <= 2501, `ten seconds, a sample every 4 ms (${h.t.length})`);
  for (let i = 1; i < h.t.length; i++) assert.ok(Math.abs(h.t[i] - h.t[i - 1] - 0.004) < 1e-9, 'evenly spaced');
  for (const k of ['ph', 'vel', 'pvVel', 'hvVel', 'whvp', 'hvpg', 'CONF', 'RHV', 'RA', 'IVCS', 'VAR', 'SV', 'SMV', 'AO', 'SIN_R']) assert.equal(h[k].length, h.t.length, `${k}: one to a sample`);
  assert.ok(h.ph.every((p) => p >= 0 && p < 1), 'a phase in [0, 1)');
  assert.ok(Object.values(h).every((a) => !Array.isArray(a) || a.every(Number.isFinite)), 'every number is a number');
  assert.equal(m.probe, 'PV_TRUNK', 'for the vessel the Doppler was on');
});

test('the history is the live beat: the same moment of the same beat at the seam, the same heart rate, and pressures where the live ones are', async (t) => {
  const { core, msgs, samples, frames } = await runCore('cirr-decomp', 1500);
  t.after(() => core.dispose());
  const posted = samples().at(-1).t.at(-1), phase = samples().at(-1).ph.at(-1);
  const m = await askHistory(core, msgs, 10);
  const h = m.samples;
  // (The phase at the seam is the live one's at the same sample: a wrap of the beat clock across the seam finds the beat where the live heart has it.)
  assert.ok(Math.abs(h.ph.at(-1) - phase) < 1e-6 || Math.abs(Math.abs(h.ph.at(-1) - phase) - 1) < 1e-6, `phase ${h.ph.at(-1).toFixed(4)} against the live ${phase.toFixed(4)}`);
  const clock = createBeatClock();
  for (let i = 0; i < h.t.length; i++) clock.push(h.t[i], h.ph[i]);
  const hr = frames().at(-1).metrics.hr, rate = ekgRate(clock.times, 8);
  assert.ok(Math.abs(rate - hr) < hr * 0.06, `the history beats at ${rate.toFixed(1)}/min, the live heart at ${hr.toFixed(1)}`);
  // (The live pressures are in the same range as the history's last seconds: the mean of the last two seconds, portal vein and aorta.)
  const tail = (a, n) => a.slice(-n).reduce((x, y) => x + y, 0) / n;
  const live = samples().flatMap((s) => s.CONF), liveAO = samples().flatMap((s) => s.AO);
  assert.ok(live.length > 400 && Math.abs(tail(h.CONF, 500) - tail(live, 400)) < 2, `portal vein ${tail(h.CONF, 500).toFixed(1)} against the live ${tail(live, 400).toFixed(1)} mmHg`);
  assert.ok(Math.abs(tail(h.AO, 500) - tail(liveAO, 400)) < 8, `aorta ${tail(h.AO, 500).toFixed(1)} against the live ${tail(liveAO, 400).toFixed(1)} mmHg`);
  assert.ok(posted > 0);
});

test('live samples after the history make no second beat and lose none at the seam, and the strip window is full from the left edge', async (t) => {
  const { core, msgs, samples } = await runCore('healthy', 1000);
  t.after(() => core.dispose());
  const m = await askHistory(core, msgs, 6);
  const h = m.samples, seam = h.t.at(-1);
  await wait(900);   // (the model runs on, as it does while the card comes in)
  // Everything the instrument would have by now: the history, then the live samples after it, as ingest keeps them.
  const all = { t: h.t.slice(), ph: h.ph.slice() };
  for (const s of samples()) for (let i = 0; i < s.t.length; i++) if (s.t[i] > seam) { all.t.push(s.t[i]); all.ph.push(s.ph[i]); }
  assert.ok(all.t.length > h.t.length + 20, 'live samples followed on');
  for (let i = 1; i < all.t.length; i++) assert.ok(all.t[i] > all.t[i - 1], 'in time order across the seam');
  const clock = createBeatClock();
  for (let i = 0; i < all.t.length; i++) clock.push(all.t[i], all.ph[i]);
  const gaps = clock.times.slice(1).map((x, k) => x - clock.times[k]), mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  assert.ok(gaps.length >= 5, 'beats found');
  assert.ok(gaps.every((g) => Math.abs(g - mean) < mean * 0.2), `every beat about ${mean.toFixed(2)} s long, across the seam too (${gaps.map((g) => g.toFixed(2)).join(', ')})`);
  // The strip over the window ending now: it starts at the left edge (a beat borrowed before the first wrap) and holds a QRS to every beat.
  const x1 = all.t.at(-1), x0 = x1 - 6, e = ekgSeries(clock.times, x0, x1, mean);
  assert.ok(e.x[0] <= x0 + 0.05, `the strip starts at the window's left edge (${(e.x[0] - x0).toFixed(3)} s in)`);
  const qrs = e.v.filter((v, i) => v > 0.9 && (i === 0 || e.v[i - 1] <= v) && (i === e.v.length - 1 || e.v[i + 1] < v)).length;
  assert.ok(Math.abs(qrs - 6 / mean) < 1.6, `${qrs} QRS in 6 s of ${(60 / mean).toFixed(0)}/min`);
});

test('a state that is still changing, or a newer ask, is not lent a past', async (t) => {
  const { core, msgs } = await runCore('healthy', 400);
  t.after(() => core.dispose());
  // A morph under way (the presenter easing to a slide): nothing steady to lend.
  const snap = core.engine().snapshot();
  core.handle({ type: 'morph', snap, ms: 1500 });
  const early = await askHistory(core, msgs, 6, 21);
  assert.equal(early.samples, null, 'not while the model is easing');
  await wait(1700);
  // Two asks in a row: the first is answered empty, the second made.
  const before = msgs.length;
  core.handle({ type: 'history', secs: 6, reqId: 31 });
  core.handle({ type: 'history', secs: 6, reqId: 32 });
  for (let i = 0; i < 200 && !msgs.slice(before).some((m) => m.type === 'history' && m.reqId === 32); i++) await wait(20);
  const got = Object.fromEntries(msgs.slice(before).filter((m) => m.type === 'history').map((m) => [m.reqId, m]));
  assert.equal(got[31].samples, null, 'the older ask is answered empty');
  assert.ok(got[32].samples?.t.length > 1400, 'the newer one is made');
  // A new state while one is being made cancels it.
  core.handle({ type: 'history', secs: 10, reqId: 41 });
  core.handle({ type: 'restore', snap: core.engine().snapshot() });
  for (let i = 0; i < 100 && !msgs.some((m) => m.type === 'history' && m.reqId === 41); i++) await wait(20);
  assert.equal(msgs.find((m) => m.type === 'history' && m.reqId === 41).samples, null, 'a restored state cancels the history of the old one');
});

test('the history goes in front of what an instrument has recorded, and what it has recorded stays', () => {
  const hs = { t: [1, 2, 3, 4, 5], ph: [0.1, 0.2, 0.3, 0.4, 0.5], CONF: [10, 11, 12, 13, 14] };
  const own = { t: [4, 5, 6], ph: [0.4, 0.5, 0.6], CONF: [90, 91, 92], RA: [1, 2, 3] };
  assert.equal(olderThan(hs, 4), 3, 'three of the history come before the instrument\'s first sample');
  assert.equal(olderThan(hs, Infinity), 5, 'all of it for an empty instrument');
  assert.equal(olderThan(hs, 0.5), 0);
  assert.equal(olderThan(null, 4), 0);
  const all = inFront(own, hs, ['t', 'ph', 'CONF', 'RA']);
  assert.deepEqual(all.t, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(all.CONF, [10, 11, 12, 90, 91, 92], 'its own samples are untouched');
  assert.deepEqual(all.RA.slice(0, 3).map(Number.isNaN), [true, true, true], 'a key the history lacks is NaN there');
  assert.deepEqual(own.t, [4, 5, 6], 'the record it came from is left as it was');
  assert.deepEqual(inFront({ t: [], ph: [] }, hs, ['t']).t, [1, 2, 3, 4, 5], 'an empty instrument takes the whole history');
});

test('every recording instrument takes the history, and the presenter lets its instruments go at the landing, not at the end', () => {
  const pt = read('../src/ui/pressure-time.js'), vm = read('../src/ui/vitals-monitor.js'), dop = read('../src/ui/doppler.js');
  const tools = read('../src/ui/presenter-tools.js'), pres = read('../src/ui/presenter.js'), main = read('../src/ui/main.js'), dock = read('../src/ui/dock.js');
  for (const [name, src] of [['pressure-time', pt], ['vitals-monitor', vm], ['doppler', dop]]) {
    assert.match(src, /function backfill\(hs\)/, `${name} takes a history`);
    assert.match(src, /historySecs/, `${name} says how long its window is`);
    assert.match(src, /olderThan/, `${name} puts only the samples before its first in front`);
  }
  assert.match(vm, /raw\.t\.length = raw\.ph\.length = 0; lastT = -Infinity; firstT = Infinity;/, 'the monitor starts a new patient\'s strip from its first sample, not after the old one\'s last');
  assert.match(pt, /resetBuffers\(\);\s+record\(all\);/, 'the chart makes its bins and beats from the history and its own samples together');
  assert.match(dop, /hs\.probe !== probe/, 'a history for another vessel is let go');
  // Cards that keep recording across slides.
  assert.match(tools, /const startOver = RECORDS\.includes\(k\) && \(stateKey !== lastSt \|\| cur !== inst\);/);
  assert.match(tools, /host\.request\('history'/);
  assert.match(tools, /if \(startOver\) \{ if \(held\) primeWait = true; else prime\(inst, k\); \}/, 'a card up while the state lands is filled at the landing');
  assert.match(tools, /ready\(ms\)/);
  // The presenter: released once the state is in (both ways a state lands), and the cards wait for the window, at most 900 ms.
  assert.match(pres, /if \(!later\) ui\?\.tools\.hold\(false\);/);
  assert.match(pres, /if \(!await morphTo\(st, cut\)\) return; shownState = own \? -1 : si; ui\?\.tools\.hold\(false\); \}/);
  assert.match(pres, /await ui\.tools\.ready\(900\)/);
  // Patients: a loaded patient's traces open full.
  assert.match(main, /host\.request\('history', \{ secs: 12 \}\)/);
  assert.match(dock, /function backfillTraces\(hs\) \{ byId\.scope\.backfill\(hs\); byId\.doppler\.backfill\(hs\); \}/);
});
