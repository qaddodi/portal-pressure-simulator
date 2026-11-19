// A quiz number is the model's like every other slide number (16 Nov 2026: the Prehepatic quiz said the PPG falls "from 27 to 4" over slides
// that read 28.0 and 4.2). A check or a discussion answer prints a slide's reading with {key@slideId} (checkText, presenter-words.js; the handout reads it
// too). (The other typed numbers of a quiz are exam patients of its own, not the slides' patient, and stay as typed.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import './dom-shim.js';
import { deckStates } from './deck-states.js';
import { TILE } from '../src/ui/table-marks.js';
import { checkText, setFpAt } from '../src/ui/presenter-words.js';
import { lineText } from '../src/ui/handout.js';

const DIR = new URL('../src/ui/decks/', import.meta.url);
const loaded = [];
async function decks() {
  if (loaded.length) return loaded;
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.js'))) {
    const d = Object.values(await import(new URL(f, DIR))).find((v) => Array.isArray(v?.slides));
    if (d) loaded.push({ d, fps: await deckStates(d) });
  }
  return loaded;
}
const quizOf = (d) => [...(d.checks || []).flat(), ...d.slides.flatMap((s) => (Array.isArray(s.ask) ? s.ask : []))];

test('every {key@id} in a quiz names a tile and a slide of its deck, and both printers give the slide\'s own number', async () => {
  let n = 0;
  for (const { d, fps } of await decks()) {
    const at = (id) => fps[d.slides.findIndex((s) => s.id === id)] ?? null;
    setFpAt(at);
    for (const t of quizOf(d)) for (const m of String(t).matchAll(/\{(\w+)@([\w-]+)\}/g)) {
      n++;
      assert.ok(TILE[m[1]], `${d.id}: {${m[0]}} is no tile`);
      assert.ok(d.slides.some((s) => s.id === m[2]), `${d.id}: no slide ${m[2]}`);
      const out = checkText(m[0]), hand = lineText(m[0], null, at);
      assert.equal(out, hand, `${d.id}: the quiz and the handout print ${m[0]} alike`);
      assert.ok(/\d/.test(out), `${d.id}: ${m[0]} prints "${out}"`);
    }
  }
  assert.ok(n >= 3, 'the Prehepatic quiz uses them');
});
