// No browser blur anywhere (1 Nov 2026, "Move everything to GPU"): no backdrop-filter and no CSS blur filter is declared in the styles,
// a glass the GPU does not draw ([data-gl] absent) takes the solid look of Settings › Blur effect off, and the teaching card's shade is
// one of the cards' GPU glasses.
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
  const rules = css.split('\n').filter((l) => l.startsWith(':root:root') && /background/.test(l) && !/^:root:root \.modal > header /.test(l) && !/\[data-gl\] \{ background: none;[^}]*\}$/.test(l));   // (the one rule that clears the CSS look where the GPU draws is the GPU-drawn one by design)
  assert.ok(rules.length >= 5);
  for (const r of rules) assert.match(r, /:not\(\[data-gl\]\)/, r);
  for (const sel of ['.lb-glass', '.sv-legend', '.toast', '.pz-shade', '.pz-data.pz-data', '.pz-case', '.pz-bar', '.pz-scales', '.cl-glass', '.pz-sheet:not([data-gl])::before', '.lz-lab']) {
    assert.ok(rules.some((r) => r.includes(sel)), sel);
  }
});

test('the teaching card\'s shade is on the cards\' GPU glass', () => {
  assert.doesNotMatch(pres, /SHADE_GL|shadegl/);
  assert.match(pres, /glass\?\.add\(\(\) => \[shade, data, vcase, bar, scl, fk\], \{/, 'and no copies riding out: every card leaves on the tap, card-throw.js');
  assert.match(css, /:root:root \.pz-shade \{ will-change: transform; \}/);
});

test('the FibroScan beam\'s softness is a length the GPU atlas draws, not a CSS blur', () => {
  assert.match(css, /\.scan-probe \.sp-beam \{ fill: url\(#sp-beam\); --sp-soft: 5px; \}/);
  assert.match(lgl, /getPropertyValue\('--sp-soft'\)/);
});
