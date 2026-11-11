// The beta-blocker response control (features item 41, 11 Nov 2026): `response: true` makes three compare buttons that set nsbbGain on the live model,
// and the vitals monitor's `hold: true` draws the MAP hold line (Baveno VIII 4.6) on a rail under its numbers.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { withOverview, DECKS } from '../src/ui/decks.js';
import { abChoice } from '../src/ui/presenter.js';
import { NSBB_GAIN, RESPONSE_LEVELS, responseButtons, responseOwn, isResponse } from '../src/ui/nsbb-response.js';
import { railAt, RAIL_LO, RAIL_HI, vitalsShown } from '../src/ui/vitals-monitor.js';
import { MAP_BETA_CUT } from '../src/engine/kidney-cuts.js';

/** The HVPG fall (percent) on a drug at a gain, settled, from the same patient untreated. */
function fall(preset, drug, gain) {
  const e0 = new Engine(); e0.loadPreset(preset); e0.settle();
  const b = computeMetrics(e0).hvpg;
  const e = new Engine(); e.loadPreset(preset); e.settle();
  e.params.drugs[drug] = true; e.params.nsbbGain = gain; e.settle();
  return (100 * (b - computeMetrics(e).hvpg)) / b;
}

test('the three levels: none stays under Baveno VIII Table 3\'s 10% fall, the usual is 15 to 25%, the strong one more', () => {
  assert.deepEqual(RESPONSE_LEVELS.map((l) => l.id), ['non', 'usual', 'strong']);
  assert.deepEqual(RESPONSE_LEVELS.map((l) => l.gain), [NSBB_GAIN.non, NSBB_GAIN.usual, NSBB_GAIN.strong]);
  for (const drug of ['carvedilol', 'propranolol']) {
    const [n, u, st] = RESPONSE_LEVELS.map((l) => fall('cirr-decomp', drug, l.gain));
    assert.ok(n < 10, `${drug}: a non-responder falls under 10% (${n.toFixed(1)})`);
    assert.ok(u > n + 4 && st > u, `${drug}: ${n.toFixed(0)} < ${u.toFixed(0)} < ${st.toFixed(0)}`);
  }
  const u = fall('cirr-decomp', 'carvedilol', NSBB_GAIN.usual), st = fall('cirr-decomp', 'carvedilol', NSBB_GAIN.strong);
  assert.ok(u >= 15 && u <= 25, `usual carvedilol response ${u.toFixed(1)}%`);
  assert.ok(st >= 25, `strong carvedilol response ${st.toFixed(1)}%`);
});

test('responseButtons: three buttons, each a lone nsbbGain, the slide\'s own level marked (the usual one when it sets none)', () => {
  const b = responseButtons({});
  assert.equal(b.length, 3);
  assert.deepEqual(b.map((o) => o.params), [{ nsbbGain: 0 }, { nsbbGain: 1 }, { nsbbGain: 1.6 }]);
  assert.deepEqual(b.map((o) => !!o.own), [false, true, false]);
  assert.deepEqual(responseButtons({ params: { nsbbGain: 1.6 } }).map((o) => !!o.own), [false, false, true]);
  assert.equal(responseOwn({ params: { nsbbGain: 0.4 } }), null, 'a gain that is none of the three marks no button');
  assert.ok(b.every((o) => o.label && o.short));
  assert.ok(isResponse(b) && !isResponse([{ label: 'x', params: { drugs: { carvedilol: true } } }]));
});

test('a slide with response gets its buttons when the deck is opened, and each is a params change on the live model', () => {
  const d = withOverview({ id: 't', title: 't', slides: [{ id: 'a', preset: 'cirr-decomp', params: { drugs: { carvedilol: true } }, response: true, title: 'x' }] });
  const s = d.slides.find((x) => x.id === 'a');
  assert.equal(s.compare.length, 3);
  assert.deepEqual(abChoice(s.compare, 2), { kind: 'params', patch: { nsbbGain: 1.6 } });
  assert.deepEqual(abChoice(s.compare, 1), { kind: 'params', patch: { nsbbGain: 1 } }, 'the own button too changes the params, back to the slide\'s');
  const own = withOverview({ id: 't', title: 't', slides: [{ id: 'a', compare: [{ label: 'x', own: true }], response: true }] }).slides[1];
  assert.equal(own.compare.length, 1, 'a slide with its own compare keeps it');
});

test('the hold rail: the line stands at the MAP cut-off on a scale that holds the usual pressures, and hold changes no vital', () => {
  assert.ok(railAt(MAP_BETA_CUT) > 0.2 && railAt(MAP_BETA_CUT) < 0.4 && railAt(RAIL_LO - 10) === 0 && railAt(RAIL_HI + 10) === 1);
  assert.ok(railAt(80) > railAt(MAP_BETA_CUT) && railAt(120) === 1, 'a MAP of 80 stands to the right of the line');
  assert.deepEqual(vitalsShown({ show: ['hr', 'map'], hold: true }), ['hr', 'map']);
});

test('no built-in deck uses the response control or the hold rail yet except where tests/deck-adopted.js lists it', async () => {
  const { adopted } = await import('./deck-adopted.js');
  for (const d of DECKS) for (const s of d.slides) {
    if (s.response) assert.ok(adopted(d, s, 'response'), `${d.id}/${s.id}: response is opt-in (tests/deck-adopted.js)`);
    if (s.tool?.kind === 'vitals' && s.tool.hold) assert.ok(adopted(d, s, 'tool.hold'), `${d.id}/${s.id}: the hold rail is opt-in (tests/deck-adopted.js)`);
    if (s.strain) assert.ok(adopted(d, s, 'strain'), `${d.id}/${s.id}: strain is opt-in (tests/deck-adopted.js)`);
    if (s.strain) assert.ok(!(s.lapse || s.procedure || s.cath || s.compare || s.whatIf || s.response || s.question), `${d.id}/${s.id}: strain is the one hands-on control, with no time-lapse, procedure, catheter or question`);
    if (s.response) assert.ok(!s.compare, `${d.id}/${s.id}: response makes the compare buttons itself`);
  }
});
