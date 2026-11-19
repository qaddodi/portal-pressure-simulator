// The figure's keyboard walk (F15): the arrows step through the stations in the order the blood meets them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATIONS, stationsOf, stationStep } from '../src/ui/fig-stations.js';

const ALL = ['SMV_CONF', 'SV_CONF', 'PV_TRUNK', 'SIN_RR', 'SIN_LL', 'RHV_IVC', 'MHV_IVC', 'IVCS_RA', 'SVC_RA', 'organ:liver', 'organ:heart'];

test('seven stations, gut to heart', () => {
  assert.deepEqual(STATIONS.map((s) => s.name), ['Superior mesenteric vein', 'Splenic vein', 'Portal vein', 'Sinusoids', 'Hepatic veins', 'Inferior vena cava', 'Right atrium']);
  assert.deepEqual(stationsOf(ALL).map((s) => s.item), ['SMV_CONF', 'SV_CONF', 'PV_TRUNK', 'SIN_RR', 'RHV_IVC', 'IVCS_RA', 'organ:heart']);
});

test('forward walks toward the heart one station at a time and stops at the end', () => {
  let cur = null; const seen = [];
  for (let i = 0; i < 9; i++) { const s = stationStep(ALL, cur, 1); seen.push(s.name); cur = s.item; }
  assert.deepEqual(seen.slice(0, 7), STATIONS.map((s) => s.name));
  assert.equal(seen[7], 'Right atrium'); assert.equal(seen[8], 'Right atrium', 'the end is the heart: no wrap round');
  assert.deepEqual(stationStep(ALL, 'organ:heart', 1), { item: 'organ:heart', name: 'Right atrium', n: 7, of: 7 });
});

test('backward walks toward the gut and stops at the first station', () => {
  assert.equal(stationStep(ALL, 'PV_TRUNK', -1).item, 'SV_CONF');
  assert.equal(stationStep(ALL, 'SMV_CONF', -1).item, 'SMV_CONF');
});

test('from a vessel that is no station the walk starts at an end: first going on, last going back', () => {
  assert.equal(stationStep(ALL, 'SVC_RA', 1).item, 'SMV_CONF');
  assert.equal(stationStep(ALL, 'organ:liver', -1).item, 'organ:heart');
  assert.equal(stationStep(ALL, null, 1).n, 1);
});

test('a station that is not drawn is skipped; the circuit ends at its right atrium station', () => {
  const circuit = ['SMV_CONF', 'PV_TRUNK', 'SIN_LL', 'MHV_IVC', 'IVCS_RA', 'node:RA'];
  assert.deepEqual(stationsOf(circuit).map((s) => s.item), ['SMV_CONF', 'PV_TRUNK', 'SIN_LL', 'MHV_IVC', 'IVCS_RA', 'node:RA']);
  const s = stationStep(circuit, 'IVCS_RA', 1);
  assert.deepEqual(s, { item: 'node:RA', name: 'Right atrium', n: 6, of: 6 });
  assert.equal(stationStep(['SIN_RR'].slice(1), null, 1), null, 'nothing drawn: no walk');
  assert.equal(stationStep(circuit, 'SIN_RR', 1).item, 'MHV_IVC', 'a vessel that stands for a station (the other side of the sinusoids) counts as it');
});
