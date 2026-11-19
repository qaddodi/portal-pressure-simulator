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
import { Engine } from '../src/engine/portal/engine.js';
import { computeMetrics } from '../src/engine/portal/metrics.js';
import { fingerprintOf } from '../src/engine/portal/fingerprint.js';

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
test('every place that writes a tile\'s band takes it under a fading number and tells its GPU words (bandSwap: nothing pops)', () => {
  const pc = read('src/ui/presenter-cards.js');
  assert.ok(!/setA\(p\.(tile|hi), 'data-rate'/.test(pc), 'the data card tile\'s data-rate is written in one place, tile-band.js paintBand');
  assert.match(pc, /else \{ p\.pend = null; paintBand\(p, word, rate\); \}/);
  assert.match(pc, /paintBand\(p, w, r\)/);
  const tb = read('src/ui/tile-band.js');
  assert.match(tb, /bandSwap\(fades, put, words\)/, 'a band that changes under a number on show fades the number out and back');
  assert.match(tb, /for \(const w of words\) w\.recolor\(\)/, 'a first band, written at once, still tells the numbers');
  const dock = read('src/ui/dock.js');
  assert.match(dock, /else bandSwap\(\[x\.val\], \(\) => dataSoon\(el, 'sev', sev\)\)/, 'the dock tile');
  assert.match(dock, /bandSwap\(fades, \(\) => \{ x\.badShown = x\.badOn; classSoon\(x\.el, 'bad', x\.badShown\); \}\)/, 'the dock vitals (red when out of range)');
  assert.ok(!/classSoon\(x\.el, 'bad', badNow\)/.test(dock), 'the red class is written only at the dip');
  const ro = read('src/ui/readouts-pane.js');
  assert.equal((ro.match(/else bandSwap\(\[x\.val\], \(\) => \{ (tileEl|x\.el)\.dataset\.sev = sev; \}\)/g) || []).length, 2, 'both Readouts loops');
  const u = read('src/ui/util.js');
  assert.match(u, /export function bandSwap\(fades, apply, words = fades\)/);
  assert.match(u, /for \(const e of fades\) swapFade\(e, once\)/, 'it fades with the shared swapFade (Reduce Motion keeps the fade)');
  assert.match(u, /export const recolorWords = /);
  assert.match(read('src/ui/gl-words.js'), /recolor\(\) \{ if \(S\.dead\) return; wake\(S\); S\.stale = true; askMeasure\(S\); \}/, 'any words, kept or not, can be told');
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

// ── bandSwap, run ──
import { bandSwap } from '../src/ui/util.js';
const later = () => new Promise((r) => setTimeout(r, 30));
test('bandSwap: the band is written once and the numbers are told after it; with nothing to fade it is written at once', async () => {
  const calls = [];
  const word = { recolor: () => calls.push('recolor') };
  bandSwap([], () => calls.push('apply'), [word]);
  assert.deepEqual(calls, ['apply'], 'written at once, the words told in the same task');
  await later();
  assert.deepEqual(calls, ['apply', 'recolor']);
  calls.length = 0;
  // Elements that cannot fade (no animate, as a hidden tile) take the band at once, once, though two were given.
  bandSwap([{}, {}], () => calls.push('apply2'), [word]);
  await later();
  assert.deepEqual(calls, ['apply2', 'recolor'], 'once, then told');
});

test('bandSwap: a number that can fade is clear when the band is written, and is told after it', async () => {
  const log = [];
  const fakeEl = (name) => {
    const el = { isConnected: true, firstChild: {}, getBoundingClientRect: () => ({ width: 10, height: 10, top: 0, left: 0, right: 10, bottom: 10 }), offsetWidth: 10, offsetHeight: 10,
      animate: (frames, opts) => { const a = { cancelled: false, finished: new Promise((r) => setTimeout(r, opts.fill === 'forwards' ? 5 : 0)), cancel() { this.cancelled = true; } }; log.push(`${name}:fade ${frames[frames.length - 1].opacity}`); return a; } };
    return el;
  };
  const a = fakeEl('a'), b = fakeEl('b');
  bandSwap([a, b], () => log.push('apply'), [{ recolor: () => log.push('recolor') }]);
  assert.ok(!log.includes('apply'), 'the band waits for the fade out');
  await later();
  assert.equal(log.filter((l) => l === 'apply').length, 1, 'written once, at the dip');
  assert.ok(log.indexOf('apply') > log.indexOf('a:fade 0'), 'after the number began to fade out');
  assert.ok(log.indexOf('recolor') > log.indexOf('apply'), 'the number is told after the band is written');
  assert.ok(log.some((l) => l.endsWith('fade 1')), 'and it fades back in');
});
