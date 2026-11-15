// A preset's summary and note say what its tiles show (full app review 15 Nov, issues 7 and ENG-4): "HVPG ≥16" over a tile reading 15.7,
// "6 to 9" over 5.8, "no collaterals" over a 57% shunt. Each preset is settled with the breath running; the HVPG and PPG are taken at the
// lowest and highest point of the breath, so a sentence has to hold for every reading a tile can print, not only the mean. Every number the
// text gives for the HVPG must be one this test can read, so a new claim is checked the day it is written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { PRESETS } from '../src/engine/scenario.js';

const run = (g) => { let n; do { n = g.next(); } while (!n.done); };
const r1 = (v) => Math.round(v * 10) / 10;
const num = '(\\d+(?:\\.\\d+)?)';

function settled(id) {
  const e = new Engine(); run(e.loadPresetSteps(id, {})); e.settle(); e.beat = true;
  for (let i = 0; i < 1500; i++) e.step(0.004);
  const lo = { hvpg: Infinity, ppg: Infinity }, hi = { hvpg: -Infinity, ppg: -Infinity };
  let sum = 0, n = 0, m;
  for (let f = 0; f < 150; f++) {   // 15 s of model time, several breaths, read as the tiles do (one decimal)
    for (let i = 0; i < 25; i++) e.step(0.004);
    m = computeMetrics(e);
    for (const k of ['hvpg', 'ppg']) { lo[k] = Math.min(lo[k], r1(m[k])); hi[k] = Math.max(hi[k], r1(m[k])); }
    sum += m.hvpg; n++;
  }
  return { m, lo, hi, mean: sum / n };
}

