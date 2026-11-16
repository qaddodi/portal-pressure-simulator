// The PSVD diagnostic-score slide says the patient's spleen stiffness is a specific sign scoring 3 (Baveno VIII 8.43: SSM >40 kPa without a myeloproliferative
// neoplasm). The model's PSVD patient must read above that cut-off, or the slide's own sentence is false (tester, 16 Nov 2026: "scoring source unverified").
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const { Engine } = await import('../src/engine/engine.js');
const { computeMetrics } = await import('../src/engine/metrics.js');
const { NCPH } = await import('../src/ui/decks/ncph.js').then((m) => ({ NCPH: Object.values(m).find((d) => d?.slides) }));

test('the PSVD patient\'s spleen stiffness is above the 40 kPa specific-sign cut-off the score slide names', () => {
  const slide = NCPH.slides.find((s) => s.id === 'path-psvdscore');
  assert.match(slide.line, /specific sign, scoring 3/);
  const e = new Engine(); e.loadPreset('psvd'); e.settle();
  assert.ok(computeMetrics(e).ssm > 40, `SSM ${computeMetrics(e).ssm}`);
});
