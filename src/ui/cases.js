// Cases: a named patient, an authored chart, orders in clinical words, and a few decision points that
// pause the clock. Feedback waits for the debrief, except for the few unsafe choices whose effect the
// model shows at once. The content lives in ./cases/*.js (pure data); this file runs it.
//
// A case, in short (see cases/bleed.js for the fullest example):
//   patient, preset, variants[] (the seed picks one), chart(c) → items, results{order → item|fn},
//   orders[], build(v) → { steps, objectives }, pearls[], inside[] (metrics for the debrief table).
// A step is a decision point: q, options (strings or { t, does:[orders] }), answer, optional
// `unsafe: { when(pick, c), run(c) → consequence }`, `onCommit(c, pick)`, `needs`/`needsAny` (orders
// that must be placed first), `auto` (opens by itself) and `show(c)` (conditional steps).

import { store, updateParams } from './store.js?v=7acb60de12';
import { host } from './host.js?v=b64500bbb7';
import { h, openModal, closeModal, toast, svgIcon } from './util.js?v=8aa5e5cdf1';
import { addRecord, exportCSV, exportXAPI } from './records.js?v=50fb9dd463';
import { scoreCase, ASSESSMENT_VERSION, CONTENT_VERSION, MASTERY } from './assess.js?v=7f4afcf446';
import { veinBlocked } from './measure-model.js?v=089f10544e';
import { CASES, ORDER_META, GROUPS } from './cases/index.js?v=f6e3e0af48';
import { bpOf, tension, abdomen } from './cases/kit.js?v=010d07460c';
import { trustLine } from './learning-kit.js?v=6e39505c1e';

export { CASES };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rngOf = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
const txt = (o) => (typeof o === 'string' ? o : o.t);
const val = (x, c) => (typeof x === 'function' ? x(c) : x);
const clockText = (secs) => {
  const m = Math.floor(secs / 60);
  if (m < 120) return `${m} min`;
  if (secs < 48 * 3600) return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
  return `Day ${Math.floor(secs / 86400) + 1}`;
};

// What each order does to the model. Study results come from the case (authored), plus model-derived
// lines for the Doppler and the pressure study.
const drug = (key, label, exclusive) => ({ toggle: (p) => !!p.drugs[key], run: (a, o, c) => updateParams((p) => { p.drugs[key] = !p.drugs[key]; if (exclusive && p.drugs[key]) p.drugs[exclusive] = false; return p; }, { label, settle: !c.cs.acute }) });
const flag = (key, label) => ({ toggle: (p) => !!p[key], run: (a, o, c) => updateParams((p) => { p[key] = !p[key]; return p; }, { label, settle: !c.cs.acute }) });
const RUN = {
  labs: {}, ct: {}, echo: {}, ecg: {}, 'tap-dx': {}, 'clot-screen': {},
  // Imaging studies open the matching view of the model, so the student sees what the report describes.
  'abd-us': { pane: 'abdomen', run: (a, o) => { if (!o.silent) a.showPane('abdomen'); } },
  doppler: { pane: 'doppler', derive: (c) => dopplerLines(c.m, c.params), run: (a, o) => { a.setProbe?.('PV_TRUNK'); if (!o.silent) a.showPane('doppler'); } },
  hvpg: { derive: (c) => hvpgItem(c.m, c.params) },
  fibroscan: { pane: 'fibroscan', derive: (c) => lsmItem(c.m), run: (a, o) => { if (!o.silent) a.showPane('fibroscan'); } },
  egd: { pane: 'endoscopy', run: (a, o) => { if (!o.silent || o.pane) a.showPane('endoscopy'); } },
  crystalloid: { run: (a) => a.action({ kind: 'infuse', fluid: 'crystalloid' }) },
  prbc: { run: (a) => a.action({ kind: 'infuse', fluid: 'prbc' }) },
  vaso: { toggle: (p) => !!p.drugs.terlipressin, run: (a, o, c) => updateParams((p) => { p.drugs.terlipressin = true; p.drugs.octreotide = false; return p; }, { label: 'Terlipressin', settle: !c.cs.acute }) },
  ceftriaxone: {},
  carvedilol: drug('carvedilol', 'Carvedilol'),
  diuretics: flag('diuretics', 'Diuretics'),
  anticoag: flag('anticoag', 'Anticoagulation'),
  'lvp-alb': { run: (a) => a.action({ kind: 'paracentesis', mL: 5000, albumin: true }) },
  'lvp-noalb': { run: (a) => a.action({ kind: 'paracentesis', mL: 5000, albumin: false }) },
  evl: { run: (a, o) => { a.action({ kind: 'band' }); for (let i = 0; i < 2; i++) host.send({ type: 'action', action: { kind: 'band' } }); if (!o.silent) a.showPane('endoscopy'); } },
  balloon: flag('balloonEso', 'Balloon tamponade'),
  tips8: { once: true, run: (a, o, c) => updateParams({ tips: { on: true, d: 8 } }, { label: 'TIPS 8 mm', settle: !c.cs.acute }) },
  tips10: { once: true, run: (a, o, c) => updateParams({ tips: { on: true, d: 10 } }, { label: 'TIPS 10 mm', settle: !c.cs.acute }) },
  brto: { once: true, run: (a, o, c) => updateParams((p) => { p.occluded.C5 = true; return p; }, { label: 'BRTO', settle: !c.cs.acute }) },
  'tips-reduce': { once: true, run: (a, o, c) => updateParams({ tips: { on: true, d: 6 } }, { label: 'TIPS reduced', settle: true }) },
};
const SECTION = { labs: 'Labs', 'tap-dx': 'Labs', 'clot-screen': 'Labs' };

