// Presenter scripts (plan §5.4): an ordered list of model states with speaker notes, stepped with
// the arrow keys or a clicker like a slide deck that is a live model. Presenting turns on
// projector mode; notes can open in a second window for the presenter's screen; L toggles a laser
// pointer. Instructors build their own scripts from the current model and share them as a file
// or a link.

import { store } from './store.js?v=49dc9cdf15';
import { runSequence, restoreSequence } from './sequence.js?v=f8b2dfcd73';
import { h, toast, svgIcon, icon } from './util.js?v=a357853926';
import { download } from './records.js?v=50fb9dd463';
import { TOUR, createTour } from './tour.js?v=34e0710a5c';

const ask = (q, a) => `\n\nAsk the room: ${q} Expected: ${a}`;
// Lecture scripts share the tour's card (route, ladder, tiles) and its clinical voice, but wait for
// the presenter instead of playing on their own.
const lecture = (s) => ({ ...s, builtin: true, tour: true, autoplay: false, steps: s.steps.map((st) => ({ zoom: 'fit', view: 'anatomic', ...st, notes: st.tell + (st.ask ? ask(...st.ask) : '') })) });
export const SCRIPTS = [
  TOUR,
  lecture({
    id: 'bleed', title: 'Acute variceal bleeding', label: 'What to see',
    summary: 'A variceal bleed: why it happens, how to transfuse and what each treatment does.',
    steps: [
      { preset: 'cirr-decomp', kicker: 'Before the bleed', title: 'Decompensated cirrhosis', site: 'sin', key: ['hvpg'],
        tell: 'HVPG is well above 12 mmHg, the level at which varices can bleed. Wall tension rises with the pressure inside and the size of the varix and falls with wall thickness: large varices with red signs are the ones that burst.',
        ask: ['Which varices bleed?', 'Large ones with red signs, at high pressure.'] },
      { action: { kind: 'rupture', site: 'VAR', tear: 0.8 }, kicker: 'Bleed', title: 'The varix ruptures', site: 'sin', key: ['pv', 'hvpg'],
        tell: 'Blood loss drops the pressure and the bleed can slow on its own. Transfuse to a hemoglobin of 7 to 8 g/dL: over-transfusion refills the portal bed and restarts the bleeding.',
        ask: ['Why transfuse to only 7 to 8 g/dL?', 'More volume raises portal pressure and restarts the bleed.'] },
      { params: { drugs: { terlipressin: true } }, kicker: 'Treatment · first hour', title: 'Terlipressin', site: 'sin', key: ['pv', 'hvpg'],
        tell: 'Splanchnic vasoconstriction cuts portal inflow within minutes, and variceal pressure falls. Start it before endoscopy, together with antibiotics (ceftriaxone).',
        ask: ['What else starts before endoscopy?', 'Antibiotics, such as ceftriaxone.'] },
      { action: { kind: 'band' }, kicker: 'Treatment · endoscopy', title: 'Band ligation', site: 'sin', key: ['pv', 'hvpg'],
        tell: 'Bands strangle the bleeding varix, ideally within 12 hours. They stop the source but leave portal pressure unchanged, so a beta blocker follows to prevent the next bleed, and pre-emptive TIPS for the highest-risk patients.',
        ask: ['Does banding lower portal pressure?', 'No: it treats the varix, not the pressure.'] },
    ],
  }),
];

const KEY = 'pps.scripts';
const readMine = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const writeMine = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable */ } };
const enc = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = (s) => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));

