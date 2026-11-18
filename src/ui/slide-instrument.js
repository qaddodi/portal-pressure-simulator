// The instrument a slide gets when it names none (Mohammad, 15 Nov 2026, PC-6: a chart is an instrument card, "just another instrument card
// that decks can use", never part of the teaching card; the trial card rule of 14 Nov, tests/instrument-slot.test.js).
//   • a time-lapse slide whose two tiles can be plotted (lapse-graph.js) gets the flow-time chart: tool { kind: 'flowtime', clock, lines };
//   • a slide that plays a TIPS, BRTO, BATO or Meso-Rex procedure with two tiles (event-graph.js) gets its procedure graph: tool { kind: 'evgraph' }.
// A slide that names an instrument keeps it, and a slide that names `graph: false` gets none. The presenter runs every slide through this once,
// when the deck is loaded (presenter.js), so the words' card is never given a chart to build.
import { lapseGraphOf } from './lapse-graph.js';
import { eventGraphOf } from './event-graph.js';

export function instrumentOf(s) {
  if (!s || s.tool) return s;
  const lap = lapseGraphOf(s);
  if (lap) return { ...s, tool: { kind: 'flowtime', clock: lap.clock, lines: lap.lines } };
  const ev = s.procedure ? eventGraphOf(s) : null;
  if (ev) return { ...s, tool: { kind: 'evgraph', title: ev.kind === 'brto' || ev.kind === 'brtoC6' || ev.kind === 'bato' ? 'What the procedure changes' : undefined } };
  return s;
}
