// Closing the Tests card keeps the view where it is (17 Oct): no glide back to the fit. Opening it still frames the figure.
// (The UI files need a DOM to import, so they are read as text.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const main = read('../src/ui/main.js'), stage = read('../src/ui/stage.js');

test('closing Tests keeps the view; opening it refits', () => {
  const body = main.match(/function setPanelTab\(tab\) \{[\s\S]*?\n\}/)[0];
  assert.match(body, /if \(instr\) refitStage\(\); else \{ clearTimeout\(refitT\); stage\?\.keepView\(\); \}/);
  assert.doesNotMatch(body.replace(/if \(instr\) refitStage\(\);/, ''), /refitStage\(\)/, 'no refit on close');
});

test('keepView lets go of the home framing so the follow-up looks leave the view alone', () => {
  assert.match(stage, /function keepView\(\) \{ if \(!lobuleOn\) homeAt = null; \}/);
  assert.match(stage, /const home = !!homeAt && /, 'home following needs a home framing');
  assert.match(stage, /fit, refit, keepView,/);
});
