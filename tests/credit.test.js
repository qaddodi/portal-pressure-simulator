// The copyright credit must ship on every build, drawn over the figure in every view and never covered by it or by a
// card: cards and sheets leave the corner clear (the credit rises above a docked card, a sheet or a stacked slide card),
// and only a full-screen menu, popover or dialog may pass over it while open. A merge once dropped the markup and the credit vanished without any error, so the markup, its
// place in the page and its layer are all checked here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const CREDIT = '<div class="stage-credit" aria-hidden="true">&copy; 2026 Mohammad Almeqdadi, MD</div>';

test('copyright credit markup is in index.html', () => {
  assert.match(html, /<meta name="copyright" content="&copy; 2026 Mohammad Almeqdadi, MD" \/>/);
  assert.ok(html.includes(CREDIT), 'the credit element is missing');
});

test('copyright credit sits in the stage, right after the figure', () => {
  // Inside the stage view, layers added later (the lobule) would cover it; outside the stage, it would no longer share
  // a layer with the figure. Cards, sheets and the dock follow it in the stage, and menus and dialogs live in the body.
  const view = html.indexOf('<div class="stage-view" id="stageView">');
  assert.ok(view >= 0, 'the stage view was not found');
  let depth = 0;
  let end = -1;
  for (const m of html.slice(view).matchAll(/<div\b|<\/div>/g)) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (!depth) { end = view + m.index; break; }
  }
  const at = html.indexOf(CREDIT);
  assert.ok(end > view && at > end && at < html.indexOf('</main>'), 'the credit must follow the stage view inside the stage');
});

test('copyright credit is on the figure layer, rides above docked cards and sheets, and never takes a tap', () => {
  const rule = css.match(/\.stage-credit \{[^}]*\}/)?.[0] ?? '';
  assert.match(rule, /z-index: var\(--z-figure\);/);
  assert.match(rule, /pointer-events: none;/);
  assert.match(rule, /var\(--sheet-h, 0px\)/, 'a docked card lifts the credit');
  assert.match(rule, /var\(--panel-h, 0px\)/, 'the phone chart sheet lifts the credit');
});

test('while presenting, the credit sits over the slide veil and rises above a stacked data card', () => {
  assert.match(css, /\.app\.presenting \.stage-credit \{ bottom: max\(14px, var\(--sheet-h, 0px\)\); z-index: calc\(var\(--z-hud\) \+ 1\); \}/);
  assert.match(css, /\.app\.presenting:has\(\.pz\.stack\) \.stage-credit \{ bottom: max\([^;]*var\(--sheet-h, 0px\)\)/);
});

test('copyright credit shrinks while a card sits beneath it', () => {
  assert.match(css, /\.stage-credit\.busy \{ font-size: calc\(var\(--fs-12\) - 1\.5px\);/);
  assert.match(css, /\.stage-credit \{[^}]*font-size: 10\.5px/);
});
