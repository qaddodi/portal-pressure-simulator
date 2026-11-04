// The slide overview strip (N5, 3 Nov 2026): the G list as a row of slide pictures, each slide a button under its picture (title only
// until the slide has been shown). The pictures are drawn by the GPU: thumb-atlas.js keeps one tile per slide, taken from the figure's
// canvases once the slide has landed, and draws the strip's visible tiles onto the strip's canvas. The strip scrolls itself (wheel, drag,
// arrow keys) so the row of buttons and the canvas move in the same frame: the row by transform, the pictures by the GPU, from one
// scroll position. This module is the strip's DOM, its scroll and the landing hook; the presenter owns when it opens and where a pick goes.
import { frameFor, cancelFrame } from './frame.js';
import { readMetric } from './layout-snap.js';
import { createThumbAtlas } from './thumb-atlas.js';

export const CW = 160, GAP = 10, PAD = 14, PIC_H = 100, KICK_H = 22;   // (css px: a cell's width, the gap, the row's side padding, the picture's height, the kicker line; tile 320 × 200 is 2× the picture)
const SETTLE_MS = 450, TRIES = 16, RETRY_MS = 500;

/** The scroll position that shows cell i whole (centred where it can be), within [0, max]. */
export function scrollFor(i, vw, n, from = 0) {
  const left = PAD + i * (CW + GAP), max = Math.max(0, PAD * 2 + n * CW + Math.max(0, n - 1) * GAP - vw);
  let x = from;
  if (left < x + PAD) x = left - PAD; else if (left + CW > x + vw - PAD) x = left + CW - vw + PAD;
  return Math.min(max, Math.max(0, x));
}
/** The most the row scrolls. */
export const scrollMax = (vw, n) => Math.max(0, PAD * 2 + n * CW + Math.max(0, n - 1) * GAP - vw);

/**
 * h: the element maker (presenter's h). Options: layers() the figure's canvases now (bottom first), count() the deck's slide count,
 * still(i) whether slide i is still the one on screen and at rest, reduced() whether motion is reduced.
 */
