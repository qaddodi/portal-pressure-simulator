// A slider drawn on the GPU (Mohammad, 3 Nov 2026: "Move. Everything. To. GPU."): its track, its fill, the green band of a normal range, the
// ring where a what-if slide started, and the dot with its shadow, its hover / held / focus rings and the glide the dot and fill make when a
// value is set from outside. widget-gl.js gives it a picture over the slider's wrapper (.range-wrap) through the charts' shared GPU context.
//
// The <input type="range"> stays in the page, as every control does, for what only the page can do: its box, the pointer and the touch,
// the keys, focus and the value a screen reader reads. Its own track and thumb are drawn clear (app.css .wgl-on) the moment the GPU's picture is
// up, never before. Nothing here asks the page for a box or a style in a frame: the wrapper's width and height come from the picture's own size
// (widget-gl.js: the size observer), and the dot's width (--tw: 18 px, 22 px on a phone or under a finger) is what the stylesheet's own two
// media queries say, asked here: no style is read.
//
// What moves is a number in the slider's record (the fraction the dot and fill show, and the seven numbers of the dot's rings); a frame that
// changes one draws the picture again, and a frame where none changes draws nothing and asks for no frame (idle costs nothing). The glide runs
// here on the paced eases' clock, so the input's own value is the new value at once (the page, a screen reader and the model never wait for
// it) and no style or attribute is written in any frame of it.
import { widgetGL } from './widget-gl.js';
import { frame, cancelFrame, easeNow } from './frame.js';
import { easeMove, easeArrive, D_SMALL, D_SURFACE } from './ease.js';
import { cssVar, reduceMotionMQ } from './util.js';

/** CSS px of picture past the wrapper's box on every side: the held ring (8 px, scaled 1.12) and its shadow reach past a 20 px bar. */
export const PAD = 18;
const TAU = Math.PI * 2;

// ---- The dot's rings: seven numbers, tweened between four looks on the compositor's curve and the --d-small the CSS had. ----
// 0 spread of the accent ring (px)  1 its strength  2 shadow offset (px)  3 shadow blur (px)  4 shadow strength  5 scale  6 focus ring strength
export const IDLE = 0, HOVER = 1, HELD = 2, FOCUS = 3, FOCUS_HELD = 4;
export const LEVELS = [
  Float64Array.of(3, 0, 1, 3, 0.14, 1, 0),      // at rest: the surface ring and the soft shadow (app.css input[type=range]::-webkit-slider-thumb)
  Float64Array.of(6, 1, 1, 3, 0.14, 1, 0),      // a mouse over it: a 6 px ring of the accent's wash
  Float64Array.of(8, 1, 2, 6, 0.16, 1.12, 0),   // held (a press, a finger): 1.12 times the size, an 8 px ring, a deeper shadow
  Float64Array.of(3, 0, 0, 3, 0, 1, 1),         // keyboard focus: the surface ring and a 5 px ring in the focus colour
  Float64Array.of(3, 0, 0, 3, 0, 1.12, 1),      // focus ring on a held dot (a finger's press focuses it): the focus ring's shadows, the held scale
];
/** Which look the dot has: a mouse over it (not pressed) first, then keyboard focus, then held, as the stylesheet's rules rank. */
export const levelFor = (hover, held, focus, disabled) => (disabled ? IDLE : hover && !held ? HOVER : focus ? (held ? FOCUS_HELD : FOCUS) : held ? HELD : IDLE);

/** The centre of the dot across a bar `w` wide, the dot `tw` wide, at fraction `f`: the browser's own placement (half a dot in from each end). */
export const thumbX = (w, tw, f) => tw / 2 + Math.max(0, w - tw) * f;
/** The fraction the dot shows `k` of the way (0 to 1, eased) from `a` to `b` of a slider (min, max, step): it sits on a step, the fill follows it. */
export function glideAt(a, b, k, min, max, step) {
  if (k >= 1 || !(max > min)) return b;
  let v = min + (a + (b - a) * k) * (max - min);
  if (step) v = Math.round((v - min) / step) * step + min;
  return Math.min(1, Math.max(0, (v - min) / (max - min)));
}

