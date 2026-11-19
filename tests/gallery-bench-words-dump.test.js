// The Words dump bench (src/ui/gallery/benches/words-dump.js): the pure part, against the real decks. It reports how many strings the decks hold
// and which of them break a wording rule (printed, never failed on: the owner reads the list).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import words, { collectWords, formatDump, wordingFlags, filterRows, countWords, mathText } from '../src/ui/gallery/benches/words-dump.js';
import { RULES, checkWording } from '../src/ui/gallery/wording-rules.js';
import { RULES as LINT_RULES } from '../scripts/clinical-wording.mjs';
import * as WORDING from '../src/ui/wording.js';

const rows = collectWords(DECKS);

test('the bench is the one the list names', () => {
  assert.equal(words.id, 'words-dump');
  assert.equal(words.title, 'Words dump');
  assert.equal(typeof words.mount, 'function');
});

test('the real decks give many strings, each with a deck, slide, path and text', () => {
  assert.ok(rows.length > 3000, `only ${rows.length} strings`);
  for (const r of rows) {
    assert.ok(r.deck && r.deckTitle && r.slide && r.path && typeof r.text === 'string' && r.text.trim(), JSON.stringify(r).slice(0, 200));
    assert.ok(['text', 'notes', 'other'].includes(r.kind));
  }
  const c = countWords(rows, []);
  assert.equal(c.decks, DECKS.length);
  assert.ok(c.slides > 400);
  // (the fields a reviewer expects on a slide)
  const paths = new Set(rows.map((r) => r.path.replace(/\[\d+\]/g, '[]')));
  for (const p of ['kicker', 'title', 'line', 'notes', 'ask.question', 'ask.answer', 'vignette', 'compare[].label', 'tool.title', 'cite', 'checks[].question', 'objectives[]']) assert.ok(paths.has(p), `no ${p}`);
});

test('words that are not words stay out: ids, camera regions, the model\'s keys', () => {
  const bad = rows.filter((r) => /^(?:cam|preset|params|glow|labels|tiles|lens|view)\b/.test(r.path));
  assert.deepEqual(bad.slice(0, 5), []);
  assert.equal(rows.filter((r) => r.kind === 'other').length, 0, 'a field that reads as words but is not in the known list: add it to the bench');
});

test('an equation is its words, not its markup', () => {
  assert.equal(mathText('<mi>HVPG</mi><mo>=</mo><mi class="eq-wedge">WHVP</mi><mo>−</mo><mi>FHVP</mi>'), 'HVPG = WHVP − FHVP');
  for (const r of rows.filter((x) => /^eq\[0\]$/.test(x.path))) assert.ok(!/</.test(r.text), r.text);
});

test('formatDump groups by deck and slide, by deck, or one line a row', () => {
  const some = collectWords([DECKS[0]]).slice(0, 14);
  const a = formatDump(some);
  assert.match(a, /^== .* \(circulation\) ==\n-- the deck --\n/);
  assert.ok(a.split('\n').length >= some.length);
  assert.ok(!/^-- /m.test(formatDump(some, { group: 'deck' }).split('\n').slice(1).join('\n')));
  const c = formatDump(some, { group: 'none' }).split('\n');
  assert.equal(c.length, some.length);
  assert.match(c[0], /^circulation \/ deck \/ title: /);
  assert.equal(formatDump([]), '');
});

test('filterRows: every word typed, one deck, notes off', () => {
  assert.ok(filterRows(rows, { query: 'portal vein' }).length > 100);
  assert.ok(filterRows(rows, { deck: 'hvpg' }).every((r) => r.deck === 'hvpg'));
  assert.equal(filterRows(rows, { notes: false }).some((r) => r.kind === 'notes'), false);
  assert.equal(filterRows(rows, { query: 'zzzqqqxxx' }).length, 0);
});

test('wordingFlags finds Baveno VII, American spelling and double spaces, and leaves Baveno VIII alone', () => {
  const mk = (text) => ({ deck: 'd', deckTitle: 'D', slide: 's', n: 2, path: 'line', text, kind: 'text' });
  const r = [mk('Baveno VII says so'), mk('Baveno VIII says so'), mk('Baveno 7 says'), mk('Her oedema and haemorrhage'), mk('Two  spaces'), mk('Plain text.'), mk('MAP less the IAP')];
  const f = wordingFlags(r);
  assert.deepEqual(f.map((x) => x.text), ['Baveno VII says so', 'Baveno 7 says', 'Her oedema and haemorrhage', 'Two  spaces', 'MAP less the IAP']);
  assert.equal(f[0].flags[0].rule, 'older-baveno');
  assert.ok(f[2].flags.some((x) => x.rule === 'british'));
  assert.deepEqual(checkWording('paracentesis, ascitic fluid, and the portal vein'), []);
});

test('there is one wording list: the lint, the dump and the registry all read src/ui/wording.js (no copy to keep in step)', () => {
  assert.equal(RULES, WORDING.RULES);
  assert.equal(LINT_RULES, WORDING.RULES);
  assert.equal(checkWording('Baveno VII says so')[0].rule, 'older-baveno');
});

