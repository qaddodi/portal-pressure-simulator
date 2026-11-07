import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceStream, displaySpeed } from '../src/ui/blood.js';

// The blood's clock (Mohammad, 6 Nov 2026: "the portal vein velocity is negative, yet the chevrons are flowing hepatopetally"; "no chevrons
// inside TIPS"). 0eec029 left so.speed, so.still, so.dt and so.bt inside the comment on so.phasic's line in stepBlood, so every stream stepped
// with dt 0: its mean stayed the flow it was made with (the healthy one, at boot), a vessel that turned reversed stood in its settle for
// ever with its old forward speed under the reversed orange, and the TIPS kept its boot-time no flow, so it had no chevrons.

// (That the options are set in code at all is held by scripts/rules-lint.mjs; these hold what the streams do with them.)

test('a vessel made at its healthy forward flow that turns reversed runs and points backwards once its stop is over (2 s)', () => {
  const st = { seed: 3 };
  for (let i = 0; i < 300; i++) advanceStream(st, 25, 25, 1 / 60, { rev: false });
  assert.ok(st.vd > 0);
  // The portal vein reverses (−11 cm/s): the colour's flag turns, and the stream follows it.
  for (let i = 0; i < 120; i++) advanceStream(st, -11, -11, 1 / 60, { rev: true });
  assert.ok(st.vd <= 0, 'never forward on the way');
  assert.equal(st.settle, 0, 'the settle ends');
  assert.ok(st.vd < 0, `runs hepatofugally: vd ${st.vd}`);
  assert.ok(Math.abs(st.vd - displaySpeed(-11)) < 0.05 * Math.abs(displaySpeed(-11)), 'at the reversed flow’s own speed');
});

test('paused (no time passing), a reversal turns the heads at once: never the old direction under the new colour', () => {
  const st = { seed: 5 };
  for (let i = 0; i < 300; i++) advanceStream(st, 25, 25, 1 / 60, { rev: false });
  advanceStream(st, -11, -11, 0, { rev: true });
  assert.equal(st.settle, 0); assert.equal(st.hold, 0);
  assert.ok(st.vd < 0, `points hepatofugally while paused: vd ${st.vd}`);
  const D = st.D;
  advanceStream(st, -11, -11, 0, { rev: true });
  assert.equal(st.D, D, 'and stands');
});

test('a TIPS made with no flow (at boot) shows its flow once it opens: its chevrons are full within a few seconds', () => {
  const st = { seed: 9 };
  for (let i = 0; i < 60; i++) advanceStream(st, 0, 0, 1 / 60, { rev: false });
  assert.equal(st.vd, 0);
  for (let i = 0; i < 5 * 60; i++) advanceStream(st, 38, 38, 1 / 60, { rev: false });
  // (The heads' fade: smoothstep(0.5, 3, |vd|), veins-gl chevOne and blood-heads.js.)
  assert.ok(st.vd > 3, `vd ${st.vd}`);
});
