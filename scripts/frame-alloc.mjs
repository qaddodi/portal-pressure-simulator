// Allocations on the frame path, in a real browser (plan "Holding 120 Hz, always" rev 2 §2.8, the gate: zero allocations on the must
// path over 10 s of steady anatomy). The app opens on the GPU path (scripts/shoot.mjs openApp: SwiftShader named as a GPU), the model
// runs in the anatomy (kept awake: see idle rest below), and after it has settled V8's sampling heap profiler records every sampled allocation for 10 s, the ones the
// garbage collector has already taken included. An allocation is on the must path when its stack runs through the scheduler's frame
// (frame.js flush) and not through a may task (runMay) or a watcher; each is listed by the function that made it.
//
//   node scripts/frame-alloc.mjs [--device mac|iphone|...] [--secs 10] [--settle 20] [--top 40] [--query "preset=..."] [--gate]
// --gate exits non-zero when any must-path allocation was sampled. Without it, a report only.

import { openApp } from './shoot.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const DEVICE = arg('device', 'mac'), SECS = +arg('secs', 10), SETTLE = +arg('settle', 20), TOP = +arg('top', 40), GATE = process.argv.includes('--gate');
const QUERY = arg('query', ''), DPR = arg('dpr', '') ? +arg('dpr') : undefined;

const app = await openApp({ device: DEVICE, query: QUERY, dpr: DPR });
const { page } = app;
let code = 0;
try {
  await page.evaluate(() => { document.querySelector('#viewSeg [data-view="anatomic"]')?.click(); window.pps.host.send({ type: 'run', running: true }); });
  // (Idle rest, idle-rest.js: left alone 30 s the figure stops drawing. A scroll event on the window every 5 s counts as an input and
  // keeps it awake, without a pointer over the figure or a key that does anything.)
  await page.evaluate(() => setInterval(() => window.dispatchEvent(new Event('scroll')), 5000));
  await page.waitForTimeout(SETTLE * 1000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.collectGarbage');
  await cdp.send('HeapProfiler.startSampling', { samplingInterval: +arg('interval', 512), includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  const f0 = await page.evaluate(() => window.pps.perf.totals.frames);
  await page.waitForTimeout(SECS * 1000);
  const f1 = await page.evaluate(() => window.pps.perf.totals.frames);
  const { profile } = await cdp.send('HeapProfiler.stopSampling');
  const at = (cf) => `${cf.functionName || '(anonymous)'} ${(cf.url || '').replace(/^.*\/(src|scripts)\//, '$1/').replace(/\?v=\w+/, '')}:${cf.lineNumber + 1}`;
  const must = new Map(), other = new Map();
  let mustBytes = 0, mustN = 0, allBytes = 0, modelBytes = 0;
  // (Of the must path, what runs because the model's frame or an ease changed the figure (the figure's update, the vessel sync, the
  // organ pictures, the labels' layout), told apart from what every display frame runs: on a device the model's frames come 30 times a
  // second, on this machine's software GL nearly every drawn frame has one.)
  const MODEL_FNS = new Set(['update', 'updateInner', 'syncVeinsNow', 'syncVeins', 'updateGeometry', 'updateLabels', 'stepWidths', 'stepOrgans', 'groupBox', 'opAt', 'layGroup', 'paintFrame']);
  // (Each node is one call stack; selfSize is what it allocated itself. Walk down, keeping whether the stack is inside a frame.)
  const walk = (n, inFrame, outOfMust, top, model) => {
    const fn = n.callFrame.functionName, url = n.callFrame.url || '';
    const isFrameJs = /\/frame\.js/.test(url);
    const inF = inFrame || (isFrameJs && fn === 'flush');
    const out = outOfMust || (isFrameJs && (fn === 'runMay' || fn === 'logOverrun')) || (inF && isFrameJs && /^(w|roll)$/.test(fn));
    const mod = model || MODEL_FNS.has(fn);
    const self = n.selfSize || 0;
    if (self) {
      allBytes += self;
      const k = at(n.callFrame), path = `${k}  <  ${top}`;
      const m = inF && !out ? must : other;
      const e = m.get(path) || { bytes: 0, n: 0 };
      e.bytes += self; e.n++; m.set(path, e);
      if (inF && !out) { mustBytes += self; mustN++; if (mod) modelBytes += self; else { const e2 = every.get(path) || { bytes: 0, n: 0 }; e2.bytes += self; e2.n++; every.set(path, e2); } }
    }
    for (const c of n.children || []) walk(c, inF, out, self || !n.callFrame.url ? top : at(n.callFrame), mod);
  };
  // (`top`: the nearest caller with source, so a builtin's allocation names who called it.)
  const every = new Map();
  const walk0 = (n) => walk(n, false, false, '', false);
  walk0(profile.head);
  const frames = f1 - f0;
  console.log(`${DEVICE}, steady anatomy, ${SECS} s, ${frames} frames: ${(allBytes / 1024).toFixed(0)} KB sampled in all; must path ${(mustBytes / 1024).toFixed(1)} KB in ${mustN} sampled allocations (${(mustBytes / Math.max(1, frames)).toFixed(0)} B a frame)`);
  console.log(`  of which the model frame and eases (update, vessel sync, organ pictures, labels): ${(modelBytes / 1024).toFixed(1)} KB; every display frame: ${((mustBytes - modelBytes) / 1024).toFixed(1)} KB`);
  console.log('every display frame:');
  for (const [k, e] of [...every].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, TOP)) console.log(`  ${(e.bytes / 1024).toFixed(1).padStart(7)} KB  ${k}`);
  console.log('the whole must path:');
  const list = [...must].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, TOP);
  for (const [k, e] of list) console.log(`  ${(e.bytes / 1024).toFixed(1).padStart(7)} KB  ${k}`);
  if (process.argv.includes('--other')) {
    console.log('outside the must path:');
    for (const [k, e] of [...other].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, TOP)) console.log(`  ${(e.bytes / 1024).toFixed(1).padStart(7)} KB  ${k}`);
  }
  if (GATE && mustN) { console.log('frame-alloc: allocations on the must path (the goal is none)'); code = 1; }
} finally { await app.close(); }
process.exit(code);
