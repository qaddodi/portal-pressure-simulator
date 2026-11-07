// The lens key's switch (premium-feel R12). A new lens used to fade the whole key out and back in, one step after the other
// (120 ms, then 240), while the figure crossfaded over 420: two clocks. Now the key and the lens name move on the figure's
// clock (D_SURFACE, EASE_MOVE), so pill and figure finish together:
//   - the name crossfades (the old word fades out where it stood as the new one fades in);
//   - a bar that meets a bar changes colour along the way: the two ramps are mixed in OKLab (as colormap.js builds them)
//     by a registered variable the stylesheet transitions (--lg-k), and the bar's ends glide to their new places;
//   - the numbers and ticks of the scale slide from where each stood to where its successor stands (paired in order);
//     a number whose text changes crossfades as it slides, a pair that reads the same simply slides;
//   - the title, caption and every other key (the categories) crossfade.
// All of it is opacity and translate/scale on the compositor, but the bar's colour, which is repainted by CSS for the
// 420 ms (one small bar, once per switch). A key switched again before it has landed finishes at once, the bar carrying
// its colour on from where it had got to. Reduce Motion keeps the plain fade out and in (swapFade).
import { rgb2oklab, oklab2rgb } from './colormap.js';
import { cssRGB, swapFade, hasBox } from './util.js';
import { D_SURFACE, EASE_MOVE } from './ease.js';
import { reduceMotionMQ } from './motion.js';

export const MORPH_STOPS = 24;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const splitTop = (s) => { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (d === 0 && ch === ',') { out.push(cur.trim()); cur = ''; } else cur += ch; } out.push(cur.trim()); return out; };   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor

/** A "linear-gradient(dir, stop, stop, …)" as [{ u: 0..1, lab }]: stops are rgb(r,g,b) with an optional position, or var(--token)
 *  (resolved by `resolve` to [r,g,b] in 0..255); a stop with no position sits evenly between its neighbours. null if not one. */
export function parseRamp(css, resolve = cssRGB) {
  const m = /^linear-gradient\(([\s\S]*)\)$/.exec(String(css).trim());   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
  if (!m) return null;
  const parts = splitTop(m[1]).slice(1);   // (the first is the direction)   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
  if (parts.length < 2) return null;
  const stops = [];   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
  for (const p of parts) {
    const c = /^(rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)|var\(\s*--[\w-]+\s*\))\s*(-?[\d.]+)?%?$/.exec(p);
    if (!c) return null;
    const rgb = c[1][0] === 'r' ? c[1].match(/\d+/g).map(Number) : resolve(/--[\w-]+/.exec(c[1])[0]);   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
    stops.push({ u: c[2] == null ? null : parseFloat(c[2]) / 100, lab: rgb2oklab(rgb.map((v) => v / 255)) });   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
  }
  if (stops[0].u == null) stops[0].u = 0;
  if (stops.at(-1).u == null) stops.at(-1).u = 1;
  for (let i = 1; i < stops.length - 1; i++) {
    if (stops[i].u != null) continue;
    let j = i; while (stops[j].u == null) j++;
    const a = stops[i - 1].u, b = stops[j].u;
    for (let k = i; k < j; k++) stops[k].u = a + ((b - a) * (k - i + 1)) / (j - i + 1);
  }
  return stops;
}

/** n colours (OKLab) along a parsed ramp, evenly from its start to its end. */
export function sampleRamp(stops, n = MORPH_STOPS) {
  const out = [];   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    let k = 0;
    while (k < stops.length - 2 && u > stops[k + 1].u) k++;
    const a = stops[k], b = stops[k + 1], t = b.u === a.u ? 0 : clamp01((u - a.u) / (b.u - a.u));
    out.push(a.lab.map((v, j) => v + (b.lab[j] - v) * t));   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
  }
  return out;
}

