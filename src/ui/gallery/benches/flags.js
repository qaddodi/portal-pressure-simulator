// Diagnostics switches bench (card gallery, plan 1.5 and 2.8): every diagnostic address flag the app reads, as a labelled toggle that reloads the
// page with the flag set or cleared (the page's own ?gallery and any other parameter are kept, with the hash), and under them the copyable reports
// the app puts on window.pps (hud, report, budget, perf, surfaces, contexts ...), the app's counted errors (pps.caught, caught.js) and the boot
// errors (window.ppsBootErrors, index.html). The pure parts (FLAGS, flagState, withFlag, otherParams, reportsAvailable, formatReport) have no DOM
// and are tested in node (tests/gallery-bench-flags.test.js); mount is the DOM part. Nothing here runs in a frame and no timer is started.
//
// Where each flag is read in the app (the meaning is the comment next to the read):
//   ?perf          frame.js, main.js, motion-budget.js, glass-gl.js, layout-snap.js, caught.js, gpu-budget.js (the readout and the frame panel)
//   ?fps=N         frame.js (frames asked for every refresh, every overrun logged)
//   ?offgpu=1      main.js, offgpu-overlay.js, glass-gl.js, layout-snap.js
//   ?watch         main.js, watch/start.js
//   ?budget=1      motion-budget.js
//   ?lap           main.js, lap.js, frame.js
//   ?inputs        frame.js
//   ?testclock[=N] test-boot.js
//   ?rest=off      frame.js            ?scene=dom, ?scenecheck   scene-store.js     ?swblur=1   blur-guard.js
//   ?stageover=gpu stage.js            ?gpuorgans=force         gpu-probe.js        ?lumen=off, ?lumenscale=N   tube-stage2.js
import { benchRoot, h, statusLine, ppsOf, copyButton } from './ui.js';
import { caughtNow } from '../../caught.js';

/**
 * The diagnostic flags. kind: 'bare' (on when present, as ?perf), 'fixed' (on only with that value, as ?offgpu=1), 'value' (on with a valid value,
 * as ?fps=120) or 'bare-or-value' (?testclock or ?testclock=4). `on` is the form a toggle writes; `valid` judges a typed value.
 */
export const FLAGS = Object.freeze([
  { id: 'perf', group: 'Measure', kind: 'bare', meaning: 'The frame panel and the lag readout after a pan or pinch (frame-hud.js, perf-readout.js); also counts GL budget sites, layout reads and caught errors in the console.' },
  { id: 'fps', group: 'Measure', kind: 'value', def: '120', valid: /^\d+$/, meaning: 'Frames asked for every refresh while the page shows, and every overrun written to the console with its surfaces. It keeps the page drawing.' },
  { id: 'offgpu', group: 'Measure', kind: 'fixed', fixed: '1', meaning: 'A live count of work that is not on the GPU, per frame, flashing red when any happens while something moves.' },
  { id: 'watch', group: 'Measure', kind: 'bare', meaning: 'The motion recorder (preview copy or a local run): keeps 20 seconds of camera, label and card numbers, judges them with the motion rules and shows a red dot with the findings (src/ui/watch, docs/watch.md).' },
  { id: 'budget', group: 'Measure', kind: 'fixed', fixed: '1', meaning: 'Counts the motion budget only, with no readout, for a run that reads pps.motionBudget.' },
  { id: 'lap', group: 'Measure', kind: 'bare', meaning: 'The device lap: a fixed route of about 90 seconds the page drives itself and writes up as one block of text to paste back.' },
  { id: 'inputs', group: 'Measure', kind: 'bare', meaning: 'Starts the input-to-paint tracker at load (tap, press or key to the first changed frame, last 200 inputs).' },
  { id: 'testclock', group: 'Measure', kind: 'bare-or-value', def: '1', valid: /^\d+(\.\d+)?$/, meaning: 'Starts the page on the test clock before any other module reads the time (the number is the rate; none means the default).' },
  { id: 'rest', group: 'Compare', kind: 'fixed', fixed: 'off', meaning: 'Turns the rest pacing off (frames at a lower rate when nothing moves), for comparing.' },
  { id: 'scene', group: 'Compare', kind: 'fixed', fixed: 'dom', meaning: 'Turns the page\'s own layout engine off, so every element is asked of the browser.' },
  { id: 'scenecheck', group: 'Compare', kind: 'bare', meaning: 'Compares every answer of the page\'s own layout engine with the browser\'s and logs a difference.' },
  { id: 'swblur', group: 'Compare', kind: 'fixed', fixed: '1', meaning: 'Leaves the blur effect on a software renderer (it is dropped by default there).' },
  { id: 'stageover', group: 'Compare', kind: 'fixed', fixed: 'gpu', meaning: 'Draws the figure\'s overlays on the GPU (off by default; on a software renderer only when asked for).' },
  { id: 'gpuorgans', group: 'Compare', kind: 'fixed', fixed: 'force', meaning: 'Organs on the GPU on the software renderer too, for the browser check of the plate layers.' },
  { id: 'lumen', group: 'Compare', kind: 'fixed', fixed: 'off', meaning: 'No lumen pass and no blood drawn by the Tube renderer (a device A/B that proves or clears the lumen pass).' },
  { id: 'lumenscale', group: 'Compare', kind: 'value', def: '0.5', valid: /^(0?\.\d+|1(\.0+)?)$/, meaning: 'The lumen layer\'s size as a share of the vessel layer (0.25 to 1) for every instance.' },
]);

