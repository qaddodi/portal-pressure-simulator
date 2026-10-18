// Review items U2, U4, U8, U9, U10, U11, U12, U13 and U16 (docs/REVIEW_2026-10.md on its branch): undo on touch, a way out of
// the collapse banner (banner removed 18 Oct), "Why?" sentences that read aloud, Why? for Hb, failures in learner words, the shunt hint,
// "colored by" instead of "lens", one platelet unit, and the toast policy. The UI modules need a DOM, so they are read as text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine } from '../src/engine/engine.js';
import { explain, METRICS } from '../src/engine/explain.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const settled = (id) => { const e = new Engine(); e.loadPreset(id); for (let i = 0; i < 4; i++) e.settleQuick(); return e; };

test('U8: the Why? sentence reads aloud: no nested brackets, no arrows, "above healthy"', () => {
  const e = settled('csph');
  for (const id of ['hvpg', 'ppg', 'pv', 'map', 'hb']) {
    const { sentence } = explain(e, id);
    assert.doesNotMatch(sentence, /\([^)]*\(/, sentence);
    assert.doesNotMatch(sentence, /[▲▼:]/, sentence);
    assert.doesNotMatch(sentence, /vs\. healthy|mainly because of|Offsetting/, sentence);
  }
  const s = explain(e, 'hvpg').sentence;
  assert.match(s, /^HVPG is [\d.]+ mmHg, [\d.]+ above healthy\. Most of that is the cirrhosis \(\+[\d.]+\)/, s);
  assert.match(s, /[\d.]+ is taken off by the collaterals\.$/, s);
  // The bars' names are short, with the amount kept for the tooltip ("Cirrhosis 60 %").
  for (const c of explain(e, 'hvpg').contributions) assert.doesNotMatch(c.label, /[():]/, c.label);
  assert.match(read('../src/ui/why.js'), /'Working out what drives it…'/);
});

test('U9: hemoglobin has a Why? of its own, and a bleed explains it', () => {
  assert.equal(METRICS.hb.unit, 'g/dL');
  assert.match(read('../src/ui/dock.js'), /\{ id: 'hb', k: 'Hb', title: 'Hemoglobin', why: 'hb',/);
  const e = settled('csph');
  e.hemorrhage(1500);
  for (let i = 0; i < 8; i++) e.settleQuick();
  const r = explain(e, 'hb');
  assert.ok(r.total < -0.1, `Hb change ${r.total}`);
  assert.equal(r.contributions[0].label, 'Blood loss');
  assert.ok(r.contributions[0].delta < 0);
  assert.match(r.sentence, /below healthy\. Most of that is the blood loss/, r.sentence);
});

test('U2: Undo is reachable on touch, and no collapse banner covers the figure (removed 18 Oct)', () => {
  const tl = read('../src/ui/timeline.js'), main = read('../src/ui/main.js'), css = read('../styles/app.css');
  assert.match(tl, /\.\.\.\(canUndo\(\) \? \[menuBtn\('Undo the last change', \(\) => undo\(\)\)\] : \[\]\),\n\s+h\('div', \{ class: 'menu-title' \}, 'Jump ahead'\)/);
  assert.match(tl, /undo, canUndo, lastChangeLabel, redo/);
  assert.doesNotMatch(main, /would not survive|collapse-banner|syncCollapse/);
  assert.doesNotMatch(css, /\.collapse-banner/);
});

test('U10: failures are said in learner words', () => {
  const main = read('../src/ui/main.js'), stage = read('../src/ui/stage.js');
  assert.doesNotMatch(main, /see the console/);
  assert.match(main, /if \(kind === 'main'\) toast\(/);
  assert.match(main, /cannot draw the sinusoid view \(it needs WebGL2\)/);
  assert.match(stage, /toast\('This device cannot draw moving blood/);
});

test('U11: the shunt hint is one target per line, says Tap on touch and shows Esc only with a keyboard', () => {
  const main = read('../src/ui/main.js');
  assert.match(main, /verb = fine \? 'Click' : 'Tap'/);
  assert.match(main, /h\('b', \{\}, 'hepatic vein'\), ' makes a TIPS\.'/);
  assert.match(main, /h\('b', \{\}, 'IVC'\), ' below the hepatic veins makes a DIPS\.'/);
  assert.match(main, /h\('b', \{\}, 'left renal vein'\), ' makes a Warren shunt\.'/);
  assert.match(main, /fine \? h\('div', \{\}, 'Esc cancels\.'\) : null/);
});

test('U12 and U13: "colored by", never "lens", in words people see; platelets per µL', () => {
  for (const f of ['../src/ui/main.js', '../src/ui/palette.js']) assert.doesNotMatch(read(f), /[`'"]Lens: /, f);
  assert.doesNotMatch(read('../index.html'), /Live instrument workspace/);
  assert.doesNotMatch(read('../src/ui/dock.js'), /'aria-label': 'Instruments'/);
  for (const f of ['../src/ui/actions.js', '../src/ui/inspector.js', '../src/ui/table-marks.js', '../src/ui/presenter.js']) assert.doesNotMatch(read(f), /10⁹/, f);
  assert.match(read('../src/ui/inspector.js'), /toLocaleString\('en-US'\)\}\/µL/);
});

test('U16: no toast for what the figure already shows, and none but errors while presenting', () => {
  const util = read('../src/ui/util.js'), main = read('../src/ui/main.js');
  assert.match(util, /if \(kind !== 'bad' && !actions\?\.length && !present && document\.getElementById\('app'\)\?\.classList\.contains\('presenting'\)\) return \(\) => \{\};/);
  for (const f of ['../src/ui/main.js', '../src/ui/actions.js', '../src/ui/chart.js']) assert.doesNotMatch(read(f), /Band placed|Hemorrhage: 500 mL lost|Injecting dye/, f);
  assert.match(main, /store\.set\(\{ colorMode: next \}\); toast\(`Colored by /);
});
