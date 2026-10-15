// A slide's colour key, drawn small on the figure instead of in the teaching card (Mohammad, 15 Oct).
// It takes the free spot nearest its preferred corner of the open figure: clear of every card, the controls and the figure's labels,
// and on bare background where there is any, never over a vessel. It waits for the cards to land and the camera to rest, fades in
// there, and never slides: a new spot (the figure moved, a card opened) is a fade out, then a fade in at the new place.
import { frameFor, cancelFrame } from './frame.js?v=0db47e99bf';
import { OBSTACLES, hit, labelRects, organTest } from './credit.js?v=c87ad9d9c3';
const nextFrame = frameFor('figkey');

// The strictest look first: 10 px clear of organs and vessels; then 6; then clear of the vessels only (over an organ's plain
// fill); the last look 2 px.
const LEVELS = [{ pad: 10 }, { pad: 6 }, { pad: 6, org: false }, { pad: 2, org: false }];

// fig, obs: rects { l, t, r, b } in one frame. sizes: the key's boxes in preference order [{ w, h, layout }]. order: corners, most
// wanted first ('bl' 'br' 'tl' 'tr'), taken of the open part of fig (the part no obstacle covers). art(box, { pad, org }): true when
// the art touches the box; art.cover(box): how much art is under it. Returns { x, y, layout, bare } or null when nothing is open.
export function pickKeySpot({ fig, obs, sizes, order, art = null, step = 12, gap = 8, inset = 14 }) {
  const all = [];
  sizes.forEach((z, rank) => {
    const pts = [];
    for (let y = fig.t + inset; y + z.h <= fig.b - inset + 0.5; y += step) {
      for (let x = fig.l + inset; x + z.w <= fig.r - inset + 0.5; x += step) {
        const box = { l: x - gap, t: y - gap, r: x + z.w + gap, b: y + z.h + gap };
        if (!obs.some((o) => hit(box, o))) pts.push({ x, y });
      }
    }
    if (!pts.length) return;
    // (The corners of the open part, so a key beside a card still gathers at that card's corners.)
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    for (const p of pts) {
      let cost = Infinity;
      order.forEach((c, r) => { cost = Math.min(cost, r * 90 + Math.abs(p.x - (c[1] === 'l' ? x0 : x1)) + Math.abs(p.y - (c[0] === 't' ? y0 : y1))); });
      all.push({ ...p, w: z.w, h: z.h, layout: z.layout, cost: cost + rank * 150 });
    }
  });
  if (!all.length) return null;
  all.sort((a, b) => a.cost - b.cost);
  const boxOf = (c) => ({ l: c.x, t: c.y, r: c.x + c.w, b: c.y + c.h });
  if (!art) return { x: all[0].x, y: all[0].y, layout: all[0].layout, bare: true };
  for (const lv of LEVELS) {
    const c = all.find((q) => !art(boxOf(q), lv));
    if (c) return { x: c.x, y: c.y, layout: c.layout, bare: true };
  }
  // (Nowhere bare: the open spot with the least art under it, the corner's pull counting a little.)
  let best = null, bc = Infinity;
  for (const q of all) { const v = art.cover(boxOf(q)) * 40 + q.cost; if (v < bc) { bc = v; best = q; } }
  return { x: best.x, y: best.y, layout: best.layout, bare: false };
}