function dopplerLines(m, p) {
  const L = [], th = (id) => (p.thrombus?.[id] || 0) >= 0.95;
  if (th('SV_CONF')) L.push('Splenic vein: no flow signal.');
  L.push(m.pvFlow < -0.05 ? 'Main portal vein: flow runs away from the liver (hepatofugal).' : m.pvFlow < 0.03 ? 'Main portal vein: no flow detected.' : 'Main portal vein: flow runs toward the liver (hepatopetal).');
  if (['RHV_IVC', 'MHV_IVC', 'LHV_IVC'].some(th)) L.push('Hepatic veins: no flow signal.');
  return L;
}
function hvpgItem(m, p) {
  if (veinBlocked(p, 'R')) return { lines: ['The hepatic veins are blocked, so a wedged pressure cannot be taken.', `Pressure in the hepatic vein: ${m.fhvp.toFixed(0)} mmHg, markedly raised.`] };
  return { rows: [['Free hepatic vein pressure', `${m.fhvp.toFixed(1)} mmHg`, m.fhvp > 6 ? 'warn' : ''], ['Wedged hepatic vein pressure', `${m.whvp.toFixed(1)} mmHg`, m.whvp > 12 ? 'warn' : ''], ['HVPG (wedged minus free)', `${m.hvpg.toFixed(1)} mmHg`, m.hvpg >= 10 ? 'bad' : m.hvpg > 5 ? 'warn' : '']],
    note: 'Normal is up to 5. Clinically significant at 10 or more. Bleeding risk at 12 or more.' };
}

function lsmItem(m) {
  const k = m.lsm;
  return { rows: [['Liver stiffness', `${k.toFixed(1)} kPa`, k >= 25 ? 'bad' : k >= 15 ? 'warn' : '']],
    note: 'Normal is about 5. Above 25 kPa, clinically significant portal hypertension is near certain; below 15 with platelets of 150 or more, it is unlikely. A congested liver (heart, hepatic veins) is stiff too.' };
}
const PANE_LABEL = { endoscopy: 'Show the scope view', doppler: 'Show the Doppler', abdomen: 'Show the ultrasound', fibroscan: 'Show the FibroScan' };

// One visibility map per case: what the clinician cannot know is hidden everywhere at once.
const MODEL_ONLY_EVENTS = ['CSPH', 'BLEED_RISK', 'RED_WALE', 'HIGH_SHUNT', 'LIVER_HYPOPERFUSION', 'INTRAHEPATIC_REVERSAL', 'CAUDATE'];
const CASE_HIDDEN_EVENTS = ['COLL_*', 'PV_STASIS', 'SV_REVERSAL', 'SMV_REVERSAL', 'HEPATOFUGAL_PV', 'HYPERDYNAMIC', 'SPLENOMEGALY', 'ASCITES_FORMING', 'VARIX_LARGE', 'TENSE_ASCITES'];
function visibilityOf(cs) {
  const hidden = new Set(cs.hidden || []);
  const imaging = hidden.has('pv');
  if (imaging) hidden.add('model');
  // Model-only story events (a recruited collateral, a reversed splenic vein, portal stasis) would
  // hand the student findings nobody at the bedside sees; a case keeps them for the debrief.
  const events = new Set([...(imaging ? MODEL_ONLY_EVENTS : []), ...CASE_HIDDEN_EVENTS]);
  if (hidden.has('ra')) events.add('RA_HIGH');
  return { hidden, imaging, events };
}

