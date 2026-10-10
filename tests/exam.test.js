import test from 'node:test';
import assert from 'node:assert/strict';
import { BANK } from '../src/ui/exam-bank.js';

test('exam bank: well-formed single-best-answer stems', () => {
  assert.ok(BANK.length >= 30);
  assert.equal(new Set(BANK.map((q) => q.id)).size, BANK.length);
  for (const q of BANK) {
    assert.equal(q.options.length, 5, q.id); assert.equal(q.explain.length, 5, q.id);
    assert.ok(q.answer >= 0 && q.answer < 5, q.id);
    assert.ok(q.stem && q.q, q.id);
  }
  const by = (s) => BANK.filter((q) => q.src === s).length;
  for (const c of ['gastric', 'budd-chiari', 'pvt', 'nsbb', 'optional', 'explain', 'tips-he', 'treat-cause']) assert.equal(by(c), 2, c);
  assert.ok(by('site') >= 3);
});
