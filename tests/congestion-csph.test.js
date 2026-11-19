// CSPH verdicts in congestion (tester finding, 16 Nov 2026): Constrictive pericarditis, Tests > Fibro, showed LSM 25.8 kPa with "CSPH ruled in" at an HVPG of 0.8.
// Baveno VIII's stiffness rules (1.15 to 1.17, 1.19) are for compensated advanced chronic liver disease; a congested liver (right heart failure, constrictive
// pericarditis, an IVC web, Budd–Chiari) is stiff from venous pressure. The eligibility check lives once, lsm-cuts.js congestedLiver (the free hepatic vein pressure),
// so the verdict, the bar, the tiles and the words all follow the state and no patient is named.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './dom-shim.js';
import { CONGESTION_FHVP, SCAR_MIN, congestedLiver, lsmContext, csphVerdict } from '../src/engine/portal/lsm-cuts.js';
import { stiffLayout, stiffWords, verdictOf, spleenVerdictOf, VERDICT, CONGESTION_NOTE, VASCULAR_NOTE, ctxFor } from '../src/ui/stiff-bar.js';
import { RATE } from '../src/ui/table-marks.js';

const meas = (s, font) => s.length * 0.56 * parseFloat(/([\d.]+)px/.exec(font)[1]);

test('the eligibility check: a congested or a vascular liver turns every CSPH verdict off, whatever the stiffness and platelets', () => {
  assert.equal(CONGESTION_FHVP, 8);
  assert.equal(congestedLiver(7.9), false);
  assert.equal(congestedLiver(8), true);
  assert.equal(congestedLiver(null), false);
  assert.equal(congestedLiver(NaN), false);
  assert.equal(lsmContext({ fhvp: 16.3, scar: 0.85, ppg: 3, lsm: 40 }), 'congested', 'cirrhosis with a failing heart is congested too');
  assert.equal(lsmContext({ fhvp: 4.1, scar: 0, ppg: 12.7, lsm: 22.4 }), 'vascular', 'SOS: no scar, portal hypertension, stiffness 22');
  assert.equal(lsmContext({ fhvp: 5, scar: 0, ppg: 28, lsm: 5 }), 'vascular', 'acute PVT: a normal stiffness does not exclude portal hypertension');
  assert.equal(lsmContext({ fhvp: 4.1, scar: 0, ppg: 4.3, lsm: 5 }), null, 'a healthy liver: nothing to apply the rules to, and nothing outside them');
  assert.equal(lsmContext({ fhvp: 4.1, scar: SCAR_MIN, ppg: 8, lsm: 12 }), null, 'a scar: the rules apply');
  assert.equal(lsmContext({ fhvp: 4.1, ppg: 12, lsm: 22 }), null, 'no scar given: read as the rules expect');
  assert.equal(lsmContext(null), null);
  for (const [lsm, plt] of [[25.8, 208], [12, 250], [18, 90], [40, null], [8, 300]]) {
    for (const ctx of ['congested', 'vascular']) assert.equal(csphVerdict(lsm, plt, ctx), ctx, `LSM ${lsm}`);
    assert.equal(csphVerdict(lsm, plt, null), csphVerdict(lsm, plt), 'no context: the rule as before');
  }
  assert.equal(csphVerdict(25.8, 208), 'in');
  assert.deepEqual(verdictOf(25.8, 208, 'congested'), VERDICT.congested);
  assert.deepEqual(verdictOf(22.4, 190, 'vascular'), VERDICT.vascular);
  assert.deepEqual(spleenVerdictOf(70, 'congested'), VERDICT.congested);
  assert.deepEqual(spleenVerdictOf(70, 'vascular'), ['CSPH ruled in', 'hi'], 'the spleen keeps its rule in vascular disease (SSM >40 is a sign of portal hypertension in PSVD, 8.44)');
  assert.deepEqual(spleenVerdictOf(70, null), ['CSPH ruled in', 'hi']);
  assert.equal(ctxFor('spleen', 'vascular'), null);
  assert.equal(ctxFor('liver', 'vascular'), 'vascular');
  assert.equal(csphVerdict(NaN, 200, 'congested'), null);
});

test('the tiles: a congested liver reads as information, never CSPH, for the liver and the spleen', () => {
  assert.deepEqual([...RATE.lsm(25.8, { fhvp: 16.3 })], ['info', 'Congestion']);
  assert.deepEqual([...RATE.ssm(70, { fhvp: 16.3 })], ['info', 'Congestion']);
  assert.deepEqual([...RATE.lsm(22.4, { fhvp: 4, scar: 0, ppg: 12.7, lsm: 22.4 })], ['info', 'Vascular']);
  assert.deepEqual([...RATE.lsm(5, { fhvp: 4, scar: 0, ppg: 28, lsm: 5 })], ['ok', 'Normal'], 'a normal stiffness is still normal');
  assert.deepEqual([...RATE.ssm(60, { fhvp: 4, scar: 0, ppg: 15, lsm: 6 })], ['hi', 'CSPH'], 'the spleen keeps its rule in vascular disease');
  assert.deepEqual([...RATE.lsm(25.8, { fhvp: 4.1 })], ['hi', 'CSPH']);
  assert.deepEqual([...RATE.lsm(25.8, {})], ['hi', 'CSPH']);
});

