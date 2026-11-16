// A sentence that applies a rule to a value is true or false of one value, so on a time-lapse slide it must state the end state's from the first frame
// (Carvedilol 3, play-test 16 Nov 2026: "LSM 17.1 kPa, which meets ≥25 kPa" for five seconds). presenter-words.js rulesLine; presenter-question.js textIn.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { rulesLine } from '../src/ui/presenter-words.js';

test('a line with a cut-off pill is a rule line; a plain value line is not', () => {
  for (const t of ['Her LSM is now {lsm}, which meets {>=25 kPa}.', 'His HVPG is {hvpg}, which is {<10 mmHg}.', 'A rise to {≥12 mmHg}']) assert.equal(rulesLine(t), true, t);
  for (const t of ['The ascites falls to {asc} and sinusoidal flow to {liver}.', 'Over six months the PPG falls to {ppg}.', '', undefined]) assert.equal(rulesLine(t), false, String(t));
});

test('every time-lapse slide whose words apply a rule to a number is found (so none rides the days)', () => {
  const found = DECKS.flatMap((d) => d.slides.filter((s) => s.lapse && rulesLine(s.line)).map((s) => `${d.id}/${s.id}`));
  assert.ok(found.includes('carvedilol/rise'), found.join());
  assert.ok(found.length >= 3, found.join());
});
