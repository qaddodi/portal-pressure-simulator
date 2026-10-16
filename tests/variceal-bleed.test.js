// The bleed deck's words match its numbers: resuscitation starts with octreotide, the second unit and banding find the
// blood pressure back above 65, the hemoglobin lags the bleed, and the TIPS is placed from the restrictive path, so it
// lowers the portal pressure without loading the right atrium.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/worker-core.js';
import { BLEED } from '../src/ui/decks/variceal-bleed.js';

const MODEL = ['preset', 'presetDays', 'params', 'action', 'days'];
const changes = (s) => MODEL.some((k) => s[k]);

test('variceal bleed: vitals and pressures agree with each slide', async () => {
  const fps = [];
  const core = createCore((m) => { if (m.type === 'seqStep') fps[m.i] = m.fp; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps: BLEED.slides.map((s) => (changes(s) ? { preset: s.preset, params: s.params, action: s.action } : {})), reqId: 1 });
  core.dispose();
  const f = Object.fromEntries(BLEED.slides.map((s, i) => [s.id, fps[i]]).filter(([, v]) => v));
  assert.ok(f.oct.map < f.minutes.map, `octreotide slide: the bleed still outpaces the first unit (MAP ${f.oct.map.toFixed(0)})`);
  assert.ok(f.blood.map >= 65 && f.blood.map > f.oct.map, `second unit brings the MAP up (${f.blood.map.toFixed(0)})`);
  assert.ok(f.band.map >= 65, `banding once the blood pressure holds (MAP ${f.band.map.toFixed(0)})`);
  assert.ok(Math.abs(f.blood.hb - f.before.hb) < 0.5, `hemoglobin barely moves (${f.before.hb.toFixed(1)} to ${f.blood.hb.toFixed(1)})`);
  assert.ok(f.tips.pv < f.band.pv - 3 && f.tips.ppg < 12, `TIPS lowers the portal pressure (${f.band.pv.toFixed(1)} to ${f.tips.pv.toFixed(1)}, PPG ${f.tips.ppg.toFixed(1)})`);
  assert.ok(f.tips.ra < 8, `TIPS does not load the right atrium (RA ${f.tips.ra.toFixed(1)})`);
});
