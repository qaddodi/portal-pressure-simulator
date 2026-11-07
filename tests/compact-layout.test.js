import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// The compact layout (22 Oct): an iPad held sideways or a short Mac window. Its cards stand tighter before they zoom, and zoom
// only as far as their smallest lettering stays 12 px on the screen (they had zoomed to half, text down to 7 px).
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

test('a wider screen 860 px tall or less takes the compact layout', () => {
  assert.match(js, /const SHORT_H = 860;/);
  assert.match(js, /const short = !p && !low && H \/ k <= SHORT_H;\n\s*ui\.root\.classList\.toggle\('short', short\);/);
});

test('a compact card steps tighter, then zooms no further than 12 px on the screen, and past it only as a last resort', () => {
  assert.match(js, /function shortFit\(el\) \{[\s\S]*?for \(const c of \['pz-lt', 'pz-lt2'\]\) \{ if \(fits\(\)\) break; el\.classList\.add\(c\); \}[\s\S]*?return px > 12 && isFinite\(px\) \? Math\.ceil\(12 \/ px \* 1000\) \/ 1000 : 1;/);
  assert.match(js, /const shortFloor = !small && !lowFloor && ui\.root\.classList\.contains\('short'\) \? shortFit\(el\) : 0;/);
  assert.match(js, /if \(shortFloor > mins\[0\]\) mins\.unshift\(shortFloor\);/);
  // (Stacked under the words, its blocks step tighter, never smaller: no --pz-dk zoom in the compact layout.)
  assert.match(js, /if \(short\) \{ for \(const c of \['pz-lt', 'pz-lt2'\]\) \{[^}]*colHeight\(cw \/ k\)[^}]*\} return; \}/);
});

test('the compact data card and full-width slides take the roles\' sizes; tables tighten to one line a row', () => {
  assert.match(css, /\.pz\.short:not\(\.stack\):not\(\.low\) :is\(\.pz-data, \.pz-panel\) \{ --s-cap: calc\(var\(--t-cap\) \* var\(--ts, 1\)\); --s-lab: max\(12px, /);
  assert.match(css, /\.pz\.short:not\(\.stack\):not\(\.low\) \.pz-lt2 \.pz-table tbody th :is\(\.pz-kick, \.tw, \.tn, \.vs\) \{ display: inline; margin: 0; \}/);
});

test('the compact-size text floor stays a local check: CI runs no browser sweep of the slides (retired 4 Nov 2026)', () => {
  assert.ok(!/text-floor/.test(ci));
  assert.ok(existsSync(new URL('./e2e/text-floor.mjs', import.meta.url)), 'tests/e2e/text-floor.mjs is kept for a local run');
});
