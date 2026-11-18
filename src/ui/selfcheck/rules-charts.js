// The chart and number rules, registered with the self-check registry (rules.js). Each is a thin wrapper: the judges are in chart-rules.js, number-rules.js and
// pressure-rules.js (pure, tested on their own); here they are given the screen report's `charts` part and, for the words, its `cards` part.
import { registerRule } from './rules.js';
import { zoneNamesWithLegend, axesFitData } from './chart-rules.js';
import { numbersAgree } from './number-rules.js';
import { pressureColour, pressureWords } from './pressure-rules.js';

/** { rule, chart, what, where, why, owner } → the registry's { what, where, ... } (it adds rule, why and owner itself; a finding's own owner wins). */
const shape = (f) => ({ what: f.what, where: f.where, owner: f.owner, ...(f.chart ? { chart: f.chart } : {}) });
const charts = (report) => report.charts?.charts || [];

registerRule({
  id: 'chart-zone-names-with-legend', owner: 'src/ui/visual-plane.js', kind: 'state',
  why: 'A chart that has a legend writes no zone names on its plot (17 Nov: "you have a legend already")',
  check: (report) => charts(report).flatMap(zoneNamesWithLegend).map(shape),
});
registerRule({
  id: 'chart-axes-fit-data', owner: 'src/ui/visual-plane.js', kind: 'state',
  why: 'A chart that cuts its axes to its points leaves no more than 45% of an axis empty, and draws no point outside its frame (18 Nov, b52b29d1)',
  check: (report) => charts(report).flatMap((c) => axesFitData(c)).map(shape),
});
registerRule({
  id: 'number-agree', owner: 'src/ui/presenter-cards.js', kind: 'state',
  why: 'A reading is the same number in the tile, the header, the words, the chart and the figure label, and the model\'s',
  check: (report) => numbersAgree(report.charts?.numbers || []).map(shape),
});
registerRule({
  id: 'pressure-colour', owner: 'src/engine/pressure-cuts.js', kind: 'state',
  why: 'A pressure wears the colour its cut-offs give the number shown: HVPG amber over 5, red 10; PPG amber 6, red 12',
  check: (report) => pressureColour(report.charts?.numbers || []).map(shape),
});
registerRule({
  id: 'pressure-words', owner: 'src/engine/pressure-cuts.js', kind: 'state',
  why: 'Words that name a cut-off of the HVPG or PPG name one of the app\'s (HVPG 5, 10, 12, 20; PPG 6, 12)',
  check: (report) => pressureWords([
    ...(report.cards?.cards || []).flatMap((c) => c.lines.map(([text]) => ({ where: `the ${c.kind}`, text }))),
    ...charts(report).flatMap((c) => c.texts.map((t) => ({ where: `chart ${c.id}`, text: t.text, owner: undefined }))),
  ]).map(shape),
});
