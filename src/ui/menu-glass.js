// Menus and popovers wear the shared GPU glass (Mohammad, 4 Nov 2026, "Use the glass for all the menus"): a menu (util.js popover), the main
// menu's panel (menu.js) and the Why? pop are regions of stage.glass.add, drawn in the figure's canvas under them: frost, tint (--gl-tint), ring
// (--gl-line) and shadow (--gl-drop) are the GPU's (app.css gives the menu's own paint up once it is drawn, [data-gl]). Where there is no figure canvas
// (no glass.add, not made yet, the GPU lost, Blur effect off) the menu keeps its CSS fill, ring and shadow (the page's, never a CSS blur).
//   glassPlate(el)  -> { leaveAlong(), dispose() }, the shape plate-gl.js's plate has, so the callers are as they were.

let api = null;
const open = new Set();   // alloc-rare: the menus open now (one added as each opens)
const list = [];
let reg = null;

/** Called once with stage.glass (main.js), after the stage is made. */
export function initMenuGlass(glass) { api = glass || null; }

// A menu that is coming, going or sliding keeps its GPU glass the whole time: while any menu moves (class mg-move; a running animation or the exit
// classes) the glass is read and drawn again in every frame (its box with the menu's live transform and translate, its opacity from the animation),
// so the card goes with the words exactly. Only a clip-path (the dock menus' sink) is not followed. (Mohammad, 4 Nov 2026: the card popped while the words slid.)
const MENUISH = '.menu, .umenu, .why-pop';
const moving = (e) => e.classList.contains('leaving') || e.classList.contains('out') || (e.getAnimations ? e.getAnimations().some((a) => a.playState !== 'finished' && a.playState !== 'idle') : false);
let raf = 0;
const movers = new Set();   // alloc-rare: the menus moving now
const tick = () => {
  raf = 0;
  for (const e of movers) if (!e.isConnected || !e.classList.contains('mg-move')) movers.delete(e);
  if (!movers.size) return;
  reg?.redraw?.();
  raf = requestAnimationFrame(tick);
};
const sync = (e) => {
  const m = moving(e);
  if (m !== e.classList.contains('mg-move')) e.classList.toggle('mg-move', m);
  if (m) { movers.add(e); if (!raf) raf = requestAnimationFrame(tick); } else movers.delete(e);
};
let listening = false;
function listen() {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  for (const ev of ['animationstart', 'animationend', 'animationcancel', 'transitionrun', 'transitionend', 'transitioncancel']) {
    document.addEventListener(ev, (x) => { const e = x.target; if (e?.matches?.(MENUISH)) sync(e); }, true);
  }
  // (A class change that starts or ends the exit (leaving, out) is seen here too, before the animation's own event.)
  new MutationObserver((rs) => { for (const r of rs) if (r.target.matches?.(MENUISH)) sync(r.target); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
}
const live = () => {
  list.length = 0;
  for (const e of open) { if (!e.isConnected) open.delete(e); else list.push(e); }
  const why = document.getElementById('whyPop');
  if (why) list.push(why);
  const tip = document.getElementById('tooltip');
  if (tip) list.push(tip);   // (the tooltip's card is glass too; its words are the GPU picture of tip-gl.js)
  return list;
};
// The dock menus' clip-path (inset(.. .. bottom ..), app.css, the sink): the glass is cut at the same foot, in client px, read with the box.
const cut = (e) => {
  const c = getComputedStyle(e).clipPath;
  if (!c || c === 'none' || !c.startsWith('inset(')) return null;
  const v = c.slice(6, c.indexOf(')')).split(/\s+/).map(parseFloat);
  const bot = v.length === 1 ? v[0] : v.length === 2 ? v[0] : v[2];
  if (!(bot > 0)) return null;
  return { bottom: e.getBoundingClientRect().bottom - bot };
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
