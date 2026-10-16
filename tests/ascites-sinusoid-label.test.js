// "How ascites forms", slide 2 (the lobule's sinusoid view): the Sinusoid callout with its pressure is lit, so it reads
// beside the Sinusoidal pressure tile (the same node, SIN_R, to one decimal). Without the glow entry the presenter fades it out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('ascites slide 2 lights the sinusoid callout', () => {
  const src = readFileSync(new URL('../src/ui/decks/ascites.js', import.meta.url), 'utf8');
  const start = src.match(/id: 'start'[^\n]*/)[0];
  assert.match(start, /glow: \[[^\]]*'sinusoid:lumen'/);
  assert.match(start, /tiles: \['sin'/);
});

test('ascites slide 8 pills sinusoidal pressure and lights the sinusoid callout', () => {
  const src = readFileSync(new URL('../src/ui/decks/ascites.js', import.meta.url), 'utf8');
  const presin = src.match(/id: 'presin'[^\n]*/)[0];
  assert.match(presin, /'sinusoidal pressure': 'lobule:sinusoid'/);
  assert.match(presin, /'portal tracts': 'lobule:triad'/);
});
