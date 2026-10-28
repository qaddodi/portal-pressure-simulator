// The data card zoomed to the middle of the screen (Mac and iPad landscape; Mohammad, 28 Oct: "the camera should like zoom on the card to
// display it centered large in middle of the screen", the text "shouldn't like make the text smaller"). The card, and the handle that rides
// on its edge, glide and grow as one piece by a transform, so its words and pictures only get larger; a veil dims everything else, and
// the figure behind stays exactly where it is (Mohammad, 28 Oct: "don't move anything"). Nothing pauses: the instrument, the model and the
// figure run on under it.
// The presenter lays nothing out while the card is up (the card and the handle report the places they rest, so the figure's labels and
// the camera keep to them) and puts the card back before a slide changes.

export const ZOOM_MAX = 2.2;    // the most the card grows
export const ZOOM_MIN = 1.2;    // under this the card is large enough; no zoom is offered
export const ZOOM_MS = 520;     // in
export const SHUT_MS = 440;     // and back
const EASE = 'cubic-bezier(.2, .8, .2, 1)';   // (tokens.css --ease)

// The room left round the card on the screen: a tenth of the shorter side, between 72 and 110 px (the nav pill and the scale switch, 44 px
// tall a margin up from the foot, stay clear of it).
export const zoomMargin = (area) => Math.min(110, Math.max(72, 0.1 * Math.min(area.width, area.height)));

/** Where the card goes and how much it grows: { s, dx, dy } (screen px, dx and dy from the card's middle to the area's), or null when
 *  it would grow under ZOOM_MIN. card and area: { left, top, width, height }. */
export function zoomPlan(card, area, margin = zoomMargin(area)) {
  if (!(card.width > 0) || !(card.height > 0) || !(area.width > 0) || !(area.height > 0)) return null;
  const s = Math.min(ZOOM_MAX, (area.width - 2 * margin) / card.width, (area.height - 2 * margin) / card.height);
  if (!(s >= ZOOM_MIN)) return null;
  return { s, dx: area.left + area.width / 2 - (card.left + card.width / 2), dy: area.top + area.height / 2 - (card.top + card.height / 2) };
}

// What a tap on the card leaves alone: controls, and anything drawn to be pressed.
const LIVE = 'a[href], button, input, select, textarea, label, summary, [role="button"], [role="slider"], [role="tab"], [role="switch"], [role="checkbox"], [contenteditable="true"], .range-wrap, .pz-lip, [data-no-zoom]';

/** Whether a tap that came down on target (inside card) is on an empty part of the card, so it zooms it. A control keeps its own tap, and so
 *  does anything with a pointer cursor (a row or a picture drawn to be pressed). */
export function emptyTap(target, card) {
  for (let n = target; n && n !== card; n = n.parentElement) {
    if (n.matches?.(LIVE)) return false;
    if (n.nodeType === 1 && globalThis.getComputedStyle?.(n).cursor === 'pointer') return false;
  }
  return true;
}

/** A tap, from a pointer's down and up: one finger or the primary button, kept under 8 px and 650 ms. Fed the events of the card;
 *  onTap runs once for a tap that began on an empty part of it (emptyTap) and may begin one (ok). */
export function tapTracker(card, { ok = () => true, onTap }) {
  let t = null;
  card.addEventListener('pointerdown', (e) => {
    t = e.isPrimary !== false && (e.button ?? 0) === 0 && ok() && emptyTap(e.target, card) ? { id: e.pointerId, x: e.clientX, y: e.clientY, at: e.timeStamp } : null;
  });
  card.addEventListener('pointermove', (e) => { if (t && e.pointerId === t.id && Math.hypot(e.clientX - t.x, e.clientY - t.y) > 8) t = null; });
  card.addEventListener('pointerup', (e) => {
    const g = t; t = null;
    if (g && e.pointerId === g.id && e.timeStamp - g.at <= 650 && Math.hypot(e.clientX - g.x, e.clientY - g.y) <= 8) onTap(e);
  });
  card.addEventListener('pointercancel', () => { t = null; });
}

/**
 * The zoom itself. card: the data card; along: pieces that ride with it (its handle); scrim: the
 * veil; app: the app's root (class pz-zoomed while it is up). area(): the screen's room, { left, top, width, height }; scale(): screen px per
 * layout px; reduce(): Reduce Motion. boost(k): the pictures drawn at k times the screen's density while the card is large; hold(on): the
 * corner credit sits out; settled(): the card is back (anything laid out meanwhile is laid out now).
 */