// ---- The look, read from the page's tokens (they follow the theme and the palette); rebuilt only when a token's text changes. ----
const ink = { key: '', track: '', fill: '', band: '', start: '', surface: '', accent: '', soft: '', focus: '', shadow: [] };   // alloc-rare: the one record of ink
const mix = (c, pct) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
function inkNow() {
  const a = cssVar('--accent'), s = cssVar('--surface'), t = cssVar('--text'), ok = cssVar('--ok'), soft = cssVar('--accent-soft'), f = cssVar('--focus'), b = cssVar('--black-rgb');
  if (ink.key === a && ink.surface === s && ink.start === t && ink.band === ok && ink.soft === soft && ink.focus === f && ink.black === b) return ink;
  ink.key = a; ink.accent = a; ink.surface = s; ink.start = t; ink.band = ok; ink.soft = soft; ink.focus = f; ink.black = b;
  ink.track = mix(t, 10); ink.fill = mix(a, 60); ink.bandFill = mix(ok, 60); ink.startRing = mix(t, 50);
  ink.shadow.length = 0;
  for (let i = 0; i <= 20; i++) ink.shadow.push(`rgb(${b} / ${i / 100})`);   // alloc-rare: the shadow's strengths, 0 to 0.20, built when the tokens change
  return ink;
}

// ---- One record for each slider. ----
const byInput = new WeakMap();
const LIVE = new Set();   // alloc-rare: the sliders the GPU draws (added when one is made, taken out when it goes)
const PRESSED = new Set();   // alloc-rare: the sliders under a finger or a mouse button
const NUM_END = /\*\s*(-?[\d.]+(?:e-?\d+)?)\)\s*$/i;

/** The slider's record (made once, with its first paint): the page's input, its wrapper and what it shows. */
export function sliderOf(input, wrap) {
  let S = byInput.get(input);
  if (S) return S;
  // alloc-rare: a slider's two rows of ring numbers, made once with the slider (its first paint)
  const cur = Float64Array.from(LEVELS[IDLE]), from = new Float64Array(7);
  // alloc-rare: a slider's record, made once with the slider (its first paint)
  S = { input, wrap, w: null, dead: false, f: NaN, tw: dotWidth(), band: null, start: NaN, min: 0, max: 100, step: 0, gA: 0, gB: 0, gStart: -1, gTo: NaN, level: IDLE, cur, from, tStart: -1, hover: false, held: false, focus: false, raf: 0, tickFn: null, paintFn: null };
  S.tickFn = () => tick(S);   // alloc-rare: once for each slider
  S.paintFn = (ctx, pw, ph, pad) => drawSlider(S, ctx, pw, ph, pad);   // alloc-rare: once for each slider
  byInput.set(input, S);
  if (io) io.observe(wrap);
  return S;
}
export const sliderFor = (input) => byInput.get(input);

// Made when the slider comes near the screen (not when it is built: a panel holds dozens, most of them off the screen).
const io = typeof IntersectionObserver === 'function'
  ? new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { const input = e.target.querySelector('input[type="range"]'); const S = input && byInput.get(input); if (S) make(S); } }, { rootMargin: '160px' })
  : null;   // alloc-rare: one observer for the page

