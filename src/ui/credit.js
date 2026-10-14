// The corner credit finds a free spot on the figure: never on or touching a card, a sheet, a bar or a menu.
// It keeps its corner while that corner stays free and is never animated (no glide, no fade): any move hides it at once,
// holds it hidden until the cards have settled, then shows it at once at the new spot; with no figure left anywhere it stays hidden.
import { frameFor } from './frame.js?v=0db47e99bf';
const nextFrame = frameFor('credit');

// Corners in order of preference. A bottom corner rises above whatever covers it (up to the middle of the figure);
// a top corner drops below whatever covers it.
export const CORNERS = ['bl', 'br', 'tl', 'tr'];

const hit = (a, o) => a.l < o.r && a.r > o.l && a.t < o.b && a.b > o.t;

// fig, obstacles: rects { l, t, r, b } in one frame. Returns { bl, br, tl, tr }: the top-left point of the free box
// of size w × h nearest each corner, or null. A corner that no card clears by moving up or down is tried again beside
// each card, further along the same edge (a phone held sideways: the strip of figure between the words' pane and the data card).
// avoid(box): true for a spot the credit should not take though no card covers it (over an organ's art); such a spot is passed
// over like a covered one.
export function freeSpots(fig, obs, w, h, { gap = 10, inset = 12, avoid = null } = {}) {
  const out = {}, H = fig.b - fig.t;
  // A free spot at x: from y0 toward the middle, past the cards (and the art to avoid) it meets.
  const walk = (x, y0, up = y0 > fig.t + H / 2) => {
    if (x < fig.l || x + w > fig.r) return null;
    let y = y0;
    for (let i = 0; i < 40; i++) {
      if (up ? y < fig.t + H * 0.45 - h : y + h > fig.t + H * 0.55 + h) return null;
      const box = { l: x - gap, t: y - gap, r: x + w + gap, b: y + h + gap };
      const o = obs.filter((q) => hit(box, q));
      if (!o.length && !avoid?.({ l: x, t: y, r: x + w, b: y + h })) return y >= fig.t && y + h <= fig.b ? { x, y } : null;
      y = !o.length ? (up ? y - h / 2 : y + h / 2) : up ? Math.min(...o.map((q) => q.t)) - gap - h : Math.max(...o.map((q) => q.b)) + gap;
    }
    return null;
  };
  for (const c of CORNERS) {
    const left = c[1] === 'l', up = c[0] === 'b', x0 = left ? fig.l + inset : fig.r - inset - w;
    const xs = [x0, ...obs.map((q) => (left ? q.r + gap : q.l - gap - w)).filter((x) => (left ? x > x0 : x < x0)).sort((p, q) => (left ? p - q : q - p))];
    out[c] = null;
    // (With art to avoid, the spot may also step in along its edge, 40 px at a time up to the middle; of the spots found, the
    // one nearest its corner, a step in counting half a step down.)
    if (avoid) {
      for (let k = 1; k * 40 < (fig.r - fig.l) * 0.5 - w; k++) xs.push(left ? x0 + k * 40 : x0 - k * 40);
      let best = null, bc = Infinity;
      for (const x of xs) {
        const y0 = up ? fig.b - inset - h : fig.t + inset, p = walk(x, y0);
        if (!p) continue;
        const cost = Math.abs(p.y - y0) + 0.5 * Math.abs(x - x0);
        if (cost < bc) { bc = cost; best = p; }
      }
      out[c] = best;
      continue;
    }
    for (const x of xs) {
      if (x < fig.l || x + w > fig.r) continue;
      let y = up ? fig.b - inset - h : fig.t + inset, spot = null;
      for (let i = 0; i < 40; i++) {
        if (up ? y < fig.t + H * 0.45 - h : y + h > fig.t + H * 0.55 + h) break;
        const box = { l: x - gap, t: y - gap, r: x + w + gap, b: y + h + gap };
        const o = obs.filter((q) => hit(box, q));
        if (!o.length && !avoid?.({ l: x, t: y, r: x + w, b: y + h })) { spot = { x, y }; break; }
        y = !o.length ? (up ? y - h - gap : y + h + gap) : up ? Math.min(...o.map((q) => q.t)) - gap - h : Math.max(...o.map((q) => q.b)) + gap;
      }
      if (spot && spot.y >= fig.t && spot.y + h <= fig.b) { out[c] = spot; break; }
    }
  }
  return out;
}

