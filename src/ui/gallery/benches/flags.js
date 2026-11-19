// Diagnostics switches bench (card gallery, plan 1.5 and 2.8): every diagnostic address flag the app reads, as a labelled toggle that reloads the
// page with the flag set or cleared (the page's own ?gallery and any other parameter are kept, with the hash), and under them the copyable reports
// the app puts on window.pps (hud, report, budget, perf, surfaces, contexts ...), the app's counted errors (pps.caught, caught.js) and the boot
// errors (window.ppsBootErrors, index.html). The pure parts (FLAGS, flagState, withFlag, otherParams, reportsAvailable, formatReport) have no DOM
// and are tested in node (tests/gallery-bench-flags.test.js); mount is the DOM part. Nothing here runs in a frame and no timer is started.
//
// The table, the address functions and where each flag works live in src/ui/flags.js (the one place an address is read); this bench shows them.
import { benchRoot, h, statusLine, ppsOf, copyButton } from './ui.js';
import { caughtNow } from '../../caught.js';

import { FLAGS, flagState, otherParams, flagText, withFlag, validValue, flagOn } from '../../flags.js';
export { FLAGS, flagState, otherParams, flagText, withFlag, validValue };   // (the table and the address functions moved to src/ui/flags.js, the one place an address is read)

// ---- the copyable reports on window.pps ----
const fn = (k) => (p) => typeof p?.[k] === 'function';
/** Reports: id, the button's label, whether pps has it, and how to read it (a value formatReport turns into text). */
export const REPORTS = Object.freeze([
  { id: 'hud', label: 'Frame panel (pps.hud)', has: fn('hud'), read: (p) => p.hud() },
  { id: 'report', label: 'Device report (pps.report)', has: fn('report'), read: (p) => p.report() },
  { id: 'budget', label: 'GPU budget (pps.budget)', has: fn('budget'), read: (p) => p.budget() },
  { id: 'perf', label: 'Frame counts (pps.perf)', has: (p) => !!p && 'perf' in p, read: (p) => { const o = p.perf || {}, rest = {}; for (const k of Object.keys(o)) if (k !== 'frames' && k !== 'inputToPaint') rest[k] = o[k]; return rest; } },   // (the recording and the input tracker are left out: large, and a getter that starts the tracker)
  { id: 'inputs', label: 'Input to paint (pps.perf.inputToPaint)', has: (p) => !!p && 'perf' in p && (flagOn('perf') || flagOn('inputs')), read: (p) => { const t = p.perf?.inputToPaint; return t ? { summary: t.summary?.(), slowest: t.slowest?.() } : null; } },
  { id: 'surfaces', label: 'Surfaces (pps.surfaces)', has: fn('surfaces'), read: (p) => p.surfaces() },
  { id: 'contexts', label: 'WebGL contexts (pps.contexts)', has: fn('contexts'), read: (p) => p.contexts() },
  { id: 'tiers', label: 'Quality tiers (pps.tiers)', has: fn('tiers'), read: (p) => p.tiers() },
  { id: 'motion', label: 'Motion budget (pps.motionBudget)', has: (p) => typeof p?.motionBudget?.totals === 'function', read: (p) => p.motionBudget.totals() },
  { id: 'layout', label: 'Layout reads (pps.layoutReads)', has: fn('layoutReads'), read: (p) => p.layoutReads() },
  { id: 'glass', label: 'Glass writes (pps.glassWhy)', has: fn('glassWhy'), read: (p) => p.glassWhy() },
  { id: 'blurs', label: 'Blurs (pps.blurs)', has: fn('blurs'), read: (p) => p.blurs() },
]);

/** The ids of the reports this pps has (the buttons to show). A pps of null has none. */
export const reportsAvailable = (pps) => REPORTS.filter((r) => { try { return r.has(pps); } catch { return false; } }).map((r) => r.id);   // alloc-rare: a bench opening

/** A report value as text: a string as it is, an array of strings one per line, anything else as indented JSON (cycles and functions named, never thrown). Cut at `cap` characters. */
export function formatReport(v, cap = 200000) {
  let t;
  if (typeof v === 'string') t = v;
  else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) t = v.join('\n');
  else if (v === undefined) t = '(nothing)';
  else {
    const seen = new WeakSet();
    try {
      t = JSON.stringify(v, (k, x) => {
        if (typeof x === 'function') return `[function ${x.name || ''}]`;
        if (typeof x === 'bigint') return String(x);
        if (x && typeof x === 'object') { if (seen.has(x)) return '[circular]'; seen.add(x); }
        return x;
      }, 2) ?? String(v);
    } catch (err) { t = `(could not be written as text: ${err?.message || err})`; }
  }
  return t.length > cap ? `${t.slice(0, cap)}\n… cut at ${cap} characters (${t.length} in all)` : t;
}

