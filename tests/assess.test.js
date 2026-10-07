import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnswerSheet, scoreCase, lmsReport, recordResult, weightsOf } from '../src/ui/assess.js';

test('a revisited question counts once, with its first answer', () => {
  const s = createAnswerSheet();
  s.record('lesson:hvpg:step-07:q1', false);
  s.record('lesson:hvpg:step-07:q1', true); // second visit
  s.record('lesson:hvpg:step-08:q1', true);
  assert.deepEqual(s.score(), { right: 1, total: 2, score: 50, mastered: false });
});

test('case: weights, raw score kept on death, critical objective blocks mastery', () => {
  const o = [{ id: 'a', weight: 60, critical: true }, { id: 'b', weight: 40 }];
  assert.equal(scoreCase(o, { a: 'met', b: 'met' }, 'success').mastered, true);
  const miss = scoreCase(o, { a: 'failed', b: 'met' }, 'success');
  assert.deepEqual([miss.score, miss.mastered, miss.failedCritical, miss.status], [40, false, ['a'], 'completed']);
  const dead = scoreCase(o, { a: 'met', b: 'failed' }, 'death');
  assert.deepEqual([dead.score, dead.mastered, dead.status], [60, false, 'death']);
  assert.equal(scoreCase([{ id: 'x' }, { id: 'y' }], { x: 'met', y: 'met' }, 'success').score, 100);
  assert.equal(Math.round(weightsOf([{ id: 'x', weight: 70 }, { id: 'y' }]).reduce((a, b) => a + b)), 100);
});

test('LMS: single activity reports that activity, course is a mean, not a maximum', () => {
  const L = (id, score, extra = {}) => ({ kind: 'lesson', id, score, assessment: 2, completed: true, mastered: score >= 80, ...extra });
  const list = [L('a', 90), L('b', 40)];
  assert.deepEqual(lmsReport(list, [{ kind: 'lesson', id: 'b' }]), { raw: 40, complete: true, mastered: false, status: 'failed' });
  assert.deepEqual(lmsReport(list, [{ kind: 'lesson', id: 'a' }]).status, 'passed');
  const course = lmsReport(list, [{ kind: 'lesson', id: 'a' }, { kind: 'lesson', id: 'b' }, { kind: 'case', id: 'c' }]);
  assert.deepEqual([course.raw, course.status], [43, 'incomplete']);
  assert.equal(lmsReport([L('a', 40), L('a', 90)], [{ kind: 'lesson', id: 'a' }]).status, 'passed'); // best attempt
});

test('legacy records keep the rule they were scored under', () => {
  assert.equal(recordResult({ score: 60, kind: 'lesson' }).mastered, true);
  assert.equal(recordResult({ score: 60, assessment: 2, mastered: false, completed: true }).mastered, false);
});
