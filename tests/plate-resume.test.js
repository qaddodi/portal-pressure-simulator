import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Back in the app on an iPhone or iPad, the organs showed almost white for a moment: the page turns light and back while the
// system takes the app switcher's pictures, and an organ picture begun in the light theme's colours finished on the way
// back and was shown until the next replaced it. A picture of a state that ended meanwhile is never shown, and none is
// begun in the background (stage.js rasterPlate, platePoke).
const src = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const body = (name) => {
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} not found`);
  const next = src.indexOf('\n  function ', at + 10);
  return src.slice(at, next < 0 ? undefined : next);
};

test('an organ picture whose state changed on its way in is given up, not shown', () => {
  const r = body('rasterPlate');
  const keep = r.indexOf('const drawnAs = banded ? plateStateKey() : plateCopy?.key'), check = r.indexOf('if (drawnAs !== plateStateKey()) return false;'), show = r.indexOf('v.setPlate(slot, job, rect)');
  assert.ok(keep > 0 && r.indexOf('plateMarkup(') < keep, 'the key the copy was drawn for is kept as the copy is made');
  // (The view's strips: the state now, and every strip's copy must still be of it.)
  assert.ok(r.indexOf('plateCopy?.key !== drawnAs) return false;') > keep, 'a strip drawn from a copy of another state is given up');
  assert.ok(check > 0 && check < show, 'the key is checked again before the picture is shown');
});

test('no organ picture is begun or shown while the page is in the background, and the state is checked on return', () => {
  const p = body('platePoke');
  assert.match(p.split('\n').find((l) => l.includes('glWanted(easeInOut(morph))')), /document\.hidden/, 'platePoke waits while hidden');
  assert.match(p.split('\n').find((l) => l.includes('figureHidden() ||') && l.includes('lvMoving')), /document\.hidden/, 'the delayed raster waits while hidden');
  assert.match(p, /else if \(plateStateKey\(\) !== k\) plateAgain = true/, 'a picture given up is drawn again for the state now');
  assert.match(src, /addEventListener\('visibilitychange', \(\) => \{ if \(!document\.hidden\) platePoke\(\); \}\)/);
});

test('a GPU restore drops the old picture and draws it again (no picture from the lost context is reused)', () => {
  const at = src.indexOf("vCanvas.addEventListener('webglcontextrestored'");
  const r = src.slice(at, src.indexOf('\n  });', at));
  assert.match(r, /plateKey = ''/);
  assert.match(r, /if \(F\) update\(F\)/);
});

// Still on 21 Oct ("the flash when I switch to the app from bright to dark still happens"): the page was turned light for the
// app switcher's pictures while showing, and dark again once hidden, where nothing was drawn again, so the light picture stayed
// on the canvas until after the return. A change of the light or dark setting now redraws the figure at once, hidden or not.
const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');

test('a picture in colours the page no longer has is dropped while hidden, and none is begun there', () => {
  const p = body('platePoke');
  const drop = p.indexOf('if (document.hidden && veins'), guard = p.split('\n').findIndex((l) => l.includes('glWanted(easeInOut(morph))'));
  assert.ok(drop > 0, 'platePoke checks the shown picture against the colours now while hidden');
  const branch = p.slice(drop, p.indexOf('\n    }', drop));
  assert.match(branch, /theme !== plateTheme\) \{ plateTheme = theme; hidePlate\(\); \}/, 'a picture of other colours gives way to the live drawing');
  assert.doesNotMatch(branch, /rasterPlate|plateTimer/, 'nothing is drawn into a new picture while hidden');
  assert.ok(p.slice(0, drop).split('\n').length - 1 < guard, 'the drop comes before the guard that keeps a hidden page from drawing a picture');
});

test('hidden, the vessel layer is drawn in the same task as the update (no animation frame comes)', () => {
  const u = body('update');
  assert.match(u, /if \(plateRedraw \|\| \(document\.hidden && veinsDirty\)\) \{ plateRedraw = false; drawVeins\(\); \}/);
});

test('a change of the device light or dark setting redraws the figure at once, with no crossfade', () => {
  const at = main.indexOf("matchMedia('(prefers-color-scheme: dark)').addEventListener('change'");
  assert.ok(at > 0);
  const h = main.slice(at, main.indexOf('\n});', at));
  assert.match(h, /stage\?\.update\(viewFrame\(f\)\)/, 'the stage is updated in the colours now');
  assert.doesNotMatch(h, /crossfade|startViewTransition|switchTheme/, 'no eased fade from the old colours');
});

test('a theme the user picks in the app still crossfades', () => {
  const at = main.indexOf('function switchTheme(');
  const s = main.slice(at, main.indexOf('\n}', at));
  assert.match(s, /if \(!document\.startViewTransition \|\| document\.hidden\) \{ applyTheme\(t, clear\); return; \}/);
  assert.match(s, /crossfade\(\(\) => applyTheme\(t, clear\)\)/);
});
