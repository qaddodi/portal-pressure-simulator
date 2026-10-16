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
