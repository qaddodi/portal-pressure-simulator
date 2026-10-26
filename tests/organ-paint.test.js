import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseColor, mul, inv, detailTol } from '../src/ui/organ-paint.js';

// The organs painted live on the GPU (organ-paint.js) read their colours from the page's computed styles: every form the
// browser gives back must be read, or an organ would be painted in the wrong colour (the browser checks: tests/e2e/organ-paint.mjs).
test('the computed colours are read in every form the browser gives', () => {
  assert.deepEqual(parseColor('rgb(255, 0, 51)'), [1, 0, 0.2, 1]);
  assert.deepEqual(parseColor('rgba(0, 255, 0, 0.5)'), [0, 1, 0, 0.5]);
  assert.deepEqual(parseColor('rgb(0 0 255 / 25%)'), [0, 0, 1, 0.25]);
  assert.deepEqual(parseColor('color(srgb 0.5 0.25 1 / 0.75)'), [0.5, 0.25, 1, 0.75]);
  assert.deepEqual(parseColor('transparent'), [0, 0, 0, 0]);
  assert.equal(parseColor('url(#g)'), null, 'a paint server is not a colour');
});

test('transforms compose and invert as the SVG matrices do', () => {
  const a = [2, 0.5, -1, 3, 10, -4], b = [0.5, 0, 0, 2, 3, 7];
  const p = mul(a, b), q = mul(p, inv(p));
  [1, 0, 0, 1, 0, 0].forEach((v, i) => assert.ok(Math.abs(q[i] - v) < 1e-9));
  // (a after b: b's point (1, 1) is (3.5, 9), then a's.)
  assert.ok(Math.abs(p[0] + p[2] + p[4] - (2 * 3.5 - 1 * 9 + 10)) < 1e-9);
});

test('with the GPU organs on, the liver, spleen and fluid ease with no drop to the SVG drawing', () => {
  const src = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  assert.match(src, /const LIVE_LAYERS = /);
  // The liver's, the spleen's and the fluid's own drops, as they ease.
  assert.equal(src.match(/veins\.hasPlate\(0\) && !liveOn\(\)\) hidePlate\(\);/g)?.length, 3);
  // And platePoke's, while they move.
  assert.match(src, /if \(!live && \(lvMoving \|\| fluidEasing\(\)\)\) \{ if \(plateKey && veins\.hasPlate\(0\) && plateStateKey\(\) !== plateKey\) hidePlate\(\); return; \}/);
  assert.match(src, /if \(!live && spleenMoving\(\)\) \{ if \(plateKey && veins\.hasPlate\(0\) && plateStateKey\(\) !== plateKey\) hidePlate\(\);/);
});

test('what the SVG hides is not painted: visibility as the picture copy takes it, not the figure\'s hidden one', () => {
  const src = readFileSync(new URL('../src/ui/organ-paint.js', import.meta.url), 'utf8');
  assert.match(src, /const own = el\.style\?\.visibility \|\| el\.getAttribute\('visibility'\);\n\s+if \(own && own !== 'inherit'\) vis = own;/);
  assert.match(src, /for \(const k of el\.children\) walk\(k, me, a, cl, vis, ch, out, a0\); return; \}\n\s+if \([^\n]*\|\| vis !== 'visible'\) return;/);
});

// T02 (smoothness review, 26 Oct): a clipped organ's clip outline was cut at exactly 0.2 / scale, so every zoom step was a new
// tolerance, a new mesh key, a new mesh built and uploaded. Clips now take the fills' and strokes' power-of-two buckets.
test('a zoom inside one detail bucket keeps the same tolerance, never coarser than a fifth of a pixel', () => {
  for (let sc = 0.05; sc < 40; sc *= 1.037) {
    const t = detailTol(sc);
    assert.ok(t * sc <= 0.2 + 1e-12 || t === 0.5, `within a fifth of a pixel at scale ${sc}`);
    assert.ok(t * sc > 0.1 - 1e-12 || t === 0.5, `and no finer than needed at scale ${sc}`);
    assert.ok(Number.isInteger(Math.log2(t)), 'a power of two');
  }
  // A continuous zoom from 1.6 to 3.1 px per unit stays in at most two buckets (one switch where the zoom doubles).
  const seen = new Set();
  for (let sc = 1.6; sc <= 3.1; sc += 0.01) seen.add(detailTol(sc));
  assert.ok(seen.size <= 2, `${seen.size} tolerances over the zoom`);
  const src = readFileSync(new URL('../src/ui/organ-paint.js', import.meta.url), 'utf8');
  const opAt = src.slice(src.indexOf('function opAt('), src.indexOf('return { om, sh, cm, csh, b, alpha: lv.alpha };'));
  assert.match(opAt, /tol = detailTol\(sc\)/);
  assert.match(opAt, /csh = meshOf\(op\.clip\.geom, 0, detailTol\(scaleOf\(cm\)\)\)/, 'the clip in the same buckets');
  assert.doesNotMatch(opAt, /0\.2 \/ scaleOf/, 'no continuous clip tolerance');
});
