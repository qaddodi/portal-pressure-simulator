// Renders the workload measurements (scripts/vec-workload.mjs) as the markdown tables of docs/vector-workload.md. Pure: JSON in, text out.
//
// A measurement: { bench, picture, structure: 'old' | 'new', frame, frames: [{ t, size, stride, projectedPx, classes, all, strips, totals, instances }] }.
// "work" is the plan's cost model with equal weights: bound tests + segment tests + junction work (disc tests and member-mask iterations).
const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(0)}k` : String(Math.round(n)));
const f1 = (n) => (+n).toFixed(1);

/** Sum of a frames list's totals (a pinch is averaged over its instants). */
export function totalOf(m) {
  const n = m.frames.length || 1, acc = { px: 0, work: 0, cost: 0, bound: 0, seg: 0, junction: 0 };
  for (const f of m.frames) { acc.px += f.projectedPx / n; acc.work += f.totals.work / n; acc.cost += (f.totals.cost ?? 0) / n; acc.bound += f.totals.bound / n; acc.seg += f.totals.seg / n; acc.junction += f.totals.junction / n; }
  return acc;
}

/** Old against new for every benchmark and picture: the headline table. Flags the stop point (new does more work than old). */
export function summaryTable(all) {
  const rows = [], flags = [];
  const key = (m) => `${m.bench}|${m.picture}`;
  const olds = new Map(all.results.filter((m) => m.structure === 'old').map((m) => [key(m), m])), news = new Map(all.results.filter((m) => m.structure === 'new').map((m) => [key(m), m]));
  for (const [k, o] of olds) {
    const n = news.get(k), to = totalOf(o), tn = n ? totalOf(n) : null;
    const ratio = tn ? tn.cost / Math.max(1, to.cost) : null;
    if (tn && ratio > 1) flags.push(`${o.bench} (${o.picture}): new cost ${fmt(tn.cost)} > old ${fmt(to.cost)}`);
    rows.push(`| ${o.bench} | ${o.picture} | ${fmt(to.px)} | ${fmt(to.cost)} | ${fmt(to.seg)} | ${tn ? fmt(tn.px) : 'waits for K'} | ${tn ? fmt(tn.cost) : ''} | ${tn ? fmt(tn.seg) : ''} | ${tn ? `${(ratio * 100).toFixed(0)}%` : ''} |`);
  }
  return [
    '| benchmark | picture | old px | old cost | old segment tests | new px | new cost | new segment tests | new / old cost |',
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
  if (all.sweep?.length) { const sw = sweepSummary(all.sweep); out.push(sw.table, '', `best by parameter: ${JSON.stringify(sw.best)}`, ''); }
  if (all.easing?.length) out.push(easingTable(all.easing), '');
  if (all.notes?.length) out.push(...all.notes.map((n) => `note: ${n}`));
  return out.join('\n');
}

// ── The policy sweep ──
const BASE = { headroom: 1.1, leafMinPx: 8, leafOverhead: 64, refineGain: 0.2, wJoin: 24 };
const PARAMS = ['headroom', 'leafMinPx', 'leafOverhead', 'refineGain', 'wJoin'];
const sameBut = (r, p) => PARAMS.every((q) => q === p || r[q] === BASE[q]);

/**
 * One parameter at a time around the base: each value's objective (replayed cost + leaf quads in view × the fixed quad cost) over the base's, averaged
 * over the benchmarks swept, with the leaves it makes. Returns { table: markdown, best: { param: value } } (a value within 0.5% of the base's keeps the base).
 */
export function sweepSummary(rows) {
  const groups = new Map();
  for (const r of rows) { const k = `${r.bench}|${r.picture}`; (groups.get(k) || groups.set(k, []).get(k)).push(r); }
  const lines = [], best = {};
  for (const p of PARAMS) {
    const byVal = new Map();
    for (const rs of groups.values()) {
      const base = rs.find((r) => !r.combo && PARAMS.every((q) => r[q] === BASE[q]));
      if (!base) continue;
      for (const r of rs) {
        if (r.combo || !sameBut(r, p)) continue;
        const e = byVal.get(r[p]) || byVal.set(r[p], { n: 0, obj: 0, objMax: 0, leaves: 0 }).get(r[p]);
        const o = r.objective / base.objective;
        e.n++; e.obj += o; e.objMax = Math.max(e.objMax, o); e.leaves += r.leaves / base.leaves;
      }
    }
    lines.push(`**${p}** (base ${BASE[p]})`, '', `| ${p} | objective vs base, mean | worst benchmark | leaves vs base | benchmarks |`, '|---:|---:|---:|---:|---:|');
    let pick = BASE[p], bestObj = 1;
    for (const [v, e] of [...byVal].sort((a, b) => a[0] - b[0])) {
      const m = e.obj / e.n;
      lines.push(`| ${v} | ${(m * 100).toFixed(1)}% | ${(e.objMax * 100).toFixed(1)}% | ${((e.leaves / e.n) * 100).toFixed(0)}% | ${e.n} |`);
      if (m < bestObj * 0.995) { bestObj = m; pick = v; }
    }
    best[p] = pick;
    lines.push('');
  }
  const combo = rows.filter((r) => r.combo);
  if (combo.length) {
    lines.push('**The chosen combination** (all four together, against the base)', '', '| benchmark | picture | objective vs base | leaves vs base |', '|---|---|---:|---:|');
    for (const r of combo) {
      const base = rows.find((x) => x.bench === r.bench && x.picture === r.picture && !x.combo && PARAMS.every((q) => x[q] === BASE[q]));
      if (base) lines.push(`| ${r.bench} | ${r.picture} | ${((r.objective / base.objective) * 100).toFixed(1)}% | ${((r.leaves / base.leaves) * 100).toFixed(0)}% |`);
    }
  }
  return { table: lines.join('\n'), best };
}

/** The width-easing table: rebuild events a headroom causes across the deck's preset changes. */
export function easingTable(easing) {
  if (!easing?.length) return '';
  return ['| headroom | row steps | rows rebuilt |', '|---:|---:|---:|', ...easing.map((e) => `| ${e.headroom} | ${e.steps} | ${e.rowsRebuilt} |`)].join('\n');
}
