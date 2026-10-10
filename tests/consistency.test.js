// Text matches the model: what a case's chart and results say about varices, ascites and the
// spleen must be what the simulation shows for that patient (the endoscopy pane and the figure
// draw the model, so a mismatch is visible to the student).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { defaultParams, deepMerge, PRESETS } from '../src/engine/scenario.js';
import { CASES } from '../src/ui/cases/index.js';

const run = (g) => { let n; do { n = g.next(); } while (!n.done); };
/** The patient's starting state, built the way cases.js builds it (setup actions aside). */
function state(cs) {
  const e = new Engine();
  const pd = PRESETS.find((p) => p.id === cs.preset)?.days || 0;
  run(e.loadPresetSteps(cs.preset, cs.days != null ? { days: cs.days + pd } : {}));
  if (cs.prep) e.setParams(deepMerge(defaultParams(), cs.prep(structuredClone(e.params)) || e.params));
  if (cs.afterDays) { run(e.advanceDaySteps(cs.afterDays)); e.settle(); }
  if (cs.params) { e.setParams(deepMerge(e.params, cs.params)); e.settle(); }
  return e;
}
const val = (x, c) => (typeof x === 'function' ? x(c) : x);
const texts = (cs, c) => {
  const out = [];
  const add = (x) => { if (!x) return; if (typeof x === 'string') out.push(x); else if (Array.isArray(x)) x.forEach(add); };
  for (const it of cs.chart(c)) { add(it.lines); add(it.rows); }
  for (const r of Object.values(cs.results || {})) { const x = val(r, c) || {}; add(x.lines); add(x.rows); add(x.extra); }
  for (const st of cs.steps || []) { try { add(val(st.q, c)); } catch { /* a question that needs a flag set mid-case */ } }
  return out.join(' \n ');
};

for (const base of CASES) for (const v of base.variants || [{}]) {
  const cs = { ...base, ...v }; Object.assign(cs, cs.build(cs));
  if (!cs.preset) continue;
  test(`${cs.id}/${cs.vid ?? '-'}: chart text agrees with the model`, () => {
    const e = state(cs), m = computeMetrics(e);
    const c = new Proxy({ cs, m, params: e.params, t: 0, hr: '80', bp: '120/80', flag: () => 'nsbb', hbLab: () => 7, count: () => 0, did: () => false, read: () => ({}) }, { get: (t, k) => (k in t ? t[k] : () => undefined) });
    const txt = texts(cs, c), g = m.varix.grade.label, asc = m.ascites.volume;
    const has = (re) => re.test(txt);
    if (has(/large esophageal varices/i)) assert.equal(g === 'Small' || g === 'None' ? g : 'Large', 'Large', `text says large esophageal varices, model has ${g} (${m.varix.d.toFixed(1)} mm)`);
    if (has(/small esophageal varices/i)) assert.equal(g, 'Small', `text says small esophageal varices, model has ${g}`);
    if (has(/\bno (esophageal )?varices/i)) assert.equal(g, 'None', `text says no varices, model has ${g}`);
    if (has(/\bno ascites/i)) assert.ok(asc < 300, `text says no ascites, model has ${Math.round(asc)} mL`);
    if (has(/tense ascites|distended abdomen/i)) assert.ok(asc > 1500, `text says tense/distended, model has ${Math.round(asc)} mL`);
    if (has(/small (amount of )?ascites|mild ascites/i)) assert.ok(asc >= 300 && asc < 3000, `text says small ascites, model has ${Math.round(asc)} mL`);
    for (const [, n] of txt.matchAll(/stiffness (?:of )?(\d+) kPa/gi)) assert.ok(Math.abs(+n - m.lsm) <= 3, `text says stiffness ${n} kPa, model ${m.lsm.toFixed(0)}`);
    for (const [, n] of txt.matchAll(/spleen (\d+) cm(?! below)/gi)) assert.ok(Math.abs(+n - m.spleen.length) <= 1, `text says spleen ${n} cm, model ${m.spleen.length.toFixed(1)}`);
  });
}

