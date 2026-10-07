// Presenter scripts (plan §5.4): an ordered list of model states with speaker notes, stepped with
// the arrow keys or a clicker like a slide deck that is a live model. Presenting turns on
// projector mode; notes can open in a second window for the presenter's screen; L toggles a laser
// pointer. Instructors build their own scripts from the current model and share them as a file
// or a link.

import { store } from './store.js?v=b742a09e9e';
import { runSequence, restoreSequence } from './sequence.js?v=ad22faf8b8';
import { h, toast, svgIcon, icon } from './util.js?v=8aa5e5cdf1';
import { download } from './records.js?v=50fb9dd463';

const ask = (q, a) => `\n\nAsk the room: ${q} Expected: ${a}`;
export const SCRIPTS = [
  {
    id: 'ph-five', title: 'Portal pressure in five minutes', builtin: true,
    summary: 'A pressure difference moves blood: sinusoidal, presinusoidal and downstream blocks.',
    steps: [
      { title: 'A pressure difference moves blood. (1 min)', preset: 'healthy', view: 'circuit', zoom: 'fit', pane: 'profile',
        notes: 'Follow blood from the bowel and spleen through the liver to the heart. Across any route, pressure drop equals flow times resistance. Use the difference between two pressures, rather than a single pressure. The portal vein has no valve that guarantees one direction.' + ask('If upstream and downstream pressures become equal, what drives steady flow through this route?', 'No pressure difference remains to drive that flow.') },
      { title: 'Put resistance in the liver. (1.5 min)', preset: 'csph', view: 'anatomic', zoom: 'lobule', pane: 'profile',
        notes: 'This is a sinusoidal example. Hepatic venous pressure gradient, or HVPG, is wedged minus free hepatic venous pressure. In sinusoidal cirrhosis it can reflect the upstream pressure problem. Clinically significant portal hypertension in this setting is conventionally defined by HVPG of at least 10 mmHg. The model supplies a wedge surrogate, not an actual catheter procedure.' + ask('Which two pressures form HVPG?', 'Wedged minus free hepatic venous pressure.') },
      { title: 'Move the obstruction upstream. (1.5 min)', preset: 'schisto', view: 'anatomic', zoom: 'lobule', pane: 'profile',
        notes: 'This presinusoidal example has high pressure upstream of the sinusoids. A low HVPG does not exclude portal hypertension here. The app’s portal pressure gradient, or PPG, subtracts upper-caval pressure from confluence pressure. It is a direct network readout at those points, not an interchangeable clinical measurement. Compare PPG with HVPG in the Hepatic vein pressures card.' + ask('Does this low HVPG rule out the upstream obstruction?', 'No, the wedge surrogate does not capture all upstream resistance.') },
      { title: 'Raise the pressure downstream. (1 min)', preset: 'rhf', params: { pulsatile: true }, view: 'anatomic', zoom: 'fit', pane: 'profile',
        notes: 'Congestion can raise both hepatic venous pressures together. A small difference can coexist with high absolute pressure. Identify the resistance site before choosing a treatment. This model demonstrates backpressure. It does not establish a real patient’s cardiac diagnosis or procedural eligibility. Keep endoscopy closed. Related lessons: valveless, resistance-site, hvpg, heart.' + ask('Which matters here: the small difference alone, or the absolute pressures and their location?', 'Assess both absolute pressures and location.') },
    ],
  },
  {
    id: 'ph-ten', title: 'From resistance to collateral flow', builtin: true,
    summary: 'Pressure difference → sinusoidal resistance → inflow → drugs → collaterals → TIPS.',
    steps: [
      { title: 'Start with the pressure difference. (1 min)', preset: 'healthy', view: 'circuit', zoom: 'fit', pane: 'profile',
        notes: 'Use pressure drop = flow × resistance as our starting relationship. It describes a route within a coupled circulation. The whole network can change when we alter one route. A pressure reading without its location and reference is incomplete.' + ask('What must we subtract from upstream pressure to describe a pressure drop?', 'Downstream pressure for the same route.') },
      { title: 'Add sinusoidal resistance. (2 min)', preset: 'cirr-comp', view: 'anatomic', zoom: 'lobule', pane: 'profile',
        notes: 'The cirrhosis control is an educational resistance macro. It is not a histologic percentage or a clinical score. This mild state raises the sinusoidal pressure difference. Contrast this profile with a portal-vein obstruction, which puts the largest drop elsewhere.' + ask('Where is the main added resistance in this state?', 'The sinusoidal bed.') },
      { title: 'Inflow still matters. (2 min)', preset: 'csph', params: { splanchnicTone: 0.6 }, view: 'anatomic', zoom: 'fit', pane: 'profile',
        notes: 'Compare HVPG and portal flow with the CSPH baseline shown in lesson Forward. Lowering this tone control lowers modeled arterial resistance in the splanchnic bed. More inflow meets the resistant liver. Nonselective beta blockers, or NSBBs, address part of this mechanism. Clinical prevention benefits come from trials, not from the magnitude of this slider response.' + ask('With liver resistance unchanged, can more inflow raise upstream pressure?', 'Yes.') },
      { title: 'Reduce inflow pharmacologically. (1.5 min)', preset: 'csph', params: { drugs: { carvedilol: true, propranolol: false, terlipressin: false, octreotide: false } }, view: 'anatomic', zoom: 'fit', pane: 'profile',
        notes: 'Carvedilol represents beta blockade plus a reduction in intrahepatic tone in this model. Propranolol has a different fixed parameter effect. These are mechanism illustrations. They do not compare clinical doses, tolerability or individual response. In compensated cirrhosis with clinically significant portal hypertension, trial evidence supports NSBB prevention of decompensation.' + ask('Why should we watch systemic pressure as well as the portal gradient?', 'An intervention can affect systemic hemodynamics and tolerability.') },
      { title: 'Let collaterals remodel. (2 min)', preset: 'healthy', params: { cirrhosis: 0.65 }, days: 180, view: 'anatomic', zoom: 'fit', pane: 'profile',
        notes: 'Alternative routes can carry flow immediately when a gradient exists. Their caliber can also remodel over time. The disease clock is separate from the beat-to-beat clock. Collaterals can decompress one pathway while exposing another tissue to pressure and flow.' + ask('Does opening a collateral guarantee normal pressure or normal liver perfusion?', 'No.') },
      { title: 'A bypass changes several quantities. (1.5 min)', preset: 'cirr-decomp', params: { tips: { on: true, d: 8 } }, view: 'anatomic', zoom: 'fit', pane: 'profile',
        notes: 'Transjugular intrahepatic portosystemic shunt, or TIPS, bypasses part of the liver resistance. It redistributes flow and may increase downstream load. The model’s shunt fraction saturates in this example. It cannot predict encephalopathy, survival or the safest diameter. Selection requires clinical information outside this network. Related lessons: valveless, resistance-site, forward, collaterals, costs.' + ask('Which additional quantities should we inspect after pressure falls?', 'Bypass flow, sinusoidal flow and downstream pressure/load, alongside clinical eligibility.') },
    ],
  },
  {
    id: 'where-block', title: 'Where is the block?', builtin: true,
    summary: 'Prehepatic, presinusoidal, sinusoidal, postsinusoidal, posthepatic and cardiac, on one profile.',
    steps: [
      { title: 'Prehepatic: portal vein thrombosis', preset: 'pvt-chronic', view: 'anatomic', zoom: 'fit', pane: 'profile', notes: 'The step sits before the liver. HVPG is normal; the cavernoma carries hepatopetal flow around the clot.' },
      { title: 'Presinusoidal: schistosomiasis', preset: 'schisto', notes: 'The block is in the portal tracts. Portal pressure is high but the wedge only reaches normal sinusoids: HVPG underestimates it. Little ascites.' },
      { title: 'Sinusoidal: cirrhosis', preset: 'cirr-comp', notes: 'The big drop is across the sinusoids. WHVP ≈ portal pressure: HVPG is valid here.' },
      { title: 'Postsinusoidal: sinusoidal obstruction syndrome', preset: 'sos', notes: 'Central veins occluded: high HVPG, a congested liver and ascites.' },
      { title: 'Posthepatic: Budd–Chiari', preset: 'budd-chiari', notes: 'Hepatic vein outflow is blocked; the caudate lobe, with its own veins to the IVC, carries the outflow and enlarges.' },
      { title: 'Cardiac: right heart failure', preset: 'rhf', notes: 'Right atrial pressure transmits back: FHVP and WHVP rise together, so HVPG stays normal. Protein-rich ascites; a pulsatile portal vein.' },
    ],
  },
  {
    id: 'bleed', title: 'The bleeding patient', builtin: true,
    summary: 'A variceal bleed and its treatment, step by step.',
    steps: [
      { title: 'Decompensated cirrhosis', preset: 'cirr-decomp', view: 'anatomic', zoom: 'fit', pane: 'endoscopy', notes: 'Large varices with red wale signs: modeled wall stress is close to its rupture point (index = ΔP·r / w).' },
      { title: 'The varix ruptures', action: { kind: 'rupture', site: 'VAR', tear: 0.8 }, notes: 'Blood loss lowers portal pressure and the bleeding may pause; over-transfusion would refill the splanchnic veins and restart it.' },
      { title: 'Terlipressin', params: { drugs: { terlipressin: true } }, pane: 'varixwall', notes: 'Splanchnic vasoconstriction lowers portal inflow within minutes: variceal pressure and modeled wall stress fall.' },
      { title: 'Band ligation', action: { kind: 'band' }, pane: 'endoscopy', notes: 'EVL removes the bleeding source but leaves portal pressure unchanged.' },
      { title: 'The same patient as a circuit', view: 'circuit', notes: 'The circuit shows every route the blood can take; watch the collateral lanes.' },
    ],
  },
];

