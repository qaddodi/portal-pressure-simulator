// No browser blur anywhere (1 Nov 2026, "Move everything to GPU"): no backdrop-filter and no CSS blur filter is declared in the styles,
// a glass the GPU does not draw ([data-gl] absent) takes the solid look of Settings › Blur effect off, and the teaching card's shade is
// one of the cards' GPU glasses (?shadegl=0 keeps it out, solid).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const pres = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const lgl = readFileSync(new URL('../src/ui/label-gl.js', import.meta.url), 'utf8');
const decls = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@supports[^{]*\{/g, '{');

test('no backdrop-filter and no blur() filter is declared in the styles', () => {
  assert.doesNotMatch(decls, /backdrop-filter\s*:(?!\s*none)/);
  assert.doesNotMatch(decls, /(?<![-\w])filter\s*:[^;}]*blur\(/);
});

test('every glass the GPU is not drawing is solid, never the GPU-drawn one', () => {
  const rules = css.split('\n').filter((l) => l.startsWith(':root:root') && /background/.test(l));
  assert.ok(rules.length >= 5);
  for (const r of rules) assert.match(r, /:not\(\[data-gl\]\)/, r);
  for (const sel of ['.lb-glass', '.sv-legend', '.toast', '.pz-shade', '.pz-data.pz-data', '.pz-case', '.pz-bar', '.pz-scales', '.cl-glass', '.pz-sheet:not([data-gl])::before', '.lz-lab']) {
    assert.ok(rules.some((r) => r.includes(sel)), sel);
  }
});

test('the teaching card\'s shade is on the cards\' GPU glass, with ?shadegl=0 as the way out', () => {
  assert.match(pres, /const SHADE_GL = !\/\[\?&\]shadegl=0\\b\/\.test\(location\.search\);/);
  assert.match(pres, /find: \(\) => \[\.\.\.\(shadeGL \? \[shade, data, vcase, bar, scl, fk\] : \[data, vcase, bar, scl, fk\]\), \.\.\.railGhosts\(\)\.filter\(\(g\) => shadeGL \|\| g\.dataset\.ghost !== 'shade'\)\]/, 'and the copies riding out on the rail, card-throw.js');
  assert.match(css, /:root:root \.pz-shade \{ will-change: transform; \}/);
});

test('the FibroScan beam\'s softness is a length the GPU atlas draws, not a CSS blur', () => {
  assert.match(css, /\.scan-probe \.sp-beam \{ fill: url\(#sp-beam\); --sp-soft: 5px; \}/);
  assert.match(lgl, /getPropertyValue\('--sp-soft'\)/);
});
