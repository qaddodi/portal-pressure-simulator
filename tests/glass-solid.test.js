// No browser blur over the figure (1 Nov 2026, "Move everything to GPU"): html[data-glsolid] is set at boot unless ?glasssolid=0 or
// ?glasshost=0, every backdrop-filter is off under it, a glass the GPU does not draw ([data-gl] absent) takes the solid look of Settings ›
// Blur effect off, and the teaching card's shade is one of the cards' GPU glasses again (?shadegl=0 keeps it out).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const pres = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');

test('the boot script sets data-glsolid unless ?glasssolid=0 or ?glasshost=0', () => {
  assert.match(html, /if\(!\/\[\?&\]\(glasssolid\|glasshost\)=0\\b\/\.test\(location\.search\)\)document\.documentElement\.setAttribute\('data-glsolid',''\);\}catch\(e\)\{\}/);
});

test('under data-glsolid no element or pseudo-element keeps a backdrop-filter', () => {
  assert.match(css, /:root\[data-glsolid\] \*, :root\[data-glsolid\] \*::before, :root\[data-glsolid\] \*::after \{ -webkit-backdrop-filter: none !important; backdrop-filter: none !important; \}/);
});

test('every glass the GPU is not drawing turns solid, never the GPU-drawn one', () => {
  const rules = css.split('\n').filter((l) => l.startsWith(':root[data-glsolid]') && /background/.test(l));
  assert.ok(rules.length >= 5);
  for (const r of rules) assert.match(r, /:not\(\[data-gl\]\)/, r);
  for (const sel of ['.lb-glass', '.sv-legend', '.toast', '.pz-shade', '.pz-data.pz-data', '.pz-case', '.pz-bar', '.pz-scales', '.cl-glass', '.pz-sheet:not([data-gl])::before', '.lz-lab']) {
    assert.ok(rules.some((r) => r.includes(sel)), sel);
  }
});

test('the teaching card\'s shade is on the cards\' GPU glass, with ?shadegl=0 as the way back', () => {
  assert.match(pres, /const SHADE_GL = !\/\[\?&\]shadegl=0\\b\/\.test\(location\.search\);/);
  assert.match(pres, /find: \(\) => \(shadeGL \? \[shade, data, vcase, bar, scl, fk\] : \[data, vcase, bar, scl, fk\]\)/);
  assert.match(css, /:root\[data-glsolid\] \.pz-shade \{ will-change: transform; \}/);
});
