// The action card: click a structure and a small card opens beside it with the value it carries
// and only the verbs that apply to it. It replaces the tool trays, the tool hint card and the
// sliders that used to live in the side panel. Every verb takes effect at once and becomes one
// entry in the timeline; nothing stays "armed".

import { store, updateParams } from './store.js?v=4bf5a96a9d';
import { h, icon, svgIcon, fmt, clamp, tooltipFor } from './util.js?v=d483888526';
import { cardFor, verbEnabled, normalizeSel } from './actions.js?v=3aaea708e3';

const LOCK_TIP = 'Not available in this step of the lesson or case';

export function createCard({ view, stage, ctx, onWhy, onDetails }) {
  const el = h('section', { class: 'action-card stage-blocker', role: 'dialog', 'aria-label': 'Actions', hidden: true });
  view.append(el);
  const sizes = { vw: view.clientWidth, vh: view.clientHeight, w: 0, h: 0 };
  new ResizeObserver(() => { sizes.vw = view.clientWidth; sizes.vh = view.clientHeight; placedFor = ''; position(); }).observe(view);
  new ResizeObserver(() => { sizes.w = el.offsetWidth; sizes.h = el.offsetHeight; placedFor = ''; position(); }).observe(el);
  const uiState = {};
  ctx.ui = (key, def) => (uiState[key] ||= def);
  let model = null, live = [], syncs = [], actionable = [], selRef = null, placedFor = '', sheetCollapsed = false;

  const refP = () => { const st = store.get(); return st.compareSnap ? st.compareSnap.P : st.healthy?.P; };
  const lens = () => (store.get().imaging ? 'neutral' : store.get().colorMode);

  function hide() { el.hidden = true; model = null; live = []; syncs = []; actionable = []; stage.relayout?.(); }

  function render({ keepFocus = false } = {}) {
    const st = store.get();
    const sel = st.selection;
    if (!sel || st.shunting || document.getElementById('app').classList.contains('figure-mode')) { hide(); return; }
    const m = cardFor(sel, ctx);
    if (!m) { hide(); return; }
    const focusedIdx = keepFocus ? actionable.findIndex((a) => a.el.contains(document.activeElement)) : -1;
    model = m; selRef = sel; live = []; syncs = []; actionable = [];
    const close = h('button', { class: 'ib ac-close', 'aria-label': 'Close', title: 'Close (Esc)', onclick: () => store.set({ selection: null }) }, icon('close'));
    const valEl = h('div', { class: 'ac-value' });
    const pillEl = h('div', { class: 'ac-status' });
    live.push(() => {
      const f = store.get().frame;
      if (!f) return;
      if (lens() === 'neutral' && model.why !== 'spleen' && model.why !== 'ascites') valEl.replaceChildren(h('span', { class: 'ac-unmeasured' }, 'Pressure unmeasured'));
      else {
        const v = m.value(f, lens(), refP());
        valEl.replaceChildren(h('b', {}, v.v), h('span', { class: 'unit' }, v.u), v.d ? h('span', { class: 'ac-delta ' + (v.up ? 'up' : 'down') }, v.d) : null);
      }
      const s = m.status?.(f);
      if (s) { if (pillEl._s !== s.join()) { pillEl.replaceChildren(h('span', { class: 'pill ' + s[0] }, s[1])); pillEl._s = s.join(); } }
      else if (pillEl._s) { pillEl.replaceChildren(); pillEl._s = ''; }
    });
    const body = h('div', { class: 'ac-body' });
    for (const v of m.verbs) { const node = verbEl(v); if (node) body.append(node); }
    const foot = h('div', { class: 'ac-foot' },
      h('button', { class: 'link', onclick: (e) => onWhy(m.why, e.currentTarget) }, svgIcon('bulb', 'mi-ic'), 'Why?'),
      h('button', { class: 'link', onclick: () => onDetails(selRef) }, 'Details', svgIcon('chev-right', 'mi-ic')));
    // On a phone the card is a bottom sheet: the top (grab handle, title, value, close) stays put
    // and only the controls scroll; tapping or swiping the top collapses and expands it.
    const grab = h('button', { class: 'ac-grab', 'aria-label': 'Collapse or expand the card', 'aria-expanded': String(!sheetCollapsed) });
    const top = h('div', { class: 'ac-top' }, grab,
      h('header', { class: 'ac-head' }, h('div', { class: 'ac-titles' }, h('span', { class: 'ac-kicker' }, m.kicker), h('h3', {}, m.title)), close),
      h('div', { class: 'ac-readout' }, valEl, pillEl));
    wireSheet(top, grab);
    el.replaceChildren(top, h('div', { class: 'ac-scroll' }, body, foot));
    el.classList.toggle('collapsed', sheetCollapsed);
    el.setAttribute('aria-label', `${m.title}: actions`);
    el.hidden = false;
    // Number keys trigger the verbs in order; show the number beside each.
    actionable.forEach((a, i) => { if (i < 9) a.el.dataset.key = String(i + 1); });
    update();
    placedFor = '';
    position();
    if (focusedIdx >= 0) actionable[focusedIdx]?.focus();
    stage.relayout?.();
  }

  // Bottom-sheet gestures (phone only): a tap on the handle or the title toggles; a swipe down
  // collapses, and a second swipe down closes; a swipe up expands. The collapsed state carries
  // over to the next card, so a learner who wants the figure clear keeps it clear.
  function setCollapsed(on) {
    sheetCollapsed = on;
    el.classList.toggle('collapsed', on);
    el.querySelector('.ac-grab')?.setAttribute('aria-expanded', String(!on));
    stage.relayout?.();
  }
  function wireSheet(top, grab) {
    grab.addEventListener('click', () => setCollapsed(!sheetCollapsed));
    let y0 = null, moved = false;
    top.addEventListener('pointerdown', (e) => { if (!el.classList.contains('docked') || e.target.closest('.ac-close')) return; y0 = e.clientY; moved = false; });
    top.addEventListener('pointermove', (e) => { if (y0 != null && Math.abs(e.clientY - y0) > 8) moved = true; });
    top.addEventListener('pointerup', (e) => {
      if (y0 == null) return;
      const dy = e.clientY - y0; y0 = null;
      if (dy > 40) { if (sheetCollapsed) store.set({ selection: null }); else setCollapsed(true); }
      else if (dy < -40) setCollapsed(false);
      else if (!moved && !e.target.closest('button')) setCollapsed(!sheetCollapsed);
    });
    top.addEventListener('pointercancel', () => { y0 = null; });
  }

  function locked(v) { return !verbEnabled(v.id, v.key); }

  function verbEl(v) {
    const p0 = store.get().params;
    if (v.showIf && !v.showIf(p0)) return null;
    if (v.type === 'stat') {
      const val = h('b', { class: 'num' });
      live.push(() => { const f = store.get().frame; if (f) { const t = v.value(f); if (val.textContent !== t) val.textContent = t; } });
      return h('div', { class: 'ac-stat' }, h('span', {}, v.label), val);
    }
    if (v.type === 'link') return h('button', { class: 'link ac-link', onclick: v.run }, v.label, svgIcon('chev-right', 'mi-ic'));
    if (v.type === 'seg') {
      const seg = h('div', { class: 'seg full ac-seg' + (v.small ? ' small' : ''), role: 'group', 'aria-label': v.label || 'Options' }, v.options.map(([val, lab]) => {
        const b = h('button', { 'aria-pressed': String(v.get() === val) }, lab);
        b.addEventListener('click', () => { v.set(val); render({ keepFocus: true }); });
        return b;
      }));
      return h('div', { class: 'ac-row' }, v.label ? h('span', { class: 'ac-label' }, v.label) : null, seg);
    }
    if (v.type === 'slider') {
      const lab = typeof v.label === 'function' ? v.label() : v.label;
      const input = h('input', { type: 'range', min: v.min, max: v.max, step: v.step, 'aria-label': lab });
      const val = h('span', { class: 'ctl-val' });
      const dis = locked(v);
      if (dis) input.disabled = true;
      const paint = (x) => { input.value = x; val.textContent = v.format(x); input.style.setProperty('--pct', `${((x - v.min) / (v.max - v.min)) * 100}%`); row.classList.toggle('changed', v.def != null && Math.abs(x - v.def) > 1e-9); };
      let fresh = true;
      input.addEventListener('pointerdown', () => { fresh = true; });
      input.addEventListener('keydown', () => { fresh = true; });
      input.addEventListener('input', () => {
        const x = parseFloat(input.value);
        paint(x);
        updateParams((pp) => { v.set(pp, x); return pp; }, { history: fresh, label: v.hist || lab });
        fresh = false;
      });
      const row = h('div', { class: 'ac-slider' + (dis ? ' locked' : ''), title: dis ? LOCK_TIP : null },
        h('div', { class: 'ctl-top' }, h('span', { class: 'ac-label' }, v.icon ? svgIcon(v.icon, 'ac-ic') : null, lab, v.info ? infoI(v.info) : null), val),
        h('div', { class: 'range-wrap' }, input),
        v.sub ? h('div', { class: 'ctl-sub' }, v.sub) : null);
      paint(v.get(p0));
      syncs.push((p) => { if (document.activeElement !== input) paint(v.get(p)); });
      actionable.push({ el: row, run: () => input.focus(), focus: () => input.focus() });
      return row;
    }
    if (v.type === 'toggle') {
      const dis = locked(v);
      const b = h('button', { class: 'ac-toggle', role: 'switch', 'aria-checked': String(!!v.get(p0)), disabled: dis, title: dis ? LOCK_TIP : null },
        v.icon ? svgIcon(v.icon, 'ac-ic') : null, h('span', { class: 'ac-tl' }, v.label), h('span', { class: 'switch-vis', 'aria-hidden': 'true' }, h('i')));
      b.addEventListener('click', () => { const on = !v.get(store.get().params); updateParams((pp) => { v.set(pp, on); return pp; }, { label: `${v.hist || v.label} ${on ? 'on' : 'off'}` }); });
      syncs.push((p) => b.setAttribute('aria-checked', String(!!v.get(p))));
      actionable.push({ el: b, run: () => b.click(), focus: () => b.focus() });
      return b;
    }
    if (v.type === 'button') {
      const dis = locked(v);
      const lbl = h('span', { class: 'ac-bl' }, v.label);
      const b = h('button', { class: 'ac-btn' + (v.danger ? ' danger' : ''), disabled: dis, title: dis ? LOCK_TIP : null }, v.icon ? svgIcon(v.icon, 'ac-ic') : null, lbl);
      b.addEventListener('click', () => { v.run(); setTimeout(() => render({ keepFocus: true }), 30); });
      const wrap = h('div', { class: 'ac-btn-wrap' }, b);
      if (v.note || v.on || v.labelFor) {
        const note = h('div', { class: 'ac-note' });
        wrap.append(note);
        live.push(() => {
          const f = store.get().frame, p = store.get().params;
          if (v.labelFor) { const t = v.labelFor(p); if (lbl.textContent !== t) lbl.textContent = t; }
          if (v.on) b.classList.toggle('on', !!v.on(p));
          const t = f && v.note ? v.note(f, p) : null;
          note.hidden = !t; if (t && note.textContent !== t) note.textContent = t;
        });
      }
      actionable.push({ el: b, run: () => b.click(), focus: () => b.focus() });
      return wrap;
    }
    if (v.type === 'drain') {
      const dis = locked(v);
      const vol = h('input', { type: 'range', min: 1, max: 10, step: 0.5, value: 5, 'aria-label': 'Volume to drain (L)', disabled: dis });
      const volLbl = h('span', { class: 'ctl-val' });
      const paintVol = () => { volLbl.textContent = `${(+vol.value).toFixed(1)} L`; vol.style.setProperty('--pct', `${((+vol.value - 1) / 9) * 100}%`); };
      vol.addEventListener('input', paintVol); paintVol();
      const alb = h('input', { type: 'checkbox', checked: true, disabled: dis });
      const go = h('button', { class: 'ac-btn', disabled: dis }, svgIcon('needle', 'ac-ic'), h('span', { class: 'ac-bl' }, 'Drain'));
      go.addEventListener('click', () => ctx.action({ kind: 'paracentesis', mL: +vol.value * 1000, albumin: alb.checked }));
      actionable.push({ el: go, run: () => go.click(), focus: () => go.focus() });
      return h('div', { class: 'ac-drain' + (dis ? ' locked' : ''), title: dis ? LOCK_TIP : null },
        h('div', { class: 'ctl-top' }, h('span', { class: 'ac-label' }, svgIcon('needle', 'ac-ic'), 'Paracentesis'), volLbl), h('div', { class: 'range-wrap' }, vol),
        h('div', { class: 'ac-drain-row' }, h('label', { class: 'check-row' }, alb, 'Albumin 8 g/L'), go));
    }
    return null;
  }
  function infoI(text) { const b = h('button', { class: 'info-i', type: 'button', 'aria-label': text }, icon('info')); tooltipFor(b, text); return b; }

  function update() {
    if (!model || el.hidden) return;
    for (const fn of live) fn();
    position();
  }

  // Beside the structure, on the side that covers least of it, inside the figure.
  function position() {
    if (!model || el.hidden) return;
    if (matchMedia('(max-width: 767px), (max-width: 1023px) and (max-height: 500px) and (orientation: landscape)').matches) { el.style.left = ''; el.style.top = ''; el.classList.add('docked'); return; }
    el.classList.remove('docked');
    const a = stage.anchorFor(normalizeSel(selRef) || selRef);
    if (!a) return;
    // Sizes come from ResizeObservers: measuring here, after the frame's DOM writes, would force
    // a layout every frame while the card is open.
    const W = sizes.vw, H = sizes.vh;
    const w = sizes.w || 288, hh = sizes.h || 240;
    const pts = a.path || [[a.x, a.y]];
    const gap = 22;
    const cands = [[a.x + gap, a.y - hh / 2], [a.x - gap - w, a.y - hh / 2], [a.x - w / 2, a.y + gap], [a.x - w / 2, a.y - gap - hh], [a.x + gap, a.y - 30], [a.x - gap - w, a.y - 30]];
    let best = null;
    cands.forEach(([x, y], i) => {
      const cx = clamp(x, 8, W - w - 8), cy = clamp(y, 8, H - hh - 8);
      let cover = 0;
      for (const [px, py] of pts) if (px > cx - 6 && px < cx + w + 6 && py > cy - 6 && py < cy + hh + 6) cover++;
      const shift = Math.abs(cx - x) + Math.abs(cy - y);
      const cost = cover * 40 + shift * 0.5 + i * 3;
      if (!best || cost < best.cost) best = { cost, x: cx, y: cy };
    });
    const key = `${Math.round(best.x)},${Math.round(best.y)}`;
    if (key === placedFor) return;
    placedFor = key;
    el.style.left = best.x + 'px'; el.style.top = best.y + 'px';
  }

  store.on('selection', () => render());
  store.on('shunting', () => render());
  store.on('allowedVerbs', () => render());
  store.on('locked', () => render());
  store.on('colorMode', () => update());
  store.on('params', () => { const p = store.get().params; for (const s of syncs) s(p); });
  return {
    el, render, update, position,
    isOpen: () => !!model && !el.hidden,
    trigger(n) { const a = actionable[n - 1]; if (a && !a.el.disabled) { a.run(); return true; } return false; },
    focusFirst() { actionable[0]?.focus(); },
  };
}
