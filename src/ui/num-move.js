// An element moved by a number, with nothing built per write (2 Nov 2026, the GPU rule: no allocation in a finger's move).
//
// A drag used to write `el.style.translate = \`${x}px ${y}px\`` at every event: a template string, parsed again by the browser.
// Here the element holds one paused Web Animation per axis (fill: both) whose keyframes run linearly across a window of
// 2 * HALF px at one px per ms; moving the element is `animation.currentTime = offset - lo`, a number. The animation is made once
// when the drag first writes, again only when a value leaves its window (the window is HALF either side of where it was armed),
// and cancelled when the drag lets go: the caller then writes the resting style it always wrote (a class, or the same inline
// value), so nothing stale composites.
//
//   prop 'translate' (the individual property): x, y or both. The x animation replaces, the y one adds on top of it ('add'),
//        so a 2D move is the same `translate: Xpx Ypx` it was. A y-only move replaces: `0px Ypx`, as before.
//   prop 'transform' (a translateX or translateY): one axis, for an element whose release is a CSS transition of `transform`.
//
// Standard Web Animations only (no CSS Typed OM, which Safari lacks). Fractions of a pixel are kept (currentTime is a double).
//
// The glass (glass-gl.js) follows a card or a sheet's plate by reading its inline translate; a move made here writes none, so
// `driven(el)` gives it the same two numbers and `onMove(fn)` wakes it when one changes (glass: true on the mover).
const HALF = 1024;
const MOVERS = new WeakMap();   // element -> its movers by key (prop:axes)
const DRIVEN = new WeakMap();   // element -> { x, y, on }, what the glass reads
const DRIVEN_ANIMS = new WeakSet();
/** A drag's own paused animation is already represented by driven(). */
export const isDrivenAnimation = (a) => DRIVEN_ANIMS.has(a);
const wakers = [];

/** Wake glass after motion writes, while the scheduler can still draw it in this frame. */
export function signalMove() { for (let i = 0; i < wakers.length; i++) wakers[i](); }

/** Calls fn() whenever a glass mover's number changes; returns the function that stops it. */
export function onMove(fn) {
  wakers.push(fn);
  return () => { const i = wakers.indexOf(fn); if (i >= 0) wakers.splice(i, 1); };
}

/** The element's number-driven offset { x, y } while a glass mover holds it, else null. Read only, kept: do not store it. */
export function driven(el) {
  const d = DRIVEN.get(el);
  return d && d.on ? d : null;
}

const AX = 1, AY = 2;
/** A menu sheet over the thumb dock is cut on the dock's top line while it is pulled down: its resting bottom edge is 8 px above that line, so a
 *  pull of y px leaves y - 8 px of it cut off the bottom (clip-path is a compositor property, so it moves with the translate; sheet-pull.js uses the same). */
export const dockCut = (y) => `inset(-64px -64px ${y - 8}px -64px)`;

export class Mover {
  /** prop: 'translate' | 'transform'; axes: 'x' | 'y' | 'xy' ('xy' only with 'translate'); glass: tell the glass about it. */
  constructor(el, prop, axes, glass = false, clip = false) {
    if (prop !== 'translate' && prop !== 'transform') throw new Error(`Mover: ${prop}`);
    this.el = el; this.prop = prop; this.glass = glass; this.clip = clip;
    this.m = (axes.includes('x') ? AX : 0) | (axes.includes('y') ? AY : 0);
    if (!this.m || (prop === 'transform' && this.m === (AX | AY))) throw new Error(`Mover: ${prop} ${axes}`);
    this.ax = null; this.ay = null; this.lx = 0; this.ly = 0;
    this.x = 0; this.y = 0; this.on = false;
    this.d = null;
    if (glass) { this.d = DRIVEN.get(el) || { x: 0, y: 0, on: false, prop }; this.d.prop = prop; DRIVEN.set(el, this.d); }   // alloc-rare: once per element
  }

