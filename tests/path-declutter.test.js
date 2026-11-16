// The guideline path card never says again what the card's header row already shows (Mohammad, 16 Nov 2026: "the info on top is redundant given we
// have the tiles on top readouts so no need to mention them again unless pertinent"; "the Baveno citation can go down in the same line as the Fig. 1
// text"). One rule for every algorithm and every deck: a chip that would repeat a tiled reading is left out, and the source's pill stands in the foot
// row with the figure's number, never above the figure.
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ALGOS, PATHS, chipsOf, patientFor } from '../src/ui/path-data.js';
import { tiledOf, shownOf } from '../src/ui/tool-path.js';
import { DECKS } from '../src/ui/decks.js';

// the reading each chip's words carry, by the tile that prints the same number
const SAYS = { lsm: /\bLSM \d/, ssm: /\bSSM \d/, plt: /\bPlatelets \d/, hvpg: /\bHVPG \d/, sbp: /\bSBP \d/, map: /\bMAP \d/ };

test('with a tile for a reading, no algorithm\'s chips say that reading again', () => {
  for (const a of Object.values(ALGOS)) {
    const all = a.chips(a.worst).join(' | ');
    for (const [k, re] of Object.entries(SAYS)) {
      const left = a.chips(a.worst, new Set([k])).join(' | ');
      assert.ok(!re.test(left), `${a.id}: a ${k} tile is on the card, so "${left}" must not repeat it`);
      if (re.test(all)) assert.ok(left.length < all.length, `${a.id}: chips drop the ${k} reading when its tile shows`);
    }
    // (nothing is dropped when no tile shows: the chips are then the only place the patient's numbers stand)
    assert.deepEqual(a.chips(a.worst, new Set()), a.chips(a.worst), a.id);
  }
});

test('first visit: tiles for LSM and platelets leave only the facts no tile carries (the screenshot of 16 Nov)', () => {
  const p = { lsm: 12.4, plt: 160, bmi: false, ant: false, ssm: false };
  assert.deepEqual(chipsOf('first-visit', p, new Set(['lsm', 'plt'])), []);
  assert.deepEqual(chipsOf('first-visit', { ...p, bmi: true, ant: true }, new Set(['lsm', 'plt'])), ['BMI ≥30', 'ANTICIPATE-NASH ≥75%']);
  assert.deepEqual(chipsOf('first-visit', p), ['LSM 12.4 kPa', 'Platelets 160']);
});

test('every deck slide with a path card and header tiles: the chips repeat none of the tiles', () => {
  let n = 0;
  for (const d of Object.values(DECKS)) {
    for (const s of d.slides || []) {
      if (s.tool?.kind !== 'path' || !s.data || !s.tiles?.length) continue;
      const tiled = tiledOf(s), fp = Object.fromEntries(s.tiles.map((k) => [k, 10]));
      const chips = chipsOf(s.tool.of, patientFor(s.tool, fp, shownOf), tiled).join(' | ');
      for (const k of tiled) if (SAYS[k]) assert.ok(!SAYS[k].test(chips), `${d.id}/${s.id}: ${k} is a tile, chips say "${chips}"`);
      n++;
    }
  }
  assert.ok(n >= 1, 'at least one deck slide pairs a path card with tiles');
});

test('every algorithm has a source for its pill, which stands in the foot row (scripts/rules-lint.mjs holds the layout rule)', () => {
  for (const [id, p] of Object.entries(PATHS)) assert.ok(p.kick, `${id} has a source for its pill`);
});