function make(S) {
  if (S.w || S.dead) return;
  for (const o of LIVE) if (!o.wrap.isConnected) drop(o);   // (the sliders of cards that have gone)
  readOnce(S);
  S.w = widgetGL(S.wrap, S.paintFn, { pad: PAD });
  if (!S.w) { S.dead = true; return; }
  LIVE.add(S);
  S.w.paint();
}
function drop(S) {
  cancelFrame(S.raf); S.raf = 0;
  S.w?.dispose(); S.w = null;
  LIVE.delete(S);
}
/** The things about a slider the stylesheet and its builder fix: its dot's width, its normal band and its start ring. Read once. */
function readOnce(S) {
  const { input, wrap } = S;
  S.min = +input.min || 0; S.max = +(input.max || 100); S.step = input.step === 'any' ? 0 : +input.step || 1;
  const n = wrap.querySelector(':scope > .normal');
  if (n) {
    const a = NUM_END.exec(n.style.left), b = NUM_END.exec(n.style.width);
    S.band = a && b ? { at: +a[1], len: +b[1] } : null;   // alloc-rare: once for a slider that has a normal range
  }
  const dot = wrap.querySelector(':scope > .sl-start');
  S.start = dot ? parseFloat(wrap.style.getPropertyValue('--s')) : NaN;
}
// The dot's width: app.css gives .range-wrap --tw: 22px under the phone's media query and under a coarse pointer, 18px otherwise. The same two
// queries asked here (kept in step with the stylesheet by tests/slider-gl.test.js); a change of either draws the sliders again.
export const PHONE_MQ = '(max-width: 767px), (max-width: 1100px) and (orientation: portrait)', COARSE_MQ = '(pointer: coarse)';
const phone = typeof matchMedia === 'function' ? matchMedia(PHONE_MQ) : null, coarse = typeof matchMedia === 'function' ? matchMedia(COARSE_MQ) : null;   // alloc-rare: two queries for the page
export const dotWidth = () => (phone?.matches || coarse?.matches ? 22 : 18);
function twAgain() { for (const S of LIVE) { const tw = dotWidth(); if (tw !== S.tw) { S.tw = tw; ask(S); } } }
phone?.addEventListener('change', twAgain); coarse?.addEventListener('change', twAgain);

// ---- What changes the picture. ----
function ask(S) { if (S.w && !S.raf) S.raf = frame(S.tickFn, 'numbers'); }
/** The slider shows fraction `f` at once. Where the GPU has not drawn it yet the page's own fill (--p) carries it. */
export function jump(S, f) {
  S.f = f; S.gStart = -1; S.gTo = NaN;
  if (!S.w?.live) S.wrap.style.setProperty('--p', String(f));   // alloc-rare: only until the GPU's picture is up (or where there is none)
  ask(S);
}
/** The slider's dot and fill travel to fraction `f` together over --d-surface on the quintic ease. */
export function glide(S, f) {
  S.min = +S.input.min || 0; S.max = +(S.input.max || 100); S.step = S.input.step === 'any' ? 0 : +S.input.step || 1;
  S.gA = S.f; S.gB = S.gTo = f; S.gStart = easeNow();
  ask(S);
}
/** True while the slider is travelling to `f` already (a model sync asking again for the glide's own target). */
export const gliding = (S, f) => S.gStart >= 0 && Math.abs(S.gTo - f) < 1e-9;

function setLevel(S) {
  const to = levelFor(S.hover, S.held, S.focus, S.input.disabled);
  if (to === S.level) return;
  S.level = to;
  if (!S.w) return;
  if (reduceMotionMQ.matches) S.cur.set(LEVELS[to]);
  else { S.from.set(S.cur); S.tStart = easeNow(); }
  ask(S);
}
export const setHover = (S, on) => { if (S.hover !== on) { S.hover = on; setLevel(S); } };
export const setFocus = (S, on) => { if (S.focus !== on) { S.focus = on; setLevel(S); } };
export function setHeld(S, on) {
  if (on) PRESSED.add(S); else PRESSED.delete(S);
  if (S.held !== on) { S.held = on; setLevel(S); }
}
/** A pointer let go anywhere: every slider that was under it is let go. */
export function releaseAll() { for (const S of PRESSED) setHeld(S, false); }
/** The input's own value changed (a drag, a key, the wheel, a double click): the picture follows it if the slider's own paint has not already. */
export function followInput(S) {
  if (S.gStart >= 0) return;
  const { input } = S, min = +input.min || 0, max = +(input.max || 100);
  const f = max > min ? Math.min(1, Math.max(0, (+input.value - min) / (max - min))) : 0;
  if (!(Math.abs(f - S.f) < 1e-9)) jump(S, f);
}
/** The disabled state is set by the page with no event of its own: one observer for the page tells the slider when it changes. */
export function refresh(S) { setLevel(S); ask(S); }
if (typeof MutationObserver === 'function' && typeof document !== 'undefined') {
  new MutationObserver((rs) => { for (const r of rs) { const S = byInput.get(r.target); if (S) refresh(S); } }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['disabled'] });   // alloc-rare: one observer for the page
}

