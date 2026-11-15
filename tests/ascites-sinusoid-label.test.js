// "Ascites: why it forms and how it is treated", slide 2 (the lobule's sinusoid view): the Sinusoid callout with its pressure is lit, so it reads
// beside the Sinusoidal pressure tile (the same node, SIN_R, to one decimal). Without the glow entry the presenter fades it out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASCITES } from '../src/ui/decks/ascites.js';

test('ascites slide 2 lights the sinusoid callout', () => {
  const start = ASCITES.slides.find((s) => s.id === 'start');
  assert.ok(start.glow.includes('sinusoid:lumen'));
  assert.ok(start.tiles.includes('sin'));
});
