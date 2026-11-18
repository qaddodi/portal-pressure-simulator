// The figure, label and camera readers on the real stage booted in node (tests/stage-gl-boot.js, as pan-settle.test.js does): the sources
// (screen/sources.js) read the stage's own accessors, the readers turn them into the report's parts, and the rules judge them. Proves the whole path
// from the painters' records to the findings, and that a settled stage with a card down its right side reports no real fault.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';

const W = 1440, H = 900;
test('a booted stage answers the three parts, JSON-stable, and a settled Circuit has no figure or camera finding', async () => {
  globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; this.els = []; } observe(el) { this.els.push(el); this.t ||= setTimeout(() => this.cb(this.els.map((e) => ({ target: e, boundingClientRect: e.getBoundingClientRect() }))), 0); } disconnect() {} unobserve() {} };
  const { st, page } = await bootGL({ w: W, h: H, dpr: 1 });
  const { createCore } = await import('../src/worker-core.js');
  const tasks = () => new Promise((r) => setImmediate(r));
  let q = [], last = null;
  const core = createCore((m) => { if (m.type === 'frame') q.push(m); });
  await core.handle({ type: 'init' });
  await core.handle({ type: 'preset', id: 'cirr-decomp' });
  await core.handle({ type: 'run', running: true });
  const step = async () => { pump(16.7); const f = q.at(-1); q = []; if (f) last = f; if (last) st.update(last); await tasks(); await tasks(); };
  for (let i = 0; i < 60; i++) await step();
  st.setView('circuit');
  for (let i = 0; i < 260; i++) await step();
  st.labelLayoutNow();
  const pps = { stage: st };
  const { readLabelsNow, readCameraNow, readFigureNow } = await import('../src/ui/screen/sources.js');
  const { runRules } = await import('../src/ui/selfcheck/make-finding.js');
  const { rules2a } = await import('../src/ui/screen/parts-2a.js');
  const labels = readLabelsNow(pps, { boxes: {} }), camera = readCameraNow(pps), figure = readFigureNow(pps);
  assert.ok(labels.count > 5, `the Circuit's labels are listed (${labels.count})`);
  assert.ok(figure.count > 10, `the vessels shown are listed (${figure.count})`);
  assert.ok(camera.state && camera.state.k > 0, 'the camera stands somewhere');
  assert.equal(figure.lens, 'pressure');
  for (const p of [labels, camera, figure]) assert.deepEqual(JSON.parse(JSON.stringify(p)), p, 'plain JSON');
  const again = readFigureNow(pps);
  assert.deepEqual(again, figure, 'two reads of one state match');
  const report = { labels, camera, figure };
  const findings = runRules(rules2a, report);
  const fig = findings.filter((f) => /^figure-/.test(f.rule));
  assert.deepEqual(fig, [], `no figure finding on a settled stage: ${JSON.stringify(fig.slice(0, 3))}`);
  assert.deepEqual(findings.filter((f) => /^camera-/.test(f.rule)), [], 'no camera finding with no slide move');
  console.log('LABEL FINDINGS', JSON.stringify(findings.filter((f) => /^label-/.test(f.rule)).slice(0, 8), null, 1));
  console.log('SAMPLE', JSON.stringify(labels.items.slice(0, 2)), JSON.stringify(figure.vessels.slice(0, 2)));
});
