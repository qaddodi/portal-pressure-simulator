// Deck visuals package D (review/deck-visuals-recs.md V23, V24, V15): a source line, the ladder's earlier state and a
// summary table's row in focus. All opt-in: no built-in deck sets any of them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { citeOk, citeText, focusOf, ladderFromOf, ladderFromName } from '../src/ui/teach-extras.js';
import { handoutHTML } from '../src/ui/handout.js';
import { adopted } from './deck-adopted.js';

const DIR = new URL('../src/ui/decks/', import.meta.url);
const decks = async () => {
  const out = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.js'))) {
    const d = Object.values(await import(new URL(f, DIR))).find((v) => Array.isArray(v?.slides));
    if (d) out.push(d);
  }
  return out;
};

test('no built-in deck uses package D fields yet', async () => {
  for (const d of await decks()) for (const s of d.slides) {
    for (const k of ['cite', 'ladderFrom', 'ladderFromLabel', 'focusRow']) if (!adopted(d, s, k)) assert.equal(s[k], undefined, `${d.id}/${s.id} sets ${k}`);
  }
});

test('cite: Baveno VIII, EASL 2025 or AASLD 2024, never Baveno VII', () => {
  assert.ok(citeOk('Baveno VIII 1.15, 1.16'));
  assert.ok(citeOk('EASL 2025 · AASLD 2024'));
  assert.equal(citeOk('Baveno VII 1.1'), false);
  assert.equal(citeOk('baveno vii'), false);
  assert.equal(citeOk(''), false);
  assert.equal(citeText('  Baveno VIII 5.4 '), 'Baveno VIII 5.4');
});

test('table and ladder fields read only their own values', () => {
  assert.equal(focusOf({ focusRow: 'tips' }), 'tips');
  assert.equal(focusOf({ focusRow: '' }), null);
  assert.deepEqual(ladderFromOf({ ladderFrom: true }), { prev: true });
  assert.deepEqual(ladderFromOf({ ladderFrom: 'base' }), { id: 'base' });
  assert.equal(ladderFromOf({}), null);
  assert.equal(ladderFromOf({ ladderFrom: false }), null);
  assert.equal(ladderFromName({ ladderFrom: true }), 'Before');
  assert.equal(ladderFromName({ ladderFrom: true, ladderFromLabel: ' No Rx ' }), 'No Rx');
});

test('the handout prints the source line', () => {
  const d = { id: 'x', title: 'X', mine: true, slides: [{ id: 'a', title: 'A', line: 'L', cite: 'Baveno VIII 1.15' }] };
  const html = handoutHTML(d, '', [{ whvp: 18, fhvp: 6, hvpg: 12 }]);
  assert.match(html, /<p class="cite">Baveno VIII 1\.15<\/p>/);
});

test('presenter wiring: the cite line and the ladder\'s earlier state are drawn', () => {
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.equal((src.match(/citeEl\(s\)/g) || []).length, 2, 'the cite line on the words card and on a panel slide');
  assert.match(src, /if \(lad\) ladderFromTo\(s, i\);/);
});
