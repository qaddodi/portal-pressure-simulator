// The Phone check (19 Nov 2026). Open /preview/?check on the phone and put it down: about three minutes later it shows ONE report and a Copy button.
// It does not open every card (that is the Sweep, about an hour). It walks the paths people take (journeys.js: view to view, Tests pane to pane, structure cards,
// the HVPG deck's slide 5 to 6, procedures, every deck's heaviest slides, one card of each family), on the test clock so the waiting between frames is skipped, and
// reads the GPU estimate, the live contexts and who grew after every step (walk-exec.js), runs the fit rules and the self-check rules at each stop, and keeps its
// place so a tab the browser ends is reported on the step it ended on (walk.js). Preview only: main.js loads the gallery page for ?check on the preview copy.
//
//   &steps=0          leave the every-step table out of the report (it is on by default)
//   ?check            the check (about 3 minutes; paths that would start after 200 s are dropped and named)
//   ?check=full       no time limit
//   &rate=8           test-clock speed (default 6; rate=1 is real pace)   &only=views,panes   just those paths (ids from journeys.js)   &fresh=1  forget a half-done run
import { registerPanel } from './registry.js';
import { buildJourneys, stepCount } from './journeys.js';
import { runWalk, savedWalk, forgetWalk, DEADLINE_MS } from './walk.js';
import { createExecutor, readDevice, judgeHere } from './walk-exec.js';
import { ENVELOPES, deviceClass } from '../gpu-budget.js';
import { errorTotal } from './api.js';
import { readMetric } from '../layout-snap.js';
import { keepAwake } from '../wake-lock.js';
import { RELEASE } from '../../version.js';
import { reportLines } from '../report.js';

export const DEFAULT_RATE = 6;

/** What the address asks for: null without `check`, else { full, rate, only: [ids], fresh }. Pure, for the tests. */
export function parseCheckAddress(search) {
  const q = new URLSearchParams(search || '');
  if (!q.has('check')) return null;
  const rate = Number(q.get('rate'));
  return {
    full: q.get('check') === 'full',
    rate: Number.isFinite(rate) && rate >= 1 ? Math.min(20, rate) : DEFAULT_RATE,
    only: (q.get('only') || '').split(',').map((s) => s.trim()).filter(Boolean),
    fresh: q.get('fresh') === '1',
    steps: q.get('steps') !== '0',
  };
}

/** The journeys a request names: all of them, or those whose id is, or starts with, one of `only`. Pure. */
export function pickJourneys(all, only = []) {
  return only.length ? all.filter((j) => only.some((o) => j.id === o || j.id.startsWith(`${o}-`))) : all;
}

const css = `
html[data-phonecheck] .gl-bar { display: none !important; }
.pc { position: fixed; z-index: var(--z-diag, 300); left: 8px; right: 8px; top: calc(env(safe-area-inset-top, 0px) + 8px); max-width: 560px; display: flex; flex-direction: column; gap: 6px; padding: 8px 10px; border-radius: 13px;
  background: var(--surface); color: var(--text); border: 1px solid var(--border-strong, var(--border)); box-shadow: 0 8px 28px -10px rgba(0,0,0,.45); /* colour-exempt: the debug page's own chrome */
  font: 600 13px/1.35 var(--font-ui, system-ui, -apple-system, sans-serif); }
.pc[hidden] { display: none; }
.pc small { font-weight: 500; color: var(--text-2, inherit); overflow-wrap: anywhere; }
.pc-bar { height: 5px; border-radius: 3px; background: var(--border); overflow: hidden; }
.pc-bar i { display: block; height: 100%; background: var(--danger); transform-origin: left center; transform: scaleX(0); }
.pc-row { display: flex; flex-wrap: wrap; gap: 6px; }
.pc button { font: inherit; min-height: 40px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--border-strong, var(--border)); background: transparent; color: inherit; cursor: pointer; }
.pc button.go { background: var(--danger); border-color: transparent; color: var(--text-inverse); }
.pc pre { margin: 0; padding: 8px; border-radius: 9px; background: var(--surface-2); max-height: 62vh; overflow: auto; font: 500 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
`;

function safeStorage() { try { return window.sessionStorage; } catch { return null; } }

