// The pressure trace (deck rebuild plan A3): the worker sends the cardiac phase with every sample, ekg.js lays a schematic P-QRS-T over each
// beat, the lane planner gives the EKG strip, the pressures and the HVPG lane their room, and the three bleed decks turn breathing off.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCore } from '../src/worker-core.js';
import { DECKS } from '../src/ui/decks.js';
import { createBeatClock, ekgRate, ekgSeries, ekgAt, EKG_PHASES } from '../src/ui/ekg.js';
import { laneRoom, LANE_MIN } from '../src/ui/trace-lanes.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const pt = read('../src/ui/pressure-time.js');
const css = read('../styles/app.css');

// A stream of (time, phase) samples for a heart at `bpm`, one sample every `dt` seconds.
const stream = (bpm, secs, dt = 0.05) => {
  const out = [];
  for (let i = 0; i * dt <= secs; i++) out.push([i * dt, ((i * dt * bpm) / 60) % 1]);
  return out;
};

test('the worker sends the cardiac phase beside every sample', async () => {
  const frames = [];
  const core = createCore((m) => { if (m.type === 'frame' && m.samples?.t.length) frames.push(m.samples); });
  await core.handle({ type: 'preset', id: 'healthy' });
  core.handle({ type: 'run', running: true });
  for (let i = 0; i < 40 && frames.length < 3; i++) await new Promise((r) => setTimeout(r, 30));
  core.dispose();
  assert.ok(frames.length, 'the model sampled');
  for (const s of frames) {
    assert.equal(s.ph.length, s.t.length, 'one phase to a sample');
    assert.ok(s.ph.every((p) => p >= 0 && p < 1), 'a phase in [0, 1)');
  }
});

test('the beat clock finds each wrap of the phase to a fraction of a sample, and the rate is 60 over the beat period', () => {
  for (const bpm of [48, 72, 96, 140]) {
    const clock = createBeatClock();
    for (const [t, ph] of stream(bpm, 20)) clock.push(t, ph);
    const period = 60 / bpm;
    assert.ok(clock.times.length >= Math.floor(20 / period) - 1, `${bpm} bpm: a beat to each period`);
    for (let k = 1; k < clock.times.length; k++) assert.ok(Math.abs(clock.times[k] - clock.times[k - 1] - period) < 1e-6, `${bpm} bpm: beats ${period.toFixed(3)} s apart`);
    assert.ok(Math.abs(ekgRate(clock.times) - bpm) < 1e-6, `${bpm} bpm: the rate is 60 over the period`);
  }
  assert.equal(ekgRate([]), null);
  assert.equal(ekgRate([1.2]), null, 'one wrap is no rate');
  const c = createBeatClock();
  c.push(0, 0.9); c.push(0.1, 0.1);
  assert.ok(Math.abs(c.times[0] - 0.05) < 1e-9, 'a wrap halfway between two samples is timed halfway');
  c.reset();
  assert.equal(c.times.length, 0);
});

test('the strip puts one QRS on each beat, at the same place in every beat, and the R wave tops the others', () => {
  const clock = createBeatClock();
  for (const [t, ph] of stream(75, 12)) clock.push(t, ph);
  const end = 11.5, { x, v } = ekgSeries(clock.times, 1, end, 0.8);
  const peaks = [];
  for (let i = 1; i < v.length - 1; i++) if (v[i] > 0.8 && v[i] >= v[i - 1] && v[i] > v[i + 1]) peaks.push(x[i]);
  const beats = clock.times.filter((t) => t > 1 && t < end);
  assert.equal(peaks.length, beats.length, 'one R wave to a beat');
  peaks.forEach((p, k) => assert.ok(p > beats[k] && p - beats[k] < 0.1 * 0.8, `the R wave follows the wrap by ${(p - beats[k]).toFixed(3)} s`));
  assert.ok(Math.max(...v) <= 1.0001 && Math.min(...v) > -0.3, 'the lane draws between -0.3 and 1 of the R wave');
  // (The model's ventricles eject from phase 0.04: the QRS is over by then, and the P wave comes ahead of the right atrium's a wave at 0.88.)
  assert.ok(ekgAt(0.02) > 0.95 && Math.abs(ekgAt(0.5)) < 1e-3 && ekgAt(0.84) > 0.1 && ekgAt(0.27) > 0.25);
  assert.ok(EKG_PHASES.every((p, i) => i === 0 || p > EKG_PHASES[i - 1]) && EKG_PHASES[EKG_PHASES.length - 1] < 1);
});

