// Closing the Tests card (17 Oct): a fitted view is fitted again to the space the card leaves; a view the learner zoomed
// or panned stays where it is. Every way of closing it (the Tests button, its close button, Esc, a swipe) runs through
// setPanelTab, so they all end the same. Opening it still frames the figure.
// (The UI files need a DOM to import, so they are read as text.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const main = read('../src/ui/main.js'), stage = read('../src/ui/stage.js'), dock = read('../src/ui/dock.js');

test('opening Tests refits; closing it refits only a fitted view', () => {
  const body = main.match(/function setPanelTab\(tab\) \{[\s\S]*?\n\}/)[0];
  assert.match(body, /if \(instr \|\| stage\?\.closeView\(\)\) refitStage\(\); else clearTimeout\(refitT\);/);
  assert.equal(body.match(/refitStage\(\)/g).length, 1, 'no other refit on close');
});

test('every close path runs through setPanelTab', () => {
  assert.match(main, /onClose: \(\) => setPanelTab\('chart'\)/, 'dock.close (Tests button, close button, Esc)');
  assert.match(main, /dockSheet = sheetBehaviour\(\$\('#dock'\), \{[^\n]*onClose: \(\) => dock\.close\(\)/, 'a swipe');
  assert.match(dock, /function toggle\(\) \{\n {4}if \(isVisible\(\)\) close\(\);/, 'the Tests button closes through close()');
});

test('closeView: a fitted view fits again, a moved one is kept and lets go of home', () => {
  const fn = stage.match(/function closeView\(\) \{[\s\S]*?\n {2}\}/)[0];
  assert.match(fn, /\(fitTo && sameView\(at, fitTo\)\) \|\| \(morphTarget === 0 && homeAt && sameView\(at, homeAt\)\)\) return true;/);
  assert.match(fn, /homeAt = null;\n {4}return false;/);
  // every fit records where it went
  assert.match(stage, /function refit\(\) \{[\s\S]*?fitTo = to;[\s\S]*?\n {2}\}/);
  assert.match(stage, /const fit = \(\) => \{[\s\S]*?fitTo = to;[\s\S]*?\n {2}\};/);
  assert.match(stage, /fitSlow\(ms = 1300\) \{[^\n]*fitTo = to;/);
  assert.match(stage, /fit, refit, closeView,/);
});
