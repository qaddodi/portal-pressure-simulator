// The lobule dive's field on the GPU (field-gl.js): the same picture the 2D canvas made, in one pass, with the tile sizes
// blended so the lobules gain their detail gradually as they grow (Mohammad, 24 Oct: "still laggy", simpler lobules far out,
// more defined, then the main lobule last).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIELD_RS, fieldBlend, fadeAt, FADE_MID } from '../src/ui/lobule-look.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const lz = read('../src/ui/lobule-zoom.js');
const fgl = read('../src/ui/field-gl.js');

test('the two blended tile sizes are never smaller than the size wanted, and the blend never steps', () => {
  let last = null;
  for (let want = 1; want <= 600; want *= 1.002) {
    const { a, b, mix } = fieldBlend(want);
    assert.ok(b === a || b === a + 1);
    if (want <= FIELD_RS[FIELD_RS.length - 1]) assert.ok(FIELD_RS[a] >= want, `size ${FIELD_RS[a]} shown for ${want.toFixed(1)}`);
    assert.ok(mix >= 0 && mix <= 1);
    // Where on the ladder of sizes the picture is (a, plus how far into b): continuous and never going back.
    const pos = a + mix;
    if (last !== null) {
      assert.ok(pos >= last - 1e-9, `the blend went back at ${want.toFixed(2)}`);
      assert.ok(pos - last < 0.01, `the blend stepped by ${(pos - last).toFixed(3)} at ${want.toFixed(2)}`);
    }
    last = pos;
  }
});

test('the shader fades into the page exactly as the 2D gradient does', () => {
  // The shader's expression, as written in field-gl.js, against the 2D fade's stops (fadeAt) at full strength and below.
  assert.match(fgl, /float a = s < 0\.5 \? uMid \* uFade\.z \* \(s \* 2\.0\) : mix\(uMid \* uFade\.z, uFade\.z, s \* 2\.0 - 1\.0\);/);
  const shader = (d, r0, r1, q) => { const s = Math.min(1, Math.max(0, (d - r0) / Math.max(r1 - r0, 1e-6))); return s < 0.5 ? FADE_MID * q * (s * 2) : FADE_MID * q + (q - FADE_MID * q) * (s * 2 - 1); };
  for (let d = 0; d <= 900; d += 7) {
    assert.ok(Math.abs(shader(d, 100, 600, 1) - fadeAt(d, 100, 600)) < 1e-9);
    assert.ok(Math.abs(shader(d, 100, 600, 0.4) - 0.4 * fadeAt(d, 100, 600)) < 1e-9);
  }
  // The emerging mask: whole inside rho × 0.35, gone at rho, as the 2D radial gradient.
  assert.match(fgl, /m = 1\.0 - clamp\(\(length\(p - uMask\.xy\) - uMask\.z \* 0\.35\) \/ max\(uMask\.z \* 0\.65, 1e-6\), 0\.0, 1\.0\);/);
  // One repeat (two lobules wide, two high) per 6 rd by 2√3 rd, as the 2D pattern's transform.
  assert.match(fgl, /vec2 uv = \(p - uO\) \/ \(uRd \* vec2\(6\.0, 3\.4641016151377544\)\);/);
  assert.match(lz, /pat\.setTransform\(new DOMMatrix\(\[\(t\.TW \/ t\.R\) \* rd \/ t\.tw, 0, 0, \(t\.TH \/ t\.R\) \* rd \/ t\.th, x, y\]\)\);/);
  assert.match(lz, /const TW = 6 \* R, TH = 2 \* S3 \* R,/);
});

test('the GPU field takes its numbers from the same places as the 2D field', () => {
  const gpu = lz.slice(lz.indexOf('function paintFieldGL('), lz.indexOf('function liverTile('));
  assert.match(gpu, /fieldBlend\(rd \* 0\.55\)/, 'half the tile\'s resolution, as on the 2D canvas');
  assert.match(gpu, /Math\.log\(Math\.min\(Math\.hypot\(W, H\) \* dpr \* 0\.45, rd \* 1\.1\)\), f\)\)/, 'the same clear circle');
  assert.match(gpu, /rho = Math\.hypot\(W, H\) \* dpr \* \(0\.2 \+ 1\.1 \* d\.a \+ 2 \* smooth\(0\.7, 1, d\.a\)\)/, 'the same emerging mask');
  assert.match(gpu, /fadeOuter\(r0,/, 'the neighbours still reach every edge');
  assert.match(gpu, /mid: FADE_MID, bg: tone,/);
  // Drawn on the GPU when it can be, the 2D canvas left empty; otherwise the 2D passes as before.
  assert.match(lz, /if \(g && paintFieldGL\(g, d, W, H, dpr, cs, dark, bg\)\) \{\n\s+fieldHide\(field\);/);
  assert.match(lz, /fieldHide\(fieldG\);\n\s+if \(field\.width !== Math\.round\(W \* dpr\)/);
});

test('nothing is sent to the GPU or compiled during the zoom', () => {
  // Every tile the dive steps through, and the one size above the landing's that it blends in, uploaded ahead.
  assert.equal((lz.match(/quietTile\(t, shadeOf\(bg, dark\)\); fieldUp\(t\); \}\); if \(r >= top \* 2\) break; \}/g) || []).length, 2, 'idle preparation and prewarm');
  assert.match(lz, /\(\) => fieldGLOn\(\), {3}\/\/ \(the field's GPU context, made here once/);
  assert.match(lz, /warmQ = \[\(\) => ensureGL\(\), \(\) => fieldGLOn\(\)\];/);
  // Kept when the lobule is left (the next dive's), and their GPU copies given back with them.
  assert.match(lz, /FIELD_RS\[fieldBlend\(geo\.R \* k \* Math\.min\(1, devicePixelRatio \|\| 1\) \* 0\.8 \* 0\.55\)\.b\]/);
  assert.match(lz, /fieldGL\?\.sweep\(\);/);
});

test('the GPU field falls back to the 2D canvas without WebGL2, on a software renderer, or when its context is lost', () => {
  assert.match(fgl, /failIfMajorPerformanceCaveat: true/);
  assert.match(fgl, /canvas\.addEventListener\('webglcontextlost', \(e\) => \{ lost = true;/);
  assert.match(lz, /return fieldGL && !fieldGL\.lost \? fieldGL : null;/);
  assert.match(fgl, /LINEAR_MIPMAP_LINEAR/, 'mipmapped: a size shown below its own never shimmers');
});
