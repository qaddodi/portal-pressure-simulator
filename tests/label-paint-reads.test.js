// The FibroScan probe finds the liver from numbers, and a pan paints the callouts and probes once (labels and probes review, 25 Oct).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const STAGE = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const body = (name) => { const at = STAGE.indexOf(`  function ${name}(`); assert.ok(at > 0, name); return STAGE.slice(at, STAGE.indexOf('\n  }\n', at) + 4); };

test('the FibroScan probe never asks the browser for the liver\'s box', () => {
  const fn = body('scanTipLocal');
  assert.doesNotMatch(fn, /getBoundingClientRect|getBBox|getScreenCTM/);
  assert.match(fn, /polyBoxInto\(flattenPathInto\(d, 0\.05, SCAN_FLAT\)/);
  assert.match(fn, /gMatrix\(organG\.liver\)/);
  assert.match(fn, /CTM\.a \* wx \+ CTM\.c \* wy \+ CTM\.e - wrapRect\.left/);   // (the camera's matrix, as worldToLocal applies it)
});

test('the FibroScan beam is its own layer of the probe\'s model, under the waves', () => {
  const at = STAGE.indexOf('<div class="sp-svg sp-beam-svg">'), beam = STAGE.indexOf('<i class="sp-beam" '), waves = STAGE.indexOf('</div><div class="sp-svg"><i class="sp-waves">');
  assert.ok(at > 0 && beam > at && waves > beam, 'the beam in its own layer, the waves after it in another');
  assert.match(CSS, /\.scan-probe \.sp-beam-svg \{ will-change: transform; \}/);
  assert.match(CSS, /\.scan-probe \.sp-svg \{ position: absolute; left: 0; top: 0; width: 220px; height: 96px;/);
});
