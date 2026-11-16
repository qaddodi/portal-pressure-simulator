// "Volume expansion raises the portal pressure" (Acute variceal bleeding 17, play-test 16 Nov 2026): the slide said the blood pressure "barely changes" while the
// chart's MAP line climbed. Its words now give the model's own proportions; this holds them to it: three units beyond the prebleed volume raise the portal vein pressure by
// about 14% and the MAP by about 6%, and blood loss lowers both.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { createCore } from '../src/worker-core.js';

const UNIT = { kind: 'infuse', fluid: 'prbc' };
async function read(action) {
  let last;
  const core = createCore((m) => { if (m.type === 'seqStep') last = m; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps: [{ preset: 'cirr-decomp' }, { action }], reqId: 1 });
  core.dispose();
  return last.fp;
}

test('the volume slide says what the model does: portal pressure up about 14%, MAP about 6%, over three units', async () => {
  const slide = DECKS.find((d) => d.id === 'variceal-bleed').slides.find((s) => s.id === 'relation');
  const m = /portal pressure (\d+)% but the blood pressure only (\d+)%/.exec(slide.line);
  assert.ok(m, slide.line);
  const base = await read([]), plus = await read([UNIT, UNIT, UNIT]), lost = await read({ kind: 'hemorrhage', mL: 1500 });
  const pv = (plus.pv / base.pv - 1) * 100, map = (plus.map / base.map - 1) * 100;
  assert.ok(Math.abs(pv - +m[1]) <= 1.5, `portal pressure rises ${pv.toFixed(1)}%, the slide says ${m[1]}%`);
  assert.ok(Math.abs(map - +m[2]) <= 1.5, `MAP rises ${map.toFixed(1)}%, the slide says ${m[2]}%`);
  assert.ok(pv > map, 'the portal pressure gains more than the blood pressure');
  assert.ok(lost.pv < base.pv && lost.map < base.map, 'blood loss lowers both');
});
