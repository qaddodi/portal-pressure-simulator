// A days chart reads against what the slide teaches (14 Nov 2026, the Two lesions clot slide): it starts at the state before the change,
// two readings in one unit share one axis, and a line that barely moves is not stretched to the plot's height.
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { chartBefore, stepChange } from '../src/ui/chart-start.js';
import { flowTimeSeries, pairScales, LINE } from '../src/ui/flow-time.js';
import { createCore } from '../src/worker-core.js';
import { deckStates, changes } from './deck-states.js';

const flowSlides = (d) => d.slides.map((s, i) => ({ s, i })).filter(({ s }) => s.tool?.kind === 'flowtime' && s.tool.clock === 'days');

test('stepChange: a change made at once with params or an action, not a ramp, a new patient or a bare passage of days', () => {
  assert.equal(stepChange({ params: { thrombus: { PV_TRUNK: 1 } }, days: 90 }), true);
  assert.equal(stepChange({ action: { kind: 'paracentesis', mL: 5000 }, days: 14 }), true);
  assert.equal(stepChange({ days: 60, ramp: { cirrhosis: [0.6, 0.85] } }), false);
  assert.equal(stepChange({ preset: 'csph', params: { cirrhosis: 0.6 }, days: 60 }), false);
  assert.equal(stepChange({ days: 90 }), false);
});

test('every days chart that follows a step change starts from the readings of the state before it', async () => {
  let n = 0;
  for (const d of DECKS) {
    const st = await deckStates(d), stateOf = d.slides.map((s, i) => (changes(s) || i === 0 ? i : null));
    let last = 0; stateOf.forEach((v, i) => { if (v == null) stateOf[i] = last; else last = v; });
    const states = st.map((fp) => ({ fp: fp.metrics ?? fp }));
    for (const { s, i } of flowSlides(d)) {
      if (!stepChange(s) && !s.tool.view?.since) continue;
      const b = chartBefore(d.slides, stateOf, states, i), at = `${d.id}/${s.id}`;
      assert.ok(b, `${at}: a chart after a step change has its before state`);
      const j = s.tool.view?.since ? d.slides.findIndex((x) => x.id === s.tool.view.since) : i - 1;
      for (const k of s.tool.lines.filter((k) => !LINE[k][5]?.given)) assert.equal(b[k], states[stateOf[j]].fp[k], `${at}: ${k} starts at the state before`);
      n++;
    }
  }
  assert.ok(n >= 4, `at least the Two lesions charts were checked (${n})`);
});

test('two readings in one unit share one axis, and a line that barely moves is not stretched', () => {
  const [L, R] = pairScales([28, 20, 18.6], [8.3, 8.4, 8.4], {}, {}, true);
  assert.deepEqual(L.ticks, R.ticks, 'one axis');
  assert.ok(L.min <= 8.3 && L.max >= 28);
  assert.ok((8.4 - 8.3) / (L.max - L.min) < 0.02, 'a tenth of a mmHg stays a hair, not a step');
  const [S] = pairScales([8.3, 8.4, 8.4], [1, 5, 9]);   // (different units: each fitted, but the near-flat one keeps 15% of its value as its span)
  assert.ok(S.max - S.min >= 0.15 * 8.4 - 1e-9, `the span ${S.max - S.min}`);
});

// The Two lesions charts against the claims of their slides, with the model's own trail.
async function trails(deck) {
  const steps = deck.slides.map((s) => (changes(s) ? { preset: s.preset, presetDays: s.presetDays, params: s.params, action: s.action, days: s.days, ramp: s.ramp, fine: !!s.lapse, trail: s.tool?.kind === 'flowtime' ? s.tool.lines.filter((k) => !LINE[k][5]?.given) : undefined } : {}));
  const out = [], core = createCore((m) => { if (m.type === 'seqStep') out[m.i] = m; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps, reqId: 1 });
  core.dispose();
  return out;
}

test('Two lesions: each chart starts at the state before the change, ends at the slide\'s own reading and moves the way its title says', async () => {
  const deck = DECKS.find((d) => d.id === 'two-lesions'), seq = await trails(deck);
  const stateOf = deck.slides.map((s, i) => i), states = seq.map((m) => ({ fp: m.fp }));
  const claim = { clot: { ppg: 1, hvpg: -1 }, both: { pv: 1, hvpg: -1 }, unclot: { ppg: -1, pv: -1 }, unsqueeze: { hvpg: 1, asc: -1 } };
  for (const { s, i } of flowSlides(deck)) {
    const before = chartBefore(deck.slides, stateOf, states, i), ser = flowTimeSeries(seq[i].trail, 'days', s.tool.lines, null, { before }), [a, b] = s.tool.lines;
    assert.ok(before, `${s.id}: starts from the state before`);
    assert.equal(ser.pv[0], before[a], `${s.id}: ${a} starts at the state before`);
    assert.equal(ser.flow[0] * (LINE[b][4] ? 1 / LINE[b][4] : 1), before[b], `${s.id}: ${b} starts at the state before`);
    for (const [k, dir] of Object.entries(claim[s.id])) {
      const col = k === a ? ser.pv : ser.flow, to = col.at(-1), from = col[0];
      assert.ok((to - from) * dir > 0, `${s.id}: ${k} goes ${dir > 0 ? 'up' : 'down'} from ${from} to ${to}`);
    }
    assert.ok(Math.abs(ser.pv.at(-1) - seq[i].fp[a]) < 1e-6, `${s.id}: ${a} ends at the slide's own reading`);
    if (LINE[a][1] === LINE[b][1]) assert.deepEqual(ser.pScale.ticks, ser.fScale.ticks, `${s.id}: two lines in one unit share an axis`);
  }
});
