import { stageSource } from './stage-src.js';
// (The streaks' packed-lane gain, B2, went with the Streaks option, 16 Nov 2026.) No beads at
// any zoom, and the arrowheads never fade on a wide lumen (Mohammad, 31 Oct: "Dots suck. Keep streaks", "Without pop in
// and pop out"). No GL in node: the shader as source, and its numbers mirrored here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lobuleSource } from './split-src.js';

const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8') + readFileSync(new URL('../src/ui/comp-glsl.js', import.meta.url), 'utf8');
const stage = stageSource();
const lob = lobuleSource();
test('no beads and no zoom fade of the arrowheads (B3 and C2 dropped)', () => {
  assert.doesNotMatch(gl, /beadField|lookOf|BLOOD_ZOOM|chevZoom|uniform int look/);
  assert.doesNotMatch(gl, /float zf = /);
  assert.doesNotMatch(stage, /chevZoom/);
  assert.doesNotMatch(lob, /chevZoom/);
});
