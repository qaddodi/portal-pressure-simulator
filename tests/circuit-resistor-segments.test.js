import { stageSource } from './stage-src.js';
// The Circuit talk, slide 2 to 3 (Mohammad, 16 Oct: "the whole app crashes; nothing happens after"). Slide 3 shows the gut
// arterioles' resistor, and the figure's labels keep off every resistor's zigzag (stage.js buildSegs). A zigzag is not a
// vessel, so reading its vessel id threw on every model frame and the figure froze. This walks the deck from slide 2 to 3
// in Node, as the presenter computes it, and runs buildSegs's own segment id over a zigzag and a vessel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CIRCUIT } from '../src/ui/decks/circuit.js';
import { withOverview } from '../src/ui/decks.js';
import { runSteps } from './deck-states.js';

const SRC = stageSource();
const body = SRC.slice(SRC.indexOf('const segLines = '), SRC.indexOf('const segLines = ') + 4000);

test('Circuit slide 3 shows the resistors, the gut arterioles\' among them, over the same patient as slide 2', async () => {
  const sl = withOverview(CIRCUIT).slides, [two, three] = [sl[1], sl[2]];
  assert.equal(three.id, 'where');
  assert.ok(three.sites.includes('rGut') && three.sites.includes('rLiver'), 'slide 3 draws the resistor zigzags');
  const changes = (s) => !!(s.preset || s.params || s.action || s.days);
  const fps = await runSteps(sl.slice(0, 3).map((s) => (changes(s) ? { preset: s.preset, params: s.params, days: s.days } : {})));
  assert.ok(!changes(two) && !changes(three), 'slides 2 and 3 keep the outline\'s patient');
  for (const fp of fps) assert.ok(Number.isFinite(fp.pv) && Number.isFinite(fp.ppg));
});

test('a resistor\'s zigzag gives the labels\' segments an id without a vessel', () => {
  const zz = body.match(/ZZ_ITEM = \{ x: \{ width: 22 \}, obj: \{ w: 22 \}, pts: null, kind: 'z' \}/);
  assert.ok(zz, 'the zigzags enter buildSegs as items with no vessel');
  // (Since plan rev 2 step 2 the lines go to seg-hits.js lineIndex as plain data: each line's id is set here, and every segment
  // of it carries that id.)
  const idExpr = body.match(/rec\.id = ([^;]+?);/)?.[1];
  assert.ok(idExpr, 'the line carries an id');
  const HITS = readFileSync(new URL('../src/ui/seg-hits.js', import.meta.url), 'utf8');
  assert.match(HITS, /\bsg\.id = ln\.id;/, 'each segment takes its line\'s id');
  const idOf = new Function('x', `return ${idExpr};`);
  assert.doesNotThrow(() => idOf({ width: 22 }));
  const z = idOf({ width: 22 });
  assert.ok(typeof z === 'string' && z.length > 0, 'a zigzag has an id of its own, so a label check leaving one vessel out still counts it');
  assert.equal(idOf({ e: { id: 'PV_TRUNK' }, width: 10 }), 'PV_TRUNK');
});
