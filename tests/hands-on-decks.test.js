// Deck review 22 Oct, H1 to H9 (Mohammad's pick "2. J"): decks that had no slider and no compare button get one, on the
// slide where the learner most wants to push. The slides' own states are unchanged; each control moves only the live model,
// and each shows what its slide teaches.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { abChoice } from '../src/ui/presenter.js';
import { readFileSync } from 'node:fs';
import { runSteps, deckStates } from './deck-states.js';

const slide = (deck, id) => DECKS.find((d) => d.id === deck).slides.find((s) => s.id === id);
const patchOf = (w, x) => {
  const out = {};
  for (const p of [].concat(w.param)) { const ks = p.split('.'); let o = out; ks.slice(0, -1).forEach((k) => (o = o[k] ||= {})); o[ks.at(-1)] = x; }
  return out;
};
const pick = (f) => f.metrics ?? f;
const HVPG_AT = DECKS.find((d) => d.id === 'hvpg').slides.findIndex((s) => s.id === 'hvpg');

test('Pre-hepatic: the clot slider on the Doppler slide moves the PPG while the HVPG stays normal', async () => {
  const w = slide('prehepatic', 'clot').whatIf;
  assert.equal(w.param, 'thrombus.PV_TRUNK');
  assert.equal(w.max, 1, 'the slide\'s occlusive clot is the slider\'s end');
  const [clot, none] = (await runSteps([{ preset: 'pvt-acute' }, { params: patchOf(w, w.min) }])).map(pick);
  assert.ok(clot.ppg - none.ppg > 8, `PPG falls without the clot (${clot.ppg} → ${none.ppg})`);
  assert.ok(clot.hvpg < 5 && none.hvpg < 5, `HVPG stays normal (${clot.hvpg}, ${none.hvpg})`);
});

test('Stiffness: the scarring slider moves the FibroScan reading across the Baveno VIII bands', async () => {
  const s = slide('stiffness', 'fibrosis'), w = s.whatIf;
  assert.equal(s.tool.kind, 'fibroscan');
  assert.equal(w.param, 'cirrhosis');
  const [own, lo, hi] = (await runSteps([{ preset: 'cirr-comp' }, { params: patchOf(w, w.min) }, { params: patchOf(w, w.max) }])).map(pick);
  assert.ok(lo.lsm < 10, `no scarring: under 10 kPa (${lo.lsm})`);
  assert.ok(hi.lsm > 15, `severe scarring: over 15 kPa (${hi.lsm})`);
  assert.ok(lo.lsm < own.lsm && own.lsm < hi.lsm, `the slide sits between (${own.lsm})`);
});

// Each built-in compare row added here: every button resolves to what the presenter does with it.
const kinds = (s) => s.compare.map((o, k) => abChoice(s.compare, k).kind);

test('HVPG: the catheter slide\'s case sits between compensated and decompensated cirrhosis on the HVPG scale', async () => {
  const st = (await deckStates(DECKS.find((d) => d.id === 'hvpg'))).map(pick)[HVPG_AT];
  const [healthy, comp, decomp] = (await runSteps(['healthy', 'cirr-comp', 'cirr-decomp'].map((preset) => ({ preset })))).map(pick);
  assert.ok(healthy.hvpg < 5 && comp.hvpg >= 5 && comp.hvpg < 10, `healthy ${healthy.hvpg}, compensated ${comp.hvpg}`);
  assert.ok(comp.hvpg < st.hvpg && st.hvpg < decomp.hvpg, `this case ${st.hvpg} sits between ${comp.hvpg} and ${decomp.hvpg}`);
});

