// The "/" search palette is lit: its veil is its own outer shadow, never a background of the full-page .pal-back that lies over the figure's canvas
// (the palette's GPU frost is drawn in that canvas, under .pal-back, so a background veil dimmed the glass along with the scene).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const rule = (sel) => { const i = css.indexOf('\n' + sel + ' {'); assert.ok(i >= 0, sel); return css.slice(i, css.indexOf('}', i)); };

test('.pal-back paints no veil over the palette\'s glass', () => {
  assert.doesNotMatch(rule('.pal-back'), /background/);
  assert.doesNotMatch(css.slice(css.indexOf('/* Command palette */')), /\.pal-back[^{]*\{[^}]*background:\s*var\(--scrim\)/);
});

test('the veil is the palette\'s outer shadow, kept when the GPU draws the glass', () => {
  assert.match(rule('.pal'), /--pal-veil: 0 0 0 100vmax var\(--scrim\)/);
  assert.match(rule('.pal'), /box-shadow:[^;]*var\(--pal-veil\)/);
  assert.match(css, /:root:root \.pal\[data-gl\] \{ box-shadow: var\(--pal-veil\); \}/);
});
