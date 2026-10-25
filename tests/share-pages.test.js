import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cases, sharePage } from '../scripts/share-pages.mjs';

test('every patient and deck gets a titled share page that forwards to the app', async () => {
  const list = await cases();
  assert.ok(list.some((c) => c.file === 'healthy.html' && c.target === '../'));
  const deck = list.find((c) => c.file === 'deck-two-inflows.html');
  assert.equal(deck.title, "The liver's two inflows");
  assert.equal(deck.target, '../?script=two-inflows');
  for (const c of list) assert.ok(c.title, c.file);
  const html = sharePage({ title: 'A & "B"', summary: 'x', target: '../' });
  assert.match(html, /og:title" content="A &amp; &quot;B&quot;"/);
  assert.match(html, /location\.replace\("\.\.\/" \+ location\.hash\)/);
});

test('a talk merged into another keeps its old share page, which opens the deck that took its slides', async () => {
  const { DECK_ALIAS } = await import('../src/ui/decks.js');
  const list = await cases();
  assert.equal(DECK_ALIAS['refractory-bleed'], 'variceal-bleed');
  for (const [old, now] of Object.entries(DECK_ALIAS)) {
    const page = list.find((c) => c.file === `deck-${old}.html`);
    assert.ok(page, `${old} -> ${now}`);
    assert.equal(page.target, `../?script=${now}`);
    assert.ok(page.title);
  }
  assert.equal(list.find((c) => c.file === 'deck-refractory-bleed.html').target, '../?script=variceal-bleed');
});
