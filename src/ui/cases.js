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

import { store, updateParams, replaceParams } from './store.js?v=49dc9cdf15';
import { host } from './host.js?v=b54d9b1fcc';
import { h, openModal, closeModal, toast, svgIcon } from './util.js?v=a357853926';
import { addRecord, exportCSV, exportXAPI } from './records.js?v=50fb9dd463';
import { scoreCase, ASSESSMENT_VERSION, CONTENT_VERSION, MASTERY } from './assess.js?v=7f4afcf446';
import { veinBlocked } from './measure-model.js?v=96862e2586';
import { CASES, ORDER_META, GROUPS } from './cases/index.js?v=78c53e6b35';
import { EXPLAIN } from './cases/explain.js?v=81bcd9a17a';
import { bpOf, tension, abdomen, esoText, spleenCm, ascitesText } from './cases/kit.js?v=4db57f825c';
import { trustLine, optionList, bindQuestionKeys } from './learning-kit.js?v=83e19de948';
import { course, setUnitSurface, unitBar } from './course.js?v=5391cf593b';
import { CASE_UNITS } from './cases/units.js?v=bde5f54566';
import { activeInterventions } from './inspector.js?v=5072cb4981';
import { captureFrame } from './timeline.js?v=bf87e94cd0';
import { createRoute, ladder, SITE_OF_GROUP } from './ladder.js?v=2cbec732f7';
import { SNAPSHOTS } from './snapshots.js?v=34d1578d5f';

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
  labs: {}, ct: {}, echo: {}, ecg: {}, 'tap-dx': {}, 'clot-screen': {}, xmatch: {}, cxr: {},
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
  'spl-embo': { once: true, run: (a, o, c) => updateParams({ splenicRx: 1 }, { label: 'Partial splenic embolization', settle: !c.cs.acute }) },
  splenectomy: { once: true, run: (a, o, c) => updateParams({ splenicRx: 2 }, { label: 'Splenectomy', settle: !c.cs.acute }) },
  'tips-reduce': { once: true, run: (a, o, c) => updateParams({ tips: { on: true, d: 6 } }, { label: 'TIPS reduced', settle: true }) },
};
const SECTION = { labs: 'Labs', 'tap-dx': 'Labs', 'clot-screen': 'Labs', xmatch: 'Labs' };
// What a test costs in case time (seconds), outside the acute cases where the clock already runs.
const H = 3600;
const COST = { labs: H, 'abd-us': H, doppler: H, ct: 2 * H, egd: 4 * H, fibroscan: H / 2, echo: 2 * H, hvpg: 24 * H, 'tap-dx': H / 2, 'clot-screen': 48 * H, ecg: H / 6 };
const costText = (sec) => (sec >= 24 * H ? (sec === 24 * H ? 'next day' : `${sec / (24 * H)} days`) : sec >= H ? `${sec / H} h` : `${Math.round(sec / 60)} min`);
const spentText = (sec) => (sec >= 24 * H ? `${Math.round(sec / (24 * H))} d` : sec >= H ? `${Math.round(sec / H)} h` : `${Math.round(sec / 60)} min`);
// The lesson step that teaches a decision or key action (case id:step or objective id → [lesson, step]).
const LESSON_OF = {
  'new-ascites:tap': ['ascites', 'tap'], 'new-ascites:fluid': ['ascites', 'read-fluid'], 'new-ascites:cause': ['which-level', 'level-cardiac'], 'new-ascites:plan': ['toolbox', 'compare'],
  'gastric:block': ['left-sided', 'clot'], 'gastric:treat': ['left-sided', 'tips'], 'gastric:image': ['left-sided', 'clot'],
  'budd-chiari:level': ['which-level', 'level-post'], 'budd-chiari:hvpg': ['measuring-pressure', 'hvpg-budd-chiari'], 'budd-chiari:doppler': ['doppler-report', 'intro'],
  'schisto:level': ['which-level', 'level-presin'], 'schisto:hvpg': ['measuring-pressure', 'hvpg-schisto'],
  'prevention:csph': ['varices', 'bleed-risk'], 'prevention:plan': ['inflow-and-drugs', 'carvedilol'],
  'nsbb-problem:drug': ['inflow-and-drugs', 'carvedilol'], 'nsbb-problem:varices': ['varices', 'band'],
  'pvt:first': ['portal-flow', 'clot'], 'pvt:hvpg': ['measuring-pressure', 'hvpg-schisto'],
  'hepatofugal:meaning': ['doppler-report', 'hepatofugal'], 'hepatofugal:check': ['doppler-report', 'hepatofugal'],
  'post-tips:cause': ['toolbox', 'compare'], 'refractory:today': ['ascites', 'drain'], 'refractory:plan': ['toolbox', 'tips'],
  'bleed:timing': ['varices', 'band'], 'new-ascites:sbp': ['ascites', 'read-fluid'], 'treat-cause:now': ['inflow-and-drugs', 'hvpg-response'], 'treat-cause:stop': ['inflow-and-drugs', 'hvpg-response'],
};
const LESSON_TITLE = { 'portal-flow': 'Where portal blood goes', 'which-level': 'Before, in, or after the liver', 'measuring-pressure': 'Measuring portal pressure', 'inflow-and-drugs': 'Inflow and drugs',
  varices: 'Varices', ascites: 'Ascites', 'doppler-report': 'Reading the Doppler report', 'left-sided': 'Left-sided portal hypertension', toolbox: 'The toolbox' };

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

