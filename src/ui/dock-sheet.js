// The one engine behind every sheet over the thumb dock (Menu system plan W2, 4 Nov 2026): the cards (Details, Treat, Tests) and the menu sheets
// (Layers, Settings, History, Blood, Colored-by) are pulled, flicked and settled by the same rules, on pointer events.
//   - A card's box is never laid out on the finger's account: a pull up that needs a taller box holds what flexes (the Tests chart) at the
//     size it is drawn at, so the first touch changes nothing on the page (holdFrame); the box and the content are committed once, in the
//     frame the sheet lands in (commit), together with the offset going back to 0.
//   - The release reads one set of numbers for cards and menus (FLICK_MIN, FLICK_FAR, CLOSE_PX, CLOSE_SHARE).
// Moved out of main.js unchanged but for the frame hold and the menu sheet (menuSheet, below).
import { $, isPhoneLayout, TABLET_UP_MQ } from './util.js';
import { sheetParts, sheetOffset, setSheetOffset, stopSheet, glideSheet, dragSheet } from './sheet-move.js';
import { SHEET_FLICK_MIN, SHEET_FLICK_FAR, SHEET_CLOSE_PX, SHEET_CLOSE_SHARE, releaseSpeed, isFlick, flickAim, carryCurve, D_SMALL } from './ease.js';
import { moverOf, cancelMoves } from './num-move.js';
import { restPass } from './rest-pass.js';
import { classSoon } from './class-soon.js';
import { readBox, readMetric, readStyle } from './layout-snap.js';

const app = $('#app');
const isPhone = isPhoneLayout;
const tabletMQ = matchMedia(TABLET_UP_MQ);

// The frame hold: what flexes to fill a card (the Tests chart's pane) keeps the height it is drawn at while the box is made taller for a pull
// up, so the first touch re-lays out, resizes and redraws nothing; it is let go in the same task as the box is committed (releaseFrame).
const held = new WeakMap();   // card -> [[child, its flex and height as they were], ...]
function holdFrame(el) {
  if (held.has(el)) return;
  const list = [];   // alloc-rare: a pull up that makes the box taller, once for each gesture
  for (const c of el.children) {
    if (c.classList.contains('sheet-plate')) continue;
    if (!(parseFloat(readStyle(c).flexGrow) > 0)) continue;
    list.push([c, c.style.flex, c.style.height]);   // alloc-rare: once for each held child
    c.style.flex = 'none'; c.style.height = `${readMetric(c, 'offsetHeight')}px`;
  }
  held.set(el, list);
}
function releaseFrame(el) {
  const list = held.get(el);
  if (!list) return;
  held.delete(el);
  for (const [c, f, hh] of list) { c.style.flex = f; c.style.height = hh; }
}

