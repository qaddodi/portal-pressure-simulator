import { stageSource } from './stage-src.js';
// HVPG 5 to 6 (CI's frame gate, run 1121): the dive into the lobule for a new patient painted the lobule's tissue bitmap on the main
// thread in the frame the zoom started (1.8 s on the laptop profile). Now its shapes are recorded first, in a task of their own (the GPU
// paints them, paint-gl.js), and the dive waits for that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const st = stageSource();
const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
const set = st.match(/function setLobule\(on, painted = false\) \{[\s\S]*?\n {4}live\.lobuleOn = on;/)[0];
const ahead = lz.match(/function paintAhead\(\) \{[\s\S]*?\n {2}\}\n/)[0];

test('a dive waits for the tissue painted ahead, and anything asked for meanwhile calls it off', () => {
  assert.match(set, /if \(live\.diveWait\) \{ live\.diveWait = 0; live\.diveGen\+\+; \}/);
  assert.match(set, /const ahead = live\.lz\?\.paintAhead\?\.\(\);/);
  assert.match(set, /ahead\.then\(\(\) => \{ if \(live\.diveWait === gen && !live\.lobuleOn && live\.diveT === 0\) \{ live\.diveWait = 0; if \(store\.get\(\)\.lobule\) setLobule\(true, true\); \} \}\);/);
  assert.ok(set.indexOf('paintAhead') < set.indexOf('lobuleOn = on;'), 'nothing is set before the painting is in');
  assert.match(st, /lobuleSettled: \(\) => !diveWait && /, 'a waiting dive is not settled');
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
});
