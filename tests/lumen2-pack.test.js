// The second lumen target packed in two channels (RG16UI, veins-gl ROW2_BITS; recs A4a): what the vessel shader writes and the
// composite reads back, checked on the shader text, and the round trip, done here as the shaders do it, within the steps they keep.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
const ROW2_BITS = 11, MASK = (1 << ROW2_BITS) - 1, S_OFF = 96;

test('the shaders write and read the packed second lumen, and the share beside the visibility', () => {
  assert.match(src, /export const ROW2_BITS = 11, ROW2_MASK = \(1 << ROW2_BITS\) - 1;/);
  assert.match(src, /\(uint\(round\(clamp\(gW, 0\.0, 1\.0\) \* 255\.0\)\) << 8u\) \| \(gId2 > 0u \? uint\(round\(clamp\(gB, 0\.0, 1\.0\) \* 255\.0\)\) : 0u\)\)/);
  assert.match(src, /uint gQ2 = uint\(clamp\(\(gY2 \+ 1\.0\) \* 64\.0, 0\.0, 127\.0\)\);/);
  assert.match(src, /\? uvec4\(gId2 \| \(\(gQ2 >> 2u\) << \$\{ROW2_BITS\}u\), \(uint\(clamp\(\(gS2 \+ S_OFF\) \* 4\.0, 0\.0, 16383\.0\)\) << 2u\) \| \(gQ2 & 3u\), 0u, 0u\)/);
  assert.match(src, /uint r2 = g2\.x & \$\{ROW2_MASK\}u;\n\s+float b = r2 > 0u \? float\(g\.w & 255u\) \/ 255\.0 : 0\.0;/);
  assert.match(src, /float s2 = float\(g2\.y >> 2u\) \/ 4\.0 - S_OFF, y2 = \(float\(\(\(g2\.x >> \$\{ROW2_BITS\}u\) << 2u\) \| \(g2\.y & 3u\)\) \+ 0\.5\) \/ 64\.0 - 1\.0;/);
  assert.match(src, /float vis = g\.x > 0u \? clamp\(float\(g\.w >> 8u\) \/ 255\.0 \/ max\(v\.a, 1e-3\), 0\.0, 1\.0\) : 0\.0;/);
  // (Every place the layer's targets are made takes the same formats.)
  assert.equal((src.match(/const fmt = layerFmt\(\);/g) || []).length, 2);
  assert.match(src, /gl\.texImage2D\(gl\.TEXTURE_2D, 0, gl\.RG16UI, fboW, fboH, 0, gl\.RG_INTEGER, gl\.UNSIGNED_SHORT, null\);/);
  assert.doesNotMatch(src, /\[gl\.RGBA16UI, gl\.RGBA_INTEGER, gl\.UNSIGNED_SHORT\], \[gl\.RGBA16UI/);
  assert.match(src, /if \(nTubes \+ 1 > ROW2_MASK\) \{/);
});

test('the round trip keeps the row whole, the across within a 128th, the arc within a quarter, the share and visibility within a 510th', () => {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  for (const row of [1, 2, 200, MASK]) for (const y of [-1, -0.73, -0.01, 0, 0.4999, 1]) for (const s of [-96, -3.3, 0, 517.26, 3999]) for (const b of [0.003, 0.5, 0.997]) {
    const q = Math.floor(clamp((y + 1) * 64, 0, 127));
    const x = row | ((q >> 2) << ROW2_BITS), yy = (Math.floor(clamp((s + S_OFF) * 4, 0, 16383)) << 2) | (q & 3);
    const w = (Math.round(0.8 * 255) << 8) | Math.round(b * 255);
    assert.ok(x < 65536 && yy < 65536 && w < 65536);
    assert.equal(x & MASK, row);
    const s2 = (yy >> 2) / 4 - S_OFF, y2 = ((((x >> ROW2_BITS) << 2) | (yy & 3)) + 0.5) / 64 - 1;
    assert.ok(Math.abs(s2 - s) <= 0.25 + 1e-9, `arc ${s} → ${s2}`);
    assert.ok(Math.abs(y2 - y) <= 1 / 64 + 1e-9, `across ${y} → ${y2}`);
    assert.ok(Math.abs((w & 255) / 255 - b) <= 1 / 510 + 1e-9);
    assert.ok(Math.abs((w >> 8) / 255 - 0.8) <= 1 / 510 + 1e-9);
  }
});

test('the figure\'s vessel rows fit the packed row, with room to spare', async () => {
  const A = await import('../src/ui/anatomy.js');
  const { EDGES } = await import('../src/engine/topology.js');
  const strands = Object.values(A.STRANDS).reduce((n, l) => n + l.length, 0);
  let feeders = 0;
  for (const fd of Object.values(A.FEEDERS)) feeders += (fd.fan ? A.fanFeeders(fd.fan).length : 0) + (fd.paths || []).length;
  const trees = Object.values(A.CIRCUIT_TREES).reduce((n, l) => n + l.length, 0);
  const rows = EDGES.length + strands + feeders + trees;   // (more than stage.js GL_ROWS: every edge, hidden or not)
  assert.ok(rows + 1 < MASK / 4, `${rows} rows`);
});