const KEY = 'pps.scripts';
const readMine = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const writeMine = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable */ } };
const enc = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = (s) => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));

export function createPresenter({ loadPreset, updateParams, host, stage, dock, action, projectorOn, projectorOff, closeHome, rerenderHome }) {
  let script = null, idx = 0, bar = null, titleEl = null, progEl = null, notesEl = null, notesOpen = false, laser = null;
  const all = () => [...SCRIPTS, ...readMine()];

  // A slide's model state is a pure function of the slide before it: each is computed once from
  // the previous slide's canonical snapshot (reset → patch → settle → action → post-patch days →
  // settle → snapshot, see sequence.js) and cached, so forward, back and jump all show identical
  // numbers. Step fields: preset + presetDays (native pre-aging), params, action, days (extra
  // disease days after the patch), then the view bindings below.
  let slides = [], chain = Promise.resolve();
  async function resolveSlide(i) {
    if (slides[i]) return slides[i];
    if (i > 0) restoreSequence(await resolveSlide(i - 1));
    const step = script.steps[i];
    return (slides[i] = await runSequence({ ...step, label: step.title }, { loadPreset, action }));
  }
  async function apply(i) {
    const step = script.steps[i];
    restoreSequence(await resolveSlide(i));
    if (step.view && step.view !== store.get().view) store.set({ view: step.view });
    if (step.lens) store.set({ colorMode: step.lens });
    if (step.zoom === 'lobule') stage.zoomLobule('R');
    else if (step.zoom === 'liver' || step.zoom === 'fit') { store.set({ lobule: false }); if (step.zoom === 'liver') stage.zoomLiver(); else stage.fit(); }
    if (step.pane) dock.show(step.pane, { reveal: true });
    if (step.probe) host.send({ type: 'probe', id: step.probe });
    if (step.invert != null) dock.pane('doppler')?.setInvert?.(step.invert);
    if (step.endo) dock.pane('endoscopy')?.setView?.(step.endo);
    host.send({ type: 'run', running: true });
  }
  async function go(i) {
    if (!script) return;
    idx = Math.max(0, Math.min(script.steps.length - 1, i));
    renderBar();
    const at = idx;
    chain = chain.then(async () => { if (script && at === idx) { await apply(at); writeNotes(); } });
    await chain;
  }
  // Presenting is chrome-free: the figure, the hero metric, the slide title and a slim progress
  // bar. The controls appear when the mouse moves and fade after 2 s (clickers and keys work
  // without them).
  function renderBar() {
    if (!bar) return;
    const st = script.steps[idx], n = script.steps.length;
    titleEl.replaceChildren(h('span', { class: 'pt-n' }, `${idx + 1} / ${n} · ${script.title}`), h('span', { class: 'pt-t' }, st.title), idx === 0 ? h('span', { class: 'pt-hint' }, '← → or Space: slides · N: speaker notes · L: laser · Esc: exit') : null);
    progEl.firstChild.style.width = `${((idx + 1) / n) * 100}%`;
    progEl.setAttribute('aria-valuenow', String(idx + 1)); progEl.setAttribute('aria-valuemax', String(n));
    bar.replaceChildren(
      h('button', { class: 'ib', 'aria-label': 'Previous step', disabled: idx === 0, onclick: () => go(idx - 1) }, icon('chev-left')),
      h('span', { class: 'pb-n' }, `${idx + 1} / ${n}`),
      h('button', { class: 'ib', 'aria-label': 'Next step', disabled: idx === n - 1, onclick: () => go(idx + 1) }, icon('chev-right')),
      h('span', { class: 'pb-sep' }),
      h('button', { class: 'btn sm', 'aria-pressed': String(notesOpen), onclick: () => toggleNotes(), title: 'Speaker notes (N)' }, 'Notes'),
      h('button', { class: 'btn sm', 'aria-pressed': String(!!laser), onclick: toggleLaser, title: 'Laser pointer (L)' }, 'Laser'),
      h('button', { class: 'ib', 'aria-label': 'Stop presenting', title: 'Stop presenting (Esc)', onclick: stop }, icon('close')));
  }
  let idleT = 0;
  function wake() {
    if (!bar) return;
    bar.classList.remove('idle');
    clearTimeout(idleT);
    idleT = setTimeout(() => { if (bar && !bar.matches(':hover, :focus-within')) bar.classList.add('idle'); else wake(); }, 2000);
  }
  // Speaker notes live in the app: a drawer over the right edge of the figure (N toggles it, so it
  // also works on a tablet or phone). The room question is split out of the notes and highlighted.
  function toggleNotes(force) {
    notesOpen = force ?? !notesOpen;
    writeNotes(); renderBar();
  }
  function writeNotes() {
    if (!script || !notesEl) return;
    notesEl.hidden = !notesOpen;
    if (!notesOpen) return;
    const st = script.steps[idx], nx = script.steps[idx + 1];
    const [text, ask] = String(st.notes || '').split(/\n\nAsk the room: /);
    const [q, a] = (ask || '').split(' Expected: ');
    notesEl.replaceChildren(
      h('div', { class: 'pn-top' }, h('span', { class: 'pn-k' }, `Speaker notes · ${idx + 1} / ${script.steps.length}`), h('button', { class: 'ib', 'aria-label': 'Close notes', onclick: () => toggleNotes(false) }, icon('close'))),
      h('h2', {}, st.title),
      h('p', {}, text || 'No notes for this step.'),
      ask ? h('div', { class: 'pn-ask' }, h('b', {}, 'Ask the room'), h('p', {}, q), a ? h('p', { class: 'pn-a' }, 'Expected: ' + a) : null) : null,
      nx ? h('p', { class: 'pn-next' }, `Next: ${nx.title}`) : null);
  }
  function toggleLaser() {
    if (laser) { laser.remove(); laser = null; document.body.classList.remove('laser-on'); renderBar(); return; }
    laser = h('div', { class: 'laser', 'aria-hidden': 'true' });
    document.body.append(laser);
    document.body.classList.add('laser-on');
    renderBar();
  }
  addEventListener('pointermove', (e) => { if (laser) laser.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; if (script) wake(); });

  async function start(id) {
    script = typeof id === 'object' ? id : all().find((s) => s.id === id);
    if (!script?.steps?.length) return;
    slides = []; chain = Promise.resolve();
    closeHome?.();
    if (store.get().mode !== 'explore') store.set({ mode: 'explore' });
    projectorOn();
    bar = h('div', { class: 'presenter-bar stage-blocker', role: 'toolbar', 'aria-label': 'Presenter' });
    bar.addEventListener('focusin', wake);
    titleEl = h('div', { class: 'presenter-title stage-blocker', role: 'status' });
    progEl = h('div', { class: 'presenter-progress', role: 'progressbar', 'aria-label': 'Slide', 'aria-valuemin': '1' }, h('i'));
    notesEl = h('aside', { class: 'presenter-notes stage-blocker', 'aria-label': 'Speaker notes', hidden: true });
    notesOpen = false;
    document.getElementById('stageView').append(titleEl, progEl, notesEl, bar);
    document.getElementById('app').classList.add('presenting');
    store.set({ selection: null });
    stage.setProjection(true);
    await go(0);
    wake();
  }
  function stop() {
    if (!script) return;
    script = null;
    bar?.remove(); titleEl?.remove(); progEl?.remove(); notesEl?.remove(); bar = titleEl = progEl = notesEl = null;
    clearTimeout(idleT);
    stage.setProjection(false);
    if (laser) toggleLaser();
    document.getElementById('app').classList.remove('presenting');
    projectorOff();
  }
  // Keys while presenting: arrows / Page Up-Down (clickers) / space step; N notes; L laser; Esc stops.
  addEventListener('keydown', (e) => {
    if (!script || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    let used = true;
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ') go(idx + 1);
    else if (k === 'ArrowLeft' || k === 'PageUp') go(idx - 1);
    else if (k === 'Home') go(0);
    else if (k === 'End') go(script.steps.length - 1);
    else if (k.toLowerCase() === 'n') toggleNotes();
    else if (k.toLowerCase() === 'l') toggleLaser();
    else if (k === 'Escape') stop();
    else used = false;
    if (used) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  // ── Library (Home › Presenter) ──
  function captureStep() {
    const st = store.get();
    return { title: st.presetList?.find((p) => p.id === st.presetId)?.label || 'Step', preset: st.presetId, params: structuredClone(st.params), view: st.view, notes: '' };
  }
  function newScript() {
    const title = prompt('Name the new script', 'My script');
    if (!title) return;
    const list = readMine();
    list.push({ id: 'my-' + Date.now().toString(36), title, summary: 'Built from the live model.', steps: [captureStep()] });
    writeMine(list); rerenderHome?.();
    toast('Script created with the current model as its first step. Change the model and use “Add current state” to add more.');
  }
  function addStep(id) {
    const list = readMine(), s = list.find((x) => x.id === id);
    if (!s) return;
    const step = captureStep();
    step.title = prompt('Title for this step', step.title) || step.title;
    step.notes = prompt('Speaker notes (optional)', '') || '';
    s.steps.push(step); writeMine(list); rerenderHome?.();
  }
  function remove(id) { if (!confirm('Delete this script?')) return; writeMine(readMine().filter((x) => x.id !== id)); rerenderHome?.(); }
  function exportScript(s) { download(`${s.title.replace(/[^\w-]+/g, '-').toLowerCase()}.pps-script.json`, JSON.stringify({ ...s, builtin: undefined }, null, 2), 'application/json'); }
  function shareLink(s) {
    const url = `${location.origin}${location.pathname}#script=${enc({ ...s, builtin: undefined })}`;
    navigator.clipboard?.writeText(url).then(() => toast('Link copied: opening it adds the script to the recipient’s library.'), () => prompt('Copy this link', url));
  }
  function importFile() {
    const inp = h('input', { type: 'file', accept: '.json,application/json' });
    inp.addEventListener('change', async () => {
      try { addToLibrary(JSON.parse(await inp.files[0].text())); } catch { toast('That file is not a presenter script.'); }
    });
    inp.click();
  }
  function addToLibrary(s) {
    if (!s?.title || !Array.isArray(s.steps)) throw new Error('bad script');
    const list = readMine();
    list.push({ ...s, id: 'my-' + Date.now().toString(36), builtin: undefined });
    writeMine(list); rerenderHome?.();
    toast(`Added “${s.title}” to your scripts.`);
  }
  /** A shared link (#script=…) adds its script to this device's library. */
  function readLink() {
    const m = location.hash.match(/#script=([\w-]+)/);
    if (!m) return false;
    try { addToLibrary(dec(m[1])); } catch { toast('The shared script could not be read.'); }
    history.replaceState(null, '', location.pathname + location.search);
    return true;
  }

  function home() {
    const mine = new Set(readMine().map((s) => s.id));
    const card = (s) => h('div', { class: 'home-item script' },
      h('span', { class: 'meta' }, `${s.steps.length} steps`, s.builtin ? 'Built in' : 'Yours'),
      h('span', { class: 't' }, s.title), h('span', { class: 'd' }, s.summary || ''),
      h('span', { class: 'script-acts' },
        h('button', { class: 'btn sm primary', onclick: () => start(s.id) }, svgIcon('projector', 'mi-ic'), 'Present'),
        mine.has(s.id) ? h('button', { class: 'btn sm', onclick: () => addStep(s.id) }, 'Add current state') : null,
        h('button', { class: 'btn sm ghost', onclick: () => shareLink(s) }, 'Share link'),
        h('button', { class: 'btn sm ghost', onclick: () => exportScript(s) }, 'Export'),
        mine.has(s.id) ? h('button', { class: 'btn sm ghost', onclick: () => remove(s.id) }, 'Delete') : null));
    return h('div', {},
      h('div', { class: 'home-grid' }, all().map(card)),
      h('div', { class: 'btn-row', style: { marginTop: '16px' } },
        h('button', { class: 'btn', onclick: newScript }, 'New script from the current model'),
        h('button', { class: 'btn', onclick: importFile }, 'Import a script')),
      h('p', { class: 'ctl-sub' }, 'While presenting: → or Page Down for the next step, ← to go back, N opens speaker notes in a second window, L is a laser pointer, Esc stops.'));
  }

  return { start, stop, home, readLink, active: () => !!script };
}
