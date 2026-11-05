// The same slide on a phone held upright with no GPU for the labels (iOS may lose the context; the SVG then draws every label, leader and dot):
// each step number keeps its leader and dot in every frame from its moment on, and none of them goes out and back.
// See tests/step-leaders-phone.test.js for the case and tests/step-phone-frames.js for what is checked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, now } from './stage-gl-boot.js';
import { stepFrames } from './step-phone-frames.js';

const { st, page, frame } = await bootGL({ w: 395, h: 859, dpr: 3, coarse: true, gl: false });

test('on a phone with the SVG drawing the labels, each step number keeps its leader and dot in every frame from its moment on', async () => {
  const seen = await stepFrames({ st, page, frame, now });
  assert.ok(seen.svgDrawn > 0 && seen.gpuDrawn === 0, `the SVG drew the numbers: ${JSON.stringify(seen)}`);
});
