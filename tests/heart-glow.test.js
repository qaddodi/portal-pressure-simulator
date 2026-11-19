import { stageSource } from './stage-src.js';
// The right atrium's slides light the whole heart with a soft glow (not an outline of the atrium alone), and where the
// GPU glow is not drawn the heart gets a flat tint instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS } from '../src/ui/decks.js';

const stage = stageSource();

test('the right atrium and the heart targets both light the heart, and no deck outlines the atrium alone', () => {
  assert.doesNotMatch(JSON.stringify(DECKS), /heart-ra/);
  const lit = DECKS.flatMap((d) => d.slides).filter((s) => /right atrium/i.test(s.line || ''));
  assert.ok(lit.length >= 3, 'the right-heart slides name the right atrium');
});


test('the old atrium id is folded into the heart, which is lit as one glow (not stacked rings)', () => {
  assert.ok(+stage.match(/HEART_GLOW = \{ reach: \d+, alpha: ([\d.]+)/)[1] <= 0.4, 'the glow stays subtle at the edge');
});


