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

test('the heart buttons: the failing heart is the slide\'s own patient, the normal one a healthy circulation', () => {
  const c = slide('cardiac').compare;
  assert.equal(c.filter((o) => o.own).length, 1);
  assert.equal(slide('cardiac').preset, 'rhf');
  // (Normal heart is the healthy patient, not the failing one with its pump fixed: that kept the retained fluid and 5.5 L of
  // ascites, so the hepatic veins and the portal vein stayed high, PPG 8, Mohammad 17 Oct.) No station block: block left out.
  const nrm = c.find((o) => !o.own);
  assert.equal(nrm.preset, 'healthy');
  assert.equal(nrm.block, undefined);
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
  // Normal heart: the healthy circulation the button eases to, every station and gradient in the normal range and no fall
  // between neighbouring stations above the ladder's 4 mmHg block; Failing heart: the slide's own state, all stations high.
  const [fail, normal] = (await runSteps([{ preset: 'rhf' }, { preset: c.find((o) => o.preset).preset }])).map(pick);
  for (const k of ['pv', 'whvp', 'fhvp', 'ra']) assert.ok(fail[k] - normal[k] > 1, `${k} falls with a normal heart (${fail[k]} → ${normal[k]})`);
  assert.ok(Math.abs(fail.hvpg - normal.hvpg) < 2.5 && fail.hvpg < 5 && normal.hvpg < 5, `HVPG stays normal (${fail.hvpg}, ${normal.hvpg})`);
  assert.ok(normal.ppg < 6, `normal PPG (${normal.ppg})`);
  assert.ok(normal.pv < 10 && normal.ra < 6 && normal.ivc < 6 && normal.fhvp - normal.ivc < 2, `normal ladder (${normal.pv}, ${normal.fhvp}, ${normal.ivc}, ${normal.ra})`);
  assert.ok(!(normal.asc > 0), `no ascites (${normal.asc})`);
  const lad = [normal.pv, normal.whvp, normal.fhvp, normal.ivc, normal.ra];
  for (let j = 1; j < lad.length; j++) assert.ok(lad[j - 1] - lad[j] <= 4, `no block between stations ${j - 1} and ${j} (${lad})`);
});

test('Sites slide 7 (sinusoidal obstruction syndrome) never folds its ladder behind Show; every other slide keeps the fold', () => {
  assert.equal(slide('postsin').fold, false);
  for (const s of SITES.slides) if (s.id !== 'postsin') assert.equal(s.fold, undefined, s.id);
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(src, /ladderFold !== foldKey && slides\[want\]\?\.fold !== false/);
});

test('on a phone a what-if slider takes a full line under its label', () => {
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.pz\.stack \.pzi-t \{ flex: 1 0 100%; \}/);
  assert.match(css, /\.pz-wi \{[^}]*flex-wrap: wrap/);
});

test('a patient compare button eases the live model to its computed patient and back; the ladder\'s station block follows it', () => {
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(src, /\.\.\.\(s\.compare \|\| \[\]\)\.filter\(\(o\) => o\.preset\)/);
  assert.match(src, /stateReady\(o\.preset \? extraOf\.get\(xKey\(o\)\) : stateOf\[i\]\)/);
  assert.match(src, /abBlk = \{ s, block: o\.preset \? o\.block \?\? null : s\.block \}/);
  assert.match(src, /block: blockOf\(s\)/);
});

test('the slide count is not left grey (as if the list were open) on a slide picked from the slide list', () => {
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(src, /'aria-expanded': String\(!ui\.jump\.hidden && !ui\.jump\.classList\.contains\('pz-leave'\)\)/);
});