/** Two sampled ramps k of the way (0..1) from a to b, in OKLab. */
export const mixLabs = (a, b, k) => a.map((c, i) => c.map((v, j) => v + (b[i][j] - v) * k));   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor

const rgbOf = (lab) => `rgb(${oklab2rgb(lab).join(', ')})`;   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
/** The plain gradient of a sampled ramp. */
export const labsCss = (labs, dir = 'to right') => `linear-gradient(${dir}, ${labs.map((l, i) => `${rgbOf(l)} ${((i / (labs.length - 1)) * 100).toFixed(2)}%`).join(', ')})`;   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
/** The gradient between two sampled ramps, mixed in OKLab by --lg-k (a percentage the stylesheet registers and transitions). */
export function morphGradient(from, to, dir = 'to right') {
  const parts = from.map((a, i) => `color-mix(in oklab, ${rgbOf(a)}, ${rgbOf(to[i])} var(--lg-k)) ${((i / (from.length - 1)) * 100).toFixed(2)}%`);
  return `linear-gradient(${dir}, ${parts.join(', ')})`;
}

/** How the numbers or ticks of one scale give way to the next: item i of the old scale becomes item i of the new (they slide),
 *  the surplus new ones fade in and the surplus old ones fade out. Each is { x, y, text } or null (not on show). */
export function pairItems(olds, news) {
  const slides = [], fadeIn = [], fadeOut = [];   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
  const n = Math.max(olds.length, news.length);
  for (let i = 0; i < n; i++) {
    const o = olds[i] ?? null, w = news[i] ?? null;
    if (o && w) slides.push({ i, dx: o.x - w.x, dy: o.y - w.y, same: o.text === w.text });   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
    else if (w) fadeIn.push(i);
    else if (o) fadeOut.push(i);
  }
  return { slides, fadeIn, fadeOut };   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
}

// The bar's colour change is a crossfade of two ramps painted once: the new bar wears its own ramp, and a layer on it wears the
// old ramp (where it had got to, for a key switched again mid-way) and fades out by opacity on the compositor, riding the bar's
// glide. Nothing is repainted per frame.
const jobs = new WeakMap();
const reduced = () => typeof matchMedia === 'function' && reduceMotionMQ.matches;
const opt = (extra = {}) => ({ duration: D_SURFACE, easing: EASE_MOVE, ...extra });   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
const shown = (n) => !!n && n.getClientRects().length > 0;

function labsOf(bar) {
  if (!bar._lab && bar._ramp) { const stops = parseRamp(bar._ramp); if (stops) bar._lab = sampleRamp(stops); }
  return bar._lab || null;
}

