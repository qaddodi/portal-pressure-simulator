// The Carvedilol deck's ascites chart began at the untreated sizes (varix 5.0 mm, ascites 0.3 L) and fell to 3.1 mm and nothing in its first
// weeks, then climbed: carvedilol's slow effect on the varix and the ascites ran inside the four years, a fall that is no part of them
// (Mohammad, 16 Nov 2026, slide 7). The slide that starts the drug now lives 240 days on it (`relax`) before anything is read, so the
// chart opens at the settled state and only climbs. Slow organs of any time-lapse that follows a drug step must be settled the same way.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { createCore } from '../src/worker-core.js';
import { trailKeys } from '../src/ui/flow-time.js';

const deck = DECKS.find((d) => d.id === 'carvedilol');
const MODEL = ['preset', 'presetDays', 'params', 'action', 'days'];

async function trails(upTo) {
  const slides = deck.slides.slice(0, deck.slides.findIndex((s) => s.id === upTo) + 1);
  const steps = slides.map((s) => (MODEL.some((k) => s[k]) ? { preset: s.preset, presetDays: s.presetDays, params: s.params, action: s.action, days: s.days, relax: s.relax, ramp: s.ramp, fine: !!s.lapse, trail: s.tool?.kind === 'flowtime' ? trailKeys(s.tool) : false } : {}));
  const out = [];
  const core = createCore((m) => { if (m.type === 'seqStep') out[m.i] = m.trail; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps, reqId: 1 });
  core.dispose();
  return out[slides.length - 1];
}

test('the ascites chart opens at the state carvedilol has settled to, and the ascites and the varix only climb', async () => {
  const slide = deck.slides.find((s) => s.id === 'ascites');
  assert.deepEqual(slide.tool.lines, ['asc', 'varix']);
  const t = await trails('ascites');
  const asc = t.map((r) => r[1]), varix = t.map((r) => r[2]);
  assert.ok(asc[0] < 20, `ascites opens at ${asc[0]} mL, not at a residue the drug has yet to clear`);
  assert.ok(asc[asc.length - 1] > 1000, 'and ends at about a litre and a half');
  for (let i = 1; i < asc.length; i++) assert.ok(asc[i] >= asc[i - 1] - 1, `ascites falls on day ${i}: ${asc[i - 1]} to ${asc[i]}`);
  // The varix may not run under its first day's size by more than a tenth of a millimetre (it was 1.5 mm under, then climbed).
  assert.ok(Math.min(...varix) >= varix[0] - 0.1, `the varix falls from ${varix[0]} to ${Math.min(...varix)} mm`);
  assert.ok(varix[varix.length - 1] > varix[0] + 1.5, 'and rises over the four years');
});

test('the ascites slide counts its time the way its chip does, and says that the ascites came despite carvedilol', () => {
  const s = deck.slides.find((x) => x.id === 'ascites');
  assert.equal(s.lapse.to, 'Six years on');
  assert.doesNotMatch(s.line, /Four years later/);
  assert.match(s.line, /^Six years in, four on carvedilol/);
  assert.match(s.title, /despite carvedilol/);
  assert.doesNotMatch(s.title, /carvedilol continues/i);
});

test('no title in the Carvedilol deck makes the drug the subject of restarts, continues, starts or stops', () => {
  for (const s of deck.slides) assert.doesNotMatch(s.title || '', /\bcarvedilol (?:may )?(?:restarts?|continues?|starts?|stops?)\b/i, s.id);
});
