// Deck accuracy and feature use for the foundation and core decks (Circulation, Circuit, Two inflows, Circulation in cirrhosis, Sites, HVPG,
// Stiffness), docs/recommendations/deck-accuracy-and-feature-use.md, 8 Nov 2026: a case card agrees with its slide's numbers, the names the
// slides use are the tiles' own, and the controls and tiles the recommendations asked for are in place and read what the words say.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { abChoice } from '../src/ui/presenter.js';
import { SSM_CUTS } from '../src/engine/ssm-cuts.js';
import { deckStates, runSteps } from './deck-states.js';

const MINE = ['circulation', 'circuit', 'two-inflows', 'hyperdynamic', 'sites', 'hvpg', 'stiffness'];
const deck = (id) => DECKS.find((d) => d.id === id);
const slide = (d, id) => deck(d).slides.find((s) => s.id === id);
const pick = (f) => f.metrics ?? f;
const at = async (d) => Object.fromEntries((await deckStates(deck(d))).map((fp, i) => [deck(d).slides[i].id, pick(fp)]));

test('a case card in these decks quotes the platelets, the stiffness and the ascites its slide shows (section 14)', async () => {
  const bad = [];
  for (const id of MINE) {
    const states = await at(id);
    for (const s of deck(id).slides) {
      if (!s.vignette) continue;
      const f = states[s.id], v = s.vignette, where = `${id}/${s.id}`;
      const plt = /([\d,]+)\/µL/.exec(v);
      if (plt && Math.abs(+plt[1].replace(/,/g, '') / 1000 - f.plt) > 2.5) bad.push(`${where}: platelets ${plt[1]} against ${f.plt.toFixed(0)}k`);
      const kpa = /(\d+(?:\.\d+)?) kPa/.exec(v);
      if (kpa && s.id !== 'a4' && /stiffness/.test(v) && Math.abs(+kpa[1] - f.lsm) > 1) bad.push(`${where}: stiffness ${kpa[1]} against ${f.lsm.toFixed(1)}`);
      const none = /\b(no|never (?:\w+ or )?had|without) ascites\b/.test(v), some = /\bascites\b/.test(v) && !none;
      if (none && f.asc > 300) bad.push(`${where}: no ascites, the slide shows ${(f.asc / 1000).toFixed(1)} L`);
      if (some && f.asc < 150) bad.push(`${where}: ascites, the slide shows ${(f.asc / 1000).toFixed(1)} L`);
    }
  }
  assert.deepEqual(bad, []);
});

test('the cirr-decomp cases say the ascites is controlled on diuretics and why no beta-blocker (grade 1 is not a first decompensation)', () => {
  for (const [d, s] of [['two-inflows', 'cirr'], ['sites', 'sin'], ['hyperdynamic', 'full']]) {
    const v = slide(d, s).vignette;
    assert.match(v, /ascites controlled on/, `${d}/${s}`);
    assert.match(v, /could not (?:tolerate|take) a beta-blocker/, `${d}/${s}`);
    assert.ok(!/despite|57,000|98,000|88,000/.test(v), `${d}/${s}`);
  }
});

test('Two inflows names the tile: sinusoidal flow, never liver blood flow', () => {
  for (const s of deck('two-inflows').slides) for (const k of ['line', 'notes']) assert.ok(!/liver (?:blood )?flow/i.test(s[k] || ''), `${s.id}.${k}`);
});

test('Circuit: the meal plays on the bedside clock and leaves the slow organs where they were; the drug buttons show flow against resistance', async () => {
  for (const id of ['meal', 'both']) assert.equal(slide('circuit', id).lapse.clock, 'seconds', id);
  const st = await at('circuit');
  assert.ok(Math.abs(st.meal.spleen - st.where.spleen) < 0.05 && Math.abs(st.meal.plt - st.where.plt) < 1, 'a meal does not move the spleen or the platelets');
  assert.ok(st.both.asc < 300 && Math.abs(st.both.spleen - st.resist.spleen) < 0.05, 'nor the belly or the spleen of the cirrhotic liver');
  const r = slide('circuit', 'resist');
  assert.deepEqual(r.compare.map((o) => o.label), ['No drug', 'Propranolol', 'Carvedilol']);
  assert.deepEqual(r.compare.map((o, k) => abChoice(r.compare, k).kind), ['params', 'params', 'params']);
  const [own, prop, carv] = (await runSteps([{ preset: 'csph' }, { params: r.compare[1].params }, { params: r.compare[2].params }])).map(pick);
  assert.ok(prop.pvFlow < carv.pvFlow && prop.pvFlow < own.pvFlow - 0.1, 'propranolol cuts the flow most');
  assert.ok(carv.hvpg < prop.hvpg && prop.hvpg < own.hvpg, 'carvedilol lowers the HVPG further: it relaxes the resistance as well');
  const t = slide('circuit', 'tips');
  assert.deepEqual([t.tool.kind, t.tool.metric, t.whatIf.param], ['causes', 'ppg', 'tips.d']);
});

