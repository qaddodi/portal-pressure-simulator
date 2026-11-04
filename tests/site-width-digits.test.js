import { stageSource } from './stage-src.js';
// A measuring site's reading counts to each new value (siteCount): its width is read again only when its text changes other
// than in its digits, which are tabular, so a counting number no longer forces a layout of the page at each step (his Mac, 30 Oct).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('a site reading\'s width is keyed on its text with every digit as a zero', () => {
  const src = stageSource();
  assert.match(src, /const wk = `\$\{el\.className\.replace\(\/\(\?:\^\|\\s\)off\(\?=\\s\|\$\)\/, ''\)\}\|\$\{el\.textContent\.replace\(\/\\d\/g, '0'\)\}\|\$\{W\}\|\$\{labelBase\(\)\}\|\$\{labelFonts\}`;/);
  assert.match(src, /if \(el\._wk !== wk \|\| !el\._half\) siteSize\(el, d, wk\);/);
  // (Read first in the next frame, never between the frame's writes: 1 Nov 2026.)
  assert.match(src, /function siteMeasure\(el, d, wk\) \{\n\s+el\._wk = wk; el\._half = el\.offsetWidth \/ 2;/);
  assert.match(src, /siteAsk \|\|= readFrame\(/);
  // (The digits it keys away are drawn tabular, so the width it kept is the width.)
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.cath-label b \{[^}]*font-variant-numeric: tabular-nums;/);
  // (The callout's own font shorthand sets its digits back to proportional; its number, the split share's numbers inside it
  // included, takes them tabular again, and no rule for the number or what it holds uses the shorthand.)
  assert.doesNotMatch(css, /\.cath-label[^{,]*\s(b|em|\.sp-[a-z]+)\b[^{]*\{[^}]*\bfont:/, 'no font shorthand resets the digits of a callout\'s number');
});