test('the bar: a congested liver shows its reading with no zone words and no verdict, the note says congestion, not fibrosis', () => {
  for (const organ of ['liver', 'spleen']) for (const W of [240, 320, 480]) for (const plt of [null, 208]) {
    const L = stiffLayout(W, 12, meas, { lsm: 25.8, plt: organ === 'liver' ? plt : null, note: true, organ, ctx: 'congested' });
    const said = L.texts.map((t) => t.t).join(' | ');
    assert.doesNotMatch(said, /ruled in|CSPH ruled|Suggests|No cACLD|cACLD,|Spares/, `${organ} ${W}: ${said}`);
    assert.match(said, /Congestion: CSPH rules do not apply/);
    assert.ok(L.rects.filter((r) => /^stiff\.z/.test(r.look) && r.look !== 'stiff.mk').every((r) => r.look === 'stiff.zn'), 'one neutral tint');
    for (const t of L.texts) {
      const w = meas(t.t, `400 ${12}px Inter`) * (t.look === 'stiff.v.mid' ? 1.05 : 1), x0 = t.anchor === 'middle' ? t.x - w / 2 : t.anchor === 'end' ? t.x - w : t.x;
      assert.ok(x0 >= -0.5 && t.y <= L.H + 0.5, `"${t.t}" inside, W ${W}`);
    }
  }
  assert.match(CONGESTION_NOTE, /congestion, not fibrosis/);
  assert.match(CONGESTION_NOTE, /not to congestion/);
  // the same layout without congestion is unchanged: zone words and a verdict
  const L0 = stiffLayout(320, 12, meas, { lsm: 25.8, plt: 208, note: true });
  assert.ok(L0.texts.some((t) => t.t === 'CSPH ruled in'));
  assert.match(stiffWords(25.8, 208, 'liver', 'congested'), /Congestion: CSPH rules do not apply/);
  assert.doesNotMatch(stiffWords(25.8, 208, 'liver', 'congested'), /ruled in/);
  assert.match(stiffWords(25.8, 208, 'liver', null), /CSPH ruled in/);
  // a vascular liver: the liver's bar says so, the spleen's bar is the usual one
  const V = stiffLayout(320, 12, meas, { lsm: 22.4, plt: 190, note: true, ctx: 'vascular' }).texts.map((t) => t.t).join(' | ');
  assert.match(V, /Vascular disease: CSPH rules do not apply/);
  assert.doesNotMatch(V, /cACLD|ruled/);
  assert.match(VASCULAR_NOTE, /not to vascular liver disease/);
  assert.match(stiffLayout(320, 12, meas, { lsm: 60, note: true, organ: 'spleen', ctx: 'vascular' }).texts.map((t) => t.t).join(' | '), /CSPH ruled in/);
});

test('every patient: the context follows the state alone, and every congested or vascular preset gets no CSPH verdict', async () => {
  const { Engine } = await import('../src/engine/portal/engine.js');
  const { computeMetrics } = await import('../src/engine/portal/metrics.js');
  const { PRESETS } = await import('../src/engine/portal/scenario.js');
  const bad = [], seen = { congested: [], vascular: [] };
  const outside = new Set(['Cardiac', 'Post-hepatic']);
  for (const pr of PRESETS) {
    const e = new Engine(); e.loadPreset(pr.id); e.beat = true;
    const m = computeMetrics(e), ctx = lsmContext(m), v = csphVerdict(m.lsm, m.spleen?.platelets, ctx);
    if (ctx) seen[ctx].push(pr.id);
    if (outside.has(pr.group) !== (ctx === 'congested')) bad.push(`${pr.id}: FHVP ${m.fhvp.toFixed(1)} reads ${ctx}`);
    if (Math.abs(m.fhvp - CONGESTION_FHVP) < 1) bad.push(`${pr.id}: FHVP ${m.fhvp.toFixed(1)} rests within 1 mmHg of the congestion line`);
    if (ctx && v !== ctx) bad.push(`${pr.id}: LSM ${m.lsm.toFixed(1)} reads ${v}`);
    if (!ctx && (v === 'congested' || v === 'vascular')) bad.push(`${pr.id}: a verdict with no context`);
    // a scarred liver (the rules' own patients) is never outside them for lack of a scar
    if (m.scar >= SCAR_MIN && ctx === 'vascular') bad.push(`${pr.id}: a scarred liver reads vascular`);
  }
  assert.deepEqual(bad, []);
  assert.deepEqual(seen.congested.sort(), ['budd-chiari', 'constrictive', 'ivc-web', 'rhf']);
  for (const id of ['sos', 'pvt-acute', 'pvt-chronic', 'schisto', 'psvd']) assert.ok(seen.vascular.includes(id), `${id} is vascular: ${seen.vascular.join(', ')}`);
  for (const id of ['healthy', 'postprandial', 'cirr-comp', 'csph', 'masld-csph', 'cirr-decomp', 'cirr-hepatofugal', 'gastric-varix', 'pregnancy']) assert.ok(!seen.vascular.includes(id) && !seen.congested.includes(id), `${id} keeps the rules`);
});

test('a patient built by hand: cirrhosis with a failing heart is congested too, so no scenario can show a verdict the rule does not allow', async () => {
  const { Engine } = await import('../src/engine/portal/engine.js');
  const { computeMetrics } = await import('../src/engine/portal/metrics.js');
  const e = new Engine(); e.loadPreset('cirr-decomp');
  e.setParams({ ...e.params, contractility: 0.25, tr: 0.9 }); e.settle();
  const m = computeMetrics(e);
  assert.equal(lsmContext(m), 'congested', `FHVP ${m.fhvp}`);
  assert.equal(csphVerdict(m.lsm, m.spleen?.platelets, lsmContext(m)), 'congested');
});
