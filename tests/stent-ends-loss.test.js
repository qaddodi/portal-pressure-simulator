// The loss bar's "Ends" part is the stent's own way in and way out (the kinetic loss at its two open ends, stent-geom.js stentParts entry), not the waist's
// Abrupt / Tapered ends: it scales with the flow squared, so a tighter waist (less flow) shrinks it but never to nothing in a patient with a working
// TIPS, and Tapered moves the jet and the friction, not it (play-test, 17 Nov 2026: "Ends reads 0.0 at 60 %").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/portal/engine.js';
import { computeMetrics } from '../src/engine/portal/metrics.js';
import { deepMerge, sanitizeParams } from '../src/engine/portal/scenario.js';

// (The waist is stentGeom.red, mid stent, since the two narrowings, 17 Nov 2026: an end stenosis is always a short abrupt segment, so Tapered is the waist's.)

const tipsAt = (s, trans, d = 8) => {
  const e = new Engine(); e.loadPreset('cirr-decomp');
  e.setParams(sanitizeParams(deepMerge(e.params, { tips: { on: true, d }, stentGeom: { TIPS: { trans, red: s } }, pulsatile: false, respiration: false })));
  e.settle(3);
  return computeMetrics(e).tips;
};

test('the Ends part is the stent\'s open ends: flow squared, there at a 60 % waist, and not moved by Abrupt or Tapered', () => {
  const t25 = tipsAt(0.25, 0), t60 = tipsAt(0.6, 0), t60t = tipsAt(0.6, 1);
  for (const t of [t25, t60, t60t]) assert.ok(t.parts.entry / (t.q * t.q) > 0, 'an open stent always has its ends');
  const k = (t) => t.parts.entry / (t.q * Math.abs(t.q));
  assert.ok(Math.abs(k(t60) / k(t25) - 1) < 1e-9, 'Ends is a fixed constant times the flow squared, whatever the waist');
  assert.ok(t25.parts.entry > 1, `25 %: ${t25.parts.entry.toFixed(2)} mmHg`);
  assert.ok(t60.parts.entry > 0.2, `60 %: ${t60.parts.entry.toFixed(2)} mmHg, printed as 0.2 or 0.3, never 0.0`);
  assert.ok(Math.abs(t60t.parts.entry / t60.parts.entry - 1) < 0.1, 'Tapered barely moves Ends (only through the flow)');
  assert.ok(t60t.parts.jet < t60.parts.jet * 0.8 && t60t.parts.wall > t60.parts.wall, 'Tapered moves the jet down and the friction up');
});
