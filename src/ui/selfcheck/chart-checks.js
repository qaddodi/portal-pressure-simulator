// The chart readers and number checks as ONE call for the screen report and the self-check registry (plan step 2b): read the charts, read every number the screen
// shows for a model reading, and judge them with the chart rules, the number-agreement rule and the pressure rules. Nothing here is drawn or measured: it reads the
// charts' models and the page's own words (selfcheck/chart-reader.js, number-rules.js), and the formatters it compares with are the page's own (the tile table).
//
// runChartChecks({ root, fp, io, words }) → { charts, shown, findings }
//   root   where to look (default the document)
//   fp     the model's fingerprint for what is on screen (the slide's, or the live model's); without it the number rule is skipped
//   io     layout reads (layout-snap.js, or plain DOM reads in a headless layout run); optional
//   words  the page's words by card ({ '<selector>': ['words', ...] }, gallery/readers.js readWords().cards), for the cut-off words rule; the charts' own words are always read
// The registry entry points are CHART_READER (name 'charts') and the rule list CHART_CHECKS; selfcheck/register-charts.js hands them to the registry.
import { readCharts } from './chart-reader.js';
import { judgeCharts } from './chart-rules.js';
import { readShownNumbers, numbersAgree } from './number-rules.js';
import { pressureColour, pressureWords } from './pressure-rules.js';

/** The formatters the page owns, loaded when a check runs (so this file loads in node with no page): the tile's text, a pill's, and the number a chart is placed from. */
async function pageFormats() {
  const [{ tileVal }, { tileOf, tileShown, TILE }, { valueText }] = await Promise.all([import('../presenter-cards.js'), import('../table-marks.js'), import('../callout-math.js')]);
  return {
    tileNames: Object.fromEntries(Object.keys(TILE).map((k) => [k, tileOf(k).n || tileOf(k).t]).map(([k, n]) => [k, n])),
    fmt: { tile: (k, f) => tileVal(k, f[k], f), word: (k, f) => [valueText(k, f, false), valueText(k, f, true)], value: (k, f) => tileShown(k, f[k]) },
  };
}

export async function runChartChecks({ root = document, fp = null, io = null, words = null } = {}) {
  const reading = readCharts(root, io);
  const { tileNames, fmt } = await pageFormats();
  const shown = readShownNumbers(root, { charts: reading, tileNames });
  const texts = [
    ...Object.entries(words || {}).flatMap(([where, list]) => list.map((text) => ({ where, text }))),
    ...reading.charts.flatMap((c) => c.texts.map((t) => ({ where: `chart ${c.id}`, text: t.text }))),
  ];
  const findings = [...judgeCharts(reading), ...(fp ? numbersAgree(shown, fp, fmt) : []), ...pressureColour(shown), ...pressureWords(texts)];
  return { charts: reading.charts, shown, findings };
}

/** The reader the registry runs for the screen report's Charts part. */
export const CHART_READER = Object.freeze({ name: 'charts', read: (root, io) => readCharts(root, io) });
/** The rules, by name, with what each judges: 'chart' rules take one chart record, 'screen' rules the whole of runChartChecks' input. */
export const CHART_CHECKS = Object.freeze([
  { rule: 'chart-zone-names-with-legend', scope: 'chart' }, { rule: 'chart-axes-fit-data', scope: 'chart' },
  { rule: 'number-agree', scope: 'screen' }, { rule: 'pressure-colour', scope: 'screen' }, { rule: 'pressure-words', scope: 'screen' },
]);
