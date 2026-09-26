// Cases (blueprint §10.4; plan §5.2–5.3): clinical scenarios as state machines with objectives,
// a bedside monitor, orders, one visibility map for what the clinician cannot know, randomized
// variants, and a printable debrief with a counterfactual replayed in a separate engine.

import { store, updateParams } from './store.js?v=4bf5a96a9d';
import { host } from './host.js?v=0917f25b24';
import { h, fmt, openModal, closeModal, toast, svgIcon } from './util.js?v=13768f12bf';
import { addRecord, exportCSV, exportXAPI } from './records.js?v=26ab8fb634';

const ACTIONS = {
  crystalloid: { label: '1 L crystalloid', run: (a) => a.action({ kind: 'infuse', fluid: 'crystalloid' }) },
  prbc: { label: 'Transfuse 1 unit PRBC', run: (a) => a.action({ kind: 'infuse', fluid: 'prbc' }) },
  terlipressin: { label: 'Terlipressin', toggle: (p) => p.drugs.terlipressin, run: () => updateParams((p) => { p.drugs.terlipressin = !p.drugs.terlipressin; return p; }, { label: 'Terlipressin' }) },
  octreotide: { label: 'Octreotide', toggle: (p) => p.drugs.octreotide, run: () => updateParams((p) => { p.drugs.octreotide = !p.drugs.octreotide; return p; }, { label: 'Octreotide' }) },
  ceftriaxone: { label: 'Ceftriaxone (prophylaxis)', once: true, run: () => toast('Antibiotic prophylaxis given: reduces infection, rebleeding and mortality.') },
  evl: { label: 'Endoscopy + band ligation', run: (a) => { a.action({ kind: 'band' }); a.showPane('endoscopy'); } },
  balloon: { label: 'Balloon tamponade', toggle: (p) => p.balloonEso, run: () => updateParams((p) => { p.balloonEso = !p.balloonEso; return p; }, { label: 'Balloon' }) },
  tips8: { label: 'TIPS 8 mm', toggle: (p) => p.tips.on && p.tips.d === 8, run: () => updateParams({ tips: { on: true, d: 8 } }, { label: 'TIPS 8 mm' }) },
  tips10: { label: 'TIPS 10 mm', toggle: (p) => p.tips.on && p.tips.d === 10, run: () => updateParams({ tips: { on: true, d: 10 } }, { label: 'TIPS 10 mm' }) },
  paracentesis: { label: 'Paracentesis 5 L + albumin', run: (a) => a.action({ kind: 'paracentesis', mL: 5000, albumin: true }) },
  diuretics: { label: 'Diuretics', toggle: (p) => p.diuretics, run: () => updateParams((p) => { p.diuretics = !p.diuretics; return p; }, { label: 'Diuretics' }) },
  carvedilol: { label: 'Carvedilol', toggle: (p) => p.drugs.carvedilol, run: () => updateParams((p) => { p.drugs.carvedilol = !p.drugs.carvedilol; return p; }, { label: 'Carvedilol' }) },
  echo: { label: 'Echocardiogram', once: true, run: (a) => { const s = store.get().hiddenReadouts; s?.delete('ra'); store.set({ hiddenReadouts: new Set(s || []) }); const f = store.get().frame; toast(`Echo: RA pressure ≈ ${fmt(f.metrics.ra, 0)} mmHg${store.get().params.tr > 0.3 ? ', severe tricuspid regurgitation' : ''}.`); } },
  doppler: { label: 'Doppler ultrasound', run: (a) => { a.showPane('doppler'); toast('Click a vessel and choose Doppler, or pick the vessel in the Doppler instrument.'); } },
  hvpg: { label: 'Hepatic vein catheterization', run: (a) => { a.showPane('hvpg'); a.select?.({ type: 'edge', id: 'RHV_IVC' }); toast('Choose Wedge → HVPG on the hepatic vein card.'); } },
  endoscopy: { label: 'Endoscopy', run: (a) => { a.showPane('endoscopy'); } },
  ascitic: { label: 'Diagnostic paracentesis', once: true, run: () => { const m = store.get().frame.metrics; toast(m.ascites.volume > 150 ? `Ascitic fluid: SAAG ${m.ppg > 6 || m.whvp > 10 ? '≥ 1.1' : '< 1.1'}, protein ${m.ascites.highProtein ? '> 2.5' : '< 2.5'} g/dL.` : 'No tappable ascites.'); } },
};