/** Put the key's new children in el (the lens key), moving from the old on the figure's clock. instant: the same key again. */
export function morphKey(el, kids, { instant = false } = {}) {   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
  const run = jobs.get(el), btn = el.parentElement;
  if (instant || !el.animate || !el.isConnected || !el.firstChild || !btn || !hasBox(el) || !shown(el)) { run?.finish(); el.replaceChildren(...kids); return; }   // (shown: a key the bar hides has no place to fade from)   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
  if (reduced()) { run?.finish(); swapFade(el, () => el.replaceChildren(...kids)); return; }   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor

  const oldBar = el.querySelector('.lg-bar'), newScale = kids.find((k) => k.classList?.contains('lg-scale')), newBar = newScale?.querySelector('.lg-bar');   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
  const morph = !!(oldBar && newBar && newBar._ramp);
  const fromLab = morph ? (run?.current() ?? labsOf(oldBar)) : null;
  run?.finish();

  const originOf = () => { const b = btn.getBoundingClientRect(); return { x: b.left + btn.clientLeft, y: b.top + btn.clientTop }; };   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
  const local = (n, o) => { const r = n.getBoundingClientRect(); return { x: r.left - o.x, y: r.top - o.y, w: r.width, h: r.height, text: n.textContent }; };   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
  // (Only what is on show takes part: the numbers a narrow key hides are not slid, and a hidden one is not faded.)
  const items = (root, o) => Object.fromEntries(['num', 'tick'].map((kind) => [kind, [...root.querySelectorAll(`.lg-${kind}`)].map((n) => ({ n, r: o && shown(n) ? local(n, o) : null }))]));   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
  const o0 = originOf(), before = items(el, o0);
  const box0 = local(el, o0), bar0 = oldBar && shown(oldBar) ? local(oldBar, o0) : null;
  const ghost = el.cloneNode(true);
  const r0 = btn.getBoundingClientRect();

  el.replaceChildren(...kids);   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor

  // The pill hangs from its right edge (topbar-motion.js): its key grows and shrinks to the left, so the old key
  // stands where it stood by the same distance in the new box.
  const r1 = btn.getBoundingClientRect(), hung = btn.closest?.('.sb-right.has-face') && Math.abs(r1.right - r0.right) + .5 < Math.abs(r1.left - r0.left) ? r1.width - r0.width : 0;
  if (hung) {
    box0.x += hung; if (bar0) bar0.x += hung;
    for (const kind of ['num', 'tick']) for (const it of before[kind]) if (it.r) it.r.x += hung;   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
  }

  const o1 = originOf(), after = items(el, o1);
  const bar1 = newBar && shown(newBar) ? local(newBar, o1) : null;

  ghost.removeAttribute('id'); ghost.removeAttribute('role'); ghost.removeAttribute('aria-label'); ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true;
  Object.assign(ghost.style, { position: 'absolute', left: `${box0.x}px`, top: `${box0.y}px`, width: `${box0.w}px`, height: `${box0.h}px`, margin: '0', pointerEvents: 'none', transform: 'none' });   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
  btn.append(ghost);

  const anims = [];   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
  const play = (n, frames, extra) => { if (n?.animate) anims.push(n.animate(frames, opt(extra))); };   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
  const fadeOut = (n) => play(n, [{ opacity: 1 }, { opacity: 0 }], { fill: 'forwards' });   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
  const fadeIn = (n) => play(n, [{ opacity: 0 }, { opacity: 1 }]);   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor

  const gScale = ghost.querySelector('.lg-scale');
  for (const g of ghost.children) {
    if (morph && g === gScale) continue;
    play(g, [{ opacity: 1 }, { opacity: 0 }], { fill: 'forwards', duration: D_SURFACE * .5 });   // (the old key is gone by half-way: both keys never read at once)   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
  }
  for (const k of kids) {
    if (morph && k === newScale) continue;
    play(k, [{ opacity: 0 }, { opacity: 1 }], { delay: D_SURFACE * .4, duration: D_SURFACE * .6, fill: 'backwards' });   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
  }

  if (morph) {
    const gone = items(ghost);
    gScale.querySelector('.lg-bar')?.remove();
    for (const kind of ['num', 'tick']) {   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
      const os = before[kind].map((it, i) => ({ ...it, g: gone[kind][i].n })), ns = after[kind];   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
      for (const o of os) if (!o.r) o.g.remove();   // (not on show before: nothing of it to fade)
      const old = os.filter((o) => o.r), now = ns.filter((w) => w.r);   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
      const pairs = pairItems(old.map((o) => o.r), now.map((w) => w.r));   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
      for (const s of pairs.slides) {
        const sameLook = kind === 'tick' || s.same;
        play(now[s.i].n, [{ translate: `${s.dx}px ${s.dy}px`, opacity: sameLook ? 1 : 0 }, { translate: '0px 0px', opacity: 1 }]);   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
        if (sameLook) old[s.i].g.remove(); else play(old[s.i].g, [{ translate: '0px 0px', opacity: 1 }, { translate: `${-s.dx}px ${-s.dy}px`, opacity: 0 }], { fill: 'forwards' });   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
      }
      for (const i of pairs.fadeIn) fadeIn(now[i].n);
      for (const i of pairs.fadeOut) fadeOut(old[i].g);
    }
    if (bar0 && bar1) {
      const dx = bar0.x - bar1.x, sx = bar0.w / (bar1.w || 1);
      if (Math.abs(dx) > 0.4 || Math.abs(sx - 1) > 0.004) { newBar.style.transformOrigin = '0 50%'; play(newBar, [{ translate: `${dx}px 0px`, scale: `${sx} 1` }, { translate: '0px 0px', scale: '1 1' }]); }   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
    }
  }

  let toLab = null, timer = 0, layer = null;
  if (morph && fromLab) {
    toLab = labsOf(newBar);
    if (toLab) {
      layer = document.createElement('i');
      layer.className = 'lg-bar-was'; layer.setAttribute('aria-hidden', 'true');
      layer.style.background = labsCss(fromLab);
      newBar.append(layer);
      anims.push(layer.animate([{ opacity: 1 }, { opacity: 0 }], opt({ fill: 'forwards' })));   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
    }
  }   // (No ramp is ever mixed by an eased variable: that repaints the gradient every frame.)
  const job = {   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
    current: () => (toLab && fromLab ? mixLabs(fromLab, toLab, layer ? clamp01(1 - (parseFloat(getComputedStyle(layer).getPropertyValue('opacity')) || 0)) : 1) : null),   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
    finish() {
      clearTimeout(timer);
      for (const a of anims) a.cancel();
      ghost.remove();
      layer?.remove();
      if (jobs.get(el) === job) jobs.delete(el);
    },
  };
  jobs.set(el, job);
  timer = setTimeout(job.finish, D_SURFACE + 60);
}

