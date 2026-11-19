// The pure half of scripts/gallery-sweep.mjs (no browser, no files): what one specimen's reads become, how two runs are compared and how a run is
// told in words. tests/gallery-layout-sweep.test.js runs it in node.
//
// A result is one specimen at one device size:
//   { id, device, ok, settled, ms, stable, problems: [{ kind, text, where }], boxes: { selector: [l, t, r, b] }, words: { selector: [string] },
//     looks?: { navy: ['<selector> ...'] }, errors?: [string], error?: string }
// `boxes` are the page's own rounded reads (pps.gallery.boxes(), 2 px steps), so a change of 2 px or less is the rounding, not the layout.

/** The key of a result in a report and a baseline. A specimen held behind a case or question card has a second result, `<id>#lifted`: the slide once the card was tapped away. */
import { GALLERY_DEVICES } from '../src/ui/devices.js';
export const keyOf = (id, device) => `${id}@${device}`;
export const splitKey = (key) => { const i = key.lastIndexOf('@'); return { id: key.slice(0, i), device: key.slice(i + 1) }; };

/** The device sizes a sweep covers, in css px, with the browser context each belongs to: touch rules `(pointer: coarse)` apply on the touch ones. */
export const SIZES = Object.fromEntries(GALLERY_DEVICES.map((d) => [d.id, { w: d.w, h: d.h, touch: d.touch }]));   // (src/ui/devices.js: the one list of sizes)

/**
 * The runs a sweep makes: each is one browser context (one boot) and the sizes it takes by resizing its page. Desktop with a mouse; touch for the
 * iPad pair and the iPhone pair as two runs, so the three go side by side and take about as long as one another.
 */
export function unitsFor(devices) {
  const want = devices.filter((d) => SIZES[d]);
  const groups = [['desktop', ['mac', 'mac-short']], ['ipad', ['ipad', 'ipad-portrait']], ['iphone', ['iphone', 'iphone-landscape']]];
  return groups.map(([name, ds]) => ({ name, sizes: ds.filter((d) => want.includes(d)) })).filter((u) => u.sizes.length);
}

/** A page's boxes in one shape: { selector: [l, t, r, b] } (a plain map, or a list of { sel, l, t, r, b }). Anything else is no boxes. */
export function normBoxes(raw) {
  const src = raw?.boxes ?? raw;
  const out = {};
  if (!src || typeof src !== 'object') return out;
  if (Array.isArray(src)) {
    for (const b of src) if (b && typeof b.sel === 'string' && [b.l, b.t, b.r, b.b].every(Number.isFinite)) out[b.sel] = [b.l, b.t, b.r, b.b];
    return out;
  }
  for (const [k, v] of Object.entries(src)) if (Array.isArray(v) && v.length === 4 && v.every(Number.isFinite)) out[k] = v;
  return out;
}

/** A page's words in one shape: { selector: [string] }. */
export function normWords(raw) {
  const src = raw?.cards ?? raw?.words ?? raw;
  const out = {};
  if (!src || typeof src !== 'object' || Array.isArray(src)) return out;
  for (const [k, v] of Object.entries(src)) if (Array.isArray(v)) out[k] = v.map(String);
  return out;
}

/** The fit problems of a check() answer as plain { kind, text, where } (the element and the line are left out: they are not stable between runs). */
export function normProblems(raw) {
  const list = Array.isArray(raw) ? raw : raw?.problems;
  return (list || []).map((p) => ({ kind: String(p.kind ?? 'problem'), text: String(p.text ?? ''), where: p.where ?? '' })).sort((a, b) => problemId(a).localeCompare(problemId(b)));
}
/** What makes two problems the same one, from run to run. */
export const problemId = (p) => `${p.kind}: ${p.text}`;

const px = (n) => `${Math.abs(Math.round(n))} px`;
const wh = (b) => ({ w: b[2] - b[0], h: b[3] - b[1] });

