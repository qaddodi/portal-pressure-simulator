// His Mac ?perf readouts on 8d45bef7 (30 Oct): the refresh is told from the frames' own timestamps, and a vessel's curvature row
// is sent to the GPU only when it changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { refreshOf, intervalStats } from '../src/ui/perf-readout.js';

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });

test('the refresh and the histogram come from the frames\' timestamps, the gaps from the clock', () => {
  const src = readFileSync(new URL('../src/ui/perf-readout.js', import.meta.url), 'utf8');
  const tick = src.slice(src.indexOf('const tick = (ts) => {'), src.indexOf('requestAnimationFrame(tick);\n  };'));
  assert.match(tick, /const fdt = prevTs && ts > prevTs \? ts - prevTs : 0;/);
  assert.match(tick, /if \(fdt\) \{ recent\.push\(fdt\);/);
  assert.match(tick, /if \(fdt\) cur\.dts\.push\(fdt\);/);
  assert.match(tick, /const dt = t - prevT, at = prevT - cur\.t0;/, 'a gap and the steps listed with it stay on the clock');
  assert.match(tick, /prevT = t; prevTs = ts > 0 \? ts : 0;/);
  // A 60 Hz screen whose callbacks ran early and late in their frames: the clock's intervals had read as a faster screen, the
  // timestamps' read as what it is, and its frames as on time.
  const stamps = Array.from({ length: 120 }, (_, i) => i * 1000 / 60);
  const clock = stamps.map((s, i) => s + (i % 2 ? 10 : 0));
  const by = (a) => a.slice(1).map((v, i) => v - a[i]);
  assert.ok(refreshOf(by(clock)) > 60, 'the clock misreads it');
  assert.equal(refreshOf(by(stamps)), 60);
  assert.deepEqual(intervalStats(by(stamps), 60).bins, [119, 0, 0, 0]);
});

function fakeGL() {
  const calls = [];
  let nextObj = 1;
  const enums = new Map();
  const gl = new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) { if (!enums.has(k)) enums.set(k, 0x10000 + enums.size); return enums.get(k); }
      return (...a) => {
        calls.push([k, ...a]);
        if (k === 'getShaderParameter') return true;
        if (k === 'getProgramParameter') return a[1] === gl.ACTIVE_UNIFORMS ? 0 : true;
        if (k === 'getExtension') return null;
        if (k === 'getParameter') return 'stand-in';
        if (k.startsWith('create')) return { obj: nextObj++, kind: k };
        return undefined;
      };
    },
  });
  return { gl, calls };
}

test('a curvature row the texture already holds is not sent again, and the textures stay as they were', async () => {
  const mod = await import('../src/ui/veins-gl.js');
  const f = fakeGL();
  const canvas = { width: 800, height: 600, getContext: () => f.gl, addEventListener() {}, removeEventListener() {}, toDataURL: () => 'data:' };
  const g = mod.createVeinsGL(canvas, { tubes: 4, force: true });
  const line = (y, bend = 0) => Array.from({ length: mod.N_SAMPLES }, (_, i) => [40 + i * 10, y + bend * Math.sin(i / 5)]);
  const sends = () => f.calls.filter((c) => c[0] === 'texSubImage2D' && c[3] === 0 && c[5] === mod.N_SAMPLES && c[6] === 1 && c[7] === f.gl.RED).length;
  const n0 = sends();
  g.setBend(0, line(100));   // (straight: all zero, as the texture was made)
  assert.equal(sends(), n0, 'a straight vessel on a fresh texture sends nothing');
  g.setBend(1, line(200, 8));
  assert.equal(sends(), n0 + 1, 'a bent one is sent');
  g.setBend(1, line(200, 8));
  assert.equal(sends(), n0 + 1, 'the same bend again is not');
  g.setBend(2, line(200, 8));
  assert.equal(sends(), n0 + 2, 'another row is its own');
  g.setBend(1, line(200, 9));
  assert.equal(sends(), n0 + 3, 'a changed bend is sent');
  g.setBend(1, line(200));
  assert.equal(sends(), n0 + 4, 'and so is going back to straight');
  g.setBend(1, line(200));
  assert.equal(sends(), n0 + 4);
});
