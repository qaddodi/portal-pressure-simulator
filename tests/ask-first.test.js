// Choose the treatment and Where is the resistance? ask before they reveal: a case slide opens on its case card and question, and a
// slide with no patient of its own asks a question card first. The slide list and the screen reader's slide announcement name every
// slide from the first, so a title on the way to the answer may not state it (13 Nov: the treatment was the title on every case).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHOOSE_TREATMENT } from '../src/ui/decks/choose-treatment.js';
import { WHERE } from '../src/ui/decks/where.js';

const TREATMENT = /\b(TIPS|DIPS|BRTO|banding|EVL|carvedilol|anticoagula\w*|shunt|stent|recanaliz\w*|patent|lyses?)\b/i;
const byId = (d, id) => d.slides.find((s) => s.id === id);

test('Choose the treatment: no title before the summary names the treatment, and every case asks', () => {
  const body = CHOOSE_TREATMENT.slides.filter((s) => s.kicker !== 'Summary');
  assert.ok(body.length >= 9);
  for (const s of body) assert.ok(!TREATMENT.test(s.title), `${s.id}: the title "${s.title}" gives the treatment away`);
  for (const id of ['a1', 'a2', 'a3', 'a4', 'a5']) {
    const s = byId(CHOOSE_TREATMENT, id);
    assert.ok(s.vignette && s.caseQ, `${id}: a case with its question`);
    assert.ok(!TREATMENT.test(s.caseQ.replace(/preemptive TIPS/, '')), `${id}: the question names the answer`);
  }
  for (const o of CHOOSE_TREATMENT.objectives) assert.ok(!/\bstart anticoagulation\b/i.test(o), `objective gives an answer: ${o}`);
});

test('Where is the resistance?: every case asks where, and no case title names the level', () => {
  for (const id of ['a1', 'a2', 'a3', 'a4', 'a5', 'a6']) {
    const s = byId(WHERE, id);
    assert.equal(s.caseQ, 'Where is the resistance?', id);
    assert.ok(!/\b(presinusoidal|postsinusoidal|sinusoidal|prehepatic|post-hepatic|intrahepatic)\b/i.test(s.title), `${id}: the title names the level`);
  }
  assert.ok(!/detects two/i.test(byId(WHERE, 'relation').title), 'the relation chart\'s title is its answer');
});

test('the slides that have no patient of their own ask a question card before the reveal', () => {
  for (const [d, id] of [[CHOOSE_TREATMENT, 'relation'], [WHERE, 'ladders'], [WHERE, 'relation']]) {
    const s = byId(d, id);
    assert.equal(typeof s.question, 'string', `${d.id}/${id}`);
    assert.ok(!s.vignette && !s.preset && s.visual, `${d.id}/${id}: a question card sits on a visual with no new patient`);
  }
});
