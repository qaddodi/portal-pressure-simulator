// The course (guided-learning rethink, option A): eight units in a fixed order, then a final
// assessment. A unit is a lesson (learn.js runs it) with `unit` set; it runs on the unit surface,
// where the card at the bottom owns the screen and the rest of the chrome is hidden.
// Progress lives on this device in pps.course; plans/course-api.md documents the shapes.

import { store } from './store.js?v=49dc9cdf15';
import { h } from './util.js?v=a357853926';

// A unit: id, n (its number), part ('A' mechanism, 'B' clinic), title, objective (what the student
// can do after it), minutes, keyPoints (three margin notes, kept for the summary page) and steps
// (learn.js step types; a unit uses stem, frame/observe for Watch, do for Try and keypoints).
// `draft: true` marks a unit whose content is still a placeholder.
const stub = (objective) => [
  { sid: 'intro', type: 'frame', tools: ['select'], text: `This unit is being written. Its objective: ${objective}` },
  { sid: 'keypoints', type: 'keypoints' },
];
export const UNITS = [
  { id: 'u1-normal', n: 1, part: 'A', title: 'Normal portal circulation', minutes: 7, draft: true,
    objective: 'Trace portal flow from gut to heart; state normal portal pressure, HVPG and flow direction on Doppler.' },
  { id: 'u2-hvpg', n: 2, part: 'A', title: 'Measuring portal pressure: HVPG', minutes: 8, draft: true,
    objective: 'Define WHVP, FHVP and HVPG; apply the 5, 10 and 12 mmHg cut-offs; say when HVPG is falsely normal.' },
  { id: 'u3-site', n: 3, part: 'A', title: 'Site of obstruction', minutes: 9,
    objective: 'Localise the block from liver tests, SAAG and protein, HVPG and Doppler.',
    keyPoints: ['Prehepatic and presinusoidal blocks: normal liver tests, normal HVPG, big varices.', 'Sinusoidal block (cirrhosis): high HVPG, low-protein ascites, sick liver.', 'Post-sinusoidal and cardiac: high-protein ascites, hepatomegaly; HVPG normal in heart failure.'],
    steps: [
      { sid: 'vignette', type: 'stem', preset: 'healthy', view: 'anatomic', next: 'Show me',
        stem: 'A 28-year-old man who grew up in rural Egypt presents after an episode of hematemesis. He has no history of alcohol use. The spleen is palpable 6 cm below the costal margin; there is no ascites or jaundice. Bilirubin 0.8 mg/dL, albumin 4.1 g/dL, INR 1.0, platelets 90 ×10⁹/L. Upper endoscopy shows large esophageal varices. HVPG is 4 mmHg.',
        q: 'Which of the following is the most likely site of increased resistance?',
        options: ['Splenic vein', 'Main portal vein', 'Presinusoidal portal venules', 'Hepatic sinusoids', 'Hepatic veins'], answer: 2,
        explain: ['A splenic vein block gives isolated gastric varices, not large esophageal ones.', 'Portal vein thrombosis also keeps HVPG normal, but Doppler would show a cavernoma; his exposure points to schistosomiasis.', 'Schistosomal periportal fibrosis: the block sits before the sinusoids, so the wedged pressure and HVPG stay normal.', 'Sinusoidal disease (cirrhosis) raises the HVPG, and the liver tests would be abnormal.', 'A hepatic vein block gives ascites with high protein and an enlarged liver.'] },
      { sid: 'watch-anatomy', type: 'frame', preset: 'schisto', view: 'anatomic', zoom: 'fit', tools: ['select'], focus: ['PRE_R', 'PRE_L'], focusLabel: 'Small portal branches',
        text: 'Blood falls from the portal vein through the sinusoids to the hepatic veins. A block **before** the sinusoids raises portal pressure, but the wedged pressure, measured beyond the block, stays normal. So the HVPG is normal.' },
      { sid: 'watch-lobule', type: 'frame', preset: 'schisto', zoom: 'lobule', tools: ['select'],
        text: 'The fibrosis sits around the portal tracts; the sinusoids are open. Liver function is preserved: normal albumin, normal INR, no ascites.' },
      { sid: 'try-splenic', type: 'do', preset: 'healthy', view: 'circuit', zoom: 'fit', tools: ['select', 'thrombus'], focus: ['SV_CONF'], focusLabel: 'Splenic vein',
        text: 'Now **put a clot in the splenic vein**. Watch which pressures rise.', hint: 'Tap the splenic vein on the figure, then drag Clot to 100 %.',
        data: [{ label: 'Splenic vein', metric: 'sv', unit: 'mmHg' }, { label: 'Portal vein', metric: 'pv', unit: 'mmHg' }],
        after: 'Only the splenic side rises; portal pressure and HVPG are unchanged. This is left-sided portal hypertension: isolated fundal varices with a normal liver, treated by splenectomy or splenic artery embolisation, not by TIPS.',
        stay: true, goal: (f, p) => (p.thrombus.SV_CONF || 0) >= 0.99 },
      { sid: 'check-1', type: 'stem', preset: 'budd-chiari',
        stem: 'A 34-year-old woman taking a combined oral contraceptive has had two weeks of right upper quadrant pain and rapidly increasing abdominal girth. The liver is enlarged and tender. Ascitic fluid: SAAG 1.8 g/dL, protein 3.2 g/dL. Doppler shows no flow in the hepatic veins.',
        q: 'Which is the site of increased resistance?',
        options: ['Splenic vein', 'Portal vein', 'Presinusoidal venules', 'Hepatic sinusoids', 'Hepatic veins'], answer: 4,
        explain: ['A splenic vein block does not cause ascites.', 'Portal vein thrombosis rarely causes ascites, and Doppler would show the clot in the portal vein.', 'A presinusoidal block spares the sinusoids, so ascites is uncommon.', 'Sinusoidal (cirrhotic) ascites has protein under 2.5 g/dL; hers is high.', 'Budd-Chiari: no hepatic vein flow, a big tender liver and high-protein ascites.'] },
      { sid: 'check-2', type: 'stem', preset: 'cirr-decomp',
        stem: 'A 52-year-old man with 20 years of heavy alcohol use presents with ascites. Albumin 2.6 g/dL, INR 1.7, bilirubin 2.4 mg/dL. Ascitic fluid: SAAG 1.6 g/dL, protein 1.1 g/dL. HVPG is 16 mmHg.',
        q: 'Which is the site of increased resistance?',
        options: ['Splenic vein', 'Portal vein', 'Presinusoidal venules', 'Hepatic sinusoids', 'Hepatic veins'], answer: 3,
        explain: ['A splenic vein block leaves the HVPG and the liver normal.', 'A portal vein block keeps the HVPG normal.', 'A presinusoidal block keeps the HVPG normal and the liver working.', 'Cirrhosis: high HVPG, low-protein ascites and a failing liver.', 'A hepatic vein block gives high-protein ascites.'] },
      { sid: 'keypoints', type: 'keypoints' },
    ] },
  { id: 'u4-varices', n: 4, part: 'A', title: 'Varices and collaterals', minutes: 9, draft: true,
    objective: 'Explain why collaterals open, where varices form and who bleeds; choose primary prophylaxis.' },
  { id: 'u5-ascites', n: 5, part: 'A', title: 'Ascites', minutes: 8, draft: true,
    objective: 'Explain sinusoidal pressure and albumin; read SAAG and protein; choose first-line treatment.' },
  { id: 'u6-new-ascites', n: 6, part: 'B', title: 'New-onset ascites', minutes: 9, draft: true,
    objective: 'Order the right tests, read the tap, localise the cause and start treatment.' },
  { id: 'u7-bleed', n: 7, part: 'B', title: 'Acute variceal bleeding', minutes: 10, draft: true,
    objective: 'Run the first hour, band, prevent rebleeding and know when to use TIPS.' },
  { id: 'u8-refractory', n: 8, part: 'B', title: 'Refractory ascites and TIPS', minutes: 10, draft: true,
    objective: 'Recognise refractory ascites and weigh TIPS against paracentesis and albumin.' },
].map((u) => ({ steps: stub(u.objective), keyPoints: [], ...u, unit: u.n, pearls: null }));
export const FINAL = { id: 'final', title: 'Final assessment', minutes: 15, objective: 'Ten mixed vignettes; pass at 70 %.', draft: true };
export const PARTS = { A: 'Mechanism', B: 'Clinic' };

