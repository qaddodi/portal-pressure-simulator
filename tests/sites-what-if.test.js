// Review U19: the Sites talk's portal vein thrombosis, schistosomiasis and right heart failure slides carry live controls
// (a clot-size slider, a fibrosis slider over both lobes, normal and failing heart buttons). The slides' own states are
// unchanged; the controls move only the live model, and each shows what its slide teaches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SITES } from '../src/ui/decks/sites.js';
import { PRESETS, defaultParams } from '../src/engine/scenario.js';
import { runSteps } from './deck-states.js';

const slide = (id) => SITES.slides.find((s) => s.id === id);
const paths = (w) => [].concat(w.param);
const at = (o, p) => p.split('.').reduce((x, k) => x?.[k], o);
const patchOf = (w, x) => {
  const out = {};
  for (const p of paths(w)) { const ks = p.split('.'); let o = out; ks.slice(0, -1).forEach((k) => (o = o[k] ||= {})); o[ks.at(-1)] = x; }
  return out;
};
const presetParams = (id) => PRESETS.find((p) => p.id === id).apply(defaultParams());

test('the clot slider starts at the slide\'s occlusive clot and the fibrosis slider moves both lobes from their shared value', () => {
  const pvt = slide('pvt').whatIf, sch = slide('presin').whatIf;
  assert.deepEqual(paths(pvt), ['thrombus.PV_TRUNK']);
  assert.equal(at(presetParams('pvt-chronic'), 'thrombus.PV_TRUNK'), pvt.max);
  assert.deepEqual(paths(sch).sort(), ['fibrosis.L.pre', 'fibrosis.R.pre']);
  const p = presetParams('schisto');
  for (const k of paths(sch)) { const v = at(p, k); assert.ok(v >= sch.min && v <= sch.max, `${k} ${v} in range`); }
  assert.equal(at(p, 'fibrosis.R.pre'), at(p, 'fibrosis.L.pre'), 'both lobes start equal, so one slider can hold them');
  assert.deepEqual(patchOf(sch, 40), { fibrosis: { R: { pre: 40 }, L: { pre: 40 } } });
});

test('the heart buttons: the failing heart is the slide\'s own patient, the normal one the default heart', () => {
  const c = slide('cardiac').compare, own = c.find((o) => o.own), d = defaultParams(), p = presetParams('rhf');
  assert.equal(c.filter((o) => o.own).length, 1);
  for (const [k, v] of Object.entries(own.params)) assert.equal(p[k], v, `failing heart ${k}`);
  for (const [k, v] of Object.entries(c.find((o) => !o.own).params)) assert.equal(d[k], v, `normal heart ${k}`);
  // Both buttons switch the same keys, so either can follow the other.
  assert.deepEqual(Object.keys(c[0].params).sort(), Object.keys(c[1].params).sort());
});

test('the presenter moves every path of a what-if slider together', () => {
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(src, /paths = \[\]\.concat\(w\.param\)/);
  assert.match(src, /paths\.reduce\(\(a, path\) => merge\(a,/);
});

const pick = (f) => f.metrics ?? f;
test('the controls teach their slides: portal pressure follows the clot and the fibrosis with HVPG flat; the heart moves every station together', async () => {
  const pvt = slide('pvt').whatIf, sch = slide('presin').whatIf, c = slide('cardiac').compare;
  const [clot, none] = (await runSteps([{ preset: 'pvt-chronic' }, { params: patchOf(pvt, pvt.min) }])).map(pick);
  assert.ok(clot.pv - none.pv > 5, `portal pressure falls without the clot (${clot.pv} → ${none.pv})`);
  assert.ok(Math.abs(clot.hvpg - none.hvpg) < 1.5 && clot.hvpg < 5, `HVPG stays normal (${clot.hvpg}, ${none.hvpg})`);
  const [fib, clear] = (await runSteps([{ preset: 'schisto' }, { params: patchOf(sch, sch.min) }])).map(pick);
  assert.ok(fib.pv - clear.pv > 5, `portal pressure falls with the fibrosis (${fib.pv} → ${clear.pv})`);
  assert.ok(Math.abs(fib.hvpg - clear.hvpg) < 1.5 && fib.hvpg < 5 && clear.hvpg < 5, `HVPG stays near normal (${fib.hvpg}, ${clear.hvpg})`);
  const [fail, normal] = (await runSteps([{ preset: 'rhf' }, { params: c.find((o) => !o.own).params }])).map(pick);
  for (const k of ['pv', 'whvp', 'fhvp', 'ra']) assert.ok(fail[k] - normal[k] > 1, `${k} falls with a normal heart (${fail[k]} → ${normal[k]})`);
  assert.ok(Math.abs(fail.hvpg - normal.hvpg) < 1.5 && fail.hvpg < 5, `HVPG stays put (${fail.hvpg}, ${normal.hvpg})`);
});

test('Sites slide 7 (sinusoidal obstruction syndrome) never folds its ladder behind Show; every other slide keeps the fold', () => {
  assert.equal(slide('postsin').fold, false);
  for (const s of SITES.slides) if (s.id !== 'postsin') assert.equal(s.fold, undefined, s.id);
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(src, /ladderFold !== foldKey && slides\[want\]\?\.fold !== false/);
});
