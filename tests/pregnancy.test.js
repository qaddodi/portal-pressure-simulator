// Pregnancy (params.gestation): what it does to the circulation, the "Cirrhosis in pregnancy" patient, and that at 0 weeks
// nothing changes for anyone else (src/ui/snapshots.js, checked by `npm test`, holds every other patient's numbers).
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { Engine, pregnancyLevel } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { deepMerge, sanitizeParams, PRESETS } from '../src/engine/scenario.js';

const within = (v, lo, hi, what) => assert.ok(v >= lo && v <= hi, `${what}: ${v.toFixed(2)} not in [${lo}, ${hi}]`);
const weeks = (e, w, extra = {}) => { e.setParams(deepMerge(e.params, { gestation: w, ...extra })); e.settle(); return computeMetrics(e); };

test('pregnancy level: 0 at 0 weeks, rising fastest early, complete by 30 weeks', () => {
  assert.equal(pregnancyLevel(0), 0);
  assert.equal(pregnancyLevel(undefined), 0);
  assert.ok(pregnancyLevel(12) > 0.5 && pregnancyLevel(12) < 0.8);
  assert.equal(pregnancyLevel(30), 1);
  assert.equal(pregnancyLevel(40), 1);
});

test('a healthy pregnancy at 30 weeks: hyperdynamic, more blood, diluted hemoglobin, a normal RA', () => {
  const e = new Engine(), m0 = computeMetrics(e), m = weeks(e, 30);
  within(m.co / m0.co, 1.35, 1.6, 'cardiac output ×');
  within(m.hr - m0.hr, 8, 20, 'heart rate rise');
  within(m.blood.volume / m0.blood.volume, 1.3, 1.5, 'blood volume ×');
  within(m.blood.hb, 11, 13, 'Hb');
  within(m.ra, 2, 6, 'RA');
  within(m.map, 85, 100, 'MAP');
  within(m.hvpg, 1, 5, 'HVPG');
});

test('the uterus raises abdominal pressure only after 20 weeks', () => {
  const e = new Engine(), iap0 = computeMetrics(e).ascites.iap;
  assert.ok(Math.abs(weeks(e, 20).ascites.iap - iap0) < 0.05);
  assert.ok(weeks(e, 40).ascites.iap > iap0 + 3);
});

test('back to 0 weeks: the same patient as before pregnancy, with no volume left behind', () => {
  const e = new Engine(); e.loadPreset('csph');
  const before = computeMetrics(e);
  weeks(e, 28);
  const after = weeks(e, 0);
  assert.equal(e.blood.preg, 0);
  for (const k of ['hvpg', 'pv', 'co', 'map', 'ra', 'hr']) assert.ok(Math.abs(after[k] - before[k]) < 0.05, `${k}: ${before[k]} → ${after[k]}`);
  assert.ok(Math.abs(after.blood.hb - before.blood.hb) < 0.05);
});

test('Cirrhosis in pregnancy: small varices before, large by the second trimester, small again on propranolol', () => {
  const pr = PRESETS.find((p) => p.id === 'pregnancy');
  assert.ok(pr && pr.group === 'Sinusoidal');
  const e = new Engine(); e.loadPreset('pregnancy');
  assert.equal(e.params.gestation, 24);
  const m24 = computeMetrics(e);
  const m0 = weeks(e, 0);
  within(m0.hvpg, 11.5, 13, 'HVPG before pregnancy');
  assert.equal(m0.varix.grade.label, 'Small');
  assert.equal(m0.ascites.grade, 0, 'no ascites');
  assert.equal(m24.varix.grade.label, 'Large');
  assert.ok(m24.varix.redWale, 'red wale signs at 24 weeks');
  assert.ok(m24.hvpg > m0.hvpg + 0.8, `HVPG ${m0.hvpg} → ${m24.hvpg}`);
  assert.ok(m24.pvFlow > m0.pvFlow * 1.25, 'portal inflow rises');
  assert.ok(m24.co > m0.co * 1.3, 'cardiac output rises');
  const rx = weeks(e, 24, { drugs: { propranolol: true } });
  assert.equal(rx.varix.grade.label, 'Small');
  assert.ok(rx.hvpg < m24.hvpg - 1.5);
});

test('gestation from a link is clamped to 0–40 weeks', () => {
  assert.equal(sanitizeParams({ gestation: 90 }).gestation, 40);
  assert.equal(sanitizeParams({ gestation: -3 }).gestation, 0);
  assert.equal(sanitizeParams({ gestation: 'x' }).gestation, 0);
  assert.equal(sanitizeParams({}).gestation, 0);
});

test('every patient can be made pregnant from the heart card: sane numbers at any week, and back to 0 is the same patient', () => {
  const src = readFileSync(new URL('../src/ui/actions.js', import.meta.url), 'utf8');
  const row = src.slice(src.indexOf("id: 'gestation'"), src.indexOf('PREGNANCY_INFO }', src.indexOf("id: 'gestation'")));
  assert.ok(row && !row.includes('showIf'), 'the heart card shows Pregnancy for every patient');
  for (const { id } of PRESETS) {
    const e = new Engine(); e.loadPreset(id);
    if (id === 'pregnancy') weeks(e, 0);
    const before = computeMetrics(e);
    for (const w of [12, 24, 40]) {
      const m = weeks(e, w);
      for (const k of ['hvpg', 'pv', 'ra', 'map', 'co', 'hr']) assert.ok(Number.isFinite(m[k]) && m[k] >= 0, `${id} ${w} weeks ${k}: ${m[k]}`);
      assert.ok(Array.from(e.P).every(Number.isFinite), `${id} ${w} weeks: a pressure is not a number`);
      within(m.ra, 0, 30, `${id} ${w} weeks RA`);
      within(m.map, 70, 110, `${id} ${w} weeks MAP`);
      within(m.hr, 55, 120, `${id} ${w} weeks heart rate`);
      within(m.ascites.iap, 0, 25, `${id} ${w} weeks abdominal pressure`);
    }
    const after = weeks(e, 0);
    for (const k of ['hvpg', 'pv', 'co', 'map', 'ra', 'hr']) assert.ok(Math.abs(after[k] - before[k]) < 0.05, `${id} ${k}: ${before[k]} → ${after[k]}`);
  }
});
