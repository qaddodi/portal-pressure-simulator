import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wrapLabel } from '../src/ui/wrap-label.js';

// Tests > Pressure > Over time: the header (HVPG, its number, the status over its trend) is one row on every screen,
// with Smooth and the 10 s / 2 min / Days switch beside the trace pills, and a long event label wraps instead of ending in "…".

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../styles/app.css'), src = read('../src/ui/pressure-time.js');

test('the header holds only the readout; Smooth and the range switch sit with the trace pills', () => {
  assert.match(src, /h\('span', \{ class: 'pt-st' \}, heroSev, heroDelta\)/);
  assert.match(src, /chips\.append\(h\('div', \{ class: 'pt-ctl' \}, smoothBtn, rangeSeg\)\)/);
  assert.match(src, /h\('div', \{ class: 'pt-head' \}, hero\)/);
});

test('the pills row wraps and never scrolls; the switches end it at the pills\' height', () => {
  const chips = css.match(/^\.pt-chips \{[^}]*\}/m)[0];
  assert.match(chips, /flex-wrap: wrap/);
  assert.doesNotMatch(chips, /overflow/);
  assert.match(css, /^\.pt-ctl \{[^}]*margin-left: auto;[^}]*\}/m);
  assert.match(css, /^\.pt-range \{[^}]*height: 28px;/m);
  assert.match(css, /^\.pt-range button \{ min-height: 0;/m, 'a touch screen\'s 36 px button floor pushes the switch below the pills again');
  assert.doesNotMatch(css, /\.pt-head :is\(\.pt-range, \.pt-smooth\)/);
  // A slide's trace keeps its own header: no switches, the status a grid item as before.
  assert.ok(css.includes('.pz-tool .pt-ctl { display: none; } .pz-tool .pt-st { display: contents; }'));
});

test('a long marker label wraps between words, evenly, and is never cut', () => {
  const width = (t) => t.length * 7;   // 7 px a character
  assert.equal(src.includes("+ '…'"), false, 'a marker label is cut with an ellipsis again');
  const fit = wrapLabel('Caudate lobe carries the outflow', 170, width);
  assert.equal(fit.lines.join(' '), 'Caudate lobe carries the outflow');
  assert.equal(fit.lines.length, 2);
  assert.ok(fit.lines.every((l) => width(l) <= 170));
  assert.ok(Math.abs(width(fit.lines[0]) - width(fit.lines[1])) <= 7 * 8, `uneven: ${fit.lines.join(' / ')}`);
  assert.deepEqual(wrapLabel('Cirrhosis 62 %', 170, width), { lines: ['Cirrhosis 62 %'], w: 98 });
  assert.equal(wrapLabel('Hyperdynamic', 60, width), null, 'a word wider than the room is left unlabelled, not cut');
});
