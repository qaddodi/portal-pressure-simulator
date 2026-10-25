// The arterial pressure falls with portal hypertension (Mohammad, 22 Oct: "Do the map change"). The baroreflex used to steer
// the mean arterial pressure back to 93 mmHg in every patient; it now defends a pressure reset by the chronic splanchnic and
// systemic vasodilation of the hyperdynamic circulation (AASLD 2024 portal hypertension guidance, introduction: "splanchnic
// and systemic vasodilation ... resulting in a hyperdynamic circulatory state, driven by decreased effective arterial blood
// volume"). Targets: healthy 93, compensated cirrhosis about 90, CSPH mid 80s, decompensated low 80s (the low-80s figure is
// textbook physiology, not a line in the three guideline files); the 65 mmHg at which Baveno VIII 4.6 stops the beta-blocker
// is reached only by a large bleed. The gut arteries' tone follows the lower driving pressure, so the portal pressures,
// varices and ascites of every patient stay within half a unit of their values at 93 mmHg, and the portal vein stays slow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { deepMerge } from '../src/engine/scenario.js';

const go = (id, p) => { const e = new Engine(); e.loadPreset(id); if (p) e.setParams(deepMerge(e.params, p)); e.settle(); return { e, m: computeMetrics(e) }; };
const r0 = (v) => v.toFixed(0);

test('the mean arterial pressure falls as portal hypertension advances, and the reflex is reset, not fighting it', () => {
  const h = go('healthy'), c = go('cirr-comp'), s = go('csph'), d = go('cirr-decomp');
  assert.ok(Math.abs(h.m.map - 93) < 1, `healthy MAP ${r0(h.m.map)}`);
  assert.ok(c.m.map >= 88 && c.m.map <= 92, `compensated MAP ${r0(c.m.map)}`);
  assert.ok(s.m.map >= 83 && s.m.map <= 88, `CSPH MAP ${r0(s.m.map)}`);
  assert.ok(d.m.map >= 79 && d.m.map <= 84, `decompensated MAP ${r0(d.m.map)}`);
  assert.ok(h.m.map > c.m.map && c.m.map > s.m.map && s.m.map > d.m.map, 'each stage lower than the last');
  // (Reset: the reflex sits near its neutral point in every patient; it is not withdrawn to lower the pressure, so the heart
  // rate and output of the hyperdynamic circulation stand as before.)
  for (const [id, x] of [['healthy', h], ['cirr-comp', c], ['csph', s], ['cirr-decomp', d]]) assert.ok(Math.abs(x.e.baro - 1) < 0.06, `${id}: baroreflex ${x.e.baro.toFixed(2)}`);
  assert.ok(d.m.hr >= 85 && d.m.co >= 6.5, `decompensated HR ${r0(d.m.hr)} CO ${d.m.co.toFixed(1)}: still hyperdynamic`);
});

test('the portal side keeps its numbers: HVPG, varix and ascites within half a unit of their values at 93 mmHg, the portal vein slow', () => {
  // (The values the decks were written to, before the arterial pressure fell: 21-22 Oct.)
  const were = { 'cirr-comp': { hvpg: 6.4 }, csph: { hvpg: 11.6, varix: 3.9 }, 'cirr-decomp': { hvpg: 16.9, varix: 7.7, asc: 1.06 }, 'pvt-chronic': { pv: 19.5, varix: 5.0 } };
  for (const [id, w] of Object.entries(were)) {
    const { m } = go(id);
    if (w.hvpg) assert.ok(Math.abs(m.hvpg - w.hvpg) <= 0.5, `${id}: HVPG ${m.hvpg.toFixed(1)} was ${w.hvpg}`);
    if (w.pv) assert.ok(Math.abs(m.pv - w.pv) <= 0.4, `${id}: PV ${m.pv.toFixed(1)} was ${w.pv}`);
    if (w.varix) assert.ok(Math.abs(m.varix.d - w.varix) <= 0.5, `${id}: varix ${m.varix.d.toFixed(2)} was ${w.varix}`);
    if (w.asc) assert.ok(Math.abs(m.ascites.volume / 1000 - w.asc) <= 0.1, `${id}: ascites ${(m.ascites.volume / 1000).toFixed(2)} L was ${w.asc}`);
  }
  assert.ok(go('cirr-decomp').m.pvVelMean < 15, 'the decompensated portal vein stays slow, under 15 cm/s');
});

test('patients without the vasodilation keep 93: right heart failure and constriction defend the healthy pressure', () => {
  for (const id of ['rhf', 'constrictive']) {
    const { e } = go(id);
    assert.ok(Math.abs(e.mapSetOf() - 93) < 0.5, `${id}: set-point ${e.mapSetOf().toFixed(1)}`);
  }
});

test('from the lower baseline, a litre lost is class II and not shock; terlipressin lifts the pressure; 65 mmHg takes a large bleed', () => {
  const d = go('cirr-decomp');
  const t = go('cirr-decomp', { drugs: { terlipressin: true } });
  assert.ok(t.m.map - d.m.map >= 5, `terlipressin MAP ${r0(d.m.map)} → ${r0(t.m.map)}`);
  const e = d.e; e.hemorrhage(1000); e.settle();
  const m1 = computeMetrics(e);
  assert.ok(m1.blood.shock === 2 && m1.map > 65 && m1.map >= d.m.map - 13, `1 L: class ${m1.blood.shock}, MAP ${r0(d.m.map)} → ${r0(m1.map)}`);
  e.hemorrhage(1000); e.settle();
  const m2 = computeMetrics(e);
  assert.ok(m2.map < 65, `2 L: MAP ${r0(m2.map)} is the shock Baveno VIII 4.6 speaks of`);
});
