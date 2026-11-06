// Organs become stations (station-boxes.js): each organ's box forms inside it and lands on its station on the circuit.
import assert from 'node:assert/strict';
import test from 'node:test';
import { NODE_POS } from '../src/ui/anatomy.js';
import { peelAt } from '../src/ui/flow-peel.js';
import { N_STATIONS, STATIONS, STATION_FILL, STATION_RING, stationFit, stationsAt } from '../src/ui/station-boxes.js';

// nodePos as the stage's (stage.js), without the circuit's mid-change turn: each node on its own share of the change.
const out = [0, 0];
const nodePos = (id, t) => { const a = NODE_POS[id][0], c = NODE_POS[id][1], w = peelAt(t, Math.min(1, Math.max(0, (c[0] - 60) / 1300))); out[0] = a[0] + (c[0] - a[0]) * w; out[1] = a[1] + (c[1] - a[1]) * w; return out; };
const run = (t, rr = 0) => { const A = new Float32Array(4 * N_STATIONS), B = new Float32Array(4 * N_STATIONS); stationsAt(t, nodePos, rr, A, B); return { A, B }; };

test('veins-gl keeps room for every station', () => assert.ok(N_STATIONS <= 8));

test('on the anatomy no box shows; each sits inside its organ', () => {
  const { A, B } = run(0);
  for (let i = 0; i < N_STATIONS; i++) {
    assert.equal(B[4 * i + 1], 0); assert.equal(B[4 * i + 2], 0);
    const f = stationFit(i);
    assert.ok(Number.isFinite(f.x) && f.hx > 5 && f.hy > 5, STATIONS[i].org);
    assert.ok(Math.abs(A[4 * i] - f.x) < 1e-3 && Math.abs(A[4 * i + 1] - f.y) < 1e-3);
  }
});

test('landed on the circuit, every box has reached its station on its nodes and is gone (no squares under the circuit)', () => {
  const { A, B } = run(1);
  STATIONS.forEach((s, i) => {
    const mx = s.at.reduce((x, id) => x + NODE_POS[id][1][0], 0) / s.at.length, my = s.at.reduce((y, id) => y + NODE_POS[id][1][1], 0) / s.at.length;
    assert.ok(Math.abs(A[4 * i] - (mx + s.off[0])) < 1e-3 && Math.abs(A[4 * i + 1] - (my + s.off[1])) < 1e-3, s.org);
    assert.ok(Math.abs(A[4 * i + 2] - s.a) < 1e-3 && Math.abs(A[4 * i + 3] - s.b) < 1e-3);
    assert.equal(B[4 * i + 1], 0); assert.equal(B[4 * i + 2], 0);
    assert.ok(B[4 * i] <= Math.min(s.a, s.b));
  });
});

test('the boxes on the left (beds) do not overlap one another on the circuit', () => {
  const { A } = run(1);
  for (let i = 0; i < N_STATIONS; i++) for (let j = i + 1; j < N_STATIONS; j++) {
    const ox = Math.abs(A[4 * i] - A[4 * j]) < A[4 * i + 2] + A[4 * j + 2], oy = Math.abs(A[4 * i + 1] - A[4 * j + 1]) < A[4 * i + 3] + A[4 * j + 3];
    assert.ok(!(ox && oy), `${STATIONS[i].org} and ${STATIONS[j].org}`);
  }
});

test('an upright circuit\'s side mid-change turns each box\'s offset and size with it', () => {
  const { A } = run(0.999999, 1), { A: W } = run(0.999999, 0);
  const li = STATIONS.findIndex((s) => s.org === 'liver');
  assert.ok(Math.abs(A[4 * li + 2] - STATIONS[li].b) < 0.01 && Math.abs(A[4 * li + 3] - STATIONS[li].a) < 0.01);
  assert.ok(Math.abs(W[4 * li + 2] - STATIONS[li].a) < 0.01);
});

test('mid-change the boxes move with their nodes, gut side first (the flow peel)', () => {
  const { B } = run(0.3);
  const sp = STATIONS.findIndex((s) => s.org === 'spleen'), ht = STATIONS.findIndex((s) => s.org === 'heart');
  assert.ok(B[4 * sp + 1] > B[4 * ht + 1]);
});

test('each box is whole somewhere mid-change, then dissolves before the view lands', () => {
  for (let i = 0; i < N_STATIONS; i++) {
    let peak = 0;
    for (let k = 1; k < 400; k++) peak = Math.max(peak, run(k / 400).B[4 * i + 2]);
    assert.ok(Math.abs(peak - STATION_RING) < 1e-3 && run(0.5).B[4 * i + 1] <= STATION_FILL + 1e-6, STATIONS[i].org);
    assert.ok(run(0.999).B[4 * i + 2] < 0.02 * STATION_RING, STATIONS[i].org);
  }
});
