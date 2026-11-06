// A paused lobule that is only panned sends nothing the model owns (26 Oct, the navigation brief's order 2): the colour and radius pass in
// drawGL and the flow upload wait for something they read to change. A moving camera with the model running takes the pass as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
const gl = src.slice(src.indexOf('function drawGL('), src.indexOf('const num = (cs, n, d)'));

test('the surface pass waits, paused, for the model, the theme, the canvas size or the scale, and looks again every second', () => {
  // (The key is kept as numbers, not built into a string each frame: the model's version, the theme, the canvas size and the scale to a thousandth.)
  assert.match(gl, /const ver = drawVersion - viewBumps - \(dt > 0 \? frameBumps : 0\), kq = Math\.round\(k \* V\.k \* 1000\);/);
  assert.match(gl, /const surfSame = ver === sVer && dark === sDark && cw === sCw && ch === sCh;/);
  // (Where the figure is — V.x, V.y — is not in the key: a translation changes none of the radii's tolerance.)
  assert.doesNotMatch(gl.match(/const surfSame = .*/)[0] + gl.match(/const ver = .*/)[0], /V\.x|V\.y/);
  assert.match(gl, /const panOnly = dt === 0 && !rzMoving && !lensFrom && !!attrKey && !!radAll && bk === binKey && surfSame && kq === sK && cs === surfCs && now - lastSurface < 1000;/);
  assert.match(gl, /if \(!panOnly && \(dt === 0 \|\| rzMoving \|\| lensFrom \|\| !attrKey \|\| !radAll \|\| bk !== binKey \|\| camDue \|\| now - lastSurface >= 80\)\) \{\n\s+lastSurface = now; sVer = ver; sDark = dark; sCw = cw; sCh = ch; sK = kq; surfCs = cs;/);
});

test('running, a camera-only change rebuilds no attribute map (R12): the pass comes with the model, the styles or every 80 ms', () => {
  assert.match(gl, /const panOnly = dt === 0 &&/);
  assert.match(gl, /const camDue = cs !== surfCs \|\| !surfSame;/);
  assert.match(gl, /\|\| camDue \|\| now - lastSurface >= 80\)\)/);
  assert.doesNotMatch(src, /CAM_ATTR|camattr/);
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
  assert.match(f, /if \(same\) return ductP;/);
  assert.match(f, /num: \[x, y, rin, rout, rm, hw \* 0\.34, tr\.i, 0\]/);
  assert.doesNotMatch(f, /Path2D/, 'no paths for a 2D canvas');
  assert.match(src, /args\.ducts = m\.hide \? null : fxDuct\(\)\.nums;/);
  assert.doesNotMatch(src, /function paintFx\(|fxBoxes/);
});

test('running, the model\'s own frame bumps (update, the pressures\' glide) do not wake the surface pass every frame', () => {
  assert.match(src, /function update\(f\) \{\n\s+drawVersion\+\+; frameBumps\+\+;/);
  assert.match(src, /const inks = model\.inks;\n\s+drawVersion\+\+; frameBumps\+\+;/);
  assert.equal([...src.matchAll(/frameBumps\+\+/g)].length, 2);
  // (the store's '*' listener already skips a frame alone: 'frame' is in UNSEEN)
  assert.match(src, /const UNSEEN = new Set\(\['frame',/);
});
