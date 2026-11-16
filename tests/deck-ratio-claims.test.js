// A deck sentence that says one number is "twice", "three times" or "half" of another is a claim about the model, so it is computed
// from the model here (the two-inflows summary said the fall in hepatic blood flow without the arterial buffer "doubles", where the
// slide's own numbers, 96% to 77% with it and to 43% without, are a fall of 20 points against 54: nearly three times).
//   1. Every ratio word in a deck's text (any field, slides and deck level) is either bound to a check below that computes the ratio
//      from the model, or listed in OPEN with the reason it is no model claim. A new "doubles" that is neither fails here.
//   2. No entry of either list is stale (its sentence no longer exists).
//   3. The numbers typed beside a ratio ("about 43%") are the model's, rounded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import './dom-shim.js';
import { deckStates, runSteps } from './deck-states.js';
import { EDGES } from '../src/engine/topology.js';

const DIR = new URL('../src/ui/decks/', import.meta.url);
const RATIO = /\b(doubles|doubled|doubling|twice as (?:large|much|many|high|low|fast|slow|great)|two-?fold|three times|threefold|triples?|tripled|halves|halved|half as|\d+(?:\.\d+)? times (?:as|higher|lower|more|less|faster|slower|the)|\d+-fold|several-fold|several times|many times)\b/gi;

const decks = new Map();
for (const f of readdirSync(DIR).filter((x) => x.endsWith('.js'))) {
  const d = Object.values(await import(new URL(f, DIR))).find((v) => Array.isArray(v?.slides));
  if (d) decks.set(d.id, d);
}
const found = new Map();   // 'deck/slide:phrase' -> the texts that carry it
function scan(v, key) {
  if (typeof v === 'string') for (const m of v.matchAll(RATIO)) { const k = `${key}:${m[0].toLowerCase()}`; found.set(k, [...(found.get(k) || []), v]); }
  else if (Array.isArray(v)) v.forEach((x) => scan(x, key));
  else if (v && typeof v === 'object') for (const x of Object.values(v)) scan(x, key);
}
for (const d of decks.values()) {
  d.slides.forEach((s) => scan(s, `${d.id}/${s.id}`));
  scan({ checks: d.checks, summary: d.summary, objectives: d.objectives }, `${d.id}/(deck)`);
}

const states = {};
const fp = async (deckId, slideId) => {
  const d = decks.get(deckId);
  states[deckId] ||= await deckStates(d);
  return states[deckId][d.slides.findIndex((s) => s.id === slideId)];
};
const edgeQ = (f, id) => f.at.Q[EDGES.findIndex((e) => e.id === id)];
const between = (v, lo, hi, what) => assert.ok(v >= lo && v <= hi, `${what}: ${v.toFixed(2)} is outside ${lo} to ${hi}`);
const pct = (v) => `${Math.round(v)}%`;
const text = (deckId, slideId, field) => decks.get(deckId).slides.find((s) => s.id === slideId)[field];

// What the buffer switched off does to the clot slide's patient, and to a normal liver with the vein closed (the relation chart's last point).
const buffer = async () => {
  const [healthy, on, off, curveOn, curveOff] = await runSteps([
    { preset: 'healthy' }, { preset: 'pvt-acute' }, { preset: 'pvt-acute', params: { habrStrength: 0 } },
    { preset: 'healthy', params: { thrombus: { PV_TRUNK: 1 } } }, { preset: 'healthy', params: { thrombus: { PV_TRUNK: 1 }, habrStrength: 0 } },
  ]);
  return { healthy, on, off, curveOn, curveOff };
};