// ── Progress ────────────────────────────────────────
// pps.course = { done: { [unitId]: { score, date } }, at: { [unitId]: stepIndex }, unlockAll }
const KEY = 'pps.course';
const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return { done: v.done || {}, at: v.at || {}, unlockAll: !!v.unlockAll }; } catch { return { done: {}, at: {}, unlockAll: false }; } };
const write = (p) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ } };

export const course = {
  progress: read,
  unit: (id) => UNITS.find((u) => u.id === id) || null,
  /** 'done' | 'open' | 'locked'. A unit opens when the one before it is done, or for an instructor who unlocked all. */
  state(id) {
    const p = read(), i = UNITS.findIndex((u) => u.id === id);
    if (id === FINAL.id) return p.done.final ? 'done' : UNITS.every((u) => p.done[u.id]) || this.allUnlocked() ? 'open' : 'locked';
    if (i < 0) return 'locked';
    if (p.done[id]) return 'done';
    return i === 0 || p.done[UNITS[i - 1].id] || this.allUnlocked() ? 'open' : 'locked';
  },
  /** The unit "Continue" opens: one in progress, else the first open one not done; null when all are done. */
  next() {
    const p = read();
    return UNITS.find((u) => p.at[u.id] > 0 && !p.done[u.id] && this.state(u.id) === 'open') || UNITS.find((u) => this.state(u.id) === 'open') || null;
  },
  doneCount: () => { const p = read(); return UNITS.filter((u) => p.done[u.id]).length; },
  /** The step to resume at (0 when new or finished). */
  resumeAt: (id) => (read().done[id] ? 0 : read().at[id] || 0),
  saveStep(id, idx) { const p = read(); p.at[id] = idx; write(p); },
  complete(id, score) { const p = read(); p.done[id] = { score: Math.max(score ?? 0, p.done[id]?.score ?? 0), date: new Date().toISOString() }; delete p.at[id]; write(p); },
  allUnlocked: () => store.get().role === 'instructor' && read().unlockAll,
  setUnlockAll(on) { const p = read(); p.unlockAll = !!on; write(p); },
  /** Key points of the finished units, in course order (the summary page). */
  keyPoints: () => { const p = read(); return UNITS.filter((u) => p.done[u.id] && u.keyPoints.length).map((u) => ({ unit: u, points: u.keyPoints })); },
};

