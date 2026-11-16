// The deck-state content test (full app review 15 Nov 2026, opportunity 8): every deck is computed as the presenter computes it, and each
// sentence that ties a number to a rule or a direction is checked against the numbers the slide shows.
//   1. "rises from {x@id} to {x}" has x higher on the slide than on slide id (and "falls from ... to" lower).
//   2. "{hvpg} ..., which is {<10 mmHg}": the pill's cut-off holds for the reading just before it (pressures in mmHg, stiffness in kPa).
//   3. A compare button never names a drug the model has off in that button (the "Norepinephrine" button that turned terlipressin off).
//   4. A slide that plays the EUS-PPG shows the EUS-PPG tile and prints {eus} (hvpg.js printed {ppg}).
//   5. A slide gives at most two units of red cells, but the demonstration of overtransfusion (restrictive transfusion, Baveno VIII 5.4).
//   6. No deck says a guideline file is missing, or that no guideline gives a recanalization rate (EASL 2025 does).
//   7. A slide at LSM 20 to 25 kPa with platelets <150,000/µL never sends the patient to screening endoscopy without naming AASLD.
//   8. The few teaching errors of the review stay fixed (each pinned to the slide that carried it).
//   9. A sentence "falls to {x}" or "lowers ... to {x}" agrees with the state just before the slide's change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import './dom-shim.js';
import { deckStates, changes } from './deck-states.js';

const DIR = new URL('../src/ui/decks/', import.meta.url);
const files = readdirSync(DIR).filter((x) => x.endsWith('.js'));
const loaded = [];
async function decks() {
  if (loaded.length) return loaded;
  for (const f of files) {
    const d = Object.values(await import(new URL(f, DIR))).find((v) => Array.isArray(v?.slides));
    loaded.push({ file: f, d, fps: await deckStates(d) });
  }
  return loaded;
}
const TEXT = ['title', 'line', 'question', 'caseQ'];
const words = (s) => [...TEXT.map((k) => s[k]), ...(s.sides || []).map((x) => x.text)].filter((t) => typeof t === 'string');
const TOK = /\{([a-zA-Z]+)(?:@([\w-]+))?(?::\d)?\}/g;

const UP = '(?:rise|rises|raise|raises|increase|increases|climb|climbs|higher|up)', DOWN = '(?:fall|falls|lower|lowers|drop|drops|decrease|decreases|reduce|reduces|down)';
const dirRe = (v) => new RegExp(`\\b${v}\\b[^.{}]{0,60}?from \\{(\\w+)@([\\w-]+)(?::\\d)?\\} to \\{\\1(?::\\d)?\\}`, 'g');

test('a sentence "rises/falls from {x@id} to {x}" agrees with the numbers of the two slides', async () => {
  const bad = [];
  for (const { d, fps } of await decks()) {
    const at = (id) => d.slides.findIndex((s) => s.id === id);
    d.slides.forEach((s, i) => {
      for (const t of words(s)) for (const [v, up] of [[UP, true], [DOWN, false]]) for (const m of t.matchAll(dirRe(v))) {
        const [, k, id] = m, j = at(id);
        if (j < 0) { bad.push(`${d.id}/${s.id}: slide "${id}" is not in the deck`); continue; }
        const a = fps[j][k], b = fps[i][k];
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
        if (up ? !(b > a) : !(b < a)) bad.push(`${d.id}/${s.id}: "${m[0].slice(0, 90)}" but ${k} is ${a.toFixed(2)} then ${b.toFixed(2)}`);
      }
    });
  }
  assert.deepEqual(bad, []);
});

const PRESSURE = new Set(['hvpg', 'ppg', 'eus', 'pv', 'whvp', 'fhvp', 'ivc', 'ra', 'map', 'sbp', 'rpp']), STIFF = new Set(['lsm', 'ssm']);
const PILL = /^\{(<=|>=|<|>|≤|≥)\s*(\d+(?:\.\d+)?)\s*(mmHg|kPa)\}$/;
const holds = (v, op, n) => ({ '<': v < n, '<=': v <= n, '≤': v <= n, '>': v > n, '>=': v >= n, '≥': v >= n })[op];

