// The phone's Details, Treat and Tests sheets wear frosted GPU glass, like every card (Mohammad, 2 Nov 2026, "CARDS ARE GLASS").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
const glass = readFileSync(new URL('../src/ui/glass-gl.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('the plate asks for GPU glass, loses its paper once drawn, and shows none while its first frame comes in', () => {
  assert.match(css, /\.has-plate > \.sheet-plate \{ display: block;[^}]*--gl-glass: 1; --gl-tint: color-mix\(in srgb, var\(--surface\)/);
  assert.match(css, /\.has-plate\.has-plate > \.sheet-plate\.sheet-plate\.sheet-plate\[data-gl\] \{ background: none; \}/);
  assert.match(css, /:root:root\[data-cardgl\] \.has-plate\.has-plate > \.sheet-plate\.sheet-plate\.sheet-plate\[data-gl-wait\]:not\(\[data-gl\]\) \{ background: none; \}/);
  assert.match(css, /prefers-reduced-transparency: reduce\) \{ \.has-plate > \.sheet-plate \{ --gl-glass: 0; \} \}/);
});
