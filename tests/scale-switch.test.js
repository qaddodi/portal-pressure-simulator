// The scale switch on deck slides (slide field scales, scale-switch.js): what a slide offers, where each scale lands, the flip
// never carried to another slide, the sinusoid only on pressure-lens slides, and only the adopted built-in slides using it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DECKS, REGIONS } from '../src/ui/decks.js';
import { homeScale, offeredScales, scaleCam, scaleView, pickedScale, scalesProblems } from '../src/ui/scale-switch.js';
import { adopted } from './deck-adopted.js';
// (as presenter.js slideLens reads a slide's lens: pressure when it names none)
const slideLens = (s) => s.lens || 'pressure';

test('a slide offers its own scale and the ones it lists, in Explore\'s order', () => {
  assert.deepEqual(offeredScales({ cam: 'sinusoid', scales: ['lobule', 'anatomy:fit'] }), ['anatomy', 'lobule', 'sinusoid']);
  assert.deepEqual(offeredScales({ cam: 'portal', scales: ['lobule'] }), ['anatomy', 'lobule']);
  assert.deepEqual(offeredScales({ cam: 'lobule:triad', scales: ['anatomy'] }), ['anatomy', 'lobule']);
  assert.equal(homeScale({ cam: 'lobule:central' }), 'lobule');
  assert.equal(homeScale({ cam: 'fit' }), 'anatomy');
  assert.equal(homeScale({}), 'anatomy');
});

test('no switch without the field, nor on a visual, catheter, Doppler, calipers or Circuit slide', () => {
  assert.deepEqual(offeredScales({ cam: 'liver' }), []);
  assert.deepEqual(offeredScales({ cam: 'liver', scales: [] }), []);
  for (const extra of [{ visual: 'table' }, { cath: 'wedge' }, { tool: { kind: 'doppler', vessel: 'PV_TRUNK' } }, { calipers: [] }, { view: 'circuit' }])
    assert.deepEqual(offeredScales({ cam: 'liver', scales: ['lobule'], ...extra }), [], JSON.stringify(extra));
});

test('the sinusoid is offered only on a pressure-lens slide, and only where the device draws it', () => {
  const s = { cam: 'liver', scales: ['lobule', 'sinusoid'] };
  assert.deepEqual(offeredScales(s, { lens: 'pressure' }), ['anatomy', 'lobule', 'sinusoid']);
  for (const lens of ['drop', 'origin', 'since', 'oxygen']) assert.deepEqual(offeredScales(s, { lens }), ['anatomy', 'lobule'], lens);
  assert.deepEqual(offeredScales(s, { sinusoid: false }), ['anatomy', 'lobule']);
  // (a sinusoid slide on a device without WebGL2 opens on the lobule, so the pill offers the lobule as its own)
  assert.deepEqual(offeredScales({ cam: 'sinusoid', scales: ['lobule', 'anatomy'] }, { sinusoid: false }), ['anatomy', 'lobule']);
  assert.deepEqual(offeredScales({ cam: 'sinusoid', scales: ['lobule'] }, { sinusoid: false }), []);
  assert.ok(scalesProblems(s, REGIONS, 'drop').some((p) => /pressure-lens/.test(p)));
  assert.deepEqual(scalesProblems(s, REGIONS, 'pressure'), []);
});

test('each scale lands on the slide\'s own framing, the one it names, or the default', () => {
  const s = { cam: 'portal', scales: ['lobule:triad'], zoom: 3 };
  assert.equal(scaleCam(s, 'anatomy'), 'portal');
  assert.equal(scaleCam(s, 'lobule'), 'lobule:triad');
  assert.equal(scaleCam({ cam: 'heart', scales: ['lobule'] }, 'lobule'), 'lobule:fit');
  assert.equal(scaleCam({ cam: 'heart', scales: ['lobule', 'sinusoid'] }, 'sinusoid'), 'sinusoid');
  assert.equal(scaleCam({ cam: 'sinusoid', scales: ['anatomy:fit'] }, 'anatomy'), 'fit');
  assert.equal(scaleCam({ cam: 'lobule:central', scales: ['anatomy'] }, 'anatomy'), 'liver');
  assert.equal(scaleCam({ cam: 'lobule:central', scales: ['anatomy'] }, 'lobule'), 'lobule:central');
  assert.deepEqual(scalesProblems({ scales: ['anatomy:nowhere', 'lobule:x', 'lobule', 'circuit'] }, REGIONS).length, 4);
});

