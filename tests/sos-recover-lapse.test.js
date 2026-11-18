// The outflow talk's "Most patients recover" (18 Oct, Mohammad: "the central vein gets better and then the timer starts
// timing up. They're not in sync"; "it should just dive where it wants, not stop at fit"). The central veins now clear over
// the time-lapse's days, as the counter runs, and the dive from the catheter slide lands on the central vein in one move.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCore } from '../src/worker-core.js';
import { OUTFLOW } from '../src/ui/decks/outflow.js';
import { PRESETS } from '../src/engine/scenario.js';
import { deckStates } from './deck-states.js';
import { presenterSource } from './split-src.js';

const fmt = (v) => v.toFixed(1);
const presenter = presenterSource();

test('the recovery slide eases the central veins over its days instead of setting them before the counter starts', () => {
  const s = OUTFLOW.slides.find((x) => x.id === 'recover');
  assert.ok(s.lapse && s.days, 'a time-lapse');
  assert.equal(s.params, undefined, 'no params of its own (they were set, and shown, before the days ran)');
  assert.deepEqual(s.ramp, { 'fibrosis.R.post': [34, 1], 'fibrosis.L.post': [34, 1] });
  const sos = OUTFLOW.slides.find((x) => x.id === 'sos');
  assert.equal(sos.preset, 'sos');
  assert.equal(sos.params, undefined, 'the SOS slide is the preset as every other deck shows it (Sites, Where, Lobule)');
  const preset = PRESETS.find((x) => x.id === 'sos').apply({});
  assert.equal(preset.fibrosis.R.post, s.ramp['fibrosis.R.post'][0], 'the ramp starts where the preset left the veins');
});

test('a dotted ramp key eases that nested param day by day', async () => {
  const seen = [];
  const core = createCore((m) => { if (m.type === 'seqStep') seen[m.i] = m.params; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', reqId: 1, steps: [{ preset: 'sos', params: { fibrosis: { R: { post: 34 }, L: { post: 34 } } } }, { days: 4, fine: true, ramp: { 'fibrosis.R.post': [34, 1], 'fibrosis.L.post': [34, 1] } }] });
  core.dispose();
  assert.equal(seen[0].fibrosis.R.post, 34);
  assert.equal(seen[1].fibrosis.R.post, 1);
  assert.equal(seen[1].fibrosis.L.post, 1);
  assert.equal(seen[1]['fibrosis.R.post'], undefined, 'no literal dotted key left in the params');
  assert.ok(seen[1].fibrosis.R.pre != null && seen[1].fibrosis.R.pre === seen[0].fibrosis.R.pre, 'the rest of the lobe untouched');
});

// (Healed over the whole month, the Recovered row reads PV 8.5 and FHVP 4.7, up from 8.0 and 4.3 when the veins healed
// before the days: Mohammad kept the new numbers, 18 Oct. 22 Oct the SOS preset itself carries the block of 32 and
// runs its 21 days with it, so the patient arrives a little more congested: PV 8.6, FHVP 4.8. 15 Nov 2026 the block is 34, to take SOS off
// the HVPG's red line (full app review ENG-5), and the row reads FHVP 4.9 and HVPG 2.4. 16 Nov 2026 the numbers are the bedside's, the beat's means: PV 8.9, FHVP 5.4, HVPG 2.2; later that day, with the
// lymph model's larger ascites in the SOS patient, FHVP 5.3 and HVPG 2.3; 17 Nov, with the collapse-edge step in the quiet settle (engine.js collapseFlips) and the bedside decks, FHVP 5.4 and HVPG 2.2 (the quiet settle of this patient can still wander by a tenth, see tests/preset-no-drift.test.js).)
test('the Recovered row: PV 8.9, FHVP 5.4, HVPG 2.2, no ascites', async () => {
  const fps = await deckStates(OUTFLOW), f = fps[OUTFLOW.slides.findIndex((x) => x.id === 'recover')];
  assert.equal(fmt(f.pv), '8.9');
  assert.equal(fmt(f.fhvp), '5.4');
  assert.equal(fmt(f.hvpg), '2.2');
  assert.ok(f.asc < 0.5, `ascites ${f.asc}`);
});

test('a slide diving from the anatomy aims the lobule at its station before the dive starts', () => {
  const cam = presenter.match(/async function camera\(cam, s, cut, early = 0, begun = null\) \{([\s\S]*?)\n {2}\}/)[1];
  const aim = cam.indexOf("if (cam !== 'sinusoid') stage.lobuleAim(part, { zoom });"), dive = cam.indexOf("setViewKey('lobule');");
  assert.ok(aim > 0 && dive > aim, 'aimed first, then the dive');
});
