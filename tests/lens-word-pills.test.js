// The words name the view the vessels are colored by ("With the vessels colored by congestion"): the view's name is a
// pill in that view's own colour, red for congestion (Mohammad, 16 Oct). The built-in decks no longer write the phrase in a
// line (Mohammad, 5 Nov: the key already names the view); the pill stays for imported decks, and each view's colour must exist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { presenterSource } from './split-src.js';

const SRC = presenterSource();
const obj = (name) => {
  const body = SRC.match(new RegExp(`export const ${name} = \\{([^}]+)\\}`))[1];
  return Object.fromEntries([...body.matchAll(/'?([\w ]+)'?: '([^']+)'/g)].map((m) => [m[1].trim(), m[2]]));
};
const WORDS = obj('LENS_WORDS'), TONE = obj('LENS_TONE');

test('no built-in slide line says "colored by": the key on the figure names the view (Mohammad, 5 Nov)', () => {
  const found = [];
  for (const d of DECKS) for (const s of d.slides) if (/\bcolou?red by\b/i.test(s.line || '')) found.push(`${d.id}/${s.id}`);
  assert.deepEqual(found, []);
});

test('each view the words name has a colour defined in the tokens, congestion red', () => {
  for (const [w, k] of Object.entries(WORDS)) {
    const v = TONE[k];
    assert.ok(v, `${w}: no tone`);
  }
  assert.equal(TONE[WORDS.congestion], '--lens-heat');
});

