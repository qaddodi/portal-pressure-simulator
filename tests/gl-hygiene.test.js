import { stageSource } from './stage-src.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// 22 Oct review items 1, 2, 4, 11 and 12: the GPU is let go of, or fallen back from, where the figure or an instrument is not shown.
test('a lost vessel context drops the GPU classes at once (the vessels are drawn only by the GPU, sent again on its restore)', () => {
  const s = stageSource();
  const lost = s.slice(s.indexOf("vCanvas.addEventListener('webglcontextlost'"), s.indexOf("vCanvas.addEventListener('webglcontextrestored'"));
  assert.match(lost, /wrap\.classList\.remove\('gl-on'\)/);
  assert.match(lost, /wrap\.classList\.remove\('gl-plate'\); syncPlateLook\(\)/);
  assert.match(lost, /if \(geoHeld\.size\) flushGeo\(\);/);
  assert.match(lost, /stageWake\(\)/);
  // and a restore that gets no context leaves the SVG showing, with no GPU classes behind
  assert.match(s, /if \(!veins\) \{ wrap\.classList\.remove\('gl-on', 'gl-plate'\); syncPlateLook\(\); return; \}/);
});

test('the vessel framebuffer and layers are given back while the figure is hidden, once per sleep', () => {
  const s = stageSource();
  assert.match(s, /home-open'\)\) \{ lastT = flowGate = now; trimVeins\(\); sleep\(\); return; \}/);
  assert.match(s, /if \(lz\?\.isOpen\(\)\) \{ trimVeins\(\); sleep\(\); return; \}\n\s+veinsTrimmed = false;/);
  // (Review pass item 8: the warm window is a holder in the global budget, which may give it back early; the trim itself is unchanged.)
  assert.match(s, /function trimVeins\(\) \{\n\s+if \(veinsTrimmed \|\| !veins \|\| veins\.lost \|\| glowSync\) return;\n(\s+if \(WARM_VIEWS && !document\.hidden\) \{[\s\S]*?\n {4}\}\n)?\s+veinsHold\?\.drop\(\); veinsHold = null;\n\s+veins\.trim\(\); veinsTrimmed = true; veinsDirty = true;/);
  assert.match(s, /veinsHold = gpuHold\(\{ owner: 'veins \(under the lobule\)', kind: 'warm'/);
  assert.match(src('src/ui/veins-gl.js'), /trim\(\) \{\n\s+if \(lost\) return;/);
});

test('no gut picture is ever made: the gut is painted on the GPU with the other organs, never rasterized from an SVG copy', () => {
  const s = stageSource();
  assert.doesNotMatch(s, /gutPicSoon|makeGutPic|gGutPics|encodePNG/);
});

test('a presentation\'s Doppler monitor disposes its frames, observers and WebGL context', () => {
  const d = src('src/ui/doppler.js');
  assert.match(d, /function dispose\(\) \{\n\s+anim\(false\);\n\s+if \(raf\) \{ cancelFrame\(raf\); raf = 0; \}\n\s+io\?\.disconnect\(\); ro\?\.disconnect\(\); frame = null;\n\s+gpu\?\.dispose\(\); gpu\?\.canvas\.remove\(\);/);
  assert.match(d, /return \{ id: 'doppler', [^\n]*, dispose \};/);
  assert.match(src('src/ui/doppler-gl.js'), /canvas\.width = canvas\.height = 0;\n\s+gl\.getExtension\('WEBGL_lose_context'\)\?\.loseContext\(\);/);
  assert.match(src('src/ui/presenter-tools.js'), /made\[k\]\?\.dispose\?\.\(\)/);
});

test('the preview\'s test deck is not in the live site\'s bundle', () => {
  const p = src('src/ui/presenter.js');
  assert.doesNotMatch(p, /^import [^\n]*test-decks/m);
  assert.match(p, /const testingLoad = PREVIEW \? import\('\.\/test-decks\/demo-all-new-visuals\.js'\)/);
  assert.match(p, /if \(!d && typeof id === 'string' && id\.startsWith\('test-'\) && !TESTING\.length && !opts\?\.waited\) return testingLoad\.then\(\(\) => start\(id, at, \{ \.\.\.opts, waited: true \}\)\);/);   // (waits once: a missing test deck is \"not found\", not a loop)
});
