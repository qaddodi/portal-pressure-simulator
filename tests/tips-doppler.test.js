// The TIPS Doppler talk teaches what the model shows: with a working stent every intrahepatic branch flows toward it
// (left portal vein reversed, right portal vein before the stent hepatopetal, the right branches beyond it reversed),
// the stent runs at 90–190 cm/s and the main portal vein speeds up past 30 cm/s; narrowed, the stent slows under 90 cm/s, the main
// portal vein slows under 30 cm/s and the left portal vein turns back toward the liver. The slides are run as the presenter runs them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { EDGES, dopplerK } from '../src/engine/topology.js';
import { deepMerge } from '../src/engine/scenario.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { TIPS_DOPPLER } from '../src/ui/decks/tips-doppler.js';

// The Doppler's reading: flow over the lumen, scaled to the spectrum's peak (topology.js dopplerK).
const vel = (e, id) => { const k = e.ei[id], d = e.diameter(id) / 10; return (e.Q[k] / (Math.PI * d * d / 4)) * dopplerK(EDGES[k]); };
const slide = (id) => TIPS_DOPPLER.slides.find((s) => s.id === id);
function run(upTo) {
  const e = new Engine();
  for (const s of TIPS_DOPPLER.slides) {
    if (s.preset) e.loadPreset(s.preset);
    if (s.params) { e.setParams(deepMerge(e.params, s.params)); e.settle(); }
    if (s.days) { e.advanceDays(s.days, { noRupture: true, silent: true }); e.settle(); }
    if (s.id === upTo) return e;
  }
  throw new Error(`no slide ${upTo}`);
}

test('a working TIPS: fast stent, faster portal vein, every branch toward the stent', () => {
  const before = run('before'), e = run('stent');
  assert.ok(vel(e, 'TIPS') >= 90 && vel(e, 'TIPS') <= 190, `stent ${vel(e, 'TIPS')}`);
  assert.ok(vel(e, 'PV_TRUNK') > 30 && vel(e, 'PV_TRUNK') > vel(before, 'PV_TRUNK') + 10, `the main portal vein speeds up past 30 cm/s (${vel(e, 'PV_TRUNK')})`);
  assert.ok(vel(before, 'PV_TRUNK') < 15, 'slow before the stent');
  assert.ok(vel(before, 'PVH_L') > 9, 'the left portal vein is hepatopetal before the stent');
  assert.ok(vel(e, 'PVH_L') < -5, `left portal vein toward the stent (${vel(e, 'PVH_L')})`);
  assert.ok(vel(e, 'PVH_R') > 9, 'right portal vein before the stent runs on into it');
  assert.ok(e.Q[e.ei.PRE_R] < 0, 'right branches beyond the stent drain back toward it');
  assert.ok(computeMetrics(e).ppg < 12, 'the PPG falls under 12 mmHg');
});

test('a narrowed TIPS: slow stent, slower portal vein, a hepatopetal left portal vein, varices back', () => {
  const ok = run('stent'), e = run('narrow');
  assert.ok(vel(e, 'TIPS') > 2 && vel(e, 'TIPS') < 90, `stent ${vel(e, 'TIPS')}`);
  assert.ok(vel(e, 'PV_TRUNK') < 30 && vel(e, 'PV_TRUNK') < vel(ok, 'PV_TRUNK') - 5, `the main portal vein slows under 30 cm/s (${vel(e, 'PV_TRUNK')})`);
  assert.ok(vel(e, 'PVH_L') > 9, `left portal vein back toward the liver (${vel(e, 'PVH_L')})`);
  const m = computeMetrics(e);
  assert.ok(m.ppg >= 12 && m.ascites.volume > 150, 'the gradient and the fluid come back');
  assert.ok(m.varix.r > computeMetrics(ok).varix.r, 'the varices grow again');
});

test('the talk uses the lenses it teaches, and every lens is one the presenter knows', () => {
  const lenses = new Set(TIPS_DOPPLER.slides.map((s) => s.lens).filter(Boolean));
  for (const k of ['velocity', 'flow', 'direction', 'heat']) assert.ok(lenses.has(k), k);
  for (const k of lenses) assert.ok(['velocity', 'flow', 'direction', 'heat', 'drop', 'delta', 'origin'].includes(k), k);
  assert.equal(slide('left').tool.vessel, 'PVH_L');
  assert.equal(slide('warn').whatIf.param, 'stenosis.TIPS');
});