// What a sentence may claim, as [pattern in the text, what must hold, the reading].
function check(text, r, id) {
  const { m, lo, hi, mean } = r;
  const fail = [];
  const need = (ok, why) => { if (!ok) fail.push(`${id}: "${text}" — ${why}`); };
  let t = text.replace(/≥/g, '>=').replace(/≈/g, '~').replace(/(\d)–(\d)/g, '$1 to $2');
  let claimed = 0;
  const each = (re, f) => { for (const x of t.matchAll(re)) { claimed++; f(x); } };
  // HVPG numbers
  each(new RegExp(`HVPG (?:about|~) ?${num}(?: to ${num})? mmHg`, 'g'), (x) => (x[2]
    ? need(lo.hvpg >= Number(x[1]) - 0.5 && hi.hvpg <= Number(x[2]) + 0.5, `HVPG about ${x[1]} to ${x[2]}, shown ${lo.hvpg} to ${hi.hvpg}`)
    : need(Math.abs(mean - Number(x[1])) <= 0.5, `HVPG about ${x[1]}, shown ${lo.hvpg} to ${hi.hvpg}`)));
  each(new RegExp(`HVPG >= ?${num}`, 'g'), (x) => need(lo.hvpg >= Number(x[1]), `HVPG >=${x[1]}, lowest shown ${lo.hvpg}`));
  each(new RegExp(`HVPG (?:in the normal )?${num} to ${num} mmHg`, 'g'), (x) => need(lo.hvpg >= Number(x[1]) && hi.hvpg <= Number(x[2]), `HVPG ${x[1]} to ${x[2]}, shown ${lo.hvpg} to ${hi.hvpg}`));
  each(new RegExp(`HVPG over ${num} and under ${num} mmHg`, 'g'), (x) => need(lo.hvpg > Number(x[1]) && hi.hvpg < Number(x[2]), `HVPG over ${x[1]} and under ${x[2]}, shown ${lo.hvpg} to ${hi.hvpg}`));
  each(/portal flow ~ ?(\d+(?:\.\d+)?) L\/min|portal flow about (\d+(?:\.\d+)?) L\/min/g, (x) => need(Math.abs(m.pvFlow - Number(x[1] || x[2])) <= 0.15, `portal flow ${x[1] || x[2]}, shown ${m.pvFlow.toFixed(2)}`));
  if (/HVPG[^.;]{0,24}\d/.test(t)) need(claimed > 0 || !/HVPG[^.;]{0,24}\d/.test(t.replace(/HVPG over[^)]*|HVPG[^.;]*/g, '')), 'a number beside HVPG this test cannot read: write it as "about N", "≥N", "N to M mmHg" or "over N and under M mmHg"');

  // Words
  if (/HVPG (?:stays |is )?normal/.test(t)) need(hi.hvpg <= 5, `HVPG called normal, highest shown ${hi.hvpg}`);
  if (/high WHVP and HVPG/.test(t)) need(lo.hvpg > 5, `high HVPG, lowest shown ${lo.hvpg}`);
  if (/normal portal pressure/.test(t)) need(hi.ppg < 6, `normal portal pressure gradient, highest shown ${hi.ppg}`);
  if (/(?:high portal pressure|[Pp]ortal pressure is high)/.test(t)) need(lo.ppg >= 6, `high portal pressure, lowest PPG shown ${lo.ppg}`);
  if (/no collateral(?:s yet| flow)/.test(t)) need(m.shuntFraction < 0.05, `no collaterals, but ${Math.round(m.shuntFraction * 100)}% of the inflow is shunted`);
  if (/preformed collaterals/.test(t)) need(m.shuntFraction > 0.1, `collaterals carry blood, but only ${Math.round(m.shuntFraction * 100)}% is shunted`);
  if (/reverses/.test(t)) need(m.pvFlow < 0, `reversed portal flow, shown ${m.pvFlow.toFixed(2)} L/min`);
  if (/(?:high right atrial|raises RA|RA pressure)/.test(t) && /(?:High right|raises RA)/.test(t)) need(m.ra > 10, `raised RA pressure, shown ${m.ra.toFixed(1)}`);
  if (/splenomegaly/.test(t)) need(m.spleen.length > 13, `splenomegaly, spleen ${m.spleen.length.toFixed(1)} cm`);
  // Varices and ascites: a sentence that says the patient grows them is not a statement about the resting size.
  const v = t.replace(/small varices (?:grow|enlarge)[^.]*|enlarge small varices|Varices (?:common|can form)|fundal varices/gi, '');
  if (/\bno varices/i.test(v)) need(m.varix.d < 2.5, `no varices, shown ${m.varix.d.toFixed(1)} mm`);
  if (/\bsmall varices/i.test(v)) need(m.varix.grade.label === 'Small', `small varices, shown ${m.varix.grade.label} (${m.varix.d.toFixed(1)} mm)`);
  if (/\blarge varices/i.test(v)) need(m.varix.grade.label === 'Large', `large varices, shown ${m.varix.grade.label} (${m.varix.d.toFixed(1)} mm)`);
  const asc = m.ascites.volume ?? m.ascites.L ?? 0;
  const noAsc = /(?:no ascites|ascites (?:is )?rare)/i.test(t);
  if (noAsc) need(asc < 500, `no ascites, shown ${Math.round(asc)} mL`);
  if (/massive ascites/i.test(t)) need(asc > 3000, `massive ascites, shown ${Math.round(asc)} mL`);
  if (!noAsc && /ascites/i.test(t) && !/massive/i.test(t)) need(asc >= 500, `ascites, shown ${Math.round(asc)} mL`);
  return fail;
}

test('every preset\'s summary and note agree with its settled readings', () => {
  const bad = [];
  for (const p of PRESETS) {
    const r = settled(p.id);
    for (const t of [p.summary, p.note]) bad.push(...check(t, r, p.id));
  }
  assert.deepEqual(bad, []);
});

test('the checker itself fails the old wording (review 15 Nov)', () => {
  const dec = settled('cirr-decomp'), comp = settled('cirr-comp'), healthy = settled('healthy'), pvt = settled('pvt-acute');
  assert.ok(check('HVPG ≥16 mmHg, large varices', dec, 'cirr-decomp').length > 0, 'HVPG ≥16 over a tile that reads 15.7');
  // (The old words were 6 to 9 over a tile the breath took to 5.8; since the readings are the breath's mean (15 Nov 2026, engine shownMean)
  // the tile reads 6.1 to 6.2, so the checker is shown a range the tile is outside.)
  assert.ok(check('HVPG 7 to 9 mmHg', comp, 'cirr-comp').length > 0, `7 to 9 over ${comp.lo.hvpg} to ${comp.hi.hvpg}`);
  assert.ok(check('HVPG ≈ 3 mmHg', healthy, 'healthy').length > 0, 'about 3 over 2.1 to 2.5 with the breath');
  assert.ok(check('Mesenteric congestion; no collaterals yet', pvt, 'pvt-acute').length > 0, 'no collaterals over a large shunt');
});
