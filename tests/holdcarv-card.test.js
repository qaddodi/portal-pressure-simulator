// The Hold or restart carvedilol card says only what the patient has. Its restart verdict read "The HRS-AKI has resolved and the BP has
// recovered" under a slide that says the patient has no HRS-AKI (Mohammad, 16 Nov 2026, Carvedilol deck slide 10): a card built from fixed
// words claimed an event the case does not have. Every reason the card gives is now made from the patient's own fields.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import holdcarv from '../src/ui/path-algos/holdcarv.js';
import { DECKS } from '../src/ui/decks.js';

test('the restart verdict names the recovered pressure and does not say an HRS-AKI that never was has resolved', () => {
  const p = { held: true, sbp: 93, hrs: false, map: 72 };
  const r = holdcarv.reading('back', p);
  assert.equal(r.head, 'Restart and re-titrate');
  assert.match(r.why, /SBP 93 mmHg, MAP 72 mmHg/);
  assert.match(r.why, /no HRS-AKI/);
  assert.doesNotMatch(r.why, /resolved/);
});

test('every Carvedilol path slide in every deck that has no HRS-AKI says so on every card it can show', () => {
  let n = 0;
  for (const d of DECKS) for (const s of d.slides) {
    if (s.tool?.kind !== 'path' || s.tool.of !== 'holdcarv') continue;
    n++;
    const p = holdcarv.patientFor(s.tool, null);
    for (const key of holdcarv.outcomes) {
      const r = holdcarv.reading(key, { ...p, sbp: 100, map: 75, hrs: false, held: key === 'back' });
      if (key !== 'low') assert.doesNotMatch(r.why, /\bhas resolved\b/, `${d.id}/${s.id} ${key}`);
    }
  }
  assert.ok(n >= 3, `${n} holdcarv slides found`);
});