export function createPresenter({ startCase, cases = [], loadPreset, updateParams, host, stage, dock, action, projectorOn, projectorOff, closeHome, rerenderHome }) {
  let script = null, tour = null, idx = 0, bar = null, titleEl = null, progEl = null, notesEl = null, notesOpen = false, laser = null;
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
    renderBar(); tour?.show(idx); writeNotes();
    const at = idx;
    chain = chain.then(async () => { if (script && at === idx) { await apply(at); writeNotes(); await tour?.ready(at); } });
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
    store.set({ presenting: true });
    if (store.get().mode !== 'explore') store.set({ mode: 'explore' });
    projectorOn();
    notesEl = h('aside', { class: 'presenter-notes stage-blocker', 'aria-label': 'Speaker notes', hidden: true });
    notesOpen = false;
    if (script.tour) {
      // The tour is one card: the step, its fingerprint and the controls. It plays on its own.
      tour = createTour(script, { go, stop, notes: () => toggleNotes(), request: (type, payload) => host.request(type, payload) });
      document.getElementById('stageView').append(tour.el, notesEl);
      document.getElementById('app').classList.add('presenting', 'touring');
      dock.close();
      store.set({ selection: null });
      stage.setProjection(innerWidth >= 768);   // projector-size labels, except on a phone
      if (script.autoplay !== false) tour.start();
      await go(0);
      return;
    }
    bar = h('div', { class: 'presenter-bar stage-blocker', role: 'toolbar', 'aria-label': 'Presenter' });
    bar.addEventListener('focusin', wake);
    titleEl = h('div', { class: 'presenter-title stage-blocker', role: 'status' });
    progEl = h('div', { class: 'presenter-progress', role: 'progressbar', 'aria-label': 'Slide', 'aria-valuemin': '1' }, h('i'));
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
    store.set({ presenting: false });
    tour?.destroy(); tour = null;
    bar?.remove(); titleEl?.remove(); progEl?.remove(); notesEl?.remove(); bar = titleEl = progEl = notesEl = null;
    clearTimeout(idleT);
    stage.setProjection(false);
    if (laser) toggleLaser();
    document.getElementById('app').classList.remove('presenting', 'touring');
    projectorOff();
  }
  // Keys while presenting: arrows / Page Up-Down (clickers) / space step; N notes; L laser; Esc stops.
  addEventListener('keydown', (e) => {
    if (!script || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    let used = true;
    if (tour && (k === ' ' || k.toLowerCase() === 'r' || k === 'ArrowRight' || k === 'PageDown') && tour.reveal()) { /* a quiz answer first */ }
    else if (tour && k.toLowerCase() === 'q') tour.quiz();
    else if (tour && (k.toLowerCase() === 'k' || (k === ' ' && script.autoplay !== false))) tour.toggle();
    else if (k === 'ArrowRight' || k === 'PageDown' || k === ' ') go(idx + 1);
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
    const card = (s) => h('div', { class: 'home-item script' + (s.quiz ? ' tour-hero' : '') },
      h('span', { class: 'meta' }, s.quiz ? `Self-running tour · ${s.steps.length} states` : `${s.steps.length} steps · ${s.builtin ? 'Built in' : 'Yours'}`),
      h('span', { class: 't' }, s.title), h('span', { class: 'd' }, s.summary || ''),
      s.quiz ? h('span', { class: 'tour-chips' }, ['Pre-hepatic', 'Presinusoidal', 'Sinusoidal', 'Postsinusoidal', 'Post-hepatic', 'Cardiac'].map((x) => h('span', {}, x))) : null,
      h('span', { class: 'script-acts' },
        h('button', { class: 'btn sm primary', onclick: () => start(s.id) }, svgIcon(s.quiz ? 'play' : 'projector', 'mi-ic'), s.quiz ? 'Play the tour' : 'Present'),
        mine.has(s.id) ? h('button', { class: 'btn sm', onclick: () => addStep(s.id) }, 'Add current state') : null,
        h('button', { class: 'btn sm ghost', onclick: () => shareLink(s) }, 'Share link'),
        h('button', { class: 'btn sm ghost', onclick: () => exportScript(s) }, 'Export'),
        mine.has(s.id) ? h('button', { class: 'btn sm ghost', onclick: () => remove(s.id) }, 'Delete') : null));
    return h('div', {},
      h('div', { class: 'home-grid' }, all().map(card)),
      cases.length ? h('h3', { class: 'home-sub' }, 'Present a case') : null,
      cases.length ? h('div', { class: 'home-grid' }, cases.map((c) => h('div', { class: 'home-item script' },
        h('span', { class: 'meta' }, 'Case · for the room'), h('span', { class: 't' }, c.title), h('span', { class: 'd' }, c.blurb || c.summary || ''),
        h('span', { class: 'script-acts' }, h('button', { class: 'btn sm primary', onclick: () => presentCase(c.id) }, svgIcon('projector', 'mi-ic'), 'Present'))))) : null,
      h('div', { class: 'btn-row', style: { marginTop: '16px' } },
        h('button', { class: 'btn', onclick: newScript }, 'New script from the current model'),
        h('button', { class: 'btn', onclick: importFile }, 'Import a script')),
      h('p', { class: 'ctl-sub' }, 'While presenting: → or Page Down for the next step, ← to go back, N opens the speaker notes, L is a laser pointer, Esc stops. In the tour, Space or K pauses and resumes.'));
  }

  // Present a case: any case full screen for a class. Projector-size labels on the figure; the slim bar reminds the presenter to take a show of hands before committing.
  let classBar = null;
  function presentCase(id) {
    closeHome?.();
    startCase(id);
    stage.setProjection(innerWidth >= 768);   // projector-size labels; the case panel stays open
    document.getElementById('app').classList.add('class-case');
    classBar?.remove();
    classBar = h('div', { class: 'class-bar stage-blocker', role: 'status' },
      h('span', { class: 'cb-k' }, 'Presenting'),
      h('span', {}, 'Read each choice aloud, take a show of hands, then commit for the room.'),
      h('button', { class: 'ib', 'aria-label': 'Stop presenting the case', title: 'Stop (Esc)', onclick: endCase }, icon('close')));
    document.getElementById('stageView').append(classBar);
  }
  function endCase() {
    if (!classBar) return;
    classBar.remove(); classBar = null;
    document.getElementById('app').classList.remove('class-case');
    stage.setProjection(false);
  }
  addEventListener('keydown', (e) => { if (classBar && e.key === 'Escape' && !script) endCase(); });

  return { start, stop, home, readLink, presentCase, active: () => !!script };
}