// el: the key's element (positioned by --fx and --fy, wrapped in the presenter's layer); wrap: the figure's box; order(): the corners
// wanted now; left(): where the figure's open part starts on a wide screen (in wrap px; 0 on a phone).
export function createFigureKey({ el, wrap, app, order, left = () => 0 }) {
  let on = false, pos = null, held = null, layout = 'row', raf = 0, waitT = 0, showT = 0, hideT = 0, swapT = 0, poll = 0, changedAt = 0, lastSig = '', worldKey = '', worldAt = 0;
  const sizes = {};
  const empty = () => el.dataset.empty != null;
  // The key's box in each layout, as it is now (its words may have changed).
  function measure() {
    const was = el.className, hid = el.hidden;
    el.hidden = false;
    for (const l of ['row', 'col']) {
      el.classList.toggle('col', l === 'col');
      sizes[l] = { w: el.offsetWidth, h: el.offsetHeight, layout: l };
    }
    el.className = was; el.hidden = hid;
  }
  const rectOf = (q, wr) => {
    if (q === el) return null;
    const s = getComputedStyle(q);
    if (s.display === 'none' || s.visibility === 'hidden' || q.classList.contains('pz-hide')) return null;
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const k of [q.getBoundingClientRect(), ...[...q.children].map((c) => c.getBoundingClientRect())]) {
      if (!k.width || !k.height) continue;
      l = Math.min(l, k.left); t = Math.min(t, k.top); r = Math.max(r, k.right); b = Math.max(b, k.bottom);
    }
    return r > l ? { l: l - wr.left, t: t - wr.top, r: r - wr.left, b: b - wr.top } : null;
  };
  function fade(spot) {
    clearTimeout(showT);
    const put = () => {
      if (empty()) return;
      clearTimeout(hideT);
      const k = wrap.getBoundingClientRect().width / (wrap.clientWidth || 1) || 1;
      el.classList.toggle('col', spot.layout === 'col');
      el.style.setProperty('--fx', `${(spot.x / k).toFixed(1)}px`);
      el.style.setProperty('--fy', `${(spot.y / k).toFixed(1)}px`);
      pos = spot; held = null; layout = spot.layout; el.hidden = false;
      void el.offsetWidth;
      el.classList.add('on'); on = true;
      dispatchEvent(new Event('pps:occ'));   // (the credit finds its own spot around the key)
    };
    if (on) { el.classList.remove('on'); on = false; showT = setTimeout(put, 220); } else put();
  }
  // Out of sight (fading), and out of the way once it has faded.
  // (keep: another lens on the same slide: the key comes back to the spot it had while that spot is still clear.)
  function off(keep = false) {
    clearTimeout(showT); clearTimeout(waitT); clearTimeout(hideT);
    held = keep ? pos || held : null;
    el.classList.remove('on'); on = false; pos = null; changedAt = 0; lastSig = '';
    hideT = setTimeout(() => { if (!on) el.hidden = true; }, 320);
  }
  function check() {
    raf = 0;
    if (empty() || !wrap.offsetParent) return;
    // A slide change: out of sight until the cards are in and the camera has settled.
    if (app.classList.contains('pz-moving')) { if (on || pos) off(); return; }
    const wm = document.getElementById('world')?.getScreenCTM(), wk = wm ? [wm.a, wm.d, wm.e, wm.f].map((v) => v.toFixed(2)).join(',') : '';
    if (wk !== worldKey) { worldKey = wk; worldAt = performance.now(); }
    if (performance.now() - worldAt < 250) { clearTimeout(waitT); waitT = setTimeout(soon, 260); return; }
    const wr = wrap.getBoundingClientRect(), k = wr.width / (wrap.clientWidth || wr.width) || 1;
    measure();
    const fig = { l: Math.min(left(), wr.width / 2), t: 0, r: wr.width, b: wr.height };   // (a wide screen: the figure's own part, right of the cards' column)
    const els = [...document.querySelectorAll(OBSTACLES)], obs = [...els.map((q) => rectOf(q, wr)), ...labelRects(wr, wrap)].filter((o) => o && hit(o, { l: 0, t: 0, r: wr.width, b: wr.height }));
    const sig = obs.map((o) => [o.l, o.t, o.r, o.b].map(Math.round).join(',')).join(';') + `|${sizes.row.w}x${sizes.row.h}|${wr.width}x${wr.height}`;
    const now = performance.now();
    // A card still sliding or fading in is not where it will settle: wait for it (for a moment, not forever).
    const settling = els.some((q) => q !== el && [q, ...q.children].some((c) => c.getAnimations().some((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime))));
    if (settling || (lastSig && sig !== lastSig)) {
      lastSig = sig; changedAt ||= now;
      if (now - changedAt < 1600) { clearTimeout(waitT); waitT = setTimeout(soon, 50); return; }
    }
    changedAt = 0; lastSig = sig;
    const art = organTest(wr), zs = [sizes.row, sizes.col].map((z) => ({ ...z, w: z.w * k, h: z.h * k }));
    // (The spot it has, or held from the last words, drawn in again for the new words' size (kept in from the figure's edge), still clear of every card, label and bit of art, is taken as it is.)
    const cur = pos || held, z = cur && zs.find((q) => q.layout === cur.layout);
    const at = z && { ...cur, x: Math.min(cur.x, fig.r - 14 - z.w), y: Math.min(cur.y, fig.b - 14 - z.h) }, box = z && { l: at.x, t: at.y, r: at.x + z.w, b: at.y + z.h };
    const spot = z && box.l >= fig.l && !obs.some((o) => hit({ l: box.l - 8, t: box.t - 8, r: box.r + 8, b: box.b + 8 }, o)) && !art(box, { pad: 6 })
      ? at : pickKeySpot({ fig, obs, sizes: zs, order: order(), art });
    if (!spot) { if (on || pos) off(); return; }
    // (The same spot, or a nudge of a few pixels, stays as it is.)
    if (on && pos && spot.layout === layout && Math.abs(spot.x - pos.x) <= 6 && Math.abs(spot.y - pos.y) <= 6) return;
    fade(spot);
  }
  function soon() { if (!raf) raf = nextFrame(check); }
  const onEvent = () => { if (!empty()) soon(); };
  const settled = (e) => { if (!e.target.classList?.contains('rb-fill')) onEvent(); };
  addEventListener('resize', onEvent);
  addEventListener('pps:occ', onEvent);
  addEventListener('transitionend', settled, true);
  addEventListener('animationend', settled, true);
  const mo = new MutationObserver(onEvent);
  mo.observe(app, { attributes: true, attributeFilter: ['class'] });
  return {
    // The key's words changed (a new slide, or another lens), or it has none: look again at once.
    // fill() writes the new words: at once when the key is out of sight, else once it has faded.
    set(has, fill) {
      clearInterval(poll); clearTimeout(swapT);
      if (!has) { el.dataset.empty = ''; off(); return; }
      delete el.dataset.empty; layout = 'row';
      poll = setInterval(() => { if (!document.hidden) soon(); }, 1000);
      if (!on) { off(); fill?.(); soon(); return; }
      off(true);
      swapT = setTimeout(() => { fill?.(); el.hidden = false; soon(); }, 200);
    },
    refresh: soon,
    dispose() {
      for (const t of [showT, hideT, waitT, swapT]) clearTimeout(t);
      clearInterval(poll); cancelFrame(raf); raf = 0; mo.disconnect();
      removeEventListener('resize', onEvent); removeEventListener('pps:occ', onEvent);
      removeEventListener('transitionend', settled, true); removeEventListener('animationend', settled, true);
    },
  };
}
