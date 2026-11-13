// The data card zoomed to the middle of the screen (Mac and iPad landscape; Mohammad, 28 Oct: "the camera should like zoom on the card to
// display it centered large in middle of the screen", the text "shouldn't like make the text smaller"). The card, and the handle that rides
// on its edge, glide and grow as one piece by a transform, so its words and pictures only get larger; a veil dims everything else, and
// the figure behind stays exactly where it is (Mohammad, 28 Oct: "don't move anything"). Nothing pauses: the instrument, the model and the
// figure run on under it.
// The presenter lays nothing out while the card is up (the card and the handle report the places they rest, so the figure's labels and
// the camera keep to them) and puts the card back before a slide changes. Nor does it measure the card: what the card answers while it is up
// is where it rests, so a measure of how far the readings travel would read none.

import { CARRY_MAX, EASE_ARRIVE, easeArrive, settleAt, settleSlope } from './ease.js';
import { frameFor } from './frame.js';
import { sceneCam, zoomRide, zoomFrameRun } from './scene-cam.js';
export const ZOOM_MAX = 2.2;    // the most the card grows
export const ZOOM_MIN = 1.2;    // under this the card is large enough; no zoom is offered
export const ZOOM_MS = 520;     // motion-scale: own pace (kept as decided: 520 in); in
export const SHUT_MS = 440;     // motion-scale: own pace (kept as decided: 440 back); and back

/** The time a zoom turned back takes: SHUT_MS (or ZOOM_MS) scaled by the share of the way it is from rest (cur.s − 1 over plan.s − 1), never under 0.35 of it, so a zoom shut a little way in is back in a little time (V-ZOOM-5). */
export const reverseMs = (full, curS, planS) => Math.round(full * Math.max(0.35, Math.min(1, (curS - 1) / ((planS - 1) || 1))));

/**
 * The slope a glide turned back mid-way starts with (settleAt's m0): the speed the move in hand (`old`: { from, to, ms, t0 }) has at `now`,
 * toward the new target `to` from where the card stands (`cur`), as a share of the way to go per `ms` (settleSlope), 0 up to CARRY_MAX. A
 * zoom shut in the middle of its way in is going away from rest, so it has none to carry and starts gently, from rest, instead of on the
 * arrive curve's own fast start (about four times its mean speed), which jumped the card from its outward speed to a faster inward one.
 */
export function reverseSlope(old, now, cur, to, ms) {
  if (!old || old.t0 == null || !(old.ms > 0)) return 0;
  const p = Math.min(1, Math.max(0, (now - old.t0) / old.ms)), h = 1e-3;
  const dv = old.to.s - old.from.s, dist = to.s - cur.s;
  if (!dv || !dist) return 0;
  const along = (dv * (easeArrive(Math.min(1, p + h)) - easeArrive(Math.max(0, p - h)))) / ((Math.min(1, p + h) - Math.max(0, p - h)) * old.ms);   // (the scale's speed per ms)
  return settleSlope(along, dist, ms, CARRY_MAX);
}

// The box round some rects: { left, top, width, height }.
export function unionBox(rects) {
  if (!rects.length) return { left: 0, top: 0, width: 0, height: 0 };
  const left = Math.min(...rects.map((r) => r.left)), top = Math.min(...rects.map((r) => r.top));
  return { left, top, width: Math.max(...rects.map((r) => r.left + r.width)) - left, height: Math.max(...rects.map((r) => r.top + r.height)) - top };
}

// The room left round the card on the screen: a tenth of the shorter side, between 72 and 110 px (the nav pill and the scale switch, 44 px
// tall a margin up from the foot, stay clear of it).
export const zoomMargin = (area) => Math.min(110, Math.max(72, 0.1 * Math.min(area.width, area.height)));

// (A stacked card, its handle up on its edge: a little more room round it, so the zoom stops short and the stack behind it shows: Mohammad, 4 Nov 2026.)
export const STACK_ROOM = 1.7;

// How much a box could grow and still leave the margin round it (no cap).
export const fitScale = (box, area, margin = zoomMargin(area)) => Math.min((area.width - 2 * margin) / box.width, (area.height - 2 * margin) / box.height);

