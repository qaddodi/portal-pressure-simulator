// Between the model's frames a breathing vessel's width eases on every display frame. That step writes only what follows
// from the widths (stepWidths); anything else under way takes the full update, so the picture is the same frame for frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const STAGE = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const body = (name) => {
  const at = STAGE.indexOf(`  function ${name}(`);
  assert.ok(at >= 0, `${name} exists`);
  return STAGE.slice(at, STAGE.indexOf('\n  }\n', at));
};

test('the display loop tries the width step before the full update', () => {
  assert.match(STAGE, /else if \(widthEasing && F && !stepWidths\(\)\) update\(F\);/);
});

test('the width step falls back to the full update whenever anything but the widths may have changed', () => {
  const s = body('stepWidths');
  for (const cond of ['f !== widthF', 'storeVer !== widthVer', 'CTM !== widthCTM', 'coilEasing', 'organsEasing', 'catchUp',
    'lobuleOn', 'lz?.isOpen()', 'hid.at', 'plateStale', 'plateRedraw', 'blockersStale', 'watch.due()',
    'ascShown !== ascTarget', 'morph !== morphTarget', "wrap.classList.contains('gl-on')", 'x.reveal']) {
    assert.ok(s.includes(cond), `stepWidths checks ${cond}`);
  }
  assert.match(STAGE, /store\.on\('\*', \(\) => \{ storeVer\+\+; \}\);/);
  assert.match(body('updateInner'), /widthF = f; widthVer = storeVer; widthCTM = CTM;/);
});

test('both paths write a width the same way and draw the same width-led layers', () => {
  assert.match(body('updateInner'), /widthWrites\(x, w, t, f, k\);/);
  const inner = body('stepWidthsInner');
  assert.match(inner, /widthWrites\(x, w, t, f, EI\[x\.e\.id\]\);/);
  for (const call of ['renderTube(x, p, t, J)', 'clearJoins()', 'updateJoins(t)', 'syncVeins(t)', 'updateOverlays(', 'updateBridges(t)', 'updateLabels(f)']) {
    assert.ok(inner.includes(call), `the width step calls ${call}`);
  }
  // The labels are laid out again when a width moves past its 2 px band, as the full update's signature has it (sigWidth).
  assert.match(inner, /Math\.abs\(w - sw\) >= 2/);
  assert.match(body('sigWidth'), /Math\.abs\(w - s\) < 2/);
});

test('a coil or the liver still easing keeps the full update running', () => {
  assert.match(body('updateInner'), /widthEasing = coilEasing = true/);
  assert.match(body('updateOrgans'), /if \(lvT !== tT\) widthEasing = organsEasing = true;/);
  assert.match(body('updateOrgans'), /if \(moving\) widthEasing = organsEasing = true;/);
});
