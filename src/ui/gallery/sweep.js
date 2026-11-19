// The gallery's Sweep (faster-checks plan, steps 1 and 4): opens a list of specimens one after another on the device in hand, runs the shared fit
// rules on each (the same judges as the Check button and scripts/card-fit.mjs), and builds one report to paste into a thread. Pure data and
// promises: no DOM, no layout reads. The page's Sweep button (sweep-panel.js) hands in the gallery API (window.pps.gallery: list, open, check)
// and the probes; a unit test hands in fakes. Nothing here runs per frame: one await per specimen.
//
// spec  { all?, affected?, ids?: string[], family?, section?, kind?, looks?: string[], with?: ['check','words','boxes'], fresh?: boolean, timeoutMs? }
//         ids: exactly these specimens (the "affected" list a push message links to; the API fills it for `affected`); else the API's list filtered by
//         family, section and kind (`all` or nothing named: every specimen).
//         with: also keep each specimen's words() and boxes() in its result (for a harness; never kept in the saved place).
//         looks: each specimen is opened once per look (the current look when none is named).
//         fresh: forget a sweep left behind by a reload and start from the first specimen.
// api   window.pps.gallery (api.js): list(filter), open(id, { look, timeoutMs }) -> { ok, settled, ms, errors, error? }, check() -> { problems, busy, size },
//         words(), boxes(). open() says ok:false, error 'did not settle in time' for a specimen that opened but kept moving: that is "not settled", not "did not open".
// env   { storage, now, probes, onProgress, shouldStop, size }  (all optional)
//         probes: { errors() -> number, gpuMB() -> number, peakMB() -> number, framesStart(), framesStop() -> { gaps, scripts } }
//
// Resume: the place is kept in storage (sessionStorage) after every specimen, with the specimen that is open. A reload that follows a tab kill
// finds it, reports that specimen as "lost to a reload" (a finding, not a silent restart) and goes on from the next one. After MAX_KILLS reloads in one
// sweep it stops and reports what it has, so a specimen that always kills the tab cannot loop.
import { sweepRun } from '../report/emit.js';
import { runBlock } from '../report/run.js';

export const SWEEP_KEY = 'pps.gallery.sweep';
export const MAX_KILLS = 3;
/** How long one specimen may take to land before the sweep calls it "not settled" and goes on (the API's own wait). */
export const OPEN_TIMEOUT_MS = 20000;
export const NOT_SETTLED = 'did not settle in time';
const STALE_MS = 6 * 3600 * 1000;

const jobKey = (id, look) => `${id}@${look || '-'}`;
const sigOf = (jobs) => jobs.map((j) => jobKey(j.id, j.look)).join('|');

/** The specimen ids a spec names, in the API's order. Unknown ids are returned apart so the report can say so. */
export function resolveIds(spec, listed) {
  const known = new Map(listed.map((e) => [e.id, e]));
  if (Array.isArray(spec.ids) && spec.ids.length) {
    const ids = [...new Set(spec.ids)];
    return { ids: ids.filter((id) => known.has(id)), unknown: ids.filter((id) => !known.has(id)) };
  }
  const rows = listed.filter((e) => spec.all || (!spec.family || e.family === spec.family) && (!spec.section || e.section === spec.section) && (!spec.kind || e.kind === spec.kind));
  return { ids: rows.map((e) => e.id), unknown: [] };
}

/** The ids x looks job list. A look of null means "the look the page is in". */
export function planJobs(ids, looks) {
  const ls = looks?.length ? looks : [null];
  const jobs = [];
  for (const id of ids) for (const look of ls) jobs.push({ id, look });
  return jobs;
}

function readSaved(storage, sig, fresh, wall = Date.now()) {
  if (!storage || fresh) return null;
  try {
    const s = JSON.parse(storage.getItem(SWEEP_KEY) || 'null');
    if (!s || s.sig !== sig || s.state !== 'running' || wall - s.wall > STALE_MS) return null;
    return s;
  } catch { return null; }
}
function save(storage, s) { try { storage?.setItem(SWEEP_KEY, JSON.stringify({ ...s, results: s.results.map(({ words, boxes, ...r }) => r) })); } catch { /* (storage full or refused: the sweep still runs, it just cannot resume) */ } }
/** A sweep the storage holds that was running when the page went away (a reload or a tab kill), or null. */
export function savedSweep(storage, wall = Date.now()) {
  try {
    const s = JSON.parse(storage?.getItem(SWEEP_KEY) || 'null');
    return s && s.state === 'running' && wall - s.wall < STALE_MS ? s : null;
  } catch { return null; }
}
export function forgetSweep(storage) { try { storage?.removeItem(SWEEP_KEY); } catch { /* (nothing to forget) */ } }

/**
 * Runs the sweep. Resolves with the report object (see buildReport). Never rejects: a specimen that throws is a result with `error`.
 */
