// The HVPG's formula line says why it can sit a few tenths under the sinusoid label less the hepatic vein label (play-test A9, 16 Nov 2026): the wedged
// catheter also reads the central vein that drains the sinusoids. Said only where the two differ by 0.2 mmHg or more.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/portal/engine.js';
import { computeMetrics } from '../src/engine/portal/metrics.js';
import { formula } from '../src/engine/portal/explain.js';

for (const [id, says] of [['healthy', true], ['postprandial', true], ['cirr-decomp', false]]) {
  test(`${id}: the HVPG line ${says ? 'explains the gap to' : 'leaves out the note on'} the labels' difference`, () => {
    const e = new Engine(); e.loadPreset(id);
    const m = computeMetrics(e), line = formula(e, 'hvpg', m);
    assert.match(line, /^HVPG = WHVP − FHVP = /);
    assert.equal(/central vein that drains the sinusoids/.test(line), says, line);
    if (says) { const d = (e.P[e.ni.SIN_R] - e.P[e.ni.RHV]).toFixed(1); assert.ok(line.includes(`reads ${d}:`), `${d} in: ${line}`); }
  });
}
