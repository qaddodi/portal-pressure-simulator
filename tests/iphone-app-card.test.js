// An iPhone opened from the Home Screen: the phone's teaching card drops to the screen's edge with concentric bottom corners
// (class `iphone-app`); in Safari it keeps its place above the bar and its 18 px corners. Every bottom offset of the stacked slide
// goes through --pz-sb, so the card, its words, the controls pill and the jump list move together.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
const rule = (sel) => css.split('\n').find((l) => l.startsWith(`${sel} {`)) || '';

test('Safari keeps the safe-area offset and the 18 px card corners', () => {
  assert.match(css, /--pz-sb: env\(safe-area-inset-bottom, 0px\); --pz-card-br: 18px;/);
});

test('installed on an iPhone the bottom offset is 0 and the card follows the screen corner', () => {
  assert.match(rule(':root.iphone-app'), /--pz-sb: 0px; --pz-card-br: calc\(var\(--screen-r\) - 8px\)/);
  assert.match(css, /--screen-r: 55px/);
});

test('the stacked slide takes every bottom offset from --pz-sb', () => {
  for (const sel of ['.pz-shade.stack', '.pz.stack .pz-text', '.pz.stack .pz-bar', '.pz.stack .pz-panel', '.pz.stack .pz-jump']) {
    const r = rule(sel);
    assert.ok(r.includes('var(--pz-sb)'), `${sel} no longer uses --pz-sb`);
    assert.ok(!r.includes('safe-area-inset-bottom'), `${sel} still reads the safe area directly`);
  }
  assert.match(rule('.pz-shade.stack'), /--pz-r: 18px;[^}]*border-radius: var\(--pz-r\) var\(--pz-r\) var\(--pz-card-br\) var\(--pz-card-br\)/);
});

test('the class is set only for an iPhone running as an installed app', () => {
  assert.match(main, /toggle\('iphone-app', \/iPhone\|iPod\/\.test\(navigator\.userAgent\) && \(appMQ\.matches \|\| navigator\.standalone === true\)\)/);
});