export async function runSweep(spec = {}, api, env = {}) {
  const now = env.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const probes = env.probes || {};
  const storage = env.storage || null;
  const t0 = now();
  const { ids, unknown } = resolveIds(spec, api.list({}));
  const jobs = planJobs(ids, spec.looks);
  const sig = sigOf(jobs);
  let saved = readSaved(storage, sig, spec.fresh, env.wall?.() ?? Date.now());
  const results = saved ? saved.results.slice() : [];
  let kills = saved ? saved.kills : 0;
  const resumed = !!saved;
  const done = new Set(results.map((r) => jobKey(r.id, r.look)));
  if (saved?.open && !done.has(saved.open)) {
    // The page went away while this specimen was open: that is the finding.
    const [id, look] = saved.open.split('@');
    results.push({ id, look: look === '-' ? null : look, ok: false, lost: true, problems: [], error: 'The page reloaded while this specimen was open (the browser ended the tab).' });
    done.add(saved.open);
    kills++;
  }
  const state = { sig, spec: { ...spec, fresh: false }, results, kills, resumes: saved ? (saved.resumes || 0) + 1 : 0, open: null, state: 'running', at: now(), wall: env.wall?.() ?? Date.now(), total: jobs.length };
  const persist = () => save(storage, state);
  persist();
  const stopped = () => !!env.shouldStop?.();
  let stoppedEarly = false, tooMany = false;

  for (let i = 0; i < jobs.length; i++) {
    const { id, look } = jobs[i];
    const key = jobKey(id, look);
    if (done.has(key)) continue;
    if (stopped()) { stoppedEarly = true; break; }
    if (kills >= MAX_KILLS) { tooMany = true; break; }
    env.onProgress?.({ at: i, total: jobs.length, id, look, results });
    state.open = key; state.at = now(); state.wall = env.wall?.() ?? Date.now(); persist();
    const r = { id, look, ok: false, settled: false, ms: 0, problems: [], busy: false, errors: 0, gpuMB: null, worstFrameMs: 0, longFrames: 0 };
    const e0 = probes.errors?.() ?? 0;
    let apiErrors = null;
    try { probes.framesStart?.(); } catch { /* (frame recording is optional) */ }
    try {
      const o = await api.open(id, { look: look || undefined, timeoutMs: spec.timeoutMs || OPEN_TIMEOUT_MS });
      const timedOut = o?.error === NOT_SETTLED;
      r.ok = o?.ok !== false || timedOut; r.settled = !!o?.settled; r.ms = Math.round(o?.ms || 0);
      if (o?.error && !timedOut) r.error = String(o.error);
      if (typeof o?.errors === 'number') apiErrors = o.errors;
      if (r.ok) {
        const c = await api.check();
        r.problems = (c?.problems || []).map((p) => ({ kind: p.kind, text: p.text, where: p.where }));
        r.busy = !!c?.busy;
        r.size = c?.size || null;
        if (spec.with?.includes('words')) r.words = await api.words?.();
        if (spec.with?.includes('boxes')) r.boxes = await api.boxes?.();
      }
    } catch (err) {
      r.ok = false; r.error = String(err?.message || err);
    }
    try {
      const f = probes.framesStop?.();
      if (f) {
        const gaps = f.gaps || [], scripts = f.scripts || [];
        r.worstFrameMs = Math.round(Math.max(0, ...gaps, ...scripts));
        r.longFrames = (f.long || []).length;
      }
    } catch { /* (frame recording is optional) */ }
    r.errors = Math.max(apiErrors ?? 0, (probes.errors?.() ?? 0) - e0);
    r.gpuMB = probes.gpuMB?.() ?? null;
    results.push(r); done.add(key);
    state.open = null; persist();
  }

  const report = buildReport({ spec, results, jobs, unknown, resumed, kills, stoppedEarly, tooMany, ms: Math.round(now() - t0), size: env.size?.() || null,
    peakMB: probes.peakMB?.() ?? null, when: env.when || new Date().toLocaleString() });
  state.state = stoppedEarly ? 'stopped' : 'done'; state.open = null; persist();
  env.onProgress?.({ at: jobs.length, total: jobs.length, finished: true, results, report });
  return report;
}

