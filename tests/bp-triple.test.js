// The blood pressure is one triple wherever it is printed: the mean is diastolic + (systolic − diastolic) / 3, so "117/69 (85)" checks by hand
// (16 Nov 2026: the engine's own time-mean ran 2 to 4 mmHg under that sum, "116/69 (82)" and "93/65 (72)"). One formula, bedside-mean.js,
// builds the metrics' triple and the formatter's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { PRESETS } from '../src/engine/scenario.js';
import { bedsideMean } from '../src/engine/bedside-mean.js';
import { bpText } from '../src/ui/vital-read.js';
import { deckStates } from './deck-states.js';

const sum = (txt) => { const [, s, d, m] = txt.match(/^(\d+)\/(\d+) \((\d+)\)$/); return { s: +s, d: +d, m: +m }; };

test('every patient reads a mean that is the bedside sum of its own systolic and diastolic, to the decimal', () => {
  for (const p of PRESETS) {
    const e = new Engine(); e.loadPreset(p.id); e.beat = true;
    for (let i = 0; i < 1500; i++) e.step(0.004);
    const m = computeMetrics(e);
    assert.ok(Math.abs(m.map - bedsideMean(m.sbp, m.dbp)) < 1e-9, `${p.id}: ${m.sbp}/${m.dbp} (${m.map})`);
    assert.ok(Math.abs(m.vitals.map - bedsideMean(m.vitals.sbp, m.vitals.dbp)) < 1e-9, `${p.id}: the vitals' triple`);
  }
});

test('the printed triple is the sum of the printed two, on every slide of every deck', async () => {
  const dir = new URL('../src/ui/decks/', import.meta.url);
  let n = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const d = Object.values(await import(new URL(f, dir))).find((v) => Array.isArray(v?.slides));
    if (!d) continue;
    for (const fp of await deckStates(d)) {
      if (!fp || !Number.isFinite(fp.sbp) || !Number.isFinite(fp.dbp)) continue;
      const t = sum(bpText(fp.sbp, fp.dbp, fp.map));
      assert.equal(t.m, Math.round(t.d + (t.s - t.d) / 3), `${d.id}: ${t.s}/${t.d} (${t.m})`);
      assert.ok(Math.abs(fp.map - bedsideMean(fp.sbp, fp.dbp)) < 1e-9, `${d.id}: the fingerprint's mean is the sum`);
      n++;
    }
  }
  assert.ok(n > 300, `${n} slides checked`);
  // The two printed numbers decide the third even when the stored mean is another (a rounded 116/69 is 85, not 82).
  assert.equal(bpText(116.4, 69.2, 82), '116/69 (85)');
});
