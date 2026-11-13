import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cases, sharePage } from '../scripts/share-pages.mjs';

test('every patient and deck gets a titled share page that forwards to the app', async () => {
  const list = await cases();
  assert.ok(list.some((c) => c.file === 'healthy.html' && c.target === '../'));
  const deck = list.find((c) => c.file === 'deck-two-inflows.html');
  assert.equal(deck.title, 'Dual blood supply of the liver');
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

test('a page names the case\'s picture, absolute when the site address is known, and none when there is no picture', async () => {
  const list = await cases();
  assert.equal(list.find((c) => c.file === 'cirr-decomp.html').image, 'cirr-decomp.jpg');
  assert.equal(list.find((c) => c.file === 'deck-two-inflows.html').image, 'deck-two-inflows.jpg');
  assert.equal(list.find((c) => c.file === 'deck-refractory-bleed.html').image, 'deck-variceal-bleed.jpg');
  const html = sharePage({ title: 'T', summary: 's', target: '../', image: 'healthy.jpg', base: 'https://x.github.io/app/preview/' });
  assert.match(html, /og:image" content="https:\/\/x\.github\.io\/app\/preview\/brand\/share\/healthy\.jpg"/);
  assert.match(html, /twitter:image" content="https:\/\/x\.github\.io\/app\/preview\/brand\/share\/healthy\.jpg"/);
  assert.match(html, /twitter:card" content="summary_large_image"/);
  assert.match(html, /og:image:width" content="1200"/);
  const bare = sharePage({ title: 'T', summary: 's', target: '../' });
  assert.doesNotMatch(bare, /og:image/);
  assert.match(bare, /twitter:card" content="summary"/);
});

test('the app\'s own page and manifest carry the preview picture and one theme colour', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /og:image" content="https:\/\/[^"]+\/brand\/share\/healthy\.jpg"/);
  assert.match(html, /twitter:card" content="summary_large_image"/);
  const man = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(man.theme_color, '#F1EBE0');
  assert.match(html, /name="theme-color" content="#F1EBE0" media="\(prefers-color-scheme: light\)"/);
});

test('?embed: set on <html> before the first paint, hides the top bar, and the app skips its worker, hint and ask', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /\[\?&\]embed\(\?=\[=&#\]\|\$\)\/\.test\(location\.search\)\)document\.documentElement\.setAttribute\('data-embed',''\)/);
  assert.ok(html.indexOf("'data-embed'") < html.indexOf('styles/app.css'));
  assert.match(readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8'), /html\[data-embed\] \.topbar/);
  const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
  assert.match(main, /location\.protocol !== 'file:' && !EMBED/);
  assert.match(main, /function showFirstHint\(\) \{\n {2}if \(EMBED\) return;/);
  assert.match(main, /function armFeedbackAsk\(\) \{\n {2}if \(EMBED\) return;/);
  assert.match(readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8'), /function stop\(restore = true\) \{\n {4}if \(!deck \|\| leaving \|\| document\.documentElement\.hasAttribute\('data-embed'\)\) return;/);
  const re = /[?&]embed(?=[=&#]|$)/;
  for (const q of ['?embed', '?embed&preset=x', '?preset=x&embed=1', '?x=1&embed#s=1']) assert.ok(re.test(q), q);
  for (const q of ['?embedded', '?notembed', '']) assert.ok(!re.test(q), q);
});
