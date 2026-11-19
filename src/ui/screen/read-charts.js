// The charts part of the screen report (plan screen-report-recs section 1, "Charts"): each chart on the screen read from its model before the GPU draws it, and every
// number the screen shows for a model reading (tiles, the card header's readings, a words pill, a chart's mark). The reading is chart-reader.js / number-rules.js: the
// painter's own records (svg-gl.js looks, words, geometry and glides) and the page's own formatters; nothing is worked out a second way.
//
//   report.charts = { charts: [chart], numbers: [shown] }   (chart-reader.js for a chart, number-rules.js readShownNumbers for a shown number)
//   ctx.env.fp: the model's fingerprint for what is on screen (a gallery rig or a sweep knows it); with it each shown number also carries what the tile table prints for it
//   (`want`), and the number rule judges against the model. Without it the rule still checks that the places of one reading agree with its tile.
import { registerReader } from './registry.js';
import { readCharts } from '../selfcheck/chart-reader.js';
import { readShownNumbers, wantNumbers } from '../selfcheck/number-rules.js';

// The page's own formatters (the tile's text, a pill's, the number a chart is placed from) and the names a card header's reading writes for each tile key, handed in with
// setChartDeps by screen/chart-deps.js (the app's modules read the page's globals as they load; this file stays loadable in node with no page, and without them it says nothing).
let deps = null;
/** Hands the reader the page's formatters: { formats: { tile, word, value }, tileNames }. */
export const setChartDeps = (d) => { deps = d; };

export function readChartsPart(ctx) {
  const { doc, io, env } = ctx;
  if (!doc?.querySelectorAll || !deps) return null;
  const reading = readCharts(doc, io);
  const numbers = wantNumbers(readShownNumbers(doc, { charts: reading, tileNames: deps.tileNames }), env?.fp || null, deps.formats);
  return reading.charts.length || numbers.length ? { charts: reading.charts, numbers } : null;
}

const area = (c) => (c.size ? ` ${c.size[0]}×${c.size[1]}` : '');
registerReader({
  id: 'charts', owner: 'src/ui/svg-gl.js', order: 40, read: readChartsPart,
  text(p, ctx) {
    const out = [];
    for (const c of p.charts) {
      const axes = c.keys ? `, ${c.keys.x} across and ${c.keys.y} up` : '';
      const legend = c.legend.where === 'none' ? 'no legend' : `a legend of ${c.legend.entries.length} (${c.legend.entries.slice(0, 4).join(', ')}${c.legend.entries.length > 4 ? ', …' : ''}), ${c.legend.where === 'html' ? 'beside it' : 'in the chart'}`;
      const zones = c.texts.filter((t) => t.role === 'zone-name').map((t) => t.text);
      out.push(`Chart ${c.id}${area(c)}${axes}: ${c.dots.filter((d) => d.role === 'point').length} points${c.dots.some((d) => d.role === 'case') ? ' and the case' : ''}, ${c.lines.filter((l) => l.role === 'cut').length} cut-off lines, `
        + `${legend}, ${zones.length ? `zone words on the plot (${zones.join(', ')})` : 'no zone words on the plot'}${c.fit ? ', axes cut to the points' : ''}.`);
      if (ctx.detail === 'full') for (const t of c.texts) out.push(`    ${t.role} "${t.text}" at ${t.x},${t.y} (${t.size} px, ${Math.round(t.op * 100)}%)`);
    }
    if (p.numbers.length) {
      const by = {};
      for (const s of p.numbers) (by[s.key] ||= []).push(`${s.text} (${s.where}${s.rate ? ', ' + s.rate : ''})`);
      out.push(`Numbers shown for the model's readings: ${Object.entries(by).map(([k, v]) => `${k} ${v.join(', ')}`).join('; ')}.`);
    }
    return out;
  },
});
