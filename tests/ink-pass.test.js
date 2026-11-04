// F1: the presenter's ink is a pass of the figure's present, not a canvas of its own (ink-gl.js, gpu-two-contexts-plan.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/ink-gl.js', import.meta.url), 'utf8');

test('ink-gl makes no canvas and no context of its own', () => {
  const code = src.replace(/\/\/.*$/gm, '');
  assert.ok(!/getContext\(/.test(code), 'no getContext');
  assert.ok(!/createElement\(\s*['"]canvas/.test(code), 'no canvas element');
  assert.ok(!/loseContext/.test(code), 'no context to give back');
});

test('the pass is added to the figure\'s tops under the glass and taken out with the last stroke', () => {
  assert.match(src, /export const INK_ORDER = -2;/);
  assert.match(src, /t\.add\(\{ order: INK_ORDER, draw: pass \}\)/);
  // added only while ink is wanted, removed (and the figure presented once more) when it is not
  assert.match(src, /if \(!wanted\(\)\) \{ unpass\(\); return; \}/);
  assert.match(src, /offPass\(\); offPass = null;\s*\n\s*try \{ topOf\?\.present\?\.\(\)/);
});

test('the pass draws through the host\'s present into the figure\'s own framebuffer', () => {
  assert.match(src, /gl\.bindFramebuffer\(gl\.FRAMEBUFFER, topOf\.screen\)/);
  assert.match(src, /cw = topOf\.canvas\.width/);
  assert.ok(!/onFrameFinal/.test(src), 'no frame-final redraw: the present lays it');
});

test('the stage hands the presenter the figure\'s top, and the presenter passes it on', () => {
  const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  const pres = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(stage, /figureTop: \(\) => \(veins && !veins\.lost \? veins\.top : null\)/);
  assert.match(pres, /top: \(\) => stage\.figureTop\?\.\(\) \?\? null/);
});
