// The action card: click a structure and a small card opens beside it with the value it carries
// and only the verbs that apply to it. It replaces the tool trays, the tool hint card and the
// sliders that used to live in the side panel. Every verb takes effect at once and becomes one
// entry in the timeline; nothing stays "armed".

import { store, updateParams } from './store.js?v=5174ae465b';
import { h, icon, svgIcon, clamp, infoButton, sinkTo, stopSink, paintRange, isPhoneLayout, countTo, swapText, transformEndX, afterExit, markGone, releaseWords } from './util.js?v=5c99534b1f';
import { releaseSpeed, isFlick, D_FLIP, D_SMALL, EASE_ARRIVE, EASE_IN } from './ease.js?v=7513a88c68';
import { cardFor, normalizeSel } from './actions.js?v=3f98af43f1';
import { frameFor, cancelFrame } from './frame.js?v=1d147c7c9a';
import { restPass, cancelRest } from './rest-pass.js?v=d13e397f0b';
import { classSoon, runSoon } from './class-soon.js?v=97b9d0e0db';
import { placeCard, coverCount, vesselPoints } from './card-place.js?v=4eb9859ce3';
import { readBox, readMetric } from './layout-snap.js?v=f609965236';
const nextFrame = frameFor('card');
// A reading's printed number ("12.5", "−3.0"), with its decimals, or null for one that isn't a plain number.
const numOf = (t) => { const s = String(t).replace('−', '-'); return /^-?\d+(\.\d+)?$/.test(s) ? { n: +s, d: (s.split('.')[1] || '').length } : null; };


