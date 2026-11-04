import { stageSource } from './stage-src.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = stageSource();

// Sites 9 in the dark theme (17 Oct): the right atrium's term tone is a token of its own ('--tour-sys'); written as
// var(--tr---tour-sys) it named nothing, so its label fell back to black on the dark figure. Every tone goes through toneCol.
test('a slide term or lit resistor takes its tone through toneCol, never a bare --tr- prefix', () => {
  assert.match(js, /const toneCol = \(tone\) => \(tone\.startsWith\('--'\) \? `var\(\$\{tone\}\)` : tone === 'accent' \? 'var\(--accent\)' : `var\(--tr-\$\{tone\}\)`\);/);
  assert.match(js, /b\.g\.style\.setProperty\('--term', toneCol\(tone\)\)/);
  assert.match(js, /toneTokens\.set\(tone, \(t = toneCol\(tone\)\.slice\(4, -1\)\)\)/);   
  assert.match(js, /(?:live\.)?(?:live\.)?tokenRGB\(lit \? (?:live\.)?(?:live\.)?toneToken\(lit\) : '--text', (?:live\.)?(?:live\.)?resKey, 4\)/);
  assert.doesNotMatch(js, /`var\(--tr-\$\{(?!tone\})/, 'no other tone is written straight into a --tr- token');
});
