// Deck visuals package D (review/deck-visuals-recs.md V23, V24, V15): a source line, the ladder's earlier state and a
// summary table's row in focus. All opt-in: no built-in deck sets any of them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { citeOk, citeText, focusOf, oneLadder } from '../src/ui/teach-extras.js';
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
  // (The old ladder card's fields become the Gut to heart profile's, every one accounted for.)
  assert.deepEqual(oneLadder({ id: 'a', data: 'ladder', key: ['hvpg'] }), { id: 'a', key: ['hvpg'], tool: { kind: 'profile' } });
  assert.deepEqual(oneLadder({ data: 'ladder', ladderFrom: true }), { tool: { kind: 'profile', from: true } });
  assert.deepEqual(oneLadder({ data: 'ladder', ladderFrom: 'base', ladderFromLabel: ' No Rx ', tiles: ['hr'] }), { tiles: ['hr'], tool: { kind: 'profile', from: 'base', fromLabel: 'No Rx' }, data: 'tiles' });
  assert.deepEqual(oneLadder({ data: 'ladder', ladderFrom: false, ladderFromLabel: 'X', brackets: { hvpg: 'works' }, block: 'ra' }), { tool: { kind: 'profile' } });
  assert.deepEqual(oneLadder({ data: 'ladder', tool: { kind: 'doppler' }, tiles: ['ppg'] }), { tool: { kind: 'doppler' }, tiles: ['ppg'], data: 'tiles' });
  assert.deepEqual(oneLadder({ data: 'ladder', tool: { kind: 'doppler' } }), { tool: { kind: 'doppler' } });
  const t = { data: 'tiles', tiles: ['pv'] };
  assert.equal(oneLadder(t), t);
  assert.equal(oneLadder(null), null);
});

test('the handout prints the source line', () => {
  const d = { id: 'x', title: 'X', mine: true, slides: [{ id: 'a', title: 'A', line: 'L', cite: 'Baveno VIII 1.15' }] };
  const html = handoutHTML(d, '', [{ whvp: 18, fhvp: 6, hvpg: 12 }]);
  assert.match(html, /<p class="cite">Baveno VIII 1\.15<\/p>/);
});

test('presenter wiring: the cite line and the ladder\'s earlier state are drawn', () => {
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.equal((src.match(/citeEl\(s\)/g) || []).length, 2, 'the cite line on the words card and on a panel slide');
  assert.match(src, /slides = \(d\.mine \? d\.slides : withOverview\(d\)\.slides\)\.map\(oneLadder\);/, 'an old ladder slide is read as the chart');
  assert.match(src, /slide: s, index: i, deck: d, slides, stage,/, 'the chart finds the earlier slide in the slides as shown');
  const prof = readFileSync(new URL('../src/ui/tool-profile.js', import.meta.url), 'utf8');
  assert.match(prof, /const slides = ctx0\.slides \|\| ctx0\.deck\?\.slides \|\| \[\];/);
  assert.match(prof, /fromLabel: typeof t\?\.fromLabel === 'string' && t\.fromLabel\.trim\(\) \? t\.fromLabel\.trim\(\) : 'Before'/);
  assert.match(prof, /placeLineNames\(g, tw, goal, hl, bf, s, brk, cfg\.fromLabel\)/, 'the faint line is named as the slide asks');
});