/** The report as data, with `text` (what the Copy button puts on the clipboard) and `summary`. */
export function buildReport({ spec = {}, results, jobs = [], unknown = [], resumed = false, kills = 0, stoppedEarly = false, tooMany = false, ms = 0, size = null, peakMB = null, when = '' }) {
  const withProblems = results.filter((r) => r.problems?.length);
  const failed = results.filter((r) => !r.ok && !r.lost);
  const lost = results.filter((r) => r.lost);
  const unsettled = results.filter((r) => r.ok && !r.settled);
  const busy = results.filter((r) => r.ok && r.busy && !r.problems?.length);
  const errored = results.filter((r) => r.errors > 0);
  const clean = results.filter((r) => r.ok && !r.lost && !r.problems?.length && !r.errors && r.settled);
  const errors = results.reduce((n, r) => n + (r.errors || 0), 0);
  const problemCount = withProblems.reduce((n, r) => n + r.problems.length, 0);
  const slowest = results.filter((r) => r.worstFrameMs > 0).sort((a, b) => b.worstFrameMs - a.worstFrameMs)[0] || null;
  const slowOpens = results.slice().sort((a, b) => b.ms - a.ms).slice(0, 3).filter((r) => r.ms > 0);
  const gpu = results.map((r) => r.gpuMB).filter((v) => typeof v === 'number');
  const summary = { specimens: new Set(results.map((r) => r.id)).size, opens: results.length, planned: jobs.length, clean: clean.length, withProblems: withProblems.length, problems: problemCount,
    failed: failed.length, lost: lost.length, unsettled: unsettled.length, errors, peakMB: peakMB ?? (gpu.length ? Math.max(...gpu) : null), slowestFrame: slowest ? { id: slowest.id, look: slowest.look, ms: slowest.worstFrameMs } : null };
  const lines = [];
  const looks = spec.looks?.length ? spec.looks.join(', ') : 'the page\'s look';
  lines.push(`Gallery sweep: ${summary.specimens} specimen${summary.specimens === 1 ? '' : 's'}, ${looks}${size ? `, screen ${size}` : ''}`);
  lines.push([when, `${Math.round(ms / 1000)} s`, resumed ? 'resumed after a reload' : ''].filter(Boolean).join(', '));
  if (spec.family) lines.push(`Family: ${spec.family}`);
  if (spec.section) lines.push(`Section: ${spec.section}`);
  lines.push('');
  if (!jobs.length) lines.push('Nothing to sweep: no specimen in the catalog matches this request.');
  const verdict = jobs.length > 0 && !withProblems.length && !failed.length && !lost.length && !errored.length && !unsettled.length && !stoppedEarly && !tooMany;
  lines.push(verdict ? `Every card fits on all ${summary.opens} open${summary.opens === 1 ? '' : 's'}: no problems, no errors, every specimen settled.`
    : `${withProblems.length} with fit problems (${problemCount} problem${problemCount === 1 ? '' : 's'}), ${failed.length} did not open, ${lost.length} lost to a reload, ${unsettled.length} did not settle, ${errored.length} with errors counted.`);
  if (stoppedEarly) lines.push(`Stopped early: ${results.length} of ${jobs.length} opens done.`);
  if (tooMany) lines.push(`Stopped after ${kills} reloads (the browser ended the tab): ${results.length} of ${jobs.length} opens done. The specimen that was open each time is listed below.`);
  if (unknown.length) lines.push(`Not in the catalog: ${unknown.join(', ')}`);
  if (typeof summary.peakMB === 'number') lines.push(`GPU memory: peak ${summary.peakMB.toFixed(0)} MB`);
  if (slowest) lines.push(`Slowest frame: ${slowest.worstFrameMs} ms at ${slowest.id}${slowest.look ? ` (${slowest.look})` : ''}`);
  if (slowOpens.length) lines.push(`Slowest to settle: ${slowOpens.map((r) => `${r.id} ${(r.ms / 1000).toFixed(1)} s`).join(', ')}`);
  const at = (r) => `${r.id}${r.look ? ` [${r.look}]` : ''}`;
  if (lost.length) lines.push('', 'Lost to a reload (open when the tab was ended):', ...lost.map((r) => `  - ${at(r)}`));
  if (failed.length) lines.push('', 'Did not open:', ...failed.map((r) => `  - ${at(r)}: ${r.error || 'no reason given'}`));
  if (unsettled.length) lines.push('', 'Did not settle in time (cards or camera still moving):', ...unsettled.map((r) => `  - ${at(r)} (${(r.ms / 1000).toFixed(1)} s)`));
  if (errored.length) lines.push('', 'Errors counted while open (pps.caught):', ...errored.map((r) => `  - ${at(r)}: ${r.errors}`));
  if (withProblems.length) {
    lines.push('', 'Fit problems:');
    for (const r of withProblems) {
      lines.push(`${at(r)}`);
      for (const p of r.problems) lines.push(`  - ${p.where ? `[${p.where}] ` : ''}${p.kind}: ${p.text}`);
    }
  }
  if (busy.length) lines.push('', `Taken while cards still moved (check these again by hand): ${busy.map(at).join(', ')}`);
  const run = sweepRun({ results, summary, spec, size, ms, stoppedEarly, tooMany, kills, unknown });
  return { summary, results, text: `${lines.join('\n')}\n\n${runBlock(run)}`, run, spec: { ...spec, fresh: false }, resumed, kills };
}
