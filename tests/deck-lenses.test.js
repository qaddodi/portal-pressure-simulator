// Slide lenses (decks.js lens, and lens buttons in compare) name lenses the presenter knows, and the lines that
// describe a lens describe what the model shows on that slide. The slides are run as the presenter runs them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine } from '../src/engine/engine.js';
import { EDGES, NODES } from '../src/engine/topology.js';
import { deepMerge } from '../src/engine/scenario.js';
import { originFractions } from '../src/ui/blood.js';
import { DECKS } from '../src/ui/decks.js';

const KNOWN = ['velocity', 'flow', 'direction', 'heat', 'drop', 'delta', 'origin'];
const deck = (id) => DECKS.find((d) => d.id === id);
function run(deckId, upTo) {
  const e = new Engine();
  for (const s of deck(deckId).slides) {
    if (s.visual) continue;
    if (s.preset) e.loadPreset(s.preset);
    if (s.params) { e.setParams(deepMerge(e.params, s.params)); e.settle(); }
    if (s.days) { e.advanceDays(s.days, { noRupture: true, silent: true }); e.settle(); }
    if (s.id === upTo) return e;
  }
  throw new Error(`no slide ${deckId}/${upTo}`);
}
const NI = new Map(NODES.map((n, i) => [n.id, i]));
const drop = (e, id) => { const x = EDGES[e.ei[id]]; return Math.abs(e.P[NI.get(x.from)] - e.P[NI.get(x.to)]); };
const origin = (e, id) => { const o = originFractions(EDGES, NODES, e.Q, e.P), k = e.ei[id]; return { smv: o[k * 4], imv: o[k * 4 + 1], spleen: o[k * 4 + 2], artery: o[k * 4 + 3] }; };

test('every slide lens and lens button names a lens the presenter knows', () => {
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  for (const k of KNOWN) assert.match(src, new RegExp(`^  ${k}: \\['`, 'm'), `presenter LENS_KEY has ${k}`);
  for (const d of DECKS) for (const s of d.slides) {
    if (s.lens) assert.ok(KNOWN.includes(s.lens), `${d.id}/${s.id}: ${s.lens}`);
    if (s.lens) assert.ok(!s.visual, `${d.id}/${s.id}: a visual always shows pressure`);
    for (const o of s.compare || []) if (o.lens) assert.ok(o.lens === 'pressure' || KNOWN.includes(o.lens), `${d.id}/${s.id}: ${o.lens}`);
  }
});

test('Sites: on the pressure drop lens the largest drop sits at each slide\'s level', () => {
  const at = { pvt: 'PV_TRUNK', presin: 'PRE_R', sin: 'SIN_RR', postsin: 'POST_R_RHV', post: 'RHV_IVC' };
  const route = ['PV_TRUNK', 'PRE_R', 'SIN_RR', 'POST_R_RHV', 'RHV_IVC', 'IVCS_RA'];
  for (const [id, edge] of Object.entries(at)) {
    const e = run('sites', id), top = route.reduce((a, b) => (drop(e, b) > drop(e, a) ? b : a));
    assert.equal(top, edge, `${id}: largest drop at ${top}`);
    assert.ok(drop(e, edge) > 6, `${id}: a large drop (${drop(e, edge)})`);
  }
  for (const id of ['healthy', 'cardiac']) { const e = run('sites', id); for (const k of route) assert.ok(drop(e, k) < 3, `${id}/${k} pale (${drop(e, k)})`); }
});

test('Two inflows: after TIPS the sinusoids carry arterial blood and the stent carries portal blood', () => {
  const e = run('two-inflows', 'tips');
  assert.ok(origin(e, 'SIN_RR').artery > 0.95, 'sinusoids arterial');
  const t = origin(e, 'TIPS');
  assert.ok(t.smv + t.imv + t.spleen > 0.75, 'stent mostly portal');
});

test('Doppler: hepatofugal flow reverses the portal and splenic veins, draining by the splenorenal shunt', () => {
  const e = run('doppler', 'reverse');
  for (const k of ['PV_TRUNK', 'SV_CONF', 'SV_MID']) assert.ok(e.Q[e.ei[k]] < 0, k);
  assert.ok(e.Q[e.ei.C6] > 10, 'splenorenal shunt carries the blood away');
});