/** What changed in one box, in words ('' when it did not change by more than `tol`). */
export function describeBoxChange(a, b, tol = 2) {
  const A = wh(a), B = wh(b), say = [];
  const dw = B.w - A.w, dh = B.h - A.h;
  if (Math.abs(dh) > tol) say.push(`${dh > 0 ? 'grew' : 'shrank'} ${px(dh)} taller (${A.h} to ${B.h})`);
  if (Math.abs(dw) > tol) say.push(`${dw > 0 ? 'grew' : 'shrank'} ${px(dw)} wider (${A.w} to ${B.w})`);
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (Math.abs(dx) > tol && Math.abs(dw) <= tol) say.push(`moved ${px(dx)} ${dx > 0 ? 'right' : 'left'}`);
  else if (Math.abs(dx) > tol) say.push(`left edge moved ${px(dx)} ${dx > 0 ? 'right' : 'left'}`);
  if (Math.abs(dy) > tol && Math.abs(dh) <= tol) say.push(`moved ${px(dy)} ${dy > 0 ? 'down' : 'up'}`);
  else if (Math.abs(dy) > tol) say.push(`top edge moved ${px(dy)} ${dy > 0 ? 'down' : 'up'}`);
  return say.join(', ');
}

/** The changes between two results of the same specimen at the same size: [{ kind: 'box' | 'words' | 'problem' | 'fixed' | 'error' | 'fixed-open', text }]. */
export function diffResult(base, cur, { tol = 2 } = {}) {
  const out = [];
  if (!base || !cur) return out;
  if (base.ok === false && cur.ok !== false) { out.push({ kind: 'fixed-open', text: `opens now (it did not: ${base.error || 'no reason kept'})` }); }
  if (cur.ok === false) { if (base.ok !== false) out.push({ kind: 'error', text: `no longer opens: ${cur.error || 'no reason given'}` }); return out; }
  if (base.ok === false) return out;
  const bp = new Map(normProblems(base).map((p) => [problemId(p), p])), cp = new Map(normProblems(cur).map((p) => [problemId(p), p]));
  for (const [k] of cp) if (!bp.has(k)) out.push({ kind: 'problem', text: `new problem: ${k}` });
  for (const [k] of bp) if (!cp.has(k)) out.push({ kind: 'fixed', text: `problem gone: ${k}` });
  const ba = normBoxes(base.boxes), bb = normBoxes(cur.boxes);
  for (const sel of Object.keys(bb)) {
    if (!ba[sel]) { out.push({ kind: 'box', text: `${sel} appeared (${wh(bb[sel]).w} x ${wh(bb[sel]).h})` }); continue; }
    const d = describeBoxChange(ba[sel], bb[sel], tol);
    if (d) out.push({ kind: 'box', text: `${sel} ${d}` });
  }
  for (const sel of Object.keys(ba)) if (!bb[sel]) out.push({ kind: 'box', text: `${sel} is gone` });
  const wa = normWords(base.words), wb = normWords(cur.words);
  for (const sel of new Set([...Object.keys(wa), ...Object.keys(wb)])) {
    const x = (wa[sel] || []).join('\n'), y = (wb[sel] || []).join('\n');
    if (x !== y) out.push({ kind: 'words', text: `${sel} words changed` });
  }
  return out;
}

/**
 * Compares a run with the baseline. `report.results` and `baseline.results` are { key: result }. A key only the run has is `added`, one only the
 * baseline has (and the run covered its specimen and size) is `removed`. A run that covered part of the catalog leaves the rest alone.
 * Returns { changes: [{ key, id, device, kind, text }], added: [key], removed: [key], same: n }.
 */
