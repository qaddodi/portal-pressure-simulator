import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Menu chips answer their menu (1 Nov 2026, Sonnet sprint brief 3): Blood, Layers and the lens chip turn their chevron over
// and hold the pressed tint while their menu is open; a switch's thumb widens under a finger.

const CSS = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const MAIN = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
const UTIL = readFileSync(new URL('../src/ui/util.js', import.meta.url), 'utf8');
const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('the lens chip (a div role="button") carries aria-expanded while its menu is open', () => {
  assert.match(HTML, /<div class="lens-btn" id="btnLayers" role="button"[^>]*aria-haspopup="dialog"/);
  // popover() sets it on whatever anchors the menu, and clears it on every way out (Escape, outside tap, another menu opening).
  assert.match(UTIL, /restAttr\(anchor, 'aria-expanded', 'true'\)/);
  assert.match(UTIL, /restAttr\(openMenu\.anchor, 'aria-expanded', 'false'\)/);
  assert.match(UTIL, /if \(openMenu\) \{ const same = openMenu\.anchor === anchor; closePopover\(\)/);
  // It starts as "false" on the three chips.
  assert.match(MAIN, /for \(const id of \['btnBlood', 'btnLobuleLayers', 'btnLayers'\]\) \$\('#' \+ id\)\.setAttribute\('aria-expanded', 'false'\)/);
});

test('the CSS hangs on html.chip-open, which main.js adds', () => {
  assert.match(MAIN, /\n {2}document\.documentElement\.classList\.add\('chip-open'\); for \(const id of/);
  const rules = CSS.split('\n').filter((l) => /chip-open/.test(l) && /\{/.test(l));
  assert.ok(rules.length >= 5);
  for (const l of rules) assert.match(l, /html\.chip-open/);
});

test('the chevron turns with `rotate` over --d-small on --ease-move, and not at all under Reduce Motion', () => {
  assert.match(CSS, /html\.chip-open \.chip-btn \.chev, html\.chip-open \.lens-btn \.chev \{ transition: rotate var\(--d-small\) var\(--ease-move\); \}/);
  assert.match(CSS, /html\.chip-open :is\(\.chip-btn, \.lens-btn\)\[aria-expanded="true"\] \.chev \{ rotate: 180deg; \}/);
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\) \{ html\.chip-open :is\(\.chip-btn, \.lens-btn\) \.chev \{ transition: none; rotate: none; \} \}/);
});

test('the open chip holds --surface-2 with no border or ring, also inside the top bar', () => {
  assert.match(CSS, /html\.chip-open :is\(\.chip-btn, \.lens-btn\)\[aria-expanded="true"\] \{ background: var\(--surface-2\); \}/);
  assert.match(CSS, /html\.chip-open \.topbar \.sb-right > \.chip-btn\[aria-expanded="true"\], html\.chip-open \.topbar \.sb-right \.lens-btn\[aria-expanded="true"\] \{ background: var\(--surface-2\); \}/);
  for (const l of CSS.split('\n').filter((x) => /chip-open.*aria-expanded="true"\] \{/.test(x))) assert.doesNotMatch(l, /border|outline|box-shadow/);
});

test('a switch thumb widens 4 px toward its travel under a finger (left for a checked one), only without Reduce Motion', () => {
  // (Since the off-GPU gate: a stretch on the compositor, scaleX from the edge it leaves, not a width laid out again.)
  assert.match(CSS, /\.switch span::after \{[^}]*transition: transform var\(--d-small\) var\(--ease\); transform-origin: left center;/);
  assert.match(CSS, /\.switch input:checked \+ span::after \{ transform: translateX\(14px\); transform-origin: right center; \}/);
  const m = CSS.match(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?html\.chip-open \.switch input:active:not\(:disabled\) \+ span::after \{ transform: scaleX\(1\.25\); \}\s*html\.chip-open \.switch input:checked:active:not\(:disabled\) \+ span::after \{ transform: translateX\(14px\) scaleX\(1\.25\); \}/);
  assert.ok(m, 'press rules');
  // Track 34 wide, thumb 16 from 2 px in: unchecked 2..22 (16 x 1.25 = 20 from its left edge); checked 12..32 (from its right edge, 32).
  assert.equal(2 + 16 * 1.25, 22); assert.equal(2 + 14 + 16 - 16 * 1.25, 12);
  for (const [pressed, s, w] of [['.lens-opt:active .mt-sw::after', '1.3333', 12], ['.ac-toggle:active:not(:disabled) .switch-vis i', '1.2857', 14], ['.ab-tg:active:not(:disabled) .switch-vis i', '1.2222', 18]]) {
    assert.ok(CSS.includes(`html.chip-open ${pressed} { transform: scaleX(${s}); }`), pressed);
    assert.ok(Math.abs(w * +s - (w + 4)) < 0.01, `${pressed}: 4 px wider`);
  }
  for (const rule of ['.lens-opt .mt-sw::after {', '.ac-toggle .switch-vis i {', '.ab-tg .switch-vis i {', '.ab-dp-alb .switch-vis i {']) {
    const line = CSS.split('\n').find((l) => l.startsWith(rule));
    assert.match(line, /transition: transform var\(--d-small\) var\(--ease\); transform-origin: left center;/, rule);
    assert.doesNotMatch(line, /width var\(/, rule);
  }
});