export function createSlideStrip({ h, layers, count, still, reduced = () => false }) {
  let atlas, timer = 0, tries = 0, raf = 0, vw = 0, x = 0, to = null, vel = 0, last = 0, cells = [], n = 0, view = null, ro = null, undrag = null;
  const ask = frameFor('slide strip'), askTake = frameFor('slide thumbs');
  const getAtlas = () => (atlas === undefined ? (atlas = createThumbAtlas()) : atlas);

  // ── Taking a slide's picture, once it has landed and the figure has been at rest a moment ──
  function take(i) {
    timer = 0;
    askTake(() => {
      if (!still(i)) return;
      const a = getAtlas();
      if (!a) return;
      a.prepare();
      if (a.capture(i, layers(), count())) { if (view) setTimeout(() => { view?.pics[i]?.classList.add('has'); kick(); }, 0); return; }   // (the strip is open as the picture arrives: it shows it now)
      if (++tries < TRIES) timer = setTimeout(() => take(i), RETRY_MS);   // (the program was still compiling, or nothing showed yet)
    });
  }
  /** Slide i has landed (cards whole, camera at rest): its picture is taken a moment later, in a frame. */
  function landed(i) {
    clearTimeout(timer); tries = 0;
    if (typeof document === 'undefined') return;
    getAtlas()?.prepare();   // (the program compiles while the slide settles)
    timer = setTimeout(() => take(i), reduced() ? 0 : SETTLE_MS);
  }

  // ── The strip itself ──
  const cellsOf = () => {
    cells.length = 0;
    for (let i = 0; i < n; i++) cells.push(i, PAD + i * (CW + GAP) - x, 0, CW, PIC_H);
    return cells;
  };
  function paint() {
    if (!view) return;
    const a = atlas;
    view.row.style.transform = `translate3d(${-x}px,0,0)`;
    if (a) {
      const ok = a.draw(cellsOf());
      if (!ok && !a.ready) return;
      if (!ok && !view.bad) { view.bad = true; setTimeout(untitle, 0); }
    }
  }
  // (A picture that cannot be drawn leaves its title showing: said between frames, once.)
  const untitle = () => { if (view) for (const p of view.pics) p.classList.remove('has'); };
  function loop(now) {
    raf = 0;
    if (!view) return;
    const dt = last ? Math.min(48, now - last) : 16;
    last = now;
    let moving = false;
    if (to != null) {
      const d = to - x;
      if (Math.abs(d) < 0.4 || reduced()) { x = to; to = null; } else { x += d * (1 - Math.pow(0.001, dt / 260)); moving = true; }
    } else if (Math.abs(vel) > 0.02 && !undrag) {
      x = clampX(x + vel * dt); vel *= Math.pow(0.0025, dt / 1000);
      if (x <= 0 || x >= scrollMax(vw, n)) vel = 0;
      moving = Math.abs(vel) > 0.02;
    }
    paint();
    if (moving || to != null || (atlas && !atlas.ready && view.waits++ < 90)) raf = ask(loop); else last = 0;
  }
  const kick = () => { if (!raf && view) raf = ask(loop); };
  const clampX = (v) => Math.min(scrollMax(vw, n), Math.max(0, v));
  const reveal = (i) => { const t = scrollFor(i, vw, n, to ?? x); if (t !== (to ?? x)) { to = t; vel = 0; kick(); } };

  /**
   * Fills nav element `j` (the presenter's jump panel) with the strip: items [{ title, kicker }], the current slide, the deck title.
   * pick(i) goes to a slide; close() closes the panel. Returns nothing; call shown() once the panel is visible.
   */
  function build(j, { title, items, cur, pick, close, icon, nb = (s) => s }) {
    teardown();
    n = items.length;
    const a = getAtlas();
    const pics = [];
    let kick0 = null;
    const runs = items.map((s, i) => { if (i && (items[i - 1].kicker || '') === (s.kicker || '')) return 0; let m = 1; while (items[i + m] && (items[i + m].kicker || '') === (s.kicker || '')) m++; return m; });   // (a group's first cell: how many cells its kicker runs over)
    const row = h('ol', { class: 'pzs-row' }, items.map((s, i) => {
      const k = s.kicker || '', first = k !== kick0; kick0 = k;
      const has = !!a?.has(i);
      const ft = h('span', { class: 'pzs-ft' }, nb(s.title));
      const pic = h('span', { class: 'pzs-p' + (has ? ' has' : ''), 'aria-hidden': 'true' }, ft);
      pics.push(pic);
      return h('li', { style: { width: `${CW}px` } },
        h('span', { class: 'pzs-k', 'aria-hidden': 'true', style: { width: `${runs[i] * CW + Math.max(0, runs[i] - 1) * GAP}px` } }, first ? k : ''),
        h('button', { type: 'button', 'aria-current': i === cur ? 'true' : null, 'aria-label': `${i + 1}: ${s.title}`, onclick: (e) => { if (view?.dragged) { e.preventDefault(); return; } close(); pick(i); } },
          pic, h('span', { class: 'pzs-cap' }, h('span', { class: 'n' }, String(i + 1)), h('span', { class: 't' }, nb(s.title)))));
    }));
    const cv = a?.cv;
    if (cv) { cv.className = 'pzs-cv'; cv.setAttribute('aria-hidden', 'true'); }
    const vp = h('div', { class: 'pzj-list pzs' }, row, cv || null);
    j.replaceChildren(h('div', { class: 'pzj-h' }, h('span', {}, title), h('button', { class: 'ib', 'aria-label': 'Close the slide list', onclick: () => close() }, icon('close'))), vp);
    view = { j, vp, row, pics, cv, dragged: false, waits: 0, cur };
    x = 0; to = null; vel = 0; last = 0;
    wire(vp);
  }

  function wire(vp) {
    vp.addEventListener('wheel', (e) => {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d || scrollMax(vw, n) <= 0) return;
      e.preventDefault(); to = null; vel = 0;
      x = clampX(x + d * (e.deltaMode === 1 ? 32 : 1)); kick();
    }, { passive: false });
    let down = null;
    vp.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      down = { id: e.pointerId, x0: e.clientX, s0: x, t: performance.now(), px: e.clientX, v: 0, on: false };
      to = null; vel = 0; undrag = null;
    });
    vp.addEventListener('pointermove', (e) => {
      if (!down || e.pointerId !== down.id) return;
      const dx = e.clientX - down.x0;
      if (!down.on) { if (Math.abs(dx) < 6) return; down.on = true; undrag = true; try { vp.setPointerCapture(e.pointerId); } catch { /* (the pointer is gone) */ } }
      const now = performance.now(), dt = Math.max(1, now - down.t);
      down.v = down.v * 0.6 + ((down.px - e.clientX) / dt) * 0.4; down.px = e.clientX; down.t = now;
      x = clampX(down.s0 - dx); kick();
    });
    const up = (e) => {
      if (!down || e.pointerId !== down.id) return;
      const d = down; down = null; undrag = null;
      if (d.on) {
        view.dragged = true; setTimeout(() => { if (view) view.dragged = false; }, 0);   // (the click that ends a drag is not a pick)
        vel = reduced() ? 0 : d.v; kick();
      }
    };
    vp.addEventListener('pointerup', up); vp.addEventListener('pointercancel', up);
    // (Tab or an arrow key focuses a button the row has scrolled out: the browser must not scroll the clipped box itself.)
    vp.addEventListener('scroll', () => { if (readMetric(vp, 'scrollLeft')) vp.scrollLeft = 0; });
    vp.addEventListener('focusin', (e) => { const li = e.target.closest?.('li'); if (li) reveal([...view.row.children].indexOf(li)); });
  }

  /** The panel is visible: measure it once, start the size watch, show the current slide, draw. */
  function shown() {
    if (!view) return;
    vw = readMetric(view.vp, 'clientWidth') || 360;
    const cv = view.cv;
    if (cv) { cv.style.cssText = `width:${vw}px;height:${PIC_H}px;top:${KICK_H}px`; }
    atlas?.resize(vw, PIC_H, Math.min(3, globalThis.devicePixelRatio || 1));
    ro?.disconnect();
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver((es) => {
        const w = Math.round(es[es.length - 1].contentRect.width);
        if (!view || !w || w === vw) return;
        vw = w; x = clampX(x);
        if (view.cv) view.cv.style.width = `${vw}px`;
        atlas?.resize(vw, PIC_H, Math.min(3, globalThis.devicePixelRatio || 1));
        kick();
      });
      ro.observe(view.vp);
    }
    x = scrollFor(view.cur, vw, n, 0);
    view.waits = 0;
    paint(); kick();
  }
  function teardown() { cancelFrame(raf); raf = 0; ro?.disconnect(); ro = null; view = null; to = null; vel = 0; undrag = null; }
  /** The panel closed. */
  function hide() { teardown(); }
  /** The deck closed: the pictures and the context go. */
  function drop() { clearTimeout(timer); teardown(); atlas?.drop(); atlas = undefined; }
  return { landed, build, shown, hide, drop, get atlas() { return atlas || null; }, state: () => ({ x, to, vw, n, pics: atlas?.count ?? 0 }) };
}