/** The counted errors as lines, most caught first: "tag  ×n  last message". */
export function caughtLines(c) {
  const rows = Object.entries(c || {}).map(([tag, r]) => ({ tag, n: r?.n ?? 0, last: r?.last ?? '' })).sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag));
  return rows.map((r) => `${r.tag}  ×${r.n}  ${String(r.last).slice(0, 200)}`);
}

export default {
  id: 'flags',
  title: 'Diagnostics switches',
  mount(host, ctx) {
    const pps = ppsOf(ctx);
    const win = globalThis.window ?? globalThis;
    const loc = win.location;
    benchRoot(host, 'Diagnostics switches', 'Each switch reloads the page with that address flag set or cleared. The gallery and every other parameter stay; the preview keeps its own address. The reports below read what the app already keeps.');
    const say = statusLine();
    let gone = false;
    const search = () => (loc ? loc.search + loc.hash : '');
    const state = flagState(search());

    function go(flag, value) {
      if (gone || !loc) return;
      say.set('Reloading with the new address...', 'warn');
      loc.assign(loc.pathname + withFlag(search(), flag, value));
    }

    // ---- the toggles ----
    const toggles = h('div', null);
    for (const group of ['Measure', 'Compare']) {
      toggles.append(h('h3', null, group === 'Measure' ? 'Measuring aids' : 'Comparing switches (A/B)'));
      const grid = h('div', { class: 'gb-grid' });
      for (const f of FLAGS.filter((x) => x.group === group)) {
        const st = state[f.id];
        const label = flagText(f.id, st.on && st.value != null && st.value !== '' && f.kind !== 'fixed' ? st.value : undefined);
        const input = f.kind === 'value' || f.kind === 'bare-or-value'
          ? h('input', { type: 'text', size: 5, value: st.on && st.value ? st.value : f.def, 'aria-label': `Value for ${f.id}`, inputmode: 'decimal' })
          : null;
        const btn = h('button', { type: 'button', 'aria-pressed': String(st.on), title: f.meaning, onclick: () => go(f.id, st.on ? false : (input && validValue(f.id, input.value) ? input.value : true)) }, `?${label}`);
        grid.append(h('div', { class: 'gb-row' }, btn, input, h('span', { class: 'gb-note' }, `${st.on ? 'On. ' : ''}${f.meaning}`)));
      }
      toggles.append(grid);
    }
    const others = otherParams(search());
    toggles.append(h('p', { class: 'gb-note' }, others.length ? `Kept in the address: ${others.map((o) => `?${o}`).join(' ')}` : 'No other parameters in the address.'));
    host.append(toggles, say);

    // ---- the reports ----
    host.append(h('h3', null, 'Reports'));
    const out = h('pre', { 'aria-live': 'polite' }, 'Pick a report.');
    const shown = h('span', { class: 'gb-note' }, '');
    const bar = h('div', { class: 'gb-row' });
    const have = reportsAvailable(pps);
    for (const r of REPORTS.filter((x) => have.includes(x.id))) {
      bar.append(h('button', { type: 'button', onclick: () => show(r.label, () => r.read(pps)) }, r.label));
    }
    if (!have.length) bar.append(h('span', { class: 'gb-note' }, 'The app has put no reports on window.pps yet. ?perf adds the frame panel and surfaces.'));
    function show(label, read) {
      let text;
      try { text = formatReport(read()); } catch (err) { text = `(could not read: ${err?.message || err})`; }
      out.textContent = text; shown.textContent = label;
    }
    // The errors: what the app counted (pps.caught, else caught.js itself) and what the page caught before the app started (index.html).
    const caughtRead = () => { const c = typeof pps?.caught === 'function' ? pps.caught() : caughtNow(); const lines = caughtLines(c); return lines.length ? lines.join('\n') : 'Nothing caught since the page opened.'; };
    const bootRead = () => { const b = win.ppsBootErrors; return Array.isArray(b) && b.length ? b.join('\n') : 'No boot errors.'; };
    bar.append(
      h('button', { type: 'button', onclick: () => show('Caught errors (pps.caught)', caughtRead) }, 'Caught errors'),
      h('button', { type: 'button', onclick: () => show('Boot errors (window.ppsBootErrors)', bootRead) }, 'Boot errors'),
    );
    host.append(bar, h('div', { class: 'gb-row' }, copyButton('Copy', () => `${shown.textContent}\n${out.textContent}`, (m, t) => say.set(m, t), ctx), shown), out);
    show('Caught errors (pps.caught)', caughtRead);

    return () => { gone = true; };   // (no timers or listeners outside the host's own buttons, which the page removes with the host)
  },
};