test('the strip stops at the window\'s right edge, borrows the first beat\'s length to reach the left, and draws nothing before a beat', () => {
  const clock = createBeatClock();
  for (const [t, ph] of stream(60, 6)) clock.push(t, ph);
  const s = ekgSeries(clock.times, 2.5, 4.2, 1);
  assert.ok(Math.min(...s.x) >= 2.5 - 0.021 && Math.max(...s.x) <= 4.2, 'inside the window');
  assert.deepEqual(ekgSeries([], 0, 5, 1), { x: [], v: [] });
  const lone = ekgSeries([2], 0, 3, 1);
  assert.ok(lone.x.length > 0 && Math.max(...lone.x) <= 3, 'one wrap and a heart rate are enough for a beat');
});

test('the lane planner: the EKG goes first when the room is short, then the HVPG lane, and the lanes fill the room', () => {
  const o = { ekg: true, gap: 30, egap: 22 };
  const total = (r, g) => r.ekg + r.pressure + r.hvpg + (r.ekg ? 22 : 0) + (r.pressure && r.hvpg ? g : 0);
  for (const avail of [300, 240, 200, 170, 150, 124, 112]) {
    const r = laneRoom(avail, o);
    assert.equal(total(r, 30), avail, `${avail} px: lanes and gaps fill the room`);
    for (const k of ['ekg', 'pressure', 'hvpg']) if (r[k]) assert.ok(r[k] >= LANE_MIN[k], `${avail} px: ${k} ${r[k]} px reads`);
  }
  const big = laneRoom(300, o);
  assert.ok(big.ekg && big.hvpg && big.ekg < big.hvpg && big.hvpg < big.pressure, 'EKG about 15 %, pressure 50 %, HVPG 35 %');
  assert.ok(Math.abs(big.pressure / (big.ekg + big.pressure + big.hvpg) - 0.5) < 0.03);
  assert.equal(laneRoom(150, o).ekg, 0, 'a short card loses the strip first');
  assert.ok(laneRoom(150, o).hvpg > 0, 'and keeps the HVPG lane');
  assert.deepEqual(laneRoom(90, o), { ekg: 0, pressure: 90, hvpg: 0 }, 'a card with room for neither has the pressures');
  assert.deepEqual(laneRoom(200, { pressure: false, hvpg: true }), { ekg: 0, pressure: 0, hvpg: 200 }, 'the HVPG lane alone takes the room');
  assert.deepEqual(laneRoom(200, { hvpg: false }), { ekg: 0, pressure: 200, hvpg: 0 });
  const two = laneRoom(200, { gap: 30, two: 0.66 });
  assert.equal(two.pressure + two.hvpg + 30, 200);
  assert.ok(Math.abs(two.pressure / (two.pressure + two.hvpg) - 0.66) < 0.02, 'two lanes keep the old split');
});

