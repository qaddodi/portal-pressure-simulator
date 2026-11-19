// A turn lays the cards out as a fresh open does (19 Nov 2026: an iPad turned upright left the data card above the screen on 8 of the first 12 HVPG slides).
// Node only; the browser check is `node scripts/rotate-sweep.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLACED, modeKey, resetPlace } from '../src/ui/place-reset.js';
import { compareTurn, summarizeTurns, turnsFor } from '../scripts/rotate-sweep-lib.mjs';

const cards = () => ({
  data: { style: { top: '453.2px', left: '31px', width: '444.7px', maxWidth: 'none', maxHeight: '335.8px', color: 'red' } },
  text: { style: { top: '113px', bottom: 'auto', marginBlock: '0px', maxHeight: '300px', color: 'red' } },
});

test('the first pass of a talk only records its mode', () => {
  const seen = new WeakMap(), root = {}, c = cards();
  assert.equal(resetPlace(seen, root, modeKey({ phone: false, card: true, short: true }), c), false);
  assert.equal(c.data.style.top, '453.2px');
});

test('a pass in the same mode keeps the places the last pass wrote', () => {
  const seen = new WeakMap(), root = {}, c = cards(), key = modeKey({ phone: false, card: true, short: true });
  resetPlace(seen, root, key, c);
  assert.equal(resetPlace(seen, root, key, c), false);
  assert.equal(c.text.style.bottom, 'auto');
});

test('a turn to another mode drops the places, and only the places', () => {
  const seen = new WeakMap(), root = {}, c = cards();
  resetPlace(seen, root, modeKey({ phone: false, card: true, short: true }), c);
  assert.equal(resetPlace(seen, root, modeKey({ phone: true, card: false, short: false }), c), true);
  for (const prop of PLACED.data) assert.equal(c.data.style[prop], '', `data ${prop}`);
  for (const prop of PLACED.text) assert.equal(c.text.style[prop], '', `text ${prop}`);
  assert.equal(c.data.style.color, 'red');
});

test('each talk has its own mode: a new root starts clean', () => {
  const seen = new WeakMap(), c = cards();
  resetPlace(seen, {}, modeKey({ phone: false, card: true }), c);
  assert.equal(resetPlace(seen, {}, modeKey({ phone: true, card: false }), c), false);
});

test('the layout resets before it measures, and resets every place it writes', () => {
  const src = readFileSync(new URL('../src/ui/presenter-ladders.js', import.meta.url), 'utf8');
  const at = (s) => src.indexOf(s);
  assert.ok(at('resetPlace(placeSeen') > 0, 'layoutNow calls resetPlace');
  assert.ok(at('resetPlace(placeSeen') < at('const phoneCap = p ? phoneTextCap'), 'before the phone plan reads the cards\' top and bottom');
  // (Every inline place the layout writes on the data or the words' card is one the reset drops: a new one has to be added to PLACED.)
  const written = { data: new Set(), text: new Set() };
  for (const m of src.matchAll(/\bdd\.style\.(top|left|width|maxWidth|bottom|marginBlock|maxHeight|right|height)\s*=/g)) written.data.add(m[1]);
  for (const m of src.matchAll(/\bts\.(top|left|width|maxWidth|bottom|marginBlock|maxHeight|right|height)\s*=/g)) written.text.add(m[1]);
  for (const m of src.matchAll(/live\.ui\.text\.style\.(top|left|width|maxWidth|bottom|marginBlock|maxHeight|right|height)\s*=/g)) written.text.add(m[1]);
  for (const name of ['data', 'text']) for (const prop of written[name]) assert.ok(PLACED[name].includes(prop), `${name}.${prop} is written by the layout but not reset on a turn (place-reset.js PLACED)`);
});

test('a turned slide equal to a fresh one has no difference; a card above the screen is named', () => {
  const fresh = { boxes: { '.pz-data': [124, 8, 698, 370] }, problems: [] };
  assert.equal(compareTurn(fresh, { boxes: { '.pz-data': [125, 9, 698, 370] }, problems: [] }).same, true);
  const bad = compareTurn(fresh, { boxes: { '.pz-data': [124, -326, 698, 34] }, problems: ['small: lettering 10.3 px'] });
  assert.equal(bad.same, false);
  assert.match(bad.boxes[0], /\.pz-data: fresh \[124,8,698,370\] turned \[124,-326,698,34\]/);
  assert.match(bad.problems[0], /only after the turn: small/);
  assert.match(compareTurn(fresh, { boxes: {}, problems: [] }).boxes[0], /only in a fresh open/);
});

test('the turns go both ways between the pairs of sizes that are present', () => {
  assert.deepEqual(turnsFor(['ipad', 'ipad-portrait', 'mac']), [['ipad', 'ipad-portrait'], ['ipad-portrait', 'ipad']]);
  assert.equal(turnsFor(['ipad']).length, 0);
});

test('the summary lists each slide that differs under its turn', () => {
  const report = { turns: [['ipad', 'ipad-portrait']], seconds: 5, results: {
    a: { deck: 'hvpg', slide: 3, turn: 'ipad > ipad-portrait', ok: true, same: false, boxes: ['.pz-data: fresh [1] turned [2]'], problems: [] },
    b: { deck: 'hvpg', slide: 4, turn: 'ipad > ipad-portrait', ok: true, same: true, boxes: [], problems: [] },
  } };
  const text = summarizeTurns(report);
  assert.match(text, /1 slides laid out differently/);
  assert.match(text, /hvpg slide 3:\n\s+\.pz-data/);
  assert.doesNotMatch(text, /slide 4/);
});
