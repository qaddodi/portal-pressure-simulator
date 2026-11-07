// Command palette (⌘K / Ctrl-K): type what you want. It runs the same verbs as the anatomy and the
// chart, so every command lands in the timeline like any other change. A number in the query is
// the argument: "tips 8", "cirrhosis 60", "albumin 2.5", "+6 months", "narrow portal 80".

import { store, updateParams } from './store.js';
import { h, svgIcon, toast, afterExit, visibleBottom, fadeWhileMore, scrollBehavior } from './util.js';
import { D_FLIP, EASE_ARRIVE } from './ease.js';
import { restPass, cancelRest } from './rest-pass.js';
import { classSoon, attrSoon } from './class-soon.js';
import { frame } from './frame.js';
import { EDGES } from '../engine/topology.js';
import { DRUGS } from '../engine/scenario.js';
import { HIDDEN_EDGES } from './anatomy.js';
import { LOOKS } from './looks.js';
import { SURGICAL, SURGICAL_BY_ID, shuntName, surgicalVerbs } from './surgical-shunts.js';

// One highlight under the list that glides to the active row; the arrow keys and the pointer only move it (and aria-selected on two rows),
// and the list is rebuilt only when the results change.
const FOCUS_NO_SCROLL = Object.freeze({ preventScroll: true });
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9+ ]/g, ' ');

