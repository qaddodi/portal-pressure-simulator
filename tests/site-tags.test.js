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

test('the teaching card renders the tag above the title, in the running head beside the deck name', () => {
  const src = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');
  assert.match(src, /const runHead = [^\n]*\n[^\n]*siteTag\(deck, s\)[^\n]*\n[^\n]*'pz-run'[^\n]*'pz-dn'[^\n]*'pz-site'/);
  assert.match(src, /text\.replaceChildren\(\.\.\.\[runHead\(s\), h\('h1', \{ class: 'pz-h' \}, \.\.\.diseaseNodes\(nb\(s\.title\)\)\)/);
});
