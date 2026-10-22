import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gpuProbe } from '../src/ui/gpu-probe.js';

// The debug overlay's GPU readout: off, a step only runs; on, each step's time is its own (a step inside another counts only
// toward its own name), and the GPU work queued before a step is waited for first and counted apart.
// A clock the test moves by hand, so the times are exact however busy the machine is.
let clock = 0;
performance.now = () => clock;
const spin = (ms) => { clock += ms; };

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
  assert.equal(p.inner, 10 + 2, 'its own time and the wait after it');
  assert.equal(p.outer, 5 + 2, 'inner and its waits left out');
  assert.equal(p['other GPU'], 4, 'the waits before each step');
  assert.equal(gpuProbe.stack.length, 0);
});

// The shared frame loop calls each surface directly while the probe is off: no name string or closure per callback per frame.
test('the frame loop times its callbacks only while the probe is on', async () => {
  const { readFileSync } = await import('node:fs');
  const js = readFileSync(new URL('../src/ui/frame.js', import.meta.url), 'utf8');
  assert.match(js, /if \(gpuProbe\.on\) gpuProbe\.time\(null, `\$\{tag\} \(script\)`, \(\) => cb\(now\)\); else cb\(now\);/);
});
