// The lens legend shows wherever the figure wears a lens (capture 36b7deac, 25 Nov 2026, Sites and causes): slides 4 to 9 coloured the figure by pressure drop with no key (the key
// waited for the teaching card, and a case card holds the slide in front of it), and slide 10 wore the pressure colours with none. One function says which slide shows which key
// (keyLens, presenter-words.js), and the key is on while a case or question card holds the slide as it is with the teaching card (figureKeyReady, figure-key.js).
import './dom-shim.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';
import { keyLens } from '../src/ui/presenter.js';
import { figureKeyReady } from '../src/ui/figure-key.js';
import { lensButtons, lensSpec, slideLens } from '../src/ui/presenter-words.js';

const slides = DECKS.flatMap((d) => d.slides.map((s, i) => ({ d, s, i, at: `${d.id}#${i + 1}` })));

test('every slide of every deck: a lens other than the plain pressure default, lens buttons, an explicit pressure lens or the pressure profile show a key; a full-panel visual never does', () => {
  for (const { s, at } of slides) {
    const want = s.visual ? null : slideLens(s) !== 'pressure' || lensButtons(s) || s.lens === 'pressure' || s.tool?.kind === 'profile' ? slideLens(s) : null;
    assert.equal(keyLens(s), want, at);
    if (want && want !== 'pressure') assert.ok(lensSpec(want, s), `${at}: lens "${want}" has a key to show`);
  }
});

test('a slide that sets a lens always has its key (no slide can name a lens and leave the figure unkeyed)', () => {
  for (const { s, at } of slides) if (!s.visual && s.lens) assert.ok(keyLens(s), `${at} sets lens ${s.lens}`);
});

test('Sites and causes: every slide that shows the figure shows a key, the pressure drop on the causes and the pressure on the ladder slide', () => {
  const sites = DECKS.find((d) => d.id === 'sites');
  const keys = Object.fromEntries(sites.slides.map((s) => [s.id, keyLens(s)]));
  assert.deepEqual(keys, { overview: 'system', healthy: 'drop', pvt: 'drop', presin: 'drop', sin: 'drop', postsin: 'drop', post: 'drop', cardiac: 'drop', steps: 'pressure', ladders: null, relation: null, summary: null });
});

test('the key is on with the teaching card, and also while the case card holds the slide in front of it, in every state of the two cards', () => {
  const el = (hidden = false, ...cls) => ({ hidden, classList: { contains: (c) => cls.includes(c) } });
  const text = (hidden, ...cls) => el(hidden, ...cls);
  // the teaching card in, no case card: on
  assert.equal(figureKeyReady(text(false), el(false), el(true)), true);
  // the case card holds the slide (the teaching card leaves, waiting behind it): on, as it was with the card before
  assert.equal(figureKeyReady(text(false, 'pz-leave'), el(false, 'pz-prep'), el(false)), true);
  assert.equal(figureKeyReady(text(true), el(false), el(false)), true);
  // the case card lifted and gone, the teaching card still on its way: off until it is in
  assert.equal(figureKeyReady(text(false, 'pz-leave'), el(false, 'pz-prep'), el(true)), false);
  assert.equal(figureKeyReady(text(false), el(false, 'pz-prep'), el(true)), false);
  assert.equal(figureKeyReady(text(true), el(false), el(true)), false);
});
