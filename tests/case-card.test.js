// The case card: a new patient's case covers the figure while the patient loads, and Next lifts it before the slide goes on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SITES } from '../src/ui/decks/sites.js';

const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('Sites and causes gives each site slide (and only those) a case', () => {
  const withCase = SITES.slides.filter((s) => s.vignette);
  assert.deepEqual(withCase.map((s) => s.site), ['pre', 'presin', 'sin', 'postsin', 'post', 'cardiac']);
  for (const s of withCase) assert.ok(s.preset && s.vignette.length < 220, s.id);
});

test('Next lifts an open case card before it changes the slide', () => {
  assert.match(src, /const next = \(\) => \{\s*if \(caseLift\) \{ caseLift\(\); return; \}/);
  // Shown only going forward onto a new patient, and loaded behind the card before it lifts.
  assert.match(src, /s\.vignette && ui && !booting && !rev && !lap && to > lastAt && \(si !== shownState \|\| liveOff\)/);
});

test('the case card is cards glass, enters and leaves whole, never resizing', () => {
  const rule = css.match(/\.pz-case \{[^}]*\}/)[0];
  assert.match(rule, /backdrop-filter: blur\(16px\) saturate\(1\.15\)/);
  assert.match(rule, /height: fit-content/);
  assert.match(rule, /transition: opacity \.45s var\(--ease\), transform \.45s var\(--ease\);/);
  assert.doesNotMatch(rule, /scale/);
});

test('the case text is set large: well above the teaching card body, never under 28px', () => {
  const p = css.match(/\.pz-case-p \{[^}]*\}/)[0];
  assert.match(p, /font: 500 max\(calc\(var\(--s-body\) \* 1\.75\), 28px\)/);
});
