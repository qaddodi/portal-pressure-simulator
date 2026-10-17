import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Vessel card and Details bugs V1–V3 from the 17 Oct critique (review/vessel-card-critique-17oct.md).
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const css = read('styles/app.css'), html = read('index.html'), card = read('src/ui/card.js'), actions = read('src/ui/actions.js');

test('V1: no card title in the page carries an icon (an unsized one draws as a huge black shape)', () => {
  assert.ok(!/class="card-title"[^>]*>\s*<svg/.test(html));
  assert.match(html, /<h2 class="card-title" id="panelTitle"><span>Details<\/span><\/h2>/);
});

test('V2: the phone card header has one word link, Details (or Why? when there is no Details)', () => {
  assert.match(card, /where === 'in-head' && !m\.noDetails \? null : h\('button', \{ class: 'link', 'aria-label': 'Why\?'/);
  assert.ok(!/\.ac-foot\.in-head \.ac-link-text \{ display: none; \}/.test(css), 'the word shows');
  assert.match(css, /\.action-card\.docked \.ac-foot\.in-head \.link > \.mi-ic:first-child \{ display: none; \}/);
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
  assert.match(actions, /if \(range && \(p\?\.thrombus\?\.\[e\.id\] > 0 \|\| p\?\.stenosis\?\.\[e\.id\] > 0\)\) return \{ v: `\$\{fmt\(P1, 1\)\} → \$\{fmt\(P2, 1\)\}`, u: 'mmHg' \};/);
  assert.match(main, /edgeValue\(e, f, 'pressure', null\)\.v/, 'the hover tip keeps the one number');
});

test('V5: the status is a coloured word after the reading (card) and under the name (Details), never a pill', () => {
  assert.match(card, /const valEl = h\('div', \{ class: 'ac-value' \}, numEl, pillEl\);/);
  assert.ok(!/class: 'pill '/.test(card), 'card');
  assert.match(inspector, /h\('span', \{ class: 'st-word ' \+ cls\[0\] \}, cls\[1\]\)/);
  for (const c of ['ok', 'warn', 'rev', 'bad']) assert.match(css, new RegExp(`\\n\\.st-word\\.${c} \\{ color:`), c);
});

test('V6: a change reads "+10.0" as the callouts do: no arrow, one decimal, in the reading\'s colour', () => {
  assert.ok(!/[▲▼]/.test(actions));
  assert.match(actions, /signed\(P - r, fmt\(Math\.abs\(P - r\), 1\)\)/);
  assert.match(css, /\n\.ac-delta\.up, \.ac-delta\.down \{ color: var\(--text\); \}/);
});

test('V8: a card slider\'s value stays in ink when changed; the accent is on the slider only', () => {
  assert.ok(!/\.ac-slider\.changed \.ctl-val/.test(css));
});

test('V9: a vessel, compartment or organ is the Details title; no "Live values" heading', () => {
  assert.ok(!/'Live values'/.test(inspector));
  assert.match(main, /\$\('#panelTitle'\)\?\.classList\.toggle\('sr-only', named\)/);
  assert.match(main, /const named = \['edge', 'node', 'organ'\]\.includes\(d\?\.type\);/);
});
