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
  const keep = r.indexOf('const drawnAs = plateCopy?.key'), check = r.indexOf('if (drawnAs !== plateStateKey()) return false;'), show = r.indexOf('v.setPlate(slot, job, rect)');
  assert.ok(keep > 0 && r.indexOf('plateMarkup(') < keep, 'the key the copy was drawn for is kept as the copy is made');
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
