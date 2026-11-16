// A tile's number wears its band's colour, in every look, and keeps wearing it while it moves (16 Nov 2026, Mohammad's photo: the Valsalva slide's portal vein
// pressure read 35.5 in the green of Normal beside the word "High", and its blood pressure 102/72 (103), a mean outside its own systolic and diastolic).
//
// Three causes, each at its source:
//  1. The GPU words (gl-words.js) read their ink from the page once, when first measured, and a tile that changed band was never told: the number drawn
//     after it wore the colour of the band it began in. Every place that writes a tile's band now calls recolor() (tile-band.js paintBand, the dock's and
//     the Readouts' tiles, the dock's vitals).
//  2. A band waits for its number to land (A1, band-settle.js), and a number that follows a live model (the strain held) never lands: the band lagged for as
//     long as the button was held. A band that has waited BAND_LONG_MS is taken once the number on show has itself entered it (bandStepFor).
//  3. The blood pressure's mean was the engine's raw MAPf (one fast stage) beside a systolic and a diastolic averaged over about eight seconds.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { bandStep, bandStepFor, BAND_LONG_MS } from '../src/ui/band-settle.js';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { fingerprintOf } from '../src/engine/fingerprint.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const CSS = readdirSync(new URL('../styles/', import.meta.url)).filter((f) => f.endsWith('.css')).map((f) => read(`styles/${f}`)).join('\n');

