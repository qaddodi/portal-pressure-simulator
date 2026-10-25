// A compare slide's buttons (presenter.js abChoice). Mohammad, 19 Oct, on the "test all slides" deck's TIPS slide: "when i
// click no tips then tips again the tips doesn't come". Its own button ({ label: 'TIPS, 10 mm', own: true }) named no params
// of its own, so it patched the live model with nothing and the No TIPS state stayed. An own button without params now eases
// back to the slide's exact state, as a patient row's own button does.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abChoice } from '../src/ui/presenter.js';
import { DECKS } from '../src/ui/decks.js';
import { flowParts } from '../src/ui/tool-flows.js';
import { runSteps } from './deck-states.js';

const tipsShare = (fp) => flowParts(fp).find((p) => p.id === 'tips')?.pct ?? 0;

test('No TIPS → TIPS → No TIPS → TIPS: the TIPS comes back each time, its share and PPG the slide\'s own', async () => {
  // The slide as the deck has it: a decompensated patient, a 10 mm TIPS, the own button without params.
  const slide = { params: { tips: { on: true, d: 10 } }, compare: [{ label: 'No TIPS', params: { tips: { on: false } } }, { label: 'TIPS, 10 mm', own: true }] };
  assert.deepEqual(abChoice(slide.compare, 0), { kind: 'params', patch: { tips: { on: false } } });
  assert.deepEqual(abChoice(slide.compare, 1), { kind: 'state' }, 'the own button goes back to the slide\'s state');
  // Each tap as the presenter applies it: a params button patches the live model; the own button eases to the slide's
  // computed state, the deck's patient with the slide's params.
  const taps = [0, 1, 0, 1];
  const steps = [{ preset: 'cirr-decomp' }, { params: slide.params }, ...taps.map((k) => {
    const c = abChoice(slide.compare, k);
    return c.kind === 'state' ? { params: slide.params } : { params: c.patch };
  })];
  const [, own, ...after] = await runSteps(steps);
  assert.ok(tipsShare(own) > 20 && own.ppg < 12, `the slide: TIPS ${tipsShare(own)}%, PPG ${own.ppg}`);
  taps.forEach((k, j) => {
    const fp = after[j], at = `tap ${j + 1} (${slide.compare[k].label})`;
    if (k === 0) assert.ok(tipsShare(fp) === 0 && fp.ppg > 12, `${at}: no TIPS part, PPG ${fp.ppg}`);
    else {
      assert.equal(tipsShare(fp), tipsShare(own), `${at}: the TIPS part is back`);
      assert.ok(Math.abs(fp.ppg - own.ppg) < 0.1, `${at}: PPG ${fp.ppg} against the slide's ${own.ppg}`);
    }
  });
});

// Every built-in compare row: each button resolves, and a params own button switches back every key the row's other
// buttons switch (else the slide's state would not come back).
test('every compare row\'s own button undoes what the other buttons switch', () => {
  const paths = (o, pre = '') => Object.entries(o || {}).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? paths(v, `${pre}${k}.`) : [`${pre}${k}`]));
  let rows = 0;
  for (const d of DECKS) for (const s of d.slides) {
    if (!s.compare) continue;
    const cs = s.compare.map((o, k) => abChoice(s.compare, k));
    const own = s.compare.findIndex((o) => o.own);
    if (own < 0 || cs[own].kind !== 'params') continue;
    rows++;
    const mine = new Set(paths(cs[own].patch));
    cs.forEach((c, k) => { if (c.kind === 'params') for (const p of paths(c.patch)) assert.ok(mine.has(p), `${d.id}/${s.id}: "${s.compare[own].label}" sets ${p}, which "${s.compare[k].label}" switches`); });
  }
  assert.ok(rows > 5, 'several params rows checked');
  // A button with no params and not the slide's own changes nothing (no crash).
  assert.deepEqual(abChoice([{ label: 'A' }, { label: 'B', own: true, params: { x: 1 } }], 0), { kind: 'params', patch: {} });
});