// Which corner to use: the current one while it stays free (it never goes back to a corner it left just because that one
// freed up); else the free corner that has gone longest without being covered (blocked: corner -> when a card last covered
// it), ties in the order above. A corner a card keeps coming back to is the last to be chosen, so the credit rarely moves.
export function pickCorner(spots, cur, blocked = {}) {
  if (cur && spots[cur]) return cur;
  const free = CORNERS.filter((c) => spots[c]);
  return free.sort((a, b) => (blocked[a] ?? -Infinity) - (blocked[b] ?? -Infinity))[0] || null;
}

// What the credit keeps clear of. Chrome (the bars, the zoom pill, the figure's labels) is avoided but does not make the screen "busy".
const OBSTACLES = '.stage-blocker:not([hidden]), .stage-clock, .menu, .umenu:not(.out), .why-pop.show, .modal-back.show, .home:not([hidden]), .scan-probe:not(.off) .sp-body, .pz-shade';   // (the FibroScan probe's body carries its reading; it counts as chrome below)
const CHROME = '#topbar, #vdock, #zoomPill, .stage-clock, .pz-bar, .scan-probe:not(.off) .sp-body';   // (the FibroScan probe: its body carries the reading)

// The figure's own labels (station values, organ captions): each one's text and pill, padded and snapped outward to a small
// grid, so a label that jitters by a pixel as its number changes does not read as a move.
const GRID = 8;
function labelRects(wr, wrap) {
  const out = [], seen = new Map();   // the shared ancestors' own opacity, read once per pass
  const own = (el) => { let v = seen.get(el); if (v === undefined) { const s = getComputedStyle(el); v = s.display === 'none' || s.visibility === 'hidden' ? 0 : +s.opacity; seen.set(el, v); } return v; };
  for (const g of document.querySelectorAll('#labels .lb:not(.lb-off)')) {
    let o = 1;
    for (let el = g; el && el !== wrap && o > 0.01; el = el.parentElement) o *= own(el);
    if (o <= 0.01) continue;
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const q of g.querySelectorAll('text, .lb-bg')) {
      const k = q.getBoundingClientRect();
      if (k.width < 1 || k.height < 1) continue;
      l = Math.min(l, k.left); t = Math.min(t, k.top); r = Math.max(r, k.right); b = Math.max(b, k.bottom);
    }
    if (r <= l) continue;
    out.push({ l: Math.floor((l - wr.left - 2) / GRID) * GRID, t: Math.floor((t - wr.top - 2) / GRID) * GRID, r: Math.ceil((r - wr.left + 2) / GRID) * GRID, b: Math.ceil((b - wr.top + 2) / GRID) * GRID, chrome: true });
  }
  return out;
}

// A test for spots over the figure's art (wrap px): the credit sits on bare background, never on an organ or a vessel nor
// touching an outline (Mohammad, 14 Oct). The art is sampled on a 6 px grid (each shape's fill and stroke, a cell once per
// layout, when first asked), grown by `pad` px all round, and a box is tested against every cell it covers, so a thin
// outline running between a few sample points is never missed.
const CELL = 6;
const ART = 'g.organ :is(path, circle, ellipse, rect, polygon):not(.org-shade), #edges :is(.v-lumen, .v-lumenP, .v-strand)';
let organMemo = { key: '', test: null };
function organTest(wr, pad = 18) {
  const world = document.getElementById('world')?.getScreenCTM(), key = [wr.left, wr.top, wr.width, wr.height, world && [world.a, world.d, world.e, world.f].map((v) => v.toFixed(2))].join('|');
  if (organMemo.key === key) return organMemo.test;
  const cols = Math.ceil(wr.width / CELL) + 1, rows = Math.ceil(wr.height / CELL) + 1, on = new Int8Array(cols * rows).fill(-1);
  const shapes = [];
  for (const el of document.querySelectorAll(ART)) {
    const m = el.getScreenCTM?.(), r = el.getBoundingClientRect();
    if (!m || !r.width || getComputedStyle(el).display === 'none') continue;   // (drawn as a bitmap plate, the shapes stay in place but hidden: they still count)
    const sw = el.matches('#edges *') ? 3 : 0;   // (a vessel's few pixels of edge)
    shapes.push({ el, inv: m.inverse(), l: r.left - wr.left - sw, t: r.top - wr.top - sw, r: r.right - wr.left + sw, b: r.bottom - wr.top + sw });
  }
  const pt = new DOMPoint();
  // (Each cell is sampled once, when a spot first asks about it: one point at its centre against the shapes over it.)
  const cell = (i, j) => {
    const k = j * cols + i;
    if (on[k] >= 0) return on[k];
    const x = (i + 0.5) * CELL, y = (j + 0.5) * CELL;
    let v = 0;
    pt.x = wr.left + x; pt.y = wr.top + y;
    for (const q of shapes) {
      if (x < q.l || x > q.r || y < q.t || y > q.b) continue;
      const p = pt.matrixTransform(q.inv);
      if (q.el.isPointInFill(p) || q.el.isPointInStroke(p)) { v = 1; break; }
    }
    return (on[k] = v);
  };
  const test = (box) => {
    const c0 = Math.max(0, Math.floor((box.l - pad) / CELL)), c1 = Math.min(cols - 1, Math.floor((box.r + pad) / CELL));
    const r0 = Math.max(0, Math.floor((box.t - pad) / CELL)), r1 = Math.min(rows - 1, Math.floor((box.b + pad) / CELL));
    for (let j = r0; j <= r1; j++) for (let i = c0; i <= c1; i++) if (cell(i, j)) return true;
    return false;
  };
  organMemo = { key, test };
  return test;
}

