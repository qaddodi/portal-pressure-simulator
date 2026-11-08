// Menus and popovers wear the shared GPU glass (Mohammad, 4 Nov 2026, "Use the glass for all the menus"): a menu (util.js popover), the main
// menu's panel (menu.js) and the Why? pop are regions of stage.glass.add, drawn in the figure's canvas under them: frost, tint (--gl-tint), ring
// (--gl-line) and shadow (--gl-drop) are the GPU's (app.css gives the menu's own paint up once it is drawn, [data-gl]). Where there is no figure canvas
// (no glass.add, not made yet, the GPU lost, Blur effect off) the menu keeps its CSS fill, ring and shadow (the page's, never a CSS blur).
//   glassPlate(el)  -> { leaveAlong(), dispose() }, the shape plate-gl.js's plate has, so the callers are as they were.

import { dockLine, inSheetLayer } from './sheet-layer.js';
import { frameFor } from './frame.js';

const nextFrame = frameFor('menu-glass');

let api = null;
const open = new Set();   // alloc-rare: the menus open now (one added as each opens)
const list = [], others = [], seen = new WeakSet();
let othersAt = -1e9;
let reg = null;

/** Called once with stage.glass (main.js), after the stage is made. */
export function initMenuGlass(glass) { api = glass || null; }

