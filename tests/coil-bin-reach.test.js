// A collateral that never coils (spontaneous, or kept straight) has no coil target, so its binning reach must stay a number:
// a NaN reach spoils binVeins' bounds and no vessel draws at all (the outflow talk on 18 Oct).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { binVeins } from '../src/ui/veins-bin.js';

const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');

test('binTube treats a collateral with no coil target as settled', () => {
  assert.match(stage, /const wigE = !!g && g\.wigT != null && g\.wig !== g\.wigT, sprE = !!g && it\.kind === 's' && g\.sprT != null && \(g\.spr \?\? 1\) !== g\.sprT;\n\s+if \(!wigE && !sprE\) \{ binFrom\.delete\(it\.row\); return \{ id: it\.row, pts, reach, core \}; \}/);
  // (Each term of the margin only while its own ease runs, and a strand with no offset adds none: never NaN.)
  assert.match(stage, /m: Math\.ceil\(\(wigE \? Math\.abs\(g\.wigT - g\.wig\) \* 2 : 0\) \+ \(sprE \? Math\.abs\(it\.obj\.off \|\| 0\) \* Math\.abs\(g\.sprT - \(g\.spr \?\? 1\)\) \* 2\.4 : 0\) \+ 1\) \/ 2/);
});

// (31 Oct, his iPhone readout on e52a280e: on the procedure slides a varix's strands fanning in or out as it changed size were binned
// whole at every frame of the ease, a 2.8 MB upload and a whole draw each. They are binned against where they began, as a coil is.)
test('a varix spread easing bins its strands against where they began, as a coil does', () => {
  assert.match(stage, /g\.sprT = sprT;/);
  const i = stage.indexOf('  function binTube('), body = stage.slice(i, stage.indexOf('\n  }\n', i));
  assert.match(body, /if \(far > a\.m\) a = null;/, 'a strand moved past the margin is binned again');
  assert.match(body, /return \{ id: it\.row, pts, bin: a\.pts, reach: reach \+ a\.m, core: core \+ a\.m \};/);
});

test('one vessel with a NaN reach leaves binVeins with no cells (why the guard matters)', () => {
  const line = (y) => Array.from({ length: 8 }, (_, i) => [i * 10, y]);
  const ok = binVeins([{ id: 0, pts: line(0), reach: 6 }, { id: 1, pts: line(40), reach: 6 }], []);
  assert.ok(ok.nCells > 0);
  const bad = binVeins([{ id: 0, pts: line(0), reach: 6 }, { id: 1, pts: line(40), reach: NaN }], []);
  assert.equal(bad.nCells, 0);
});