test('Variceal bleed: no drug, octreotide and terlipressin on the slide that starts the drug', async () => {
  const s = slide('variceal-bleed', 'oct');
  assert.deepEqual(kinds(s), ['params', 'params', 'params']);
  assert.equal(s.compare.find((o) => o.own).label, 'Octreotide');
  const [none, oct, terli] = (await runSteps([{ preset: 'cirr-decomp' }, ...s.compare.map((o) => ({ params: o.params }))])).slice(1).map(pick);
  assert.ok(oct.pv < none.pv && terli.pv < none.pv, `each drug lowers the portal pressure (${none.pv} → ${oct.pv}, ${terli.pv})`);
});

test('Outflow: the right hepatic vein clot slider shows that one open vein drains the liver', async () => {
  const w = slide('outflow', 'bcs').whatIf;
  assert.equal(w.param, 'thrombus.RHV_IVC');
  const [clot, open] = (await runSteps([{ preset: 'budd-chiari' }, { params: patchOf(w, w.min) }])).map(pick);
  assert.equal(w.max, 1);
  assert.ok(clot.pv - open.pv > 5, `portal pressure falls with the vein open (${clot.pv} → ${open.pv})`);
});

test('Gastric varices: no treatment, embolization and splenectomy on the splenectomy slide', async () => {
  // (The Spleen talk's embolization slide, cut in the deck rebuild, F7; its three-way compare lives on here.)
  const s = slide('gastric-varices', 'splenectomy');
  assert.deepEqual(kinds(s), ['params', 'params', 'params']);
  assert.equal(s.compare.find((o) => o.own).params.splenicRx, s.params.splenicRx);
  const [none, pse, spx] = (await runSteps([{ preset: 'csph' }, ...s.compare.map((o) => ({ params: o.params }))])).slice(1).map(pick);
  assert.ok(none.pv > pse.pv && pse.pv > spx.pv, `the portal pressure eases a little more with each (${none.pv}, ${pse.pv}, ${spx.pv})`);
});

test('Endoscopy and NCPH: the patient buttons go to a preset and back to the slide', async () => {
  const e = slide('endoscopy', 'size'), n = slide('ncph', 'wedge');
  assert.deepEqual(kinds(e), ['state', 'state']);
  assert.deepEqual(kinds(n), ['state', 'state']);
  assert.deepEqual(e.compare.map((o) => o.label), ['Small', 'Large']);
  assert.equal(e.preset, 'cirr-decomp');
  const [csph, decomp, schisto, comp] = (await runSteps(['csph', 'cirr-decomp', 'schisto', 'cirr-comp'].map((preset) => ({ preset })))).map(pick);
  assert.ok(csph.varix < 5 && decomp.varix > 5, `small varices with CSPH (${csph.varix}), large ones decompensated (${decomp.varix})`);
  assert.ok(schisto.hvpg < 5 && comp.hvpg > schisto.hvpg && schisto.pv > comp.pv, `the wedge misses schistosomiasis (HVPG ${schisto.hvpg}, PV ${schisto.pv}) and reads cirrhosis (HVPG ${comp.hvpg}, PV ${comp.pv})`);
});

test('Ten years: the HVPG rises visit by visit through the first year, and carvedilol brings it down', async () => {
  const d = DECKS.find((x) => x.id === 'ten-years');
  const at = (id) => d.slides.findIndex((x) => x.id === id);
  const fps = (await deckStates(d)).map(pick);
  const hv = ['d0', 'd90', 'd365'].map((id) => fps[at(id)].hvpg);
  hv.slice(1).forEach((v, k) => assert.ok(v > hv[k], `HVPG rises visit by visit (${hv.join(', ')})`));
  assert.ok(fps[at('carv')].hvpg < fps[at('d365')].hvpg, 'carvedilol lowers it');
});

test('the presenter eases a time-point button to that slide\'s state, and a catheter slide\'s callouts follow the live model', () => {
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(src, /stateOf\[o\.slide \? slideAt\(o\.slide\) : i\]/);
  assert.match(src, /const slideAt = \(id\) => slides\.findIndex\(\(x\) => x\.id === id\)/);
  assert.match(src, /if \(s\.cath && cath\.on && cath\.fp\) \{ cath\.fp = f;/);
});