// A menu that is coming, going or sliding keeps its GPU glass the whole time: while any menu moves (class mg-move; a running animation or the exit
// classes) the glass is read and drawn again in every frame (its box with the menu's live transform and translate, its opacity from the animation),
// so the card goes with the words exactly. Only a clip-path (the dock menus' sink) is not followed. (Mohammad, 4 Nov 2026: the card popped while the words slid.)
const OTHERS = '.um-pv.on:not(.pv-resizing), .modal, .pal';   // (the main menu's preview card, dialogs and the search palette: found by class, they are made by script and come and go)
const MENUISH = '.menu, .umenu, .why-pop, .um-pv, .modal, .pal';
const moving = (e) => e.classList.contains('leaving') || e.classList.contains('out') || (e.getAnimations ? e.getAnimations().some((a) => a.playState !== 'finished' && a.playState !== 'idle') : false);
let raf = 0;
const movers = new Set();   // alloc-rare: the menus moving now
const tick = () => {
  raf = 0;
  for (const e of movers) if (!e.isConnected || !e.classList.contains('mg-move')) movers.delete(e);
  if (!movers.size) return;
  reg?.redraw?.();
  raf = nextFrame(tick);
};
const sync = (e) => {
  const m = moving(e);
  if (m !== e.classList.contains('mg-move')) e.classList.toggle('mg-move', m);
  if (m) { movers.add(e); if (!raf) raf = nextFrame(tick); } else movers.delete(e);
};
// The tooltip's own exit, followed as the why-pop's is, by its class and its transition events, so no present asks the page what is running on it
// (getAnimations flushes style). tipRuns: transitions and animations running on the tooltip itself (counted by their events); tipPend: frames left
// after .show leaves for the exit's first event (a transition is announced a frame or two after the class write); tipShown: .show as last seen.
// The count starts again from nothing as .show leaves, so a missed end can never keep a hidden tooltip listed.
let tipRuns = 0, tipPend = 0, tipShown = false, tipRaf = 0;
const tipTick = () => { tipRaf = 0; if (tipPend > 0) { tipPend--; if (tipPend > 0) tipRaf = nextFrame(tipTick); } reg?.redraw?.(); };
const tipStart = new Set(['animationstart', 'transitionrun']);
let listening = false;
function listen() {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  tipShown = !!document.getElementById('tooltip')?.classList.contains('show');
  for (const ev of ['animationstart', 'animationend', 'animationcancel', 'transitionrun', 'transitionend', 'transitioncancel']) {
    document.addEventListener(ev, (x) => {
      const e = x.target;
      if (e?.id === 'tooltip') { tipRuns = Math.max(0, tipRuns + (tipStart.has(ev) ? 1 : -1)); reg?.redraw?.(); return; }
      if (e?.matches?.(MENUISH)) { othersAt = -1e9; sync(e); }
    }, true);
  }
  // (A class change that starts or ends the exit (leaving, out) is seen here too, before the animation's own event.)
  new MutationObserver((rs) => {
    for (const r of rs) {
      const t = r.target;
      if (t.matches?.(MENUISH)) sync(t);
      if (t.id === 'tooltip') {
        const sh = t.classList.contains('show');
        if (tipShown && !sh) { tipRuns = 0; tipPend = 3; if (!tipRaf) tipRaf = nextFrame(tipTick); } else if (sh) tipPend = 0;
        tipShown = sh;
      }
      if (t.id === 'whyPop' || t.id === 'tooltip') reg?.redraw?.();
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
}
const live = () => {
  list.length = 0;
  for (const e of open) { if (!e.isConnected) open.delete(e); else if (!e.classList.contains('over-card')) list.push(e); }   // (a menu over its own card keeps a plain fill: main.js cardsAway)
  const t = performance.now();
  if (t - othersAt > 120) { othersAt = t; others.length = 0; for (const e of document.querySelectorAll(OTHERS)) { others.push(e); if (!seen.has(e)) { seen.add(e); own.observe(e, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] }); } } }
  for (const e of others) if (e.isConnected) list.push(e);
  // (Only while shown or leaving: a hidden why-pop (display none) and a tooltip at rest (no .show, nothing running) are not read at each
  // measure. Their class writes, and the tooltip's transition events, are seen in listen(), which asks for a redraw.)
  const why = document.getElementById('whyPop');
  if (why && (why.classList.contains('show') || why.classList.contains('leaving'))) list.push(why);
  const tip = document.getElementById('tooltip');
  if (tip && (tip.classList.contains('show') || tipRuns > 0 || tipPend > 0)) list.push(tip);   // (the tooltip's card is glass too; its words are the GPU picture of tip-gl.js; its exit is followed in listen(), nothing is read here)
  return list;
};
// The cut: a menu in the one sheet layer is never drawn below the dock's top line (sheet-layer.js; the layer's own clip, app.css), so its glass,
// drawn in the figure's canvas under the dock, is cut there too. A menu's own inset clip-path (a dock menu's sink) cuts it higher where it does.
// In client px, read with the box.
const cut = (e) => {
  const line = inSheetLayer(e) ? dockLine() : null;
  let own = null;
  const c = getComputedStyle(e).clipPath;
  if (c && c !== 'none' && c.startsWith('inset(')) {
    const t = c.slice(6, c.indexOf(')')).split(/\s+/);
    const w = t.length === 1 ? t[0] : t.length === 2 ? t[0] : t[2];
    const r = e.getBoundingClientRect();
    const bot = w.endsWith('%') ? parseFloat(w) / 100 * r.height : parseFloat(w);
    if (bot > 0) own = r.bottom - bot;
  }
  if (own == null && line == null) return null;
  return { bottom: own == null ? line : line == null ? own : Math.min(own, line) };
};
function ensure() {
  if (reg || !api?.add) return;
  // (No watch root: a subtree watch of the body measured every glass at each style or class write anywhere in the page, which flickered the pills and cards behind a menu. Each open menu is watched on its own, below.)
  reg = api.add(live, { watch: [], before: document.body, cut });
}
const own = new MutationObserver((rs) => { if (rs.length) reg?.redraw?.(); });
const watchOne = (el) => own.observe(el, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
/** Registers `el` (a .menu or .umenu) with the glass; null where there is no glass API (the caller then asks plate-gl.js). */
export function glassPlate(el) {
  if (!api?.add) return null;
  open.add(el);
  watchOne(el);
  listen();
  sync(el);
  ensure();
  reg?.redraw?.();
  return {
    leaveAlong() {},   // (the glass follows the menu's own box and fade, so its exit needs no twin)
    dispose() { open.delete(el); },
  };
}
/** The region is made once, with the app (it shares the cards' renderer, so it costs no second blur of the figure); the Why? pop, which stays in the page, is in it. */
export function whyGlass() { if (api?.add) { listen(); ensure(); const w = document.getElementById('whyPop'); if (w) watchOne(w); } }
