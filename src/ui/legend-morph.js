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
import { rgb2oklab, oklab2rgb } from './colormap.js?v=f317143d5b';
import { cssRGB, swapFade, hasBox } from './util.js?v=b2e9419bfb';
import { D_SURFACE, EASE_MOVE } from './ease.js?v=615d96d663';

export const MORPH_STOPS = 24;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const splitTop = (s) => { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (d === 0 && ch === ',') { out.push(cur.trim()); cur = ''; } else cur += ch; } out.push(cur.trim()); return out; };

/** A "linear-gradient(dir, stop, stop, …)" as [{ u: 0..1, lab }]: stops are rgb(r,g,b) with an optional position, or var(--token)
 *  (resolved by `resolve` to [r,g,b] in 0..255); a stop with no position sits evenly between its neighbours. null if not one. */
export function parseRamp(css, resolve = cssRGB) {
  const m = /^linear-gradient\(([\s\S]*)\)$/.exec(String(css).trim());
  if (!m) return null;
  const parts = splitTop(m[1]).slice(1);   // (the first is the direction)
  if (parts.length < 2) return null;
  const stops = [];
  for (const p of parts) {
    const c = /^(rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)|var\(\s*--[\w-]+\s*\))\s*(-?[\d.]+)?%?$/.exec(p);
    if (!c) return null;
    const rgb = c[1][0] === 'r' ? c[1].match(/\d+/g).map(Number) : resolve(/--[\w-]+/.exec(c[1])[0]);
    stops.push({ u: c[2] == null ? null : parseFloat(c[2]) / 100, lab: rgb2oklab(rgb.map((v) => v / 255)) });
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
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    let k = 0;
    while (k < stops.length - 2 && u > stops[k + 1].u) k++;
    const a = stops[k], b = stops[k + 1], t = b.u === a.u ? 0 : clamp01((u - a.u) / (b.u - a.u));
    out.push(a.lab.map((v, j) => v + (b.lab[j] - v) * t));
  }
  return out;
}

/** Two sampled ramps k of the way (0..1) from a to b, in OKLab. */
export const mixLabs = (a, b, k) => a.map((c, i) => c.map((v, j) => v + (b[i][j] - v) * k));

const rgbOf = (lab) => `rgb(${oklab2rgb(lab).join(', ')})`;
/** The plain gradient of a sampled ramp. */
export const labsCss = (labs, dir = 'to right') => `linear-gradient(${dir}, ${labs.map((l, i) => `${rgbOf(l)} ${((i / (labs.length - 1)) * 100).toFixed(2)}%`).join(', ')})`;
/** The gradient between two sampled ramps, mixed in OKLab by --lg-k (a percentage the stylesheet registers and transitions). */
export function morphGradient(from, to, dir = 'to right') {
  const parts = from.map((a, i) => `color-mix(in oklab, ${rgbOf(a)}, ${rgbOf(to[i])} var(--lg-k)) ${((i / (from.length - 1)) * 100).toFixed(2)}%`);
  return `linear-gradient(${dir}, ${parts.join(', ')})`;
}

/** How the numbers or ticks of one scale give way to the next: item i of the old scale becomes item i of the new (they slide),
 *  the surplus new ones fade in and the surplus old ones fade out. Each is { x, y, text } or null (not on show). */
export function pairItems(olds, news) {
  const slides = [], fadeIn = [], fadeOut = [];
  const n = Math.max(olds.length, news.length);
  for (let i = 0; i < n; i++) {
    const o = olds[i] ?? null, w = news[i] ?? null;
    if (o && w) slides.push({ i, dx: o.x - w.x, dy: o.y - w.y, same: o.text === w.text });
    else if (w) fadeIn.push(i);
    else if (o) fadeOut.push(i);
  }
  return { slides, fadeIn, fadeOut };
}

const jobs = new WeakMap();
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const opt = (extra = {}) => ({ duration: D_SURFACE, easing: EASE_MOVE, ...extra });
const shown = (n) => !!n && n.getClientRects().length > 0;

