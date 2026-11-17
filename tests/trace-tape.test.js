// The pressure monitor's trace is recorded, written once (Mohammad, 17 Nov 2026: the HVPG tracing "doesn't seem real or reflect real heart beat of the patient";
// "what's already been measured or traced is actually changing"). Every measurement on the one monitor (monitor.js: the HVPG catheter, the EUS-PPG needle,
// the PPG by IR, the PPG through a TIPS) records through trace-tape.js; these check, by numbers, on every script:
//   - a sample once written never changes, through any number of frames, a heart rate that changes, the model's beat moving on, live readings that drift;
//   - the beat's period follows the patient's heart rate, with the a wave the tallest point of each free beat;
//   - the wedged (and the portal) trace is damped: its beat is a faint fraction of the free trace's, its breath kept;
//   - Back erases the trace to the head, and a trace recorded with no model is the pure one, the same every time.
// Timing is the procedure's clock handed in, never the wall's (the test clock: no frame, no wait).
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { createTape, tapeAdvance, tapeAt, tapeIndex, TAPE_DT } = await import('../src/ui/trace-tape.js');
const { newWave, syncWave, levelAt, dampAt, cardiacWave, T, CARDIAC_PP, WEDGE_DAMP, PORTAL_DAMP } = await import('../src/ui/hvpg-clock.js');
const { scriptById, SCRIPT_IDS } = await import('../src/ui/tool-reading.js');
const { HVPG_SCRIPT } = await import('../src/ui/hvpg-proc.js');

const frame = (t, phase, hr = 72, extra = {}) => ({ t, phase, running: true, speed: 1, clock: 'hemo', resp: true, metrics: { hr }, ...extra });
const V = { hvpg: { a: 5.3, b: 16.9, g: 11.6 }, eus: { a: 15.1, b: 2.6, g: 12.5 }, ppg: { a: 4.4, b: 17.9, g: 13.5 }, tips: { a: 14.2, b: 5.0, g: 9.2 } };
const ALL = [...SCRIPT_IDS.map((id) => [id, scriptById(id), V[id]]), ['hvpg-proc', HVPG_SCRIPT, { fhvp: 5.2, whvp: 16.3, hvpg: 11.1 }]];

// Play a script's sweep frame by frame (16 ms, a long frame now and then), the model's clock running beside it at its own pace, the heart rate
// and the live readings drifting; at every frame check that nothing already written has changed.
function play(S, v0, { hr0 = 72, hrEnd = 95, drift = 0.6, model = true } = {}) {
  const tp = createTape(), w = newWave(), v = { ...v0 };
  let snap = new Float32Array(0), m = 50, ph = 0.3, checked = 0;
  for (let t = S.win[0], i = 0; t <= S.win[1]; i++) {
    const hr = hr0 + ((hrEnd - hr0) * (t - S.win[0])) / (S.win[1] - S.win[0]);
    // (the model runs 3% fast against the procedure's clock, and its frames come every 100 ms: the beat it reports jumps on)
    if (model && i % 6 === 0) syncWave(w, frame(m, ph % 1, hr), t, t);
    for (const k of Object.keys(v)) v[k] = v0[k] + drift * Math.sin(t / 2300 + k.length);
    tapeAdvance(tp, S, t, v, model ? w : null);
    const n = Math.min(snap.length, tp.n);
    for (let k = 0; k < n; k++) if (!Object.is(snap[k], tp.p[k])) assert.fail(`${S.id ?? 'hvpg-proc'}: sample ${k} (${k * TAPE_DT} ms) changed at ${t} ms: ${snap[k]} to ${tp.p[k]}`);
    checked += n;
    snap = Float32Array.from(tp.p.subarray(0, tp.n));
    const dt = i % 37 === 36 ? 180 : 16;
    m += (dt / 1000) * 1.03; ph += ((dt / 1000) * 1.03 * hr) / 60; t += dt;
  }
  return { tp, checked };
}

test('every monitor’s trace is written once: no drawn sample ever changes as frames, the heart rate, the model’s beat and the readings move on', () => {
  for (const [id, S, v] of ALL) {
    const { tp, checked } = play(S, v);
    assert.ok(tp.n > 500 && checked > 50000, `${id}: a whole sweep recorded (${tp.n} samples, ${checked} checks)`);
  }
});

