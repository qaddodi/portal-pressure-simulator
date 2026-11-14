// A sentence that names a gradient prints that gradient: "the EUS-PPG is {eus}", never "{ppg}" (external review, 14 Nov 2026: ncph/eus
// said "the EUS-PPG is {ppg}", the portal vein minus the IVC, on the slide before one that teaches the two are different spans). For every
// reading name in a slide's words, the first live value after it, with no other reading named in between, must be that reading.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import './dom-shim.js';

const DIR = new URL('../src/ui/decks/', import.meta.url);
// Longest first, so "EUS-PPG" is not also read as "PPG".
const NAMES = [['EUS-PPG', 'eus'], ['HVPG', 'hvpg'], ['WHVP', 'whvp'], ['FHVP', 'fhvp'], ['PPG', 'ppg']];
const NAME_RE = new RegExp(`(?<![\\w-])(${NAMES.map(([n]) => n).join('|')})(?![\\w-])`, 'g');
const KEY = Object.fromEntries(NAMES);

function misbound(text) {
  const out = [];
  for (const sen of String(text || '').split(/(?<=[.;:?])\s+/)) {
    const marks = [...sen.matchAll(NAME_RE)].map((m) => ({ at: m.index, end: m.index + m[0].length, name: m[1] }));
    marks.forEach((m, j) => {
      const tok = /\{([a-zA-Z]+)[^}]*\}/.exec(sen.slice(m.end));
      if (!tok) return;
      const tokAt = m.end + tok.index, next = marks[j + 1];
      if (next && next.at < tokAt) return;   // (another reading is named first: the value belongs to it)
      const want = KEY[m.name], got = tok[1];
      if (Object.values(KEY).includes(got) && got !== want) out.push(`${m.name} → {${got}}: "${sen.trim().slice(0, 120)}"`);
    });
  }
  return out;
}

test('the check itself: a named gradient followed by another gradient\'s value is caught', () => {
  assert.equal(misbound('Here the EUS-PPG is {ppg}, while the HVPG was {hvpg}.').length, 1);
  assert.equal(misbound('Here the EUS-PPG is {eus}, while the HVPG was {hvpg}.').length, 0);
  assert.equal(misbound('The HVPG is {hvpg}, the EUS-PPG {eus} and the PPG {ppg}.').length, 0);
});

test('every slide prints the reading its words name', async () => {
  const bad = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.js'))) {
    const d = Object.values(await import(new URL(f, DIR))).find((v) => Array.isArray(v?.slides));
    for (const s of d.slides) for (const k of ['title', 'line', 'question', 'caseQ']) for (const b of misbound(s[k])) bad.push(`${d.id}/${s.id} ${k}: ${b}`);
  }
  assert.deepEqual(bad, []);
});