/** Where the card goes and how much it grows: { s, dx, dy } (screen px, dx and dy from the card's middle to the area's), or null when
 *  it would grow under ZOOM_MIN. card and area: { left, top, width, height }. */
export function zoomPlan(card, area, margin = zoomMargin(area), floor = ZOOM_MIN) {
  if (!(card.width > 0) || !(card.height > 0) || !(area.width > 0) || !(area.height > 0)) return null;
  const s = Math.min(ZOOM_MAX, fitScale(card, area, margin));
  if (!(s >= floor)) return null;
  return { s, dx: area.left + area.width / 2 - (card.left + card.width / 2), dy: area.top + area.height / 2 - (card.top + card.height / 2) };
}

export const ZOOM_MIN_TOGETHER = 1.05;   // the teaching card and the instrument card zoom as one: under this there is no zoom to offer (a screen too short for both)

/**
 * zoomPlan for a card with pieces standing round it that must stay whole on the screen and zoom with it (the teaching card and its glass).
 * Mohammad, 13 Nov 2026: "when i zoom into this slide, the teaching card text is cut off", then, of a card that zoomed with the teaching card left
 * behind, "i clicked on the instrument card to zoom both and only instrument card zoomed. so fix it": the card and the pieces are fitted and centred as
 * one picture (the page zooms toward the card, 4 Nov: "zoom the entire camera"), always, never the card alone. The whole of them is the box that is
 * fitted, so none of it can run off the screen. null when that cannot enlarge ZOOM_MIN_TOGETHER (a screen too short or narrow for both): no zoom is offered.
 * card, keep, area: { left, top, width, height }; keep: the pieces' boxes as they rest. Without pieces it is zoomPlan.
 */
