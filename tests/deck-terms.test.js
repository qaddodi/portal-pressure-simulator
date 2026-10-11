// A slide's term pills come from its `terms` (the words its line names light up their part of the figure). A rewrite
// of the line that stops naming a term silently drops its pill, so every term a slide gives must be named by its line.
// (A term map shared by several slides of a deck may name more than any one line uses.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';

const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('every term a slide gives is named by its line (its pill shows)', () => {
  const missing = [];
  for (const d of DECKS) {
    const uses = new Map();
    for (const s of d.slides) if (s.terms && !Array.isArray(s.terms)) uses.set(s.terms, (uses.get(s.terms) || 0) + 1);
    for (const s of d.slides) {
      const t = s.terms;
      if (!t || Array.isArray(t) || uses.get(t) > 1) continue;
      for (const w of Object.keys(t)) if (!new RegExp(`\\b(?:${esc(w)})\\b`, 'i').test(s.line || '')) missing.push(`${d.id}/${s.id}: "${w}"`);
    }
  }
  assert.deepEqual(missing, []);
});
