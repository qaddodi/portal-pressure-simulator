// A slide's line or title that says the patient HAS red wale signs is a claim about the model: the fingerprint's redWale must be true on that
// slide's state (19 Nov 2026, bible ENG-2: Pregnancy said "with red wale signs" beside a 4.9 mm Small varix and a wall card printing "None").
// A conditional ("would favor", "if", "when", "where", "without", "no") is teaching, not a claim, and is not judged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import './dom-shim.js';
import { deckStates } from './deck-states.js';

const DIR = new URL('../src/ui/decks/', import.meta.url);
const HAS = /\b(?:with|shows?|showing|has|have|and|now)\s+(?:cherry-red spots or )?red wale(?: signs?| marks?)?\b/i;
const NOT = /\b(?:no|without|would|if|when|where|whether|not|nor|or)\b[^.]{0,40}red wale/i;

test('a slide that says the patient has red wale signs has them in the model', async () => {
  const claims = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.js'))) {
    const d = Object.values(await import(new URL(f, DIR))).find((v) => Array.isArray(v?.slides));
    if (!d) continue;
    const slides = d.slides.map((s, i) => [s, i]).filter(([s]) => [s.line, s.title].some((t) => typeof t === 'string' && HAS.test(t) && !NOT.test(t)));
    if (!slides.length) continue;
    const st = await deckStates(d);
    for (const [s, i] of slides) claims.push([`${d.id}/${s.id}`, st[i]?.redWale]);
  }
  assert.deepEqual(claims.filter(([, r]) => r !== true).map(([k]) => k), [], 'says red wale signs, the model has none');
});

test('the finding-word check sees the old Pregnancy sentence', () => {
  const old = 'The varix now measures {varix}, with red wale signs.';
  assert.ok(HAS.test(old) && !NOT.test(old));
  const now = 'The varix now measures {varix}, small so far and with no red wale signs; EGD also looks for them.';
  assert.ok(!HAS.test(now) || NOT.test(now));
});