test('a slide\'s card keeps the HVPG lane and shows the portal pressure alone; Patients mode keeps its two lanes and gets two pills', () => {
  assert.doesNotMatch(pt, /slide && avail < 160/, 'the small-card branch that dropped the HVPG lane is gone');
  assert.match(pt, /\(!slide \|\| t\.id === 'CONF'\)/, 'a slide\'s pressure lane has the portal vein alone');
  assert.match(pt, /let showEkg = false, showLane = true;/, 'the EKG is off by default; the HVPG lane stays as it was');
  assert.match(pt, /'data-lane': key/);
  assert.match(pt, /chips\.append\(ekgChip, laneChipBtn\);/, 'the pills sit in the chart\'s pill row');
  assert.match(pt, /ekgChip\.disabled = id !== 'beats'/, 'the strip belongs to the last beats');
  assert.match(pt, /const wantEkg = range === 'beats' && \(slide \? cfg\.ekg : showEkg\);/);
  // (a slide\'s card hides the pills; its own tool options decide the lanes)
  assert.ok(css.includes('.pz-tool .pt-chips,'), 'the pills are hidden on a slide');
  assert.match(pt, /cfg = \{ ekg: t\?\.ekg !== false, lane: t\?\.hvpgLane !== false \}/);
  // The lane draws faint lines at 5, 10 and 12 on a slide as the talk trace does, named once when the lane is short.
  assert.match(pt, /\(v === 5 && !roomy && !slide\)\) continue;/);
  assert.match(pt, /slide \? roomy \|\| v === 12 : roomy \|\| v === 10/);
  // The strip is drawn in the text colour with no glow, one reading at its end (the heart rate, a whole number).
  const strip = pt.slice(pt.indexOf('// The EKG strip'), pt.indexOf("ctx.fillText('mmHg'"));
  assert.match(strip, /ctx\.strokeStyle = text;/);
  assert.doesNotMatch(strip, /shadowBlur|createLinearGradient/);
  assert.match(strip, /dec: 0, label: 'HR'/);
  // A phone's card is tall enough for the HVPG lane.
  const phone = +css.match(/\.pz\.stack \.pz-tool\[data-kind="beats"\] \.pt-box \{ height: (\d+)px;/)[1];
  assert.ok(laneRoom(phone - 30 - 22, { gap: 30, two: 0.66 }).hvpg > 0, `a ${phone} px phone card keeps the HVPG lane`);
  assert.equal(laneRoom(phone - 30 - 22, { ekg: true, gap: 30, egap: 22 }).ekg, 0, 'and loses the strip');
});

test('the phase reaches the chart: its fine buffer, the beat clock and the cleared trace', () => {
  assert.match(pt, /fine\.t\.push\(t\); fine\.ph\.push\(smp\.ph\?\.\[i\] \?\? NaN\); beatClock\.push\(t, smp\.ph\?\.\[i\]\);/);
  assert.match(pt, /beatClock\.reset\(\);/, 'a new patient starts the strip over');
  assert.match(pt, /beatClock\.trim\(fine\.t\[0\]\)/);
});

test('breathing is off on the first beat-trace slide of each run, and the Doppler decks keep it', () => {
  const slide = (deck, id) => DECKS.find((d) => d.id === deck).slides.find((s) => s.id === id);
  for (const [deck, id] of [['variceal-bleed', 'before'], ['gastric-varices', 'bleed'], ['refractory-bleed', 'controlled']]) {
    const s = slide(deck, id);
    assert.equal(s.tool?.kind, 'trace');
    assert.equal(s.tool.range, 'beats');
    assert.equal(s.params?.respiration, false, `${deck}/${id}: breathing off`);
    assert.match(s.notes, /schematic rhythm timed to the model.s heartbeat, not a modelled ECG/, `${deck}/${id}: says what the strip is`);
  }
  // (Only those three runs: any other deck that turns breathing off is a Doppler slide that reads its own waveform.)
  const off = DECKS.flatMap((d) => d.slides.filter((s) => s.params?.respiration === false).map((s) => `${d.id}/${s.id}`));
  assert.deepEqual(off.filter((k) => /^(variceal-bleed|gastric-varices|refractory-bleed)\//.test(k)).sort(), ['gastric-varices/bleed', 'refractory-bleed/controlled', 'variceal-bleed/before']);
});
