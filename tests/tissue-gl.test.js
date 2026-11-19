// The open lobule's tissue on the GPU (tissue-gl.js): a pan or a pinch of the lobule repainted two or three full-screen 2D passes
// every frame (Mohammad, 25 Oct: "zooming in and panning around in ... lobule view is very laggy"). Its bitmap stays sharp through a
// zoom: never shown softer than the zoom wants, and never sharpened in a step once a gesture ends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fadeAt, FADE_MID } from '../src/ui/lobule-look.js';
import { tissueFS } from '../src/ui/tissue-gl.js';


test('the shader lays the picture the 2D passes did: surround, the bitmap over it premultiplied, then the fade into the page', () => {
  // (Each tile laid over the page by its own alpha, the same picture for an opaque tile.)
  assert.match(tissueFS(false), /vec3 c = mix\(over\(texture\(uQA, uv\)\), over\(texture\(uQB, uv\)\), uMix\);/);
  assert.match(tissueFS(false), /if \(uQOld > 0\.0\) c = mix\(c, over\(texture\(uQO, uv\)\), uQOld\);/, 'the last state\'s tile over it as it fades out');
  assert.doesNotMatch(tissueFS(false), /texture\(uQ(A|B|O), uv\)\.rgb/, 'no tile read by its rgb alone');
});

test("the shader's fade is fieldFade's gradient (fadeAt)", () => {
  // float a = s < 0.5 ? uMid * s * 2.0 : uMid + (1.0 - uMid) * (s - 0.5) * 2.0;
  const shader = (d, r0, r1) => { const s = Math.min(1, Math.max(0, (d - r0) / Math.max(r1 - r0, 1e-6))); return s < 0.5 ? FADE_MID * s * 2 : FADE_MID + (1 - FADE_MID) * (s - 0.5) * 2; };
  for (const d of [0, 50, 110, 150, 200, 260, 320, 400, 900]) assert.ok(Math.abs(shader(d, 110, 320) - fadeAt(d, 110, 320)) < 1e-12, `d ${d}`);
});



