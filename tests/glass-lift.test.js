// LOOK-3 (bible review, 19 Nov 2026): the glass's lift is one token with a value for each look, and the GPU reads it as one drop (Mohammad's B "Soft lift",
// 0 10px 24px -8px). The CSS-text rules of this look (the fallback glass is the one glass, written once) are in scripts/source-shapes/glass-look-19nov.mjs (PR-02).
import test from 'node:test';
import assert from 'node:assert/strict';

test('its strength is one token with a value for each look: Light .45, Soft .5, the dark looks .75', async () => {
  const { tokensOfLook, LOOK_IDS } = await import('../src/ui/theme-tokens.js');
  const a = Object.fromEntries(LOOK_IDS.map((id) => [id, tokensOfLook(id)['card-shadow-a']]));
  assert.deepEqual(a, { light: '.45', soft: '.5', dark: '.75', navy: '.75', black: '.75' });
});

test('the lift parses as the glass reads it: one drop, no inset, the shadow ink at the look\'s strength', async () => {
  const { dropsOf, parseColour } = await import('../src/ui/glass-gl.js');
  const d = dropsOf('0 10px 24px -8px rgb(46 22 34 / .45)');
  assert.deepEqual(d.map((x) => [x.x, x.y, x.blur, x.spread]), [[0, 10, 24, -8]]);
  assert.deepEqual(parseColour(d[0].c).map((v) => +v.toFixed(3)), [0.18, 0.086, 0.133, 0.45]);
});

test('the shadow\'s quad reaches three sigmas past the shadow\'s own edge, a negative spread pulling it in (28 px for the lift, not 36)', async () => {
  const { dropReach } = await import('../src/ui/glass-gl.js');
  assert.equal(dropReach({ x: 0, y: 10, blur: 24, spread: -8 }), 28);
  assert.equal(dropReach({ x: 0, y: 0, blur: 24, spread: 4 }), 40);
  assert.equal(dropReach({ x: 0, y: 3, blur: 0, spread: 0 }), 0);
  assert.equal(dropReach({ x: 0, y: 0, blur: 2, spread: -9 }), 0);
});
