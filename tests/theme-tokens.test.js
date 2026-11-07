// src/ui/theme-tokens.js: the table styles/tokens.css is printed from, and the lookup the chart resolver reads. These checks hold the lookup
// (which look a page state is, how a palette stacks on Dark, what the Circuit map re-defines) and the printed sheet's shape. That the file on disk
// equals the printed sheet is `npm run check:theme`, part of lint.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOKENS, CIRCUIT, LOOK_IDS, lookIdOf, tokensFor, tokensOfLook } from '../src/ui/theme-tokens.js';
import { printed } from '../scripts/gen-theme-css.mjs';

test('a page state names one look: a chosen look, a palette of Dark, or System on the device\'s own setting', () => {
  assert.deepEqual(LOOK_IDS, ['light', 'soft', 'dark', 'navy', 'black']);
  assert.equal(lookIdOf({ theme: 'light' }), 'light');
  assert.equal(lookIdOf({ theme: 'soft' }), 'soft');
  assert.equal(lookIdOf({ theme: 'dark' }), 'dark');
  assert.equal(lookIdOf({ theme: 'dark', palette: 'navy' }), 'navy');
  assert.equal(lookIdOf({ theme: 'dark', palette: 'black', dark: true }), 'black');
  assert.equal(lookIdOf({ theme: null, dark: true }), 'dark', 'System on a dark device');
  assert.equal(lookIdOf({ theme: null, dark: false }), 'light', 'System on a light device');
  assert.equal(lookIdOf({ theme: 'light', palette: 'navy' }), 'light', 'a palette belongs to Dark only');
  assert.equal(lookIdOf(null), 'light');
});

test('a look is its parent\'s tokens with its own on top, and a palette starts from Dark', () => {
  const light = tokensOfLook('light'), soft = tokensOfLook('soft'), dark = tokensOfLook('dark'), navy = tokensOfLook('navy');
  assert.equal(soft.text, TOKENS.soft.text);
  assert.equal(soft.caution, TOKENS.soft.caution);
  assert.equal(soft.border, TOKENS.soft.border);
  assert.equal(soft['text-inverse'], light['text-inverse'], 'a token Soft leaves alone is Light\'s');
  assert.equal(navy.bg, TOKENS.navy.bg);
  assert.equal(navy.accent, dark.accent, 'Navy keeps Dark\'s accent');
  assert.equal(navy.ok, dark.ok);
  for (const id of LOOK_IDS) assert.equal('from' in tokensOfLook(id), false, `${id}: the parent link is not a token`);
  // every look carries every token Light has (a look cannot lose one)
  for (const id of LOOK_IDS) for (const k of Object.keys(TOKENS.light)) assert.ok(k in tokensOfLook(id), `${id} has ${k}`);
});

test('the Circuit map re-defines tokens in the dark looks only (Light and Soft keep the page\'s)', () => {
  const dark = tokensOfLook('dark'), map = tokensFor({ theme: 'dark', view: 'circuit' });
  assert.equal(map['stage-bg'], CIRCUIT.dark['stage-bg']);
  assert.notEqual(map['stage-bg'], dark['stage-bg']);
  assert.equal(tokensFor({ theme: 'dark', view: 'anatomy' }), dark, 'another view is the page\'s own tokens');
  assert.equal(tokensFor({ theme: 'light', view: 'circuit' })['stage-bg'], tokensOfLook('light')['stage-bg']);
  assert.equal(tokensFor({ theme: 'light', view: 'circuit' })['map-dot'], CIRCUIT.light['map-dot']);
  assert.equal(tokensFor({ theme: 'dark', palette: 'navy', view: 'circuit' })['stage-bg'], CIRCUIT.navy['stage-bg'], 'a palette\'s map block wins over Dark\'s');
  assert.equal(tokensFor({ theme: 'dark', palette: 'navy', view: 'circuit' })['artery'], CIRCUIT.dark.artery, 'and Dark\'s map block still shows through');
  assert.equal(tokensFor({ theme: 'dark', view: 'circuit' }), tokensFor({ theme: 'dark', view: 'circuit' }), 'memoised: one object each time');
});

test('the printed stylesheet has Light, the system dark theme, Dark, Soft, both palettes, the map blocks and the tiles, in the order tokens.css always had', () => {
  const css = printed();
  const order = [':root {', '@media (prefers-color-scheme: dark) {', ':root[data-theme="dark"] {', ':root[data-theme="soft"] {', '.stage-wrap.cmap {',
    ':root[data-theme="dark"] .stage-wrap.cmap {', ':root[data-theme="dark"][data-palette="navy"] {', ':root[data-theme="dark"][data-palette="navy"] .stage-wrap.cmap {',
    ':root[data-theme="dark"][data-palette="black"] {', ':root[data-theme="dark"][data-palette="black"] .stage-wrap.cmap {'];
  let at = -1;
  for (const sel of order) { const i = css.indexOf(sel, at + 1); assert.ok(i > at, `${sel} comes after the one before it`); at = i; }
  for (const id of LOOK_IDS) {
    const t = tokensOfLook(id);
    for (const [tile, key] of [['bg', 'bg'], ['card', 'surface'], ['ink', 'text'], ['accent', 'accent']]) assert.ok(css.includes(`--look-${id}-${tile}: ${t[key]};`), `${id} tile ${tile}`);
  }
  assert.ok(css.includes(`--bg: ${TOKENS.dark.bg};`));
  assert.ok(css.includes(`color-scheme: ${TOKENS.dark['color-scheme']};`), 'color-scheme is printed as the property, not a custom property');
  assert.ok(!css.includes('--from'), 'the parent link is not printed');
});

test('a chart in Dark (no data-palette) takes Dark\'s tokens, not Navy\'s', async () => {
  const { makeCtx } = await import('../src/ui/chart-looks/resolve.js');
  const attrs = { 'data-theme': 'dark' };
  const was = globalThis.document;
  globalThis.document = { documentElement: { getAttribute: (n) => (n in attrs ? attrs[n] : null) } };
  try {
    assert.equal(lookIdOf(makeCtx()), 'dark');
    assert.equal(tokensFor(makeCtx()).bg, TOKENS.dark.bg ?? tokensOfLook('dark').bg);
    attrs['data-palette'] = 'navy';
    assert.equal(lookIdOf(makeCtx()), 'navy');
    attrs['data-palette'] = 'black';
    assert.equal(lookIdOf(makeCtx()), 'black');
  } finally { if (was === undefined) delete globalThis.document; else globalThis.document = was; }
});
