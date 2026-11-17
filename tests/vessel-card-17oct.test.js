import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appCss } from './split-src.js';

// Vessel card and Details bugs V1–V3 from the 17 Oct critique (review/vessel-card-critique-17oct.md).
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const css = appCss(), html = read('index.html'), card = read('src/ui/card.js'), actions = read('src/ui/actions.js');

test('V1: no card title in the page carries an icon (an unsized one draws as a huge black shape)', () => {
  assert.ok(!/class="card-title"[^>]*>\s*<svg/.test(html));
  assert.match(html, /<h2 class="card-title" id="panelTitle"><span>Details<\/span><\/h2>/);
});

// (13 Nov 2026, card 5: the Details link is the name itself, with a chevron; the Why? link went with the card's words.)
test('V2: the card\'s name opens Details, its chevron says so; a part with no Details has a plain name', () => {
  assert.match(card, /const name = m\.noDetails \? h\('span', P_NAME_PLAIN, m\.title\) : h\('button', P_NAME, h\('span', P_NONE, m\.title\), svgIcon\('chev-right', 'ac-chev'\)\);/);
  assert.match(card, /if \(!m\.noDetails\) name\.addEventListener\('click', onNameClick\);/);
  assert.ok(!/'Why\?'/.test(card), 'no Why? link on the card');
});

test('V3: nothing on the vessel card is cut with an ellipsis', () => {
  assert.ok(!/label: '[^']*…'/.test(actions), 'no label ends in …');
  assert.match(actions, /label: 'Add shunt'/);
  assert.ok(!/-webkit-line-clamp/.test(css.slice(css.indexOf('.ac-about'), css.indexOf('.ac-about') + 4000)), 'no clamped description');
  for (const line of css.split('\n').filter((l) => /\.action-card[^{]*(\.ac-bl|\.ac-status|\.ac-about)[^{]*\{/.test(l))) {
    assert.ok(!/text-overflow: ellipsis/.test(line), line);
  }
});

// Mohammad's picks on the critique's taste calls (17 Oct): V4 range, V5 coloured word, V6 "+10", V8 ink values, V9 name as title.
const inspector = read('src/ui/inspector.js'), main = read('src/ui/main.js');

test('V4: a clotted or narrowed vessel reads in → out on its card; open vessels keep one number', () => {
  assert.match(actions, /value: \(f, lens, ref\) => edgeValue\(e, f, lens, ref, true\)/);
  assert.match(actions, /if \(range && \(p\?\.thrombus\?\.\[host\] > 0 \|\| p\?\.stenosis\?\.\[host\] > 0\)\) \{/);
  assert.match(actions, /return \{ v: `\$\{fmt\(H1, 1\)\} → \$\{fmt\(H2, 1\)\}`, u: 'mmHg' \};/);
  assert.match(main, /edgeValue\(e, f, 'pressure', null\)\.v/, 'the hover tip keeps the one number');
});

test('V5: the status is a coloured word after the reading (card), never a pill', () => {
  assert.match(card, /const nr = h\('div', P_NR, name, pillEl\);/, 'the direction word at the right of the name');
  assert.ok(!/class: 'pill '/.test(card), 'card');
  for (const c of ['ok', 'warn', 'rev', 'bad']) assert.match(css, new RegExp(`\\n\\.st-word\\.${c} \\{ color:`), c);
});

test('V6: a change reads "+10.0" as the callouts do: no arrow, one decimal, in the reading\'s colour', () => {
  assert.ok(!/[▲▼]/.test(actions));
  assert.match(actions, /signed\(dd, fmt\(ad, 1\)\)/);
  assert.match(css, /\n\.ac-delta\.up, \.ac-delta\.down \{ color: var\(--text\); \}/);
});

test('V8: a card slider\'s value stays in ink when changed; the accent is on the slider only', () => {
  assert.ok(!/\.ac-slider\.changed \.ctl-val/.test(css));
});

test('V9: a vessel, compartment or organ is the title of its own details, inside its card; no "Live values" heading', () => {
  const det = read('src/ui/card-details.js');
  assert.ok(!/'Live values'/.test(inspector) && !/'Live values'/.test(det));
  assert.match(det, /class: 'ad-back'[^\n]*h\('span', \{\}, title\)/, 'the back row is the name');
  assert.doesNotMatch(main, /NAMED_DETAILS/, 'no panel is titled by the name any more');
});
