import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFigureProxy, serveFigure, transfers } from '../src/ui/figure-link.js';

function fake() {
  const log = [];
  let seq = 0, refuse = false;
  const rec = (n) => (...a) => { log.push([n, ...a]); };
  const api = {
    lost: false, software: false, canLines: true, canCath: true, rowsStatus: '', nCells: 7,
    get drawSeq() { return seq; },
    hasPlate: () => false, soft: true, reused: false, picSize: () => [640, 480],
    plateJob: (W, H) => { log.push(['plateJob', W, H]); return { tex: 't', W }; },
    draw(...a) { log.push(['draw', ...a]); seq++; },
    composite(...a) { log.push(['composite', ...a]); seq++; },
    drawRows(...a) { log.push(['drawRows', ...a]); return !refuse; },
    organs: { commit: (...a) => log.push(['commit', ...a]), canLive: true, has: () => false, stage: (...a) => log.push(['stage', ...a]), bake: (...a) => { log.push(['bake', ...a]); return { baked: 1 }; } },
  };
  for (const m of ['setPicture', 'setLayerScale', 'setReuse', 'setLow', 'resize', 'setTubes', 'setFlow', 'plateRows', 'setPlate', 'clear']) api[m] = rec(m);
  return { api, log, refuse: (v) => { refuse = v; } };
}
function link(f) {
  const sent = [];
  let proxy;
  const host = serveFigure(f.api, (m) => proxy.take(m.state));
  proxy = createFigureProxy((msg, tr) => { sent.push([msg, tr]); host.handle(msg); });
  return { proxy, sent };
}

test('calls queue and go as one message, in order, and reach the renderer as direct calls would', () => {
  const f = fake(), { proxy, sent } = link(f);
  const tubes = new Float32Array(8), m = [1, 0, 0, 1, 0, 0];
  proxy.setTubes(tubes); proxy.draw(m, { a: 1 }, {}, null); proxy.composite({ a: 1 }, {}, false);
  assert.equal(sent.length, 0);
  proxy.flush();
  assert.equal(sent.length, 1);
  assert.deepEqual(f.log.map((c) => c[0]), ['setTubes', 'draw', 'composite']);
  assert.deepEqual(sent[0][1], [tubes.buffer]);
  assert.equal(proxy.drawSeq, 2);
});

test('a plate raster goes by job id and the texture stays in the worker', () => {
  const f = fake(), { proxy } = link(f);
  const job = proxy.plateJob(4, 2);
  proxy.plateRows(job, 0, 2, new Uint8Array(32));
  proxy.setPlate(0, job, [0, 0, 4, 2]);
  proxy.flush();
  assert.deepEqual(f.log.map((c) => c[0]), ['plateJob', 'plateRows', 'setPlate']);
  assert.equal(f.log[1][1].tex, 't');
  assert.equal(f.log[1][1].W, 4);
  assert.deepEqual(f.log[2][3], [0, 0, 4, 2]);
});

test('a refused drawRows falls back to a whole draw in the worker', () => {
  const f = fake(), { proxy } = link(f);
  f.refuse(true);
  proxy.drawRows([1, 0, 0, 1, 0, 0], {}, {}, [3], false);
  proxy.flush();
  assert.deepEqual(f.log.map((c) => c[0]), ['drawRows', 'draw']);
  assert.deepEqual(f.log[1][4], [3]);
});

test('organ stack calls go by job id; the state comes back', () => {
  const f = fake(), { proxy } = link(f);
  const job = proxy.plateJob(2, 2);
  proxy.organs.stage(0, 'liver', job, [0, 0, 2, 2], 1);
  proxy.organs.commit?.(0, ['liver']);
  proxy.flush();
  assert.deepEqual(f.log.map((c) => c[0]), ['plateJob', 'stage', 'commit']);
  assert.equal(f.log[1][3].tex, 't');
  assert.equal(proxy.canCath, true);
  assert.equal(proxy.nCells, 7);
});

