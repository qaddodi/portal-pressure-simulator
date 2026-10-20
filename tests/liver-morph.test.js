// The liver as cirrhosis and congestion reshape it (liver-morph.js; the outline also shrinks or swells about (560, 350)) and
// the organs that rest on it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORGANS } from '../src/ui/anatomy.js';
import { LIVER_GEO } from '../src/ui/liver-geo-data.js';
import { outlineNormals, contourNodules, morphOutline, liverShrink, fix1 } from '../src/ui/liver-morph.js';

const pts = [];
for (let i = 0; i < LIVER_GEO.pts.length; i += 2) pts.push([LIVER_GEO.pts[i], LIVER_GEO.pts[i + 1]]);
const base = { pts, nm: outlineNormals(pts), nod: contourNodules(LIVER_GEO.L, pts.length) };
function outline(c, g) {
  const k = liverShrink(c, g);
  return morphOutline(base, c, g).out.map(([x, y]) => [560 + (x - 560) * k, 350 + (y - 350) * k]);
}
const STATES = [[0, 0], [0.6, 0], [0.85, 0], [0.95, 0], [1, 0], [0, 0.5], [0, 1], [0.6, 0.5]];

// The heart rests on the diaphragm, which runs 11 over the liver's top (stage.js DIA_GAP) and is drawn under the heart's base
// with 3.5 to spare (heartFloor): the liver's top, swollen or shrunken, never rises into the heart (20 Oct review).
test("the heart's base stays on the diaphragm over the liver's top at every cirrhosis and congestion", () => {
  const H = [];
  const t = ORGANS.find((o) => o.id === 'heart').d.match(/[MCLZ]|-?\d+(\.\d+)?/g);
  for (let i = 0, cur, cmd; i < t.length;) {
    if (/[MCLZ]/.test(t[i])) { cmd = t[i++]; if (cmd === 'Z') continue; }
    if (cmd !== 'C') { cur = [+t[i], +t[i + 1]]; i += 2; H.push(cur); continue; }
    const a = [+t[i], +t[i + 1]], b = [+t[i + 2], +t[i + 3]], e = [+t[i + 4], +t[i + 5]];
    i += 6;
    for (let k = 1; k <= 50; k++) { const s = k / 50, u = 1 - s; H.push([0, 1].map((j) => u * u * u * cur[j] + 3 * u * u * s * a[j] + 3 * u * s * s * b[j] + s * s * s * e[j])); }
    cur = e;
  }
  const over = [];
  for (const [c, g] of STATES) {
    const R = outline(c, g);
    for (let x = 600; x <= 770; x += 2) {
      const base = Math.max(...H.filter((p) => Math.abs(p[0] - x) < 1.5).map((p) => p[1]));
      let top = Infinity;
      for (let i = 0, j = R.length - 1; i < R.length; j = i++) {
        const [ax, ay] = R[j], [bx, by] = R[i];
        if ((ax - x) * (bx - x) <= 0 && ax !== bx) top = Math.min(top, ay + ((by - ay) * (x - ax)) / (bx - ax));
      }
      if (Number.isFinite(base) && Number.isFinite(top) && base > top - 11 - 3.5 + 0.5) over.push(`x ${x}: ${(base - top + 14.5).toFixed(1)} into the diaphragm, cirrhosis ${c} congestion ${g}`);
    }
  }
  assert.deepEqual(over.slice(0, 8), []);
});

// The nodules' and the liver's paths are written with fix1 on every frame of the ease: the very text toFixed(1) gives.
test('fix1 writes exactly what toFixed(1) does', () => {
  const r = (() => { let s = 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const vals = [0, -0, 0.05, 0.15, 0.25, 0.35, 1.45, 2.55, 999.95, -3.25, 1e12, NaN, Infinity];
  for (let i = 0; i < 20000; i++) vals.push(r() * 1200, i / 20, i / 100 + 0.05, -r() * 50);
  for (const v of vals) assert.equal(fix1(v), v.toFixed(1), String(v));
});
