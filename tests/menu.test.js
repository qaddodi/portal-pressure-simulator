import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DECKS, TOPICS } from '../src/ui/decks.js';

test('the unified menu lists every presentation under exactly one topic, with a short title', () => {
  const listed = TOPICS.flatMap(([, , list]) => list.map(([id]) => id));
  assert.equal(new Set(listed).size, listed.length, 'a presentation listed twice');
  assert.deepEqual([...listed].sort(), DECKS.map((d) => d.id).sort());
  for (const d of DECKS) {
    assert.ok(TOPICS.some(([k]) => k === d.topic), `${d.id} topic`);
    assert.ok(d.short && d.short.length <= 32, `${d.id} short title`);
  }
});

// The deck's short name (presenter.js deckTab), in a tab at the teaching card's top right corner.
test('every presentation has a short deck name of 20 characters or fewer, distinct from the others', () => {
  const heads = DECKS.map((d) => d.head);
  for (const d of DECKS) assert.ok(d.head && d.head.length <= 20 && d.head === d.head.trim(), `${d.id} short deck name`);
  assert.equal(new Set(heads).size, heads.length, 'two talks share a short name');
});

test('the teaching card and the visual slides carry the deck name in a corner tab; the outline slide names the talk in full instead', () => {
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(src, /const deckTab = [^\n]*deck\?\.head \|\| \(deck\?\.title\?\.length <= 24/);
  assert.match(src, /h\('div', \{ class: 'pz-shade' \}, deckTab\(\)/);
  assert.match(src, /const tab = s\.visual !== 'outline' && deckTab\(\)/);
  // (Flush with the card's top and right edges, only its bottom left corner rounded, never under 12 px, never cut short.)
  const rule = css.match(/\n\.pz-tabname \{([^}]*)\}/)?.[1] || '';
  assert.match(rule, /top: 0; right: 0;/);
  assert.match(rule, /border-radius: 0 0 0 /);
  assert.match(rule, /white-space: nowrap/);
  assert.doesNotMatch(rule, /ellipsis|overflow: hidden/);
  assert.match(css, /--pz-tabf: calc\(12px \* var\(--ts, 1\)\)/);
  assert.match(css, /--pz-tabf: max\(12px, /);
  // (The site tag stays on the left, over the title: the deck tab's mirror in the top left corner.)
  assert.match(src, /h\('span', \{ class: 'pz-sitetab', hidden: true \}\)/);
});

test('over the thumb dock only a sheet or a menu from the dock rises from behind the tab row; a top-bar menu pops in place', () => {
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  const util = readFileSync(new URL('../src/ui/util.js', import.meta.url), 'utf8');
  assert.match(util, /const fromDock = asSheet \|\| !!anchor\.closest\?\.\('\.vdock'\);/);
  // (The Colored-by menu on an upright iPad opened from the top bar but slid up from under its spot, its card cut away and its shadow showing.)
  assert.doesNotMatch(css, /html\.thumb-ui \.menu(?!\.from-dock)[ ,{]/);
  assert.match(css, /html\.thumb-ui \.menu\.from-dock \{ animation: thumbIn/);
  assert.match(css, /html\.thumb-ui \.menu\.from-dock \{ translate: 0 var\(--sink, 0px\); \}/);
});
