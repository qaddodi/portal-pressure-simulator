// The TIPS deck review (17 Nov 2026): each finding is held across every deck, not only the slide it was found on.
//   1. A compare button that is not the slide's own never shows the slide's own title (the own button then read like "More fibrosis").
//   2. A slide whose what-if slider moves a setting prints no fixed number in its figure callout ("Stent at 12 mm" stayed while the slider moved the width).
//   3. Frailty and age are never called a relative contraindication to TIPS: Baveno VIII 4.19 says frailty alone should neither indicate nor contraindicate
//      it, and 6.8 weighs older adults case by case.
//   4. "No beta-blocker once the gradient is under 12 mmHg" is AASLD 2024's sentence on gastric varices: a slide that says it names them.
//   5. A slide line that sends uncontrolled bleeding to an esophageal stent names balloon tamponade with it (not FDA approved in the US; AASLD 2024 #34),
//      unless it quotes the Baveno VIII algorithm.
//   6. After a TIPS, <12 mmHg is AASLD 2024's reference for a variceal indication (no beta-blocker under it), never "the target": neither guideline
//      calls it one, and Baveno VIII sets no gradient for ascites (6.5, 6.6). Mohammad, 17 Nov 2026: "whichever the guideline supports", in every talk.
//   7. The TIPS deck: TIPS is never offered for varices alone (no primary prophylaxis), and no vignette calls a new patient "the same" one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { TIPS_COMPLETE } from '../src/ui/decks/tips-complete.js';

const DIR = new URL('../src/ui/decks/', import.meta.url);
const decks = [];
for (const f of readdirSync(DIR).filter((x) => x.endsWith('.js'))) {
  const d = Object.values(await import(new URL(f, DIR))).find((v) => Array.isArray(v?.slides));
  if (d) decks.push(d);
}
const strings = (o, out = []) => { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach((x) => strings(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => strings(x, out)); return out; };

test('a button other than the slide\'s own never carries the slide\'s own title', () => {
  const bad = [];
  for (const d of decks) for (const s of d.slides) for (const o of s.compare || []) if (!o.own && o.title && o.title === s.title) bad.push(`${d.id}/${s.id} "${o.label}"`);
  assert.deepEqual(bad, []);
});

test('a slide with a what-if slider prints no fixed number in its figure callout', () => {
  const bad = [];
  for (const d of decks) for (const s of d.slides) if (s.whatIf?.param && /\d/.test(s.mark?.label?.replace(/\{[^}]*\}/g, '') || '')) bad.push(`${d.id}/${s.id}: "${s.mark.label}"`);
  assert.deepEqual(bad, []);
});

test('frailty or age is never called a relative contraindication to TIPS', () => {
  const bad = [];
  for (const d of decks) for (const t of strings(d.slides)) if (/(frailty|age)[^.]{0,60}relative[^.]{0,20}contraindication/i.test(t)) bad.push(`${d.id}: ${t.slice(0, 100)}`);
  assert.deepEqual(bad, []);
});

test('"no beta-blocker under 12 mmHg after a TIPS" names the gastric varices it was said for', () => {
  const bad = [];
  for (const d of decks) for (const s of d.slides) {
    const all = strings(s), says = all.flatMap((t) => t.split(/(?<=\.)\s/)).filter((m) => /beta-blocker/i.test(m) && /12\s?mmHg/.test(m) && /TIPS/.test(m));
    if (says.length && d.id !== 'gastric-varices' && !all.some((t) => /gastric/i.test(t))) bad.push(`${d.id}/${s.id}: ${says[0].slice(0, 120)}`);
  }
  assert.deepEqual(bad, []);
});

test('a line that bridges with an esophageal stent names balloon tamponade, or quotes the Baveno VIII algorithm', () => {
  const bad = [];
  for (const d of decks) for (const s of d.slides) if (/esophageal stent/i.test(s.line || '') && !/tamponade|algorithm/i.test(s.line)) bad.push(`${d.id}/${s.id}`);
  assert.deepEqual(bad, []);
});

test('no talk calls a post-TIPS gradient of 12 mmHg a target', () => {
  const bad = [];
  for (const d of [...decks, { id: 'objectives', slides: decks.map((x) => ({ objectives: x.objectives, checks: x.checks })) }]) for (const t of strings(d.slides)) for (const m of t.split(/(?<=[.?])\s/)) {
    if (/12\s?mmHg/.test(m) && /TIPS|stent/.test(m) && /\btarget\b/i.test(m) && !/\bno (?:\w+ )?(?:gradient |PPG )?target\b/i.test(m)) bad.push(`${d.id}: ${m.slice(0, 120)}`);
    if (/stent|TIPS|PPG|gradient/i.test(m) && /\b(?:at|meets?|meeting|reaches) (?:the )?target\b/i.test(m)) bad.push(`${d.id}: ${m.slice(0, 120)}`);
  }
  assert.deepEqual(bad, []);
});

test('the TIPS deck offers no stent for varices alone, and every vignette is its own patient', () => {
  const first = TIPS_COMPLETE.slides[0].vignette;
  assert.ok(/ascites|bled|bleed/i.test(first), `slide 1's patient needs an indication, not only varices: "${first}"`);
  for (const s of TIPS_COMPLETE.slides) assert.ok(!/\bthe same (woman|man|patient)\b/i.test(s.vignette || ''), `${s.id}: "${s.vignette}"`);
  const ages = TIPS_COMPLETE.slides.map((s) => (s.vignette || '').match(/^An? (\d+)-year-old (woman|man)/)).filter(Boolean).map((m) => m[1] + m[2]);
  const twice = ages.filter((a, i) => ages.indexOf(a) !== i);
  // (The brain slide's 63-year-old woman and the encephalopathy-after-TIPS patient had the same age and sex with different stents.)
  assert.deepEqual(twice, [], 'two vignettes describe a patient of the same age and sex');
});