const sheetInner = (c) => { const l = c.lastElementChild; if (!l) return 0; const b = parseFloat(readStyle(c).paddingBottom) + parseFloat(readStyle(l).marginBottom); return readBox(l).bottom - readBox(c).top + readMetric(c, 'scrollTop') + b; };
export function sheetBehaviour(el, { handle, drag, onClose, active = () => true, fit = null, anywhere = false, grow = false }) {
  const SIZES = [0.32, 0.56, 0.9], THUMB = [0.62, 1], TABLET = [0.45, 0.62];
  const thumb = () => app.classList.contains('thumb') && isPhone();
  // (17 Oct, Mohammad: an upright iPad's cards open "proportional to the ipad proportions vertically" and never fill the whole
  // screen: Half takes the share of the screen's height an iPhone's Half takes, 45 %, and Full stops at 62 %, the figure in view
  // above it. As shares of the room, like the phone's, so a drag and its release are measured the same way.)
  const TAB_NOW = [0, 0];   // (the tablet's stops, written in place at each ask and read where they are asked for, not kept)
  const stops = () => {
    if (!thumb()) return SIZES;
    if (!tabletMQ.matches) return THUMB;
    const H = readMetric(app, 'clientHeight'), R = room() || H;
    for (let i = 0; i < 2; i++) TAB_NOW[i] = Math.min(1, (TABLET[i] * H) / R);
    return TAB_NOW;
  };
  const half = () => stops().length - 2;
  // The room a thumb sheet may fill: the CSS cap (100% - top bar - tab row - 22 px, styles/app.css thumb block).
  const room = () => (thumb() ? readMetric(app, 'clientHeight') - (parseFloat(app.style.getPropertyValue('--top-safe')) || 0) - (parseFloat(app.style.getPropertyValue('--nb-occ')) || 0) - 22 : 0);
  let size = 1, lastN = stops().length;
  el.prepend(handle);
  // The sheet moves by its content's offset only (sheet-move.js): its box is laid out once for a gesture and committed once at
  // rest. `lay`: the height the box is laid out at while it is held taller than it is drawn (0: its own, --sheet-size).
  sheetParts(el);
  let lay = 0;
  // The chart grows with the finger (Menu system plan W3, option A; `grow`, the Tests card): while the pane is held at the size it is laid
  // out at, each chart box in it is stretched by the compositor (scale, from its top edge) by what the card has grown since, and what
  // follows it is moved down by the same. Words in the box are hidden meanwhile (not stretched). On a phone's sheet the chart fills what the
  // card leaves it (app.css, "Tests in a narrow card": flex 1 1 0), so it grows by the card's own growth, split between the boxes; in the
  // frame the sheet lands, when the pane is let go, laid out and drawn once at its true size, and these are taken off in the same task.
  // A pull down from Full shrinks the same way. (Notes that come back at Full take some of that room: they appear at landing.)
  let gr = null;   // { base: the card's height the pane is laid out at, share: the chart boxes the growth is split between, items: [[element, boxes above it, its height | 0 for a follower]], last }
  const growArm = (base) => {
    if (!grow || gr || !isPhone() || !thumb()) return;
    const pane = el.querySelector('.dock-body .dock-pane.active');
    if (!pane || readMetric(pane, 'scrollTop') > 0) return;
    const boxes = [...pane.querySelectorAll('.chart-box:not(.square)')].filter((b) => readMetric(b, 'offsetHeight') > 0);   // alloc-rare: once for each gesture
    if (!boxes.length) return;
    const rects = boxes.map((b) => readBox(b));   // alloc-rare: once for each gesture
    const items = [], seen = new Set();   // alloc-rare: once for each gesture
    const above = (top) => rects.reduce((n, r) => n + (r.bottom <= top + 1 ? 1 : 0), 0);
    boxes.forEach((b, i) => {
      items.push([b, above(rects[i].top), readMetric(b, 'offsetHeight')]); seen.add(b);
      for (let n = b; n && n !== pane; n = n.parentElement) for (let s = n.nextElementSibling; s; s = s.nextElementSibling) {
        if (seen.has(s) || boxes.includes(s) || readBox(s).top < rects[i].bottom - 1) continue;
        seen.add(s); items.push([s, above(readBox(s).top), 0]);
      }
    });
    for (const it of items) if (it[2]) it[0].style.transformOrigin = '50% 0';
    gr = { base, items, share: boxes.length, last: NaN };
    el.classList.add('sheet-grow');
  };
  const growTo = (off) => {
    if (!gr) return;
    const ga = Math.round(((lay || gr.base) - off - gr.base) / gr.share * 4) / 4;
    if (ga === gr.last) return;
    gr.last = ga;
    for (const [e, n, hb] of gr.items) {
      e.style.translate = n ? `0px ${n * ga}px` : '';
      if (hb) e.style.scale = `1 ${Math.max(0.2, (hb + ga) / hb)}`;
    }
  };
  const growOff = () => {
    if (!gr) return;
    for (const [e, , hb] of gr.items) { e.style.translate = ''; if (hb) { e.style.scale = ''; e.style.transformOrigin = ''; } }
    gr = null;
    el.classList.remove('sheet-grow');
  };
  // Holds the pane at the size it is laid out at (once for a gesture), before the box is made taller.
  const hold = () => { if (held.has(el)) return; const base = readMetric(el, 'offsetHeight'); holdFrame(el); growArm(base); };
  const natural = () => {
    if (!fit || !isPhone() || el.hidden) return Infinity;
    const cs = readStyle(el);
    // The body fills the sheet, so its own height says nothing: measure down to its last child.
    let sum = 0;
    for (let i = 0; i < el.children.length; i++) { const c = el.children[i]; sum += c.classList.contains('sheet-plate') ? 0 : c.matches(fit) ? sheetInner(c) : readMetric(c, 'offsetHeight'); }
    return sum + parseFloat(cs.paddingBottom) + parseFloat(cs.paddingTop);
  };
  // (A phone turned upright or sideways changes the stops, three sideways and two over the thumb dock: Half stays Half and the top stays the top.)
  const remap = () => { const n = stops().length; if (n !== lastN) { size = size === lastN - 1 ? n - 1 : n - 2; lastN = n; } };
  // The height the sheet is given at `size`, as --sheet-size's value.
  const sizeValue = () => {
    remap();
    const S = stops(), r = room();
    size = Math.min(size, S.length - 1);
    const need = size === half() ? natural() : Infinity;
    // alloc-rare: the sheet's height as a CSS value, made when a gesture starts or ends or the sheet opens, not while it moves
    return need < S[half()] * (r || readMetric(app, 'clientHeight')) ? `${Math.ceil(need)}px` : r ? `${Math.round(S[size] * r)}px` : `${Math.round(S[size] * 100)}%`;
  };
  const pxOf = (v) => (/px$/.test(v) ? parseFloat(v) : (parseFloat(v) / 100) * readMetric(app, 'clientHeight'));
  // Commits the sheet at rest: its own height, the content in place (the same picture: what was drawn lay - off tall now is).
  const commit = (v) => {
    classSoon(el, 'sheet-half', thumb() && size === half());   // (a phone's Tests card hides its longer words at Half)
    el.style.setProperty('--sheet-size', v);
    releaseFrame(el); growOff();
    el.style.height = ''; lay = 0;
    setSheetOffset(el, 0);
  };
  // Takes the sheet to its size. glide: from the height it is drawn at (h0), the box held at the taller of the two for the ease and
  // committed once landed; otherwise at once (a turn of the device, an opening).
  const apply = (glide = false, h0 = 0, easing) => {
    const v = sizeValue();
    if (!glide || !isPhone() || matchMedia('(prefers-reduced-motion: reduce)').matches) { stopSheet(el); commit(v); return; }
    const h1 = pxOf(v), H = Math.max(h0, h1);
    if (Math.abs(h1 - h0) < 1) { stopSheet(el); commit(v); return; }
    if (lay !== H) { stopSheet(el); hold(); el.style.height = `${H}px`; lay = H; setSheetOffset(el, H - h0); }
    glideSheet(el, H - h1, { easing, done: () => commit(v), frame: growTo });
  };
  const drawnHeight = () => (lay || readMetric(el, 'offsetHeight')) - sheetOffset(el);
  // A new tab refits the sheet to its content (the height eases).
  if (fit) el.addEventListener('click', (e) => { if (size === half() && e.target.closest('[role="tab"]')) restPass(refitTab); });   // (measured between frames, rest-pass.js)
  const refitTab = () => apply(true, drawnHeight());
  apply();
  // A turn of the device or a new window size changes the stops and the room (px over the thumb dock): a sheet takes its size
  // again once the size has held for a moment (a sheet in the hand is left to its release).
  let retakeT = 0;
  const retake = () => { if (!start && isPhone()) apply(); };   // (measured between frames, rest-pass.js)
  addEventListener('resize', () => { clearTimeout(retakeT); retakeT = setTimeout(() => restPass(retake), 220); });
  handle.addEventListener('click', () => { if (!isPhone() || !active()) return; const h0 = drawnHeight(); remap(); size = (size + 1) % stops().length; apply(true, h0); });
  let start = null, swallow = 0;
  // Controls keep their own gestures. With `anywhere` (a phone sheet), a vertical drag from any other spot on the
  // card moves it too; a sideways one is left alone, and content scrolled away from its top scrolls back first.
  const FIELDS = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]), select, textarea, [role="slider"], [contenteditable]';
  const CONTROLS = 'button, a, input, select, textarea, label, [role="tab"], [role="slider"], [contenteditable]';
  const scroller = (t) => { for (let n = t; n && n !== el; n = n.parentElement) { if (readMetric(n, 'scrollHeight') > readMetric(n, 'clientHeight') + 1 && /auto|scroll/.test(readStyle(n).overflowY)) return n; } return null; };
  el.addEventListener('pointerdown', (e) => {
    if (start || !active() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const own = e.target === handle || !!e.target.closest(drag);
    // A tab in the head is most of the head on a phone: a vertical drag from it moves the sheet, a tap picks the tab.
    const headTab = own && thumb() && !!e.target.closest('[role="tab"]');
    // (Over the thumb dock buttons and tabs carry the pull too, so Treat moves from anywhere; a tap still clicks.)
    if (e.target !== handle && e.target.closest(thumb() && anywhere ? FIELDS : CONTROLS) && !headTab) return;
    if (!own && !(anywhere && isPhone())) return;
    // Everything the pull needs is read here, once: nothing is measured while the finger moves.
    const mv = (el.style.translate || '0px 0px').split(' ').map(parseFloat), S = stops(), R = room() || readMetric(app, 'clientHeight');
    const sc = own ? null : scroller(e.target);
    const h0 = drawnHeight(), box = lay || readMetric(el, 'offsetHeight');
    start = { id: e.pointerId, t0: performance.now(), x: e.clientX, y: e.clientY, h: h0, box, H: R, S, size, thumb: thumb(), phone: isPhone(), tx: mv[0] || 0, ty: mv[1] || 0, mv: null, moved: false, wx: NaN, wy: NaN, wOff: NaN, trail: [], pool: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]], loose: !own || headTab, sc, scTop: sc ? readMetric(sc, 'scrollTop') : 0, top: S[S.length - 1] * R };
    // (Half's height, as apply() sets it: the content's own height when that is less)
    if (start.thumb && size === S.length - 1 && S.length > 1) { start.full = true; start.half = Math.min(h0, natural(), S[half()] * R); }
  });
  // The box is laid out tall enough for a pull up once the pull has begun (the sheet takes the finger's capture), not on every touch.
  el.addEventListener('gotpointercapture', (e) => {
    if (e.target !== el || !start || e.pointerId !== start.id || !start.moved || !start.phone || start.full) return;   // (the sheet's own capture, at the pull's start: a touch's first capture goes to what is under the finger)
    const off = sheetOffset(el), drawn = start.box - off, H = Math.max(start.box, Math.round(start.top));
    if (H <= start.box + 1) return;
    stopSheet(el);
    hold();   // (the pane that fills the card keeps its size: the chart is not laid out, resized or redrawn by the touch)
    el.style.height = `${H}px`; lay = H;
    start.box = readMetric(el, 'offsetHeight');   // (as laid out: the stylesheet's cap may hold it lower)
    lay = start.box;
    setSheetOffset(el, start.box - drawn);
  });
  el.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    if (e.pointerType === 'mouse' && !(e.buttons & 1)) { const s1 = start; restPass(() => { if (start === s1) end(e); }); return; }   // alloc-rare: once per drag, when the mouse button was let go outside the card   // (ended between frames, never inside a move)   // (the button was let go outside the card before it was captured: the drag is over, not waiting to resume)
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!start.moved) {
      if (Math.hypot(dx, dy) < 6) return;
      if (start.loose && (Math.abs(dx) > Math.abs(dy) || (start.sc && (start.scTop > 0 || (dy < 0 && size === start.S.length - 1))))) { start = null; return; }
      start.moved = true;
      // (Caught while it is still easing: the pull takes it over from where it is drawn, without a jump. A tap leaves it easing.)
      start.off0 = sheetOffset(el);
      // (Held where it is drawn: the pull's number (dragSheet, below, this same move) takes over from the ease's end value at once.)
      stopSheet(el); el._sheetOff = start.off0;
      if (!start.phone) start.mv = moverOf(el, 'translate', 'xy', true);   // alloc-rare: once, at the pull's first move
      if (grow && start.full && start.phone) hold();   // (from Full the pane is held at Full size: a pull down shrinks the chart with the finger)
      el.setPointerCapture?.(e.pointerId);   // (only once it moves: captured at once, a tap's click would land on the sheet, not the grabber)
    }
    classSoon(el, 'dragging', true);
    start.dy = dy;
    // (The last 8 points of the finger, as [time, y] pairs: the ones made at the touch are written over, the oldest first, not new ones made.)
    const tp = start.trail.length >= 8 ? start.trail.shift() : start.pool.pop();
    tp[0] = performance.now(); tp[1] = e.clientY;
    start.trail.push(tp);
    // The height the finger draws: from Full a pull down shrinks the card the way a pull up grew it (15 Oct, Mohammad): its foot
    // stays on the tab row and its top follows the finger, slowing past Half, where it settles. Over the thumb dock a pull down
    // from Half slides the card down behind the tab row. Everything is the content's offset in the still box.
    let h;
    if (!start.phone) {   // (written only when the card's place has moved from what this drag last wrote)
      const tx = start.tx + dx, ty = start.ty + dy;
      if (tx !== start.wx || ty !== start.wy) { start.wx = tx; start.wy = ty; start.mv.set(tx, ty); }   // (a number: the card's place is a kept paused animation, num-move.js; its resting inline translate is written once at the release)
      return;
    }
    if (start.thumb && dy > 0 && start.full) { const lo = start.half, hh = start.h - dy; h = Math.max(60, hh >= lo ? hh : lo - (lo - hh) * 0.25); }
    else if (start.thumb && dy > 0) h = start.h - dy;
    else h = Math.max(60, start.h - dy);
    const box = lay || start.box;
    el._sheetOff = Math.max(0, box - h);
    if (el._sheetOff !== start.wOff) {   // (written only when the offset has moved from what this drag last wrote)
      start.wOff = el._sheetOff;
      dragSheet(el, el._sheetOff);
      growTo(el._sheetOff);   // (every child held that far down by a number: sheet-move.js, num-move.js)
    }
  });
  // Once the sheet follows the finger, the page must not scroll under it, and the lift is not a tap.
  // (iOS hands a pull on scrollable content to the page and cancels the pointer before it has moved 6 px: a pull down
  // from anywhere on a thumb card, with its content at the top, is claimed here at once, so it always moves the card.)
  el.addEventListener('touchmove', (e) => {
    if (!start || !e.cancelable) return;
    if (start.moved) { e.preventDefault(); return; }
    const t = e.touches[0], dx = t.clientX - start.x, dy = t.clientY - start.y;
    if (start.thumb && dy > 0 && dy >= Math.abs(dx) && !(start.sc && start.scTop > 0)) e.preventDefault();
  }, { passive: false });
  // (The click a drag's release makes is not a tap: swallowed if it comes within 350 ms, timed by the clock, not a timer a busy page runs late.)
  el.addEventListener('click', (e) => { if (performance.now() < swallow) { swallow = 0; e.stopPropagation(); e.preventDefault(); } }, true);
  const end = (e) => {
    if (!start || (e && e.pointerId !== start.id)) return;
    const s0 = start; start = null;
    // (The pull's numbers become the resting style it always left: the same inline translate, then the animations go, in this one task.)
    if (s0.moved) { if (s0.phone) setSheetOffset(el, el._sheetOff || 0); else if (s0.mv) { if (s0.wx === s0.wx) el.style.translate = `${s0.wx}px ${s0.wy}px`; s0.mv.cancel(); } }
    classSoon(el, 'dragging', false);
    if (s0.moved) swallow = performance.now() + 350;
    if (!s0.moved || !s0.phone) return;
    const speed = releaseSpeed(s0.trail, performance.now());   // (the finger's, px per ms down: the settle carries it on)
    const box = lay || s0.box, off = el._sheetOff || 0, drawn = box - off;
    const carry = (to) => carryCurve(speed, to - off, D_SMALL);
    if (s0.thumb && s0.dy > 0) {
      // (15 Oct, Mohammad) From Full a pull down always settles at Half, however fast; only a second pull, from Half,
      // closes the card: past a short way down or a quick flick. A short pull eases back where it was.
      const S = s0.S, fromFull = s0.size === S.length - 1 && S.length > 1;
      // (A flick is how fast the finger was going as it lifted, not only the pull's average: a slow start and a quick flick at the end is one.)
      const flick = isFlick(s0.dy, speed, s0.dy / Math.max(1, performance.now() - s0.t0), SHEET_FLICK_MIN, SHEET_FLICK_FAR);
      if (fromFull) {
        // (the card eases from where the finger left it: back to Full after a short pull, to Half otherwise, leaving at the finger's speed)
        if (s0.dy > 40) size = half();
        const v = sizeValue(), to = box - pxOf(v);
        glideSheet(el, Math.max(0, to), { easing: carry(Math.max(0, to)), done: () => commit(v), frame: growTo });
        return;
      }
      const gone = flick || s0.dy > Math.min(SHEET_CLOSE_PX, s0.h * SHEET_CLOSE_SHARE);
      if (!gone) { const to = box - s0.h; glideSheet(el, to, { easing: carry(to), done: () => commit(sizeValue()), frame: growTo }); return; }
      // Sinks out of sight behind the tab row, then closes (already gone, so the close plays nothing of its own).
      glideSheet(el, box + 8, { easing: carry(box + 8), done: () => { el.dataset.swiped = '1'; onClose(); delete el.dataset.swiped; setSheetOffset(el, 0); } });
      return;
    }
    // (The height it is headed for: where the finger left it, carried on a little by its speed, so a flick up reaches the next height.)
    const frac = flickAim(drawn / s0.H, speed, s0.H), S = s0.S;
    if (frac < (s0.thumb ? 0.4 : SIZES[0] * 0.7)) { onClose(); return; }
    size = S.reduce((best, v, i) => (Math.abs(v - frac) < Math.abs(S[best] - frac) ? i : best), 0);
    const v = sizeValue(), h1 = pxOf(v);
    if (h1 > box + 1) { stopSheet(el); hold(); el.style.height = `${h1}px`; lay = h1; setSheetOffset(el, h1 - drawn); }
    const B = lay || box, to = Math.max(0, B - h1);
    glideSheet(el, to, { easing: carryCurve(speed, to - (el._sheetOff || 0), D_SMALL), done: () => commit(v), frame: growTo });
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', (e) => { if (e.target === el) end(e); });   // (not a child's: a touch is first captured by what is under the finger, and handing the capture to the sheet at 6 px ends that one, which bubbles up here)
  // (Opening sizes the sheet at once: it never comes in at the last size it had and shrinks into place, and the figure frames once.)
  return { open: () => { if (isPhone()) { size = half(); stopSheet(el); commit(sizeValue()); } }, closed: () => { stopSheet(el); setSheetOffset(el, 0); el.style.translate = ''; cancelMoves(el); releaseFrame(el); growOff(); el.style.height = ''; lay = 0; el.style.clipPath = ''; } };
}
