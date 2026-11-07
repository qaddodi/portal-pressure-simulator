// The graph a procedure slide draws as its procedure changes the patient (event-graph.js; Mohammad, 7 Nov 2026: the PPG and the sinusoidal
// flow "changing in real time after the TIPS gets placed"). These checks keep each such slide's graph, its fixed scales and cut-offs, and
// that the model's own course after the stent lands inside the graph's seconds, below the target, on the numbers the tiles end on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { createCore } from '../src/worker-core.js';
import { Engine } from '../src/engine/engine.js';
import { computeMetrics } from '../src/engine/metrics.js';
import { fingerprintOf } from '../src/engine/fingerprint.js';
import { deepMerge } from '../src/engine/scenario.js';
import { PPG_CUTS } from '../src/engine/pressure-cuts.js';
await import('./dom-shim.js');   // (the chart draws on the GPU, svg-gl.js, which loads only with a page)
const { LINE } = await import('../src/ui/flow-time.js');
const { eventLines, eventGraphOf, eventScale, EVENT_S, PRE_S, EVENT_WORD } = await import('../src/ui/event-graph.js');
const { specOf } = await import('../src/ui/proc-anim.js');

const decks = (await Promise.all(readdirSync(new URL('../src/ui/decks/', import.meta.url)).map((f) => import(`../src/ui/decks/${f}`))))
  .flatMap((m) => Object.values(m)).filter((d) => d?.slides && d.id);
const unique = [...new Map(decks.map((d) => [d.id, d])).values()];
const kindOf = (s) => (typeof s.procedure === 'string' ? s.procedure : s.procedure?.kind) || null;
const procSlides = unique.flatMap((d) => d.slides.map((s, i) => ({ d, s, i })).filter(({ s }) => s.procedure));

test('TIPS and shunts 7/14 graphs the PPG and the sinusoidal flow, with the PPG goal after a TIPS', () => {
  const s = unique.find((d) => d.id === 'shunts').slides.find((x) => x.id === 'play');
  const g = eventGraphOf(s);
  assert.deepEqual(g.lines, ['ppg', 'liver'], 'its two tiles, the pressure in the lower band');
  assert.equal(g.word, 'Stent open');
  assert.equal(g.target, PPG_CUTS.red, 'the PPG goal is the red cut-off, 12 mmHg');
});

test('every slide whose procedure changes the patient and shows two readings carries the graph; a measurement does not', () => {
  for (const { d, s } of procSlides) {
    const name = `${d.id}/${s.id}`, kind = kindOf(s), lines = eventLines(s);
    if (!EVENT_WORD[kind]) { assert.equal(lines, null, `${name}: ${kind} has no live graph`); continue; }
    assert.ok(specOf(kind)?.apply, `${name}: ${kind} changes the model`);
    if (!lines) continue;
    assert.equal(lines.length, 2, `${name}: two lines`);
    for (const k of lines) assert.ok(LINE[k] && !LINE[k][5]?.given, `${name}: ${k} is a line the model gives`);
    assert.ok(LINE[lines[0]][1] === 'mmHg' || LINE[lines[1]][1] !== 'mmHg', `${name}: a pressure takes the lower place`);
  }
  assert.equal(eventLines({ procedure: 'eus', tiles: ['hvpg', 'ppg'] }), null, 'EUS-PPG measures, it changes nothing');
  assert.equal(eventLines({ procedure: 'tips', tiles: ['ppg', 'liver'], graph: false }), null, 'switched off');
  assert.deepEqual(eventLines({ procedure: 'tips', tiles: ['liver', 'ppg'] }), ['ppg', 'liver'], 'the pressure below');
  // (Every TIPS a slide plays: each graphs its PPG, and the reading its words are about.)
  const tips = Object.fromEntries(procSlides.filter(({ s }) => kindOf(s) === 'tips').map(({ d, s }) => [`${d.id}/${s.id}`, eventLines(s)]));
  assert.deepEqual(tips, { 'shunts/play': ['ppg', 'liver'], 'gastric-varices/tips': ['ppg', 'gv'], 'variceal-bleed/tips': ['ppg', 'varix'], 'ten-years/tips': ['ppg', 'liver'] });
});