export function createCreditPlacer(credit) {
  const wrap = credit.offsetParent || credit.parentElement, app = document.getElementById('app');
  const blocked = {};   // corner -> when a card last covered it
  let cur = null, curTight = false, pos = null, moving = false, changedAt = 0, lastSig = '', raf = 0, waitT = 0, moveT = 0, size = null, sizeKey = '';
  const measure = (busy) => {
    const key = innerWidth + 'x' + innerHeight;
    if (key !== sizeKey) {
      sizeKey = key; size = {};
      for (const b of [false, true, 'tight']) {
        const c = credit.cloneNode(true);
        c.className = 'stage-credit' + (b ? ' busy' : '') + (b === 'tight' ? ' tight' : '');
        Object.assign(c.style, { visibility: 'hidden', transition: 'none', translate: 'none', top: '0', left: '0', bottom: 'auto' });
        wrap.append(c);
        size[b] = { w: c.offsetWidth, h: c.offsetHeight };
        if (b) {
          // The notch's side margins (a phone held sideways), kept clear like a card.
          c.style.padding = '0 env(safe-area-inset-right, 0px) 0 env(safe-area-inset-left, 0px)';
          const cs = getComputedStyle(c);
          size.sl = parseFloat(cs.paddingLeft) || 0; size.sr = parseFloat(cs.paddingRight) || 0;
        }
        c.remove();
      }
    }
    return size[busy];
  };
  const rectOf = (el, wr) => {
    if (el === credit || credit.contains(el)) return null;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || el.classList.contains('pz-hide')) return null;
    // A pane can draw outside its own box (the phone slide's words hang above a zero-height holder): take its children too.
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const q of [el.getBoundingClientRect(), ...[...el.children].map((k) => k.getBoundingClientRect())]) {
      if (!q.width || !q.height) continue;
      l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom);
    }
    if (r <= l) return null;
    return { l: l - wr.left, t: t - wr.top, r: r - wr.left, b: b - wr.top, chrome: el.matches(CHROME) };
  };
  const place = (c, p, tight = false) => {
    credit.classList.toggle('tight', tight);
    curTight = tight;
    credit.style.setProperty('--cx', `${Math.round(p.x)}px`);
    credit.style.setProperty('--cy', `${Math.round(p.y)}px`);
    cur = c; pos = p;
    credit.classList.add('placed');
    credit.classList.remove('moving', 'covered');
  };
  function check() {
    raf = 0;
    if (moving || !credit.isConnected || !wrap.offsetParent) return;
    // A slide change (the presenter's pz-moving): out of sight until the cards are in and the camera has settled; it then
    // appears at once at its final spot.
    if (app?.classList.contains('pz-moving')) { credit.classList.add('moving'); changedAt = 0; lastSig = ''; return; }
    const wr = wrap.getBoundingClientRect();
    let { w, h } = measure(false);
    const fig = { l: size.sl, t: 0, r: wr.width - size.sr, b: wr.height };
    const els = [...document.querySelectorAll(OBSTACLES)], obs = [...els.map((el) => rectOf(el, wr)), ...labelRects(wr, wrap)].filter((o) => o && hit(o, fig));
    const busy = obs.some((o) => !o.chrome);
    credit.classList.toggle('busy', busy);
    if (busy) ({ w, h } = measure(true));
    const sig = obs.map((o) => [o.l, o.t, o.r, o.b].map(Math.round).join(',')).join(';') + '|' + w + '|' + wr.width + 'x' + wr.height;
    const now = performance.now();
    // A card still sliding or fading in is not where it will settle: wait for it (and for its size to stop changing).
    // (The card and its blocks only: a live instrument deep inside eases all the time and kept the credit hidden.)
    const settling = els.some((el) => [el, ...el.children].some((c) => c.getAnimations().some((an) => an.playState === 'running' && Number.isFinite(an.effect?.getComputedTiming().endTime))));
    if (sig !== lastSig || settling) {
      // Something moved: if it now reaches the credit, hide it at once; let it settle before choosing a new spot
      // (but not forever: a piece that keeps moving is taken where it is after a moment).
      lastSig = sig;
      const hitNow = pos && obs.some((o) => hit({ l: pos.x - 4, t: pos.y - 4, r: pos.x + w + 4, b: pos.y + h + 4 }, o));
      if (hitNow) credit.classList.add('moving');
      // (Shown and still clear: it stays painted where it is while the rest settles; it waits only when it has to move.)
      if (hitNow || !pos || credit.matches('.moving, .covered')) {
        changedAt ||= now;
        if (now - changedAt < 1600) { clearTimeout(waitT); waitT = setTimeout(soon, 120); return; }
      }
    }
    changedAt = 0;
    // (One margin with the cards: the credit's edge lines up with the presenter's cards, the screen's margin.)
    const shade = document.querySelector('.pz-shade'), sr = shade && getComputedStyle(shade).opacity !== '0' ? shade.getBoundingClientRect() : null;
    const opt = { gap: wr.width < 768 ? 12 : 24, inset: sr?.width ? Math.max(12, Math.round(sr.left - wr.left - fig.l)) : wr.width < 768 ? 12 : 24 };   // (a clear gap from every card: 24 px on a laptop or tablet)
    let spots = freeSpots(fig, obs, w, h, opt), tight = false;
    for (const k of CORNERS) if (!spots[k]) blocked[k] = now;
    // (Spots clear of the organs' art too, found the same way (stepping in along the edge if need be), where there are any;
    // else the plain spots, so the credit always shows.)
    const bare = freeSpots(fig, obs, w, h, { ...opt, avoid: organTest(wr) });
    // (A slide on a laptop or tablet: one spot, the figure's top right, whenever it is free; a phone keeps the corner order.)
    const pref = app?.classList.contains('presenting') && document.querySelector('.pz:not(.stack)') ? 'tr' : null, pool = CORNERS.some((k) => bare[k]) ? bare : spots;
    if (pool === bare) spots = bare;
    let c = pref && pool[pref] ? pref : pickCorner(pool, cur, blocked);
    if (!c) {
      // Not on one line: try it on two, before giving the figure up as covered.
      const t = measure('tight'), tspots = freeSpots(fig, obs, t.w, t.h, opt), tc = pickCorner(tspots, cur, blocked);
      if (tc) { spots = tspots; c = tc; tight = true; }
    }
    if (!c) { credit.classList.add('covered'); return; }
    const p = spots[c];
    if (c === cur && tight === curTight && !credit.classList.contains('moving') && !credit.classList.contains('covered') && Math.abs(p.x - pos.x) <= 4 && Math.abs(p.y - pos.y) <= 4) {
      // A nudge of a few pixels (its own size easing to the busy size) is taken in place.
      if (p.x !== pos.x || p.y !== pos.y) place(c, p, tight);
      return;
    }
    if (!pos || credit.classList.contains('covered') || credit.classList.contains('moving')) { place(c, p, tight); return; }
    // A new spot: hide at once, hold hidden a moment, show at once there (never a slide across the figure, never a fade).
    credit.classList.add('moving');
    moving = true;
    clearTimeout(moveT);
    moveT = setTimeout(() => { moving = false; if (app?.classList.contains('pz-moving')) return soon(); place(c, p, tight); soon(); }, 260);
  }
  function soon() { if (!raf) raf = nextFrame(check); }
  addEventListener('resize', soon);
  addEventListener('pps:occ', soon);
  // Readout bars ease on every value and never cover the figure: their transitions are not a reason to look again.
  const settled = (e) => { if (!e.target.classList?.contains('rb-fill')) soon(); };
  addEventListener('transitionend', settled, true);
  addEventListener('animationend', settled, true);
  if (app) new MutationObserver(soon).observe(app, { attributes: true, attributeFilter: ['class'] });
  // Cards open, close and resize in many ways; a light poll catches the ones no event announces.
  setInterval(() => { if (!document.hidden) soon(); }, 1000);
  soon();
  return { refresh: soon, corner: () => cur };
}