  /** A cached mover may first be requested without glass and later be used by a frosted surface. */
  enableGlass() {
    if (this.glass) return;
    this.glass = true;
    const d = this.d = DRIVEN.get(this.el) || { x: 0, y: 0, on: false, prop: this.prop };   // alloc-rare: only when a cached mover first gains a glass
    d.prop = this.prop; d.x = this.x; d.y = this.y; d.on = this.on;
    DRIVEN.set(this.el, d);
    if (this.ax) DRIVEN_ANIMS.add(this.ax);
    if (this.ay) DRIVEN_ANIMS.add(this.ay);
    if (this.on) signalMove();
  }

  /** Arms the animations around (x, y): a first write, or a value out of the window. The x one first, so the y one adds to it. */
  arm(x, y) {
    this.cancel();
    const m = this.m, tr = this.prop === 'translate';
    // (the animations are made when a drag first moves the element, or when its offset leaves the window, HALF px either side: never per write)
    if (m & AX) {
      this.lx = Math.floor(x) - HALF;
      this.ax = this.make(tr ? [{ translate: `${this.lx}px 0px` }, { translate: `${this.lx + 2 * HALF}px 0px` }] : [{ transform: `translateX(${this.lx}px)` }, { transform: `translateX(${this.lx + 2 * HALF}px)` }], false);   // alloc-rare: the drag's first write, or a value out of the window; never per write
    }
    if (m & AY) {
      this.ly = Math.floor(y) - HALF;
      this.ay = this.make(tr ? (this.clip ? [{ translate: `0px ${this.ly}px`, clipPath: dockCut(this.ly) }, { translate: `0px ${this.ly + 2 * HALF}px`, clipPath: dockCut(this.ly + 2 * HALF) }] : [{ translate: `0px ${this.ly}px` }, { translate: `0px ${this.ly + 2 * HALF}px` }]) : [{ transform: `translateY(${this.ly}px)` }, { transform: `translateY(${this.ly + 2 * HALF}px)` }], m === (AX | AY));   // alloc-rare: the drag's first write, or a value out of the window; never per write
    }
    this.on = true;
    if (this.d) this.d.on = true;
  }

  make(kf, add) {
    const a = this.el.animate(kf, { duration: 2 * HALF, fill: 'both', easing: 'linear', composite: add ? 'add' : 'replace' });   // alloc-rare: see arm; motion-scale: own pace (paused, set by currentTime: it has no time of its own)
    if (this.glass) DRIVEN_ANIMS.add(a);
    a.pause();
    return a;
  }

  /** Moves the element to (x, y) px (the axis this mover does not hold is ignored). Numbers only. */
  set(x, y) {
    const m = this.m;
    if (!this.on || ((m & AX) && (x < this.lx || x > this.lx + 2 * HALF)) || ((m & AY) && (y < this.ly || y > this.ly + 2 * HALF))) this.arm(x, y);
    if (m & AX) this.ax.currentTime = x - this.lx;
    if (m & AY) this.ay.currentTime = y - this.ly;
    this.x = x; this.y = y;
    const d = this.d;
    if (d) { d.x = x; d.y = y; signalMove(); }
  }

  /** Lets go: the animations are cancelled, nothing is left composited. The caller writes the resting style in the same task. */
  cancel() {
    const wasOn = this.on;
    if (this.ax) { this.ax.cancel(); this.ax = null; }
    if (this.ay) { this.ay.cancel(); this.ay = null; }
    this.on = false;
    if (this.d) { this.d.on = false; if (wasOn) signalMove(); }
  }
}

/** The element's mover for prop and axes, made once and kept. */
export function moverOf(el, prop, axes, glass = false, clip = false) {
  let rec = MOVERS.get(el);
  const key = `${prop}:${axes}${clip ? ':clip' : ''}`;   // alloc-rare: looked up when a drag begins or ends, never per write
  if (!rec) { rec = {}; MOVERS.set(el, rec); }   // alloc-rare: once per element
  const mover = rec[key] || (rec[key] = new Mover(el, prop, axes, glass, clip));   // alloc-rare: once per element and kind
  if (glass) mover.enableGlass();
  return mover;
}

/** Cancels every mover the element has (nothing if it never had one). */
export function cancelMoves(el) {
  const rec = MOVERS.get(el);
  if (!rec) return;
  for (const k in rec) rec[k].cancel();
}
