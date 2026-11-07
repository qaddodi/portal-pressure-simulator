// Review #31: every pointer move of a drag or pinch re-added a class the app already had, which still fires its
// MutationObservers (four of them), so the page was laid out again on each move (44 layouts in 30 moves, 2 with the guard).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');

test('#31 a drag adds stage-busy and figure-focus only when they are missing', () => {
  assert.match(main, /const busyArmed = \(\) => \{ armT = 0; if \(!app\.classList\.contains\('stage-busy'\)\) classSoon\(app, 'stage-busy', true\); \};/);
  assert.match(main, /armT = setTimeout\(busyArmed, BUSY_DELAY\);/);
  assert.match(main, /if \(!focused\) \{ focused = true; classSoon\(app, 'figure-focus', true\); \}/);
  assert.doesNotMatch(main, /\{ app\.classList\.add\('stage-busy'\)/);
  assert.doesNotMatch(main, /\) app\.classList\.add\('stage-busy'\); clearTimeout\(busyT\)/);
});

// Premium feel R7: the pieces dim only after 120 ms of motion, so a tap, or a drag over inside 120 ms, never dims anything; a
// gesture that ends while the dim is still waiting cancels it; the dim is .55 over 240 ms and the return 420 ms.
test('R7 the stage-busy class still arms only after 120 ms of motion (the pieces still step back to .55, as ink or as frosted plates)', () => {
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(main, /const BUSY_DELAY = 120;/);
  assert.match(main, /const busyEnd = \(ms\) => \{ if \(app\.classList\.contains\('stage-busy'\)\) busy\(ms\); else \{ clearTimeout\(armT\); armT = 0; clearTimeout\(busyT\); \} \};/);
  assert.match(main, /addEventListener\('pointerup', \(\) => \{ if \(down\) \{ down = null; busyEnd\(600\);/);
  assert.match(main, /addEventListener\('pointercancel', \(\) => \{ if \(down\) \{ down = null; busyEnd\(300\);/);
  // (3 Nov 2026: the frosted-plate cards still fade as a whole; every other piece fades its ink and keeps its glass whole.)
  assert.match(css, /\.app\.stage-busy :is\(\.panel, \.treat-card, \.instrument-workspace\.float-ui\)\.has-plate:not\(:hover\):not\(:focus-within\) \{ opacity: \.55; transition-duration: var\(--d-small, \.24s\); \}/);
  assert.match(css, /\.app\.stage-busy \.float-ui:not\(:hover\):not\(:focus-within\) :is\(#viewSeg > button, [^{]*\) \{ opacity: \.55; transition-duration: var\(--d-small, \.24s\); \}/);
  // (Never the whole of a piece whose glass is its own: that is see-through to the figure, tests/chrome-over-figure.test.js.)
  assert.doesNotMatch(css, /\.app\.stage-busy \.float-ui:not\(:hover\):not\(:focus-within\) \{ opacity/);
  assert.match(css, /\.float-ui, \.stage-fit, \.stage-rotate \{ transition: opacity var\(--d-surface, \.42s\) var\(--ease\); \}/);
  assert.doesNotMatch(css, /\.stage-busy[^{]*(?:\.stage-fit|\.stage-rotate|\.zoom-pill)[^{]*\{/);
  // Every piece the dim reaches eases its opacity: none of them may have a transition list without it.
  for (const sel of ['.panel { transform: none; transition: opacity', '.instrument-workspace.float-ui.fit { height: var(--fit-h); transition: opacity', '.panel, .treat-card { transform: none; transition: opacity']) assert.ok(css.includes(sel), sel);
});

// The menus' fade while the figure moves (stage-busy) changes only their opacity: its coming and going must not make the page
// measure and place every card, the credit and the framing again (the hitch as the menus faded back in after a pan, 21 Oct).
test('stage-busy alone never announces a new layout', () => {
  const credit = readFileSync(new URL('../src/ui/credit.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(main, /const appClass = \(\) => app\.className\.replace\(\/\(\?:\^\|\\s\)stage-busy\(\?=\\s\|\$\)\/g, ''\);/);
  assert.match(main, /new MutationObserver\(\(\) => \{ const c = appClass\(\); if \(c !== appCls\) \{ appCls = c; soon\(\); \} \}\)\.observe\(app,/);
  assert.match(main, /const sig = `\$\{appClass\(\)\}\|/);
  assert.doesNotMatch(main, /new MutationObserver\(soon\)\.observe\(app,/);
  assert.match(credit, /new MutationObserver\(\(\) => \{ const c = appCls\(\); if \(c !== appWas\) \{ appWas = c; soon\(\); \} \}\)\.observe\(app,/);
  // (Safe only while stage-busy styles nothing but opacity.)
  // (And its duration: transition-duration lays nothing out either.)
  for (const m of css.matchAll(/\.stage-busy[^{]*\{([^}]*)\}/g)) assert.match(m[1].trim(), /^opacity: [.\d]+;(?: transition-duration: var\(--d-small, \.24s\);)?$/, m[0]);
});
