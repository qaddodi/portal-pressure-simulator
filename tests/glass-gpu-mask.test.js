// The glass's masks and colours with no canvas 2D (1 Nov 2026, Mohammad: no 2D canvas anywhere). A callout's outline is cut into
// polygons (path-poly.js) and filled on the GPU by parity (glass-gl fillMask); a colour is parsed, or resolved by the browser's CSS when
// the page is read, never by a 2D canvas's parser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathPolys, fanTriangles } from '../src/ui/path-poly.js';

const area = (p) => { let a = 0; for (let i = 0; i < p.length; i += 2) { const j = (i + 2) % p.length; a += p[i] * p[j + 1] - p[j] * p[i + 1]; } return Math.abs(a / 2); };

test('a path cut into polygons keeps its area: lines, relative commands, arcs and curves', () => {
  assert.equal(area(pathPolys('M0 0h10v10h-10z')[0]), 100);
  assert.equal(area(pathPolys('M0 0L10 0L10 10L0 10Z')[0]), 100);
  const q = 14, w = 200, h = 80;
  const round = `M${q} 0H${w - q}A${q} ${q} 0 0 1 ${w} ${q}V${h - q}A${q} ${q} 0 0 1 ${w - q} ${h}H${q}A${q} ${q} 0 0 1 0 ${h - q}V${q}A${q} ${q} 0 0 1 ${q} 0Z`;
  assert.ok(Math.abs(area(pathPolys(round)[0]) - (w * h - (4 - Math.PI) * q * q)) < 4, 'a rounded box');
  const circle = 'M0 10A10 10 0 1 1 20 10A10 10 0 1 1 0 10Z';
  assert.ok(Math.abs(area(pathPolys(circle)[0]) - Math.PI * 100) < 4, 'two half arcs (within 0.2 px of the curve)');
  assert.ok(Math.abs(area(pathPolys('M0 0C0 0 10 0 10 0L10 10L0 10Z')[0]) - 100) < 1e-9, 'a straight cubic');
  assert.ok(Math.abs(area(pathPolys('M0 0Q5 10 10 0Z')[0]) - 100 / 3) < 0.5, 'a parabola');
  assert.equal(pathPolys('M0 0M5 5L6 6Z').length, 0, 'a subpath with fewer than three points is dropped');
  assert.equal(pathPolys('M0 0 L NaN').length, 0);
});

test('the fans cover each polygon once per triangle from its first point, scaled to the mask', () => {
  const t = fanTriangles(pathPolys('M0 0h10v10h-10z'), 2);
  assert.equal(t.length, 12, 'a quad: two triangles');
  assert.deepEqual([...t.slice(0, 6)], [0, 0, 20, 0, 20, 20]);
});

test('glass-gl has no 2D canvas: the masks are filled on the GPU and the colours resolved in script', async () => {
  const g = readFileSync(new URL('../src/ui/glass-gl.js', import.meta.url), 'utf8');
  assert.doesNotMatch(g, /getContext\('2d'\)|Path2D/);
  assert.match(g, /G\.blendFuncSeparate\(G\.ONE_MINUS_DST_COLOR, G\.ZERO, G\.ONE_MINUS_DST_ALPHA, G\.ZERO\);/, 'filled by parity');
  assert.match(g, /parseCssColor\(k\)/, 'any colour, in sRGB, worked out in script (css-color.js)');
  assert.doesNotMatch(g, /createElement\('i'\)|probe\.style/, 'no probe element is written to or read back');
  const now = g.slice(g.indexOf('  function nowGeo(list) {'), g.indexOf('  // While a callout shows, every frame'));
  assert.doesNotMatch(now, /resolveColour/, 'never in a frame');
  const { parseColour } = await import('../src/ui/glass-gl.js');
  assert.deepEqual(parseColour('#fff'), [1, 1, 1, 1]);
  assert.deepEqual(parseColour('#00000080').map((v) => +v.toFixed(3)), [0, 0, 0, 0.502]);
  assert.deepEqual(parseColour('transparent'), [0, 0, 0, 0]);
  assert.deepEqual(parseColour('rgba(255, 0, 0, 0.5)'), [1, 0, 0, 0.5]);
  assert.deepEqual(parseColour('rgb(255 0 0 / 50%)'), [1, 0, 0, 0.5]);
  assert.deepEqual(parseColour('oklab(0.5 0 0)'), [0, 0, 0, 0], 'left to resolveColour');
});
