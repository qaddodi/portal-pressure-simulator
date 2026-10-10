// The self-running presenter tour "Sites of portal hypertension" (quiz mode asks "Where is the block?"): one live model per level of portal
// hypertension (pre-hepatic → presinusoidal → sinusoidal → postsinusoidal → post-hepatic → cardiac),
// each with a fingerprint (the pressure ladder from the portal vein to the right atrium, HVPG, SAAG
// and ascites protein) that highlights what sets it apart, and a closing table of all of them.
// The values are the model's own, read from the worker once each state has settled.

import { h, fmt, icon } from './util.js?v=a357853926';
import { SITES, rate, ladder, tiles, createRoute } from './ladder.js?v=2cbec732f7';

const lobule = { view: 'anatomic', zoom: 'lobule' }, whole = { view: 'anatomic', zoom: 'fit' };
export const TOUR = {
  id: 'where-block', title: 'Sites of portal hypertension', builtin: true, tour: true, quiz: true,
  summary: 'A self-running tour from pre-hepatic to cardiac portal hypertension: the causes, the pressure fingerprint of each and how to tell them apart.',
  steps: [
    { preset: 'healthy', ...whole, kicker: 'Reference', title: 'Healthy circulation', site: null, key: [],
      causes: [],
      tell: 'Pressure falls a little at every station from the portal vein to the heart. Portal pressure is under 10 mmHg and HVPG under 5. Every state that follows is drawn against this one.',
      clue: 'Small drops everywhere' },
    { preset: 'pvt-chronic', ...whole, kicker: 'Pre-hepatic', title: 'Portal vein thrombosis', site: 'pre', key: ['pv', 'whvp', 'hvpg'],
      causes: ['Cirrhosis', 'Myeloproliferative neoplasm, thrombophilia', 'Abdominal infection, pancreatitis', 'Malignancy'],
      tell: 'Portal pressure is high but WHVP and HVPG are normal: the wedged catheter sits downstream of the clot. Doppler or CT shows the clot or a cavernoma, the liver itself is normal and ascites is uncommon.',
      clue: 'Clot or cavernoma on imaging, normal liver' },
    { preset: 'schisto', ...lobule, kicker: 'Intrahepatic · presinusoidal', title: 'Schistosomiasis', site: 'presin', key: ['pv', 'hvpg'],
      causes: ['Schistosomiasis', 'Porto-sinusoidal vascular disease', 'Early primary biliary cholangitis', 'Sarcoidosis, congenital hepatic fibrosis'],
      tell: 'The same fingerprint as a portal vein clot: high portal pressure with a normal or mildly raised HVPG, because the block is in the portal tracts, upstream of the wedge. The portal vein is open on imaging, liver stiffness is near normal and ascites is unusual.',
      clue: 'Open portal vein, near-normal liver stiffness' },
    { preset: 'cirr-decomp', ...lobule, kicker: 'Intrahepatic · sinusoidal', title: 'Cirrhosis', site: 'sin', key: ['whvp', 'hvpg', 'saag', 'tp'],
      causes: ['Alcohol-related liver disease', 'Fatty liver disease (MASLD)', 'Chronic hepatitis B and C', 'Autoimmune, cholestatic, metabolic disease'],
      tell: 'The big drop is across the sinusoids, so the wedge reads portal pressure: WHVP ≈ portal pressure and HVPG is high (10 mmHg or more is clinically significant). The ascites has a SAAG of 1.1 or more with low protein, under 2.5 g/dL.',
      clue: 'High HVPG, low-protein ascites' },
    { preset: 'sos', ...lobule, kicker: 'Intrahepatic · postsinusoidal', title: 'Sinusoidal obstruction syndrome', site: 'postsin', key: ['whvp', 'hvpg'],
      causes: ['Conditioning for stem-cell transplant', 'Oxaliplatin and other chemotherapy', 'Pyrrolizidine alkaloids (bush teas)'],
      tell: 'The central veins and sinusoids are blocked, so the wedge still sees the pressure: HVPG is raised, as in cirrhosis, and above 10 mmHg strongly supports SOS after a transplant. The setting tells them apart: tender hepatomegaly, weight gain and jaundice within weeks of conditioning.',
      clue: 'Raised HVPG weeks after conditioning, tender liver' },
    { preset: 'budd-chiari', ...whole, kicker: 'Post-hepatic', title: 'Budd–Chiari syndrome', site: 'post', key: ['fhvp', 'hvpg', 'ra', 'tp'],
      causes: ['Myeloproliferative neoplasm (JAK2)', 'Thrombophilia, pregnancy, oral contraceptives', 'IVC web', 'Tumor invading the hepatic veins'],
      tell: 'The hepatic veins are blocked: wedged and free pressures are both high and nearly equal, so HVPG is near zero while the right atrium is normal. The ascites is protein-rich (2.5 g/dL or more) and the caudate lobe, which drains straight to the IVC, enlarges. In practice the blocked veins often cannot be entered; the model shows the pressure behind the block.',
      clue: 'WHVP ≈ FHVP, both high; normal RA' },
    { preset: 'rhf', ...whole, kicker: 'Cardiac', title: 'Right heart failure', site: 'cardiac', key: ['ra', 'fhvp', 'hvpg', 'tp'],
      causes: ['Left heart failure', 'Tricuspid regurgitation', 'Pulmonary hypertension', 'Cardiomyopathy'],
      tell: 'Pressure backs up from the right atrium, so every station rises together: FHVP and WHVP are both high and HVPG stays normal. The ascites is protein-rich with a SAAG of 1.1 or more. A raised JVP and a pulsatile portal vein on Doppler point to the heart.',
      clue: 'High RA and JVP, pulsatile portal flow' },
    { preset: 'constrictive', ...whole, kicker: 'Cardiac', title: 'Constrictive pericarditis', site: 'cardiac', key: ['ra', 'hvpg', 'tp'],
      causes: ['Previous cardiac surgery', 'Radiation', 'Tuberculosis', 'Viral or idiopathic pericarditis'],
      tell: 'The same pattern as heart failure (high RA, normal HVPG, protein-rich ascites) with a normal-sized heart. Kussmaul’s sign, a pericardial knock and a thick pericardium on imaging set it apart, and ascites can dominate the picture.',
      clue: 'High RA, normal heart size, Kussmaul’s sign' },
    { summary: true, kicker: 'Summary', title: 'How to tell them apart', site: null, key: [],
      tell: 'Portal pressure alone does not locate the block. HVPG captures sinusoidal and postsinusoidal blocks and misses the ones upstream of the wedge or downstream of the hepatic veins. SAAG of 1.1 or more confirms portal hypertension; ascites protein then splits the liver (low) from the hepatic veins and the heart (high).' },
  ].map((s) => ({ ...s, notes: s.tell })),
};

