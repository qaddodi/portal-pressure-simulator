// The corner credit finds a free spot on the figure: never on or touching a card, a sheet, a bar or a menu.
// It keeps its corner while that corner stays free and never glides: any move fades it out in place, jumps it
// unseen and fades it back in, once the cards have settled; with no figure left anywhere it stays faded out.
import { frameFor } from './frame.js?v=0db47e99bf';
const nextFrame = frameFor('credit');

// Corners in order of preference. A bottom corner rises above whatever covers it (up to the middle of the figure);
// a top corner drops below whatever covers it.
export const CORNERS = ['bl', 'br', 'tl', 'tr'];

const hit = (a, o) => a.l < o.r && a.r > o.l && a.t < o.b && a.b > o.t;

// fig, obstacles: rects { l, t, r, b } in one frame. Returns { bl, br, tl, tr }: the top-left point of the free box
// of size w × h nearest each corner, or null. A corner that no card clears by moving up or down is tried again beside
// each card, further along the same edge (a phone held sideways: the strip of figure between the words' pane and the data card).
export function freeSpots(fig, obs, w, h, { gap = 10, inset = 12 } = {}) {
  const out = {}, H = fig.b - fig.t;
  for (const c of CORNERS) {
    const left = c[1] === 'l', up = c[0] === 'b', x0 = left ? fig.l + inset : fig.r - inset - w;
    const xs = [x0, ...obs.map((q) => (left ? q.r + gap : q.l - gap - w)).filter((x) => (left ? x > x0 : x < x0)).sort((p, q) => (left ? p - q : q - p))];
    out[c] = null;
    for (const x of xs) {
      if (x < fig.l || x + w > fig.r) continue;
      let y = up ? fig.b - inset - h : fig.t + inset, spot = null;
      for (let i = 0; i < 40; i++) {
        if (up ? y < fig.t + H * 0.45 - h : y + h > fig.t + H * 0.55 + h) break;
        const box = { l: x - gap, t: y - gap, r: x + w + gap, b: y + h + gap };
        const o = obs.filter((q) => hit(box, q));
        if (!o.length) { spot = { x, y }; break; }
        y = up ? Math.min(...o.map((q) => q.t)) - gap - h : Math.max(...o.map((q) => q.b)) + gap;
      }
      if (spot && spot.y >= fig.t && spot.y + h <= fig.b) { out[c] = spot; break; }
    }
  }
  return out;
}

// Which corner to use: the current one while it stays free, else the first free corner in order.
export function pickCorner(spots, cur) {
  if (cur && spots[cur]) return cur;
  return CORNERS.find((c) => spots[c]) || null;
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

export function createCreditPlacer(credit) {
  const wrap = credit.offsetParent || credit.parentElement;
  let cur = null, curTight = false, pos = null, moving = false, changedAt = 0, lastSig = '', raf = 0, waitT = 0, moveT = 0, betterSince = 0, size = null, sizeKey = '';
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
    const settling = els.some((el) => el.getAnimations({ subtree: true }).some((an) => an.playState === 'running' && Number.isFinite(an.effect?.getComputedTiming().endTime)));
    if (sig !== lastSig || settling) {
      // Something moved: if it now reaches the credit, fade out at once; let it settle before choosing a new spot
      // (but not forever: a piece that keeps moving is taken where it is after a moment).
      lastSig = sig;
      if (pos && obs.some((o) => hit({ l: pos.x - 4, t: pos.y - 4, r: pos.x + w + 4, b: pos.y + h + 4 }, o))) credit.classList.add('moving');
      changedAt ||= now;
      if (now - changedAt < 1600) { clearTimeout(waitT); waitT = setTimeout(soon, 120); return; }
    }
    changedAt = 0;
    const opt = { inset: wr.width < 768 ? 12 : 24 };
    let spots = freeSpots(fig, obs, w, h, opt), tight = false;
    let c = pickCorner(spots, cur);
    if (!c) {
      // Not on one line: try it on two, before giving the figure up as covered.
      const t = measure('tight'), tspots = freeSpots(fig, obs, t.w, t.h, opt), tc = pickCorner(tspots, cur);
      if (tc) { spots = tspots; c = tc; tight = true; }
    }
    if (!c) { credit.classList.add('covered'); return; }
    // A preferred corner that has been free for a while takes the credit back (not on every brief opening).
    const pref = CORNERS.find((k) => spots[k]);
    if (c === cur && pref !== cur) {
      betterSince ||= now;
      if (now - betterSince > 1500) c = pref;
      else { clearTimeout(waitT); waitT = setTimeout(soon, 400); }
    } else betterSince = 0;
    if (c !== cur) betterSince = 0;
    const p = spots[c];
    if (c === cur && tight === curTight && !credit.classList.contains('moving') && !credit.classList.contains('covered') && Math.abs(p.x - pos.x) <= 4 && Math.abs(p.y - pos.y) <= 4) {
      // A nudge of a few pixels (its own size easing to the busy size) is taken in place, without a fade.
      if (p.x !== pos.x || p.y !== pos.y) place(c, p, tight);
      return;
    }
    if (!pos || credit.classList.contains('covered') || credit.classList.contains('moving')) { place(c, p, tight); return; }
    // A new spot: fade out in place, jump there unseen, fade back in (never a slide across the figure).
    credit.classList.add('moving');
    moving = true;
    clearTimeout(moveT);
    moveT = setTimeout(() => { moving = false; place(c, p, tight); soon(); }, 260);
  }
  function soon() { if (!raf) raf = nextFrame(check); }
  addEventListener('resize', soon);
  addEventListener('pps:occ', soon);
  // Readout bars ease on every value and never cover the figure: their transitions are not a reason to look again.
  const settled = (e) => { if (!e.target.classList?.contains('rb-fill')) soon(); };
  addEventListener('transitionend', settled, true);
  addEventListener('animationend', settled, true);
  const app = document.getElementById('app');
  if (app) new MutationObserver(soon).observe(app, { attributes: true, attributeFilter: ['class'] });
  // Cards open, close and resize in many ways; a light poll catches the ones no event announces.
  setInterval(() => { if (!document.hidden) soon(); }, 1000);
  soon();
  return { refresh: soon, corner: () => cur };
}
