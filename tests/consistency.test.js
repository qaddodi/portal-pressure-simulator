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
    for (const [, n] of txt.matchAll(/spleen (\d+) cm(?! below)/gi)) assert.ok(Math.abs(+n - m.spleen.length) <= 1, `text says spleen ${n} cm, model ${m.spleen.length.toFixed(1)}`);
  });
}
