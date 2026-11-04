import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Menu system plan W4 (4 Nov 2026): a phone's vessel or organ card is pulled, flicked and let go on the rules every sheet over the dock shares,
// by its plate and content's one offset (sheet-move.js), with no --sink written per move and no script-eased cut.
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const card = read('src/ui/card.js'), css = read('styles/app.css');

test("a vessel's card uses the shared sheet rules and the one sheet time", () => {
  assert.match(card, /isFlick\(dy, speed, [^\n]*, SHEET_FLICK_MIN, SHEET_FLICK_FAR\)/);
  assert.match(card, /Math\.min\(SHEET_CLOSE_PX, sizes\.h \* SHEET_CLOSE_SHARE\)/);
  assert.match(card, /glideSheet\(el, to, \{ easing: carryCurve\(speed, to - from, D_SMALL\), duration: D_SMALL/);
  assert.match(card, /if \(thumb\(\)\) dragSheet\(el, dy\);/);
});

test("a vessel's card writes no --sink and the stylesheet gives it a still cut", () => {
  assert.doesNotMatch(card, /setProperty\('--sink'|getPropertyValue\('--sink'\)/);
  assert.doesNotMatch(card, /sinkTo|stopSink/);
  const rule = /\.app\.thumb:not\(\.dock-open\) \.action-card\.docked \{[^}]*\}/.exec(css)[0];
  assert.doesNotMatch(rule, /--sink/);
  assert.match(rule, /clip-path: polygon\(/);
});
