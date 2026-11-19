// Crowded vessel labels read their clinical abbreviation first ("RPV 9.8"), before they drop a number or hide, and the full
// name comes back once a zoom makes room (Mohammad, 18 Oct). No abbreviation ends in a full stop (17 Oct design review).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHORT, ABBR } from '../src/ui/anatomy.js';


test('each abbreviation names a labelled vessel and none ends in a full stop', () => {
  assert.deepEqual(ABBR, { HA: 'HA', CONF: 'PV', PVH: 'PV', RPV: 'RPV', LPV: 'LPV', SV: 'SV', RHV: 'RHV', MHV: 'MHV', LHV: 'LHV', LGV: 'LGV', IVCI: 'IVC', RA: 'RA', LRV: 'LRV', RRV: 'RRV' });
  for (const [id, a] of Object.entries(ABBR)) {
    assert.ok(SHORT[id], `${id} has a full name`);
    assert.ok(a.length < SHORT[id].length, `${id}: "${a}" is shorter`);
    assert.doesNotMatch(a, /\./, `${id}: "${a}"`);
  }
});

