// The built-in slides that took up an opt-in deck visual (tests/deck-adopted.js) each still use every field they are
// allowed, so the package tests' exceptions name only what the decks really use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { ADOPTED, uses } from './deck-adopted.js';

test('every adopted slide exists and uses each field it is allowed', () => {
  const by = new Map(DECKS.flatMap((d) => d.slides.map((s) => [`${d.id}/${s.id}`, s])));
  for (const [at, fields] of Object.entries(ADOPTED)) {
    const s = by.get(at);
    assert.ok(s, `${at}: no such slide`);
    for (const f of fields) assert.ok(uses(s, f), `${at}: does not use ${f}`);
  }
});

test('the field names read as written', () => {
  const s = { tool: { kind: 'lumen', bands: ['anticoag'] }, cols: ['pvFlow', 'wave'], ripple: true, lens: 'system' };
  for (const f of ['kind:lumen', 'tool.bands', 'cols.wave', 'ripple', 'lens:system']) assert.ok(uses(s, f), f);
  for (const f of ['kind:flows', 'tool.mode', 'cols.liver', 'calipers', 'lens:since']) assert.ok(!uses(s, f), f);
});
