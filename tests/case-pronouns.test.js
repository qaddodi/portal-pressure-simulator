// One case, one sex (Acute variceal bleeding, play-test 16 Nov 2026: a 54-year-old man whose slide then said "why she is transfused"). A case card (vignette) defines the patient's
// sex once; the slides that follow it, up to the next case card, take the pronouns that sex gives and none of the other's.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';

const NOTES = new Set(['variceal-bleed']);
const MALE = /\b(man|boy|male|gentleman)\b/i, FEMALE = /\b(woman|girl|female|lady)\b/i;
// (case-sensitive: "HE" is hepatic encephalopathy)
const HE = /\b([Hh]e|[Hh]is|[Hh]im|[Hh]imself)\b/, SHE = /\b([Ss]he|[Hh]er|[Hh]ers|[Hh]erself)\b/;
const EITHER = /\b(he or she|she or he|his or her|her or his|him or her|her or him|he\/she|his\/her)\b/gi;
const strip = (t) => String(t || '').replace(/\{[^}]*\}/g, '').replace(EITHER, '');   // (a {pill} is a reading's name, {he} the encephalopathy index)
const sexOf = (v) => { const m = MALE.test(v), f = FEMALE.test(v); return m && !f ? 'M' : f && !m ? 'F' : null; };

test('the slides of a case use the pronouns of the sex its case card gives', () => {
  const bad = [];
  for (const d of DECKS) {
    let sex = null;
    for (const s of d.slides) {
      if (s.vignette) sex = sexOf(s.vignette);
      if (!sex) continue;
      // (the notes too in the one-patient-at-a-time talks: elsewhere a note may compare patients)
      for (const f of ['title', 'line', 'caseQ', ...(NOTES.has(d.id) ? ['notes'] : [])]) {
        const t = strip(s[f]);
        // (a hypothetical patient of the other sex, introduced by a noun of its own in the same sentence, is its own case: "A woman … she")
        for (const sentence of t.split(/(?<=[.?!])\s+/)) {
          if (sexOf(sentence)) continue;
          if (sex === 'M' && SHE.test(sentence)) bad.push(`${d.id}/${s.id} ${f}: ${sentence.slice(0, 90)}`);
          if (sex === 'F' && HE.test(sentence)) bad.push(`${d.id}/${s.id} ${f}: ${sentence.slice(0, 90)}`);
        }
      }
    }
  }
  assert.deepEqual(bad, []);
});
