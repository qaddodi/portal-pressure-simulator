// Opening the Tests card leaves the camera where it is (Mohammad, 20 Oct): no refit when it opens, none while the sheet
// settles or a tool's card changes height, and none from the home framing's look; a slide keeps framing itself, and any
// other change to the free space (another card, a resize, a turn) still refits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');

test('opening Tests keeps the view outside a slide; closing it and every other change refit as before', () => {
  const main = src('main.js');
  assert.match(main, /if \(instr && !app\.classList\.contains\('presenting'\)\) \{ stage\?\.keepView\(true\); clearTimeout\(refitT\); \}/);
  // Everything else still refits: a slide (presenting), the card closing, and Tests closed by another sheet.
  assert.match(main, /stage\?\.keepView\(false\);\s*if \(instr \|\| stage\?\.closeView\(\)\) refitStage\(\); else clearTimeout\(refitT\);/);
});

test('the stage skips the refit and the home look only while the Tests card alone has changed the free space', () => {
  const stage = src('stage.js');
  // The space is read without the Tests card and the vitals dock; any other change (size, another card) ends the hold.
  assert.match(stage, /safeInsets\(false, \[document\.getElementById\('dock'\), document\.getElementById\('vdock'\)\]\)/);
  assert.match(stage, /if \(!store\.get\(\)\.presenting && keptSpace === spaceSig\(\)\) return true;\s*keptSpace = null;\s*return false;/);
  assert.match(stage, /function refit\(\) \{\s*if \(lobuleOn \|\| keptNow\(\)\) return;/);
  assert.match(stage, /if \(keptNow\(\)\) return;\s{3}\/\/ \(the Tests card alone has changed the space/);
  assert.match(stage, /keepView\(on\) \{ keptSpace = on \? spaceSig\(\) : null; \}/);
  // The Fit button is an explicit ask and always fits.
  const fit = stage.slice(stage.indexOf('const fit = () => {'), stage.indexOf('// A card or sheet opened or closed'));
  assert.ok(!fit.includes('keptNow'));
});