test('a monitor redrawn at rest, or handed the same time again, draws the very samples it had', () => {
  for (const [id, S, v] of ALL) {
    const w = newWave(); syncWave(w, frame(10, 0.2), S.win[0] + 6000, 0);
    const tp = tapeAdvance(createTape(), S, S.win[0] + 6000, v, w);
    const once = Float32Array.from(tp.p.subarray(0, tp.n));
    // (the model moves on, the readings change: the trace up to the head is what it was)
    syncWave(w, frame(14, 0.9, 110), S.win[0] + 6000, 4000);
    tapeAdvance(tp, S, S.win[0] + 6000, { ...v, a: (v.a ?? 0) + 3, fhvp: (v.fhvp ?? 0) + 3 }, w);
    assert.deepEqual(Array.from(tp.p.subarray(0, tp.n)), Array.from(once), `${id}: the same trace`);
  }
});

test('Back erases the trace back to the head, and going on writes it afresh from there; the samples before the head stay', () => {
  for (const [id, S, v] of ALL) {
    const tp = createTape(), t1 = S.win[0] + 7000, tb = S.win[0] + 4000;
    tapeAdvance(tp, S, t1, v, null);
    const before = Float32Array.from(tp.p.subarray(0, tapeIndex(tp, tb) + 1));
    tapeAdvance(tp, S, tb, v, null);
    assert.equal(tp.n, before.length, `${id}: erased to the head`);
    assert.ok(Number.isNaN(tapeAt(tp, tb + 500)), `${id}: nothing past the head`);
    tapeAdvance(tp, S, t1, v, null);
    assert.deepEqual(Array.from(tp.p.subarray(0, before.length)), Array.from(before), `${id}: what was before the head is as it was`);
    // (with no model and the same readings, the trace written again is the pure one: S.at, the same every time)
    for (let k = 0; k < tp.n; k += 23) {
      const tt = S.win[0] + k * TAPE_DT, p = S.at(tt, v, null);
      if (Number.isFinite(p)) assert.ok(Math.abs(tp.p[k] - p) < 1e-3, `${id} at ${tt}: ${tp.p[k]} vs ${p}`);
      else assert.ok(Number.isNaN(tp.p[k]), `${id}: blank where nothing is read, at ${tt}`);
    }
  }
});

// The free trace's a waves: the tallest point of each beat (local maxima of the cardiac pulse more than half a beat apart).
function aWaves(tp, from, to) {
  const out = [];
  const k0 = tapeIndex(tp, from), k1 = tapeIndex(tp, to);
  for (let k = k0 + 1; k < k1; k++) {
    const f = tp.ph[k] - Math.floor(tp.ph[k]), g = tp.ph[k - 1] - Math.floor(tp.ph[k - 1]);
    if (f < g) out.push(k * TAPE_DT + tp.t0);   // (the beat phase wraps at each a wave)
  }
  return out;
}
test('the trace beats at the patient’s heart rate: its period is 60/HR, at 50, 72 and 120 a minute', () => {
  const S = HVPG_SCRIPT, v = { fhvp: 5, whvp: 15, hvpg: 10 };
  for (const hr of [50, 72, 120]) {
    const tp = createTape(), w = newWave();
    let m = 30, ph = 0;
    for (let t = S.win[0]; t < T.inflate - 100; t += 16) { syncWave(w, frame(m, ph % 1, hr), t, t); tapeAdvance(tp, S, t, v, w); m += 0.016; ph += (0.016 * hr) / 60; }
    const a = aWaves(tp, S.win[0] + 400, T.inflate - 200);
    assert.ok(a.length >= 2, `${hr}/min: beats found`);
    const per = (a.at(-1) - a[0]) / (a.length - 1), want = 60000 / hr;
    assert.ok(Math.abs(per - want) / want < 0.04, `${hr}/min: a beat every ${per.toFixed(0)} ms, want ${want.toFixed(0)}`);
    // (and each beat's tallest point is its a wave, as on a real venous trace; the v wave the second)
    for (let i = 0; i + 1 < a.length; i++) {
      let best = -Infinity, at = 0;
      for (let tt = a[i]; tt < a[i + 1]; tt += TAPE_DT) { const p = cardiacWave(tp.ph[tapeIndex(tp, tt)], hr, 0); if (p > best) { best = p; at = tt; } }
      assert.ok(at - a[i] < 60 || a[i + 1] - at < 60, `${hr}/min, beat ${i}: tallest ${(at - a[i]).toFixed(0)} ms after the a wave`);
    }
  }
});

