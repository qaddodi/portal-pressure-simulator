// The clinical tester's final list, 16 Nov 2026, each fixed at its cause:
// chronic PVT's portal flow (a cavernoma carries it round the clot), Budd–Chiari's HVPG (no catheter can enter: not measurable on every card, not 0.3), pregnancy's blood pressure
// (the baroreflex set point falls with the vasodilation: a lower mean pressure, a high output, a low resistance), and the EUS and IR PPG runs (the figure's names fade away for the needle).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './dom-shim.js';

const settled = async (id, over = {}, s = 20) => {
  const { Engine } = await import('../src/engine/engine.js');
  const { computeMetrics } = await import('../src/engine/metrics.js');
  const e = new Engine(); e.loadPreset(id);
  if (Object.keys(over).length) e.setParams({ ...e.params, ...over });
  e.beat = true;
  for (let i = 0; i < s / 0.004; i++) e.step(0.004);
  return { e, m: computeMetrics(e) };
};

test('chronic PVT: the portal flow is the cavernoma\'s hepatopetal flow, the trunk\'s velocity stays zero, and no row says stasis of the flow', async () => {
  const { RATE, stepOf } = await import('../src/ui/table-marks.js');
  const { m } = await settled('pvt-chronic', {}, 10), A = (await settled('pvt-acute', {}, 10)).m, H = (await settled('healthy', {}, 10)).m;
  assert.ok(m.pvFlowMean > 0.9 && m.pvFlowMean < 1.4, `a cavernoma carries about the portal flow: ${m.pvFlowMean.toFixed(2)} L/min`);
  assert.equal(Math.round(m.pvVelMean), 0, 'the main portal vein itself shows no flow on Doppler');
  assert.ok(m.liverPerfPct > 85, 'and the liver is perfused');
  assert.deepEqual([...RATE.pvFlow(m.pvFlowMean)], ['null', 'Hepatopetal'].map((x, i) => (i ? x : null)));
  assert.ok(A.pvFlowMean > 0 && A.pvFlowMean < 0.5, `acute: only preformed collaterals, ${A.pvFlowMean.toFixed(2)} L/min`);
  assert.ok(Math.abs(H.pvFlowMean - H.pvFlowMean) < 1e-9 && H.pvFlowMean > 0.9, 'a patent trunk still reads its own flow');
  if (stepOf) assert.notEqual(stepOf('pvFlow', m.pvFlowMean, 1.0, { pvVel: m.pvVelMean }), -2, 'no stasis arrow for a flow of 1 L/min');
});

test('Budd–Chiari: the HVPG is hidden as not measurable in Explore whatever was measured, and others show it as before', async () => {
  const { store, hiddenNow } = await import('../src/ui/store.js');
  const { hvBlocked } = await import('../src/engine/pressure-cuts.js');
  const { defaultParams, PRESETS } = await import('../src/engine/scenario.js');
  const bc = PRESETS.find((p) => p.id === 'budd-chiari').apply(defaultParams()), ch = PRESETS.find((p) => p.id === 'cirr-decomp').apply(defaultParams());
  assert.ok(hvBlocked(bc) && !hvBlocked(ch));
  const base = { mode: 'explore', presenting: false, hiddenReadouts: null };
  for (const flags of [{ hvpgMeasured: false, showHvpg: false }, { hvpgMeasured: true, showHvpg: false }, { hvpgMeasured: false, showHvpg: true }]) {
    assert.ok(hiddenNow({ ...base, ...flags, params: bc })?.has('trueHVPG'), `Budd–Chiari ${JSON.stringify(flags)}`);
  }
  assert.ok(!hiddenNow({ ...base, hvpgMeasured: true, showHvpg: false, params: ch })?.has('trueHVPG'), 'a measured patient keeps the number');
  assert.ok(!hiddenNow({ ...base, hvpgMeasured: false, showHvpg: true, params: ch })?.has('trueHVPG'));
  assert.ok(!hiddenNow({ ...base, presenting: true, params: bc })?.has('trueHVPG'), 'a lecture shows the model\'s value, as its notes say');
  assert.ok(store);
});

test('pregnancy: a normal pressure, a higher output and a lower resistance than the same woman not pregnant, at 24 and 36 weeks', async () => {
  const { m: m0 } = await settled('healthy', { gestation: 0 });
  for (const wk of [24, 36]) {
    const { m } = await settled('healthy', { gestation: wk });
    assert.ok(m.map < 100, `week ${wk}: MAP ${m.map.toFixed(0)}`);
    assert.ok(m.co >= m0.co * 1.25 && m.co <= m0.co * 1.6, `week ${wk}: output ${m0.co.toFixed(1)} → ${m.co.toFixed(1)}`);
    assert.ok(m.svr <= m0.svr * 0.8, `week ${wk}: resistance ${m0.svr.toFixed(1)} → ${m.svr.toFixed(1)}`);
    assert.ok(true, `week ${wk}: ${m.sbp.toFixed(0)}/${m.dbp.toFixed(0)}`);
  }
  // her portal numbers are those tuned before: the lower set point does not feed the gut less
  const { m: p } = await settled('pregnancy');
  assert.ok(p.hvpg > 11 && p.hvpg < 13.5 && p.ppg > 13 && p.ppg < 15.5, `HVPG ${p.hvpg.toFixed(1)}, PPG ${p.ppg.toFixed(1)}`);
  assert.ok(p.map >= 75 && p.map <= 90, `MAP ${p.map.toFixed(0)}`);
});

