// R01 (presenter side): the presenter's predicates read card-throw.js's motion state, so a card on a scheduler-driven throw is entering,
// moving and not stationary, whether or not the browser lists an animation for it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PZ = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
const line = (start) => { const at = PZ.indexOf(start); assert.ok(at > 0, start); return PZ.slice(at, PZ.indexOf('\n', at)); };

test('cardsEntering counts a throw coming in or back (the words, their glass, the panel, the data card), with the same left-to-run rule', () => {
  assert.match(line('  const throwCards = '), /\[ui\?\.text, ui\?\.shade, ui\?\.panel, ui\?\.data\]/);
  assert.match(line('  const throwEnters = '), /throwState\(el\)[^\n]*s\.kind !== 'out' && s\.left > left/);
  assert.match(line('  const cardsEntering = '), /throwCards\(\)\.some\(\(el\) => throwEnters\(el, left\)\) \|\| .*readAnims/);
});

test('cardMoving includes a card on a throw, so a layout is not made under it', () => {
  assert.match(line('  const cardMoving = '), /throwCards\(\)\.some\(\(el\) => el && throwing\(el\)\)/);
});

test('the slide change waits for a full landing on the throws\' own promise before the cards\' size is read', () => {
  assert.match(PZ, /Promise\.race\(\[Promise\.all\(throwCards\(\)\.map\(\(el\) => el && throwLanded\(el\)\)\), wait\(1200\)\]\)/);
  assert.match(PZ, /import \{[^}]*throwState, throwBusy, throwLanded[^}]*\} from '\.\/card-throw\.js';/);
});
