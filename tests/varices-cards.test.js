// Collaterals and varices, the slides that took up the new deck cards (review/deck-card-ideas-2/recs.md, section 4): the
// vein-system colours on the opening slide, the varix caliper and the normal spleen on the time-lapse, the spotlight on the
// esophageal route, and the portal blood bars on the paraumbilical slide. Their words and numbers agree with the model.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { EXT } from '../src/ui/slide-ext.js';
import { EDGES } from '../src/engine/topology.js';
import { LENS_WORDS, LENS_TONE } from '../src/ui/presenter.js';
import { flowParts } from '../src/ui/tool-flows.js';
import { NORMAL_ON } from '../src/ui/highlight-math.js';
import { deckStates } from './deck-states.js';

const VARICES = DECKS.find((d) => d.id === 'varices');
const slide = (id) => VARICES.slides.find((s) => s.id === id);
const states = async () => { const fps = await deckStates(VARICES); return Object.fromEntries(VARICES.slides.map((s, i) => [s.id, fps[i]])); };

test('Collaterals open: the vein-system colours, and the words name them with a pill', () => {
  const s = slide('collat');
  assert.equal(s.lens, 'system');
  assert.match(s.line, /Colored by vein system, the collaterals stand out between the portal and systemic veins\.$/);
  assert.doesNotMatch(`${s.line} ${s.notes}`, /colored by origin/i, 'the words describe the colours the slide shows');
  assert.equal(LENS_WORDS['vein system'], 'system');
  assert.equal(LENS_TONE.system, '--tr-var', 'the pill takes the shunts\' colour');
  assert.equal(EXT.lenses.system[0], 'vein system');
});

test('Varices grow: the varix caliper and the normal spleen outline follow the time-lapse', async () => {
  const s = slide('lapse'), at = await states();
  assert.deepEqual(s.calipers, ['varix']);
  assert.deepEqual(s.normalOutline, ['spleen']);
  assert.ok(at.lapse.varix > at.collat.varix + 3, 'the varix grows through the six months');
  assert.ok(at.lapse.spleen / 11 >= NORMAL_ON, 'the spleen is past the size where the normal outline shows');
  assert.ok(at.lapse.spleen > at.collat.spleen, 'and it keeps growing');
});

test('Esophageal varices: the spotlight names the esophageal route, each vessel of it on the figure', () => {
  const s = slide('eso'), ids = new Set(EDGES.map((e) => e.id));
  assert.deepEqual(s.spot, ['@esophageal']);
  assert.equal(s.lens, 'flow', 'the flow colours stay');
  assert.ok(EXT.sets.esophageal.length > 0 && EXT.sets.esophageal.every((id) => ids.has(id)), 'every vessel of the set exists');
});

test('The paraumbilical vein reopens: the bar shows the paraumbilical route, and the liver part is 100 less what is shunted', async () => {
  const s = slide('umbilical'), at = await states();
  assert.equal(s.tool.kind, 'flows');
  assert.deepEqual(s.tiles, ['liver']);
  const parts = flowParts(at.umbilical), pum = parts.find((p) => p.id === 'pum'), liver = parts.find((p) => p.id === 'liver');
  assert.ok(pum && pum.pct > 0, 'the paraumbilical segment is on the bar');
  assert.equal(liver.pct, 100 - Math.round(at.umbilical.shunt * 100), 'the liver\'s part and the Shunted reading are one number');
  assert.equal(parts.reduce((a, p) => a + p.pct, 0), 100);
});
