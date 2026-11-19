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

test('the five topics list only the eleven core talks, in teaching order; "More talks" lists the other thirty', () => {
  const CORE = ['circulation', 'circuit', 'sites', 'hvpg', 'doppler', 'stiffness', 'varices', 'variceal-bleed', 'next-bleed', 'ascites', 'encephalopathy'];
  const main = TOPICS.filter(([k]) => k !== 'more').flatMap(([, , list]) => list.map(([id]) => id));
  assert.deepEqual([...main].sort(), [...CORE].sort());
  assert.equal(TOPICS.at(-1)[0], 'more');
  assert.equal(TOPICS.at(-1)[1], 'More talks');
  assert.equal(TOPICS.at(-1)[2].length, 31);
  assert.equal(DECKS.length, 42);
});

test('every presentation has a short deck name of 20 characters or fewer, distinct from the others', () => {
  const heads = DECKS.map((d) => d.head);
  for (const d of DECKS) assert.ok(d.head && d.head.length <= 20 && d.head === d.head.trim(), `${d.id} short deck name`);
  assert.equal(new Set(heads).size, heads.length, 'two talks share a short name');
});

test('a talk named in another talk\'s words has the name the menu gives it', () => {
  const menu = Object.fromEntries(TOPICS.flatMap(([, , list]) => list.map(([id, name]) => [id, name])));
  const strings = (v, out = []) => { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach((x) => strings(x, out)); else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out)); return out; };
  const bad = [];
  for (const d of DECKS) for (const s of d.slides) for (const t of strings(s)) for (const o of DECKS) if (o.title !== menu[o.id] && t.includes(o.title)) bad.push(`${d.id}/${s.id} names "${o.title}" for "${menu[o.id]}"`);
  assert.deepEqual(bad, []);
});
