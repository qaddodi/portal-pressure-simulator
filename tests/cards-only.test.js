// The cards-only check (src/ui/cards-only.js, scripts/deck-sweep.mjs --cards-only): the stage stand-in does nothing whatever is asked of it, a page
// gets it only when a sweep set the flag, and the compare that keeps the shortcut honest lists every problem only one run found. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cardsOnly, voidStage } from '../src/ui/cards-only.js';
import { compareReports } from '../scripts/deck-sweep-lib.mjs';

test('the stage stand-in answers any name and any call, and never hangs an await', async () => {
  const s = voidStage();
  assert.equal(s.glass.add({}), undefined);
  assert.equal(s.update({ P: [] }), undefined);
  assert.equal(s.camera?.(), undefined);
  assert.equal(await s.dive('R'), undefined);   // (not thenable: the await resolves at once)
  assert.equal(await s, s);
  assert.equal(+s, 0);
  assert.doesNotThrow(() => { s.anything = 1; });
});

test('only a page whose sweep set ppsCardsOnly gets it', () => {
  assert.equal(cardsOnly({}), false);
  assert.equal(cardsOnly({ ppsCardsOnly: true }), true);
  const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
  assert.match(main, /stage = cardsOnly\(\) \? voidStage\(\) : createStage\(/);
  assert.doesNotMatch(readFileSync(new URL('../src/ui/cards-only.js', import.meta.url), 'utf8'), /ppsCardsOnly\s*=/);   // (the app never sets it itself)
});

test('the compare lists the problems only one run found, slide by slide', () => {
  const a = { results: { 'hvpg#1@mac': { ok: true, problems: ['cutoff: pz-text: x'] }, 'hvpg#2@mac': { ok: true, problems: [] }, 'hvpg#3@mac': { ok: true, problems: [] } } };
  const b = { results: { 'hvpg#1@mac': { ok: true, problems: [] }, 'hvpg#2@mac': { ok: true, problems: [] }, 'hvpg#4@mac': { ok: true, problems: [] } } };
  const c = compareReports(a, b);
  assert.equal(c.both, 2);
  assert.equal(c.same, 1);
  assert.deepEqual(c.differ, [{ key: 'hvpg#1@mac', onlyA: ['cutoff: pz-text: x'], onlyB: [] }]);
  assert.equal(c.onlyA, 1);
  assert.equal(c.onlyB, 1);
});
