import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

// The running head (presenter.js runHead): a short name for each talk over every slide's title, on one line beside a site tag.
test('every presentation has a running head of 20 characters or fewer, distinct from the others', () => {
  const heads = DECKS.map((d) => d.head);
  for (const d of DECKS) assert.ok(d.head && d.head.length <= 20 && d.head === d.head.trim(), `${d.id} running head`);
  assert.equal(new Set(heads).size, heads.length, 'two talks share a running head');
});

test('the teaching card and the visual slides carry the running head; the outline slide names the talk in full instead', () => {
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(src, /s\.visual === 'outline' \? h\('h1', \{ class: 'pz-dtitle' \}, nb\(deck\.title\)\) : runHead\(s\)/);
  assert.match(src, /deck\?\.head \|\| deck\?\.title/);
});
