// The anatomy has no body-cavity shading: the old soft, lighter pool behind the abdomen read as a glow. Only the
// diaphragm stays on the background plane.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BACKDROP } from '../src/ui/anatomy.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('no body-cavity glow is drawn behind the abdomen', () => {
  const stage = read('src/ui/stage.js'), css = read('styles/app.css'), tokens = read('styles/tokens.css');
  assert.equal(BACKDROP.cavity, undefined);
  assert.doesNotMatch(stage, /cavityShade|bd-cavity/);
  assert.doesNotMatch(css, /\.cav-(hi|mid|lo)\b|bd-cavity/);
  assert.doesNotMatch(tokens, /--cavity:/);
  assert.match(stage, /class="org-diaphragm band-body"/, 'the diaphragm stays');
});

test('the diaphragm is hidden behind the organs and traced from their outlines', () => {
  const stage = read('src/ui/stage.js');
  // The organs are see-through: without the mask the line shows through the heart and liver as a stray arc.
  assert.match(stage, /id: 'backdrop', mask: 'url\(#diaMask\)'/);
  assert.match(stage, /\['heart', 'heart-ra', 'esophagus', 'liver', 'stomach', 'spleen'\]/);
  // It follows the organs as they change (no fixed lift of a hand-drawn path).
  assert.match(stage, /function diaphragmPath\(shrink, sc\)/);
  assert.match(stage, /liverPaths\.push\(diaCut\.liver\)/);
});
