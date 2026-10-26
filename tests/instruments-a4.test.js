// Deck rebuild plan A4: two slide instruments (a vitals monitor, the HVPG catheter's tracing on the card) and the
// encephalopathy-risk tile. Each is made, titled and registered like the other instruments; the ones that read numbers read the slide's own.
// (The spleen ultrasound that came with them was taken out again on Mohammad's word, 26 Oct.)
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RATE, TILE, SCALE, bandsOf, rateOf, rateShown, tileShown, dirAbs, COLS, CUT } from '../src/ui/table-marks.js';
import { VITALS, vitalReading } from '../src/ui/vital-read.js';
import { vitalsShown, vitalCells, metricsOfFp, VITALS_DEFAULT } from '../src/ui/vitals-monitor.js';
import { levelsOf, SWEEP_FREE_MS, SWEEP_SETTLE_MS } from '../src/ui/tool-hvpg.js';
import { eases, dataPlan } from '../src/ui/card-keep.js';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const tools = read('../src/ui/presenter-tools.js');
const presenter = read('../src/ui/presenter.js');
const css = read('../styles/app.css');
const run = (g) => { let n; do { n = g.next(); } while (!n.done); };

// ── The encephalopathy-risk tile ──
test('the he tile: the model\'s index with the scale bar, bands at 0.2 and 0.45, Low, Moderate and High, and a note that it is a model index', () => {
  assert.deepEqual(SCALE.he, [0, 1, [0.2, 0.45]]);
  assert.deepEqual(bandsOf('he').map((z) => rateOf('he', { he: z.m })[1]), ['Low', 'Moderate', 'High']);
  assert.deepEqual(bandsOf('he').map((z) => rateOf('he', { he: z.m })[0]), ['ok', 'mid', 'hi']);
  assert.equal(TILE.he.t, 'Encephalopathy risk');
  assert.match(TILE.he.s, /Model index/);
  assert.equal(TILE.he.d, 2);
  assert.equal(COLS.he, 'HE risk');
  assert.match(CUT.he, /not a clinical score/);
  // The tile reads the metrics' own label at every index the model reaches.
  for (const v of [0, 0.002, 0.19, 0.2, 0.3, 0.449, 0.45, 0.885, 1.2]) {
    const label = v < 0.2 ? 'Low' : v < 0.45 ? 'Moderate' : 'High';
    assert.equal(RATE.he(v)[1], label, `index ${v}`);
  }
  const e = new Engine(); run(e.loadPresetSteps('cirr-decomp', {})); e.settle();
  const m = computeMetrics(e);
  assert.equal(RATE.he(m.heRisk.index)[1], m.heRisk.label, 'the tile and the metrics agree on the decompensated patient');
  // A tile's word judges the number it prints (two decimals): 0.449 prints 0.45 and is Moderate's upper edge, High.
  assert.equal(tileShown('he', 0.449), 0.45);
  assert.equal(rateShown('he', { he: 0.449 })[1], 'High');
  assert.equal(dirAbs('he', { he: 0.1 }), 0); assert.equal(dirAbs('he', { he: 0.3 }), 1); assert.equal(dirAbs('he', { he: 0.9 }), 2);
});

// ── The vitals monitor ──
test('the vitals monitor: up to three of hr, map, co and hb in the order given, hr, map and hb by default', () => {
  assert.deepEqual(VITALS_DEFAULT, ['hr', 'map', 'hb']);
  assert.deepEqual(vitalsShown({}), ['hr', 'map', 'hb']);
  assert.deepEqual(vitalsShown(undefined), ['hr', 'map', 'hb']);
  assert.deepEqual(vitalsShown({ show: ['map', 'hr'] }), ['map', 'hr']);
  assert.deepEqual(vitalsShown({ show: ['co', 'ra', 'hb', 'map', 'hr'] }), ['co', 'hb', 'map'], 'three at most; only the monitor\'s four');
  assert.deepEqual(vitalsShown({ show: ['hr', 'hr', 'map'] }), ['hr', 'map']);
  assert.deepEqual(vitalsShown({ show: [] }), ['hr', 'map', 'hb']);
});

