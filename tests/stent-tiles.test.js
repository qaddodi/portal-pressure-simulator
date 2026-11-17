// The stents' readings as tiles (the stent cards, 16 Nov 2026; plan /mnt/project-files/tips-geometry/tips-instrument-cards-plan.md §4): the flow, the
// pressure across the stent, its peak velocity, its narrowest lumen and the local losses' share, for the TIPS and for the DIPS. Each is one number from
// the engine's stentState, so the tile, the card and the Doppler cannot say different things; none is the PPG, and none is ever called an HVPG.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { deepMerge, sanitizeParams } from '../src/engine/scenario.js';
import { fingerprintOf } from '../src/engine/fingerprint.js';
import { stentReadsOf, dopplerK, EDGES } from '../src/engine/topology.js';
import { TILE, RATE, SCALE, STENT_RANGE, rateOf, tileOf } from '../src/ui/table-marks.js';

const settled = (patch, preset = 'cirr-decomp') => {
  const e = new Engine(); e.loadPreset(preset);
  e.setParams(sanitizeParams(deepMerge(e.params, patch))); e.settle(3);
  return e;
};
const SUFFIX = ['Flow', 'Dp', 'Vel', 'Lumen', 'LocalPct'];
const KEYS = ['tips', 'dips'].flatMap((k) => SUFFIX.map((x) => k + x));

test('every stent reading has a tile, a scale and a name that is not the PPG or the HVPG', () => {
  for (const k of KEYS) {
    const T = tileOf(k);
    assert.ok(T && T.t && T.n && T.u && T.long, `${k} has a tile with its words`);
    assert.ok(SCALE[k] && SCALE[k][1] > SCALE[k][0], `${k} has a scale`);
    assert.ok(!/HVPG/i.test(`${T.t} ${T.n} ${T.s} ${T.long}`), `${k} never says HVPG`);
  }
  assert.ok(/across/i.test(TILE.tipsDp.n) && /not the PPG/i.test(TILE.tipsDp.long), 'the pressure across the stent says it is not the PPG');
});

test('no stent, no readings: every key is null', () => {
  const f = fingerprintOf(computeMetrics(settled({})));
  for (const k of KEYS) assert.equal(f[k], null, k);
});

test('the readings are the engine’s own: flow, drop, peak velocity, lumen and local share', () => {
  for (const patch of [{ tips: { on: true, d: 8 } }, { tips: { on: true, d: 10 }, stenosis: { TIPS: 0.4 } }, { tips: { on: true, d: 10 }, stenosis: { TIPS: 0.4 }, stentGeom: { TIPS: { waist: 4 } } },
    { tips: { on: true, d: 12 }, stenosis: { TIPS: 0.6 }, stenosisSite: { TIPS: 'proximal' } }]) {
    const e = settled(patch), m = computeMetrics(e), t = m.tips, f = fingerprintOf(m);
    assert.ok(t, JSON.stringify(patch));
    assert.equal(f.tipsFlow, t.flow); assert.equal(f.tipsDp, t.dp);
    assert.ok(Math.abs(f.tipsLumen - t.d * (1 - t.s)) < 1e-9, 'the lumen is d (1 − s)');
    // the peak: the highest of the three Doppler points, the card's own reads of the stent's open mean velocity
    const d = e.diameter('TIPS') / 10, v = (Math.abs(t.q) / (Math.PI * d * d / 4)) * dopplerK(EDGES[e.ei.TIPS]);
    const reads = stentReadsOf(e.params, 'TIPS', v);
    assert.ok(Math.abs(f.tipsVel - Math.max(...reads)) < 1e-6, `peak ${f.tipsVel} against the card's ${Math.max(...reads)}`);
    assert.ok(reads.every((r) => r <= f.tipsVel + 1e-9));
    const local = (100 * (t.parts.entry + t.parts.jet + t.parts.inlet)) / t.dp;
    assert.ok(Math.abs(f.tipsLocalPct - local) < 1e-9 && f.tipsLocalPct > 0 && f.tipsLocalPct < 100, `local ${f.tipsLocalPct}`);
    assert.ok(Math.abs(f.tipsFric + f.tipsLocal - f.tipsDp) < 0.02, 'friction and local losses are the drop');
  }
});

test('a narrowing raises the peak velocity and the local share, and the stent’s drop is below the PPG', () => {
  const open = fingerprintOf(computeMetrics(settled({ tips: { on: true, d: 10 } }))), tight = fingerprintOf(computeMetrics(settled({ tips: { on: true, d: 10 }, stenosis: { TIPS: 0.5 } })));
  assert.ok(tight.tipsVel > 2 * open.tipsVel && tight.tipsLumen === 5 && open.tipsLumen === 10);
  assert.ok(tight.tipsLocalPct > open.tipsLocalPct, 'the jet is a local loss');
  for (const f of [open, tight]) assert.ok(f.tipsDp > 0 && f.tipsDp < f.ppg, `drop ${f.tipsDp} below PPG ${f.ppg}`);
});

test('the peak velocity is rated by the Doppler card’s own range, and the other readings carry no rating', () => {
  assert.deepEqual(STENT_RANGE, [90, 190]);
  const w = (v) => rateOf('tipsVel', { tipsVel: v })[1];
  assert.equal(w(130), 'Normal'); assert.equal(w(60), 'Low'); assert.equal(w(250), 'High');
  for (const k of KEYS.filter((x) => !/Vel$/.test(x))) assert.equal(RATE[k], undefined, `${k} is a number only`);
  // the patent 10 mm stent of the deck (tips-doppler's STENT) is in range, as its slide says
  const f = fingerprintOf(computeMetrics(settled({ tips: { on: true, d: 10 } })));
  assert.ok(f.tipsVel > STENT_RANGE[0] && f.tipsVel < STENT_RANGE[1], `${f.tipsVel}`);
});

test('a DIPS has its own readings, and the TIPS keys stay empty without a TIPS', () => {
  const f = fingerprintOf(computeMetrics(settled({ dips: { on: true, d: 10 } })));
  assert.ok(f.dipsFlow > 0 && f.dipsDp > 0 && f.dipsVel > 0 && f.dipsLumen === 10, JSON.stringify([f.dipsFlow, f.dipsDp, f.dipsVel, f.dipsLumen]));
  assert.equal(f.tipsVel, null);
});

test('the tray\'s caption keeps clear of the slider thumb: padding under the words (play-test 17 Nov 2026: the thumb covered "No waist")', async () => {
  const { appCss } = await import('./split-src.js');
  const pad = appCss().match(/\.se-panel \.se-cap \{[^}]*padding: (\d+)px 0 (\d+)px/);
  assert.ok(pad && +pad[2] >= 4, 'at least 4 px under the caption');
});

test('Tests going away by the panel switch (not close()) tells every pane it is out of sight, so the stent editor frees the vessel card (play-test F11)', async () => {
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
  const dock = readFileSync(new URL('../src/ui/dock.js', import.meta.url), 'utf8');
  assert.match(dock, /function away\(\) \{[^}]*p\.shown\?\.\(false\)/);
  assert.match(main, /if \(!instr && was\) dock\.away\(\)/);
});

test('the History badge keeps its room in the top bar, so the first edit does not tip the bar to icons (play-test R2-1)', async () => {
  const { appCss } = await import('./split-src.js');
  assert.match(appCss(), /\.topbar:not\(\[data-fit="2"\], \[data-fit="3"\]\) \.tb-act \.tb-hc:empty \{[^}]*visibility: hidden/);
});
