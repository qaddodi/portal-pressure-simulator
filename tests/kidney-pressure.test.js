// The abdominal perfusion pressure tile (APP, metrics.rpp: the key keeps its first name): the mean arterial pressure minus the pressure inside the abdomen.
// A pressure, not renal perfusion or kidney function: the model has no GFR or creatinine, and no guideline gives MAP − IAP a cut-off, so the tile
// has none (external production review R03, 15 Nov 2026). The blood pressure's cut-offs (Baveno VIII 4.6) live once, in src/engine/kidney-cuts.js.
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
import * as CUTS from '../src/engine/kidney-cuts.js';
import { KIDNEY_CUTS } from '../src/engine/kidney-cuts.js';
import { TILE, RATE, SCALE, CUT, COLS, bandsOf, rateOf, effOf, dirAbs } from '../src/ui/table-marks.js';
import { TILES as DOCK_TILES, CUTOFFS } from '../src/ui/dock.js';
import { METRICS } from '../src/engine/explain.js';
import { runSteps } from './deck-states.js';
import { fingerprintOf } from '../src/engine/fingerprint.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const walk = (d) => readdirSync(join(ROOT, d)).flatMap((f) => (statSync(join(ROOT, d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const go = (id, p) => { const e = new Engine(); e.loadPreset(id); if (p) e.setParams(deepMerge(e.params, p)); e.settle(); return { e, m: computeMetrics(e) }; };

test('the abdominal perfusion pressure is the mean arterial pressure minus the pressure in the abdomen', () => {
  for (const id of ['healthy', 'cirr-comp', 'cirr-decomp']) {
    const { m } = go(id);
    assert.ok(Math.abs(m.rpp - (m.map - m.ascites.iap)) < 1e-9, `${id}: ${m.rpp} vs ${m.map} - ${m.ascites.iap}`);
  }
  assert.equal(iapFromAscites(0), KIDNEY_CUTS.iapRest, 'the module\'s resting abdominal pressure is the model\'s');
  const { m } = go('healthy');
  assert.equal(fingerprintOf(m).rpp, m.rpp, 'the live fingerprint carries it, for the slides\' tiles');
});

test('a tense abdomen lowers it, and a large-volume tap gives it back', async () => {
  // (The Ascites talk's patient: four months off diuretics with the albumin falling, then the 5.1 L tap with albumin.)
  const [tense, tap] = await runSteps([{ preset: 'cirr-decomp', params: { diuretics: false }, days: 120, ramp: { albumin: [2.8, 2.4] } }, { action: { kind: 'paracentesis', mL: 5100 }, params: { albumin: 2.74 } }]);
  const [calm] = await runSteps([{ preset: 'cirr-decomp' }]);
  assert.ok(tense.asc >= 5000, `tense: ${tense.asc} mL`);
  assert.ok(tap.asc < 100, 'the tap drains it');
  assert.ok(tap.rpp > tense.rpp + 2, `the APP rises with the tap (${tense.rpp} to ${tap.rpp})`);
  assert.ok(calm.rpp > 0 && calm.rpp < calm.map);
  // (The abdomen's own pressure, from the same engine: a tense abdomen is well over its resting 5 mmHg, a drained one back at it.)
  assert.ok(iapFromAscites(tense.asc) - iapFromAscites(tap.asc) > 4);
});

test('carvedilol lowers the MAP and with it the APP; terlipressin raises both', () => {
  const none = go('cirr-decomp').m, carv = go('cirr-decomp', { drugs: { carvedilol: true } }).m, terli = go('cirr-decomp', { drugs: { terlipressin: true } }).m;
  assert.ok(carv.rpp < none.rpp, `carvedilol ${none.rpp} to ${carv.rpp}`);
  assert.ok(terli.rpp > none.rpp + 4, `terlipressin ${none.rpp} to ${terli.rpp}`);
});

