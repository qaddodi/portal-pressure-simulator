import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wrapLabel } from '../src/ui/wrap-label.js';

// Tests > Pressure > Over time: the header (HVPG, its status and trend, Smooth, the 10 s / 2 min / Days switch) keeps
// to one row wherever the card has room, and a long event label on the chart wraps instead of ending in "…".

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../styles/app.css'), src = read('../src/ui/pressure-time.js');

test('the status stacks over its trend, and Smooth and the range switch move as one group', () => {
  assert.match(src, /h\('span', \{ class: 'pt-st' \}, heroSev, heroDelta\)/);
  assert.match(src, /h\('div', \{ class: 'pt-ctl' \}, smoothBtn, rangeSeg\)/);
});

test('the header takes one row on a card 500 px wide or more, two only below that, chosen by width alone', () => {
  const wide = css.match(/@container tpane \(min-width: 500px\) \{([\s\S]*?)\n\}/)[1];
  assert.match(wide, /\.pt-head, \.pt-hero \{ flex-wrap: nowrap; \}/);
  assert.match(wide, /\.pt-sev \{ white-space: nowrap; \}/);
  assert.doesNotMatch(wide, /ellipsis|overflow: hidden/);
  assert.match(css, /@container tpane \(max-width: 499\.98px\) \{ \.pt-hero \{ flex-basis: 100%; \} \}/);
  assert.doesNotMatch(css, /@media[^{]*\{\s*\.pt-num[^}]*\}\s*\.pt-hero \{ flex-basis: 100%; \}/, 'a screen-size rule forces two rows again');
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
