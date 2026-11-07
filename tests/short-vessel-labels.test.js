import { stageSource } from './stage-src.js';
// Crowded vessel labels read their clinical abbreviation first ("RPV 9.8"), before they drop a number or hide, and the full
// name comes back once a zoom makes room (Mohammad, 18 Oct). No abbreviation ends in a full stop (17 Oct design review).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHORT, ABBR } from '../src/ui/anatomy.js';

const stage = stageSource();

test('each abbreviation names a labelled vessel and none ends in a full stop', () => {
  assert.deepEqual(ABBR, { HA: 'HA', CONF: 'PV', PVH: 'PV', RPV: 'RPV', LPV: 'LPV', SV: 'SV', RHV: 'RHV', MHV: 'MHV', LHV: 'LHV', LGV: 'LGV', IVCI: 'IVC', RA: 'RA', LRV: 'LRV', RRV: 'RRV' });
  for (const [id, a] of Object.entries(ABBR)) {
    assert.ok(SHORT[id], `${id} has a full name`);
    assert.ok(a.length < SHORT[id].length, `${id}: "${a}" is shorter`);
    assert.doesNotMatch(a, /\./, `${id}: "${a}"`);
  }
});

test('the abbreviation is the first shortening step, kept with the slot, and the circuit\'s unit rule skips it', () => {
  const fn = stage.slice(stage.indexOf('  function shortenItem('), stage.indexOf('  const shortenTo ='));
  assert.match(fn, /if \(abbr && abbrevName\(it\)\) return true;\n\s+if \(it\.short === 2/);
  assert.match(stage, /short: it\.short \|\| 0, abbr: !!it\.abbr(, au: it\.au)?(, vh: [^}]+)? \}\);/, 'a solved slot remembers its abbreviation');
  assert.match(stage, /if \(\(prev\.short \|\| prev\.abbr\) && it\.canShort\) shortenTo\(it, \+prev\.short \|\| 0, prev\.abbr\);/, 'a carried slot reads it again');
  assert.match(stage, /if \(it\.short \|\| it\.abbr\) shortenTo\(n, it\.short \|\| 0, it\.abbr\);/, 'live values keep it');
  const pass = stage.slice(stage.indexOf('One unit rule for the whole circuit'), stage.indexOf('// Collateral and shunt lanes, captioned along their run.'));
  assert.match(pass, /shortenItem\(it, false\)/);
});