export function createCard({ view, stage, ctx, onWhy, onDetails }) {
  const el = h('section', { class: 'action-card stage-blocker', role: 'dialog', 'aria-label': 'Actions', hidden: true });
  view.append(el);
  // A thin line from the card's nearest edge to the structure, with a dot on it, when they are apart.
  // (Plain boxes, no SVG: the line a dashed box turned to the anchor, the dot a ringed box, each placed by a transform: app.css .ac-lline, .ac-ldot.)
  const leader = document.createElement('div');
  leader.setAttribute('class', 'ac-leader'); leader.setAttribute('aria-hidden', 'true');
  view.append(leader);
  const tabletTouch = matchMedia('(pointer: coarse) and (min-width: 768px) and (max-width: 1366px)');
  const sizes = { vw: view.clientWidth, vh: view.clientHeight, w: 0, h: 0 };
  new ResizeObserver(() => { const moved = Math.abs(sizes.vw - view.clientWidth) > 2 || !sizes.vh; sizes.vw = view.clientWidth; sizes.vh = view.clientHeight; if (moved) { placedFor = ''; lastLayout = ''; pinned = null; } position(); if (isDocked()) reveal(); }).observe(view);
  new ResizeObserver(() => { const first = !sizes.w; sizes.w = el.offsetWidth; sizes.h = el.offsetHeight; if (first) { placedFor = ''; lastLayout = ''; pinned = null; } else lastLayout = ''; position(); syncMore(); if (isDocked()) reveal(); }).observe(el);
  const uiState = {};
  ctx.ui = (key, def) => (uiState[key] ||= def);
  let lastSelKey = '', model = null, live = [], syncs = [], actionable = [], selRef = null, placedFor = '', lastLayout = '', pinned = null;

  const refP = () => { const st = store.get(); return st.compareSnap ? st.compareSnap.P : st.healthy?.P; };
  const lens = () => (store.get().imaging ? 'neutral' : store.get().colorMode);

  // Laying the labels out again (they steer clear of the card) is not needed more than once a frame.
  let relayoutRaf = 0;
  const relayoutSoon = () => { if (!relayoutRaf) relayoutRaf = nextFrame(() => { relayoutRaf = 0; stage.relayout?.(); }); };
  const isDocked = () => el.classList.contains('docked');
  // The phone sheet lives in the whole figure column, not in the figure itself: it reaches the bottom of the column,
  // over the play and timeline row, and stops just above the readout strip.
  const dockHost = view.closest('.stage-wrap') || view;
  const appStyle = document.getElementById('app').style;
  // A card with more controls than fit scrolls, and fades at the bottom while there is more to see.
  let moreAsk = 0;
  const moreRest = () => { moreAsk = 0; syncMore(); };
  const moreSoon = () => { if (!moreAsk) moreAsk = restPass(moreRest); };
  function syncMore() {
    const sc = el.querySelector('.ac-scroll');
    if (sc) sc.classList.toggle('more', sc.scrollHeight - sc.clientHeight - sc.scrollTop > 4);
  }
  // The sheet covers the bottom of the figure: keep the tapped vessel in the part that is left, and lift
  // the figure's own buttons (Fit, turn) and the credit clear of it.
  let revealRaf = 0, lift = null, liftedBy = '';
  // The variable goes on the few elements that use it: set on the whole figure it would make the browser re-check
  // the style of every element under it.
  function liftButtons(px) {
    if (px === liftedBy) return;
    liftedBy = px;
    lift ||= [...dockHost.querySelectorAll('.zoom-pill, .stage-clock')];
    for (const b of lift) b.style.setProperty('--sheet-h', px);
    // Keep the zoom and Fit pill above the card; hide only if it would reach the top bar.
    for (const pill of lift.filter((b) => b.matches('.zoom-pill'))) {
      pill.classList.toggle('under-sheet', isDocked() && parseFloat(px) > 0);
      pill.classList.remove('no-room');
    }
  }
  // How much of the figure the sheet covers (it also covers the row below the figure): read here, between two frames, through layout-snap.
  function coverNow() {
    return Math.max(0, readBox(view).bottom - (readBox(dockHost).top + readMetric(el, 'offsetTop')));
  }
  function revealNow() {
    const open = model && !el.hidden && isDocked();
    const covered = open ? coverNow() : 0;
    liftButtons(open ? `${covered + 6}px` : '0px');
    if (open) stage.reveal?.(normalizeSel(selRef) || selRef, covered);
  }
  function reveal() {
    // (A rest pass: the boxes are read between two frames, never inside one.)
    cancelRest(revealRaf);
    revealRaf = restPass(revealNow);
  }
  let closeTimer = 0, stopSheetGesture = () => {};
  function hide() {
    stopSheetGesture();
    if (el.dataset.swiped) { delete el.dataset.swiped; el.hidden = true; el.style.removeProperty('--sink'); }   // (pulled away: already out of sight behind the tab row)
    if (!el.hidden && !el.classList.contains('ac-leaving')) {
      // (Docked, it sinks away; a desktop card fades out where it stands: it had closed in one frame.)
      // (With Reduce Motion both only fade: app.css turns the keyframes into fades.)
      el.classList.add('ac-leaving');
      if (isDocked()) markGone(180);   // (a phone's card sinks like a sheet: whatever opens next waits for it, as it does for a sheet)
      closeTimer = afterExit(el, 'ac-leaving', () => { el.hidden = true; el.classList.remove('ac-leaving'); releaseWords(el); });
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
    // The reading, then its status as a coloured word (as the data card tiles' status words).
    const numEl = h('span', { class: 'ac-num' }), pillEl = h('span', { class: 'ac-state' });
    const valEl = h('div', { class: 'ac-value' }, numEl, pillEl);
    live.push(() => {
      const f = store.get().frame;
      if (!f) return;
      if (lens() === 'neutral' && model.why !== 'spleen' && model.why !== 'ascites') { if (valEl._sig !== 'n') { valEl._sig = 'n'; releaseWords(numEl); numEl.replaceChildren(h('span', { class: 'ac-unmeasured' }, 'Pressure unmeasured')); } }
      else {
        const v = m.value(f, lens(), refP());
        const sig = `${v.v}|${v.u}|${v.d || ''}|${v.up ? 1 : 0}`;
        if (valEl._sig !== sig) {
          // The same reading with a new number rolls to it, a paused edit or a treatment included (P17); anything else is
          // drawn afresh.
          const was = valEl._v, a = numOf(v.v), b = was && numOf(was.v), numB = numEl.firstChild;
          if (a && b && a.d === b.d && was.u === v.u && !!was.d === !!v.d && numB?.tagName === 'B') {
            countTo(numB, a.n, a.d, { eased: store.get().running });
            const dl = numEl.querySelector('.ac-delta');
            if (dl) { dl.textContent = v.d; dl.className = 'ac-delta ' + (v.up ? 'up' : 'down'); }
          } else {
            releaseWords(numEl);
            numEl.replaceChildren(h('b', {}, v.v), h('span', { class: 'unit' }, v.u), v.d ? h('span', { class: 'ac-delta ' + (v.up ? 'up' : 'down') }, v.d) : null);
            if (a) countTo(numEl.firstChild, a.n, a.d);   // (its starting point for the next roll)
          }
          valEl._sig = sig; valEl._v = v;
        }
      }
      // The status word crossfades to a new one, its colour easing with it.
      const s = m.status?.(f);
      if (s) { if (pillEl._s !== s.join()) { const cls = 'ac-state st-word ' + s[0]; if (!pillEl._s) pillEl.className = cls; swapText(pillEl, s[1], () => { pillEl.className = cls; }); pillEl._s = s.join(); } }
      else if (pillEl._s) { swapText(pillEl, '', () => { pillEl.className = 'ac-state'; }); pillEl._s = ''; }
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
    // be a strip of wasted sheet) and at the foot on a desktop. The phone header has one word link: Details when there
    // is one (its "Why this value?" holds the Why), otherwise Why?.
    const mkFoot = (where) => h('div', { class: 'ac-foot ' + where },
      where === 'in-head' && !m.noDetails ? null : h('button', { class: 'link', 'aria-label': 'Why?', title: 'Why?', onclick: (e) => onWhy(m.why, e.currentTarget) }, svgIcon('bulb', 'mi-ic'), h('span', { class: 'ac-link-text' }, 'Why?')),
      m.noDetails ? null : h('button', { class: 'link', 'aria-label': 'Details', title: 'Details', onclick: () => onDetails(selRef) }, h('span', { class: 'ac-link-text' }, 'Details'), svgIcon('chev-right', 'mi-ic')));
    const foot = mkFoot('at-foot');
    // One compact phone sheet: drag the header down to dismiss.
    const top = h('div', { class: 'ac-top' },
      h('header', { class: 'ac-head' }, h('div', { class: 'ac-titles' }, h('span', { class: 'ac-kicker' }, m.kicker), h('h3', {}, m.title)), mkFoot('in-head'), close),
      h('div', { class: 'ac-readout' }, valEl));
    wireSheet(top);
    const scroller = h('div', { class: 'ac-scroll' }, body);
    // (Its scroll is measured between frames, a rest pass, never in the scroll's own event.)
    scroller.addEventListener('scroll', moreSoon, { passive: true });
    const swap = !el.hidden && !same && !!el.animate;
    const was = swap ? [...el.children].filter((c) => !c.classList.contains('ac-ghost')) : [];
    el.querySelector(':scope > .ac-ghost')?.remove();
    releaseWords(el);   // (the readouts of the content being replaced)
    el.replaceChildren(top, scroller, foot);
    // Another vessel picked while the card is open: its contents fade in, rather than the words changing in one frame, and
    // the old ones fade out over them from a layer on top that takes no taps, instead of vanishing first (round 2 review, RF7).
    if (swap) {
      for (const c of el.children) c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: D_SMALL, easing: EASE_ARRIVE });
      if (was.length) {
        const ghost = h('div', { class: 'ac-ghost', 'aria-hidden': 'true', inert: '' }, ...was);
        el.append(ghost);
        const a = ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: D_FLIP, easing: EASE_IN, fill: 'forwards' });
        a.finished.then(() => ghost.remove(), () => ghost.remove());
      }
    }
    el.setAttribute('aria-label', `${m.title}: actions`);
    if (el.hidden) at = null;   // (opened afresh: it appears where it is placed, no glide from where it last stood)
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
    restPass(syncMore);
  }

  // Track swipes outside the header too; release all listeners on close or selection change.
  // Over the thumb dock (an upright phone) the card follows the finger down behind the tab row (--sink, as the other
  // cards there) and, let go past a short pull or flicked, sinks out of sight and closes; a short pull eases back.
  function wireSheet(top) {
    let y0 = null, t0 = 0, dy = 0, trail = [], pid = -1, px = 0, py = 0, held = false;   // pid: the finger that has the card (a second one's moves and lifts are not the pull); px, py: where it came down; held: past the 6 px a tap may wobble
    const thumb = () => document.documentElement.classList.contains('thumb-ui');
    const stop = () => {
      y0 = null;
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', cancel);
    };
    const move = (e) => {
      if (e.pointerId !== pid) return;
      dy = Math.max(0, e.clientY - y0);
      // (A tap on the header does not nudge the card: it follows the finger only once the finger has moved a few px, as the other sheets do.)
      if (!held) { if (Math.hypot(e.clientX - px, e.clientY - py) < 6) return; held = true; }
      trail.push([performance.now(), e.clientY]); if (trail.length > 8) trail.shift();
      if (thumb()) el.style.setProperty('--sink', `${dy}px`);
    };
    const settle = (gone, speed) => {
      if (!thumb()) { if (gone) store.set({ selection: null }); return; }
      if (!gone) { sinkTo(el, 0, 220, undefined, speed); return; }
      sinkTo(el, sizes.h, 220, () => { if (el.hidden) return; el.dataset.swiped = '1'; store.set({ selection: null }); if (!el.hidden) { delete el.dataset.swiped; el.style.removeProperty('--sink'); } }, speed);
    };
    const up = (e) => {
      if (e.pointerId !== pid) return;
      dy = Math.max(0, e.clientY - y0);
      const speed = releaseSpeed(trail, performance.now());   // (the finger's, px per ms down: the settle carries it on)
      // (A flick is how fast the finger was going as it lifted, not only the pull's average: a slow start and a quick flick at the end is one.)
      const flick = isFlick(dy, speed, dy / Math.max(1, performance.now() - t0), 0.6, 30);
      stop();
      settle(flick || dy > 40, speed);
    };
    const cancel = (e) => { if (e.pointerId !== pid) return; stop(); settle(false, releaseSpeed(trail, performance.now())); };
    stopSheetGesture = () => { if (y0 != null) stop(); stopSink(el); el.style.removeProperty('--sink'); };
    top.addEventListener('pointerdown', (e) => {
      if (!isDocked() || !e.isPrimary || e.button !== 0 || e.target.closest('.ac-close, .ac-foot')) return;
      y0 = e.clientY - (parseFloat(el.style.getPropertyValue('--sink')) || 0); t0 = performance.now(); dy = 0; trail = []; pid = e.pointerId; px = e.clientX; py = e.clientY; held = false;
      stopSink(el);
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      addEventListener('pointercancel', cancel);
    });
  }


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
      const paint = (x) => { input.value = x; val.textContent = v.format(x); paintRange(input, (x - v.min) / (v.max - v.min)); row.classList.toggle('changed', v.def != null && Math.abs(x - v.def) > 1e-9); };
      let fresh = true;
      input.addEventListener('pointerdown', () => { fresh = true; });
      input.addEventListener('keydown', () => { fresh = true; });
      // The thumb and its number follow the pointer at once; the model gets the newest value once per frame, in a task of its own
      // straight after that frame (class-soon runSoon), so the cards, legend and readouts the change wakes are built between frames,
      // never inside one.
      let pend = null, raf = 0;
      const send = () => { const p = pend; pend = null; if (p) updateParams((pp) => { v.set(pp, p.x); return pp; }, { history: p.history, label: v.hist || lab }); };
      const flush = () => { cancelFrame(raf); raf = 0; if (pend) runSoon(send); };
      input.addEventListener('input', () => {
        const x = parseFloat(input.value);
        paint(x);
        if (!pend) pend = { history: fresh }; pend.x = x;
        fresh = false;
        if (!raf) raf = nextFrame(flush);
      });
      input.addEventListener('change', flush);
      // On a phone a short name sits on one row with its track; a long one stacks above it.
      const row = h('div', { class: 'ac-slider' + (lab.length > 13 ? ' long' : '') },
        h('div', { class: 'ctl-top' }, h('span', { class: 'ac-label' }, v.icon ? svgIcon(v.icon, 'ac-ic') : null, lab, v.info ? infoButton(v.info) : null), val),
        h('div', { class: 'range-wrap' }, input),
        v.sub ? h('div', { class: 'ctl-sub' }, v.sub) : null);
      paint(v.get(p0));
      syncs.push((p) => { if (document.activeElement !== input) paint(v.get(p)); });
      actionable.push({ el: row, run: () => input.focus(), focus: () => input.focus() });
      return row;
    }
    if (v.type === 'toggle') {
      const b = h('button', { class: 'ac-toggle', role: 'switch', 'aria-checked': String(!!v.get(p0)) },
        v.icon ? svgIcon(v.icon, 'ac-ic') : null, h('span', { class: 'ac-tl' }, v.label), h('span', { class: 'switch-vis', 'aria-hidden': 'true' }, h('i')));
      b.addEventListener('click', () => { const on = !v.get(store.get().params); updateParams((pp) => { v.set(pp, on); return pp; }, { label: `${v.hist || v.label} ${on ? 'on' : 'off'}` }); });
      syncs.push((p) => b.setAttribute('aria-checked', String(!!v.get(p))));
      actionable.push({ el: b, run: () => b.click(), focus: () => b.focus() });
      return b;
    }
    if (v.type === 'button') {
      const lbl = h('span', { class: 'ac-bl' }, v.label);
      const b = h('button', { class: 'ac-btn' + (v.danger ? ' danger' : '') }, v.icon ? svgIcon(v.icon, 'ac-ic') : null, lbl);
      b.addEventListener('click', () => { v.run(); setTimeout(() => restPass(() => render({ keepFocus: true })), 30); });   // (the card rebuilds between frames, never as a timer task inside one)
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
      for (const t of ['pointerup', 'pointercancel']) b.addEventListener(t, up);
      b.addEventListener('lostpointercapture', (e) => { if (e.target === b) up(); });   // (a child's lost capture, a touch handing it to the button, is not the end of the press)
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
      const vol = h('input', { type: 'range', min: 1, max: 10, step: 0.5, value: 5, 'aria-label': 'Volume to drain (L)' });
      const volLbl = h('span', { class: 'ctl-val' });
      const volWrap = h('div', { class: 'range-wrap' }, vol);
      const paintVol = () => { volLbl.textContent = `${(+vol.value).toFixed(1)} L`; paintRange(vol, (+vol.value - 1) / 9); };
      vol.addEventListener('input', paintVol); paintVol();
      const alb = h('input', { type: 'checkbox', checked: true });
      const go = h('button', { class: 'ac-btn' }, svgIcon('needle', 'ac-ic'), h('span', { class: 'ac-bl' }, 'Drain'));
      go.addEventListener('click', () => ctx.action({ kind: 'paracentesis', mL: +vol.value * 1000, albumin: alb.checked }));
      actionable.push({ el: go, run: () => go.click(), focus: () => go.focus() });
      return h('div', { class: 'ac-drain' },
        h('div', { class: 'ctl-top' }, h('span', { class: 'ac-label' }, svgIcon('needle', 'ac-ic'), 'Paracentesis'), volLbl), volWrap,
        h('div', { class: 'ac-drain-row' }, h('label', { class: 'check-row' }, alb, 'Albumin 8 g/L'), go));
    }
    return null;
  }

  let dragEl = null;
  // (R11, review pass 2: the control in use is kept in place by a ResizeObserver on what can push it (the readout above and the rows
  // of the body), whose callback comes after the browser's own layout, so a drag reads no layout in a frame: the old way read the
  // control's place before and after every model frame's live writes, two forced layouts a frame while a slider was held.
  // The new path only, no off switch.)
  let dragTop = 0;
  const dragRO = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    if (!dragEl?.isConnected) return;
    const t = readBox(dragEl).top, d = t - dragTop, sc = el.querySelector('.ac-scroll');
    if (d && sc) { const s0 = readMetric(sc, 'scrollTop'); sc.scrollTop = s0 + d; dragTop = t - (readMetric(sc, 'scrollTop') - s0); } else dragTop = t;
  }) : null;
  el.addEventListener('pointerdown', (e) => {
    dragEl = e.target.closest?.('input[type=range], .ac-btn, .ac-toggle, .seg button') || null;
    if (!dragRO || !dragEl) return;
    dragTop = readBox(dragEl).top;   // (once, in the press's own event)
    dragRO.disconnect();
    const topEl = el.querySelector('.ac-top'), body = el.querySelector('.ac-scroll')?.firstElementChild;
    if (topEl) dragRO.observe(topEl);
    for (const c of body?.children || []) dragRO.observe(c);
  });
  const dragEnd = () => { dragEl = null; dragRO?.disconnect(); };
  addEventListener('pointerup', dragEnd, true); addEventListener('pointercancel', dragEnd, true);

  function update() {
    if (!model || el.hidden) return;
    // (The control in use is kept where it is by dragRO, above: nothing is read here.)
    for (const fn of live) fn();
    position();
  }

  // The zoom pill is a column above the dock on the right: a card that reaches it ends above it. The dock's
  // height settles after a card is placed, so this runs again whenever the occupancy changes (pps:occ).
  // The card stands where `translate` puts it (laid out once at the view's corner); a move while it is open glides there on the
  // compositor from where it stood (a new vessel moved it 23 px in one frame: round 2 review, RF7). Nothing is laid out per frame.
  let at = null;
  function moveTo(x, y) {
    const t = `${x}px ${y}px`;
    if (at && (Math.abs(at[0] - x) > 0.5 || Math.abs(at[1] - y) > 0.5) && !matchMedia('(prefers-reduced-motion: reduce)').matches) el.animate([{ translate: `${at[0]}px ${at[1]}px` }, { translate: t }], { duration: D_FLIP, easing: EASE_ARRIVE });
    el.style.translate = t; at = [x, y];
  }
  // (Measured in a rest pass, between two frames: placing the card never reads layout. A newer ask replaces one waiting.)
  let fitRest = 0;
  function fitAbovePill() { cancelRest(fitRest); fitRest = restPass(fitNow); }
  function fitNow() {
    el.style.maxHeight = '';
    const pill = view.querySelector('.zoom-pill'), box = readMetric(el, 'offsetParent');
    if (el.hidden || el.classList.contains('docked') || !box || !pill || readMetric(pill, 'offsetParent') !== box || !readMetric(pill, 'offsetHeight')) return;
    const pt = readMetric(pill, 'offsetTop'), pl = readMetric(pill, 'offsetLeft') + transformEndX(pill), top = at ? at[1] : readMetric(el, 'offsetTop'), left = at ? at[0] : readMetric(el, 'offsetLeft');   // (its glide aside is a transform: RF2; the card's own place is its translate)
    if (left < pl + readMetric(pill, 'offsetWidth') && left + readMetric(el, 'offsetWidth') > pl && top + readMetric(el, 'offsetHeight') > pt - 8) el.style.maxHeight = Math.max(200, pt - 8 - top) + 'px';
  }
  function position() {
    if (!model || el.hidden) return;
    if (isPhoneLayout()) {
      if (el.parentNode !== dockHost) dockHost.append(el);
      el.style.translate = ''; at = null; el.classList.add('docked'); leader.replaceChildren(); return;
    }
    if (el.parentNode !== view) view.append(el);
    el.classList.remove('docked');
    // Where the structure is on screen changes only when the view or the drawn geometry does.
    const lk = stage.layoutKey ? stage.layoutKey() : '';
    if (lk && lk === lastLayout && placedFor) return;
    lastLayout = lk;
    const a = stage.anchorFor(normalizeSel(selRef) || selRef);
    // Once placed, the card stays put while its controls are used (the drawn structure shifting as values change must not
    // move it); only the leader follows. A resize, a new selection or a moved panel places it afresh (placedFor reset).
    // Sizes come from ResizeObservers: measuring here, after the frame's DOM writes, would force
    // a layout every frame while the card is open.
    const W = sizes.vw, H = sizes.vh;
    const w = sizes.w || 288, hh = sizes.h || 240;
    // The figure fills the window: the card stays in the part the top bar, the vitals dock and the
    // cards on the right leave free (published on #app by main.js).
    const css = (k) => parseFloat(appStyle.getPropertyValue(k)) || 0;
    const top = css('--top-safe') + 8, bottom = H - (css('--bot-occ') || 0) - 8, right = W - css('--right-occ') - 8;
    // Nothing drawn to point at (a vessel this view leaves out, picked from Search): no leader, and the card keeps clear of the cards on the right.
    if (!a) {
      leader.replaceChildren();
      const x = pinned ? Math.min(pinned.x, Math.max(8, right - w)) : Math.max(8, right - w), y = pinned ? clamp(pinned.y, top, Math.max(top, bottom - hh)) : top;
      if (!pinned || x !== pinned.x || y !== pinned.y) { pinned = { x, y }; placedFor = ''; moveTo(x, y); fitAbovePill(); }
      return;
    }
    // ...unless it no longer fits there (placed before the dock published its height, the card grew, or
    // Tests, Treat or History opened on the right over it: then it moves left, clear of them).
    // A zoom or pan can bring the vessel under a pinned card: then it moves (gliding) to a clear spot.
    // (A card that has no clear spot left, zoomed right in, stays where it is rather than hunting for one.)
    const fits = pinned && pinned.y >= top - 1 && pinned.y + hh <= Math.max(bottom, top + hh) + 1 && pinned.x + w <= Math.max(right, 8 + w) + 1;
    const clear = fits && (a.r == null || !coverCount(vesselPoints(a), pinned.x, pinned.y, w, hh, a.r + 4));
    if (placedFor && pinned && clear) { drawLeader(pinned.x, pinned.y, w, hh, a); return; }
    // Beside the structure, clear of the whole vessel; failing that, in the empty margin beside the figure
    // (with a leader line back to it), so the card covers as little of the anatomy as it can (card-place.js).
    const best = placeCard(a, w, hh, { top, bottom, right }, stage.contentRect?.(), tabletTouch.matches);
    if (placedFor && pinned && fits && best.cover) { drawLeader(pinned.x, pinned.y, w, hh, a); return; }
    const key = `${Math.round(best.x)},${Math.round(best.y)}|${Math.round(a.x)},${Math.round(a.y)}`;
    if (key === placedFor) return;
    placedFor = key; pinned = { x: best.x, y: best.y };
    moveTo(best.x, best.y);
    fitAbovePill();
    drawLeader(best.x, best.y, w, hh, a);
  }
  const lLine = document.createElement('i'), lDot = document.createElement('i');
  lLine.className = 'ac-lline'; lDot.className = 'ac-ldot';
  function drawLeader(x, y, w, hh, a) {
    // From an organ's outline: the outline point nearest the card; otherwise from the anchor itself.
    let ax = a.x, ay = a.y;
    if (a.outline?.length) {
      let bd = Infinity;
      for (const [px, py] of a.outline) {
        const dd = Math.hypot(px - clamp(px, x, x + w), py - clamp(py, y, y + hh));
        if (dd < bd) { bd = dd; ax = px; ay = py; }
      }
    }
    const ex = clamp(ax, x, x + w), ey = clamp(ay, y, y + hh);
    const d = Math.hypot(ex - ax, ey - ay);
    if (d < (a.outline ? 12 : 30) || isDocked()) { leader.replaceChildren(); classSoon(leader, 'on', false); return; }
    // (The line: a box d long from the card's edge, turned toward the anchor; set once each time the card is placed, never in a frame.)
    lLine.style.width = `${d.toFixed(1)}px`;
    lLine.style.transform = `translate(${ex.toFixed(1)}px, ${ey.toFixed(1)}px) rotate(${Math.atan2(ay - ey, ax - ex).toFixed(4)}rad)`;
    lDot.style.transform = `translate(${ax.toFixed(1)}px, ${ay.toFixed(1)}px)`;
    if (!lLine.isConnected) { classSoon(leader, 'on', false); leader.replaceChildren(lLine, lDot); nextFrame(() => classSoon(leader, 'on', true)); }
  }

  // The floating pieces moved (a card opened on the right, the dock grew): place the card again.
  addEventListener('pps:occ', () => { fitAbovePill(); if (pinned && !isDocked()) { lastLayout = ''; position(); return; } placedFor = ''; lastLayout = ''; pinned = null; position(); if (isDocked()) reveal(); });
  store.on('selection', () => render());
  store.on('shunting', () => render());
  store.on('colorMode', () => update());
  store.on('params', () => { const p = store.get().params; for (const s of syncs) s(p); });
  return {
    el, render, update, position,
    isOpen: () => !!model && !el.hidden,
    trigger(n) { const a = actionable[n - 1]; if (a && !a.el.disabled) { a.run(); return true; } return false; },
    focusFirst() { actionable[0]?.focus(); },
  };
}