test('the tile is a number only: no cut-off, rating, colour band, status word or good-or-bad direction anywhere', () => {
  // (R03: MAP − IAP is the WSACS abdominal perfusion pressure; subtracting the resting IAP from Baveno VIII 4.6's MAP line made a 60 mmHg "Low" that no guideline states.)
  assert.deepEqual(Object.keys(CUTS).sort(), ['IAP_REST', 'KIDNEY_CUTS', 'MAP_BETA_CUT', 'SBP_BETA_CUT'], 'the module keeps the blood pressure\'s lines and exports no kidney-pressure rating');
  assert.ok(!('rpp' in KIDNEY_CUTS));
  assert.deepEqual(SCALE.rpp[2], [], 'a plain track: no cut-offs between bands');
  assert.deepEqual(bandsOf('rpp'), []);
  assert.equal(RATE.rpp, undefined, 'no rating function');
  for (const v of [20, 55, 59.9, 60, 61, 90]) assert.equal(rateOf('rpp', { rpp: v })[0], null, `${v} mmHg has no rating`);
  assert.equal(dirAbs('rpp', { rpp: 20 }), 0, 'no arrow against a normal range it does not have');
  assert.equal(effOf('rpp', 1), null);
  assert.equal(effOf('rpp', -1), null, 'a fall or a rise is neither better nor worse');
  assert.equal(CUT.rpp, undefined);
  const dock = DOCK_TILES.find((t) => t.id === 'rpp');
  assert.deepEqual(dock.ticks, [], 'the bar draws no tick');
  for (const v of [20, 59, 61, 95]) { assert.equal(dock.st(v), 'none', 'neutral colour'); assert.ok(!/normal|low|high|severe/i.test(dock.s(v)), `status word "${dock.s(v)}"`); }
  assert.ok(!CUTOFFS.some((r) => /perfusion|APP|MAP − IAP/i.test(r[0])), 'About the model lists no cut-off for it');
  // (The blood pressure itself keeps the guideline's two lines.)
  assert.equal(RATE.map(KIDNEY_CUTS.mapBeta)[0], 'ok');
  assert.equal(RATE.map(KIDNEY_CUTS.mapBeta - 1)[0], 'hi');
  assert.equal(TILE.rpp.t, 'Abdominal perfusion pressure');
  assert.equal(TILE.rpp.n, 'APP');
  assert.equal(TILE.rpp.s, 'MAP − IAP');
  assert.ok(COLS.rpp === 'APP');
  assert.ok(METRICS.rpp, 'the Why? explanation covers it');
  assert.match(METRICS.rpp.label, /^Abdominal perfusion pressure/);
});

test('no wording on the tile claims kidney function', () => {
  const words = [TILE.rpp.t, TILE.rpp.s, METRICS.rpp.label, read('src/engine/kidney-cuts.js').split('\n').slice(0, 12).join(' ')];
  for (const w of words) assert.ok(!/\b(GFR|filtration rate|creatinine clearance)\b/i.test(w.replace(/no GFR|not kidney function|no GFR, no creatinine/g, '')), w);
  // (The bar's tile takes its tooltip from the reading's one definition, TILE.rpp.long: unification audit, finding 6.)
  assert.match(TILE.rpp.long, /not renal perfusion or kidney function/, 'the tile\'s tooltip says it is a pressure');
  assert.match(TILE.rpp.long, /No guideline gives it a normal range/);
  assert.ok(read('src/ui/dock.js').split('\n').find((l) => l.includes("id: 'rpp'")).includes("...fromTile('rpp')"), 'the bar\'s APP tile reads it');
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
  assert.ok(d.slides.find((s) => s.id === 'carv').line.includes(`{>=${KIDNEY_CUTS.mapBeta} mmHg}`), 'the carvedilol slide\'s rule pill is the MAP\'s line, never an APP line');
  assert.ok(!/\{[<>]=?\s*\d+ mmHg\}[^.]*\bAPP\b|\bAPP\b[^.]*\{[<>]=?\s*60/.test(d.slides.map((s) => s.line).join('\n')), 'no slide gives the APP a cut-off');
  assert.ok(!/\b(GFR|creatinine)\b/i.test(JSON.stringify(d.slides.map((s) => s.line))), 'no line claims kidney function');
});

// The wording: MAP − IAP is never called a renal perfusion pressure, in a tile, a card, a label, a spoken reading, an axis or a deck (the 'renal-perfusion-pressure'
// rule of scripts/clinical-wording.mjs, run by npm run lint, walks every string in src/; this keeps the test of it near the quantity).
test('no learner text calls MAP − IAP a renal perfusion pressure or an RPP', async () => {
  const { check } = await import('../scripts/clinical-wording.mjs');
  const { SPOKEN } = await import('../src/ui/readouts-text.js');
  for (const w of [TILE.rpp.t, TILE.rpp.long, METRICS.rpp.label, SPOKEN.rpp, DOCK_TILES.find((t) => t.id === 'rpp').k, DOCK_TILES.find((t) => t.id === 'rpp').title]) assert.deepEqual(check(w).map((h) => h.rule), [], w);
  const { DECKS } = await import('../src/ui/decks.js');
  const bad = [];
  for (const d of DECKS) for (const sl of d.slides) for (const f of ['kicker', 'title', 'line', 'notes', 'caveat']) if (typeof sl[f] === 'string' && /\b[Rr]enal perfusion pressure\b|\bRPP\b/.test(sl[f])) bad.push(`${d.id}/${sl.id}.${f}`);
  assert.deepEqual(bad, []);
});
