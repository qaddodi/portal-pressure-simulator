// A trial card on a slide judges its entry rules on the patient as the trial enrolled him (LT-2, landmark deck review, 16 Nov 2026):
// the state of the tool's `at` slide, else of the slide its change counts from (the presenter's ctxOf `enrolled`), never the state after
// the slide's own treatment. Judged after it, every replay slide said "Does not fit": PREDESCI on carvedilol read "HVPG ≥10 mmHg (this
// patient: 8.7)", every TIPS trial "no TIPS in place", covered TIPS "ascites (this patient: no ascites)". Here every deck's every trial
// slide is computed as the presenter computes it, and its card's fit at the enrolled state must never be "Does not fit".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import './dom-shim.js';
import { createCore } from '../src/worker-core.js';
import { changes } from './deck-states.js';
import { fitOf, fitWords } from '../src/ui/tool-trial.js';
import { trialOf } from '../src/ui/trials.js';

const DIR = new URL('../src/ui/decks/', import.meta.url);

// Each slide's { fp, params }, as deck-states.js walks a deck (the worker's 'sequence'), keeping the params it leaves out.
async function states(d) {
  const steps = d.slides.map((s) => (changes(s) ? { preset: s.preset, presetDays: s.presetDays, params: s.params, action: s.action, days: s.days, relax: s.relax, ramp: s.ramp, fine: !!s.lapse } : {}));
  const out = [];
  const core = createCore((m) => { if (m.type === 'seqStep') out[m.i] = { fp: m.fp, params: m.params }; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps, reqId: 1 });
  core.dispose();
  let last = out[0];
  return d.slides.map((s, i) => (last = changes(s) || i === 0 ? out[i] : last));
}
// (The presenter's rule: tool.at, else the slide's delta; a slide that changes the same patient counts from the slide before.)
const deltaOf = (s, i) => s.delta ?? (i > 0 && !s.preset && changes(s) ? true : null);
// The one card that says "Does not fit" on purpose: the slide teaches that his HVPG, read before the stent, was under the trial's line.
const NOT_THIS = { 'landmark-trials/monescillo': 'HVPG ≥20 mmHg' };
function enrolledAt(d, s, i) {
  const at = s.tool.at ?? deltaOf(s, i);
  return at === true ? i - 1 : typeof at === 'string' ? d.slides.findIndex((x) => x.id === at) : i;
}

test('no trial card on any deck slide says "Does not fit" of the patient it enrolled', async () => {
  const bad = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.js'))) {
    const d = Object.values(await import(new URL(f, DIR))).find((v) => Array.isArray(v?.slides));
    if (!d?.slides.some((s) => s.tool?.kind === 'trial')) continue;
    const st = await states(d);
    d.slides.forEach((s, i) => {
      if (s.tool?.kind !== 'trial') return;
      const j = enrolledAt(d, s, i);
      assert.ok(j >= 0, `${d.id}/${s.id}: tool.at or delta names no slide of the deck`);
      const fit = fitOf(trialOf(s.tool.id), st[j], s.tool.facts ?? null);
      const why = NOT_THIS[`${d.id}/${s.id}`];
      if (why) { assert.equal(fit?.verdict, 'no', `${d.id}/${s.id} should still not fit on ${why}`); assert.ok(fitWords(fit).includes(why)); return; }
      if (fit?.verdict === 'no') bad.push(`${d.id}/${s.id} (${s.tool.id}, enrolled at ${d.slides[j].id}): ${fitWords(fit)}`);
    });
  }
  assert.deepEqual(bad, []);
});
