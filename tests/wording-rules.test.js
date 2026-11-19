// One wording list (DBG-1, bible review 19 Nov 2026): src/ui/wording.js. The lint, the Words dump and the node specimen test import it, and the registry's `wording-*` rules judge
// the words on the screen in hand, so a packet or the Phone check names "Baveno VII" or "PPG (PV-IVC)" on the owner's own device.
import './screen-dom.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RULES, SCREEN_RULES, RULE_NAMES, check, checkWording, checkScreen } from '../src/ui/wording.js';
import { RULES as LINT_RULES, check as lintCheck } from '../scripts/clinical-wording.mjs';
import { RULES as DUMP_RULES, checkWording as dumpCheck } from '../src/ui/gallery/wording-rules.js';
import '../src/ui/selfcheck/plugins.js';
import { runRules, ruleList } from '../src/ui/selfcheck/rules.js';

const report = (...lines) => ({ cards: { cards: [{ kind: 'teaching card', title: 'Hepatic venous pressure gradient', lines: lines.map((t) => [t, 17]) }] } });
const run = (...lines) => runRules(report(...lines), { families: 'wording' });

test('the lint, the Words dump and the registry read one list: nothing holds a copy', () => {
  assert.equal(LINT_RULES, RULES); assert.equal(DUMP_RULES, RULES);
  assert.equal(lintCheck, check); assert.equal(dumpCheck, checkWording);
  // no other file in src/ or scripts/ declares the lint's rules (a copy would drift, as the dump's did)
  for (const f of ['src/ui/gallery/wording-rules.js', 'scripts/clinical-wording.mjs', 'src/ui/selfcheck/rules-wording.js', 'tests/gallery-specimens.test.js']) {
    const s = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.ok(!/\['less-as-minus'/.test(s) && !/\['belly'/.test(s) && !/\['older-baveno'/.test(s), `${f} holds its own copy of the rules`);
  }
});

test('every rule name is a registered rule of the family "wording", with an owner and a reason', () => {
  const regs = ruleList().filter((r) => r.family === 'wording');
  assert.deepEqual(regs.map((r) => r.id), RULE_NAMES.map((n) => `wording-${n}`));
  for (const r of regs) assert.ok(r.owner === 'src/ui/wording.js' && r.why.length > 25, r.id);
  assert.ok(SCREEN_RULES.length >= 4 && RULE_NAMES.includes('older-baveno') && RULE_NAMES.includes('ppg-label'));
});

test('the words on the screen in hand are judged: Baveno VII, the PPG label without its minus sign, "less" for minus, British spelling and an unfilled token each fire; clean text is quiet', () => {
  const rules = (...l) => run(...l).map((f) => f.rule).sort();
  assert.deepEqual(rules('Baveno VII recommends carvedilol'), ['wording-older-baveno']);
  assert.deepEqual(rules('PPG (PV-IVC) is 14 mmHg'), ['wording-ppg-label']);
  assert.deepEqual(rules('MAP less the IAP'), ['wording-less-as-minus']);
  assert.deepEqual(rules('Her oedema and haemorrhage'), ['wording-british']);
  assert.deepEqual(rules('The {pv} reading'), ['wording-open-token']);
  assert.deepEqual(rules('Baveno VIII recommends carvedilol', 'PPG (PV − IVC) is 14 mmHg', 'Abdominal perfusion pressure is MAP − IAP', '—'), [], 'clean text, and the app\'s lone dash for a number it has none for');
  const f = run('Baveno VII recommends carvedilol')[0];
  assert.match(f.what, /^Teaching card "Hepatic venous pressure gradient"$/);
  assert.match(f.where, /"Baveno VII" in "Baveno VII recommends carvedilol" \(write: Baveno VIII/);
  assert.equal(f.owner, 'src/ui/wording.js');
});

test('a phrase with a second meaning is judged in its context (a tap on a screen is not a paracentesis), and a line is told once', () => {
  assert.deepEqual(run('A tap opens the card'), []);
  assert.deepEqual(run('Tap the label, then a tap on the card').map((f) => f.rule), []);
  assert.deepEqual(run('Ascites after the second tap').map((f) => f.rule), ['wording-tap']);
  assert.equal(run('Her oedema', 'Her oedema').length, 1, 'the same words on two lines are one finding');
  assert.deepEqual(runRules({ cards: { cards: [] } }, { families: 'wording' }), []);
  assert.deepEqual(runRules({}, { families: 'wording' }), [], 'a report with no cards part has no words to judge');
  assert.deepEqual(checkScreen('Baveno VII').map((r) => r.rule), ['older-baveno']);
});
