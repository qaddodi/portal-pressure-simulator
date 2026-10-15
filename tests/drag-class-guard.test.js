// Review #31: every pointer move of a drag or pinch re-added a class the app already had, which still fires its
// MutationObservers (four of them), so the page was laid out again on each move (44 layouts in 30 moves, 2 with the guard).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');

test('#31 a drag adds stage-busy and figure-focus only when they are missing', () => {
  assert.match(main, /const busy = \(ms\) => \{ if \(!app\.classList\.contains\('stage-busy'\)\) app\.classList\.add\('stage-busy'\);/);
  assert.match(main, /if \(!app\.classList\.contains\('figure-focus'\)\) app\.classList\.add\('figure-focus'\);/);
  assert.doesNotMatch(main, /\{ app\.classList\.add\('stage-busy'\)/);
});
