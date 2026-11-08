// One menu-like surface, or one card under it, at a time (8 Nov 2026, Mohammad: "menus hate to be on top of each other"). A menu's GPU frost is drawn in the
// figure's canvas under the page, so a card lying under a menu shows through it: a menu coming in sends away the cards its box lies over, and a card
// coming in puts the open menus away. Read from the sources (no browser).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL('../src/ui/' + f, import.meta.url), 'utf8');

test('claimSurface tells main.js which surface opened', () => {
  const u = src('util.js');
  assert.match(u, /export function onSurfaceOpened\(fn\)/);
  assert.match(u, /surface = s; s\.armed = false;\n\s*surfaceOpened\?\.\(s\);/);
});

test('every surface that claims the keys says its box and what opened it', () => {
  assert.match(src('util.js'), /const me = \{ close: closePopover, has:[^}]*anchor, el, box:/);
  assert.match(src('menu.js'), /const surf = \{ anchor, get el\(\) \{ return el; \}, box:/);
  assert.match(src('why.js'), /const me = \{ get anchor\(\) \{ return anchorEl; \}, el: pop, box:/);
});

test('main.js sends away the cards under a surface, but not the card it came from, and puts menus away as a card opens', () => {
  const m = src('main.js');
  assert.match(m, /onSurfaceOpened\(cardsAway\);/);
  assert.match(m, /if \(s\.anchor && el\.contains\(s\.anchor\)\) \{ under = true; continue; \}/);
  assert.match(m, /if \(!panelShown\(\)\) surfacesAway\(\);/);
  assert.match(m, /if \(instr && !was\) \{ surfacesAway\(\); giveWay\('dock'\); \}/);
});

test('a menu opened from inside a card, over it, keeps a plain fill so the card does not show through', () => {
  assert.match(src('main.js'), /if \(s\.anchor && el\.contains\(s\.anchor\)\) \{ under = true; continue; \}/);
  assert.match(src('main.js'), /s\.el\?\.classList\.toggle\('over-card', under\);/);
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /:root:root :is\(\.menu, \.why-pop\)\.over-card\[data-gl\] \{ background: var\(--surface\);/);
});
