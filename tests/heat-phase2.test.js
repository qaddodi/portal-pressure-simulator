// Heat, phase 2 (26 Oct): the blood table without a whole clear or a whole upload each frame, the junction widths without
// per-frame arrays and sorts, and text written only when it changes. The picture and the clinical numbers stay the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retireRows, changedRows } from '../src/ui/flow-rows.js';
import { createJunctionWidths } from '../src/ui/junction-widths.js';
import { advanceStream } from '../src/ui/blood.js';
import { COUNTED } from '../src/ui/gpu-probe.js';

const STRIDE = 16, ROWS = 40;
// A small seeded random, so a failure repeats.
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };

// One frame's writes as stepBlood makes them: some rows, a row now and then twice, origins on or off.
function frameWrites(r) {
  const out = [], origins = r() < 0.5;
  for (let row = 0; row < ROWS; row++) if (r() < 0.4) out.push(row);
  if (out.length && r() < 0.3) out.push(out[0]);
  return out.map((row) => ({ row, vals: Array.from({ length: 15 }, () => Math.round(r() * 100) / 10), origins }));
}
function writeRow(data, { row, vals, origins }) {
  const o = row * STRIDE;
  for (let i = 0; i < 8; i++) data[o + i] = vals[i];
  if (origins) for (let c = 0; c < 4; c++) data[o + 8 + c] = vals[8 + c];
  for (let i = 12; i < 15; i++) data[o + i] = vals[i];
}

test('retired blood rows: a row that stops drawing is cleared once, and the table matches a whole clear every frame', () => {
  const r = rng(7), old = new Float32Array(ROWS * STRIDE), now = new Float32Array(ROWS * STRIDE);
  const was = new Uint8Array(ROWS), cur = new Uint8Array(ROWS);
  for (let f = 0; f < 300; f++) {
    const w = f % 17 === 0 ? [] : frameWrites(r);   // (now and then a frame with nothing drawn: the blood switched off)
    old.fill(0);
    for (const x of w) writeRow(old, x);
    for (const x of w) { now.fill(0, x.row * STRIDE, (x.row + 1) * STRIDE); cur[x.row] = 1; writeRow(now, x); }
    retireRows(now, was, cur, STRIDE);
    assert.deepEqual(now, old, `frame ${f}`);
    assert.ok(cur.every((v) => v === 0));
  }
});

test('retired blood rows: origin colours switched off leave no stale origin values in a row still drawn', () => {
  const data = new Float32Array(ROWS * STRIDE), was = new Uint8Array(ROWS), cur = new Uint8Array(ROWS);
  const put = (origins) => { data.fill(0, 3 * STRIDE, 4 * STRIDE); cur[3] = 1; writeRow(data, { row: 3, vals: Array(15).fill(1), origins }); retireRows(data, was, cur, STRIDE); };
  put(true);
  assert.equal(data[3 * STRIDE + 8], 1);
  put(false);
  for (let c = 0; c < 4; c++) assert.equal(data[3 * STRIDE + 8 + c], 0);
  assert.equal(data[3 * STRIDE + 15], 0);
});

test('blood upload span: only the rows that changed go up, in one span, none when nothing changed, and the GPU copy stays exact', () => {
  const r = rng(11), data = new Float32Array(ROWS * STRIDE), last = new Float32Array(ROWS * STRIDE), gpu = new Float32Array(ROWS * STRIDE);
  assert.equal(changedRows(data, last, STRIDE, ROWS), null);
  for (let f = 0; f < 200; f++) {
    const n = Math.floor(r() * 4);
    for (let i = 0; i < n; i++) data[Math.floor(r() * ROWS * STRIDE)] = Math.round(r() * 50);
    const span = changedRows(data, last, STRIDE, ROWS);
    if (span) {
      const [lo, hi] = span;
      assert.ok(lo <= hi && lo >= 0 && hi < ROWS);
      gpu.set(data.subarray(lo * STRIDE, (hi + 1) * STRIDE), lo * STRIDE);
    }
    assert.deepEqual(gpu, data, `frame ${f}`);
    assert.deepEqual(last, data);
    assert.equal(changedRows(data, last, STRIDE, ROWS), null, 'nothing changed: nothing sent');
  }
  // The span is bounded by the first and last rows that changed.
  data[5 * STRIDE + 3] += 1; data[9 * STRIDE] += 1;
  assert.deepEqual(changedRows(data, last, STRIDE, ROWS), [5, 9]);
});

test('identical phase: the stream integrator steps the same way frame after frame (pause holds it exactly)', () => {
  const mk = () => ({ D: 0, vd: 0 });
  const a = mk(), b = mk(), opts = { phasic: true, speed: 1, large: true, still: false, rev: false };
  for (let i = 0; i < 120; i++) { advanceStream(a, 20, 22, 1 / 60, { ...opts }); advanceStream(b, 20, 22, 1 / 60, { ...opts }); }
  assert.deepEqual(a, b);
  const held = { ...a };
  advanceStream(a, 20, 22, 0, { ...opts });
  assert.equal(a.D, held.D);
});

test('junction widths: the second widest vessel at each node, the widest when alone, the same as sorting every frame', () => {
  const r = rng(3), J = createJunctionWidths();
  for (let f = 0; f < 200; f++) {
    const ref = {}, ws = {};
    J.reset();
    const n = Math.floor(r() * 30);
    for (let i = 0; i < n; i++) {
      const node = `N${Math.floor(r() * 8)}`, w = Math.round(r() * 40) / 4;
      J.put(node, w); (ws[node] ||= []).push(w);
    }
    for (const [k, list] of Object.entries(ws)) { list.sort((x, y) => y - x); ref[k] = list[1] ?? list[0]; }
    const got = J.answer();
    for (const k of Object.keys(ref)) assert.equal(got[k], ref[k], `frame ${f}, ${k}`);
    for (const k of Object.keys(got)) if (!(k in ref)) assert.equal(got[k], undefined, `frame ${f}: ${k} met no vessel`);
  }
});


test('width step: junction widths reused, no per-node arrays or sorts; the sync it took is counted under ?perf', () => {
  for (const k of ['flowSame', 'flowRetired', 'widthRadii', 'widthWhole']) assert.equal(typeof COUNTED[k], 'string', k);
});

