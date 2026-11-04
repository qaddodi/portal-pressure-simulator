// The Doppler probe on the figure: its stand-off, line of sight, sample bars, cards, monitor and paint.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { STENT_SITES } from '../engine/topology.js';
import { ORGANS } from './anatomy.js';
import { NONE_MS, PROBE, PROBE_MODEL, SLACK, awayFromProbe, beamBoxes, createProbeMind, fitPoseInto, gateBoxes, probeFade, probeGeomInto, probeSwing, probeTurn, wedgeBoxes } from './dop-probe.js';
import { readBox, readElAt } from './layout-snap.js';
import { reduceMotionMQ as reduceMotion } from './motion.js';
import { store } from './store.js';

import { stageScope } from './stage-scope.js';
export function createDoppler(st, live) {
  const { E, EV, arcMid, cath, clampW, dop, dpr, geo, nextFrame, olKey, olRings, organEls, pointAt, readFrame, scanCardsRead, sites, stageBox, unseenCard, viewMoving, watch, worldToLocalInto } = st;
  // The cards and bars it keeps off: the slide's cards, and the docked instruments and bars. Read at most four times a second, and
  // only while one may have moved (layoutWatch), as the labels' blockers are: each read forces a layout among the model's frames.
  const dprStale = () => { live.dprCardsAt = -1e9; };
  addEventListener('pps:occ', dprStale);
  addEventListener('resize', dprStale);
  // While the readings' card slides (a pull, a tap, the ease after either; presenter.js tells with pps:slide), the probe is placed against
  // the cards on every frame: it stays where it is while it has room, swings out of a card's way, and fades only where no place is clear
  // (Mohammad, 22 Oct: "it should only hide once there is no space available; not hide and show during the tuck untuck").
  let dprTrackRaf = 0, dprTrackQuiet = 0;
  const slidingCards = document.getElementsByClassName('pz-sliding');
  // (The cards are read first in each frame, before any write, and the probe placed against them after: dprCards.)
  // (1 Nov 2026, "Move everything to GPU": no layout read on the frames of a slide. The cards are read once as the readings' card starts to
  // move (pps:slide), with the room the sliding card may still take on its way out (its own --pz-u and --pz-d, written by the presenter),
  // so the probe moves out of its way as it starts rather than following it frame by frame; and read once more when it rests. The reads are
  // made first in a frame (readFrame), at those two moments only; the probe is placed against them on every frame in between.)
  function dprTrack() {
    dprTrackRaf = 0;
    dprTrackQuiet = slidingCards.length ? 0 : dprTrackQuiet + 1;   // (C5: a kept live list, no selector match per frame; only the readings' card slides)
    const was = dpr.track;
    dpr.track = dprTrackQuiet <= 6;
    if (was && !dpr.track) dprStale();   // (it rests: the cards' last place is read once)
    if (dop.id) { dprobePaint(); live.labelGL?.redraw(); }
    if (dpr.track) dprTrackRaf = nextFrame(dprTrack);
  }
  addEventListener('pps:slide', () => { dprTrackQuiet = 0; dprStale(); if (!dprTrackRaf && dpr.ready) dprTrackRaf = nextFrame(dprTrack); });
  let dprCardsAsk = 0;
  // The cards as last read; due (a card may have moved, at most four times a second while the page's layout settles, never while the view
  // moves), they are read first in the next frame and the probe is placed again then.
  function dprCards() {
    const now = performance.now();
    if (live.dprCardsAt > 0 && !(now - live.dprCardsAt > 250 && watch.due() && !viewMoving())) return live.dprCardsList;
    dprCardsAsk ||= readFrame(dprCardsRead);
    return live.dprCardsList;
  }
  function dprCardsRead() {
    dprCardsAsk = 0;
    live.dprCardsAt = performance.now();
    const wr = stageBox();
    live.dprCardsList = [...scanCardsRead(), ...[...document.querySelectorAll('[data-safe], .stage-blocker:not([hidden])')].map((el) => {
      // (A card hidden by visibility is not there, as the framing reads it (unseenCard): the closed Details sheet stays in place on
      // a phone, invisible, as tall as it was last opened, and kept the probe off the whole figure in Tests › Doppler, 20 Oct.)
      if (el.hidden || el.closest('[hidden]') || el.classList.contains('card-leaving') || el.classList.contains('vd-out') || unseenCard(el)) return null;
      const q = readBox(el);
      if (!q.width || !q.height) return null;
      const box = { x0: q.left - wr.left - 6, y0: q.top - wr.top - 6, x1: q.right - wr.left + 6, y1: q.bottom - wr.top + 6 };
      // (The readings' card sliding: it counts as far as it may still reach on its way out, the rest of its travel above its top.)
      if (el.classList.contains('pz-sliding')) { const u = parseFloat(el.style.getPropertyValue('--pz-u')) || 0, d = parseFloat(el.style.getPropertyValue('--pz-d')) || 0; box.y0 -= Math.max(0, (1 - u) * d); }
      return box;
    }).filter(Boolean)];
    nextFrame(dprobePaint);
  }
  // The labels and callouts showing (stage px), which the probe and its line of sight keep off where a side allows. The list is kept and written
  // over by each call (the search reads it at once and keeps none of it).
  const DPR_AVOID = [];
  function dprAvoid() {
    let n = 0;
    for (let i = 0; i < live.lbRects.length; i++) DPR_AVOID[n++] = live.lbRects[i];
    for (const el of sites.made.values()) if (el._box && !el.classList.contains('cath-pre')) DPR_AVOID[n++] = el._box;
    if (cath.made && !cath.labels.hidden) for (const el of cath.made.values()) if (el._box) DPR_AVOID[n++] = el._box;
    // (A narrowing's "60 %" too: the probe stands on the side whose line of sight and flow axis keep off it: Mohammad, 20 Oct.)
    const cl = clampW.children;
    for (let i = 0; i < cl.length; i++) if (cl[i]._box && cl[i].classList.contains('clamp-label')) DPR_AVOID[n++] = cl[i]._box;
    DPR_AVOID.length = n;
    return DPR_AVOID;
  }
  // The organs' outlines (world units, every 4 or so along them), kept until an organ's shape or transform changes (olKey).
  const dprOrgPts = new Map(), DPR_ORGS = [];
  function dprOrgans() {
    DPR_ORGS.length = 0;
    if (live.organMorphA < 0.5) return DPR_ORGS;   // (faded out with the morph to the circuit)
    const now = performance.now();
    for (const o of ORGANS) {
      if (o.deco || o.circle || !organEls[o.id]?.getAttribute('d')) continue;
      let c = dprOrgPts.get(o.id);
      // (While a shape eases (the liver to cirrhosis) its key changes every frame: the key is looked at, and the outline read again
      // (getPointAtLength along it, the costliest step of a Doppler slide's frame), at most every 300 ms, a few px stale through an ease,
      // for a count that only weighs how busy a place is.)
      if (!c || now - c.at > 300) {
        const k = olKey(o.id);
        if (!c || c.k !== k) { c = { k, at: now, pts: olRings(o.id).flatMap((ring) => ring.filter((_, i) => i % 2 === 0)) }; dprOrgPts.set(o.id, c); }   // alloc-rare: an organ's outline is taken again only when its shape key has changed, at most every 300 ms
        else c.at = now;
      }
      DPR_ORGS.push(c.pts);
    }
    return DPR_ORGS;
  }
  // Points along the vessels drawn (stage px, with their radius), near the gate: the probe stands where the figure is quieter. The
  // organs' outlines count too, at half a vessel's weight (Mohammad, 20 Oct: "less busy, where not a lot of drawings"). The points are
  // records made once (grown as a busier figure needs) and written over by each call, as is the list that holds them.
  const BUSY_POOL = [], BUSY_OUT = [], PW = [0, 0];
  let busyN = 0;
  function busyPush(x, y, q, w) {
    let e = BUSY_POOL[busyN];
    if (!e) { e = [0, 0, 0, 1]; BUSY_POOL[busyN] = e; }   // alloc-rare: the pool grows only to the most points a figure has had
    e[0] = x; e[1] = y; e[2] = q; e[3] = w;
    BUSY_OUT[busyN++] = e;
  }
  function dprBusy(g, id) {
    busyN = 0;
    const sc = live.CTM?.sc || 1, R = PROBE.GAP + PROBE.LEN + 140, orgs = dprOrgans();   // (out to the farthest place, dop-probe.js FAR)
    for (let oi = 0; oi < orgs.length; oi++) {
      const pts = orgs[oi];
      let has = false, lx = 0, ly = 0;
      for (let i = 0; i < pts.length; i++) {
        worldToLocalInto(PW, pts[i][0], pts[i][1]);
        if (Math.abs(PW[0] - g[0]) >= R || Math.abs(PW[1] - g[1]) >= R || (has && Math.hypot(PW[0] - lx, PW[1] - ly) < 6)) continue;
        busyPush(PW[0], PW[1], 1, 0.5); has = true; lx = PW[0]; ly = PW[1];
      }
    }
    for (let xi = 0; xi < EV.length; xi++) {
      const x = EV[xi];
      if (!x.vis || x.ghost || x.e.id === id) continue;
      const pts = geo[x.e.id]?.cur, q = live.cathRadOf(x.e.id, 0.5) * sc;
      if (!(pts?.length > 1)) continue;
      worldToLocalInto(PW, pts[0][0], pts[0][1]);
      let ax = PW[0], ay = PW[1];
      for (let i = 1; i < pts.length; i++) {
        worldToLocalInto(PW, pts[i][0], pts[i][1]);
        const bx = PW[0], by = PW[1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 6));
        for (let j = 0; j < n; j++) {
          const px = ax + ((bx - ax) * j) / n, py = ay + ((by - ay) * j) / n;
          if (Math.abs(px - g[0]) < R + q && Math.abs(py - g[1]) < R + q) busyPush(px, py, q, 1);
        }
        ax = bx; ay = by;
      }
    }
    BUSY_OUT.length = busyN;
    return BUSY_OUT;
  }
  // (In a deck it waits for the slide's zoom to settle: it fades out as a camera move starts and back in once it lands (camSettle
  // lays the labels out, which paints it): Mohammad, 20 Oct.)
  function dprHold() {
    stageScope.clear(dpr.hold); dpr.hold = stageScope.timer(dprLet, 1500);   // (no framing came: it shows anyway)
  }
  function dprLet() {
    if (!dpr.hold) return;
    stageScope.clear(dpr.hold); dpr.hold = 0; dprobePaint();
  }
  // No Doppler screen in sight, no probe (Mohammad, 20 Oct: "no doppler screen = no probe"): a monitor whose card is hidden,
  // folded, leaving, off screen or covered (the case card over it) leaves the probe hidden. Checked a few times a second while a
  // vessel is chosen, since those changes come from the cards, not the figure.
  // (Only while a card or bar may have moved, shown, hidden or covered another (layoutWatch, as dprCards): otherwise the last
  // look's answer still holds and no layout is read. Review item 28.)
  let dprMonLast = false, dprMonAsk = 0;
  const dprQuiet = () => dpr.monAt > 0 && !watch.due();
  function dprMonitorOn() {
    const now = performance.now();
    if (now - dpr.monAt < 200) return dpr.mon;   // (asked on every model frame: the answer of the last 200 ms, the pace it is watched at anyway)
    if (!dprQuiet()) dprMonAsk ||= readFrame(dprMonRead);   // (looked at first in the next frame, never between the frame's writes)
    return dprMonLast;
  }
  function dprMonRead() {
    dprMonAsk = 0;
    dpr.monAt = performance.now();
    dprMonLast = dprMonitorLook();
    if (dprMonLast !== dpr.mon || (dprMonLast && !dpr.on && !dpr.swap)) { dpr.mon = dprMonLast; nextFrame(dprobePaint); }
  }
  function dprMonitorLook() {
    const W = innerWidth, H = innerHeight;
    for (const cv of document.querySelectorAll('canvas[aria-label^="Spectral Doppler"]')) {
      if (cv.closest('[hidden], .card-leaving, .vd-out')) continue;
      // (A card folding its instrument away takes the monitor with it; a stacked card tucking or bringing out its readings does not:
      // the monitor stays where it is, and the probe with it, Mohammad, 22 Oct.)
      if (cv.closest('[data-folding]:not(.pz-sheet)')) continue;
      // (Asked of the monitor, not the canvas: a chart drawn on the GPU leaves its own 2D canvas at opacity 0 under the GPU's picture
      // (trace-gl.js end()), so the canvas itself never reads as visible and the probe never showed, 2 Nov.)
      const monEl = cv.parentElement || cv;
      if (monEl.checkVisibility && !monEl.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      const q = readBox(cv);
      if (q.width < 20 || q.height < 20 || q.right <= 0 || q.bottom <= 0 || q.left >= W || q.top >= H) continue;
      const x = Math.min(W - 1, Math.max(0, (q.left + q.right) / 2)), y = Math.min(H - 1, Math.max(0, (q.top + q.bottom) / 2));
      const hit = readElAt(x, y), mon = cv.parentElement;
      if (hit && (hit === cv || mon?.contains(hit) || hit.contains(cv))) return true;
    }
    return false;
  }
  // (Since 1 Nov 2026 the look runs only while the layout watch is due: started by the change that made it due (onTouch), every 200 ms
  // while it stays due, and stopped once it has settled, so a still page has no timer for it at all.)
  let dprMonT = 0;
  const dprMonTick = () => {
    dprMonT = 0;
    if (dpr.ready && dop.id) {
      let on = dprMonLast;
      if (!dprQuiet()) { dpr.monAt = 0; on = dprMonitorOn(); }
      if (on !== dpr.mon || (on && !dpr.on && !dpr.swap)) { dpr.mon = on; dprobePaint(); }
    }
    if (!dprQuiet()) dprMonT = stageScope.timer(dprMonTick, 200);
  };
  const dprMonSoon = () => { if (!dprMonT) dprMonT = stageScope.timer(dprMonTick, 200); };
  watch.onTouch(dprMonSoon);
  dpr.kick = dprMonSoon;
  dprMonSoon();
  // What the probe remembers between frames: the places it has left on this layout, and how long a fresh place has held still
  // (dop-probe.js createProbeMind: the cure for the probe flashing on and off, Right heart 6 on an iPhone, 21 Oct).
  const dprMind = createProbeMind();
  // (Numbers only from here to dprShape: a layout is told from a number worked out of its parts (hMix), never a string; the pose, the
  // options of the search and the mind's question are records made once and written over, so a frame of the probe makes nothing.)
  const hMix = (h, v) => Math.imul(h ^ (v | 0), 16777619) >>> 0;
  const hStr = (v) => { let h = 2166136261; if (typeof v === 'string') for (let i = 0; i < v.length; i++) h = Math.imul(h ^ v.charCodeAt(i), 16777619); else if (typeof v === 'number') h = Math.imul(h ^ (v | 0), 16777619); return h >>> 0; };
  const DPR_G = [0, 0], DPR_T = [0, 0];
  const DPR_OPT = { g: DPR_G, t: DPR_T, r: 0, away: false, w: 0, h: 0, cards: null, keep: 0, keepReach: 0, keepRev: false, keepK: 1, sc: 1, avoid: null, busy: null, ban: null, lock: false, slack: 0 };
  const DPR_ACT = { pose: null, tgt: null, on: false, cur: null, sig: 0, now: 0, instant: false, swing: false };
  const dprSwapDone = () => { dpr.swap = 0; dpr.keyOn = false; dprobePaint(); };
  const dprNoneDone = () => { dpr.noneT = 0; dprobePaint(); };
  const dprLeaveDone = () => { dpr.leaveT = 0; dprobePaint(); };
  // (The model of plain styled nodes the labels' layer reads the probe's look from: made once as the stage is built, beneath the figure's
  // labels and the callouts, above the figure; never placed, shown or changed.)
  function dprMake() {
    const el = PROBE_TPL.cloneNode(true);
    el.className = 'dop-probe off'; el.setAttribute('aria-hidden', 'true');
    live.labelSvg.before(el); dpr.el = el;
    live.labelGL?.setProbe(el, dpr.draw);   // (drawn on the GPU with the labels from its record of numbers: label-gl.js)
  }
  // (A probe going away swings out of the view round the target, which never moves, and is gone once it is out (dprShape, dop-probe.js
  // probeTurn; Mohammad, 2 Nov 2026: "I want the Doppler probe to rotate"); coming back it swings to exactly the angle it had. Its place and size stay as
  // they were through it; only its turn changes. A probe that has none to draw back (reduced motion, never placed) simply goes.)
  function dprLeave() {
    if (!dpr.on) return;
    dpr.on = false;
    if (reduceMotion.matches || !dpr.has || !dpr.gate) dpr.oP = 1; else dpr.leaving = true;
    dprShape();   // (starts the move)
  }
  const dprHide = () => { dprLeave(); dpr.box = null; dpr.marks.length = 0; dpr.keyOn = false; dpr.gate = null; dprDots(); };
  const PROBE_TPL = (() => { const e = document.createElement('div'); e.innerHTML = PROBE_MODEL; return e; })();   // (made ahead; the stage clones it once)
  function dprobePaint() {
    if (!dpr.ready) return;
    const st = store.get(), id = dop.id, pts = id && geo[id]?.cur;
    // (On a stent called out at its three points, the probe waits for the column: it keeps off the callouts, which never move for it,
    // so it must know where they stand before it picks its side: Mohammad, 22 Oct, the mid callout hopped to the far side on a pick.
    // Where they never show, it waits four seconds and stands anyway.)
    if (!dop.all || live.colShown) live.colWaitAt = 0; else live.colWaitAt ||= performance.now();
    const waitCol = !dpr.on && !dpr.swap && dop.all && !live.colShown && performance.now() - live.colWaitAt < 4000;
    // (A camera glide hides it, as a slide's framing does, unless it began as the same slide's figure refitting to cards that changed
    // (a phone's readings tucking or coming out, carryProbe) with the probe already showing: then it stays and rides the vessel.)
    const camHides = live.camMove && !dpr.carry;
    const show = !!(pts?.length > 1 && E[id]?.vis && (live.morph < 0.01 || live.morph > 0.99) && !camHides && !dpr.hold && dprMonitorOn() && !st.lobule && !st.sinusoid && !live.lz?.isOpen() && !waitCol);
    if (!show) {
      dprMind.hide();
      dprHide();
      return;
    }
    if (dpr.swap) return;   // (drawing back to move: it comes back at its new place)
    const u = dop.seg ? STENT_SITES[dop.seg] : null;
    const [wx, wy, tx, ty] = u == null ? arcMid(pts) : pointAt(pts, u);
    worldToLocalInto(DPR_G, wx, wy); worldToLocalInto(DPR_T, wx + tx, wy + ty);
    const gx = DPR_G[0], gy = DPR_G[1];
    DPR_T[0] -= gx; DPR_T[1] -= gy;
    // (A probe still drawing back to go is let finish where it stands before one shows again: it never jumps from half way out.)
    if (!dpr.on && dpr.leaving) { dpr.leaveT ||= stageScope.timer(dprLeaveDone, PROBE.OUT_MS + 40); return; }
    const r = live.cathRadOf(id, u ?? 0.5) * (live.CTM?.sc || 1), cards = dprCards();
    // (What its place is worked out for: the vessel, the camera, the stage, the gate and the cards, a little coarsely, as one number. While it
    // holds, the places the probe has left stay left; a change forgets them.)
    if (dpr.hId !== id) { dpr.hId = id; dpr.hIdV = hStr(id); }
    if (dpr.hSeg !== dop.seg) { dpr.hSeg = dop.seg; dpr.hSegV = hStr(dop.seg); }
    const keyV = hMix(dpr.hIdV, dpr.hSegV), sameKey = dpr.keyOn && dpr.keyId === id && dpr.keySeg === dop.seg;
    let syncKey = keyV;
    if (live.CTM) { syncKey = hMix(syncKey, Math.round(live.CTM.a * 100)); syncKey = hMix(syncKey, Math.round(live.CTM.b * 100)); syncKey = hMix(syncKey, Math.round(live.CTM.e / 12)); syncKey = hMix(syncKey, Math.round(live.CTM.f / 12)); }
    syncKey = hMix(syncKey, Math.round(live.wrapRect.width / 8)); syncKey = hMix(syncKey, Math.round(live.wrapRect.height / 8)); syncKey = hMix(syncKey, Math.round(gx / 12)); syncKey = hMix(syncKey, Math.round(gy / 12));
    for (let i = 0; i < cards.length; i++) { const c = cards[i]; syncKey = hMix(syncKey, Math.round(c.x0 / 16)); syncKey = hMix(syncKey, Math.round(c.y0 / 16)); syncKey = hMix(syncKey, Math.round(c.x1 / 16)); syncKey = hMix(syncKey, Math.round(c.y1 / 16)); }
    // (Asked on every model frame, the search below (every place's busyness over the vessels' and organs' points, the labels' boxes)
    // runs at most every 150 ms while its inputs hold; a change of vessel, camera, gate or cards runs it at once. The probe's place is
    // decided with 0.2 s of stillness and eases over 0.3 s, so nothing it does is timed finer than that.)
    const tNow = performance.now();
    if (syncKey === dpr.syncKey && dpr.on && tNow - dpr.searchAt < dpr.searchGap) return;
    if (syncKey !== dpr.syncKey) dpr.searchGap = 150;   // (a new layout: searched at once, and again soon; a place that holds is searched less often, up to 600 ms)
    dpr.syncKey = syncKey; dpr.searchAt = tNow;
    dprMind.sync(syncKey);
    // (Its place keeps its fit through a few px of give, unless only its marks fit: back to the head's fade, it needs the whole room.)
    const O = DPR_OPT, pose = dpr.pose;
    O.r = r; O.away = awayFromProbe(id); O.w = live.wrapRect.width; O.h = live.wrapRect.height; O.cards = cards; O.keep = sameKey ? dpr.side : 0; O.keepReach = dpr.reach; O.keepRev = dpr.rev; O.keepK = dpr.k;
    O.sc = live.CTM?.sc || 1; O.avoid = dprAvoid(); O.busy = dprBusy(DPR_G, id); O.ban = dprMind.banned(); O.lock = dprMind.locked(); O.slack = dpr.headOff ? 0 : SLACK;
    fitPoseInto(pose, O);
    // A new vessel or third: it swings out where it stood and comes in at the new place.
    if (dpr.on && !sameKey) {
      dprLeave(); dpr.box = null; dpr.marks.length = 0; dprDots(); dprMind.hide();
      dpr.swap = stageScope.timer(dprSwapDone, reduceMotion.matches ? 0 : PROBE.OUT_MS + 40);
      return;
    }
    // A new place on the same vessel: the probe swings round the gate to it, its distance and size easing with it (Mohammad,
    // 20 Oct: "I'm okay with the probe rotating in real time as I move around"); the flow axis stays along the flow. Shown afresh,
    // it starts at its place. (dprShape draws it, a frame at a time.)
    const n = dpr.nxt;
    n.ang = pose.ang; n.d = pose.D - Math.max(0, r); n.k = pose.k; n.ax = pose.ang + pose.phi; n.r = r; n.sw = probeSwing(pose.side, O.away === pose.rev);
    // (Shown afresh, it waits till its place holds still for 0.2 s, the late cards and labels landed, then comes in already there
    // and turned to it, so it never arrives and then swings into place (Mohammad, 20 Oct). A place far round the gate or far nearer:
    // it swings out and comes in there rather than flying across. No place: it holds a moment before it goes. dprMind decides.)
    let sig = hMix(keyV, pose.side); sig = hMix(sig, pose.reach); sig = hMix(sig, +pose.rev); sig = hMix(sig, Math.round(pose.k * 1000)); sig = hMix(sig, Math.round(pose.ang / 5)); sig = hMix(sig, Math.round(gx / 4)); sig = hMix(sig, Math.round(gy / 4));
    dpr.searchGap = sig === dpr.lastSig ? Math.min(600, dpr.searchGap * 2) : 150; dpr.lastSig = sig;
    // (While the readings' card slides, and through the camera's refit to it, the cards move under the probe: a far place is swung to, round
    // the gate, never swung out of and in at, Mohammad, 22 Oct: "rotate/move actively out of the way".)
    const A = DPR_ACT;
    A.pose = pose; A.tgt = n; A.on = dpr.on; A.cur = dpr.has ? dpr.cur : null; A.sig = sig; A.now = performance.now(); A.instant = reduceMotion.matches; A.swing = dpr.track || dpr.carry;
    const act = dprMind.act(A);
    if (act !== 'hold' && dpr.noneT) { stageScope.clear(dpr.noneT); dpr.noneT = 0; }
    // (No place on the slide's free space at any side or distance, for good: it swings out and goes, and comes in once one opens.)
    if (act === 'hide') { dprHide(); return; }
    if (act === 'hold') { dpr.noneT ||= stageScope.timer(dprNoneDone, NONE_MS + 30); return; }
    if (act === 'restart') { dprStale(); return; }
    if (act === 'wait') return;
    if (act === 'jump') {
      dprLeave(); dpr.box = null; dpr.marks.length = 0; dprDots();
      dpr.swap = stageScope.timer(dprSwapDone, reduceMotion.matches ? 0 : PROBE.OUT_MS + 40);
      return;
    }
    // (Shown afresh it stands turned out of the way about the target and swings in to its place, the target where it will be.)
    const c = dpr.cur, t = dpr.tgt;
    if (!dpr.on || !dpr.has || reduceMotion.matches) {
      dpr.oP = reduceMotion.matches ? 0 : 1; dpr.has = true;
      c.ang = n.ang; c.d = n.d; c.k = n.k; c.o = 0;
      dpr.headP = pose.headOff ? 0 : 1;
    } else c.ang = n.ang + angTo(n.ang, c.ang);   // (the short way round)
    t.ang = n.ang; t.d = n.d; t.k = n.k; t.ax = n.ax; t.r = n.r; t.sw = n.sw;
    dpr.k = pose.k;
    // (Only its marks fit clear of the cards: the head fades, as the FibroScan probe's does under a card (scanHead).)
    dpr.headOff = !!pose.headOff;
    dpr.gateA[0] = gx; dpr.gateA[1] = gy; dpr.gate = dpr.gateA;
    dpr.draw.x = gx; dpr.draw.y = gy; dpr.draw.live = true;
    dpr.on = true;
    dprShape();   // (after it shows: a probe turned out swings in to its place)
    dpr.keyOn = true; dpr.keyId = id; dpr.keySeg = dop.seg; dpr.side = pose.side; dpr.reach = pose.reach; dpr.rev = pose.rev;
    const b = dpr.boxA, pb = pose.box;
    b.x0 = pb.x0; b.y0 = pb.y0; b.x1 = pb.x1; b.y1 = pb.y1; dpr.box = b;
    // (The boxes the labels keep off: the line of sight, the gate and the faded beam, gathered into the kept list; they are the module's own
    // boxes, good until the next place is worked out, as they always were.)
    let m = 0;
    const bm = beamBoxes(DPR_G, pose.ang, pose.D, r), gm = gateBoxes(DPR_G, pose.ang, pose.phi, r), wm = wedgeBoxes(DPR_G, pose.ang, pose.D, r);
    for (let i = 0; i < bm.length; i++) dpr.marks[m++] = bm[i];
    for (let i = 0; i < gm.length; i++) dpr.marks[m++] = gm[i];
    for (let i = 0; i < wm.length; i++) dpr.marks[m++] = wm[i];
    dpr.marks.length = m;
    dprDots();
  }
  // The probe as drawn (dpr.cur: its direction from the gate, its face's distance from the wall and its size), easing to where it
  // stands (dpr.tgt) in about 0.3 s, one frame at a time; the line of sight always square to its face, the flow axis along the flow.
  const angTo = (a, b) => ((((b - a) % 360) + 540) % 360) - 180;   // b − a, in −180 … 180
  const outEase = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);   // (calm both ends, no overshoot)
  const smooth01 = (p) => p * p * (3 - 2 * p);
  // Writes the probe's record (where it stands, its turn, its swing out, its fades and the marks' numbers) and asks the labels' layer to draw it;
  // while anything is still easing, it carries on in the next frame (dprStep).
  function dprShape() {
    const c = dpr.cur, t = dpr.tgt, dw = dpr.draw;
    c.o = outEase(dpr.oP);
    dw.ang = probeTurn(c.ang, t.sw, c.o);   // (the whole probe swings round the target as it goes, and back to exactly c.ang as it returns)
    probeGeomInto(dw.g, Math.max(0, t.r) + c.d, t.r, angTo(dw.ang, t.ax), c.k, c.o);   // (the flow axis stays along the flow)
    dw.op = probeFade(dpr.oP); dw.headOp = smooth01(dpr.headP);
    live.labelGL?.redraw();
    const oGoal = dpr.on ? 0 : 1, hGoal = dpr.headOff ? 0 : 1;   // (in while it shows, back while it goes)
    const done = dpr.oP === oGoal && (!dpr.on || (c.ang === t.ang && c.d === t.d && c.k === t.k && dpr.headP === hGoal));   // (one going has only to be out)
    if (done) { dpr.eAt = 0; if (!dpr.on) dpr.leaving = false; return; }
    if (!dpr.eRaf) dpr.eRaf = nextFrame(dprStep);
  }
  function dprStep(now) {
    dpr.eRaf = 0;
    const dt = dpr.eAt ? Math.min(0.1, (now - dpr.eAt) / 1000) : 0, f = 1 - Math.exp(-dt / 0.1), q = dpr.cur, g = dpr.tgt; dpr.eAt = now;
    if (dpr.on) {
      q.ang += (g.ang - q.ang) * f; q.d += (g.d - q.d) * f; q.k += (g.k - q.k) * f;
      if (Math.abs(g.ang - q.ang) < 0.3) q.ang = g.ang;
      if (Math.abs(g.d - q.d) < 0.3) q.d = g.d;
      if (Math.abs(g.k - q.k) < 0.004) q.k = g.k;
      // (The head fades in or out on its own clock, 0.42 s, when only the marks fit clear of the cards.)
      const hStep = dt * 1000 / 420;
      dpr.headP = dpr.headOff ? Math.max(0, dpr.headP - hStep) : Math.min(1, dpr.headP + hStep);
    }
    // (The swing out or in is on a clock of its own: PROBE.OUT_MS, the same ease out and in, the place and size held as they were.)
    const stepP = dt * 1000 / PROBE.OUT_MS;
    dpr.oP = dpr.on ? Math.max(0, dpr.oP - stepP) : Math.min(1, dpr.oP + stepP);
    dprShape();   // (and the next frame, while it is still easing)
  }
  // The station dot under the gate (where the reading's leader starts) fades out while the probe shows on that vessel, and back as it
  // goes: the reading and its leader stay. Every dot within 6 px of the gate, at the same 0.36 s as the probe (.dpr-hid, styles/app.css).
  // Called as the probe's state changes and as the leaders are painted (paintLeaders), so a dot that comes in under the probe never shows.
  function dprDots() {
    const g = (dpr.on || dpr.swap) && dpr.gate;   // (a probe changing sides keeps the dot away: it fades out and in again with the probe)
    for (const [k, el] of live.leadEls) {
      if (!/^(d|h):/.test(k)) continue;
      const a = el._a, hide = !!g && !el._gone && Math.hypot(+a.cx - g[0], +a.cy - g[1]) < 6;
      if (hide !== !!el._dprHid) { el._dprHid = hide; el.classList.toggle('dpr-hid', hide); }
    }
  }
  return { dprDots, dprHold, dprLet, dprMake, dprobePaint, smooth01 };
}
