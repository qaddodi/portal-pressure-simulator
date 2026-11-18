// The chart rules of the self-check (screen-report-recs.md, section 2): small judges over ONE chart record from chart-reader.js, each returning findings
// { rule, what, where, why, owner } (the shape of the plan's example) or []. Pure: no page, no imports but chart-roles.js, so node tests feed them records.
// Each is a standing rule of the owner's and ships with a case that must fire and one that must not (tests/selfcheck-chart-rules.test.js).
//
//   chart-zone-names-with-legend  A chart that has a legend of its zones (a key under or beside it, legend.zones) writes no zone names on the plot (17 Nov 2026: "no need to mention both
//                                 raised, PPG only etc. on the chart itself, you have a legend already").
//   chart-axes-fit-data           A chart that cuts its axes to the points plotted (its drawing says data-fit="on") leaves no more than 45% of an axis empty past
//                                 its last point, unless a cut-off line stands in that room, and draws no point outside its frame (18 Nov 2026, b52b29d1:
//                                 "we're extending it far more than we need on the x direction").
import { ownerOf } from './chart-roles.js';

const norm = (t) => String(t).toLowerCase().replace(/[\s\u00a0]+/g, ' ').replace(/[.,;:]+$/, '').trim();
const find = (rule, chart, what, where, why, owner) => ({ rule, chart: chart.id, what, where, why, owner });

/** Zone names written on a plot that its legend already names. */
export function zoneNamesWithLegend(chart) {
  if (!chart.legend || chart.legend.where === 'none' || !chart.legend.entries.length) return [];
  const names = new Set(chart.legend.entries.map(norm));
  const out = [];
  for (const t of chart.texts) {
    if (t.role === 'legend') continue;
    if ((t.role === 'zone-name' && chart.legend.zones) || (names.has(norm(t.text)) && t.role !== 'tick')) {
      out.push(find('chart-zone-names-with-legend', chart, `Zone name "${t.text}"`, `on the plot of ${chart.id} at ${t.x}, ${t.y}`,
        `The chart's legend already names its zones (${chart.legend.entries.length} entries), so the plot carries no zone words`, ownerOf(t.look)));
    }
  }
  return out;
}

const frameOf = (chart) => {
  const boxes = [...chart.rects.filter((r) => r.role === 'frame').map((r) => [r.x, r.y, r.x + r.w, r.y + r.h]), ...chart.lines.filter((l) => l.role === 'axis').map((l) => [Math.min(l.x1, l.x2), Math.min(l.y1, l.y2), Math.max(l.x1, l.x2), Math.max(l.y1, l.y2)])];
  if (!boxes.length) return null;
  return [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
};

/** A fitted chart whose axes run far past its points, or whose point lies outside its frame. */
export function axesFitData(chart, { maxEmpty = 0.45 } = {}) {
  if (!chart.fit) return [];
  const frame = frameOf(chart), pts = chart.dots.filter((d) => d.role === 'point' || d.role === 'case');
  if (!frame || !pts.length) return [];
  const [L, T, R, B] = frame, W = R - L, H = B - T;
  if (!(W > 0 && H > 0)) return [];
  const out = [];
  const owner = ownerOf(pts[0].look);
  for (const p of pts) {
    if (p.x < L - 1.5 || p.x > R + 1.5 || p.y < T - 1.5 || p.y > B + 1.5) {
      out.push(find('chart-axes-fit-data', chart, `A point at ${p.x}, ${p.y}`, `outside the plot (${L}–${R} across, ${T}–${B} down)`, 'An axis must reach every point plotted (a value past the axis is drawn clamped to its edge)', owner));
    }
  }
  const maxX = Math.max(...pts.map((p) => p.x)), minY = Math.min(...pts.map((p) => p.y));
  const cuts = chart.lines.filter((l) => l.role === 'cut');
  const vertical = cuts.filter((l) => Math.abs(l.x2 - l.x1) < Math.abs(l.y2 - l.y1)), level = cuts.filter((l) => Math.abs(l.x2 - l.x1) >= Math.abs(l.y2 - l.y1));
  const emptyX = (R - maxX) / W, emptyY = (minY - T) / H;
  if (emptyX > maxEmpty && !vertical.some((l) => l.x1 > maxX)) {
    out.push(find('chart-axes-fit-data', chart, 'The across axis', `${Math.round(emptyX * 100)}% of it is empty past the last point (limit ${Math.round(maxEmpty * 100)}%)`, 'A fitted axis stops a quarter past its highest point, or 30% past its highest cut-off line where that is further', owner));
  }
  if (emptyY > maxEmpty && !level.some((l) => l.y1 < minY)) {
    out.push(find('chart-axes-fit-data', chart, 'The up axis', `${Math.round(emptyY * 100)}% of it is empty above the highest point (limit ${Math.round(maxEmpty * 100)}%)`, 'A fitted axis stops a quarter past its highest point, or 30% past its highest cut-off line where that is further', owner));
  }
  return out;
}

/** Every chart rule, in the order they are reported. */
export const CHART_RULES = Object.freeze({ 'chart-zone-names-with-legend': zoneNamesWithLegend, 'chart-axes-fit-data': axesFitData });
/** Findings of every chart rule over every chart of a chart reading ({ charts }). */
export const judgeCharts = (reading) => (reading?.charts || []).flatMap((c) => Object.values(CHART_RULES).flatMap((rule) => rule(c)));
