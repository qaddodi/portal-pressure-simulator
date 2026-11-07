// The figure's GPU glass reads a callout's shape from its glass's first child's first child (glass-gl.js readPanes). The outline's
// GPU picture (2 Nov 2026) must keep that order, or no glass is drawn and the callout shows through ("the callouts are transparent",
// Mohammad, 2 Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cl = readFileSync(new URL('../src/ui/callout.js', import.meta.url), 'utf8');
const gg = readFileSync(new URL('../src/ui/glass-gl.js', import.meta.url), 'utf8');

test('the glass reads the path at glass > model > path, and the callout keeps the model first with its canvas after it', () => {
  assert.match(gg, /const d = g\.firstChild\?\.firstChild\?\.getAttribute\?\.\('d'\);/);
  assert.match(cl, /glass\.append\(svgModel\('svg', \{ viewBox: '0 0 1 1', preserveAspectRatio: 'none' \}, svgModel\('path'\)\)\);/);
  assert.match(cl, /S\.gl\.show\(S\.svg, false\);\n\s+S\.glass\.prepend\(S\.svg\);/);
  assert.match(cl, /if \(!el\.isConnected\) return;/, 'a report off the page keeps the observation');
  assert.match(cl, /const glass = el\.firstElementChild, svg = glass\.firstElementChild, path = svg\.firstElementChild;/);
});
