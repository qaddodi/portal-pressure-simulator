// The one menu, opened from the button at the top left (the brand mark and the current patient's name):
// every presentation by topic on the left, the patients by site on the right, one search across both,
// and Copy link and Help in its footer. From 768 px it is a popover under the button; on a phone, the
// same content as a bottom sheet. Hovering a row (or focusing it with the arrow keys) previews it beside
// the panel; on touch, the ⓘ at a presentation's end opens the same preview under its row.

import { store } from './store.js?v=afc4d7c743';
import { createTraceGL, fitPen } from './trace-gl.js?v=8d560fcd89';
import { h, icon, svgIcon, cssVar, clamp, settleFrom, swipeSheet, visibleBottom, fadeWhileMore, PHONE_MQ, fmt, shownOf } from './util.js?v=f926cd5572';
import { SNAPSHOTS } from './snapshots.js?v=4ca084eda3';
import { HVPG_CUTS, PPG_CUTS, sevOfCuts } from '../engine/pressure-cuts.js?v=0cfa0c573a';
import { pressureColor } from './colormap.js?v=2227a56f90';
import { ownsSideways, pageGo } from './swipe.js?v=d2a811fd2d';
import { frameFor } from './frame.js?v=26e2e46fff';
import { restPass } from './rest-pass.js?v=ed71462b47';
import { classSoon, removeSoon } from './class-soon.js?v=6ad82f25a8';
import { slideFold } from './fold-slide.js?v=1b10231dcf';
import { leaveFromHere, menuLeaveOff } from './menu-leave.js?v=0557b9a306';
import { releaseSpeed, carryCurve, D_FLIP, D_SMALL, EASE_ARRIVE, RISE_PX } from './ease.js?v=7513a88c68';
const nextFrame = frameFor('menu');
const profFrame = frameFor('menu-profile');
// The hover preview's change of size and place runs without layout per frame: the card is laid out once at the taller of its old
// and new heights, a clip (with the card's own round foot) eases from the old height to the new, and a move to a new row eases
// by transform from where it stood; the card takes its new height once it has landed. (No height or top is ever eased: the old
// ?pvglide=0 path, which did, is gone, 1 Nov: nothing laid out in motion.)

// Where each group's resistance sits along the pathway from the gut to the heart.
const GROUP_WHERE = { Normal: 'No added resistance', 'Pre-hepatic': 'Before the liver', Presinusoidal: 'In the portal tracts', Sinusoidal: 'In the sinusoids', Postsinusoidal: 'At the central veins', 'Post-hepatic': 'Hepatic veins and IVC', Cardiac: 'The right heart' };

