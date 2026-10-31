// Beads close up and the shimmer far out, fatter beads past a packed lane, and arrowheads that fade on a lumen wide on screen
// (combined plan B2, B3, C2; ?bloodzoom=0 for the old look). No GL in node: the shader as source, and its numbers mirrored here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gl = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
const stage = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
const lob = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// The shader's growth past a packed lane (x: the lane's occupancy before it is capped at 1).
const grow = (x) => { const ov = Math.max(x, 1); return 1 + 0.35 * Math.min(1, Math.max(0, (2.885 * (ov - 1)) / (ov + 1))); };

test('B2: nothing changes up to a packed lane; past it the beads and streaks grow with about log2 of the overflow, at most 35 %', () => {
  for (const x of [0, 0.3, 0.99, 1]) assert.equal(grow(x), 1);
  let last = 1;
  for (let x = 1; x <= 2; x += 0.05) {
    const g = grow(x);
    assert.ok(g >= last);
    assert.ok(Math.abs((g - 1) / 0.35 - Math.log2(x)) < 0.04, `${x}`);
    last = g;
  }
  assert.ok(Math.abs(grow(4) - 1.35) < 1e-12);
  assert.match(gl, /float grow = sat == 1 \? 1\.0 \+ 0\.35 \* clamp\(2\.885 \* \(ov - 1\.0\) \/ \(ov \+ 1\.0\), 0\.0, 1\.0\) : 1\.0;/);
  assert.match(gl, /float rd = max\(0\.26 \* laneW, 1\.35 \* pxW\) \* \(1\.0 \+ 0\.6 \* stasis\) \* grow;/);
  assert.match(gl, /float dens = sqrt\(clamp\(p, 0\.0, 1\.0\)\) \* gS;/);
});

test('B3: the beads\' share by the lumen\'s radius on screen: shimmer under 4 CSS px, beads over 7, both between, the shimmer alone skipped where beads cover', () => {
  assert.equal(smooth(4, 7, 3.9), 0);
  assert.equal(smooth(4, 7, 7.1), 1);
  assert.match(gl, /float bw = look == 0 \? 1\.0 : look == 1 \? 0\.0 : smoothstep\(4\.0, 7\.0, R \/ \(pxW \* cssPx\)\);/);
  assert.match(gl, /if \(bw >= 1\.0\) return beads;/);
  assert.match(gl, /if \(bw <= 0\.0\) return sh;/);
  // The beads follow the chain through junctions as the streaks do.
  assert.match(gl, /if \(bc4\.w < 1\.0\) bf = beadField\(id, s, y, D, 1\.0, dir, s0, R, n, laneW, p, stasis, rd, TL, aa\);/);
});

test('C2: the heads fade out between 5 and 9 CSS px of radius, unless Key chevrons, presenting or ?bloodzoom=0 keep them', () => {
  assert.match(gl, /float zf = chevZoom == 1 \? 1\.0 - smoothstep\(5\.0, 9\.0, R \/ \(pxW \* cssPx\)\) : 1\.0;/);
  assert.match(gl, /return zf < 1\.0 \? c \* zf : c;/);
  assert.match(gl, /gl\.uniform1i\(U\.chevZoom, BLOOD_ZOOM && blood\.chevZoom !== false \? 1 : 0\);/);
  assert.match(gl, /gl\.uniform1i\(U\.sat, BLOOD_ZOOM \? 1 : 0\);/);
  assert.match(gl, /const BLOOD_ZOOM = !\(typeof location !== 'undefined' && \/\[\?&\]bloodzoom=0\\b\/\.test\(location\.search\)\);/);
  assert.match(stage, /\.\.\.bloodColors\(\), chevZoom: !keyOnly\(\) \};/);
  assert.match(lob, /chevZoom: !\(st\.presenting \|\| b\.keyChevrons\)/);
});
