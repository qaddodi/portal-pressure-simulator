// The deck sweep's pure parts (scripts/deck-sweep.mjs): which chunks of work there are, what a slide's reads say, the summary text. Node only, no browser.

/** "3", "2-5", "1,4-6" as a Set of slide numbers (1-based); '' is every slide (null). */
export function parseSlides(text) {
  if (!text) return null;
  const set = new Set();
  for (const part of String(text).split(',')) {
    const m = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(part);
    if (!m) continue;
    for (let n = +m[1]; n <= +(m[2] || m[1]); n++) set.add(n);
  }
  return set.size ? set : null;
}

/** The work, as chunks of one device and some of the decks (balanced by slide count, the largest decks first): [{ name, device, decks }]. */
export function chunksFor(devices, decks, parts = 2) {
  const n = Math.max(1, Math.min(parts, decks.length));
  const load = Array(n).fill(0), mine = Array.from({ length: n }, () => []);
  for (const d of [...decks].sort((a, b) => b.slides.length - a.slides.length || a.id.localeCompare(b.id))) {
    const k = load.indexOf(Math.min(...load));
    load[k] += d.slides.length; mine[k].push(d);
  }
  const out = [];
  for (const device of devices) for (let k = 0; k < n; k++) out.push({ name: `${device} part ${k + 1}/${n}`, device, decks: mine[k], load: load[k] });
  return out;   // (device by device in the order asked, so the first size is whole first)
}

/** What one slide's reads say, as lines "kind: words". `r` is the page's answer ({ main, held, back }); `judgeEdges` is edge-rules.js's. */
export function slideProblems(r, judgeEdges) {
  const lines = [];
  const add = (prefix, check, edges) => {
    for (const p of check?.problems || []) lines.push(`${prefix}${p.kind}: ${p.text}`);
    for (const t of judgeEdges(edges)) lines.push(`${prefix}${t}`);
  };
  if (r.held) add('[case card up] ', r.held.check, r.held.edges);
  if (r.main) add('', r.main.check, r.main.edges);
  if (r.back) for (const t of judgeEdges(r.back.edges)) lines.push(`[instrument in front] ${t}`);
  return [...new Set(lines)];
}

const kindOf = (line) => (/^\[[^\]]*\]\s*/.test(line) ? line.replace(/^\[[^\]]*\]\s*/, '') : line).split(':')[0];

/** The text summary of a report: counts, then every failure, grouped by device, deck and slide. */
export function summarize(report) {
  const rs = Object.values(report.results);
  const bad = rs.filter((r) => r.ok === false);
  const withP = rs.filter((r) => r.ok !== false && r.problems.length);
  const kinds = {}, byDevice = {};
  for (const r of withP) for (const p of r.problems) { const k = kindOf(p); kinds[k] = (kinds[k] || 0) + 1; byDevice[r.device] = (byDevice[r.device] || 0) + 1; }
  const out = [];
  out.push(`deck-sweep: ${rs.length} slide visits (${report.decks.length} decks x ${report.devices.length} sizes) in ${Math.round(report.seconds)} s${report.fast ? ' (fast mode)' : ''}`);
  out.push(`  ${bad.length} did not open or settle, ${withP.length} slides with findings (${Object.values(kinds).reduce((a, b) => a + b, 0)} findings)`);
  if (Object.keys(kinds).length) out.push(`  by kind: ${Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  if (Object.keys(byDevice).length) out.push(`  by size: ${Object.entries(byDevice).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  if (bad.length) { out.push('', 'DID NOT OPEN:'); for (const r of bad) out.push(`  ${r.deck} slide ${r.slide} on ${r.device}: ${r.error || 'did not open'}`); }
  if (withP.length) {
    out.push('', 'FINDINGS:');
    const order = (a, b) => a.device.localeCompare(b.device) || a.deck.localeCompare(b.deck) || a.slide - b.slide;
    let dev = '';
    for (const r of [...withP].sort(order)) {
      if (r.device !== dev) { dev = r.device; out.push(`  ${dev}:`); }
      out.push(`    ${r.deck} slide ${r.slide}${r.shuffle ? ' (shuffle)' : ''}:`);
      for (const p of r.problems) out.push(`      ${p}`);
    }
  }
  return out.join('\n');
}

/** One share of n of the whole job, balanced by slide count (every deck at every size is one piece, the heaviest first onto the lightest share): [{ name, device, decks }], one chunk per size in it. */
export function shardChunks(devices, decks, i, n) {
  const pieces = [];
  for (const device of devices) for (const d of decks) pieces.push({ device, d, w: d.slides.length });
  pieces.sort((a, b) => b.w - a.w || a.d.id.localeCompare(b.d.id) || a.device.localeCompare(b.device));
  const load = Array(n).fill(0), mine = [];
  for (const p of pieces) { const k = load.indexOf(Math.min(...load)); load[k] += p.w; if (k === i - 1) mine.push(p); }
  const by = new Map();
  for (const p of mine) { if (!by.has(p.device)) by.set(p.device, []); by.get(p.device).push(p.d); }
  return devices.filter((d) => by.has(d)).map((device) => ({ name: `${device} share ${i}/${n}`, device, decks: by.get(device) }));
}

/** Reports from several shares as one (results keyed by deck, slide and size, so none can clash). */
export function mergeReports(reports) {
  const results = {};
  for (const r of reports) Object.assign(results, r.results);
  const devices = [...new Set(reports.flatMap((r) => r.devices))], decks = [...new Set(reports.flatMap((r) => r.decks))];
  return { schema: 1, at: new Date().toISOString(), devices, decks, fast: reports.every((r) => r.fast), rate: reports[0]?.rate, partial: reports.some((r) => r.partial), seconds: Math.max(0, ...reports.map((r) => r.seconds || 0)), results: Object.fromEntries(Object.entries(results).sort(([a], [b]) => a.localeCompare(b))) };
}