test('a rule pill that follows a reading holds for that reading ("{hvpg}, which is {<10 mmHg}")', async () => {
  const bad = [];
  // Slides whose pill is a teaching contrast, not the slide's own claim, are named here with the reason.
  const SKIP = new Set([]);
  for (const { d, fps } of await decks()) {
    const at = (id) => d.slides.findIndex((s) => s.id === id);
    d.slides.forEach((s, i) => {
      if (SKIP.has(`${d.id}/${s.id}`)) return;
      for (const t of words(s)) for (const sen of t.split(/(?<=[.;:?])\s+/)) {
        let last = null;
        for (const m of sen.matchAll(/\{[^{}]+\}/g)) {
          const pill = PILL.exec(m[0]);
          if (!pill) { const tk = /^\{([a-zA-Z]+)(?:@([\w-]+))?(?::\d)?\}$/.exec(m[0]); if (tk) last = { tk, end: m.index + m[0].length }; continue; }
          if (!last) continue;
          // The pill belongs to the reading only when it follows it directly: "{hvpg}, which is {<10 mmHg}", "{hvpg} does not meet {>=10 mmHg}".
          const gap = sen.slice(last.end, m.index), not = /^[,\s]*(?:which |that )?(?:does not meet|doesn't meet|is not|not)\s*(?:still )?$/.test(gap);
          if (!not && !/^[,\s]*(?:which |that )?(?:is|are|was|were|meets?|still|now|is still|is now)?\s*$/.test(gap)) continue;
          const [, k, id] = last.tk, [, op, n, unit] = pill;
          if (!(unit === 'mmHg' ? PRESSURE : STIFF).has(k)) continue;
          const fp = id ? fps[at(id)] : fps[i], v = fp?.[k];
          if (!Number.isFinite(v)) continue;
          if (holds(Math.round(v * 10) / 10, op, Number(n)) === not) bad.push(`${d.id}/${s.id}: ${k}${id ? '@' + id : ''} is ${v.toFixed(1)}, "${sen.trim().slice(0, 110)}"`);
        }
      }
    });
  }
  assert.deepEqual(bad, []);
});

const DRUGS = ['carvedilol', 'propranolol', 'terlipressin', 'octreotide', 'norepinephrine', 'albumin'];
test('a compare button that names a drug has that drug on (and norepinephrine, which the model lacks, names no button)', async () => {
  const bad = [];
  for (const { d } of await decks()) for (const s of d.slides) for (const o of s.compare || []) {
    for (const drug of DRUGS) if (new RegExp(drug, 'i').test(o.label || '')) {
      const without = /^(no|without|off|not)\b/i.test(o.label);   // ("No terlipressin" names the drug it leaves out)
      if (drug === 'norepinephrine') bad.push(`${d.id}/${s.id}: button "${o.label}" names a drug the model does not have`);
      else if (!without && o.params?.drugs && o.params.drugs[drug] === false) bad.push(`${d.id}/${s.id}: button "${o.label}" turns ${drug} off`);
    }
  }
  assert.deepEqual(bad, []);
});

test('an EUS-PPG slide shows the EUS-PPG tile and prints its reading', async () => {
  const bad = [];
  for (const { d } of await decks()) for (const s of d.slides) if (s.procedure === 'eus') {
    if (s.tiles && !s.tiles.includes('eus')) bad.push(`${d.id}/${s.id}: tiles without the eus tile`);
    if (/\{ppg[:}@]/.test(s.line || '')) bad.push(`${d.id}/${s.id}: the line prints {ppg}, not {eus}`);
    if (s.tiles && !/\{eus[:}@]/.test(s.line || '')) bad.push(`${d.id}/${s.id}: tiles, but the line does not print {eus}`);
  }
  assert.deepEqual(bad, []);
});

// The slides that give blood on purpose: eight units are the overtransfusion lesson; three units are the liberal arm of the transfusion trial.
const MANY_UNITS = new Set(['hyperdynamic/over', 'landmark-trials/transfusion-arms']);
test('no slide gives more than two units of red cells outside the overtransfusion lessons (restrictive transfusion, Baveno VIII 5.4)', async () => {
  const bad = [];
  for (const { d } of await decks()) for (const s of d.slides) {
    const n = [s.action || []].flat().filter((a) => a?.kind === 'infuse' && a.fluid === 'prbc').length;
    if (n > 2 && !MANY_UNITS.has(`${d.id}/${s.id}`)) bad.push(`${d.id}/${s.id}: ${n} units`);
  }
  assert.deepEqual(bad, []);
});

test('no deck says a guideline file is missing, or that no guideline gives a recanalization rate', () => {
  const bad = [];
  for (const f of files) {
    const src = readFileSync(new URL(f, DIR), 'utf8');
    if (/not in the folder|not yet in the folder/i.test(src)) bad.push(`${f}: says a guideline file is missing`);
    if (/quotes? none|gives? no recanalization rate|quotes? a recanalization rate/i.test(src) && !/EASL 2025/.test(src)) bad.push(`${f}: no recanalization rate, without EASL 2025`);
  }
  assert.deepEqual(bad, []);
});

test('an LSM of 20 to 25 kPa with platelets <150,000/µL is never sent to screening endoscopy without naming AASLD', async () => {
  const bad = [];
  for (const { d, fps } of await decks()) d.slides.forEach((s, i) => {
    const f = fps[i];
    if (!(f.lsm >= 20 && f.lsm < 25 && f.plt < 150)) return;
    const all = [...words(s), s.notes || ''].join(' ');
    if (/needs? screening endoscopy|has screening endoscopy/i.test(all) && !/AASLD/.test(all)) bad.push(`${d.id}/${s.id}`);
  });
  assert.deepEqual(bad, []);
});

test('the teaching errors of the 15 Nov review stay fixed', async () => {
  const by = Object.fromEntries((await decks()).map((x) => [x.d.id, x]));
  const slide = (deck, id) => { const x = by[deck], i = x.d.slides.findIndex((s) => s.id === id); assert.ok(i >= 0, `${deck}/${id}`); return { s: x.d.slides[i], f: x.fps[i] }; };
  const text = (s) => JSON.stringify(s);
  // C1-1: the albumin deck gives the AASLD 2021 doses.
  const alb = text(by.albumin.d);
  for (const dose of ['6 to 8 g', '1.5 g/kg on day 1', '1 g/kg on day 3', '40 to 50 g']) assert.ok(alb.includes(dose), `albumin: ${dose}`);
  // C1-5: two years after hepatitis C cure the HVPG is lower, not normal (5 to 10 mmHg).
  const y2 = slide('cause-treated', 'year2').f;
  assert.ok(y2.hvpg > 5 && y2.hvpg < 10, `HVPG two years after cure ${y2.hvpg}`);
  // C2a-1: the TIPS heart slide shows the rise it names.
  const heart = slide('shunts', 'heart'), reasons = slide('shunts', 'reasons');
  assert.ok(heart.f.co > reasons.f.co && heart.f.ra > reasons.f.ra, 'TIPS heart: cardiac output and RA pressure higher than before the stent');
  // C2a-2: the PVT deck quotes the EASL 2025 rate.
  assert.match(text(by.prehepatic.d), /39%/);
  assert.match(text(by.prehepatic.d), /71%/);
  // C2a-3: the pregnant patient with CSPH meets the beta-blocker in her own words.
  const preg = slide('pregnancy', 'before');
  assert.ok(preg.f.hvpg >= 10 && /propranolol/.test(preg.s.line), 'pregnancy: CSPH and the beta-blocker are on the first slide');
  assert.doesNotMatch(preg.s.vignette, /last year/);
  // C2b-1: stiffness Case 3 gives both guidelines side by side.
  const a3 = slide('stiffness', 'a3').s;
  assert.deepEqual((a3.sides || []).map((x) => x.who), ['Baveno VIII', 'AASLD 2024']);
  // C2b-2: the antibiotic card shows the ascitic protein and names the AASLD 2021 prophylaxis criteria.
  const ab = slide('tipping', 'antibiotic-card');
  assert.ok(ab.s.tiles.includes('tp') && ab.f.tp < 1.5, 'tipping: the tp tile, under 1.5 g/dL');
  assert.match(text(ab.s), /AASLD 2021/);
});

// 9. Text that contradicts the data (wording audit, 16 Nov 2026: "if the app utters nonsense it's fucked"). A sentence that says a reading
// "falls to {x}", "lowers the portal pressure to {pv}" or "rises to {x}" claims the change the slide makes, so it is judged against the state
// just before that change: the slide before, for a slide that changes the same patient (no preset). (Not the tiles' `delta` slide: "a second
// unit raises the blood pressure to {map}" is the unit's effect, though the tiles count from before the bleed.) A slide that opens a new
// patient (a preset), or changes nothing, makes no change of its own and is not judged. The verb nearest the brace decides the direction
// ("the IAP falls and the APP rises to {rpp}" claims a rise).
const VERB = new RegExp(`\\b(?:${UP}|${DOWN})\\b`, 'g'), IS_UP = new RegExp(`^${UP}$`);
const lineClaims = (t) => [...t.matchAll(/\bto \{(\w+)(?::\d)?\}/g)].flatMap((m) => {
  const before = t.slice(Math.max(0, m.index - 70), m.index).split(/[.;{}]/).pop(), verbs = [...before.matchAll(VERB)];
  return verbs.length ? [{ k: m[1], up: IS_UP.test(verbs.at(-1)[0]), text: before.trim() + ' ' + m[0] }] : [];
});
test('a sentence "falls to {x}" or "raises ... to {x}" agrees with the state just before the change the slide makes', async () => {
  const bad = [];
  for (const { d, fps } of await decks()) {
    d.slides.forEach((s, i) => {
      if (i === 0 || s.preset || !changes(s)) return;
      for (const t of words(s)) for (const c of lineClaims(t)) {
        const a = fps[i - 1]?.[c.k], b = fps[i]?.[c.k];
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
        const tol = 0.005 * Math.max(Math.abs(a), Math.abs(b), 0.1);   // (half a percent: a change the tile can show, never rounding noise)
        if (c.up ? !(b - a > tol) : !(a - b > tol)) bad.push(`${d.id}/${s.id}: "${c.text.slice(-90)}" but ${c.k} is ${a.toFixed(2)} on ${d.slides[i - 1].id} and ${b.toFixed(2)} here`);
      }
    });
  }
  assert.deepEqual(bad, []);
});

test('the claim finder reads "falls to {x}" and "lowers the portal pressure to {pv}", and leaves "from {x@id} to {x}" to the test above', () => {
  assert.deepEqual(lineClaims('Carvedilol lowers portal pressure to {pv} and prevents bleeding.').map((c) => [c.k, c.up]), [['pv', false]]);
  assert.deepEqual(lineClaims('The HVPG rises to {hvpg}.').map((c) => [c.k, c.up]), [['hvpg', true]]);
  assert.deepEqual(lineClaims('The IAP falls and the APP rises to {rpp}.').map((c) => [c.k, c.up]), [['rpp', true]]);
  assert.deepEqual(lineClaims('Anticoagulation is started. The PPG is {ppg}.'), []);
  assert.deepEqual(lineClaims('The HVPG falls from {hvpg@a} to {hvpg}.'), []);
});

test('a summary-table row that names a drug has that drug on in the slide it shows', async () => {
  const bad = [];
  for (const { d } of await decks()) {
    const drugsAt = (idx) => { let on = {}; d.slides.slice(0, idx + 1).forEach((s) => { if (s.preset) on = {}; Object.assign(on, s.params?.drugs || {}); }); return on; };
    for (const s of d.slides) for (const r of Array.isArray(s.of) ? s.of : []) {
      const j = r?.id ? d.slides.findIndex((x) => x.id === r.id) : -1;
      if (j < 0) continue;
      const on = drugsAt(j), label = `${r.kicker || ''} ${r.title || ''}`;
      for (const drug of DRUGS.filter((x) => x !== 'albumin' && x !== 'norepinephrine')) if (new RegExp(drug, 'i').test(label) && !/\b(no|without|off|not)\b[^,]{0,12}$/i.test(label.slice(0, label.toLowerCase().indexOf(drug))) && !on[drug]) {
        bad.push(`${d.id}/${s.id}: row "${label.trim()}" names ${drug}, but slide "${r.id}" has it off (the drugs on there: ${Object.keys(on).filter((k) => on[k]).join(', ') || 'none'})`);
      }
    }
  }
  assert.deepEqual(bad, []);
});
