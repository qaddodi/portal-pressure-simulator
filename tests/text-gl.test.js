// GPU text (text-gl.js): words laid out from the font's own outlines, no 2D canvas. And the organ painter's dashes (organ-paint.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGlyphs, glyphsReady, textWidth, textPolys, weightOf } from '../src/ui/text-gl.js';
import { dashPolys } from '../src/ui/organ-paint.js';

test('text: the font\'s advances, tabular figures as wide as each other, kerning, the nearest weight', async () => {
  assert.equal(glyphsReady(), false);
  await loadGlyphs();
  assert.equal(glyphsReady(), true);
  assert.equal(weightOf('bold'), 700); assert.equal(weightOf(450), 400); assert.equal(weightOf(560), 600);
  const tn = (t) => textWidth(t, { weight: 700, size: 12, tnum: true });
  assert.equal(tn('11.1'), tn('88.8'), 'tabular figures');
  assert.ok(textWidth('11', { weight: 700, size: 12 }) < textWidth('88', { weight: 700, size: 12 }), 'proportional figures');
  assert.ok(Math.abs(textWidth('kPa', { size: 24 }) - 2 * textWidth('kPa', { size: 12 })) < 1e-6, 'scales with size');
  // (A kerned pair is narrower than its two glyphs' advances.)
  assert.ok(textWidth('AV', { weight: 600, size: 100 }) < textWidth('A', { weight: 600, size: 100 }) + textWidth('V', { weight: 600, size: 100 }));
  const t = textPolys('5.0', 10, 20, { weight: 700, size: 12, tnum: true });
  assert.ok(t.polys.length >= 3);
  for (const p of t.polys) for (let k = 1; k < p.pts.length; k += 2) assert.ok(p.pts[k] <= 20.3 && p.pts[k] > 20 - 12, 'on the baseline (a round figure overshooting it), within the size');
});

test('dashes: a pattern runs along each subpath from its start, shifted by the offset', () => {
  const r = dashPolys([{ pts: new Float32Array([0, 0, 10, 0, 10, 10]), closed: false }], { a: [3, 2], off: 1 });
  assert.deepEqual(r.map((p) => [...p.pts].map((v) => +v.toFixed(2))), [[0, 0, 2, 0], [4, 0, 7, 0], [9, 0, 10, 0, 10, 2], [10, 4, 10, 7], [10, 9, 10, 10]]);
});

test('text-gl.js is the only module that reads the SDF atlas', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = new URL('../src/ui/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.js') && !/^glyphs-inter/.test(n) && n !== 'text-gl.js')) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.ok(!/from\s+['"]\.\/glyphs-inter/.test(src), `${f} imports the SDF atlas directly; go through text-gl.js sdfAtlas`);
  }
});
