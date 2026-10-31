// Past a packed lane, more flow draws denser, brighter streaks (combined plan B2; ?bloodsat=0 for the old look). Streaks only, at
// every zoom: no beads, and the arrowheads never fade on a wide lumen (Mohammad, 31 Oct: "Dots suck. Keep streaks", "Without pop in
// and pop out"). No GL in node: the shader as source, and its numbers mirrored here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const lob = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
// The shader's gain past a packed lane (x: the lane's occupancy before it is capped at 1).
const gain = (x) => { const ov = Math.max(x, 1); return 1 + 0.35 * Math.min(1, Math.max(0, (2.885 * (ov - 1)) / (ov + 1))); };

test('B2: nothing changes up to a packed lane; past it the streaks grow denser and brighter with about log2 of the overflow, at most 35 %', () => {
  for (const x of [0, 0.3, 0.99, 1]) assert.equal(gain(x), 1);
  let last = 1;
  for (let x = 1; x <= 2; x += 0.05) {
    const g = gain(x);
    assert.ok(g >= last);
    assert.ok(Math.abs((g - 1) / 0.35 - Math.log2(x)) < 0.04, `${x}`);
    last = g;
  }
  assert.ok(Math.abs(gain(4) - 1.35) < 1e-12);
  assert.match(gl, /float gS = sat == 1 \? 1\.0 \+ 0\.35 \* clamp\(2\.885 \* \(ovS - 1\.0\) \/ \(ovS \+ 1\.0\), 0\.0, 1\.0\) : 1\.0;/);
  // The density feeds both the streaks' threshold (denser) and their strength (brighter).
  assert.match(gl, /float dens = sqrt\(clamp\(p, 0\.0, 1\.0\)\) \* gS;/);
  assert.match(gl, /float streak = smoothstep\(0\.46 - 0\.08 \* dens, 0\.9, nz\);/);
  assert.match(gl, /streak \* \(0\.32 \+ 0\.26 \* dens\)/);
  assert.match(gl, /gl\.uniform1i\(U\.sat, BLOOD_SAT \? 1 : 0\);/);
  assert.match(gl, /const BLOOD_SAT = !\(typeof location !== 'undefined' && \/\[\?&\]bloodsat=0\\b\/\.test\(location\.search\)\);/);
});

test('B2 never pops: the gain is continuous in the flow, so a flow easing past a packed lane eases the streaks with it', () => {
  for (let x = 0.5; x < 3; x += 0.001) assert.ok(Math.abs(gain(x + 0.001) - gain(x)) < 0.002, `${x}`);
});

test('no beads and no zoom fade of the arrowheads (B3 and C2 dropped)', () => {
  assert.doesNotMatch(gl, /beadField|lookOf|BLOOD_ZOOM|chevZoom|uniform int look/);
  assert.doesNotMatch(gl, /float zf = /);
  assert.doesNotMatch(stage, /chevZoom/);
  assert.doesNotMatch(lob, /chevZoom/);
});