const byId = new Map(FLAGS.map((f) => [f.id, f]));

const dec = (s) => { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; } };
/** Splits an address tail ('?a&b=1#x', the search with or without its hash) into { items: [{ key, value|null, raw }], hash }. */
function parse(search) {
  let s = String(search ?? ''), hash = '';
  const at = s.indexOf('#');
  if (at >= 0) { hash = s.slice(at); s = s.slice(0, at); }
  if (s.startsWith('?')) s = s.slice(1);
  const items = [];
  for (const raw of s.split('&')) {
    if (!raw) continue;
    const eq = raw.indexOf('=');
    items.push({ key: dec(eq < 0 ? raw : raw.slice(0, eq)), value: eq < 0 ? null : dec(raw.slice(eq + 1)), raw });
  }
  return { items, hash };
}
const build = (items, hash) => (items.length ? `?${items.map((i) => i.raw).join('&')}` : '') + hash;

function isOn(flag, value) {
  switch (flag.kind) {
    case 'bare': return true;
    case 'fixed': return value === flag.fixed;
    case 'value': return value != null && flag.valid.test(value);
    case 'bare-or-value': return value == null || value === '' || flag.valid.test(value);
    default: return false;
  }
}

/** Which flags an address has: { perf: { on, value }, ... } for every flag of FLAGS (value is the text after "=", or null for a bare one). */
export function flagState(search) {
  const { items } = parse(search);
  const out = {};
  for (const f of FLAGS) {
    const it = items.find((i) => i.key === f.id);
    out[f.id] = it ? { on: isOn(f, it.value), value: it.value } : { on: false, value: null };
  }
  return out;
}

/** The parameters of an address that are not diagnostic flags of FLAGS (?gallery, ?preset=... and the like), as their text. */
export function otherParams(search) {
  return parse(search).items.filter((i) => !byId.has(i.key)).map((i) => i.raw);
}

/** The text a toggle writes for a flag: 'perf', 'offgpu=1', 'fps=120'. A value (string or number) replaces the default. */
export function flagText(flag, value) {
  const f = byId.get(flag);
  const v = value === true || value == null ? undefined : String(value);
  if (v !== undefined) return v === '' ? flag : `${flag}=${encodeURIComponent(v)}`;
  if (!f) return flag;
  if (f.kind === 'fixed') return `${flag}=${f.fixed}`;
  if (f.kind === 'value') return `${flag}=${f.def}`;
  return flag;   // bare, and testclock with no rate
}

/**
 * The address tail (search plus hash) with a flag set or cleared. value: false/null clears it (every copy), true writes its own form (?perf,
 * ?offgpu=1, ?fps=120), a string or number writes flag=value. Every other parameter keeps its text and its place, the flag keeps its place
 * when it was there and goes last when it was not, and the hash is kept. '' when nothing is left.
 */
export function withFlag(search, flag, value) {
  const { items, hash } = parse(search);
  const key = String(flag);
  if (value === false || value == null) return build(items.filter((i) => i.key !== key), hash);
  const raw = flagText(key, value);
  const eq = raw.indexOf('=');
  const made = { key, value: eq < 0 ? null : dec(raw.slice(eq + 1)), raw };
  const at = items.findIndex((i) => i.key === key);
  const next = [];
  items.forEach((i, n) => { if (i.key !== key) next.push(i); else if (n === at) next.push(made); });
  if (at < 0) next.push(made);
  return build(next, hash);
}

/** Whether a typed value is fine for a flag that takes one. */
export const validValue = (flag, v) => { const f = byId.get(flag); return !!f && (f.kind === 'value' || f.kind === 'bare-or-value') && f.valid.test(String(v)); };

// ---- the copyable reports on window.pps ----
const fn = (k) => (p) => typeof p?.[k] === 'function';
/** Reports: id, the button's label, whether pps has it, and how to read it (a value formatReport turns into text). */
export const REPORTS = Object.freeze([
  { id: 'hud', label: 'Frame panel (pps.hud)', has: fn('hud'), read: (p) => p.hud() },
  { id: 'report', label: 'Device report (pps.report)', has: fn('report'), read: (p) => p.report() },
  { id: 'budget', label: 'GPU budget (pps.budget)', has: fn('budget'), read: (p) => p.budget() },
  { id: 'perf', label: 'Frame counts (pps.perf)', has: (p) => !!p && 'perf' in p, read: (p) => { const o = p.perf || {}, rest = {}; for (const k of Object.keys(o)) if (k !== 'frames' && k !== 'inputToPaint') rest[k] = o[k]; return rest; } },   // (the recording and the input tracker are left out: large, and a getter that starts the tracker)
  { id: 'inputs', label: 'Input to paint (pps.perf.inputToPaint)', has: (p) => !!p && 'perf' in p && /[?&](perf|inputs)(?=[=&#]|$)/.test(globalThis.location?.search || ''), read: (p) => { const t = p.perf?.inputToPaint; return t ? { summary: t.summary?.(), slowest: t.slowest?.() } : null; } },
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
