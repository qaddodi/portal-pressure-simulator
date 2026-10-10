// The one menu, opened from the button at the top left (the brand mark and the current patient's name):
// every presentation by topic on the left, the patients by site on the right, one search across both,
// and Copy link and Help in its footer. From 768 px it is a popover under the button; on a phone, the
// same content as a bottom sheet. Hovering a row (or focusing it with the arrow keys) previews it beside
// the panel; on touch, the ⓘ at a presentation's end opens the same preview under its row.

import { store } from './store.js?v=5edd069b32';
import { h, icon, svgIcon, uiScale, clamp } from './util.js?v=2bfec33ead';
import { SNAPSHOTS } from './snapshots.js?v=d3e900d9e9';
import { pressureColor } from './colormap.js?v=7616551729';

const GROUP_COLOR = { Normal: 'var(--ok)', Prehepatic: 'var(--s1)', Presinusoidal: 'var(--s7)', Sinusoidal: 'var(--s5)', Postsinusoidal: 'var(--s2)', Posthepatic: 'var(--s4)', Cardiac: 'var(--s8)' };
// Where each group's resistance sits along the pathway from the gut to the heart.
const GROUP_WHERE = { Normal: 'No obstruction', Prehepatic: 'Before the liver', Presinusoidal: 'In the portal tracts', Sinusoidal: 'In the sinusoids', Postsinusoidal: 'At the central veins', Posthepatic: 'Hepatic veins and IVC', Cardiac: 'The right heart' };
const LEVEL_N = { foundation: 1, core: 2, advanced: 3 };

// Who is using the simulator (chosen in Settings): Student sees a simpler Explore; Instructor adds the physiology knobs.
export const ROLES = [['student', 'Student', 'A simpler set of controls, with the HVPG shown from the start.'], ['instructor', 'Instructor', 'All controls, including the physiology settings and resistances.']];

