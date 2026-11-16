// A congested outflow does not take the HVPG away from a cirrhotic liver (15 Nov 2026, Mohammad: "change the model to be like real life"). In pure right heart
// failure the wedged and free pressures rise together and the HVPG stays normal; with cirrhosis the gradient still follows the sinusoidal resistance and dips only
// a little with the lower inflow. The sinusoids used to dilate with the whole venous rise, so cirrhosis at 40% (HVPG 6.4) read 2 with the atrium at 24.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPatient } from '../src/engine/inverse-run.js';
import { HVPG_CUTS } from '../src/engine/pressure-cuts.js';

const hv = (f, p) => runPatient(f, p);

test('a congested outflow alone gives a normal HVPG: failure, constriction, a hepatic vein block, an IVC web', () => {
  for (const [f, p] of [['rhf', { rhf: 0.5 }], ['rhf', { rhf: 0.9 }], ['constr', { constr: 0.9 }], ['bcs', { bcs: 0.8 }], ['ivcweb', { ivcweb: 0.8 }]]) {
    const r = hv(f, p);
    assert.ok(r.hvpg < HVPG_CUTS.amber, `${f} ${JSON.stringify(p)}: HVPG ${r.hvpg}`);
    assert.ok(r.fhvp > 8 && r.whvp > r.fhvp - 0.5, `${f}: both pressures are raised (${r.whvp}, ${r.fhvp})`);
  }
});

// (A hepatic vein block, Budd-Chiari, is left out on purpose: with the veins shut the catheter reads the occluded vein, and the gradient across the liver is not the sinusoidal
// resistance any more, which is why the app prints no HVPG there.)
test('cirrhosis keeps its HVPG under a congested outflow: a mild dip, not the loss of it', () => {
  const alone = { 0.4: hv('sinus', { sinus: 0.4 }).hvpg, 0.7: hv('sinus', { sinus: 0.7 }).hvpg };
  assert.ok(Math.abs(alone[0.4] - 6.4) < 0.4 && Math.abs(alone[0.7] - 13.9) < 0.7, `cirrhosis alone is as it was: ${alone[0.4]}, ${alone[0.7]}`);
  for (const [f, p, from] of [['sinus+rhf', { sinus: 0.4, rhf: 0.8 }, 0.4], ['sinus+constr', { sinus: 0.4, constr: 0.8 }, 0.4], ['sinus+ivcweb', { sinus: 0.4, ivcweb: 0.8 }, 0.4],
    ['sinus+rhf', { sinus: 0.7, rhf: 0.8 }, 0.7], ['sinus+ivcweb', { sinus: 0.7, ivcweb: 0.8 }, 0.7]]) {
    const r = hv(f, p);
    assert.ok(r.hvpg >= 0.55 * alone[from], `${f} ${JSON.stringify(p)}: HVPG ${r.hvpg} against ${alone[from]} for cirrhosis alone`);
    assert.ok(r.hvpg <= alone[from] + 0.5, `${f}: congestion does not raise it either (${r.hvpg})`);
  }
  assert.ok(hv('sinus+rhf', { sinus: 0.7, rhf: 0.8 }).hvpg >= HVPG_CUTS.amber, 'cirrhosis at 70% still shows a raised gradient with a failing heart');
});