test('The circulation in cirrhosis: the large-varices row is not called decompensated, and the eight units show where the hemoglobin and the volume end', async () => {
  const h = deck('hyperdynamic');
  assert.ok(!/Decompensated/.test(slide('hyperdynamic', 'dilate').lapse.to), 'the time-lapse');
  assert.ok(!h.slides.find((s) => s.id === 'summary').of.some((o) => o.id === 'dilate' && /Decompensated/.test(o.title)), 'the summary row');
  const over = slide('hyperdynamic', 'over');
  assert.deepEqual(over.tiles, ['pv', 'hb', 'bv']);
  const st = await at('hyperdynamic');
  assert.ok(st.over.hb > 12 && st.over.bv > st.full.bv, `the eight units end at ${st.over.hb.toFixed(1)} g/dL and ${st.over.bv.toFixed(0)} mL`);
  assert.match(over.notes, /deliberately more than anyone would give/);
});

test('Sites: the three liver levels carry the scale switch, the caudate lobe is a pill on Budd–Chiari, the heart has its two buttons', () => {
  for (const id of ['presin', 'sin', 'postsin']) assert.ok(slide('sites', id).scales?.anatomy?.cam === 'liver', id);
  assert.match(slide('sites', 'post').line, /\[caudate lobe\]\(caudate\)/);
  const c = slide('sites', 'cardiac');
  assert.deepEqual(c.compare.map((o, k) => abChoice(c.compare, k).kind), ['state', 'state']);
  assert.doesNotMatch(slide('sites', 'pvt').vignette, /small/, 'the clot patient\'s varix sits at the cut-off of small: the case does not size it');
});

test('HVPG: 16 mmHg is named with its setting, in the notes (the line keeps the one idea, CSPH); the schistosomiasis case card sits where the patient first appears', () => {
  const h = slide('hvpg', 'hvpg');
  assert.doesNotMatch(h.line, /16 mmHg|MASLD/);
  assert.match(h.notes, /Before non-hepatic abdominal surgery, an HVPG of 16 mmHg or more/);
  assert.match(h.notes, /Baveno VIII Table 3/);
  assert.ok(slide('hvpg', 'presin').vignette && !slide('hvpg', 'eus').vignette);
  assert.match(slide('hvpg', 'route').vignette, /90,000\/µL/);
});

test('Stiffness: every case shows its spleen stiffness beside the HVPG, and the five readings fall where the words put them', async () => {
  const st = await at('stiffness');
  for (const id of ['a1', 'a2', 'a3', 'a4', 'a5']) assert.deepEqual(slide('stiffness', id).tiles, ['ssm', 'hvpg'], id);
  assert.ok(st.a1.ssm < SSM_CUTS.spareScope, `case 1 ${st.a1.ssm}`);
  assert.ok(st.a2.ssm > SSM_CUTS.ruleIn, `case 2 ${st.a2.ssm}`);
  assert.ok(st.a3.ssm > SSM_CUTS.spareScope && st.a3.ssm < SSM_CUTS.ruleIn, `case 3 ${st.a3.ssm}`);
  assert.ok(Math.abs(st.a4.ssm - SSM_CUTS.ruleIn) < 5, `case 4 sits close to the 55 kPa line (${st.a4.ssm})`);
  assert.ok(st.a5.ssm > SSM_CUTS.ruleIn && st.a5.lsm < 10, `case 5 ${st.a5.ssm} with a soft liver ${st.a5.lsm}`);
  assert.match(slide('stiffness', 'a4').ask[0], /≥25 kPa/);
});
