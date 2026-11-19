// "Stays", "remains", "unchanged" and "the same" in a slide's words must agree with the numbers on screen (play-test B14, B15, 16 Nov 2026).
// Two lesions 6 said "the right atrium stays at 19.7, so the portal vein pressure stays at 30.6" over a chart that fell from 21.8 and 36.1; its
// title said the PPG was "unchanged" beside a tile that read 14.6 against 13.5. "Unchanged" is the table's own rule (table-marks.js dirRel: a
// change smaller than the reading's step shows no arrow), so the words and the table's arrows cannot disagree.
//   1. "stays/remains/holds at {x}" and "{x} ... stays": {x} on this slide equals {x} on the slide before it (dirRel 0).
//   2. "unchanged", "the same as" and "no change" over a reading ({x@id} in the line, or the reading the title names): equal to that slide's.
// The "rises/falls from {x@id} to {x}" test is in deck-claims.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import './dom-shim.js';
import { deckStates, changes } from './deck-states.js';
import { dirRel } from '../src/ui/table-marks.js';

const DIR = new URL('../src/ui/decks/', import.meta.url);
const loaded = [];
async function decks() {
  if (loaded.length) return loaded;
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.js'))) {
    const d = Object.values(await import(new URL(f, DIR))).find((v) => Array.isArray(v?.slides));
    loaded.push({ d, fps: await deckStates(d) });
  }
  return loaded;
}
const KEY = { hvpg: /\bHVPG\b/, ppg: /\bPPG\b/, pv: /\bportal (?:vein )?pressure\b/i, ra: /\bright atri(?:um|al)\b/i, fhvp: /\bFHVP\b/, whvp: /\bWHVP\b/ };
const STAY = String.raw`(?:stays?|remains?|holds?)`;

test('"stays at {x}" holds only where {x} is the same as on the slide before', async () => {
  const bad = []; let n = 0;
  for (const { d, fps } of await decks()) d.slides.forEach((s, i) => {
    // (What a slide's "stays" is measured against: the slide its delta names, else the one before. A slide that brings another patient (a preset) says nothing
    // stays: its numbers are a new patient's.)
    if (!i || !changes(s) || s.preset) return;
    const ref = typeof s.delta === 'string' && d.slides.findIndex((x) => x.id === s.delta) >= 0 ? fps[d.slides.findIndex((x) => x.id === s.delta)] : fps[i - 1];
    for (const t of [s.title, s.line]) {
      if (typeof t !== 'string') continue;
      for (const m of t.matchAll(new RegExp(String.raw`\b${STAY}\s+(at\s+|near\s+|close to\s+)?\{(\w+)\}`, 'gi'))) {
        n++;
        const k = m[2], near = /^(near|close)/i.test(m[1] || '');
        if (fps[i][k] == null || ref[k] == null) continue;
        // ("near" and "close to" allow a tenth, or one unit: the reading moved a little, which is what the word says.)
        if (near ? Math.abs(fps[i][k] - ref[k]) > Math.max(1, 0.1 * Math.abs(ref[k])) : dirRel(k, fps[i], ref) !== 0) bad.push(`${d.id}/${s.id}: "${m[0]}" but ${k} was ${ref[k].toFixed(1)} and is ${fps[i][k].toFixed(1)}`);
      }
    }
  });
  assert.ok(n >= 1, 'the rule found a sentence to hold');
  assert.deepEqual(bad, []);
});

test('"unchanged" and "the same as" over a reading hold by the table\'s own step', async () => {
  const bad = []; let n = 0;
  for (const { d, fps } of await decks()) d.slides.forEach((s, i) => {
    const texts = [s.title, s.line].filter((t) => typeof t === 'string');
    if (!texts.some((t) => /\b(unchanged|the same as)\b/i.test(t))) return;
    const all = texts.join(' ');
    const refs = [...all.matchAll(/\{(\w+)@([\w-]+)(?::\d)?\}/g)].map((m) => [m[1], d.slides.findIndex((x) => x.id === m[2])]).filter(([, j]) => j >= 0);
    // (The reading a title calls unchanged is the one named just before the word: "HVPG is unchanged while the PPG rises" holds the HVPG.)
    const named = texts.flatMap((t) => [...t.matchAll(/\b(unchanged|the same as)\b/gi)].map((m) => Object.keys(KEY).filter((k) => KEY[k].test(t.slice(Math.max(0, m.index - 45), m.index))).at(-1))).filter(Boolean);
    for (const [k, j] of refs) { n++; if (fps[i][k] != null && fps[j][k] != null && dirRel(k, fps[i], fps[j]) !== 0) bad.push(`${d.id}/${s.id}: says unchanged but ${k} was ${fps[j][k].toFixed(1)} on "${d.slides[j].id}" and is ${fps[i][k].toFixed(1)}`); }
    if (!refs.length && i && changes(s)) for (const k of named) { n++; if (fps[i][k] != null && dirRel(k, fps[i], fps[i - 1]) !== 0) bad.push(`${d.id}/${s.id}: says unchanged but ${k} was ${fps[i - 1][k].toFixed(1)} and is ${fps[i][k].toFixed(1)}`); }
  });
  void n;   // (no slide says "unchanged" over a reading today: the rule holds the next one that does)
  assert.deepEqual(bad, []);
});

test('a table\'s arrows and the words share one step: a clot in cirrhosis moves the right atrium 1.1 mmHg and shows no arrow', async () => {
  const { d, fps } = (await decks()).find((x) => x.d.id === 'two-lesions');
  const at = (id) => fps[d.slides.findIndex((s) => s.id === id)];
  assert.equal(dirRel('ra', at('clot'), at('base')), 0, 'RA 3.7 to 4.8');
  assert.notEqual(dirRel('ra', at('together'), at('base')), 0, 'the congested row still shows its right atrium');
  assert.notEqual(dirRel('ppg', at('together'), at('base')), 0, 'the PPG 13.5 to 14.6 is a change by the step the words use');
});