test('only whole buffers are transferred, and each once', () => {
  const a = new Float32Array(4), b = new Float32Array(a.buffer, 0, 2);
  assert.deepEqual(transfers([a, { x: a }, b]), [a.buffer]);
});

test('startFigureWorker: probe, then begin moves the canvas; a failed worker gives null; a lost one reads as a lost context', async () => {
  globalThis.Worker ??= class {};
  globalThis.OffscreenCanvas ??= class {};
  globalThis.location ??= { search: '?figworker=on' };
  globalThis.Event ??= class { constructor(t) { this.type = t; } };
  globalThis.document ??= { documentElement: {} };
  globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '#112233' });
  const { startFigureWorker } = await import('../src/ui/figure-worker-start.js');
  const fired = [];
  const canvas = { transferControlToOffscreen: () => ({ off: 1 }), dispatchEvent: (e) => fired.push(e.type) };
  const posted = [];
  let wk;
  const mk = (answer) => () => {
    wk = { postMessage: (m) => { posted.push(m); const r = answer(m); if (r) queueMicrotask(() => wk.onmessage({ data: r })); }, terminate() { wk.dead = true; } };
    return wk;
  };
  const state = { lost: false, software: true, canLines: true, canCath: true, hasOrgans: true, canLive: true, plates: [false, false], stack: [false, false], soft: false, reused: false, pic: [1, 1] };
  const fig = await startFigureWorker({ canvas, make: mk((m) => (m.type === 'probe' ? { type: 'probed', state } : null)) });
  assert.equal(posted[0].type, 'probe');
  assert.equal(posted[0].settings.search, globalThis.location.search);
  assert.equal(fig.proxy.software, true);
  assert.equal(fig.proxy.organs, null);   // (no organ layers across the worker yet)
  fig.begin(9);
  assert.equal(posted[1].type, 'init');
  assert.equal(posted[1].tubes, 9);
  fig.proxy.setFlow(new Float32Array(2));
  await Promise.resolve();
  assert.equal(posted[2].type, 'calls');
  // A call the worker cannot be sent: the proxy reads as lost and the canvas says so.
  wk.postMessage = () => { throw new Error('DataCloneError'); };
  fig.proxy.setDye(new Float32Array(1));
  await Promise.resolve();
  assert.equal(fig.proxy.lost, true);
  assert.deepEqual(fired, ['webglcontextlost']);
  const none = await startFigureWorker({ canvas, make: mk((m) => (m.type === 'probe' ? { type: 'failed', why: 'x' } : null)) });
  assert.equal(none, null);
});

test('the picture settings go across, and what the renderer answers is read from its last state', () => {
  const f = fake(), { proxy } = link(f);
  proxy.setPicture([320, 240], true); proxy.setLayerScale(0.5); proxy.setReuse(3, 10); proxy.setLow(0.5, true); proxy.resize(800, 600);
  proxy.flush();
  assert.deepEqual(f.log.map((c) => c[0]), ['setPicture', 'setLayerScale', 'setReuse', 'setLow']);
  assert.equal(proxy.soft, true);
  assert.deepEqual(proxy.picSize(), [640, 480]);
  assert.equal(proxy.overlay, null);
  assert.equal(proxy.top, null);
});

test('the stage uses the worker only when main.js hands it a figure; otherwise the renderer and the canvas are the page\'s as before', () => {
  const st = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
  assert.match(st, /const FIGW = !!figure;/);
  assert.match(st, /veins = FIGW \? figure\.proxy : createVeinsGL\(vCanvas, \{ tubes: GL_ROWS, force: true \}\);/);
  assert.match(st, /const vCanvas = figure \? figure\.canvas : document\.createElement\('canvas'\);/);
  assert.match(st, /if \(FIGW\) \{ vW = bw; vH = bh; veins\.resize\(bw, bh\); \} else \{ vCanvas\.width = bw; vCanvas\.height = bh; \}/);
  assert.match(main, /const figure = figWorkerWanted\(\) \? await startFigureWorker\(\) : null;/);
});
