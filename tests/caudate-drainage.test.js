// The caudate lobe's drainage is drawn by default (11 Nov 2026: "the caudate lobe has no dedicated drainage"): the lobe with its short
// veins on the plate, the caudate vein as a lane of its own in the circuit, and the enlargement marks (the lobe's normal outline dashed,
// arrows out of it) for Budd–Chiari. The circuit lane keeps clear of every other lane and enters the IVC from the one side nothing else uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANAT_HIDDEN, CAUDATE, CIRCUIT_PATH, HIDDEN_EDGES, NODE_POS, metroPath } from '../src/ui/anatomy.js';
import { EDGES } from '../src/engine/topology.js';

// A path (M L Q C) as a polyline.
function flat(d) {
  const t = d.match(/[MLQCZ]|-?\d*\.?\d+/g), pts = [];
  let i = 0, cur = [0, 0], cmd;
  const num = () => parseFloat(t[i++]);
  while (i < t.length) {
    if (/[A-Z]/.test(t[i])) cmd = t[i++];
    if (cmd === 'M' || cmd === 'L') { cur = [num(), num()]; pts.push(cur); }
    else if (cmd === 'Q') { const c = [num(), num()], e = [num(), num()]; for (let k = 1; k <= 8; k++) { const u = k / 8; pts.push([0, 1].map((j) => (1 - u) ** 2 * cur[j] + 2 * (1 - u) * u * c[j] + u * u * e[j])); } cur = e; }
    else if (cmd === 'C') { const c1 = [num(), num()], c2 = [num(), num()], e = [num(), num()]; for (let k = 1; k <= 12; k++) { const u = k / 12, v = 1 - u; pts.push([0, 1].map((j) => v ** 3 * cur[j] + 3 * v * v * u * c1[j] + 3 * v * u * u * c2[j] + u ** 3 * e[j])); } cur = e; }
    else i++;
  }
  return pts;
}
// (and every 2 units along, so a count of samples is a length)
const dense = (pts) => { const out = [pts[0]]; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2)); for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]); } return out; };
const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)); return Math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dy); };
const dist = (p, L) => { let m = Infinity; for (let i = 1; i < L.length; i++) m = Math.min(m, segDist(p, L[i - 1], L[i])); return m; };
const P = (id) => NODE_POS[id][1];

test('the caudate vein is drawn in the circuit and not as a vessel on the plate', () => {
  assert.ok(EDGES.some((e) => e.id === 'CAUD'));
  assert.ok(!HIDDEN_EDGES.has('CAUD'), 'a lane of its own in the circuit');
  assert.ok(ANAT_HIDDEN.has('CAUD'), 'the plate draws the lobe and its short veins (CAUDATE), not the modeled vessel');
});

test('its circuit lane runs from the right-lobe central veins to the IVC, turning only at 45° or 90°, and enters the IVC from the north', () => {
  const L = flat(CIRCUIT_PATH.CAUD), from = P('CV_R'), to = P('IVCS');
  assert.deepEqual(L[0], from);
  assert.deepEqual(L.at(-1), to);
  const last = L.at(-1), before = L.at(-2);   // (the lane's first stretch is a 3-unit step off the station, then straight up)
  assert.ok(Math.abs(last[0] - before[0]) < 1e-6 && before[1] < last[1], 'the last stretch drops straight into the IVC from above');
  // (every straight stretch, between its rounded corners, is level, upright or at 45°)
  for (let i = 1; i < L.length; i++) {
    const dx = Math.abs(L[i][0] - L[i - 1][0]), dy = Math.abs(L[i][1] - L[i - 1][1]);
    if (Math.hypot(dx, dy) < 3) continue;
    assert.ok(dx < 1e-6 || dy < 1e-6 || Math.abs(dx - dy) < 1e-6 || Math.min(dx, dy) < 6, `a stretch at an odd angle near ${L[i]}`);
  }
});

test('its lane keeps at least 12 units from every hepatic-vein lane and the IVC, away from its two ends', () => {
  const L = flat(CIRCUIT_PATH.CAUD), cv = P('CV_R'), iv = P('IVCS');
  const others = [CIRCUIT_PATH.POST_R_RHV, metroPath(P('CV_R'), P('MHV')), metroPath(P('CV_L'), P('MHV')), CIRCUIT_PATH.POST_L_LHV,
    metroPath(P('RHV'), iv), metroPath(P('MHV'), iv), metroPath(P('LHV'), iv), metroPath(P('IVCI'), iv), metroPath(iv, P('RA'))].map(flat);
  for (const p of L) {
    if (Math.hypot(p[0] - cv[0], p[1] - cv[1]) < 24 || Math.hypot(p[0] - iv[0], p[1] - iv[1]) < 40) continue;
    for (const O of others) assert.ok(dist(p, O) >= 12, `${p.map(Math.round)} is ${dist(p, O).toFixed(1)} from a hepatic-vein lane`);
  }
});

test('the TIPS and DIPS lanes are crossed, never run along (they are drawn only while open)', () => {
  const L = dense(flat(CIRCUIT_PATH.CAUD));
  for (const id of ['TIPS', 'DIPS']) {
    const O = flat(CIRCUIT_PATH[id]);
    let close = 0;
    for (const p of L) if (dist(p, O) < 8) close++;
    // (The DIPS lane's diagonal passes the lane's last corner, about 5 units off it: a crossing, not a run along it.)
    assert.ok(close * 2 <= 30, `${id}: ${close * 2} units of it lie within 8 units of that lane, it would run along it`);
  }
});

test('the enlargement marks lie on the lobe\'s own edges', () => {
  const ring = flat(CAUDATE.outline);
  // the outline is the lobe's normal size: it follows the two ellipses (the dome's own extent) within a unit or two
  const ex = CAUDATE.lobe.map(([cx, cy, rx, ry]) => [cx - rx, cx + rx, cy - ry, cy + ry]);
  const x0 = Math.min(...ex.map((e) => e[0])), x1 = Math.max(...ex.map((e) => e[1])), y0 = Math.min(...ex.map((e) => e[2])), y1 = Math.max(...ex.map((e) => e[3]));
  const bx = [Math.min(...ring.map((p) => p[0])), Math.max(...ring.map((p) => p[0])), Math.min(...ring.map((p) => p[1])), Math.max(...ring.map((p) => p[1]))];
  assert.ok(Math.abs(bx[0] - x0) < 3 && Math.abs(bx[1] - x1) < 3 && Math.abs(bx[2] - y0) < 3 && Math.abs(bx[3] - y1) < 3, `outline box ${bx.map(Math.round)} vs lobe ${[x0, x1, y0, y1].map(Math.round)}`);
  const [ax, ay] = CAUDATE.anchor, [gx, gy] = CAUDATE.grow;
  const topG = ay + (y0 - ay) * (1 + gy), botG = ay + (y1 - ay) * (1 + gy);
  const [up, down] = CAUDATE.arrows;
  assert.ok(up[1] > up[3] && up[3] <= topG && Math.abs(up[1] - y0) < 4, 'the top arrow leaves the normal edge and reaches the grown one');
  assert.ok(down[1] < down[3] && down[3] >= botG && Math.abs(down[1] - y1) < 4, 'the bottom arrow leaves the normal edge and reaches the grown one');
  assert.ok(Math.min(up[0], down[0]) > 566 && ax > 0 && gx > 0, 'clear of the azygos line (x 564)');
});
