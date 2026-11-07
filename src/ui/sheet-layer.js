// One layer for every menu, sheet and scrim that lives outside #app (4 Nov 2026, Mohammad: "when I slide the menu down it still goes on top
// of everything"). Each menu used to carry its own cut on the dock's top line, written beside every one of its motions (the pull, the let-go,
// the stylesheet's entrance and exit), and each cut assumed the sheet rests 8 px above the dock; the main menu rested on the screen's foot
// with no cut at all, so it slid over the play bar, the timeline and the tabs. Now the cut is the layer's: over the thumb dock the layer
// is clipped on the dock's top line (app.css .sheet-layer, from --sheet-foot-screen), so nothing laid in it, however it is transformed,
// dragged or animated, is ever drawn (or takes a touch) below that line. The GPU glass of a menu in it is cut on the same line (menu-glass.js).
//
//   sheetLayer()   the layer (made once, the last thing in the body); menus, the main menu, Why? and their scrims are put in it
//   dockLine()     the dock's top in client px while the layer is cut there (the thumb dock is up), else null
//   setDockTop(y)  main.js, with the occupancy it publishes: the dock's top, client px (null: no dock)

let layer = null, dockTop = null;

export function sheetLayer() {
  if (layer && layer.isConnected) return layer;
  layer = document.getElementById('sheetLayer');
  if (!layer) {
    layer = document.createElement('div');   // alloc-rare: once per page
    layer.id = 'sheetLayer';
    layer.className = 'sheet-layer';
    document.body.append(layer);
  }
  return layer;
}

export function setDockTop(y) { dockTop = typeof y === 'number' && isFinite(y) ? y : null; }

export function dockLine() {
  if (dockTop == null || typeof document === 'undefined' || !document.documentElement.classList.contains('thumb-ui')) return null;
  return dockTop;
}

/** Whether `el` is laid in the layer (and so cut on the dock's line). */
export const inSheetLayer = (el) => !!(layer && el && layer.contains(el));
