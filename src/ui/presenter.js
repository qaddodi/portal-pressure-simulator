// Presenter scripts (plan §5.4): an ordered list of model states with speaker notes, stepped with
// the arrow keys or a clicker like a slide deck that is a live model. Presenting turns on
// projector mode; notes can open in a second window for the presenter's screen; L toggles a laser
// pointer. Instructors build their own scripts from the current model and share them as a file
// or a link.

import { store } from './store.js?v=e9304c5ee2';
import { h, toast, svgIcon, icon } from './util.js?v=cb539c0cd8';
import { download } from './records.js?v=26ab8fb634';

export const SCRIPTS = [
  {
    id: 'ph-ten', title: 'Portal hypertension in ten minutes', builtin: true,
    summary: 'Healthy → cirrhosis → six months on → the lobule → TIPS.',
    steps: [
      { title: 'A healthy portal circulation', preset: 'healthy', view: 'anatomic', zoom: 'fit', pane: 'profile',
        notes: 'Portal pressure about 7 mmHg, hepatic veins about 4: an HVPG near 3. The gut and spleen drain through the liver; the profile under the figure shows each resistance as a step.' },
      { title: 'Cirrhosis at 60 %', params: { cirrhosis: 0.6 },
        notes: 'Raise sinusoidal resistance. Everything upstream rises together: SMV, splenic vein and portal vein. HVPG crosses 10 mmHg: clinically significant portal hypertension.' },
      { title: 'Six months later', days: 180,
        notes: 'The gradient stays high, so collaterals open and remodel: varices at the lower esophagus, a larger spleen. Collaterals decompress the portal system but divert gut blood around the liver.' },
      { title: 'Inside a lobule', zoom: 'lobule',
        notes: 'Stellate cells have activated; collagen lines the sinusoids (capillarization) and bridges the lobules. This is where the resistance lives.' },
      { title: 'A TIPS, 10 mm', zoom: 'fit', params: { tips: { on: true, d: 10 } }, pane: 'flow',
        notes: 'The stent bypasses the liver: the portosystemic gradient falls below 12, but the shunt fraction rises and liver perfusion falls. Every fix has a cost.' },
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
      { title: 'Decompensated cirrhosis', preset: 'cirr-decomp', view: 'anatomic', zoom: 'fit', pane: 'endoscopy', notes: 'Large varices with red wale signs: wall tension is close to rupture (Laplace: T = ΔP·r / w).' },
      { title: 'The varix ruptures', action: { kind: 'rupture', site: 'VAR', tear: 0.8 }, notes: 'Blood loss lowers portal pressure and the bleeding may pause; over-transfusion would refill the splanchnic veins and restart it.' },
      { title: 'Terlipressin', params: { drugs: { terlipressin: true } }, pane: 'varixwall', notes: 'Splanchnic vasoconstriction lowers portal inflow within minutes: variceal pressure and wall tension fall.' },
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
  let script = null, idx = 0, bar = null, notesWin = null, laser = null;
  const all = () => [...SCRIPTS, ...readMine()];

  async function apply(step) {
    if (step.preset) await loadPreset(step.preset, { days: step.presetDays });
    else if (step.days) host.send({ type: 'advance', days: step.days });
    if (step.params) updateParams(step.params, { settle: true, label: step.title });
    if (step.action) action(step.action);
    if (step.view && step.view !== store.get().view) store.set({ view: step.view });
    if (step.lens) store.set({ colorMode: step.lens });
    if (step.zoom === 'lobule') stage.zoomLobule('R'); else if (step.zoom === 'liver') stage.zoomLiver(); else if (step.zoom === 'fit') stage.fit();
    if (step.pane) dock.show(step.pane, { reveal: true });
    host.send({ type: 'run', running: true });
  }
  async function go(i) {
    if (!script) return;
    idx = Math.max(0, Math.min(script.steps.length - 1, i));
    renderBar();
    await apply(script.steps[idx]);
    writeNotes();
  }
  function renderBar() {
    if (!bar) return;
    const st = script.steps[idx];
    bar.replaceChildren(
      h('button', { class: 'ib', 'aria-label': 'Previous step', disabled: idx === 0, onclick: () => go(idx - 1) }, icon('chev-left')),
      h('div', { class: 'pb-t' }, h('span', { class: 'pb-n' }, `${idx + 1} / ${script.steps.length}`), h('b', {}, st.title)),
      h('button', { class: 'ib', 'aria-label': 'Next step', disabled: idx === script.steps.length - 1, onclick: () => go(idx + 1) }, icon('chev-right')),
      h('span', { class: 'pb-sep' }),
      h('button', { class: 'btn sm', onclick: openNotes, title: 'Speaker notes in a second window (N)' }, 'Notes'),
      h('button', { class: 'btn sm', 'aria-pressed': String(!!laser), onclick: toggleLaser, title: 'Laser pointer (L)' }, 'Laser'),
      h('button', { class: 'ib', 'aria-label': 'Stop presenting', title: 'Stop presenting (Esc)', onclick: stop }, icon('close')));
  }
  function openNotes() {
    notesWin = window.open('', 'pps-notes', 'width=520,height=640');
    if (!notesWin) { toast('Allow pop-ups to open the notes window.'); return; }
    writeNotes();
  }
  function writeNotes() {
    if (!notesWin || notesWin.closed || !script) return;
    const d = notesWin.document, st = script.steps[idx], nx = script.steps[idx + 1];
    d.title = `Notes · ${script.title}`;
    d.body.style.cssText = 'font: 17px/1.55 Georgia, serif; margin: 28px; color: #16181D; background: #FBFAF7';
    d.body.innerHTML = '';
    const el = (tag, txt, css) => { const e = d.createElement(tag); e.textContent = txt; if (css) e.style.cssText = css; d.body.append(e); };
    el('div', `${script.title} · ${idx + 1} / ${script.steps.length}`, 'font: 600 12px system-ui; letter-spacing: .06em; text-transform: uppercase; color: #6B6F7A');
    el('h1', st.title, 'font-size: 26px; margin: 8px 0 14px');
    el('p', st.notes || 'No notes for this step.');
    if (nx) el('p', `Next: ${nx.title}`, 'margin-top: 30px; color: #6B6F7A; font: 14px system-ui');
  }
  function toggleLaser() {
    if (laser) { laser.remove(); laser = null; document.body.classList.remove('laser-on'); renderBar(); return; }
    laser = h('div', { class: 'laser', 'aria-hidden': 'true' });
    document.body.append(laser);
    document.body.classList.add('laser-on');
    renderBar();
  }
  addEventListener('pointermove', (e) => { if (laser) laser.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`; });

  async function start(id) {
    script = typeof id === 'object' ? id : all().find((s) => s.id === id);
    if (!script?.steps?.length) return;
    closeHome?.();
    if (store.get().mode !== 'explore') store.set({ mode: 'explore' });
    projectorOn();
    bar = h('div', { class: 'presenter-bar stage-blocker', role: 'toolbar', 'aria-label': 'Presenter' });
    document.getElementById('stageView').append(bar);
    document.getElementById('app').classList.add('presenting');
    await go(0);
  }
  function stop() {
    if (!script) return;
    script = null;
    bar?.remove(); bar = null;
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
    else if (k.toLowerCase() === 'n') openNotes();
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
        h('button', { class: 'btn', onclick: importFile }, 'Import a script'),
        h('button', { class: 'btn ghost', onclick: () => { closeHome?.(); projectorOn(); } }, 'Projector mode only')),
      h('p', { class: 'ctl-sub' }, 'While presenting: → or Page Down for the next step, ← to go back, N opens speaker notes in a second window, L is a laser pointer, Esc stops.'));
  }

  return { start, stop, home, readLink, active: () => !!script };
}
