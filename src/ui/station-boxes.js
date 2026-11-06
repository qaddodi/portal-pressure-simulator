// Organs become stations (M4 of the morph mocks; Mohammad, 6 Nov 2026: "Can we do M4 and M5?"): through the change between the views
// each organ hands over to a box of its own tone that forms inside it, rides the nodes it belongs to and firms into that organ's station
// on the circuit (the liver's box frames the sinusoid column, the heart's the right atrium, the spleen's, the stomach's, the gut's and the
// colon's their beds on the left, the kidney's its bed). Each box dissolves as it lands: none stays under the circuit (Mohammad, 6 Nov
// 2026: "Remove the squares underneath the circuits"), so both landed views are the plain picture. They are drawn on the GPU with the circuit's map
// (veins-gl mapAt: one rounded-box distance a box), from the numbers worked out here each frame of the change: nothing allocated.
import { NODE_POS, ORGANS } from './anatomy.js';
import { peelAt, peelRank } from './flow-peel.js';

// Each station: the organ (its id in ORGANS and the stage's organ groups), the circuit nodes it sits on (their middle), its offset from
// them, its half width and height and its corner radius on the circuit (world units, the wide circuit's axes).
export const STATIONS = [
  { org: 'liver', at: ['SIN_R', 'SIN_L', 'CV_R', 'CV_L'], off: [-60, 0], a: 165, b: 108, r: 14 },
  { org: 'heart', at: ['RA'], off: [26, 0], a: 70, b: 62, r: 14 },
  { org: 'stomach', at: ['STO'], off: [0, 0], a: 60, b: 20, r: 10 },
  { org: 'spleen', at: ['SPL'], off: [0, 0], a: 60, b: 20, r: 10 },
  { org: 'colon', at: ['COL'], off: [0, 0], a: 60, b: 20, r: 10 },
  { org: 'bowel', at: ['INT'], off: [0, 0], a: 60, b: 20, r: 10 },
  { org: 'kidney-l', at: ['KID_L'], off: [0, 0], a: 40, b: 22, r: 10 },
];
export const N_STATIONS = STATIONS.length;   // (veins-gl keeps room for 8: tests/station-boxes.test.js)
// How strong a box is at its fullest, mid-change: its fill and its outline (alpha of the organ's tone).
export const STATION_FILL = 0.1, STATION_RING = 0.5;

// The box each organ starts from: its outline's bounds, drawn in a little (it forms inside the organ as the organ fades), its corners
// round enough to read as the organ's soft shape.
function boundsOf(d) {
  const t = d.match(/[MLCQZHV]|-?\d*\.?\d+(?:e-?\d+)?/gi) || [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, cx = 0, cy = 0;
  const put = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  let cmd = 'M';
  for (let i = 0; i < t.length;) {
    if (/[A-Za-z]/.test(t[i])) { cmd = t[i++].toUpperCase(); if (cmd === 'Z') continue; }
    const n = cmd === 'C' ? 6 : cmd === 'Q' ? 4 : cmd === 'H' || cmd === 'V' ? 1 : 2;
    if (i + n > t.length) break;
    const v = t.slice(i, i + n).map(Number); i += n;
    if (cmd === 'H') { cx = v[0]; put(cx, cy); continue; }
    if (cmd === 'V') { cy = v[0]; put(cx, cy); continue; }
    // (A curve's control points bound it: near enough for a box drawn in from it.)
    for (let k = 0; k < n; k += 2) put(v[k], v[k + 1]);
    cx = v[n - 2]; cy = v[n - 1];
  }
  return [x0, y0, x1, y1];
}
const FIT_K = 0.82;
const FIT = STATIONS.map((s) => {
  const o = ORGANS.find((q) => q.id === s.org), b = boundsOf((o && (o.ring || o.d)) || '');
  const hx = ((b[2] - b[0]) / 2) * FIT_K, hy = ((b[3] - b[1]) / 2) * FIT_K;
  return { x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2, hx, hy, r: Math.min(hx, hy) };
});
// Each station's place in the flow (flow-peel.js), from its nodes' circuit x: it travels with them.
const RANK = STATIONS.map((s) => peelRank(s.at.reduce((x, id) => x + NODE_POS[id][1][0], 0) / s.at.length));
export const stationFit = (i) => FIT[i];

const smooth = (a, b, x) => { const u = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a); return u * u * (3 - 2 * u); };
const lerp = (a, b, t) => a + (b - a) * t;
// The boxes at t of the change (eased: 0 the anatomy, 1 the circuit), written into A (centre x, y, half width, height: 4 a box) and B
// (corner radius, fill alpha, outline alpha, unused: 4 a box). nodePos(id, t): a node's place now (stage.js; read at once). rr: how far
// the circuit's side is turned upright mid-change (circ-turn.js; 0 landed, when the world turn does it). Every box is on its own
// share of the change (the flow peel), so it moves with its nodes.
export function stationsAt(t, nodePos, rr, A, B) {
  for (let i = 0; i < N_STATIONS; i++) {
    const s = STATIONS[i], f = FIT[i], w = peelAt(t, RANK[i]);
    let x = 0, y = 0;
    for (let k = 0; k < s.at.length; k++) { const p = nodePos(s.at[k], t); x += p[0]; y += p[1]; }
    x /= s.at.length; y /= s.at.length;
    // (Turned a quarter turn counter-clockwise with an upright circuit's side, as circTurnPt turns a point: (dx, dy) becomes (dy, -dx).)
    const ox = lerp(s.off[0], s.off[1], rr), oy = lerp(s.off[1], -s.off[0], rr), a = lerp(s.a, s.b, rr), b = lerp(s.b, s.a, rr);
    const o = 4 * i;
    A[o] = lerp(f.x, x + ox, w); A[o + 1] = lerp(f.y, y + oy, w); A[o + 2] = lerp(f.hx, a, w); A[o + 3] = lerp(f.hy, b, w);
    // (It shows only once the change is on its way, is whole a third of the way through its share as the organ fades over it, and
    // dissolves on the last third, so it is gone as it lands: nothing under the circuit at rest.)
    const k = t <= 0 || t >= 1 ? 0 : smooth(0, 0.35, w) * (1 - smooth(0.65, 1, w));
    B[o] = Math.min(lerp(f.r, s.r, w), A[o + 2], A[o + 3]); B[o + 1] = STATION_FILL * k; B[o + 2] = STATION_RING * k; B[o + 3] = 0;
  }
}