test('the real decks give many strings, each with a deck, slide, path and text', () => {
  assert.ok(rows.length > 3000, `only ${rows.length} strings`);
  for (const r of rows) {
    assert.ok(r.deck && r.deckTitle && r.slide && r.path && typeof r.text === 'string' && r.text.trim(), JSON.stringify(r).slice(0, 200));
    assert.ok(['text', 'notes', 'other'].includes(r.kind));
  }
  const c = countWords(rows, []);
  assert.equal(c.decks, DECKS.length);
  assert.ok(c.slides > 400);
  // (the fields a reviewer expects on a slide)
  const paths = new Set(rows.map((r) => r.path.replace(/\[\d+\]/g, '[]')));
  for (const p of ['kicker', 'title', 'line', 'notes', 'ask.question', 'ask.answer', 'vignette', 'compare[].label', 'tool.title', 'cite', 'checks[].question', 'objectives[]']) assert.ok(paths.has(p), `no ${p}`);
});

test('words that are not words stay out: ids, camera regions, the model\'s keys', () => {
  const bad = rows.filter((r) => /^(?:cam|preset|params|glow|labels|tiles|lens|view)\b/.test(r.path));
  assert.deepEqual(bad.slice(0, 5), []);
  assert.equal(rows.filter((r) => r.kind === 'other').length, 0, 'a field that reads as words but is not in the known list: add it to the bench');
});

test('an equation is its words, not its markup', () => {
  assert.equal(mathText('<mi>HVPG</mi><mo>=</mo><mi class="eq-wedge">WHVP</mi><mo>−</mo><mi>FHVP</mi>'), 'HVPG = WHVP − FHVP');
  for (const r of rows.filter((x) => /^eq\[0\]$/.test(x.path))) assert.ok(!/</.test(r.text), r.text);
});

test('formatDump groups by deck and slide, by deck, or one line a row', () => {
  const some = collectWords([DECKS[0]]).slice(0, 14);
  const a = formatDump(some);
  assert.match(a, /^== .* \(circulation\) ==\n-- the deck --\n/);
  assert.ok(a.split('\n').length >= some.length);
  assert.ok(!/^-- /m.test(formatDump(some, { group: 'deck' }).split('\n').slice(1).join('\n')));
  const c = formatDump(some, { group: 'none' }).split('\n');
  assert.equal(c.length, some.length);
  assert.match(c[0], /^circulation \/ deck \/ title: /);
  assert.equal(formatDump([]), '');
});

test('filterRows: every word typed, one deck, notes off', () => {
  assert.ok(filterRows(rows, { query: 'portal vein' }).length > 100);
  assert.ok(filterRows(rows, { deck: 'hvpg' }).every((r) => r.deck === 'hvpg'));
  assert.equal(filterRows(rows, { notes: false }).some((r) => r.kind === 'notes'), false);
  assert.equal(filterRows(rows, { query: 'zzzqqqxxx' }).length, 0);
});

test('wordingFlags finds Baveno VII, American spelling and double spaces, and leaves Baveno VIII alone', () => {
  const mk = (text) => ({ deck: 'd', deckTitle: 'D', slide: 's', n: 2, path: 'line', text, kind: 'text' });
  const r = [mk('Baveno VII says so'), mk('Baveno VIII says so'), mk('Baveno 7 says'), mk('Her oedema and haemorrhage'), mk('Two  spaces'), mk('Plain text.'), mk('MAP less the IAP')];
  const f = wordingFlags(r);
  assert.deepEqual(f.map((x) => x.text), ['Baveno VII says so', 'Baveno 7 says', 'Her oedema and haemorrhage', 'Two  spaces', 'MAP less the IAP']);
  assert.equal(f[0].flags[0].rule, 'older-baveno');
  assert.ok(f[2].flags.some((x) => x.rule === 'british'));
  assert.deepEqual(checkWording('paracentesis, ascitic fluid, and the portal vein'), []);
});

test('the rule list is the lint\'s (scripts/clinical-wording.mjs), copied: a new rule there must be copied here', () => {
  assert.equal(RULES.length, LINT_RULES.length);
  RULES.forEach((r, i) => { assert.equal(r[0], LINT_RULES[i][0]); assert.equal(r[1].source, LINT_RULES[i][1].source, r[0]); assert.equal(r[1].flags, LINT_RULES[i][1].flags, r[0]); });
});

test('the real decks: how many strings and flags (reported, never failed on)', () => {
  const f = wordingFlags(rows);
  console.log(`words dump: ${rows.length} strings, ${new Set(rows.map((r) => `${r.deck}/${r.slide}`)).size} slides (and the decks' own words), ${f.length} flagged`);
  for (const r of f) console.log(`  flag ${r.deck} / ${r.slide} / ${r.path}: ${r.flags.map((x) => `${x.rule} "${x.match}"`).join('; ')}`);
  assert.ok(Array.isArray(f));
});
