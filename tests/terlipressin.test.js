// Terlipressin raises the mean arterial pressure by 5 to 10 mmHg (Mohammad, 22 Oct: "Yes, make it stronger"; before, +2.5).
// Source: a rise of at least 5 mmHg by day 3 of terlipressin and albumin marks a response in type 1 hepatorenal syndrome
// (Nazar 2010, Hepatology 51:219, PMID 19877168). The AASLD 2024 portal hypertension guidance, EASL 2025 vascular liver
// diseases guideline and the Baveno VIII notes give no MAP figure for terlipressin; the 10 mmHg ceiling is the brief's.
// The other effects keep what they had: the portal pressure falls by 10 to 20 % (the design blueprint's "about 20 %"),
// the gut inflow and the varix fall, and the heart slows by less than 20 beats/min and still speeds up in a bleed.
// The model has no kidneys, so the kidney effect is not tested.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { deepMerge } from '../src/engine/scenario.js';

const go = (id, p) => { const e = new Engine(); e.loadPreset(id); if (p) e.setParams(deepMerge(e.params, p)); e.settle(); return { e, m: computeMetrics(e) }; };
const ter = { drugs: { terlipressin: true } };
const STAGES = ['cirr-comp', 'csph', 'cirr-decomp'];

test('terlipressin raises the mean arterial pressure by 5 to 10 mmHg at every stage of cirrhosis', () => {
  for (const id of STAGES) {
    const rise = go(id, ter).m.map - go(id).m.map;
    assert.ok(rise >= 5 && rise <= 10, `${id}: MAP rose ${rise.toFixed(1)} mmHg`);
  }
});

test('the decompensated patient goes from the low 80s to the high 80s, not past a normal pressure', () => {
  const off = go('cirr-decomp').m.map, on = go('cirr-decomp', ter).m.map;
  assert.ok(off >= 79 && off <= 84, `off ${off.toFixed(1)}`);
  assert.ok(on >= 86 && on <= 92, `on ${on.toFixed(1)}`);
});

test('the portal pressure and the varix still fall, and the gut inflow with them', () => {
  for (const id of ['csph', 'cirr-decomp']) {
    const a = go(id).m, b = go(id, ter).m, fall = (a.hvpg - b.hvpg) / a.hvpg;
    assert.ok(fall >= 0.10 && fall <= 0.20, `${id}: HVPG ${a.hvpg.toFixed(1)} → ${b.hvpg.toFixed(1)} (${(100 * fall).toFixed(0)} %)`);
    assert.ok(b.pv < a.pv, `${id}: portal vein pressure ${a.pv.toFixed(1)} → ${b.pv.toFixed(1)}`);
    assert.ok(b.varix.d < a.varix.d, `${id}: varix ${a.varix.d.toFixed(2)} → ${b.varix.d.toFixed(2)}`);
  }
  const a = go('cirr-decomp').m, b = go('cirr-decomp', ter).m;
  assert.ok(b.pvFlow < 0.7 * a.pvFlow, `portal inflow ${a.pvFlow.toFixed(2)} → ${b.pvFlow.toFixed(2)} L/min`);
});

test('the heart slows by less than 20 beats/min and the output falls by less than 15 %', () => {
  for (const id of STAGES) {
    const a = go(id).m, b = go(id, ter).m;
    assert.ok(b.hr < a.hr && a.hr - b.hr < 20, `${id}: HR ${a.hr.toFixed(0)} → ${b.hr.toFixed(0)}`);
    assert.ok(b.co < a.co && b.co > 0.85 * a.co, `${id}: output ${a.co.toFixed(2)} → ${b.co.toFixed(2)}`);
  }
});

test('a bleed on terlipressin still speeds the heart, from a higher pressure than without it', () => {
  const lose = (p) => { const { e, m } = go('cirr-decomp', p); e.hemorrhage(1000); e.settle(); return { before: m, after: computeMetrics(e) }; };
  const off = lose(), on = lose(ter);
  assert.ok(on.after.hr > on.before.hr + 15, `HR ${on.before.hr.toFixed(0)} → ${on.after.hr.toFixed(0)}`);
  assert.ok(on.after.map > off.after.map + 5, `MAP after a litre: ${off.after.map.toFixed(0)} without, ${on.after.map.toFixed(0)} with`);
});

test('the slowing is blunted by terlipressin alone: the other drugs keep their heart rates', () => {
  // (Propranolol blunts the reflex both ways through baroHr; terlipressin only the slowing, baroSlow.)
  const p = go('cirr-decomp', { drugs: { propranolol: true } }).m, c = go('cirr-decomp', { drugs: { carvedilol: true } }).m;
  assert.ok(p.hr >= 70 && p.hr <= 76, `propranolol HR ${p.hr.toFixed(0)}`);
  assert.ok(c.hr >= 72 && c.hr <= 80, `carvedilol HR ${c.hr.toFixed(0)}`);
});