test('the vitals read the slide\'s own numbers, decimals as its tiles print them, and the red flag holds and clears as the bottom bar\'s does', () => {
  const fp = { map: 72.4, hr: 91.2, co: 6.1, ra: 3.2, hb: 11.84 };
  const m = metricsOfFp(fp);
  for (const id of ['hr', 'map', 'co', 'hb']) {
    const def = VITALS.find((v) => v.id === id);
    assert.equal(def.v(m), fp[id], `${id} reads the fingerprint`);
    assert.equal(def.d, TILE[id].d ?? 1, `${id}: the same decimals as its tile`);
  }
  const xs = new Map(), at = (map, now, running = true) => vitalCells({ map }, ['map'], xs, running, now)[0];
  assert.equal(at(70, 0).bad, false);
  assert.equal(at(60, 100).bad, false, 'past the cut-off, not yet held');
  assert.equal(at(60, 1000).bad, false);
  assert.equal(at(60, 1700).bad, true, 'held 1.5 s');
  assert.equal(at(66, 2000).bad, true, 'just inside the cut-off, still flagged (hysteresis 2)');
  assert.equal(at(68, 2100).bad, true, 'clear, not yet held');
  assert.equal(at(68, 3700).bad, false, 'cleared after 1.5 s');
  assert.equal(vitalCells({ map: 60 }, ['map'], new Map(), false, 0)[0].bad, true, 'a paused model takes its flag at once');
  assert.deepEqual(Object.keys(vitalCells({ map: 70 }, ['map'], new Map(), true, 0)[0]).sort(), ['bad', 'd', 'id', 'k', 'title', 'u', 'v']);
  assert.equal(vitalCells({ map: 70 }, ['map'], new Map(), true, 0)[0].k, 'MAP', 'mean arterial pressure only: the model has no systolic and diastolic');
  // (the helper and the bar share one flag: this is the same function)
  assert.equal(vitalReading({ v: VITALS[0] }, { map: 60 }, false, 0).bad, true);
  const src = read('../src/ui/vitals-monitor.js');
  assert.match(src, /import \{ createBeatClock, ekgSeries(?:, \w+)* \} from '\.\/ekg\.js(\?v=\w+)?'/, 'the strip is the pressure trace\'s');
  assert.match(src, /ctx\.fillStyle = c\.bad \? alarm : bright;/);
  assert.doesNotMatch(src, /shadowBlur|createLinearGradient|arc\(/, 'no glow, gradient or status dot');
  assert.doesNotMatch(src, /FONT\(\d+, (?:[0-9]|1[01])\)/, 'no word under 12 px');
  assert.match(read('../src/ui/dock.js'), /export \{ VITALS \};/, 'the bottom bar keeps its list, now in vital-read.js');
});

test('the vitals monitor is a recording kind: a new patient starts its strip over, so its card is built again; the HVPG card rides the model', () => {
  assert.equal(eases({ kind: 'vitals' }), false);
  assert.equal(eases({ kind: 'hvpg' }), true);
  assert.notEqual(dataPlan({ tool: { kind: 'vitals' }, data: 'tiles' }, {}), dataPlan({ tool: { kind: 'vitals', show: ['co'] }, data: 'tiles' }, {}), 'its options are part of the card\'s plan');
  assert.match(tools, /const RECORDS = \['doppler', 'beats', 'vitals'\];/, 'the vitals monitor is one of the recording kinds');
  assert.match(tools, /const startOver = RECORDS\.includes\(k\) && \(stateKey !== lastSt \|\| cur !== inst\);\s+if \(startOver\) \{ inst\.clear\?\.\(\); primeTok\+\+; \}/, 'a new state clears its strip');
  assert.match(tools, /for \(const k of RECORDS\) made\[k\]\?\.restart\?\.\(\) \?\? made\[k\]\?\.clear\?\.\(\);/, 'and a held state restarts it');
});

// ── The HVPG monitor on the card ──
test('the HVPG card: the HVPG is the difference of the two readings as shown, and the tracing plays on the procedure\'s own clock', () => {
  assert.deepEqual(levelsOf({ fhvp: 4.8, whvp: 16.4, hvpg: 11.7 }), { fhvp: 4.8, whvp: 16.4, hvpg: 11.6 }, 'wedged minus free as printed, never 11.7');
  assert.equal(levelsOf({ fhvp: 4.1, whvp: 10.5, hvpg: 6.4 }).hvpg, 6.4);
  assert.equal(levelsOf({ whvp: 10 }), null);
  assert.equal(levelsOf(null), null);
  assert.ok(SWEEP_FREE_MS > 2000 && SWEEP_FREE_MS < 5000, `free sweep ${SWEEP_FREE_MS} ms`);
  assert.ok(SWEEP_SETTLE_MS > 1000 && SWEEP_SETTLE_MS < 4000, `settle ${SWEEP_SETTLE_MS} ms`);
  const src = read('../src/ui/tool-hvpg.js');
  assert.match(src, /mon\.set\('free', cur, 0\);/); assert.match(src, /mon\.set\('wedge', cur, 0\);/); assert.match(src, /mon\.set\('result', cur, 1\);/);
  assert.match(src, /mon\.balloon\(ease\(k\)\)/, 'the balloon is driven from the procedure\'s clock');
  assert.match(src, /mon\.set\('result', cur, 1, true\)/, 'jumped to or gone back to: the finished tracing at once');
  assert.match(src, /pending = forward && !again \? 'sweep' : 'result'/, 'it plays going forward onto the slide, once');
  assert.match(src, /cur\.hvpg = tenthGap\(cur\.whvp, cur\.fhvp, target\.hvpg\)/, 'the levels ease and the HVPG follows them');
  assert.match(read('../src/ui/hvpg-proc.js'), /function set\(m, f = null, b = bal, instant = false\)/);
  assert.match(read('../src/ui/hvpg-proc.js'), /if \(\(instant \|\| matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches\) && !falling\(\)\) t = t1;/);
  // The presenter tells the tools when a slide is stepped onto, and not when its card is only kept or rebuilt in place.
  assert.match(presenter, /const showTool = \(s, i, lap = false, forward = false\) => ui\.tools\.show\(s\.tool, \{ slide: i, stateKey: stateOf\[i\], forward,/);
  assert.match(presenter, /showTool\(s, i, lap, i === lastAt \+ 1\)/);
  assert.match(tools, /inst\.arrive\?\.\(\{ forward, again: cur === inst \}\);/);
});

// ── Registration ──
test('the two kinds are made, titled, shortened for a phone and laid out like the other instruments', () => {
  for (const [kind, creator] of [['vitals', 'createVitalsMonitor'], ['hvpg', 'createHvpgCard']]) {
    assert.match(tools, new RegExp(`k === '${kind}' \\? ${creator}\\(\\)`), `${kind} is made`);
    assert.match(tools, new RegExp(`${kind}: \\(\\) => '[^']+'`), `${kind} has a title`);
    assert.ok(css.includes(`.pz ${'.pz-data'.repeat(6)} > .pz-tool:is([data-kind="vitals"], [data-kind="hvpg"]) { width: 100%; }`), `${kind}: full width, over the stacked card's width rule`);
  }
  assert.match(tools, /vitals: \(\) => 'Vital signs'/);
  assert.match(tools, /hvpg: \(\) => 'HVPG, catheter tracing'/);
  assert.match(presenter, /'HVPG, catheter tracing': 'HVPG tracing'/);
  assert.match(css, /\.pz-tool\[data-kind="vitals"\] \.vitals-box \{ width: 100%; height: clamp\(/);
  assert.match(css, /\.pz\.stack \.pz-tool\[data-kind="vitals"\] \.vitals-box \{ height: 140px; \}/);
  assert.match(css, /\.pz-tool\[data-kind="hvpg"\] \.pz-mon \{ margin-top: 0; \}/, 'the monitor sits at the top of its card');
});
