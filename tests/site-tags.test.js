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
  for (const id of ['ncph', 'prehepatic', 'outflow', 'lobule', 'hvpg', 'doppler', 'treatment']) assert.ok(by(id).slides.some((s) => siteTag(by(id), s)), id);
  for (const id of ['endoscopy', 'circuit']) assert.ok(!by(id).slides.some((s) => siteTag(by(id), s)), id);
  for (const d of DECKS) for (const s of withOverview(d).slides) if (s.rail || s.visual) assert.equal(siteTag(d, s), null, `${d.id}/${s.id}`);
  assert.deepEqual(siteTag(by('prehepatic'), by('prehepatic').slides[0]), { site: 'pre', name: 'Pre-hepatic' });
});

test('the teaching card shows the tag as a corner tab in the level\'s colour, the title first in the words', () => {
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(src, /const lvl = s\.visual \? null : siteTag\(deck, s\) \|\| railLvl, stab = ui\.shade\.querySelector\('\.pz-sitetab'\);/);
  assert.match(src, /stab\.dataset\.site = lvl\.site; stab\.textContent = lvl\.name;/);
  // (the title first, in one place)
  assert.match(src, /head = h\('h1', \{ class: 'pz-h' \}, \.\.\.diseaseNodes\(nb\(s\.title\)\)\)/);
  assert.match(src, /text\.replaceChildren\(\.\.\.\[head, /);
  // (the deck tab's mirror: top left, flush, its outer top corner from the same variable and its bottom right corner rounded,
  // tinted in the level's colour)
  assert.match(css, /\.pz-sitetab \{ position: absolute; top: 0; left: 0;[^}]*border-radius: var\(--pz-tab-ro, 0px\) 0 calc\(var\(--pz-tabh\) \* \.5\) 0; background: color-mix\(in srgb, var\(--site\) 16%, transparent\);[^}]*font: var\(--caps-w\) var\(--pz-tabf\)\/1 var\(--font-ui\)/);
  assert.match(css, /\n\.pz-tabname \{ position: absolute; top: 0; right: 0;[^}]*border-radius: 0 var\(--pz-tab-ro, 0px\) 0 calc\(var\(--pz-tabh\) \* \.5\);/);
  // (on the glass both tabs fill their corners inside its outline, their outer corner on its inner curve: no clipping, no
  // per-side offsets)
  assert.match(css, /\.pz-shade:is\(\.stack, \.pz-card\) \{ --pz-tab-ro: calc\(var\(--pz-r\) - 1px\); \}/);
  assert.doesNotMatch(css, /--pz-tab-gap/);
  assert.doesNotMatch(css, /\.pz-shade:is\(\.stack, \.pz-card\) \{ overflow: hidden; \}/);
  assert.doesNotMatch(css, /\.pz-shade:is\(\.stack, \.pz-card\) :is\(\.pz-tabname, \.pz-sitetab\) \{/);
  assert.doesNotMatch(css, /\.pz-(tabname|sitetab) \{ border-top-(left|right)-radius/);
  // (one edge line only: the outline, dark enough to show against the tab colours; no lit top edge, masked or not, so
  // nothing runs between a tab and the outline)
  for (const sel of ['.pz-shade.stack {', '.pz-shade.pz-card:not(.stack) {']) {
    const at = css.indexOf('\n' + sel), rule = css.slice(at, css.indexOf('}', at));
    assert.ok(at >= 0, sel);
    assert.match(rule, /border-radius: var\(--pz-r\)/, `${sel} radius`);
    assert.match(rule, /border: 1px solid color-mix\(in srgb, var\(--text\) 22%, transparent\);/, `${sel} outline`);
    assert.match(rule, /box-shadow: 0 14px 34px -10px var\(--pz-glass-drop\), 0 2px 6px -1px var\(--pz-glass-drop\);/, `${sel} shadow`);
    assert.doesNotMatch(rule, /inset|--pz-glass-edge/, `${sel} lit edge`);
  }
  assert.doesNotMatch(css, /\.pz-shade:is\(\.stack, \.pz-card\)::(before|after)|--pz-lit-mask/);
  assert.doesNotMatch(src, /--pz-lit-[lr]/);
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
