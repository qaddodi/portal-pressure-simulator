// The page's geometry, read in one place (plan "Holding 120 Hz, always", 3.4).
//
// Every layout read the app makes goes through this module: the browser is asked for a box, a style, a matrix, an outline length
// or an element under a point only here. A read is cheap when the page's layout is clean (the frame's read phase, an observer's
// callback, between two frames) and costs a whole style and layout pass when a write came before it in the same task; with every
// read in one place they can be counted by where they happen, and the scanner (scripts/off-gpu-scan.mjs, "layout reads") fails on
// a read anywhere else.
//
// The snapshot itself, the geometry most of the app asks for, is kept here without asking the browser at all:
//  - the stage's box and the figure's screen matrix: the stage keeps its box from its ResizeObserver and works the matrix out from
//    the view (stage.js refreshCTM), and hands both here (provideStage);
//  - the screen's safe-area sides (a notched phone held sideways), read by the stage once and again after a resize or a turn;
//  - the boxes of what the presenter places (cards, callouts, the credit, the zoom pill, the dock's divider): their sizes come from
//    a ResizeObserver (it reports after the browser's own layout, for free) and their places from whoever put them there (place()).
// A consumer reads the snapshot first and asks the browser (readBox) only for what the snapshot does not hold.
import { framePhase } from './frame.js';

// Where the reads happen: by the frame's phase ('read' is the clean one; 'early', 'late' and 'final' come after writes) or 'task'
// (an event, a timer, an observer). Counted only while ?perf or ?offgpu is watching; window.pps.layoutReads() in the console.
const WATCH = typeof location !== 'undefined' && /[?&](perf|offgpu)\b/.test(location.search || '');
const counts = { read: 0, early: 0, late: 0, final: 0, task: 0 };
const note = WATCH ? () => { counts[framePhase() || 'task']++; } : () => {};
export const layoutReads = () => ({ ...counts, afterWrites: counts.early + counts.late + counts.final });

// ---- The one place the browser is asked. ----
// (Each takes the element first; a missing element gives undefined, as `el?.method()` did.)
export const readBox = (el) => { if (el == null) return undefined; note(); return el.getBoundingClientRect(); };
export const readRects = (el) => { if (el == null) return undefined; note(); return el.getClientRects(); };
export const readStyle = (el, pseudo) => { note(); return pseudo ? getComputedStyle(el, pseudo) : getComputedStyle(el); };
export const readCTM = (el) => { if (el == null) return undefined; note(); return el.getScreenCTM?.() ?? null; };
// (An SVG element's frame in its own svg's units (getCTM, not the screen's): the organs' paint undoes a parent's by it, which the camera never moves.)
export const readLocalCTM = (el) => { if (el == null) return undefined; note(); return el.getCTM?.() ?? null; };
// (offsetWidth, offsetHeight, offsetTop, offsetLeft, offsetParent, clientWidth, clientHeight, clientTop, clientLeft, scrollWidth,
// scrollHeight, scrollTop, scrollLeft, innerWidth, innerHeight, innerText: one element's (or the window's) layout metric, by name.)
export const readMetric = (el, k) => { if (el == null) return undefined; note(); return el[k]; };
export const readElAt = (x, y) => { note(); return document.elementFromPoint(x, y); };
export const readAnims = (el, opts) => { if (el == null) return undefined; note(); return opts ? el.getAnimations?.(opts) : el.getAnimations?.(); };
export const readTiming = (fx) => { if (fx == null) return undefined; note(); return fx.getComputedTiming?.(); };
export const scrollInto = (el, opts) => { if (el == null) return; note(); el.scrollIntoView?.(opts); };

// ---- The snapshot. ----
let stage = null;
// (stage.js hands its kept box, its arithmetic matrix and its safe-area sides once it is made.)
export function provideStage(p) { stage = p; }
// The stage's box ({ left, top, width, height, right, bottom, sx, sy, sw, sh }: the svg inside it too), kept by the stage's observer.
export const stageBox = () => stage?.box?.() || null;
// The figure's (#world's) screen matrix { a, b, c, d, e, f, sc }, worked out from the view: never a read.
export const worldCTM = () => stage?.ctm?.() || null;
export const safeSides = () => stage?.sides?.() || { l: 0, r: 0 };

// The window's size (the page's visible area, client px), kept from the last resize or turn: read once at first use and again in the
// resize and orientationchange events, never in a frame. { w, h }; the object is the same until the window changes.
let view = null;
// alloc-rare: read at first use and again only on a resize or turn of the window (see above), never in a frame
const readView = () => { note(); const d = typeof document !== 'undefined' ? document.documentElement : null; return { w: d?.clientWidth || (typeof innerWidth === 'number' ? innerWidth : 0) || 0, h: d?.clientHeight || (typeof innerHeight === 'number' ? innerHeight : 0) || 0 }; };
export const viewSize = () => view ?? (view = readView());

// (A resize or a turn: the window's size is read again, once, in the event's own task.)
if (typeof addEventListener !== 'undefined') {
  const turned = () => { if (view) view = readView(); };   // (read in the event's own task, once)
  addEventListener('resize', turned);
  addEventListener('orientationchange', turned);
}
