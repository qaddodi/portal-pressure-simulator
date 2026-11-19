// The Sweep button on the gallery page (faster-checks plan, step 4). One press opens every specimen in a scope (everything, a section, a family, or the
// specimens a push message linked to), runs the shared fit rules on each on the device in hand, and ends with one report to copy and paste into a thread.
// The person presses once and leaves the phone on the table: the screen is kept awake, and a tab the browser ends is resumed from the next specimen
// (sweep.js keeps the place in sessionStorage and reports the specimen that was open). Layout reads go through layout-snap.js, in the sweep's own task,
// never in a frame. Imported by the gallery page (plugins.js), never by the live app.
import { registerPanel } from './registry.js';
import { LOOK_IDS } from './catalog.js';
import { runSweep, savedSweep, forgetSweep, SWEEP_KEY } from './sweep.js';
import { devicePps } from './sweep-probes.js';
import { readMetric } from '../layout-snap.js';
import { fadeShown } from '../util.js';
import { keepAwake } from '../wake-lock.js';

const LOOK_NAMES = { light: 'Light', soft: 'Soft', dark: 'Dark', navy: 'Navy', black: 'Black' };
const MAX_RESUMES = 6;

/** The specimen ids a link names: `?ids=a,b` or `?sweep=ids:a,b`. Pure, for the tests. */
export function linkIds(search) {
  const q = new URLSearchParams(search || '');
  const raw = q.get('ids') || ((q.get('sweep') || '').startsWith('ids:') ? q.get('sweep').slice(4) : '');
  return [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))];
}

/** The scope menu's choices from a specimen list: everything, each section, each family, and the link's own ids. */
export function scopeChoices(list, ids = []) {
  const sections = [...new Set(list.map((e) => e.section))], families = [...new Set(list.map((e) => e.family))];
  const count = (f) => list.filter(f).length;
  const out = [];
  if (ids.length) out.push({ value: 'ids', group: 'From the link', label: `The ${ids.length} specimen${ids.length === 1 ? '' : 's'} this link names`, spec: { ids } });
  out.push({ value: 'all', group: 'Everything', label: `Every specimen (${list.length})`, spec: {} });
  for (const s of sections) out.push({ value: `section:${s}`, group: 'Sections', label: `${s} (${count((e) => e.section === s)})`, spec: { section: s } });
  for (const f of families) out.push({ value: `family:${f}`, group: 'Families', label: `${f} (${count((e) => e.family === f)})`, spec: { family: f } });
  return out;
}

const css = `
.swp { display: flex; flex-direction: column; gap: 8px; font: 500 13px/1.35 var(--font-ui, system-ui, sans-serif); color: var(--text, inherit); }
.swp-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.swp button, .swp select { font: inherit; font-weight: 600; min-height: 36px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); color: inherit; cursor: pointer; }
.swp select { max-width: 100%; font-weight: 500; }
.swp button.go { background: var(--danger); border-color: transparent; color: var(--text-inverse); }
.swp button[aria-pressed="true"] { background: var(--text, currentColor); color: var(--surface); border-color: transparent; }
.swp [hidden] { display: none !important; }
.swp-status { color: var(--text-2, inherit); overflow-wrap: anywhere; }
.swp-bar { height: 6px; border-radius: 3px; background: var(--border); overflow: hidden; }
.swp-bar i { display: block; height: 100%; width: 100%; background: var(--danger); transform-origin: left center; transform: scaleX(0); }
.swp-pre { margin: 0; padding: 8px; border-radius: 9px; background: var(--surface-2); max-height: 36vh; overflow: auto; font: 500 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
`;

