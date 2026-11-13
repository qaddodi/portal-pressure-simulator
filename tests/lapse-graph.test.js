// The time graph on a time-lapse slide's teaching card (lapse-graph.js; Mohammad, 7 Nov 2026): every slide with a bar that runs forward in
// time, and no chart of its own, plots its two tiles day by day. These checks keep a slide from losing its graph or naming a line the model
// does not keep.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/worker-core.js';
import { readdirSync } from 'node:fs';
await import('./dom-shim.js');   // (the chart draws on the GPU, svg-gl.js, which loads only with a page)
const { flowTimeSeries, modelLines } = await import('../src/ui/flow-time.js');
const { graphLines, lapseGraphOf, graphTrail } = await import('../src/ui/lapse-graph.js');

const decks = (await Promise.all(readdirSync(new URL('../src/ui/decks/', import.meta.url)).map((f) => import(`../src/ui/decks/${f}`))))
  .flatMap((m) => Object.values(m)).filter((d) => d?.slides && d.id);
const unique = [...new Map(decks.map((d) => [d.id, d])).values()];
const lapses = unique.flatMap((d) => d.slides.map((s, i) => ({ d, s, i })).filter(({ s, i }) => s.lapse && i > 0 && !s.visual));

test('every time-lapse slide carries its chart in the instrument card, none on the teaching card', () => {
  // (Mohammad, 12 Nov 2026: the chart is the instrument. A slide whose own instrument matters shows the chart first and the instrument on the
  // slide after it, so no time-lapse carries a second graph on its words any more. The teaching card's graph code stays for a slide that names `graph`.)
  const bare = lapses.filter(({ s }) => s.tool?.kind !== 'flowtime' && s.graph !== false).map(({ d, s }) => `${d.id}/${s.id}`);
  assert.deepEqual(bare, [], 'every time-lapse slide with no chart of its own is a Doppler, a vitals monitor or a record of its own');
});

test('a time-lapse slide never keeps the ascites dial or a FibroScan in the instrument card over its own chart', () => {
  // (Mohammad, 12 Nov 2026: where a slide has a timeline, the chart is the instrument card and replaces the less important instrument; the belly's
  // ascites dial and the stiffness scan only repeat a reading the chart plots. A guideline card, a lumen, a plane or the flow split stays.)
  const left = lapses.filter(({ s }) => ['abdomen', 'fibroscan'].includes(s.tool?.kind) && graphLines(s)).map(({ d, s }) => `${d.id}/${s.id}`);
  assert.deepEqual(left, []);
});

test('a slide with a chart of its own, or no time-lapse, carries no second graph', () => {
  for (const { d, s } of lapses.filter(({ s }) => s.tool?.kind === 'flowtime')) assert.equal(graphLines(s), null, `${d.id}/${s.id}`);
  assert.equal(graphLines({ days: 30, tiles: ['pv', 'asc'] }), null, 'no lapse');
  assert.equal(graphLines({ lapse: { seconds: 5 }, tiles: ['pv', 'asc'], graph: false }), null, 'switched off');
  assert.equal(graphLines({ lapse: { seconds: 5 }, tiles: ['pv'] }), null, 'one reading');
  assert.deepEqual(graphLines({ lapse: { seconds: 5 }, graph: ['map', 'co'], tiles: [] }), ['map', 'co'], 'named by the slide');
});

test('each graph is drawn from the trail the worker keeps, one point a day', async () => {
  const MODEL = ['preset', 'presetDays', 'params', 'action', 'days'];
  for (const dk of new Set(lapses.filter(({ s }) => graphLines(s)).map(({ d }) => d))) {
    const steps = dk.slides.map((s) => (MODEL.some((k) => s[k]) ? { preset: s.preset, presetDays: s.presetDays, params: s.params, action: s.action, days: s.days, ramp: s.ramp, fine: !!s.lapse, trail: s.tool?.kind === 'flowtime' ? modelLines(s.tool.lines || []) : graphTrail(s) } : {}));
    const trails = [], core = createCore((m) => { if (m.type === 'seqStep') trails[m.i] = m.trail; });
    core.handle({ type: 'run', running: false });
    await core.handle({ type: 'sequence', reqId: 1, steps });
    core.dispose();
    for (const { d, s, i } of lapses.filter((c) => c.d === dk && graphLines(c.s))) {
      const g = lapseGraphOf(s), tr = trails[i], name = `${d.id}/${s.id}`;
      assert.ok(Array.isArray(tr), `${name}: the lapse kept a trail`);
      assert.equal(tr.length, s.days + 1, `${name}: one point a day`);
      const ser = flowTimeSeries(tr, g.clock, g.lines);
      assert.ok(ser, `${name}: the chart can draw it`);
      assert.ok(ser.pv.every(Number.isFinite) && ser.flow.every(Number.isFinite), `${name}: every point is a number`);
    }
  }
});