export function createPalette({ ctx }) {
  const surgical = surgicalVerbs({ store, updateParams, select: (sel) => ctx.select(sel), toast });
  const back = h('div', { class: 'pal-back', hidden: true });
  const input = h('input', { class: 'pal-input', type: 'text', placeholder: innerWidth < 600 ? 'Search vessels, patients, treatments' : 'Search a vessel, patient or treatment: “tips 10”, “+6 months”…', 'aria-label': 'Search', autocomplete: 'off', spellcheck: 'false', role: 'combobox', 'aria-autocomplete': 'list', 'aria-controls': 'pal-list', 'aria-expanded': 'true' });
  const list = h('div', { class: 'pal-list glides', id: 'pal-list', role: 'listbox', 'aria-label': 'Results' });
  const hl = h('div', { class: 'pal-glide', 'aria-hidden': 'true' });   // (the highlight: a sibling of the rows, in the list's scrolled space)
  // (The same magnifier as the Search button that opens it. The key hints under the list are for a keyboard: a touch screen hides them.)
  const foot = h('div', { class: 'pal-foot', 'aria-hidden': 'true' }, h('span', {}, h('kbd', {}, '↑'), h('kbd', {}, '↓'), 'to move'), h('span', {}, h('kbd', {}, 'Enter'), 'to run'), h('span', {}, h('kbd', {}, 'Esc'), 'to close'));
  const box = h('div', { class: 'pal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Command palette' }, h('div', { class: 'pal-top' }, svgIcon('search', 'pal-ic'), input), list, foot);
  back.append(box);
  document.body.append(back);
  const syncMore = fadeWhileMore(list);   // (a list that scrolls fades at its foot while there is more below it, as the menus do)
  let items = [], sel = 0, ret = null, rows = [], shownKey = '', ptX = -1, ptY = -1, fade = null;

  function commands() {
    const st = store.get();
    const cmds = [];
    const add = (group, title, run, { kw = '', num = null, hint = '' } = {}) => cmds.push({ group, title, run, kw: norm(title + ' ' + kw), num, hint });
    // Parameters with a number
    add('Change', 'Cirrhosis', (n) => updateParams((p) => { p.cirrhosis = Math.min(1, Math.max(0, (n ?? 60) / 100)); return p; }, { label: 'Cirrhosis' }), { num: '%', kw: 'liver fibrosis', hint: 'cirrhosis 60 → 60%' });
    add('Treat', 'TIPS', (n) => updateParams({ tips: { on: true, d: Math.min(12, Math.max(6, n ?? 8)) } }, { label: 'TIPS' }), { num: 'mm', kw: 'stent shunt transjugular', hint: 'tips 8 → an 8 mm stent' });
    add('Treat', 'Remove TIPS', () => updateParams({ tips: { on: false } }, { label: 'Remove TIPS' }), { kw: 'take down' });
    add('Treat', 'DIPS', (n) => updateParams({ dips: { on: true, d: Math.min(12, Math.max(6, n ?? 8)) } }, { label: 'DIPS' }), { num: 'mm', kw: 'stent shunt direct intrahepatic caudate budd chiari', hint: 'dips 8 → an 8 mm stent' });
    add('Treat', 'Remove DIPS', () => updateParams({ dips: { on: false } }, { label: 'Remove DIPS' }), { kw: 'take down' });
    add('Change', 'Serum albumin', (n) => updateParams({ albumin: Math.min(5, Math.max(1.5, n ?? 3)) }, { label: 'Serum albumin' }), { num: 'g/dL', kw: 'protein oncotic' });
    add('Change', 'Right-heart contractility', (n) => updateParams({ contractility: Math.min(1.6, Math.max(0.15, (n ?? 50) / 100)) }, { label: 'Contractility' }), { num: '%', kw: 'heart failure rv' });
    add('Change', 'Tricuspid regurgitation', (n) => updateParams({ tr: Math.min(1, Math.max(0, (n ?? 80) / 100)) }, { label: 'TR' }), { num: '%', kw: 'tr heart valve' });
    add('Change', 'Pregnancy', (n) => updateParams({ gestation: Math.min(40, Math.max(0, Math.round(n ?? 24))) }, { label: 'Pregnancy' }), { num: 'weeks', kw: 'pregnant gestation trimester', hint: 'pregnancy 24 → 24 weeks' });
    add('Change', 'Splanchnic arteriolar tone', (n) => updateParams({ splanchnicTone: Math.min(2.5, Math.max(0.4, (n ?? 60) / 100)) }, { label: 'Splanchnic tone' }), { num: '%', kw: 'vasodilation inflow' });
    for (const [id, name] of [['PV_TRUNK', 'portal vein'], ['SV_CONF', 'splenic vein'], ['SMV_CONF', 'superior mesenteric vein'], ['RHV_IVC', 'right hepatic vein'], ['IVCS_RA', 'suprahepatic ivc']]) {
      add('Change', `Narrow the ${name}`, (n) => updateParams((p) => { const v = Math.min(0.95, Math.max(0, (n ?? 70) / 100)); if (v <= 0) delete p.stenosis[id]; else p.stenosis[id] = v; return p; }, { label: `${name} stenosis` }), { num: '%', kw: 'stenosis pinch' });
      add('Change', `Clot the ${name}`, (n) => updateParams((p) => { const v = Math.min(1, Math.max(0, (n ?? 100) / 100)); if (v <= 0) delete p.thrombus[id]; else p.thrombus[id] = v; return p; }, { label: `${name} thrombus` }), { num: '%', kw: 'thrombus thrombosis' });
    }
    // Drugs and orders
    for (const k of Object.keys(DRUGS)) add('Treat', DRUGS[k].label, () => updateParams((p) => { p.drugs[k] = !p.drugs[k]; return p; }, { label: DRUGS[k].label }), { kw: 'drug start stop' });
    add('Treat', 'Diuretics', () => updateParams((p) => { p.diuretics = !p.diuretics; return p; }, { label: 'Diuretics' }), { kw: 'spironolactone furosemide' });
    add('Treat', 'Anticoagulation', () => updateParams((p) => { p.anticoag = !p.anticoag; return p; }, { label: 'Anticoagulation' }), { kw: 'heparin' });
    add('Treat', 'Band ligation', () => { ctx.select({ type: 'organ', id: 'varices' }); ctx.action({ kind: 'band' }); }, { kw: 'evl varices' });
    add('Treat', 'Paracentesis', (n) => ctx.action({ kind: 'paracentesis', mL: Math.min(10, Math.max(1, n ?? 5)) * 1000, albumin: true }), { num: 'L', kw: 'drain ascites tap' });
    add('Treat', '1 L crystalloid', () => ctx.action({ kind: 'infuse', fluid: 'crystalloid' }), { kw: 'fluid saline' });
    add('Treat', '1 unit PRBC', () => ctx.action({ kind: 'infuse', fluid: 'prbc' }), { kw: 'transfuse blood' });
    add('Treat', 'BRTO', () => updateParams((p) => { p.occluded.C5 = true; return p; }, { label: 'BRTO' }), { kw: 'occlude gastrorenal' });
    // (The tamponade tube: the gastric balloon first, drawn up against the cardia; the esophageal balloon second, on a tube whose gastric balloon is up.)
    add('Treat', 'Gastric balloon', () => updateParams((p) => { p.balloonGas = !p.balloonGas; if (!p.balloonGas) p.balloonEso = false; return p; }, { label: 'Gastric balloon' }), { kw: 'tamponade sengstaken minnesota traction first' });
    add('Treat', 'Esophageal balloon', () => updateParams((p) => { p.balloonEso = !p.balloonEso; if (p.balloonEso) p.balloonGas = true; return p; }, { label: 'Esophageal balloon' }), { kw: 'tamponade sengstaken minnesota second' });
    // The surgical shunts, as the Treat card's Procedures tab makes them (surgical-shunts.js), each with its take-down.
    for (const x of SURGICAL) add('Treat', shuntName(x), () => surgical.placeShunt(x.id), { kw: `${x.kw} ${x.sub}` });
    for (const [id, name] of [['warren', 'Warren shunt'], ['pc-es', 'portocaval shunt'], ['mesocaval', 'mesocaval shunt'], ['rex', 'Meso-Rex bypass']]) add('Treat', `Remove ${name}`, () => surgical.removeShunt(id), { kw: `take down ${SURGICAL_BY_ID[id].kw}` });
    add('Tests', 'Doppler of the portal vein', () => { ctx.probe('PV_TRUNK'); ctx.showPane('doppler'); }, { kw: 'ultrasound velocity' });
    add('Tests', 'Endoscopy', () => ctx.showPane('endoscopy'), { kw: 'scope varices' });
    // Time
    for (const [d, l] of [[7, '+1 week'], [30, '+1 month'], [180, '+6 months'], [365, '+1 year']]) add('Time', l, () => ctx.jump(d, l.slice(1)), { kw: 'jump advance months weeks forward disease' });
    add('Time', 'Until something happens', () => ctx.jump('event', 'until the next event'), { kw: 'next event advance' });
    add('Time', 'Undo (back one change)', () => ctx.undo(), { kw: 'revert back' });
    add('Time', 'Restart this patient', () => ctx.restart(), { kw: 'restart reset start over beginning' });
    add('Time', 'Compare from here', () => ctx.pin(), { kw: 'compare snapshot pin' });
    // View
    for (const [id, [t, d]] of Object.entries(ctx.lenses)) add('View', `Colored by ${t.toLowerCase()}`, () => store.set({ colorMode: id }), { kw: `color colour lens ${d}` });
    add('View', 'Anatomy view', () => store.set({ view: 'anatomic' }), { kw: 'anatomic' });
    add('View', 'Circuit view', () => store.set({ view: 'circuit' }), { kw: 'schematic map' });
    add('View', 'Lobule view', () => ctx.zoomLobule(), { kw: 'microcirculation sinusoid lobule zoom' });
    add('View', 'Tests', () => ctx.instruments(), { kw: 'measure instruments charts dock' });
    // Go to a structure
    for (const e of EDGES) if (!HIDDEN_EDGES.has(e.id) && e.kind !== 'wedge' && e.kind !== 'shunt' && e.label) add('Go to', e.label, () => ctx.select({ type: 'edge', id: e.id }), { kw: 'select vessel' });
    for (const [id, t] of [['liver', 'Liver'], ['heart', 'Right heart'], ['varices', 'Esophageal varices'], ['gastric', 'Fundal varices'], ['spleen', 'Spleen'], ['abdomen', 'Ascites']]) add('Go to', t, () => ctx.select({ type: 'organ', id }), { kw: 'organ select' });
    // Sessions and scenarios
    for (const p of st.presetList || []) add('Patient', p.label, () => ctx.loadPreset(p.id), { kw: `scenario preset ${p.group}` });
    // Presentations, by their short and full titles (the presenter loads on first use: until it has, the list fills in a moment later).
    const lib = ctx.libraryNow?.();
    for (const d of lib?.decks || []) add('Present', d.short || d.title, () => ctx.present(d.id), { kw: `${d.title} ${d.summary || ''} present presentation deck talk slides` });
    for (const d of lib?.mine || []) add('Present', d.title, () => ctx.present(d.id), { kw: `${d.summary || ''} present presentation script slides mine` });
    add('App', 'Home', () => ctx.home(), { kw: 'start' });
    add('App', 'Reset everything', () => ctx.reset(), { kw: 'reset reload refresh clear start over' });
    add('App', 'Light / dark theme', () => ctx.theme(), { kw: 'appearance' });
    for (const l of LOOKS) add('App', `Appearance: ${l.name}`, () => ctx.look(l.id), { kw: `theme look colour palette ${l.theme} ${l.palette || ''}` });   // (Settings > Appearance, by name: "navy" finds Navy)
    add('App', 'Guide & shortcuts', () => ctx.help(), { kw: 'help keyboard' });
    add('App', 'Copy share link', () => ctx.share(), { kw: 'url' });
    return cmds;
  }

  function search(q) {
    const numM = q.match(/-?\d+(\.\d+)?/);
    const num = numM ? parseFloat(numM[0]) : null;
    const words = norm(q.replace(/-?\d+(\.\d+)?/g, ' ')).split(/\s+/).filter(Boolean);
    const cmds = commands();
    if (!words.length && num == null) return cmds.filter((c) => ['Time', 'Treat'].includes(c.group)).slice(0, 10).map((c) => ({ c, num: null }));
    const scored = [];
    for (const c of cmds) {
      let score = 0, ok = true;
      for (const w of words) {
        const i = c.kw.indexOf(w);
        if (i < 0) { ok = false; break; }
        score += (i === 0 ? 6 : c.kw[i - 1] === ' ' ? 4 : 1) + (c.title.toLowerCase().includes(w) ? 3 : 0);
      }
      if (!ok) continue;
      if (num != null && c.num) score += 3;
      if (num != null && !c.num && c.group !== 'Time') score -= 1;
      scored.push({ c, num: c.num ? num : null, score });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, 12);
  }
  // (The options are reached through the field, by arrow keys: it names the one that is current, and a screen reader reads it as the field's choice.)
  const OPT_IDS = [];   // (the option ids, by row: made on a row's first asking)
  const optId = (i) => OPT_IDS[i] ||= `pal-opt-${i}`;   // alloc-rare: made once per row, the first time it is the active one
  function syncActive() {
    attrSoon(input, 'aria-activedescendant', items.length ? optId(sel) : null);
  }
  // The highlight goes to the active row: its top and height together on --d-flip (the CSS decides how). A new query, the first
  // placement and a resize put it there with no glide ('still' holds the transition for that one write).
  // (The rows' boxes are read once, in a rest pass after the list is drawn or the screen changes size (rest-pass.js), never in a
  // pointer move or a frame: a move only writes the highlight's place from them. The owner's rule, 1 Nov: no layout reads in motion.)
  let geom = [], geomFor = null, measuring = 0;
  function measureRows() {
    measuring = 0;
    if (back.hidden) return;
    geom = rows.map((r) => [r.offsetLeft, r.offsetTop, r.offsetWidth, r.offsetHeight]); geomFor = rows;
    place(false);
  }
  const remeasure = () => { if (!measuring) measuring = restPass(measureRows); };
  function place(glide) {
    if (!hl || back.hidden) return;
    if (geomFor !== rows) { remeasure(); return; }
    const g = items.length ? geom[sel] : null;
    const snap = !glide || hl.style.opacity !== '1';
    cancelRest(snapping); snapping = 0;
    if (!g) { hl.style.opacity = '0'; return; }
    // (Its size is laid out once, at a placement with no glide, in a rest pass between frames (snapNow), never in the key or pointer
    // event that asked; a glide to a row of another size stretches it on the compositor.)
    if (snap || !hl._w) { snapping = restPass(snapNow); return; }
    const [x, y, w, hh] = g;
    const c = hlFor(sel, x, y, w, hh);
    hl.style.translate = c.t; hl.style.scale = c.s; hl.style.opacity = '1';
  }
  // The highlight's place and stretch for a row, as text: made again only when the row's box, or the box the highlight is sized to, changes.
  const hlCache = [];
  function hlFor(i, x, y, w, hh) {
    let c = hlCache[i];
    if (!c) c = hlCache[i] = { x: NaN, y: NaN, w: NaN, hh: NaN, hw: NaN, hhh: NaN, t: '', s: '' };   // alloc-rare: one per row, made the first time the highlight goes to it
    if (c.x !== x || c.y !== y) { c.x = x; c.y = y; c.t = `${x}px ${y}px`; }   // alloc-rare: made only when the row's place changes
    if (c.w !== w || c.hh !== hh || c.hw !== hl._w || c.hhh !== hl._h) { c.w = w; c.hh = hh; c.hw = hl._w; c.hhh = hl._h; c.s = `${(w / hl._w).toFixed(4)} ${(hh / hl._h).toFixed(4)}`; }   // alloc-rare: made only when the row's size, or the highlight's, changes
    return c;
  }
  let snapping = 0;
  function snapNow() {
    snapping = 0;
    const g = !back.hidden && geomFor === rows && items.length ? geom[sel] : null;
    if (!g) return;
    const [x, y, w, hh] = g;
    hl.classList.add('still');
    hl._w = w; hl._h = hh; hl.style.width = `${w}px`; hl.style.height = `${hh}px`;
    hl.style.translate = `${x}px ${y}px`; hl.style.scale = ''; hl.style.opacity = '1';
    // ('still' holds the transition through the frame that shows the new place, and is let go after it, with no style read.)
    frame(() => classSoon(hl, 'still', false), 'palette');
  }
  function mark() {
    for (let i = 0; i < rows.length; i++) { const b = rows[i], on = i === sel; classSoon(b, 'on', on); attrSoon(b, 'aria-selected', on ? 'true' : 'false'); }
  }
  function renderList({ fadeIn = true } = {}) {
    items = search(input.value);
    sel = Math.min(sel, Math.max(0, items.length - 1));
    // (The same results as on screen: the rows stay, only the current one changes.)
    const key = items.length ? items.map(({ c, num }) => `${c.group}|${c.title}|${num}`).join('\n') : `none:${input.value.trim()}`;
    if (key === shownKey && list.isConnected && !back.hidden) { mark(); place(false); syncActive(); return; }
    rows = items.map(({ c, num }, i) => {
      const b = h('button', { class: 'pal-item' + (i === sel ? ' on' : ''), id: `pal-opt-${i}`, tabindex: '-1', role: 'option', 'aria-selected': String(i === sel) },
        h('span', { class: 'pal-g' }, c.group), h('span', { class: 'pal-t' }, c.title, num != null ? h('b', {}, ` → ${num} ${c.num}`) : null), c.hint && num == null ? h('span', { class: 'pal-h' }, c.hint) : null);
      b.addEventListener('click', () => run(i));
      b.addEventListener('pointermove', (e) => {
        // (A list that scrolls under a still pointer sends a move at the same spot: the keyboard keeps the highlight then.)
        if (e.clientX === ptX && e.clientY === ptY) return;
        ptX = e.clientX; ptY = e.clientY;
        move(i, false);
      });
      return b;
    });
    list.replaceChildren(hl, ...(items.length ? rows : [h('div', { class: 'pal-empty' }, h('b', {}, input.value.trim() ? `Nothing matches “${input.value.trim()}”.` : 'No commands yet.'), 'Try a vessel (“portal vein”), a patient, a presentation or a treatment (“tips 8”).')]));
    restPass(onInView);   // (2 Nov 2026: scrolled between frames, never in a pointer's move: scrollIntoView lays the page out)
    syncMore();
    place(false);
    // (New results come in on one fade for the whole list, no stagger; typing on carries the fade already under way.)
    const was = shownKey; shownKey = key;
    if (fadeIn && was && list.animate && !(fade && fade.playState === 'running')) {
      fade = list.animate({ opacity: [0.35, 1] }, { duration: D_FLIP, easing: EASE_ARRIVE });
    }
    syncActive();
  }
  // The arrow keys and the pointer: the highlight glides, two rows change their aria-selected, and the list is not rebuilt.
  function onInView() { list.querySelector('.on')?.scrollIntoView({ block: 'nearest' }); }
  function selInView() { rows[sel]?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() }); }
  function move(i, scroll) {
    if (i === sel || !items.length) return;
    sel = i; mark(); syncActive(); place(true);
    if (scroll) restPass(selInView);
  }
  function run(i) {
    const it = items[i];
    if (!it) return;
    close();
    try { it.c.run(it.num); } catch (e) { console.error(e); toast('That command did not run.', 'bad'); }
  }
  function open() {
    // (Ctrl K, or a click Safari does not focus: the Search button takes focus back, not the page.)
    ret = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.getElementById('btnPalette');
    clearTimeout(leaveT); back.classList.remove('leaving');
    back.hidden = false; input.value = ''; sel = 0; shownKey = ''; renderList({ fadeIn: false });
    if (ctx.library && !ctx.libraryNow?.()) ctx.library().then(() => { if (!back.hidden) renderList(); }).catch(() => {});
    setTimeout(() => input.focus(), 0);
    vv?.addEventListener('resize', fitSoon); vv?.addEventListener('scroll', fitSoon);
    fitList();   // (a keyboard already up, from another field, shows no resize: the list is held to its room at once)
  }
  // The on-screen keyboard covers the foot of the page without shrinking it (iOS): the list is held to the room above the keyboard,
  // so every result can be reached and tapped. (Event-driven: it follows the keyboard coming and going; nothing runs per frame.)
  const vv = window.visualViewport;
  // (A keyboard's resize or scroll is followed in a rest pass: the list's top is read between frames, never in the event.)
  const fitSoon = () => restPass(fitList);
  function fitList() {
    if (back.hidden) return;
    geomFor = null; remeasure();
    const room = visibleBottom() - list.getBoundingClientRect().top - 12;
    back.style.setProperty('--pal-room', `${Math.max(96, Math.floor(room))}px`);
  }
  // It fades out as it faded in (it vanished in one frame: P20), then hides; opened again meanwhile, it simply stays.
  let leaveT = 0;
  const leaveDone = () => { back.hidden = true; back.classList.remove('leaving'); back.style.removeProperty('--pal-room'); };
  function close() {
    if (back.hidden || back.classList.contains('leaving')) return;
    back.classList.add('leaving'); clearTimeout(leaveT);
    vv?.removeEventListener('resize', fitSoon); vv?.removeEventListener('scroll', fitSoon);
    leaveT = afterExit(back, 'leaving', leaveDone);
    ret?.focus?.(FOCUS_NO_SCROLL);
  }
  input.addEventListener('input', () => { sel = 0; renderList(); });
  input.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;   // (an input method is composing: its Enter picks its candidate, not a command)
    if (e.key === 'ArrowDown') { e.preventDefault(); move(Math.min(items.length - 1, sel + 1), true); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(Math.max(0, sel - 1), true); }
    else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Tab') e.preventDefault();   // (the field is the card's one stop: Tab does not carry focus out to the page behind it)
  });
  back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
  return { open, close, isOpen: () => !back.hidden && !back.classList.contains('leaving') };
}