function tick(S) {
  S.raf = 0;
  const now = easeNow();
  let more = false;
  if (S.gStart >= 0) {
    const u = Math.min(1, (now - S.gStart) / D_SURFACE);
    S.f = u >= 1 ? S.gB : glideAt(S.gA, S.gB, easeMove(u), S.min, S.max, S.step);
    if (u >= 1) { S.gStart = -1; S.gTo = NaN; } else more = true;
  }
  if (S.tStart >= 0) {
    const u = Math.min(1, (now - S.tStart) / D_SMALL), e = easeArrive(u), to = LEVELS[S.level];
    for (let i = 0; i < 7; i++) S.cur[i] = S.from[i] + (to[i] - S.from[i]) * e;
    if (u >= 1) S.tStart = -1; else more = true;
  }
  S.w?.paint();
  if (more) S.raf = frame(S.tickFn, 'numbers');
}

// ---- The picture. ----
function disc(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
function drawSlider(S, ctx, pw, ph, pad) {
  const k = inkNow(), W = pw - 2 * pad, cy = ph / 2, tw = S.tw, travel = Math.max(0, W - tw);
  const f = Number.isFinite(S.f) ? S.f : 0;
  // The track and its fill (app.css .range-wrap::before and ::after): 6 px tall, round ended; a normal range draws its band and no fill.
  ctx.fillStyle = k.track;
  ctx.beginPath(); ctx.roundRect(pad, cy - 3, W, 6, 3); ctx.fill();
  if (S.band) {
    ctx.fillStyle = k.bandFill;
    ctx.beginPath(); ctx.roundRect(pad + tw / 2 + travel * S.band.at, cy - 3, travel * S.band.len, 6, 3); ctx.fill();
  } else {
    ctx.fillStyle = k.fill;
    ctx.beginPath(); ctx.roundRect(pad, cy - 3, tw / 2 + travel * f, 6, 3); ctx.fill();
  }
  // The ring where a what-if slide started (.sl-start): 12 px, a 2 px edge in the text's half ink over the surface.
  if (Number.isFinite(S.start)) {
    const sx = pad + thumbX(W, tw, Math.min(1, Math.max(0, S.start)));
    ctx.fillStyle = k.surface; disc(ctx, sx, cy, 6);
    ctx.strokeStyle = k.startRing; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sx, cy, 5, 0, TAU); ctx.stroke();
  }
  // The dot.
  const v = S.cur, x = pad + thumbX(W, tw, f), r = tw / 2, sc = v[5], off = S.input.disabled;
  if (off) {
    // (A disabled slider is dimmed to .45 as one piece: the ring as a band round the dot, so the two never lie one over the other.)
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = k.surface; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, cy, r + 1.5, 0, TAU); ctx.stroke();
    ctx.fillStyle = k.accent; disc(ctx, x, cy, r);
    ctx.globalAlpha = 1;
    return;
  }
  if (v[6] > 0.002) { ctx.globalAlpha = v[6]; ctx.fillStyle = k.focus; disc(ctx, x, cy, (r + 5) * sc); }
  if (v[1] > 0.002) { ctx.globalAlpha = v[1]; ctx.fillStyle = k.soft; disc(ctx, x, cy, (r + v[0]) * sc); }
  ctx.globalAlpha = 1;
  if (v[4] > 0.002) {
    const R = (r + 3) * sc;
    ctx.shadowBox(x - R, cy - R, 2 * R, 2 * R, R, k.shadow[Math.min(20, Math.round(v[4] * 100))], 2 * v[3] * sc, v[2] * sc);   // (shadowBox's blur is the width of the edge; a CSS blur radius is a Gaussian twice as wide: sigma = blur / 2)
  }
  ctx.fillStyle = k.surface; disc(ctx, x, cy, (r + 3) * sc);
  ctx.fillStyle = k.accent; disc(ctx, x, cy, r * sc);
}
