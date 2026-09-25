// Cases mode (blueprint §10.4): clinical scenarios as state machines with objectives & debrief.

import { store, updateParams } from './store.js';
import { host } from './host.js';
import { h, fmt, openModal, closeModal, toast } from './util.js';

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
  doppler: { label: 'Doppler ultrasound', run: (a) => { a.setTool('doppler'); a.showPane('doppler'); } },
  hvpg: { label: 'Hepatic vein catheterization', run: (a) => { a.setTool('catheter'); a.showPane('hvpg'); } },
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
    setup: (a) => a.action({ kind: 'rupture', site: 'VAR', tear: 0.8 }),
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
    preset: 'cirr-decomp', days: 200, prep: (p) => { p.diuretics = false; return p; }, speed: 1, hidden: ['trueHVPG'], tools: ['select', 'needle', 'stent'],
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

export function createCases({ root, api }) {
  let cs = null, ctx = null, timer = null;
  const log = [];

  function list() {
    root.replaceChildren(h('div', { class: 'insp-head' }, h('div', { style: { flex: 1 } }, h('span', { class: 'kicker' }, 'Cases'), h('h2', {}, 'Clinical scenarios'))),
      h('div', { class: 'section-body', style: { paddingTop: '12px' } }, CASES.map((c) => h('button', { class: 'card', onclick: () => start(c.id) }, h('span', { class: 'meta' }, c.level), h('span', { class: 't' }, c.title), h('span', { class: 'd' }, c.summary)))));
  }

  async function start(id) {
    cs = CASES.find((c) => c.id === id);
    log.length = 0;
    await api.loadPreset(cs.preset, { keepLesson: true, days: cs.days });
    if (cs.prep) updateParams(cs.prep, { history: false });
    if (cs.params) updateParams(cs.params, { history: false });
    store.set({ hiddenReadouts: new Set(cs.hidden || []), lastHVPG: null, locked: new Set(['!cirrhosis']) });
    api.setAllowedTools(cs.tools);
    cs.setup?.(api);
    host.send({ type: 'run', running: true, speed: cs.speed, clock: 'hemo' });
    store.set({ speed: cs.speed });
    ctx = { t0: null, t: 0, quiz: {}, minMap: 999, maxPV: 0, maxHbAfterTx: 0, lowFor: 0, stableFor: 0, obj: {}, ended: false, outcome: null };
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
    c.lowFor = c.m.map < 45 ? c.lowFor + 0.25 * cs.speed : 0;
    c.stableFor = !f.bleed.active && c.m.map > 60 ? c.stableFor + 0.25 * cs.speed : 0;
    if (c.t > 300 && c.m.map < 60) c.failedMap = true;
    for (const o of cs.objectives) { if (c.obj[o.id] === 'met' || c.obj[o.id] === 'failed') continue; const r = o.check(c); if (r) c.obj[o.id] = r; }
    const out = cs.end(c);
    if (out) finish(out);
    renderLive();
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
    openModal(`${title}: ${cs.title}`, h('div', {},
      h('p', {}, h('b', {}, `Score ${score} / 100`), ` · ${met}/${cs.objectives.length} objectives met · clinical time ${fmtClock(c.t)}`),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, cs.objectives.map((o) => h('div', { class: 'goal' + (c.obj[o.id] === 'met' ? ' met' : '') }, h('span', { class: 'chk' }), o.text, c.obj[o.id] === 'failed' ? ' ✗' : ''))),
      h('h3', {}, 'Your actions'),
      h('div', { class: 'event-log' }, log.map((l) => h('div', { class: 'event-row', style: { gridTemplateColumns: '90px 1fr' } }, h('span', { class: 'when' }, fmtClock(l.t)), h('span', {}, ACTIONS[l.id]?.label || l.id)))),
      h('h3', {}, 'Debrief'),
      ...cs.debrief(c).split('\n\n').map((p) => h('p', {}, p)),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', onclick: () => { closeModal(); start(cs.id); } }, 'Retry'), h('button', { class: 'btn', onclick: () => { closeModal(); exit(); } }, 'All cases'))), { wide: true });
  }

  function exit() {
    clearInterval(timer);
    cs = null; ctx = null;
    store.set({ hiddenReadouts: null, locked: null });
    api.setAllowedTools(null);
    host.send({ type: 'run', running: true, speed: 1 });
    store.set({ speed: 1 });
    list();
  }

  let liveEls = null;
  function render() {
    const vit = h('div', { class: 'vitals panel-float' });
    const objs = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } });
    const clock = h('div', { class: 'num', style: { fontSize: '20px', fontWeight: 800 } }, '0 min');
    const acts = h('div', { class: 'case-bar' }, cs.actions.map((id) => {
      const a = ACTIONS[id];
      const b = h('button', { class: 'btn', 'data-act': id }, a.label);
      b.addEventListener('click', () => {
        if (ctx.ended) return;
        if (a.once && log.some((l) => l.id === id)) return toast('Already done.');
        log.push({ id, t: ctx.t });
        a.run(api);
        renderLive();
      });
      return b;
    }));
    const quiz = cs.quiz ? h('div', {}, cs.quiz.map((qq, qi) => h('div', { style: { marginTop: '8px' } }, h('p', { style: { margin: '0 0 6px' } }, h('b', {}, qq.q)),
      h('div', { class: 'lesson-card', style: { width: 'auto', padding: 0 } }, h('div', { class: 'opts' }, qq.options.map((o, i) => {
        const b = h('button', { class: 'opt' }, o);
        b.addEventListener('click', () => { if (ctx.quiz[qi] != null) return; ctx.quiz[qi] = i; b.classList.add(i === qq.answer ? 'right' : 'wrong'); if (i !== qq.answer) b.parentElement.children[qq.answer].classList.add('right'); log.push({ id: `answer ${qi + 1}: ${o}`, t: ctx.t }); });
        return b;
      })))))) : null;
    root.replaceChildren(
      h('div', { class: 'insp-head' }, h('div', { style: { flex: 1, minWidth: 0 } }, h('span', { class: 'kicker' }, `Case · ${cs.level}`), h('h2', {}, cs.title)), h('button', { class: 'btn', onclick: exit }, 'Exit')),
      h('div', { class: 'section-body', style: { paddingTop: '12px' } },
        h('p', { style: { margin: 0 } }, cs.summary),
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } }, h('span', { class: 'ctl-sub' }, 'Clinical time'), clock),
        vit,
        h('label', { class: 'ctl-sub', style: { fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' } }, 'Actions'), acts,
        quiz,
        h('label', { class: 'ctl-sub', style: { fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' } }, 'Objectives'), objs,
        h('button', { class: 'btn', onclick: () => finish(ctx.outcome || 'timeout') }, 'End case & debrief')));
    liveEls = { vit, objs, clock, acts };
    renderLive();
  }

  function renderLive() {
    if (!cs || !liveEls) return;
    const f = store.get().frame;
    if (!f) return;
    const m = f.metrics, hidden = store.get().hiddenReadouts;
    liveEls.clock.textContent = fmtClock(ctx.t);
    const v = (lbl, val, bad) => h('div', { class: bad ? 'bad' : '' }, h('span', { class: 'lbl' }, lbl), h('b', {}, val));
    liveEls.vit.replaceChildren(
      v('HR', Math.round(m.hr), m.hr > 110), v('MAP', Math.round(m.map), m.map < 65), v('Hb', fmt(m.blood.hb, 1), m.blood.hb < 7),
      v('CVP', hidden?.has('ra') ? '?' : fmt(m.ra, 0), false), v('Bleeding', m.bleeding ? `${Math.round(m.bleeding.rate)} mL/min` : '—', !!m.bleeding),
      v('Blood loss', `${Math.round(m.blood.lost)} mL`, m.blood.shock >= 2), v('Shock class', m.blood.shock ? ['', 'I', 'II', 'III', 'IV'][m.blood.shock] : '—', m.blood.shock >= 3), v('IAP', fmt(m.ascites.iap, 0), m.ascites.iap >= 12));
    liveEls.objs.replaceChildren(...cs.objectives.map((o) => h('div', { class: 'goal' + (ctx.obj[o.id] === 'met' ? ' met' : '') }, h('span', { class: 'chk', style: ctx.obj[o.id] === 'failed' ? { borderColor: 'var(--danger)', background: 'var(--danger)' } : {} }), o.text)));
    const p = store.get().params;
    liveEls.acts.querySelectorAll('button').forEach((b) => { const a = ACTIONS[b.dataset.act]; if (a?.toggle) b.setAttribute('aria-pressed', String(!!a.toggle(p))); });
  }

  return {
    mount() { if (cs) render(); else list(); },
    active: () => !!cs,
    exit,
  };
}
