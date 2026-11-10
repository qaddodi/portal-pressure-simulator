// The time graph on a time-lapse slide's teaching card (lapse-graph.js; Mohammad, 7 Nov 2026): every slide with a bar that runs forward in
// time, and no chart of its own, plots its two tiles day by day. These checks keep a slide from losing its graph or naming a line the model
// does not keep.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCore } from '../src/worker-core.js';
import { readdirSync } from 'node:fs';
await import('./dom-shim.js');   // (the chart draws on the GPU, svg-gl.js, which loads only with a page)
const { LINE, flowTimeSeries, modelLines } = await import('../src/ui/flow-time.js');
const { graphLines, lapseGraphOf, graphTrail } = await import('../src/ui/lapse-graph.js');

const decks = (await Promise.all(readdirSync(new URL('../src/ui/decks/', import.meta.url)).map((f) => import(`../src/ui/decks/${f}`))))
  .flatMap((m) => Object.values(m)).filter((d) => d?.slides && d.id);
const unique = [...new Map(decks.map((d) => [d.id, d])).values()];
const lapses = unique.flatMap((d) => d.slides.map((s, i) => ({ d, s, i })).filter(({ s, i }) => s.lapse && i > 0 && !s.visual));

test('a time-lapse slide with no chart of its own gets a graph of two known readings', () => {
  const bare = lapses.filter(({ s }) => s.tool?.kind !== 'flowtime' && s.graph !== false);
  assert.ok(bare.length >= 18, `at least 18 time-lapse slides carry a graph on their words (found ${bare.length}; the rest took theirs up into the instrument card, 10 Nov 2026)`);
  const none = bare.filter(({ s }) => !graphLines(s)).map(({ d, s }) => `${d.id}/${s.id}`);
  assert.deepEqual(none, [], 'every one of them plots two readings');
  for (const { d, s } of bare) {
    const g = lapseGraphOf(s), name = `${d.id}/${s.id}`;
    assert.equal(g.lines.length, 2, `${name}: two lines`);
    for (const k of g.lines) assert.ok(LINE[k] && !LINE[k][5]?.given, `${name}: ${k} is a line the model keeps`);
    assert.equal(LINE[g.lines[0]][1] === 'mmHg' || LINE[g.lines[1]][1] !== 'mmHg', true, `${name}: a pressure takes the lower place`);
    assert.deepEqual(graphTrail(s), modelLines(g.lines), `${name}: the worker keeps those two`);
  }
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
