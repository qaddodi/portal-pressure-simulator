// The kidney pressure tile (renal perfusion pressure, metrics.rpp): the mean arterial pressure less the pressure inside the abdomen.
// A pressure, not kidney function: the model has no GFR or creatinine. Its cut-offs live once, in src/engine/kidney-cuts.js.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { deepMerge } from '../src/engine/scenario.js';
import { iapFromAscites } from '../src/engine/physiology.js';
import { KIDNEY_CUTS, rppSev, RPP_WORDS } from '../src/engine/kidney-cuts.js';
import { TILE, RATE, SCALE, CUT, COLS, bandsOf, rateOf } from '../src/ui/table-marks.js';
import { METRICS } from '../src/engine/explain.js';
import { runSteps } from './deck-states.js';
import { fingerprintOf } from '../src/engine/fingerprint.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const walk = (d) => readdirSync(join(ROOT, d)).flatMap((f) => (statSync(join(ROOT, d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const go = (id, p) => { const e = new Engine(); e.loadPreset(id); if (p) e.setParams(deepMerge(e.params, p)); e.settle(); return { e, m: computeMetrics(e) }; };

test('kidney pressure is the mean arterial pressure less the pressure in the abdomen', () => {
  for (const id of ['healthy', 'cirr-comp', 'cirr-decomp']) {
    const { m } = go(id);
    assert.ok(Math.abs(m.rpp - (m.map - m.ascites.iap)) < 1e-9, `${id}: ${m.rpp} vs ${m.map} - ${m.ascites.iap}`);
  }
  assert.equal(iapFromAscites(0), KIDNEY_CUTS.iapRest, 'the abdomen\'s resting pressure is the one the cut-off was worked from');
  assert.equal(KIDNEY_CUTS.rpp, KIDNEY_CUTS.mapBeta - KIDNEY_CUTS.iapRest);
  const { m } = go('healthy');
  assert.equal(fingerprintOf(m).rpp, m.rpp, 'the live fingerprint carries it, for the slides\' tiles');
});

test('a tense abdomen lowers it, and a large-volume tap gives it back', async () => {
  // (The Ascites talk's patient: four months off diuretics with the albumin falling, then the 5.1 L tap with albumin.)
  const [tense, tap] = await runSteps([{ preset: 'cirr-decomp', params: { diuretics: false }, days: 120, ramp: { albumin: [2.8, 2.4] } }, { action: { kind: 'paracentesis', mL: 5100 }, params: { albumin: 2.74 } }]);
  const [calm] = await runSteps([{ preset: 'cirr-decomp' }]);
  assert.ok(tense.asc >= 5000, `tense: ${tense.asc} mL`);
  assert.ok(tap.asc < 100, 'the tap drains it');
  assert.ok(tap.rpp > tense.rpp + 2, `kidney pressure rises with the tap (${tense.rpp} to ${tap.rpp})`);
  assert.ok(calm.rpp > 0 && calm.rpp < calm.map);
  // (The abdomen's own pressure, from the same engine: a tense abdomen is well over its resting 5 mmHg, a drained one back at it.)
  assert.ok(iapFromAscites(tense.asc) - iapFromAscites(tap.asc) > 4);
});

test('carvedilol lowers the MAP and with it the kidney pressure; terlipressin raises both', () => {
  const none = go('cirr-decomp').m, carv = go('cirr-decomp', { drugs: { carvedilol: true } }).m, terli = go('cirr-decomp', { drugs: { terlipressin: true } }).m;
  assert.ok(carv.rpp < none.rpp, `carvedilol ${none.rpp} to ${carv.rpp}`);
  assert.ok(terli.rpp > none.rpp + 4, `terlipressin ${none.rpp} to ${terli.rpp}`);
});

