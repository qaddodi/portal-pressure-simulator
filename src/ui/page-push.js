// A page pushed over a sheet's own content, moved by the finger and by the frame clock (18 Nov 2026, the tester: Treat's Changes page "doesn't track the finger: the page stays at x=0 through a
// 320 px drag and only slides after release", and its slide ran as element.animate, on the compositor's clock, not the cards' frames). The one mover of the Settings pages (util.js menuPush) and
// of Treat's Changes (treat-page.js): the page slides in from the right over what it covers, which slides back a third as far and fades; a swipe right from anywhere on the page takes it
// with the finger, one number (how far it stands from home, px) written each frame the page's glide runs and on each move of the finger, and a let-go carries the finger's speed on (a flick,
// or a pull past SHEET_CLOSE_PX / SHEET_CLOSE_SHARE of the page's width, goes back; a short pull comes home) as the sheets' own do (ease.js releaseSpeed, isFlick, settleSlope).
// A sideways drag only: a vertical one scrolls the page's list (touch-action: pan-y), a slider keeps its own.
import { glideCall, glideStop } from './script-glide.js';
import { easeArrive, carried, settleSlope, releaseSpeed, isFlick, D_SMALL, CARRY_MAX, SHEET_FLICK_MIN, SHEET_FLICK_FAR, SHEET_CLOSE_PX, SHEET_CLOSE_SHARE } from './ease.js';
import { reduceMotionMQ } from './motion.js';

export const PAGE_AWAY = 0.3;   // (how far, as a share of the page's width, what it covers slides back as the page comes in)
const LINEAR = (u) => u;

/**
 * page: the page, already in the sheet; away: what it covers (put out of reach by the caller); width: how wide the page is (read once, in the tap, by the caller).
 * onPop(): the back has begun (the caller makes what it covers interactive, the sheet refits); onGone(): the page is home away (the caller takes it out).
 * Returns { pop(v), at() }: pop goes back (v: the finger's speed along +x, px per ms; 0 for a tap), at() is how far the page stands from home (0 open .. width gone).
 */
export function pushPage(page, away, width, { onPop, onGone } = {}) {
  const W = Math.max(1, width), still = reduceMotionMQ.matches;
  let x = W, popped = false, s = null;
  const apply = (px) => {
    x = px;
    const open = 1 - px / W;   // 0 closed .. 1 open
    if (still) page.style.opacity = open.toFixed(3);
    else page.style.translate = `${px.toFixed(2)}px 0px`;
    for (const a of away) {
      if (!still) a.style.translate = `${(-PAGE_AWAY * W * open).toFixed(2)}px 0px`;
      a.style.opacity = (1 - open).toFixed(3);
    }
  };
  // (From where the page stands to `to`, in the frames: the curve the pages always had, opening on the finger's speed when it is let go moving.)
  function run(to, v, done) {
    const from = x, dist = to - from;
    const ms = Math.round(D_SMALL * (0.5 + 0.5 * Math.min(1, Math.abs(dist) / W)));
    const c = still ? 0 : settleSlope(v, dist, ms, CARRY_MAX);
    glideCall(page, ms, LINEAR, (u) => apply(from + dist * (c > 0 ? carried(easeArrive(u), u, c) : easeArrive(u))), done);
  }
  apply(W);
  run(0, 0);
  function pop(v = 0) {
    if (popped) return;
    popped = true;
    s = null;
    onPop?.();
    run(W, v, () => {
      page.style.translate = ''; page.style.opacity = '';
      for (const a of away) { a.style.translate = ''; a.style.opacity = ''; }
      onGone?.();
    });
  }
  // (A swipe right from the page goes back, as a pushed page does on iOS: the page follows the finger from the first 8 px that are mostly sideways.)
  page.style.touchAction = 'pan-y';
  page.addEventListener('pointerdown', (e) => {
    s = null;
    if (popped || e.pointerType === 'mouse' || !e.isPrimary || e.target.closest?.('input[type="range"], textarea, [contenteditable]')) return;
    s = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false, trail: [], t: 0, dx: 0 };   // alloc-rare: one record a touch
  }, { passive: true });
  page.addEventListener('pointermove', (e) => {
    if (!s || e.pointerId !== s.id || popped) return;
    if (!s.on) {
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (Math.hypot(dx, dy) < 8) return;
      if (!(dx > 0 && dx > Math.abs(dy) * 1.2)) { s = null; return; }   // (a scroll, or a drag the other way: not this page's)
      glideStop(page);   // (caught while it is still coming in: the finger takes it from where it stands)
      s.on = true; s.x = e.clientX - x; s.t = performance.now();
      page.setPointerCapture?.(e.pointerId);
    }
    const raw = e.clientX - s.x;
    s.dx = raw > 0 ? Math.min(W, raw) : 0;   // (never further open than it stands)
    const tr = s.trail, pair = tr.length >= 8 ? tr.shift() : [0, 0];   // alloc-rare: the first eight moves of a drag, then the pairs are reused
    pair[0] = performance.now(); pair[1] = e.clientX; tr.push(pair);
    apply(s.dx);
  });
  const end = (e) => {
    const s0 = s;
    if (!s0?.on || (e && e.pointerId !== s0.id)) { if (!e || !s0 || e.pointerId === s0.id) s = null; return; }
    s = null;
    const now = performance.now(), v = releaseSpeed(s0.trail, now);   // (px per ms to the right, as the finger lifted)
    const flick = isFlick(s0.dx, v, s0.dx / Math.max(1, now - s0.t), SHEET_FLICK_MIN, SHEET_FLICK_FAR);
    if (flick || s0.dx > Math.min(SHEET_CLOSE_PX, W * SHEET_CLOSE_SHARE)) pop(v);
    else run(0, v);   // (a short pull comes home: at the finger's speed toward home, if it was going back)
  };
  page.addEventListener('pointerup', end);
  page.addEventListener('pointercancel', end);
  page.addEventListener('lostpointercapture', end);
  return { pop, at: () => x };
}
