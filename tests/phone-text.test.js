// Phone text and labels (review 15 Oct, #23, #48-#51): the figure's captions and the catheter callouts' small words are 12 px
// on a phone too, the meal chart's words never zoom under 12 px with its card, the FibroScan probe stands steeper beside the
// screen's edge so its reading stays on screen, figure labels keep off the teaching card's glass, and a phone held sideways
// keeps a short clock in its play row. (The browser checks judge them on screen: tests/e2e/phone-fit.mjs, smoke.mjs.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLES } from '../src/ui/type-scale.js';
import { appCss } from './split-src.js';

const css = appCss();

test('captions are 12 px on every screen, the SVG labels as the stylesheet', () => {
  assert.deepEqual(ROLES.cap, [12, 12]);
});




test('a phone held sideways shows the short clock in its play row', () => {
  const at = css.indexOf('@media (max-width: 1023px) and (max-height: 500px) and (orientation: landscape) {\n  .vdock .stage-bar.bottom');
  assert.ok(at > 0, 'the sideways phone block was not found');
});

