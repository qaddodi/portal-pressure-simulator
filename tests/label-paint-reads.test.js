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
  assert.match(fn, /polyBox\(flattenCmds\(pathCmds\(d\)/);
  assert.match(fn, /gMatrix\(organG\.liver\)/);
  assert.match(fn, /worldToLocal\(/);
});

test('a view change paints the callouts and probes once: again only when updateLabels held back', () => {
  const sv = body('syncView'), ul = body('updateLabels');
  assert.match(ul, /^\s+function updateLabels\(f, force = false\) \{\n\s+labelPainted = false;/);
  assert.match(ul, /dprobePaint\(\);\n\s+labelPainted = true;\n\s+\}$/);
  assert.match(sv, /if \(!labelPainted\) \{\n\s+if \(sites\.list\) sitesPaint\(\);\n\s+if \(scan\.on\) scanPaint\(\);\n\s+dprobePaint\(\);\n\s+\}/);
});

test('the FibroScan beam is its own picture on its own layer, under the waves', () => {
  const at = STAGE.indexOf('<svg class="sp-beam-svg" viewBox="0 0 220 96">'), beam = STAGE.indexOf('<path class="sp-beam" '), waves = STAGE.indexOf('</svg><svg viewBox="0 0 220 96"><g class="sp-waves">');
  assert.ok(at > 0 && beam > at && waves > beam, 'the beam in its own picture, the waves after it in another');
  assert.match(CSS, /\.scan-probe \.sp-beam-svg \{ will-change: transform; \}/);
  assert.match(CSS, /\.scan-probe svg \{ position: absolute; left: 0; top: 0; width: 220px; height: 96px;/);
});
