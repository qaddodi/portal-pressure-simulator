// The Layers, Blood and Colored-by sheets change the figure, so over the thumb dock they are cards the camera frames around (as Tests and Treat are):
// the figure keeps a strip above the sheet and each toggle shows (16 Nov 2026, iPhone 375x812: the sheet covered about 85 % of the screen and no toggle's
// effect could be seen). One rule in util.js popover (`safe`), used by every menu of that kind; this test fails a menu of that kind that leaves it out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const main = read('src/ui/main.js'), util = read('src/ui/util.js'), fit = read('src/ui/stage-fit.js'), dockCss = read('styles/app-10-thumb-dock.css');

test('popover(safe) registers a menu sheet with the camera, resting where it ends', () => {
  assert.match(util, /safe = null \} = \{\}\) \{/, 'popover takes a `safe` option');
  assert.match(util, /if \(asSheet && safe\) \{ el\.dataset\.safe = safe; el\.dataset\.safeRest = ''; el\.dataset\.restTranslate = '0 0'; \}/);
});

test('a leaving menu sheet no longer counts in the camera frame', () => {
  assert.match(fit, /classList\.contains\('leaving'\)/);
});

test('every menu that changes the figure is a safe sheet', () => {
  for (const [name, re] of [
    ['Layers', /title: 'Layers', safe: 'bottom' \}\)/],
    ['Blood', /popover\(anchor, bloodItems\(\), \{ cls: 'blood-pop', safe: 'bottom' \}\)/],
    ['Lobule layers', /popover\(anchor, lobuleLayerItems\(\), \{ cls: 'blood-pop', safe: 'bottom' \}\)/],
    ['Colored by', /\], \{ cls: 'layers-pop', safe: 'bottom' \}\)/],
  ]) assert.match(main, re, `${name} sheet must pass safe: 'bottom' to popover`);
});

test('the Layers sheet stops under half the screen so a figure strip stays', () => {
  const m = dockCss.match(/html\.thumb-ui \.menu\.as-sheet\.layers-pop \{ max-height: min\((\d+)dvh,/);
  assert.ok(m, 'a layers-pop cap in the phone block');
  assert.ok(+m[1] <= 50, 'under half the screen');
});

test('the Moving blood section says the chevrons point the way, and the old arrows-only line is gone', () => {
  assert.ok(!/arrows only/.test(main), 'the old line "Off, with Chevrons on: arrows only" is gone');
});
