// The Treat card's on/off states (1 Nov 2026): drug rows show an empty box that takes a drawn tick, a procedure in place
// is tinted with a tick in its icon's place (no name loses room), fluids answer a press, and a tab counts what runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const chart = read('src/ui/chart.js');
const css = read('styles/app.css').replace(/\/\*[\s\S]*?\*\//g, '');

test('drug rows: an empty box off, the accent edge and a tick drawn in when on', () => {
  assert.match(css, /\.order-chip \.oc-dot \{[^}]*border-radius: 5px; box-shadow: inset 0 0 0 1\.5px var\(--border-strong\)/);
  assert.match(css, /\.order-chip \.oc-dot :is\(svg, \.ic\) \{[^}]*stroke-dashoffset: 24;[^}]*opacity: 0; transition: opacity var\(--d-small\) var\(--ease\)/, 'the tick fades in (its drawing on is not eased: a repaint every frame)');
  assert.match(css, /\.order-chip\[aria-pressed="true"\] \.oc-dot :is\(svg, \.ic\) \{ opacity: 1; stroke-dashoffset: 0; \}/);
});

test('procedures in place: TIPS, DIPS, surgical shunt, BRTO and the balloons say so, the tick in the icon\'s own place', () => {
  for (const name of ['Balloon tamponade', 'TIPS', 'DIPS', 'BRTO']) assert.match(chart, new RegExp(`placed\\(proc\\('[a-z]+', '${name}'`), name);
  // (The surgical shunts are one order each, from surgical-shunts.js, with the same tick: Warren, both portocaval shunts, mesocaval, Meso-Rex.)
  assert.match(chart, /\.\.\.SURGICAL\.map\(\(x\) => placed\(proc\('stent', x\.label, x\.sub, /);
  assert.match(chart, /\(p\) => p\.tips\.on\)/);
  assert.match(chart, /\(p\) => !!p\.occluded\?\.C5\)/);
  assert.match(css, /\.order-btn \.ob-on \{ position: absolute; left: 8px;/, 'absolute: no reflow, no wrap');
  assert.match(css, /\.order-btn\[data-on\] \.ac-ic \{ opacity: 0; \}/);
  assert.doesNotMatch(css.match(/\.order-btn \{[^}]*\}/)[0], /transition:[^;]*(background|border|color|shadow)/, 'its states are taken at once (1 Nov 2026, move everything to GPU: a colour, shadow or edge eased repaints every frame, so it is taken at once)');
});

test('fluids say what they do and answer a press; a narrow card puts one per row', () => {
  assert.match(chart, /fluid\('1 L crystalloid', 'crystalloid', 'about 25% stays in the vessels'\)/);
  assert.match(chart, /b\.dataset\.given = ''/);
  assert.match(css, /@container treatpane \(max-width: 440px\) \{\s*\.treat-pane > \.order-grid\.three \{ grid-template-columns: minmax\(0, 1fr\); \}/);
});

test('a Treat tab counts its running orders past the name, so the name never moves', () => {
  assert.match(chart, /h\('span', \{ class: 'tt-l' \}, label, n\)/);
  assert.match(css, /\.treat-tabs \.tt-n \{ position: absolute; left: calc\(100% \+ 5px\);/);
});
