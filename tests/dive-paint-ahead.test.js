// HVPG 5 to 6 (CI's frame gate, run 1121): the dive into the lobule for a new patient painted the lobule's tissue bitmap on the main
// thread in the frame the zoom started (1.8 s on the laptop profile). Now it is painted in the worker first, and the dive waits for it.
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

test('paintAhead sets the view and model as stage() does, asks the worker, and never waits past AHEAD_MS', () => {
  assert.match(ahead, /resetView\(\); staging = true; snapState\(\);\n\s+try \{ update\(F\); \} finally \{ staging = false; \}/);
  assert.match(lz, /function stage\(\) \{[\s\S]*?resetView\(\); staging = true; snapState\(\);\n\s+try \{ update\(F\); \} finally \{ staging = false; \}/);
  assert.match(ahead, /if \(fade > 0 \|\| !F \|\| !geo \|\| !offPage\(\)\) return null;/);
  assert.match(ahead, /if \(wk === worldKey\) return null;/);
  assert.match(ahead, /askPaint\('world', sc, ws, wk, m, G, dark, cs\)/);
  assert.ok(+/const AHEAD_MS = (\d+);/.exec(lz)[1] <= 1000);
  // (the same scale draw's paintTissue asks for, so stage() finds it painted)
  assert.match(ahead, /const sc = Math\.min\(2 \*\* \(Math\.ceil\(Math\.log2\(Math\.max\(0\.05, dpr \* V\.k\)\) \* 2\) \/ 2\), worldCap\(G, dpr\)\)/);
  assert.match(ahead, /dpr = Math\.min\(saver\(\) \? 1 : 2, devicePixelRatio \|\| 1\) \* lzScale\(\);/);
  assert.match(lz, /function draw\(dt\) \{[\s\S]*?const dpr = Math\.min\(saver\(\) \? 1 : 2, devicePixelRatio \|\| 1\) \* lzScale\(\);/);
});

test("the wide copy at a lower pixel ratio draws from the screen's sharper bitmap rather than painting a softer one", () => {
  assert.match(lz, /if \(wideBuild && !held && kept && ws === worldState && sc < worldSc && worldSc <= sc \* 2\.01\) sc = worldSc;/);
  assert.match(lz, /wideBuild = true;\n\s+try \{ for \(const t of parts\) \{/);
  assert.match(lz, /\} \} finally \{ wideBuild = false; tisWide = false; \}/);
});

test("the rise's first frame on the 2D canvas shows the sharper bitmap of the same state smaller, filtered, rather than painting one", () => {
  assert.match(lz, /if \(diveScaled && !wideBuild && kept && ws === worldState && sc < worldSc && worldSc <= sc \* 4\.01\) \{ shrink = worldSc \/ sc; sc = worldSc; \}/);
  assert.match(lz, /if \(shrink > 2\.01\) c\.imageSmoothingQuality = 'high';[^\n]*\n\s+c\.drawImage\(worldCv, sx \* dpr, sy \* dpr, side, side\);\n\s+if \(shrink > 2\.01\) c\.imageSmoothingQuality = 'low';/);
});

// HVPG 5 to 6 (the gate on 25f3009e, phone profile): the frame the dive landed in spent 2.5 s in paintTissue, the bitmap
// staged on the 2D canvas sent to the GPU there. It is sent at the end of stage(), while nothing of the lobule is seen.
test('stage() sends the staged bitmap to the GPU before the zoom only with ?stageup=1, and the landing frame names its upload and draw', () => {
  const stage = lz.match(/function stage\(\) \{[\s\S]*?\n {2}\}\n/)[0];
  assert.match(lz, /const STAGE_UP = \/\[\?&\]stageup=1\\b\/\.test\(location\.search\);/, 'off unless ?stageup=1 (1 Nov: black lobule while zooming in)');
  assert.match(stage, /if \(STAGE_UP && worldCv\.width && worldGeo === geo\) framePart\('lz\.stageUpload', \(\) => \{ if \(tissueGL && !tissueGL\.lost && ensureGL\(\)\) tissueGL\.upload\(worldCv, worldCv\.ver \|\| 0\); \}\);/);
  assert.ok(stage.indexOf('lz.stageUpload') > stage.indexOf('keep2D = false'), 'after the staged drawing');
  const onGPU = lz.match(/function tissueOnGPU\([\s\S]*?\n {2}\}\n/)[0];
  assert.match(onGPU, /framePart\('lz\.texUpload', \(\) => tg\.upload\(worldCv, worldCv\.ver \|\| 0\)\);/);
  assert.match(onGPU, /wVer: worldCv\.ver \|\| 0/, 'the same version as draw sends, so draw finds it there');
  assert.match(onGPU, /framePart\('lz\.tissueGL', \(\) => tg\.draw\(\{/);
});

// (1 Nov 2026: the lobule's tissue went black while zooming in, and on Lobule 5 in a talk, until a pan drew it again. A lost context
// leaves the opaque GPU canvas black; it is put aside at once and the lobule drawn on the 2D canvas in the next frame.)
test('a lost tissue context is put aside at once and the lobule drawn again', () => {
  assert.match(lz, /tissueG\.addEventListener\('webglcontextlost', tissueLost\)/);
  assert.match(lz, /function tissueLost\(\) \{ showTissueGL\(false\); wake\(\); \}/);
});
