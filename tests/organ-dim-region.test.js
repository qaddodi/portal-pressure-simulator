import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The live organs' dim and grey filter (organ-dim.js) covers the part of the plate on screen, not the whole plate: Safari draws
// a filtered group again over its whole region on every repaint, and a slide's zoomed camera made that region many times the
// screen (HVPG 8 to 9, lenses other than Pressure, 17 Oct). The region is fitted before each paint of a new view.
const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const fit = stage.slice(stage.indexOf('function fitOrganDim'), stage.indexOf('const plateEasing'));

test('the filter region is the screen in world units with a margin, within the plate', () => {
  assert.match(fit, /if \(!organDimOn\) return;/);
  assert.match(fit, /\[\[r\.left, r\.top\], \[r\.right, r\.top\], \[r\.left, r\.bottom\], \[r\.right, r\.bottom\]\]\.map\(\(\[x, y\]\) => clientToWorldFast\(x, y\)\)/, 'every corner of the stage');
  assert.match(fit, /const mx = \(x1 - x0\) \* 0\.1 \+ 8, my = \(y1 - y0\) \* 0\.1 \+ 8;/);
  assert.match(fit, /Math\.max\(ORGAN_DIM_RECT\[0\], Math\.floor\(x0 - mx\)\)/, 'rounded outward');
  assert.match(fit, /Math\.min\(ORGAN_DIM_RECT\[0\] \+ ORGAN_DIM_RECT\[2\], Math\.ceil\(x1 \+ mx\)\)/);
  assert.match(stage, /const ORGAN_DIM_RECT = \[200, -200, 1020, 1320\];/, 'the plate, as before');
});

test('it is fitted in the same task as every view change and resize, and when the filter comes on', () => {
  const vt = stage.slice(stage.indexOf('const applyVT = () => {'), stage.indexOf('function syncView'));
  assert.match(vt, /world\.setAttribute\('transform'[\s\S]*fitOrganDim\(\);/);
  assert.match(stage, /new ResizeObserver\(\(\) => \{ box = null; CTM = null; fitOrganDim\(\); \}\)\.observe\(wrap\);/);
  assert.match(stage, /addEventListener\('resize', \(\) => \{ box = null; CTM = null; fitOrganDim\(\); \}\);/);
  assert.match(stage, /if \(grey\) \{ organDimFx\.setAttribute\('values', organDimMatrix\(1, plateSat\)\); fitOrganDim\(\); \}/);
});

test('the plate copy for the GPU never carries the filter', () => {
  assert.match(stage, /c\.removeAttribute\('filter'\);/);
});
