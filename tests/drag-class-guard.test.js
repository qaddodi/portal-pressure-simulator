// Review #31: every pointer move of a drag or pinch re-added a class the app already had, which still fires its
// MutationObservers (four of them), so the page was laid out again on each move (44 layouts in 30 moves, 2 with the guard).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');

test('#31 a drag adds stage-busy and figure-focus only when they are missing', () => {
  assert.match(main, /const busy = \(ms\) => \{ if \(!app\.classList\.contains\('stage-busy'\)\) app\.classList\.add\('stage-busy'\);/);
  assert.match(main, /if \(!app\.classList\.contains\('figure-focus'\)\) app\.classList\.add\('figure-focus'\);/);
  assert.doesNotMatch(main, /\{ app\.classList\.add\('stage-busy'\)/);
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
  for (const m of css.matchAll(/\.stage-busy[^{]*\{([^}]*)\}/g)) assert.match(m[1].trim(), /^opacity: [.\d]+;$/, m[0]);
});
