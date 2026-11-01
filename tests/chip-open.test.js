import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Menu chips answer their menu (1 Nov 2026, Sonnet sprint brief 3): Blood, Layers and the lens chip turn their chevron over
// and hold the pressed tint while their menu is open; a switch's thumb widens under a finger. ?chipopen=0 leaves all of it off.

const CSS = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const MAIN = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
const UTIL = readFileSync(new URL('../src/ui/util.js', import.meta.url), 'utf8');
const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('the lens chip (a div role="button") carries aria-expanded while its menu is open', () => {
  assert.match(HTML, /<div class="lens-btn" id="btnLayers" role="button"[^>]*aria-haspopup="dialog"/);
  // popover() sets it on whatever anchors the menu, and clears it on every way out (Escape, outside tap, another menu opening).
  assert.match(UTIL, /anchor\.setAttribute\('aria-expanded', 'true'\)/);
  assert.match(UTIL, /openMenu\.anchor\.setAttribute\('aria-expanded', 'false'\)/);
  assert.match(UTIL, /if \(openMenu\) \{ const same = openMenu\.anchor === anchor; closePopover\(\)/);
  // It starts as "false" on the three chips (the flag on).
  assert.match(MAIN, /for \(const id of \['btnBlood', 'btnLobuleLayers', 'btnLayers'\]\) \$\('#' \+ id\)\.setAttribute\('aria-expanded', 'false'\)/);
});

test('?chipopen=0 turns it all off: the CSS hangs on html.chip-open, which main.js adds unless the flag is 0', () => {
  assert.match(MAIN, /!\/\[\?&\]chipopen=0\\b\/\.test\(location\.search\)\) \{ document\.documentElement\.classList\.add\('chip-open'\)/);
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
  assert.match(CSS, /\.switch span::after \{[^}]*transition: transform var\(--d-small\) var\(--ease\), width var\(--d-flip\) var\(--ease\);/);
  const m = CSS.match(/@media \(prefers-reduced-motion: no-preference\) \{\s*html\.chip-open \.switch input:active:not\(:disabled\) \+ span::after \{ width: 20px; \}\s*html\.chip-open \.switch input:checked:active:not\(:disabled\) \+ span::after \{ transform: translateX\(10px\); \}/);
  assert.ok(m, 'press rules');
  // Track 34 wide, thumb 2 px in: unchecked 2..22; checked 12..32 (the rest position's right edge is 32).
  assert.equal(10 + 2 + 20, 34 - 2);
  // Settings' and the menus' switches (.mt-sw), the card's and instrument panel's: the same cue, thumb and travel to match.
  for (const [pressed, w] of [['.lens-opt:active .mt-sw::after', 16], ['.ac-toggle:active:not(:disabled) .switch-vis i', 18], ['.ab-tg:active:not(:disabled) .switch-vis i', 22]]) {
    assert.ok(CSS.includes(`html.chip-open ${pressed} { width: ${w}px; }`), pressed);
  }
  for (const rule of ['.lens-opt .mt-sw::after {', '.ac-toggle .switch-vis i {', '.ab-tg .switch-vis i {', '.ab-dp-alb .switch-vis i {']) {
    const line = CSS.split('\n').find((l) => l.startsWith(rule));
    assert.match(line, /transition: transform var\(--d-small\) var\(--ease\), width var\(--d-flip\) var\(--ease\);/, rule);
  }
});