test('the tile is rated from the cut-off module alone: red below the MAP line carried to the tile', () => {
  assert.equal(rppSev(KIDNEY_CUTS.rpp), 'ok');
  assert.equal(rppSev(KIDNEY_CUTS.rpp - 0.01), 'danger');
  assert.equal(RPP_WORDS.danger, 'Low');
  assert.deepEqual(SCALE.rpp[2], [KIDNEY_CUTS.rpp]);
  assert.equal(rateOf('rpp', { rpp: KIDNEY_CUTS.rpp })[0], 'ok');
  assert.equal(rateOf('rpp', { rpp: KIDNEY_CUTS.rpp - 1 })[0], 'hi');
  assert.deepEqual(bandsOf('rpp').map((z) => rateOf('rpp', { rpp: z.m })[0]), ['hi', 'ok']);
  assert.equal(RATE.map(KIDNEY_CUTS.mapBeta)[0], 'ok');
  assert.equal(RATE.map(KIDNEY_CUTS.mapBeta - 1)[0], 'hi');
  assert.equal(TILE.rpp.t, 'Renal perfusion pressure');
  assert.equal(TILE.rpp.s, 'MAP − IAP');
  assert.ok(COLS.rpp && CUT.rpp);
  assert.ok(METRICS.rpp, 'the Why? explanation covers it');
});

test('no wording on the tile claims kidney function', () => {
  const words = [TILE.rpp.t, TILE.rpp.s, CUT.rpp, METRICS.rpp.label, read('src/engine/kidney-cuts.js').split('\n').slice(0, 12).join(' ')];
  for (const w of words) assert.ok(!/\b(GFR|filtration rate|creatinine clearance)\b/i.test(w.replace(/no GFR|not kidney function|no GFR, no creatinine/g, '')), w);
  // (The bar's tile takes its tooltip from the reading's one definition, TILE.rpp.long: unification audit, finding 6.)
  assert.match(TILE.rpp.long, /not kidney function/, 'the tile\'s tooltip says it is a pressure');
  assert.ok(read('src/ui/dock.js').split('\n').find((l) => l.includes("id: 'rpp'")).includes("...fromTile('rpp')"), 'the bar\'s RPP tile reads it');
});

const blank = (line) => line.replace(/\/\/.*$/, '').replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '""');
test('no file but the module writes the kidney pressure cut-off as a number', () => {
  const stray = [];
  for (const f of walk('src').filter((x) => x.endsWith('.js') && !/kidney-cuts\.js$/.test(x) && !/src\/ui\/decks\//.test(x))) {
    read(f).split('\n').forEach((line, i) => {
      const code = blank(line);
      if (/\brpp\b[^;\n]{0,24}(?:>=?|<=?|===?)\s*-?\d/i.test(code) || /\bmap\b[^;\n]{0,24}(?:<=?|>=?)\s*65\b/i.test(code) || /\bcut:\s*65\b/.test(code)) stray.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(stray, [], 'read the cut-off from src/engine/kidney-cuts.js');
});

test('the kidney talk types the same two rules as the module (a deck is one file with no imports)', async () => {
  const { DECKS } = await import('../src/ui/decks.js');
  const d = DECKS.find((x) => x.id === 'kidney'), text = JSON.stringify(d);
  const hold = d.slides.find((s) => s.id === 'hold'), live = hold.tool.rows.filter((r) => Array.isArray(r) || r?.key).map((r) => (Array.isArray(r) ? r : [r.text, r.key, r.op, r.value]));
  assert.deepEqual(live.map((r) => r.slice(1)), [['sbp', '<', KIDNEY_CUTS.sbpBeta], ['map', '<', KIDNEY_CUTS.mapBeta]], 'the live rows are the beta-blocker lines, systolic and mean');
  assert.ok(text.includes(`MAP <${KIDNEY_CUTS.mapBeta} mmHg`));
  assert.ok(d.slides.find((s) => s.id === 'carv').line.includes(`{>=${KIDNEY_CUTS.rpp} mmHg}`), 'the carvedilol slide\'s rule pill is the tile\'s line');
  assert.ok(!/\b(GFR|creatinine)\b/i.test(JSON.stringify(d.slides.map((s) => s.line))), 'no line claims kidney function');
});