export function createCardZoom({ card, along = [], scrim, app, area, scale = () => 1, reduce = () => false, boost = () => {}, hold = () => {}, settled = () => {} }) {
  let st = null;   // { plan, riders: [{ el, rest, own, anim }], closing }
  // The piece's box as it rests, for everyone who asks the element (the figure's labels keep clear of the cards by it): a copy that does
  // not move with the glide. Its own getBoundingClientRect is put back as it was.
  const pin = (r) => {
    const { left, top, width, height } = r.rest;
    r.own = Object.hasOwn(r.el, 'getBoundingClientRect') ? r.el.getBoundingClientRect : null;
    r.el.getBoundingClientRect = () => ({ x: left, y: top, left, top, width, height, right: left + width, bottom: top + height });
  };
  const unpin = (r) => { if (r.own) r.el.getBoundingClientRect = r.own; else delete r.el.getBoundingClientRect; };
  // From where the property stands now (a glide caught half way is taken up there) to `to`.
  const glide = (el, prop, to, ms, prev) => {
    const from = globalThis.getComputedStyle(el)[prop];
    prev?.cancel();
    return el.animate?.([{ [prop]: from }, { [prop]: to }], { duration: ms, easing: EASE, fill: 'forwards' }) || null;
  };
  const done = (list) => Promise.all(list.filter(Boolean).map((a) => a.finished.catch(() => {})));

  function end() {
    if (!st) return;
    const s = st; st = null;
    for (const r of s.riders) { r.anim?.cancel(); unpin(r); r.el.style.transformOrigin = ''; }
    delete card.dataset.zoomed;
    app.classList.remove('pz-zoomed'); scrim.classList.remove('on');
    boost(1); hold(false);
    settled();
  }

  return {
    /** Up or moving. */
    get on() { return !!st; },
    /** Up and staying (not on its way back). */
    get up() { return !!st && !st.closing; },
    /** The plan for the card as it stands, or null when it would not grow enough. */
    plan() { return zoomPlan(card.getBoundingClientRect(), area()); },
    open() {
      if (st) return false;
      const a = area(), plan = zoomPlan(card.getBoundingClientRect(), a, zoomMargin(a));
      if (!plan) return false;
      const k = scale() || 1, ms = reduce() ? 0 : ZOOM_MS;
      const q = card.getBoundingClientRect(), cx = q.left + q.width / 2, cy = q.top + q.height / 2;
      const riders = [card, ...along].map((el) => ({ el, rest: el === card ? q : el.hidden ? null : el.getBoundingClientRect(), own: null, anim: null })).filter((r) => r.rest && r.rest.width > 0);
      st = { plan, riders, closing: null };
      for (const r of riders) {
        // (Each piece turns about the card's middle, so they move as one.)
        r.el.style.transformOrigin = `${((cx - r.rest.left) / k).toFixed(2)}px ${((cy - r.rest.top) / k).toFixed(2)}px`;
        pin(r);
      }
      card.dataset.zoomed = '';
      app.classList.add('pz-zoomed'); hold(true); boost(plan.s);
      const to = `translate(${(plan.dx / k).toFixed(2)}px, ${(plan.dy / k).toFixed(2)}px) scale(${plan.s.toFixed(4)})`;
      for (const r of riders) r.anim = glide(r.el, 'transform', to, ms);
      scrim.classList.add('on');
      return true;
    },
    /** Glides back (or at once: instant, Reduce Motion). Resolves when the card is where it was. */
    close({ instant = false } = {}) {
      if (!st) return Promise.resolve();
      if (st.closing) return st.closing;
      scrim.classList.remove('on');
      if (instant || reduce()) { end(); return Promise.resolve(); }
      const s = st;
      for (const r of s.riders) r.anim = glide(r.el, 'transform', 'none', SHUT_MS, r.anim);
      // (A glide that never reports its end, a tab hidden mid-way, is let go after its time.)
      const guard = new Promise((res) => setTimeout(res, SHUT_MS + 120));
      s.closing = Promise.race([done(s.riders.map((r) => r.anim)), guard]).then(() => { if (st === s) end(); });
      return s.closing;
    },
    toggle() { return this.up ? this.close() : this.open(); },
    /** Everything put back at once: a slide, a resize or the end of the talk comes first. */
    reset() { if (st) { scrim.classList.remove('on'); end(); } },
  };
}
