import { stageSource } from './stage-src.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Back in the app on an iPhone or iPad, the organs showed almost white for a moment: the page turns light and back while the
// system takes the app switcher's pictures, and an organ picture begun in the light theme's colours finished on the way
// back and was shown until the next replaced it. A picture of a state that ended meanwhile is never shown, and none is
// begun in the background (stage.js rasterPlate, platePoke).
const src = stageSource();
const body = (name) => {
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} not found`);
  const next = src.indexOf('\n  function ', at + 10);
  return src.slice(at, next < 0 ? undefined : next);
};


test('no organ picture is begun or shown while the page is in the background, and the state is checked on return', () => {
  const p = body('platePoke');
  assert.match(p.split('\n').find((l) => l.includes('glWanted(easeInOut(live.morph))')), /document\.hidden/, 'platePoke waits while hidden');
  assert.match(p.split('\n').find((l) => l.includes('figureHidden() ||') && l.includes('moving')), /document\.hidden/, 'the delayed raster waits while hidden');
  assert.match(p, /else if \(plateStateKey\(\) !== k\) (?:live\.)?plateAgain = true/, 'a picture given up is drawn again for the state now');
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
  const drop = p.indexOf('if (document.hidden && live.veins'), guard = p.split('\n').findIndex((l) => l.includes('glWanted(easeInOut(live.morph))'));
  assert.ok(drop > 0, 'platePoke checks the shown picture against the colours now while hidden');
  const branch = p.slice(drop, p.indexOf('\n    }', drop));
  assert.match(branch, /theme !== (?:live\.)?plateTheme\) \{ (?:live\.)?plateTheme = theme; hidePlate\(\); \}/, 'a picture of other colours gives way to the live drawing');
  assert.doesNotMatch(branch, /rasterPlate|(?:live\.)?plateTimer/, 'nothing is drawn into a new picture while hidden');
  assert.ok(p.slice(0, drop).split('\n').length - 1 < guard, 'the drop comes before the guard that keeps a hidden page from drawing a picture');
});

test('hidden, the vessel layer is drawn in the same task as the update (no animation frame comes)', () => {
  const u = body('update');
  assert.match(u, /if \(plateRedraw \|\| \(document\.hidden && \(veinsDirty \|\| veinsRows\.size\)\)\) \{ const by = plateRedraw \? 'plate hidden' : 'tab hidden'; plateRedraw = false; drawVeins\(false, by\); \}/);
});

test('a change of the device light or dark setting redraws the figure at once, with no crossfade', () => {
  const at = main.indexOf("darkMQ.addEventListener('change'");
  assert.ok(at > 0);
  const h = main.slice(at, main.indexOf('\n});', at));
  assert.match(h, /stage\?\.update\(viewFrame\(f\)\)/, 'the stage is updated in the colours now');
  assert.doesNotMatch(h, /crossfade|startViewTransition|switchTheme/, 'no eased fade from the old colours');
});

test('an organ picture given up because the change moved on makes the next one wait longer, and one that lands resets it', () => {
  const src = stageSource();
  // (Mohammad's iPhone ?perf recording, 21 Oct: a time-lapse began a whole organ picture in each pause and threw it away.)
  // (One step, 0.8 s, since the whole picture is made a strip per frame: a picture given up costs a strip. External review, 22 Oct.)
  assert.match(src, /const still = (?:live\.)?(?:live\.)?plateMiss \? 800 : 400;/);
  assert.match(src, /still - \(performance\.now\(\) - (?:live\.)?lvStillAt\), 400 - \(performance\.now\(\) - spleenMv\.stillAt\(\)\), still - \(performance\.now\(\) - (?:live\.)?fluidStillAt\)\);/);
  assert.match(src, /(?:live\.)?plateMiss = (?:live\.)?plateOn\(\) \? 0 : Math\.min\(3, (?:live\.)?plateMiss \+ 1\);\n\s*if \(!(?:live\.)?plateOn\(\)\) (?:live\.)?plateKey = '';/);
  assert.match(src, /\} else if \(plateStateKey\(\) !== k\) (?:live\.)?plateAgain = true;[^\n]*\n\s*if \((?:live\.)?plateAgain && !(?:live\.)?plateOn\(\)\) (?:live\.)?plateMiss = Math\.min\(3, (?:live\.)?plateMiss \+ 1\);/);
});


test('a fluid level that moves while the fluid is drawn at no opacity asks for no whole repaint', () => {
  const src = stageSource();
  assert.match(src, /const seen = fluidLook\.ink\[3\] > 0, was = (?:live\.)?(?:live\.)?fluidSeen;\n\s+(?:live\.)?(?:live\.)?fluidSeen = seen;\n[^\n]*\n[^\n]*\n\s+if \(!\(moved && \(seen \|\| was\)\)\) return false;/);
  const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  assert.match(gl, /if \(fluidInk\.a > 0\.0\) \{/, 'the shader draws no fluid at ink 0');
});

test('a fluid level that moves composites only the pool, from above the higher level down, never the whole screen', () => {
  const src = stageSource();
  assert.match(src, /const (?:live\.)?pool = !!\((?:live\.)?veins && !(?:live\.)?veins\.lost && (?:live\.)?veins\.fluidPool\(ABDOMEN_FLOOR \+ 5 - Math\.max\(from, (?:live\.)?fluidH\) - (?:live\.)?fluidAmp - 6\)\);\n\s+if \((?:live\.)?pool\) (?:live\.)?poolFrames\+\+;\n\s+return !(?:live\.)?pool;/, 'a whole repaint only where there is no cavity to bound it');
  assert.match(src, /if \((?:live\.)?ascShown !== (?:live\.)?ascTarget\) \{\n\s+(?:live\.)?fluidFrom \?\?= (?:live\.)?fluidH;/, 'the level before the step, for a drain');
  const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  // The cavity's rect from `top` down, a cell's margin round it; drawn whole once, by the next composite that is not whole anyway.
  assert.match(gl, /for \(let y = Math\.max\(y0, top\) - CELL; y < y0 \+ h \+ CELL; y \+= CELL\) for \(let x = x0 - CELL; x < x0 \+ w \+ CELL; x \+= CELL\) cellList\.push\(x, y\);\n\s+nPool = cellList\.send\(poolBuf\);/);
  assert.match(gl, /const (?:live\.)?pool = full \? 0 : nPool;\n\s+nPool = 0;\n\s+if \(!full && !nCells && !\(fl\?\.ripple && nFluid\) && !(?:live\.)?pool && !dirt && !(?:live\.)?cath\) return;/);
  assert.match(gl, /if \((?:live\.)?pool\) \{ gl\.bindVertexArray\(poolVAO\); gl\.drawArraysInstanced\(gl\.TRIANGLE_STRIP, 0, 4, (?:live\.)?pool\); \}/);
});