// ── The unit surface ────────────────────────────────
// One hook for every runner (lessons now; cases and the final assessment later): it hides the top bar,
// readouts, narrator, Why?, zoom, timeline, side panel and cards (styles: .app.unit-on), so the card
// at the bottom owns the screen. `opts.try` lets the figure take input (a Try step).
export function setUnitSurface(on, opts = {}) {
  const app = document.getElementById('app');
  if (!app) return;
  const was = app.classList.contains('unit-on');
  app.classList.toggle('unit-on', !!on);
  app.classList.toggle('unit-try', !!on && !!opts.try);
  if (was !== !!on) { store.set({ unitSurface: !!on }); dispatchEvent(new Event('resize')); }
}
export const unitSurfaceOn = () => !!document.getElementById('app')?.classList.contains('unit-on');

/** "Unit 3 · 4 of 7" and a thin bar: the progress line at the top of a unit's card. */
export function unitBar(unit, idx, total) {
  const pct = Math.round((100 * (idx + 1)) / Math.max(1, total));
  return h('div', { class: 'unit-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(idx + 1), 'aria-label': `Unit ${unit.n}, step ${idx + 1} of ${total}` },
    h('span', { class: 'ub-t' }, h('b', {}, `Unit ${unit.n}`), ` · ${idx + 1} of ${total}`),
    h('span', { class: 'ub-track' }, h('i', { style: { width: `${pct}%` } })));
}
