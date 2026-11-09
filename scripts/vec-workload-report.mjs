// Renders the workload measurements (scripts/vec-workload.mjs) as the markdown tables of docs/vector-workload.md. Pure: JSON in, text out.
//
// A measurement: { bench, picture, structure: 'old' | 'new', frame, frames: [{ t, size, stride, projectedPx, classes, all, strips, totals, instances }] }.
// "work" is the plan's cost model with equal weights: bound tests + segment tests + junction work (disc tests and member-mask iterations).
const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(0)}k` : String(Math.round(n)));
const f1 = (n) => (+n).toFixed(1);

/** Sum of a frames list's totals (a pinch is averaged over its instants). */
export function totalOf(m) {
  const n = m.frames.length || 1, acc = { px: 0, work: 0, bound: 0, seg: 0, junction: 0 };
  for (const f of m.frames) { acc.px += f.projectedPx / n; acc.work += f.totals.work / n; acc.bound += f.totals.bound / n; acc.seg += f.totals.seg / n; acc.junction += f.totals.junction / n; }
  return acc;
}

/** Old against new for every benchmark and picture: the headline table. Flags the stop point (new does more work than old). */
export function summaryTable(all) {
  const rows = [], flags = [];
  const key = (m) => `${m.bench}|${m.picture}`;
  const olds = new Map(all.results.filter((m) => m.structure === 'old').map((m) => [key(m), m])), news = new Map(all.results.filter((m) => m.structure === 'new').map((m) => [key(m), m]));
  for (const [k, o] of olds) {
    const n = news.get(k), to = totalOf(o), tn = n ? totalOf(n) : null;
    const ratio = tn ? tn.work / Math.max(1, to.work) : null;
    if (tn && ratio > 1) flags.push(`${o.bench} (${o.picture}): new ${fmt(tn.work)} > old ${fmt(to.work)}`);
    rows.push(`| ${o.bench} | ${o.picture} | ${fmt(to.px)} | ${fmt(to.work)} | ${fmt(to.seg)} | ${tn ? fmt(tn.px) : 'waits for K'} | ${tn ? fmt(tn.work) : ''} | ${tn ? fmt(tn.seg) : ''} | ${tn ? `${(ratio * 100).toFixed(0)}%` : ''} |`);
  }
  return [
    '| benchmark | picture | old px | old work | old segment tests | new px | new work | new segment tests | new / old work |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|',
    ...rows,
    ...(flags.length ? ['', `**Stop point 4 (new does more work than old):** ${flags.join('; ')}`] : []),
  ].join('\n');
}

/** One measurement's per-class table (the first frame, or the middle one of a pinch). */
export function classTable(m) {
  const f = m.frames[Math.floor(m.frames.length / 2)];
  const lines = [
    `${m.structure}, ${m.bench}, ${m.picture} (${f.size[0]}x${f.size[1]}, every ${f.stride}th pixel${m.frames.length > 1 ? `, instant ${f.t}` : ''})`,
    '',
    '| class | projected px | bound tests mean/p95/max | segment tests mean/p95/max | candidates mean/p95/max | active joins mean/max | work mean |',
    '|---|---:|---:|---:|---:|---:|---:|',
  ];
  for (const [name, c] of Object.entries(f.classes)) lines.push(`| ${name} | ${fmt(c.px)} | ${f1(c.bound_mean)} / ${c.bound_p95} / ${c.bound_max} | ${f1(c.seg_mean)} / ${c.seg_p95} / ${c.seg_max} | ${f1(c.cand_mean)} / ${c.cand_p95} / ${c.cand_max} | ${f1(c.joins_mean)} / ${c.joins_max} | ${f1(c.work_mean)} |`);
  const a = f.all;
  lines.push(`| **all drawn** | ${fmt(a.px)} | ${f1(a.bound_mean)} / ${a.bound_p95} / ${a.bound_max} | ${f1(a.seg_mean)} / ${a.seg_p95} / ${a.seg_max} | ${f1(a.cand_mean)} / ${a.cand_p95} / ${a.cand_max} | ${f1(a.joins_mean)} / ${a.joins_max} | ${f1(a.work_mean)} |`);
  if (f.strips?.top?.length) lines.push('', `strips: ${f.strips.rows} rows draw; most pixels: ${f.strips.top.slice(0, 5).map((s) => `row ${s.row} ${fmt(s.px)}`).join(', ')}`);
  if (f.instances) lines.push(`instances: ${f.instances.stripRows ?? ''} strip rows, ${f.instances.regionCells ?? f.instances.leafQuads ?? ''} quads in view`);
  return lines.join('\n');
}

export function reportText(all) {
  const out = [summaryTable(all), ''];
  for (const m of all.results) out.push(classTable(m), '');
  if (all.notes?.length) out.push(...all.notes.map((n) => `note: ${n}`));
  return out.join('\n');
}