test('proximal, mid and distal stent velocities: the narrowed stent slows along its length and jets through its hepatic vein end', async () => {
  const { stentSegments } = await import('../src/engine/topology.js');
  const ok = run('stent'), [p0, m0, d0] = stentSegments(vel(ok, 'TIPS'), 0);
  assert.ok(p0 === m0 && m0 === d0 && p0 >= 90 && p0 <= 190, `a working stent reads the same at all three points (${p0})`);
  const e = run('narrow'), [p, m, d] = stentSegments(vel(e, 'TIPS'), slide('narrow').params.stenosis.TIPS);
  assert.ok(p < 90 && m < 90, `proximal and mid slow under 90 (${p})`);
  assert.ok(d > 190, `the distal jet runs over 190 cm/s (${d})`);
});

test('a stent narrows at a short pinch in the segment its card names', async () => {
  const { stentSegments, stentSite } = await import('../src/engine/topology.js');
  assert.equal(stentSite({}, 'TIPS'), 'distal', 'the hepatic vein end by default');
  assert.equal(stentSite({ stenosisSite: { TIPS: 'nowhere' } }, 'TIPS'), 'distal');
  const [p, m, d] = stentSegments(100, 0.5, 'proximal');
  assert.ok(p === 400 && m === 100 && d === 100, 'only the narrowed segment speeds up');
  // A short pinch costs far less than the old whole-stent narrowing: a mild one barely slows the stent.
  const e = run('stent'), open = vel(e, 'TIPS');
  e.setParams(deepMerge(e.params, { stenosis: { TIPS: 0.2 } })); e.settle();
  assert.ok(vel(e, 'TIPS') > 0.85 * open, `a 20 % pinch keeps most of the flow (${vel(e, 'TIPS')} vs ${open})`);
  // The model's flow does not depend on where the pinch sits; only the readings move.
  const q = e.Q[e.ei.TIPS];
  e.setParams(deepMerge(e.params, { stenosisSite: { TIPS: 'proximal' } })); e.settle();
  assert.ok(Math.abs(e.Q[e.ei.TIPS] - q) < 1e-6 * Math.max(1, Math.abs(q)), 'same flow wherever the pinch sits');
  // A shunt drawn with the stent tool narrows the same way, and a full occlusion closes it.
  const c = run('stent'), id = 'X_SMV_IVCS';
  c.setParams(deepMerge(c.params, { customShunts: { [id]: 10 } })); c.settle();
  const q0 = c.Q[c.ei[id]];
  c.setParams(deepMerge(c.params, { stenosis: { [id]: 0.6 } })); c.settle();
  assert.ok(c.Q[c.ei[id]] > 0 && c.Q[c.ei[id]] < q0, `a pinched stent-tool shunt carries less (${c.Q[c.ei[id]]} vs ${q0})`);
  c.setParams(deepMerge(c.params, { thrombus: { [id]: 1 } })); c.settle();
  assert.equal(c.Q[c.ei[id]], 0, 'an occluded stent carries nothing');
});

test('the Doppler gate reads one third of a stent, and slides name gates and segments the code knows', async () => {
  const { stentGate, STENT_SPANS, stentSegments } = await import('../src/engine/topology.js');
  assert.equal(stentGate(undefined, {}, 'TIPS'), 'mid', 'mid stent by default');
  assert.equal(stentGate('site', {}, 'TIPS'), 'distal', "'site' follows the narrowing, distal by default");
  assert.equal(stentGate('site', { stenosisSite: { TIPS: 'proximal' } }, 'TIPS'), 'proximal');
  for (const [k, [a, b]] of Object.entries(STENT_SPANS)) assert.ok(a < b && a >= 0 && b <= 1, k);
  const ok = new Set(['proximal', 'mid', 'distal', 'site']);
  for (const s of TIPS_DOPPLER.slides) {
    if (s.tool?.gate) assert.ok(ok.has(s.tool.gate), `${s.id}: gate ${s.tool.gate}`);
    for (const m of s.marks || (s.mark ? [s.mark] : [])) if (m.seg) assert.ok(ok.has(m.seg), `${s.id}: seg ${m.seg}`);
    for (const o of s.compare || []) if (o.gate) assert.ok(ok.has(o.gate) && s.tool?.kind === 'doppler', `${s.id}: compare gate`);
  }
  // Moving the narrowing along the stent (the 'where' slide): the jet moves with it, and only that third runs over 190 cm/s.
  const e = run('narrow'), v = vel(e, 'TIPS'), s0 = slide('narrow').params.stenosis.TIPS;
  for (const o of slide('where').compare) {
    const site = o.params.stenosisSite.TIPS, reads = stentSegments(v, s0, site);
    reads.forEach((r, i) => assert.ok(['proximal', 'mid', 'distal'][i] === site ? r > 190 : r < 90, `${site}: ${reads}`));
  }
});
