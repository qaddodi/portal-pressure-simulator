// A paused lobule that is only panned sends nothing the model owns (26 Oct, the navigation brief's order 2): the colour and radius pass in
// drawGL and the flow upload wait for something they read to change. A moving camera with the model running takes the pass as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
const gl = src.slice(src.indexOf('function drawGL('), src.indexOf('const num = (cs, n, d)'));

test('the surface pass waits, paused, for the model, the theme, the canvas size or the scale, and looks again every second', () => {
  assert.match(gl, /const sKey = `\$\{drawVersion - viewBumps\}\|\$\{dark\}\|\$\{cw\}x\$\{ch\}\|\$\{\(k \* V\.k\)\.toFixed\(3\)\}`;/);
  // (Where the figure is — V.x, V.y — is not in the key: a translation changes none of the radii's tolerance.)
  assert.doesNotMatch(gl.match(/const sKey = .*/)[0], /V\.x|V\.y/);
  assert.match(gl, /const panOnly = dt === 0 && !rzMoving && !lensFrom && !!attrKey && !!radAll && bk === binKey && sKey === surfKey && cs === surfCs && now - lastSurface < 1000;/);
  assert.match(gl, /if \(!panOnly && \(dt === 0 \|\| rzMoving \|\| lensFrom \|\| !attrKey \|\| !radAll \|\| bk !== binKey \|\| dk !== drawKey \|\| now - lastSurface >= 80\)\) \{\n\s+lastSurface = now; surfKey = sKey; surfCs = cs;/);
});

test('running, nothing is throttled: panOnly needs a paused model, so a moving camera still takes the pass every frame', () => {
  assert.match(gl, /const panOnly = dt === 0 &&/);
  assert.match(gl, /\|\| dk !== drawKey \|\| now - lastSurface >= 80\)\)/);
});

test('only the camera\'s own bumps of the version are left out of the model\'s: a label-size change still counts', () => {
  assert.match(src, /const viewChanged = \(\) => \{ drawVersion\+\+; viewBumps\+\+; viewVer\+\+;/);
  assert.match(src, /syncLeaders\(\); drawVersion\+\+; viewVer\+\+; layoutKey = '';/);
  assert.equal([...src.matchAll(/viewBumps\+\+/g)].length, 1);
});

test('the flow is not worked out or sent again on a paused pan, but is with a new GL context or while its marks fade', () => {
  assert.match(gl, /const flowSame = panOnly && g === flowG && flowA === flowAt;/);
  assert.match(gl, /if \(!flowSame\) \{ g\.setFlow\(flowData\); flowG = g; flowAt = flowA; \}/);
  assert.match(gl, /if \(!flowSame && \(bloodOn \|\| chev \|\| origin\)\) for \(const t of live\)/);
});

test('the surface pass is still counted for the ?perf readout', () => {
  assert.match(gl, /if \(gpuProbe\.on\) gpuProbe\.note\(COUNTED\.lobuleSurface\);/);
});

test('the ductule layer leaves out a ductule that lies wholly off the canvas, and keeps its clear box list to the ones drawn', () => {
  const fx = src.slice(src.indexOf('function paintFx('), src.indexOf('function paintFx(') + 4500);
  assert.match(fx, /if \(X \+ e < 0 \|\| Y \+ e < 0 \|\| X - e > fw \|\| Y - e > fh\) continue;/);
  assert.match(fx, /if \(fxBoxes\) fxBoxes\.push\(\[Math\.floor\(X - e\), Math\.floor\(Y - e\), Math\.ceil\(X \+ e\), Math\.ceil\(Y \+ e\)\]\);/);
  // (The bound is the ring's outer radius, its stroke and 3 px: the same box the clear list always used for what it drew.)
  assert.match(fx, /e = \(r \+ c\.lineWidth\) \* V\.k \* dpr \+ 3/);
  assert.match(src, /disc: \[x, y, rout\]/);
});
