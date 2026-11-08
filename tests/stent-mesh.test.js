// The covered TIPS stent's geometry (visual-style D4, stent-mesh.js): bare struts at the portal end, a PTFE cover over the rest, one ring
// where they meet; a plain mesh (DIPS, the stent tool's shunts, the veins') is exactly what it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BARE_CM, bareOf, stentMeshD } from '../src/ui/stent-mesh.js';

// A straight vessel along +x, half-width 4: f(a, side) = [a, 4 * side].
const f = (a, side) => [a, 4 * side];
const nums = (d) => (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
const xs = (d) => nums(d).filter((_, i) => i % 2 === 0);
const A = 100, bare = 25;

test('a plain mesh has one set of struts, no cover and no ring', () => {
  const m = stentMeshD(f, 4, A, 1, true);
  assert.equal(m.covStruts, '');
  assert.equal(m.cover, '');
  assert.equal(m.ring, '');
  assert.ok(m.struts.startsWith('M0.0 4.0') && m.rails.startsWith('M0.0 4.0'));
  assert.equal(m.marks, 'M0.0 4.0 L0.0 -4.0 M100.0 4.0 L100.0 -4.0 ');
  assert.equal(stentMeshD(f, 4, A, 1, false).marks, 'M0.0 4.0 L0.0 -4.0 ', 'ends: false leaves the far marker to the front');
});

test('a bare length of 0 or the whole stent draws the plain mesh', () => {
  const plain = stentMeshD(f, 4, A, 1, true);
  assert.deepEqual(stentMeshD(f, 4, A, 1, true, 0), plain);
  assert.deepEqual(stentMeshD(f, 4, A, 1, true, A), plain);
});

test('the covered stent: bare struts to the ring, covered struts and the cover beyond it', () => {
  const m = stentMeshD(f, 4, A, 1, true, bare);
  assert.ok(Math.max(...xs(m.struts)) <= bare + 0.05, 'the bare struts stop at the ring');
  assert.ok(Math.min(...xs(m.covStruts)) >= bare - 0.05 && Math.max(...xs(m.covStruts)) > A - 7, 'the covered struts run on from it to the far end');
  assert.equal(m.ring, `M${bare.toFixed(1)} 4.0 L${bare.toFixed(1)} -4.0`, 'one ring across the mesh where the two meet');
  assert.ok(m.cover.endsWith('Z') && m.cover.startsWith('M'), 'the cover is a closed outline');
  assert.ok(Math.min(...xs(m.cover)) >= bare - 0.05 && Math.max(...xs(m.cover)) >= A - 0.05, 'the cover spans the ring to the far end, and not the bare stretch');
  const ys = nums(m.cover).filter((_, i) => i % 2 === 1);
  assert.ok(Math.max(...ys) === 4 && Math.min(...ys) === -4, 'between the rails');
  // The lattice is continuous across the cut: the strut that crosses the ring ends one path and starts the other at the same point.
  const lastBare = nums(m.struts).slice(-2), firstCov = nums(m.covStruts).slice(0, 2);
  assert.ok(Math.abs(firstCov[0] - bare) < 0.05 || Math.abs(lastBare[0] - bare) < 0.05);
});

test('the same lattice either way: the three parts together draw the plain mesh\'s struts', () => {
  const count = (d) => (d.match(/L/g) || []).length;
  const plain = stentMeshD(f, 4, A, 1, true), three = stentMeshD(f, 4, A, 1, true, bare);
  // (a strut cut at the ring adds one point to each side of the cut, per way across)
  assert.equal(count(three.struts) + count(three.covStruts), count(plain.struts) + 2);
});

test('unrolled from the start: nothing past the front is drawn, and the ring and cover wait for it', () => {
  const early = stentMeshD(f, 4, A, 0.2, true, bare);   // front at a = 20, before the ring
  assert.equal(early.cover, '');
  assert.equal(early.ring, '');
  assert.equal(early.covStruts, '');
  assert.ok(Math.max(...xs(early.struts)) <= 20.05 && Math.max(...xs(early.rails)) <= 20.05);
  const late = stentMeshD(f, 4, A, 0.6, true, bare);
  assert.ok(late.ring && late.cover && late.covStruts);
  assert.ok(Math.max(...xs(late.cover)) <= 60.05 && Math.max(...xs(late.covStruts)) <= 60.05, 'cover and struts end at the front');
});

test('the bare stretch is 2 cm of the shunt, never more than two fifths of it', () => {
  assert.equal(BARE_CM, 2);
  assert.equal(bareOf(100, 8), 25);
  assert.equal(bareOf(100, 4), 40, 'a short shunt keeps some cover');
  assert.equal(bareOf(100, 0), 25, 'an unknown length is the usual 8 cm');
});

test('the figure draws it: struts keep a device pixel, the cover and ring are device materials, the TIPS is unrolled with the veins\' stents', () => {
  const css = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.stent-cover \{[^}]*var\(--dev-ptfe, /, 'the PTFE wash');
  assert.match(css, /\.stent-ring \{[^}]*var\(--dev-platinum, /, 'the radiopaque ring');
  assert.match(css, /\.stent-px \{ vector-effect: non-scaling-stroke; \}/, 'a pixel floor for struts and rails');
  const venous = readFileSync(new URL('../src/ui/stage-venous.js', import.meta.url), 'utf8');
  assert.match(venous, /meshPaths\(id, p, d0, d1, 1, false, tips \? tipsBare\(id\) : 0\)/, 'the whole covered mesh, built once');
  assert.match(venous, /d0 = tips \? 2 : /, 'unrolled from the portal end');
});