function mount(host, ctx) {
  const addr = parseCheckAddress(location.search);
  if (!document.getElementById('pc-css')) { const st = document.createElement('style'); st.id = 'pc-css'; st.textContent = css; document.head.append(st); }
  const pps = ctx.pps;
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const box = mk('div', 'pc'); box.hidden = !addr && !savedWalk(safeStorage());
  const title = mk('div', '', 'Phone check'), line = mk('small', '', ''); line.setAttribute('role', 'status');
  const bar = mk('div', 'pc-bar'), fill = mk('i'); bar.append(fill);
  const pre = mk('pre'); pre.hidden = true;
  const go = mk('button', 'go', 'Run the phone check'), stop = mk('button', '', 'Stop'), copy = mk('button', '', 'Copy report');
  for (const b of [go, stop, copy]) b.type = 'button';
  stop.hidden = copy.hidden = true;
  const row = mk('div', 'pc-row'); row.append(go, stop, copy);
  box.append(title, line, bar, row, pre);
  document.body.append(box);
  // (The tools sheet of the gallery holds a plain entry too: a way to start it from there without the address.)
  const entry = mk('div', 'pc-entry'); const open = mk('button', '', 'Phone check'); open.type = 'button'; open.onclick = () => { box.hidden = false; };
  entry.append(open, mk('small', '', ' about 3 minutes, one report'));
  host.append(entry);
  if (addr) document.documentElement.setAttribute('data-phonecheck', '1');

  let current = null, stopFlag = false, last = null, resumeT = 0, gone = false;

  async function run(req = {}) {
    if (current) return current;
    stopFlag = false; box.hidden = false; pre.hidden = true; copy.hidden = true; stop.hidden = false; go.hidden = true; fill.style.transform = 'scaleX(0)';
    keepAwake(true);
    const rate = req.rate ?? DEFAULT_RATE;
    let clock = null;
    try { clock = await pps?.testClock?.({ rate }); } catch { clock = null; }   // (the test clock skips the waiting between frames; without it the check still runs, at real pace)
    const api = ctx.api || pps?.gallery;
    const journeys = pickJourneys(buildJourneys(), req.only);
    const total = stepCount(journeys);
    const env = ENVELOPES[deviceClass()];
    const exec = createExecutor({ pps, api });
    const w = `${readMetric(window, 'innerWidth')} x ${readMetric(window, 'innerHeight')}`;
    const io = {
      storage: safeStorage(), exec: exec.exec, read: readDevice, judge: () => judgeHere(pps, api), errors: () => errorTotal(pps), errorTags: () => { try { return pps?.caught?.() || {}; } catch { return {}; } },
      shouldStop: () => stopFlag,
      onProgress: (p) => {
        keepAwake(true);
        if (p.finished) return;
        const done = p.rows.length;
        title.textContent = `Phone check: ${p.journey.title}`;
        line.textContent = `Step ${done + 1} of ${total}: ${p.step.label}. ${readDevice().mb.toFixed(0)} of ${env.mb} MB held. ${Math.round(p.elapsed / 1000)} s.`;
        fill.style.transform = `scaleX(${total ? done / total : 0})`;
      },
    };
    const info = { steps: req.steps !== false, device: `${deviceClass()}, ${w} at ${window.devicePixelRatio || 1}x`, look: ctx.look?.(), build: RELEASE, rate: clock?.on ? rate : 0, lastSeen: [] };
    current = runWalk(journeys, io, { deadlineMs: req.full ? 0 : DEADLINE_MS, envelope: env, fresh: !!req.fresh, info }).then(async (report) => {
      try { info.lastSeen = reportLines().filter((l) => /last-seen/.test(l)); } catch { /* (no report yet) */ }
      if (info.lastSeen.length) report.text = report.text.replace(/\n\nNOT CHECKED HERE/, `\n  the page's own record: ${info.lastSeen.join('; ')}\n\nNOT CHECKED HERE`);
      last = report;
      fill.style.transform = 'scaleX(1)';
      const s = report.summary;
      title.textContent = s.killed || s.atLimit || s.failed || s.contexts ? 'Phone check: problems found' : 'Phone check: done';
      line.textContent = `${s.steps} steps in ${Math.round(s.ms / 1000)} s. Copy the report and paste it into the thread.`;
      pre.textContent = report.text; pre.hidden = false; copy.hidden = false;
      window.ppsPhoneCheck = report;
      // (A copy needs a tap in Safari and this run has outlived the one that started it: tried once; the button is there when it was refused.)
      if (await ctx.copy?.(report.text)) ctx.toast?.('Phone check report copied.');
      return report;
    }).catch((err) => { title.textContent = 'Phone check: failed'; line.textContent = String(err?.message || err); throw err; })
      .finally(async () => { current = null; stop.hidden = true; go.hidden = false; go.textContent = 'Run again'; keepAwake(false); if (clock?.on) { try { await pps.testClock(false); } catch { /* (the page is going away) */ } } });
    return current;
  }

  go.onclick = () => { forgetWalk(safeStorage()); run({ ...(addr || {}), rate: addr?.rate ?? DEFAULT_RATE, fresh: true }).catch(() => {}); };
  stop.onclick = () => { stopFlag = true; line.textContent = 'Stopping after this step.'; };
  copy.onclick = async () => { ctx.toast?.((await ctx.copy?.(last?.text || '')) ? 'Phone check report copied.' : 'Copy failed: select the report and copy it.'); };

  // Started by the address, or carried on after the browser ended the tab.
  const saved = savedWalk(safeStorage());
  if (addr || saved) {
    const start = () => { resumeT = 0; if (!gone && !current) run({ ...(addr || { rate: DEFAULT_RATE }), fresh: !!addr?.fresh && !saved }).catch(() => {}); };
    line.textContent = saved ? 'The page was reloaded in the middle of a check (the browser ended the tab). Going on.' : 'Starting when the figure is up.';
    title.textContent = 'Phone check';
    const arm = () => { resumeT = setTimeout(start, 800); };
    if (window.ppsFigureReady) arm(); else addEventListener('pps:figure-ready', arm, { once: true });
  }
  return () => { gone = true; clearTimeout(resumeT); stopFlag = true; keepAwake(false); box.remove(); };
}

registerPanel({ id: 'phone-check', title: 'Phone check', order: 30, mount });