function mount(host, ctx) {
  if (!document.getElementById('swp-css')) { const st = document.createElement('style'); st.id = 'swp-css'; st.textContent = css; document.head.append(st); }
  const pps = ctx.pps;
  const box = document.createElement('div'); box.className = 'swp';
  const scopeSel = document.createElement('select'); scopeSel.setAttribute('aria-label', 'What to sweep');
  const looksRow = document.createElement('div'); looksRow.className = 'swp-row';
  const looksNote = document.createElement('span'); looksNote.className = 'swp-status'; looksNote.textContent = 'Looks:';
  const picked = new Set();
  const lookBtns = LOOK_IDS.map((id) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = LOOK_NAMES[id] || id; b.dataset.look = id; b.setAttribute('aria-pressed', 'false');
    b.onclick = () => { if (picked.has(id)) picked.delete(id); else picked.add(id); b.setAttribute('aria-pressed', String(picked.has(id))); sayLooks(); };
    return b;
  });
  const sayLooks = () => { looksNote.textContent = picked.size ? `Looks: ${[...picked].map((l) => LOOK_NAMES[l] || l).join(', ')}` : 'Looks: none picked, so the current look only'; };
  sayLooks();
  looksRow.append(looksNote, ...lookBtns);
  const go = document.createElement('button'), stop = document.createElement('button'), copy = document.createElement('button');
  go.className = 'go'; go.type = 'button'; go.textContent = 'Sweep';
  stop.type = 'button'; stop.textContent = 'Stop'; copy.type = 'button'; copy.textContent = 'Copy report';
  stop.hidden = copy.hidden = true;   // (off-screen until used: shown with fadeShown, never popped)
  const act = document.createElement('div'); act.className = 'swp-row'; act.append(go, stop, copy);
  const status = document.createElement('div'); status.className = 'swp-status'; status.setAttribute('role', 'status');
  const bar = document.createElement('div'), fill = document.createElement('i'); bar.className = 'swp-bar'; bar.append(fill); bar.hidden = true;
  const pre = document.createElement('pre'); pre.className = 'swp-pre'; pre.hidden = true;
  box.append(scopeSel, looksRow, act, status, bar, pre);
  host.append(box);

  const getApi = () => ctx.api || pps?.gallery;   // (api.js: list, open, check ...; page.js makes it before the panels mount)
  const ids = linkIds(location.search);
  const fillScope = () => {
    const choices = scopeChoices(getApi().list({}), ids);
    scopeSel.replaceChildren();
    let group = null, og = null;
    for (const c of choices) {
      if (c.group !== group) { group = c.group; og = document.createElement('optgroup'); og.label = group; scopeSel.append(og); }
      const o = document.createElement('option'); o.value = c.value; o.textContent = c.label; og.append(o);
    }
    return choices;
  };
  let choices = fillScope();
  if (ids.length) scopeSel.value = 'ids';

  let current = null, stopFlag = false, last = null;
  const show = (el, on) => fadeShown(el, on);

  /** The one runner, for the button, for a resume and for pps.gallery.sweep (registered below). */
  function run(spec, api = getApi()) {
    if (current) return current;
    stopFlag = false;
    show(stop, true); show(copy, false); show(pre, false); show(bar, true); go.disabled = true;
    keepAwake(true);
    const env = {
      storage: safeStorage(),
      probes: devicePps(pps),
      size: () => `${readMetric(window, 'innerWidth')} x ${readMetric(window, 'innerHeight')}`,
      shouldStop: () => stopFlag,
      onProgress: (p) => {
        keepAwake(true);   // (a talk stopping between specimens lets the lock go: asked again each time, which is safe)
        if (p.finished) return;
        status.textContent = `${p.at + 1} of ${p.total}: ${p.id}${p.look ? ` (${LOOK_NAMES[p.look] || p.look})` : ''}`;
        fill.style.transform = `scaleX(${p.total ? p.at / p.total : 0})`;
      },
    };
    current = runSweep(spec, api, env).then(async (report) => {
      last = report;
      fill.style.transform = 'scaleX(1)';
      pre.textContent = report.text; show(pre, true); show(copy, true);
      status.textContent = report.summary.withProblems || report.summary.failed || report.summary.lost || report.summary.errors || report.summary.unsettled
        ? `Done: ${report.summary.withProblems} with fit problems, ${report.summary.failed} did not open, ${report.summary.lost} lost to a reload, ${report.summary.errors} errors. Copy the report below.`
        : `Done: every card fits (${report.summary.opens} opens). Copy the report below.`;
      // (A copy needs a tap in Safari and a long sweep has outlived the one that started it: tried once, and the button is there if it was refused.)
      if (await ctx.copy?.(report.text)) ctx.toast?.('Sweep report copied.');
      return report;
    }).catch((err) => {
      status.textContent = `The sweep failed: ${err?.message || err}`;
      throw err;
    }).finally(() => {
      current = null; go.disabled = false; show(stop, false); show(bar, false); keepAwake(false);
    });
    return current;
  }

  go.onclick = () => {
    const c = choices.find((x) => x.value === scopeSel.value) || choices[0];
    run({ ...c.spec, looks: [...picked], fresh: true }).catch(() => {});
  };
  stop.onclick = () => { stopFlag = true; status.textContent = 'Stopping after this specimen.'; };
  copy.onclick = async () => { ctx.toast?.((await ctx.copy?.(last?.text || '')) ? 'Sweep report copied.' : 'Copy failed: select the report and copy it.'); };

  // The page starts a sweep from the address (?gallery&sweep=..., api.js startFromAddress) through pps.gallery.sweep(spec): it runs through this same runner, so its progress shows here too.
  const register = () => { try { getApi()?.registerSweep?.((spec, api) => run(spec, api || getApi())); } catch (e) { console.error('[gallery] sweep register', e); } };   // alloc-rare: once at mount
  register();

  // A sweep left running by a reload (the browser ended the tab) goes on from the next specimen, a few times at most.
  let resumeTimer = 0;
  const saved = savedSweep(safeStorage());
  if (saved && (saved.resumes || 0) < MAX_RESUMES) {
    const start = () => { register(); choices = fillScope(); if (!current) run(saved.spec).catch(() => {}); };
    status.textContent = `A sweep was running when the page reloaded (${saved.results?.length || 0} of ${saved.total}). Going on from the next specimen.`;
    const arm = () => { resumeTimer = setTimeout(start, 600); };
    if (window.ppsFigureReady) arm(); else addEventListener('pps:figure-ready', arm, { once: true });
  } else if (saved) { forgetSweep(safeStorage()); status.textContent = 'An earlier sweep kept reloading the page and was dropped.'; }

  return () => { clearTimeout(resumeTimer); stopFlag = true; keepAwake(false); };
}

function safeStorage() { try { return window.sessionStorage; } catch { return null; } }

registerPanel({ id: 'sweep', title: 'Sweep', order: 35, mount });
export { SWEEP_KEY };
