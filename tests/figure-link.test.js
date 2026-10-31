import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFigureProxy, serveFigure, transfers } from '../src/ui/figure-link.js';

function fake() {
  const log = [];
  let seq = 0, refuse = false;
  const rec = (n) => (...a) => { log.push([n, ...a]); };
  const api = {
    lost: false, software: false, canLines: true, canCath: true, rowsStatus: '', nCells: 7,
    get drawSeq() { return seq; },
    hasPlate: () => false,
    plateJob: (W, H) => { log.push(['plateJob', W, H]); return { tex: 't', W }; },
    draw(...a) { log.push(['draw', ...a]); seq++; },
    composite(...a) { log.push(['composite', ...a]); seq++; },
    drawRows(...a) { log.push(['drawRows', ...a]); return !refuse; },
    organs: { commit: (...a) => log.push(['commit', ...a]), canLive: true, has: () => false, stage: (...a) => log.push(['stage', ...a]), bake: (...a) => { log.push(['bake', ...a]); return { baked: 1 }; } },
  };
  for (const m of ['setTubes', 'setFlow', 'plateRows', 'setPlate', 'clear']) api[m] = rec(m);
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

test('startFigureWorker: ready gives a proxy that posts queues; a failed worker gives null', async () => {
  globalThis.Worker ??= class {};
  globalThis.OffscreenCanvas ??= class {};
  globalThis.location ??= { search: '?figworker=on' };
  const { startFigureWorker } = await import('../src/ui/figure-worker-start.js');
  globalThis.document ??= { documentElement: {} };
  globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '#112233' });
  const canvas = { transferControlToOffscreen: () => ({ off: 1 }) };
  const posted = [];
  const mk = (answer) => () => {
    const w = { postMessage: (m) => { posted.push(m); queueMicrotask(() => w.onmessage({ data: answer(m) })); }, terminate() { w.dead = true; } };
    return w;
  };
  const state = { lost: false, software: true, canLines: true, canCath: true, hasOrgans: true, canLive: false, plates: [false, false], stack: [false, false] };
  const proxy = await startFigureWorker(canvas, { tubes: 9, make: mk((m) => (m.type === 'init' ? { type: 'ready', state } : { type: 'state', state })) });
  assert.equal(posted[0].type, 'init');
  assert.equal(posted[0].tubes, 9);
  assert.equal(posted[0].settings.search, globalThis.location.search);
  assert.equal(proxy.software, true);
  proxy.setFlow(new Float32Array(2)); proxy.flush();
  assert.equal(posted[1].type, 'calls');
  const none = await startFigureWorker(canvas, { tubes: 9, make: mk(() => ({ type: 'failed', why: 'x' })) });
  assert.equal(none, null);
});
