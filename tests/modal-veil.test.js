// Dialogs are lit like the "/" palette: their veil is their own outer shadow, never a background of the full-page .modal-back that lies over the figure's canvas
// (a dialog's GPU frost is drawn in that canvas, under .modal-back, so a background veil dimmed the glass along with the scene).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const rule = (sel) => { const i = css.indexOf('\n' + sel + ' {'); assert.ok(i >= 0, sel); return css.slice(i, css.indexOf('}', i)); };

test('.modal-back paints no veil over the dialog\'s glass', () => {
  assert.doesNotMatch(rule('.modal-back'), /background/);
});

test('the veil is the dialog\'s outer shadow, kept when the GPU draws the glass', () => {
  assert.match(rule('.modal'), /--modal-veil: 0 0 0 100vmax var\(--scrim\)/);
  assert.match(rule('.modal'), /box-shadow:[^;]*var\(--modal-veil\)/);
  assert.match(css, /:root:root \.modal\[data-gl\] \{ box-shadow: var\(--modal-veil\); \}/);
});
