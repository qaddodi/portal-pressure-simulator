import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gpuProbe } from '../src/ui/gpu-probe.js';

// The debug overlay's GPU readout: off, a step only runs; on, each step's time is its own (a step inside another counts only
// toward its own name), and the GPU work queued before a step is waited for first and counted apart.
const spin = (ms) => { const t = performance.now(); while (performance.now() - t < ms); };

test('off, a step runs and nothing is counted', () => {
  gpuProbe.on = false; gpuProbe.take();
  assert.equal(gpuProbe.time(null, 'a', () => 7), 7);
  assert.deepEqual(gpuProbe.take(), {});
});

test('on, nested steps count apart and the waits before them count as other GPU work', () => {
  const gl = { finish: () => spin(2) };
  gpuProbe.on = true; gpuProbe.take();
  const r = gpuProbe.time(gl, 'outer', () => { spin(5); return gpuProbe.time(gl, 'inner', () => { spin(10); return 3; }); });
  const p = gpuProbe.take();
  gpuProbe.on = false;
  assert.equal(r, 3);
  assert.ok(p.inner >= 10 && p.inner < 20, `inner ${p.inner}`);
  assert.ok(p.outer >= 5 && p.outer < 10, `outer ${p.outer} (inner and its wait left out)`);
  assert.ok(p['other GPU'] >= 4 && p['other GPU'] < 9, `waits ${p['other GPU']}`);
  assert.equal(gpuProbe.stack.length, 0);
});
