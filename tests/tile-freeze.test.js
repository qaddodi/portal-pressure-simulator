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

test('a tile\'s changing number is drawn as GPU words, and a slide\'s roll and the fit write the page at once', () => {
  assert.match(pz, /const vw = !pic \? glWords\(v, \{ host: v\.parentNode \}\) : null;/);
  assert.match(pz, /const vSet = \(p, t\) => \{ if \(!p\.vw\) setT\(p\.v, t\); else if \(sync\) p\.vw\.now\(t\); else p\.vw\.set\(t\); \};/);
  assert.match(pz, /sync = true;\n\s+try \{ draw\.jump\(to\); \} finally \{ sync = false; \}/);
});
