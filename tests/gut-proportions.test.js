import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gutPath } from '../src/ui/gut-proportions.js';
import { COLON_ART, COLON_RING, BOWEL_ART, BOWEL_RING } from '../src/ui/organ-art.js';
import { COLON_OUTLINE, BOWEL_OUTLINE } from '../scripts/organ-art/outlines.mjs';

test('the gut stretch preserves the upper attachments and horizontal coordinates', () => {
  assert.equal(gutPath('M468 556 C500 592 530 622 560 636 L462 905'), 'M468 556 C500 592 530 623.8 560 638.9 L462 929.4');
});

test('the generated gut artwork and highlight rings share the stretched outline', () => {
  for (const [art, ring, outline, clip] of [[COLON_ART, COLON_RING, COLON_OUTLINE, 'oc-his'], [BOWEL_ART, BOWEL_RING, BOWEL_OUTLINE, 'ob-his']]) {
    assert.equal(ring, gutPath(outline));
    assert.ok(art.includes(`<clipPath id="${clip}"><path d="${ring}"/></clipPath>`), 'the art clips to its highlight ring');
  }
});