function labsOf(bar) {
  if (!bar._lab && bar._ramp) { const stops = parseRamp(bar._ramp); if (stops) bar._lab = sampleRamp(stops); }
  return bar._lab || null;
}

/** Put the key's new children in el (the lens key), moving from the old on the figure's clock. instant: the same key again. */
export function morphKey(el, kids, { instant = false } = {}) {
  const run = jobs.get(el), btn = el.parentElement;
  if (instant || !el.animate || !el.isConnected || !el.firstChild || !btn || !hasBox(el)) { run?.finish(); el.replaceChildren(...kids); return; }
  if (reduced()) { run?.finish(); swapFade(el, () => el.replaceChildren(...kids)); return; }

  const oldBar = el.querySelector('.lg-bar'), newScale = kids.find((k) => k.classList?.contains('lg-scale')), newBar = newScale?.querySelector('.lg-bar');
  const morph = !!(oldBar && newBar && newBar._ramp);
  const fromLab = morph ? (run?.current() ?? labsOf(oldBar)) : null;
  run?.finish();

  const frame = () => { const b = btn.getBoundingClientRect(); return { x: b.left + btn.clientLeft, y: b.top + btn.clientTop }; };
  const local = (n, o) => { const r = n.getBoundingClientRect(); return { x: r.left - o.x, y: r.top - o.y, w: r.width, h: r.height, text: n.textContent }; };
  // (Only what is on show takes part: the numbers a narrow key hides are not slid, and a hidden one is not faded.)
  const items = (root, o) => Object.fromEntries(['num', 'tick'].map((kind) => [kind, [...root.querySelectorAll(`.lg-${kind}`)].map((n) => ({ n, r: o && shown(n) ? local(n, o) : null }))]));
  const o0 = frame(), before = items(el, o0);
  const box0 = local(el, o0), bar0 = oldBar && shown(oldBar) ? local(oldBar, o0) : null;
  const ghost = el.cloneNode(true);

  el.replaceChildren(...kids);

  const o1 = frame(), after = items(el, o1);
  const bar1 = newBar && shown(newBar) ? local(newBar, o1) : null;

  ghost.removeAttribute('id'); ghost.removeAttribute('role'); ghost.removeAttribute('aria-label'); ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true;
  Object.assign(ghost.style, { position: 'absolute', left: `${box0.x}px`, top: `${box0.y}px`, width: `${box0.w}px`, height: `${box0.h}px`, margin: '0', pointerEvents: 'none', transform: 'none' });
  btn.append(ghost);

  const anims = [];
  const play = (n, frames, extra) => { if (n?.animate) anims.push(n.animate(frames, opt(extra))); };
  const fadeOut = (n) => play(n, [{ opacity: 1 }, { opacity: 0 }], { fill: 'forwards' });
  const fadeIn = (n) => play(n, [{ opacity: 0 }, { opacity: 1 }]);

  const gScale = ghost.querySelector('.lg-scale');
  for (const g of ghost.children) {
    if (morph && g === gScale) continue;
    fadeOut(g);
  }
  for (const k of kids) {
    if (morph && k === newScale) continue;
    fadeIn(k);
  }

  if (morph) {
    const gone = items(ghost);
    gScale.querySelector('.lg-bar')?.remove();
    for (const kind of ['num', 'tick']) {
      const os = before[kind].map((it, i) => ({ ...it, g: gone[kind][i].n })), ns = after[kind];
      for (const o of os) if (!o.r) o.g.remove();   // (not on show before: nothing of it to fade)
      const old = os.filter((o) => o.r), now = ns.filter((w) => w.r);
      const pairs = pairItems(old.map((o) => o.r), now.map((w) => w.r));
      for (const s of pairs.slides) {
        const sameLook = kind === 'tick' || s.same;
        play(now[s.i].n, [{ translate: `${s.dx}px ${s.dy}px`, opacity: sameLook ? 1 : 0 }, { translate: '0px 0px', opacity: 1 }]);
        if (sameLook) old[s.i].g.remove(); else play(old[s.i].g, [{ translate: '0px 0px', opacity: 1 }, { translate: `${-s.dx}px ${-s.dy}px`, opacity: 0 }], { fill: 'forwards' });
      }
      for (const i of pairs.fadeIn) fadeIn(now[i].n);
      for (const i of pairs.fadeOut) fadeOut(old[i].g);
    }
    if (bar0 && bar1) {
      const dx = bar0.x - bar1.x, sx = bar0.w / (bar1.w || 1);
      if (Math.abs(dx) > 0.4 || Math.abs(sx - 1) > 0.004) { newBar.style.transformOrigin = '0 50%'; play(newBar, [{ translate: `${dx}px 0px`, scale: `${sx} 1` }, { translate: '0px 0px', scale: '1 1' }]); }
    }
  }

  const plain = newBar?._ramp;
  let toLab = null, timer = 0;
  if (morph && fromLab) {
    toLab = labsOf(newBar);
    if (toLab) {
      newBar.style.background = plain;   // (a browser that does not know color-mix keeps this, the new ramp at once)
      newBar.style.background = morphGradient(fromLab, toLab);
      newBar.style.setProperty('--lg-k', '0%');
      newBar.classList.add('morphing');
      void newBar.offsetWidth;
      newBar.style.setProperty('--lg-k', '100%');
    }
  }
  const job = {
    current: () => (toLab && fromLab ? mixLabs(fromLab, toLab, clamp01(parseFloat(getComputedStyle(newBar).getPropertyValue('--lg-k')) / 100 || 0)) : null),
    finish() {
      clearTimeout(timer);
      for (const a of anims) a.cancel();
      ghost.remove();
      if (toLab) { newBar.style.background = plain; newBar.style.removeProperty('--lg-k'); newBar.classList.remove('morphing'); }
      if (jobs.get(el) === job) jobs.delete(el);
    },
  };
  jobs.set(el, job);
  timer = setTimeout(job.finish, D_SURFACE + 60);
}