// A patient's pressure profile from the gut to the right atrium (a hydraulic grade line): blood runs
// downhill, and the steepest fall is where the resistance sits. Drawn by the GPU (trace-gl.js; 1 Nov 2026, move everything to GPU):
// a canvas the box is laid out in, with the GPU's own canvas over it, never an SVG. A few of them are kept and handed out in turn, so the
// old preview fading out keeps its curve while the new one draws (each holds one small WebGL context). ?tracegl=0: drawn on the canvas.
const PROFS = [];
function profile(snap) {
  let pr = PROFS.find((q) => !q.box.isConnected || q.box.closest('.um-pv-old'));
  if (pr && pr.box.isConnected) pr = PROFS.find((q) => !q.box.isConnected) || (PROFS.length < 3 ? null : pr);
  if (!pr) {
    const cv = h('canvas', { class: 'hp-prof-cv', 'aria-hidden': 'true' });
    pr = { cv, box: h('div', { class: 'hp-prof', 'aria-hidden': 'true' }, cv), snap: null };
    pr.gpu = createTraceGL(cv, { redraw: () => drawProfile(pr) });
    PROFS.push(pr);
  }
  pr.box.remove();
  pr.snap = snap;
  profFrame(() => drawProfile(pr));
  return pr.box;
}
function drawProfile(pr) {
  if (!pr.box.isConnected || !pr.snap) return;
  const p = fitPen(pr.cv, pr.gpu);
  try { paintProfile(p.ctx, p.w, p.h, pr.snap); } finally { p.ctx.end?.(); }
}
function paintProfile(ctx, W, H, snap) {
  ctx.clearRect(0, 0, W, H);
  if (W < 10 || H < 10) return;
  const pad = 3, max = 30, n = snap.P.length;
  const x = (i) => pad + (i * (W - 2 * pad)) / (n - 1);
  const y = (p) => H - pad - (Math.max(0, Math.min(max, p)) / max) * (H - 2 * pad - 4);
  ctx.lineCap = 'butt'; ctx.lineWidth = 1; ctx.strokeStyle = cssVar('--grid'); ctx.setLineDash([2, 3]);
  for (const t of [10, 20]) { ctx.beginPath(); ctx.moveTo(pad, y(t)); ctx.lineTo(W - pad, y(t)); ctx.stroke(); }
  ctx.setLineDash([]);
  let drop = 0, at = 0;
  for (let i = 1; i < n; i++) { const d = snap.P[i - 1] - snap.P[i]; if (d > drop) { drop = d; at = i; } }
  ctx.globalAlpha = 0.06; ctx.fillStyle = cssVar('--accent');
  ctx.beginPath(); ctx.moveTo(x(0), H - pad); snap.P.forEach((p, i) => ctx.lineTo(x(i), y(p))); ctx.lineTo(x(n - 1), H - pad); ctx.closePath(); ctx.fill();
  if (drop > 5) { ctx.globalAlpha = 0.08; ctx.fillStyle = cssVar('--danger'); ctx.beginPath(); ctx.roundRect(x(at - 1), pad - 2, x(at) - x(at - 1), H - 2 * pad + 2, 3); ctx.fill(); }
  ctx.globalAlpha = 1; ctx.lineCap = 'round';
  for (let i = 1; i < n; i++) {
    ctx.lineWidth = i === at && drop > 5 ? 3.2 : 2.4; ctx.strokeStyle = pressureColor((snap.P[i - 1] + snap.P[i]) / 2);
    ctx.beginPath(); ctx.moveTo(x(i - 1), y(snap.P[i - 1])); ctx.lineTo(x(i), y(snap.P[i])); ctx.stroke();
  }
  // (a surface-coloured ring under each dot keeps it clear of the line)
  const surface = cssVar('--surface');
  snap.P.forEach((p, i) => {
    ctx.fillStyle = surface; ctx.beginPath(); ctx.arc(x(i), y(p), 3.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pressureColor(p); ctx.beginPath(); ctx.arc(x(i), y(p), 2.1, 0, Math.PI * 2); ctx.fill();
  });
}
// The standing cut-offs: HVPG amber from 5, red from 10; PPG amber from 6, red from 12.
const sev = (cuts, v) => ({ ok: 'ok', caution: 'low', danger: 'high' })[sevOfCuts(cuts, v)];
const one = (v) => fmt(v, 1);   // (one decimal, as the tiles and the bar print the same gradients: "17.2", never "17")
function patientPreview(p) {
  const s = SNAPSHOTS[p.id], fp = s?.fp;
  return h('div', { class: 'um-pv-in pt' },
    h('span', { class: 'um-pv-meta' }, `${p.group} · ${GROUP_WHERE[p.group] || ''}`),
    h('h3', {}, p.label),
    s ? h('span', { class: 'hp-cap' }, 'Pressure, gut to right atrium (0 to 30 mmHg)') : null,   // (the curve had no words: what it plots, and its scale)
    s ? profile(s) : null,
    s ? h('span', { class: 'hp-facts' },
      h('span', { class: 'hp-chip ' + sev(HVPG_CUTS, shownOf(s.hvpg)), title: 'Hepatic venous pressure gradient' }, 'HVPG ', h('b', {}, one(s.hvpg))),
      fp?.ppg != null ? h('span', { class: 'hp-chip ' + sev(PPG_CUTS, shownOf(fp.ppg)), title: 'Portal pressure gradient (portal vein − IVC)' }, 'PPG ', h('b', {}, one(fp.ppg))) : null,
      h('span', { class: 'hp-chip', title: 'Portal vein pressure' }, 'PV ', h('b', {}, fmt(s.pv, 1))),
      s.pvFlow < -0.05 ? h('span', { class: 'hp-chip rev', title: 'Portal flow runs away from the liver' }, 'Hepatofugal') : null) : null,
    h('p', {}, p.summary || ''));
}

// Search: every word typed must appear somewhere in the row's words (case, accents, spaces and hyphens ignored).
const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
const matches = (hay, words) => words.every((w) => hay.includes(w));

export function createMenu({ anchor, library, libraryNow, onPreset, share, help, onToggle }) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const sheetMQ = matchMedia(PHONE_MQ);
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  let el = null, back = null, pv = null, coldOpen = false, open = false, leaveT = 0, hoverT = 0, hideT = 0, pvKey = null, pvTok = 0, mark = null, query = '', tab = 'present';

  const close = (o = {}) => {
    if (!open) return;
    open = false; clearTimeout(hoverT); hidePreview(true);
    anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    removeEventListener('keydown', typed, true);
    removeEventListener('resize', place);
    vv?.removeEventListener('resize', fitSheet); vv?.removeEventListener('scroll', fitSheet);
    const panel = el, scrim = back, done = () => { leaveT = 0; panel.remove(); scrim?.remove(); };
    el = back = null;
    onToggle?.(false);
    if (panel.contains(document.activeElement) || !document.activeElement || document.activeElement === document.body) anchor.focus({ preventScroll: true });
    // (With Reduce Motion the same exit only fades: app.css turns the keyframes into fades.)
    if (scrim) leaveFromHere(scrim, () => scrim.classList.add('out'));
    // (Pulled down: it carries on down from where the finger let go. Upright, the shared sheet swipe is already sinking it; the
    // popover on a sideways iPad has no bottom edge to leave by, so it fades as it goes.)
    const sheet = panel.classList.contains('sheet');
    if (o.dragged && !reduce.matches) {
      if (!document.documentElement.classList.contains('thumb-ui') || !sheet) {
        panel.style.transition = sheet ? `transform ${D_SMALL}ms var(--ease)` : `transform ${D_SMALL}ms var(--ease), opacity ${D_SMALL}ms var(--ease)`;
        panel.style.transform = 'translateY(100%)';
        if (!sheet) panel.style.opacity = '0';
      }
    } else leaveFromHere(panel, () => panel.classList.add('out'));
    // (Inert from the first frame of its exit, as the popovers are; a menu opened again before it has gone leaves it fading, below.)
    if (!menuLeaveOff(location.search)) panel.inert = true;
    leaveT = setTimeout(done, sheet || o.dragged ? D_SMALL : D_FLIP);
  };
  // Typing while the menu is open (and focus is elsewhere) goes to its search.
  const typed = (e) => {
    if (!el || el.contains(e.target) || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1 || e.key === ' ' || e.target.closest?.('input, textarea, select, [contenteditable], #modalBack')) return;   // (a question over the menu keeps its own keys)
    el.querySelector('.um-q').focus();
  };
  const outside = (e) => { if (el && !el.contains(e.target) && !pv?.contains(e.target) && !anchor.contains(e.target) && !e.target.closest?.('#modalBack')) close(); };   // (a question opened from a row, Delete script or a name, is answered with the menu still open behind it)

  // ── Rows ──
  // A deck's level as a short muted word (Foundation, Core, Advanced), not a row of pips.
  const levelWord = (lv, levels) => h('span', { class: 'um-m um-lv' }, levels[lv] || '');
  // A deck left part way through (resume.js) opens where it was left: its row says "Resume 7 / 12" in place of its minutes.
  const resumeOf = (d, lib, script) => (script || lib.current() === d.id ? null : lib.resumeAt?.(d) ?? null);
  function deckRow(d, lib, script) {
    const r = resumeOf(d, lib, script);
    const row = h('button', { class: 'um-row', 'data-k': (script ? 's:' : 'd:') + d.id, 'aria-current': lib.current() === d.id ? 'true' : null, onclick: () => { close(); lib.start(d.id, r?.at ?? 0); } },
      svgIcon('play', 'um-play'), h('span', { class: 'um-t' }, script ? d.title : d.short || d.title),
      script ? h('span', { class: 'um-m' }, `${(d.steps || d.deck.slides).length} slides`) : levelWord(d.level, lib.levels),
      script ? null : r ? h('span', { class: 'um-m um-res' }, `Resume ${r.at + 1} / ${r.n}`) : h('span', { class: 'um-m' }, `${d.minutes} min`));
    row.dataset.find = fold([d.title, d.short, script ? 'script' : ''].join(' ')); row.dataset.more = fold(d.summary);
    const info = h('button', { class: 'um-info', 'aria-label': `About ${d.short || d.title}`, 'aria-expanded': 'false', onclick: () => toggleInline(li, () => (script ? scriptPreview(d, lib) : deckPreview(d, lib)), info) }, icon('info'));
    const li = h('li', {}, row, info);
    hoverable(row, () => (script ? scriptPreview(d, lib) : deckPreview(d, lib)), 'present');
    if (mark && mark === d.id) li.classList.add('um-new');
    return li;
  }
  function patientRow(p, cur) {
    const row = h('button', { class: 'um-row', 'data-k': 'p:' + p.id, 'aria-current': p.id === cur ? 'true' : null, onclick: () => { close(); if (p.id !== store.get().presetId || store.get().mode !== 'explore') onPreset(p.id); } },
      h('span', { class: 'um-t' }, p.label), p.id === cur ? svgIcon('check', 'um-check') : null);
    row.dataset.find = fold([p.label, p.group, GROUP_WHERE[p.group], p.id].join(' ')); row.dataset.more = fold(p.summary);
    hoverable(row, () => patientPreview(p), 'patients');
    // On touch (iPad, iPhone) there is no hover: the ⓘ opens the same preview under the row, as the decks' rows do.
    const info = h('button', { class: 'um-info', 'aria-label': `About ${p.label}`, 'aria-expanded': 'false', onclick: () => toggleInline(li, () => patientPreview(p), info) }, icon('info'));
    const li = h('li', {}, row, info);
    return li;
  }
  const deckPreview = (d, lib, r = resumeOf(d, lib)) => h('div', { class: 'um-pv-in pt' },
    h('span', { class: 'um-pv-meta' }, `${lib.levels[d.level] || ''} · ${d.slides.length + 1} slides · ${d.minutes} min`),
    h('h3', {}, d.title), h('p', {}, d.summary || ''),
    d.objectives?.length ? h('ul', {}, d.objectives.map((o) => h('li', {}, o))) : null,
    h('div', { class: 'um-acts' },
      r ? h('button', { class: 'btn sm primary', onclick: () => { close(); lib.start(d.id, r.at); } }, svgIcon('play', 'mi-ic'), `Resume ${r.at + 1} / ${r.n}`) : null,
      h('button', { class: r ? 'btn sm' : 'btn sm primary', onclick: () => { close(); lib.start(d.id); } }, svgIcon('play', 'mi-ic'), r ? 'From the start' : 'Present'),
      h('button', { class: 'btn ghost sm', onclick: () => lib.shareDeck(d) }, svgIcon('share', 'mi-ic'), 'Copy link'),
      h('button', { class: 'btn ghost sm', title: 'Speaker notes and questions for the room, one row per slide', onclick: () => lib.notes(d) }, svgIcon('print', 'mi-ic'), 'Print notes')));
  const scriptPreview = (s, lib) => h('div', { class: 'um-pv-in' },
    h('span', { class: 'um-pv-meta' }, `${s.test ? 'Test deck, preview only' : s.deck ? 'Your deck' : 'Your script'} · ${(s.steps || s.deck.slides).length} slides`),
    h('h3', {}, s.title), h('p', {}, s.summary || ''),
    h('div', { class: 'um-acts' },
      h('button', { class: 'btn sm primary', onclick: () => { close(); lib.start(s.id); } }, svgIcon('play', 'mi-ic'), 'Present'),
      s.deck ? null : h('button', { class: 'btn sm', onclick: () => lib.addStep(s.id) }, 'Add current state'),
      h('button', { class: 'btn ghost sm', onclick: () => lib.shareScript(s) }, 'Share link'),
      h('button', { class: 'btn ghost sm', onclick: () => lib.exportScript(s) }, 'Export'),
      h('button', { class: 'btn ghost sm', onclick: () => lib.scriptNotes(s) }, 'Print notes'),
      s.test ? null : h('button', { class: 'btn ghost sm', onclick: () => lib.remove(s.id) }, 'Delete')));

  // ── Preview beside the panel (mouse) ──
  function hoverable(row, make, col) {
    const want = () => { if (!fine.matches || sheetMQ.matches) return; clearTimeout(hideT); clearTimeout(hoverT); hoverT = setTimeout(() => showPreview(row, make, col), pv?.classList.contains('on') ? 120 : 300); };
    row.addEventListener('pointerenter', want);
    row.addEventListener('focus', () => { if (row.matches(':focus-visible')) want(); });
    row.addEventListener('pointerleave', () => { clearTimeout(hoverT); hideT = setTimeout(() => hidePreview(), 220); });
  }
  // (The card is measured and placed between frames (rest-pass.js), never inside the hover timer; a newer hover or a hide drops the older ask.)
  function showPreview(row, make, col) {
    const tok = ++pvTok;
    restPass(() => { if (tok === pvTok) placePreview(row, make, col); });
  }
  function placePreview(row, make, col) {
    if (!el || !row.isConnected) return;
    if (!pv) {
      // (The words sit in a cut of their own, kept for the card's life: a change of height reveals or hides them by two opposite
      // translates, the cut's and its contents', never by a clip-path, so it is the compositor's.)
      pv = h('div', { class: 'um-pv', role: 'region', 'aria-label': 'Preview' }, h('div', { class: 'um-pv-cut' }, h('div', { class: 'um-pv-cutin' })));
      pv._in = pv.firstChild.firstChild;
      pv.addEventListener('pointerenter', () => clearTimeout(hideT));
      pv.addEventListener('pointerleave', () => { hideT = setTimeout(() => hidePreview(), 220); });
      document.body.append(pv);
    }
    const key = row.dataset.k;
    if (pvKey !== key) {
      // Crossfade: the old content fades out over the new, and the card eases to the new height.
      pvKey = key;
      const old = pv._in.firstElementChild, h0 = pv._h1 || pv.offsetHeight;
      const next = make();
      if (old && pv.classList.contains('on')) { classSoon(old, 'um-pv-old', true); setTimeout(() => removeSoon(old), 130); } else old?.remove();
      pv._in.append(next);
      if (old && h0 && !reduce.matches) pvResize(pv, h0, next.offsetHeight);
      $$rows().forEach((r) => classSoon(r, 'pv-on', r === row));
    }
    // Beside the panel, level with the row; over the other column when there is no room beside it.
    const pr = el.getBoundingClientRect(), rr = row.getBoundingClientRect(), w = 360, ph = pv._h1 || pv.offsetHeight;
    let x = pr.right + 8;
    if (x + w > innerWidth - 8) x = Math.max(8, innerWidth - w - 8);   // (no room beside the panel: over its right edge)
    const y = clamp(rr.top - 40, 8, visibleBottom() - ph - 8);
    {
      // (A card already on show glides by transform from where it is drawn now to its new place; its place is a transform.)
      const was = pv.classList.contains('on') ? pv._y : null;
      let from = null;
      if (was != null && Math.abs(was - y) >= 1 && !reduce.matches && pv.animate) {
        // (Where it is drawn now: the running glide's place, else where it stood.)
        from = pv._move?.effect ? (new DOMMatrixReadOnly(getComputedStyle(pv).transform).m42 || was) : was;
        pv._move?.cancel();
      }
      pv._y = y;
      // (left and top are never written, so nothing is laid out.)
      pv.style.transform = `translate(${x}px, ${y}px)`;
      if (from != null) pv._move = pv.animate([{ transform: `translate(${x}px, ${from}px)` }, { transform: `translate(${x}px, ${y}px)` }], { duration: D_FLIP, easing: EASE_ARRIVE });
    }
    classSoon(pv, 'on', true);
  }
  // The card is laid out once at the taller height H for the change. Its glass moves onto three plates that ride
  // transform only: the top (still, the shorter height p), a flat middle that scales down from it, and the round foot that slides
  // from the old height to the new; the words are cut at the foot by a clip. At the landing the card takes its new height and its
  // own glass back, the same size it is drawn, so nothing moves.
  function pvResize(card, h0, h1) {
    card._size?.();
    const H = Math.max(h0, h1), p = Math.min(h0, h1);
    const R = parseFloat(getComputedStyle(card).borderBottomLeftRadius) || 0, capH = Math.ceil(2 * R + 2);
    if (H - p < 1 || p < 3 * R + 4) { card.style.height = ''; return; }
    card.style.height = H + 'px'; card._h1 = h1;
    classSoon(card, 'pv-resizing', true);
    // (each plate's clip and square corners are CSS, by its class: um-pv-plate-foot / -mid; nothing painted is written here)
    const plate = (top, height, kind) => {
      const d = h('i', { class: 'um-pv-plate ' + kind, 'aria-hidden': 'true' });
      Object.assign(d.style, { top: `${top}px`, height: `${height}px`, transformOrigin: '50% 0' });
      card.prepend(d); return d;
    };
    const foot = plate(0, capH, 'um-pv-plate-foot');
    const mid = plate(p - R, H - p, 'um-pv-plate-mid');
    const top = plate(0, p, 'um-pv-plate-top');
    card.prepend(top, mid, foot);   // (top under the middle, the foot over both)
    const t = { duration: D_FLIP, easing: EASE_ARRIVE, fill: 'forwards' };
    const anims = [
      foot.animate([{ translate: `0px ${h0 - capH}px` }, { translate: `0px ${h1 - capH}px` }], t),
      mid.animate([{ scale: `1 ${(h0 - p) / (H - p)}` }, { scale: `1 ${(h1 - p) / (H - p)}` }], t),
    ];
    // (the words, old and new, cut at the foot: they never show past the card's glass. The cut, H tall, rides up by what is
    // below the foot and its contents ride down by as much, so the words stand still and only the cut's edge moves.)
    const cut = card.querySelector(':scope > .um-pv-cut');
    if (cut && card._in) {
      cut.style.height = H + 'px';
      anims.push(cut.animate([{ translate: `0px ${h0 - H}px` }, { translate: `0px ${h1 - H}px` }], t),
        card._in.animate([{ translate: `0px ${H - h0}px` }, { translate: `0px ${H - h1}px` }], t));
    }
    let over = false;
    const done = () => {
      if (over) return; over = true;
      for (const x of anims) x.cancel();
      top.remove(); mid.remove(); foot.remove();
      if (cut) cut.style.height = '';
      classSoon(card, 'pv-resizing', false); card._h1 = 0; card.style.height = '';
      if (card._size === done) card._size = null;
    };
    card._size = done;
    anims[0].onfinish = done;
    setTimeout(done, D_FLIP + 120);   // (a page whose frames stall still lands)
  }
  function hidePreview(now) {
    clearTimeout(hideT); pvTok++; if (!pv) return;
    const p = pv; pv = null; pvKey = null;
    el?.querySelectorAll('.pv-on').forEach((r) => classSoon(r, 'pv-on', false));
    if (now || !p.classList.contains('on')) { p.remove(); return; }
    classSoon(p, 'on', false); setTimeout(() => removeSoon(p), 140);
  }
  // On touch, the ⓘ opens the preview under its row (one at a time), easing open and shut.
  function toggleInline(li, make, btn) {
    const was = li.querySelector('.um-inline');
    // (It slides down out from under its row and the rows below with it, by transform, and back up shutting: fold-slide.js. No height eased.)
    const fold = (box, item, open, set) => slideFold({ item, inner: box.firstElementChild, root: item.closest('.um-col') || el, open, set, ms: D_SMALL });
    el.querySelectorAll('.um-inline').forEach((x) => { x.previousElementSibling?.setAttribute('aria-expanded', 'false'); const gone = x; fold(gone, gone.parentElement, false, (v) => { gone.classList.toggle('on', v); if (!v) gone.remove(); }); });
    if (was) return;
    const box = h('div', { class: 'um-inline' }, h('div', {}, make()));
    li.append(box); btn.setAttribute('aria-expanded', 'true');
    fold(box, li, true, (v) => box.classList.toggle('on', v));
    // (A row near the foot of the list opened its preview below the fold: once the preview has slid open, the row and its preview scroll
    // into view, clear of the footer.)
    setTimeout(() => restPass(scrollRow), reduce.matches ? 0 : D_SMALL + 30);   // (scrolled between frames: scrollIntoView lays the page out)
    function scrollRow() { if (box.isConnected && box.classList.contains('on')) li.scrollIntoView({ block: 'nearest', behavior: reduce.matches ? 'auto' : 'smooth' }); }
  }
  const $$rows = () => (el ? [...el.querySelectorAll('.um-row')] : []);

  // ── Panel ──
  function build(lib) {
    const st = store.get(), cur = st.presetId;
    const groups = {};
    for (const p of st.presetList || []) (groups[p.group] ||= []).push(p);
    const patients = h('section', { class: 'um-col', 'data-col': 'patients' },
      Object.entries(groups).map(([g, ps]) => h('div', { class: 'um-g' },
        h('div', { class: 'um-gl', id: 'umg-' + g }, h('b', {}, g), h('span', {}, GROUP_WHERE[g] || '')),
        h('ul', { 'aria-labelledby': 'umg-' + g }, ps.map((p) => patientRow(p, cur))))));
    let present;
    if (!lib) present = h('section', { class: 'um-col', 'data-col': 'present' }, h('p', { class: 'um-note um-wait' }, 'Loading…'));   // (the note shows only if the wait runs past 0.4 s: a quick fill shows no flash of it)
    else {
      const mine = lib.mine;
      present = h('section', { class: 'um-col', 'data-col': 'present' },
        lib.topics.map(([k, name, list]) => h('div', { class: 'um-g' },
          h('div', { class: 'um-gl', id: 'umt-' + k }, h('b', {}, name)),
          h('ul', { 'aria-labelledby': 'umt-' + k }, list.map(([id]) => lib.decks.find((d) => d.id === id)).filter(Boolean).map((d) => deckRow(d, lib)))),
        ),
        lib.testing?.length ? h('div', { class: 'um-g' },
          h('div', { class: 'um-gl', id: 'umt-testing' }, h('b', {}, 'Testing')),
          h('ul', { 'aria-labelledby': 'umt-testing' }, lib.testing.map((s) => deckRow(s, lib, true)))) : null,
        h('div', { class: 'um-g scripts' },
          h('div', { class: 'um-gl', id: 'umt-mine' }, h('b', {}, 'Your scripts'),
            h('span', { class: 'um-gacts' },
              h('button', { class: 'um-link', title: 'A new script from the current model', onclick: () => lib.newScript() }, icon('plus'), h('span', {}, 'New')),
              h('button', { class: 'um-link', title: 'Import a deck file or a script', onclick: () => lib.importFile() }, icon('download'), h('span', {}, 'Import')))),
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
      h('div', { class: 'um-tabs', role: 'tablist', 'aria-label': 'Menu' },
        [['present', 'Present', 'projector'], ['patients', 'Patients', 'scenario']].map(([k, label, ic]) => h('button', { class: 'um-tab', role: 'tab', id: 'umtab-' + k, 'data-tab': k,
          'aria-selected': String(tab === k), 'aria-controls': 'umcol-' + k, onclick: () => setTab(k, true) }, svgIcon(ic, 'um-hi'), h('span', {}, label)))),
      h('div', { class: 'um-cols' }, present, patients),
      h('p', { class: 'um-empty', hidden: true }, h('span', {}), h('button', { class: 'um-link um-other', hidden: true, onclick: () => setTab(tab === 'present' ? 'patients' : 'present', true) })),
      h('footer', { class: 'um-foot' },
        h('button', { class: 'um-link', onclick: () => { close(); share(); } }, icon('share'), h('span', {}, 'Copy link to this view')),
        h('button', { class: 'um-link', onclick: () => { close(); help(anchor); } }, icon('help'), h('span', {}, 'Help')),
        h('span', { class: 'um-esc' }, 'Esc closes')));
    panel.dataset.tab = tab;
    for (const c of panel.querySelectorAll('.um-col')) { c.id = 'umcol-' + c.dataset.col; c.setAttribute('role', 'tabpanel'); c.setAttribute('aria-labelledby', 'umtab-' + c.dataset.col); }
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
    // The search runs in both tabs; with no match in this one, the empty note points to the other's matches.
    const count = (k) => el.querySelectorAll(`.um-col[data-col="${k}"] .um-g:not([hidden]) li:not([hidden])`).length;
    const other = tab === 'present' ? 'patients' : 'present', here = count(tab), there = count(other);
    const note = el.querySelector('.um-empty'), go = note.querySelector('.um-other');
    note.hidden = !words.length || here > 0;
    note.firstChild.textContent = tab === 'present' ? 'No presentation matches.' : 'No patient matches.';
    go.hidden = !there;
    go.textContent = there ? `${there} ${other === 'patients' ? (there === 1 ? 'patient matches' : 'patients match') : (there === 1 ? 'presentation matches' : 'presentations match')} ›` : '';
    el.classList.toggle('filtered', !!words.length && any);
    // The list fades at its bottom while more rows sit below, instead of being cut at the footer's line.
    for (const sc of el.querySelectorAll('.um-cols, .um-col')) (fades.get(sc) || fades.set(sc, fadeWhileMore(sc)).get(sc))();
  }
  const fades = new WeakMap();
  // Switching tabs eases the new list in; the panel keeps its size.
  // (still: the list was swiped into place, so it does not play its entrance again.)
  function setTab(k, focus, still) {
    tab = k;
    if (!el) return;
    el.dataset.tab = k;
    for (const b of el.querySelectorAll('.um-tab')) b.setAttribute('aria-selected', String(b.dataset.tab === k));
    hidePreview();
    const col = el.querySelector(`.um-col[data-col="${k}"]`);
    if (still) col.classList.remove('um-in');
    else if (!reduce.matches) { col.classList.remove('um-in'); void col.offsetWidth; col.classList.add('um-in'); }
    filter();
    if (focus) el.querySelector(`#umtab-${k}`)?.focus({ preventScroll: true });
  }
  // Up and Down move within a column, Left and Right switch columns, typing goes to search, Enter in
  // search opens the first match, Esc clears the search and then closes.
  function keys(e) {
    if (e.isComposing || e.keyCode === 229) return;   // (an input method is composing in the search: its Enter and Esc are its own)
    const q = el.querySelector('.um-q');
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (e.target === q && q.value) { q.value = ''; query = ''; filter(); } else close(); return; }
    const act = () => visible(el.querySelector(`.um-col[data-col="${tab}"]`));
    if (e.target === q) {
      if (e.key === 'Enter') { e.preventDefault(); act()[0]?.click(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); act()[0]?.focus(); }
      return;
    }
    if (e.target.classList?.contains('um-tab') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); setTab(tab === 'present' ? 'patients' : 'present', true); return; }
    const row = e.target.closest?.('.um-row');
    if (row && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const list = visible(row.closest('.um-col')), i = list.indexOf(row);
      if (e.key === 'ArrowUp' && i === 0) q.focus(); else list[clamp(i + (e.key === 'ArrowDown' ? 1 : -1), 0, list.length - 1)]?.focus();
    } else if (row && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      setTab(tab === 'present' ? 'patients' : 'present');
      visible(el.querySelector(`.um-col[data-col="${tab}"]`))[0]?.focus();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ') q.focus();
  }
  const visible = (col = el) => [...col.querySelectorAll('li:not([hidden]) > .um-row')].filter((r) => !r.closest('.um-g[hidden]'));

  // On an iPhone or an iPad held upright the on-screen keyboard covers the foot of the page without shrinking it, and the sheet sits at the page's
  // foot: its last rows could not be scrolled above the keyboard. The sheet is lifted to sit on the keyboard and held to the room above it (the
  // search card does the same, palette.js fitList). Off, it is as it was: no variable is set.
  const vv = window.visualViewport;
  function fitSheet() {
    if (!el || !el.classList.contains('sheet') || !vv) return;
    // (The visual viewport's own offset and height: the keyboard's room, not a layout read of the page.)
    const { offsetTop: vvTop, height: vvH } = vv, kb = Math.round(innerHeight - vvTop - vvH);
    // (No floor under the room: a floor above it put a phone held sideways' search row above the screen. With under 300 px the handle and
    // the footer give way, `kb-tight`, so the search row and some results stay in view.)
    if (kb > 80) { const room = Math.round(vvH - 16); el.style.setProperty('--menu-kb', `${kb}px`); el.style.setProperty('--menu-h', `${room}px`); classSoon(el, 'kb-tight', room < 300); }
    else { el.style.removeProperty('--menu-kb'); el.style.removeProperty('--menu-h'); classSoon(el, 'kb-tight', false); }
    sheetLiftSoon();
  }
  // The lift onto the keyboard and back eases by transform from where the sheet's top stood (its box takes the new bottom and height at
  // once; no bottom or height is eased, 1 Nov: nothing laid out in motion). The top is read between frames (rest-pass.js), never in the
  // viewport's scroll; offsetTop leaves out a transform still running.
  let liftAsk = 0;
  function sheetLiftSoon() { if (!liftAsk) liftAsk = restPass(sheetLift); }
  function sheetLift() {
    liftAsk = 0;
    if (!el || !el.classList.contains('sheet')) return;
    const t = el.offsetTop, was = el._top;
    el._top = t;
    if (was == null || Math.abs(was - t) < 1 || reduce.matches || !el.animate) return;
    el._lift?.cancel();
    el._lift = el.animate([{ transform: `translateY(${(was - t).toFixed(1)}px)` }, { transform: 'none' }], { duration: D_SMALL, easing: EASE_ARRIVE, composite: 'add' });
  }
  function place() {
    if (!el || el.classList.contains('sheet')) return;
    const r = anchor.getBoundingClientRect();
    const left = clamp(r.left, 12, Math.max(12, innerWidth - el.offsetWidth - 12)), top = r.bottom + 8;
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    // It settles from, and leaves toward, the button's centre, as every other popover does (it had grown from its own top-left corner).
    if (!menuLeaveOff(location.search)) settleFrom(el, r, left, top);
  }
  // The panel opens with its groups rising into place one after another, 30 ms apart, over the panel's own entrance:
  // the eye reads it top down instead of seeing the whole list land at once. Only the first few in sight, so a long list
  // never waits on its tail; transform and opacity only, and Reduce Motion keeps the panel's plain fade.
  // (A cold open draws the panel again once the talks arrive: the new groups carry on from where the old ones were, by the time since the open.)
  let openAt = -1e9;
  function groupsIn(panel) {
    const since = performance.now() - openAt;
    if (reduce.matches || !panel.animate || since > 40 + 5 * 30 + D_SMALL) return;
    const col = panel.querySelector(`.um-col[data-col="${tab}"]`) || panel.querySelector('.um-col');
    const gs = [...(col?.children || [])].filter((g) => g.classList.contains('um-g') && g.getClientRects().length).slice(0, 6);
    gs.forEach((g, i) => g.animate([{ opacity: 0, transform: `translateY(${RISE_PX}px)` }, { opacity: 1, transform: 'none' }],
      { duration: D_SMALL, easing: EASE_ARRIVE, delay: 40 + i * 30 - since, fill: 'backwards' }));
  }
  function render() {
    if (!el) return;
    const lib = libraryNow(), keep = el.querySelector('.um-cols')?.scrollTop, focus = document.activeElement?.classList.contains('um-q') ? 'q' : document.activeElement?.dataset?.k, sheet = el.classList.contains('sheet');
    const next = build(lib);
    if (sheet) next.classList.add('sheet');
    next.classList.add('still');
    // A first open before the presentations had arrived: the frame and the Patients list were already up; the presentations now rise into place (the tab change's own 4 px fade-rise) instead of replacing the note at once.
    if (coldOpen && lib) { coldOpen = false; if (!reduce.matches) next.querySelector('.um-col[data-col="present"]')?.classList.add('um-in'); }
    else if (!lib) coldOpen = true;
    for (const v of ['--menu-kb', '--menu-h']) { const x = el.style.getPropertyValue(v); if (x) next.style.setProperty(v, x); }   // (the keyboard is still up)
    next.classList.toggle('kb-tight', el.classList.contains('kb-tight'));
    el.replaceWith(next); el = next;
    filter(); place(); groupsIn(el); dragToClose(el); swipeTabs(el);
    if (keep) el.querySelector('.um-cols').scrollTop = keep;
    if (focus === 'q') el.querySelector('.um-q').focus({ preventScroll: true });
    else if (focus) el.querySelector(`[data-k="${CSS.escape(focus)}"]`)?.focus({ preventScroll: true });
    if (!lib) library().then(() => { if (open && !libraryNow()) return; render(); }).catch(() => {});   // (a part that cannot load has said so: util.js loadFailed)
  }

  // (The talks asked for a frame after the menu's frame is up, in a task of their own; drawn into the menu when they arrive.)
  function libraryArrived() { if (open) render(); scrollOpen?.(); }
  function askLibrary() { setTimeout(() => library().then(libraryArrived).catch(() => {}), 0); }
  let scrollOpen = null;
  return {
    // section: 'present' | 'patients' | 'scripts' (scrolled into view); opts.mark: a script id to highlight;
    // opts.query: words to start the search with (a mistyped ?preset= link).
    open(section, opts = {}) {
      // A menu opened again while the last is still fading leaves it to finish (it is inert, and its own timer removes it) under the new one,
      // instead of snapping it away: that was a pop. ?menuleave=0: removed at once, as before.
      if (leaveT && menuLeaveOff(location.search)) { clearTimeout(leaveT); leaveT = 0; document.querySelectorAll('.umenu.out, .um-scrim.out').forEach((x) => x.remove()); }
      mark = opts.mark || null;
      if (section) setTab(section === 'patients' ? 'patients' : 'present');
      if (!open) {
        open = true; query = opts.query || '';
        const sheet = sheetMQ.matches, lib = libraryNow();
        el = build(lib); coldOpen = !lib;
        if (sheet) { el.classList.add('sheet'); back = h('div', { class: 'um-scrim', onclick: () => close() }); document.body.append(back); }
        document.body.append(el);
        openAt = performance.now(); place(); filter(); groupsIn(el);
        anchor.setAttribute('aria-expanded', 'true');
        setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
        addEventListener('resize', place);
        vv?.addEventListener('resize', fitSheet); vv?.addEventListener('scroll', fitSheet);
        if (sheet) { el._top = null; sheetLiftSoon(); }   // (where the sheet's top rests as it opens: the first lift eases from there)
        addEventListener('keydown', typed, true);
        onToggle?.(true, sheet);
        // Only a mouse or trackpad puts the caret in the search: on a touch screen (iPhone, iPad either way round)
        // focusing it pops the on-screen keyboard, so the close button takes focus and the keyboard waits for a tap there.
        el.querySelector(sheet || !fine.matches ? '.um-x' : '.um-q').focus({ preventScroll: true });
        // (The talks' code is asked for once the menu's frame is on screen, not in the tap: arriving at once from the cache, its
        // evaluation, a large module, ran before that frame and held it (cold menu 1.9 s on CI's phone profile).)
        if (!lib) nextFrame(askLibrary);
        dragToClose(el); swipeTabs(el);
      }
      const scrollTo = () => {
        if (!el) return;
        if (section === 'scripts') el.querySelector('.um-g.scripts')?.scrollIntoView({ block: 'start', behavior: reduce.matches ? 'auto' : 'smooth' });
        else el.querySelector(`.um-col[data-col="${tab}"] .um-row[aria-current="true"]`)?.scrollIntoView({ block: 'nearest' });
      };
      scrollOpen = scrollTo;
      // (2 Nov 2026: scrolled between frames (rest-pass.js), not inside one: scrollIntoView lays the page out.)
      nextFrame(() => restPass(scrollTo));
    },
    close,
    toggle(section) { if (open) close(); else this.open(section); },
    isOpen: () => open,
    render,
  };

  // On a touch screen the menu follows a drag down from anywhere on it (the shared sheet swipe, as the phone's cards do) and
  // closes past a short pull or a quick flick; a short one eases back. Touch events only, so a mouse still just clicks.
  function dragToClose(panel) {
    swipeSheet(panel, () => close({ dragged: true }));
  }
  // A sideways drag pages between Present and Patients, as the Tests card pages between its tabs (dock.js): the open list
  // follows the finger with the other beside it, and on release eases on to it (past a third of the way, or after a quick
  // flick) or back. Past either end it gives a little and springs back. A vertical move stays the list's scroll or the pull
  // down; the search box keeps its own drags, and a tap is still a tap.
  function swipeTabs(panel) {
    const cols = panel.querySelector('.um-cols'), TABS = ['present', 'patients'];
    const colOf = (k) => cols.querySelector(`.um-col[data-col="${k}"]`);
    // (A list off its peer role: its transform and class only, in the move; its top and height, set at the touch, are cleared once it has landed.)
    const unpeer = (els) => { for (const e of els) if (e) { e.style.transform = ''; e.style.transition = ''; classSoon(e, 'um-peer', false); } };
    const clear = (els) => { unpeer(els); for (const e of els) if (e) { e.style.top = ''; e.style.height = ''; } };
    let sw = null, settle = null, resting = null;   // settle: the last swipe's switch, while its lists are still easing; resting: the list that lands (it is still drawn off its place)
    // (The other list's place over the room in view, as read at the touch: written once, as it becomes the peer.)
    function placePeer(nb, s) { nb.style.setProperty('top', `${s.top}px`); nb.style.setProperty('height', `${s.h}px`); }
    const shiftX = (el) => { try { const m = getComputedStyle(el).transform; return !m || m === 'none' ? 0 : new DOMMatrixReadOnly(m).m41 || 0; } catch { return 0; } };
    panel.addEventListener('touchstart', (e) => {
      // (A second swipe before the first has settled finishes the first once it moves, not on the touch: a tap leaves the lists easing.)
      sw = e.touches.length === 1 && !ownsSideways(e.target, { stop: panel }) ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now(), on: false, dx: 0 } : null;
      // Everything the drag needs from the page is read here, at the touch, never as the finger moves: the lists' width, the room in
      // view (where the other list shows from), and where an easing list is drawn now.
      if (sw) {
        sw.w = cols.clientWidth; sw.top = cols.scrollTop; sw.h = cols.clientHeight;
        sw.carry0 = resting && settle ? shiftX(resting) : 0;
        // (The list beside this one is put over the room in view now, while it is hidden: as the drag reaches for it, only its class changes.)
        sw.peers = TABS.filter((k) => k !== tab).map(colOf).filter((c) => c && c !== resting);
        for (const c of sw.peers) placePeer(c, sw);
      }
    }, { passive: true });
    panel.addEventListener('touchmove', (e) => {
      if (!sw) return;
      if (e.touches.length !== 1) { endSwipe(); return; }
      const t = e.touches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y;
      if (!sw.on) {
        if (Math.hypot(dx, dy) < 8) return;
        if (Math.abs(dx) < Math.abs(dy) * 1.2) { sw = null; return; }   // (vertical: the list's scroll, or the pull down)
        // (Caught while the last swipe is still easing: it is finished at once, and the pull takes the list over from where it is drawn,
        // so nothing jumps by what was left to go.)
        sw.carry = sw.carry0;
        settle?.();
        sw.on = true; sw.i = TABS.indexOf(tab); sw.cur = colOf(tab);
        if (!sw.cur) { sw = null; return; }
      }
      if (e.cancelable) e.preventDefault();
      const tdx = dx + sw.carry, d = tdx < 0 ? 1 : -1, j = sw.i + d, nb = j >= 0 && j < TABS.length ? colOf(TABS[j]) : null;
      if (nb !== sw.nb) {
        unpeer([sw.nb]); sw.nb = nb; sw.j = j;
        // (The other list shows from its own top, over the part of the list in view: it lands there. Its place was set at the touch.)
        if (nb) classSoon(nb, 'um-peer', true);
      }
      sw.dx = nb ? tdx : tdx / 3;
      (sw.trail ||= []).push([performance.now(), t.clientX]); if (sw.trail.length > 8) sw.trail.shift();
      sw.cur.style.transform = `translateX(${sw.dx}px)`;
      if (nb) nb.style.transform = `translateX(${sw.dx + d * sw.w}px)`;
    }, { passive: false });
    const endSwipe = () => {
      const s = sw; sw = null;
      if (!s?.on) return;
      const v = releaseSpeed(s.trail, performance.now());   // (the finger's, px per ms to the right: the lists carry it on)
      const go = !!s.nb && pageGo(s.dx, performance.now() - s.t, s.w, v);
      const d = s.dx < 0 ? 1 : -1, ease = `transform ${D_SMALL}ms ${carryCurve(s.nb ? v : v / 3, (go ? -d * s.w : 0) - s.dx, D_SMALL)}`;   // (past the end the list moves a third of the finger)
      s.cur.style.transition = ease; if (s.nb) s.nb.style.transition = ease;
      s.cur.style.transform = go ? `translateX(${-d * s.w}px)` : '';
      if (s.nb) s.nb.style.transform = go ? 'translateX(0)' : `translateX(${d * s.w}px)`;
      const done = () => {
        clearTimeout(timer); settle = null;
        clear([s.cur, s.nb]);
        if (go) { setTab(TABS[s.j], false, true); cols.scrollTop = 0; }
      };
      const timer = setTimeout(done, 250);
      settle = done; resting = go ? s.nb : s.cur;
    };
    // (A touch that never became a drag, a tap: the places set at the touch go, as the finger lifts.)
    const tapDone = () => { const s = sw; if (s && !s.on) for (const c of s.peers || []) if (!c.classList.contains('um-peer')) { c.style.top = ''; c.style.height = ''; } endSwipe(); };
    panel.addEventListener('touchend', tapDone, { passive: true });
    panel.addEventListener('touchcancel', tapDone, { passive: true });
  }
}
