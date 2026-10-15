// Patients numbers agree with each other (review 15 Oct, #6, #7, #8): a gradient equals its two readings as shown, a
// vessel reads one velocity everywhere, an event fires once rather than with every breath, the vitals hold steady
// through a breath, and the bottom bar repaints a paused model. (dock.js and readouts-pane.js need a DOM, so they
// are read as text.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { detectEvents } from '../src/engine/events.js';
import { PRESETS } from '../src/engine/scenario.js';
import { meanVel, dopplerVel } from '../src/ui/velNormal.js';
import { vitalReading } from '../src/ui/vital-read.js';

const r1 = (v) => Math.round(v * 10) / 10;
const src = (p) => readFileSync(new URL(`../src/ui/${p}`, import.meta.url), 'utf8');

test('HVPG reads WHVP − FHVP and PPG reads portal − IVC, as shown at one decimal, beat by beat', () => {
  let n = 0;
  for (const id of ['csph', 'cirr-decomp', 'pvt-acute', 'sos', 'rhf']) {
    const e = new Engine(); e.loadPreset(id); e.beat = true;
    for (let f = 0; f < 60; f++) {
      for (let i = 0; i < 25; i++) e.step(0.004);
      const m = computeMetrics(e);
      assert.equal(r1(m.hvpg), r1(r1(m.whvp) - r1(m.fhvp)), `${id} t=${e.t.toFixed(1)}: HVPG ${m.hvpg} vs ${r1(m.whvp)} − ${r1(m.fhvp)}`);
      assert.equal(r1(m.ppg), r1(r1(m.pv) - r1(m.ivc)), `${id} t=${e.t.toFixed(1)}: PPG ${m.ppg} vs ${r1(m.pv)} − ${r1(m.ivc)}`);
      n++;
    }
  }
  assert.ok(n === 300);
});

test('a vessel reads one velocity: Details, the tip, the labels and colours read what the Doppler probe reads', () => {
  for (const id of ['healthy', 'cirr-decomp', 'pvt-chronic']) {
    const e = new Engine(); e.loadPreset(id);
    const f = { Q: e.Q, D: e.edges.map((x) => e.diameter(x.id)) };
    for (const v of ['V_INT', 'SMV_CONF', 'PV_TRUNK', 'SV_CONF', 'RHV_IVC']) {
      const k = e.ei[v];
      assert.ok(Math.abs(meanVel(f, k) - e.velocity(v)) < 1e-6, `${id} ${v}: mean ${meanVel(f, k)} vs probe ${e.velocity(v)}`);
      assert.ok(Math.abs(dopplerVel(f, k) - e.dopplerVelocity(v)) < 1e-6, `${id} ${v}: Doppler ${dopplerVel(f, k)} vs ${e.dopplerVelocity(v)}`);
    }
  }
  // (the jejunal veins are drawn at 6 mm but probed at 9.5: they read about 23 cm/s, not 54)
  for (const p of ['inspector.js', 'main.js', 'actions.js']) assert.doesNotMatch(src(p), /Math\.PI \* D \* D/, `${p} works out a velocity from the drawn width`);
  assert.match(src('stage.js'), /const edgeVel = meanVel;/);
});

