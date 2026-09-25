// Learn mode (blueprint §11): lessons as step sequences with Predict → Observe → Explain.

import { store, updateParams } from './store.js';
import { host } from './host.js';
import { h, fmt, toast, svgIcon } from './util.js';

const saved = (() => { try { return JSON.parse(localStorage.getItem('pps.lessons') || '{}'); } catch { return {}; } })();
const save = () => { try { localStorage.setItem('pps.lessons', JSON.stringify(saved)); } catch { /* storage unavailable */ } };

// Step types: frame | predict (mcq | draw) | do (goal) | observe (seconds / days) | explain (metric) | check (quiz)
export const LESSONS = [
  {
    id: 'valveless', title: 'Pipes without valves', minutes: 4,
    summary: 'P = Q × R, and blood goes wherever the gradient points.',
    steps: [
      { type: 'frame', preset: 'healthy', tools: ['select', 'pinch'], tab: 'profile', path: 'main',
        text: 'The portal vein collects blood from the gut and spleen and delivers it to the liver. Its pressure is set by flow × resistance: P = Q × R. Unlike limb veins, the portal system has **no valves**.' },
      { type: 'predict', q: 'You are about to pinch the main portal vein to 80 %. What happens to pressure in the SMV, upstream of the pinch?',
        options: ['It rises', 'It falls', 'It stays the same'], answer: 0,
        why: 'Upstream of a new resistance, pressure rises until the gradient can push the flow through (or around) it.' },
      { type: 'do', text: 'Use the **Pinch** tool: press on the portal vein and drag sideways until the stenosis reaches ≥ 80 %.', goal: (f, p) => (p.stenosis.PV_TRUNK || 0) >= 0.8, hint: 'The portal vein runs from the confluence behind the pancreas up to the liver hilum.' },
      { type: 'observe', seconds: 6, text: 'Look at the pressure profile: a big step appears at the portal vein, with everything upstream higher and everything downstream lower.' },
      { type: 'explain', metric: 'pv', text: 'The pressure drop across a segment is Q × R. A four-fold narrowing raises R ~ 256-fold (Poiseuille, r⁴).' },
      { type: 'check', quiz: [
        { q: 'Why can portal flow reverse direction?', options: ['Portal veins have valves that fail', 'The portal system is valveless: flow follows the pressure gradient', 'The heart pumps backwards'], answer: 1 },
        { q: 'Halving a vessel’s radius multiplies its resistance by about…', options: ['2', '4', '16'], answer: 2 },
      ] },
    ],
  },
  {
    id: 'resistance-site', title: 'Where is the resistance?', minutes: 5,
    summary: 'Pre-, sinusoidal and post-sinusoidal resistance, and why the site matters.',
    steps: [
      { type: 'frame', preset: 'healthy', tools: ['select'], tab: 'lobule',
        text: 'Inside the liver, blood crosses three resistances in series: **portal venules** (presinusoidal), **sinusoids**, and **central veins** (postsinusoidal). The Lobule panel shows them.' },
      { type: 'predict', mode: 'draw', path: 'main', tab: 'profile',
        text: 'Predict: with **severe cirrhosis** (sinusoidal fibrosis), draw the pressures along gut → liver → heart. Drag across the chart.' },
      { type: 'do', text: 'Set **Cirrhosis severity** to at least 70 % (below).', goal: (f, p) => p.cirrhosis >= 0.7, controls: ['cirrhosis'] },
      { type: 'observe', seconds: 5, reveal: true, text: 'The big drop is now across the sinusoids. Everything upstream (portal, splenic, mesenteric veins) rises together. Your prediction is overlaid as a dashed line.' },
      { type: 'explain', metric: 'hvpg' },
      { type: 'check', quiz: [
        { q: 'In sinusoidal cirrhosis the largest pressure drop is between…', options: ['Aorta and gut', 'Portal vein and hepatic vein', 'Hepatic vein and right atrium'], answer: 1 },
      ] },
    ],
  },
  {
    id: 'hvpg', title: 'Measuring HVPG (and its traps)', minutes: 7,
    summary: 'Transjugular wedge pressure, and why HVPG is normal in presinusoidal and cardiac disease.',
    steps: [
      { type: 'frame', preset: 'csph', tools: ['select', 'catheter'], tab: 'hvpg', hide: ['trueHVPG', 'pv'],
        text: 'HVPG = **wedged** (WHVP) − **free** (FHVP) hepatic venous pressure. The wedged balloon stops flow, so the stagnant column reads the pressure of the sinusoids behind it.' },
      { type: 'do', text: 'With the **Catheter** tool, click a hepatic vein, then click it again (or press *Inflate balloon*) to wedge. Wait for the plateau.', goal: () => !!store.get().lastHVPG, hint: 'The HVPG tab shows the pressure trace.' },
      { type: 'observe', seconds: 2, text: 'Your measurement is in the HVPG tab. In cirrhosis, WHVP ≈ portal pressure because the diseased sinusoids no longer communicate.' },
      { type: 'predict', preset: 'schisto', q: 'New patient: schistosomiasis (presinusoidal fibrosis). The portal pressure is ~19 mmHg. What will the HVPG be?', options: ['High (≥ 10)', 'Normal (< 5)', 'Negative'], answer: 1,
        why: 'The block is upstream of the sinusoids. The stagnant column behind the balloon only reaches normal sinusoids.' },
      { type: 'do', text: 'Measure the HVPG in this patient.', goal: () => store.get().presetId === 'schisto' && !!store.get().lastHVPG, hint: 'Place the catheter, then wedge.' },
      { type: 'explain', metric: 'pv', text: 'Presinusoidal portal hypertension: high portal pressure, normal HVPG. HVPG underestimates it.' },
      { type: 'check', quiz: [
        { q: 'Right heart failure: RA 18 mmHg, FHVP 19, WHVP 21. The HVPG is…', options: ['21 mmHg: severe portal hypertension', '2 mmHg: normal, because both rise together', 'Cannot be calculated'], answer: 1 },
        { q: 'Which condition gives a normal HVPG despite varices?', options: ['Alcoholic cirrhosis', 'Portal vein thrombosis', 'Sinusoidal obstruction syndrome'], answer: 1 },
      ] },
    ],
  },
  {
    id: 'forward', title: 'Forward flow matters', minutes: 4,
    summary: 'Splanchnic vasodilation and the hyperdynamic circulation, and what β-blockers do.',
    steps: [
      { type: 'frame', preset: 'csph', tools: ['select'], tab: 'perfusion',
        text: 'Portal hypertension is not only “backward” resistance. Nitric-oxide–mediated **splanchnic vasodilation** increases portal inflow (the forward-flow theory).' },
      { type: 'predict', q: 'Dilating the splanchnic arterioles (tone ×0.6) will make portal pressure…', options: ['Rise', 'Fall', 'Not change: resistance is in the liver'], answer: 0 },
      { type: 'do', text: 'Set **Splanchnic arteriolar tone** to ≤ 0.6 (below).', goal: (f, p) => p.splanchnicTone <= 0.6, controls: ['splanchnicTone'] },
      { type: 'observe', seconds: 5, text: 'More inflow through the same stiff liver: pressure rises. Now reverse it with a drug.' },
      { type: 'do', text: 'Reset the tone, then start **propranolol** (below).', goal: (f, p) => p.drugs.propranolol && Math.abs(p.splanchnicTone - 1) < 0.05, controls: ['splanchnicTone', 'drug:propranolol', 'drugs'] },
      { type: 'explain', metric: 'hvpg', text: 'Propranolol lowers cardiac output (β1) and leaves α-constriction unopposed in splanchnic arterioles (β2 blockade). A ≥ 10 % HVPG fall predicts protection from bleeding.' },
      { type: 'check', quiz: [{ q: 'Carvedilol lowers HVPG more than propranolol because it also…', options: ['Blocks α1 receptors, lowering intrahepatic tone', 'Raises cardiac output', 'Dissolves fibrosis'], answer: 0 }] },
    ],
  },
  {
    id: 'collaterals', title: 'Blood finds a way', minutes: 6,
    summary: 'Collateral recruitment and the CSPH threshold, on the disease clock.',
    steps: [
      { type: 'frame', preset: 'healthy', tools: ['select'], tab: 'scope', layers: { collaterals: true },
        text: 'Dotted vessels are **potential collaterals**: closed channels between portal and systemic veins. They open and remodel over weeks when the portal-to-systemic gradient stays high.' },
      { type: 'do', text: 'Set **Cirrhosis severity** to 65 %.', goal: (f, p) => p.cirrhosis >= 0.65, controls: ['cirrhosis'] },
      { type: 'predict', q: 'Which will happen over the next 6 months?', options: ['Nothing: collaterals are congenital', 'Collaterals enlarge and portal pressure partly decompresses', 'The portal vein closes'], answer: 1 },
      { type: 'observe', days: 180, text: 'Watch the Months clock run: collaterals thicken and become tortuous, varices appear at the lower esophagus, and the spleen enlarges.' },
      { type: 'explain', metric: 'pv', text: 'Collaterals decompress the portal system (a negative contribution), but they also divert gut blood around the liver.' },
      { type: 'check', quiz: [{ q: 'Clinically significant portal hypertension (varices can form) starts at an HVPG of…', options: ['5 mmHg', '10 mmHg', '20 mmHg'], answer: 1 }] },
    ],
  },
  {
    id: 'laplace', title: 'Laplace and the varix', minutes: 5,
    summary: 'Why size, pressure and wall thickness decide rupture.',
    steps: [
      { type: 'frame', preset: 'cirr-decomp', tools: ['select', 'band', 'balloon'], tab: 'varixwall',
        text: 'Varix wall tension follows Laplace: **T = ΔP · r / w**. Large varices are thin-walled, and their transmural pressure is high. Tension, not pressure alone, predicts rupture.' },
      { type: 'predict', q: 'Which acutely lowers wall tension the most?', options: ['Terlipressin (splanchnic vasoconstriction)', 'Crystalloid 2 L', 'Valsalva'], answer: 0 },
      { type: 'do', text: 'Start **terlipressin** (below).', goal: (f, p) => p.drugs.terlipressin, controls: ['drugs', 'drug:terlipressin'] },
      { type: 'observe', seconds: 8, text: 'Portal inflow falls, variceal pressure falls, the varix shrinks slightly: tension drops on three counts.' },
      { type: 'explain', metric: 'varix' },
      { type: 'check', quiz: [{ q: 'Band ligation (EVL) of esophageal varices…', options: ['Lowers portal pressure', 'Removes the bleeding source but leaves portal pressure unchanged', 'Raises cardiac output'], answer: 1 }] },
    ],
  },
  {
    id: 'hepatofugal', title: 'When the portal vein runs backwards', minutes: 5,
    summary: 'Hepatofugal flow: arterioportal shunting + high sinusoidal resistance + a low-resistance exit.',
    steps: [
      { type: 'frame', preset: 'cirr-decomp', tools: ['select', 'doppler'], tab: 'doppler', probe: 'PV_TRUNK',
        text: 'Portal flow is normally **hepatopetal** (toward the liver). When liver resistance is extreme, flow can reverse and the portal vein **drains** the liver.' },
      { type: 'predict', q: 'Which combination can drive the portal vein backwards?', options: ['High sinusoidal resistance + arterioportal shunting + a large collateral', 'Low albumin', 'High heart rate'], answer: 0 },
      { type: 'do', text: 'Set **Arterioportal shunting** to 100 % and **Cirrhosis** ≥ 95 %; and make a **splenorenal shunt** present.', goal: (f, p) => p.apShunt >= 0.99 && p.cirrhosis >= 0.95 && p.spontaneous.C6, controls: ['apShunt', 'cirrhosis', 'spontaneous'] },
      { type: 'observe', days: 60, text: 'The Doppler trace drops below the baseline: hepatofugal flow. The ⟲ badge marks reversed vessels.' },
      { type: 'explain', metric: 'pvFlow' },
      { type: 'check', quiz: [{ q: 'Hepatofugal portal flow means blood in the portal vein flows…', options: ['Toward the liver', 'Away from the liver', 'Not at all'], answer: 1 }] },
    ],
  },
  {
    id: 'starling', title: 'Ascites from Starling', minutes: 5,
    summary: 'Sinusoidal pressure, albumin and lymph, and why presinusoidal disease spares the peritoneum.',
    steps: [
      { type: 'frame', preset: 'schisto', tools: ['select'], tab: 'abdomen',
        text: 'Ascites forms when capillary filtration exceeds lymph drainage. Sinusoids are leaky (low reflection coefficient), so **sinusoidal pressure** drives hepatic lymph.' },
      { type: 'predict', q: 'This patient has presinusoidal portal hypertension (portal pressure ~19). Over 6 months, ascites will be…', options: ['Massive', 'Absent or minimal', 'Chylous'], answer: 1 },
      { type: 'observe', days: 90, text: 'The sinusoids are protected behind the block: little ascites despite varices.' },
      { type: 'do', text: 'Now load **Decompensated cirrhosis** and turn **Diuretics off** to see the difference.', goal: (f, p) => store.get().presetId === 'cirr-decomp' && !p.diuretics, preset: null, controls: ['diuretics'], presetButton: 'cirr-decomp' },
      { type: 'observe', days: 120, text: 'High sinusoidal pressure + low albumin overwhelm the lymphatics. Intra-abdominal pressure rises.' },
      { type: 'explain', metric: 'ascites' },
      { type: 'check', quiz: [{ q: 'Ascitic protein > 2.5 g/dL with SAAG ≥ 1.1 suggests…', options: ['Cirrhosis', 'Cardiac (post-sinusoidal) congestion', 'Peritoneal carcinomatosis'], answer: 1 }] },
    ],
  },
  {
    id: 'sinistral', title: 'Left-sided portal hypertension', minutes: 4,
    summary: 'Splenic vein thrombosis causes isolated gastric varices with a normal portal pressure.',
    steps: [
      { type: 'frame', preset: 'healthy', tools: ['select', 'thrombus', 'endoscope'], tab: 'endoscopy',
        text: 'Pancreatitis can thrombose the splenic vein. The spleen then has to drain another way.' },
      { type: 'do', text: 'Use the **Thrombus** tool to occlude the proximal splenic vein fully (hold on it).', goal: (f, p) => (p.thrombus.SV_CONF || 0) >= 0.95 },
      { type: 'predict', q: 'Where will varices appear?', options: ['Esophagus', 'Gastric fundus (via short gastric veins)', 'Rectum'], answer: 1 },
      { type: 'observe', days: 150, text: 'Short gastric veins carry splenic blood to the fundus: **isolated gastric varices**. Portal pressure stays normal.' },
      { type: 'explain', metric: 'pv' },
      { type: 'check', quiz: [{ q: 'The definitive treatment for bleeding from sinistral portal hypertension is…', options: ['TIPS', 'Splenectomy / splenic artery embolization', 'Propranolol alone'], answer: 1 }] },
    ],
  },
  {
    id: 'costs', title: 'Every fix has a cost', minutes: 6,
    summary: 'TIPS and encephalopathy; BRTO and rising portal pressure.',
    steps: [
      { type: 'frame', preset: 'cirr-decomp', tools: ['select', 'stent', 'occlude'], tab: 'flow',
        text: 'A TIPS decompresses the portal system by bypassing the liver. Watch where the gut blood goes.' },
      { type: 'do', text: 'Create a **TIPS**: with the Stent tool, drag from the right portal vein to the right hepatic vein.', goal: (f, p) => p.tips.on },
      { type: 'observe', seconds: 8, text: 'Portosystemic gradient falls below 12, varices decompress, but the shunt fraction rises, liver perfusion falls, and the intrahepatic portal branches reverse toward the stent.' },
      { type: 'explain', metric: 'shunt' },
      { type: 'predict', preset: 'gastric-varix', q: 'New patient with fundal varices draining via a gastrorenal shunt. After BRTO (occluding that shunt), portal pressure will…', options: ['Rise', 'Fall', 'Not change'], answer: 0 },
      { type: 'do', text: 'Occlude the **gastrorenal shunt**: use the Occlude tool on it, or the switch below.', goal: (f, p) => !!p.occluded.C5, inline: ['brto'] },
      { type: 'explain', metric: 'pv', text: 'Closing an exit raises upstream pressure: esophageal varices and ascites can worsen after BRTO.' },
      { type: 'check', quiz: [{ q: 'The main neurological risk after TIPS is…', options: ['Stroke', 'Hepatic encephalopathy from shunted gut blood', 'Seizures from hyponatremia'], answer: 1 }] },
    ],
  },
  {
    id: 'heart', title: 'The heart is downstream', minutes: 5,
    summary: 'Right heart failure: normal HVPG, pulsatile portal vein, protein-rich ascites.',
    steps: [
      { type: 'frame', preset: 'rhf', tools: ['select', 'doppler', 'catheter'], tab: 'doppler', probe: 'PV_TRUNK', params: { pulsatile: true },
        text: 'Pressure transmits backward from a failing right heart through the IVC and hepatic veins into a stiff, congested liver.' },
      { type: 'predict', q: 'In severe tricuspid regurgitation, the portal vein Doppler becomes…', options: ['Flat and continuous', 'Pulsatile, even to-and-fro', 'Absent'], answer: 1 },
      { type: 'observe', seconds: 8, text: 'Large v-waves reach the portal vein: pulsatility > 50 %.' },
      { type: 'explain', metric: 'ra' },
      { type: 'check', quiz: [{ q: 'In cardiac congestion, HVPG is…', options: ['High', 'Normal, because WHVP and FHVP rise together', 'Negative'], answer: 1 }] },
    ],
  },
];

