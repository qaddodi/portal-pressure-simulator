// Slide lenses (decks.js lens, and lens buttons in compare) name lenses the presenter knows, and the lines that
// describe a lens describe what the model shows on that slide. The slides are run as the presenter runs them.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine } from '../src/engine/engine.js';
import { EDGES, NODES } from '../src/engine/topology.js';
import { deepMerge } from '../src/engine/scenario.js';
import { originFractions, oxygenSat, SAT } from '../src/ui/blood.js';
import { DECKS } from '../src/ui/decks.js';
import { EXT } from '../src/ui/slide-ext.js';

const KNOWN = ['velocity', 'flow', 'direction', 'heat', 'drop', 'delta', 'oxygen', 'origin'];
// The deck-only lenses a deck visuals package adds (slide-ext.js): A's vein system (V7) and change since a slide (V11). They are
// not in Explore's lens menu, so Patients never shows them.
const PKG = ['system', 'since'];
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
  for (const k of PKG) assert.ok(EXT.lenses[k] && EXT.owner.lenses[k] === 'A', `package A registers the ${k} lens`);
  const menu = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
  for (const k of PKG) assert.doesNotMatch(menu.slice(menu.indexOf('const LENSES'), menu.indexOf('\n};', menu.indexOf('const LENSES'))), new RegExp(`\\b${k}:`), `${k} stays out of Explore's lens menu`);
  for (const d of DECKS) for (const s of d.slides) {
    if (s.lens) assert.ok(KNOWN.includes(s.lens) || PKG.includes(s.lens), `${d.id}/${s.id}: ${s.lens}`);
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
  const e = run('doppler', 'a1');
  for (const k of ['PV_TRUNK', 'SV_CONF', 'SV_MID']) assert.ok(e.Q[e.ei[k]] < 0, k);
  assert.ok(e.Q[e.ei.C6] > 10, 'splenorenal shunt carries the blood away');
});

test('Shunts and varices: the origin lens separates splenic from gut blood', () => {
  for (const [d, id] of [['shunts', 'dsrs'], ['gastric-varices', 'svt']]) {
    const e = run(d, id), pv = origin(e, 'PV_TRUNK');
    assert.ok(pv.spleen < 0.05 && pv.smv > 0.9, `${d}/${id}: the portal vein carries gut blood`);
  }
  const s = run('shunts', 'dsrs');
  assert.ok(origin(s, 'S_DSR').spleen > 0.95 && s.Q[s.ei.S_DSR] > 4, 'Warren shunt carries splenic blood');
  const v = run('gastric-varices', 'svt');
  assert.ok(origin(v, 'C2').spleen > 0.95 && v.Q[v.ei.C2] > 2, 'gastric varices carry splenic blood');
});

test('Right heart: congestion reaches the upper body with TR, not with an IVC web', () => {
  const NIx = (id) => NI.get(id);
  const h = new Engine(); h.loadPreset('healthy');
  const rise = (e, node) => e.P[NIx(node)] - h.P[NIx(node)];
  const tr = run('outflow', 'tr'), web = run('outflow', 'web');
  for (const n of ['SVC', 'IVCI', 'CONF']) assert.ok(rise(tr, n) > 8, `TR: ${n} backed up`);
  assert.ok(rise(web, 'IVCI') > 8 && rise(web, 'CONF') > 6, 'web: veins below it backed up');
  assert.ok(Math.abs(rise(web, 'SVC')) < 2, 'web: the upper body is clear');
});

// The oxygen buttons (deck review L1, L2, L4, 17 Oct): what the words say each one shows.
test('Oxygen: zone 3 darkest, portal blood a little darker than arterial, reversed portal vein carries arterial blood out', () => {
  const sat = (e, id) => { const o = oxygenSat(EDGES, NODES, e.Q, e.P), k = e.ei[id]; return [o.edge[2 * k], o.edge[2 * k + 1]]; };
  const z = run('lobule', 'zones'), [inR, outR] = sat(z, 'SIN_RR');
  assert.ok(outR < inR - 0.15, `sinusoids darken toward the central vein: ${inR} → ${outR}`);
  const m = run('two-inflows', 'meet'), pv = sat(m, 'PV_TRUNK')[1], art = sat(m, 'A_HEP')[1];
  assert.ok(pv > 0.8 && pv < art && art - pv < 0.15, `portal ${pv}, arterial ${art}`);
  const f = new Engine();
  f.loadPreset('cirr-hepatofugal');   // (the preset Two inflows' hepatofugal slide used before the deck rebuild)
  assert.ok(f.Q[f.ei.PV_TRUNK] < 0, 'the portal vein drains the liver');
  assert.ok(Math.min(...sat(f, 'PV_TRUNK')) > SAT.artery - 0.03, `it carries arterial blood: ${sat(f, 'PV_TRUNK')}`);
});
