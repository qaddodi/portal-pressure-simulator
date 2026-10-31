// Premium feel R16 (the phone's stacked card, audited 31 Oct, code only): every offset from the screen's bottom edge that a stacked card's
// pieces set takes the safe area (--pz-sb: the home indicator's inset, plus 20 px on a phone where the card has no tab), so the card, its
// words, its bar, its jump list, its colour key and its panel keep one rhythm to the bottom edge in every state. The offsets inside the
// card (the credit line, the grip, the readings' card behind it) are measured from the card, not the screen, and are not in this list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// (Every rule that starts a line with exactly this selector; a piece may have several, only one of which places it.)
const bodies = (sel) => {
  const out = [];
  for (let at = css.indexOf(`\n${sel} {`); at >= 0; at = css.indexOf(`\n${sel} {`, at + 1)) out.push(css.slice(at, css.indexOf('}', at)));
  assert.ok(out.length, `${sel} has a rule`);
  return out;
};

test('R16 each stacked-card piece measures its bottom offset through --pz-sb', () => {
  for (const sel of ['.pz-shade.stack', '.pz-shade.stack.tab', '.pz.stack .pz-text', '.pz.stack.tab .pz-text', '.pz.stack .pz-panel', '.pz.stack .pz-bar', '.pz.stack.tab .pz-bar',
    '.pz.stack .pz-jump', '.pz.stack .pz-fk', '.pz.stack.fk-up .pz-fk']) {
    assert.ok(bodies(sel).some((b) => /(?<![-\w])bottom: calc\([^;]*var\(--pz-sb\)\)/.test(b)), `${sel}: bottom takes the safe area`);
  }
});

test('R16 the safe area is one custom property, set once per state', () => {
  assert.match(css, /--pz-sb: env\(safe-area-inset-bottom, 0px\);/, 'the inset itself');
  assert.match(css, /\.pz\.stack:not\(\.tab\) \{ --pz-sb: calc\(env\(safe-area-inset-bottom, 0px\) \+ 20px\); \}/, 'a phone card with no tab keeps 20 px more');
  assert.match(css, /:root\.iphone-app \.pz\.stack:not\(\.tab\) \{ --pz-sb: 20px; \}/, 'the installed app, whose screen already ends above the inset');
});