const STEP = {
  frame: ['book', 'Context'], predict: ['bulb', 'Predict'], do: ['tools', 'Your turn'], observe: ['explore', 'Observe'], explain: ['bulb', 'Explain'], check: ['check', 'Check'],
};
// Lesson steps name locked-control keys; these are the matching controls to embed in the card.
const INLINE = { cirrhosis: 'cirrhosis', splanchnicTone: 'splanchnicTone', 'drug:propranolol': 'drug:propranolol', 'drug:terlipressin': 'drug:terlipressin', apShunt: 'apShunt', spontaneous: 'srShunt', diuretics: 'diuretics', brto: 'brto' };

export function createLearn({ host: hostEl, panel, dock, inspector, loadPreset, setTool, setAllowedTools, showPane, setProbe, openPanel }) {
  let lesson = null, idx = 0, state = {};
  let pollTimer = null, inline = null, showAll = false;

  function openList() { lesson = null; render(); openPanel?.(); panel.scrollTop = 0; }

  async function start(id) {
    lesson = LESSONS.find((l) => l.id === id);
    idx = 0; state = {}; showAll = false;
    await enter();
    panel.scrollTop = 0;
  }
  function stop() {
    lesson = null;
    clearInterval(pollTimer);
    store.set({ locked: null, hiddenReadouts: null });
    setAllowedTools(null);
    dock.profile.clearPredict();
    render();
  }

  async function enter() {
    const st = lesson.steps[idx];
    clearInterval(pollTimer);
    state = { answered: null, quizAns: {}, observed: false, met: false };
    if (st.preset) await loadPreset(st.preset, { keepLesson: true });
    if (st.params) updateParams(st.params, { history: false });
    if (st.tools) setAllowedTools(st.tools);
    if (st.hide) store.set({ hiddenReadouts: new Set(st.hide) });
    store.set({ locked: new Set(st.controls || ['*']) });
    if (st.layers) store.set({ layers: { ...store.get().layers, ...st.layers } });
    if (st.tab) showPane(st.tab);
    if (st.path) dock.profile.setPath(st.path);
    if (st.probe) setProbe(st.probe);
    if (st.type === 'predict' || st.type === 'frame' || st.type === 'check') host.send({ type: 'run', running: st.type === 'frame' });
    if (st.type === 'predict' && st.mode === 'draw') { dock.profile.startPredict(() => render()); showPane('profile'); }
    if (st.type === 'do') {
      host.send({ type: 'run', running: true });
      if (st.tools?.[1]) setTool(st.tools[1]);
      pollTimer = setInterval(() => {
        const f = store.get().frame;
        if (f && st.goal(f, store.get().params)) { state.met = true; clearInterval(pollTimer); render(); setTimeout(() => { if (lesson && lesson.steps[idx] === st) next(); }, 1100); }
      }, 300);
    }
    if (st.type === 'observe') {
      host.send({ type: 'run', running: true, clock: 'hemo' });
      if (st.reveal) dock.profile.endPredict(true);
      if (st.days) { host.send({ type: 'advance', days: st.days }); state.observed = true; }
      else setTimeout(() => { if (lesson?.steps[idx] === st) { state.observed = true; render(); } }, st.seconds * 1000);
    }
    if (st.type === 'explain') {
      state.loading = true;
      render();
      const { result } = await host.request('explain', { metric: st.metric });
      state.loading = false; state.explain = result;
    }
    render();
  }
  function next() {
    if (!lesson) return;
    if (idx < lesson.steps.length - 1) { idx++; enter(); panel.scrollTop = 0; }
    else { saved[lesson.id] = true; save(); toast(`Lesson complete: ${lesson.title}`); stop(); }
  }
  function back() { if (lesson && idx > 0) { idx--; enter(); } }

  const md = (t) => { const span = h('span'); span.innerHTML = String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>'); return span; };
  const letter = (i) => h('span', { class: 'letter' }, 'ABCDE'[i]);

  function catalog() {
    const doneN = LESSONS.filter((l) => saved[l.id]).length;
    return h('div', { class: 'p-body', style: { paddingTop: '16px' } },
      h('div', { class: 'p-title', style: { marginBottom: '6px' } }, h('span', { class: 'kicker' }, `Learn · ${doneN} of ${LESSONS.length} complete`), h('h2', {}, 'Guided lessons')),
      h('p', { class: 'sub', style: { margin: '0 0 14px' } }, 'Each lesson asks you to predict before the model runs, lets you do it on the anatomy, then explains what happened.'),
      h('div', { class: 'case-list' }, LESSONS.map((l, i) => h('button', { class: 'card' + (saved[l.id] ? ' done' : ''), onclick: () => start(l.id) },
        h('span', { class: 'meta' }, h('span', { class: 'num-badge' }, saved[l.id] ? svgIcon('check') : i + 1), `${l.minutes} min`, saved[l.id] ? h('span', { class: 'done' }, 'Done') : null),
        h('span', { class: 't' }, l.title), h('span', { class: 'd' }, l.summary)))));
  }

  function render() {
    inline?.dispose?.(); inline = null;
    const inLearn = store.get().mode === 'learn';
    panel.classList.toggle('lesson-focus', inLearn);
    panel.classList.toggle('show-all', inLearn && showAll);
    if (!inLearn) { hostEl.replaceChildren(); return; }
    if (!lesson) { hostEl.replaceChildren(catalog()); return; }
    const st = lesson.steps[idx];
    const body = [];
    if (st.text) body.push(h('p', {}, md(st.text)));
    let canNext = true;
    if (st.type === 'predict' && st.mode !== 'draw') {
      body.push(h('p', { class: 'q' }, st.q));
      canNext = state.answered != null;
      body.push(h('div', { class: 'opts' }, st.options.map((o, i) => h('button', { class: 'opt' + (state.answered != null ? (i === st.answer ? ' right' : i === state.answered ? ' wrong' : '') : ''), disabled: state.answered != null,
        onclick: () => { state.answered = i; render(); } }, letter(i), h('span', {}, o)))));
      if (state.answered != null) body.push(h('div', { class: 'feedback' }, h('b', {}, state.answered === st.answer ? 'Correct. ' : 'Not quite. '), st.why || 'Now let’s see what the model does.'));
    }
    if (st.type === 'predict' && st.mode === 'draw') body.push(h('div', { class: 'feedback' }, 'Draw on the pressure profile below the anatomy. When you have at least four points, continue.'));
    if (st.type === 'do') {
      canNext = state.met;
      const ids = [...(st.inline || []), ...(st.controls || []).map((k) => INLINE[k]).filter(Boolean)];
      if (ids.length) {
        inline = inspector.buildControls([...new Set(ids)]);
        body.push(h('div', { class: 'inline-controls' }, inline.els));
      }
      if (st.presetButton) body.push(h('button', { class: 'btn block', style: { marginBottom: '12px' }, onclick: () => loadPreset(st.presetButton) }, `Load: ${store.get().presetList?.find((p) => p.id === st.presetButton)?.label || st.presetButton}`));
      body.push(h('div', { class: 'goal ' + (state.met ? 'met' : 'waiting') }, h('span', { class: 'chk' }, svgIcon('check')), state.met ? 'Done. Moving on…' : 'Waiting for you…'));
      if (st.hint) body.push(h('p', { class: 'ctl-sub' }, st.hint));
    }
    if (st.type === 'observe') {
      canNext = state.observed;
      if (!state.observed) body.push(h('div', { class: 'goal waiting' }, h('span', { class: 'chk' }, svgIcon('check')), st.days ? `Running ${st.days} simulated days…` : 'Watching the model…'));
      else if (st.reveal) { const err = dock.profile.predictionError(); if (err != null) body.push(h('div', { class: 'feedback' }, `Your prediction was off by `, h('b', {}, `${fmt(err, 1)} mmHg`), ' on average.')); }
    }
    if (st.type === 'explain') {
      if (state.loading) body.push(h('div', { class: 'skeleton', style: { width: '95%' } }), h('div', { class: 'skeleton', style: { width: '75%' } }));
      else if (state.explain) body.push(h('div', { class: 'feedback', style: { color: 'var(--text)', fontSize: '13.5px' } }, state.explain.sentence), state.explain.formula ? h('div', { class: 'formula', style: { marginBottom: '12px' } }, state.explain.formula) : null);
    }
    if (st.type === 'check') {
      canNext = st.quiz.every((_, qi) => state.quizAns[qi] != null);
      st.quiz.forEach((qq, qi) => {
        body.push(h('p', { class: 'q' }, qq.q));
        body.push(h('div', { class: 'opts' }, qq.options.map((o, i) => h('button', { class: 'opt' + (state.quizAns[qi] != null ? (i === qq.answer ? ' right' : i === state.quizAns[qi] ? ' wrong' : '') : ''), disabled: state.quizAns[qi] != null, onclick: () => { state.quizAns[qi] = i; render(); } }, letter(i), h('span', {}, o)))));
      });
    }
    const [ic, typeLabel] = STEP[st.type];
    const card = h('section', { class: 'lesson', 'aria-label': `Lesson: ${lesson.title}` },
      h('div', { class: 'lesson-top' }, h('span', { class: 'step-type' }, svgIcon(ic, 'sec-ic'), typeLabel, h('span', { class: 'n' }, `· Step ${idx + 1} of ${lesson.steps.length}`)), h('button', { class: 'link', onclick: stop }, 'Exit lesson')),
      h('div', { class: 'progress', 'aria-hidden': 'true' }, lesson.steps.map((_, i) => h('i', { class: i < idx ? 'on' : i === idx ? 'cur' : '' }))),
      h('h3', {}, lesson.title), ...body,
      h('div', { class: 'lesson-foot' }, idx > 0 ? h('button', { class: 'btn ghost', onclick: back }, 'Back') : h('span'),
        h('button', { class: 'btn primary', disabled: !canNext, onclick: () => { if (st.type === 'predict' && st.mode === 'draw') dock.profile.endPredict(false); next(); } }, idx === lesson.steps.length - 1 ? 'Finish lesson' : 'Continue', svgIcon('chev-right'))));
    const toggleAll = h('button', { class: 'btn all-controls-toggle', 'aria-expanded': String(showAll), onclick: () => { showAll = !showAll; render(); } }, showAll ? 'Hide all controls' : 'Show all controls', svgIcon(showAll ? 'chev-down' : 'chev-right'));
    hostEl.replaceChildren(card, toggleAll);
  }

  store.on('mode', (m) => { if (m !== 'learn' && lesson) stop(); render(); });
  return { openList, start, stop, render, active: () => !!lesson };
}
