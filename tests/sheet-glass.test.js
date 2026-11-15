// The phone's Details, Treat and Tests sheets wear frosted GPU glass, like every card (Mohammad, 2 Nov 2026, "CARDS ARE GLASS").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appCss } from './split-src.js';

const css = appCss();

test('the plate asks for GPU glass, loses its paper once drawn, and shows none while its first frame comes in', () => {
  assert.match(css, /\.has-plate > \.sheet-plate \{ display: block;[^}]*--gl-glass: 1; --gl-tint: var\(--glass-tint\)/);
  assert.match(css, /\.has-plate\.has-plate > \.sheet-plate\.sheet-plate\.sheet-plate\[data-gl\] \{ background: none; \}/);
  assert.match(css, /:root:root\[data-cardgl\] \.has-plate\.has-plate > \.sheet-plate\.sheet-plate\.sheet-plate\[data-gl-wait\]:not\(\[data-gl\]\) \{ background: none; \}/);
  assert.match(css, /prefers-reduced-transparency: reduce\) \{ \.has-plate > \.sheet-plate \{ --gl-glass: 0; \} \}/);
});