// Lessons whose text describes a change over time: the model must show it (learn.js).
test('varices lesson: thin varices grow large with red wale over six months', () => {
  const e = new Engine(); run(e.loadPresetSteps('csph', {}));
  assert.equal(computeMetrics(e).varix.grade.label, 'Small');
  e.setParams(deepMerge(e.params, { cirrhosis: 0.85 })); e.settle();
  run(e.advanceDaySteps(180)); e.settle();
  const m = computeMetrics(e);
  assert.equal(m.varix.grade.label, 'Large'); assert.ok(m.varix.redWale, 'red wale');
});
test('ascites lesson: about 4 litres to tap, and it comes back without diuretics', () => {
  const e = new Engine(); run(e.loadPresetSteps('cirr-decomp', {}));
  e.setParams(deepMerge(e.params, { diuretics: false })); e.settle();
  run(e.advanceDaySteps(300)); e.settle();
  const v = computeMetrics(e).ascites.volume;
  assert.ok(v > 3500 && v < 5500, `ascites ${Math.round(v)} mL`);
  e.paracentesis(5000, true); run(e.advanceDaySteps(90)); e.settle();
  assert.ok(computeMetrics(e).ascites.volume > 2000, 'fluid returns');
});

test('liver stiffness estimate: congestion adds about 2 kPa per mmHg and the curve flattens above HVPG 12', () => {
  const lsm = (hvpg, fhvp) => 5 + 2.2 * Math.max(0, Math.min(hvpg, 12) - 3) + 0.8 * Math.max(0, hvpg - 12) + 2 * Math.max(0, fhvp - 6);
  assert.ok(lsm(10, 6) > 19 && lsm(10, 6) < 22);
  assert.ok(Math.abs(lsm(10, 11) - lsm(10, 6) - 10) < 1e-9);
  assert.ok(lsm(20, 6) - lsm(12, 6) < 0.8 * 8 + 1e-9);
});

// One test for "has varices": the figure, circuit and endoscopy pane all call varicesPresent, which must follow the
// model's varix diameter (the 2.5 mm "none" cut-off) so no view shows varices another hides.
test('varicesPresent follows the model varix diameter and bands', async () => {
  const { varicesPresent } = await import('../src/ui/store.js');
  const fr = (d, bands = 0) => ({ metrics: { varix: { d }, gastricVarix: { d } }, bands });
  assert.equal(varicesPresent(fr(2.4)), false);
  assert.equal(varicesPresent(fr(2.5)), true);
  assert.equal(varicesPresent(fr(2.0, 2)), true);
  assert.equal(varicesPresent(fr(2.0, 2), 'GV'), false);
});

// Varices grow with the portosystemic gradient, not with absolute venous pressure: congestion from the heart
// (right heart failure, constriction) lifts the whole venous bed and its gradient stays near zero.
for (const [id, grows] of [['rhf', false], ['constrictive', false], ['cirr-decomp', true]]) {
  test(`${id}: ${grows ? 'has' : 'has no'} esophageal varices`, () => {
    const e = new Engine(); run(e.loadPresetSteps(id, {})); e.settle();
    const d = computeMetrics(e).varix.d;
    assert.equal(d >= 2.5, grows, `${id} varix ${d.toFixed(1)} mm`);
  });
}

test('esophageal varix size follows the portal-to-right-atrial gradient across every preset', () => {
  for (const pr of PRESETS.filter((x) => x.days >= 30)) {   // varices remodel over weeks: acute presets have not grown yet
    const e = new Engine(); run(e.loadPresetSteps(pr.id, {})); e.settle();
    const ex = e.routeExcess(['CONF', 'RA']), d = computeMetrics(e).varix.d;
    if (ex >= 11) assert.ok(d >= 2.5, `${pr.id}: gradient excess ${ex.toFixed(1)} but varix ${d.toFixed(1)} mm`);
    if (ex <= 6) assert.ok(d < 2.5, `${pr.id}: gradient excess ${ex.toFixed(1)} but varix ${d.toFixed(1)} mm`);
  }
});

test('varices take weeks to form, then follow the gradient in real time', () => {
  const e = new Engine(); run(e.loadPresetSteps('healthy', {}));
  assert.ok(computeMetrics(e).varix.d < 2.5);
  e.setParams(deepMerge(e.params, { cirrhosis: 1 })); e.settle();
  assert.ok(computeMetrics(e).varix.d < 2.5, 'none at onset');
  e.advanceDays(90, { noRupture: true, silent: true }); e.settle();
  assert.ok(computeMetrics(e).varix.d >= 5, `varix ${computeMetrics(e).varix.d.toFixed(1)} mm`);
  e.setParams(deepMerge(e.params, { cirrhosis: 0 })); e.settle();
  assert.ok(computeMetrics(e).varix.d < 2.5, 'and they are gone when the gradient is');
});
