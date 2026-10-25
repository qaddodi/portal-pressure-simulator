// The diaphragm over the organs (diaphragm.js): one smooth dome above the liver, the stomach and the spleen, with no corner,
// kink, hook, V dip, loop or flat straight run, in every state the liver eases through (Mohammad, 20 Oct).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORGANS, SPLEEN_CENTER } from '../src/ui/anatomy.js';
import { LIVER_GEO } from '../src/ui/liver-geo-data.js';
import { outlineNormals, contourNodules, morphOutline, liverShrink } from '../src/ui/liver-morph.js';
import { DIA, diaphragmLine } from '../src/ui/diaphragm.js';

function sample(d) {
  const t = d.match(/[MCLZ]|-?\d+(\.\d+)?/g), P = [];
  for (let i = 0, cur, cmd; i < t.length;) {
    if (/[MCLZ]/.test(t[i])) { cmd = t[i++]; if (cmd === 'Z') continue; }
    if (cmd !== 'C') { cur = [+t[i], +t[i + 1]]; i += 2; P.push(cur); continue; }
    const a = [+t[i], +t[i + 1]], b = [+t[i + 2], +t[i + 3]], e = [+t[i + 4], +t[i + 5]];
    i += 6;
    for (let k = 1; k <= 16; k++) { const s = k / 16, u = 1 - s; P.push([0, 1].map((j) => u * u * u * cur[j] + 3 * u * u * s * a[j] + 3 * u * s * s * b[j] + s * s * s * e[j])); }
    cur = e;
  }
  return P;
}
const organ = (id) => sample(ORGANS.find((o) => o.id === id).d);
const pts = [];
for (let i = 0; i < LIVER_GEO.pts.length; i += 2) pts.push([LIVER_GEO.pts[i], LIVER_GEO.pts[i + 1]]);
const base = { pts, nm: outlineNormals(pts), nod: contourNodules(LIVER_GEO.L, pts.length) };
const heart = organ('heart'), stomach = organ('stomach');
// As stage.js heartFloor: 3.5 under the heart's lowest point in each 4-unit column.
const hb = new Map();
for (const [x, y] of heart) { const i = Math.round(x / 4); if (y > (hb.get(i) ?? -Infinity)) hb.set(i, y); }
const floor = (x) => { const a = hb.get(Math.floor(x / 4)), b = hb.get(Math.ceil(x / 4)); return a == null || b == null ? -Infinity : Math.max(a, b) + 3.5; };

function state(c, g, sc) {
  const k = liverShrink(c, g), { dome } = morphOutline(base, c, g);
  const liver = (c + g > 0 ? dome : pts).map(([x, y]) => [560 + (x - 560) * k, 350 + (y - 350) * k]);
  const spleen = organ('spleen').map(([x, y]) => [SPLEEN_CENTER[0] + (x - SPLEEN_CENTER[0]) * sc, SPLEEN_CENTER[1] + (y - SPLEEN_CENTER[1]) * sc]);
  return { organs: [liver, stomach, spleen], line: diaphragmLine([liver, stomach, spleen], floor) };
}
const STATES = { healthy: [0, 0, 1], 'full cirrhosis': [1, 0, 1], 'full cirrhosis, big spleen': [1, 0, 1.3], 'full congestion': [0, 1, 1], 'both halfway': [0.5, 0.5, 1.15] };
const turns = (L) => L.slice(1, -1).map((p, i) => {
  let d = Math.atan2(L[i + 2][1] - p[1], L[i + 2][0] - p[0]) - Math.atan2(p[1] - L[i][1], p[0] - L[i][0]);
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return (d * 180) / Math.PI;
});

for (const [name, [c, g, sc]] of Object.entries(STATES)) {
  test(`diaphragm, ${name}: one smooth dome, no sharp turn, hook or V`, () => {
    const { line } = state(c, g, sc), t = turns(line);
    // Smooth: no step turns more than 8° (a corner), and it bends the other way only in the heart's soft saddle (≤ 2° a step).
    assert.ok(Math.max(...t) < 8, `sharpest turn ${Math.max(...t).toFixed(1)}°`);
    assert.ok(Math.min(...t) > -2, `reverse turn ${Math.min(...t).toFixed(1)}°`);
    // One dome: it turns right through a little over a half circle, foot to foot (the sides follow the liver and spleen in
    // below their widest points), never curling back as a hook does.
    const total = t.reduce((a, b) => a + b, 0);
    assert.ok(total > 150 && total < 240, `total turn ${total.toFixed(0)}°`);
    // Both ends at the foot of the fade, on the outside of the organs.
    assert.ok(line[0][1] >= DIA.foot && line.at(-1)[1] >= DIA.foot && line[0][0] < 420 && line.at(-1)[0] > 1060);
    // No V: the top rises to one peak and falls once (x steadily rightward across the top).
    const top = line.filter(([, y]) => y < 260);
    for (let i = 1; i < top.length; i++) assert.ok(top[i][0] > top[i - 1][0], `goes back at x ${top[i][0].toFixed(0)}`);
  });

  test(`diaphragm, ${name}: no loop and no flat straight run across the gap`, () => {
    const { line } = state(c, g, sc);
    const X = (a, b, p, q) => { const d = (u, v, w) => (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]); return d(a, b, p) * d(a, b, q) < 0 && d(p, q, a) * d(p, q, b) < 0; };
    for (let i = 0; i < line.length - 1; i++) for (let j = i + 2; j < line.length - 1; j++) assert.ok(!X(line[i], line[i + 1], line[j], line[j + 1]), `crosses itself at ${line[i].map(Math.round)}`);
    // Across the stomach to the spleen (x 720–1000) it arches: every 150-unit stretch bows at least 2 above its chord.
    const across = line.filter(([x, y]) => x >= 720 && x <= 1000 && y < 300);
    for (let i = 0; i < across.length; i++) {
      const j = across.findIndex(([x]) => x >= across[i][0] + 150);
      if (j < 0) break;
      const [a, b] = [across[i], across[j]];
      let bow = 0;
      for (let k = i; k <= j; k++) bow = Math.max(bow, ((b[0] - a[0]) * (across[k][1] - a[1]) - (b[1] - a[1]) * (across[k][0] - a[0])) / -Math.hypot(b[0] - a[0], b[1] - a[1]));
      assert.ok(bow >= 2, `straight from x ${a[0].toFixed(0)} to ${b[0].toFixed(0)} (bow ${bow.toFixed(1)})`);
    }
  });

  test(`diaphragm, ${name}: above every organ, under the heart`, () => {
    const { organs, line } = state(c, g, sc);
    let near = Infinity;
    for (const o of organs) for (const p of o) if (p[1] < DIA.foot - 5) for (const q of line) near = Math.min(near, Math.hypot(p[0] - q[0], p[1] - q[1]));
    assert.ok(near > DIA.gap - 0.6, `comes within ${near.toFixed(1)} of an organ`);
    for (const [x, y] of line) assert.ok(y >= floor(x) - 0.01, `rises into the heart at x ${x.toFixed(0)}`);
  });
}

test('diaphragm eases with the liver: a small step in the disease moves it only a little', () => {
  let prev = state(0, 0, 1).line;
  for (let s = 1; s <= 40; s++) {
    const { line } = state(s / 40, 0, 1 + (0.3 * s) / 40);
    let far = 0;
    for (const p of line) { let m = Infinity; for (const q of prev) m = Math.min(m, Math.hypot(p[0] - q[0], p[1] - q[1])); far = Math.max(far, m); }
    assert.ok(far < 4, `jumps ${far.toFixed(1)} at cirrhosis ${s / 40}`);
    prev = line;
  }
});
