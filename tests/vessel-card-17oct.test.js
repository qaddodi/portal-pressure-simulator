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
