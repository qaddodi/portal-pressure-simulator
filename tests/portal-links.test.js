// Portal-to-portal shunts (13 Nov 2026, Mohammad: "who cares if it's not real", e.g. the splenic vein to the right or left portal vein): a custom stent
// between any two portal-system veins that no vessel already joins. They are custom shunts (one diameter in params.customShunts), flagged `portal`,
// and their blood stays in the portal system, so it is never counted as shunted.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { defaultParams, deepMerge, sanitizeParams } from '../src/engine/scenario.js';
import { EDGES, SHUNT_PORTAL_VEINS, isPortalLink, isStent, stentCourse } from '../src/engine/topology.js';
import { routeFlows } from '../src/ui/tool-flows.js';
import { CUSTOM_SHUNT_PATH } from '../src/ui/custom-shunt-paths.js';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const links = EDGES.filter(isPortalLink);
const make = (preset, params = {}) => { const e = new Engine(); e.loadPreset(preset); if (Object.keys(params).length) { e.setParams(deepMerge(e.params, params)); e.settle(); } return e; };

test('every pair of portal veins that no vessel joins has one link, stored upstream end first, drawn as a stent with its own course', () => {
  assert.equal(links.length, 27);
  const joined = new Set(EDGES.filter((e) => !isPortalLink(e) && e.kind !== 'wedge').flatMap((e) => [`${e.from}>${e.to}`, `${e.to}>${e.from}`]));
  const seen = new Set();
  for (const e of links) {
    assert.ok(SHUNT_PORTAL_VEINS.includes(e.from) && SHUNT_PORTAL_VEINS.includes(e.to) && e.from !== e.to, `${e.id} joins two portal veins`);
    assert.ok(!joined.has(`${e.from}>${e.to}`), `${e.id}: a vessel already joins them`);
    const key = [e.from, e.to].sort().join('>');
    assert.ok(!seen.has(key), `${e.id} is the only link of its pair`);
    seen.add(key);
    assert.ok(isStent(e) && e.kind === 'shunt' && e.shunt === 'custom');
    assert.ok(CUSTOM_SHUNT_PATH[e.id], `${e.id} has its anatomic course`);
  }
  assert.ok(!SHUNT_PORTAL_VEINS.includes('VAR') && !SHUNT_PORTAL_VEINS.includes('GV'), 'the varices are not veins to sew a shunt to');
  for (const id of ['X_SV_RPV', 'X_SV_LPV', 'X_SMV_RPV', 'X_RPV_LPV', 'X_SVD_CONF']) assert.ok(EI[id] != null, `${id} exists`);
  assert.equal(EI.X_SMV_LPV, undefined, 'the Meso-Rex bypass is that pair');
  assert.equal(stentCourse(EDGES[EI.X_SV_RPV]), 'SV ↔ RPV');
  assert.equal(stentCourse(EDGES[EI.X_SMV_LHV]), 'SMV → LHV', 'a portosystemic stent keeps its arrow');
});

test('closed until opened, and the sanitizer keeps an open one', () => {
  const e = make('cirr-decomp');
  for (const l of links) { assert.ok(e.Q[EI[l.id]] === 0, `${l.id} carries nothing while closed`); assert.equal(e.diameter(l.id), 0); }
  assert.equal(defaultParams().customShunts['X_SV_RPV'], undefined);
  assert.equal(sanitizeParams({ customShunts: { X_SV_RPV: 8, X_SV_VAR: 8 } }).customShunts.X_SV_RPV, 8);
  assert.equal(sanitizeParams({ customShunts: { X_SV_VAR: 8 } }).customShunts.X_SV_VAR, undefined, 'a pair that has no link is dropped');
});

test('in chronic portal vein thrombosis a splenic vein to portal branch link carries the gut\'s blood into the liver: PPG falls, the sinusoids gain, nothing counts as shunted', () => {
  const before = computeMetrics(make('pvt-chronic'));
  for (const id of ['X_SV_RPV', 'X_SV_LPV', 'X_SMV_RPV']) {
    const eng = make('pvt-chronic', { customShunts: { [id]: 10 } }), after = computeMetrics(eng);
    assert.ok(eng.Q[EI[id]] > 5, `${id} carries ${eng.Q[EI[id]]}`);
    assert.ok(after.ppg < before.ppg - 4, `${id}: PPG ${before.ppg} -> ${after.ppg}`);
    assert.ok(after.hepaticFlow > before.hepaticFlow, `${id}: the sinusoids get more blood`);
    assert.ok(after.shuntFraction <= before.shuntFraction, `${id}: shunt fraction ${before.shuntFraction} -> ${after.shuntFraction}`);
  }
});

test('a link between two portal veins adds nothing to the shunted blood, while a portal to systemic stent does', () => {
  const base = computeMetrics(make('cirr-decomp')), eng = make('cirr-decomp', { customShunts: { X_SV_RPV: 10 } }), m = computeMetrics(eng);
  assert.ok(eng.Q[EI.X_SV_RPV] > 1, 'it carries flow');
  assert.ok(m.shuntFraction <= base.shuntFraction + 1e-6, `shunt fraction ${base.shuntFraction} -> ${m.shuntFraction}`);
  const flows = routeFlows(eng.Q, eng.params);
  assert.equal(flows.custom, 0, 'not among the tool\'s custom shunted flow');
  const sys = make('cirr-decomp', { customShunts: { X_SV_RHV: 10 } });
  assert.ok(routeFlows(sys.Q, sys.params).custom > 1, 'a portal to systemic stent still counts');
});

test('a link takes the flow whichever way the pressure gives, and a wider one carries more', () => {
  const narrow = make('pvt-chronic', { customShunts: { X_SV_RPV: 6 } }), wide = make('pvt-chronic', { customShunts: { X_SV_RPV: 12 } });
  assert.ok(wide.Q[EI.X_SV_RPV] > narrow.Q[EI.X_SV_RPV], 'diameter grades the flow');
  const back = make('cirr-decomp', { customShunts: { X_CONF_RPV: 10 } });
  assert.ok(Number.isFinite(back.Q[EI.X_CONF_RPV]));
});
