// The graph on a time-lapse slide's teaching card (Mohammad, 7 Nov 2026: "a graph of what's changing in time" on every slide with a bar that
// runs forward in time; option A of the mocks: the bar becomes the graph). Which two readings a slide plots, and how they are told to the
// flow-time chart (flow-time.js, the same chart the Varices and Treating the cause time-lapses carry on their data card): the slide's own
// tiles, so the graph and the numbers beside it always agree. Pure: it loads in node for the unit tests.
import { LINE, trailKeys } from './flow-time.js';

// A slide with its own time chart (a flow-time tool) or one that is no time-lapse has no graph here. A slide with no tiles to read
// names its two lines: graph: ['map', 'co']. graph: false turns it off.
const isPressure = (k) => LINE[k]?.[1] === 'mmHg';

/** The lines a slide's graph plots, [lower, upper], the way flow-time.js reads them (the lower on a scale from zero, the upper on its own
 *  tight scale: a pressure takes the lower place), or null when the slide has no graph. */
export function graphLines(s) {
  if (!s || s.visual || !s.lapse || s.graph === false) return null;
  if (s.tool?.kind === 'flowtime') return null;
  const want = Array.isArray(s.graph) ? s.graph : s.tiles || [];
  const keys = want.filter((k, j) => LINE[k] && !LINE[k][5]?.given && want.indexOf(k) === j).slice(0, 2);
  if (keys.length < 2) return null;
  return isPressure(keys[1]) && !isPressure(keys[0]) ? [keys[1], keys[0]] : keys;
}

/** The slide's graph as the chart is told it: { clock: 'meal' | 'days', lines }, or null. A meal is the teaching clock in minutes
 *  (fasting, the rise, the state reached held); every other time-lapse runs on its own days. */
export function lapseGraphOf(s) {
  const lines = graphLines(s);
  return lines ? { clock: s.ramp?.meal ? 'meal' : 'days', lines } : null;
}

/** What the model's worker keeps for the slide's graph, day by day: the fingerprint keys of its lines (false: no graph, nothing kept). */
export function graphTrail(s) {
  const g = lapseGraphOf(s);
  return g ? trailKeys({ lines: g.lines }) : false;
}