test('the full form gives each scale its own camera and call-outs, and the slide keeps its own at its own scale', () => {
  const s = { cam: 'portal', lens: 'drop', zoom: 3, kMax: 4, labels: ['CONF', 'SV'], mark: { edges: ['PV_TRUNK'], label: 'Clot' }, sites: ['pv'], line: 'x',
    scales: { lobule: { cam: 'lobule:triad', zoom: 2.6, glow: ['lobule:triad'], callout: { at: 'triad', label: 'Resistance' } } } };
  assert.deepEqual(offeredScales(s, { lens: 'drop' }), ['anatomy', 'lobule']);
  assert.equal(scaleView(s, 'anatomy'), s);
  const v = scaleView(s, 'lobule');
  assert.equal(v.cam, 'lobule:triad'); assert.equal(v.zoom, 2.6); assert.deepEqual(v.glow, ['lobule:triad']);
  assert.deepEqual(v.callout, { at: 'triad', label: 'Resistance' });
  for (const k of ['kMax', 'labels', 'mark', 'sites']) assert.equal(v[k], undefined, `${k} stays at the slide's own scale`);
  assert.equal(v.line, 'x'); assert.equal(v.view, 'anatomic');
  // (a scale with no view of its own starts bare and lands on the default)
  const b = scaleView({ cam: 'lobule:central', callout: { at: 'cv', label: 'Resistance' }, scales: { anatomy: {} } }, 'anatomy');
  assert.equal(b.cam, 'liver'); assert.equal(b.callout, undefined);
  assert.equal(scaleCam({ cam: 'heart', scales: { anatomy: {}, lobule: { cam: 'lobule:central' } } }, 'lobule'), 'lobule:central');
  assert.deepEqual(scalesProblems(s, REGIONS, 'drop'), []);
  assert.deepEqual(scalesProblems({ scales: { lobule: { cam: 'portal', size: 2 }, anatomy: { cam: 'nowhere' }, sinusoid: { cam: 'liver' }, wall: {} } }, REGIONS).length, 5);
  assert.ok(scalesProblems({ scales: { sinusoid: {} } }, REGIONS, 'origin').length);
});

test('a flip is never remembered: Next, Back and a jump open each slide on its own scale', () => {
  const a = { cam: 'portal', scales: ['lobule'] }, b = { cam: 'lobule:triad', scales: ['anatomy'] };
  const pick = { i: 3, scale: 'lobule' };
  assert.equal(pickedScale(pick, 3, a), 'lobule');   // (the slide flipped)
  assert.equal(pickedScale(pick, 4, b), 'lobule');   // (Next: b's own, the lobule)
  assert.equal(pickedScale({ i: 4, scale: 'anatomy' }, 3, a), 'anatomy');   // (Back from a flip on b: a's own)
  assert.equal(pickedScale({ i: 4, scale: 'anatomy' }, 5, { cam: 'sinusoid' }), 'sinusoid');
  assert.equal(pickedScale(null, 3, b), 'lobule');
  // And the presenter clears the pick whenever a slide change begins, so coming back to the flipped slide shows its own scale too.
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  const run = src.slice(src.indexOf('async function transitionRun(to)'));
  assert.match(run.slice(0, 600), /scalePick = null;.*\n\s+shown = null; entering = null;/);
  // A flip starts only on a slide that has landed and is still the one wanted, with no case card up.
  assert.match(src, /async function flipScale\(k\) \{\n\s+if \(!deck \|\| !ui \|\| caseCard \|\| !shown \|\| shown\.i !== want \|\| shown\.gen !== gen\) return;/);
});

test('built-in slides use scales only where adopted, each with a valid list', () => {
  let n = 0;
  for (const d of DECKS) for (const s of d.slides) {
    if (s.scales === undefined) continue;
    n++;
    assert.ok(adopted(d, s, 'scales'), `${d.id}/${s.id} uses scales without being listed in tests/deck-adopted.js`);
    assert.deepEqual(scalesProblems(s, REGIONS, slideLens(s)), [], `${d.id}/${s.id}`);
    assert.ok(offeredScales(s, { lens: slideLens(s) }).length > 1, `${d.id}/${s.id} offers no other scale`);
  }
  assert.ok(n > 0);
});
