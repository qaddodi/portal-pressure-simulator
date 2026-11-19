// LOOK-11 (bible review, 19 Nov 2026): a rule written for the chosen Dark look (`:root[data-theme="dark"] X`) must have its System-dark twin
// (`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]):not([data-theme="soft"]) X }`), or a phone that follows the system looks
// different from one that chose Dark (the lobule zone numbers were 700 in Dark and 600 in System-dark).
import test from 'node:test';
import assert from 'node:assert/strict';
import { appCss } from './split-src.js';

const SYS = ':root:not([data-theme="light"]):not([data-theme="soft"])';

test('every top-level :root[data-theme="dark"] rule has its System-dark twin', () => {
  const css = appCss();
  const missing = [];
  let seen = 0;
  for (const m of css.matchAll(/^:root\[data-theme="dark"\] ([^{\n]+?) \{/gm)) {
    for (const sel of m[1].split(', :root[data-theme="dark"] ')) {
      seen++;
      if (!css.includes(`${SYS} ${sel}`)) missing.push(sel);
    }
  }
  assert.ok(seen >= 8, `${seen} dark rules found`);
  assert.deepEqual(missing, []);
});

test('the deck balance answer\'s rising value can be amber (the selector must match a .gc-ans > b)', () => {
  const css = appCss();
  assert.match(css, /\.gc-ans > b\[data-dir="up"\] \{ color: var\(--caution-ink\); \}/);
  assert.doesNotMatch(css, /\.gc-ans\[data-dir="up"\] \.gc-ans/);
});
