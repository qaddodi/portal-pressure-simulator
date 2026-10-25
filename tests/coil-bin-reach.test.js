// A collateral that never coils (spontaneous, or kept straight) has no coil target, so its binning reach must stay a number:
// a NaN reach spoils binVeins' bounds and no vessel draws at all (the outflow talk on 18 Oct).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { binVeins } from '../src/ui/veins-bin.js';

const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');

test('binTube treats a collateral with no coil target as settled', () => {
  assert.match(stage, /if \(!g \|\| g\.wigT == null \|\| g\.wig === g\.wigT\) \{ binFrom\.delete\(it\.row\); return \{ id: it\.row, pts, reach, core \}; \}/);
});

test('one vessel with a NaN reach leaves binVeins with no cells (why the guard matters)', () => {
  const line = (y) => Array.from({ length: 8 }, (_, i) => [i * 10, y]);
  const ok = binVeins([{ id: 0, pts: line(0), reach: 6 }, { id: 1, pts: line(40), reach: 6 }], []);
  assert.ok(ok.nCells > 0);
  const bad = binVeins([{ id: 0, pts: line(0), reach: 6 }, { id: 1, pts: line(40), reach: NaN }], []);
  assert.equal(bad.nCells, 0);
});
