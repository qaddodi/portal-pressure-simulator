// No deck slide's instrument card comes in empty (Mohammad, 16 Nov 2026, Mac: Landmark trials, "Where a trial gave a ratio", the card showed
// only its title). The slide's tool gave the forest plot `highlight: []`, a list, and the plot read it as a Set (highlight.has): it threw in
// its draw and the card stayed blank, on that slide since it was written. Here every deck slide's drawn instrument is laid out from the slide's
// own tool, with its options as the card's configure passes them, and must draw something: the forest a row per trial, a trial card its arms,
// a criteria card its rows or its zones graph, a SAAG card a point, a tracing card its procedure, a flowchart its own algorithm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import './dom-shim.js';
import { forestLayout, ratiosOf } from '../src/ui/trial-forest.js';
import { trialLayout } from '../src/ui/tool-trial.js';
import { trialOf } from '../src/ui/trials.js';
import { criteriaRows, ZONES } from '../src/ui/tool-criteria.js';
import { scriptOf } from '../src/ui/tool-reading.js';
import { PATHS } from '../src/ui/path-data.js';
import { measure } from '../src/ui/glyph-measure.js';

const DIR = new URL('../src/ui/decks/', import.meta.url);
const decks = async () => {
  const out = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.js'))) {
    const d = Object.values(await import(new URL(f, DIR))).find((v) => Array.isArray(v?.slides));
    if (d) out.push(d);
  }
  return out;
};

const DRAWN = {
  forest(t) {
    const trials = (t.ids || []).map((id) => trialOf(id));
    if (trials.some((x) => !x)) return `names a trial trials.js does not have (${t.ids.filter((id) => !trialOf(id)).join(', ')})`;
    const L = forestLayout(trials, 340, 12, measure, { highlight: t.highlight, selected: t.selected, notes: t.notes });
    const rows = trials.filter((x) => ratiosOf(x).length).length;
    if (!rows) return 'no trial with a ratio';
    if (L.hits.length < trials.length || !(L.H > 0)) return `draws ${L.hits.length} of ${trials.length} rows`;
    if (t.highlight != null && !trials.some((x) => [...t.highlight].includes(x.id))) return 'every row drawn quiet (highlight names none of its trials; leave it out for all in full ink)';
    return null;
  },
  trial(t) {
    const x = trialOf(t.id);
    if (!x) return `no trial "${t.id}"`;
    const L = trialLayout(x, 340, 12, measure, null);
    return L.texts.filter((s) => s.look === 'trial.pct').length === x.arms.length && L.H > 0 ? null : 'an arm without its number';
  },
  criteria: (t) => (criteriaRows(t).length || (t.zones && ZONES[t.zones]) ? null : t.zones ? `no zones graph "${t.zones}"` : 'no rows and no zones graph'),
  saag: (t, s) => ((Array.isArray(s.of) && s.of.length) || t.extra?.length ? null : 'no patient and no extra point'),
  reading: (t, s) => (scriptOf(s.procedure ?? t.of) ? null : `no procedure (${s.procedure ?? t.of})`),
  path: (t) => (t.of == null || PATHS[t.of] ? null : `"${t.of}" is not an algorithm (the card would show the default one)`),
};

test('every deck slide\'s drawn instrument card draws something from the slide\'s own tool', async () => {
  const bad = [];
  let n = 0;
  for (const d of await decks()) {
    for (const s of d.slides) {
      const t = s.tool, judge = t && DRAWN[t.kind];
      if (!judge) continue;
      n++;
      let why;
      try { why = judge(t, s); } catch (e) { why = `throws: ${e.message}`; }
      if (why) bad.push(`${d.id}/${s.id} (${t.kind}): ${why}`);
    }
  }
  assert.ok(n > 90, `only ${n} slides checked`);
  assert.deepEqual(bad, []);
});

test('the forest plot takes its highlighted trials as a Set or a list, and every row is in full ink when none is named', () => {
  const trials = ['predesci', 'lvtips', 'transfusion', 'rifaximin'].map(trialOf);
  const ink = (L) => L.texts.filter((s) => s.look === 'forest.nm').length;
  assert.equal(ink(forestLayout(trials, 340, 12, measure, {})), 4);
  assert.equal(ink(forestLayout(trials, 340, 12, measure, { highlight: ['lvtips'] })), 1);
  assert.equal(ink(forestLayout(trials, 340, 12, measure, { highlight: new Set(['lvtips']) })), 1);
});
