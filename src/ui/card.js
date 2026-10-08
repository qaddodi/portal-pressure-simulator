// The action card: click a structure and a small card opens beside it with the value it carries
// and only the verbs that apply to it. It replaces the tool trays, the tool hint card and the
// sliders that used to live in the side panel. Every verb takes effect at once and becomes one
// entry in the timeline; nothing stays "armed".

import { store, updateParams } from './store.js?v=7acb60de12';
import { h, icon, svgIcon, clamp, tooltipFor } from './util.js?v=8aa5e5cdf1';
import { cardFor, verbEnabled, normalizeSel } from './actions.js?v=d1e9bcfe02';

const LOCK_TIP = 'Not available in this step of the lesson or case';

export function createCard({ view, stage, ctx, onWhy, onDetails }) {
  const el = h('section', { class: 'action-card stage-blocker', role: 'dialog', 'aria-label': 'Actions', hidden: true });
  view.append(el);
  // A thin line from the card's nearest edge to the structure, with a dot on it, when they are apart.
  const leader = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  leader.setAttribute('class', 'ac-leader'); leader.setAttribute('aria-hidden', 'true');
  view.append(leader);
  const tabletTouch = matchMedia('(pointer: coarse) and (min-width: 768px) and (max-width: 1366px)');
  const sizes = { vw: view.clientWidth, vh: view.clientHeight, w: 0, h: 0 };
  new ResizeObserver(() => { const moved = Math.abs(sizes.vw - view.clientWidth) > 2 || !sizes.vh; sizes.vw = view.clientWidth; sizes.vh = view.clientHeight; if (moved) { placedFor = ''; lastLayout = ''; pinned = null; } position(); if (isDocked()) reveal(); }).observe(view);
  new ResizeObserver(() => { const first = !sizes.w; sizes.w = el.offsetWidth; sizes.h = el.offsetHeight; if (first) { placedFor = ''; lastLayout = ''; pinned = null; } position(); syncMore(); if (isDocked()) reveal(); }).observe(el);
  const uiState = {};
  ctx.ui = (key, def) => (uiState[key] ||= def);
  let lastSelKey = '', model = null, live = [], syncs = [], actionable = [], selRef = null, placedFor = '', lastLayout = '', pinned = null;

  const refP = () => { const st = store.get(); return st.compareSnap ? st.compareSnap.P : st.healthy?.P; };
  const lens = () => (store.get().imaging ? 'neutral' : store.get().colorMode);

  // Laying the labels out again (they steer clear of the card) is not needed more than once a frame.
  let relayoutRaf = 0;
  const relayoutSoon = () => { if (!relayoutRaf) relayoutRaf = requestAnimationFrame(() => { relayoutRaf = 0; stage.relayout?.(); }); };
  const isDocked = () => el.classList.contains('docked');
  // The phone sheet lives in the whole figure column, not in the figure itself: it reaches the bottom of the column,
  // over the play and timeline row, and stops just above the readout strip.
  const dockHost = view.closest('.stage-wrap') || view;
  const appStyle = document.getElementById('app').style;
  // A card with more controls than fit scrolls, and fades at the bottom while there is more to see.
  function syncMore() {
    const sc = el.querySelector('.ac-scroll');
    if (sc) sc.classList.toggle('more', sc.scrollHeight - sc.clientHeight - sc.scrollTop > 4);
  }
  // The sheet covers the bottom of the figure: keep the tapped vessel in the part that is left, and lift
  // the figure's own buttons (Fit, turn) clear of it.
  let revealRaf = 0, lift = null, liftedBy = '';
  // The variable goes on the few elements that use it: set on the whole figure it would make the browser re-check
  // the style of every element under it.
  function liftButtons(px) {
    if (px === liftedBy) return;
    liftedBy = px;
    lift ||= [...view.querySelectorAll('.zoom-pill, .stage-clock')];
    for (const b of lift) b.style.setProperty('--sheet-h', px);
    // Keep the zoom and Fit pill above the card; hide only if it would reach the top bar.
    const pill = lift.find((b) => b.classList.contains('zoom-pill'));
    if (pill) pill.classList.toggle('under-sheet', isDocked() && parseFloat(px) > 0);
    if (pill) pill.classList.remove('no-room');
  }
  function reveal() {
    cancelAnimationFrame(revealRaf);
    revealRaf = requestAnimationFrame(() => {
      const open = model && !el.hidden && isDocked();
      // How much of the figure the sheet covers (it also covers the row below the figure).
      const covered = open ? Math.max(0, view.getBoundingClientRect().bottom - (dockHost.getBoundingClientRect().top + el.offsetTop)) : 0;
      liftButtons(open ? `${covered + 6}px` : '0px');
      if (open) stage.reveal?.(normalizeSel(selRef) || selRef, covered);
    });
  }
  let closeTimer = 0, stopSheetGesture = () => {};
  function hide() {
    stopSheetGesture();
    if (!el.hidden && !el.classList.contains('ac-leaving')) {
      if (isDocked() && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.classList.add('ac-leaving');
        closeTimer = setTimeout(() => { el.hidden = true; el.classList.remove('ac-leaving'); }, 180);
      } else el.hidden = true;
    }
    model = null; live = []; syncs = []; actionable = [];
    leader.replaceChildren(); placedFor = '';
    liftButtons('0px');
    stage.unreveal?.();
    relayoutSoon();
  }

  function render({ keepFocus = false } = {}) {
    const st = store.get();
    const sel = st.selection;
    if (!sel || st.shunting) { hide(); return; }
    const m = cardFor(sel, ctx);
    if (!m) { hide(); return; }
    stopSheetGesture();
    clearTimeout(closeTimer);
    el.classList.remove('ac-leaving');
    const focusedIdx = keepFocus ? actionable.findIndex((a) => a.el.contains(document.activeElement)) : -1;
    const same = !el.hidden && !!model && JSON.stringify(normalizeSel(sel) || sel) === lastSelKey;
    lastSelKey = JSON.stringify(normalizeSel(sel) || sel);
    el.dataset.card = (normalizeSel(sel) || sel).type || 'vessel';
    model = m; selRef = sel; live = []; syncs = []; actionable = [];
    const close = h('button', { class: 'ib ac-close', 'aria-label': 'Close', title: 'Close (Esc)', onclick: () => store.set({ selection: null }) }, icon('close'));
    const valEl = h('div', { class: 'ac-value' });
    const pillEl = h('div', { class: 'ac-status' });
    live.push(() => {
      const f = store.get().frame;
      if (!f) return;
      if (lens() === 'neutral' && model.why !== 'spleen' && model.why !== 'ascites') { if (valEl._sig !== 'n') { valEl._sig = 'n'; valEl.replaceChildren(h('span', { class: 'ac-unmeasured' }, 'Pressure unmeasured')); } }
      else {
        const v = m.value(f, lens(), refP());
        const sig = `${v.v}|${v.u}|${v.d || ''}|${v.up ? 1 : 0}`;
        if (valEl._sig !== sig) { valEl._sig = sig; valEl.replaceChildren(h('b', {}, v.v), h('span', { class: 'unit' }, v.u), v.d ? h('span', { class: 'ac-delta ' + (v.up ? 'up' : 'down') }, v.d) : null); }
      }
      const s = m.status?.(f);
      if (s) { if (pillEl._s !== s.join()) { pillEl.replaceChildren(h('span', { class: 'pill ' + s[0] }, s[1])); pillEl._s = s.join(); } }
      else if (pillEl._s) { pillEl.replaceChildren(); pillEl._s = ''; }
    });
    const body = h('div', { class: 'ac-body' });
    // Readouts that follow one another sit side by side on a phone (a lone one takes the whole row).
    // Plain buttons that follow one another are grouped too: three of them share one row on a phone.
    let statRun = null, btnRun = null;
    for (const v of m.verbs) {
      const node = verbEl(v);
      if (!node) continue;
      if (node.classList.contains('ac-stat')) {
        btnRun = null;
        if (!statRun) { statRun = h('div', { class: 'ac-stats' }); body.append(statRun); }
        statRun.append(node);
      } else if (node.classList.contains('ac-btn-wrap') && !node.classList.contains('wide') && !node.querySelector('.ac-note')) {
        statRun = null;
        if (!btnRun) { btnRun = h('div', { class: 'ac-btns' }); body.append(btnRun); }
        btnRun.append(node);
        btnRun.classList.toggle('tri', btnRun.children.length === 3);
      } else { statRun = btnRun = null; body.append(node); }
    }
    // Why? and Details are written twice and shown once: in the header on a phone (where a row of their own would
    // be a strip of wasted sheet) and at the foot on a desktop.
    const mkFoot = (where) => h('div', { class: 'ac-foot ' + where },
      h('button', { class: 'link', 'aria-label': 'Why?', title: 'Why?', onclick: (e) => onWhy(m.why, e.currentTarget) }, svgIcon('bulb', 'mi-ic'), h('span', { class: 'ac-link-text' }, 'Why?')),
      m.noDetails ? null : h('button', { class: 'link', 'aria-label': 'Details', title: 'Details', onclick: () => onDetails(selRef) }, h('span', { class: 'ac-link-text' }, 'Details'), svgIcon('chev-right', 'mi-ic')));
    const foot = mkFoot('at-foot');
    // One compact phone sheet: drag the header down to dismiss.
    const top = h('div', { class: 'ac-top' },
      h('header', { class: 'ac-head' }, h('div', { class: 'ac-titles' }, h('span', { class: 'ac-kicker' }, m.kicker), h('h3', {}, m.title)), mkFoot('in-head'), close),
      h('div', { class: 'ac-readout' }, valEl, pillEl));
    wireSheet(top);
    const scroller = h('div', { class: 'ac-scroll' }, body);
    scroller.addEventListener('scroll', syncMore, { passive: true });
    el.replaceChildren(top, scroller, foot);
    el.setAttribute('aria-label', `${m.title}: actions`);
    el.hidden = false;
    // Number keys trigger the verbs in order; show the number beside each.
    actionable.forEach((a, i) => { if (i < 9) a.el.dataset.key = String(i + 1); });
    // The same card rebuilt (a value changed what is allowed): keep its place and its size, so nothing moves under the hand.
    update();
    if (!same) { placedFor = ''; lastLayout = ''; pinned = null; }
    position();
    if (focusedIdx >= 0) actionable[focusedIdx]?.focus();
    relayoutSoon();
    reveal();
    requestAnimationFrame(syncMore);
  }

  // Track swipes outside the header too; release all listeners on close or selection change.
  function wireSheet(top) {
    let y0 = null;
    const stop = () => {
      y0 = null;
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', stop);
    };
    const up = (e) => {
      const dy = e.clientY - y0;
      stop();
      if (dy > 40) store.set({ selection: null });
    };
    stopSheetGesture = stop;
    top.addEventListener('pointerdown', (e) => {
      if (!isDocked() || !e.isPrimary || e.button !== 0 || e.target.closest('.ac-close, .ac-foot')) return;
      y0 = e.clientY;
      addEventListener('pointerup', up);
      addEventListener('pointercancel', stop);
    });
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
    if (v.type === 'about') {
      // What this is and what is happening to it now, in plain words (as the lobule's cards).
      const box = h('div', { class: 'ac-about' });
      box.addEventListener('click', () => box.classList.toggle('full'));
      live.push(() => {
        const t = v.text(store.get().frame) || [], sig = t.join('\n');
        if (box._sig !== sig) { box._sig = sig; box.replaceChildren(t.map((x) => h('p', {}, x))); }
      });
      return box;
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
      const input = h('input', { type: 'range', min: v.min, max: v.max, step: v.step, 'aria-label': lab, 'data-def': v.def ?? null });
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
      // On a phone a short name sits on one row with its track; a long one stacks above it.
      const row = h('div', { class: 'ac-slider' + (lab.length > 13 ? ' long' : '') + (dis ? ' locked' : ''), title: dis ? LOCK_TIP : null },
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
      const wrap = h('div', { class: 'ac-btn-wrap' + (v.label.length > 15 ? ' wide' : '') }, b);   // a long name takes the whole row on a phone
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
    if (v.type === 'dye') {
      // A press injects for a few seconds; held, it goes on until let go.
      const lbl = h('span', { class: 'ac-bl' }, v.label);
      const b = h('button', { class: 'ac-btn ac-dye', title: 'Tap to inject for a few seconds; hold to go on longer' }, v.icon ? svgIcon(v.icon, 'ac-ic') : null, lbl);
      let pressed = false;
      const up = () => { if (pressed) { pressed = false; v.release(); } };
      b.addEventListener('pointerdown', (e) => { if (e.button > 0) return; pressed = true; b.setPointerCapture?.(e.pointerId); v.run({ hold: true }); });
      for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(t, up);
      b.addEventListener('click', (e) => { if (e.detail === 0) v.run({}); });   // keyboard
      b.addEventListener('contextmenu', (e) => e.preventDefault());
      live.push(() => {
        const on = !!v.busy();
        b.classList.toggle('on', on);
        const t = on ? 'Injecting\u2026' : v.label;
        if (lbl.textContent !== t) lbl.textContent = t;
      });
      actionable.push({ el: b, run: () => v.run({}), focus: () => b.focus() });
      return h('div', { class: 'ac-btn-wrap' }, b);
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

  let dragEl = null;
  el.addEventListener('pointerdown', (e) => { dragEl = e.target.closest?.('input[type=range], .ac-btn, .ac-toggle, .seg button') || null; });
  const dragEnd = () => { dragEl = null; };
  addEventListener('pointerup', dragEnd, true); addEventListener('pointercancel', dragEnd, true);

  function update() {
    if (!model || el.hidden) return;
    // The control in use stays exactly where it is: if text came or went above it, scroll the card back by the difference.
    const t0 = dragEl ? dragEl.getBoundingClientRect().top : 0;
    for (const fn of live) fn();
    if (dragEl) {
      const d = dragEl.getBoundingClientRect().top - t0, sc = el.querySelector('.ac-scroll');
      if (d && sc) sc.scrollTop += d;
    }
    position();
  }

  // Beside the structure, on the side that covers least of it, inside the figure.
  function position() {
    if (!model || el.hidden) return;
    if (matchMedia('(max-width: 767px), (max-width: 1023px) and (max-height: 500px) and (orientation: landscape)').matches) {
      if (el.parentNode !== dockHost) dockHost.append(el);
      el.style.left = ''; el.style.top = ''; el.classList.add('docked'); leader.replaceChildren(); return;
    }
    if (el.parentNode !== view) view.append(el);
    el.classList.remove('docked');
    // Where the structure is on screen changes only when the view or the drawn geometry does.
    const lk = stage.layoutKey ? stage.layoutKey() : '';
    if (lk && lk === lastLayout && placedFor) return;
    lastLayout = lk;
    const a = stage.anchorFor(normalizeSel(selRef) || selRef);
    if (!a) return;
    // Once placed, the card stays put while its controls are used (the drawn structure shifting as values change must not
    // move it); only the leader follows. A resize, a new selection or a moved panel places it afresh (placedFor reset).
    if (placedFor && pinned) { drawLeader(pinned.x, pinned.y, sizes.w || 288, sizes.h || 240, a); return; }
    // Sizes come from ResizeObservers: measuring here, after the frame's DOM writes, would force
    // a layout every frame while the card is open.
    const W = sizes.vw, H = sizes.vh;
    const w = sizes.w || 288, hh = sizes.h || 240;
    // The figure fills the window: the card stays in the part the top bar, the vitals dock and the
    // cards on the right leave free (published on #app by main.js).
    const css = (k) => parseFloat(appStyle.getPropertyValue(k)) || 0;
    const top = css('--top-safe') + 8, bottom = H - (css('--bot-occ') || 0) - 8, right = W - css('--right-occ') - 8;
    const pts = a.path || [[a.x, a.y]];
    const gap = 22;
    // Beside the structure first; failing that, in the empty margin beside the figure (with a leader
    // line back to it), so the card covers as little of the anatomy as it can.
    const fig = stage.contentRect?.();
    const cands = [[a.x + gap, a.y - hh / 2], [a.x - gap - w, a.y - hh / 2], [a.x - w / 2, a.y + gap], [a.x - w / 2, a.y - gap - hh], [a.x + gap, a.y - 30], [a.x - gap - w, a.y - 30]];
    if (fig) cands.push([fig.x1 + 16, a.y - hh / 2], [fig.x0 - 16 - w, a.y - hh / 2]);
    let best = null;
    // A touch tablet (an iPad): the card is a side panel on the right, under the top bar, with a leader to its structure,
    // so it never lands under the hand working the figure.
    if (tabletTouch.matches) best = { cost: 0, x: Math.max(8, right - w), y: top };
    if (!best) cands.forEach(([x, y], i) => {
      const cx = clamp(x, 8, Math.max(8, right - w)), cy = clamp(y, top, Math.max(top, bottom - hh));
      let cover = 0;
      for (const [px, py] of pts) if (px > cx - 6 && px < cx + w + 6 && py > cy - 6 && py < cy + hh + 6) cover++;
      const shift = Math.abs(cx - x) + Math.abs(cy - y);
      // The share of the card lying over the drawn figure.
      const over = fig ? Math.max(0, Math.min(cx + w, fig.x1) - Math.max(cx, fig.x0)) * Math.max(0, Math.min(cy + hh, fig.y1) - Math.max(cy, fig.y0)) / (w * hh) : 0;
      const far = Math.max(0, Math.hypot(cx + w / 2 - a.x, cy + hh / 2 - a.y) - (w + hh) / 2);
      const cost = cover * 40 + over * 140 + shift * 0.5 + far * 0.15 + i * 3;
      if (!best || cost < best.cost) best = { cost, x: cx, y: cy };
    });
    const key = `${Math.round(best.x)},${Math.round(best.y)}|${Math.round(a.x)},${Math.round(a.y)}`;
    if (key === placedFor) return;
    placedFor = key; pinned = { x: best.x, y: best.y };
    el.style.left = best.x + 'px'; el.style.top = best.y + 'px';
    drawLeader(best.x, best.y, w, hh, a);
  }
  function drawLeader(x, y, w, hh, a) {
    const ex = clamp(a.x, x, x + w), ey = clamp(a.y, y, y + hh);
    const d = Math.hypot(ex - a.x, ey - a.y);
    if (d < 30 || isDocked()) { leader.replaceChildren(); return; }
    const ns = 'http://www.w3.org/2000/svg', line = document.createElementNS(ns, 'path'), dot = document.createElementNS(ns, 'circle');
    line.setAttribute('d', `M${ex.toFixed(1)} ${ey.toFixed(1)} L${a.x.toFixed(1)} ${a.y.toFixed(1)}`);
    dot.setAttribute('cx', a.x.toFixed(1)); dot.setAttribute('cy', a.y.toFixed(1)); dot.setAttribute('r', '4');
    leader.replaceChildren(line, dot);
  }

  // The floating pieces moved (a card opened on the right, the dock grew): place the card again.
  addEventListener('pps:occ', () => { if (pinned && !isDocked()) return; placedFor = ''; lastLayout = ''; pinned = null; position(); if (isDocked()) reveal(); });
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
