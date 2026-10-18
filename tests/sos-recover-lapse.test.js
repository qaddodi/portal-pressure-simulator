// The outflow talk's "Most patients recover" (18 Oct, Mohammad: "the central vein gets better and then the timer starts
// timing up. They're not in sync"; "it should just dive where it wants, not stop at fit"). The central veins now clear over
// the time-lapse's days, as the counter runs, and the dive from the catheter slide lands on the central vein in one move.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCore } from '../src/worker-core.js';
import { OUTFLOW } from '../src/ui/decks/outflow.js';
import { deckStates } from './deck-states.js';

const fmt = (v) => v.toFixed(1);
const presenter = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');

test('the recovery slide eases the central veins over its days instead of setting them before the counter starts', () => {
  const s = OUTFLOW.slides.find((x) => x.id === 'recover');
  assert.ok(s.lapse && s.days, 'a time-lapse');
  assert.equal(s.params, undefined, 'no params of its own (they were set, and shown, before the days ran)');
  assert.deepEqual(s.ramp, { 'fibrosis.R.post': [32, 1], 'fibrosis.L.post': [32, 1] });
  const sos = OUTFLOW.slides.find((x) => x.id === 'sos');
  assert.equal(sos.params.fibrosis.R.post, s.ramp['fibrosis.R.post'][0], 'the ramp starts where the slide before left the veins');
});

test('a dotted ramp key eases that nested param day by day', async () => {
  const seen = [];
  const core = createCore((m) => { if (m.type === 'seqStep') seen[m.i] = m.params; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', reqId: 1, steps: [{ preset: 'sos', params: { fibrosis: { R: { post: 32 }, L: { post: 32 } } } }, { days: 4, fine: true, ramp: { 'fibrosis.R.post': [32, 1], 'fibrosis.L.post': [32, 1] } }] });
  core.dispose();
  assert.equal(seen[0].fibrosis.R.post, 32);
  assert.equal(seen[1].fibrosis.R.post, 1);
  assert.equal(seen[1].fibrosis.L.post, 1);
  assert.equal(seen[1]['fibrosis.R.post'], undefined, 'no literal dotted key left in the params');
  assert.ok(seen[1].fibrosis.R.pre != null && seen[1].fibrosis.R.pre === seen[0].fibrosis.R.pre, 'the rest of the lobe untouched');
});

// (Healed over the whole month, the Recovered row reads PV 8.5 and FHVP 4.7, up from 8.0 and 4.3 when the veins healed
// before the days: Mohammad kept the new numbers, 18 Oct.)
test('the Recovered row: PV 8.5, FHVP 4.7, HVPG 2.5, no ascites', async () => {
  const fps = await deckStates(OUTFLOW), f = fps[OUTFLOW.slides.findIndex((x) => x.id === 'recover')];
  assert.equal(fmt(f.pv), '8.5');
  assert.equal(fmt(f.fhvp), '4.7');
  assert.equal(fmt(f.hvpg), '2.5');
  assert.ok(f.asc < 0.5, `ascites ${f.asc}`);
});

test('a slide diving from the anatomy aims the lobule at its station before the dive starts', () => {
  const cam = presenter.match(/async function camera\(cam, s, cut\) \{([\s\S]*?)\n {2}\}/)[1];
  const aim = cam.indexOf("if (cam !== 'sinusoid') stage.lobuleAim(part, { zoom });"), dive = cam.indexOf('store.set({ lobule: true });');
  assert.ok(aim > 0 && dive > aim, 'aimed first, then the dive');
});