/** Text that crossfades in place: the old word fades out where it stood as the new one fades in (a label whose width changes
 *  moves what follows it by the top bar's own glide). instant: no fade. */
export function crossfadeText(el, txt, { instant = false } = {}) {
  const prev = jobs.get(el);
  if (!prev && el.textContent === txt) return;
  const old = el.textContent, btn = el.parentElement;
  if (instant || !old || !el.animate || !el.isConnected || !btn || !hasBox(el)) { prev?.finish(); el.textContent = txt; return; }
  if (reduced()) { prev?.finish(); swapFade(el, () => { el.textContent = txt; }); return; }
  prev?.finish();
  if (el.textContent === txt) return;
  const b = btn.getBoundingClientRect(), r = el.getBoundingClientRect();
  const ghost = el.cloneNode(false);
  ghost.removeAttribute('id'); ghost.setAttribute('aria-hidden', 'true');
  ghost.textContent = old;
  Object.assign(ghost.style, { position: 'absolute', display: 'block', left: `${r.left - b.left - btn.clientLeft}px`, top: `${r.top - b.top - btn.clientTop}px`, width: `${r.width}px`, height: `${r.height}px`, margin: '0', whiteSpace: 'nowrap', pointerEvents: 'none' });
  el.textContent = txt;
  btn.append(ghost);
  const anims = [ghost.animate([{ opacity: 1 }, { opacity: 0 }], opt({ fill: 'forwards' })), el.animate([{ opacity: 0 }, { opacity: 1 }], opt())];
  let timer = 0;
  const job = { finish() { clearTimeout(timer); for (const a of anims) a.cancel(); ghost.remove(); if (jobs.get(el) === job) jobs.delete(el); } };
  jobs.set(el, job);
  timer = setTimeout(job.finish, D_SURFACE + 60);
}
