// S1 (gpu-two-contexts-plan.md): label-gl in host mode keeps the view-change ghosts and the camera ride, and never draws outside
// the host's present (a draw there would lay the labels over a figure the host has not cleared), and cuts no holes (drawn under the glass).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lg = readFileSync(new URL('../src/ui/label-gl.js', import.meta.url), 'utf8');
const body = (re) => lg.match(re)[0];

test('host mode keeps ghosts and rides: neither is refused for a host', () => {
  assert.match(lg, /canRide\(\) \{ return !lost; \}/);
  assert.match(body(/freezeGhosts\(\) \{[\s\S]*?dropGhosts\(\);/), /if \(lost\) return 0;/);
  assert.ok(!/freezeGhosts\(\) \{\s*if \(lost \|\| host\)/.test(lg));
});

test('ride, crossfade and pinDraw ask the host for a present instead of drawing', () => {
  assert.match(body(/ride\(m\) \{[\s\S]*?\n {4}\},/), /ask\(\);[^\n]*\n\s+\},$/m);
  assert.doesNotMatch(body(/ride\(m\) \{[\s\S]*?\n {4}\},/), /\bdraw\(\)/);
  assert.match(lg, /crossfade\(o, n\) \{[^\n]*if \(lost\) return; ask\(\); \},/);
  assert.match(lg, /pinDraw\(\) \{ if \(lost \|\| !pinAt\) return; ask\(\); \},/);
});

test('a picture asked for from inside a picture is asked for in the next frame, never laid from inside the host\'s present', () => {
  assert.match(lg, /if \(drawing\) \{ if \(!againF\) againF = nextFrame\(againTick\); return; \}/);
  assert.match(lg, /function draw\(\) \{\n\s+if \(drawing\) return;/);
});

test('the labels cut no holes (drawn under the glass), and have no canvas of their own', () => {
  assert.doesNotMatch(lg, /cutHoles|get holes|setHoles|createElement\('canvas'\)|getContext\(/);
  assert.match(lg, /if \(!host \|\| \(software && !force\)/, 'no host, no layer: the SVG shows the labels');
});

test('the layer\'s own fade reaches every draw as a factor, not as a hand-over to the SVG', () => {
  assert.match(lg, /LA = layerA\(\);/);
  assert.match(lg, /createLayerAlpha\(svg, \{ near: svg, shared: canvas, onChange: \(\) => ask\(\) \}\)/);
  for (const m of lg.matchAll(/\.f1\((?:MU|U)\.uA, ([^\n]+)/g)) assert.match(m[1], /^LA \* /, m[0]);
});
