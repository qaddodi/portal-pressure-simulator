// HVPG 5 to 6 (CI's frame gate, run 1121): the dive into the lobule for a new patient painted the lobule's tissue bitmap on the main
// thread in the frame the zoom started (1.8 s on the laptop profile). Now its shapes are recorded first, in a task of their own (the GPU
// paints them, paint-gl.js), and the dive waits for that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const st = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
const set = st.match(/function setLobule\(on, painted = false\) \{[\s\S]*?\n {4}lobuleOn = on;/)[0];
const ahead = lz.match(/function paintAhead\(\) \{[\s\S]*?\n {2}\}\n/)[0];

test('a dive waits for the tissue painted ahead, and anything asked for meanwhile calls it off', () => {
  assert.match(set, /if \(diveWait\) \{ diveWait = 0; diveGen\+\+; \}/);
  assert.match(set, /const ahead = lz\?\.paintAhead\?\.\(\);/);
  assert.match(set, /ahead\.then\(\(\) => \{ if \(diveWait === gen && !lobuleOn && diveT === 0\) \{ diveWait = 0; if \(store\.get\(\)\.lobule\) setLobule\(true, true\); \} \}\);/);
  assert.ok(set.indexOf('paintAhead') < set.indexOf('lobuleOn = on;'), 'nothing is set before the painting is in');
  assert.match(st, /lobuleSettled: \(\) => !diveWait && /, 'a waiting dive is not settled');
});

test('paintAhead sets the view and model as stage() does, and records the picture in a task of its own, never in a frame', () => {
  assert.match(ahead, /resetView\(\); staging = true; snapState\(\);\n\s+try \{ update\(F\); \} finally \{ staging = false; \}/);
  assert.match(lz, /function stage\(\) \{[\s\S]*?resetView\(\); staging = true; snapState\(\);\n\s+try \{ update\(F\); \} finally \{ staging = false; \}/);
  assert.match(ahead, /if \(fade > 0 \|\| !F \|\| !geo \|\| !tissueGLOn\(\)\) return null;/, 'only with the GPU to paint it');
  assert.match(ahead, /if \(wk === worldKey\) return null;/);
  assert.match(ahead, /return new Promise\(\(done\) => setTimeout\(\(\) => \{/);
  assert.match(ahead, /worldCv = paintWorld\(sc, m, G, dark, cs\);\n\s+tissueGL\?\.sweep\(\);/);
  assert.doesNotMatch(ahead, /askPaint|getContext|drawImage/);
  // (the same scale draw's paintTissue asks for, so stage() finds it recorded)
  assert.match(ahead, /const sc = Math\.min\(2 \*\* \(Math\.ceil\(Math\.log2\(Math\.max\(0\.05, dpr \* V\.k\)\) \* 2\) \/ 2\), worldCap\(G, dpr\)\)/);
  assert.match(ahead, /dpr = Math\.min\(saver\(\) \? 1 : 2, devicePixelRatio \|\| 1\) \* lzScale\(\);/);
  assert.match(lz, /function draw\(dt\) \{[\s\S]*?const dpr = Math\.min\(saver\(\) \? 1 : 2, devicePixelRatio \|\| 1\) \* lzScale\(\);/);
});

test("the wide copy at a lower pixel ratio draws from the screen's sharper picture rather than recording a softer one", () => {
  assert.match(lz, /if \(wideBuild && !held && kept && ws === worldState && sc < worldSc && worldSc <= sc \* 2\.01\) sc = worldSc;/);
  assert.match(lz, /wideBuild = true;\n\s+try \{ for \(const t of parts\) \{/);
  assert.match(lz, /\} \} finally \{ wideBuild = false; fxArgs = null; tisWide = false; \}/);
});

test("the rise's first frame shows the sharper picture of the same state smaller (the GPU's mipmaps filter it) rather than recording one", () => {
  assert.match(lz, /if \(diveScaled && !wideBuild && kept && ws === worldState && sc < worldSc && worldSc <= sc \* 4\.01\) sc = worldSc;/);
});

// HVPG 5 to 6 (the gate on 25f3009e, phone profile): the frame the dive landed in spent 2.5 s in paintTissue, the bitmap
// staged on the 2D canvas sent to the GPU there. It is sent at the end of stage(), while nothing of the lobule is seen.
test('stage() leaves the staged bitmap\'s send to the landing frame, which names its upload and draw', () => {
  const stage = lz.match(/function stage\(\) \{[\s\S]*?\n {2}\}\n/)[0];
  assert.match(stage, /draw\(0\); diveDrawn = true;/);
  assert.doesNotMatch(stage, /stageUpload|\.upload\(/, 'no send in stage() (1 Nov: black lobule while zooming in)');
  assert.doesNotMatch(lz, /STAGE_UP|stageup/);
  const onGPU = lz.match(/function tissueOnGPU\([\s\S]*?\n {2}\}\n/)[0];
  assert.match(onGPU, /tisTg = tg;\n\s+framePart\('lz\.texUpload', tisUpload\);/);
  assert.match(onGPU, /A\.wVer = worldCv\.ver \|\| 0/, 'the same version as draw sends, so draw finds it there');
  assert.match(onGPU, /framePart\('lz\.tissueGL', tisDraw\)/);
});

// (1 Nov 2026: the lobule's tissue went black while zooming in, and on Lobule 5 in a talk, until a pan drew it again. A lost context
// leaves the opaque GPU canvas black; it is put aside at once and the lobule drawn again once the context is back.)
test('a lost tissue context is put aside at once and the lobule drawn again', () => {
  assert.match(lz, /tissueG\.addEventListener\('webglcontextlost', tissueLost\)/);
  assert.match(lz, /function tissueLost\(\) \{ showTissueGL\(false\); wake\(\); \}/);
});