const fmtClock = (s) => { const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min ${String(Math.floor(s % 60)).padStart(2, '0')} s`; };

export const CASES = [
  {
    id: 'bleed', title: 'Night shift: hematemesis', level: 'Acute care',
    summary: 'A 54-year-old with decompensated alcohol-related cirrhosis vomits blood. HR climbing, MAP falling.',
    preset: 'cirr-decomp', speed: 6, hidden: ['trueHVPG', 'pv'], tools: ['select', 'endoscope', 'balloon'],
    actions: ['crystalloid', 'prbc', 'terlipressin', 'octreotide', 'ceftriaxone', 'evl', 'balloon', 'tips8'],
    // Each attempt is a variant: tear size and how long the patient bled before arrival differ,
    // so the numbers can't be passed around. The pre-roll makes the opening vitals match the story.
    variant: (r) => ({ tear: 0.65 + 0.3 * r(), preroll: 120 + Math.round(180 * r()) }),
    setup: (a, v) => a.action({ kind: 'rupture', site: 'VAR', tear: v.tear ?? 0.8 }),
    counterfactual: true,
    refs: ['de Franchis R, et al. Baveno VII: renewing consensus in portal hypertension. J Hepatol 2022;76:959–74.', 'Kaplan DE, et al. AASLD Practice Guidance on risk stratification and management of portal hypertension and varices in cirrhosis. Hepatology 2024;79:1180–1211.', 'Villanueva C, et al. Transfusion strategies for acute upper gastrointestinal bleeding. N Engl J Med 2013;368:11–21.'],
    objectives: [
      { id: 'vaso', text: 'Start a vasoactive drug within 10 minutes', check: (c) => (c.first('terlipressin', 'octreotide') != null && c.first('terlipressin', 'octreotide') <= 600 ? 'met' : c.t > 600 ? 'failed' : null) },
      { id: 'abx', text: 'Give antibiotic prophylaxis', check: (c) => (c.first('ceftriaxone') != null ? 'met' : null) },
      { id: 'map', text: 'Keep MAP ≥ 65 mmHg (after the first 5 minutes)', check: (c) => (c.t > 300 && c.m.map < 60 ? 'failed' : c.ended && !c.failedMap ? 'met' : null) },
      { id: 'restrict', text: 'Restrictive transfusion: don’t push Hb above 9 g/dL', check: (c) => (c.maxHbAfterTx > 9.5 ? 'failed' : c.ended ? 'met' : null) },
      { id: 'evl', text: 'Endoscopic therapy within 30 minutes', check: (c) => (c.first('evl') != null && c.first('evl') <= 1800 ? 'met' : c.t > 1800 ? 'failed' : null) },
      { id: 'stop', text: 'Control the bleeding', check: (c) => (!c.f.bleed.active ? 'met' : null) },
    ],
    end: (c) => (c.m.map < 45 && c.lowFor > 60 ? 'death' : !c.f.bleed.active && c.stableFor > 300 ? 'success' : c.t > 3600 ? 'timeout' : null),
    debrief: (c) => `Blood lost: ${Math.round(c.f.metrics.blood.lost)} mL. Lowest MAP ${Math.round(c.minMap)} mmHg. Max portal pressure ${fmt(c.maxPV, 1)} mmHg.\n\nKey physiology: variceal bleeding lowers portal pressure (hypovolemia) and the bleeding may pause. Over-transfusion refills the splanchnic veins and raises portal pressure again, which provokes rebleeding. That is why the transfusion target is Hb ~7–8 g/dL. Vasoactive drugs lower portal inflow within minutes. Band ligation removes the bleeding source. Pre-emptive TIPS (≤ 72 h) benefits high-risk patients (Child C < 14 or B > 7 with active bleeding).`,
  },
  {
    id: 'gastric', title: 'Isolated gastric varices', level: 'Diagnosis',
    summary: 'A 46-year-old with recurrent pancreatitis has melena. Endoscopy shows fundal varices, but no esophageal varices. Liver tests are normal.',
    preset: 'svt', speed: 1, hidden: ['trueHVPG', 'pv'], tools: ['select', 'doppler', 'catheter', 'endoscope'],
    actions: ['doppler', 'hvpg', 'endoscopy'],
    refs: ['Köklü S, et al. Left-sided portal hypertension. Dig Dis Sci 2007;52:1141–9.', 'de Franchis R, et al. Baveno VII. J Hepatol 2022;76:959–74.'],
    quiz: [
      { q: 'What is the most likely cause?', options: ['Cirrhosis', 'Splenic vein thrombosis (sinistral portal hypertension)', 'Budd–Chiari syndrome', 'Right heart failure'], answer: 1 },
      { q: 'Best definitive treatment?', options: ['TIPS', 'Splenectomy or splenic artery embolization', 'Liver transplant', 'Propranolol alone'], answer: 1 },
    ],
    objectives: [
      { id: 'look', text: 'Investigate with Doppler or HVPG', check: (c) => (c.first('doppler', 'hvpg') != null ? 'met' : null) },
      { id: 'dx', text: 'Make the diagnosis', check: (c) => c.quizState(0) },
      { id: 'rx', text: 'Choose the treatment', check: (c) => c.quizState(1) },
    ],
    end: (c) => (c.quizDone() ? 'success' : null),
    debrief: () => 'Splenic vein thrombosis isolates the splenic territory: the spleen drains through the short gastric veins into the fundus. Portal pressure and HVPG are normal. The Doppler shows an occluded splenic vein with normal portal flow. Removing the splenic inflow (splenectomy or splenic artery embolization) cures it; TIPS would not help.',
  },
  {
    id: 'cardiac', title: 'New ascites, normal HVPG', level: 'Diagnosis',
    summary: 'A 68-year-old with previous rheumatic fever has leg swelling and new ascites. The liver is enlarged and pulsatile.',
    preset: 'rhf', speed: 1, hidden: ['trueHVPG', 'pv', 'ra'], tools: ['select', 'doppler', 'catheter'], params: { pulsatile: true },
    actions: ['doppler', 'hvpg', 'ascitic', 'echo'],
    refs: ['Møller S, Bernardi M. Interactions of the heart and the liver. Eur Heart J 2013;34:2804–11.', 'Runyon BA, et al. The serum-ascites albumin gradient is superior to the exudate-transudate concept. Ann Intern Med 1992;117:215–20.'],
    quiz: [
      { q: 'Which pattern fits?', options: ['High HVPG, low-protein ascites', 'Normal HVPG with high WHVP & FHVP, protein-rich ascites', 'Normal WHVP, high portal pressure'], answer: 1 },
      { q: 'Diagnosis?', options: ['Cirrhosis', 'Congestive hepatopathy from right heart failure / TR', 'Portal vein thrombosis'], answer: 1 },
    ],
    objectives: [
      { id: 'hvpg', text: 'Measure the HVPG', check: () => (store.get().lastHVPG ? 'met' : null) },
      { id: 'tap', text: 'Analyze the ascitic fluid', check: (c) => (c.first('ascitic') != null ? 'met' : null) },
      { id: 'dx', text: 'Interpret the pattern', check: (c) => c.quizState(0) },
      { id: 'dx2', text: 'Make the diagnosis', check: (c) => c.quizState(1) },
    ],
    end: (c) => (c.quizDone() ? 'success' : null),
    debrief: () => 'Right-sided pressure transmits backward: FHVP and WHVP rise together, so the HVPG stays normal. The leaky, congested sinusoids make a protein-rich ascites (SAAG ≥ 1.1, protein > 2.5 g/dL). The portal vein Doppler becomes pulsatile or to-and-fro. Treat the heart.',
  },
  {
    id: 'refractory', title: 'Refractory ascites: TIPS or not?', level: 'Management',
    summary: 'Tense ascites despite diuretics, paracenteses every 2 weeks. Decide on decompression without tipping the patient into encephalopathy.',
    preset: 'cirr-decomp', days: 200, variant: (r) => ({ days: 150 + Math.round(110 * r()) }), prep: (p) => { p.diuretics = false; return p; },
    refs: ['Bureau C, et al. Transjugular intrahepatic portosystemic shunts with covered stents increase transplant-free survival of patients with cirrhosis and recurrent ascites. Gastroenterology 2017;152:157–63.', 'Wang Q, et al. Comparison of 8 mm vs 10 mm covered TIPS stents. J Hepatol 2017;67:508–16.'], speed: 1, hidden: ['trueHVPG'], tools: ['select', 'needle', 'stent'],
    actions: ['paracentesis', 'diuretics', 'tips8', 'tips10', 'carvedilol'],
    objectives: [
      { id: 'iap', text: 'Relieve intra-abdominal hypertension (IAP < 10 mmHg)', check: (c) => (c.m.ascites.iap < 10 ? 'met' : null) },
      { id: 'ppg', text: 'Bring the portosystemic gradient below 12 mmHg', check: (c) => (c.m.ppg < 12 ? 'met' : null) },
      { id: 'he', text: 'Keep the shunt fraction below 70 % (encephalopathy)', check: (c) => (c.m.shuntFraction > 0.7 && c.params.tips.on ? 'failed' : c.ended ? 'met' : null) },
      { id: 'perf', text: 'Keep liver perfusion above 50 %', check: (c) => (c.m.liverPerfPct < 50 && c.params.tips.on ? 'failed' : c.ended ? 'met' : null) },
    ],
    end: (c) => (c.params.tips.on && c.m.ppg < 12 && c.m.ascites.iap < 10 && c.t > 30 ? 'success' : null),
    debrief: (c) => `Final PPG ${fmt(c.m.ppg, 1)} mmHg, shunt fraction ${Math.round(c.m.shuntFraction * 100)} %, liver perfusion ${Math.round(c.m.liverPerfPct)} %.\n\nSmaller covered stents (8 mm) often reach the PPG target with a lower shunt fraction and less encephalopathy than 10 mm stents. Resistance scales with d⁴, so a 10 mm stent has ~2.4× the conductance of an 8 mm stent. Large-volume paracentesis needs albumin (8 g/L) to prevent circulatory dysfunction.`,
  },
];

// One visibility map per case: what the clinician cannot know is hidden everywhere at once:
// readouts in the chart and dock, pressure labels and color on the figure, the lobule, and
// story events that would give the answer away (a model-only 'HVPG ≥ 12' in a case where HVPG
// has to be measured).
const MODEL_ONLY_EVENTS = ['CSPH', 'BLEED_RISK', 'RED_WALE', 'HIGH_SHUNT', 'LIVER_HYPOPERFUSION', 'INTRAHEPATIC_REVERSAL', 'CAUDATE'];
export function visibilityOf(cs) {
  const hidden = new Set(cs.hidden || []);
  const imaging = hidden.has('pv');
  if (imaging) hidden.add('model');
  const events = new Set(imaging ? MODEL_ONLY_EVENTS : []);
  if (hidden.has('ra')) events.add('RA_HIGH');
  return { hidden, imaging, events };
}
const rngOf = (seed) => { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };

// Bedside monitor rows: color and scale like a real monitor.
const MONITOR = [
  { k: 'hr', lbl: 'HR', unit: '/min', col: '#3BE37A', v: (m) => m.hr, d: 0, lo: 40, hi: 160, bad: (m) => m.hr > 110 },
  { k: 'map', lbl: 'MAP', unit: 'mmHg', col: '#FF5566', v: (m) => m.map, d: 0, lo: 30, hi: 120, bad: (m) => m.map < 65 },
  { k: 'hb', lbl: 'Hb', unit: 'g/dL', col: '#F2F2F2', v: (m) => m.blood.hb, d: 1, lo: 4, hi: 16, bad: (m) => m.blood.hb < 7 },
  { k: 'cvp', lbl: 'CVP', unit: 'mmHg', col: '#F7D154', v: (m) => m.ra, d: 0, lo: 0, hi: 25, bad: () => false, hideKey: 'ra' },
  { k: 'loss', lbl: 'Blood loss', unit: 'mL', col: '#FF9A3C', v: (m) => m.blood.lost, d: 0, lo: 0, hi: 3000, bad: (m) => m.blood.shock >= 2 },
  { k: 'iap', lbl: 'IAP', unit: 'mmHg', col: '#6FC8FF', v: (m) => m.ascites.iap, d: 0, lo: 0, hi: 25, bad: (m) => m.ascites.iap >= 12 },
];

export function createCases({ root, api }) {
  let cs = null, ctx = null, timer = null;
  const log = [];

  let seed = 0, variant = {}, startSnap = null, trend = {};
  async function start(id, opts = {}) {
    await api.beginSession?.('case');
    cs = CASES.find((c) => c.id === id);
    log.length = 0;
    seed = opts.seed ?? Math.floor(1000 + Math.random() * 9000);
    variant = cs.variant ? cs.variant(rngOf(seed)) : {};
    await api.loadPreset(cs.preset, { keepLesson: true, days: variant.days ?? cs.days });
    if (cs.prep) updateParams(cs.prep, { history: false });
    if (cs.params) updateParams(cs.params, { history: false });
    const vis = visibilityOf(cs);
    store.set({ hiddenReadouts: vis.hidden, hiddenEvents: vis.events, lastHVPG: null, locked: new Set(['!cirrhosis']), imaging: vis.imaging });
    api.setAllowedTools(cs.tools);
    api.muteEvents?.(true); // the case panel carries the clinical story; only critical events interrupt
    cs.setup?.(api, variant);
    const pre = variant.preroll ?? cs.preroll;
    if (pre) await host.request('preroll', { seconds: pre });
    startSnap = cs.counterfactual ? (await host.request('snapshot')).snap : null;
    host.send({ type: 'run', running: true, speed: cs.speed, clock: 'hemo' });
    store.set({ speed: cs.speed });
    ctx = { t0: null, t: 0, quiz: {}, minMap: 999, maxPV: 0, maxHbAfterTx: 0, lowFor: 0, stableFor: 0, obj: {}, ended: false, outcome: null, params0: structuredClone(store.get().params) };
    trend = {};
    render();
    clearInterval(timer);
    timer = setInterval(tick, 250);
  }

  function makeCtx(f) {
    const c = ctx;
    c.f = f; c.m = f.metrics; c.params = store.get().params;
    if (c.t0 == null) c.t0 = f.t;
    c.t = Math.max(0, f.t - c.t0);
    c.first = (...ids) => { const x = log.find((l) => ids.includes(l.id)); return x ? x.t : null; };
    c.quizState = (i) => (c.quiz[i] == null ? null : c.quiz[i] === cs.quiz[i].answer ? 'met' : 'failed');
    c.quizDone = () => cs.quiz && cs.quiz.every((_, i) => c.quiz[i] != null);
    return c;
  }

  function tick() {
    const f = store.get().frame;
    if (!cs || !f || ctx.ended) return;
    const c = makeCtx(f);
    c.minMap = Math.min(c.minMap, c.m.map);
    c.maxPV = Math.max(c.maxPV, c.m.pv);
    if (log.some((l) => l.id === 'prbc')) c.maxHbAfterTx = Math.max(c.maxHbAfterTx, c.m.blood.hb);
    for (const r of MONITOR) { const a = (trend[r.k] ||= []); a.push(r.v(c.m)); if (a.length > 240) a.shift(); }
    c.lowFor = c.m.map < 45 ? c.lowFor + 0.25 * cs.speed : 0;
    c.stableFor = !f.bleed.active && c.m.map > 60 ? c.stableFor + 0.25 * cs.speed : 0;
    if (c.t > 300 && c.m.map < 60) c.failedMap = true;
    for (const o of cs.objectives) { if (c.obj[o.id] === 'met' || c.obj[o.id] === 'failed') continue; const r = o.check(c); if (r) c.obj[o.id] = r; }
    const out = cs.end(c);
    if (out) finish(out);
    renderLive();
  }

  // Counterfactual: replay the attempt from the case's first moment in a separate engine, once
  // as it happened and once with the most important decision made on time, and compare.
  function counterfactualPlans() {
    const plan = log.filter((l) => l.params || l.action).map((l) => ({ t: l.t, params: l.params, action: l.action }));
    const tv = log.find((l) => l.id === 'terlipressin' || l.id === 'octreotide')?.t;
    const te = log.find((l) => l.id === 'evl')?.t;
    const withDrug = (p) => { const q = structuredClone(p); q.drugs.terlipressin = true; return q; };
    const out = [];
    if (tv == null || tv > 120) {
      const at = 120, before = [...plan].reverse().find((x) => x.params && x.t <= at)?.params || ctx.params0;
      const alt = plan.map((x) => (x.t > at && x.params ? { ...x, params: withDrug(x.params) } : x));
      alt.push({ t: at, params: withDrug(before) });
      out.push({ label: 'had terlipressin been started at minute 2', alt });
    }
    if (te == null || te > 600) {
      const alt = plan.filter((x) => !(x.action?.kind === 'band'));
      alt.push({ t: 600, action: { kind: 'band' } });
      out.push({ label: 'had the varices been banded at minute 10', alt });
    }
    if (log.some((l) => l.id === 'prbc') && ctx.maxHbAfterTx > 9) out.push({ label: 'without the transfusions', alt: plan.filter((x) => !(x.action?.kind === 'infuse' && x.action.fluid === 'prbc')) });
    return { actual: plan, alts: out };
  }

  function finish(outcome) {
    ctx.ended = true; ctx.outcome = outcome;
    const c = makeCtx(store.get().frame);
    for (const o of cs.objectives) if (!c.obj[o.id]) c.obj[o.id] = o.check(c) || 'failed';
    clearInterval(timer);
    host.send({ type: 'run', running: false });
    const met = cs.objectives.filter((o) => c.obj[o.id] === 'met').length;
    const score = Math.round((met / cs.objectives.length) * 100 * (outcome === 'death' ? 0.4 : outcome === 'timeout' ? 0.8 : 1));
    const title = { success: 'Case complete', death: 'The patient died', timeout: 'Time is up' }[outcome];
    try { const best = JSON.parse(localStorage.getItem('pps.caseScores') || '{}'); best[cs.id] = Math.max(best[cs.id] || 0, score); localStorage.setItem('pps.caseScores', JSON.stringify(best)); } catch { /* storage unavailable */ }
    addRecord({ kind: 'case', id: cs.id, title: cs.title, variant: seed, score, outcome, duration: c.t, met, total: cs.objectives.length,
      objectives: cs.objectives.map((o) => ({ text: o.text, state: c.obj[o.id] })), answers: log.map((l) => `${fmtClock(l.t)} ${ACTIONS[l.id]?.label || l.id}`) });
    const ring = (() => {
      const r = 32, cc = 2 * Math.PI * r, col = score >= 80 ? 'var(--ok)' : score >= 50 ? 'var(--caution)' : 'var(--danger)';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 76 76'); svg.setAttribute('class', 'score-ring');
      svg.innerHTML = `<circle cx="38" cy="38" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="6"/><circle cx="38" cy="38" r="${r}" fill="none" stroke="${col}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${(cc * score) / 100} ${cc}" transform="rotate(-90 38 38)"/><text x="38" y="44" text-anchor="middle" font-size="19" font-weight="600" fill="var(--text)" font-family="Inter, system-ui">${score}</text>`;
      return svg;
    })();
    const cfEl = h('div', { class: 'cf' });
    const cf = cs.counterfactual && startSnap && c.t > 30 ? counterfactualPlans() : null;
    if (cf?.alts.length) {
      cfEl.append(h('p', { class: 'sub' }, 'Replaying your case in a separate model…'));
      // At least the first 15 minutes, so an earlier decision has time to show its effect; past
      // the student's last order, every replay simply continues.
      const seconds = Math.min(3600, Math.max(900, c.t));
      const run = (plan) => host.request('counterfactual', { snap: startSnap, plan, seconds }).then((r) => r.result);
      Promise.all([run(cf.actual), ...cf.alts.map((x) => run(x.alt))]).then(([A, ...Bs]) => {
        // Show the alternative that would have changed the most.
        const gain = (B) => (A.lost - B.lost) + 20 * (B.minMap - A.minMap) + (A.bleeding && !B.bleeding ? 300 : 0);
        let bi = 0; Bs.forEach((B, i) => { if (gain(B) > gain(Bs[bi])) bi = i; });
        const B = Bs[bi];
        if (gain(B) < 60) { cfEl.replaceChildren(h('p', {}, `Your key decisions were timely: replaying the earlier alternatives (${cf.alts.map((x) => x.label).join('; ')}) changed the outcome by less than 60 mL of blood.`)); return; }
        const row = (k, x, y, better) => h('tr', {}, h('td', {}, k), h('td', {}, x), h('td', { class: better ? 'good' : '' }, y));
        cfEl.replaceChildren(
          h('p', {}, `What would have happened ${cf.alts[bi].label}, over the first ${fmtClock(seconds)}:`),
          h('table', { class: 'cmp-table' }, h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Your case'), h('th', {}, 'Counterfactual'))),
            h('tbody', {}, row('Blood lost', `${Math.round(A.lost)} mL`, `${Math.round(B.lost)} mL`, B.lost < A.lost - 50),
              row('Lowest MAP', `${Math.round(A.minMap)} mmHg`, `${Math.round(B.minMap)} mmHg`, B.minMap > A.minMap + 2),
              row('Hb at the end', `${fmt(A.hb, 1)} g/dL`, `${fmt(B.hb, 1)} g/dL`, B.hb > A.hb + 0.2),
              row('Bleeding at the end', A.bleeding ? 'ongoing' : 'stopped', B.bleeding ? 'ongoing' : 'stopped', A.bleeding && !B.bleeding))),
          h('p', { class: 'ctl-sub' }, 'Both columns replay the same starting moment in the same model, so the difference is that decision alone.'));
      });
    } else if (cs.counterfactual) cfEl.append(h('p', { class: 'sub' }, 'Your key decisions were already timely: there is no earlier decision to replay.'));
    const body = h('div', { class: 'debrief' },
      h('div', { class: 'score' }, ring, h('div', {}, h('b', {}, cs.title), h('div', { class: 'sub' }, `${met} of ${cs.objectives.length} objectives met · clinical time ${fmtClock(c.t)} · variant ${seed}`))),
      h('h3', {}, 'Objectives'),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, cs.objectives.map((o) => h('div', { class: 'goal' + (c.obj[o.id] === 'met' ? ' met' : c.obj[o.id] === 'failed' ? ' failed' : ''), style: { marginBottom: 0 } }, h('span', { class: 'chk' }, svgIcon(c.obj[o.id] === 'failed' ? 'close' : 'check')), o.text))),
      h('h3', {}, 'Your decisions'),
      log.length ? h('div', { class: 'event-log' }, log.map((l) => h('div', { class: 'event-row', style: { gridTemplateColumns: '96px 1fr' } }, h('span', { class: 'when' }, fmtClock(l.t)), h('span', {}, ACTIONS[l.id]?.label || l.id)))) : h('p', { class: 'sub' }, 'No actions taken.'),
      cs.counterfactual ? [h('h3', {}, 'Counterfactual'), cfEl] : null,
      h('h3', {}, 'Debrief'),
      ...cs.debrief(c).split('\n\n').map((p) => h('p', {}, p)),
      cs.refs ? [h('h3', {}, 'References'), h('ol', { class: 'refs' }, cs.refs.map((r) => h('li', {}, r)))] : null,
      h('p', { class: 'disclaimer' }, 'Educational simulation with illustrative values; not for clinical decisions.'),
      h('div', { class: 'btn-row no-print', style: { marginTop: '18px' } },
        h('button', { class: 'btn primary', onclick: () => { closeModal(); start(cs.id); } }, 'Try another variant'),
        h('button', { class: 'btn', onclick: () => { document.body.classList.add('print-report'); window.print(); setTimeout(() => document.body.classList.remove('print-report'), 500); } }, 'Print report'),
        h('button', { class: 'btn', onclick: exportCSV }, 'Export records (CSV)'),
        h('button', { class: 'btn', onclick: exportXAPI }, 'xAPI'),
        h('button', { class: 'btn ghost', onclick: () => { closeModal(); exit(); } }, 'All cases')));
    openModal(title, body, { wide: true, sub: `Case debrief · ${cs.level} · ${new Date().toLocaleString()}` });
  }

  function exit() {
    if (!cs) return;
    clearInterval(timer);
    cs = null; ctx = null;
    store.set({ hiddenReadouts: null, hiddenEvents: null, locked: null, imaging: false });
    api.setAllowedTools(null);
    api.muteEvents?.(false);
    host.send({ type: 'run', running: true, speed: 1 });
    store.set({ speed: 1 });
    root.replaceChildren();
    api.setBanner?.(null);
    api.endSession?.('case');
    api.onEnd?.();
  }

  let liveEls = null, lastBanner = '';
  function render() {
    // Bedside monitor: dark strip, monitor colors, a 60-second trend under each number.
    const vit = h('div', { class: 'monitor', role: 'group', 'aria-label': 'Bedside monitor' }, MONITOR.map((r) =>
      h('div', { class: 'mon', 'data-k': r.k, style: { '--mc': r.col } }, h('span', { class: 'ml' }, r.lbl, h('i', {}, r.unit)), h('b', { class: 'mv' }, '—'), h('canvas', { class: 'mt', width: 120, height: 26, 'aria-hidden': 'true' }))),
    h('div', { class: 'mon-status' }));
    const objs = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } });
    const clock = h('b', {}, '0 min');
    const acts = h('div', { class: 'case-actions' }, cs.actions.map((id) => {
      const a = ACTIONS[id];
      const b = h('button', { class: 'btn', 'data-act': id }, a.label);
      b.addEventListener('click', () => {
        if (ctx.ended) return;
        if (a.once && log.some((l) => l.id === id)) return toast('Already done.');
        const entry = { id, t: ctx.t };
        log.push(entry);
        a.run({ ...api, action: (x) => { entry.action = x; api.action(x); } });
        entry.params = structuredClone(store.get().params);
        renderLive();
      });
      return b;
    }));
    const quiz = cs.quiz ? h('div', {}, cs.quiz.map((qq, qi) => h('div', { style: { marginTop: '4px' } }, h('p', { class: 'q', style: { margin: '0 0 8px', fontWeight: 600, fontSize: '13.5px' } }, qq.q),
      h('div', { class: 'opts', style: { margin: '0 0 12px' } }, qq.options.map((o, i) => {
        const b = h('button', { class: 'opt' }, h('span', { class: 'letter' }, 'ABCDE'[i]), h('span', {}, o));
        b.addEventListener('click', () => { if (ctx.quiz[qi] != null) return; ctx.quiz[qi] = i; b.classList.add(i === qq.answer ? 'right' : 'wrong'); if (i !== qq.answer) b.parentElement.children[qq.answer].classList.add('right'); [...b.parentElement.children].forEach((x) => { x.disabled = true; }); log.push({ id: `Answer ${qi + 1}: ${o}`, t: ctx.t }); });
        return b;
      }))))) : null;
    root.replaceChildren(
      h('div', { class: 'p-head case-head' }, h('div', { class: 'p-head-row' }, h('div', { class: 'p-title' }, h('span', { class: 'kicker' }, `Case · ${cs.level}`), h('h2', {}, cs.title)), h('button', { class: 'btn sm', onclick: exit }, 'Exit case'))),
      h('div', { class: 'p-body', style: { display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '14px' } },
        h('p', { class: 'sub', style: { margin: 0, fontSize: '13.5px', color: 'var(--text)' } }, cs.summary),
        h('div', { class: 'case-clock' }, h('span', { class: 'overline' }, 'Clinical time'), clock, cs.variant ? h('span', { class: 'variant' }, `Variant ${seed}`) : null),
        vit,
        h('div', { class: 'subhead', style: { marginBottom: '-6px' } }, 'Orders'), acts,
        quiz,
        h('div', { class: 'subhead', style: { marginBottom: '-6px' } }, 'Objectives'), objs,
        h('button', { class: 'btn block', onclick: () => finish(ctx.outcome || 'timeout') }, 'End case and debrief')));
    liveEls = { vit, objs, clock, acts };
    renderLive();
  }

  function renderLive() {
    if (!cs || !liveEls) return;
    const f = store.get().frame;
    if (!f) return;
    const m = f.metrics, hidden = store.get().hiddenReadouts;
    liveEls.clock.textContent = fmtClock(ctx.t);
    const bt = `Clinical time ${fmtClock(ctx.t)}`;
    if (bt !== lastBanner) { lastBanner = bt; api.setBanner?.({ tag: 'Case', text: `${cs.title} · ${bt}` }); }
    for (const r of MONITOR) {
      const el = liveEls.vit.querySelector(`[data-k="${r.k}"]`);
      const hide = r.hideKey && hidden?.has(r.hideKey);
      const val = hide ? '?' : fmt(r.v(m), r.d);
      const vEl = el.querySelector('.mv');
      if (vEl.textContent !== val) vEl.textContent = val;
      el.classList.toggle('bad', !hide && r.bad(m));
      const cv = el.querySelector('canvas'), g = cv.getContext('2d'), a = hide ? [] : trend[r.k] || [];
      g.clearRect(0, 0, cv.width, cv.height);
      if (a.length > 1) {
        g.strokeStyle = r.col; g.lineWidth = 1.5; g.beginPath();
        a.forEach((y, i) => { const x = (i / 239) * cv.width, yy = cv.height - 2 - ((y - r.lo) / (r.hi - r.lo)) * (cv.height - 4); i ? g.lineTo(x, Math.max(1, Math.min(cv.height - 1, yy))) : g.moveTo(x, Math.max(1, Math.min(cv.height - 1, yy))); });
        g.stroke();
      }
    }
    const status = liveEls.vit.querySelector('.mon-status');
    const stxt = f.bleed?.active ? `Active bleeding · ${Math.round(m.bleeding?.rate || 0)} mL/min` : m.blood.shock ? `Shock class ${['', 'I', 'II', 'III', 'IV'][m.blood.shock]}` : 'No active bleeding';
    if (status.textContent !== stxt) status.textContent = stxt;
    status.classList.toggle('bad', !!f.bleed?.active || m.blood.shock >= 2);
    liveEls.objs.replaceChildren(...cs.objectives.map((o) => h('div', { class: 'goal' + (ctx.obj[o.id] === 'met' ? ' met' : ctx.obj[o.id] === 'failed' ? ' failed' : ''), style: { marginBottom: 0 } }, h('span', { class: 'chk' }, svgIcon(ctx.obj[o.id] === 'failed' ? 'close' : 'check')), o.text)));
    const p = store.get().params;
    liveEls.acts.querySelectorAll('button').forEach((b) => { const a = ACTIONS[b.dataset.act]; if (a?.toggle) b.setAttribute('aria-pressed', String(!!a.toggle(p))); });
  }

  return {
    mount() { if (cs) render(); else root.replaceChildren(); },
    start,
    active: () => !!cs,
    exit,
  };
}
