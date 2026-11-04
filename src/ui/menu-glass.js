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

// A menu that is coming, going or sliding keeps the page's own card (class mg-move: the fill at the glass's tint, app.css), which is part of the
// menu and so moves, fades and clips exactly as its words do, whatever animation does it; the frost takes over when it has settled. (A card the
// GPU drew apart from the menu's own animation popped in and out while the words slid: Mohammad, 4 Nov 2026.)
const MENUISH = '.menu, .umenu, .why-pop';
const moving = (e) => e.classList.contains('leaving') || e.classList.contains('out') || (e.getAnimations ? e.getAnimations().some((a) => a.playState !== 'finished' && a.playState !== 'idle') : false);
const sync = (e) => { const m = moving(e); if (m !== e.classList.contains('mg-move')) e.classList.toggle('mg-move', m); };
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
  for (const e of open) { if (!e.isConnected) open.delete(e); else if (!e.classList.contains('mg-move')) list.push(e); }
  const why = document.getElementById('whyPop');
  if (why && !why.classList.contains('mg-move')) list.push(why);
  const tip = document.getElementById('tooltip');
  if (tip) list.push(tip);   // (the tooltip's card is glass too; its words are the GPU picture of tip-gl.js)
  return list;
};
function ensure() {
  if (reg || !api?.add) return;
  reg = api.add(live, { watch: document.body, before: document.body });
}
/** Registers `el` (a .menu or .umenu) with the glass; null where there is no glass API (the caller then asks plate-gl.js). */
export function glassPlate(el) {
  if (!api?.add) return null;
  open.add(el);
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
export function whyGlass() { if (api?.add) { listen(); ensure(); } }
