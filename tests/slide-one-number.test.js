// One number for one value on a slide (play-test, 16 Nov 2026, Ascites): the lobule's figure printed 17.3 where the slide's words and
// card said 16.7, the lymph label read 2.2 mL/min beside a card of 3,450 mL/day, the fluid card's tile said "3,450 mL" with no "/day",
// "Net filtration 3.9 mmHg" sat under an "mL/day" title, and the data card's tiles ran behind the chart and the figure through a time-lapse.
// The cause was one thing each time: a reading was made twice, from two places, with its own rounding or its own unit.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { fingerprintOf } from '../src/engine/fingerprint.js';
import { NODES } from '../src/engine/topology.js';
import { lobuleState, LOBE } from '../src/ui/lobule-model.js';
import { breath, readAt } from '../src/ui/slide-read.js';
import { lymphDay, lymphText, LYMPH_UNIT } from '../src/ui/lymph-day.js';
import { fluidDay, fluidOf } from '../src/ui/tool-fluid.js';

const NI = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const frameOf = (e) => ({ P: Float32Array.from(e.P), Pf: Float32Array.from(e.Pf || e.P), Q: Float32Array.from(e.Q), params: structuredClone(e.params), metrics: computeMetrics(e) });
const csph = () => { const e = new Engine(); e.loadPreset('csph'); e.settle(); return e; };
const fpOf = (e) => fingerprintOf(computeMetrics(e), { P: e.Pf || e.P, Q: e.Qf || e.Q, D: Float32Array.from(e.edges, (ed) => e.diameter(ed.id)), copy: true, params: e.params, fluid: e.starling() });
const healthy = (() => { const e = new Engine(); e.loadPreset('healthy'); e.settle(); return { P: Float32Array.from(e.P), Q: Float32Array.from(e.Q), metrics: computeMetrics(e) }; })();

test('on a slide the lobule reads the slide\'s own sinusoid, portal and central vein pressures while the model is within a breath of them', () => {
  const e = csph(), fp = fpOf(e), f = frameOf(e);
  // the live model sits 0.6 mmHg off on the sinusoid (the play-test: 17.3 against the slide's 16.7) and 0.1 off on the others
  f.P[NI[LOBE.sin]] += 0.6; f.P[NI[LOBE.pv]] += 0.1; f.P[NI[LOBE.cv]] -= 0.1; f.Pf = f.P;
  const st = { params: f.params, healthy, presenting: true, presentFp: fp, colorMode: 'pressure', imaging: false, compareSnap: null, compareView: 'B' };
  const m = lobuleState(f, st);
  const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-4, `${msg}: ${a} vs ${b}`);
  near(m.P2, fp.sin, 'the sinusoid label is the slide\'s number');
  near(m.P1, fp.at.P[NI[LOBE.pv]], 'and the portal venule\'s');
  near(m.P3, fp.cv, 'and the central vein\'s');
  assert.equal(m.P2.toFixed(1), fp.sin.toFixed(1), 'printed to a tenth, as the tile prints it');
  assert.equal(m.lymph, fp.hepLymph);
  assert.equal(m.lyProt, fp.lymphProt);
});

test('a model that has really moved (a what-if, a time-lapse) is read live, and a slide that is not presenting reads the model', () => {
  const e = csph(), fp = fpOf(e), f = frameOf(e);
  f.P[NI[LOBE.sin]] += 3; f.Pf = f.P;
  const base = { params: f.params, healthy, presentFp: fp, colorMode: 'pressure', imaging: false, compareSnap: null, compareView: 'B' };
  assert.equal(lobuleState(f, { ...base, presenting: true }).P2, f.P[NI[LOBE.sin]], 'moved by 3 mmHg: the live number');
  const g = frameOf(e); g.P[NI[LOBE.sin]] += 0.6; g.Pf = g.P;
  assert.equal(lobuleState(g, { ...base, presenting: false }).P2, g.P[NI[LOBE.sin]], 'not presenting: the model\'s');
  assert.equal(lobuleState(g, { ...base, presenting: true, compareSnap: { P: healthy.P, metrics: healthy.metrics } }).P2, g.P[NI[LOBE.sin]], 'comparing a pinned moment: the model\'s');
});

test('the tolerance is one rule, shared by the anatomy\'s stations and the lobule (slide-read.js)', () => {
  assert.equal(breath(5), 0.8); assert.equal(breath(20), 1.6);
  assert.equal(readAt(17.3, 16.7), 16.7); assert.equal(readAt(18.5, 16.7), 18.5); assert.equal(readAt(NaN, 16.7), NaN); assert.equal(readAt(1, null), 1);
});

test('the lymph prints in mL/day with one rounding: the lobule label, its card, the sinusoid and the fluid card share it', () => {
  const e = csph(), f = e.starling(true), fl = fluidOf({ hepLymph: f.hep, splLymph: f.spl, lymphCap: e.slow.lymphCap, lymphOver: f.excess, lymphBack: f.bulk + f.water, lymphNet: f.net });
  const d = fluidDay(fl);
  assert.equal(d.liver, lymphDay(f.hep), 'the card\'s hepatic part is the label\'s number');
  assert.equal(d.made, lymphDay(f.hep) + lymphDay(f.spl), 'and the card\'s total is its two parts');
  assert.match(lymphText(f.hep), /^\d{1,3}(,\d{3})*$/);
  assert.equal(lymphDay(0.5), 720); assert.equal(lymphDay(-1), 0); assert.equal(LYMPH_UNIT, 'mL/day');
});
