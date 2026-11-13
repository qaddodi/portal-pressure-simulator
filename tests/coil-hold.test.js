import { stageSource } from './stage-src.js';
// A collateral's coil target is held either side of its threshold: a varix channel whose growth sat at a quarter flipped between
// straight and coiled 25 times in one Varices slide change (3 Nov 2026), each a new ease of its coil and a binning of every vessel.
import test from 'node:test';
import assert from 'node:assert/strict';

const st = stageSource();

test('coiled past a quarter, straight again only below a fifth', () => {
  assert.match(st, /coiled = g\.wigT > 0 \? sf > 0\.2 : sf > 0\.25;\n\s+const w = coiled \? 1\.5 \+ 3\.5 \* sf : 0;/);
});
