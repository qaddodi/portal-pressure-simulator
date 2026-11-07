// Search (Ctrl K): one highlight glides to the active row, and a move of the arrow keys or the pointer no longer rebuilds the list.
// Wiring is read from source, as the repo's other review tests do; the browser check in tests/e2e/smoke.mjs drives it for real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const pal = read('src/ui/palette.js'), css = read('styles/app.css');

test('the list always has the one highlight element, and the row paints no highlight of its own', () => {
  assert.doesNotMatch(pal, /GLIDE|palglide/);
  assert.match(pal, /const hl = h\('div', \{ class: 'pal-glide', 'aria-hidden': 'true' \}\);/);
  assert.match(pal, /class: 'pal-list glides'/);
  assert.match(css, /\.pal-list\.glides \.pal-item\.on \{ background: transparent; \}/);
  assert.match(pal, /list\.replaceChildren\(hl, /);
});

test('the arrow keys and the pointer move the highlight, they do not rebuild the list', () => {
  const mv = pal.slice(pal.indexOf('function move('), pal.indexOf('function run('));
  assert.doesNotMatch(mv.slice(mv.indexOf('if (i === sel')), /renderList|replaceChildren/, 'a move past the off path touches no children');
  assert.match(mv, /sel = i; mark\(\); syncActive\(\); place\(true\);/);
  assert.match(pal, /move\(Math\.min\(items\.length - 1, sel \+ 1\), true\)/);
  assert.match(pal, /move\(Math\.max\(0, sel - 1\), true\)/);
  assert.match(pal, /\{ block: 'nearest', behavior: scrollBehavior\(\) \}/, 'the active row scrolls into view smoothly (instantly with Reduce Motion)');
  // the pointer: a move to another row only moves the highlight; the same spot twice (a list scrolling under it) is ignored
  assert.match(pal, /if \(e\.clientX === ptX && e\.clientY === ptY\) return;[\s\S]*?move\(i, false\);/);
});

test('the list is rebuilt only when the results change; a new query puts the highlight on the first row with no glide', () => {
  assert.match(pal, /if \(key === shownKey && list\.isConnected && !back\.hidden\) \{ mark\(\); place\(false\); syncActive\(\); return; \}/);
  assert.match(pal, /input\.addEventListener\('input', \(\) => \{ sel = 0; renderList\(\); \}\);/);
  assert.match(pal, /const snap = !glide \|\| hl\.style\.opacity !== '1';/);
  assert.match(pal, /hl\.classList\.add\('still'\)/);
  assert.match(pal, /list\.animate\(\{ opacity: \[0\.35, 1\] \}, \{ duration: D_FLIP, easing: EASE_ARRIVE \}\)/, 'one fade for the list, no per-row stagger');
});

test('the highlight is the row look it replaces, glides on the scale, and does not travel with Reduce Motion', () => {
  const rule = (sel) => css.match(new RegExp(`^${sel.replace(/[.\\]/g, '\\$&')} \\{[^}]*\\}`, 'm'))?.[0] || '';
  const g = rule('.pal-glide');
  assert.match(g, /background: var\(--accent-soft\)/);
  assert.match(g, /border-radius: var\(--r-card\)/);
  // (Since the off-GPU gate it stretches by scale on the compositor, its size laid out once: no width or height eases.)
  assert.match(g, /transform-origin: 0 0; transition: translate var\(--d-flip\) var\(--ease-move\), scale var\(--d-flip\) var\(--ease-move\)/);
  assert.doesNotMatch(g, /(width|height) var\(--d-flip\)/);
  assert.match(g, /pointer-events: none/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.pal-glide \{ transition: none; \} \}/);
  assert.match(css, /@media \(forced-colors: active\) \{\n\s{2}\.pal-glide \{ display: none; \}/);
});

test('the combobox, listbox and option semantics are unchanged', () => {
  assert.match(pal, /role: 'combobox', 'aria-autocomplete': 'list', 'aria-controls': 'pal-list', 'aria-expanded': 'true'/);
  assert.match(pal, /id: 'pal-list', role: 'listbox'/);
  assert.match(pal, /id: `pal-opt-\$\{i\}`, tabindex: '-1', role: 'option', 'aria-selected': String\(i === sel\)/);
  assert.match(pal, /attrSoon\(input, 'aria-activedescendant', items\.length \? optId\(sel\) : null\)/);
  assert.match(pal, /else if \(e\.key === 'Enter'\) \{ e\.preventDefault\(\); run\(sel\); \}/, 'Enter runs the highlighted row');
  assert.match(pal, /'aria-hidden': 'true' \}\)/, 'the highlight is not announced');
});
