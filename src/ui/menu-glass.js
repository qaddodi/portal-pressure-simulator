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

const live = () => {
  list.length = 0;
  for (const e of open) { if (e.isConnected) list.push(e); else open.delete(e); }
  const why = document.getElementById('whyPop');
  if (why) list.push(why);
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
  ensure();
  reg?.redraw?.();
  return {
    leaveAlong() {},   // (the glass follows the menu's own box and fade, so its exit needs no twin)
    dispose() { open.delete(el); },
  };
}
/** The region is made once, with the app (it shares the cards' renderer, so it costs no second blur of the figure); the Why? pop, which stays in the page, is in it. */
export function whyGlass() { if (api?.add) ensure(); }
