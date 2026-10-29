// Collaterals and varices, the slides that took up the new deck cards (review/deck-card-ideas-2/recs.md, section 4) and the rebuild (deck
// rebuild plan B2): the flow colours over the first three slides, the varix caliper on the time-lapse, the spotlight on the esophageal
// route, and the portal blood bars on the slide that holds the paraumbilical and rectal routes. Their words and numbers agree with the model.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { EXT } from '../src/ui/slide-ext.js';
import { EDGES } from '../src/engine/topology.js';
import { flowParts } from '../src/ui/tool-flows.js';
import { beatView } from '../src/ui/slide-beats.js';
import { deckStates } from './deck-states.js';

const VARICES = DECKS.find((d) => d.id === 'varices');
const slide = (id) => VARICES.slides.find((s) => s.id === id);
const states = async () => { const fps = await deckStates(VARICES); return Object.fromEntries(VARICES.slides.map((s, i) => [s.id, fps[i]])); };

test('Collaterals open and Esophageal varices: the flow colours run over the first three slides and the pressure colours come back for the wall', () => {
  assert.deepEqual(['collat', 'lapse', 'eso', 'burst'].map((id) => slide(id).lens), ['flow', 'flow', 'flow', undefined]);
  for (const id of ['collat', 'lapse', 'eso', 'burst']) assert.deepEqual(slide(id).tiles, ['hvpg', 'varix'], `${id}: the HVPG and the varix are the two tiles`);
  assert.equal(slide('burst').dataTitle, 'Wall stress');
  assert.match(slide('burst').line, /^Wall stress rises with the pressure across the wall/);
  const lenses = new Set(VARICES.slides.map((s) => s.lens).filter(Boolean));
  assert.deepEqual([...lenses], ['flow'], 'one lens besides the home pressure colours');
});

test('Varices grow: the varix caliper follows the time-lapse, and the spleen and platelets are left to the notes', async () => {
  const s = slide('lapse'), at = await states();
  assert.deepEqual(s.calipers, ['varix']);
  assert.equal(s.normalOutline, undefined);
  assert.equal(s.caveat, undefined, 'the small print is in the notes');
  assert.match(s.notes, /about 1 in 10 small varices become large each year/);
  assert.ok(at.lapse.varix > at.collat.varix + 3, 'the varix grows through the six months');
  assert.ok(at.lapse.spleen > at.collat.spleen, 'and the spleen keeps growing');
});

test('Esophageal varices: the spotlight names the esophageal route, each vessel of it on the figure', () => {
  const s = slide('eso'), ids = new Set(EDGES.map((e) => e.id));
  assert.deepEqual(s.spot, ['@esophageal']);
  assert.equal(s.lens, 'flow', 'the flow colours stay');
  assert.ok(EXT.sets.esophageal.length > 0 && EXT.sets.esophageal.every((id) => ids.has(id)), 'every vessel of the set exists');
});

test('Other collaterals: the bar shows the paraumbilical route, and the liver part is 100 less what is shunted', async () => {
  const s = slide('umbilical'), at = await states();
  // (Three views, one per Next: the paraumbilical route, the rectal, then both together, which a jump or Back opens on: beats.)
  assert.deepEqual([0, 1, 2].map((b) => beatView(s, b).marks.map((m) => m.edges[0])), [['C3'], ['C4'], ['C3', 'C4']], 'the paraumbilical and the rectal route are both marked');
  assert.equal(VARICES.slides.find((x) => x.id === 'rectal'), undefined, 'the rectal slide is folded into this one');
  assert.equal(VARICES.slides.find((x) => x.id === 'fundal'), undefined, 'gastric varices have their own talk');
  assert.equal(s.tool.kind, 'flows');
  assert.deepEqual(s.tiles, ['liver']);
  const parts = flowParts(at.umbilical), pum = parts.find((p) => p.id === 'pum'), liver = parts.find((p) => p.id === 'liver');
  assert.ok(pum && pum.pct > 0, 'the paraumbilical segment is on the bar');
  assert.equal(liver.pct, 100 - Math.round(at.umbilical.shunt * 100), 'the liver\'s part and the Shunted reading are one number');
  assert.equal(parts.reduce((a, p) => a + p.pct, 0), 100);
});
