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
