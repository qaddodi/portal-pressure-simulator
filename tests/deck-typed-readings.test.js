// A number typed into a slide's words that names the slide's own patient must be the number the slide shows (play-test B4, 16 Nov 2026):
// the Carvedilol deck asked about "78/56 (62)" and an LSM of 26 kPa over slides that read 75/55 (61) and 28.6. The deck-claims test holds the
// {pills}, which are read from the model; this one holds the few numbers that are typed, in the questions and the case's sentences:
//   1. A blood pressure typed as "S/D (M)" in a slide's words equals the slide's solved systolic, diastolic and mean.
//   2. "Her LSM ... is now 29 kPa" (a reading, then now / falls to / rises to / reaches, then a number): the slide's reading, to its precision.
//   3. The deck's quick-check questions that name the case's pressure after the bleed name the state they follow.
// A pill ({map}) is better than a typed number wherever the words are a line; asks, answers and checks are plain text, so the numbers are held here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import './dom-shim.js';
import { deckStates } from './deck-states.js';

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
const wordsOf = (s) => [s.title, s.line, s.caseQ, s.question, ...(Array.isArray(s.ask) ? s.ask : [s.ask]), ...(s.sides || []).map((x) => x.text)].filter((t) => typeof t === 'string');
const patient = (sen) => /\b(she|her|he|his|him)\b/i.test(sen) && !/^(A|An|Two|Three|Four) /.test(sen);

test('a blood pressure typed "S/D (M)" in a slide\'s words is the one the slide solves to', async () => {
  const bad = []; let n = 0;
  for (const { d, fps } of await decks()) d.slides.forEach((s, i) => {
    for (const t of wordsOf(s)) for (const m of t.matchAll(/\b(\d{2,3})\/(\d{2,3})\s*\((\d{2,3})\)/g)) {
      n++;
      const f = fps[i], [sbp, dbp, map] = [m[1], m[2], m[3]].map(Number);
      if (Math.abs(f.sbp - sbp) > 1 || Math.abs(f.dbp - dbp) > 1 || Math.abs(f.map - map) > 1) bad.push(`${d.id}/${s.id}: typed ${m[0]}, the slide solves to ${f.sbp.toFixed(0)}/${f.dbp.toFixed(0)} (${f.map.toFixed(0)})`);
    }
  });
  assert.ok(n >= 1, 'the rule found a blood pressure to hold');
  assert.deepEqual(bad, []);
});

test('"Her LSM ... is now N kPa": the reading a slide\'s words name for its patient is the slide\'s own', async () => {
  const bad = []; let n = 0;
  const re = /\b(LSM|SSM|HVPG|PPG|MAP)\b[^.{}<>≥≤]{0,40}?\b(?:now|falls to|rises to|reaches)\s+(?:an? |the )?(\d+(?:\.\d+)?)\s*(?:kPa|mmHg)/g;
  for (const { d, fps } of await decks()) d.slides.forEach((s, i) => {
    for (const t of wordsOf(s)) for (const sen of t.split(/(?<=[.;?])\s+/)) {
      if (!patient(sen)) continue;
      for (const m of sen.matchAll(re)) {
        n++;
        const k = m[1].toLowerCase(), v = fps[i][k], typed = Number(m[2]);
        if (Number.isFinite(v) && Math.abs(v - typed) > (k === 'lsm' || k === 'ssm' ? 1 : 0.6)) bad.push(`${d.id}/${s.id}: ${m[1]} typed ${typed}, the slide shows ${v.toFixed(1)}: "${sen.slice(0, 90)}"`);
      }
    }
  });
  assert.ok(n >= 1, 'the rule found a reading to hold');
  assert.deepEqual(bad, []);
});

test('the Carvedilol check that names her pressure after the bleed prints the hypotension slide\'s own (a token, not a typed number)', async () => {
  const { d } = (await decks()).find((x) => x.d.id === 'carvedilol');
  const q = d.checks.find(([t]) => /blood pressure is \{map@low\}/.test(t));
  assert.ok(q, 'the check prints {map@low}');
  assert.ok(d.slides.some((s) => s.id === 'low'), 'the slide it names exists');
  assert.ok(!d.checks.some(([t]) => /MAP is \d+ mmHg/.test(t)), 'no typed MAP left in the checks');
});

test('the fall the Variceal bleeding deck gives octreotide is the fall the model gives (play-test B11: "about 2 mmHg" over a model that gives 1.5)', async () => {
  const { Engine } = await import('../src/engine/engine.js');
  const { computeMetrics } = await import('../src/engine/metrics.js');
  const { deepMerge } = await import('../src/engine/scenario.js');
  const e = new Engine(); e.loadPreset('cirr-decomp'); e.settle();
  const a = computeMetrics(e);
  e.setParams(deepMerge(e.params, { drugs: { octreotide: true } })); e.settle();
  const b = computeMetrics(e), fall = a.pv - b.pv;
  assert.ok(fall > 1.1 && fall < 1.9, `at rest the portal vein pressure falls ${fall.toFixed(2)} mmHg`);
  const { d } = (await decks()).find((x) => x.d.id === 'variceal-bleed');
  const text = JSON.stringify(d.checks) + d.slides.map((s) => s.notes).join(' ');
  assert.ok(/falls by about 1\.5 mmHg/.test(text) && !/about 2 mmHg/.test(text), 'the deck says 1.5 mmHg, not 2');
});