export function createCases({ root, api, coach, onUnitEnd }) {
  let cs = null, ctx = null, c = null, timer = null, keyOff = null, seed = 0, wall0 = 0;
  const log = [];

  // ───────────── the handle content code works with ─────────────
  const frame = () => store.get().frame;
  function read() {
    const m = frame().metrics, [s, d] = bpOf(m);
    return { hr: Math.round(m.hr), bp: `${s}/${d}`, map: m.map, pv: m.pv, ppg: m.ppg, ra: m.ra, lost: m.blood.lost, asc: m.ascites.volume, hepflow: m.hepaticFlow, hvpg: m.hvpg,
      tension: tension(m.varix?.ratio ?? 0), varix: m.varix?.d ?? 0, spleen: m.spleen.length, pvdir: m.pvFlow < -0.05 ? 'away from the liver' : m.pvFlow < 0.03 ? 'no flow' : 'toward the liver' };
  }
  function vit() {
    // While a decision is open the vitals hold still, so the question and the strip quote the same numbers.
    if (ctx.frozen && ctx.open && !ctx.consequence) return ctx.frozen;
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
      // Try a change on the model and put it back: the metrics it gave (the unit's Watch step).
      trial: async (apply) => {
        const { snap } = await host.request('snapshot');
        await apply(); await advance(30);
        const m = { ...frame().metrics };
        host.send({ type: 'restore', snap }); replaceParams(snap.params); await sleep(200);
        return m;
      },
    };
    return hnd;
  }
  async function advance(seconds) { await host.request('preroll', { seconds }); await sleep(180); }
  async function skip({ label, seconds = 0, days = 0, clockAdd = 0 }) {
    if (seconds) await host.request('preroll', { seconds });
    const before = days && cs.inside ? read() : null;
    if (days) { host.send({ type: 'advance', days }); host.send({ type: 'settle' }); await host.request('snapshot'); }
    ctx.clockAdd += clockAdd + days * 86400; ctx.when = label;
    ctx.skips.push({ t: ctx.t, seconds, days }); sample(true, { skip: label });
    ctx.story.push({ kind: 'skip', text: label, at: ctx.t + ctx.clockAdd });
    // After weeks or months, show what changed inside, so the plan's effect is visible at a glance.
    if (before) { await sleep(200); const now = read(); ctx.story.push({ kind: 'change', rows: cs.inside.map(([lab, k, u]) => [lab, insideVal(k, before[k], u), insideVal(k, now[k], u)]) }); }
    await sleep(250);
  }
  const insideVal = (k, v, u) => (typeof v === 'number' ? `${k === 'hepflow' ? v.toFixed(2) : k === 'hr' || k === 'asc' || k === 'lost' ? Math.round(v) : v.toFixed(k === 'varix' ? 0 : 1)}${u ? ` ${u}` : ''}` : v ?? '—');
  const whenText = () => (cs.acute ? `${cs.patient.setting} · ${clockText(ctx.t + ctx.clockAdd)}` : `${ctx.when || cs.patient.setting}${ctx.spent ? ` · ${spentText(ctx.spent)} on tests` : ''}`);

  // ───────────── orders ─────────────
  // Finding captions on the figure stay hidden until the test that would show them.
  const LANES = ['C1b', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'EPI_SVC'];
  const LABELS_OF = { eso: ['VAR'], gv: ['GV'], coll: LANES };
  const labelsFor = (kinds) => kinds.flatMap((k) => LABELS_OF[k] || []);
  function revealLabels(id) {
    const hid = store.get().hiddenLabels, show = labelsFor(FINDS[id] || []);
    if (!hid || !show.length) return;
    const next = new Set([...hid].filter((k) => !show.includes(k)));
    if (next.size !== hid.size) store.set({ hiddenLabels: next });
  }
  // Each test shows its own footprint on the figure (the rest stays hidden), with a "found by" tag.
  const FINDS = { egd: ['eso'], doppler: ['flow', 'clot'], ct: ['gv', 'coll', 'clot'] };
  function revealFindings(id) {
    const fd = store.get().found, add = FINDS[id] || [];
    if (fd && add.some((k) => !fd.has(k))) store.set({ found: new Set([...fd, ...add]) });
    const tags = findTags(id);
    if (tags.length) api.showFound?.(tags);
  }
  function findTags(id) {
    const m = frame()?.metrics, p = store.get().params;
    if (!m) return [];
    const clots = Object.entries(p.thrombus || {}).filter(([, v]) => v >= 0.5).map(([e]) => e);
    if (id === 'abd-us') return [{ at: 'spleen', text: `Spleen ${spleenCm(m)} cm`, by: 'Ultrasound' }, { at: 'liver', text: p.cirrhosis > 0.4 ? 'Nodular liver surface' : 'Smooth liver surface', by: 'Ultrasound' },
      m.ascites.volume >= 300 ? { at: 'abdomen', text: ascitesText(m.ascites.volume), by: 'Ultrasound' } : null].filter(Boolean);
    if (id === 'doppler') return [{ at: 'PV_TRUNK', text: `Portal flow ${read().pvdir}`, by: 'Doppler' }, ...clots.slice(0, 2).map((e) => ({ at: e, text: 'Clot, no flow', by: 'Doppler' }))];
    if (id === 'egd') return [{ at: 'varices', text: esoText(m), by: 'Endoscopy' }];
    if (id === 'ct') return [m.gastricVarix.d > 0 ? { at: 'gastric', text: 'Fundal varices', by: 'CT' } : null, ...clots.slice(0, 2).map((e) => ({ at: e, text: 'Clot', by: 'CT' })),
      { at: 'liver', text: p.cirrhosis > 0.4 ? 'Nodular liver' : 'Liver shape normal', by: 'CT' }].filter(Boolean);
    if (id === 'echo') return [{ at: 'heart', text: m.ra > 10 ? 'Right heart under pressure' : 'Right heart normal', by: 'Echo' }];
    if (id === 'fibroscan') return [{ at: 'liver', text: `Stiffness ${Math.round(m.lsm)} kPa`, by: 'FibroScan' }];
    return [];
  }
  function runOrder(id, o = {}) {
    const meta = ORDER_META[id], def = RUN[id];
    if (!meta || !def) return;
    log.push({ id, t: ctx.t });
    revealLabels(id);
    setTimeout(() => { if (cs) revealFindings(id); }, o.silent ? 0 : 1100);
    if (!cs.acute && COST[id]) ctx.spent += COST[id];
    if (id === 'hvpg' && !o.silent) api.runHvpg?.();
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
    if (miss.length) return 'You need a result first';
    if (s.needsAny && !s.needsAny.some((id) => log.some((l) => l.id === id))) return 'You need a result first';
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
    ctx.frozen = null; ctx.frozen = vit();
    // The model as it was when the decision opened, so the debrief can replay the expert's choice from here.
    if (!ctx.decSnap[s.id]) host.request('snapshot').then(({ snap }) => { if (ctx && !ctx.decSnap[s.id]) ctx.decSnap[s.id] = { snap, t: ctx.t, skips: ctx.skips.length }; }).catch(() => {});
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
    sample(true, s.title);
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
    // Every case ends by explaining it to the patient: the Explain skill gets its practice.
    const exp = EXPLAIN[cs.id];
    if (exp) {
      cs.steps = [...cs.steps, { id: 'explain', title: 'Explain it to the patient', q: (c0) => exp(c0).q, options: (c0) => exp(c0).options, answer: 0, get why() { return c ? exp(c).why : ''; } }];
      cs.objectives = [...cs.objectives, { id: 'explain', weight: 10, text: 'Explained it to the patient in plain words', check: (c0) => c0.met('explain') }];
    }
    cs.speed ||= 1;
    ctx = { t0: null, t: 0, clockAdd: 0, when: null, answers: {}, grades: {}, flags: {}, opened: new Set(), autoed: new Set(), unsafeHit: new Set(), viewed: new Set(['story']), order: {},
      story: [], items: [], snaps: [], spent: 0, skips: [], trend: [], decSnap: {}, lastSample: -1e9, tab: 'story', dot: false, open: null, sel: null, consequence: null, busy: true, ended: false, hbShown: null, lowFor: 0 };
    c = makeHandle();
    await prepare();
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

  // The patient: preset, aging, the case's own changes, what is hidden, then its setup (a bleed, say).
  async function prepare() {
    // Hide model-only events before the preset ages, so none from the patient's past reach the timeline.
    store.set({ hiddenEvents: visibilityOf(cs).events, found: new Set(cs.found || []) });
    await api.loadPreset(cs.preset, { keepLesson: true, days: cs.days });
    if (cs.prep) updateParams(cs.prep, { history: false });
    if (cs.afterDays) { host.send({ type: 'advance', days: cs.afterDays, restartClock: true }); host.send({ type: 'settle' }); await host.request('snapshot'); }
    if (cs.params) updateParams(cs.params, { history: false, settle: true });
    const vis = visibilityOf(cs);
    store.set({ hiddenLabels: new Set(['VAR', 'GV', ...LANES].filter((k) => !labelsFor(cs.found || []).includes(k))), hiddenReadouts: vis.hidden, hiddenEvents: vis.events, lastHVPG: null, locked: new Set(['!cirrhosis']), imaging: vis.imaging });
    api.setAllowedTools(cs.tools);
    api.muteEvents?.(true);
    await cs.setup?.(api, c);
    await sleep(250);
  }

  // The case's key measure over case time, for the debrief's trajectory: a point every few seconds,
  // one at each decision (a pin) and one after each skip (a break before it).
  const trendKey = () => cs.trend || cs.inside?.[0] || ['Portal pressure', 'pv', 'mmHg'];
  function sample(force, mark) {
    if (!cs || !ctx || !frame()) return;
    if (!force && ctx.t - ctx.lastSample < (cs.acute ? 15 : 5)) return;
    ctx.lastSample = ctx.t;
    const v = read()[trendKey()[1]];
    if (typeof v === 'number' && Number.isFinite(v)) ctx.trend.push({ T: ctx.t + ctx.clockAdd, v, ...(typeof mark === 'string' ? { pin: mark } : mark || {}) });
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
    sample();
    renderLive();
  }

  function exit() {
    if (!cs) return;
    const unit = ctx?.unit;
    clearInterval(timer); unbindKeys(); unitKeysOff?.(); unitKeysOff = null;
    cs = null; ctx = null; c = null;
    store.set({ hiddenLabels: null, hiddenReadouts: null, hiddenEvents: null, locked: null, imaging: false, found: null, ...(store.get().compareSnap?.names ? { compareSnap: null, compareView: 'B' } : {}) });
    api.setAllowedTools(null);
    api.muteEvents?.(false);
    host.send({ type: 'run', running: true, speed: 1 });
    store.set({ speed: 1 });
    root.replaceChildren();
    root.closest('.app')?.classList.remove('case-deciding');
    api.setBanner?.(null);
    if (unit) { setUnitSurface(false); coach?.replaceChildren(); liftOver(null); }
    api.endSession?.(unit ? 'unit' : 'case');
    api.onEnd?.();
    if (unit) onUnitEnd?.(unit.u);
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
          onclick: () => { if (done) { setTab('chart'); return; } runOrder(id, { silent: false }); render(); } }, h('span', {}, meta.label), done ? svgIcon('check') : g === 'assess' && !cs.acute && COST[id] ? h('small', { class: 'cs-cost' }, costText(COST[id])) : null);
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
    if (ctx.unit) { renderUnit(); return; }
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
  // The key measure over case time: decisions as numbered pins, skips as breaks in the line.
  function trendChart() {
    const pts = ctx.trend;
    if (pts.length < 2) return null;
    const [label, , unit] = trendKey();
    const W = 600, Hh = 150, L = 40, R = 12, T0 = 14, B = 26;
    const vs = pts.map((p) => p.v), lo0 = Math.min(...vs), hi0 = Math.max(...vs), pad = Math.max((hi0 - lo0) * 0.15, Math.abs(hi0) * 0.05, 1);
    const lo = lo0 - pad, hi = hi0 + pad;
    const X = (i) => L + ((W - L - R) * i) / (pts.length - 1), Y = (v) => T0 + (Hh - T0 - B) * (1 - (v - lo) / (hi - lo));
    let d = '', n = 0, marks = '';
    pts.forEach((p, i) => {
      if (p.skip && i) marks += `<line class="tc-break" x1="${X(i - 0.5)}" x2="${X(i - 0.5)}" y1="${T0}" y2="${Hh - B}"/><text class="tc-skip" x="${X(i - 0.5) + 4}" y="${T0 + 10}">${p.skip.replace(/[<&]/g, '')}</text>`;
      d += `${p.skip || !i ? 'M' : 'L'}${X(i).toFixed(1)} ${Y(p.v).toFixed(1)} `;
      if (p.pin) { n++; marks += `<g class="tc-pin"><title>${p.pin.replace(/[<&]/g, '')}</title><circle cx="${X(i)}" cy="${Y(p.v)}" r="9"/><text x="${X(i)}" y="${Y(p.v) + 4}">${n}</text></g>`; }
    });
    const fmtV = (v) => (Math.abs(hi - lo) < 20 ? v.toFixed(1) : Math.round(v));
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`); svg.setAttribute('class', 'cs-trendchart'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${label} over the case, from ${fmtV(pts[0].v)} to ${fmtV(pts.at(-1).v)} ${unit}`);
    svg.innerHTML = `<line class="tc-axis" x1="${L}" x2="${W - R}" y1="${Hh - B}" y2="${Hh - B}"/><text class="tc-y" x="${L - 6}" y="${Y(hi0) + 4}">${fmtV(hi0)}</text><text class="tc-y" x="${L - 6}" y="${Y(lo0) + 4}">${fmtV(lo0)}</text>`
      + `<text class="tc-x" x="${L}" y="${Hh - 8}">Start</text><text class="tc-x end" x="${W - R}" y="${Hh - 8}">End</text><path class="tc-line" d="${d}"/>${marks}`;
    return h('div', {}, h('h3', {}, `${label}${unit ? ` (${unit})` : ''} over the case`), h('p', { class: 'sub' }, 'Numbered pins are your decisions; dashed lines are skips in time.'), svg);
  }
  // Replay a missed decision the expert's way: from the model as it was when the decision opened, apply
  // the expert's option, run the same stretch of case time, then compare You (pinned) with Expert (live).
  async function tryExpert(s) {
    const d = ctx.decSnap[s.id], f = frame();
    if (!d || !f || ctx.replaying) return;
    ctx.replaying = true;
    const you = captureFrame(f, store.get().params), later = ctx.skips.slice(d.skips);
    closeModal();
    toast('Replaying the expert choice…');
    host.send({ type: 'restore', snap: d.snap }); replaceParams(d.snap.params);
    await sleep(150);
    const opts = optionsOf(s), pick = s.multi ? [].concat(val(s.answer, c)) : [].concat(val(s.answer, c))[0];
    for (const i of [].concat(pick)) for (const id of opts[i]?.does || []) RUN[id]?.run?.({ ...api, showPane: () => {} }, { silent: true }, c);
    try { await s.onCommit?.(c, pick); } catch (e) { console.error(e); }
    await host.request('preroll', { seconds: Math.min(Math.max(ctx.t - d.t, 5), 900) });
    for (const k of later) if (k.days) { host.send({ type: 'advance', days: k.days }); host.send({ type: 'settle' }); }
    await host.request('snapshot'); await sleep(300);
    store.set({ compareSnap: { ...you, label: 'Your choices', when: 'your choices', names: ['You', 'Expert'], changes: activeInterventions(you.params).map((a) => a.label) }, compareView: 'B' });
    toast(`Expert choice for “${s.title}”. Switch You, Expert and Change in the figure header.`);
    ctx.replaying = false;
  }
  function finish(outcome) {
    if (ctx.ended) return;
    ctx.ended = true; ctx.outcome = outcome; ctx.open = null; ctx.busy = false;
    clearInterval(timer); unbindKeys();
    host.send({ type: 'run', running: false });
    // The debrief switches on full X-ray vision: every finding, flow and pressure colour.
    store.set({ found: null, imaging: false, hiddenReadouts: null, hiddenLabels: null });
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
    const learnLink = (key) => { const l = LESSON_OF[`${cs.id}:${key}`]; return l ? h('a', { class: 'cs-learn', href: `?lesson=${l[0]}&step=${l[1]}` }, `Learn it: ${LESSON_TITLE[l[0]] || l[0]}`) : null; };
    // Tests: yours against the expert's (feedback, not a penalty).
    const ordered = [...new Set(log.filter((l) => ORDER_META[l.id]?.g === 'assess').map((l) => l.id))];
    const needed = val(cs.tests, c) || [];
    const tests = needed.length ? h('div', {}, h('h3', {}, 'Tests'),
      h('p', { class: 'sub' }, `${ordered.length} ordered, ${needed.length} needed${!cs.acute && ctx.spent ? ` · ${spentText(ctx.spent)} of case time on tests` : ''}.`),
      h('div', { class: 'cs-tests' }, [...needed.map((id) => h('span', { class: 'cs-test ' + (ordered.includes(id) ? 'ok' : 'miss') }, svgIcon(ordered.includes(id) ? 'check' : 'close'), ORDER_META[id]?.label || id)),
        ...ordered.filter((id) => !needed.includes(id)).map((id) => h('span', { class: 'cs-test extra' }, ORDER_META[id]?.label || id, h('small', {}, 'not needed')))])) : null;
    // Where the block was: the route strip and the full ladder, now that every rung is known.
    const group = store.get().presetList?.find((x) => x.id === cs.preset)?.group;
    const ladderBox = h('div', { class: 'cs-ladder' });
    const block = h('div', {}, h('h3', {}, 'Where the block was'), createRoute({ site: SITE_OF_GROUP[group] ?? null }).el, ladderBox);
    host.request('metrics').then(({ result }) => { if (result) ladderBox.replaceChildren(ladder(result, { base: SNAPSHOTS.healthy?.fp, reveal: true })); }).catch(() => {});
    const body = h('div', { class: 'debrief' },
      h('div', { class: 'score' }, ring, h('div', {}, h('b', {}, cs.title), h('div', { class: 'sub' }, `${cs.patient.name}, ${cs.patient.age}${cs.patient.sex} · ${met} of ${cs.objectives.length} key actions · ${res.mastered ? 'mastered' : `not mastered (needs ${MASTERY} %${cs.objectives.some((o) => o.critical) ? ' and every critical action' : ''})`}${res.failedCritical.length ? ` · critical missed: ${res.failedCritical.map((id) => cs.objectives.find((o) => o.id === id).text).join('; ')}` : ''}`))),
      h('h3', {}, 'Key actions'),
      h('div', { class: 'cs-keys' }, cs.objectives.map((o) => h('div', { class: 'goal' + (states[o.id] === 'met' ? ' met' : ' failed'), style: { marginBottom: 0 } }, h('span', { class: 'chk' }, svgIcon(states[o.id] === 'met' ? 'check' : 'close')), o.text, o.critical ? h('small', { class: 'cs-crit' }, 'critical') : null, states[o.id] === 'met' ? null : learnLink(o.id)))),
      trendChart(),
      h('h3', {}, 'Your decisions and the expert\'s'),
      h('div', { class: 'cs-cmp' }, decided.map((s) => h('div', { class: 'cs-cmp-row ' + (ctx.grades[s.id] ? 'ok' : 'miss') },
        h('b', {}, s.title), h('div', {}, h('span', {}, 'You'), mine(s)), ctx.grades[s.id] ? null : h('div', {}, h('span', {}, 'Expert'), best(s)), s.why ? h('p', {}, s.why) : null,
        ctx.grades[s.id] ? null : h('div', { class: 'cs-cmp-acts' }, ctx.decSnap[s.id] ? h('button', { class: 'btn sm', onclick: () => tryExpert(s) }, 'Try the expert choice') : null, learnLink(s.id))))),
      tests, block,
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

  // ───────────── course units 6–8: the case on the unit surface ─────────────
  // Presentation → Orders (up to three) → stems (A–E, immediate feedback; the pick plays on the model)
  // → Result (the clock moves on) → Debrief. The card at the bottom owns the screen; the Patient
  // sheet shows the story, the exam and the results, never the model's knobs.
  let unitKeysOff = null, unitCard = null, unitMin = false;
  const asWide = matchMedia('(max-width: 1279px)');
  asWide.addEventListener('change', () => { if (ctx?.unit) requestAnimationFrame(renderUnit); });
  const liftOver = (card) => {
    const wrap = document.getElementById('stageView')?.getBoundingClientRect(), q = card?.getBoundingClientRect();
    const px = card && wrap && q.height ? `${Math.round(wrap.bottom - q.top + 8)}px` : '';
    for (const b of document.querySelectorAll('.stage-credit, .zoom-pill, .stage-clock')) b.style.setProperty('--sheet-h', px);
  };
  const MAX_ORDERS = 3;
  const unitSteps = () => [{ kind: 'present', title: 'The patient' }, { kind: 'orders', title: 'Orders' }, ...ctx.unit.def.steps.map((s) => ({ ...s, kind: s.type })), { kind: 'result', title: 'Result' }, { kind: 'debrief', title: 'Debrief' }];

  async function startUnit(id) {
    const u = course.unit(id), def = CASE_UNITS[id], base = def && CASES.find((x) => x.id === def.caseId);
    if (!u || !base) { toast('That unit does not exist.'); return; }
    await api.beginSession?.('unit');
    log.length = 0; seed = def.seed;
    const v = base.variants?.[def.variant] || {};
    cs = { ...base, ...v, ...def.over, results: { ...base.results, ...def.over?.results }, steps: [], objectives: [], speed: 1 };
    ctx = { t0: null, t: 0, clockAdd: 0, when: null, answers: {}, grades: {}, flags: {}, opened: new Set(), autoed: new Set(), unsafeHit: new Set(), viewed: new Set(), order: {},
      story: [], items: [], snaps: [], spent: 0, skips: [], trend: [], decSnap: {}, lastSample: -1e9, tab: 'chart', dot: false, open: null, sel: null, consequence: null, busy: true, ended: false, hbShown: null, lowFor: 0,
      unit: { u, def, idx: 0, ready: false, sheet: false, sel: new Set(), ordered: false, picks: {}, cons: {}, watch: {}, entered: new Set(), result: null, playing: false, t0: Date.now() } };
    c = makeHandle();
    unitMin = false;
    setUnitSurface(true);
    unitKeysOff?.(); unitKeysOff = bindQuestionKeys(() => unitCard);
    renderUnit();
    await prepare();
    pause();
    if (!cs) return;
    for (const it of cs.chart(c)) ctx.items.push(it);
    ctx.flags.start = read();
    ctx.busy = false; ctx.unit.ready = true;
    renderUnit();
  }

  async function unitGo(i) {
    const U = ctx.unit, st = unitSteps()[i];
    U.idx = i; U.sheet = false;
    if (!U.entered.has(i)) {
      U.entered.add(i); ctx.busy = true; renderUnit();
      try {
        if (st.enter) await st.enter(c);
        if (st.kind === 'watch') U.watch[st.sid] = await st.run(c);
        if (st.kind === 'result') { const n = ctx.story.length; U.result = await U.def.result(c, U.picks); U.changes = ctx.story.slice(n).filter((e) => e.kind === 'change'); }
      } catch (e) { console.error(e); }
      ctx.busy = false;
    }
    renderUnit();
    if (unitCard) unitCard.scrollTop = 0;
  }
  function sendOrders() {
    const U = ctx.unit;
    if (!U.sel.size || U.ordered) return;
    U.ordered = true;
    for (const id of U.sel) runOrder(id, { silent: true });
    ctx.story.push({ kind: 'order', text: [...U.sel].map((id) => ORDER_META[id].label).join(', '), at: 0 });
    renderUnit();
  }
  async function pickStem(st, i) {
    const U = ctx.unit;
    if (U.picks[st.sid] != null || U.playing) return;
    U.picks[st.sid] = i; ctx.answers[st.sid] = i; ctx.grades[st.sid] = i === st.answer;
    log.push({ id: `Decision: ${st.title}`, t: ctx.t, key: `unit:${U.u.id}:${st.sid}`, correct: i === st.answer });
    U.playing = true; renderUnit();
    requestAnimationFrame(() => unitCard?.querySelector('.opt.wrong, .opt.right')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    try { U.cons[st.sid] = (await st.play?.(c, i)) || null; } catch (e) { console.error(e); }
    U.playing = false; renderUnit();
  }
  function unitScore() {
    const U = ctx.unit, stems = U.def.steps.filter((s) => s.type === 'stem');
    const ordered = [...new Set(log.filter((l) => ORDER_META[l.id]?.g === 'assess' && U.def.orders.includes(l.id)).map((l) => l.id))];
    const ordersOk = U.def.need.every((id) => ordered.includes(id));
    const right = stems.filter((s) => U.picks[s.sid] === s.answer).length + (ordersOk ? 1 : 0), total = stems.length + 1;
    return { stems, ordered, ordersOk, right, total, score: Math.round((100 * right) / total) };
  }
  function finishUnit() {
    const U = ctx.unit, r = unitScore();
    course.complete(U.u.id, r.score);
    addRecord({ kind: 'unit', id: U.u.id, title: U.u.title, score: r.score, assessment: ASSESSMENT_VERSION, contentVersion: CONTENT_VERSION, completed: true, mastered: r.score >= MASTERY,
      wallDuration: (Date.now() - U.t0) / 1000, duration: (Date.now() - U.t0) / 1000, met: r.right, total: r.total, seed,
      answers: [`unit:${U.u.id}:orders: ${r.ordersOk ? 'correct' : 'incorrect'}`, ...r.stems.map((s) => `unit:${U.u.id}:${s.sid}: ${U.picks[s.sid] === s.answer ? 'correct' : 'incorrect'}`)] });
    toast(`Unit ${U.u.n} complete: ${U.u.title} · ${r.score} %`);
    exit();
  }

  const whoLine = () => { const pt = cs.patient; return h('p', { class: 'cu-who' }, h('b', {}, pt.name), ` · ${pt.age}${pt.sex} · ${pt.setting}`); };
  const listBlock = (label, lines) => h('div', { class: 'cu-block' }, h('p', { class: 'step-label' }, label), h('ul', {}, lines.map((l) => h('li', {}, l))));
  const resultItems = () => ctx.items.filter((it) => it.section !== 'History' && it.section !== 'Exam');
  function patientSheet() {
    const res = resultItems();
    return [whoLine(), listBlock('Story', cs.hx || []), listBlock('Exam', cs.exam || []),
      res.length ? h('div', { class: 'cu-block' }, h('p', { class: 'step-label' }, 'Results'), res.map(itemEl)) : h('p', { class: 'cs-note' }, 'No tests ordered yet.')];
  }
  function stemBody(st) {
    const U = ctx.unit, got = U.picks[st.sid], done = got != null, cons = U.cons[st.sid];
    return [h('p', { class: 'stem-v' }, st.stem), h('p', { class: 'q' }, st.q),
      optionList({ options: st.options, picked: got ?? null, answer: st.answer, reveal: done, locked: done, notes: st.explain, onPick: (i) => pickStem(st, i) }),
      done ? h('div', { class: 'feedback ' + (got === st.answer ? 'right' : 'wrong'), role: 'status' }, h('b', {}, got === st.answer ? 'Correct. ' : `Not quite: the answer is ${'ABCDE'[st.answer]}. `), st.explain[st.answer]) : null,
      done && U.playing ? h('p', { class: 'cs-wait' }, 'The model is playing your choice…') : null,
      cons ? h('div', { class: 'cs-cons' + (cons.unsafe ? ' unsafe' : '') }, h('span', { class: 'cs-kicker' }, cons.unsafe ? 'What happened' : 'On the model'), h('h3', {}, cons.title), h('p', {}, cons.text),
        cons.rows?.length ? h('table', { class: 'cs-rows' }, h('tbody', {}, cons.rows.map((r) => h('tr', {}, h('td', {}, r[0]), h('td', {}, r[1]))))) : null) : null];
  }
  function ordersBody() {
    const U = ctx.unit, ids = U.def.orders;
    const btns = h('div', { class: 'cs-ord-grid' }, ids.map((id) => {
      const on = U.sel.has(id), full = !on && U.sel.size >= MAX_ORDERS;
      return h('button', { class: 'cs-ord' + (on ? ' on' : '') + (U.ordered && on ? ' done' : ''), 'aria-pressed': String(on), disabled: U.ordered || full,
        onclick: () => { on ? U.sel.delete(id) : U.sel.add(id); renderUnit(); } }, h('span', {}, ORDER_META[id].label), U.ordered && on ? svgIcon('check') : null);
    }));
    const res = resultItems().filter((it) => it.id.includes(':'));
    return [h('p', {}, U.ordered ? 'Results come back on the card; findings appear on the figure.' : `Choose up to ${MAX_ORDERS} tests, then send them.`), btns,
      U.ordered ? h('div', { class: 'cu-results' }, res.map(itemEl)) : null];
  }
  function debriefBody() {
    const U = ctx.unit, r = unitScore();
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), rr = 32, cc = 2 * Math.PI * rr, col = r.score >= MASTERY ? 'var(--ok)' : r.score >= 50 ? 'var(--caution)' : 'var(--danger)';
    ring.setAttribute('viewBox', '0 0 76 76'); ring.setAttribute('class', 'score-ring');
    ring.innerHTML = `<circle cx="38" cy="38" r="${rr}" fill="none" stroke="var(--surface-3)" stroke-width="6"/><circle cx="38" cy="38" r="${rr}" fill="none" stroke="${col}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(cc * r.score) / 100} ${cc}" transform="rotate(-90 38 38)"/><text x="38" y="44" text-anchor="middle" font-size="19" font-weight="600" fill="var(--text)" font-family="Inter, system-ui">${r.score}</text>`;
    const row = (ok, title, mine, best, why) => h('div', { class: 'cs-cmp-row ' + (ok ? 'ok' : 'miss') }, h('b', {}, title), h('div', {}, h('span', {}, 'You'), mine), ok ? null : h('div', {}, h('span', {}, 'Best'), best), why ? h('p', {}, why) : null);
    const lbl = (st, i) => (i == null ? 'Not answered' : `${'ABCDE'[i]}. ${st.options[i]}`);
    return [h('div', { class: 'score' }, ring, h('div', {}, h('b', {}, U.u.title), h('div', { class: 'sub' }, `${r.right} of ${r.total} right · ${cs.patient.name}, ${cs.patient.age}${cs.patient.sex}`))),
      h('div', { class: 'cs-cmp' },
        row(r.ordersOk, 'Orders', r.ordered.map((id) => ORDER_META[id].label).join(', ') || 'None', U.def.need.map((id) => ORDER_META[id].label).join(', '), U.def.orderNote),
        r.stems.map((st) => row(U.picks[st.sid] === st.answer, st.title, lbl(st, U.picks[st.sid]), lbl(st, st.answer), st.explain[st.answer]))),
      h('div', { class: 'pearls keypoints' }, h('p', { class: 'step-label' }, 'Key points'), h('ul', {}, U.u.keyPoints.map((t) => h('li', {}, t)))),
      cs.refs ? h('details', { class: 'cu-refs' }, h('summary', {}, 'References'), h('ol', { class: 'refs' }, cs.refs.map((x) => h('li', {}, x)))) : null,
      h('p', { class: 'disclaimer' }, 'Teaching model: it shows how pressure and flow behave; it does not predict an individual patient.')];
  }

  const cmpTable = (w) => h('table', { class: 'cs-rows cs-change cu-cmp' }, h('thead', {}, h('tr', {}, w.cols.map((x) => h('th', {}, x)))), h('tbody', {}, w.rows.map((r) => h('tr', {}, r.map((x) => h('td', {}, x))))));
  function renderUnit() {
    if (!ctx?.unit || !coach) return;
    const U = ctx.unit, steps = unitSteps(), st = steps[U.idx], last = U.idx === steps.length - 1;
    const body = [];
    let canNext = true, label = 'Continue', go = () => unitGo(U.idx + 1);
    if (!U.ready || (ctx.busy && !U.playing)) { body.push(h('p', { class: 'cs-wait' }, U.ready ? 'The model is moving on…' : 'Preparing the patient…')); canNext = false; }
    else if (U.sheet) { body.push(...patientSheet()); label = 'Back to the step'; go = () => { U.sheet = false; renderUnit(); }; }
    else if (st.kind === 'present') { body.push(whoLine(), ...cs.intro(c).map((t) => h('p', {}, t)), listBlock('Story', cs.hx || []), listBlock('Exam', cs.exam || [])); label = 'Order tests'; }
    else if (st.kind === 'orders') {
      body.push(...ordersBody());
      if (!U.ordered) { label = 'Send orders'; canNext = U.sel.size > 0; go = sendOrders; } else canNext = !resultItems().some((it) => it.pending);
    } else if (st.kind === 'stem') { body.push(...stemBody(st)); canNext = U.picks[st.sid] != null && !U.playing; }
    else if (st.kind === 'watch') {
      const w = U.watch[st.sid];
      body.push(h('p', {}, st.text), w ? cmpTable(w) : null);
    } else if (st.kind === 'result') {
      const k = U.result;
      if (k) body.push(h('div', { class: 'cs-cons' }, h('span', { class: 'cs-kicker' }, 'Result'), h('h3', {}, k.title), h('p', {}, k.text)), ...(U.changes || []).map(changeEl), k.table ? cmpTable(k.table) : null);
      label = 'See the debrief';
    } else if (st.kind === 'debrief') { body.push(...debriefBody()); label = 'Finish unit'; go = finishUnit; }
    const vitals = U.ready && !U.sheet && st.kind !== 'result' && !last ? h('div', { class: 'cs-vitals cu-vitals', role: 'group', 'aria-label': 'Vital signs' }) : null;
    if (vitals) renderVitals(vitals);
    const card = h('section', { class: 'lesson unit sheet cu-case', 'aria-label': `Unit ${U.u.n}: ${U.u.title}` },
      h('div', { class: 'lesson-top' }, unitBar(U.u, U.idx, steps.length),
        h('span', { class: 'lt-act' },
          U.ready && U.idx > 0 && !last ? h('button', { class: 'link', 'aria-pressed': String(U.sheet), onclick: () => { U.sheet = !U.sheet; renderUnit(); } }, 'Patient') : null,
          h('button', { class: 'link', onclick: exit }, 'Exit'),
          h('button', { class: 'ib sheet-min', 'aria-label': unitMin ? 'Expand the unit' : 'Minimize the unit', 'aria-expanded': String(!unitMin), onclick: () => { unitMin = !unitMin; renderUnit(); } }, svgIcon('chev-down')))),
      h('h3', { class: 'cu-title' }, U.sheet ? 'Patient' : st.title), vitals, ...body,
      h('div', { class: 'lesson-foot' }, h('span'), h('button', { class: 'btn primary', disabled: !canNext, onclick: go }, label, svgIcon('chev-right'))));
    const top = unitCard?.isConnected ? coach.scrollTop : 0, same = unitCard?.dataset.step === String(U.idx) + U.sheet;
    card.dataset.step = String(U.idx) + U.sheet;
    card.classList.toggle('min', unitMin);
    coach.replaceChildren(card); unitCard = card;
    coach.dataset.safe = 'bottom';
    if (same) coach.scrollTop = top;
    requestAnimationFrame(() => { liftOver(card); dispatchEvent(new Event('resize')); });
  }

  return {
    mount() { if (cs) render(); else root.replaceChildren(); },
    start,
    startUnit,
    active: () => !!cs,
    exit,
  };
}
