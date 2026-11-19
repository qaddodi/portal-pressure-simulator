// About and References say what is true (bible ENG-8, 19 Nov 2026): every guideline a deck cites has a reference entry, and the sheet makes no
// promise the repository has since broken (content "dated" one month, a check "still pending" that the guideline PDFs in the repo settle).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const about = read('src/ui/main.js').match(/function openAbout[\s\S]*?\nfunction openPrivacy/)[0];
const decks = readdirSync(new URL('src/ui/decks/', root)).filter((f) => f.endsWith('.js')).map((f) => read(`src/ui/decks/${f}`)).join('\n');

const CITED = [
  ['AASLD 2024', /AASLD 2024/, /Kaplan[^']*AASLD Practice Guidance[^']*2024/],
  ['AASLD 2021', /AASLD 2021/, /Biggins[^']*2021 practice guidance by the AASLD/],
  ['AASLD 2020', /AASLD 2020/, /Northup[^']*2020 practice guidance by the AASLD/],
  ['EASL 2025', /EASL 2025/, /EASL Clinical Practice Guidelines on vascular diseases of the liver/],
  ['Baveno VIII', /Baveno VIII/, /Baveno VIII: advancing consensus/],
];

test('every guideline the decks cite is in About\'s References', () => {
  for (const [name, cited, ref] of CITED) if (cited.test(decks)) assert.ok(ref.test(about), `${name} is cited by a deck and has no reference entry`);
});

test('About promises no frozen content date and names no check as pending', () => {
  assert.ok(!/CONTENT_UPDATED/.test(about), 'no content date promise');
  assert.ok(!/is still pending|line-by-line check/.test(about.replace(/External clinical advisory[^']*/, '')), 'no "pending" Baveno check');
});
