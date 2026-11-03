// The GPU drawer's 2D context (trace-gl.js createShim) makes nothing in a frame once it has been made and has drawn the same kind of frame a
// few times (2 Nov 2026: "cut per-frame garbage in chart drawing"). A child process draws 100 frames of a chart's usual calls (paths, strokes,
// dashes, gradients, clips, saves and restores, boxes, text, the batch calls for a trace) and reports the bytes the heap grew by; a young generation too big
// for a collection to run in between makes the growth the whole of what was made.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CHILD = process.env.SHIM_ALLOC_CHILD === '1';

if (CHILD) {
  globalThis.Element = class {};
  globalThis.window = globalThis; globalThis.addEventListener = () => {}; globalThis.Image = class {}; globalThis.OffscreenCanvas = class {};
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.IntersectionObserver = class { observe() {} disconnect() {} };
  globalThis.document = { createElement: () => ({ style: {}, getContext: () => null, addEventListener() {}, setAttribute() {} }), documentElement: { style: {}, dataset: {}, getAttribute() { return null; } }, addEventListener() {}, readyState: 'complete', hidden: false, fonts: { addEventListener() {}, ready: Promise.resolve() }, head: { append() {} } };
  globalThis.location = { search: '' };
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
  const { createShim } = await import('../src/ui/trace-gl.js');

  // The drawer, asked for draws and making nothing itself.
  let drawn = 0;
  const G = {
    box() { drawn++; }, text() { drawn++; }, measure: (s) => s.length * 6, clip() { drawn++; }, image() {}, end: () => true,
    keep: (n, sig, f) => { f(); return true; },
    poly() { drawn++; }, line() { drawn++; }, clipPaths() { drawn++; },
  };
  const ctx = createShim(G);
  const N = 120, xs = new Float64Array(N), ys = new Float64Array(N);
  for (let i = 0; i < N; i++) { xs[i] = i / 4; ys[i] = Math.sin(i / 7); }
  const DASH = [4, 3], NONE = [];
  const frame = (k) => {
    ctx.reset(1);
    ctx.save(); ctx.translate(10, 12); ctx.scale(1, 1);
    ctx.beginPath(); ctx.rect(0, 0, 300, 120); ctx.clip();
    ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = '#2a7'; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(0, 0);
    for (let i = 1; i < 40; i++) ctx.lineTo(i * 7, 30 + Math.sin(i + k) * 20);
    ctx.stroke();
    ctx.beginPath(); ctx.tracePoints(xs, ys, N, 1, 4, 0, 60, 20, true); ctx.stroke();
    ctx.beginPath(); ctx.traceLine(xs, ys, N, 2, 4, 0, 60, 20); ctx.stroke();
    ctx.fillStyle = '#c33'; ctx.beginPath(); ctx.tracePoints(xs, ys, N, 1, 4, 0, 60, 20, true); ctx.tracePoints(xs, ys, N, -1, 4, 0, 70, 20, false); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.setLineDash(DASH); ctx.lineDashOffset = k % 7; ctx.beginPath(); ctx.moveTo(0, 100); ctx.lineTo(300, 100); ctx.stroke(); ctx.setLineDash(NONE); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(150, 60, 40, 0, 2 * Math.PI); ctx.lineTo(150, 60); ctx.clip();
    ctx.fillStyle = '#36c'; ctx.fillRect(100, 20, 100, 80); ctx.restore();
    ctx.fillStyle = '#eee'; ctx.beginPath(); ctx.roundRect(5, 5, 60, 20, 4); ctx.fill();
    ctx.beginPath(); ctx.arc(200, 50, 12, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    const lg = ctx.createLinearGradient(0, 0, 100, 0); lg.addColorStop(0, '#f00'); lg.addColorStop(1, '#00f'); ctx.fillStyle = lg; ctx.fillRect(0, 0, 50, 50);
    const rg = ctx.createRadialGradient(20, 20, 2, 20, 20, 30); rg.addColorStop(0, '#fff'); rg.addColorStop(0.5, '#888'); rg.addColorStop(1, '#000'); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(20, 20, 18, 0, 2 * Math.PI); ctx.fill();
    ctx.font = '500 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.letterSpacing = '1px';
    ctx.fillStyle = '#222'; ctx.fillText('mmHg', 8, 10); ctx.fillText('HVPG 12.0', 100, 10); ctx.measureText('WHVP 22.0'); ctx.strokeText('PPG', 200, 10);
    ctx.letterSpacing = '0px'; ctx.getTransform();
    ctx.restore();
    ctx.end?.();
  };
  const gc = (await import('node:vm')).runInNewContext('gc');
  for (let k = 0; k < 8000; k++) frame(k);   // (warm-up: the rows grow to the size this frame needs and the engine has tiered the code up: compiling is what the heap grows by before that)
  gc();
  const probe = process.memoryUsage().heapUsed; const base = process.memoryUsage().heapUsed - probe;   // (what reading the heap itself makes)
  const before = process.memoryUsage().heapUsed;
  for (let k = 0; k < 100; k++) frame(k);
  const grew = process.memoryUsage().heapUsed - before - base;
  // The control: something made and kept in each frame, so the measure must see it.
  gc();
  const b2 = process.memoryUsage().heapUsed;
  const sink = []; for (let k = 0; k < 100; k++) { ctx.reset(1); sink.push([k, k + 0.5, { k }]); }
  const control = process.memoryUsage().heapUsed - b2 - base;
  process.stdout.write(`RESULT ${JSON.stringify({ grew, control, drawn })}\n`);
} else {
  test('100 frames of a chart\'s usual drawing through the shim make nothing', () => {
    const r = spawnSync(process.execPath, ['--expose-gc', '--min-semi-space-size=64', '--max-semi-space-size=64', fileURLToPath(import.meta.url)], { env: { ...process.env, SHIM_ALLOC_CHILD: '1' }, encoding: 'utf8', timeout: 120000 });
    const m = /RESULT (\{.*\})/.exec(r.stdout || '');
    assert.ok(m, `the child gave no result: ${r.stderr || r.stdout}`);
    const { grew, control, drawn } = JSON.parse(m[1]);
    assert.ok(drawn > 1000, 'the frames drew');
    assert.ok(control > 10000, `the measure sees what is made (the control made ${control} bytes)`);
    assert.ok(grew < 2048, `100 frames grew the heap by ${grew} bytes (the shim should make nothing in a frame)`);
  });
}
