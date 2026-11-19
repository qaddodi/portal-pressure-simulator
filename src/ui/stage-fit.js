// The framing: card and pill insets, the clear-of-pill view, the fit and default view for each view, refit, close view, the circuit rotation and reveal.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { VB_ANAT, VB_CIRC } from './anatomy.js';
import { viewBoxAt, viewXfCameraInto, viewXfDetach } from './view-xf.js';
import { caught } from './caught.js';
import { figureShift, panInto, revealDelta, roomiest, squeezeBottom, topOverColumn, uprightFitOf } from './card-clear.js';
import { CAM_MS_MAX } from './ease.js';
import { clipBox, mapBox } from './fit-box.js';
import { cancelFrame } from './frame.js';
import { COUNTED, gpuProbe } from './gpu-probe.js';
import { reduceMotionMQ as reduceMotion } from './motion.js';
import { elBoxInto } from './shape-gl.js';
import { store, setViewKey } from './store.js';
import { clamp, restBox, settledBox, translateRest } from './util.js';

import { stageScope } from './stage-scope.js';
import { listMatrix } from './transform-read.js';
export function createFit(st, live) {
  const { CIRC_C, EV, VB_CIRC_R, anchorFor, animateVT, applyVT, clientToWorld, driftEnd, gAscites, gBackdrop, gOrgans, geo, gutKids, readFrame, refreshCTM, rotDeg, rotEase, setViewBox, stageBox, svg, vbBox, watch, wrap } = st;
   // Default framing. The circuit is a wide map (≈ 1.9 : 1); in a squarish or tall viewport,
  // fitting its width would shrink every station to a dot, so it opens zoomed to fill the height,
  // centered on the portal vein and liver, and the learner pans sideways to the beds or heart.
  // The esophagus and the great veins run on above the plate and fade out; Fit stops where they fade.
  const FIT_TOP = -40;
  // The figure fills the window and the rest of the interface floats over it. Each floating piece
  // says which edge it holds (data-safe="top|bottom|left|right"); the default framing keeps the
  // figure in the space they leave. Side cards count only on a wide screen (on a phone they are
  // sheets over the figure), and the figure never shrinks to a sliver for them.
  // The space the cards leave above them and below the top bars, as it really is (no softening): the HVPG
  // procedure keeps its zoomed view and readings inside it. A phone's sheet and a tablet's wide card count as bottom.
  // (A piece sliding with the sinusoid zoom, main.js sinMotion: the dock as it slides away (vd-out) no longer counts, and while
  // the dock or the view pill slides back, data-slide-y holds its shift on screen, so it counts where it will rest.)
  const slideRest = (el, q) => { const y = +el.dataset.slideY || 0; return y ? new DOMRect(q.x, q.y - y, q.width, q.height) : q; };
  // (A card hidden by visibility no longer counts, except the slide's data card while it waits for its entry (data-safe-waits):
  // an upright phone's data card with its readings on a sheet waits hidden by visibility, not opacity (styles/app.css
  // .pz-sheet.pz-hide), while the slide's camera frames. Skipped then, the figure framed as if no card stood at the top, and the
  // card came in over the slide's vessel: the test all deck's clot slide on an iPhone, 19 Oct. Only that card: the Tests sheet and
  // the Details panel (data-safe-rest too) are hidden by visibility when closed, and counted then, the app opened framed small at
  // the top of a phone, 19 Oct.)
  const unseenCard = (el) => !('safeWaits' in el.dataset) && (el.checkVisibility ? !el.checkVisibility({ visibilityProperty: true }) : getComputedStyle(el).visibility === 'hidden');
  // (Kept while nothing they measure may have moved (layoutWatch), and taken against the kept stage box: each call read every card's box
  // and the stage's, many times in a slide's frames.)
  // (1 Nov 2026, "zero layout inside the frame": the cards' boxes and the zoom and nav pills' are read together (snapRead) as the stage
  // is made, first in the frame after anything placed changes (layoutWatch's touch, readFrame), after a resize, and once more as the
  // watch settles; every framing in between (safeInsets, cardSpace, clearPill, centreDrawn) is worked out from that snapshot, with no
  // read. A read-phase caller about to frame (a refit, the home look, the first fit) takes a fresh one first if a change is waiting
  // (snapFresh).)
  const insMemo = new Map();
  // (fn is handed a, b and c, so a caller need not make a closure to pass its arguments.)
  function insKept(key, fn, a, b, c) {
    const m = insMemo.get(key);
    if (m) return m;
    const v = fn(a, b, c);
    insMemo.set(key, v);
    return v;
  }
  const flag = { imaging: false, dataLayer: false, hasSel: false, orgSel: false };   // (what update last found: read by the paints after it)
  let cardsSnap = [], pillsSnap = { zoom: null, nav: null }, snapDirty = true, snapAsk = 0, snapSettle = 0;
  // A phone held sideways: the top bar's pieces (the patient chip, the key, the toolbar) stand apart with the figure between them, so each is
  // counted by itself and only those over the figure's column cover its top (A11: the figure had a quarter of the screen, the whole bar's two
  // rows over it). Everywhere else the bar is one box. (data-safe-parts on the bar names the pieces.)
  const landPhoneMQ = matchMedia('(max-width: 1023px) and (max-height: 500px) and (orientation: landscape)');
  function cardsRead() {
    const out = [];
    for (const el of document.querySelectorAll('[data-safe]')) {
      // (A card playing its way out no longer counts: the camera frames for what stays.)
      if (el.hidden || el.closest('[hidden]') || el.classList.contains('card-leaving') || el.classList.contains('leaving') || el.classList.contains('ac-leaving') || el.classList.contains('vd-out')) continue;
      if (unseenCard(el)) continue;
      // (The Compare bar floats over the figure's top on a wide screen and takes no room: the figure holds still when Compare starts, Mohammad 17 Nov 2026, "hold still is ok". A phone keeps it clear.)
      if (el.id === 'stageCenter' && insWrap().width >= 768) continue;
      const parts = el.dataset.safeParts && landPhoneMQ.matches && !store.get().presenting ? el.querySelectorAll(el.dataset.safeParts) : null;
      for (const pc of parts || [el]) {
        const q = slideRest(pc, pc.getBoundingClientRect());
        if (!q.width || !q.height) continue;
        // (data-safe-rest: a card whose own transform only eases it in or out counts where it rests, so the camera frames once.)
        out.push({ el: pc, q, rest: 'safeRest' in el.dataset ? translateRest(pc, restBox(pc, q)) : q, edge: el.dataset.safe, part: !!parts });
      }
    }
    return out;
  }
  function pillRead(el, settle) {
    if (!el) return null;
    const box = settle ? settledBox(el) : el.getBoundingClientRect();
    return { el, box, shown: !!box.width && getComputedStyle(el).visibility !== 'hidden' };
  }
  function snapRead() {
    snapAsk = 0; snapDirty = false;
    cardsSnap = cardsRead();
    pillsSnap = { zoom: pillRead(document.getElementById('zoomPill'), true), nav: pillRead(document.querySelector('.pz-bar.pzb-pill'), false) };
    insMemo.clear();
    // A card that settles into a new size or place after the pan was worked out (the instrument card growing, a sheet easing in, a card's words arriving):
    // the pan is worked out again from the room it really leaves, the same zoom, glided to (F32). The room the last pan was judged against is cardsSig.
    if (cardsSig !== null && !store.get().presenting && roomSig() !== cardsSig) { cardsSig = null; stageScope.clear(cardsAgainT); cardsAgainT = stageScope.timer(cardsMoved, 0); }
  }
  let cardsSig = null, cardsAgainT = 0;
  const roomSig = () => cardsSnap.map((c) => `${c.el.id || c.el.className}:${Math.round(c.rest.left)},${Math.round(c.rest.top)},${Math.round(c.rest.right)},${Math.round(c.rest.bottom)}`).join('|');
  function snapFresh() { if (snapDirty) snapRead(); }
  function snapAgain() {
    snapDirty = true; snapAsk ||= readFrame(snapRead);
    stageScope.clear(snapSettle); snapSettle = stageScope.timer(snapAgainLater, 2600);   // (and once the watch has settled: a card's last eased box)
  }
  function snapAgainLater() { snapDirty = true; snapAsk ||= readFrame(snapRead); }
  watch.onTouch(snapAgain);
  snapAgain();
  addEventListener('resize', snapAgain);
  addEventListener('orientationchange', snapAgain);
  // A turn of the device frames the figure again (16 Nov 2026, style play-test, iPad portrait in Navy: "a leftover zoom crops the figure until Fit is
  // tapped"). A view the learner zoomed or panned kept its camera through a turn, so the figure, laid out for the other shape, stood cropped; a view at home
  // followed the new room already. The turn is Fit's moment, as the presenter's is (stage.handClear: a turn or a new window size). Not in the lobule, and not
  // while presenting (the slide frames itself). Refit measures in the next frame, after the new layout has settled.
  const turnMQ = matchMedia('(orientation: portrait)');
  const onTurn = () => { if (live.lobuleOn || live.fitted || store.get().presenting) return; live.handed = false; refit(); };
  if (turnMQ.addEventListener) turnMQ.addEventListener('change', onTurn); else turnMQ.addListener?.(onTurn);
  const insWrap = () => stageBox();
  function cardSpace() { return { ...insKept('space', cardSpaceFrom, cardsSnap) }; }
  // (Live, for a caller already in the read phase: the catheter's room.)
  const cardSpaceRead = () => cardSpaceFrom(cardsRead());
  function cardSpaceFrom(list) {
    if (gpuProbe.on) gpuProbe.note(COUNTED.safe);
    const wr = insWrap(), W = wr.width, H = wr.height, sp = { t: 0, b: 0 };
    for (const { el, rest: q, edge: pedge, part } of list) {
      const y0 = ((el.classList.contains('mini') || el.dataset.folding) && +el.dataset.fullH ? q.bottom - +el.dataset.fullH : q.top) - wr.top - (+el.dataset.safePad || 0), y1 = q.bottom - wr.top;
      if (y1 <= 0 || y0 >= H) continue;
      const edge = pedge || el.dataset.safe;
      if (part && (q.left - wr.left > W * 0.62 || q.right - wr.left < W * 0.38)) continue;   // (a sideways phone's top-bar piece at an outer edge: the rail, the chip: not over the room's middle)
      if (edge === 'top') sp.t = Math.max(sp.t, y1);
      else if (y0 > H * 0.3 && (W < 768 || q.width > W * 0.75 || (edge === 'bottom' && !el.classList.contains('side')))) sp.b = Math.max(sp.b, H - y0);
    }
    return sp;
  }
  // (exact: the cards' real edges, with no softening: a slide that must keep its vessels clear of them, even where they leave a thin band.)
  const INS_KEY = ['ins|0|', 'ins|1|'];   // (the memo's keys for no skipped pieces: kept, not built)
  function insSkipKey(exact, skip) { let k = INS_KEY[exact ? 1 : 0]; for (let i = 0; i < skip.length; i++) k += (i ? ',' : '') + (skip[i]?.id || '?'); return k; }
  // room: the cards' real edges for a pan (cardPanVT, reveal): the sliver rule below is a sizing rule, and a view that is only moved needs the true gap between two cards.
  function safeInsets(exact = false, skip = null, room = false) {
    const key = skip ? insSkipKey(exact, skip) : INS_KEY[exact ? 1 : 0];
    return { ...insKept(room ? `room|${key}` : key, safeInsetsFrom, cardsSnap, exact, skip, room) };
  }
  // The room the camera's SIZE is worked out in: the bars and the pills, never the cards (Mohammad, 17 Nov 2026, Mac and phone: opening a card keeps the
  // zoom). What an open card changes is where the view sits: cardPanVT pans it, so as much as possible of what was in view stays in the room the card
  // leaves. Only Fit, pressed on purpose, sizes the figure to the room the cards leave (cardsCount), until no card is open (cardsMoved). The catheter's
  // room and a vessel's reveal read the real cards (safeInsets), so a measurement keeps its tip clear of them.
  const CARD_IDS = ['dock', 'panel', 'treatCard', 'historyCard'];   // (Tests, Details, Treat, History: index.html)
  let cardsCount = false, cardEls = null, vesselCard = null;
  // (The vessel's card, on the left shelf of a Mac or an iPad and over the foot of a phone, is a card too: card.js gives it data-safe.)
  const cardList = () => {
    cardEls ||= CARD_IDS.map((id) => document.getElementById(id)).filter(Boolean);
    vesselCard ||= document.querySelector('.action-card');
    return vesselCard && !cardEls.includes(vesselCard) ? (cardEls = [...cardEls, vesselCard]) : cardEls;
  };
  function fIns() {
    if (cardsCount) return safeInsets();
    const cards = cardList();
    return cards.length ? safeInsets(false, cards) : safeInsets();
  }
  // The view `v` (of view box vbArr, drawn box art in world units) panned, never scaled, so what it shows of the art inside the room the bars leave
  // (fIns) stays as much as it can inside the room the cards leave (safeInsets), 12 px clear on the sides. `v` is returned as it is when no card
  // takes room or none of the art is in view.
  function cardPanVT(v, vbArr, art) {
    const i0 = fIns(), iR = safeInsets(false, null, true), { W, H } = iR;
    if (!W || !H || (i0.l === iR.l && i0.r === iR.r && i0.t === iR.t && i0.b === iR.b)) return v;
    const [vx, vy, vw, vh] = vbArr, s0 = Math.min(W / vw, H / vh);
    const ox = (W - vw * s0) / 2 - vx * s0, oy = (H - vh * s0) / 2 - vy * s0;
    const ax0 = ox + s0 * (v.x + v.k * art[0]), ax1 = ox + s0 * (v.x + v.k * art[2]), ay0 = oy + s0 * (v.y + v.k * art[1]), ay1 = oy + s0 * (v.y + v.k * art[3]);
    const x0 = Math.max(ax0, i0.l), x1 = Math.min(ax1, W - i0.r), y0 = Math.max(ay0, i0.t), y1 = Math.min(ay1, H - i0.b);
    if (!(x1 > x0) || !(y1 > y0)) return v;
    const dx = panInto(x0 - 12, x1 + 12, iR.l, W - iR.r), dy = panInto(y0, y1, iR.t, H - iR.b);
    return dx || dy ? { k: v.k, x: v.x + dx / s0, y: v.y + dy / s0 } : v;
  }
  // The pan a card's opening or closing asks of a view the learner placed (a fitted one is framed again by refit, which pans the same way): from the
  // place the view had before the last pan of ours (cardBase), so closing the card brings it back, unless the learner has moved it since.
  let cardBase = null;
  // The camera moved by itself (a card's pan, a refit): a vessel card on a phone brings its vessel above itself again, from where the view is now going (card.js).
  const REFRAMED = new Event('pps:reframed');
  const reframed = () => dispatchEvent(REFRAMED);
  function cardsMoved() {
    if (live.lobuleOn) return;
    snapFresh(); cardsSig = roomSig();
    if (cardsCount && !cardsSnap.some((c) => cardList().includes(c.el))) cardsCount = false;   // (no card is open: Fit's sizing for them is over)
    if (live.fitted) { cardBase = null; refit(); return; }
    if (live.cath.saved) return;
    const cur = live.vtGliding ? live.vtTarget : live.vt, circuit = live.morphTarget === 1;
    const base = cardBase && sameView(cur, cardBase.at) ? { k: cur.k, x: cur.x - cardBase.dx, y: cur.y - cardBase.dy } : cur;
    const to = withReveal(circuit ? cardPanVT(base, circVB(), artBox()) : cardPanVT(base, VB_ANAT, anatBox()));
    cardBase = { at: to, dx: to.x - base.x, dy: to.y - base.y };
    if (!sameView(to, cur)) { animateVT(to, 420, { steady: true }); reframed(); }
  }
  function safeInsetsFrom(list, exact = false, skip = null, room = false) {
    if (gpuProbe.on) gpuProbe.note(COUNTED.safe);
    const wr = insWrap(), W = wr.width, H = wr.height;
    const ins = { t: 0, b: 0, l: 0, r: 0, W, H }, cards = [];
    if (!W || !H) return ins;
    // A phone held sideways docks its cards at the side like a tablet (dock.js), so they count as side cards.
    const wide = W >= 768 || (W > H && H <= 500 && W >= 640);
    const blocks = [], tops = [];   // (blocks: the side cards' boxes, for the largest free rectangle, roomiest. tops: a sideways phone's top-bar pieces: [x0, x1, y1] each, judged against the figure's column below)
    for (const { el, rest: q, edge: pedge, part } of list) {
      if (skip && skip.includes(el)) continue;
      // The vitals dock folded to one line on a phone (main.js) still counts at its full height, so the
      // framing does not jump each time it folds and opens.
      // (data-safe-pad: room kept clear above a piece too, as the 8 px between the figure's readings and the view switch's pill.)
      const y0 = ((el.classList.contains('mini') || el.dataset.folding) && +el.dataset.fullH ? q.bottom - +el.dataset.fullH : q.top) - wr.top - (+el.dataset.safePad || 0);
      const x0 = q.left - wr.left, x1 = q.right - wr.left, y1 = q.bottom - wr.top;
      if (x1 <= 0 || y1 <= 0 || x0 >= W || y0 >= H) continue;
      let edge = pedge || el.dataset.safe;
      if (part && edge === 'top') { tops.push(x0, x1, y1); continue; }
      // A card is a side card when it is docked there (the Tests card's class `side`) and a sheet when it spans the screen (a phone's,
      // sideways too, and an upright iPad's), whatever the window's size says: dock.js and the phone block of app.css decide that.
      const side = el.classList.contains('side'), sheet = !side && !store.get().presenting && q.width > W * 0.65;
      if (edge === 'right' && !side && (!wide || sheet)) edge = 'bottom';   // a phone's cards are sheets over the bottom
      else if (edge === 'bottom' && el.classList.contains('side')) edge = 'right';   // the instruments docked at the side
      if (edge === 'top') ins.t = Math.max(ins.t, y1);
      else if (edge === 'bottom') ins.b = Math.max(ins.b, H - y0);
      else if (edge === 'right' && (wide || side)) { ins.r = Math.max(ins.r, W - x0); cards.push([y0, y1]); blocks.push([x0, y0, x1, y1]); }
      else if (wide && edge === 'left') { ins.l = Math.max(ins.l, x1); blocks.push([x0, y0, x1, y1]); }
    }
    // (The top-bar pieces over the figure's column cover its top; the ones beside it do not: card-clear.js. A slide's framing keeps the whole bar clear.)
    if (tops.length) ins.t = topOverColumn(tops, ins, exact);
    const bandT = ins.t, bandB = ins.b;   // (the bars' bands, before the next rule moves them: roomiest, below)
    // Where the side cards would leave under 60% of the width (a tablet held upright), a short card is cleared
    // above (or below) instead, so the figure keeps the full width rather than shrinking into a strip.
    // (Not while presenting: a slide's text and data columns are laid out to leave the figure its own column.)
    if (ins.r && W - ins.l - ins.r < W * 0.6 && !store.get().presenting) {
      const top = Math.min(...cards.map((c) => c[0])), bot = Math.max(...cards.map((c) => c[1]));
      if (top > H * 0.45) { ins.b = Math.max(ins.b, H - top + 8); ins.r = 0; }
      else if (bot <= H * 0.62) { ins.t = Math.max(ins.t, bot + 8); ins.r = 0; }
    }
    // (While presenting, the slide's words and data card both stay clear even on a tablet: the figure frames into the
    // column between them rather than going under them; only a strip too thin to frame anything gives way.)
    if (!room && W - ins.l - ins.r < (store.get().presenting ? 200 : W < 768 ? 260 : Math.min(W * 0.5, 360))) ins.l = ins.r = 0;
    // (A sheet that leaves the figure under 35% of the height gives up part of its cover, never the top bars': the figure's top stays below the pills.
    // It scaled both before, and with Tests or Treat open on an iPhone the figure's top slid under the pills: A10.)
    if (!exact) { ins.b = squeezeBottom(ins); if (!store.get().presenting) roomiest(ins, W, H, bandT, bandB, blocks); }   // (the room the cards leave: card-clear.js roomiest)
    return ins;
  }
  // A framing computed for the whole stage, moved and scaled into the free space.
  function insetVT(v, vbArr) {
    const ins = fIns(), { W, H } = ins;
    if (!W || !H) return v;
    const [vx, vy, vw, vh] = vbArr, s0 = Math.min(W / vw, H / vh);
    const f = Math.min((W - ins.l - ins.r) / W, (H - ins.t - ins.b) / H);
    const cx = vx + vw / 2, cy = vy + vh / 2, ox = (ins.l - ins.r) / 2 / s0, oy = (ins.t - ins.b) / 2 / s0;
    return { k: v.k * f, x: cx + ox + f * (v.x - cx), y: cy + oy + f * (v.y - cy) };
  }
  const circVB = () => (live.rotTarget ? VB_CIRC_R : VB_CIRC);
  // The whole map keeps clear of the zoom pill (+, −, Fit), which stands in the figure's bottom right corner beside
  // any card on the right. Where the map would run under it, the map rises at the same size until it ends 8 px above the
  // pill, if the room under the top bars allows (shrinking it would also thin out its labels); only where it does not, the
  // map shrinks just enough to end 8 px left of the pill (sweep, 16 Oct: the controls covered the Epigastric → SVC corner).
  // (The whole map's drawn extent in world units, as #net's box with every collateral open: the same in every case, so the
  // framing never moves as collaterals open.)
  const ART_CIRC = [70, 30, 1330, 730];
  // (The map's drawn box, as it stands now: turned upright, it turns a quarter turn counter-clockwise about the circuit's centre.)
  function artBox() {
    const [x0, y0, x1, y1] = ART_CIRC;
    if (!live.rotTarget) return [x0, y0, x1, y1];
    return [CIRC_C[0] + (y0 - CIRC_C[1]), CIRC_C[1] - (x1 - CIRC_C[0]), CIRC_C[0] + (y1 - CIRC_C[1]), CIRC_C[1] - (x0 - CIRC_C[0])];
  }
  // The map turned upright fills the room the bars leave: its own box (not the view box, which is 8% taller and left the map small, high under the
  // top bar and 100 px short of the view pill on an iPhone: A4) is fitted into the free height with 12 px clear above and below, and centred there.
  function uprightFit() {
    const wr = stageBox();
    return uprightFitOf(fIns(), wr.width, wr.height, VB_CIRC_R, artBox()) || insetVT({ k: 1, x: 0, y: 0 }, VB_CIRC_R);
  }
  function clearPill(v, vbArr) {
    const zp = pillsSnap.zoom, pill = zp?.el;
    if (!pill) return v;
    const p = zp.box, wr = stageBox();   // (both kept: snapRead and the stage box)
    if (!p.width || !p.height || !wr.width || !wr.height || pill.classList.contains('no-room') || !zp.shown) return v;
    const [vx, vy, vw, vh] = vbArr, s0 = Math.min(wr.width / vw, wr.height / vh);
    const ox = (wr.width - vw * s0) / 2 - vx * s0, oy = (wr.height - vh * s0) / 2 - vy * s0;
    const [x0, y0, x1, y1] = artBox();
    const ax0 = ox + s0 * (v.x + v.k * x0), ax1 = ox + s0 * (v.x + v.k * x1), ay0 = oy + s0 * (v.y + v.k * y0), ay1 = oy + s0 * (v.y + v.k * y1);
    const g = 8, pl = p.left - wr.left - g, pt = p.top - wr.top - g, pr = p.right - wr.left + g, pb = p.bottom - wr.top + g;
    if (ax1 <= pl || ax0 >= pr || ay1 <= pt || ay0 >= pb) return v;
    const up = ay1 - pt + 1, room = ay0 - fIns().t - g;   // (+1: the art's box rounds on screen; a whole pixel to spare)
    if (up <= room) return { k: v.k, x: v.x, y: v.y - up / s0 };
    if (pl - ax0 < (ax1 - ax0) * 0.5) return v;
    const f = (pl - ax0) / (ax1 - ax0), wx = (ax0 - ox) / s0, wy = ((ay0 + ay1) / 2 - oy) / s0;
    return { k: v.k * f, x: wx - f * (wx - v.x), y: wy - f * (wy - v.y) };
  }
  // On a slide, the circuit as drawn (its header row down to its lowest open vessel) stands centred in the height the cards leave,
  // above the nav pill, at the same size: framed for every collateral, a circuit with few open sat high over a bare band (17 Oct
  // design review, iPad on its side). Read from the vessels' circuit courses, which never morph, so it frames once.
  function centreDrawn(v) {
    if (!store.get().presenting) return v;
    const wr = stageBox(), W = wr.width, H = wr.height;
    if (!W || !H) return v;
    let bot = -Infinity;
    for (const x of EV) {
      if (!x.vis || x.ghost) continue;
      const C = geo[x.e.id]?.C;
      if (C) for (const p of C) if (p[1] > bot) bot = p[1];
    }
    if (!Number.isFinite(bot)) return v;
    const [, vy, vw, vh] = VB_CIRC, s0 = Math.min(W / vw, H / vh), oy = (H - vh * s0) / 2 - vy * s0;
    const ins = fIns(), top = oy + s0 * (v.y + v.k * vy), end = Math.min(oy + s0 * (v.y + v.k * (vy + vh)), oy + s0 * (v.y + v.k * bot) + 30);
    let floor = H - ins.b;
    for (let pi = 0; pi < 2; pi++) {
      const pl = pi ? pillsSnap.zoom : pillsSnap.nav, r = pl?.box;
      if (r?.width && pl.shown) floor = Math.min(floor, r.top - wr.top - 8);
    }
    const hi = floor - end, dy = Math.min(hi, Math.max(ins.t + 4 - top, (ins.t + floor) / 2 - (top + end) / 2));   // (never past the pill, nor its top under a card)
    return hi > 0 && dy > 0 ? { k: v.k, x: v.x, y: v.y + dy / s0 } : v;
  }
  // The whole map, in the space the cards leave and clear of the zoom pill.
  const circWhole = () => cardPanVT(clearPill(live.rotTarget ? uprightFit() : insetVT({ k: 1, x: 0, y: 0 }, circVB()), circVB()), circVB(), artBox());
  // The boxes the home framing fits: whole groups as drawn, and each gut organ (in its own transform) with every clipped
  // part cut to its clip path's box.
  // (The boxes are folded into acc [x0, y0, x1, y1] as they are worked out, none kept: the one caller wants only their union. A group's parts
  // wait in one flat list of numbers (x, y, width, height each) for the group's matrix, which is read after them as it always was.)
  const fitParts = [], fitWhole = [], fitBoxA = { x: 0, y: 0, width: 0, height: 0 }, fitBoxK = { x: 0, y: 0, width: 0, height: 0 }, fitBoxP = { x: 0, y: 0, width: 0, height: 0 }, fitM = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  function fitFold(acc, b) {
    if (!b.width || !b.height) return;
    acc[0] = Math.min(acc[0], b.x); acc[1] = Math.min(acc[1], b.y); acc[2] = Math.max(acc[2], b.x + b.width); acc[3] = Math.max(acc[3], b.y + b.height);
  }
  function fitBoxes(whole, clipped, acc) {
    // (2 Nov 2026: each box worked out in script from the shapes' own numbers (elBox), not getBBox, which laid the page out in a pan.)
    for (const g of whole) { const b = elBoxInto(g, fitBoxA); if (b) fitFold(acc, b); }
    for (const g of clipped) {
      const parts = fitParts;
      parts.length = 0;
      for (const c of g.children) {
        const b = elBoxInto(c, fitBoxA); if (!b || !b.width || !b.height) continue;
        const id = /url\(#([^)]+)\)/.exec(c.getAttribute('clip-path') || '')?.[1];
        const cp = id && svg.querySelector('#' + CSS.escape(id))?.firstElementChild;
        const k = cp && elBoxInto(cp, fitBoxK);
        const pb = k ? clipBox(b, k) : b;
        if (pb) parts.push(pb.x, pb.y, pb.width, pb.height);
      }
      const m = g.transform?.baseVal ? listMatrix(g.transform.baseVal, fitM) : null, P = fitBoxP;
      for (let i = 0; i < parts.length; i += 4) {
        P.x = parts[i]; P.y = parts[i + 1]; P.width = parts[i + 2]; P.height = parts[i + 3];
        fitFold(acc, m ? mapBox(P, m) : P);
      }
    }
  }
  const fitAcc = [0, 0, 0, 0];
  // The anatomy's drawn box in world units (what Fit frames), measured from what is drawn: written into one shared list, read at once.
  function anatBox() {
    let x0 = VB_ANAT[0], y0 = VB_ANAT[1], x1 = VB_ANAT[0] + VB_ANAT[2], y1 = VB_ANAT[1] + VB_ANAT[3];
    // Only what holds still is measured: the abdomen, the organs and the ascites. The vessels morph (to and from
    // the circuit, and as the first frames lay them out), and measuring them made the framing land in one place
    // and then glide to another a second later.
    // (A box ignores clip paths, so the gut's art, drawn past Mohammad's outlines and clipped to them, is measured
    // clipped: fitBoxes. Measured whole, its loose ends pushed the framing off centre.)
    fitWhole.length = 0; fitWhole.push(gBackdrop);
    for (let c = gOrgans.firstElementChild; c; c = c.nextElementSibling) if (c !== live.gGut) fitWhole.push(c);
    fitWhole.push(gAscites);
    const acc = fitAcc;
    acc[0] = x0; acc[1] = y0; acc[2] = x1; acc[3] = y1;
    fitBoxes(fitWhole, gutKids(), acc);
    x0 = acc[0]; y0 = acc[1]; x1 = acc[2]; y1 = acc[3];
    y0 = Math.max(y0, FIT_TOP) - 8; y1 += 8;
    acc[0] = x0; acc[1] = y0; acc[2] = x1; acc[3] = y1;
    return acc;
  }
  function defaultVT(circuit) {
    if (!circuit) {
      // Fit frames everything the plate draws: the heart and the veins above it, the organs, the
      // flanks, and with ascites the fluid pooled in the pelvic floor below the default frame. The
      // box is measured, so it follows an enlarged spleen or a growing ascites.
      // (The layout size: the svg's drawn rectangle is scaled while the lobule zoom plays, and a fit read from it lands somewhere else.)
      const sb = stageBox(), rw = sb.sw, rh = sb.sh;   // (the svg's box as kept, measured without the dive's zoom)
      if (!rw || !rh) return { k: 1, x: 0, y: 0 };
      const ab = anatBox();
      const x0 = ab[0], y0 = ab[1], x1 = ab[2], y1 = ab[3];
      // The svg shows its viewBox scaled to fit (meet), and the spare room on the other axis is
      // visible too: fit the box into that whole visible area, less what the floating pieces cover.
      const ins = fIns(), tg = ins.W < 768 ? 10 : 0;   // (tg: on a phone the figure's top keeps 10 px clear of the pills, A10)
      const s0 = Math.min(rw / VB_ANAT[2], rh / VB_ANAT[3]);
      const fw = Math.max(40, rw - ins.l - ins.r), fh = Math.max(40, rh - ins.t - tg - ins.b);
      const k = Math.min(1.15, fw / s0 / (x1 - x0), fh / s0 / (y1 - y0));
      // The one rule for every card (U3, card-clear.js): the figure keeps its place and moves only as far as an open card makes it.
      const sw = k * s0 * (x1 - x0) + 24, ox = figureShift(ins, sw, store.get().presenting);
      const cx = VB_ANAT[0] + VB_ANAT[2] / 2 + ox / s0, cy = VB_ANAT[1] + VB_ANAT[3] / 2 + (ins.t + tg - ins.b) / 2 / s0;
      live.fitKept = k;   // (kept for an arc's widest pull back, arcRoom)
      return cardPanVT({ k, x: cx - k * ((x0 + x1) / 2), y: cy - k * ((y0 + y1) / 2) }, VB_ANAT, ab);
    }
    // Turned upright, the map is tall and fills the height of the stage as it is.
    if (live.rotTarget) return circWhole();   // (panned for the open cards, in circWhole)
    const ins = fIns();
    const W = ins.W - ins.l - ins.r, H = ins.H - ins.t - ins.b;
    const s0 = Math.min(W / VB_CIRC[2], H / VB_CIRC[3]);
    // (With a card at the side the whole map is shown: the close-up is for a narrow screen with nothing over it.)
    if (ins.l || ins.r || VB_CIRC[3] * s0 > 0.62 * H) return cardPanVT(centreDrawn(clearPill(insetVT({ k: 1, x: 0, y: 0 }, VB_CIRC), VB_CIRC)), VB_CIRC, artBox());
    const k = clamp((0.94 * H) / (VB_CIRC[3] * s0), 1, 3);
    const cx = VB_CIRC[0] + VB_CIRC[2] / 2, cy = VB_CIRC[1] + VB_CIRC[3] / 2;
    const fx = 640, fy = cy;
    return cardPanVT(insetVT({ k, x: cx - k * fx, y: cy - k * fy }, VB_CIRC), VB_CIRC, artBox());
  }
  // Which framing the circuit was last given ('whole' map or 'focus' close-up: setView, Fit, a refit). The circuit has no home
  // look of its own, so a turn of the device or a new window size takes the same kind of framing again, for the new shape (lookHome).
  // circAt: that framing as given, so a turn or a resize takes it again only while the view is still exactly there (a card's pan to
  // reveal a vessel, a pinch or a tool's camera moved it: it stays where it was put).
  const circAt = { k: 1, x: 0, y: 0 };   // (a copy of the framing, written in place: only read while circFit is set)
  const markCirc = (kind, v) => { live.circFit = kind; circAt.k = v.k; circAt.x = v.x; circAt.y = v.y; };
  const fit = () => {
    // In the lobule view, Fit shows the whole lobule again (it never leaves the view). Inside the sinusoid it steps back out to the lobule.
    if (live.lobuleOn) { if (store.get().sinusoid) { setViewKey('lobule'); return; } live.lz.fitView(); return; }
    live.handsOff(); live.handed = false;
    cardsCount = true;   // (Fit is asked for: the figure is sized to the room the open cards leave, see fIns)
    const circuit = live.morphTarget === 1, focus = defaultVT(circuit), whole = circuit ? circWhole() : { k: 1, x: 0, y: 0 };
    const near = (a, b) => Math.abs(a.k - b.k) < 0.02 && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
    // Judged from where a glide in progress is going, so a second tap toggles as expected.
    const at = live.vtGliding ? live.vtTarget : live.vt;
    const to = circuit && !near(focus, whole) ? (near(at, whole) ? focus : whole) : focus;
    if (!circuit) live.homeAt = to;
    else markCirc(to === whole ? 'whole' : 'focus', to);
    live.fitted = true;
    // It glides there, as the zoom buttons do, in the time its reach needs (camMs; reduced motion: a short glide).
    animateVT(to, CAM_MS_MAX, { scale: true });
  };
  // The view's own button pressed again while its view is showing (17 Nov 2026, Mohammad: "when I hit anatomy while in anatomy view or lobule
  // while in lobule view the view should fit zoom"): the camera goes back to that view's fit, the framing Fit gives and a refit keeps (the
  // anatomy's home look, the circuit's whole map, the lobule's whole lobule), sized to the room the open cards leave, as the Fit button does,
  // but always there (Fit's second press toggles the circuit between its map and its close-up; a view button must not). It is the slide
  // camera's move (slide-cam.js: one plan, one straight path, one clock, one writer), so nothing else writes the view while it runs. While a
  // deck is presenting the slide owns the framing, so there it is the plain scaled glide Fit uses. True when it moved or was already there.
  const fitAgain = () => {
    if (live.lobuleOn) { if (store.get().sinusoid) return false; live.lz.fitView(); return true; }
    live.camLock?.release('view tap'); live.handsOff(); live.handed = false;
    cardsCount = true;
    const circuit = live.morphTarget === 1, to = circuit ? circWhole() : defaultVT(false);
    if (!circuit) live.homeAt = to; else markCirc('whole', to);
    live.fitted = true;
    if (!sameView(to, live.vtGliding ? live.vtTarget : live.vt)) animateVT(to, CAM_MS_MAX, store.get().presenting ? { scale: true } : { scale: true, slide: true });
    return true;
  };
  // (Measured first in the next frame, while the layout is still the last frame's (readFrame), and glided after: a refit asked for in a
  // frame (main.js, a card's fold) no longer lays the page out among that frame's writes.)
  let refitAsk = 0;
  function refit() { refitAsk ||= readFrame(refitRead); }
  function refitRead() {
    snapFresh();   // (the cards' boxes as they stand now, if anything placed changed since the last snapshot)
    refitAsk = 0;
    if (live.lobuleOn) return;
    const framed = live.circAgain && live.morphTarget === 1 && live.circFit === 'whole' ? circWhole() : defaultVT(live.morphTarget === 1), to = withReveal(framed);
    if (live.morphTarget !== 1) live.homeAt = framed; else markCirc(live.circAgain ? live.circFit : 'focus', framed);   // (the framing itself is home; the vessel's pan on top of it is not)
    live.fitted = true;
    // (Mid-measurement the catheter's camera keeps the view: its trip back ends on the new fit instead of the old one.)
    if (live.cath.saved) { live.cath.saved = to; return; }
    if (!sameView(to, live.vtGliding ? live.vtTarget : live.vt)) { animateVT(to, 420, { steady: true }); reframed(); }
  }
  // The Tests card closed. A fitted view (see fitted) is fitted again to the space the card leaves, whatever the tools did
  // with the camera meanwhile; a view the learner zoomed or panned stays where it is, and the home framing is let go so the
  // looks that follow the card leaving (resize, pps:occ) leave it alone too. Every way of closing it (the Tests button, its
  // close button, Esc, a swipe) comes here, so they all end the same. Gives back true when it fits.
  function closeView() {
    if (live.lobuleOn) return false;
    if (live.fitted) return true;
    live.homeAt = null;
    return false;
  }
  function holdView(hd) {
    const b = stageBox(), vb = vbBox, s0 = Math.min(b.sw / vb.width, b.sh / vb.height);
    const ox = b.left + b.sx + (b.sw - vb.width * s0) / 2 - vb.x * s0, oy = b.top + b.sy + (b.sh - vb.height * s0) / 2 - vb.y * s0;
    const k = hd.sc / s0, th = (rotDeg() * Math.PI) / 180, co = Math.cos(th), si = Math.sin(th);
    const dx = hd.w[0] - CIRC_C[0], dy = hd.w[1] - CIRC_C[1];
    const rx = CIRC_C[0] + co * dx - si * dy, ry = CIRC_C[1] + si * dx + co * dy;
    live.vt = { k, x: (hd.sx - ox) / s0 - k * rx, y: (hd.sy - oy) / s0 - k * ry };
    applyVT(); live.CTM = null;
  }
  function setCircuitRotated(on) {
    live.camLock?.release('turn');   // (the person's own move: a slide's move lets go of the camera, slide-cam.js)
    on = on ? 1 : 0;
    snapFresh();   // (the bars' boxes as they stand now: the turned map is fitted into the room they leave, and a stale snapshot left its bottom third under the play bar)
    try { localStorage.setItem('pps.circuitRot', String(on)); } catch (e) { caught('stage:2120', e); /* storage unavailable */ }
    if (on === live.rotTarget) return;
    // Mid-glide (Fit, a zoom button), the turn starts from where the view is, never from where the glide was going (that snapped the view to
    // the glide's end, then turned): the glide is let go where it stands. Whether the turn lands on the whole map is judged by where the
    // glide was going, as Fit judges a second tap.
    viewXfDetach(live.viewXf);   // (a change between the views running: the turn starts from where the camera is, view-xf.js)
    const goal = live.vtGliding ? live.vtTarget : live.vt;
    if (live.vtGliding) { cancelFrame(live.vtAnim); driftEnd(); live.vtGliding = false; }
    const whole = live.morphTarget !== 1 || goal.k <= 1.001 || sameView(goal, circWhole());
    live.rotHold = null;
    if (!whole) {
      const ins = safeInsets(), b = stageBox();
      const sx = b.left + (ins.l + ins.W - ins.r) / 2, sy = b.top + (ins.t + ins.H - ins.b) / 2;
      refreshCTM();
      live.rotHold = { w: clientToWorld(sx, sy), sx, sy, sc: live.CTM.sc };
    }
    live.rotTarget = on;
    cancelFrame(live.vtAnim); driftEnd();
    const from = { ...live.vt };
    if (whole) live.vt = live.morphTarget === 1 ? circWhole() : { k: 1, x: 0, y: 0 };
    // (The framing the turn lands on, taken now, at the press: the turn's last frame sets it again without measuring the cards.)
    live.rotWhole = whole && live.morphTarget === 1 ? { ...live.vt } : null;
    // (The turned map is a framing of the circuit like Fit's: it is kept as one, so a resize, a card or the bars changing size take the same framing again for the new room,
    // as they do for the wide map (stage-tubes.js lookHome). Without it the upright map was fitted once, at the press, and never again: play-test, Mac 1280 x 800, 16 Nov 2026.)
    if (live.rotWhole) { live.fitted = true; markCirc('whole', live.rotWhole); }
    // (Rec 8: in the landed circuit the camera glides to that framing on the turn's own clock and ease (rotStep), never set outright.)
    live.rotGlide = live.rotWhole && live.morph === 1 && !reduceMotion.matches ? { from, e0: rotEase(live.rotU), x: { from, to: live.rotWhole, vb0: [vbBox.x, vbBox.y, vbBox.width, vbBox.height] } } : null;   // (x: the glide as view-xf.js works it out: the view box turns under the camera)
    if (live.rotGlide) live.vt = from;
    if (live.morphTarget !== 1 || reduceMotion.matches) { live.rotU = on; setViewBox(live.easeInOut(live.morph)); if (live.rotHold) { holdView(live.rotHold); live.rotHold = null; } }
  }
  // A frame of the turn (the stage's frame, after rotU stepped): a held view keeps its spot under the same screen point; a whole one glides
  // from where the press found it to the turned framing, in step with the turn's eased share, and lands on it exactly.
  const RB_NOW = [0, 0, 0, 0], RB_END = [0, 0, 0, 0];   // (the view box now and as the turn lands: written in place)
  function rotStep() {
    if (live.rotHold) { holdView(live.rotHold); if (live.rotU === live.rotTarget) live.rotHold = null; return; }
    const w = live.rotWhole, g = live.rotGlide;
    if (!w || live.morphTarget !== 1) return;
    if (live.rotU !== live.rotTarget) {
      if (!g) return;
      // (A hand that moves the view mid-turn takes it over: the glide, and the framing it was going to, are dropped.)
      if (g.last && live.vt !== g.last) { live.rotGlide = null; live.rotWhole = null; return; }
      const d = rotEase(live.rotTarget) - g.e0;
      // (The view box turns from the wide Circuit's to the tall one as the turn goes: the camera is worked out on the screen against the box as it stands, view-xf.js.)
      const sb = stageBox();
      live.vt = g.last = viewXfCameraInto(g.x, d ? clamp((rotEase(live.rotU) - g.e0) / d, 0, 1) : 1, viewBoxAt(1, rotEase(live.rotU), VB_ANAT, VB_CIRC, VB_CIRC_R, RB_NOW), viewBoxAt(1, rotEase(live.rotTarget), VB_ANAT, VB_CIRC, VB_CIRC_R, RB_END), sb.sw, sb.sh, { k: 1, x: 0, y: 0 }); applyVT();
      return;
    }
    live.vt = { ...w }; live.rotWhole = null; live.rotGlide = null; applyVT();
  }
  // A bottom sheet (the action card on a phone) covers the lower part of the figure. reveal() pans the figure,
  // no more than needed, so the selected structure stays in the part that is left; unreveal() puts the view back
  // when the sheet closes, unless the learner has moved the figure since.
  let revealFrom = null, revealTo = null;
  const sameView = (a, b) => a && b && Math.abs(a.k - b.k) < 0.001 && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
  // What was last asked and what came of it (pps.revealLast: a play-test reads it when a vessel is not brought into the room the cards leave).
  const note = (o) => { (globalThis.pps ||= {}).revealLast = o; };
  // The vessel the open card is about, kept while it is open: every framing the camera makes by itself (a refit, a card's pan) keeps it in the room (withReveal),
  // so the two never pull against each other (a refit went to the default view and the reveal back, at every card change).
  let revealWant = null;
  // The pan that brings the wanted vessel into the room the open cards leave, judged for the view `at` (anchorFor reads where it stands now).
  function revealPlan(at) {
    const { sel, insetBottom } = revealWant;
    const a = anchorFor(sel);
    if (!a) return { why: 'no anchor', dx: 0, dy: 0 };
    const s = live.vbScale();
    const ox = (at.x - live.vt.x) * s, oy = (at.y - live.vt.y) * s;
    const ins = safeInsets(false, null, true);   // (every open card, the vessel's own too: the room is the gap they leave, narrow as it may be)
    const W = wrap.clientWidth, H = wrap.clientHeight, top = Math.max(44, ins.t + 12), bottom = H - Math.max(insetBottom, ins.b) - 18, side = 18;
    const left = Math.max(side, ins.l ? ins.l + 12 : 0), right = W - Math.max(side, ins.r ? ins.r + 12 : 0);
    if (bottom - top < 80) return { why: 'no room', dx: 0, dy: 0, top, bottom, H, insetBottom, insB: ins.b };
    let x0 = a.x + ox, x1 = x0, y0 = a.y + oy, y1 = y0;
    if (a.r != null) for (const [px, py] of a.path) { x0 = Math.min(x0, px + ox - a.r); x1 = Math.max(x1, px + ox + a.r); y0 = Math.min(y0, py + oy - a.r); y1 = Math.max(y1, py + oy + a.r); }
    const { dx, dy } = revealDelta({ x0, y0, x1, y1 }, { x: a.x + ox, y: a.y + oy }, { top, bottom, left, right });
    return { why: dx || dy ? 'pan' : 'inside', dx, dy, top, bottom, left, right, H, W, insetBottom, insB: ins.b, y0, y1, x0, x1 };
  }
  function reveal(sel, insetBottom) {
    if (!sel || live.lobuleOn || live.lz?.isOpen()) return;
    snapFresh();   // (the room as the cards leave it now, not as it was before the last one moved)
    revealWant = { sel, insetBottom };
    // The vessel is judged where the view is GOING, not where it is: a glide of the camera's own (a refit, the home look, a card's pan) may be
    // running as the card opens, and a pan worked out from the view that glide is leaving was thrown away by it (F9, iPhone).
    const goal = live.vtGliding && live.vtTarget ? live.vtTarget : live.vt;
    const at = Math.abs(goal.k - live.vt.k) < 0.001 ? goal : live.vt;   // (a glide that also zooms is judged from where the view stands)
    const p = revealPlan(at), s = live.vbScale();
    note({ ...p, gliding: !!live.vtGliding });
    if (!p.dx && !p.dy) return;
    if (revealTo && !sameView(at, revealTo)) revealFrom = null;   // the learner moved the figure: keep it where it is
    if (!revealFrom) revealFrom = { ...at };
    revealTo = { k: at.k, x: at.x + p.dx / s, y: at.y + p.dy / s };
    animateVT(revealTo, CAM_MS_MAX, { scale: true });
  }
  // A framing the camera chose (a refit's, a card's pan) with the wanted vessel brought into the room, so it lands where the vessel is shown.
  function withReveal(to) {
    if (!revealWant || live.lobuleOn || live.lz?.isOpen() || Math.abs(to.k - live.vt.k) > 0.001) return to;
    const p = revealPlan(to), s = live.vbScale();
    if (!p.dx && !p.dy) return to;
    revealTo = { k: to.k, x: to.x + p.dx / s, y: to.y + p.dy / s };
    return revealTo;
  }
  function unreveal() {
    if (revealFrom && sameView(live.vt, revealTo)) animateVT(revealFrom, CAM_MS_MAX, { scale: true });
    revealFrom = revealTo = null; revealWant = null;
  }
  return { cardSpace, cardSpaceRead, cardsMoved, circAt, circVB, circWhole, closeView, defaultVT, fit, fitAgain, flag, holdView, markCirc, refit, reveal, rotStep, safeInsets, sameView, setCircuitRotated, snapFresh, unreveal, unseenCard };
}
