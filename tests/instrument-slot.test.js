// A chart is an instrument card, never part of the teaching card (Mohammad, 14 Nov 2026 for the trial card: "Just another instrument card that
// decks can use"; 15 Nov 2026, PC-6, for the procedure's event graph and the time-lapse graph). No deck can nest an instrument in the words:
// scripts/rules-lint.mjs fails a presenter that builds one for the teaching card, and a slide that names no instrument gets the chart as its own
// instrument (slide-instrument.js), which these tests check.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS, withOverview } from '../src/ui/decks.js';
import { instrumentOf } from '../src/ui/slide-instrument.js';
import { graphLines } from '../src/ui/lapse-graph.js';
import { eventGraphOf } from '../src/ui/event-graph.js';
import { chartBefore } from '../src/ui/chart-start.js';

test('every slide that can draw a time-lapse or procedure graph has it as its tool, in every deck', () => {
  let lapse = 0, event = 0;
  for (const d of DECKS) for (const raw of withOverview(d).slides) {
    const s = instrumentOf(raw), name = `${d.id}/${s.id}`;
    if (raw.tool) assert.equal(s, raw, `${name}: a named instrument is kept as it is`);
    if (graphLines(raw)) { lapse++; assert.equal(s.tool?.kind, 'flowtime', `${name}: the time-lapse's graph is its instrument`); assert.deepEqual(s.tool.lines, graphLines(raw)); }
    if (raw.procedure && !raw.tool && eventGraphOf(raw)) { event++; assert.equal(s.tool?.kind, 'evgraph', `${name}: the procedure's graph is its instrument`); }
    if (!raw.tool && s.tool) assert.ok(['flowtime', 'evgraph'].includes(s.tool.kind), `${name}: only a chart is implied`);
  }
  // (None of the built-in decks needs it any more: each names its chart. The rule is for a deck that does not, an imported one included.)
  assert.equal(lapse + event, 0, 'every built-in deck names its chart as the slide\'s tool');
});

test('a slide that names no instrument gets the chart as one, and a slide that names one or switches the graph off gets none', () => {
  const lap = { id: 'x', lapse: { seconds: 5 }, days: 30, params: { drugs: { carvedilol: true } }, tiles: ['hvpg', 'map'], data: 'tiles' };
  const t = instrumentOf(lap).tool;
  assert.equal(t.kind, 'flowtime'); assert.equal(t.clock, 'days'); assert.deepEqual(t.lines, graphLines(lap));
  assert.equal(instrumentOf({ ...lap, ramp: { meal: true } }).tool.clock, 'meal');
  assert.equal(instrumentOf({ ...lap, graph: false }).tool, undefined, 'switched off');
  assert.equal(instrumentOf({ ...lap, tool: { kind: 'doppler', vessel: 'PV_TRUNK' } }).tool.kind, 'doppler', 'its own instrument stays');
  assert.equal(graphLines({ ...lap, tool: { kind: 'doppler' } }), null, 'no second graph beside another instrument');
  const proc = { id: 'p', procedure: 'tips', tiles: ['ppg', 'liver'], data: 'tiles' };
  assert.equal(instrumentOf(proc).tool.kind, 'evgraph');
  assert.equal(instrumentOf({ ...proc, tool: { kind: 'trace' } }).tool.kind, 'trace');
  assert.equal(instrumentOf({ id: 'q', tiles: ['ppg', 'liver'] }).tool, undefined, 'no lapse, no procedure');
  assert.equal(instrumentOf(null), null);
});

test('the time-lapse rules hold for the implied chart: it starts at the state before the change', () => {
  const slides = [{ id: 'a' }, instrumentOf({ id: 'b', lapse: { seconds: 5 }, days: 30, params: { drugs: { carvedilol: true } }, tiles: ['hvpg', 'map'], data: 'tiles' })];
  const states = [{ fp: { hvpg: 15, map: 80 } }, { fp: { hvpg: 11, map: 78 } }];
  const b = chartBefore(slides, [0, 1], states, 1);
  assert.deepEqual(b, { hvpg: 15, map: 80 }, 'drawn from the patient before the slide');
});
