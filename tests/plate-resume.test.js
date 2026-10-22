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
  assert.ok(keep > 0 && r.indexOf('plateCopy = plateBuild(plateStateKey())') > 0 && r.indexOf('plateCopy = plateBuild(plateStateKey())') < keep, 'the key the copy was drawn for is kept as the copy is made');
  // (The view's strips: the state now, and every strip's copy must still be of it.)
  assert.ok(r.indexOf('if (gone() || plateCopy?.key !== drawnAs) return false;') > keep && /const gone = \(\) => [^\n]*vseq !== \(banded \? viewSeq : 0\) \|\| drawnAs !== plateStateKey\(\);/.test(r), 'a strip drawn from a copy of another state is given up');
  assert.ok(check > 0 && check < show, 'the key is checked again before the picture is shown');
});

test('no organ picture is begun or shown while the page is in the background, and the state is checked on return', () => {
  const p = body('platePoke');
  assert.match(p.split('\n').find((l) => l.includes('glWanted(easeInOut(morph))')), /document\.hidden/, 'platePoke waits while hidden');
  assert.match(p.split('\n').find((l) => l.includes('figureHidden() ||') && l.includes('moving')), /document\.hidden/, 'the delayed raster waits while hidden');
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

test('an organ picture given up because the change moved on makes the next one wait longer, and one that lands resets it', () => {
  const src = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  // (Mohammad's iPhone ?perf recording, 21 Oct: a time-lapse began a whole organ picture in each pause and threw it away.)
  // (One step, 0.8 s, since the whole picture is made a strip per frame: a picture given up costs a strip. External review, 22 Oct.)
  assert.match(src, /const still = plateMiss \? 800 : 400;/);
  assert.match(src, /still - \(performance\.now\(\) - lvStillAt\), 400 - \(performance\.now\(\) - spleenMv\.stillAt\(\)\), still - \(performance\.now\(\) - fluidStillAt\)\);/);
  assert.match(src, /plateMiss = plateOn\(\) \? 0 : Math\.min\(3, plateMiss \+ 1\);\n\s*if \(!plateOn\(\)\) plateKey = '';/);
  assert.match(src, /\} else if \(plateStateKey\(\) !== k\) plateAgain = true;[^\n]*\n\s*if \(plateAgain && !plateOn\(\)\) plateMiss = Math\.min\(3, plateMiss \+ 1\);/);
});

test('an organ picture whose state moved on stops at the next strip, before drawing, reading back or uploading more', () => {
  const src = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  const at = src.indexOf('async function rasterPlate(');
  const body = src.slice(at, src.indexOf('\n  }\n', at));
  // (External review, 21 Oct: with the plate already down, a further organ change moves no counter, so every strip was still sent.)
  assert.match(body, /const gone = \(\) => [^\n]*\|\| drawnAs !== plateStateKey\(\);/);
  // Checked before every strip (the first included) and after each wait for a frame.
  assert.match(body, /for \(const \[y, rows\] of plateStrips\(W, H\)\) \{\n\s*if \(y && !waited\) await new Promise\(\(res\) => nextFrame\(res\)\);\n\s*waited = false;\n\s*if \(gone\(\)\) return false;/);
  assert.match(body, /await new Promise\(\(res\) => nextFrame\(res\)\); waited = true;\n\s*if \(gone\(\)\) return false;\n\s*v\.plateRows\(job, y, rows, readBack\(p\)\);/);
});

test('a fluid level that moves while the fluid is drawn at no opacity asks for no whole repaint', () => {
  const src = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(src, /const seen = fluidLook\.ink\[3\] > 0, was = fluidSeen;\n\s+fluidSeen = seen;\n[^\n]*\n[^\n]*\n\s+if \(!\(moved && \(seen \|\| was\)\)\) return false;/);
  const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  assert.match(gl, /if \(fluidInk\.a > 0\.0\) \{/, 'the shader draws no fluid at ink 0');
});

test('a fluid level that moves composites only the pool, from above the higher level down, never the whole screen', () => {
  const src = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(src, /const pool = !!\(veins && !veins\.lost && veins\.fluidPool\(ABDOMEN_FLOOR \+ 5 - Math\.max\(from, fluidH\) - fluidAmp - 6\)\);\n\s+if \(pool\) poolFrames\+\+;\n\s+return !pool;/, 'a whole repaint only where there is no cavity to bound it');
  assert.match(src, /if \(ascShown !== ascTarget\) \{\n\s+fluidFrom \?\?= fluidH;/, 'the level before the step, for a drain');
  const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  // The cavity's rect from `top` down, a cell's margin round it; drawn whole once, by the next composite that is not whole anyway.
  assert.match(gl, /for \(let y = Math\.max\(y0, top\) - CELL; y < y0 \+ h \+ CELL; y \+= CELL\) for \(let x = x0 - CELL; x < x0 \+ w \+ CELL; x \+= CELL\) cells\.push\(x, y\);/);
  assert.match(gl, /const pool = full \? 0 : nPool;\n\s+nPool = 0;\n\s+if \(!full && !nCells && !\(fl\?\.ripple && nFluid\) && !pool\) return;/);
  assert.match(gl, /if \(pool\) \{ gl\.bindVertexArray\(poolVAO\); gl\.drawArraysInstanced\(gl\.TRIANGLE_STRIP, 0, 4, pool\); \}/);
});
