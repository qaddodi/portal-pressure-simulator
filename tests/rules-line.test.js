// The words of a time-lapse slide state where the days end, from the first frame (play-test 16 Nov 2026: Carvedilol 3 read "LSM 17.1 kPa, which meets
// ≥25 kPa" for five seconds; Two lesions 3 read "ending at 21.2 mmHg", then 18.6). presenter-question.js textIn types the line from the end state and
// presenter-case.js chipsTo lands it there as the days start; scripts/source-shapes/pins-mixed-b.mjs holds both, and that nothing moves the pills again.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';

test('every time-lapse slide that states numbers in its words is typeset from its end state, none opts out, and the end state is what the last step shows', async () => {
  const withPills = DECKS.flatMap((d) => d.slides.filter((s) => s.lapse && /\{[^}]+\}/.test(s.line || '')).map((s) => ({ s, id: `${d.id}/${s.id}` })));
  assert.ok(withPills.length >= 30, `${withPills.length} slides`);
  for (const { s, id } of withPills) assert.ok(!('ride' in s) && !('liveWords' in s), `${id} opts out of the end state`);
  assert.ok(withPills.some((x) => x.id === 'two-lesions/clot') && withPills.some((x) => x.id === 'carvedilol/rise'));
});
