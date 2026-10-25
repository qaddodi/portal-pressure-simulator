// A varix is graded by size alone (None under 2.5 mm, Small under 5 mm, Large from 5 mm) with no F-codes anywhere, and
// "has varices" is one flag on the metrics (`present`) that every view reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics, varixGrade } from '../src/engine/metrics.js';

const run = (g) => { let n; do { n = g.next(); } while (!n.done); };

test('the grade is None, Small or Large by size alone, read to a tenth, and carries no code', () => {
  const at = (d) => varixGrade(d).label;
  assert.equal(at(0), 'None');
  assert.equal(at(2.4), 'None');
  assert.equal(at(2.5), 'Small');
  assert.equal(at(4.9), 'Small');
  assert.equal(at(5.0), 'Large');
  assert.equal(at(12), 'Large');
  assert.equal(at(25), 'Large', 'no third grade for a big one');
  assert.equal(at(4.96), 'Large', 'the printed 5.0 mm is Large');
  assert.deepEqual(Object.keys(varixGrade(7)), ['label']);
});

test('no F-code or coil-shaped grade name is left in the app', () => {
  const skip = new Set(['organ-art.js', 'liver-geo-data.js', 'snapshots.js']);   // (picture data, not words)
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = `${dir}/${name}`;
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.js') && !skip.has(name)) files.push(p);
    }
  };
  walk(new URL('../src', import.meta.url).pathname);
  assert.ok(files.length > 100, 'the walk found the source');
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    assert.doesNotMatch(s, /\bF[123]\b/, `${f} names an F-code`);
    assert.doesNotMatch(s, /coil-shaped|Coiled \(F3\)|large and beaded/i, `${f} names the old top grade`);
  }
});

test('present: the diameter reaches 2.5 mm, or banded columns are still on the wall (esophageal only)', () => {
  const healthy = new Engine(); run(healthy.loadPresetSteps('healthy', {})); healthy.settle();
  const m0 = computeMetrics(healthy);
  assert.equal(m0.varix.present, false, `healthy varix ${m0.varix.d.toFixed(1)} mm`);
  assert.equal(m0.gastricVarix.present, false);

  const banded = new Engine(); run(banded.loadPresetSteps('healthy', {})); banded.settle();
  banded.bands = 2;
  const mb = computeMetrics(banded);
  assert.equal(mb.varix.present, true, 'banded columns count');
  assert.equal(mb.varix.grade.label, 'None', 'but the size is still under the cut-off');
  assert.equal(mb.gastricVarix.present, false, 'bands are esophageal');

  const cirr = new Engine(); run(cirr.loadPresetSteps('cirr-decomp', {})); cirr.settle();
  const mc = computeMetrics(cirr);
  assert.equal(mc.varix.present, true);
  assert.equal(mc.varix.present, mc.varix.d >= 2.5);
});

test('every view reads present: no view keeps its own 2.5 mm test', async () => {
  const { varicesPresent } = await import('../src/ui/store.js');
  const e = new Engine(); run(e.loadPresetSteps('cirr-decomp', {})); e.settle();
  const f = { metrics: computeMetrics(e), bands: e.bands };
  assert.equal(varicesPresent(f), f.metrics.varix.present);
  assert.equal(varicesPresent(f, 'GV'), f.metrics.gastricVarix.present);
  for (const file of ['a11y.js', 'dock.js', 'instruments.js', 'actions.js']) {
    const s = readFileSync(new URL(`../src/ui/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(s, /(?:varix|vx|v)\.d\s*(?:<|>=)\s*2\.[45]\b/, `${file} tests the diameter itself`);
  }
});

test('the scope names the two grades in its Grade row tooltip', () => {
  const s = readFileSync(new URL('../src/ui/instruments.js', import.meta.url), 'utf8');
  assert.match(s, /title: 'Small, under 5 mm; Large, 5 mm or more\.'/);
});

test('"wall stress" is the app\'s word for ΔP · r / w, with σ as its symbol', () => {
  const ui = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
  assert.match(ui('instruments.js'), /'σ = ΔP · r \/ w'/);
  assert.doesNotMatch(ui('instruments.js'), /'T = ΔP · r \/ w'/);
  assert.doesNotMatch(ui('inspector.js'), /Wall tension/);
  assert.doesNotMatch(ui('main.js'), /wall tension/);
});
