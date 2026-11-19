// Wet Disse (16 Nov 2026): the Lobule's space of Disse is a sleeve as wide as the fluid filtered at each point of the sinusoid
// (lobule-model.js disseJ). Its spread must keep the engine's total and tell the three blocks apart: run on the engine's own presets.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/portal/engine.js';
import { computeMetrics } from '../src/engine/portal/metrics.js';
import { disseJ } from '../src/ui/lobule-model.js';

const HEALTHY = (() => { const e = new Engine(); e.loadPreset('healthy'); return e.starling().hep; })();
// The inputs the Lobule eases (lobule-zoom-field.js rzFill), read straight from a preset: portal venule and central vein pressure, the belly's
// pressure, albumin, the wall's albumin reflection coefficient, and the hepatic lymph against the healthy liver's.
function inputs(id) {
  const e = new Engine(); e.loadPreset(id);
  const m = computeMetrics(e), P = e.P, ni = e.ni, st = e.starling();
  return { p1: P[ni.SIN_R] + 0.6, p3: P[ni.CV_R], iap: m.ascites.iap, alb: e.params.albumin, sg: m.ascites.lymphSigma, lr: st.hep / HEALTHY };
}
const profile = (r) => Array.from({ length: 41 }, (_, i) => disseJ(r, 0.06 + (i / 40) * 0.94));
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

test('the sleeve keeps the engine\'s hepatic lymph: its mean is the rate against healthy', () => {
  for (const id of ['healthy', 'pvt-chronic', 'csph', 'cirr-decomp', 'sos', 'rhf']) {
    const r = inputs(id), m = mean(profile(r));
    assert.ok(Math.abs(m - r.lr) < 0.06 * Math.max(1, r.lr), `${id}: mean ${m.toFixed(2)} against ${r.lr.toFixed(2)}`);
  }
});

test('a clot before the sinusoid barely wets it; cirrhosis wets the portal edge; SOS wets it to the central vein', () => {
  const pvt = profile(inputs('pvt-chronic')), cir = profile(inputs('cirr-decomp')), sos = profile(inputs('sos'));
  assert.ok(Math.max(...pvt) < Math.max(...cir) / 3, `portal vein clot peaks at ${Math.max(...pvt).toFixed(2)}×, cirrhosis at ${Math.max(...cir).toFixed(2)}×`);
  const edge = (p) => p[p.length - 1], vein = (p) => p[0];
  assert.ok(edge(cir) > 3 * vein(cir), `cirrhosis: edge ${edge(cir).toFixed(2)} vs vein ${vein(cir).toFixed(2)}`);
  assert.ok(vein(sos) > 0.75 * edge(sos), `SOS: vein ${vein(sos).toFixed(2)} vs edge ${edge(sos).toFixed(2)}`);
  assert.ok(vein(sos) > 2 * vein(cir), 'SOS is wetter at the central vein than cirrhosis');
});

test('the profile is made again when an input moves (no stale table)', () => {
  const a = inputs('healthy'), b = { ...a, lr: a.lr * 3 };
  const x = disseJ(a, 0.5), y = disseJ(b, 0.5);
  assert.ok(Math.abs(y / x - 3) < 1e-3);
});
