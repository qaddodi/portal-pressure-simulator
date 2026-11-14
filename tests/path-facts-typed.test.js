// A guideline path card decides on two kinds of input: readings the model computes (LSM, platelets, blood pressure, HVPG) and facts of the
// case the model cannot know (HRS-AKI, Child–Pugh class, BMI, ANTICIPATE, fitness for TIPS). Each algorithm fills a fact the slide leaves out
// with a default, so a slide that forgets one would put a clinical fact on screen that no one wrote (external review, 14 Nov 2026: "the model
// has no kidneys, so the algorithm takes HRS-AKI as absent"). Every path slide therefore types every fact its patient is judged on, unless
// the model supplies that reading on the slide, or the algorithm fixes the value itself whatever the slide says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import './dom-shim.js';
import { patientFor } from '../src/ui/path-data.js';
import { deckStates } from './deck-states.js';

const DIR = new URL('../src/ui/decks/', import.meta.url);
const PROBES = [true, false, 0, 1, 99, 'none', 'low', 'high', '__typed__'];

test('every guideline path slide states the case facts its algorithm decides on', async () => {
  const bad = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.js'))) {
    const d = Object.values(await import(new URL(f, DIR))).find((v) => Array.isArray(v?.slides));
    if (!d.slides.some((s) => s.tool?.kind === 'path')) continue;
    const fps = await deckStates(d);
    d.slides.forEach((s, i) => {
      const t = s.tool;
      if (t?.kind !== 'path') return;
      const typed = t.patient || {}, fp = fps[i], p = patientFor(t, fp);
      for (const k of Object.keys(p)) {
        if (k in typed || Number.isFinite(fp?.[k])) continue;
        // (A value the algorithm sets whatever the slide types, such as the gastric chart's source, is not a fact of the case.)
        const fixed = PROBES.every((v) => JSON.stringify(patientFor({ ...t, patient: { ...typed, [k]: v } }, fp)[k]) === JSON.stringify(p[k]));
        if (!fixed) bad.push(`${d.id}/${s.id} (${t.of}): ${k} defaults to ${JSON.stringify(p[k])}`);
      }
    });
  }
  assert.deepEqual(bad, []);
});
