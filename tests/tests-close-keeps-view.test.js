import { stageSource } from './stage-src.js';
// Closing the Tests card (17 Oct): a fitted view is fitted again to the space the card leaves; a view the learner zoomed
// or panned stays where it is. Every way of closing it (the Tests button, its close button, Esc, a swipe) runs through
// setPanelTab, so they all end the same. Opening it still frames the figure.
// (The UI files need a DOM to import, so they are read as text.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const main = read('../src/ui/main.js'), stage = stageSource(), dock = read('../src/ui/dock.js');

test('opening Tests refits; closing it refits only a fitted view', () => {
  const body = main.match(/function setPanelTab\(tab\) \{[\s\S]*?\n\}/)[0];
  assert.match(body, /if \(instr \|\| stage\?\.closeView\(\)\) refitStage\(\); else clearTimeout\(refitT\);/);
  assert.equal(body.match(/refitStage\(\)/g).length, 1, 'no other refit on close');
});

test('every close path runs through setPanelTab', () => {
  assert.match(main, /onClose: \(\) => setPanelTab\('chart'\)/, 'dock.close (Tests button, close button, Esc)');
  assert.match(main, /dockSheet = sheetBehaviour\(\$\('#dock'\), \{[^\n]*onClose: \(\) => dock\.close\(\)/, 'a swipe');
  assert.match(dock, /function toggleDock\(\) \{\n {4}if \(isVisible\(\)\) close\(\);/, 'the Tests button closes through close()');
});

test('closeView fits again a fitted view, whatever the tools did with the camera; a moved one is kept', () => {
  const fn = stage.match(/function closeView\(\) \{[\s\S]*?\n {2}\}/)[0];
  assert.match(fn, /if \((?:live\.)?(?:live\.)?fitted\) return true;\n {4}(?:live\.)?(?:live\.)?homeAt = null;\n {4}return false;/);
  // every fit marks the view fitted
  assert.match(stage, /function refit\(\) \{[\s\S]*?(?:live\.)?(?:live\.)?fitted = true;[\s\S]*?\n {2}\}/);
  assert.match(stage, /const fit = \(\) => \{[\s\S]*?(?:live\.)?(?:live\.)?fitted = true;[\s\S]*?\n {2}\};/);
  assert.match(stage, /fitSlow\(ms = 1300, opt = \{\}\) \{[^\n]*(?:live\.)?(?:live\.)?fitted = true;/);
  assert.match(stage, /if \(!(?:live\.)?sameView\(d, (?:live\.)?(?:live\.)?homeAt\)\) \{ (?:live\.)?(?:live\.)?homeAt = d; (?:live\.)?(?:live\.)?fitted = true;/, 'home following');
  // a pinch, a drag, the wheel and the zoom steps mark it moved
  assert.match(stage, /VT_BUF\.k = k; VT_BUF\.x = vx - (?:live\.)?(?:live\.)?(?:live\.)?drag\.wx \* k; VT_BUF\.y = vy - (?:live\.)?(?:live\.)?(?:live\.)?drag\.wy \* k; (?:live\.)?(?:live\.)?(?:live\.)?vt = VT_BUF; (?:live\.)?(?:live\.)?(?:live\.)?fitted = false;/);
  assert.match(stage, /(?:live\.)?(?:live\.)?vt = softPan\([^\n]*\); (?:live\.)?(?:live\.)?fitted = false;/);
  assert.match(stage, /stopGlide\(\); (?:live\.)?(?:live\.)?userMoved = true; (?:live\.)?(?:live\.)?fitted = false;/);
  assert.match(stage, /function animZoomAt\(cx, cy, factor\) \{\n {4}(?:live\.)?(?:live\.)?fitted = false;/);
  // the catheter's camera never touches it; a refit mid-measurement moves where its trip back ends
  const cam = stage.match(/function cathFocus\([\s\S]*?\n {2}\}/)[0] + stage.match(/function cathFollow\(\) \{[\s\S]*?\n {2}\}/)[0];
  assert.doesNotMatch(cam, /(?:live\.)?(?:live\.)?fitted/);
  assert.match(stage, /if \((?:live\.)?(?:live\.)?cath\.saved\) \{ (?:live\.)?(?:live\.)?cath\.saved = to; return; \}/);
  assert.match(stage, /fit, refit, closeView,/);
});
