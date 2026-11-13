// One table of normal velocities (unification audit §4): velNormal.js PROBE_NORMAL. The Doppler's PROBES read their `normal` from it,
// the figure's DOPPLER_NORMAL is a subset of the very same arrays, and the stent's 190 cm/s ceiling is read from the stent probe's normal.
// (That PROBES and the stent reading take their numbers from the table, with no range written again in doppler.js, is a rule in
// scripts/source-shapes/doppler-unify.mjs, run by npm run lint.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROBE_NORMAL, DOPPLER_NORMAL, STENT_PV_NORMAL, velNormal } from '../src/ui/velNormal.js';
import { EDGES } from '../src/engine/topology.js';

const EI = Object.fromEntries(EDGES.map((e, i) => [e.id, i]));
const noStent = { D: EDGES.map((e) => (e.id === 'TIPS' || e.id === 'DIPS' ? 0 : 1)) };   // (the shunts closed: no stent in)

test('the figure\'s table and the Doppler\'s agree for every vessel in both: the same arrays', () => {
  for (const [id, n] of Object.entries(DOPPLER_NORMAL)) {
    assert.equal(n, PROBE_NORMAL[id], `${id}: the same array as the Doppler's`);
    assert.ok(EI[id] != null, `${id} is a vessel`);
  }
  for (const id of Object.keys(PROBE_NORMAL)) assert.ok(EI[id] != null, `${id} is a vessel`);
  for (const [id, [lo, hi]] of Object.entries(PROBE_NORMAL)) assert.ok(lo > 0 && hi > lo, `${id}: a range`);
});

test('the figure reads the Doppler\'s range for the vessels it fixes, and the main portal vein\'s stent range with a stent in', () => {
  for (const id of Object.keys(DOPPLER_NORMAL)) assert.equal(velNormal(EI[id], noStent, null), PROBE_NORMAL[id], id);
  const D = noStent.D.slice(); D[EI.TIPS] = 10;
  assert.equal(velNormal(EI.PV_TRUNK, { D }, null), STENT_PV_NORMAL);
  assert.equal(velNormal(EI.TIPS, { D }, null), PROBE_NORMAL.TIPS);
});

test('the numbers did not move in the merge: the Doppler\'s ranges as they were, and the figure\'s set of vessels as it was', () => {
  const was = {
    PV_TRUNK: [15, 40], PVH_R: [12, 35], PVH_L: [12, 35], SMV_CONF: [10, 30], V_INT: [10, 30], SV_CONF: [10, 30], V_SPL: [10, 30],
    RHV_IVC: [10, 40], MHV_IVC: [10, 40], LHV_IVC: [10, 40], IVCS_RA: [10, 50], A_HEP: [30, 100], A_HR: [30, 100], A_HL: [30, 100],
    TIPS: [90, 190], DIPS: [90, 190],
  };
  assert.deepEqual({ ...PROBE_NORMAL }, was);
  assert.deepEqual(Object.keys(DOPPLER_NORMAL).sort(),
    ['DIPS', 'IVCS_RA', 'LHV_IVC', 'MHV_IVC', 'PVH_L', 'PVH_R', 'PV_TRUNK', 'RHV_IVC', 'SMV_CONF', 'SV_CONF', 'TIPS', 'V_SPL']);
  // (two the Doppler samples stay out of the figure's colours, as before: the lumped jejunal and ileal veins, compared with their own healthy
  // velocity, and the hepatic arteries, which the figure leaves neutral)
  for (const id of ['V_INT', 'A_HEP', 'A_HR', 'A_HL']) assert.equal(DOPPLER_NORMAL[id], undefined, id);
  assert.equal(velNormal(EI.A_HEP, noStent, null), null, 'an artery has no colour range in the figure');
  assert.notEqual(velNormal(EI.V_INT, noStent, null), PROBE_NORMAL.V_INT);
});
