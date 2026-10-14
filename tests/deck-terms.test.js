// A slide's pills come from its line: [linked terms](pv), the words its `terms` name, {values} and cut-offs, and,
// with no {braces}, its first value with a unit. A rewrite of the line that stops naming a term or drops a {value}
// silently loses its pill (and the figure highlight it drives), so each slide's pills are kept in
// tests/deck-pills.json and none may go missing. New pills are fine.
//   UPDATE=1 node --test tests/deck-terms.test.js    rewrite the baseline (only when a pill was dropped on purpose)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { DECKS } from '../src/ui/decks.js';

const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SRC = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
// Each figure target's own words (presenter.js TARGETS), for a slide whose terms are a list of targets.
const WORDS = {};
for (const m of SRC.matchAll(/^\s+'?([\w:]+)'?: \{[^\n]*words: '([^']+)'/gm)) WORDS[m[1]] = m[2];
const VAL = String.raw`\d+(?:\.\d+)?(?:\s(?:to|or)\s\d+(?:\.\d+)?)?\s?(?:mmHg|g\/dL|mL\/min|kPa|cm\/s|mm|%)(?![A-Za-z])`;
const BASE = new URL('./deck-pills.json', import.meta.url);

function pills(s) {
  const line = s.line || '', out = [];
  for (const m of line.matchAll(/\[([^\]]+)\]\(([\w:]+)\)/g)) out.push(m[1]);
  const plain = line.replace(/\[([^\]]+)\]\([\w:]+\)/g, '§');
  const t = s.terms, words = !t ? [] : Array.isArray(t) ? t.map((k) => WORDS[k]).filter(Boolean) : Object.keys(t).map(esc);
  words.push(WORDS.cavernoma);   // (presenter.js AUTO_TERMS: on every slide)
  for (const w of words) { const m = plain.match(new RegExp(`\\b(?:${w})\\b`, 'i')); if (m) out.push(m[0].toLowerCase()); }
  const marked = line.match(/\{[^}]+\}/g);
  if (marked) out.push(...marked);
  else if (s.pill !== false && new RegExp(VAL).test(line)) out.push('(a value)');
  return out;
}

test('no slide loses a pill its line had (tests/deck-pills.json)', () => {
  const now = {};
  for (const d of DECKS) for (const s of d.slides) { const p = pills(s); if (p.length) now[`${d.id}/${s.id}`] = p; }
  if (process.env.UPDATE) { writeFileSync(BASE, JSON.stringify(now, null, 1) + '\n'); return; }
  const base = JSON.parse(readFileSync(BASE, 'utf8')), lost = [];
  for (const [k, want] of Object.entries(base)) {
    const have = [...(now[k] || [])];
    for (const p of want) { const i = have.indexOf(p); if (i < 0) lost.push(`${k}: ${p}`); else have.splice(i, 1); }
  }
  assert.deepEqual(lost, [], 'pills gone from slide lines (UPDATE=1 rewrites the baseline when that is intended)');
});

test('every term a slide gives is named by its line (its pill shows)', () => {
  const missing = [];
  for (const d of DECKS) {
    // (A term map shared by several slides of a deck may name more than any one line uses.)
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

test('the cavernoma is a pill that lights its collaterals wherever a line names it', () => {
  assert.match(SRC, /AUTO_TERMS = \['cavernoma'\]/);
  assert.match(SRC, /cavernoma: \{ edges: \['C8'\], tone: 'cav'/);
  const named = [];
  for (const d of DECKS) for (const s of d.slides) if (/\bcavernoma/i.test(s.line || '')) named.push(`${d.id}/${s.id}`);
  assert.ok(named.includes('prehepatic/cavernoma') && named.includes('doppler/smv'), named.join());
});
