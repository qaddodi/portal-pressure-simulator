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
  assert.match(lz, /\} \} finally \{ wideBuild = false; \}/);
});
