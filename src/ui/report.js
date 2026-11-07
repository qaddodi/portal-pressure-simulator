// What a device report carries (PR-03, production-readiness review 4 Nov 2026). After boot nothing used to notice an error, a lost
// WebGL context or an iOS memory kill that reloaded the page, so "it crashed and reloaded" could only be guessed at from code. This keeps
// a ring of the last 20 events in sessionStorage (it survives a reload, not a closed tab), counts reloads in localStorage, and hands both
// to the Send feedback draft as plain lines the person reads and sends themselves. Nothing leaves the device (docs/PRIVACY.md holds).
// No drawing here: it is bookkeeping, GPU-neutral.
//
//   ring     error, unhandledrejection, context lost / restored, over-budget, with time, view and GPU memory at the time.
//   alive    sessionStorage 'pps.alive' is set at boot and cleared on pagehide. A boot that finds it still set means the last page of this tab
//            ended without unloading, which on iOS is the memory kill: 'pps.reloads' (localStorage) goes up and the ring says so.
import { caught } from './caught.js';
import { overBudget, contextCount, deviceClass } from './gpu-budget.js';

const RING_KEY = 'pps.ring', ALIVE_KEY = 'pps.alive', RELOADS_KEY = 'pps.reloads', MAX = 20;
let ring = [], where = () => '', t0 = 0, lost = 0, errors = 0, wasKilled = false;

const store = (kind) => { try { return kind === 'local' ? localStorage : sessionStorage; } catch { return null; } };   // (blocked storage: the report is then in memory only)
const read = (kind, k) => { try { return store(kind)?.getItem(k) ?? null; } catch { return null; } };
const write = (kind, k, v) => { try { store(kind)?.setItem(k, v); } catch (e) { caught('report:write', e); /* storage full or blocked */ } };
const flush = () => write('session', RING_KEY, JSON.stringify(ring));

/** Adds one event to the ring. `what`: a short kind ('error', 'rejection', 'ctx-lost', 'ctx-back', 'over-budget', 'reload'); `msg`: its text. */
export function note(what, msg = '') {
  let view = '';
  try { view = where() || ''; } catch { /* a view name is a nicety */ }
  let ctx = '';
  try { const c = contextCount(); ctx = `${c.own}+${c.charts}`; } catch { /* the registry is not up yet */ }
  ring.push({ t: Math.round(((typeof performance !== 'undefined' ? performance.now() : 0) - t0) / 1000), what, msg: String(msg).slice(0, 160), view: String(view).slice(0, 80), ctx, over: overBudget() ? 1 : 0 });
  if (ring.length > MAX) ring.splice(0, ring.length - MAX);
  flush();
}

/** Starts the report: listeners, the ring from the page before (after a reload), the heartbeat. `getWhere`: () => the current view / slide as text. */
export function startReport(getWhere) {
  if (typeof window === 'undefined') return;
  where = getWhere || where;
  t0 = performance.now();
  try { ring = JSON.parse(read('session', RING_KEY) || '[]'); if (!Array.isArray(ring)) ring = []; } catch { ring = []; }
  if (read('session', ALIVE_KEY) === '1') {
    wasKilled = true;
    write('local', RELOADS_KEY, String((+read('local', RELOADS_KEY) || 0) + 1));
    note('reload', 'the last page of this tab ended without unloading (a memory kill on iOS)');
  }
  write('session', ALIVE_KEY, '1');
  addEventListener('error', (e) => { errors++; caught('window:error', e.error || e.message); note('error', `${e.message || ''} ${e.filename ? e.filename.split('/').pop() : ''}:${e.lineno || 0}`); });
  addEventListener('unhandledrejection', (e) => { errors++; caught('window:rejection', e.reason); note('rejection', e.reason?.message ?? e.reason); });
  // (WebGL context events do not bubble; the capture phase on window sees every canvas's, whichever renderer owns it.)
  addEventListener('webglcontextlost', (e) => { lost++; note('ctx-lost', e.target?.id || e.target?.className || e.target?.tagName || ''); }, true);
  addEventListener('webglcontextrestored', (e) => note('ctx-back', e.target?.id || e.target?.className || e.target?.tagName || ''), true);
  const end = () => { flush(); write('session', ALIVE_KEY, ''); };
  addEventListener('pagehide', end);
  addEventListener('pageshow', () => write('session', ALIVE_KEY, '1'));   // (back from the page cache: this page is alive again)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.pps = window.pps || {}; window.pps.report = reportLines;
}

/** The report as lines for the feedback draft. Never throws. */
export function reportLines() {
  const out = [];
  try {
    const reloads = +read('local', RELOADS_KEY) || 0;
    out.push(`Device class: ${deviceClass()}; reloads counted on this device: ${reloads}${wasKilled ? ' (this page followed one)' : ''}; errors this page: ${errors}; contexts lost this page: ${lost}`);
    if (ring.length) {
      out.push('Recent events (seconds since this page opened; view; live contexts own+charts; over budget):');
      for (const r of ring) out.push(`  ${r.t}s ${r.what}${r.msg ? ' ' + r.msg : ''}${r.view ? ' @ ' + r.view : ''} [${r.ctx}${r.over ? ', over budget' : ''}]`);
    }
  } catch (e) { caught('report:lines', e); /* a measuring aid only */ }
  return out;
}
