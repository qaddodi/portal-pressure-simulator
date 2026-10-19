// The Wall mechanics tiles multiply out (review 19 Oct): ΔP × r / w, as the tiles show them, is the index the tile shows,
// at every state the engine produces; the explainer line and the tiles read the same numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine } from '../src/engine/engine.js';
import { PRESETS } from '../src/engine/scenario.js';
import { formula } from '../src/engine/explain.js';
import { wallRead } from '../src/engine/wall-read.js';

test('the tiles shown multiply out to the index shown, in every preset, beat by beat, at both varix sites', () => {
  let n = 0;
  for (const p of PRESETS) for (const site of ['VAR', 'GV']) {
    const e = new Engine(); e.loadPreset(p.id); e.beat = true;
    for (let f = 0; f < 40; f++) {
      for (let i = 0; i < 25; i++) e.step(0.004);
      const v = e.varix(site), t = wallRead(v);
      assert.equal(String(Math.round(+t.ptm * +t.r / +t.w)), t.index, `${p.id} ${site} t=${e.t.toFixed(2)}: ${t.ptm} × ${t.r} / ${t.w} vs index ${t.index}`);
      // ...and the index stays the model's own to within rounding of the shown values (1 % and one unit).
      assert.ok(Math.abs(+t.index - v.T) <= 1 + 0.01 * v.T, `${p.id} ${site}: index ${t.index} vs model ${v.T.toFixed(2)}`);
      n++;
    }
  }
  assert.equal(n, PRESETS.length * 2 * 40);
});

test('the tear-point example: 17.3 mmHg × 3.1 mm / 0.4 mm no longer sits beside an index of 150', () => {
  // A state at the tear point (T = 150) with the factors the scope showed: the shown wall has enough digits to keep the product.
  const t = wallRead({ ptm: 17.26, r: 3.1234, w: 0.3591, T: 150 });
  assert.deepEqual(t, { ptm: '17.3', r: '3.12', w: '0.359', index: '150' });
  assert.equal(Math.round(17.3 * 3.12 / 0.359), 150);
});

test('the explainer line shows the same numbers as the tiles', () => {
  const e = new Engine(); e.loadPreset('cirr-decomp');
  for (let i = 0; i < 400; i++) e.step(0.004);
  const t = wallRead(e.varix('VAR'));
  assert.ok(formula(e, 'varix').includes(`${t.ptm} mmHg × ${t.r} mm / ${t.w} mm = ${t.index}`));
});

test('the Wall mechanics tiles read their numbers from wallRead', () => {
  const s = readFileSync(new URL('../src/ui/instruments.js', import.meta.url), 'utf8');
  assert.match(s, /const wr = wallRead\(v\)/);
  assert.ok(!/fmt\(v\.w, 1\)/.test(s));
});
