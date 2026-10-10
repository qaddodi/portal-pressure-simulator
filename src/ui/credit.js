// The corner credit finds a free spot on the figure: never on or touching a card, a sheet, a bar or a menu.
// It keeps its corner while that corner stays free and never glides: any move fades it out in place, jumps it
// unseen and fades it back in, once the cards have settled; with no figure left anywhere it stays faded out.

// Corners in order of preference. A bottom corner rises above whatever covers it (up to the middle of the figure);
// a top corner drops below whatever covers it.
export const CORNERS = ['bl', 'br', 'tl', 'tr'];

const hit = (a, o) => a.l < o.r && a.r > o.l && a.t < o.b && a.b > o.t;

// fig, obstacles: rects { l, t, r, b } in one frame. Returns { bl, br, tl, tr }: the top-left point of the free box
// of size w × h nearest each corner, or null.
export function freeSpots(fig, obs, w, h, { gap = 10, inset = 12 } = {}) {
  const out = {}, H = fig.b - fig.t;
  for (const c of CORNERS) {
    const x = c[1] === 'l' ? fig.l + inset : fig.r - inset - w, up = c[0] === 'b';
    let y = up ? fig.b - inset - h : fig.t + inset, spot = null;
    if (x < fig.l || x + w > fig.r) { out[c] = null; continue; }
    for (let i = 0; i < 40; i++) {
      if (up ? y < fig.t + H * 0.45 - h : y + h > fig.t + H * 0.55 + h) break;
      const box = { l: x - gap, t: y - gap, r: x + w + gap, b: y + h + gap };
      const o = obs.filter((q) => hit(box, q));
      if (!o.length) { spot = { x, y }; break; }
      y = up ? Math.min(...o.map((q) => q.t)) - gap - h : Math.max(...o.map((q) => q.b)) + gap;
    }
    out[c] = spot && spot.y >= fig.t && spot.y + h <= fig.b ? spot : null;
  }
  return out;
}

// Which corner to use: the current one while it stays free, else the first free corner in order.
export function pickCorner(spots, cur) {
  if (cur && spots[cur]) return cur;
  return CORNERS.find((c) => spots[c]) || null;
}

// What the credit keeps clear of. Chrome (the bars, the zoom pill) is avoided but does not make the screen "busy".
const OBSTACLES = '.stage-blocker:not([hidden]), .stage-clock, .menu, .umenu:not(.out), .why-pop.show, .modal-back.show, .home:not([hidden])';
const CHROME = '#topbar, #vdock, #zoomPill, .stage-clock, .pz-bar, .pz-count';

export function createCreditPlacer(credit) {
  const wrap = credit.offsetParent || credit.parentElement;
  let cur = null, pos = null, moving = false, changedAt = 0, lastSig = '', raf = 0, waitT = 0, moveT = 0, betterSince = 0, size = null, sizeKey = '';
  const measure = (busy) => {
    const key = innerWidth + 'x' + innerHeight;
    if (key !== sizeKey) {
      sizeKey = key; size = {};
      for (const b of [false, true]) {
        const c = credit.cloneNode(true);
        c.className = 'stage-credit' + (b ? ' busy' : '');
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
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { l: r.left - wr.left, t: r.top - wr.top, r: r.right - wr.left, b: r.bottom - wr.top, chrome: el.matches(CHROME) };
  };
  const place = (c, p) => {
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
    const obs = [...document.querySelectorAll(OBSTACLES)].map((el) => rectOf(el, wr)).filter((o) => o && hit(o, fig));
    const busy = obs.some((o) => !o.chrome);
    credit.classList.toggle('busy', busy);
    if (busy) ({ w, h } = measure(true));
    const sig = obs.map((o) => [o.l, o.t, o.r, o.b].map(Math.round).join(',')).join(';') + '|' + w + '|' + wr.width + 'x' + wr.height;
    const now = performance.now();
    if (sig !== lastSig) {
      // Something moved: if it now reaches the credit, fade out at once; let it settle before choosing a new spot
      // (but not forever: a piece that keeps moving is taken where it is after a moment).
      lastSig = sig;
      if (pos && obs.some((o) => hit({ l: pos.x - 4, t: pos.y - 4, r: pos.x + w + 4, b: pos.y + h + 4 }, o))) credit.classList.add('moving');
      changedAt ||= now;
      if (now - changedAt < 700) { clearTimeout(waitT); waitT = setTimeout(soon, 120); return; }
    }
    changedAt = 0;
    const spots = freeSpots(fig, obs, w, h, { inset: wr.width < 768 ? 12 : 24 });
    let c = pickCorner(spots, cur);
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
    if (c === cur && !credit.classList.contains('moving') && !credit.classList.contains('covered') && Math.abs(p.x - pos.x) < 1 && Math.abs(p.y - pos.y) < 1) return;
    if (!pos || credit.classList.contains('covered') || credit.classList.contains('moving')) { place(c, p); return; }
    // A new spot: fade out in place, jump there unseen, fade back in (never a slide across the figure).
    credit.classList.add('moving');
    moving = true;
    clearTimeout(moveT);
    moveT = setTimeout(() => { moving = false; place(c, p); soon(); }, 260);
  }
  function soon() { if (!raf) raf = requestAnimationFrame(check); }
  addEventListener('resize', soon);
  addEventListener('pps:occ', soon);
  addEventListener('transitionend', soon, true);
  addEventListener('animationend', soon, true);
  const app = document.getElementById('app');
  if (app) new MutationObserver(soon).observe(app, { attributes: true, attributeFilter: ['class'] });
  // Cards open, close and resize in many ways; a light poll catches the ones no event announces.
  setInterval(() => { if (!document.hidden) soon(); }, 450);
  soon();
  return { refresh: soon, corner: () => cur };
}
