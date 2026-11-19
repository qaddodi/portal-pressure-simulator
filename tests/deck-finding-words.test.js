// Finding words against the model (bible review 19 Nov 2026, ENG-2). A slide that tells the audience what the patient HAS ("with red wale signs",
// "large varices", "no ascites", "tense ascites") must agree with the state the model shows on that slide: the varix tile, the wall card's
// red wale and the ascites tile print the same words as the state's numbers. The pregnancy deck said "with red wale signs" beside a 4.9 mm
// Small varix and a wall card that printed red wale "None"; deck-claims.test.js binds numbers, pills and directions, and nothing bound these.
//
// What counts as a claim about the patient (anchored, so teaching generalisations never trip it):
//   red wale      "with / shows / has red wale ...", "no / without red wale"   -> the model's red wale (wall stress over 70% of rupture)
//   varix size    "with large varices", "Case 5: large varices", "her varices are small"  -> varixGrade of the esophageal varix (Small <5 mm, Large ≥5 mm)
//   no varices    "no esophageal varices"                                   -> the varix is under the 2.5 mm "none" cut
//   ascites       "tense ascites" (Grade 3, ≥5 L), "no ascites" (Grade 0, <150 mL), "grade 1/2/3 ascites", "ascites seen only on ultrasound" (Grade 1)
// Scanned: title, line, question, caseQ, the two-column sides, and (for red wale only, "as here") the notes. Not the vignette: it describes how the
// patient presented, and a slide that plays a treatment shows the state after it. A claim in the past tense ("her last EGD showed
// small varices") or in a rule ("Recompensation requires no ascites") is a history or a criterion, not a statement about the state on screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import './dom-shim.js';
import { deckStates } from './deck-states.js';
import { varixGrade, ascitesGrade } from '../src/engine/metrics.js';

const DIR = new URL('../src/ui/decks/', import.meta.url);
const SPOKEN = ['title', 'line', 'question', 'caseQ'];
const spoken = (s) => [...SPOKEN.map((k) => s[k]), ...(s.sides || []).map((x) => x.text)].filter((t) => typeof t === 'string');

const FINDING = '(?:esophageal |gastric |fundal )?varic(?:es|x)';
const RULE = /\b(?:requires?|require|must|criteri\w+|recompensation|would|if|when|unless)\b/i;
// "{text}" -> [{ what, ok(fp) }]
export function claimsOf(text, { notes = false } = {}) {
  const out = [];
  const t = text.replace(/\{[^}]*\}/g, '{}');
  const add = (what, ok) => out.push({ what, ok });
  // red wale
  if (!notes) {
    for (const m of t.matchAll(/\b(?:with|shows?|showing|has|have|having)\s+((?:\w+\s+){0,2})red wale\b/gi)) if (!/\bno\b/i.test(m[1])) add('red wale present', (f) => f.redWale);
    if (/\b(?:with no|no|without)\s+(?:\w+\s+)?red wale\b/i.test(t)) add('red wale absent', (f) => !f.redWale);
  } else if (/\bred wale\b[^.]*\bas here\b|\bas here\b[^.]*\bred wale\b/i.test(t)) add('red wale present ("as here")', (f) => f.redWale);
  if (notes) return out;
  // varix size (esophageal; a gastric or fundal one is read on its own size)
  const size = new RegExp(`(?:^|[:;,] |\\bwith |\\band |\\bhas |\\bhave |\\bshows? )(small|large)\\s+(${FINDING})(?!\\s+(?:become|grow|turn|enlarge))`, 'gi');
  for (const m of t.matchAll(size)) {
    if (/gastric|fundal/i.test(m[2])) continue;
    const want = m[1].toLowerCase() === 'large' ? 'Large' : 'Small';
    add(`${want.toLowerCase()} varices`, (f) => varixGrade(f.varix).label === want);
  }
  for (const m of t.matchAll(/\b(?:his|her|their|the) (?:esophageal )?varices (?:are|is) (small|large)\b/gi)) {
    const want = m[1].toLowerCase() === 'large' ? 'Large' : 'Small';
    add(`${want.toLowerCase()} varices`, (f) => varixGrade(f.varix).label === want);
  }
  if (/\bno esophageal varices\b/i.test(t)) add('no esophageal varices', (f) => varixGrade(f.varix).label === 'None');
  // ascites
  if (/\btense ascites\b/i.test(t)) add('tense ascites', (f) => ascitesGrade(f.asc).grade === 3);
  if (!RULE.test(t)) if (/\bno ascites\b/i.test(t)) add('no ascites', (f) => ascitesGrade(f.asc).grade === 0);
  for (const m of t.matchAll(/\bgrade ([123]) ascites\b/gi)) add(`grade ${m[1]} ascites`, (f) => ascitesGrade(f.asc).grade === +m[1]);
  if (/\bascites (?:seen )?only on (?:an? )?ultrasound\b/i.test(t)) add('ascites seen only on ultrasound (grade 1)', (f) => ascitesGrade(f.asc).grade === 1);
  return out;
}

const loaded = [];
async function decks() {
  if (loaded.length) return loaded;
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.js'))) {
    const d = Object.values(await import(new URL(f, DIR))).find((v) => Array.isArray(v?.slides));
    loaded.push({ d, fps: await deckStates(d) });
  }
  return loaded;
}

test('the claim reader finds the contradiction the pregnancy deck had (and leaves generalisations alone)', () => {
  const old = claimsOf('The varix now measures {varix}, with red wale signs.');
  assert.equal(old.length, 1);
  assert.ok(!old[0].ok({ redWale: false }) && old[0].ok({ redWale: true }));
  assert.equal(claimsOf('Red wale marks raise the bleeding risk of a varix of any size and do not change its size grade.').length, 0);
  assert.equal(claimsOf('An NSBB is now given for CSPH itself, not only for large varices.').length, 0);
  assert.equal(claimsOf('Over six months, the HVPG climbs, and small varices become large.').length, 0);
  assert.equal(claimsOf('Recompensation requires no ascites off diuretics.').length, 0);
  assert.equal(claimsOf('Case 5: large varices and normal liver stiffness')[0].what, 'large varices');
  assert.equal(claimsOf('With an HVPG of {hvpg}, large varices and ascites seen only on ultrasound, she starts carvedilol.').length, 2);
  assert.equal(claimsOf('Ascites that is tense is drained.').length, 0);
  assert.equal(claimsOf('Tense ascites raises the IAP and lowers the APP')[0].what, 'tense ascites');
  assert.equal(claimsOf('Band ligation is preferred when red wale signs are present, as here.', { notes: true }).length, 1);
});

test('every slide that says what the patient has agrees with the model state it shows (red wale, varix size, ascites grade)', async () => {
  const bad = [];
  let checked = 0;
  for (const { d, fps } of await decks()) {
    d.slides.forEach((s, i) => {
      const fp = fps[i];
      const lists = [...spoken(s).map((t) => claimsOf(t)), claimsOf(s.notes || '', { notes: true })];
      for (const c of lists.flat()) {
        checked++;
        if (!c.ok(fp)) bad.push(`${d.id}/${s.id}: says "${c.what}" but the model shows varix ${fp.varix?.toFixed(1)} mm (${varixGrade(fp.varix).label}), red wale ${fp.redWale}, wall ${Math.round((fp.wall || 0) * 100)}%, ascites ${Math.round(fp.asc)} mL (${ascitesGrade(fp.asc).label})`);
      }
    });
  }
  assert.ok(checked >= 15, `only ${checked} finding claims were found: the readers no longer match the decks' words`);
  assert.deepEqual(bad, []);
});