test('the scales are fixed from where the lines start and end, from zero for a pressure, with the tiles’ own cut-offs', () => {
  const p = eventScale('ppg', [19.3, null], 12);
  assert.equal(p.min, 0); assert.equal(p.max, 25, 'the next 5 over the start, with room for its head');
  assert.deepEqual(p.zones, [{ a: 0, b: 12, rate: 'ok', target: true }], 'the goal: a green band below 12');
  const l = eventScale('liver', [60.9, 31]);
  assert.equal(l.min, 0); assert.equal(l.max, 100);
  assert.deepEqual(l.cuts, [{ v: 55, rate: 'hi' }, { v: 75, rate: 'mid' }], 'the sinusoidal flow tile’s 55% and 75%');
  assert.deepEqual(l.zones.map((z) => [z.a, z.b, z.rate]), [[0, 55, 'hi'], [55, 75, 'mid']], 'tinted on the worse side, as its bar');
  const up = eventScale('ppg', [14, 21.5]);
  assert.ok(up.max >= 21.5 * 1.12, 'a rise (BRTO) is held by the scale when the end is known');
  assert.deepEqual(up.cuts, [{ v: 12, rate: 'hi' }], 'a pressure keeps its red cut-off only');
  assert.equal(PRE_S > 0 && EVENT_S >= 15, true, 'seconds before the change, and enough after it for the fall');
});

test('after an 8 mm TIPS the model’s own course falls inside the graph’s seconds, below the target, where the settled state is', async () => {
  const deck = unique.find((d) => d.id === 'shunts'), idx = deck.slides.findIndex((s) => s.id === 'play');
  const MODEL = ['preset', 'presetDays', 'params', 'action', 'days'];
  const steps = deck.slides.slice(0, idx + 1).map((s) => (MODEL.some((k) => s[k]) ? { preset: s.preset, presetDays: s.presetDays, params: s.params, action: s.action, days: s.days, relax: s.relax, ramp: s.ramp, fine: !!s.lapse } : {}));
  const seq = [], core = createCore((m) => { if (m.type === 'seqStep') seq[m.i] = m; });
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', reqId: 1, steps });
  core.dispose();
  let j = idx; while (j > 0 && !seq[j]) j--;
  const fp = (e) => fingerprintOf(computeMetrics(e), { P: e.Pf || e.P, Q: e.Qf || e.Q, params: e.params });
  // (As the worker plays it: the change eased in, the beat on, no settling.)
  const e = new Engine(); e.restore(seq[j].snap); e.beat = true;
  const h = 0.004;
  for (let t = 0; t < 2; t += h) e.step(h);
  const b = fp(e);
  e.easeParams(deepMerge(structuredClone(e.params), { tips: { on: true, d: 8 } }));
  const at = [];
  for (let t = 0, next = 0; t <= EVENT_S + 1e-9; t += h) { e.step(h); if (t >= next) { at.push([t, fp(e)]); next += 1; } }
  const r = new Engine(); r.restore(seq[j].snap); r.setParams(deepMerge(structuredClone(r.params), { tips: { on: true, d: 8 } })); r.settle();
  const settled = fp(r), last = at.at(-1)[1];
  assert.ok(b.ppg > 15 && b.liver > 55, `she starts with a high gradient and the liver perfused (${b.ppg.toFixed(1)} mmHg, ${b.liver.toFixed(0)}%)`);
  assert.ok(at[1][1].ppg > PPG_CUTS.red, 'the fall takes seconds: a second after the stent it is still above the target');
  assert.ok(last.ppg < PPG_CUTS.red, `by ${EVENT_S} s it is below the target (${last.ppg.toFixed(1)} mmHg)`);
  assert.ok(Math.abs(last.ppg - settled.ppg) < 1.5, `and where the settled state is (${last.ppg.toFixed(1)} against ${settled.ppg.toFixed(1)})`);
  assert.ok(last.liver < 55 && Math.abs(last.liver - settled.liver) < 4, `the sinusoidal flow falls into the red with it (${last.liver.toFixed(0)}%)`);
  const ps = eventScale('ppg', [b.ppg, null], PPG_CUTS.red), ls = eventScale('liver', [b.liver, null]);
  for (const [, f] of at) {
    assert.ok(f.ppg >= ps.min && f.ppg <= ps.max, 'every PPG reading inside its fixed scale');
    assert.ok(f.liver >= ls.min && f.liver <= ls.max, 'every flow reading inside its fixed scale');
  }
});