// Each entry computes the claim from the model and throws when the words disagree with it.
const BOUND = {
  'two-inflows/relation:three times': async () => {
    const b = await buffer();
    const ratio = (b.healthy.liver - b.off.liver) / (b.healthy.liver - b.on.liver);
    between(ratio, 2.5, 3.2, 'two-inflows relation: the fall without the buffer over the fall with it');
    const notes = text('two-inflows', 'relation', 'notes');
    for (const v of [b.on.liver, b.off.liver, b.curveOn.liver, b.curveOff.liver]) assert.ok(notes.includes(pct(v)), `the relation notes give ${pct(v)}`);
    assert.ok(notes.includes(`a fall of ${Math.round(b.healthy.liver - b.on.liver)} points against ${Math.round(b.healthy.liver - b.off.liver)}`), 'the relation notes give the two falls in points');
    assert.ok(text('two-inflows', 'relation', 'line').includes(`about ${pct(b.off.liver)}`), 'the relation line gives the liver flow without the buffer');
    assert.ok(b.off.liver < 50, 'without the buffer the liver flow is below half of normal');
    assert.ok(text('two-inflows', 'relation', 'title').includes('below half of normal'));
    const sw = (f) => text('two-inflows', 'switch', f);
    assert.ok(sw('line').includes(`about ${pct(b.off.liver)}`) && sw('notes').includes(`about ${pct(b.off.liver)}`), 'the switch slide gives the same number');
  },
  'two-inflows/clot:doubles': async () => {
    const b = await buffer();
    between(edgeQ(b.on, 'A_HEP') / edgeQ(b.healthy, 'A_HEP'), 1.7, 2.6, 'two-inflows clot: hepatic artery flow after the occlusion over normal');
  },
  'circuit/tips:halves': async () => between((await fp('circuit', 'tips')).ppg / (await fp('circuit', 'parallel')).ppg, 0.4, 0.6, 'circuit tips: the PPG after the stent over before'),
  'treatment/vs:halves': async () => between((await fp('treatment', 'vs')).liver / (await fp('treatment', 'target')).liver, 0.4, 0.6, 'treatment vs: the liver flow after TIPS over before'),
  'circulation/flowres:three times': async () => {
    const r = async (id) => { const f = await fp('circulation', id); return f.ppg / f.pvFlow; };
    between((await r('define')) / (await r('inflow')), 2.5, 3.5, 'circulation flowres: the resistance of the patient over the healthy liver');
    const a = await fp('circulation', 'define'), h = await fp('circulation', 'inflow');
    between(a.pvFlow / h.pvFlow, 0.9, 1.2, 'circulation flowres: "about the same flow"');
  },
  'circuit/relation:three times': async () => {   // (the slopes of the relation chart: PPG against portal flow as the gut arterioles dilate)
    const slope = async (base, params) => {
      const [lo, hi] = await runSteps([{ ...base, params: { ...params, splanchnicTone: 0.6 } }, { ...base, params: { ...params, splanchnicTone: 1.6 } }]);
      return (hi.ppg - lo.ppg) / (hi.pvFlow - lo.pvFlow);
    };
    between((await slope({ preset: 'csph' }, {})) / (await slope({ preset: 'csph' }, { cirrhosis: 0 })), 2.4, 3.6, 'circuit relation: the cirrhotic slope over the healthy one');
  },
};

// Ratio words that are no claim about the model, with why.
const OPEN = {
  'ascites/lymph:several times': 'qualitative (no number); the lymph tiles show the figure',
  'ascites/lymph:many times': 'qualitative',
  'ascites/overrun:many times': 'qualitative',
  'budd-chiari/agent:triple': 'double- or triple-positive antiphospholipid antibodies',
  'circuit/resist:several-fold': 'qualitative',
  'stiffness/aasld:3 times the': 'ALT above 3 times the upper limit of normal (a guideline caution)',
  'two-inflows/summary:doubled': 'a case fact in the question (the velocity the asker saw), not a model value',
};

test('every ratio word in a deck is bound to the model or listed as no model claim', () => {
  const unbound = [...found.keys()].filter((k) => !(k in BOUND) && !(k in OPEN));
  assert.deepEqual(unbound, [], 'bind each one in tests/deck-ratio-claims.test.js (BOUND: compute it from the model) or list it in OPEN with the reason');
});

test('no entry of the ratio-claim lists is stale', () => {
  const stale = [...Object.keys(BOUND), ...Object.keys(OPEN)].filter((k) => !found.has(k));
  assert.deepEqual(stale, []);
});

for (const [k, check] of Object.entries(BOUND)) test(`the ratio in ${k} agrees with the model`, async () => { await check(); });

test('the two-inflows relation slide no longer says the fall "doubles"', () => {
  const r = decks.get('two-inflows').slides.find((s) => s.id === 'relation');
  assert.ok(!/doubl|twice/i.test(`${r.title} ${r.line} ${r.notes}`));
});
