// Every vessel's spectrum in the main portal vein's style (the owner's standing rule; unification audit §4): the band fills from the
// baseline with the vein's brightness curve for the hepatic arteries, the TIPS and the DIPS too, and only the model's velocities and
// waveform differ. The spectrum is made in one place, the GPU's line shader (doppler-synth.js); there is no CPU copy of the formula.
// (The source shapes that go with this, no venous flag in doppler.js or doppler-gl.js, no CPU line writer, lineParams reading lineBand,
// are rules in scripts/source-shapes/doppler-unify.mjs, run by npm run lint.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SYNTH_FS, SYNTH_UNIS, lineBand, BAND_LOW } from '../src/ui/doppler-synth.js';
import { EDGES, dopplerK } from '../src/engine/topology.js';

test('the line shader has one band shape: no venous switch, no artery or stent branch', () => {
  assert.doesNotMatch(SYNTH_FS, /venous/i, 'the shader names no venous flag');
  assert.ok(!SYNTH_UNIS.includes('venous'), 'no venous uniform');
  // (the vein's curve, brightest just under the outline, is the only one; the artery's 0.16 + 0.84 f^1.3 is gone)
  assert.equal(SYNTH_FS.match(/0\.05 \+ 0\.1 \* f \+ 0\.9 \* exp\(-\(q \* q\)\)/g)?.length, 1);
  assert.doesNotMatch(SYNTH_FS, /pow\(f, 1\.3\)/);
  // (every uniform the drawer looks up is declared in the shader)
  for (const u of SYNTH_UNIS) assert.match(SYNTH_FS, new RegExp(`uniform [^;]*\\b${u}\\b`), u);
});

test('an artery, a stent and the portal vein get the same band: filled from the baseline, the same low edge for their mean', () => {
  assert.equal(lineBand.length, 4, 'lineBand(av, k, jit, out): no vessel kind among its inputs');
  const kOf = (id) => dopplerK(EDGES.find((e) => e.id === id));
  const band = (id, mean, jit = 0) => ({ ...lineBand(mean, kOf(id), jit, { P: 0, L: 0, sigHi: 0, sigLo: 0 }), k: kOf(id) });
  assert.equal(BAND_LOW, 0.05);
  for (const mean of [4, 20, 45, 110, 180]) {
    for (const jit of [0, -0.8, 1.1]) {
      const vein = band('PV_TRUNK', mean, jit);
      for (const id of ['A_HEP', 'A_HR', 'A_HL', 'TIPS', 'DIPS', 'RHV_IVC', 'IVCS_RA']) {
        const o = band(id, mean, jit);
        assert.ok(Math.abs(o.L / mean - 0.05) < 1e-12, `${id} at ${mean} cm/s: the band starts at 5 % of the mean (${o.L / mean})`);
        assert.equal(o.L, vein.L, `${id}: the same low edge as the portal vein`);
        // (the same L / P once each vessel's peak-to-mean factor, dopplerK, is taken out: only the velocities differ)
        assert.ok(Math.abs((o.L / o.P) * o.k - (vein.L / vein.P) * vein.k) < 1e-12, `${id}: the same L / P shape`);
        assert.ok(Math.abs(o.P - mean * o.k * (1 + 0.035 * jit)) < 1e-9, `${id}: the band's top is the peak, dopplerK × the mean`);
      }
    }
  }
  // (a slow artery is not narrowed toward a window either: the old band started at 0.05 to 0.45 of the mean by speed, for arteries and stents)
  for (const mean of [2, 8, 12, 60]) assert.equal(band('A_HEP', mean).L / mean, band('PV_TRUNK', mean).L / mean);
  // (with the same peak-to-mean factor, an artery's band is the vein's, number for number)
  const out1 = lineBand(37, 1 / 0.57, 0.3, {}), out2 = lineBand(37, 1 / 0.57, 0.3, {});
  assert.deepEqual(out1, out2);
});