// ── The number's ink is its band's: the same three inks the word and the bar's marker wear ──
test('a data-card tile with a scale: its number is green, amber or red as its band, the word and the marker are', () => {
  const num = (rate) => new RegExp(`\\.pz-tile\\.scaled[^{]*\\[data-rate="${rate}"\\][^{]*\\.pzt-v\\s*\\{\\s*color:\\s*var\\((--[a-z-]+)\\)`).exec(CSS)?.[1];
  assert.equal(num('ok'), '--ok-ink', 'Normal is green');
  assert.equal(num('mid'), '--caution-ink', 'High is amber');
  assert.equal(num('hi'), '--danger-ink', 'Severe is red');
  const word = (rate) => new RegExp(`\\.pz-tile\\[data-rate="${rate}"\\] \\.pzt-r\\s*\\{\\s*color:\\s*var\\((--[a-z-]+)\\)`).exec(CSS)?.[1];
  assert.equal(word('mid'), num('mid'), 'the word and the number are the same amber');
  const wordHi = /\.pz-tile\[data-rate="hi"\] \.pzt-v, \.pz-tile\[data-rate="hi"\] \.pzt-r\s*\{\s*color:\s*var\((--[a-z-]+)\)/.exec(CSS)?.[1];
  assert.equal(wordHi, num('hi'), 'the word and the number are the same red');
  const mark = (rate) => new RegExp(`\\.pz-tile\\[data-rate="${rate}"\\] \\.pzb-now::before\\s*\\{\\s*background:\\s*var\\((--[a-z-]+)\\)`).exec(CSS)?.[1];
  assert.equal(mark('mid'), '--caution'); assert.equal(mark('hi'), '--danger');
});

test('the dock and the Readouts tiles: the number is amber or red as the tile\'s band (data-sev)', () => {
  assert.match(CSS, /\.metric\[data-sev="caution"\] \.val \{ color: var\(--caution-ink\); \}/);
  assert.match(CSS, /\.metric\[data-sev="danger"\] \.val \{ color: var\(--danger-ink\); \}/);
});

test('the inks are the band colours themselves, mixed with the look\'s own text colour: so each look (light, soft, dark, navy, black) gives a tile\'s number its band\'s hue', () => {
  const tokens = read('styles/tokens.css');
  for (const [ink, band] of [['ok', 'ok'], ['caution', 'caution'], ['danger', 'danger']]) {
    assert.match(tokens, new RegExp(`--${ink}-ink: color-mix\\(in srgb, var\\(--${band}\\) \\d+%, var\\(--text\\)\\)`), `--${ink}-ink is --${band} in the look's text`);
  }
});

// ── A band written is a colour told to the GPU numbers ──
test('every place that writes a tile\'s band also tells its GPU words (recolor)', () => {
  const pc = read('src/ui/presenter-cards.js');
  assert.ok(!/setA\(p\.(tile|hi), 'data-rate'/.test(pc), 'the data card tile\'s data-rate is written in one place, tile-band.js paintBand');
  assert.match(pc, /else \{ p\.pend = null; paintBand\(p, word, rate\); \}/);
  assert.match(pc, /paintBand\(p, w, r\)/);
  assert.match(read('src/ui/tile-band.js'), /if \(changed\) \{ p\.vw\?\.recolor\(\); p\.hw\?\.recolor\(\); \}/, 'paintBand tells both its numbers when the band changed');
  const dock = read('src/ui/dock.js');
  assert.match(dock, /dataSoon\(el, 'sev', sev\); x\.sev = sev;\s*runSoon\(x\.recolor\)/, 'the dock tile');
  assert.match(dock, /if \(badNow !== x\.badOn\) \{ x\.badOn = badNow; runSoon\(x\.recolor\); \}/, 'the dock vitals (red when out of range)');
  const ro = read('src/ui/readouts-pane.js');
  assert.equal((ro.match(/dataset\.sev = sev; x\.sev = sev;\s*recolorWords\(x\.val\)/g) || []).length, 2, 'both Readouts loops');
  const gw = read('src/ui/gl-words.js');
  assert.match(gw, /recolor\(\) \{ if \(S\.dead\) return; wake\(S\); S\.stale = true; askMeasure\(S\); \}/, 'any words, kept or not, can be told');
  assert.match(read('src/ui/util.js'), /export const recolorWords = /);
});

// ── A band does not wait for ever on a number that keeps moving ──
test('a short roll across a cut-off keeps its old colour until it lands; a number held moving takes its band once it is in it', () => {
  assert.equal(bandStepFor('caution', 'danger', true, false, 0, 'caution'), 'wait', 'a roll just begun: wait for the number');
  assert.equal(bandStepFor('caution', 'danger', true, false, 300, 'danger'), 'wait', 'a roll is over within 0.4 s: even in the new band, wait for it to land');
  assert.equal(bandStepFor('caution', 'danger', true, false, BAND_LONG_MS, 'caution'), 'wait', 'held moving but the number is still in the old band: the colour is still its');
  assert.equal(bandStepFor('ok', 'danger', true, false, BAND_LONG_MS, 'danger'), 'fade', 'held moving and the number is in the new band: colour and word follow it');
  assert.equal(bandStepFor('ok', 'danger', false, false, 0, 'ok'), bandStep('ok', 'danger', false, false), 'landed: as bandStep');
  assert.equal(bandStepFor('ok', 'danger', true, true, 0, 'ok'), 'now', 'Reduce Motion: at once');
  assert.equal(bandStepFor('ok', 'ok', true, false, 5000, 'ok'), 'same');
  assert.ok(BAND_LONG_MS > 400, 'longer than a roll (COUNT_MS 0.4 s), so a roll is never cut short');
});

// ── The blood pressure's three numbers are one reading ──
test('systolic, mean and diastolic agree at every moment of a held strain and its release: diastolic ≤ mean ≤ systolic, the mean the vitals\' own', () => {
  const e = new Engine(); e.loadPreset('cirr-decomp'); e.settle();
  const seen = [];
  const check = (label) => {
    const m = computeMetrics(e), fp = fingerprintOf(m);
    assert.equal(fp.map, m.vitals.map, `${label}: the tile's mean is the vitals' mean`);
    assert.ok(fp.dbp <= fp.map + 0.05 && fp.map <= fp.sbp + 0.05, `${label}: ${fp.sbp.toFixed(1)}/${fp.dbp.toFixed(1)} (${fp.map.toFixed(1)})`);
    seen.push(fp.map);
  };
  check('rest');
  e.holdStrain(true);
  for (let t = 0, i = 0; t < 14; t += 0.05, i++) { e.step(0.05); if (i % 10 === 0) check(`strain ${t.toFixed(1)} s`); }
  e.holdStrain(false);
  for (let t = 0, i = 0; t < 14; t += 0.05, i++) { e.step(0.05); if (i % 10 === 0) check(`release ${t.toFixed(1)} s`); }
  assert.ok(Math.max(...seen) - Math.min(...seen) > 5, 'the strain really moved the pressure (the test judges a transient, not a rest)');
});
