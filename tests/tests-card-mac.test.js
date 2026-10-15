// The Tests card on a laptop or tablet (15 Oct review): the card ends under its content on every tab, Doppler reads in the
// monitor's top strip, every tab's tiles share the Readouts style, Readouts runs three to a row, and the footnotes are gone.
// (The UI files need a DOM to import, so they are read as text.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const dock = read('../src/ui/dock.js'), doppler = read('../src/ui/doppler.js'), instruments = read('../src/ui/instruments.js');
const readouts = read('../src/ui/readouts-pane.js'), css = read('../styles/app.css');

test('every tab but Pressure and Wall mechanics is fitted to its content', () => {
  const fit = dock.match(/const FIT = \[([^\]]*)\]/)[1];
  for (const id of ['abdomen', 'hvpg', 'fibroscan', 'doppler', 'endoscopy', 'readouts']) assert.ok(fit.includes(`'${id}'`), `${id} is fitted`);
  assert.match(dock, /!\(open\[0\] === 'endoscopy' && endoSub === 'wall'\)/, 'Wall mechanics keeps the full card');
  assert.match(dock, /function setEndoSub[\s\S]*?fitHeight\(\);\n {2}\}/, 'switching Scope view / Wall mechanics refits the card');
  // the measure counts everything the pane stacks (Scope's switch above its view), not the view alone
  assert.match(dock, /\[\.\.\.view\.parentElement\.children\]\.filter\(\(c\) => c\.offsetHeight > 0\)/);
});

test('fitted pictures take their own size, and the fitted scope view is one column', () => {
  assert.match(css, /\.instrument-view\.nat \.dop-main \{ flex: none; \}/);
  assert.match(css, /\.instrument-view\.nat \.endo-stage > \.chart-box\.square \{ width: min\(100cqw, 560px\); \}/);
  assert.match(css, /\[data-pane="endoscopy"\] > \.instrument-view\.nat:not\(\.wall-view\) \{ grid-template-columns: minmax\(0, 1fr\);/);
});

test('Doppler on the side card reads in the monitor\'s top strip, and the highest point is named Max', () => {
  assert.match(css, /#app \.instrument-workspace\.side \.instrument-view\.dop \.dop-box \{ --dop-ov: 1;/);
  assert.match(css, /#app \.instrument-workspace\.side \.instrument-view\.dop :is\(\.dop-vel, \.dop-dir, \.dop-pattern\) \{ grid-row: 1;/);
  assert.match(doppler, /k === 'Peak' \? 'Max' : k/);
  // (the big reading stays the time-averaged spectral peak: the same number as the panel, callouts and slides)
  assert.match(doppler, /set\(velEl\.firstChild, num\(drawn/);
});

test('the Tests card tiles share one style: names in sentence case, left aligned', () => {
  const tail = css.slice(css.indexOf('── Tests card tiles: one style'));
  assert.ok(tail.length > 100, 'the shared tile block exists');
  assert.match(tail, /\.instrument-workspace \.dop-stats dt,\n\.instrument-workspace \.dock-pane\[data-pane="endoscopy"\] > \.instrument-view:not\(\.wall-view\) \.endo-read dt \{[^}]*text-transform: none;[^}]*text-align: left;/);
  assert.match(tail, /\.endo-read > div \{ align-items: flex-start;[^}]*text-align: left;/);
});

test('Readouts is three to a row (two in a narrow card) with no footnote; Scope has no F1-F3 footnote', () => {
  assert.match(css, /\.rp-tiles \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/);
  assert.match(css, /@container \(max-width: 399px\) \{ \.rp-tiles \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
  assert.doesNotMatch(readouts, /Each bar shows/);
  assert.doesNotMatch(instruments, /Drawn from the model/);
  assert.match(instruments, /class: 'endo-g', title: 'F1 small and straight, F2 enlarged and tortuous, F3 large and beaded\.'/);
});

test('Ascites: serum albumin uses the drain\'s stepper, and the diuretic line is plain', () => {
  assert.match(instruments, /h\('div', \{ class: 'ab-dp-vol ab-sa', role: 'group', 'aria-label': label \}, minus, out, plus\)/);
  assert.match(instruments, /'Spironolactone 100 mg \+ furosemide 40 mg'/);
  assert.doesNotMatch(instruments, /5 : 2'\)/);
});

test('Ascites on the side card: the gauge, belly and Drain block are sized by the card\'s width, not its fitted height', () => {
  const m = css.match(/#app:not\(\.thumb\) \.instrument-workspace\.float-ui\.side \.dock-pane > \.instrument-view\.ab \.ab-vol \{ --ab-bw: ([^;]+);/);
  assert.ok(m, 'the side card has its own belly size');
  assert.doesNotMatch(m[1], /cqh/, 'no height term: the fitted card follows the belly, so a height cap kept it at its old ~190 px');
  const cap = Math.max(...[...m[1].matchAll(/(\d+)px\)/g)].map((x) => +x[1]));
  assert.ok(cap >= 320, `the belly may grow past the old 250 px cap (now ${cap} px)`);
  // the Drain controls grow with the belly, and the phone keeps its own sizes
  assert.match(css, /#app:not\(\.thumb\) \.instrument-workspace\.side \.ab-dp :is\(\.ab-dp-vol, \.ab-dp-alb, \.ab-drain\) \{ height: clamp\(32px, calc\(var\(--ab-bw\) \* \.15\), 42px\); \}/);
});
