// The copyright credit must ship on every build: its markup in index.html and its top-layer rule in app.css.
// A merge once dropped the markup, and the credit vanished without any error, so both are checked here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');

test('copyright credit markup is in index.html', () => {
  assert.match(html, /<meta name="copyright" content="&copy; 2026 Mohammad Almeqdadi, MD" \/>/);
  assert.match(html, /<div class="stage-credit" aria-hidden="true">&copy; 2026 Mohammad Almeqdadi, MD<\/div>/);
});

test('copyright credit sits above every layer and never takes a tap', () => {
  const rule = css.match(/\.stage-credit \{[^}]*\}/)?.[0] ?? '';
  assert.match(rule, /z-index: 2147483647;/);
  assert.match(rule, /pointer-events: none;/);
});