export function createCases({ root, api }) {
  let cs = null, ctx = null, c = null, timer = null, keyOff = null, seed = 0, wall0 = 0;
  const log = [];

  // ───────────── the handle content code works with ─────────────
  const frame = () => store.get().frame;
  function read() {
    const m = frame().metrics, [s, d] = bpOf(m);
    return { hr: Math.round(m.hr), bp: `${s}/${d}`, map: m.map, pv: m.pv, ra: m.ra, lost: m.blood.lost, asc: m.ascites.volume, hepflow: m.hepaticFlow, hvpg: m.hvpg,
      tension: tension(m.varix?.ratio ?? 0), varix: m.varix?.d ?? 0, spleen: m.spleen.length, pvdir: m.pvFlow < -0.05 ? 'away from the liver' : m.pvFlow < 0.03 ? 'no flow' : 'toward the liver' };
  }
  function vit() {
    const r = read(), o = cs.vitalsFn?.(c) || {};
    return { hr: o.hr ?? String(r.hr), bp: o.bp ?? r.bp };
  }
  function makeHandle() {
    const hnd = {
      api, get cs() { return cs; }, get m() { return frame().metrics; }, get params() { return store.get().params; }, get t() { return ctx.t; },
      get hr() { return vit().hr; }, get bp() { return vit().bp; },
      read, advance, skip, order: (id, o) => runOrder(id, { silent: true, ...o }), story: (t, kind = 'text') => { ctx.story.push({ kind, text: t, at: ctx.t + ctx.clockAdd }); },
      snap: (label) => { ctx.snaps.push({ label, when: whenText(), ...read() }); },
      patch: (p) => updateParams(p, { history: false, settle: true }),
      flag: (k, v) => { if (v === undefined) return ctx.flags[k]; ctx.flags[k] = v; return v; },
      did: (id) => log.some((l) => l.id === id), count: (id) => log.filter((l) => l.id === id).length,
      pick: (id) => ctx.answers[id], met: (id) => ctx.grades[id] === true, viewed: (tab) => ctx.viewed.has(tab),
      chose: (id, i) => { const p = ctx.answers[id]; return Array.isArray(p) ? p.includes(i) : p === i; },
      hbLab: () => cs.hbLab?.(hnd),
    };
    return hnd;
  }
  async function advance(seconds) { await host.request('preroll', { seconds }); await sleep(180); }
  async function skip({ label, seconds = 0, days = 0, clockAdd = 0 }) {
    if (seconds) await host.request('preroll', { seconds });
    const before = days && cs.inside ? read() : null;
    if (days) { host.send({ type: 'advance', days }); host.send({ type: 'settle' }); await host.request('snapshot'); }
    ctx.clockAdd += clockAdd + days * 86400; ctx.when = label;
    ctx.story.push({ kind: 'skip', text: label, at: ctx.t + ctx.clockAdd });
    // After weeks or months, show what changed inside, so the plan's effect is visible at a glance.
    if (before) { await sleep(200); const now = read(); ctx.story.push({ kind: 'change', rows: cs.inside.map(([lab, k, u]) => [lab, insideVal(k, before[k], u), insideVal(k, now[k], u)]) }); }
    await sleep(250);
  }
  const insideVal = (k, v, u) => (typeof v === 'number' ? `${k === 'hepflow' ? v.toFixed(2) : k === 'hr' || k === 'asc' || k === 'lost' ? Math.round(v) : v.toFixed(k === 'varix' ? 0 : 1)}${u ? ` ${u}` : ''}` : v ?? '—');
  const whenText = () => (cs.acute ? `${cs.patient.setting} · ${clockText(ctx.t + ctx.clockAdd)}` : ctx.when || cs.patient.setting);

  // ───────────── orders ─────────────
  function runOrder(id, o = {}) {
    const meta = ORDER_META[id], def = RUN[id];
    if (!meta || !def) return;
    log.push({ id, t: ctx.t });
    def.run?.({ ...api }, o, c);
    if (!o.silent || meta.g !== 'assess') ctx.story.push({ kind: 'order', text: meta.label, at: ctx.t + ctx.clockAdd });
    // a study puts a result in the chart, after a short wait
    const authored = cs.results?.[id], derived = def.derive?.(c);
    if (authored !== undefined || derived) {
      const a = val(authored, c) || {}, d = derived || {};
      const item = { id: `${id}:${log.length}`, section: SECTION[id] || 'Studies', title: a.title || meta.label, lines: [...(d.lines || []), ...(a.lines || []), ...(a.extra || [])],
        rows: [...(d.rows || []), ...(a.rows || [])], note: a.note || d.note, pane: def.pane, pending: true, fresh: true };
      if (id === 'labs') ctx.hbShown = cs.hbLab?.(c) ?? ctx.hbShown;
      ctx.items.push(item);
      setTimeout(() => { item.pending = false; if (ctx && ctx.tab !== 'chart') ctx.dot = true; if (cs) render(); }, 1100);
    }
  }

  // ───────────── steps ─────────────
  const visible = () => cs.steps.filter((s) => !s.show || s.show(c));
  const nextStep = () => visible().find((s) => ctx.answers[s.id] === undefined);
  const optionsOf = (s) => val(s.options, c);
  // Options are shown in a shuffled order (fixed for the attempt), so the right answer is not always first.
  function orderOf(s) {
    const n = optionsOf(s).length;
    if (ctx.order[s.id]?.length !== n) {
      let x = (seed ^ [...s.id].reduce((a, ch) => Math.imul(a, 31) + ch.charCodeAt(0) >>> 0, 7)) >>> 0;
      const r = () => { x = (x + 0x6D2B79F5) >>> 0; let t = Math.imul(x ^ (x >>> 15), 1 | x); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }, o = [...Array(n).keys()];
      for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
      ctx.order[s.id] = o;
    }
    return ctx.order[s.id];
  }
  function lockOf(s) {
    const miss = (s.needs || []).filter((id) => !log.some((l) => l.id === id));
    if (miss.length) return `Order first: ${miss.map((id) => ORDER_META[id].label.toLowerCase()).join(', ')}`;
    if (s.needsAny && !s.needsAny.some((id) => log.some((l) => l.id === id))) return `Order first: ${s.needsAny.map((id) => ORDER_META[id].label.toLowerCase()).join(' or ')}`;
    return null;
  }
  function grade(s, pick) {
    const ans = val(s.answer, c);
    if (s.multi) return ans.every((i) => pick.includes(i)) && !(s.avoid || []).some((i) => pick.includes(i));
    return [].concat(ans).includes(pick);
  }
  const pause = () => host.send({ type: 'run', running: false });
  const resume = () => host.send({ type: 'run', running: true, speed: cs.speed, clock: 'hemo' });

  async function openStep(s) {
    if (ctx.open || ctx.busy || ctx.ended) return;
    ctx.open = s.id; ctx.sel = s.multi ? new Set() : null; ctx.consequence = null;
    pause();
    if (!ctx.opened.has(s.id)) { ctx.opened.add(s.id); ctx.busy = true; render(); await s.onOpen?.(c); ctx.busy = false; }
    bindKeys(); render();
  }
  async function commit() {
    const s = cs.steps.find((x) => x.id === ctx.open);
    if (!s || ctx.busy || ctx.consequence) return;
    const pick = s.multi ? [...ctx.sel].sort((a, b) => a - b) : ctx.sel;
    if (pick == null || (s.multi && !pick.length)) return;
    ctx.busy = true; render();
    const opts = optionsOf(s), picks = s.multi ? pick : [pick];
    ctx.answers[s.id] = pick; ctx.grades[s.id] = grade(s, pick);
    log.push({ id: `Decision: ${s.title}`, t: ctx.t, key: `case:${cs.id}:${s.id}`, correct: ctx.grades[s.id] });
    ctx.story.push({ kind: 'decision', text: `${s.title}: ${picks.map((i) => txt(opts[i])).join('; ')}`, at: ctx.t + ctx.clockAdd });
    for (const i of picks) for (const id of opts[i].does || []) runOrder(id, { silent: true });
    let cons = null;
    try {
      const res = await s.onCommit?.(c, pick);
      if (s.unsafe?.when(pick, c)) { cons = { ...(await s.unsafe.run(c, pick)), unsafe: true }; ctx.unsafeHit.add(s.id); } else if (res) cons = res;
    } catch (e) { console.error(e); }
    if (cs.hbLab && ctx.hbShown != null) ctx.hbShown = cs.hbLab(c);
    c.snap(s.title);
    ctx.busy = false;
    if (cons) { ctx.consequence = cons; render(); } else closeStep();
  }
  function closeStep() {
    ctx.open = null; ctx.consequence = null; ctx.sel = null; unbindKeys();
    if (!maybeFinish()) { resume(); render(); }
  }
  function maybeFinish() {
    if (!ctx.ended && !ctx.open && !ctx.busy && !nextStep()) { finish('success'); return true; }
    return false;
  }
  function bindKeys() {
    unbindKeys();
    const fn = (e) => {
      if (!ctx?.open || ctx.busy || e.target?.closest?.('input,textarea,[contenteditable]')) return;
      const s = cs.steps.find((x) => x.id === ctx.open);
      if (e.key === 'Enter') { e.preventDefault(); if (ctx.consequence) closeStep(); else commit(); return; }
      const n = Number(e.key);
      if (!ctx.consequence && n >= 1 && n <= optionsOf(s).length) { e.preventDefault(); choose(s, orderOf(s)[n - 1]); }
    };
    document.addEventListener('keydown', fn);
    keyOff = () => document.removeEventListener('keydown', fn);
  }
  const unbindKeys = () => { keyOff?.(); keyOff = null; };
  function choose(s, i) {
    if (s.multi) { ctx.sel.has(i) ? ctx.sel.delete(i) : ctx.sel.add(i); } else ctx.sel = i;
    render();
  }

  // ───────────── lifecycle ─────────────
  async function start(id, opts = {}) {
    const base = CASES.find((x) => x.id === id);
    if (!base) { toast('That case does not exist.'); return; }
    await api.beginSession?.('case');
    log.length = 0;
    seed = opts.seed ?? Math.floor(1000 + Math.random() * 9000);
    const vs = base.variants || [{}];
    // ?variant=N in the address picks a variant (handy for course links and testing); otherwise the seed does.
    const qv = Number(new URLSearchParams(location.search).get('variant'));
    const v = vs[opts.variant ?? (Number.isInteger(qv) && vs[qv] ? qv : Math.floor(rngOf(seed ^ 0x5bd1e995)() * vs.length))];
    cs = { ...base, ...v };
    Object.assign(cs, cs.build?.(cs) || {});
    cs.speed ||= 1;
    ctx = { t0: null, t: 0, clockAdd: 0, when: null, answers: {}, grades: {}, flags: {}, opened: new Set(), autoed: new Set(), unsafeHit: new Set(), viewed: new Set(['story']), order: {},
      story: [], items: [], snaps: [], tab: 'story', dot: false, open: null, sel: null, consequence: null, busy: true, ended: false, hbShown: null, lowFor: 0 };
    c = makeHandle();
    // Hide model-only events before the preset ages, so none from the patient's past reach the timeline.
    store.set({ hiddenEvents: visibilityOf(cs).events });
    await api.loadPreset(cs.preset, { keepLesson: true, days: cs.days });
    if (cs.prep) updateParams(cs.prep, { history: false });
    if (cs.afterDays) { host.send({ type: 'advance', days: cs.afterDays, restartClock: true }); host.send({ type: 'settle' }); await host.request('snapshot'); }
    if (cs.params) updateParams(cs.params, { history: false, settle: true });
    const vis = visibilityOf(cs);
    store.set({ hiddenReadouts: vis.hidden, hiddenEvents: vis.events, lastHVPG: null, locked: new Set(['!cirrhosis']), imaging: vis.imaging });
    api.setAllowedTools(cs.tools);
    api.muteEvents?.(true);
    await cs.setup?.(api, c);
    await sleep(250);
    for (const it of cs.chart(c)) ctx.items.push(it);
    for (const t of cs.intro(c)) ctx.story.push({ kind: 'text', text: t, at: 0 });
    host.send({ type: 'run', running: true, speed: cs.speed, clock: 'hemo' });
    store.set({ speed: cs.speed });
    wall0 = Date.now();
    ctx.busy = false;
    render();
    clearInterval(timer);
    timer = setInterval(tick, 250);
  }

  function tick() {
    const f = frame();
    if (!cs || !f || ctx.ended) return;
    if (ctx.t0 == null) ctx.t0 = f.t;
    ctx.t = Math.max(0, f.t - ctx.t0);
    ctx.lowFor = cs.acute && f.metrics.map < 40 ? ctx.lowFor + 0.25 * cs.speed : 0;
    if (ctx.lowFor > 60) { finish('death'); return; }
    if (!ctx.open && !ctx.busy) {
      const s = nextStep();
      if (s?.auto && !ctx.autoed.has(s.id) && !lockOf(s)) { ctx.autoed.add(s.id); openStep(s); return; }
      if (!s) { maybeFinish(); return; }
    }
    renderLive();
  }

  function exit() {
    if (!cs) return;
    clearInterval(timer); unbindKeys();
    cs = null; ctx = null; c = null;
    store.set({ hiddenReadouts: null, hiddenEvents: null, locked: null, imaging: false });
    api.setAllowedTools(null);
    api.muteEvents?.(false);
    host.send({ type: 'run', running: true, speed: 1 });
    store.set({ speed: 1 });
    root.replaceChildren();
    root.closest('.app')?.classList.remove('case-deciding');
    api.setBanner?.(null);
    api.endSession?.('case');
    api.onEnd?.();
  }

  // ───────────── rendering ─────────────
  let live = null, lastBanner = '';
  const VITAL_LABEL = { hr: ['Heart rate', '/min'], bp: ['Blood pressure', 'mmHg'], hb: ['Hb (g/dL)', 'g/dL'], abd: ['Abdomen', ''] };
  function vitalCells() {
    const m = frame()?.metrics; if (!m) return [];
    const v = vit(), hr = parseInt(v.hr, 10), sbp = parseInt(v.bp, 10);
    const cells = {
      hr: [v.hr, hr >= 120 || hr <= 40 ? 'bad' : hr >= 100 || hr < 50 ? 'warn' : ''],
      bp: [v.bp, sbp < 90 ? 'bad' : sbp < 100 ? 'warn' : ''],
      hb: ctx.hbShown != null ? [ctx.hbShown.toFixed(1), ctx.hbShown < 7 ? 'bad' : ctx.hbShown < 8 ? 'warn' : ''] : ['not drawn', 'dim'],
      abd: [abdomen(m.ascites.volume), m.ascites.volume >= 4000 ? 'warn' : ''],
    };
    return (cs.vitals || ['hr', 'bp']).map((k) => ({ k, label: VITAL_LABEL[k][0], unit: VITAL_LABEL[k][1], val: cells[k][0], cls: cells[k][1] }));
  }
  function renderVitals(el) {
    el.replaceChildren(...vitalCells().map((x) => h('div', { class: `cs-v ${x.cls}` }, h('span', { class: 'cs-vl' }, x.label), h('b', {}, x.val), x.unit && x.cls !== 'dim' ? h('i', {}, x.unit) : null)));
  }
  function renderLive() {
    if (!live) return;
    renderVitals(live.vitals);
    live.when.textContent = whenText();
    const bt = cs.acute ? `${cs.title} · ${clockText(ctx.t + ctx.clockAdd)}` : cs.title;
    if (bt !== lastBanner) { lastBanner = bt; api.setBanner?.({ tag: 'Case', text: bt }); }
  }

  function itemEl(it) {
    return h('div', { class: 'cs-item' + (it.pending ? ' pending' : '') },
      h('div', { class: 'cs-item-h' }, h('b', {}, it.title), it.pending ? h('span', { class: 'cs-badge' }, 'Result pending…') : it.fresh ? h('span', { class: 'cs-badge new' }, 'New') : null),
      it.pending ? null : [
        it.lines?.length ? h('ul', {}, it.lines.map((l) => h('li', {}, l))) : null,
        it.rows?.length ? h('table', { class: 'cs-rows' }, h('tbody', {}, it.rows.map((r) => h('tr', {}, h('td', {}, r[0]), h('td', { class: r[2] || '' }, r[1]))))) : null,
        it.note ? h('p', { class: 'cs-note' }, it.note) : null,
        it.pane ? h('button', { class: 'btn ghost sm cs-see', onclick: () => { if (it.pane === 'doppler') api.setProbe?.('PV_TRUNK'); api.showPane(it.pane); } }, PANE_LABEL[it.pane]) : null]);
  }
  const changeEl = (e) => h('table', { class: 'cs-rows cs-change' }, h('thead', {}, h('tr', {}, h('th', {}, 'Inside the model'), h('th', {}, 'Before'), h('th', {}, 'Now'))),
    h('tbody', {}, e.rows.map(([a, b, n]) => h('tr', {}, h('td', {}, a), h('td', {}, b), h('td', { class: b === n ? '' : 'chg' }, n)))));
  function storyPane() {
    return h('div', { class: 'cs-story' }, trustLine(), ctx.story.map((e) => (e.kind === 'skip' ? h('div', { class: 'cs-skip' }, h('span', {}, e.text))
      : e.kind === 'change' ? changeEl(e)
      : e.kind === 'order' ? h('p', { class: 'cs-log' }, `Ordered: ${e.text}`)
      : e.kind === 'decision' ? h('p', { class: 'cs-log you' }, `You decided: ${e.text}`)
      : h('p', {}, cs.acute && e.at ? [h('span', { class: 'cs-at' }, clockText(e.at)), e.text] : e.text))));
  }
  function chartPane() {
    const order = ['History', 'Exam', 'Labs', 'Studies'];
    const by = {}; for (const it of ctx.items) (by[it.section] ||= []).push(it);
    const secs = [...order.filter((s) => by[s]), ...Object.keys(by).filter((s) => !order.includes(s))];
    return h('div', { class: 'cs-chart' }, h('p', { class: 'cs-chip' }, 'The chart is written for this patient. Pressures and flows come from the teaching model.'),
      secs.map((s) => h('section', {}, h('h4', {}, s), by[s].map(itemEl))));
  }
  function ordersPane() {
    const p = store.get().params;
    return h('div', { class: 'cs-orders' }, GROUPS.map(([g, label]) => {
      const ids = cs.orders.filter((id) => ORDER_META[id]?.g === g && !ORDER_META[id].hidden);
      return ids.length ? h('section', {}, h('h4', {}, label), h('div', { class: 'cs-ord-grid' }, ids.map((id) => {
        const meta = ORDER_META[id], def = RUN[id];
        const done = g === 'assess' ? log.some((l) => l.id === id) && !(id === 'labs' && cs.hbLab) : (def.once || meta.once) && log.some((l) => l.id === id);
        const on = meta.toggle && def.toggle ? def.toggle(p) : false;
        return h('button', { class: 'cs-ord' + (done ? ' done' : '') + (on ? ' on' : ''), 'aria-pressed': meta.toggle ? String(on) : null, disabled: ctx.ended,
          onclick: () => { if (done) { setTab('chart'); return; } runOrder(id, { silent: false }); render(); } }, h('span', {}, meta.label), done ? svgIcon('check') : null);
      }))) : null;
    }));
  }
  function setTab(t) { ctx.tab = t; ctx.viewed.add(t); if (t === 'chart') { ctx.dot = false; for (const it of ctx.items) if (!it.pending) it.fresh = false; } render(); }

  function decisionBar() {
    const s = nextStep(); if (!s) return null;
    const vs = visible(), n = vs.indexOf(s) + 1, lock = lockOf(s);
    return h('div', { class: 'cs-decbar' }, h('div', {}, h('span', { class: 'cs-kicker' }, `Decision ${n} of ${vs.length}`), h('b', {}, s.title)),
      h('button', { class: 'btn primary', disabled: !!lock || ctx.busy, onclick: () => { ctx.autoed.add(s.id); openStep(s); } }, 'Decide'), lock ? h('small', {}, lock) : null);
  }
  function decisionCard() {
    const s = cs.steps.find((x) => x.id === ctx.open), vs = visible(), n = vs.indexOf(s) + 1;
    if (ctx.busy) return h('div', { class: 'cs-dec' }, h('p', { class: 'cs-wait' }, 'Working…'));
    if (ctx.consequence) {
      const k = ctx.consequence;
      return h('div', { class: 'cs-dec' }, h('div', { class: 'cs-cons' + (k.unsafe ? ' unsafe' : '') },
        h('span', { class: 'cs-kicker' }, k.unsafe ? 'What happened' : 'Result'), h('h3', {}, k.title), h('p', {}, k.text),
        k.rows?.length ? h('table', { class: 'cs-rows' }, h('tbody', {}, k.rows.map((r) => h('tr', {}, h('td', {}, r[0]), h('td', {}, r[1]))))) : null),
      h('div', { class: 'cs-dec-actions' }, h('button', { class: 'btn primary', onclick: closeStep }, 'Continue')));
    }
    const opts = optionsOf(s);
    return h('div', { class: 'cs-dec' },
      h('span', { class: 'cs-kicker' }, `Decision ${n} of ${vs.length} · ${s.title}`),
      ctx.story.at(-1)?.kind === 'change' ? changeEl(ctx.story.at(-1)) : null,
      h('p', { class: 'cs-q', role: 'heading', 'aria-level': '3' }, val(s.q, c)),
      s.multi ? h('p', { class: 'cs-hint' }, 'Choose all that apply.') : null,
      h('div', { class: 'cs-opts', role: s.multi ? 'group' : 'radiogroup' }, orderOf(s).map((i, k) => {
        const o = opts[i], on = s.multi ? ctx.sel.has(i) : ctx.sel === i;
        return h('button', { class: 'cs-opt' + (on ? ' sel' : ''), role: s.multi ? 'checkbox' : 'radio', 'aria-checked': String(on), onclick: () => choose(s, i) },
          h('span', { class: 'cs-k' }, String(k + 1)), h('span', {}, txt(o)));
      })),
      h('div', { class: 'cs-dec-actions' }, h('button', { class: 'btn ghost', onclick: () => { ctx.open = null; unbindKeys(); resume(); render(); } }, 'Review the chart first'),
        h('button', { class: 'btn primary', disabled: s.multi ? !ctx.sel.size : ctx.sel == null, onclick: commit }, 'Commit')));
  }

  function render() {
    if (!cs || !ctx) return;
    const body0 = root.querySelector('.cs-pane'), top = body0 ? body0.scrollTop : 0;
    const pt = cs.patient;
    const vitals = h('div', { class: 'cs-vitals', role: 'group', 'aria-label': 'Vital signs' });
    const when = h('span', {}, whenText());
    const deciding = !!ctx.open;
    const tabs = ['story', 'chart', 'orders'].map((t) => h('button', { class: 'cs-tab' + (ctx.tab === t ? ' on' : ''), role: 'tab', 'aria-selected': String(ctx.tab === t), onclick: () => setTab(t) },
      { story: 'Story', chart: 'Chart', orders: 'Orders' }[t], t === 'chart' && ctx.dot ? h('i', { class: 'cs-dot', 'aria-label': 'new result' }) : null));
    const pane = h('div', { class: 'cs-pane', role: 'tabpanel' }, ctx.tab === 'story' ? storyPane() : ctx.tab === 'chart' ? chartPane() : ordersPane());
    root.replaceChildren(
      h('div', { class: 'p-head case-head cs-head' },
        h('div', { class: 'cs-who' }, h('b', {}, pt.name), h('span', {}, `${pt.age}${pt.sex}`)), h('p', { class: 'cs-prob' }, pt.problem), h('p', { class: 'cs-where' }, when)),
      h('div', { class: 'p-body cs-body' },
        vitals,
        deciding ? decisionCard() : [h('div', { class: 'cs-tabs', role: 'tablist' }, tabs), pane, decisionBar()],
        h('div', { class: 'cs-foot' }, h('button', { class: 'btn ghost sm', disabled: ctx.busy, onclick: () => { if (!ctx.ended) { unbindKeys(); finish('ended'); } } }, 'End case and see the debrief'))));
    live = { vitals, when };
    root.closest('.app')?.classList.toggle('case-deciding', deciding && !ctx.ended);
    renderLive();
    const np = root.querySelector('.cs-pane'); if (np) np.scrollTop = top;
  }

  // ───────────── debrief ─────────────
  // A number in the "inside the patient" table, with an arrow when it moved since the previous moment.
  const STEP = { hr: 5, asc: 300, lost: 100, hepflow: 0.1 };
  function insideCell(v, prev, k) {
    if (typeof v !== 'number') return v ?? '—';
    const txt0 = k === 'hr' || k === 'asc' || k === 'lost' ? String(Math.round(v)) : v.toFixed(k === 'hepflow' ? 2 : 1);
    const d = typeof prev === 'number' ? v - prev : 0;
    if (Math.abs(d) < (STEP[k] ?? 1)) return txt0;
    return [txt0, ' ', h('span', { class: `cs-trend ${d > 0 ? 'up' : 'down'}`, title: `${d > 0 ? 'Up' : 'Down'} since the previous moment` }, d > 0 ? '↑' : '↓')];
  }
  function finish(outcome) {
    if (ctx.ended) return;
    ctx.ended = true; ctx.outcome = outcome; ctx.open = null; ctx.busy = false;
    clearInterval(timer); unbindKeys();
    host.send({ type: 'run', running: false });
    const states = {};
    for (const o of cs.objectives) { let ok = false; try { ok = !!o.check(c); } catch (e) { console.error(e); } states[o.id] = ok ? 'met' : 'failed'; }
    const met = cs.objectives.filter((o) => states[o.id] === 'met').length;
    const res = scoreCase(cs.objectives, states, outcome);
    const score = res.score;
    const title = { success: res.mastered ? 'Case mastered' : 'Case completed, not mastered', death: 'The patient died', ended: 'Case ended early', timeout: 'Time is up' }[outcome];
    try { const best = JSON.parse(localStorage.getItem('pps.caseScores') || '{}'); best[cs.id] = Math.max(best[cs.id] || 0, score); localStorage.setItem('pps.caseScores', JSON.stringify(best)); } catch { /* storage unavailable */ }
    addRecord({ kind: 'case', id: cs.id, title: cs.title, variant: seed, seed, score, outcome, duration: ctx.t, wallDuration: (Date.now() - wall0) / 1000, met, total: cs.objectives.length,
      assessment: ASSESSMENT_VERSION, contentVersion: CONTENT_VERSION, completed: res.completed, mastered: res.mastered, failedCritical: res.failedCritical, weights: res.weights,
      objectives: cs.objectives.map((o) => ({ id: o.id, text: o.text, state: states[o.id], weight: res.weights[o.id], critical: !!o.critical })),
      answers: log.map((l) => (l.key ? `${l.key}: ${l.correct ? 'correct' : 'incorrect'}` : l.id)) });
    const ring = (() => {
      const r = 32, cc = 2 * Math.PI * r, col = res.mastered ? 'var(--ok)' : score >= 50 ? 'var(--caution)' : 'var(--danger)';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 76 76'); svg.setAttribute('class', 'score-ring');
      svg.innerHTML = `<circle cx="38" cy="38" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="6"/><circle cx="38" cy="38" r="${r}" fill="none" stroke="${col}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(cc * score) / 100} ${cc}" transform="rotate(-90 38 38)"/><text x="38" y="44" text-anchor="middle" font-size="19" font-weight="600" fill="var(--text)" font-family="Inter, system-ui">${score}</text>`;
      return svg;
    })();
    const mine = (s) => { const p = ctx.answers[s.id]; if (p === undefined) return 'Not decided'; const o = optionsOf(s); return [].concat(p).map((i) => txt(o[i])).join('; '); };
    const best = (s) => { const o = optionsOf(s), a = val(s.answer, c); return [].concat(a).map((i) => txt(o[i])).join(' / '); };
    const decided = visible();
    const inside = cs.inside && ctx.snaps.length ? h('div', {}, h('h3', {}, 'Inside the patient'), h('p', { class: 'sub' }, 'What the teaching model shows at the moments you decided.'),
      h('table', { class: 'cmp-table cs-inside' }, h('thead', {}, h('tr', {}, h('th', {}, 'Moment'), cs.inside.map(([l, , u]) => h('th', {}, u ? `${l} (${u})` : l)))),
        h('tbody', {}, ctx.snaps.map((s, i) => h('tr', {}, h('td', {}, s.label), cs.inside.map(([, k]) => h('td', {}, insideCell(s[k], ctx.snaps[i - 1]?.[k], k)))))))) : null;
    const body = h('div', { class: 'debrief' },
      h('div', { class: 'score' }, ring, h('div', {}, h('b', {}, cs.title), h('div', { class: 'sub' }, `${cs.patient.name}, ${cs.patient.age}${cs.patient.sex} · ${met} of ${cs.objectives.length} key actions · ${res.mastered ? 'mastered' : `not mastered (needs ${MASTERY} %${cs.objectives.some((o) => o.critical) ? ' and every critical action' : ''})`}${res.failedCritical.length ? ` · critical missed: ${res.failedCritical.map((id) => cs.objectives.find((o) => o.id === id).text).join('; ')}` : ''}`))),
      h('h3', {}, 'Key actions'),
      h('div', { class: 'cs-keys' }, cs.objectives.map((o) => h('div', { class: 'goal' + (states[o.id] === 'met' ? ' met' : ' failed'), style: { marginBottom: 0 } }, h('span', { class: 'chk' }, svgIcon(states[o.id] === 'met' ? 'check' : 'close')), o.text, o.critical ? h('small', { class: 'cs-crit' }, 'critical') : null))),
      h('h3', {}, 'Your decisions and the expert\'s'),
      h('div', { class: 'cs-cmp' }, decided.map((s) => h('div', { class: 'cs-cmp-row ' + (ctx.grades[s.id] ? 'ok' : 'miss') },
        h('b', {}, s.title), h('div', {}, h('span', {}, 'You'), mine(s)), ctx.grades[s.id] ? null : h('div', {}, h('span', {}, 'Expert'), best(s)), s.why ? h('p', {}, s.why) : null))),
      inside,
      h('h3', {}, 'Pearls'), h('ul', { class: 'cs-pearls' }, cs.pearls.map((t) => h('li', {}, t))),
      cs.refs ? [h('h3', {}, 'References'), h('ol', { class: 'refs' }, cs.refs.map((r) => h('li', {}, r)))] : null,
      h('p', { class: 'disclaimer' }, `Teaching model: shows how pressure and flow behave; it does not predict an individual patient. Patient ${seed}.`),
      h('div', { class: 'btn-row no-print', style: { marginTop: '18px' } },
        h('button', { class: 'btn primary', onclick: () => { closeModal(); start(cs.id); } }, 'Try another patient'),
        h('button', { class: 'btn', onclick: () => { document.body.classList.add('print-report'); window.print(); setTimeout(() => document.body.classList.remove('print-report'), 500); } }, 'Print report'),
        h('button', { class: 'btn', onclick: exportCSV }, 'Export records (CSV)'),
        h('button', { class: 'btn', onclick: exportXAPI }, 'xAPI'),
        h('button', { class: 'btn ghost', onclick: () => { closeModal(); exit(); } }, 'All cases')));
    render();
    openModal(title, body, { wide: true, sub: `Case debrief · ${cs.level} · ${new Date().toLocaleDateString()}` });
  }

  return {
    mount() { if (cs) render(); else root.replaceChildren(); },
    start,
    active: () => !!cs,
    exit,
  };
}
