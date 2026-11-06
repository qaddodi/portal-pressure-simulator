// Lymph in the lobule is dashes in the channel (6 Nov 2026): the vessel composite lays them from flow rows, so the lymph moves with the
// vessels at no cost of its own. These checks read the sources: the shader's dash function and its gates, and the rows the lobule writes.
import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');

test('the composite has a lymph dash function and a lymph row never draws blood streaks or arrowheads', () => {
  assert.match(gl, /void lymphAt\(float s, float y, vec4 f0, float len, float R, out float cover, out float core\)/);
  assert.match(gl, /bool isLy = f1\.x < -0\.5;/);
  assert.match(gl, /if \(blood == 1 && blendA\.x > 0\.0 && f1\.z > 0\.0 && !isLy\) \{/, 'blood streaks skip a lymph row');
  assert.match(gl, /chev == 1 && chevQuad == 0 && f1\.z > 0\.0 && !isLy/, 'arrowheads skip a lymph row');
  assert.match(gl, /if \(blood == 1 && isLy && f1\.z > 0\.0\) \{\n\s*float lc, lk;\n\s*lymphAt\(s1, y1, f0, len1, R1, lc, lk\);/);
});

test('the dashes are drawn in the channel\'s own frame: arc length and across, so a pan or pinch cannot slide them off their vessel', () => {
  const f = gl.slice(gl.indexOf('void lymphAt('), gl.indexOf('// Moving blood in one lumen at arc length s'));
  assert.match(f, /fract\(\(s - f0\.x\) \/ pitch\)/, 'phase along the channel, in world units');
  assert.match(f, /ya = y \* R/, 'across the channel, in world units');
  assert.doesNotMatch(f, /gl_FragCoord|\bFC\b/, 'no screen-space coordinate');
});

test('the lobule writes one flow row per lymph channel, only with the Lymph layer on, and turns the composite on for it', () => {
  assert.match(lz, /const lyOn = lymphOn && !m\.hide;/);
  assert.match(lz, /blood\.on = \(bloodOn \|\| lyOn\) && flowA > 0\.002;/);
  assert.match(lz, /if \(t\.kind !== 'ly' && t\.kind !== 'lt'\) continue;\n\s*const mo = motionOf\(t\), o = t\.id \* FLOW_TEXELS \* 4;/);
  assert.match(lz, /\(t\.kind === 'ly' \? -1 : 1\) \* dt \* lyVw/, 'out along the space of Disse, in along the terminal lymphatics');
  assert.match(lz, /flowData\[o \+ 6\] = 1;/);
});

test('nothing is built or drawn per frame for the lymph overlay any more', () => {
  assert.doesNotMatch(lz, /lyDrops|fxGLErase|lyRaw|lyNd/);
});