const NS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
// A patient's pressure profile from the gut to the right atrium (a hydraulic grade line): blood runs
// downhill, and the steepest fall is where the resistance sits.
function profile(snap) {
  const W = 180, H = 56, pad = 3, max = 30;
  const x = (i) => pad + (i * (W - 2 * pad)) / (snap.P.length - 1);
  const y = (p) => H - pad - (Math.max(0, Math.min(max, p)) / max) * (H - 2 * pad - 4);
  const svg = sv('svg', { viewBox: `0 0 ${W} ${H}`, class: 'hp-prof', 'aria-hidden': 'true', preserveAspectRatio: 'none' });
  for (const t of [10, 20]) svg.append(sv('line', { x1: pad, x2: W - pad, y1: y(t), y2: y(t), class: 'hp-grid' }));
  let drop = 0, at = 0;
  for (let i = 1; i < snap.P.length; i++) { const d = snap.P[i - 1] - snap.P[i]; if (d > drop) { drop = d; at = i; } }
  const pts = snap.P.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`);
  svg.append(sv('polygon', { points: `${x(0)},${H - pad} ${pts.join(' ')} ${x(snap.P.length - 1)},${H - pad}`, class: 'hp-area' }));
  if (drop > 5) svg.append(sv('rect', { x: x(at - 1), y: pad - 2, width: x(at) - x(at - 1), height: H - 2 * pad + 2, rx: 3, class: 'hp-drop' }));
  for (let i = 1; i < snap.P.length; i++) {
    svg.append(sv('line', { x1: x(i - 1), y1: y(snap.P[i - 1]), x2: x(i), y2: y(snap.P[i]), stroke: pressureColor((snap.P[i - 1] + snap.P[i]) / 2), class: 'hp-line' + (i === at && drop > 5 ? ' fall' : '') }));
  }
  snap.P.forEach((p, i) => svg.append(sv('circle', { cx: x(i), cy: y(p), r: 2.1, fill: pressureColor(p), class: 'hp-dot' })));
  return svg;
}
// The standing cut-offs: HVPG amber from 5, red from 10; PPG amber from 6, red from 12.
const sev = (v, amber, red) => (v >= red ? 'high' : v >= amber ? 'low' : 'ok');
const one = (v) => v.toFixed(v < 10 ? 1 : 0);
function patientPreview(p) {
  const s = SNAPSHOTS[p.id], fp = s?.fp;
  return h('div', { class: 'um-pv-in pt' },
    h('span', { class: 'um-pv-meta' }, h('i', { class: 'um-dot', style: { background: GROUP_COLOR[p.group] || 'var(--text-3)' } }), `${p.group} · ${GROUP_WHERE[p.group] || ''}`),
    h('h3', {}, p.label),
    s ? profile(s) : null,
    s ? h('span', { class: 'hp-facts' },
      h('span', { class: 'hp-chip ' + sev(s.hvpg, 5, 10), title: 'Hepatic venous pressure gradient' }, 'HVPG ', h('b', {}, one(s.hvpg))),
      fp?.ppg != null ? h('span', { class: 'hp-chip ' + sev(fp.ppg, 6, 12), title: 'Portal pressure gradient (portal vein − IVC)' }, 'PPG ', h('b', {}, one(fp.ppg))) : null,
      h('span', { class: 'hp-chip', title: 'Portal vein pressure' }, 'PV ', h('b', {}, Math.round(s.pv))),
      s.pvFlow < -0.05 ? h('span', { class: 'hp-chip rev', title: 'Portal flow runs away from the liver' }, 'Hepatofugal') : null) : null,
    h('p', {}, p.summary || ''));
}

// Search: every word typed must appear somewhere in the row's words (case, accents, spaces and hyphens ignored).
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
const matches = (hay, words) => words.every((w) => hay.includes(w));

export function createMenu({ anchor, library, libraryNow, onPreset, share, help, onToggle }) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const sheetMQ = matchMedia('(max-width: 767px), (max-width: 1023px) and (max-height: 500px) and (orientation: landscape)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  let el = null, back = null, pv = null, open = false, leaveT = 0, hoverT = 0, hideT = 0, pvKey = null, mark = null, query = '';

  const close = (o = {}) => {
    if (!open) return;
    open = false; clearTimeout(hoverT); hidePreview(true);
    anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    removeEventListener('keydown', typed, true);
    removeEventListener('resize', place);
    const panel = el, scrim = back, done = () => { leaveT = 0; panel.remove(); scrim?.remove(); };
    el = back = null;
    onToggle?.(false);
    if (panel.contains(document.activeElement) || !document.activeElement || document.activeElement === document.body) anchor.focus({ preventScroll: true });
    if (reduce.matches) { done(); return; }
    scrim?.classList.add('out');
    if (o.dragged) { panel.style.transition = 'transform .22s var(--ease)'; panel.style.transform = 'translateY(100%)'; } else panel.classList.add('out');
    leaveT = setTimeout(done, panel.classList.contains('sheet') ? 280 : 120);
  };
  // Typing while the menu is open (and focus is elsewhere) goes to its search.
  const typed = (e) => {
    if (!el || el.contains(e.target) || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || e.key === ' ' || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    el.querySelector('.um-q').focus();
  };
  const outside = (e) => { if (el && !el.contains(e.target) && !pv?.contains(e.target) && !anchor.contains(e.target)) close(); };

  // ── Rows ──
  const dots = (lv, levels) => h('span', { class: 'um-lv', title: levels[lv] || '', 'aria-label': levels[lv] || '' }, [1, 2, 3].map((n) => h('i', { class: n <= (LEVEL_N[lv] || 0) ? 'on' : '' })));
  function deckRow(d, lib, script) {
    const row = h('button', { class: 'um-row', 'data-k': (script ? 's:' : 'd:') + d.id, 'aria-current': lib.current() === d.id ? 'true' : null, onclick: () => { close(); lib.start(d.id); } },
      svgIcon('play', 'um-play'), h('span', { class: 'um-t' }, script ? d.title : d.short || d.title),
      script ? h('span', { class: 'um-m' }, `${d.steps.length} slides`) : dots(d.level, lib.levels),
      script ? null : h('span', { class: 'um-m' }, `${d.minutes} min`));
    row.dataset.find = fold([d.title, d.short, script ? 'script' : ''].join(' ')); row.dataset.more = fold(d.summary);
    const info = h('button', { class: 'um-info', 'aria-label': `About ${d.short || d.title}`, 'aria-expanded': 'false', onclick: () => toggleInline(li, () => (script ? scriptPreview(d, lib) : deckPreview(d, lib)), info) }, icon('info'));
    const li = h('li', {}, row, info);
    hoverable(row, () => (script ? scriptPreview(d, lib) : deckPreview(d, lib)), 'present');
    if (mark && mark === d.id) li.classList.add('um-new');
    return li;
  }
  function patientRow(p, cur) {
    const row = h('button', { class: 'um-row', 'data-k': 'p:' + p.id, 'aria-current': p.id === cur ? 'true' : null, onclick: () => { close(); if (p.id !== store.get().presetId || store.get().mode !== 'explore') onPreset(p.id); } },
      h('i', { class: 'um-dot', style: { background: GROUP_COLOR[p.group] || 'var(--text-3)' } }), h('span', { class: 'um-t' }, p.label), p.id === cur ? svgIcon('check', 'um-check') : null);
    row.dataset.find = fold([p.label, p.group, GROUP_WHERE[p.group], p.id].join(' ')); row.dataset.more = fold(p.summary);
    hoverable(row, () => patientPreview(p), 'patients');
    return h('li', {}, row);
  }
  const deckPreview = (d, lib) => h('div', { class: 'um-pv-in' },
    lib.still(d),
    h('span', { class: 'um-pv-meta' }, `${lib.levels[d.level] || ''} · ${d.slides.length + 1} slides · ${d.minutes} min`),
    h('h3', {}, d.title), h('p', {}, d.summary || ''),
    d.objectives?.length ? h('ul', {}, d.objectives.map((o) => h('li', {}, o))) : null,
    h('div', { class: 'um-acts' },
      h('button', { class: 'btn sm primary', onclick: () => { close(); lib.start(d.id); } }, svgIcon('play', 'mi-ic'), 'Present'),
      h('button', { class: 'btn ghost sm', onclick: () => lib.shareDeck(d) }, svgIcon('share', 'mi-ic'), 'Copy link'),
      h('button', { class: 'btn ghost sm', title: 'Speaker notes and questions for the room, one row per slide', onclick: () => lib.notes(d) }, svgIcon('print', 'mi-ic'), 'Print notes')));
  const scriptPreview = (s, lib) => h('div', { class: 'um-pv-in' },
    h('span', { class: 'um-pv-meta' }, `Your script · ${s.steps.length} slides`),
    h('h3', {}, s.title), h('p', {}, s.summary || ''),
    h('div', { class: 'um-acts' },
      h('button', { class: 'btn sm primary', onclick: () => { close(); lib.start(s.id); } }, svgIcon('play', 'mi-ic'), 'Present'),
      h('button', { class: 'btn sm', onclick: () => lib.addStep(s.id) }, 'Add current state'),
      h('button', { class: 'btn ghost sm', onclick: () => lib.shareScript(s) }, 'Share link'),
      h('button', { class: 'btn ghost sm', onclick: () => lib.exportScript(s) }, 'Export'),
      h('button', { class: 'btn ghost sm', onclick: () => lib.scriptNotes(s) }, 'Print notes'),
      h('button', { class: 'btn ghost sm', onclick: () => lib.remove(s.id) }, 'Delete')));

  // ── Preview beside the panel (mouse) ──
  function hoverable(row, make, col) {
    const want = () => { if (!fine.matches || sheetMQ.matches) return; clearTimeout(hideT); clearTimeout(hoverT); hoverT = setTimeout(() => showPreview(row, make, col), pv?.classList.contains('on') ? 120 : 300); };
    row.addEventListener('pointerenter', want);
    row.addEventListener('focus', () => { if (row.matches(':focus-visible')) want(); });
    row.addEventListener('pointerleave', () => { clearTimeout(hoverT); hideT = setTimeout(() => hidePreview(), 220); });
  }
  function showPreview(row, make, col) {
    if (!el || !row.isConnected) return;
    if (!pv) {
      pv = h('div', { class: 'um-pv', role: 'region', 'aria-label': 'Preview' });
      pv.addEventListener('pointerenter', () => clearTimeout(hideT));
      pv.addEventListener('pointerleave', () => { hideT = setTimeout(() => hidePreview(), 220); });
      document.body.append(pv);
    }
    const key = row.dataset.k;
    if (pvKey !== key) {
      // Crossfade: the old content fades out over the new, and the card eases to the new height.
      pvKey = key;
      const old = pv.firstElementChild, h0 = pv.offsetHeight;
      const next = make();
      if (old && pv.classList.contains('on') && !reduce.matches) { old.classList.add('um-pv-old'); setTimeout(() => old.remove(), 130); } else old?.remove();
      pv.append(next);
      if (old && h0 && !reduce.matches) { const h1 = next.offsetHeight; pv.style.height = h0 + 'px'; void pv.offsetHeight; pv.style.height = h1 + 'px'; setTimeout(() => { pv && (pv.style.height = ''); }, 140); }
      $$rows().forEach((r) => r.classList.toggle('pv-on', r === row));
    }
    // Beside the panel, level with the row; over the other column when there is no room beside it.
    const z = uiScale(), pr = el.getBoundingClientRect(), rr = row.getBoundingClientRect(), w = 360 * z, ph = pv.offsetHeight * z;
    let x = pr.right + 8;
    if (x + w > innerWidth - 8) { const c = el.querySelector(`.um-col[data-col="${col === 'present' ? 'patients' : 'present'}"]`).getBoundingClientRect(); x = c.left + 8; }
    const y = clamp(rr.top - 40 * z, 8, innerHeight - ph - 8);
    pv.style.left = x / z + 'px'; pv.style.top = y / z + 'px';
    pv.classList.add('on');
  }
  function hidePreview(now) {
    clearTimeout(hideT); if (!pv) return;
    const p = pv; pv = null; pvKey = null;
    el?.querySelectorAll('.pv-on').forEach((r) => r.classList.remove('pv-on'));
    if (now || reduce.matches || !p.classList.contains('on')) { p.remove(); return; }
    p.classList.remove('on'); setTimeout(() => p.remove(), 140);
  }
  // On touch, the ⓘ opens the preview under its row (one at a time), easing open and shut.
  function toggleInline(li, make, btn) {
    const was = li.querySelector('.um-inline');
    el.querySelectorAll('.um-inline').forEach((x) => { x.classList.remove('on'); x.previousElementSibling?.setAttribute('aria-expanded', 'false'); const gone = x; setTimeout(() => gone.remove(), reduce.matches ? 0 : 220); });
    if (was) return;
    const box = h('div', { class: 'um-inline' }, h('div', {}, make()));
    li.append(box); btn.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add('on')));
  }
  const $$rows = () => (el ? [...el.querySelectorAll('.um-row')] : []);

  // ── Panel ──
  function build(lib) {
    const st = store.get(), cur = st.mode === 'cases' ? null : st.presetId;
    const groups = {};
    for (const p of st.presetList || []) (groups[p.group] ||= []).push(p);
    const patients = h('section', { class: 'um-col', 'data-col': 'patients', 'aria-labelledby': 'umPatients' },
      h('header', { class: 'um-h' }, svgIcon('scenario', 'um-hi'), h('b', { id: 'umPatients' }, 'Patients'), h('small', {}, `${(st.presetList || []).length} patients`)),
      Object.entries(groups).map(([g, ps]) => h('div', { class: 'um-g' },
        h('div', { class: 'um-gl', id: 'umg-' + g }, h('b', {}, g), h('span', {}, GROUP_WHERE[g] || '')),
        h('ul', { 'aria-labelledby': 'umg-' + g }, ps.map((p) => patientRow(p, cur))))));
    let present;
    if (!lib) present = h('section', { class: 'um-col', 'data-col': 'present' }, h('header', { class: 'um-h' }, svgIcon('projector', 'um-hi'), h('b', {}, 'Present')), h('p', { class: 'um-note' }, 'Loading…'));
    else {
      const mine = lib.mine;
      present = h('section', { class: 'um-col', 'data-col': 'present', 'aria-labelledby': 'umPresent' },
        h('header', { class: 'um-h' }, svgIcon('projector', 'um-hi'), h('b', { id: 'umPresent' }, 'Present'), h('small', {}, `${lib.decks.length} presentations`)),
        lib.topics.map(([k, name, list]) => h('div', { class: 'um-g' },
          h('div', { class: 'um-gl', id: 'umt-' + k }, h('b', {}, name)),
          h('ul', { 'aria-labelledby': 'umt-' + k }, list.map(([id]) => lib.decks.find((d) => d.id === id)).filter(Boolean).map((d) => deckRow(d, lib)))),
        ),
        h('div', { class: 'um-g scripts' },
          h('div', { class: 'um-gl', id: 'umt-mine' }, h('b', {}, 'Your scripts'),
            h('span', { class: 'um-gacts' },
              h('button', { class: 'um-link', title: 'A new script from the current model', onclick: () => lib.newScript() }, icon('plus'), 'New'),
              h('button', { class: 'um-link', title: 'Import a script file', onclick: () => lib.importFile() }, icon('download'), 'Import'))),
          mine.length ? h('ul', { 'aria-labelledby': 'umt-mine' }, mine.map((s) => deckRow(s, lib, true)))
            : h('p', { class: 'um-note' }, 'Capture states of the model and play them like a presentation.')));
    }
    const input = h('input', { class: 'um-q', type: 'search', placeholder: 'Find a presentation or patient', 'aria-label': 'Find a presentation or patient', autocomplete: 'off', spellcheck: 'false', value: query });
    input.addEventListener('input', () => { query = input.value; filter(); });
    const panel = h('div', { class: 'umenu', role: 'dialog', 'aria-label': 'Menu' },
      h('div', { class: 'um-grab', 'aria-hidden': 'true' }),
      h('div', { class: 'um-top' },
        h('label', { class: 'um-search' }, icon('search'), input, h('kbd', { class: 'um-kb' }, '/')),
        h('button', { class: 'ib um-x', 'aria-label': 'Close the menu', onclick: () => close() }, icon('close'))),
      h('div', { class: 'um-cols' }, present, patients),
      h('p', { class: 'um-empty', hidden: true }, 'No presentation or patient matches'),
      h('footer', { class: 'um-foot' },
        h('button', { class: 'um-link', onclick: () => { close(); share(); } }, icon('share'), 'Copy link to this view'),
        h('button', { class: 'um-link', onclick: () => { close(); help(anchor); } }, icon('help'), 'Help'),
        h('span', { class: 'um-esc' }, 'Esc closes')));
    panel.addEventListener('keydown', keys);
    return panel;
  }
  // Names and titles first; only when none match does the search reach into the summaries.
  function filter() {
    if (!el) return;
    const words = query.trim().split(/\s+/).map(fold).filter(Boolean), rows = [...el.querySelectorAll('.um-row[data-find]')];
    const deep = words.length && !rows.some((r) => matches(r.dataset.find, words));
    const hit = (r) => !words.length || matches(r.dataset.find + (deep ? ' ' + r.dataset.more : ''), words);
    let any = false;
    for (const g of el.querySelectorAll('.um-g')) {
      let n = 0;
      for (const li of g.querySelectorAll('li')) { const ok = hit(li.querySelector('.um-row')); li.hidden = !ok; if (ok) n++; }
      const empty = g.classList.contains('scripts') && !g.querySelector('li');
      g.hidden = words.length ? (empty || !n) : false;
      any ||= n > 0;
    }
    for (const c of el.querySelectorAll('.um-col')) c.classList.toggle('none', !!words.length && !c.querySelector('.um-g:not([hidden]) li:not([hidden])'));
    el.querySelector('.um-empty').hidden = any || !words.length;
    el.classList.toggle('filtered', !!words.length);
  }
  // Up and Down move within a column, Left and Right switch columns, typing goes to search, Enter in
  // search opens the first match, Esc clears the search and then closes.
  function keys(e) {
    const q = el.querySelector('.um-q');
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (e.target === q && q.value) { q.value = ''; query = ''; filter(); } else close(); return; }
    if (e.target === q) {
      if (e.key === 'Enter') { e.preventDefault(); visible()[0]?.click(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); visible()[0]?.focus(); }
      return;
    }
    const row = e.target.closest?.('.um-row');
    if (row && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const list = visible(row.closest('.um-col')), i = list.indexOf(row);
      if (e.key === 'ArrowUp' && i === 0) q.focus(); else list[clamp(i + (e.key === 'ArrowDown' ? 1 : -1), 0, list.length - 1)]?.focus();
    } else if (row && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const cols = [...el.querySelectorAll('.um-col')], here = row.closest('.um-col'), other = cols[(cols.indexOf(here) + 1) % cols.length];
      const from = visible(here).indexOf(row), to = visible(other);
      to[Math.min(from, to.length - 1)]?.focus();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ') q.focus();
  }
  const visible = (col = el) => [...col.querySelectorAll('li:not([hidden]) > .um-row')].filter((r) => !r.closest('.um-g[hidden]'));

  function place() {
    if (!el || el.classList.contains('sheet')) return;
    const z = uiScale(), r = anchor.getBoundingClientRect();
    el.style.left = clamp(r.left, 12 * z, Math.max(12 * z, innerWidth - el.offsetWidth * z - 12 * z)) / z + 'px';
    el.style.top = (r.bottom + 8 * z) / z + 'px';
  }
  function render() {
    if (!el) return;
    const lib = libraryNow(), keep = el.querySelector('.um-cols')?.scrollTop, focus = document.activeElement?.dataset?.key, sheet = el.classList.contains('sheet');
    const next = build(lib);
    if (sheet) next.classList.add('sheet');
    next.classList.add('still');
    el.replaceWith(next); el = next;
    filter(); place(); dragToClose(el);
    if (keep) el.querySelector('.um-cols').scrollTop = keep;
    if (focus === 'q') el.querySelector('.um-q').focus({ preventScroll: true });
    else if (focus) el.querySelector(`[data-k="${CSS.escape(focus)}"]`)?.focus({ preventScroll: true });
    if (!lib) library().then(() => { if (open && !libraryNow()) return; render(); });
  }

  return {
    // section: 'present' | 'patients' | 'scripts' (scrolled into view); opts.mark: a script id to highlight.
    open(section, opts = {}) {
      if (leaveT) { clearTimeout(leaveT); leaveT = 0; document.querySelectorAll('.umenu.out, .um-scrim.out').forEach((x) => x.remove()); }
      mark = opts.mark || null;
      if (!open) {
        open = true; query = '';
        const sheet = sheetMQ.matches, lib = libraryNow();
        el = build(lib);
        if (sheet) { el.classList.add('sheet'); back = h('div', { class: 'um-scrim', onclick: () => close() }); document.body.append(back); }
        document.body.append(el);
        place(); filter();
        anchor.setAttribute('aria-expanded', 'true');
        setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
        addEventListener('resize', place);
        addEventListener('keydown', typed, true);
        onToggle?.(true, sheet);
        if (sheet) el.querySelector('.um-x').focus({ preventScroll: true }); else el.querySelector('.um-q').focus({ preventScroll: true });
        if (!lib) library().then(() => { if (open) render(); scrollTo(); });
        dragToClose(el);
      }
      const scrollTo = () => {
        if (!el) return;
        const at = section === 'scripts' ? el.querySelector('.um-g.scripts') : section === 'patients' && el.classList.contains('sheet') ? el.querySelector('.um-col[data-col="patients"]') : null;
        at?.scrollIntoView({ block: 'start', behavior: reduce.matches ? 'auto' : 'smooth' });
        const cur = el.querySelector(section === 'patients' ? '.um-col[data-col="patients"] .um-row[aria-current="true"]' : '.um-col[data-col="present"] .um-row[aria-current="true"]');
        if (cur && !el.classList.contains('sheet')) cur.scrollIntoView({ block: 'nearest' });
      };
      requestAnimationFrame(scrollTo);
    },
    close,
    toggle(section) { if (open) close(); else this.open(section); },
    isOpen: () => open,
    render,
  };

  // A phone's sheet follows a drag down on its handle or search row, and closes past a short distance.
  function dragToClose(panel) {
    if (!panel.classList.contains('sheet')) return;
    const top = panel.querySelector('.um-top'), grab = panel.querySelector('.um-grab');
    let y0 = null, dy = 0;
    const down = (e) => { if (e.target.closest('input, button')) return; y0 = e.clientY; dy = 0; panel.style.transition = 'none'; e.currentTarget.setPointerCapture?.(e.pointerId); };
    const move = (e) => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); panel.style.transform = `translateY(${dy}px)`; };
    const up = () => {
      if (y0 == null) return; y0 = null;
      panel.style.transition = 'transform .2s var(--ease)';
      if (dy > 90) close({ dragged: true }); else { panel.style.transform = ''; setTimeout(() => { panel.style.transition = ''; }, 220); }
    };
    for (const t of [top, grab]) { t.addEventListener('pointerdown', down); t.addEventListener('pointermove', move); t.addEventListener('pointerup', up); t.addEventListener('pointercancel', up); }
  }
}
