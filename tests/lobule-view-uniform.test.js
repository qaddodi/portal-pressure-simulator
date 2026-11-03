// The lobule's captions and leaders follow the camera as a view the GPU draws with (3 Nov 2026), not as a CSS transform on their layers:
// view(k, e, f) draws a point p at k p + (e, f) (a pan is k = 1; the dive is a scale about a point). A glide's leaders ride by moving the held geometry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
const lz = read('lobule-zoom.js'), cap = read('caption-gl.js'), svg = read('svg-gl.js');

test('captions and the leaders both take a view, and draw their whole picture inside it', () => {
  assert.match(cap, /view\(k, e, f\) \{ if \(vk === k && ve === e && vf === f\) return; vk = k; ve = e; vf = f; api\.paint\(\); \}/);
  assert.match(svg, /g\.view = \(k, e, f\) => \{ if \(g\.vk === k && g\.ve === e && g\.vf === f\) return;/);
  assert.match(svg, /ctx\.translate\(g\.ve \+ BLEED \* \(1 - g\.vk\), g\.vf \+ BLEED \* \(1 - g\.vk\)\); ctx\.scale\(g\.vk, g\.vk\);/);
});

test('a hand pan and the dive hand the camera to both, and put no transform on the labels or the leaders box', () => {
  assert.match(lz, /cap\.view\(1, dx, dy\); leadGL\.view\(1, dx, dy\);/);
  assert.match(lz, /cap\.view\(k, tx - k \* x, ty - k \* y\); leadGL\.view\(k, tx - k \* x, ty - k \* y\);/);
  assert.match(lz, /const unpan = \(\) => \{ panOn = false; cap\.view\(1, 0, 0\); leadGL\.view\(1, 0, 0\); \};/);
  assert.doesNotMatch(lz, /labels\.style\.transform/);
  assert.doesNotMatch(lz, /leadersBox\.style\.transform/);
});

test('a glide or a hand zoom moves the leaders\' held geometry with the labels', () => {
  assert.match(lz, /const RIDE_ATT = \['x1', 'x2', 'cx', 'y1', 'y2', 'cy'\];/);
  assert.match(lz, /setGeo\(e, RIDE_ATT\[k\], b \+ \(k < 3 \? d0 : d1\)\)/);
  assert.match(lz, /leadGL\.paint\(\)/);
});