const DWELL = 16000, SUMMARY_DWELL = 40000;

/**
 * The tour's card. ctx: { go(i), stop(), notes(), request(type, payload) }.
 * The presenter calls show(i) when a step starts and ready(i) once its model state is applied.
 */
export function createTour(script, ctx) {
  const steps = script.steps, n = steps.length, fps = [], base = { pv: 7.8, whvp: 6.5, fhvp: 4.1, ra: 3, hvpg: 2.4 };
  let idx = 0, playing = script.autoplay !== false, quiz = false, revealed = false, pick = null, elapsed = 0, ready = false, raf = 0, last = 0, playBtn = null;
  const card = h('section', { class: 'tour-card stage-blocker' + (playing ? '' : ' paused'), 'data-safe': 'right', 'aria-label': script.title, 'aria-live': 'polite' });
  const segs = h('div', { class: 'tour-segs' }, steps.map((st, i) => h('button', { class: 'tour-seg', 'aria-label': `${i + 1}: ${st.title}`, title: st.title, onclick: () => ctx.go(i) }, h('i'))));
  const body = h('div', { class: 'tour-body' });
  const ctl = h('div', { class: 'tour-ctl', role: 'toolbar', 'aria-label': 'Tour controls' });
  card.append(segs, body, ctl);

  const dwell = () => (steps[idx].summary ? SUMMARY_DWELL : DWELL);
  function paintSegs() {
    [...segs.children].forEach((b, i) => {
      b.classList.toggle('done', i < idx); b.classList.toggle('cur', i === idx);
      b.firstChild.style.transform = `scaleX(${i < idx ? 1 : i === idx ? Math.min(1, elapsed / dwell()) : 0})`;
    });
  }
  function tick(t) {
    raf = 0;
    if (!playing) return;
    // At most 100 ms per frame, so a hidden tab (no frames) pauses the tour rather than skipping.
    // A quiz question waits for Reveal.
    if (ready && !asking()) elapsed += Math.min(100, t - (last || t));
    last = t;
    if (elapsed >= dwell()) { elapsed = 0; ctx.go((idx + 1) % n); }
    paintSegs();
    raf = requestAnimationFrame(tick);
  }
  function setPlaying(on) {
    playing = on; last = 0;
    if (on && !raf) raf = requestAnimationFrame(tick);
    if (!on && raf) { cancelAnimationFrame(raf); raf = 0; }
    card.classList.toggle('paused', !on);
    renderCtl();
  }
  // Quiz mode: each level opens as "Where is the block?" with the answer hidden; the room picks a
  // level on the route (or calls it out) and the presenter taps Reveal.
  const quizzable = (st) => quiz && !st.summary && !!st.site;
  const asking = () => quizzable(steps[idx]) && !revealed;
  function doReveal() { revealed = true; paint(); renderCtl(); }
  function renderCtl() {
    playBtn = h('button', { class: 'tc-play', 'aria-label': playing ? 'Pause the tour' : 'Play the tour', title: playing ? 'Pause (K)' : 'Play (K)', onclick: () => setPlaying(!playing) }, icon(playing ? 'pause' : 'play'));
    ctl.replaceChildren(
      h('button', { class: 'ib', 'aria-label': 'Previous', title: 'Previous (←)', disabled: idx === 0, onclick: () => ctx.go(idx - 1) }, icon('chev-left')),
      playBtn,
      h('button', { class: 'ib', 'aria-label': 'Next', title: 'Next (→)', onclick: () => ctx.go((idx + 1) % n) }, icon('chev-right')),
      h('span', { class: 'tc-n' }, `${idx + 1} / ${n}`),
      h('span', { class: 'tc-sp' }),
      script.quiz ? h('button', { class: 'btn sm tc-quiz', 'aria-pressed': String(quiz), title: 'Quiz the room: hide each answer until Reveal (Q)', onclick: () => setQuiz(!quiz) }, 'Quiz') : null,
      h('button', { class: 'ib', 'aria-label': 'Speaker notes', title: 'Speaker notes (N)', onclick: ctx.notes }, icon('book')),
      h('button', { class: 'ib', 'aria-label': 'End the tour', title: 'End (Esc)', onclick: ctx.stop }, icon('close')));
  }

  function setQuiz(on) { quiz = on; revealed = false; pick = null; paint(); renderCtl(); }
  function head(st) {
    if (asking()) return [h('div', { class: 'tour-kick', 'data-site': 'none' }, h('i'), 'Quiz'), h('h2', { class: 'tour-title' }, 'Where is the block?')];
    const at = SITES.find(([id]) => id === st.site);
    return [
      h('div', { class: 'tour-kick', 'data-site': st.site || 'none' }, h('i'), st.kicker, at ? h('span', {}, ' · ', at[2]) : null),
      h('h2', { class: 'tour-title' }, st.title),
    ];
  }
  function paint(reveal = false) {
    const st = steps[idx];
    card.classList.toggle('summary', !!st.summary);
    document.getElementById('app')?.classList.toggle('tour-summary', !!st.summary);   // main.js re-reads what the card covers
    if (st.summary) { body.replaceChildren(...head(st), summaryTable(), h('p', { class: 'tour-tell' }, st.tell)); return; }
    const f = fps[idx], q = quizzable(st), hide = q && !revealed;
    let route = createRoute({ site: q ? null : st.site });
    if (q) {
      route = createRoute({ onPick: (id) => { pick = id; if (revealed) return; doReveal(); } });
      if (pick) route.select(pick);
      if (revealed) route.reveal(st.site);
    }
    if (hide) {
      body.replaceChildren(...head(st), route.el,
        h('div', { class: 'tour-fp' + (f ? '' : ' wait') },
          h('div', { class: 'tour-sub' }, 'Pressure along the way', h('span', {}, h('i', { class: 'lg-now' }), 'This patient', h('i', { class: 'lg-base' }), 'Healthy')),
          f ? ladder(f, { base, reveal }) : h('div', { class: 'tl-wait' }),
          f ? tiles(f, {}) : h('div', { class: 'tour-tiles wait' })),
        h('button', { class: 'btn primary tour-reveal', onclick: doReveal }, 'Reveal'));
      return;
    }
    body.replaceChildren(...head(st), route.el,
      h('div', { class: 'tour-fp' + (f ? '' : ' wait') },
        h('div', { class: 'tour-sub' }, 'Pressure along the way', h('span', {}, h('i', { class: 'lg-now' }), 'This patient', h('i', { class: 'lg-base' }), 'Healthy')),
        f ? ladder(f, { base: idx ? base : null, key: st.key, reveal }) : h('div', { class: 'tl-wait' }),
        f ? tiles(f, { key: st.key }) : h('div', { class: 'tour-tiles wait' })),
      h('div', { class: 'tour-tell' }, h('b', {}, script.label || 'How to tell'), h('p', {}, st.tell)),
      st.causes?.length ? h('div', { class: 'tour-causes' }, h('b', {}, 'Causes'), h('ul', {}, st.causes.map((c) => h('li', {}, c)))) : null);
  }

  function summaryTable() {
    const rows = steps.map((st, i) => [st, i, fps[i]]).filter(([st]) => !st.summary);
    const cell = (k, f) => {
      if (!f) return h('td', { class: 'num' }, '…');
      const [cls, word] = rate(k, f);
      const none = (k === 'saag' || k === 'tp') && cls == null;
      return h('td', { class: 'num', 'data-rate': cls || 'none', title: word }, none ? '—' : fmt(f[k], 1));
    };
    return h('div', { class: 'tour-table' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Level'), ['Portal', 'WHVP', 'FHVP', 'HVPG', 'RA', 'SAAG', 'Protein'].map((t) => h('th', { class: 'num' }, t)), h('th', { class: 'clue' }, 'Clue'))),
      h('tbody', {}, rows.map(([st, i, f]) => h('tr', { onclick: () => ctx.go(i), tabindex: '0', onkeydown: (e) => { if (e.key === 'Enter') ctx.go(i); } },
        h('th', { scope: 'row' }, h('span', { class: 'tk', 'data-site': st.site || 'none' }, h('i'), st.kicker.replace('Intrahepatic · ', '')), h('span', { class: 'tn' }, st.title)),
        ['pv', 'whvp', 'fhvp', 'hvpg', 'ra', 'saag', 'tp'].map((k) => cell(k, f)),
        h('td', { class: 'clue' }, st.clue))))),
    h('p', { class: 'tour-foot' }, 'mmHg and g/dL, from the model. Shaded: above the normal range. SAAG and protein only where there is ascites.'));
  }
  // Rows the tour has not visited yet are loaded fresh in the worker.
  async function fillMissing() {
    const miss = steps.map((st, i) => (!st.summary && !fps[i] && st.preset ? st.preset : null)).filter(Boolean);
    if (!miss.length) return;
    const { result } = await ctx.request('presetMetrics', { ids: [...new Set(miss)] });
    steps.forEach((st, i) => { if (!fps[i] && result?.[st.preset]) fps[i] = result[st.preset]; });
    if (steps[idx].summary) paint();
  }

  return {
    el: card,
    /** A step starts: its text appears at once; the numbers follow in ready(). */
    show(i) {
      const changed = i !== idx || !body.childElementCount;
      if (i !== idx) { revealed = false; pick = null; }
      idx = i; elapsed = 0; ready = false;
      paint(); renderCtl(); paintSegs();
      if (changed) { card.classList.remove('swap'); void card.offsetWidth; card.classList.add('swap'); }
      if (steps[i].summary) fillMissing();
      body.scrollTop = 0; card.scrollTop = 0;
    },
    async ready(i) {
      if (i !== idx) return;
      if (!steps[i].summary) {
        const { result } = await ctx.request('metrics');
        if (i !== idx || !result) return;
        fps[i] = result;
        if (steps[i].preset === 'healthy') Object.assign(base, result);
        paint(true);
      }
      ready = true;
    },
    start() { setPlaying(true); },
    toggle() { setPlaying(!playing); },
    /** Q toggles quiz mode; R (or Space while a question is open) reveals. */
    quiz() { if (script.quiz) setQuiz(!quiz); },
    reveal() { if (asking()) { doReveal(); return true; } return false; },
    destroy() { setPlaying(false); card.remove(); document.getElementById('app')?.classList.remove('tour-summary'); },
  };
}
