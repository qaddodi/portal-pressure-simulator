// Heat D-4 and D-6 (13 Nov 2026, his Mac warm at rest; docs/recommendations/mac-heat-nov13.md): the picture is the same, the work is less.
// D-6: the blood cells' boxes (veins-gl.js bloodBoxes) are walked once while the cells, the matrix and the canvas stand, and every blood frame
//      after takes the kept tile mask (dirty-tiles.js addFrom), which must mark exactly what marking each box again marks.
// D-4: setTubes sends only the rows that differ from what the texture holds, and nothing while they all match.
// Node, jsdom, the do-nothing WebGL (tests/stage-gl-boot.js), the renderer's counted notes read frame by frame.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirtyTiles } from '../src/ui/dirty-tiles.js';
import { bootGL, pump } from './stage-gl-boot.js';

const rectsOf = (T, from, to) => { const out = []; const n = T.rects(from, to, out, []); return n < 0 ? null : out.map((r) => [r.x, r.y, r.w, r.h]); };

test('addFrom marks the same tiles and bounds as marking each box again', () => {
  const W = 2400, H = 1600, boxes = [];
  let s = 7; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 400; i++) { const x = rnd() * 2600 - 100, y = rnd() * 1800 - 100; boxes.push([x, y, x + 6 + rnd() * 40, y + 6 + rnd() * 40]); }
  const direct = createDirtyTiles(4), kept = createDirtyTiles(1), viaKept = createDirtyTiles(4);
  direct.begin(1, W, H); for (const b of boxes) direct.add(...b); direct.add(10, 10, 300, 40);
  kept.begin(0, W, H); for (const b of boxes) kept.add(...b);
  viaKept.begin(1, W, H); assert.ok(viaKept.addFrom(kept, 0)); viaKept.add(10, 10, 300, 40);
  assert.deepEqual(rectsOf(viaKept, 0, 1), rectsOf(direct, 0, 1));
  const a = [0, 0, 0, 0], b = [0, 0, 0, 0];
  assert.ok(direct.boundsOf(1, a) && viaKept.boundsOf(1, b)); assert.deepEqual(b, a);
  // (A canvas of another size is not the same tiles: refused, never a wrong mask.)
  viaKept.begin(2, 1200, 800); assert.equal(viaKept.addFrom(kept, 0), false);
  // (A ring that was not begun on the frame asked for.)
  viaKept.begin(3, W, H); assert.equal(viaKept.addFrom(kept, 5), false);
});

test('at rest the blood\'s boxes are kept and the tubes go up only as the rows that changed', async () => {
  const { st } = await bootGL({ w: 1200, h: 800, labels: 'none' });
  const { store } = await import('../src/ui/store.js');
  const { gpuProbe } = await import('../src/ui/gpu-probe.js');
  const { createCore } = await import('../src/worker-core.js');
  const tasks = () => new Promise((r) => setImmediate(r));
  let q = [], healthy = null;
  const core = createCore((m) => { if (m.type === 'frame') q.push(m); else if (m.type === 'healthy') healthy = m; });
  await core.handle({ type: 'init' });
  await core.handle({ type: 'healthyProfile', reqId: 1 });
  store.set({ healthy: { P: healthy.P, Q: healthy.Q, D: healthy.D, metrics: healthy.metrics } });
  await core.handle({ type: 'ackPaint', on: true });
  await core.handle({ type: 'run', running: true });
  store.set({ running: true, params: core.engine().params, layers: { ...store.get().layers, flow: true } });
  for (let i = 0; i < 240; i++) { pump(16.7); const f = q.at(-1); q = []; if (f) { st.update(f); core.handle({ type: 'painted' }); } await tasks(); }
  const tot = {}; gpuProbe.on = true; gpuProbe.takeNotes();
  try {
    for (let i = 0; i < 180; i++) {
      pump(16.7); const f = q.at(-1); q = []; if (f) { st.update(f); core.handle({ type: 'painted' }); } await tasks();
      const n = gpuProbe.takeNotes(); for (const k in n) { tot[k] = tot[k] || [0, 0]; tot[k][0] += n[k][0]; tot[k][1] += n[k][1]; }
    }
  } finally { gpuProbe.on = false; }
  const kept = tot['blood boxes: kept']?.[0] || 0, made = tot['blood boxes: walked']?.[0] || 0;
  assert.ok(kept + made >= 20, `blood frames were marked (${kept} kept, ${made} walked)`);
  assert.ok(kept >= made * 4, `the boxes are walked once for many frames at rest: ${kept} kept, ${made} walked`);
  const rows = tot['uploaded: setTubes rows'], same = tot['tubes: upload skipped (rows unchanged)'];
  assert.ok((rows?.[0] || 0) + (same?.[0] || 0) > 0, 'setTubes ran');
  if (rows) assert.ok(rows[1] / rows[0] < 40, `a tube upload at rest is some rows, not the 58 KB table: ${(rows[1] / rows[0]).toFixed(1)} KB on average`);
});
