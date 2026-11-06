// The one engine behind every sheet over the thumb dock (Menu system plan W2, 4 Nov 2026): the cards (Details, Treat, Tests) and the menu sheets
// (Layers, Settings, History, Blood, Colored-by) are pulled, flicked and settled by the same rules, on pointer events.
//   - A card's box is never laid out on the finger's account: a pull up that needs a taller box holds what flexes (the Tests chart) at the
//     size it is drawn at, so the first touch changes nothing on the page (holdFrame); the box and the content are committed once, in the
//     frame the sheet lands in (commit), together with the offset going back to 0.
//   - The release reads one set of numbers for cards and menus (ease.js SHEET_FLICK_MIN/FAR, SHEET_CLOSE_PX/SHARE, D_SMALL): the cards here, the
//     menu sheets in util.js swipeSheet, and a vessel's or organ's card in card.js, on the same rules and the same 240 ms let-go.
// Moved out of main.js unchanged but for the frame hold.
import { $, isPhoneLayout, TABLET_UP_MQ, holdCanvasSize, releaseCanvasSize, redrawSized } from './util.js';
import { sheetParts, sheetOffset, setSheetOffset, stopSheet, glideSheet, dragSheet } from './sheet-move.js';
import { SHEET_FLICK_MIN, SHEET_FLICK_FAR, SHEET_CLOSE_PX, SHEET_CLOSE_SHARE, releaseSpeed, isFlick, flickAim, carryCurve, D_SMALL } from './ease.js';
import { moverOf, cancelMoves } from './num-move.js';
import { restPass } from './rest-pass.js';
import { classSoon } from './class-soon.js';
import { readBox, readMetric, readStyle } from './layout-snap.js';
import { reduceMotionMQ } from './motion.js';
import { sheetDockVars } from './dock-vars.js';
import { growProgress, lerpAt, clipAt, r2, pullOffset } from './sheet-grow-math.js';

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
  // The chart grows with the finger (Menu system plan W3, option A; `grow`, the Tests card on a phone). A pull between Half and Full lays the card
  // out once, at Full, for the whole gesture (the box is that tall anyway, the content held down by the offset), and where Half and Full each put
  // every part of the open pane is read once, as the pull begins. Each frame then draws every part where it is between the two, by how far the
  // card's drawn height has gone from Half's to Full's (sheet-grow-math.js): a chart is drawn by the GPU at its in-between size (its canvas's
  // size is held, util.js holdCanvasSize, and the chart drawn again, trace-gl.js redrawSized: its words and lines at their own size, never a
  // stretched picture) and cut to it by a clip; whatever is not a chart is moved by translate, and what only Full shows (the notes) fades in
  // with the pull. At Half's height the card is the Half card exactly and at Full's the Full card, so the landing changes nothing: no pop.
  // (6 Nov 2026. It replaces a pane held at its Half size whose chart boxes were scaled by the compositor: the pictures and their words
  // stretched, the end was guessed by a probe, and the charts were drawn at their true size only some frames after the landing.)
  let gr = null;   // { pane, half0, A: Half's or the first layout's places, hA, pending, items, hH, hF, last }
  const growOK = () => grow && isPhone() && thumb();
  const NOT_PART = 'canvas.trace-gl, canvas.glw-cv, canvas.wgl';   // (a chart's GPU picture and a readout's: they ride their host)
  // Where every part of the pane is laid out now, from the pane's own corner (so the card's offset counts for nothing).
  const placesOf = (pane) => {
    const pr = readBox(pane), m = new Map();   // alloc-rare: twice for each gesture
    let n = 0;
    for (const e of pane.querySelectorAll('*')) {
      if (++n > 900) break;   // (a pane is a few hundred parts at most)
      if (e.ownerSVGElement) continue;   // (inside a drawing: it moves with the drawing)
      const r = readBox(e);
      m.set(e, { x: r.left - pr.left, y: r.top - pr.top, w: r.width, h: r.height });   // alloc-rare: once for each part, twice for each gesture
    }
    return m;
  };
  const stopPx = (i) => { const S = stops(), r = room(); return r ? Math.round(S[i] * r) : S[i] * readMetric(app, 'clientHeight'); };
  // The look a stop gives the pane: Half hides the longer words, and the plot and square sizes follow the card's height (as commit writes them).
  const stopLook = (isHalf, px) => {
    el.classList.toggle('sheet-half', isHalf);
    const dv = sheetDockVars(px, true);
    el.style.setProperty('--plot-h', `${dv.plot}px`); el.style.setProperty('--square-size', `${dv.square}px`);
  };
  const painted = (cs) => (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0) > 0 || cs.backgroundImage !== 'none' || !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(cs.backgroundColor) || cs.boxShadow !== 'none';
  // The parts of `node` the pull moves, Half's places `A`, Full's `B`, under the part `par` (its index, -1 for the pane), `l0` the shift at Half of
  // the part before (what a part only Full shows rides with); returns that shift after its last part.
  const partsIn = (node, par, A, B, items, l0x, l0y) => {
    let lx = l0x, ly = l0y;
    for (const c of node.children) {
      if (c.tagName === 'CANVAS') continue;   // (a chart's canvases are its chart's: drawn at its size, never moved on their own)
      const a = A.get(c), b = B.get(c);
      if (!b || !(b.w > 0 || b.h > 0)) {   // (not shown at Full: nothing to draw; a part with no box of its own, display: contents, holds parts that are)
        if (c.firstElementChild) { const l = partsIn(c, par, A, B, items, lx, ly); lx = l[0]; ly = l[1]; }
        continue;
      }
      // (An item: the part, the one it rides in, its two places, its shift at Half, what it is, and what it wore before the pull.)
      const it = { el: c, par, a, b, dx: lx, dy: ly, kind: 'move', clip: false, rad: 0, cv: null, cx: 0, cy: 0, still: false, was: [c.style.translate, c.style.opacity, c.style.clipPath] };   // alloc-rare: once for each part, for each gesture
      if (!a || !(a.w > 0 || a.h > 0)) { it.kind = 'appear'; items.push(it); continue; }
      it.dx = a.x - b.x; it.dy = a.y - b.y; it.still = Math.abs(it.dx) < 0.01 && Math.abs(it.dy) < 0.01;
      const same = Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5, i = items.length;
      items.push(it);
      lx = a.x - b.x; ly = a.y + a.h - (b.y + b.h);
      if (c.classList.contains('chart-box')) {
        it.kind = 'chart'; it.clip = !same; it.rad = parseFloat(readStyle(c).borderTopLeftRadius) || 0;
        it.cv = [];   // alloc-rare: once for each chart, for each gesture
        for (const cv of c.querySelectorAll('canvas')) {
          if (cv.matches(NOT_PART)) continue;
          const ca = A.get(cv), cb = B.get(cv);
          if (ca && cb && ca.w > 0 && ca.h > 0 && cb.w > 0 && cb.h > 0) it.cv.push([cv, ca.w, ca.h, cb.w, cb.h]);   // alloc-rare: once for each chart canvas
        }
        partsIn(c, i, A, B, items, it.dx, it.dy);   // (the words and buttons over a chart keep their own places in it)
        continue;
      }
      if (same || typeof SVGElement !== 'undefined' && c instanceof SVGElement || !c.firstElementChild) continue;
      // (A part that holds others and is laid out at another size: it moves to its in-between corner and what it holds is placed in it; it is cut
      // to its in-between size only where it shows a box of its own.)
      it.kind = 'box'; const cs = readStyle(c); it.clip = painted(cs); it.rad = parseFloat(cs.borderTopLeftRadius) || 0;
      partsIn(c, i, A, B, items, it.dx, it.dy);
    }
    return [lx, ly];   // alloc-rare: once for each part that holds others, for each gesture (the shift at Half of the foot of the last part)
  };
  // The pull begins: where the parts are laid out now is read before the box is made taller (growLaid reads the rest once it is).
  const growBegin = () => {
    if (gr || !growOK()) return false;
    const pane = el.querySelector('.dock-body .dock-pane.active');
    if (!pane || readMetric(pane, 'scrollTop') > 0) return false;   // (a pane scrolled down is held at its size, as before)
    gr = { pane, half0: el.classList.contains('sheet-half'), A: placesOf(pane), hA: readMetric(el, 'offsetHeight'), pending: true, items: null, hH: 0, hF: 0, last: NaN };   // alloc-rare: once for each gesture
    return true;
  };
  // The box is as tall as the gesture needs (Full's height): the pane takes Full's look and is laid out there for the gesture, Half's places are
  // read (from the start, or laid out once and put back), and the parts are drawn where the card is now.
  const growLaid = () => {
    if (!gr || !gr.pending) return;
    gr.pending = false;
    const S = stops(), iF = S.length - 1, iH = half(), fullPx = stopPx(iF);
    stopLook(false, fullPx);
    gr.hF = readMetric(el, 'offsetHeight');
    const B = placesOf(gr.pane);
    let A = gr.A;
    if (gr.half0) gr.hH = gr.hA;
    else {
      const prev = el.style.height, halfPx = stopPx(iH);
      el.style.height = `${halfPx}px`; stopLook(true, halfPx);
      gr.hH = readMetric(el, 'offsetHeight');
      A = placesOf(gr.pane);
      el.style.height = prev; stopLook(false, fullPx);
    }
    gr.A = null;
    const items = [];   // alloc-rare: once for each gesture
    partsIn(gr.pane, -1, A, B, items, 0, 0);
    gr.items = items;
    el.classList.add('sheet-grow');   // (the pane's own transitions held off: every frame of the pull is set by the finger, app.css)
    drawAt(gr.half0 ? 0 : 1);
  };
  // Every part where it is at p (0 Half, 1 Full).
  const drawAt = (p) => {
    gr.last = p;
    const items = gr.items, q = 1 - p;
    for (let i = 0; i < items.length; i++) {
      const it = items[i], up = it.par >= 0 ? items[it.par] : null;
      it.cx = it.dx * q; it.cy = it.dy * q;
      const st = it.el.style;
      if (!(it.still && (!up || up.still))) { const tx = r2(it.cx - (up ? up.cx : 0)), ty = r2(it.cy - (up ? up.cy : 0)); st.translate = tx || ty ? `${tx}px ${ty}px` : it.was[0]; }
      if (it.kind === 'appear') st.opacity = p < 1 ? String(p) : it.was[1];
      if (it.clip) st.clipPath = p < 1 ? clipAt(it.b.w, it.b.h, lerpAt(it.a.w, it.b.w, p), lerpAt(it.a.h, it.b.h, p), it.rad) : it.was[2];
      if (it.cv) for (const [cv, aw, ah, bw, bh] of it.cv) { holdCanvasSize(cv, r2(lerpAt(aw, bw, p)), r2(lerpAt(ah, bh, p))); redrawSized(cv); }
    }
  };
  const growTo = (off) => {
    if (!gr || !gr.items) return;
    const p = growProgress((lay || gr.hF) - off, gr.hH, gr.hF);
    if (p !== gr.last) drawAt(p);
  };
  // The parts given back what they wore, in the task the card lands in; each chart's canvas is told the size the landing lays it out at, so
  // no frame draws it at another (toHalf: the card lands at Half).
  const growOff = (toHalf) => {
    const g = gr;
    if (!g) return;
    gr = null;
    if (!g.items) return;
    el.classList.remove('sheet-grow');
    for (const it of g.items) {
      const st = it.el.style;
      st.translate = it.was[0];
      if (it.kind === 'appear') st.opacity = it.was[1];
      if (it.clip) st.clipPath = it.was[2];
      if (it.cv) for (const [cv, aw, ah, bw, bh] of it.cv) releaseCanvasSize(cv, toHalf ? aw : bw, toHalf ? ah : bh);
    }
  };
  // Holds the pane at the size it is laid out at (once for a gesture), before the box is made taller; the Tests card on a phone grows instead.
  const hold = () => { if (held.has(el) || gr) return; if (growBegin()) return; holdFrame(el); };
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
    // (A phone's Tests card hides its longer words at Half. Written now, not by classSoon: that class lands in a task after the frame this lands in,
    // and the frame in between showed the new height with the old class, the notes missing and the chart too tall, then popped.)
    el.classList.toggle('sheet-half', thumb() && size === half());
    if (thumb() && isPhone()) { const dv = sheetDockVars(pxOf(v), true); el.style.setProperty('--plot-h', `${dv.plot}px`); el.style.setProperty('--square-size', `${dv.square}px`); }   // (what dock.js writes once the card has its height: written with it, so nothing changes after the landing)
    el.style.setProperty('--sheet-size', v);
    releaseFrame(el); growOff(thumb() && size === half());
    el.style.height = ''; lay = 0;
    setSheetOffset(el, 0);
  };
  // Takes the sheet to its size. glide: from the height it is drawn at (h0), the box held at the taller of the two for the ease and
  // committed once landed; otherwise at once (a turn of the device, an opening).
  const apply = (glide = false, h0 = 0, easing) => {
    const v = sizeValue();
    if (!glide || !isPhone() || reduceMotionMQ.matches) { stopSheet(el); commit(v); return; }
    const h1 = pxOf(v), H = Math.max(h0, h1);
    if (Math.abs(h1 - h0) < 1) { stopSheet(el); commit(v); return; }
    if (lay !== H) { stopSheet(el); hold(); el.style.height = `${H}px`; lay = H; growLaid(); setSheetOffset(el, H - h0); }
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
    const H = Math.max(start.box, Math.round(start.top));
    if (H <= start.box + 1) return;
    stopSheet(el);
    hold();   // (the pane that fills the card keeps its size: the chart is not laid out, resized or redrawn by the touch)
    el.style.height = `${H}px`; lay = H;
    start.box = readMetric(el, 'offsetHeight');   // (as laid out: the stylesheet's cap may hold it lower)
    lay = start.box;
    growLaid();   // (the Tests card: Full's look and places, read now that the box is Full's height)
    // (Where the finger has taken the card by now, as the moves after it draw it: it was put back to where it began, and the first move after
    // jumped it by what the finger had gone before the capture came.)
    const at = pullOffset(start.box, start.h, start.dy || 0);
    setSheetOffset(el, at); el._sheetOff = at; start.wOff = at;
    growTo(at);
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
      if (grow && start.full && start.phone) { hold(); growLaid(); }   // (from Full the pane is held at Full size: a pull down shrinks the chart with the finger)
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
    if (h1 > box + 1) { stopSheet(el); hold(); el.style.height = `${h1}px`; lay = h1; growLaid(); setSheetOffset(el, h1 - drawn); }
    const B = lay || box, to = Math.max(0, B - h1);
    glideSheet(el, to, { easing: carryCurve(speed, to - (el._sheetOff || 0), D_SMALL), done: () => commit(v), frame: growTo });
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', (e) => { if (e.target === el) end(e); });   // (not a child's: a touch is first captured by what is under the finger, and handing the capture to the sheet at 6 px ends that one, which bubbles up here)
  // (Opening sizes the sheet at once: it never comes in at the last size it had and shrinks into place, and the figure frames once.)
  return { open: () => { if (isPhone()) { size = half(); stopSheet(el); commit(sizeValue()); } }, closed: () => { stopSheet(el); setSheetOffset(el, 0); el.style.translate = ''; cancelMoves(el); releaseFrame(el); growOff(true); el.style.height = ''; lay = 0; el.style.clipPath = ''; } };
}
