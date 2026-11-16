// The numbers a slide's speaker notes quote from the model (16 Nov 2026 sweep: the notes of recompensation, hyperdynamic, kidney, ten-years and next-bleed
// carried readings from older model runs, 0.1 to 11 off the tiles beside them).
//   1. PINS: each model reading the notes quote is computed here from the deck's states and must appear in its notes as typed.
//   2. A number with a unit in a note that lies within a rounding step of a model reading of the same quantity on some slide of its deck, but is not
//      that reading, is a stale copy. Guideline cut-offs, literature figures and teaching ranges are listed in KNOWN with why.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import './dom-shim.js';
import { deckStates, runSteps } from './deck-states.js';
import { curveSteps } from '../src/ui/tool-curve.js';

const DIR = new URL('../src/ui/decks/', import.meta.url);
const decks = new Map();
for (const f of readdirSync(DIR).filter((x) => x.endsWith('.js'))) {
  const d = Object.values(await import(new URL(f, DIR))).find((v) => Array.isArray(v?.slides));
  if (d) decks.set(d.id, { d, fps: await deckStates(d) });
}
const at = (deck, id) => decks.get(deck).fps[decks.get(deck).d.slides.findIndex((s) => s.id === id)];
const notes = (deck, id) => decks.get(deck).d.slides.find((s) => s.id === id).notes;
const f1 = (v) => v.toFixed(1);

test('the notes of recompensation quote the states the dots are', () => {
  const a = at('recompensation', 'ascites'), c = at('recompensation', 'csph'), r = at('recompensation', 'recomp');
  const n = notes('recompensation', 'relation');
  for (const w of [`HVPG of ${f1(a.hvpg)} mmHg`, `LSM of ${f1(a.lsm)} kPa`, `platelets of ${Math.round(a.plt)},000/µL`, `to ${f1(r.hvpg)} mmHg`, `began at ${f1(c.hvpg)} mmHg`, `he is at ${f1(r.hvpg)} mmHg off diuretics`]) assert.ok(n.includes(w), `relation notes: ${w}`);
  const s = at('recompensation', 'path-stopcarv'), p = notes('recompensation', 'path-stopcarv');
  for (const w of [`HVPG of ${f1(s.hvpg)} mmHg`, `LSM of ${f1(s.lsm)} kPa`, `SSM of about ${Math.round(s.ssm)} kPa`]) assert.ok(p.includes(w), `path-stopcarv notes: ${w}`);
});

test('the hyperdynamic notes give the ends of the cirrhosis curve', async () => {
  const [lo, hi] = await runSteps([0.3, 1].map((c) => ({ preset: 'healthy', params: { cirrhosis: c }, days: 365 })));
  const n = notes('hyperdynamic', 'relation');
  for (const w of [`from about ${f1(lo.co)} to ${f1(hi.co)} L/min`, `from about ${Math.round(lo.map)} to ${Math.round(hi.map)} mmHg`, `from about ${Math.round(lo.hr)} to ${Math.round(hi.hr)}/min`]) assert.ok(n.includes(w), w);
});

test('the doppler relation notes read the curve: 24 cm/s at the ring\'s HVPG, and the velocity below 15 cm/s from about 15.5 mmHg', () => {
  const r = at('doppler', 'relation'), n = notes('doppler', 'relation');
  assert.ok(Math.round(r.pvVel) === 24 && n.includes(`still ${Math.round(r.pvVel)} cm/s at ${f1(r.hvpg)} mmHg`), 'the ring');
});

test('the kidney and ten-years notes give the slide\'s own readings', () => {
  const k = at('kidney', 'path-carv'), n = notes('kidney', 'path-carv');
  assert.ok(n.includes(`about ${Math.round(k.sbp)}/${Math.round(k.dbp)} mmHg with a MAP of ${Math.round(k.map)} mmHg`), 'kidney path-carv blood pressure');
  const d0 = at('ten-years', 'd0'), d1 = at('ten-years', 'd365'), b = at('ten-years', 'bleed');
  assert.ok(notes('ten-years', 'd365').includes(`risen by about ${f1(d1.hvpg - d0.hvpg)} mmHg, to ${f1(d1.hvpg)} mmHg`), 'ten-years d365 rise');
  assert.ok(notes('ten-years', 'bleed').includes(`about ${Math.round(b.hvpg)} mmHg, is under`), 'ten-years bleed HVPG');
});

const FAM = { mmHg: ['hvpg', 'ppg', 'pv', 'whvp', 'fhvp', 'ra', 'ivc', 'eus', 'sin', 'lpv', 'lhv'], kPa: ['lsm', 'ssm'], 'L/min': ['pvFlow', 'co'], 'cm/s': ['pvVel'], mm: ['varix'] };
// Numbers that are no copy of a reading: a guideline's cut-off, a published figure or a teaching range ("deck/slide: N unit").
const KNOWN = {
  'circulation/inflow: 1.2 L/min': 'the range "about 1 to 1.2 L/min" of normal portal flow',
  'doppler/probe: 15 cm/s': 'the velocity cut-off', 'doppler/normal: 15 cm/s': 'the velocity cut-off', 'doppler/relation: 15 cm/s': 'the velocity cut-off',
  'doppler/relation: 15.5 mmHg': 'a point on the relation curve, not the ring',
  'gastric-varices/tips: 12 mmHg': 'the PPG target after TIPS', 'hvpg/hvpg: 10 mmHg': 'the CSPH cut-off', 'hvpg/plane: 10 mmHg': 'the CSPH cut-off', 'hvpg/summary: 10 mmHg': 'the CSPH cut-off',
  'stiffness/ssm: 50 kPa': 'an older SSM cut-off (>50 kPa)', 'hyperdynamic/relation: 6.7 L/min': 'the curve\'s end, pinned above', 'ten-years/d365: 4.4 mmHg': 'a difference of two readings, pinned above',
  'variceal-bleed/oct: 1.5 mmHg': 'the fall at rest, quoted against the bleed state',
};
test('no note quotes a number within a rounding step of a reading of its deck without being that reading', async () => {
  const bad = [];
  for (const { d, fps: states } of decks.values()) for (const [si, s] of d.slides.entries()) {
    if (typeof s.notes !== 'string') continue;
    // (The readings are the deck's states and, on a curve slide that draws its own patient, every point of the curve.)
    const fps = s.tool?.kind === 'curve' && s.tool.patient ? [...states, ...(await runSteps(curveSteps(s.tool)))] : states;
    for (const m of s.notes.matchAll(/(?<![\d.])(\d+(?:\.\d+)?)\s?(mmHg|kPa|L\/min|cm\/s|mm)\b/g)) {
      const dp = (m[1].split('.')[1] || '').length, n = +m[1];
      let exact = false, near = null;
      for (const [j, fp] of fps.entries()) for (const k of FAM[m[2]]) {
        const v = fp[k]; if (!Number.isFinite(v)) continue;
        if (+v.toFixed(dp) === n) exact = true; else if (Math.abs(v - n) <= (dp ? 0.35 : 0.6)) near ||= `${k} ${v.toFixed(2)} on ${d.slides[j]?.id ?? 'the curve'}`;
      }
      const key = `${d.id}/${s.id}: ${m[0]}`;
      if (!exact && near && !(key in KNOWN)) bad.push(`${key} is near ${near}`);
    }
  }
  assert.deepEqual(bad, []);
});
