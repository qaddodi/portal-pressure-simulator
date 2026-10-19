// The patient button's highlight sits evenly inside its pill, and a highlighted menu row on touch takes its ⓘ along,
// so the band sits evenly inside the menu (Mohammad, 18 Oct: "uneven", "asymmetrical").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('the patient pill pads its button the same on every side', () => {
  const pads = [...css.matchAll(/^\s*\.tb-id \{ padding: ([^;]+); \}/gm)].map((m) => m[1]);
  assert.deepEqual(pads, ['3px']);
  assert.match(css, /\.tb-id\.float-pill \{ --inset: 3px; \}|, \.tb-id\.float-pill \{ --inset: 3px; \}/);
  // 46 = 40 + 2 × 3 (and 42 = 36 + 2 × 3 on a phone): the same gap above and below.
  assert.match(css, /\.app \{ --pill-h: 46px; --ctl-h: 40px; \}/);
  assert.match(css, /\.app \{ --pill-h: 42px; --ctl-h: 36px; \}/);
});

test('a highlighted menu row on touch carries its ⓘ in the same band', () => {
  const coarse = css.slice(css.indexOf('@media (pointer: coarse) {\n  .um-row'), css.indexOf('/* Phone: the same content as a bottom sheet'));
  assert.match(coarse, /\.um-row\[aria-current="true"\] \+ \.um-info[^{]*\{ background: var\(--accent-soft\); \}/);
  assert.match(coarse, /\.um-row\.pv-on \+ \.um-info \{ background: var\(--surface-2\); \}/);
  assert.match(coarse, /\.um-row:has\(\+ \.um-info\) \{ border-radius: var\(--r-control\) 0 0 var\(--r-control\); \}/);
});
