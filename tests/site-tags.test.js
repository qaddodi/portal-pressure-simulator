// The site tag by a slide's title names the level of its block, so a learner always knows which type of portal
// hypertension a slide teaches. Every tagged slide maps to one valid level; a deck about cirrhosis alone carries none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DECKS, SITE_TAGS, siteTag, withOverview } from '../src/ui/decks.js';

const LEVELS = ['pre', 'presin', 'sin', 'postsin', 'post', 'cardiac'];
const NAMES = new Set(['Pre-hepatic', 'Presinusoidal', 'Sinusoidal', 'Postsinusoidal', 'Post-hepatic', 'Cardiac']);

test('every slide site is a known level, and every tagged slide maps to exactly one', () => {
  for (const d of DECKS) for (const s of withOverview(d).slides) {
    if (s.site) assert.ok(s.site in SITE_TAGS, `${d.id}/${s.id}: unknown site ${s.site}`);
    const t = siteTag(d, s);
    if (!t) continue;
    assert.ok(LEVELS.includes(t.site), `${d.id}/${s.id}: tag colour ${t.site}`);
    assert.ok(NAMES.has(t.name), `${d.id}/${s.id}: tag name ${t.name}`);
    assert.equal(t.name, SITE_TAGS[s.site]);
  }
});

test('decks that teach more than one level tag their slides; cirrhosis-only decks, rails and visuals do not', () => {
  const by = (id) => DECKS.find((d) => d.id === id);
  for (const id of ['ncph', 'prehepatic', 'outflow', 'lobule', 'hvpg', 'doppler']) assert.ok(by(id).slides.some((s) => siteTag(by(id), s)), id);
  for (const id of ['endoscopy', 'treatment', 'circuit']) assert.ok(!by(id).slides.some((s) => siteTag(by(id), s)), id);
  for (const d of DECKS) for (const s of withOverview(d).slides) if (s.rail || s.visual) assert.equal(siteTag(d, s), null, `${d.id}/${s.id}`);
  assert.deepEqual(siteTag(by('prehepatic'), by('prehepatic').slides[0]), { site: 'pre', name: 'Pre-hepatic' });
});

test('the teaching card shows the tag as a corner tab in the level\'s colour, the title first in the words', () => {
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(src, /const lvl = s\.visual \? null : siteTag\(deck, s\) \|\| railLvl, stab = ui\.shade\.querySelector\('\.pz-sitetab'\);/);
  assert.match(src, /stab\.dataset\.site = lvl\.site; stab\.textContent = lvl\.name;/);
  assert.match(src, /text\.replaceChildren\(\.\.\.\[h\('h1', \{ class: 'pz-h' \}, \.\.\.diseaseNodes\(nb\(s\.title\)\)\)/);
  // (the deck tab's mirror: top left, flush, only its bottom right corner rounded, tinted in the level's colour)
  assert.match(css, /\.pz-sitetab \{ position: absolute; top: 0; left: 0;[^}]*border-radius: 0 0 calc\(var\(--pz-tabh\) \* \.5\) 0; background: color-mix\(in srgb, var\(--site\) 16%, transparent\);[^}]*font: var\(--caps-w\) var\(--pz-tabf\)\/1 var\(--font-ui\)/);
  // (on the glass both tabs cover its border to meet its outer edge and curve, the lit top edge drawn on them one pixel down)
  assert.match(css, /\.pz-shade:is\(\.stack, \.pz-card\) :is\(\.pz-tabname, \.pz-sitetab\) \{ top: -1px; height: calc\(var\(--pz-tabh\) \+ 1px\);[^}]*linear-gradient\(transparent 1px, var\(--pz-glass-edge\) 1px 2px, transparent 2px\)/);
  assert.match(css, /\.pz-shade:is\(\.stack, \.pz-card\) \.pz-tabname \{ right: -1px;/);
  assert.match(css, /\.pz-shade:is\(\.stack, \.pz-card\) \.pz-sitetab \{ left: -1px;/);
  assert.match(css, /\.pz-shade\.stack \.pz-sitetab \{ border-top-left-radius: 18px; \}/);
  assert.match(css, /\.pz-shade\.pz-card:not\(\.stack\) \.pz-tabname \{ border-top-right-radius: clamp\(16px, calc\(2\.2 \* var\(--pzh\) \/ var\(--vz\)\), 28px\); \}/);
});

test('a slide with a level rail names its level in the corner tab where the rail is hidden (phone or iPad held upright)', () => {
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(src, /const railLvl = !s\.visual && s\.rail && s\.rail !== 'all' && SITE_TAGS\[s\.site\]/);
  assert.match(src, /stab\.toggleAttribute\('data-rail', !!lvl && lvl === railLvl\)/);
  // (the rail itself shows only off the stacked layout, and the tab only on it)
  assert.match(css, /\.pz\.stack \.pz-causes, \.pz\.stack \.pz-rail \{ display: none; \}/);
  assert.match(css, /\.pz-shade:not\(\.stack\) \.pz-sitetab\[data-rail\] \{ display: none; \}/);
});