export function zoomPlanTogether(card, keep, area, margin = zoomMargin(area)) {
  const kept = keep.filter((r) => r && r.width > 0 && r.height > 0);
  if (!kept.length) return zoomPlan(card, area, margin);
  const box = unionBox([card, ...kept]), p = zoomPlan(box, area, margin, ZOOM_MIN_TOGETHER);
  return p && { ...p, box };
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
 * veil; app: the app's root (class pz-zoomed while it is up). area(): the screen's room, { left, top, width, height }; scale(el): screen px per
 * layout px (at el, the card or the part zoomed); reduce(): Reduce Motion. boost(k): the pictures drawn at k times the screen's density while the card is large; hold(on): the
 * corner credit sits out; settled(): the card is back (anything laid out meanwhile is laid out now); behind(up, ms): the card starts its glide
 * in (up) or back, lasting ms (0: at once), as the cue for whatever stands behind it to move in step (the words' card: presenter.js wordsGlide).
 * open() may take another element for the card (Mohammad, 29 Oct: "click individual ladder cards and have them zoom in similar to how we do it in
 * the slides"): one of the six cells of the ladders panel, { card: cell, scrim: [the page's veil, the panel's], part: true }. A part is only
 * centred and enlarged: the instrument's boost, the credit's sitting out, the words' cue and the readings' follow are for the data card.
 */
export function createCardZoom({ card, along = [], scrim, app, area, scale = () => 1, reduce = () => false, boost = () => {}, hold = () => {}, settled = () => {}, behind = () => {}, scene = () => [], camera = null, raf = frameFor('card-zoom') }) {
  let st = null;   // { card, veils, part, plan, riders: [{ el, rest, own, tf0 }], closing, steady, box, mid, k, s, boosted, cur: { dx, dy, s }, aff, mo }
  // The glide is run in the frame loop, never by the browser's clock (Mohammad, 2 Nov 2026: "the instrument card has a trailing card behind it";
  // card-zoom-plan.md step 1: no Web Animations). Each frame's 'card-zoom' callback works out C (cur) once and writes it, in that frame, to the
  // pieces' inline transform (paint), to the scene camera (camAt) and to the record the glass reads (zoomRide, scene-cam.js), so the card, the figure
  // and the glass are one picture and none can run a frame ahead. cur: where the whole is now ({ dx, dy } screen px, and the scale); mo: the
  // glide in hand ({ from, to, ms, t0, done }).
  // (The camera follows the card's zoom: the view is scaled and moved as the card is, about the same middle; once per frame, with st.cur.)
  const camAt = () => { if (st?.cam) camera.at(st.cur.s, st.mid.x, st.mid.y, 0, 0); };   // (the scene only scales about the card's middle: the card's own move is not the scene's, so the figure holds its place behind the card and never needs sceneCam.cover; Mohammad, 5 Nov 2026)
  // (C on the pieces, in this frame: one inline transform each, in the card's own px, and the glass's record of the same numbers.)
  const paint = () => {
    const c = st.cur, a = st.aff, k = st.k, to = c.s === 1 && c.dx === 0 && c.dy === 0 ? 'none' : `translate(${(c.dx / k).toFixed(2)}px, ${(c.dy / k).toFixed(2)}px) scale(${c.s.toFixed(4)})`;
    a.s = c.s; a.dx = c.dx; a.dy = c.dy; a.ox = st.mid.x; a.oy = st.mid.y;
    for (const r of st.riders) r.el.style.transform = to;
  };
  const step = () => { paint(); camAt(); zoomFrameRun(); };
  let tickId = 0;
  const lerpTo = (m, e) => ({ dx: m.from.dx + (m.to.dx - m.from.dx) * e, dy: m.from.dy + (m.to.dy - m.from.dy) * e, s: m.from.s + (m.to.s - m.from.s) * e });
  function tick(now) {
    tickId = 0;
    const m = st?.mo;
    if (!m) return;
    m.t0 ??= now;
    st.tickAt = performance.now();
    const t = Math.max(0, now - m.t0), p = Math.min(1, t / m.ms);
    st.cur = lerpTo(m, m.m0 >= 0 ? settleAt(p, m.m0) : easeArrive(p));   // (a glide turned back mid-way: the Hermite settle that starts at the speed it carries, ease.js settleAt)
    step();
    if (p < 1) { tickId = raf(tick); return; }
    st.mo = null;
    m.done();
  }
  /** Runs the glide to `to` over ms in the frame loop. Resolves when it is there. */
  function drive(to, ms) {
    return new Promise((done) => {
      const old = st.mo;   // (a glide still moving is turned back: it starts on the speed it has, below)
      st.mo?.done();
      if (!(ms > 0)) { st.cur = { ...to }; step(); st.mo = null; done(); return; }
      st.mo = { from: { ...st.cur }, to, ms, t0: null, done, m0: old ? reverseSlope(old, performance.now(), st.cur, to, ms) : -1 };
      if (!tickId) tickId = raf(tick);
    });
  }
  // The card and what rides with it, as they rest: a stacked card's handle stands on its top edge (the readings' card tucked behind it), so the
  // box that is centred and fitted to the screen is the whole of them, never the card's box alone (Mohammad, 28 Oct: a stacked card sat off the
  // middle and ran off the bottom).
  // (scene: the rest of the page that rides the camera with the card (the teaching card and its glass): each turns about the same middle by the same transform, so the page is one picture that zooms toward the card, and the zoomed card never lies over its words (4 Nov 2026, Mohammad: "zoom the entire camera"). With the data card tapped they are part of the box that is fitted and centred, zoomPlanTogether, so none runs off the screen: 13 Nov 2026.)
  const pieces = (el = card, rides = along, extra = [], pass = true) => [...[el, ...rides].map((x) => [x, false]), ...extra.map((x) => [x, pass])].map(([x, pass]) => ({ el: x, pass, rest: x.hidden && x !== el ? null : x.getBoundingClientRect(), own: null, tf0: '' })).filter((r) => r.rest && r.rest.width > 0);
  const whole = (riders, el = card) => (riders.some((r) => r.el === el) ? unionBox(riders.filter((r) => !r.pass).map((r) => r.rest)) : null);
  // The piece's box as it rests, for everyone who asks the element (the figure's labels keep clear of the cards by it): a copy that does
  // not move with the glide. Its own getBoundingClientRect is put back as it was.
  // (The glass is told where the piece is drawn by the zoom's one record, aff, through zoomRide (scene-cam.js): nothing is hung on the element but
  // its resting box.)
  // (The piece's own CSS eases a transform written to its style: while it rides only its opacity keeps a transition, so its transform is the
  // frame's alone. Given back two frames after the piece is put back, so the step back to rest is never eased either.)
  const pin = (r, aff) => {
    const { left, top, width, height } = r.rest;
    r.own = Object.hasOwn(r.el, 'getBoundingClientRect') ? r.el.getBoundingClientRect : null;
    const real = r.own || r.el.getBoundingClientRect;
    // (The one box, made here and handed back at every ask: the figure's labels read it every frame and keep none.)
    const rect = { x: left, y: top, left, top, width, height, right: left + width, bottom: top + height };
    r.el.getBoundingClientRect = () => rect;
    zoomRide.set(r.el, aff, () => real.call(r.el));
    r.tf0 = r.el.style.transform;
    if (!tp0.has(r.el)) tp0.set(r.el, r.el.style.transitionProperty || '');
    r.el.style.transitionProperty = 'opacity';
    riding.add(r.el);
  };
  const riding = new Set(), tp0 = new Map();   // (the pieces riding now, and each one's own transition-property while it is held: a piece zoomed again before it was given back keeps it)
  const unpin = (r) => {
    if (r.own) r.el.getBoundingClientRect = r.own; else delete r.el.getBoundingClientRect;
    zoomRide.drop(r.el);
    r.el.style.transform = r.tf0;
    riding.delete(r.el);
    const el = r.el;
    raf(() => raf(() => { if (riding.has(el) || !tp0.has(el)) return; el.style.transitionProperty = tp0.get(el); tp0.delete(el); }));   // alloc-rare: once per piece as a zoom ends
  };

  function end() {
    if (!st) return;
    const s = st; st = null;
    s.mo?.done(); s.mo = null; clearTimeout(s.sharpT);
    if (s.cam) camera.end();
    for (const r of s.riders) { unpin(r); r.el.style.transformOrigin = ''; }
    delete s.card.dataset.zoomed;
    if (s.main) for (const m of s.main) m.classList.remove('pz-zmain');
    app.classList.remove('pz-zoomed', 'pz-cam'); for (const v of s.veils) v.classList.remove('on');
    if (!s.part) { boost(1); hold(false); }
    settled();
  }

  return {
    /** Up or moving. */
    get on() { return !!st; },
    /** Up and staying (not on its way back). */
    get up() { return !!st && !st.closing; },
    /** The plan for the card as it stands, or null when it would not grow enough. */
    plan() { const ps = pieces(card, along, scene(), true), q = whole(ps); return q && zoomPlanTogether(q, ps.filter((r) => r.pass).map((r) => r.rest), area()); },
    open({ card: el = card, along: rides = along, scrim: veil = scrim, part = false, main = null } = {}) {
      if (st) return false;
      // (Mohammad, 5 Nov 2026: a card zoom moves no figure, lobule or sinusoid; the teaching card rides the same turn, tucked or not, but the
      // fit and the centring are the instrument card's alone: it never changes the framing.)
      const a = area(), stacked = rides.some((x) => !x.hidden);
      // (main: the pieces the zoom is fitted and centred on, when it was the teaching card that was tapped: the data card rides along, as the
      // teaching card rides along when the data card is tapped. 5 Nov 2026)
      const focus = (rs) => { if (main) for (const r of rs) r.pass = !main.includes(r.el); return rs; };
      let riders = focus(pieces(el, rides, part ? [] : scene(), true)), q = whole(riders, el) || (main && unionBox(riders.filter((r) => !r.pass).map((r) => r.rest))), withScene = !part && riders.some((r) => r.pass), mg = zoomMargin(a) * (stacked && !main && !withScene ? STACK_ROOM : 1);   // (the stack's wider margin only for a card alone: with the teaching card fitted too the screen has none to spare)
      // (The data card's zoom: the teaching card is part of what is fitted and centred, so it is as whole on the screen as the card: zoomPlanTogether.)
      let plan = q && (part || main ? zoomPlan(q, a, mg) : zoomPlanTogether(q, riders.filter((r) => r.pass).map((r) => r.rest), a, mg));
      if (!plan) return false;
      if (plan.box) q = plan.box;   // (the whole of them is what is centred)
      const k = scale(el) || 1, ms = reduce() ? 0 : ZOOM_MS;
      const cx = q.left + q.width / 2, cy = q.top + q.height / 2;
      // (box and mid: the whole as it rests as the card zooms, and its middle, for follow below; steady: the glide in has ended, for the
      // data card only: a part has no readings to bring out.)
      sceneCam.aim = null;   // (no camera aim: the figure is not zoomed)
      st = { mg, stacked, card: el, veils: [veil].flat(), part, plan, riders, closing: null, steady: ms === 0 && !part, main: main || null, box: q, mid: { x: cx, y: cy }, k, s: plan.s, boosted: plan.s, cur: { dx: 0, dy: 0, s: 1 }, aff: { s: 1, dx: 0, dy: 0, ox: cx, oy: cy }, mo: null, cam: false };
      for (const r of riders) {
        // (Each piece turns about the middle of them all, so they move as one.)
        r.el.style.transformOrigin = `${((cx - r.rest.left) / k).toFixed(2)}px ${((cy - r.rest.top) / k).toFixed(2)}px`;
        pin(r, st.aff);
      }
      el.dataset.zoomed = '';
      if (main) for (const m of main) m.classList.add('pz-zmain');   // (the words are the card framed: above the veil, as the data card is, not dimmed by it: app.css .pz-zmain)
      app.classList.add('pz-zoomed');
      if (st.cam) app.classList.add('pz-cam');   // (a camera zoom: the labels, leaders and overlays ride the view with the figure, rigidly, none hidden or eased: app.css .pz-zoomed:not(.pz-cam))
      globalThis.dispatchEvent?.(new Event('pps:cardzoom'));   // alloc-rare: once per zoom (the ?perf readout names its window)
      // (The pictures are drawn larger once the card has arrived, not as it sets off: the instruments' shared GPU canvas was made 2.2 times
      // larger on each side in the glide's first frame (a 1440 x 900 canvas to 3168 x 1980, 400 to 800 ms of the main thread in a software-GL
      // profile, none at rest), the zoom's lag: Mohammad, 3 Nov 2026. They are drawn at the card's resting density, grown by the transform, for the
      // glide's half second and sharp the moment it ends. With no glide (Reduce Motion) they are larger at once.)
      if (!part) { hold(true); if (!ms) boost(plan.s); }   // (The teaching card rides the zoom where it stands, tucked or not: it is not eased back to a tucked place, 5 Nov 2026)

      const me0 = st;
      for (const v of st.veils) v.classList.add('on');
      if (st.cam && !ms) setTimeout(() => { if (st === me0 && !me0.closing) camera.sharp?.(true); }, 0);
      const me = st, going = drive({ dx: plan.dx, dy: plan.dy, s: plan.s }, ms);
      if (ms && !part) {
        // (A glide that never reports its end (a hidden tab runs no frames) is let go after its time; one whose frames are coming, however slowly, is not.)
        // (One watcher made here, asked again by the timer: no closure made at each ask.)
        const watch = () => {
          if (st !== me || me.closing || !me.mo) return;
          if (performance.now() - (me.tickAt ?? 0) < 400) { setTimeout(watch, 200); return; }
          me.mo.done(); me.mo = null; me.cur = { dx: plan.dx, dy: plan.dy, s: plan.s }; step(); me.steady = true; boost(me.boosted); if (me.cam) camera.sharp?.(true);   // alloc-rare: only a glide that never reported its end (a hidden tab), once, as it is let go
        };
        setTimeout(watch, ZOOM_MS + 120);
        going.then(() => { if (st === me && !me.closing) { me.steady = true; if (!part) boost(me.boosted); if (me.cam) camera.sharp?.(true); } });
      }
      return true;
    },
    /** Up, its glide in over: the readings' card may come out or tuck away under it, and follow keeps the whole in the middle. */
    get steady() { return !!st && !st.closing && st.steady; },
    /** The zoom now: how many times larger the card is than at rest. */
    get scale() { return st ? st.s : 1; },
    /**
     * The readings' card comes out above the zoomed card or tucks away (presenter.js liftTo, every frame of it): the zoom is fitted again to
     * the whole stack, so it stays in the middle and inside the screen, smaller as it gets taller and larger as it shortens; every frame is
     * one transform, so nothing snaps. rise: how far the top of the whole has gone up since the card zoomed (layout px, down is negative);
     * lift: how far the cards' own rise (the readings' travel, an unscaled translate: styles/app.css --pz-lift) has gone up since.
     * That rise is not scaled by the zoom, so the transform makes up for the difference: the whole lands exactly in the middle.
     */
    follow(rise, lift) {
      if (!st || st.closing || !st.steady || st.part || st.main) return false;
      const a = area(), { box: b, mid, k } = st, up = rise * k;
      const q = { left: b.left, top: b.top - up, width: b.width, height: b.height + up };
      const sc = Math.min(ZOOM_MAX, Math.max(1, fitScale(q, a, st.mg)));
      const dx = a.left + a.width / 2 - mid.x;
      const dy = a.top + a.height / 2 - mid.y - sc * (q.top + q.height / 2 - mid.y) + lift * k * (1 - sc);
      st.cur = { dx, dy, s: sc };
      paint(); camAt();
      if (st.cam) { clearTimeout(st.sharpT); const me = st; me.sharpT = setTimeout(() => { if (st === me && !me.closing && me.steady) camera.sharp?.(true); }, 200); }   // (the readings still moving: sharp again 200 ms after the last step)
      zoomFrameRun();
      st.s = sc;
      // (The boost redraws every chart at the new density (util.js redrawBoosted): asked on each step of the readings' rise it redrew them all
      // again and again through the follow. It is given once the steps stop, 200 ms after the last, like the camera's sharp (8 Nov 2026, lag hunt).)
      if (sc > st.boosted + 0.01) { st.boosted = sc; clearTimeout(st.boostT); const me = st; me.boostT = setTimeout(() => { if (st === me && !me.closing) boost(me.boosted); }, 200); }
      return true;
    },
    /** Glides back (or at once: instant, Reduce Motion). Resolves when the card is where it was. */
    close({ instant = false } = {}) {
      if (!st) return Promise.resolve();
      if (st.closing) return st.closing;
      const s = st;
      clearTimeout(s.sharpT);
      if (s.cam) camera.sharp?.(false);
      for (const v of s.veils) v.classList.remove('on');
      if (instant || reduce()) { end(); return Promise.resolve(); }
      globalThis.dispatchEvent?.(new Event('pps:cardzoom'));   // alloc-rare: once per zoom out
      s.card.dataset.zoomed = 'back';   // (on its way back: its shadow eases out, styles/app.css)
      // (A zoom shut part of the way in goes back in the part of SHUT_MS it got, from where it is: V-ZOOM-5.)
      const ms = reverseMs(SHUT_MS, s.cur.s, s.plan.s);
      // (A glide that never reports its end, a tab hidden mid-way, is let go after its time.)
      let res = null;
      const guard = new Promise((r) => { res = r; });
      const watch = () => { if (st !== s || !s.mo || performance.now() - (s.tickAt ?? 0) >= 400) res(); else setTimeout(watch, 200); };
      setTimeout(watch, ms + 120);
      s.closing = Promise.race([drive({ dx: 0, dy: 0, s: 1 }, ms), guard]).then(() => { if (st === s) end(); });
      return s.closing;
    },
    toggle() { return this.up ? this.close() : this.open(); },
    /** Everything put back at once: a slide, a resize or the end of the talk comes first. */
    reset() { if (st) { for (const v of st.veils) v.classList.remove('on'); end(); } },
  };
}
