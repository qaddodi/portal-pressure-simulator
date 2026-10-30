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
  assert.match(STAGE, /else if \(widthEasing && F && !stepOrgans\(\) && !stepWidths\(\)\) update\(F\);/, 'the organ step, then the width step, then the full update');
});

test('the width step falls back to the full update whenever anything but the widths may have changed', () => {
  const s = body('stepWidths');
  for (const cond of ['f !== widthF', 'storeVer !== widthVer', 'CTM !== widthCTM', 'coilEasing', 'organsEasing', 'catchUp',
    'anatCovered()', 'hid.at', 'plateStale', 'plateRedraw', 'blockersStale', 'watch.due()',
    'ascShown !== ascTarget', 'morph !== morphTarget', "wrap.classList.contains('gl-on')", 'x.reveal']) {
    assert.ok(s.includes(cond), `stepWidths checks ${cond}`);
  }
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

test('between model frames, an organ ease alone steps the organs alone, under the width step\'s guards', () => {
  const src = STAGE;
  const fn = src.slice(src.indexOf('  function stepOrgans()'), src.indexOf('  function stepWidthsInner('));
  assert.match(fn, /if \(!organsEasing \|\| !f \|\| f !== widthF \|\| storeVer !== widthVer \|\| !CTM \|\| !widthCTM \|\| CTM\.sc !== widthCTM\.sc \|\| CTM\.a !== widthCTM\.a \|\| CTM\.b !== widthCTM\.b \|\| coilEasing \|\| catchUp\) return false;/, 'a pan takes the organ step, a zoom or turn the full update');
  assert.match(STAGE, /function syncView\(\) \{\n\s+viewRaf = 0;\n\s+if \(!F \|\| lz\?\.isOpen\(\)\) return;\n\s+refreshCTM\(\);\n\s+gpuProbe\.time\(null, 'labels \(script\)', \(\) => updateLabels\(F\)\);/, 'a view change lays out the labels itself');
  assert.match(fn, /if \(anatCovered\(\) \|\| hid\.at \|\| plateStale \|\| blockersStale \|\| \(performance\.now\(\) - blockersAt > 100 && watch\.due\(\)\)\) return false;/);
  assert.match(fn, /if \(morph !== morphTarget \|\| tubesHidden !== wrap\.classList\.contains\('gl-on'\) \|\| EV\.some\(\(x\) => x\.reveal \|\| \(x\.vis && widthMoving\(x\)\)\)\) return false;/, 'any vessel width still moving takes the full update');
  assert.match(fn, /widthEasing = organsEasing = false;\n\s+updateOrgans\(f, f\.viewParams \|\| store\.get\(\)\.params, t\);/, 'the organs set their own easing flags again');
  assert.match(fn, /if \(plateRedraw\) \{ plateRedraw = false; drawVeins\(\); \}/, 'a plate redraw it asks for is drawn, as after an update');
  assert.match(src, /\} else if \(widthEasing && F && !stepOrgans\(\) && !stepWidths\(\)\) update\(F\);/);
  // Nothing else in the update follows the liver's ease: only the organs and the fluid read it.
  for (const name of ['updateOverlays', 'updateLabels', 'updateBridges', 'updateNodesCircuit', 'fxSync', 'updateFocus', 'updateOrganSel']) {
    const at = src.indexOf(`  function ${name}(`), next = src.indexOf('\n  function ', at + 10);
    assert.ok(at > 0, name);
    assert.doesNotMatch(src.slice(at, next), /\blvC\b|\blvG\b|liverScale|liverFloor|liverDome/, `${name} reads the liver's ease`);
  }
});
