// Command palette (⌘K / Ctrl-K): type what you want. It runs the same verbs as the anatomy and the
// chart, so every command lands in the timeline like any other change. A number in the query is
// the argument: "tips 8", "cirrhosis 60", "albumin 2.5", "+6 months", "narrow portal 80".

import { store, updateParams } from './store.js?v=4bf5a96a9d';
import { h, svgIcon, toast } from './util.js?v=d483888526';
import { EDGES } from '../engine/topology.js?v=6d79260961';
import { DRUGS } from '../engine/scenario.js?v=8fc90f782f';
import { HIDDEN_EDGES } from './anatomy.js?v=6fbbed2fbb';
import { LESSONS } from './learn.js?v=38cc26d87b';
import { CASES } from './cases.js?v=4d72427eaf';

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9+ ]/g, ' ');

export function createPalette({ ctx }) {
  const back = h('div', { class: 'pal-back', hidden: true });
  const input = h('input', { class: 'pal-input', type: 'text', placeholder: 'Type a command: “tips 10”, “cirrhosis 60”, “propranolol”, “+6 months”, “lens flow”…', 'aria-label': 'Command', autocomplete: 'off', spellcheck: 'false' });
  const list = h('div', { class: 'pal-list', role: 'listbox' });
  const box = h('div', { class: 'pal', role: 'dialog', 'aria-label': 'Command palette' }, h('div', { class: 'pal-top' }, svgIcon('explore', 'pal-ic'), input, h('kbd', {}, 'Esc')), list);
  back.append(box);
  document.body.append(back);
  let items = [], sel = 0, ret = null;

  function commands() {
    const st = store.get();
    const cmds = [];
    const add = (group, title, run, { kw = '', num = null, hint = '' } = {}) => cmds.push({ group, title, run, kw: norm(title + ' ' + kw), num, hint });
    // Parameters with a number
    add('Change', 'Cirrhosis', (n) => updateParams((p) => { p.cirrhosis = Math.min(1, Math.max(0, (n ?? 60) / 100)); return p; }, { label: 'Cirrhosis' }), { num: '%', kw: 'liver fibrosis', hint: 'cirrhosis 60 → 60 %' });
    add('Treat', 'TIPS', (n) => updateParams({ tips: { on: true, d: Math.min(12, Math.max(6, n ?? 10)) } }, { label: 'TIPS' }), { num: 'mm', kw: 'stent shunt transjugular', hint: 'tips 8 → an 8 mm stent' });
    add('Treat', 'Remove TIPS', () => updateParams({ tips: { on: false } }, { label: 'Remove TIPS' }), { kw: 'take down' });
    add('Change', 'Serum albumin', (n) => updateParams({ albumin: Math.min(5, Math.max(1.5, n ?? 3)) }, { label: 'Serum albumin' }), { num: 'g/dL', kw: 'protein oncotic' });
    add('Change', 'Right-heart contractility', (n) => updateParams({ contractility: Math.min(1.6, Math.max(0.15, (n ?? 50) / 100)) }, { label: 'Contractility' }), { num: '%', kw: 'heart failure rv' });
    add('Change', 'Tricuspid regurgitation', (n) => updateParams({ tr: Math.min(1, Math.max(0, (n ?? 80) / 100)) }, { label: 'TR' }), { num: '%', kw: 'tr heart valve' });
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
    add('Treat', 'Esophageal balloon', () => updateParams((p) => { p.balloonEso = !p.balloonEso; return p; }, { label: 'Esophageal balloon' }), { kw: 'tamponade sengstaken' });
    add('Measure', 'Measure HVPG', () => ctx.wedge(), { kw: 'wedge catheter hepatic vein' });
    add('Measure', 'Doppler of the portal vein', () => { ctx.probe('PV_TRUNK'); ctx.showPane('doppler'); }, { kw: 'ultrasound velocity' });
    add('Measure', 'Endoscopy', () => ctx.showPane('endoscopy'), { kw: 'scope varices' });
    // Time
    for (const [d, l] of [[7, '+1 week'], [30, '+1 month'], [180, '+6 months'], [365, '+1 year']]) add('Time', l, () => ctx.jump(d, l.slice(1)), { kw: 'jump advance months weeks forward disease' });
    add('Time', 'Until something happens', () => ctx.jump('event', 'until the next event'), { kw: 'next event advance' });
    add('Time', 'Undo (back one change)', () => ctx.undo(), { kw: 'revert back' });
    add('Time', 'Pin this moment as A', () => ctx.pin(), { kw: 'compare snapshot' });
    // View
    for (const [id, [t, d]] of Object.entries(ctx.lenses)) add('View', `Lens: ${t}`, () => store.set({ colorMode: id }), { kw: `color ${d}` });
    add('View', 'Anatomy view', () => store.set({ view: 'anatomic' }), { kw: 'anatomic' });
    add('View', 'Circuit view', () => store.set({ view: 'circuit' }), { kw: 'schematic map' });
    add('View', 'Zoom into the lobule', () => ctx.zoomLobule(), { kw: 'microcirculation sinusoid' });
    add('View', 'Figure view', () => ctx.figure(), { kw: 'export plate' });
    add('View', 'Export PNG', () => ctx.exportFile('png'), { kw: 'image save download' });
    add('View', 'Export SVG', () => ctx.exportFile('svg'), { kw: 'vector save download' });
    add('View', 'Projector mode', () => ctx.projector(), { kw: 'present lecture' });
    add('View', 'Instruments', () => ctx.instruments(), { kw: 'charts dock' });
    // Go to a structure
    for (const e of EDGES) if (!HIDDEN_EDGES.has(e.id) && e.kind !== 'wedge' && e.kind !== 'shunt' && e.label) add('Go to', e.label, () => ctx.select({ type: 'edge', id: e.id }), { kw: 'select vessel' });
    for (const [id, t] of [['liver', 'Liver'], ['heart', 'Right heart'], ['varices', 'Esophageal varices'], ['gastric', 'Fundal varices'], ['spleen', 'Spleen'], ['abdomen', 'Abdomen & ascites']]) add('Go to', t, () => ctx.select({ type: 'organ', id }), { kw: 'organ select' });
    // Sessions and scenarios
    for (const p of st.presetList || []) add('Patient', p.label, () => ctx.loadPreset(p.id), { kw: `scenario preset ${p.group}` });
    for (const l of LESSONS) add('Lesson', l.title, () => ctx.lesson(l.id), { kw: 'learn ' + l.summary });
    for (const c of CASES) add('Case', c.title, () => ctx.caseStart(c.id), { kw: 'case ' + c.summary });
    add('App', 'Home', () => ctx.home(), { kw: 'start' });
    add('App', 'Light / dark theme', () => ctx.theme(), { kw: 'appearance' });
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
  function renderList() {
    items = search(input.value);
    sel = Math.min(sel, Math.max(0, items.length - 1));
    list.replaceChildren(...(items.length ? items.map(({ c, num }, i) => {
      const b = h('button', { class: 'pal-item' + (i === sel ? ' on' : ''), role: 'option', 'aria-selected': String(i === sel) },
        h('span', { class: 'pal-g' }, c.group), h('span', { class: 'pal-t' }, c.title, num != null ? h('b', {}, ` → ${num} ${c.num}`) : null), c.hint && num == null ? h('span', { class: 'pal-h' }, c.hint) : null);
      b.addEventListener('click', () => run(i));
      b.addEventListener('pointermove', () => { if (sel !== i) { sel = i; renderList(); } });
      return b;
    }) : [h('div', { class: 'pal-empty' }, 'No matching command.')]));
    list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  }
  function run(i) {
    const it = items[i];
    if (!it) return;
    close();
    try { it.c.run(it.num); } catch (e) { console.error(e); toast('That command did not run.', 'bad'); }
  }
  function open() {
    ret = document.activeElement;
    back.hidden = false; input.value = ''; sel = 0; renderList();
    setTimeout(() => input.focus(), 0);
  }
  function close() { back.hidden = true; ret?.focus?.({ preventScroll: true }); }
  input.addEventListener('input', () => { sel = 0; renderList(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); renderList(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); renderList(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
  return { open, close, isOpen: () => !back.hidden };
}
