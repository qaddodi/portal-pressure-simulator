// The teaching features of 25 Oct (review/deck-teaching-ideas/recommendations.md, Mohammad's "All"): the answer hold on question slides,
// the criteria card, Predict, the case card's question, self-study and the new cards. Each is opt-in: a built-in slide uses one only where
// tests/deck-adopted.js lists it, and the presenter's wiring is checked here from its source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DECKS } from '../src/ui/decks.js';
import { adopted } from './deck-adopted.js';

const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const slidesUsing = (f) => DECKS.flatMap((d) => d.slides.filter((s) => s[f] !== undefined).map((s) => [d, s]));

test('hold: only adopted question slides use it, each a true flag on a slide with a card and no preset answer', () => {
  const used = slidesUsing('hold');
  assert.ok(used.length >= 11, 'Where is the resistance? and Read the Doppler hold their question slides');
  for (const [d, s] of used) {
    assert.ok(adopted(d, s, 'hold'), `${d.id}/${s.id}: hold is opt-in (tests/deck-adopted.js)`);
    assert.equal(s.hold, true, `${d.id}/${s.id}: hold is true`);
    assert.ok(!s.visual && (s.tool || s.data), `${d.id}/${s.id}: a held slide has a data card to hold`);
    assert.ok(!s.site, `${d.id}/${s.id}: a question slide names no level`);
  }
  for (const d of DECKS.filter((x) => x.id === 'where-resistance' || x.id === 'read-doppler')) {
    for (const s of d.slides.filter((x) => /^q\d$/.test(x.id))) assert.equal(s.hold, true, `${d.id}/${s.id} holds its answer`);
  }
});

test('hold: the presenter sets it out of sight and lets the answer slide ease it in once it has landed', () => {
  const p = src('presenter.js');
  assert.match(p, /function holdAnswer\(on, instant = false\)/);
  assert.match(p, /holdAnswer\(!s\.visual && \(!!s\.hold \|\| holdEase/);
  assert.match(p, /paintOverlays\(s, to, st\);\n\s*if \(holdEase\) \{ holdEase = false; holdAnswer\(false\); \}/);
  assert.match(src('presenter-tools.js'), /holdAnswer\(on, instant = false\) \{ cur\?\.hold\?\.\(!!on, instant\); \}/);
  const prof = src('tool-profile.js');
  assert.match(prof, /new Set\(held \? \[\] : blocksOf\(goal, healthy\(\)\)\)/, 'held, the chart asks for no red blocks (they fade out as any block does)');
  assert.match(prof, /if \(hk < 0\.005\) return \[\];/, 'held, the brackets ease out');
  // (CSS: the rating words, the Doppler's words and the figure's alerts fade, never snap.)
  assert.match(css, /\.pz-data\[data-held\] \.pzt-r, \.pz-data\[data-held\] \.pz-tool :is\(\.dop-dir, \.dop-pattern, \.dop-note\) \{ opacity: 0; \}/);
  assert.match(css, /\.pz-data \.pzt-r, \.pz-data \.pz-tool :is\(\.dop-dir, \.dop-pattern, \.dop-note\) \{ transition: color \.4s var\(--ease\), opacity \.5s var\(--ease\); \}/);
  assert.match(css, /\.app\.pz-held \.lb-alert \{ fill-opacity: 0; \}/);
});
