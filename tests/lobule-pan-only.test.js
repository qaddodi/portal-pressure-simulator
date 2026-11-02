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
  assert.match(gl, /if \(!panOnly && \(dt === 0 \|\| rzMoving \|\| lensFrom \|\| !attrKey \|\| !radAll \|\| bk !== binKey \|\| camDue \|\| now - lastSurface >= 80\)\) \{\n\s+lastSurface = now; surfKey = sKey; surfCs = cs;/);
});

test('running, a camera-only change rebuilds no attribute map (R12): the pass comes with the model, the styles or every 80 ms; ?camattr=0 restores every frame', () => {
  assert.match(gl, /const panOnly = dt === 0 &&/);
  assert.match(gl, /const camDue = CAM_ATTR \? cs !== surfCs \|\| sKey\.slice\(0, sKey\.lastIndexOf\('\|'\)\) !== surfKey\.slice\(0, surfKey\.lastIndexOf\('\|'\)\) : dk !== drawKey;/);
  assert.match(gl, /\|\| camDue \|\| now - lastSurface >= 80\)\)/);
  assert.match(src, /const CAM_ATTR = !\(typeof location !== 'undefined' && \/\[\?&\]camattr=0\\b\/\.test\(location\.search\)\);/);
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

test('the ductules are drawn by the GPU from one number list per lobule, made again only when their calibers change', () => {
  // (1 Nov, the off-GPU gate: the 2D overlay that culled and cleared each ductule (paintFx) is gone; fx-gl.js draws them instanced.)
  const f = src.slice(src.indexOf('function fxDuct() {'), src.indexOf('\n  }\n', src.indexOf('function fxDuct() {')));
  assert.match(f, /if \(ductP && ductP\.G === G && key === ductKey\) return ductP;/);
  assert.match(f, /num: \[x, y, rin, rout, rm, hw \* 0\.34, tr\.i, 0\]/);
  assert.doesNotMatch(f, /Path2D/, 'no paths for a 2D canvas');
  assert.match(src, /ducts: m\.hide \? null : fxDuct\(\)\.nums,/);
  assert.doesNotMatch(src, /function paintFx\(|fxBoxes/);
});