export function diffReports(baseline, report, opts = {}) {
  const changes = [], added = [], removed = [];
  let same = 0;
  const b = baseline?.results || {}, r = report?.results || {};
  for (const key of Object.keys(r).sort()) {
    const { id, device } = splitKey(key);
    if (!b[key]) { added.push(key); continue; }
    const d = diffResult(b[key], r[key], opts);
    if (!d.length) same++;
    for (const c of d) changes.push({ key, id, device, ...c });
  }
  // (Gone: the specimen is no longer in the catalog and its size was swept. A specimen this run left out is not gone.)
  for (const key of Object.keys(b).sort()) { const { id, device } = splitKey(key); if (!r[key] && report.catalogIds && !report.catalogIds.includes(id.replace(/#lifted$/, '')) && (!report.devices || report.devices.includes(device))) removed.push(key); }
  return { changes, added, removed, same };
}

/** Groups changes by what they say about a specimen: one line per specimen and size, the sizes of one specimen next to each other. */
export function groupChanges(changes) {
  const by = new Map();
  for (const c of changes) { const k = c.key; if (!by.has(k)) by.set(k, []); by.get(k).push(c); }
  return [...by].map(([key, list]) => ({ key, ...splitKey(key), list }));
}

/** The problems of a run that the baseline did not already hold (all of them when there is no baseline). Failures to open count as problems. */
export function newTrouble(report, baseline) {
  const out = [];
  for (const [key, r] of Object.entries(report.results || {}).sort(([a], [b]) => a.localeCompare(b))) {
    const was = baseline?.results?.[key];
    if (r.ok === false) { if (was?.ok !== false) out.push(`${key}: does not open: ${r.error || 'no reason given'}`); continue; }
    const known = new Set(was && was.ok !== false ? normProblems(was).map(problemId) : []);
    for (const p of normProblems(r)) if (!known.has(problemId(p))) out.push(`${key}: ${problemId(p)}`);
    for (const e of r.errors || []) if (!(was?.errors || []).includes(e)) out.push(`${key}: page error: ${e}`);
  }
  return out;
}

/** The text a run prints: counts, then each trouble, then the layout changes. */
export function summaryText(report, diff, trouble, { max = 60 } = {}) {
  const res = Object.values(report.results || {});
  const failed = res.filter((r) => r.ok === false).length, unsettled = res.filter((r) => r.ok !== false && (r.settled === false || r.stable === false)).length;
  const withProblems = res.filter((r) => r.ok !== false && (r.problems || []).length).length;
  const lines = [`gallery-sweep ${report.commit || ''}: ${res.length} opens (${new Set(Object.keys(report.results).map((k) => splitKey(k).id)).size} specimens x ${report.devices?.length ?? '?'} sizes) in ${Math.round((report.seconds || 0))} s`];
  lines.push(`  ${failed} did not open, ${unsettled} did not settle, ${withProblems} with fit problems`);
  if (trouble.length) { lines.push(`TROUBLE ${trouble.length} (new against the baseline):`, ...trouble.slice(0, max).map((t) => `  ${t}`)); if (trouble.length > max) lines.push(`  ... and ${trouble.length - max} more (see the report)`); }
  if (diff) {
    lines.push(`LAYOUT against the baseline (${diff.same} unchanged, ${diff.added.length} new, ${diff.removed.length} gone, ${new Set(diff.changes.map((c) => c.key)).size} changed):`);
    const groups = groupChanges(diff.changes);
    for (const g of groups.slice(0, max)) { lines.push(`  ${g.id} on ${g.device}:`); for (const c of g.list.slice(0, 6)) lines.push(`    ${c.text}`); if (g.list.length > 6) lines.push(`    ... ${g.list.length - 6} more`); }
    if (groups.length > max) lines.push(`  ... and ${groups.length - max} more specimens (see the report)`);
  }
  return lines.join('\n');
}

/** A baseline from a report: its results only (a failed open is kept, so a later fix reads as "opens now"). A partial run is merged into the old one. */
export function makeBaseline(report, old, { why, at = new Date().toISOString() } = {}) {
  const results = { ...(old?.results || {}) };
  for (const [k, r] of Object.entries(report.results)) results[k] = slim(r);
  const history = [...(old?.history || []), { at, commit: report.commit, why }].slice(-30);
  return { schema: 1, at, commit: report.commit, why, history, results: Object.fromEntries(Object.entries(results).sort(([a], [b]) => a.localeCompare(b))) };
}
const slim = ({ ok, settled, problems, boxes, words, error }) => ({ ok, settled, problems: normProblems({ problems }), boxes: normBoxes(boxes), words: normWords(words), ...(error ? { error } : {}) });

/** The specimens a run takes: every catalog entry, narrowed by family, section, kind, an id list and the shard (every n-th, in catalog order, by family so a shard's cards share their opening). */
export function pickIds(list, { family, section, kind, ids, shard } = {}) {
  let out = list.filter((e) => (!family || family.includes(e.family)) && (!section || section.includes(e.section)) && (!kind || kind.includes(e.kind)) && (!ids || ids.includes(e.id)));
  if (shard && shard[1] > 1) {
    const fams = [...new Set(out.map((e) => e.family))];
    const load = Array(shard[1]).fill(0), mine = new Set();
    for (const f of fams.map((f) => [f, out.filter((e) => e.family === f).length]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
      const k = load.indexOf(Math.min(...load));
      load[k] += f[1];
      if (k === shard[0] - 1) mine.add(f[0]);
    }
    out = out.filter((e) => mine.has(e.family));
  }
  return out.map((e) => e.id);
}
