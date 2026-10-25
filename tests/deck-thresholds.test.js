// A slide's words never contradict its own numbers: where a line puts a live HVPG or PPG next to a threshold
// (CSPH at 10, bleeding at 12, the TIPS target of a PPG under 12), the patient the slide shows must sit on that side.
// Each deck is computed as the presenter computes it (the worker's 'sequence'); a time-lapse's words read its end state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { deckStates } from './deck-states.js';

const DIR = new URL('../src/ui/decks/', import.meta.url);
// Slides whose claim is in a neighbouring sentence, checked by hand.
const KNOWN = {
  'outflow/soswedge': (f) => f.hvpg > 10,
  'one-year/cath': (f) => f.hvpg < 10,
  'one-year/d365': (f) => f.hvpg >= 12,
  'varices/burst': (f) => f.hvpg >= 12,
  'hvpg/hvpg': (f) => f.hvpg >= 10,
  'recompensation/csph': (f) => f.hvpg >= 10,
};

// Any sentence with a live {hvpg} or {ppg} and a threshold word: below/under means under the number, past/above/
// "or more"/CSPH means at or over it (CSPH alone means 10).
function claims(line) {
  const out = [];
  for (const sen of (line || '').split(/(?<=\.)\s+/)) {
    const key = /\{(hvpg|ppg)\}/.exec(sen)?.[1];
    if (!key) continue;
    const n = Number(/\b(5|6|10|12)\b(?! (?:kPa|mm\b|g\/dL))/.exec(sen.replace(/\{[^}]+\}/g, ''))?.[1]) || (/CSPH|clinically significant/i.test(sen) ? 10 : 0);
    if (!n) continue;
    if (/\b(below|under|still below)\b/i.test(sen)) out.push([key, '<', n, sen]);
    else if (/\b(past|above|or more|reaches|CSPH|clinically significant)\b/i.test(sen)) out.push([key, '>=', n, sen]);
  }
  return out;
}

test('threshold claims in slide lines match the model state each slide shows', async () => {
  const bad = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.js'))) {
    const d = Object.values(await import(new URL(f, DIR))).find((v) => Array.isArray(v?.slides));
    const fps = await deckStates(d);
    d.slides.forEach((s, i) => {
      const fp = fps[i], id = `${d.id}/${s.id}`;
      // Every slide's HVPG and PPG is the difference of the readings as shown (one decimal), so a scale card, a callout
      // and the monitor agree: WHVP 16.4 − FHVP 4.8 is 11.6 everywhere.
      const r1 = (v) => Math.round(v * 10) / 10;
      for (const [g, hi, lo] of [['hvpg', 'whvp', 'fhvp'], ['ppg', 'pv', 'ivc']]) if (Number.isFinite(fp[hi]) && Number.isFinite(fp[lo]) && r1(fp[g]) !== r1(r1(fp[hi]) - r1(fp[lo])))
        bad.push(`${id}: ${g} ${fp[g]} is not ${r1(fp[hi])} − ${r1(fp[lo])}`);
      if (KNOWN[id] && !KNOWN[id](fp)) bad.push(`${id}: HVPG ${fp.hvpg.toFixed(1)}, PPG ${fp.ppg.toFixed(1)}`);
      for (const [k, op, n, sen] of claims(s.line)) if (op === '<' ? !(fp[k] < n) : !(fp[k] >= n)) bad.push(`${id}: ${k} ${fp[k].toFixed(1)} vs "${sen}"`);
    });
    for (const id of Object.keys(KNOWN)) if (id.startsWith(d.id + '/')) assert.ok(d.slides.some((s) => `${d.id}/${s.id}` === id), `${id} is gone`);
  }
  assert.deepEqual(bad, []);
});
