// R19 (2 Nov 2026): a live model frame never writes the presenter's tiles while their card slides or folds; the newest is kept and
// written once the card is still. A slide's own paint is never held.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pz = readFileSync(new URL('../src/ui/presenter.js', import.meta.url), 'utf8');

test('the tiles hold a live frame while their card moves, and only the data path paints live', () => {
  assert.doesNotMatch(pz, /TILE_FREEZE|TILE_GL|TILE_GLIDE|tilefreeze|tilegl|tileroll/);
  assert.match(pz, /const movingCard = \(\) => el\.closest\('\.pz-sliding, \[data-folding\]'\);/);
  assert.match(pz, /if \(live && draw && ks\.join\(\) \+ \(ref \? '\|ref' : ''\) === sig\) \{/);
  assert.equal(pz.split('store.get().params?.tips?.on, true);').length - 1, 1, 'only dataTo paints as live');
});

test('a tile\'s changing number is drawn as GPU words, and a slide\'s change follows the shown state in each frame (recs 15, 8 Nov 2026)', () => {
  assert.match(pz, /const vw = !pic \? glWords\(v, \{ host: v\.parentNode \}\) : null;/);
  // (Always .set: the number is drawn from the follower each display frame. The fit measures with .now, apart from this.)
  assert.match(pz, /const vSet = \(p, t\) => \{ if \(!p\.vw\) setT\(p\.v, t\); else p\.vw\.set\(t\); \};/);
  assert.match(pz, /const ts = createTileShown\(pageShown\);/);
  assert.match(pz, /stopShown = ts\.onFrame\(paintShown\);/);
  // (The change of slide hands the values to the followers; no digits are rolled by script and no mark glides by a CSS transition of its own.)
  assert.match(pz, /glide: \(to\) => \{ cur = \{ \.\.\.to \}; write\(cur, true\); \}/);
  const glide = pz.slice(pz.indexOf('function tileGlide('), pz.indexOf('// A band\'s colour is the rating'));
  assert.match(glide, /draw\.glide\(to\);/);
  assert.doesNotMatch(glide, /odoSwap|sync = true/);
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /tglide|--tile-ms/);
});
