import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { COLS, CUT, effOf, dirAbs, liveSettled, shownSig, LIVE_MIN, LIVE_STEADY, LIVE_MAX } from '../src/ui/table-marks.js';
import { stepBleedFade, fadeBleedShapes, BLEED_FADE, bleedShapes } from '../src/ui/blood.js';
import './dom-shim.js';
import { EXT } from '../src/ui/slide-ext.js';


// Three bugs from the external deck review (18 Oct): what-if tiles froze 7 s after a tap, a bleed's jets vanished in one
// frame, and the variceal bleed summary headed a column with the raw key "hb".
const presenter = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');

test('a what-if follows the model until its readings hold still, not for a fixed 7 s', () => {
  assert.equal(liveSettled(LIVE_MIN - 1, LIVE_MIN), false, 'never before the minimum');
  assert.equal(liveSettled(LIVE_MIN, LIVE_STEADY - 1), false, 'still moving at 7 s: keeps following (the buffer-off slide)');
  assert.equal(liveSettled(20000, 500), false);
  assert.equal(liveSettled(20000, LIVE_STEADY), true, 'stops once the shown numbers held for the steady span');
  assert.equal(liveSettled(LIVE_MAX, 0), true, 'and always stops at the cap');
  assert.equal(shownSig({ liver: 38.51, hvpg: 2.24 }, ['liver', 'hvpg']), shownSig({ liver: 38.54, hvpg: 2.21 }, ['liver', 'hvpg']), 'a drift too small to print counts as still');
  assert.notEqual(shownSig({ liver: 38.5 }, ['liver']), shownSig({ liver: 39.5 }, ['liver']));
  const body = presenter.slice(presenter.indexOf('async function liveSet('), presenter.indexOf('function whatIfEl('));
  assert.match(body, /liveSettled\(now - t0, now - still\)/);
  assert.ok(!/< 7000/.test(body), 'no fixed 7 s window left');
});

test('a bleed\'s jets and pool fade in and out over half a second, never in one frame', () => {
  assert.equal(BLEED_FADE, 0.5);
  let a = 0;
  a = stepBleedFade(a, true, 1 / 60);
  assert.ok(a > 0 && a < 0.1, 'a rupture fades in');
  for (let i = 0; i < 40; i++) a = stepBleedFade(a, true, 1 / 60);
  assert.equal(a, 1);
  a = stepBleedFade(a, false, 1 / 60);
  assert.ok(a > 0.9, 'one frame after the bleed stops, the jets are still nearly whole');
  for (let i = 0; i < 40; i++) a = stepBleedFade(a, false, 1 / 60);
  assert.equal(a, 0);
  assert.equal(stepBleedFade(1, false, 1 / 60, true), 0, 'Reduce Motion: at once');
  const SITES = { varix: [800, 230], fundus: [830, 300], stomachPool: [850, 320] };
  const shapes = bleedShapes({ site: 'VAR', total: 200 }, 90, 0.3, SITES);
  assert.equal(fadeBleedShapes(shapes, 1), shapes);
  assert.deepEqual(fadeBleedShapes(shapes, 0), []);
  const half = fadeBleedShapes(shapes, 0.5);
  half.forEach((sh, i) => { assert.equal(sh[6], shapes[i][6] * 0.5); assert.deepEqual(sh.slice(0, 6), shapes[i].slice(0, 6)); });
  // The stage steps the fade every frame, keeps the figure awake while it runs, and draws the last bleed while it fades out.
  assert.match(stage, /stepSpray\(dt\);/);
  assert.match(stage, /!plateEasing\(\) && !sprayFading\(\)/);
  assert.match(stage, /fadeBleedShapes\(bleedShapes\(sprayLast\.bleed/);
  assert.ok(!/if \(!F\?\.bleed\?\.active \|\| morph >= 0\.5\) return \[\];/.test(stage), 'no one-frame cut');
});

test('every summary-table column has a heading, and hemoglobin reads as higher-is-better', async () => {
  const dir = new URL('../src/ui/decks/', import.meta.url);
  for (const f of readdirSync(dir)) {
    const d = Object.values(await import(new URL(f, dir))).find((v) => Array.isArray(v?.slides));
    // (a column a deck visuals package registers, slide-ext.js, brings its own heading: one heading a column, never both)
    for (const s of d.slides) for (const k of (s.visual === 'table' && s.cols) || []) assert.ok(!!COLS[k] !== !!EXT.columns[k]?.heading, `${d.id}/${s.id}: column "${k}" has no heading, or two`);
  }
  assert.equal(COLS.hb, 'Hb');
  assert.match(CUT.hb, /<12.*<7 g\/dL/);
  assert.equal(effOf('hb', -1), 'bad', 'a falling hemoglobin is worse');
  assert.equal(effOf('hb', 1), 'good');
  assert.equal(dirAbs('hb', { hb: 6.5 }), -2);
  assert.equal(dirAbs('hb', { hb: 10 }), -1);
  assert.equal(dirAbs('hb', { hb: 13.9 }), 0);
});
