// buildScreen(env): the screen report, a pure function of the page it is handed (store, the painters' records, the DOM through `io`). It runs the registered
// readers in order, each into its own part, then the rules over the result. Synchronous, no pixels, no GL read-back, no timers: the same call serves the
// device (pps.screen), the layout-only headless run and node (jsdom plus the GL stand-in).
//
//   buildScreen({ pps, io, doc, win, detail, only, rules, history, ...more })  ->  { v: 1, detail, <part id>: part, ..., errors?, findings? }
//     detail   'summary' (default) or 'full'
//     only     a part id or a list of ids: read just those (page is always read)
//     rules    false: skip the rules; an id or a list: run just those (default: every 'state' rule)
//     history  the recorder's frames, run through the 'series' rules when given
//     more     passed on to the readers in ctx.env (minPx ...)
//   A reader that throws is counted (caught) and named in report.errors; the other parts still come. A part is left out when its reader returns null.
//
// stableReport(report) drops the volatile parts (times, memory, frame counts) and the findings' times: two runs of one state then compare equal.
import './plugins.js';
import '../selfcheck/plugins.js';
import { readerList } from './registry.js';
import { runRules } from '../selfcheck/rules.js';
import { caught } from '../caught.js';

export const SCREEN_VERSION = 1;
const NO_IO = { box: () => null, rects: () => [], style: () => ({}), metric: () => 0, ctm: () => null };

const asList = (v) => (v == null ? null : Array.isArray(v) ? v : [v]);

export function buildScreen(opts = {}) {
  const { pps = (typeof window !== 'undefined' ? window.pps : {}), io = NO_IO, doc = typeof document !== 'undefined' ? document : null, win = typeof window !== 'undefined' ? window : null, history, rules } = opts;
  const detail = opts.detail === 'full' ? 'full' : 'summary';
  const only = asList(opts.only);
  const env = { ...opts, detail };
  delete env.pps; delete env.io; delete env.doc; delete env.win;
  const report = { v: SCREEN_VERSION, detail };
  const parts = {}, errors = {};
  const ctx = { pps, io, doc, win, env, detail, parts };
  for (const r of readerList()) {
    if (only && r.id !== 'page' && !only.includes(r.id)) continue;
    try {
      const part = r.read(ctx);
      if (part != null) { parts[r.id] = part; report[r.id] = part; }
    } catch (e) {
      errors[r.id] = String(e?.message || e);
      try { caught(`screen:${r.id}`, e); } catch { /* (the counter is not there in some test rigs) */ }
    }
  }
  if (Object.keys(errors).length) report.errors = errors;
  if (rules !== false) {
    const found = runRules(report, { only: Array.isArray(rules) || typeof rules === 'string' ? rules : undefined, kinds: history ? undefined : ['state'], history, env });
    report.findings = found;
  }
  return report;
}

/** The report without what changes between two runs of one state (volatile parts, times in findings). Plain JSON. */
export function stableReport(report) {
  const vol = new Set(readerList().filter((r) => r.volatile).map((r) => r.id));
  const out = {};
  for (const [k, v] of Object.entries(report)) {
    if (vol.has(k)) continue;
    out[k] = k === 'findings' ? v.map((f) => { const g = { ...f }; delete g.at; return g; }) : v;
  }
  return out;
}
