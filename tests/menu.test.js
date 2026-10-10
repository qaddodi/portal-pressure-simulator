import test from 'node:test';
import assert from 'node:assert/strict';
import { DECKS, TOPICS } from '../src/ui/decks.js';

test('the unified menu lists every presentation under exactly one topic, with a short title', () => {
  const listed = TOPICS.flatMap(([, , list]) => list.map(([id]) => id));
  assert.equal(new Set(listed).size, listed.length, 'a presentation listed twice');
  assert.deepEqual([...listed].sort(), DECKS.map((d) => d.id).sort());
  for (const d of DECKS) {
    assert.ok(TOPICS.some(([k]) => k === d.topic), `${d.id} topic`);
    assert.ok(d.short && d.short.length <= 32, `${d.id} short title`);
  }
});
