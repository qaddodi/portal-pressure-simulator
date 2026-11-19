// A slide's numbers do not drift after the card lands (ENG-1, bible review 19 Nov 2026). The chain computes each slide's state off screen (worker-core sequence);
// the page restores it into the live model, which then runs on at the bedside clock. The chain used to warm each state for 12 s while the live model's slow means
// (the baroreflex, the vitals' filters) take 40 s to settle, so over the 307 slides of the 42 decks HVPG ended 0.1 or more off on 177 and PPG on 199 (up to 0.4),
// three slides changed colour (ten-years 5, cause-treated 11, same-gradient 4), and for 1 to 4 seconds after landing the shown means swung (pregnancy 7 went red for
// 1.5 s) because a restore started the display windows over from a constant. The old test allowed two printed steps, so it passed all of it.
// Here every state of every deck is restored the way the page does it, run at the bedside clock past the display windows' refill and a long way beyond, and its readings
// are compared with the slide's own. One printed step (0.1) is the most a number may be off, nothing may change colour, and nothing may move in the first seconds.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { deckStatesFull, changes } from './deck-states.js';
import { Engine } from '../src/engine/portal/engine.js';
import { computeMetrics } from '../src/engine/portal/metrics.js';
import { fingerprintOf } from '../src/engine/portal/fingerprint.js';
import { hvpgSev, ppgSev } from '../src/engine/portal/pressure-cuts.js';
import { DisplayMean } from '../src/engine/portal/display-mean.js';
import { atBedside, WARM_STEPS, WARM_SECS } from '../src/worker-core.js';

const fingerprint = (m, e) => fingerprintOf(m, { P: e.Pf || e.P, Q: e.Qf || e.Q, D: Float32Array.from(e.edges, (ed) => e.diameterShown(ed.id)), copy: true, params: e.params, fluid: e.starling(true) });
// (How far a printed reading may be from the slide's: one printed step, or for the vitals the step of their own rounding.)
const TOL = { hvpg: 0.1, ppg: 0.1, pv: 0.1, map: 0.6, sbp: 1, dbp: 0.6, ra: 0.15 };
const SECS = 9, DT = 0.008;   // (past the window refill, which the landing holds through: engine shownMean arrive)

test('every state of every deck lands and stays: its readings hold within a printed step, no colour changes, nothing swings in the first seconds', async () => {
  const bad = [];
  let n = 0;
  for (const d of DECKS) {
    const full = await deckStatesFull(d), seen = new Set();
    for (let i = 0; i < d.slides.length; i++) {
      const s = d.slides[i], f = full[i];
      if (!f || seen.has(f) || !(changes(s) || i === 0)) continue;
      seen.add(f);
      if (f.snap.bleed?.active) continue;   // (a slide with a bleed running is a process under way: its numbers move by design)
      n++;
      const e = new Engine(); e.restore(f.snap); e.beat = true;
      const worst = {}; let colour = false;
      for (let t = 0; t < SECS / DT; t++) {
        e.step(DT);
        if (t % 62 !== 61) continue;
        const fp = fingerprint(computeMetrics(e), e);
        for (const k of Object.keys(TOL)) if (Number.isFinite(fp[k]) && Number.isFinite(f.fp[k])) worst[k] = Math.max(worst[k] || 0, Math.abs(fp[k] - f.fp[k]));
        if (hvpgSev(fp.hvpg) !== hvpgSev(f.fp.hvpg) || ppgSev(fp.ppg) !== ppgSev(f.fp.ppg)) colour = true;
      }
      for (const [k, v] of Object.entries(worst)) if (v > TOL[k] + 1e-9) bad.push(`${d.id} slide ${i}: ${k} ${v.toFixed(2)} off after landing`);
      if (colour) bad.push(`${d.id} slide ${i}: HVPG or PPG changed colour after landing`);
    }
  }
  assert.ok(n > 250, `walked ${n} states`);
  assert.deepEqual(bad, []);
});

test('the run-in is long enough: the slow means have settled when a state is handed over (40 s), at about twice the old 1,500 steps', () => {
  assert.ok(WARM_SECS >= 40 - 1e-9, `${WARM_SECS} s`);
  assert.ok(WARM_STEPS <= 3300, `${WARM_STEPS} steps: the settle must stay cheap, decks open instantly (12 s at 8 ms was 1500)`);
});

test('a patient settled by the run-in does not move at the bedside clock afterwards (the preset load and the chain agree with the live model)', () => {
  for (const id of ['cirr-decomp', 'ten-years', 'pregnancy']) {
    const q = new Engine(); q.loadPreset(id); q.settle();
    const w = new Engine(); w.restore(q.snapshot()); atBedside(w);
    const raw = (e) => [e.hvpgTrue(e.Pf).hvpg, e.Pf[e.ni.CONF] - e.Pf[e.ni.IVCS]];
    const a = raw(w);
    for (let i = 0; i < 12000; i++) w.step(0.004);   // (48 s of the live clock)
    const b = raw(w);
    assert.ok(Math.abs(a[0] - b[0]) < 0.03 && Math.abs(a[1] - b[1]) < 0.03, `${id}: HVPG ${a[0].toFixed(3)} → ${b[0].toFixed(3)}, PPG ${a[1].toFixed(3)} → ${b[1].toFixed(3)}`);
  }
});

test('a state restored at rest holds its readings through the window refill, and a change in the first seconds is not held', () => {
  const q = new Engine(); q.loadPreset('pregnancy'); q.settle();
  const w = new Engine(); w.restore(q.snapshot()); atBedside(w);
  const snap = w.snapshot({ rest: true }), raw = (e) => e.hvpgTrue(e.Pf).hvpg;
  const land = new Engine(); land.restore(snap); land.beat = true;
  const a = raw(land);
  let worst = 0;
  for (let i = 0; i < 750; i++) { land.step(0.008); worst = Math.max(worst, Math.abs(raw(land) - a)); }   // (6 s)
  assert.ok(worst < 0.02, `a restored rest moved ${worst.toFixed(3)} in its first 6 s`);
  // The same snapshot WITHOUT the flag (what restore did before): the partial windows swing the reading.
  const plain = new Engine(); plain.restore(w.snapshot()); plain.beat = true;
  let swing = 0; const b = raw(plain);
  for (let i = 0; i < 750; i++) { plain.step(0.008); swing = Math.max(swing, Math.abs(raw(plain) - b)); }
  assert.ok(swing > worst, 'the flag is what holds it');
  // A change written to the shown values (a slider's relax) seeds again without the hold: it shows at once.
  const dm = new DisplayMean(1); dm.seed(Float64Array.of(5), 6);
  assert.equal(dm.holdS, 6);
  dm.seed(Float64Array.of(7));
  assert.equal(dm.holdS, 0);
  assert.equal(dm.out[0], 7);
});

test('a transfusion on a slide is finished, not dripping, when the state is handed over', () => {
  const e = new Engine(); e.loadPreset('cirr-decomp');
  for (let i = 0; i < 8; i++) e.infuse('prbc');
  e.settle();
  assert.ok(e.infusions.length > 0, 'the settle alone leaves units running (343 s of the 600 s)');
  e.finishInfusions();
  assert.equal(e.infusions.length, 0);
});
