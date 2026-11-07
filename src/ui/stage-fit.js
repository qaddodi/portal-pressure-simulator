// The framing: card and pill insets, the clear-of-pill view, the fit and default view for each view, refit, close view, the circuit rotation and reveal.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { VB_ANAT, VB_CIRC } from './anatomy.js';
import { lerpVT } from './cam-arc.js';
import { caught } from './caught.js';
import { clipBox, mapBox } from './fit-box.js';
import { cancelFrame } from './frame.js';
import { COUNTED, gpuProbe } from './gpu-probe.js';
import { reduceMotionMQ as reduceMotion } from './motion.js';
import { elBoxInto } from './shape-gl.js';
import { store } from './store.js';
import { clamp, restBox, settledBox, translateRest } from './util.js';

import { stageScope } from './stage-scope.js';
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
  const flag = { imaging: false, dataLayer: false, hasSel: false };   // (what update last found: read by the paints after it)
  let cardsSnap = [], pillsSnap = { zoom: null, nav: null }, snapDirty = true, snapAsk = 0, snapSettle = 0;
  function cardsRead() {
    const out = [];
    for (const el of document.querySelectorAll('[data-safe]')) {
      // (A card playing its way out no longer counts: the camera frames for what stays.)
      if (el.hidden || el.closest('[hidden]') || el.classList.contains('card-leaving') || el.classList.contains('vd-out')) continue;
      if (unseenCard(el)) continue;
      const q = slideRest(el, el.getBoundingClientRect());
      if (!q.width || !q.height) continue;
      // (data-safe-rest: a card whose own transform only eases it in or out counts where it rests, so the camera frames once.)
      out.push({ el, q, rest: 'safeRest' in el.dataset ? translateRest(el, restBox(el, q)) : q });
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
  }
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
  const insWrap = () => stageBox();
  function cardSpace() { return { ...insKept('space', cardSpaceFrom, cardsSnap) }; }
  // (Live, for a caller already in the read phase: the catheter's room.)
  const cardSpaceRead = () => cardSpaceFrom(cardsRead());
  function cardSpaceFrom(list) {
    if (gpuProbe.on) gpuProbe.note(COUNTED.safe);
    const wr = insWrap(), W = wr.width, H = wr.height, sp = { t: 0, b: 0 };
    for (const { el, q } of list) {
      const y0 = ((el.classList.contains('mini') || el.dataset.folding) && +el.dataset.fullH ? q.bottom - +el.dataset.fullH : q.top) - wr.top - (+el.dataset.safePad || 0), y1 = q.bottom - wr.top;
      if (y1 <= 0 || y0 >= H) continue;
      const edge = el.dataset.safe;
      if (edge === 'top') sp.t = Math.max(sp.t, y1);
      else if (y0 > H * 0.3 && (W < 768 || q.width > W * 0.75 || (edge === 'bottom' && !el.classList.contains('side')))) sp.b = Math.max(sp.b, H - y0);
    }
    return sp;
  }
  // (exact: the cards' real edges, with no softening: a slide that must keep its vessels clear of them, even where they leave a thin band.)
  const INS_KEY = ['ins|0|', 'ins|1|'];   // (the memo's keys for no skipped pieces: kept, not built)
  function insSkipKey(exact, skip) { let k = INS_KEY[exact ? 1 : 0]; for (let i = 0; i < skip.length; i++) k += (i ? ',' : '') + (skip[i]?.id || '?'); return k; }
  function safeInsets(exact = false, skip = null) {
    return { ...insKept(skip ? insSkipKey(exact, skip) : INS_KEY[exact ? 1 : 0], safeInsetsFrom, cardsSnap, exact, skip) };
  }
  function safeInsetsFrom(list, exact = false, skip = null) {
    if (gpuProbe.on) gpuProbe.note(COUNTED.safe);
    const wr = insWrap(), W = wr.width, H = wr.height;
    const ins = { t: 0, b: 0, l: 0, r: 0, W, H }, cards = [];
    if (!W || !H) return ins;
    // A phone held sideways docks its cards at the side like a tablet (dock.js), so they count as side cards.
    const wide = W >= 768 || (W > H && H <= 500 && W >= 640);
    for (const { el, rest: q } of list) {
      if (skip && skip.includes(el)) continue;
      // The vitals dock folded to one line on a phone (main.js) still counts at its full height, so the
      // framing does not jump each time it folds and opens.
      // (data-safe-pad: room kept clear above a piece too, as the 8 px between the figure's readings and the view switch's pill.)
      const y0 = ((el.classList.contains('mini') || el.dataset.folding) && +el.dataset.fullH ? q.bottom - +el.dataset.fullH : q.top) - wr.top - (+el.dataset.safePad || 0);
      const x0 = q.left - wr.left, x1 = q.right - wr.left, y1 = q.bottom - wr.top;
      if (x1 <= 0 || y1 <= 0 || x0 >= W || y0 >= H) continue;
      let edge = el.dataset.safe;
      // A card is a side card when it is docked there (the Tests card's class `side`) and a sheet when it spans the screen (a phone's,
      // sideways too, and an upright iPad's), whatever the window's size says: dock.js and the phone block of app.css decide that.
      const side = el.classList.contains('side'), sheet = !side && !store.get().presenting && q.width > W * 0.65;
      if (edge === 'right' && !side && (!wide || sheet)) edge = 'bottom';   // a phone's cards are sheets over the bottom
      else if (edge === 'bottom' && el.classList.contains('side')) edge = 'right';   // the instruments docked at the side
      if (edge === 'top') ins.t = Math.max(ins.t, y1);
      else if (edge === 'bottom') ins.b = Math.max(ins.b, H - y0);
      else if (edge === 'right' && (wide || side)) { ins.r = Math.max(ins.r, W - x0); cards.push([y0, y1]); }
      else if (wide && edge === 'left') ins.l = Math.max(ins.l, x1);
    }
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
    if (W - ins.l - ins.r < (store.get().presenting ? 200 : W < 768 ? 260 : Math.min(W * 0.5, 360))) ins.l = ins.r = 0;
    if (!exact && H - ins.t - ins.b < H * 0.35) { const k = (H * 0.65) / (ins.t + ins.b); ins.t *= k; ins.b *= k; }
    return ins;
  }
  // A framing computed for the whole stage, moved and scaled into the free space.
  function insetVT(v, vbArr) {
    const ins = safeInsets(), { W, H } = ins;
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
  function clearPill(v, vbArr) {
    const zp = pillsSnap.zoom, pill = zp?.el;
    if (!pill) return v;
    const p = zp.box, wr = stageBox();   // (both kept: snapRead and the stage box)
    if (!p.width || !p.height || !wr.width || !wr.height || pill.classList.contains('no-room') || !zp.shown) return v;
    const [vx, vy, vw, vh] = vbArr, s0 = Math.min(wr.width / vw, wr.height / vh);
    const ox = (wr.width - vw * s0) / 2 - vx * s0, oy = (wr.height - vh * s0) / 2 - vy * s0;
    let [x0, y0, x1, y1] = ART_CIRC;
    // (Turned upright, the map's box turns a quarter turn counter-clockwise about the circuit's centre.)
    if (live.rotTarget) {
      const n0 = CIRC_C[0] + (y0 - CIRC_C[1]), n1 = CIRC_C[1] - (x1 - CIRC_C[0]), n2 = CIRC_C[0] + (y1 - CIRC_C[1]), n3 = CIRC_C[1] - (x0 - CIRC_C[0]);
      x0 = n0; y0 = n1; x1 = n2; y1 = n3;
    }
    const ax0 = ox + s0 * (v.x + v.k * x0), ax1 = ox + s0 * (v.x + v.k * x1), ay0 = oy + s0 * (v.y + v.k * y0), ay1 = oy + s0 * (v.y + v.k * y1);
    const g = 8, pl = p.left - wr.left - g, pt = p.top - wr.top - g, pr = p.right - wr.left + g, pb = p.bottom - wr.top + g;
    if (ax1 <= pl || ax0 >= pr || ay1 <= pt || ay0 >= pb) return v;
    const up = ay1 - pt + 1, room = ay0 - safeInsets().t - g;   // (+1: the art's box rounds on screen; a whole pixel to spare)
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
    const ins = safeInsets(), top = oy + s0 * (v.y + v.k * vy), end = Math.min(oy + s0 * (v.y + v.k * (vy + vh)), oy + s0 * (v.y + v.k * bot) + 30);
    let floor = H - ins.b;
    for (let pi = 0; pi < 2; pi++) {
      const pl = pi ? pillsSnap.zoom : pillsSnap.nav, r = pl?.box;
      if (r?.width && pl.shown) floor = Math.min(floor, r.top - wr.top - 8);
    }
    const hi = floor - end, dy = Math.min(hi, Math.max(ins.t + 4 - top, (ins.t + floor) / 2 - (top + end) / 2));   // (never past the pill, nor its top under a card)
    return hi > 0 && dy > 0 ? { k: v.k, x: v.x, y: v.y + dy / s0 } : v;
  }
  // The whole map, in the space the cards leave and clear of the zoom pill.
  const circWhole = () => clearPill(insetVT({ k: 1, x: 0, y: 0 }, circVB()), circVB());
  // The boxes the home framing fits: whole groups as drawn, and each gut organ (in its own transform) with every clipped
  // part cut to its clip path's box.
  // (The boxes are folded into acc [x0, y0, x1, y1] as they are worked out, none kept: the one caller wants only their union. A group's parts
  // wait in one flat list of numbers (x, y, width, height each) for the group's matrix, which is read after them as it always was.)
  const fitParts = [], fitWhole = [], fitBoxA = { x: 0, y: 0, width: 0, height: 0 }, fitBoxK = { x: 0, y: 0, width: 0, height: 0 }, fitBoxP = { x: 0, y: 0, width: 0, height: 0 };
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
      const m = g.transform?.baseVal?.consolidate()?.matrix, P = fitBoxP;
      for (let i = 0; i < parts.length; i += 4) {
        P.x = parts[i]; P.y = parts[i + 1]; P.width = parts[i + 2]; P.height = parts[i + 3];
        fitFold(acc, m ? mapBox(P, m) : P);
      }
    }
  }
  const fitAcc = [0, 0, 0, 0];
  function defaultVT(circuit) {
    if (!circuit) {
      // Fit frames everything the plate draws: the heart and the veins above it, the organs, the
      // flanks, and with ascites the fluid pooled in the pelvic floor below the default frame. The
      // box is measured, so it follows an enlarged spleen or a growing ascites.
      // (The layout size: the svg's drawn rectangle is scaled while the lobule zoom plays, and a fit read from it lands somewhere else.)
      const sb = stageBox(), rw = sb.sw, rh = sb.sh;   // (the svg's box as kept, measured without the dive's zoom)
      if (!rw || !rh) return { k: 1, x: 0, y: 0 };
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
      // The svg shows its viewBox scaled to fit (meet), and the spare room on the other axis is
      // visible too: fit the box into that whole visible area, less what the floating pieces cover.
      const ins = safeInsets();
      const s0 = Math.min(rw / VB_ANAT[2], rh / VB_ANAT[3]);
      const fw = Math.max(40, rw - ins.l - ins.r), fh = Math.max(40, rh - ins.t - ins.b);
      const k = Math.min(1.15, fw / s0 / (x1 - x0), fh / s0 / (y1 - y0));
      const cx = VB_ANAT[0] + VB_ANAT[2] / 2 + (ins.l - ins.r) / 2 / s0, cy = VB_ANAT[1] + VB_ANAT[3] / 2 + (ins.t - ins.b) / 2 / s0;
      live.fitKept = k;   // (kept for an arc's widest pull back, arcRoom)
      return { k, x: cx - k * ((x0 + x1) / 2), y: cy - k * ((y0 + y1) / 2) };
    }
    // Turned upright, the map is tall and fills the height of the stage as it is.
    if (live.rotTarget) return circWhole();
    const ins = safeInsets();
    const W = ins.W - ins.l - ins.r, H = ins.H - ins.t - ins.b;
    const s0 = Math.min(W / VB_CIRC[2], H / VB_CIRC[3]);
    // (With a card at the side the whole map is shown: the close-up is for a narrow screen with nothing over it.)
    if (ins.l || ins.r || VB_CIRC[3] * s0 > 0.62 * H) return centreDrawn(clearPill(insetVT({ k: 1, x: 0, y: 0 }, VB_CIRC), VB_CIRC));
    const k = clamp((0.94 * H) / (VB_CIRC[3] * s0), 1, 3);
    const cx = VB_CIRC[0] + VB_CIRC[2] / 2, cy = VB_CIRC[1] + VB_CIRC[3] / 2;
    const fx = 640, fy = cy;
    return insetVT({ k, x: cx - k * fx, y: cy - k * fy }, VB_CIRC);
  }
  // Which framing the circuit was last given ('whole' map or 'focus' close-up: setView, Fit, a refit). The circuit has no home
  // look of its own, so a turn of the device or a new window size takes the same kind of framing again, for the new shape (lookHome).
  // circAt: that framing as given, so a turn or a resize takes it again only while the view is still exactly there (a card's pan to
  // reveal a vessel, a pinch or a tool's camera moved it: it stays where it was put).
  const circAt = { k: 1, x: 0, y: 0 };   // (a copy of the framing, written in place: only read while circFit is set)
  const markCirc = (kind, v) => { live.circFit = kind; circAt.k = v.k; circAt.x = v.x; circAt.y = v.y; };
  const spaceSig = () => {
    // (The vitals dock changes shape beside a side-docked Tests card, so it is not counted either.)
    const i = safeInsets(false, [document.getElementById('dock'), document.getElementById('vdock')]);
    return `${Math.round(i.W)},${Math.round(i.H)},${Math.round(i.t)},${Math.round(i.b)},${Math.round(i.l)},${Math.round(i.r)}`;
  };
  // (Once the space has changed for another reason the view is no longer kept: the framing follows from then on.)
  const keptNow = () => {
    if (live.keptSpace === null) return false;
    if (!store.get().presenting && live.keptSpace === spaceSig()) return true;
    live.keptSpace = null;
    return false;
  };
  const fit = () => {
    // In the lobule view, Fit shows the whole lobule again (it never leaves the view). Inside the sinusoid it steps back out to the lobule.
    if (live.lobuleOn) { if (store.get().sinusoid) { store.set({ sinusoid: false }); return; } live.lz.fitView(); return; }
    live.handsOff(); live.handed = false;
    const circuit = live.morphTarget === 1, focus = defaultVT(circuit), whole = circuit ? circWhole() : { k: 1, x: 0, y: 0 };
    const near = (a, b) => Math.abs(a.k - b.k) < 0.02 && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
    // Judged from where a glide in progress is going, so a second tap toggles as expected.
    const at = live.vtGliding ? live.vtTarget : live.vt;
    const to = circuit && !near(focus, whole) ? (near(at, whole) ? focus : whole) : focus;
    if (!circuit) live.homeAt = to;
    else markCirc(to === whole ? 'whole' : 'focus', to);
    live.fitted = true;
    // It glides there, as the zoom buttons do (reduced motion: a short glide).
    animateVT(to, 420);
  };
  // (Measured first in the next frame, while the layout is still the last frame's (readFrame), and glided after: a refit asked for in a
  // frame (main.js, a card's fold) no longer lays the page out among that frame's writes.)
  let refitAsk = 0;
  function refit() { refitAsk ||= readFrame(refitRead); }
  function refitRead() {
    snapFresh();   // (the cards' boxes as they stand now, if anything placed changed since the last snapshot)
    refitAsk = 0;
    if (live.lobuleOn || keptNow()) return;
    const to = live.circAgain && live.morphTarget === 1 && live.circFit === 'whole' ? circWhole() : defaultVT(live.morphTarget === 1);
    if (live.morphTarget !== 1) live.homeAt = to; else markCirc(live.circAgain ? live.circFit : 'focus', to);
    live.fitted = true;
    // (Mid-measurement the catheter's camera keeps the view: its trip back ends on the new fit instead of the old one.)
    if (live.cath.saved) { live.cath.saved = to; return; }
    if (!sameView(to, live.vtGliding ? live.vtTarget : live.vt)) animateVT(to, 420, { steady: true });
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
    on = on ? 1 : 0;
    try { localStorage.setItem('pps.circuitRot', String(on)); } catch (e) { caught('stage:2120', e); /* storage unavailable */ }
    if (on === live.rotTarget) return;
    // Mid-glide (Fit, a zoom button), the turn starts from where the glide was going.
    if (live.vtGliding) { cancelFrame(live.vtAnim); driftEnd(); live.vtGliding = false; live.vt = { ...live.vtTarget }; applyVT(); live.CTM = null; }
    const whole = live.morphTarget !== 1 || live.vt.k <= 1.001 || sameView(live.vt, circWhole());
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
    // (Rec 8: in the landed circuit the camera glides to that framing on the turn's own clock and ease (rotStep), never set outright.)
    live.rotGlide = live.rotWhole && live.morph === 1 && !reduceMotion.matches ? { from, e0: rotEase(live.rotU) } : null;
    if (live.rotGlide) live.vt = from;
    if (live.morphTarget !== 1 || reduceMotion.matches) { live.rotU = on; setViewBox(live.easeInOut(live.morph)); if (live.rotHold) { holdView(live.rotHold); live.rotHold = null; } }
  }
  // A frame of the turn (the stage's frame, after rotU stepped): a held view keeps its spot under the same screen point; a whole one glides
  // from where the press found it to the turned framing, in step with the turn's eased share, and lands on it exactly.
  function rotStep() {
    if (live.rotHold) { holdView(live.rotHold); if (live.rotU === live.rotTarget) live.rotHold = null; return; }
    const w = live.rotWhole, g = live.rotGlide;
    if (!w || live.morphTarget !== 1) return;
    if (live.rotU !== live.rotTarget) {
      if (!g) return;
      // (A hand that moves the view mid-turn takes it over: the glide, and the framing it was going to, are dropped.)
      if (g.last && live.vt !== g.last) { live.rotGlide = null; live.rotWhole = null; return; }
      const d = rotEase(live.rotTarget) - g.e0;
      live.vt = g.last = lerpVT(g.from, w, d ? clamp((rotEase(live.rotU) - g.e0) / d, 0, 1) : 1); applyVT();
      return;
    }
    live.vt = { ...w }; live.rotWhole = null; live.rotGlide = null; applyVT();
  }
  // A bottom sheet (the action card on a phone) covers the lower part of the figure. reveal() pans the figure,
  // no more than needed, so the selected structure stays in the part that is left; unreveal() puts the view back
  // when the sheet closes, unless the learner has moved the figure since.
  let revealFrom = null, revealTo = null;
  const sameView = (a, b) => a && b && Math.abs(a.k - b.k) < 0.001 && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1;
  function reveal(sel, insetBottom) {
    if (!sel || live.lobuleOn || live.lz?.isOpen()) return;
    const a = anchorFor(sel);
    if (!a) return;
    const ins = safeInsets();
    const W = wrap.clientWidth, H = wrap.clientHeight, top = Math.max(44, ins.t + 12), bottom = H - Math.max(insetBottom, ins.b) - 18, side = 18;
    if (bottom - top < 80) return;
    // A vessel is kept wholly in view when it fits; one too long for that keeps at least its middle in view.
    let x0 = a.x, x1 = a.x, y0 = a.y, y1 = a.y;
    if (a.r != null) for (const [px, py] of a.path) { x0 = Math.min(x0, px - a.r); x1 = Math.max(x1, px + a.r); y0 = Math.min(y0, py - a.r); y1 = Math.max(y1, py + a.r); }
    if (x1 - x0 > W - 2 * side) { x0 = x1 = a.x; }
    if (y1 - y0 > bottom - top) { y0 = y1 = a.y; }
    const inside = y0 >= top && y1 <= bottom && x0 >= side && x1 <= W - side;
    if (inside) return;
    const s = live.vbScale();
    const dx = x0 < side ? side - x0 : x1 > W - side ? W - side - x1 : 0;
    const dy = y0 < top ? top - y0 : y1 > bottom ? bottom - y1 : 0;
    if (revealTo && !sameView(live.vt, revealTo)) revealFrom = null;   // the learner moved the figure: keep it where it is
    if (!revealFrom) revealFrom = { ...live.vt };
    revealTo = { k: live.vt.k, x: live.vt.x + dx / s, y: live.vt.y + dy / s };
    animateVT(revealTo, 320);
  }
  function unreveal() {
    if (revealFrom && sameView(live.vt, revealTo)) animateVT(revealFrom, 320);
    revealFrom = revealTo = null;
  }
  return { cardSpace, cardSpaceRead, circAt, circVB, circWhole, closeView, defaultVT, fit, flag, holdView, keptNow, markCirc, refit, reveal, rotStep, safeInsets, sameView, setCircuitRotated, snapFresh, spaceSig, unreveal, unseenCard };
}