/** Text that crossfades in place: the old word fades out where it stood as the new one fades in (a label whose width changes
 *  moves what follows it by the top bar's own glide). instant: no fade. */
export function crossfadeText(el, txt, { instant = false } = {}) {   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
  const prev = jobs.get(el);
  if (!prev && el.textContent === txt) return;
  const old = el.textContent, btn = el.parentElement;
  if (instant || !old || !el.animate || !el.isConnected || !btn || !hasBox(el) || !shown(el)) { prev?.finish(); el.textContent = txt; return; }   // (shown: the phone's top bar hides the lens name (display: none); its ghost, forced to display: block at a zero box, stood at the screen's top left)
  if (reduced()) { prev?.finish(); swapFade(el, () => { el.textContent = txt; }); return; }   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
  prev?.finish();
  if (el.textContent === txt) return;
  const b = btn.getBoundingClientRect(), r = el.getBoundingClientRect();
  if (!r.width && !r.height) { el.textContent = txt; return; }   // (a box of no size has nothing to fade from)
  const ghost = el.cloneNode(false);
  ghost.removeAttribute('id'); ghost.setAttribute('aria-hidden', 'true');
  ghost.textContent = old;
  Object.assign(ghost.style, { position: 'absolute', display: 'block', left: `${r.left - b.left - btn.clientLeft}px`, top: `${r.top - b.top - btn.clientTop}px`, width: `${r.width}px`, height: `${r.height}px`, margin: '0', whiteSpace: 'nowrap', pointerEvents: 'none' });   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
  el.textContent = txt;
  btn.append(ghost);
  const anims = [ghost.animate([{ opacity: 1 }, { opacity: 0 }], opt({ fill: 'forwards' })), el.animate([{ opacity: 0 }, { opacity: 1 }], opt())];   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
  let timer = 0;
  const job = { finish() { clearTimeout(timer); for (const a of anims) a.cancel(); ghost.remove(); if (jobs.get(el) === job) jobs.delete(el); } };   // alloc-rare: once per lens, mode or reference switch (a store change of the key's model, main.js renderLegend), the gesture that starts the key's morph; never per frame, the morph itself runs on the compositor
  jobs.set(el, job);
  timer = setTimeout(job.finish, D_SURFACE + 60);
}
