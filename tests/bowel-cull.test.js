// The small bowel leaves out the pieces later loops hide (scripts/organ-art.mjs cullHidden), but names the tubes' width of the
// whole pile, so the gut glow (stage.js warmR) keeps the radius it had with every piece drawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOWEL_ART } from '../src/ui/organ-art.js';

test("the bowel names its whole pile's tube width for the glow", () => {
  const named = +BOWEL_ART.match(/data-edge-w="([\d.]+)"/)?.[1];
  assert.equal(named, 25.3);
  const pieces = (BOWEL_ART.match(/class="ob-edge"/g) || []).length;
  assert.ok(pieces > 200 && pieces < 342, `${pieces} pieces drawn`);
});
