// A label's pill (31 Oct, Mohammad's yes to "pills without the hairline stroke, 6 px corners"): the figure's label pills are their
// fill alone, no hairline round them, and their corners are 6 px, the cards' tile family. A pill that wants an outline says so
// itself (a note mark, a selected or focused name, the liver card), and a numbered marker stays a round chip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const rule = (sel) => css.split('\n').find((l) => l.startsWith(sel));

test('the base rule of a label pill has a fill and no stroke', () => {
  const r = rule('#labels .lb-bg {');
  assert.ok(r, 'the base rule is there');
  assert.match(r, /fill: var\(--glass\); stroke: none;/);
  assert.doesNotMatch(r, /hairline|stroke-width/);
});

test('every pill that does take an outline gives its own stroke and its own width', () => {
  // The note mark, the selected or focused name (stroke widths stated with them, not borrowed from the base), the liver card.
  assert.match(css, /\.lb\.node:focus-visible \.lb-bg, \.lb\.node\.sel\.inline \.lb-bg \{ stroke: var\(--accent\); stroke-width: 1\.5; \}/);
  assert.match(css, /\.lb\.focus\.k-note \.lb-bg \{ fill: var\(--surface\); stroke: var\(--text-2\); stroke-width: 1; \}/);
  assert.match(css, /\.lb\.focus\.ring \.lb-bg \{ stroke: var\(--stage-bg\); stroke-width: 4px; paint-order: stroke; \}/);
  assert.match(css, /#labels \.lb\.module \.lb-bg \{ fill: transparent; stroke: var\(--module-line\); \}/);
});

test('no rule gives a label pill the hairline back', () => {
  for (const l of css.split('\n')) {
    if (!/\.lb-bg/.test(l)) continue;
    assert.doesNotMatch(l.replace(/\/\*.*?\*\//g, ''), /stroke: var\(--hairline\)/, l.slice(0, 100));
  }
});

test('a pill has 6 px corners; only a numbered marker is a round chip, and the FibroScan callout is a pill like the rest', () => {
  assert.match(stage, /rx: it\.chip \? \(it\.h \+ 2 \* it\.padY\) \/ 2 : 6 \}\)\);/);
  assert.doesNotMatch(stage, /\bpill: true\b/, 'nothing asks for a capsule any more');
  const scan = stage.match(/function scanItem\(\) \{[\s\S]*?\n {2}\}/)[0];
  assert.match(scan, /bg: true, padX: 8, padY: 3/);
  assert.doesNotMatch(scan, /chip/);
  assert.match(stage, /cls: 'fx-step'[^\n]*bg: true, chip: true,/);
});
