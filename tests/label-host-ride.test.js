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

test('in host mode ride, crossfade and pinDraw ask the host for a present instead of drawing', () => {
  assert.match(body(/ride\(m\) \{[\s\S]*?draw\(\);\n {4}\},/), /if \(host\) \{ ask\(\); return; \}[\s\S]*draw\(\);/);
  assert.match(lg, /crossfade\(o, n\) \{[^\n]*if \(host\) \{ ask\(\); return; \}/);
  assert.match(lg, /pinDraw\(\) \{[^\n]*if \(host\) \{ ask\(\); return; \}/);
});

test('host mode cuts no holes: the labels are under the glass', () => {
  assert.match(lg, /if \(!host && holes\.length\) cutHoles\(\);/);
  assert.match(lg, /get holes\(\) \{ return !host && !lost; \}/);
});
