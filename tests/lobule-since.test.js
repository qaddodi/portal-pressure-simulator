// A change-since slide (lens 'since', ext-highlights.js) in the lobule views: the lobule's vessels, labels and changes count from the
// same network the figure's vessels do (since-ref.js), and only that lens on a slide takes it: every other lens, Patients and a
// pinned moment read as before.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine } from '../src/engine/engine.js';
import { NODES } from '../src/engine/topology.js';
import { deepMerge } from '../src/engine/scenario.js';
import { lobuleState, sinceOf, LOBE } from '../src/ui/lobule-model.js';

// (The module's stamped URL is the one the lobule's model imports: a bare import would be a second copy with its own reference.)
const SRC = new URL('../src/ui/', import.meta.url);
const refUrl = readFileSync(new URL('lobule-model.js', SRC), 'utf8').match(/from '(\.\/since-ref\.js[^']*)'/)[1];
const { sinceSource, sinceNow } = await import(new URL(refUrl, SRC));

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const PROP = { drugs: { propranolol: true, carvedilol: false } }, CARV = { drugs: { propranolol: false, carvedilol: true } };
const frame = (preset, patch) => {
  const e = new Engine();
  e.loadPreset(preset);
  if (patch) { e.setParams(deepMerge(e.params, patch)); e.settle(); }
  return { P: Float32Array.from(e.P), Q: Float32Array.from(e.Q), params: structuredClone(e.params) };
};
const healthy = frame('healthy'), prop = frame('csph', PROP), carv = frame('csph', CARV);
const st = (over = {}) => ({ params: carv.params, healthy, presenting: true, colorMode: 'since', imaging: false, compareSnap: null, compareView: 'B', ...over });
const ids = [LOBE.pv, LOBE.sin, LOBE.cv];

test('the lobule counts a change-since slide from the reference the stage holds, as the figure does', () => {
  sinceSource(() => prop.P);
  const m = lobuleState(carv, st());
  assert.equal(m.mode, 'since');
  assert.equal(m.since, true);
  assert.equal(m.cmp, false, 'not the pinned moment');
  ids.forEach((id, i) => assert.ok(Math.abs(m.dP[i] - (carv.P[NI[id]] - prop.P[NI[id]])) < 1e-9, `${id}: change since the slide before`));
  assert.ok(m.dP[1] < -0.5, `carvedilol relaxes the sinusoids: ${m.dP[1]}`);
  [LOBE.pv, LOBE.sin, LOBE.cv, LOBE.hv, 'IVCS'].forEach((id, i) => assert.equal(m.R[i], prop.P[NI[id]], `${id}: labels measure change from it`));
});

test('every other lens, Patients and a pinned moment read as before', () => {
  sinceSource(() => prop.P);
  for (const mode of ['pressure', 'drop', 'flow', 'delta', 'heat', 'oxygen', 'origin']) {
    const m = lobuleState(carv, st({ colorMode: mode }));
    assert.equal(m.since, false, mode);
    assert.equal(m.mode, mode);
    ids.forEach((id, i) => assert.ok(Math.abs(m.dP[i] - (carv.P[NI[id]] - healthy.P[NI[id]])) < 1e-9, `${mode}/${id}: change from healthy`));
    assert.deepEqual(m.R, m.H, `${mode}: labels measure change from healthy`);
  }
  // (Not on a slide: Patients, whatever the lens.)
  assert.equal(lobuleState(carv, st({ presenting: false })).since, false);
  // (A pinned moment keeps the lobule's own comparison.)
  const snap = { P: healthy.P, metrics: {} };
  const c = lobuleState(carv, st({ compareSnap: snap, compareView: 'D' }));
  assert.equal(c.since, false); assert.equal(c.cmp, true); assert.equal(c.mode, 'delta');
  assert.equal(sinceOf(st({ compareSnap: snap })), null);
  assert.equal(sinceOf(st({ colorMode: 'drop' })), null);
});

test('the reference can be handed over eased, or left to the slide, and none means healthy', () => {
  sinceSource(() => prop.P);
  const mid = Float64Array.from(prop.P, (x, i) => (x + carv.P[i]) / 2);
  const m = lobuleState(carv, st(), mid);
  assert.ok(Math.abs(m.dP[1] - (carv.P[NI[LOBE.sin]] - mid[NI[LOBE.sin]])) < 1e-9, 'an eased reference is counted from');
  assert.equal(lobuleState(carv, st(), null).since, false, 'no reference: the lobule shows change from healthy');
  sinceSource(null);
  assert.equal(sinceNow(), null);
  assert.equal(lobuleState(carv, st()).since, false, 'the stage has registered none yet');
});

test('the lobule draws the lens as the Change colours, eases its reference and names it', () => {
  const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
  assert.match(lz, /M === 'pressure' \|\| M === 'delta' \|\| M === 'since' \|\| M === 'heat'/, 'the Change colours serve the lens');
  assert.match(lz, /M === 'pressure' \? pressureColor\(qP\(v\)\) : M === 'heat' \? heatColor\(qP\(v\)\) : deltaColor\(qP\(v\)\)/, 'delta and since share the scale');
  assert.match(lz, /m\.mode === 'delta' \|\| m\.mode === 'since' \? deltaColor\(qP\(d\)\) : pc\(v\)/, 'a label bar takes the change\'s colour');
  assert.match(lz, /model\?\.since \? 'since the slide before'/, 'the label says what it counts from');
  // The reference eases as the pressures do, in both places the model is redrawn, and a closed lobule starts from the state itself.
  assert.match(lz, /const eased = easeP\.step\(f\.Pf \|\| f\.P\), since = sinceStep\(st\);\n\s+model = lobuleState\(\{ \.\.\.f, P: eased\.v \}, st, since\.v\);/);
  assert.match(lz, /const st = store\.get\(\), eased = easeP\.step\(F\.Pf \|\| F\.P\), since = sinceStep\(st\);/);
  assert.equal((lz.match(/if \(eased\.moving \|\| since\.moving\) easeRaf = nextFrame\(glideP\);/g) || []).length, 2, 'the glide runs while the reference moves');
  assert.match(lz, /easeP = createEaser\(\); easeS = createEaser\(\); rz = null;/, 'out of sight it takes the reference at once');
});

test('the stage hands the lobule the reference its own vessels count from', () => {
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(stage, /sinceSource\(sinceRef\);/);
  assert.match(stage, /import \{ sinceSource \} from '\.\/since-ref\.js/);
});