test('the EUS and IR PPG runs are quiet: the figure\'s names fade away while the needle works', async () => {
  globalThis.requestAnimationFrame ??= (cb) => setTimeout(() => cb(performance.now()), 4);
  globalThis.cancelAnimationFrame ??= (id) => clearTimeout(id);
  const { playProcedure } = await import('../src/ui/proc-anim.js');
  for (const [kind, quiet] of [['eus', true], ['eus', false]]) {
    const seen = [];
    const stage = new Proxy({ setCatheter: (c) => { if (c) seen.push(c.keep); }, cathStops: () => null, cathFocus: () => true, gliding: () => false, cathBoxes: () => [] }, { get: (t, k) => (k in t ? t[k] : () => null) });
    const run = playProcedure(stage, kind, { quiet });
    await new Promise((r) => setTimeout(r, 120));
    run?.stop?.({ home: false });
    assert.ok(seen.length, 'a frame reached the stage');
    assert.ok(seen.every((k) => k === !quiet), `${kind} quiet=${quiet}: keep ${[...new Set(seen)]}`);
  }
  const fs = await import('node:fs');
  for (const f of ['src/ui/eus-ppg.js', 'src/ui/ir-ppg.js']) assert.match(fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'), /quiet: true/, `${f} asks for it`);
});

test('Budd–Chiari: the esophageal varix is sized less by the gradient than in cirrhosis, so its wall stress stays under the tear point, and the card says why the HVPG is not measurable', async () => {
  const { m, e } = await settled('budd-chiari', {}, 20);
  const v = e.varix('VAR', e.Pf || e.P);
  assert.ok(v.ratio < 1, `wall stress ${(v.ratio * 100).toFixed(0)}% of the tear point`);
  assert.ok(v.r > 2, `still a varix, ${v.r.toFixed(1)} mm`);
  assert.ok(m.ppg > 18, 'the portal pressure itself is not touched');
  const { NOT_MEASURABLE_WHY } = await import('../src/engine/pressure-cuts.js');
  assert.equal(NOT_MEASURABLE_WHY, 'Not measurable (hepatic vein outflow obstructed)');
  const { m: c, e: ce } = await settled('cirr-decomp', {}, 20);
  assert.ok(ce.varix('VAR', ce.Pf || ce.P).ratio > 1.2, 'cirrhosis keeps its own rule');
});

// "Not measurable" has to be SEEN, not only in the DOM (tester T04, 16 Nov 2026: the span was there with no width, and the number read "? mmHg"). No unit test has a layout,
// so this one holds the three things that make the words visible to what draws them, and scripts/blocked-hvpg-visible.mjs measures them in a real page (on request, never in CI).
test('Budd–Chiari: the HVPG tiles and tab draw their words: no zero-size rule reaches them, the number is a dash, the three readings say it', async () => {
  const fs = await import('node:fs');
  const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  const css = fs.readdirSync(new URL('../styles/', import.meta.url)).filter((f) => f.endsWith('.css')).map((f) => read(`styles/${f}`)).join('\n');
  // Every rule that draws a status word at size 0 hangs on .unmeas (the phone's one-word swap), so a tile without that class draws its own words.
  const zero = [...css.matchAll(/([^{}]*\.status[^{}]*)\{[^}]*font-size:\s*0\s*[;}]/g)].map((m) => m[1].trim());
  assert.ok(zero.length && zero.every((sel) => /\.unmeas/.test(sel)), `zero-size status rules: ${zero.join(' | ')}`);
  for (const f of ['src/ui/readouts-pane.js', 'src/ui/dock.js']) {
    const src = read(f);
    assert.match(src, /v == null && !x\.nm/, `${f}: a blocked HVPG tile is not .unmeas, so its words are drawn at their own size`);
    assert.match(src, /setNone\(x\.val, nm \? NOT_SHOWN : '\?'\)/, `${f}: the number is a dash, not "?"`);
    assert.match(src, /nm \? NOT_MEASURABLE : 'Not measured'/, `${f}: the word`);
  }
  const proc = read('src/ui/hvpg-proc.js');
  assert.match(proc, /nm \? NOT_MEASURABLE : NOT_SHOWN/, 'the HVPG tab: FHVP, WHVP and HVPG say it, not a dash');
  assert.match(css, /\.hvpg-kv dd\[data-nm="1"\]\s*\{[^}]*font-size:\s*12px[^}]*white-space:\s*normal/, 'in a size that fits its column, on two lines');
});