test('Details reads the smoothed pressures and flows, as the vessel card does', () => {
  const ins = src('inspector.js');
  assert.doesNotMatch(ins, /fp\(f\.P\[/);
  assert.match(ins, /const P = \(f\) => f\.Pf \|\| f\.P, Q = \(f\) => f\.Qf \|\| f\.Q;/);
});

test('an event fires once as it starts, not again with every breath', () => {
  for (const id of ['cirr-decomp', 'cirr-hepatofugal', 'schisto', 'rhf', 'constrictive']) {
    const e = new Engine(); e.loadPreset(id); e.beat = true;
    const counts = {};
    for (let f = 0; f < 600; f++) {   // a minute of frames, read every 0.1 s as the host does
      for (let i = 0; i < 25; i++) e.step(0.004);
      detectEvents(e);
      for (const ev of e.newEvents.splice(0)) counts[ev.id] = (counts[ev.id] || 0) + 1;
    }
    for (const [ev, n] of Object.entries(counts)) assert.ok(n <= 1, `${id}: "${ev}" fired ${n} times in a minute`);
  }
});

test('a vital holds steady through a breath, and its red flag does not flicker', () => {
  // The model's own breath mean: cardiac output swings 5.6 to 7.1 with each breath in decompensated cirrhosis.
  const { VITALS } = { VITALS: [{ id: 'co', v: (m) => m.vitals?.co ?? m.co, cut: 6.5, hys: 0.2 }, { id: 'map', v: (m) => m.vitals?.map ?? m.map, cut: 65, low: true, hys: 2 }] };
  for (const id of ['cirr-decomp', 'gastric-varix', 'schisto']) {
    const e = new Engine(); e.loadPreset(id); e.beat = true;
    const xs = VITALS.map((v) => ({ v })), seen = VITALS.map(() => [Infinity, -Infinity]), raw = [Infinity, -Infinity], flips = VITALS.map(() => 0);
    for (let f = 0; f < 600; f++) {
      for (let i = 0; i < 25; i++) e.step(0.004);
      const m = computeMetrics(e);
      raw[0] = Math.min(raw[0], m.co); raw[1] = Math.max(raw[1], m.co);
      xs.forEach((x, i) => {
        const before = x.bad, r = vitalReading(x, m, true, f * 100);
        if (f > 100) { seen[i][0] = Math.min(seen[i][0], r.v); seen[i][1] = Math.max(seen[i][1], r.v); if (r.bad !== before) flips[i]++; }
      });
    }
    assert.ok(raw[1] - raw[0] > 0.8, `${id}: the raw output swings (${raw[0].toFixed(2)}-${raw[1].toFixed(2)})`);
    assert.ok(seen[0][1] - seen[0][0] < 0.15, `${id}: CO wanders ${seen[0][0].toFixed(2)} to ${seen[0][1].toFixed(2)}`);
    assert.ok(seen[1][1] - seen[1][0] < 1, `${id}: MAP wanders ${seen[1][0].toFixed(1)} to ${seen[1][1].toFixed(1)}`);
    assert.deepEqual(flips, [0, 0], `${id}: a flag changed`);
  }
  // On a cut-off the flag holds, needs 1.5 s to change, and clears only inside the cut-off; paused, it changes at once.
  const x = { v: { v: (m) => m.co, cut: 6.5, hys: 0.2 } };
  assert.equal(vitalReading(x, { co: 6.6 }, true, 0).bad, true);
  assert.equal(vitalReading(x, { co: 6.4 }, true, 100).bad, true);
  assert.equal(vitalReading(x, { co: 6.2 }, true, 200).bad, true);
  assert.equal(vitalReading(x, { co: 6.2 }, true, 1800).bad, false);
  assert.equal(vitalReading(x, { co: 6.7 }, false, 1900).bad, true);
  for (const s of [src('dock.js'), src('readouts-pane.js')]) { assert.match(s, /vitalReading\(x, m, st0\.running, now\)/); assert.doesNotMatch(s, /\.bad\(m\)/); }
  assert.match(src('dock.js'), /v: \(m\) => m\.vitals\?\.co \?\? m\.co/);
});

test('paused, the bar repaints on a measurement or a new patient and takes a new band at once', () => {
  const dock = src('dock.js'), pane = src('readouts-pane.js');
  const keys = dock.match(/for \(const k of \[([^\]]*)\]\) store\.on\(k, \(\) => \{ if \(frame\) update\(frame\); \}\)/);
  assert.ok(keys, 'the bar listens for the HVPG measurement');
  for (const k of ['hvpgMeasured', 'showHvpg', 'hiddenReadouts', 'lastHVPG', 'presetId']) assert.match(keys[1], new RegExp(`'${k}'`));
  for (const s of [dock, pane]) assert.match(s, /if \(!x\.sev \|\| sev === 'none' \|\| !st0\.running \|\| now - x\.sevSince > 1500\)/);
});

test('every patient loads with its gradients agreeing', () => {
  for (const p of PRESETS) {
    const e = new Engine(); e.loadPreset(p.id);
    const m = computeMetrics(e);
    assert.equal(m.hvpg, r1(r1(m.whvp) - r1(m.fhvp)), p.id);
    assert.equal(r1(m.ppg), r1(r1(m.pv) - r1(m.ivc)), `${p.id} PPG`);
  }
});
