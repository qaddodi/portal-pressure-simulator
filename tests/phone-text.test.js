// Phone text and labels (review 15 Oct, #23, #48-#51): the figure's captions and the catheter callouts' small words are 12 px
// on a phone too, the meal chart's words never zoom under 12 px with its card, the FibroScan probe stands steeper beside the
// screen's edge so its reading stays on screen, figure labels keep off the teaching card's glass, and a phone held sideways
// keeps a short clock in its play row. (The browser checks judge them on screen: tests/e2e/phone-fit.mjs, smoke.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROLES } from '../src/ui/type-scale.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../styles/app.css'), tokens = read('../styles/tokens.css'), stage = read('../src/ui/stage.js'), flow = read('../src/ui/flow-time.js');

test('captions are 12 px on every screen, the SVG labels as the stylesheet', () => {
  assert.match(tokens, /--t-cap: 12px;/);
  assert.deepEqual(ROLES.cap, [12, 12]);
  assert.doesNotMatch(css, /\.cath-label small, \.cath-label b \+ span \{ font-size: 11px; \}/);
  assert.match(css, /\.scan-probe \.sp-unit \{ font-size: 12px;/);
});

test('the meal chart sets its words larger by its card\'s zoom, to 12 px at least', () => {
  assert.match(flow, /const FT_MIN = 12;/);
  assert.match(flow, /FT_MIN \/ z/);
  assert.match(flow, /font-size: \$\{G\.f\.toFixed\(2\)\}px/);
});

test('the FibroScan probe turns steeper beside the left edge, flatter below the top edge, and its card check uses the same angle', () => {
  assert.match(css, /\.scan-probe svg \{[^}]*rotate\(var\(--sp-turn, 45deg\)\)/);
  assert.match(stage, /function scanTurn\(tx, y = Infinity\)/);
  assert.match(stage, /while \(deg > 10 && !top\(deg\) && bodyLeft\(deg - 5\)\) deg -= 5;/);
  assert.match(stage, /scan\.deg \* Math\.PI \/ 180/);
});

test('figure labels keep off the teaching card\'s glass', () => {
  assert.match(stage, /querySelectorAll\('\.stage-blocker:not\(\[hidden\]\), \.pz-shade, #nbViews'\)/);
});

test('a phone held sideways shows the short clock in its play row', () => {
  const at = css.indexOf('@media (max-width: 1023px) and (max-height: 500px) and (orientation: landscape) {\n  .vdock .stage-bar.bottom');
  assert.ok(at > 0, 'the sideways phone block was not found');
  const block = css.slice(at, css.indexOf('\n}\n', at));
  assert.match(block, /\.vdock \.tl-time \{ display: inline;/);
  assert.match(block, /\.vdock \.tl-time \.tl-t-short \{ display: inline; \}/);
  assert.doesNotMatch(block, /\.tl-time \{ display: none/);
});

test('a phone\'s six site ladders share one row of names (the bottom row\'s) and letter at their own size', () => {
  const js = read('../src/ui/presenter.js');
  assert.match(js, /return !gridOwn\(el\) \|\| !c \|\| c\.offsetTop >= last\.offsetTop - 2;/);
  assert.doesNotMatch(js, /pz-grid-head/);
  assert.match(css, /:is\(\.pz\.stack, \.pz\.low\) \.pz-grid \{ --pk: 1\.15;/);
});