test('the wedged trace is damped: a faint beat (a fifth of the free one or less), its breath kept; a portal trace is damped too', () => {
  // The cardiac part alone, over a beat: free against wedged.
  const pp = (damp) => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < 400; i++) { const y = cardiacWave(3 + i / 400, 72, damp); lo = Math.min(lo, y); hi = Math.max(hi, y); } return hi - lo; };
  assert.ok(Math.abs(pp(0) - CARDIAC_PP) < 0.15 * CARDIAC_PP, `the free pulse is ${pp(0).toFixed(2)} mmHg peak to peak`);
  assert.ok(pp(WEDGE_DAMP) <= 0.25 * pp(0), `wedged: ${pp(WEDGE_DAMP).toFixed(2)} against ${pp(0).toFixed(2)}`);
  assert.ok(pp(WEDGE_DAMP) > 0.05, 'but not ruler-flat (Mohammad, 13 Nov 2026)');
  assert.ok(pp(PORTAL_DAMP) < 0.4 * pp(0), `portal: ${pp(PORTAL_DAMP).toFixed(2)}`);
  // And on the recorded trace: the wedge's beat-to-beat ripple (the trace less its 1 s mean) is a fraction of the free trace's, its breath swing kept.
  const S = HVPG_SCRIPT, v = { fhvp: 5, whvp: 15, hvpg: 10 }, tp = tapeAdvance(createTape(), S, T.back, v, null);
  const ripple = (a, b) => {
    let s = 0, n = 0;
    for (let tt = a; tt < b; tt += TAPE_DT) {
      let m = 0, c = 0; for (let u = -420; u <= 420; u += TAPE_DT) { m += tapeAt(tp, tt + u); c++; }
      s += (tapeAt(tp, tt) - m / c) ** 2; n++;
    }
    return Math.sqrt(s / n);
  };
  const swing = (a, b) => { let lo = Infinity, hi = -Infinity; for (let tt = a; tt < b; tt += TAPE_DT) { const p = tapeAt(tp, tt); lo = Math.min(lo, p); hi = Math.max(hi, p); } return hi - lo; };
  const free = ripple(S.win[0] + 500, T.inflate - 500), wedge = ripple(T.wedge + 500, T.back - 500);
  assert.ok(wedge < 0.35 * free, `wedged beat ripple ${wedge.toFixed(3)} against free ${free.toFixed(3)}`);
  assert.ok(swing(T.wedge + 500, T.back - 500) > 0.4, 'the wedge still rises and falls with the breath');
  assert.equal(dampAt(T.wedge), WEDGE_DAMP);
  assert.equal(levelAt(T.wedge + 10, v), v.whvp);
});

test('a reading that lands, or a live value that jumps, never steps the trace: the level eases over a quarter second', () => {
  const S = HVPG_SCRIPT, tp = createTape();
  const v = { fhvp: 5, whvp: 15, hvpg: 10 };
  for (let t = S.win[0]; t < S.win[0] + 2000; t += 16) tapeAdvance(tp, S, t, v, null);
  v.fhvp = 6.5;   // (the slide's reading lands 1.5 mmHg off the live one)
  for (let t = S.win[0] + 2000; t < S.win[0] + 4000; t += 16) tapeAdvance(tp, S, t, v, null);
  let worst = 0;
  for (let k = 1; k < tp.n; k++) worst = Math.max(worst, Math.abs(tp.p[k] - tp.p[k - 1]));
  assert.ok(worst < 0.2, `the largest step between two 10 ms samples is ${worst.toFixed(3)} mmHg`);
});
