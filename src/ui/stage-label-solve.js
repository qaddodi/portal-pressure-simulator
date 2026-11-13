// The label solver: the clamp-label probes and layoutLabels / layoutLabelsGen, which lay every label out against the figure.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { EDGES, NODES, STENT_SITES, isStent, stentGate, stentSite } from '../engine/topology.js';
import { ATLAS_COLUMNS, ATLAS_LABELS, CHIP_NODES, CIRCUIT_LABELS, CIRCUIT_ZONES, LABEL_VESSEL, LANE_CAPTIONS, LIVER_INNER, NODE_POS, ORGAN_LABELS, TIP_FADE } from './anatomy.js';
import { SPAN_TICK, besideLine, clearOf, insideBy, organAnchor, spanOf, stepGroups } from './callout-math.js';
import { bareDots } from './circuit-nodes.js';
import { D_SURFACE, EASE_ARRIVE } from './ease.js';
import { heartPass } from './heart-label.js';
import { HOVER_LINK } from './hover-link.js';
import { RING_DIRS, boxGap, crosses, hits, needsLeader, offset, triDist, within } from './label-place.js';
import { reduceMotionMQ as reduceMotion } from './motion.js';
import { NAME_BREAK, OFF_NEAR, nameSpots, onOtherOrgan } from './organ-names.js';
import { leaderVesselHits, segHitsBox, segsCross } from './seg-hits.js';
import { elBoxInto } from './shape-gl.js';
import { store } from './store.js';
import { spreadDots } from './label-dots.js';

const STEP_LEAD_GAP = 10;   // (how near its point a step number may stand, px: room for its dot's ring and a leader to the chip)
export function createLabelSolve(st, live) {
  const { ANAT_EXTRA, ANAT_PRI, CIRCUIT_LABEL_K, E, EBOX, EI, KEY_NODES, LINE_H, LW_XY, MARK_GRID, NI, NO_BLK, PIN_DIR, PULL_GRID, TURN_DIR, ZONE_SHORT, arcMid, blockWant, buildSegs, caliperAt, caliperSegs, calloutBoxes, cath, cathRadOf, clampD, clampFontAt, clampLabelAt, clampLabelPos, clampMv, clampStep, clampTextBox, clampW, colGap, dop, dpr, easeInOut, flagged, fontPx, fxBuild, fxK, fxPill, gLabels, gScan, geo, hasDot, hasVarices, isImaging, labelAnchor, labelBase, labelGlide, labelHidden, labelStop, labelVis, laneAlt, laneU, leadEls, leadRectOf, leaderEnd, lineHits, lineW, liverExpanded, localToWorld, localWorldXY, nodeItem, nodePos, onSelect, oneLine, organEls, ov, paintLeaders, pointAt, pool, procIn, pzInset, rectOf, renderBlock, resItem, resPlace, saSides, scan, scanTipLocal, seenEnd, shortenItem, shortenTo, sites, sliceOver, stageBox, stagePx, stenosisAt, stentReady, textW, velItem, vh, worldToLocal, worldToLocalInto, zoneStick, zoomedIn } = st;
  // (What a layout keeps from label to label across a solve's slices (views, obstacles, boxes, callouts, "60 %" spots, stent dots, arrows, slots), in two records: the live layout's and the dry solve ahead's (stage-view.js preStep), which runs between live layouts.)
  const rect0 = () => ({ x0: 0, y0: 0, x1: 0, y1: 0 }), scratch = () => ({ view: rect0(), plain: rect0(), ptView: rect0(), obst: [], placed: [], call: [], clampAlts: [], markDots: [[0, 0], [0, 0], [0, 0]], markArrows: [], markTris: Array.from({ length: 8 }, () => [[0, 0], [0, 0], [0, 0]]), sol: new Map() });
  const LIVE_SC = scratch(), DRY_SC = scratch();
  const viewOf = (it, S) => (it.key === 'scan' ? S.plain : it.point || (dop.all && /^focus/.test(it.key)) ? S.ptView : S.view);
  const FAR_DIRS = ['SE', 'NE', 'SW', 'NW', 'E', 'W', 'S', 'N'];
  const STENT_PTS = ['proximal', 'mid', 'distal'];
  const SB_A = [0, 0], SB_B = [0, 0], SB_C = [0, 0], SP_P = [0, 0], SP_Q = [0, 0];
  const SC_R = { x0: 0, y0: 0, x1: 0, y1: 0 };
  const LANE = { ox: 0, oy: 0, ux: 0, uy: 0 };
  const CLAMP_BEST = { n: 0, d: 0, t: 0 }, CLAMP_BB = { x: 0, y: 0, width: 0, height: 0 }, CLAMP_R = { x0: 0, y0: 0, x1: 0, y1: 0 };
  const CLAMP_MEAS = [{ set: false, x: 0, y: 0, bb: { x: 0, y: 0, width: 0, height: 0 } }, { set: false, x: 0, y: 0, bb: { x: 0, y: 0, width: 0, height: 0 } }];
  // (The "60 %" search's steps: every 4 px out to 64 and every 8 along the vessel, -64 to 64, nearest first. The same for every label.)
  const CLAMP_STEPS = [];
  for (let px = 0; px <= 64; px += 4) for (let tp = -64; tp <= 64; tp += 8) CLAMP_STEPS.push([px, tp]);
  CLAMP_STEPS.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  // A stent's point on the screen, written into `out`.
  function pointAtLocal(out, pts, u) { const p = pointAt(pts, u); return worldToLocalInto(out, p[0], p[1]); }
  // (A slide's caliper or bracket: boxes along the line from p to q, pushed on the boxes placed.)
  function segBoxes(placed, p, q, pad) {
    worldToLocalInto(SB_A, p[0], p[1]); worldToLocalInto(SB_B, q[0], q[1]);
    const x0 = SB_A[0], y0 = SB_A[1], x1 = SB_B[0], y1 = SB_B[1], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8));
    for (let i = 0; i < n; i++) {
      const u0 = i / n, u1 = (i + 1) / n, xa = x0 + (x1 - x0) * u0, xb = x0 + (x1 - x0) * u1, ya = y0 + (y1 - y0) * u0, yb = y0 + (y1 - y0) * u1;
      placed.push({ x0: Math.min(xa, xb) - pad, y0: Math.min(ya, yb) - pad, x1: Math.max(xa, xb) + pad, y1: Math.max(ya, yb) + pad, dot: true });
    }
  }
  // lineW of a line with every figure run read as "000" (the widest a reading's figures can be).
  function lineW000(line) { let w = 0; for (let i = 0; i < line.length; i++) { const r = line[i]; w = w + textW(r.cls === 'lb-val' ? '000' : r.t, fontPx(r.size), r.weight, r.track || 0) + (i ? (r.gap ?? 3) * live.labelK : 0); } return w; }
  // How badly a stent's three points would stand in a column on `side` of their dots: off the view, under a card, over vessels.
  function colSideScore(side, col, tpl, G, wT, h, view, obstacles) {
    const padX = tpl.padX || 0, padY = tpl.padY || 0;
    let n = 0;
    for (let i = 0; i < 3; i++) {
      pointAtLocal(SB_C, geo[col].cur, STENT_SITES[STENT_PTS[i]]);
      const x = side === 'E' ? SB_C[0] + G : SB_C[0] - G - wT, y = SB_C[1] - h / 2;
      SC_R.x0 = x - padX; SC_R.y0 = y - padY; SC_R.x1 = x + wT + padX; SC_R.y1 = y + h + padY;
      let under = false;
      for (let j = 0; j < obstacles.length; j++) { const o = obstacles[j]; if (!o.probe && hits(SC_R, o)) { under = true; break; } }
      n = n + (within(SC_R, view) ? 0 : 1e3) + (under ? 1e3 : 0) + lineHits(SC_R, 2) * 10;
    }
    return n;
  }
  // The slide's mark (or the first of its marks) that stands on this stent, or null.
  function focusMarkOn(st, col) {
    const fo = st.focus;
    if (!fo) return null;
    const ms = fo.marks;
    if (ms) { for (let i = 0; i < ms.length; i++) if (ms[i].edges?.[0] === col) return ms[i]; return null; }
    return fo.edges?.[0] === col ? fo : null;
  }
  // The lane the slide's mark leaves along at the narrowing (kept record LANE), or null.
  function laneFor(col, st, f) {
    const m = focusMarkOn(st, col);
    if (!m) return null;
    const pp = f.viewParams || st.params, cur = geo[col].cur;
    const pt = pointAt(cur, stenosisAt(col, pp)), x = pt[0], y = pt[1], dx = pt[2], dy = pt[3];
    worldToLocalInto(SB_A, x, y);
    const ox = SB_A[0], oy = SB_A[1];
    pointAtLocal(SB_B, cur, m.seg ? STENT_SITES[stentGate(m.seg, pp, col)] : 0.5);
    if (Math.hypot(SB_B[0] - ox, SB_B[1] - oy) > 12) return null;
    worldToLocalInto(SB_B, x + dx, y + dy);
    const tx = SB_B[0], ty = SB_B[1], n = Math.hypot(tx - ox, ty - oy) || 1;
    pointAtLocal(SB_C, cur, STENT_SITES.mid);
    const cx = SB_C[0], cy = SB_C[1];
    const sg = (cx - ox) * (tx - ox) + (cy - oy) * (ty - oy) > 0 ? -1 : 1;
    LANE.ox = ox; LANE.oy = oy; LANE.ux = (sg * (tx - ox)) / n; LANE.uy = (sg * (ty - oy)) / n;
    return LANE;
  }
  function inLaneBox(lane, r) {
    if (!lane) return false;
    const { ox, oy, ux, uy } = lane, sx = Math.max(1, (r.x1 - r.x0) / 8), sy = Math.max(1, (r.y1 - r.y0) / 4);
    for (let x = r.x0; x <= r.x1 + 0.01; x += sx) for (let y = r.y0; y <= r.y1 + 0.01; y += sy) {
      const a = (x - ox) * ux + (y - oy) * uy;
      if (a > 10 && a < 150 && Math.abs((y - oy) * ux - (x - ox) * uy) < 46) return true;
    }
    return false;
  }
  // (The "60 %" the probe would cover: its box moved by d out and t along the vessel, judged against the probe's boxes, the view and the credit.
  // One label at a time, so the context is kept and the box is a kept record.)
  const CLB = { c: null, base: null, ox: 0, oy: 0, id: '', credit: null, probe: null, view: null };
  const CLB_BASE = { x0: 0, y0: 0, x1: 0, y1: 0 }, CLB_R = { x0: 0, y0: 0, x1: 0, y1: 0 }, BOX_TMP = { x0: 0, y0: 0, x1: 0, y1: 0 };
  const PROBE_BUF = [], CLAMP_SEEN = new Set();
  const PROBE_STEPS = [];
  for (let px = 0; px <= 80; px += 8) for (let tp = -88; tp <= 88; tp += 8) if (px || tp) PROBE_STEPS.push([px, tp]);
  PROBE_STEPS.sort((u, v) => Math.hypot(...u) - Math.hypot(...v));
  function clBoxAt(d, t) {
    const c = CLB.c, base = CLB.base;
    worldToLocalInto(SB_A, c.x + c.nx * (d - 16) - c.ny * t, c.y + c.ny * (d - 16) + c.nx * t);
    if (!base) return base;
    const bx = SB_A[0], by = SB_A[1], r = CLB_R;
    r.x0 = base.x0 + bx - CLB.ox; r.y0 = base.y0 + by - CLB.oy; r.x1 = base.x1 + bx - CLB.ox; r.y1 = base.y1 + by - CLB.oy;
    return r;
  }
  function clProbeHit(b) { const pr = CLB.probe; for (let i = 0; i < pr.length; i++) if (hits(b, pr[i])) return true; return false; }
  function clFree(b) { return b && !clProbeHit(b) && within(b, CLB.view) && lineHits(b, 6, CLB.id) < 1 && !(CLB.credit && hits(b, CLB.credit)); }
  // An element's box in stage px, `m` px grown, written into `out` (or null when it has none).
  function boxOfElInto(out, el, m = 2) {
    const b = el._txt != null ? clampTextBox(el) : elBoxInto(el, EBOX, clampTextBox);
    if (!b?.width) return null;
    const bx = b.x, by = b.y, bw = b.width, bh = b.height;
    worldToLocalInto(SB_A, bx, by); let x0 = SB_A[0], y0 = SB_A[1], x1 = x0, y1 = y0;
    worldToLocalInto(SB_A, bx + bw, by); x0 = Math.min(x0, SB_A[0]); y0 = Math.min(y0, SB_A[1]); x1 = Math.max(x1, SB_A[0]); y1 = Math.max(y1, SB_A[1]);
    worldToLocalInto(SB_A, bx, by + bh); x0 = Math.min(x0, SB_A[0]); y0 = Math.min(y0, SB_A[1]); x1 = Math.max(x1, SB_A[0]); y1 = Math.max(y1, SB_A[1]);
    worldToLocalInto(SB_A, bx + bw, by + bh); x0 = Math.min(x0, SB_A[0]); y0 = Math.min(y0, SB_A[1]); x1 = Math.max(x1, SB_A[0]); y1 = Math.max(y1, SB_A[1]);
    out.x0 = x0 - m; out.y0 = y0 - m; out.x1 = x1 + m; out.y1 = y1 + m;
    return out;
  }
  function boxOfEl(el, m = 2) { const b = boxOfElInto(BOX_TMP, el, m); return b && { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }; }
  // (The layout itself, a generator: a solve yields between labels once its slice is spent (sliceOver); run whole, it never yields.)
  function* layoutLabelsGen(f, solve, dry = false) {
    live.frameNo++;
    const S = dry ? DRY_SC : LIVE_SC;
    const st = store.get();
    const t = easeInOut(live.morph);
    const circuit = t >= 0.5;
    if ((circuit && live.rotU > 0.5) !== live.labelTurned) { live.labelTurned = !live.labelTurned; live.labelSol.clear(); if (!solve) return false; }
    live.labelK = labelBase() * (circuit ? CIRCUIT_LABEL_K : 1);
    if (live.labelK !== live.lbkNum) { live.lbkNum = live.labelK; live.lbkStr = live.labelK.toFixed(2); }   // (the text made only when the number moved)
    const lbk = live.lbkStr;
    // (The text scale sets every label's halo: label-gl reads them all again (L3 P5). Not for a dry solve, the other view's ahead, whose
    // write stage-view.js preSlice puts back in the same task: no label is read in between.)
    if (gLabels.dataset.k !== lbk) { gLabels.dataset.k = lbk; gLabels.style.setProperty('--lbk', lbk); if (!dry) live.labelGL?.dirty(gLabels); }
    const wr = stageBox();
    const W = wr.width, H = wr.height;
    // A solve prefers slots that sit inside the stage as it is now, but never depends on the panels, and a pan
    // alone never searches again. A label a pan later pushes past the edge is pulled back in (see below).
    // (On a wide screen's slide the readings keep the slides' one margin from every edge, as the cards do, and stay above the nav
    // pill's row: 17 Oct design review, a reading had stood 8 px from the right edge, and another level with the pill.)
    const M = st.presenting && live.pillEdge ? live.pillEdge.m : 6;
    const view = S.view, plain = S.plain, ptView = S.ptView;
    view.x0 = M; view.y0 = M; view.x1 = W - M; view.y1 = H - M; plain.x0 = 6; plain.y0 = 6; plain.x1 = W - 6; plain.y1 = H - 6;   // plain: the whole stage, for the FibroScan callout, which keeps with its probe (see below)
    if (st.presenting && live.pillEdge) view.y1 = Math.max(H * 0.5, Math.min(view.y1, live.pillEdge.top - 8));
    // (A label keeps out of the sensor housing and the rounded corners of a phone held sideways: the stage runs edge to edge under them.)
    { const sa = saSides(); view.x0 = Math.max(view.x0, sa.l - wr.left); view.x1 = Math.min(view.x1, W - Math.max(0, sa.r - (innerWidth - wr.right))); }
    // A presenter slide's words hold the left (a phone: the top) under a fading shade; labels keep clear of it.
    if (st.presenting) { view.x0 = Math.max(view.x0, pzInset('--pz-l') + 30); view.y0 = Math.max(view.y0, pzInset('--pz-t') + 12); }
    // (A stent's point, and the slide's mark beside it, come as near the top card as they may come to any card (4 px past its box, and
    // a pixel to spare), so the point nearest it can still stand level with its dot: Review 16 Oct.)
    ptView.x0 = view.x0; ptView.y0 = st.presenting ? Math.max(6, pzInset('--pz-t') + 5) : view.y0; ptView.x1 = view.x1; ptView.y1 = view.y1;
    const compact = W < 700;
    // Floating panels over the figure (notifications, hint cards, banners): a label under one is hidden.
    // Their boxes are read before this frame's SVG changes (see updateInner), while layout is clean.
    const blockers = live.blockerBoxes || NO_BLK;   // (none read yet: read first in the next frame, see updateInner)
    const callouts = S.call, cb = calloutBoxes();   // (copied: the list calloutBoxes gives is rewritten by the next layout's call)
    callouts.length = 0; for (let i = 0; i < cb.length; i++) callouts.push(cb[i]);
    const obstacles = S.obst;   // what can hide a label this frame
    obstacles.length = 0;
    for (let i = 0; i < blockers.length; i++) obstacles.push(blockers[i]);
    for (let i = 0; i < callouts.length; i++) obstacles.push(callouts[i]);
    const placed = S.placed;
    placed.length = 0;
    if (solve) for (let i = 0; i < callouts.length; i++) { const b = callouts[i]; placed.push({ x0: b.x0 - 3, y0: b.y0 - 3, x1: b.x1 + 3, y1: b.y1 + 3, call: true, probe: !!b.probe }); }
    // (A slide's calipers and brackets (package F) are lines no label may sit on, their own readings included: boxes along each.)
    if (solve && live.fx) {
      if (!circuit) for (const c of live.fx.calipers) { const g = caliperSegs(c, f); if (g) for (const [p, q] of g.segs) segBoxes(placed, p, q, 5); }
      if (circuit) for (const sp of live.fx.spans) {
        const at = spanOf(sp.from, sp.to, fxK());
        if (at) {
          SP_P[0] = at.x0; SP_P[1] = at.y; SP_Q[0] = at.x1; SP_Q[1] = at.y; segBoxes(placed, SP_P, SP_Q, 5);
          SP_P[0] = at.x0; SP_P[1] = at.y - SPAN_TICK; SP_Q[0] = at.x0; SP_Q[1] = at.y; segBoxes(placed, SP_P, SP_Q, 5);
          SP_P[0] = at.x1; SP_P[1] = at.y - SPAN_TICK; SP_Q[0] = at.x1; SP_Q[1] = at.y; segBoxes(placed, SP_P, SP_Q, 5);
        }
      }
    }
    // (The corner credit, where it shows: a stent's column and the slide's mark beside it keep off it where they can, so it holds its
    // spot when another point is picked. It moves whenever a label comes to cover it, and does not come back.)
    // (Its box read with the cards', first in a frame: readBlockersRead.)
    const creditBox = solve && dop.all ? live.creditKept : null;
    const markDots = solve && dop.all && dop.id && geo[dop.id]?.cur?.length > 1 ? S.markDots : null;   // (the stent's three dots: kept pairs)
    if (markDots) for (let i = 0; i < 3; i++) pointAtLocal(markDots[i], geo[dop.id].cur, STENT_SITES[STENT_PTS[i]]);
    const later = [];   // labels placed after the slide's marks (a stent's points other than the sampled one)
    // Where a stent's point goes when nothing near its third is free: a little farther out on a leader that crosses no label (diagonal
    // first, which clears a narrowing's clamp above or below its "60 %"), then farther still.
    // (A stent's point with still no room, on a phone's small stent beside its narrowing: the far spots slid up or down a
    // little, nearest first, so its leader can pass by the narrowing's clamp and its label sit in the gap that is left.)
    const SLID = (far) => [far + 12, far + 48, far + 84].flatMap((gap) => [-24, 24, -48, 48, -72, 72].map((y) => ({ gap, leader: true, uncrossed: true, shift: [0, y] })));
    let stale = false;
    const prevSol = live.labelSol, nextSol = solve ? (dry ? S.sol : live.labelSolSpare) : live.labelSol;   // (the one that was not kept last time, cleared: the two take turns; a dry solve's own)
    if (solve) nextSol.clear();
    // (A solve in the anatomy at the zoom, turn and view it was last solved for (a pan, a value that changed what shows): every label
    // whose old spot beside its point is still free keeps it, and only the others are placed again. Solved whole, a pan's release had
    // put CONF, SMV, SV and IMV on other sides of their vessels, the labels sliding against the figure as the hand let go: 3 Nov 2026.)
    // (Any zoom and either view, 5 Nov 2026 review #4: a label keeps its screen size, so its old slot at a new zoom is the same picture, and only the
    // checks below decide whether it is still free. Held to the Anatomy at the solved scale, every Circuit landing and every pinch's landing placed
    // all again, and labels swapped sides as the hand let go. The view and the turn still have to match.)
    const keepSlots = solve && !dry && !!live.solvedFor && live.solvedFor.view === live.morphTarget && (live.morph === 0 || live.morph === 1)
      && Math.abs(Math.atan2(live.CTM.b, live.CTM.a) - live.solvedFor.th) < 0.01, settle = !solve && !dry && !live.gestureOn() && !live.drifting && !live.vtGliding && !live.zoomBase && (live.morph === 0 || live.morph === 1);   // (settle: a carry with the camera at rest, L2 below)
    const out = [];
    const leaders = [];   // { k, tag, at }: every line, then every dot (paintLeaders)
    let useLines = false, rings = [], ringXY = [];   // rings: the Circuit's stations with a reading (see placeMulti); ringXY: their dots
    const clampAlts = S.clampAlts;   // (the column's "60 %": other spots off the vessels, nearest first, for the slide's mark)
    const buildLines = () => { if (solve && !useLines) { useLines = true; buildSegs(dry ? live.segIdxDry : null); } };   // (a dry solve's lines in an index of its own: preStep)
    // A stent called out at its three points: the three stand in a column beside their own dots, distal to proximal in the stent's
    // own order, on the side with room (off the cards and the stage edge, over the fewest vessels). The side is chosen from the stent
    // and the screen alone, never from the point sampled, so nothing moves when another point is picked; the "60 %" takes the other side.
    if (solve) {
      const col = dop.all && dop.id && E[dop.id]?.vis && EI[dop.id] >= 0 && geo[dop.id]?.cur?.length > 1 ? dop.id : null;
      if (col) {
        buildLines();
        const tpl = velItem(col, f, 'distal'), h = tpl.h, G = colGap(col);
        const wT = lineW000(tpl.lines[0]);
        const e = colSideScore('E', col, tpl, G, wT, h, view, obstacles), w = colSideScore('W', col, tpl, G, wT, h, view, obstacles);
        live.ptSide = live.clampFor === col && live.ptSide === 'W' ? (e + 5 < w ? 'E' : 'W') : (w + 5 < e ? 'W' : 'E');   // (a near tie keeps the side it had)
      } else live.ptSide = null;
      const away = col ? (live.ptSide === 'E' ? 'W' : 'E') : null;
      const cws = clampW.children;
      if (away !== live.clampAway || col !== live.clampFor) { live.clampAway = away; live.clampFor = col; for (let i = 0; i < cws.length; i++) if (cws[i].classList.contains('clamp-label')) clampLabelAt(cws[i]); }
      for (let i = 0; i < cws.length; i++) if (cws[i].classList.contains('clamp-label')) clampFontAt(cws[i]);
      // (The column's "60 %" stands off the vessels on its side (Review 15 Oct: it sat on the grey vein): the nearest spot clear of
      // every vessel but its stent and of the credit, a step farther out or slid along the stent at a time, up to 64 px each way;
      // failing that, the one over the fewest.)
      // (Where the slide's mark points at the narrowing, its leader can only leave along the stent, between the arrows and away from the
      // other dots: the "60 %" keeps out of that lane where it can, so the mark finds a spot there off the vessels: Review 16 Oct.)
      const lane = col ? laneFor(col, st, f) : null;
      if (col) for (let wi = 0; wi < cws.length; wi++) {
        const el = cws[wi];
        if (!el.classList.contains('clamp-label') || el._c?.id !== col) continue;
        const k = 1 / Math.max(live.CTM.sc, 1e-3), steps = CLAMP_STEPS;
        let hasBest = false;
        const best = CLAMP_BEST;
        // (Where the slide's mark is on this stent, the next few spots off the vessels are kept too: the mark may need the one it takes,
        // and then the "60 %" moves to the nearest of them that frees it (see the focus callout).)
        const markOn = focusMarkOn(st, col) !== null;
        clampAlts.length = 0;
        // (Its box is measured once for each way its text can run; every other step only moves it, so the box moves by the
        // same amount: up to 289 forced layouts in one search had been one per step. Review item 24.)
        const measured = CLAMP_MEAS;
        measured[0].set = false; measured[1].set = false;
        for (let si = 0; si < steps.length; si++) {
          const px = steps[si][0], tp = steps[si][1];
          if (hasBest && !best.n && (!markOn || clampAlts.length >= 12)) break;
          el._d = 16 + px * k; el._t = tp * k;
          const q = clampLabelPos(el);
          if (!q) break;
          const qx = +q.x.toFixed(2), qy = +q.y.toFixed(2), ref = measured[+q.left];
          let bb;
          if (ref.set) { bb = CLAMP_BB; bb.x = ref.bb.x + (qx - ref.x); bb.y = ref.bb.y + (qy - ref.y); bb.width = ref.bb.width; bb.height = ref.bb.height; }
          else {
            clampLabelAt(el);
            bb = clampTextBox(el);
            if (!bb) break;
            ref.set = true; ref.x = qx; ref.y = qy; ref.bb.x = bb.x; ref.bb.y = bb.y; ref.bb.width = bb.width; ref.bb.height = bb.height;
          }
          worldToLocalInto(SB_A, bb.x, bb.y); worldToLocalInto(SB_B, bb.x + bb.width, bb.y + bb.height);
          const r = CLAMP_R;
          r.x0 = Math.min(SB_A[0], SB_B[0]); r.y0 = Math.min(SB_A[1], SB_B[1]); r.x1 = Math.max(SB_A[0], SB_B[0]); r.y1 = Math.max(SB_A[1], SB_B[1]);
          const n = lineHits(r, 8, col) + (within(r, view) ? 0 : 1e3) + (creditBox && hits(r, creditBox) ? 100 : 0) + (inLaneBox(lane, r) ? 0.5 : 0);   // (its 3.5 px halo and 2 px of air past it, and a pixel and a half to spare)
          if (n < 1 && hasBest && best.n < 1) clampAlts.push({ d: el._d, t: el._t, el });
          if (!hasBest || n < best.n) { hasBest = true; best.n = n; best.d = el._d; best.t = el._t; }
        }
        let kept = 0;
        for (let i = 0; i < clampAlts.length; i++) { const a = clampAlts[i]; if (a.d !== (hasBest ? best.d : undefined) || a.t !== (hasBest ? best.t : undefined)) clampAlts[kept++] = a; }
        clampAlts.length = kept;
        if (hasBest) { clampD.set(col, { d: best.d, t: best.t }); el._d = el._t = undefined; clampLabelAt(el); }
      }
    }
    // Stenosis clamps and their percentages are drawn on the figure; keep labels off them. (Beside a stent called out in a column,
    // only the clamp's own arrows and its "60 %", so the callout at the narrowing can stand right by its dot.)
    if (solve && !isImaging()) {
      const stenoses = (f.viewParams || st.params).stenosis;
      for (const id in stenoses) {
        const v = stenoses[id];
        if (!(v > 0) || !E[id]?.vis) continue;
        if (id === live.clampFor && live.ptSide) {
          const cks = ov.clamps.children;
          for (let i = 0; i < cks.length; i++) {
            const el = cks[i];
            if (!el.classList.contains('clamp') || el.getAttribute('data-id') !== id) continue;
            const b = boxOfElInto({ x0: 0, y0: 0, x1: 0, y1: 0 }, el, 0);
            if (b) placed.push(b);
          }
          continue;
        }
        pointAtLocal(SB_A, geo[id].cur, stenosisAt(id, f.viewParams || st.params));
        const sx = SB_A[0], sy = SB_A[1];
        placed.push({ x0: sx - 26, y0: sy - 22, x1: sx + 60, y1: sy + 22 });
      }
    }
    // (The clamps' "60 %" again on its own: a station inside the clamp's box above may send a long leader out, but never through it,
    // and no leader passes nearer than 2 px to its halo: Review 15 Oct.)
    // The "60 %" the probe would cover steps out on a leader line (its fade out and in: clampStep); the leader is drawn from the
    // clamp's outer tip (clampLeads, below).
    if (solve && !isImaging()) {
      const probe = PROBE_BUF, seen = CLAMP_SEEN, k = 1 / Math.max(live.CTM.sc, 1e-3);
      probe.length = 0; seen.clear();
      if (dpr.on && dpr.box) { probe.push(dpr.box); const pm = dpr.marks; for (let i = 0; i < pm.length; i++) probe.push(pm[i]); }
      const cws2 = clampW.children;
      for (let wi = 0; wi < cws2.length; wi++) {
        const el = cws2[wi];
        if (!el.classList.contains('clamp-label')) continue;
        const c = el._c, id = c?.id, m = clampMv.get(id);
        if (!c || id === live.clampFor || (!probe.length && !m?.cur)) continue;   // (a column's "60 %" has its own spot: clampD)
        seen.add(id);
        buildLines();
        // (The box at the usual spot once, then shifted: a move of d out and t along the vessel is the same move on screen.)
        el._d = 16; el._t = 0; clampLabelAt(el);
        const base = boxOfElInto(CLB_BASE, el, 5);
        worldToLocalInto(SB_B, c.x, c.y);
        el._d = el._t = undefined;
        CLB.c = c; CLB.base = base; CLB.ox = SB_B[0]; CLB.oy = SB_B[1]; CLB.id = id; CLB.credit = creditBox; CLB.probe = probe; CLB.view = view;
        let want = null, probed = false;
        for (let i = 0; i < probe.length; i++) if (hits(clBoxAt(16, 0), probe[i])) { probed = true; break; }
        if (probed) {
          const cur = m?.want;
          if (cur && clFree(clBoxAt(cur.d, cur.t))) want = cur;   // (a spot that still works is kept: nothing hops while the probe stays)
          else {
            const steps = PROBE_STEPS;
            let hit = null;
            for (let i = 0; i < steps.length; i++) if (clFree(clBoxAt(16 + steps[i][0] * k, steps[i][1] * k))) { hit = steps[i]; break; }
            if (hit) want = { d: 16 + hit[0] * k, t: hit[1] * k };
          }
        }
        clampStep(id, want);
        clampLabelAt(el);
      }
      for (const [id, m] of clampMv) if (!seen.has(id) && !m.busy) clampMv.delete(id);
    }
    if (solve && !isImaging()) for (let wi = 0, cwl = clampW.children; wi < cwl.length; wi++) {
      const el = cwl[wi];
      if (!el.classList.contains('clamp-label')) continue;
      const b = boxOfElInto(BOX_TMP, el, 6);
      if (b) placed.push(el._box = { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, lab: true });
    }
    // (The column's narrowing arrows, for the slide's mark: its leader keeps 6 px off them, as drawn (their triangles, not their
    // boxes, so a leader straight up between them still passes): Review 16 Oct.)
    const markArrows = S.markArrows, markTris = S.markTris, ptSide = live.ptSide;   // (ptSide: this layout's, read after a slice too, when a live layout may have set its own)
    markArrows.length = 0;
    if (solve && dop.all && live.clampFor && live.ptSide) {
      const cks = ov.clamps.children;
      for (let i = 0; i < cks.length; i++) {
        const el = cks[i];
        if (!el.classList.contains('clamp') || el.getAttribute('data-id') !== live.clampFor) continue;
        const n = (el.getAttribute('d') || '').match(/-?[\d.]+(e-?\d+)?/g);
        if (!n || n.length < 6) continue;
        const tri = markTris[markArrows.length] || (markTris[markArrows.length] = [[0, 0], [0, 0], [0, 0]]);   // (more arrows than ever: one more is made)
        for (let j = 0; j < 3; j++) worldToLocalInto(tri[j], +n[j * 2], +n[j * 2 + 1]);
        markArrows.push(tri);
      }
    }
    // Slots are searched over every (pass, direction) pair at once: an earlier pass always beats a
    // later one (nearer, no leader, clear of vessels), then the direction order decides. The slot a
    // label held before wins as long as it still collides with nothing: no label, no dot, and (in a
    // clear pass) no vessel. A fresh slot must keep 3 px of air from vessels, the held one needs none.
    // The width a label reserves only grows (a value ticking from 9.9 to 10.0, or a change gaining a
    // digit, would otherwise tip it to another side of its station and back).
    const place = (it, dirs, gap, leader, clear) => placeMulti(it, dirs, (Array.isArray(gap) ? gap : [gap]).map((g, gi) => ({ gap: g, leader, clear, bias: gi * 6 })));
    // (Whether the box r lies on an organ other than the name's; whether a card (10 px off it, as an organ name is hidden) or a shown label's leader is in r's way.)
    const onOrgans = (name, r) => { const [x0, y0] = localToWorld(r.x0, r.y0), [x1, y1] = localToWorld(r.x1, r.y1); return onOtherOrgan(name, Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)); };
    const carded = (r) => obstacles.some((o) => !o.zone && hits(r, { x0: o.x0 - 10, y0: o.y0 - 10, x1: o.x1 + 10, y1: o.y1 + 10 })), blocked = (r) => carded(r) || out.some((o) => { if (!o.leader || o.live || o.hide || !Number.isFinite(o.ax)) return false; const e = leaderEnd(rectOf(o), o.ax, o.ay); return segHitsBox({ x0: o.ax, y0: o.ay, x1: e.x, y1: e.y }, r, 1); });
    const placeMulti = (it, dirs, passes, from = 0, to = passes.length, final = true, maxShort = final ? 2 : 0) => {   // (from, to: only those passes are searched this round; a round that is not final gives up without shortening or dropping.)
      const prev = prevSol.get(it.key);
      let reslot = false, replace = null;
      if (!solve) {
        // Carry: the label goes where it was put, relative to the figure point it names.
        if (!prev) { stale = true; return false; }
        if (prev.drop) return false;
        if ((prev.short || prev.abbr) && it.canShort) shortenTo(it, +prev.short || 0, prev.abbr);
        if (prev.one) oneLine(it);
        if (it.w > prev.w + 0.5 || it.h > prev.h + 0.5) { stale = true; return false; }
        const [ax, ay] = worldToLocal(prev.wx, prev.wy), ax0 = it.ax, ay0 = it.ay;   // (ax0, ay0: the point the caller gave, a lane's spot along it)
        it.ax = ax; it.ay = ay; it.au = prev.au; it.dir = prev.dir; it.leader = prev.leader; it.onVessel = !!prev.onv;
        const slack = it.rot ? 0 : prev.w - it.w;
        // (Its gap widened or narrowed with its vessel's width on the screen since it was solved: carried as a solve at this zoom would put it.)
        const dvc = prev.vh != null && it.vw > 0 ? PIN_DIR[prev.dir] : null, dh = dvc ? it.vw / 2 - prev.vh : 0;
        it.x = ax + prev.dx + (prev.dir.includes('W') ? slack : prev.dir.includes('E') ? 0 : slack / 2) + (dvc ? dvc[0] * dh : 0);
        it.y = ay + prev.dy + (dvc ? dvc[1] * dh : 0);
        // (A Circuit reading carried onto a station's ring is solved again: the figure eased a few per cent closer or farther since
        // it was solved, and the reading, kept as far from the middle of its vessel, came onto the station's ring at its end. One
        // the solve itself left on a ring (dot) is carried, or it would be solved again every frame.)
        // (During a hand's zoom it is placed again by itself, below, among the spots beside its station (passes 0-2) it was solved
        // into; one solved further out, onto a vessel, or rescued is solved again with the rest, as before.)
        if (circuit && it.key.startsWith('n:') && !prev.dot && placed.some((p) => p.dot && hits(rectOf(it), p))) {
          if (!live.carryReslot || prev.onv || !(prev.pi >= 0 && prev.pi < 3) || from !== 0 || to > 3) { stale = true; return false; }
          reslot = true;
          if (!useLines) { useLines = true; buildSegs(); }
        }
        if (!reslot) {
          const box = it.rot ? rectOf({ ...it, w: it.h, h: it.w }) : rectOf(it);   // (a turned caption's box is turned too, as when it was solved)
          if (live.carryClear && (placed.some((p) => !p.dot && hits(box, p)) || callouts.some((b) => hits(box, b)))) { stale = true; return false; }   // (carried past the usual 5 % by a hand's zoom: a label that would come onto another, or onto a slide's callout, is solved again)
          // (L2, 12 Nov 2026: at rest after a pan, a label the pan carried past the stage's edge or onto a card is placed again by itself, 10 px clear of any card; every other keeps its offset, and no solve of all of them runs. None that fits: it stays as carried, hidden or pulled in as before.)
          if (settle && sites.list?.some((k) => k[0] === 'r') && ((useLines || (useLines = true, buildSegs())), lineHits(box, 1, { only: 'res' }))) { stale = true; return false; } const V = viewOf(it, S); if (!settle || it.live || it.point || /^(focus|z:)/.test(it.key) || !(it.ax >= V.x0 && it.ax <= V.x1 && it.ay >= V.y0 && it.ay <= V.y1) || (within(box, V) && !obstacles.some((o) => !o.zone && hits(box, o)))) { placed.push(box); out.push(it); return true; }   // (carried onto a resistor's zigzag (its teeth widen in world units as the map shrinks): solved again at rest. Circuit slide 4 on a phone: "IVC" on the liver's)
          replace = { x: it.x, y: it.y, ax: it.ax, ay: it.ay, dir: it.dir, leader: it.leader, onVessel: it.onVessel, box }; if (!useLines) { useLines = true; buildSegs(); } if (it.cls === 'lane') { it.ax = ax0; it.ay = ay0; }   // (a lane's caption is tried at each spot along its lane its caller gives, then on its lane)
        }
      }
      // (Not a rescued slot's width (pi -1, below): the reading takes its usual spots at its own width again.)
      const wRes = prev && !prev.drop && prev.pi !== -1 && it.w <= prev.w && it.w > prev.w - 28 ? prev.w : it.w;
      // A turned caption (see renderBlock) takes up a box as wide as its text is tall.
      const probe = it.rot ? { ...it, w: it.h, h: it.w } : { ...it, w: wRes };
      let best = null;
      if (keepSlots && prev && !prev.drop && prev.pi >= from && prev.pi < to && it.w <= prev.w + 0.5 && it.h <= prev.h + 0.5 && !it.point && !/^focus/.test(it.key)) {
        // (Its point too: the one on the figure it was solved at, while that is still on the stage. A vessel's label is anchored at the middle of
        // the part in view, which slides along the vessel as the view pans; held there, the label would move against the figure.)
        // (Not a step's number: its point is its vessel's, fixed, and the same key on the next slide names another vessel; held at the old
        // point it stood by the last slide's vessel.)
        const V = viewOf(it, S), [kx, ky] = worldToLocal(prev.wx, prev.wy), atOld = it.cls !== 'fx-step' && kx >= V.x0 && kx <= V.x1 && ky >= V.y0 && ky <= V.y1;
        const ax = atOld ? kx : it.ax, ay = atOld ? ky : it.ay;
        const r = rectOf({ ...probe, x: ax + prev.dx, y: ay + prev.dy });
        if (within(r, V) && !placed.some((p) => hits(r, p)) && !obstacles.some((o) => hits(r, o)) && !callouts.some((b) => hits(r, b))
          && !(creditBox && hits(r, creditBox)) && !(useLines && (!prev.onv ? lineHits(r, 0, true) : lineHits(r, 1, { only: 'res' }))) && !passes[prev.pi]?.skip && !(passes[prev.pi]?.unblocked && blocked(r)) && !(passes[prev.pi]?.offOrgans && onOrgans(passes[prev.pi].offOrgans, r))) {
          best = { cost: 0, dx: prev.dx, dy: prev.dy, r, dir: prev.dir, pi: prev.pi, leader: prev.leader };
          if (atOld) { it.ax = ax; it.ay = ay; if (prev.au != null) it.au = prev.au; }
        }
      }
      if (!best) passes.forEach((ps, pi) => pi >= from && pi < to && (ps.dirs || dirs).forEach((dir, i) => {
        // (A spot on the grid around the station is tried once, not per direction, and only until one is free: the grid runs nearest
        // first. The spot the label held is still tried, so it can hold it.)
        if (ps.skip || (ps.at && (i || (best && !(prev && prev.pi === pi))))) return;
        let dx, dy;
        if (ps.at) { dx = ps.at[0] - probe.w / 2; dy = ps.at[1] - probe.h / 2; } else { const o = offset(dir, probe, ps.gap); dx = o[0]; dy = o[1]; }
        if (ps.shift) { dx += ps.shift[0]; dy += ps.shift[1]; }   // (a slot slid up or down from its compass spot)
        let r = rectOf({ ...probe, x: it.ax + dx, y: it.ay + dy });
        // (A stent's point past the stage's edge, or the slide's mark beside it, is tried where the last pass would pull it back to, so it
        // is never pushed onto its neighbour.)
        if (it.point || (dop.all && /^focus/.test(it.key))) {
          const cx = Math.max(ptView.x0 - r.x0, Math.min(0, ptView.x1 - r.x1)), cy = Math.max(ptView.y0 - r.y0, Math.min(0, ptView.y1 - r.y1));
          if (cx || cy) { dx += cx; dy += cy; r = rectOf({ ...probe, x: it.ax + dx, y: it.ay + dy }); }
        }
        if (placed.some((p) => !(it.point && p.probe) && (ps.callGap && p.call ? hits(r, { ...p, x0: p.x0 - ps.callGap, x1: p.x1 + ps.callGap }) : hits(r, p)) && !(ps.overZones && p.zone))) return;
        if (ps.credit && creditBox && hits(r, creditBox)) return;
        // (A stent's point, or the slide's mark beside it, never takes a spot a card covers, where it would only hide: the next spot that
        // shows is better.)
        // (It keeps 4 px off a card: with 10, a point near the card's edge was slid off its dot's line: Review 16 Oct.)
        if ((it.point || (dop.all && /^focus/.test(it.key))) && obstacles.some((o) => !(it.point && o.probe) && hits(r, { x0: o.x0 - 4, y0: o.y0 - 4, x1: o.x1 + 4, y1: o.y1 + 4 }))) return;
        // (A long leader may not run through another label: only boxes clear of its own station count, by 8 px, so a clamp's arrows at
        // the station do not.)
        if (ps.uncrossed && placed.some((p) => !(it.point && p.probe) && (p.lab || !(it.ax >= p.x0 - 8 && it.ax <= p.x1 + 8 && it.ay >= p.y0 - 8 && it.ay <= p.y1 + 8)) && crosses(it.ax, it.ay, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, p))) return;
        // (...nor, the slide's mark's, pass within 18 px of another of the stent's dots: Review 15 Oct.)
        if (markDots && /^focus/.test(it.key) && !ps.loose) {
          const le = leaderEnd(r, it.ax, it.ay), ex = le.x - it.ax, ey = le.y - it.ay, L2 = ex * ex + ey * ey || 1;
          if (markDots.some(([px, py]) => { if (Math.hypot(px - it.ax, py - it.ay) < 4) return false; const t = Math.max(0, Math.min(1, ((px - it.ax) * ex + (py - it.ay) * ey) / L2)); return Math.hypot(px - it.ax - ex * t, py - it.ay - ey * t) < 18; })) return;
          const L = Math.sqrt(L2);
          for (let u = 7; ps.clear && u < L && markArrows.length; u += 1.5) {
            const x = it.ax + (ex * u) / L, y = it.ay + (ey * u) / L;
            for (let ti = 0; ti < markArrows.length; ti++) if (triDist(x, y, markArrows[ti]) < 6) return;
          }
        }
        // (The mark moves with the point sampled, so it holds its spot only while its dot stays put.)
        const moved = dop.all && /^focus/.test(it.key) && prev && Math.hypot(...worldToLocal(prev.wx, prev.wy).map((v, j) => v - (j ? it.ay : it.ax))) > 2;
        const V = viewOf(it, S), inside = within(r, V), held = !moved && !!prev && !prev.drop && prev.dir === dir && prev.pi === pi && (inside || !within({ x0: it.ax, y0: it.ay, x1: it.ax, y1: it.ay }, V));
        // (edge: px inside the stage it keeps; avoid: drawn shapes (an organ, a lit outline) it keeps off, by pad px.)
        if ((ps.edge && !insideBy(r, V, ps.edge)) || (ps.avoid && !clearOf(r, ps.avoid, ps.pad ?? 0))) return;
        if ((ps.unblocked && blocked(r)) || (ps.offOrgans && onOrgans(ps.offOrgans, r)) || (replace && (!inside || carded(r)))) return;
        // (fans: the targets of a numbered step's group, V10. Each of its leaders, from its target to the box, runs through no label and
        // crosses no other leader, a group's own included.)
        if (ps.fans) {
          const segs = out.flatMap((o) => [...(o.leader && !o.live ? [(() => { const e = leaderEnd(rectOf(o), o.ax, o.ay); return [o.ax, o.ay, e.x, e.y]; })()] : []), ...(o.fans || []).map(([fx, fy]) => { const e = leaderEnd(rectOf(o), fx, fy); return [fx, fy, e.x, e.y]; })]);
          if (ps.fans.some(([fx, fy]) => {
            const le = leaderEnd(r, fx, fy), L = Math.hypot(le.x - fx, le.y - fy);
            if (segs.some((sg) => segsCross(sg, [fx, fy, le.x, le.y]))) return true;
            for (let u = 6; u < L - 2; u += 3) {
              const px = fx + ((le.x - fx) * u) / L, py = fy + ((le.y - fy) * u) / L;
              if (placed.some((p) => !(it.point && p.probe) && !p.dot && hits({ x0: px - 3, y0: py - 3, x1: px + 3, y1: py + 3 }, p))) return true;
            }
            return false;
          })) return;
        }
        const om = ps.strict ? 10 : 0;
        if ((ps.inView && !inside) || ((ps.inView || ps.strict) && obstacles.some((o) => !(o.zone && ps.strict) && !(it.point && o.probe) && hits(r, { x0: o.x0 - om, y0: o.y0 - om, x1: o.x1 + om, y1: o.y1 + om })))) return;   // (in the free space: inside the stage, 10 px from any card, the margin a hidden label needs to show again)
        let onLine = 0;
        if (useLines) {
          // (A clear pass only asks whether any vessel is in the way. The slide's mark beside a stent's three points keeps 2 px off every
          // vessel as drawn (3 with a pixel to spare; a point's callout 4, its halo included), and its leader 2 px off every vessel but
          // its stent: Review 15-16 Oct.)
          const mk = dop.all && /^focus/.test(it.key);
          if (ps.clear) { if (ps.pad != null ? lineHits(r, ps.pad, true) : mk ? lineHits(r, 3, true) : it.point ? lineHits(r, 4, true) : held ? lineHits(r, 0, true) : lineHits(r, 3, true)) return; } else onLine = lineHits(r, 0);
          if (mk && dop.id && lineHits(r, 3, { only: dop.id })) return; if (lineHits(r, 1, { only: 'res' })) return;   // (and in any pass, 2 px off its own stent as drawn, and never on a resistor's zigzag: "Azygos 0.2" on the collaterals', 13 Nov)
          // (A leader that may cross at most lmax vessels besides the one it starts on, 3 px off each: 0, one that runs clear.)
          if (ps.lmax != null) { const le = leaderEnd(r, it.ax, it.ay); if (leaderVesselHits(live.segIdx, it.ax, it.ay, le.x, le.y, 3, ps.lmax < 1) > ps.lmax) return; }
          // (A reading out on a ring is joined to its station by a leader: one that would cross a vessel or a label is no use.)
          // A reading moving off its vessel or rescued (passes from 3 on, and the rescue's: strict) keeps 4 px from every other
          // reading, off every other station's ring and every other reading's leader, and its own leader, if it is far enough out
          // to have one, crosses no reading or leader.
          if (ps.inView || ps.strict) {
            // (Nor on another station's ring, where that reading's leader starts.)
            // (A rescued one keeps off its own ring too.)
            if ((ps.strict || ps.resc) && rings.some((o) => (o !== it || ps.resc) && o.ax > r.x0 - 7 && o.ax < r.x1 + 7 && o.ay > r.y0 - 7 && o.ay < r.y1 + 7)) return;
            // (No reading sits on another's leader: 2 px clear of its halo.)
            const others = out.filter((o) => o !== it && o.leader && !o.live).map((o) => { const e = leaderEnd(rectOf(o), o.ax, o.ay); return [o.ax, o.ay, e.x, e.y]; });
            if (others.some((sg) => segHitsBox({ x0: sg[0], y0: sg[1], x1: sg[2], y1: sg[3] }, r, ps.strict || ps.resc ? 5 : 2))) return;
            if (ps.inView && placed.some((p) => !(it.point && p.probe) && !p.dot && hits(r, { x0: p.x0 - 4, y0: p.y0 - 4, x1: p.x1 + 4, y1: p.y1 + 4 }))) return;
            const le = leaderEnd(r, it.ax, it.ay), ex = le.x, ey = le.y, L = Math.hypot(ex - it.ax, ey - it.ay);
            const gapPx = Math.hypot(Math.max(r.x0 - it.ax, 0, it.ax - r.x1), Math.max(r.y0 - it.ay, 0, it.ay - r.y1));
            if (gapPx > 10) {
              if (others.some((sg) => segsCross(sg, [it.ax, it.ay, ex, ey]))) return;
              // (A zone title's column that the station itself stands at the edge of (VAR beside "Portal veins" on a phone) does not
              // stop its leader: it starts there.)
              // (Nor does any box the point stands in, short of a label's: a stent's narrowing arrows ring the site the "Narrowing" tag
              // names, and its leader starts inside their box.)
              const own = (p) => (p.zone || !p.lab) && it.ax > p.x0 - 4 && it.ax < p.x1 + 4 && it.ay > p.y0 - 4 && it.ay < p.y1 + 4;
              for (let u = ps.strict || ps.resc ? 0 : 8, q = ps.strict || ps.resc ? 3 : 2; u < L - 2; u += ps.strict || ps.resc ? 2 : 3) {   // (rescued: from its station's ring on, the ring too kept clear)
                const px = it.ax + ((ex - it.ax) * u) / L, py = it.ay + ((ey - it.ay) * u) / L, pr = { x0: px - q, y0: py - q, x1: px + q, y1: py + q };
                if ((ps.ring === 'clean' && lineHits(pr, 0)) || placed.some((p) => !(it.point && p.probe) && !p.dot && !own(p) && hits(pr, p))) return;   // (a leader may pass a station's dot, never a reading)
              }
            }
          } else if (circuit && it.key.startsWith('n:')) {
            // (Beside its station too (passes 0-2), a Circuit reading sits on no other reading's leader, and where it stands far
            // enough out to take a leader (past 18 px: see below), its leader runs through no reading: on a sideways iPad, IVC's
            // leader had run through RA's.)
            const others = out.filter((o) => o !== it && o.leader && !o.live).map((o) => { const e = leaderEnd(rectOf(o), o.ax, o.ay); return { x0: o.ax, y0: o.ay, x1: e.x, y1: e.y }; });
            if (others.some((sg) => segHitsBox(sg, r, 2))) return;
            const gapPx = Math.hypot(Math.max(r.x0 - it.ax, 0, it.ax - r.x1), Math.max(r.y0 - it.ay, 0, it.ay - r.y1));
            if (gapPx > 18) {
              const le = leaderEnd(r, it.ax, it.ay), L = Math.hypot(le.x - it.ax, le.y - it.ay);
              for (let u = 8; u < L - 2; u += 3) {
                const px = it.ax + ((le.x - it.ax) * u) / L, py = it.ay + ((le.y - it.ay) * u) / L;
                if (placed.some((p) => !(it.point && p.probe) && !p.dot && !p.zone && hits({ x0: px - 2, y0: py - 2, x1: px + 2, y1: py + 2 }, p))) return;
              }
            }
          }
          if (ps.clear && mk && ps.lead) {
            const le = leaderEnd(r, it.ax, it.ay), L = Math.hypot(le.x - it.ax, le.y - it.ay);
            for (let u = 12; u < L; u += 3) {
              const x = it.ax + ((le.x - it.ax) * u) / L, y = it.ay + ((le.y - it.ay) * u) / L;
              if (lineHits({ x0: x, y0: y, x1: x, y1: y }, 2, dop.id)) return;
            }
          }
        }
        // (A clear pass may share its tier with others, and then the spot nearest its dot wins among them, whatever its direction.)
        // (A stent's point holds its spot only against others of the same pass: a slot it was slid to, while a card opened or the
        // figure moved, never outranks a level one that is free again: Review 16 Oct.)
        const near = ps.tier != null && ps.clear ? Math.hypot((r.x0 + r.x1) / 2 - it.ax, (r.y0 + r.y1) / 2 - it.ay) * 10 : 0;
        const cost = (ps.tier ?? pi) * 1e4 + (inside ? 0 : 2e3) + (ps.clear ? 0 : onLine * 12) + i + near + (ps.bias || 0) - (held ? (ps.clear ? (it.point && it.col ? 5e3 : 1e5) : 4) : 0);
        if (!best || cost < best.cost) best = { cost, dx, dy, r, dir, pi, leader: ps.leader, onLine: ps.clear ? 0 : onLine };
      }));
      // (Placed again by itself mid-gesture: a spot that would want what only a whole solve does (shortening, a rescue, moving off a
      // vessel, room clear of a slide's callout) has the readings solved again together, as before.)
      // (Mohammad, 4 Nov: "when there is no room we shouldn't have labels covering like portal vein and structures completely".) A station's label that could only be
      // placed over a vessel does not cover it: it takes its abbreviation first, then drops its unit and change, and where it still has no room it is left out. A label the
      // reader asked for (selected, or named by a slide) is the exception and keeps its spot.)
      // (Named by a slide: an Anatomy slide shows only the stations it names, but a Circuit slide shows every station, so there only those in
      // presentLabels are. Every reading on a Circuit slide had been let keep a spot over a vessel: slide 4 on a Mac, "Spleen 12.0" on the colon's vein.)
      const named = st.presenting && (!circuit || (Array.isArray(st.presentLabels) && st.presentLabels.includes(it.node)));
      if (best && best.onLine > 0 && it.key.startsWith('n:') && !it.sel && !named && !(it.node === 'HA' && it.abbr)) best = null;   // (the hepatic artery always shows: once it reads "HA" it keeps its spot)
      if (reslot && (!best || lineHits(best.r, 2) || callouts.some((b) => hits(best.r, b)))) { stale = true; return false; }
      if (replace && !best) { if (it.cls === 'lane' && dirs[0] !== 'C') return false; it.ax = replace.ax; it.ay = replace.ay; it.x = replace.x; it.y = replace.y; it.dir = replace.dir; it.leader = replace.leader; it.onVessel = replace.onVessel; placed.push(replace.box); out.push(it); return true; }
      if (!best) {
        // No room with the value: try it without its units and change, then the name alone (up to maxShort), before giving the label up.
        // (A reading with no unit left to drop goes straight to the name alone: where that is more than this round allows (a rescue's
        // maxShort 1), it is put back whole, so the rescue's later tries, the one line among them, still keep its number.)
        if (it.canShort && (it.short || 0) < maxShort) {
          const whole = { lines: it.lines, w: it.w, h: it.h, short: it.short, abbr: it.abbr };
          if (shortenItem(it)) { if ((it.short || 0) <= maxShort) return placeMulti(it, dirs, passes, from, to, final, maxShort); Object.assign(it, whole); }
        }
        if (!final) return false;
        nextSol.set(it.key, { drop: true }); return false;
      }
      // The text hugs the station side of its reserved box.
      const slack = it.rot ? 0 : wRes - it.w, dir = best.dir;
      it.x = it.ax + best.dx + (dir.includes('W') ? slack : dir.includes('E') ? 0 : slack / 2);
      it.y = it.ay + best.dy; it.dir = dir;
      // A leader line shows only when the label sits clearly away from its station (label-place.js needsLeader: on past 12 px, off below 8),
      // measured from its box. Decided once here and kept in the solution: paintLeaders draws one exactly when it is set, a carry takes it
      // as it was, and label-gl.js draws what the layout asked for with no test of its own (one leader rule, 5 Nov 2026 review #7). A
      // pass's own leader flag no longer overrides it.
      const lead = needsLeader(it.cls === 'organ', boxGap(best.r, it.ax, it.ay), prev?.lead);
      it.leader = lead;
      localWorldXY(it.ax, it.ay);
      nextSol.set(it.key, { wx: LW_XY[0], wy: LW_XY[1], dx: best.dx, dy: best.dy, dir, pi: best.pi, w: wRes, h: it.h, leader: it.leader, lead, short: it.short || 0, abbr: !!it.abbr, au: it.au, vh: it.vw > 0 ? it.vw / 2 : null });
      it._r = best.r; placed.push(best.r); out.push(it);
      // (Within 3 px of a vessel it takes the solid halo, as a solved one does.)
      if (reslot || replace) { it.onVessel = lineHits(best.r, 3) > 0; nextSol.get(it.key).onv = it.onVessel; if (reslot) live.reslotted = true; }
      return true;
    };

    if (!circuit) {
      // ── Anatomy ──
      // The FibroScan probe is screen furniture on the liver: no label sits on it or on the reading shown on its body.
      const tip = scanTipLocal();
      if (tip) placed.push({ x0: tip.tx - 74, y0: tip.y - 74, x1: tip.tx + 12, y1: tip.y + 12 });   // the probe and the reading on its body
      const lvl = st.labelLevel || 'key', zoomed = zoomedIn();
      // A presenter slide names exactly the stations it talks about (store.presentLabels).
      const pres = st.presenting && Array.isArray(st.presentLabels) ? st.presentLabels : null;
      const show = new Set(pres || (lvl === 'none' ? [] : lvl === 'key' && !zoomed ? [...KEY_NODES, ...flagged(f)] : CHIP_NODES));
      // No varices, no varices callout: in a healthy patient the node's pressure is just the balance
      // between the coronary vein and the azygos, and a "varices" label on it would mislead.
      if (!hasVarices('VAR', f)) show.delete('VAR');
      if (!pres && lvl !== 'none' && hasVarices('GV', f)) show.add('GV');
      // The hepatic artery is named at every size and zoom (a plain label, not an optional one): it takes a leader out to the upper right
      // where it has no room beside its vessel, and it is the last of the named stations to give way.
      if (!pres && lvl !== 'none') show.add('HA');
      if (pres && !hasVarices('GV', f)) show.delete('GV');
      // Key, at the home framing on a wide screen: the other major stations too, but only where one fits
      // beside its vessel without a leader (see `minor` below); a phone keeps to the key ones.
      const minor = new Set(!pres && lvl === 'key' && !zoomed && !compact ? CHIP_NODES.filter((id) => !show.has(id) && id !== 'VAR') : []);
      for (const id of minor) show.add(id);
      if (st.selection?.type === 'node') { show.add(st.selection.id); minor.delete(st.selection.id); }
      const [lx] = worldToLocal(ATLAS_COLUMNS[0], 500), [rx] = worldToLocal(ATLAS_COLUMNS[1], 500);
      const colW = 150;
      // Pressures sit beside their vessels at every size (no margin columns with long leaders).
      const atlas = false;
      const items = [];
      for (const id of show) {
        if (!NODE_POS[id] || labelHidden(id)) continue;
        const { ax, ay, mid, w: vw } = labelAnchor(id, t);
        const it = nodeItem(id, f, atlas ? 'atlas' : 'inline', compact);
        it.ax = ax; it.ay = ay; it.vw = mid ? vw * live.CTM.sc : 0; it.pri = it.sel ? 100 : minor.has(id) ? 1 : ANAT_PRI[id] || 5;
        it.minor = minor.has(id);
        if (it.minor) it.canShort = false;   // an optional label shows whole or not at all
        it.side = ATLAS_LABELS[id]?.side || (NODE_POS[id][0][0] < 700 ? 'L' : 'R');
        items.push(it);
      }
      // A TIPS or DIPS shunt gets its own callout: the velocity through it (cm/s), as Doppler reads it.
      for (const sid of ['TIPS', 'DIPS']) {
        if (stentReady(sid, f) && EI[sid] >= 0 && dop.all && dop.id === sid && geo[sid]?.cur?.length > 1) {
          // (A slide that reads the stent at its three points calls out all three, each at its own third, in a column beside their
          // dots, before the slide's mark, which finds its place around them.)
          const vw = labelAnchor(sid, t).w;
          for (const point of ['proximal', 'mid', 'distal']) {
            const [ax, ay] = worldToLocal(...pointAt(geo[sid].cur, STENT_SITES[point]));
            const it = velItem(sid, f, point);
            it.ax = ax; it.ay = ay; it.vw = vw * live.CTM.sc; it.pri = 8; it.side = 'R'; it.col = live.ptSide; it.colGap = colGap(sid);
            it.canShort = false; it.point = true;   // (a point's name without its number says nothing: whole, or not at all)
            // (Where a point finds no room in its column, the narrowing's jet tries the spots farther out first.)
            const pp = f.viewParams || st.params;
            it.jet = (pp.stenosis?.[sid] || 0) > 0 && stentSite(pp, sid) === point;
            it.later = false;
            items.push(it);
          }
        } else if (stentReady(sid, f) && EI[sid] >= 0) {
          let { ax, ay, mid, w: vw } = labelAnchor(sid, t);
          // (While the Doppler samples this stent, the callout points at the third its gate reads, where the stent glows.)
          if (dop.id === sid && dop.seg && geo[sid]?.cur?.length > 1) [ax, ay] = worldToLocal(...pointAt(geo[sid].cur, STENT_SITES[dop.seg]));
          // (Its stent out of the frame, no callout: "TIPS 80 cm/s" stood alone at the stomach view's edge, Ten years 16, 31 Oct.)
          if (!within({ x0: ax, y0: ay, x1: ax, y1: ay }, view)) continue;
          const it = velItem(sid, f);
          it.ax = ax; it.ay = ay; it.vw = mid ? vw * live.CTM.sc : 0; it.pri = 9; it.side = 'R';
          items.push(it);
        }
      }
      // Zoomed in, the other stations in view get their pressure too (hepatic veins, portal branches,
      // the left sinusoids...), each only where it stands clear of the labels already there, so they
      // appear as the zoom makes room and the overview stays uncluttered.
      if (!atlas && !pres && lvl !== 'none' && (live.vt.k > 1.35 || zoomed || lvl === 'all')) {
        const room = compact ? 64 : 80;
        for (const id of ANAT_EXTRA) {
          if (show.has(id) || !NODE_POS[id] || !(NI[id] >= 0) || labelHidden(id)) continue;
          const { ax, ay, mid, w: vw } = labelAnchor(id, t);
          if (items.some((o) => Math.hypot(o.ax - ax, o.ay - ay) < room)) continue;
          const it = nodeItem(id, f, 'inline', compact);
          it.ax = ax; it.ay = ay; it.vw = mid ? vw * live.CTM.sc : 0; it.pri = ANAT_PRI[id] || 4;
          it.side = ATLAS_LABELS[id]?.side || (NODE_POS[id][0][0] < 700 ? 'L' : 'R');
          items.push(it);
        }
      }
      if (atlas) {
        for (const side of ['L', 'R']) {
          const col = items.filter((it) => it.side === side).sort((a, b) => a.ay - b.ay);
          const cx0 = side === 'L' ? lx - colW : rx, cx1 = side === 'L' ? lx : rx + colW;
          let top = 10, bottom = H - 10;
          for (const b of blockers) {
            if (b.x1 < cx0 || b.x0 > cx1) continue;
            if (b.y0 < H / 2) top = Math.max(top, b.y1 + 8); else bottom = Math.min(bottom, b.y0 - 8);
          }
          const gap = 8;
          const need = col.reduce((sum, it) => sum + it.h + gap, 0);
          if (bottom - top < need) { top = 10; bottom = Math.max(top + need, H - 10); }
          for (let i = 0; i < col.length; i++) col[i].y = Math.max(col[i].ay - col[i].h / 2, i ? col[i - 1].y + col[i - 1].h + gap : top);
          for (let i = col.length - 1; i >= 0; i--) col[i].y = Math.min(col[i].y, i < col.length - 1 ? col[i + 1].y - col[i].h - gap : bottom - col[i].h);
          const elbow = side === 'L' ? lx + 12 : rx - 12;
          for (const it of col) {
            it.x = side === 'L' ? lx - 8 - it.w : rx + 8;
            // A floating card over the column hides the labels it covers rather than sitting on them.
            if (blockers.some((b) => hits(rectOf(it), b))) continue;
            it.align = side === 'L' ? 'end' : 'start';
            // Left column: the line starts at the label's left edge, under the text, so it never ends at the right.
            const ly = side === 'L' ? it.y + it.h : it.y + Math.min(it.h / 2, 16);
            const x0 = side === 'L' ? it.x : rx + 4;
            leaders.push({ k: 'al:' + it.key, tag: 'path', at: { class: `leader${it.sel ? ' hl' : ''}`, d: `M${x0.toFixed(1)} ${ly.toFixed(1)} L${elbow.toFixed(1)} ${ly.toFixed(1)} L${it.ax.toFixed(1)} ${it.ay.toFixed(1)}` } },
              { k: 'ad:' + it.key, tag: 'circle', at: { class: 'leader-dot', cx: it.ax.toFixed(1), cy: it.ay.toFixed(1), r: '2.4' } });
            it.fixedLead = true;   // (its leader is drawn here, from where it stands now: it never glides away from it)
            placed.push(rectOf(it));
            out.push(it);
          }
        }
      } else {
        // Inline: dots on the anatomy, labels nearby with short leaders, most important first.
        buildLines();
        if (solve) spreadDots(items, (it) => (it.key.startsWith('n:') && it.vw > 0 && geo[LABEL_VESSEL[it.node]]?.cur?.length > 1 ? geo[LABEL_VESSEL[it.node]].cur : null), (P, u) => { const m = arcMid(P, u); return worldToLocal(m[0], m[1]); });
        for (const it of items) placed.push({ x0: it.ax - 4, y0: it.ay - 4, x1: it.ax + 4, y1: it.ay + 4 });
        for (const it of items.sort((a, b) => b.pri - a.pri)) {
          if (solve && sliceOver()) yield;
          it.align = 'start';
          if (it.later) { later.push(it); continue; }
          // (A stent's point: in its column, level with its dot (Review 15 Oct), a little farther out first (16 px at most) to clear its
          // narrowing's clamp, off the vessels where it can be; slid up or down only where its neighbour leaves no room level.)
          const COL = [0, -6, 6, -12, 12, -18, 18];
          // (The jet's dot has its narrowing's arrows beside it: level just past the arrow before sliding off its dot's line.)
          const level = [...new Set([it.colGap, 12, 14, 16, ...(it.jet ? [20, 24, 28, 32, 36, 40] : [])].filter((g) => g >= it.colGap))];
          const lv = (credit) => [true, false].flatMap((clear) => level.map((gap) => ({ gap, leader: true, clear, credit })));
          const sh = (credit) => [true, false].flatMap((clear) => COL.slice(1).map((y) => ({ gap: it.colGap, leader: true, clear, credit, shift: [0, y] })));
          if (it.point && it.col && placeMulti(it, [it.col], [...lv(true), ...lv(false), ...sh(true), ...sh(false)])) continue;
          const dirs = it.side === 'L' ? ['NW', 'W', 'SW', 'N', 'S', 'NE', 'E', 'SE'] : ['NE', 'E', 'SE', 'N', 'S', 'NW', 'W', 'SW'];
          // Prefer a spot touching no vessel at all, near first; only then accept one that crosses a vessel.
          const near = 8 + it.vw / 2, far = 24 + it.vw / 2;
          if (it.minor) { placeMulti(it, dirs, [{ gap: near, leader: false, clear: true }]); continue; }
          // (One a slide names or the reader selected keeps a spot on a vessel when it has none clear: first, farther out on a leader. "SMV" on Variceal bleed 5, 11 Nov.)
          const wide = it.sel || st.presenting ? [40, 58, 76].map((g) => ({ gap: g + it.vw / 2, leader: true, clear: true })) : [];
          if (placeMulti(it, dirs, [{ gap: near, leader: false, clear: true }, { gap: far, leader: true, clear: true }, ...wide, { gap: near, leader: false }, { gap: far, leader: true }])) continue;
          // (A sampled stent point, or the jet, with no room by its third tries again farther out, once the slide's mark has its place.)
          if (it.point) { later.unshift(it); continue; }
          if (it.sel) { place(it, ['C'], 0, false) || (out.push(Object.assign(it, { x: it.ax + 8, y: it.ay - it.h / 2 })), true); }
        }
      }
      // Organ names: fixed in their organ, dropped where a label needs the room. Where a drawn vessel runs under the spot (STOMACH under the
      // splenic vein, the K of KIDNEY on the colon's vein, iPad portrait Ascites 5), the name takes the nearest other spot of its own organ
      // that no vessel touches (organ-names.js), and only with none left stays where it was; the vessels never move.
      if (st.layers.labels && t < 0.3) {
        for (const [txt, x, y] of ORGAN_LABELS) {
          if (solve && sliceOver()) yield;
          const [ax, ay] = worldToLocal(x, y);
          const up = txt.toUpperCase();
          // (RIGHT ATRIUM stands on two lines: on one it is wider than the heart's room between the cava that runs up its left side and the
          // varices at its right, so it lay on the cava whatever its spot. Mac and iPhone, decompensated cirrhosis, 1 Nov.)
          const it = { key: 'o:' + txt, cls: 'organ', lines: up.split(NAME_BREAK.has(txt) ? ' ' : '\u0000').map((t) => [{ t, size: 9.5, weight: 600, cls: 'lb-organ', track: 0.06 }]), align: 'middle', padX: 2, padY: 1, ax, ay };
          it.w = Math.max(...it.lines.map(lineW)); it.h = it.lines.reduce((a, l) => a + LINE_H(l), 0);
          // (Nor under a card or on a leader, left off if all its spots are: SPLEEN under the Mac's Tests card, PV's leader through LIVER, 11 Nov. And off other
          // organs first where it can be, never left off for it: RIGHT ATRIUM on the esophagus, the same day; organ-names.js onOtherOrgan.)
          const spot = { gap: 0, leader: false, clear: true, unblocked: true }, off = { ...spot, offOrgans: txt }; const at = nameSpots(txt).map(([sx, sy]) => { const [bx, by] = worldToLocal(sx, sy); return [bx - ax, by - ay, Math.hypot(sx - x, sy - y) <= OFF_NEAR]; }); placeMulti(it, ['C'], [off, ...at.filter((a) => a[2]).map((a) => ({ ...off, at: a })), spot, ...at.map((a) => ({ ...spot, at: a })), { gap: 0, leader: false, unblocked: true }]);
        }
      }
    } else {
      // ── Circuit: zone titles, then stations by priority, then resistances ──
      // Turned upright, a direction given on the map (N, E, ...) points somewhere else on the screen.
      const turned = live.rotU > 0.5, dirOf = (d) => (turned ? TURN_DIR[d] : d);
      // (A title keeps the place it had if it still fits in the visible part of its band (sticky: a small pan never nudges it); else it takes the
      // middle of that part. Kept as a screen coordinate along the band's axis (c) with the band's own key.)
      const zoneKeep = (key, lo, hi, mid, tn, other) => { const p = zoneStick.get(key), q = p ? worldToLocal(p[0], p[1]) : null, k = q ? q[tn ? 1 : 0] : NaN, c = k >= lo && k <= hi ? k : Math.min(hi, Math.max(lo, mid)); if (!dry) zoneStick.set(key, localToWorld(tn ? other : c, tn ? c : other)); return c; };   // (read, never written, by a dry solve: the live one keeps its own)
      for (const [txt, x0, x1] of CIRCUIT_ZONES) {
        const [a, ay0] = worldToLocal(x0, 60), [b, by] = worldToLocal(x1, 60);
        // The liver's and the heart's titles open their cards (there is no organ to click in the circuit).
        const organ = { 'Liver · sinusoids': 'liver', Heart: 'heart' }[txt];
        const it = { key: 'z:' + txt, cls: organ ? 'zonecap link' : 'zonecap', lines: [[{ t: txt, size: 10.5, weight: 650, cls: 'lb-zone' }]], align: 'middle', padX: 2, padY: 2 };
        if (organ) {
          it.onClick = () => onSelect({ type: 'organ', id: organ });
          it.label = `${txt}: open its card`; it.hit = true;
          it.sel = st.selection?.type === 'organ' && st.selection.id === organ;
        }
        it.w = lineW(it.lines[0]); it.h = LINE_H(it.lines[0]);
        // A zone title is a plain figure label (option C, zone-titles-recs.md): world-anchored at the spot the layout gives it, so it moves
        // rigidly with the figure through every pan, pinch and zoom. It is placed again, over the visible part of its band, only at rest.
        const zoneAt = (x, y) => { it.ax = x; it.ay = y; const bx = it.rot ? it.h : it.w, by2 = it.rot ? it.w : it.h; it.x = x - bx / 2; it.y = y - by2 / 2; return rectOf({ ...it, x: it.x, y: it.y, w: bx, h: by2 }); };
        // A narrow zone (a zoomed-out circuit, or large text) takes a shorter title rather than none; one that
        // still does not fit its band is left out rather than run into its neighbour's.
        // (At rest the title is set over the VISIBLE part of its band, not the band's whole width: a band panned half off the screen, or
        // zoomed past it, keeps its title in view. The full or short text is picked by that visible width. Option C, zone-titles-recs.md.)
        const v0 = turned ? Math.max(Math.min(ay0, by), 6) : Math.max(a, 6), v1 = turned ? Math.min(Math.max(ay0, by), H - 6) : Math.min(b, W - 6);
        const span = v1 - v0;
        for (const alt of ZONE_SHORT[txt] || []) {
          if (span > it.w + 6) break;
          it.lines = [[{ ...it.lines[0][0], t: alt }]]; it.w = lineW(it.lines[0]);
        }
        if (turned) {
          if (span <= it.w + 6) continue;
          // Upright, a zone is a horizontal band: its title runs up the map's left edge (text turned to read
          // bottom to top), centred on the band.
          it.rot = true;
          // (On a slide the readings keep out of the whole title column, not just the title's box: 17 Oct design review.)
          if (solve) { const zb = zoneAt((a + b) / 2, (v0 + v1) / 2); placed.push(st.presenting ? { x0: -1e4, y0: Math.min(ay0, by), x1: zb.x1 + 2, y1: Math.max(ay0, by), zone: true } : { ...zb, zone: true }); }
          const zx = Math.max(it.h / 2 + 8, (a + b) / 2), zlo = v0 + it.w / 2 + 3, zhi = v1 - it.w / 2 - 3;
          const zc = zoneKeep(it.key, zlo, zhi, (v0 + v1) / 2, true, zx), zr = zoneAt(zx, zc);
          // (It may slide along its band: see the last pass.)
          it._slide = { at: (c) => zoneAt(zx, c), c: zc, lo: zlo, hi: zhi };
          if (within(zr, { x0: 6, y0: 6, x1: W - 6, y1: H - 6 }) && !blockers.some((o) => hits(zr, o)) && !callouts.some((o) => hits(zr, o))) { out.push(it); obstacles.push({ ...zr, zone: true, key: it.key }); it._zr = zr; }
          continue;
        }
        if (b - a > it.w + 6) {
          // (On a slide the readings keep out of the whole header row over the zone, not just the title's box: a reading and its
          // leader had crossed "Portal veins", and the resistances had sat in the row: 17 Oct design review.)
          if (solve) { const zb = zoneAt((v0 + v1) / 2, by), y1 = Math.max(zb.y1, zoneAt((v0 + v1) / 2, Math.max(14, by)).y1); placed.push(st.presenting ? { x0: a, y0: -1e4, x1: b, y1: y1 + 2, zone: true } : { ...zb, zone: true }); }
          const zy = Math.max(14, by), zlo = v0 + it.w / 2 + 3, zhi = v1 - it.w / 2 - 3;
          const zc = zoneKeep(it.key, zlo, zhi, (v0 + v1) / 2, false, zy), zr = zoneAt(zc, zy);
          it._slide = { at: (c) => zoneAt(c, zy), c: zc, lo: zlo, hi: zhi };
          if (within(zr, { x0: 6, y0: 6, x1: W - 6, y1: H - 6 }) && !blockers.some((o) => hits(zr, o)) && !callouts.some((o) => hits(zr, o))) { out.push(it); obstacles.push({ ...zr, zone: true, key: it.key }); it._zr = zr; }
        }
      }
      // The resistors' readings (label-gl figure labels at their zigzags, resItem): placed straight; their boxes are kept clear by the stations after.
      // (Where its spot puts it on a vessel, a reading slides up or down off the vessels, the nearest clear spot within 120 px, up first; the shift is solved once and kept in the solution, so a carry holds it. Circuit slide 4 on a sideways iPad: "R liver ×1.0 / vs healthy
      // liver" between the two lobes lay over the outer sinusoids of both and the hepatic artery's branches; it now stands above the liver.)
      if (sites.list && t >= 0.5) {
        for (const k of ['rGut', 'rColl', 'rLiver']) {
          if (!sites.list.includes(k)) continue;
          const it = resItem(k);
          if (!it || !resPlace(it)) continue;
          const prev = prevSol.get(it.key);
          let dy = prev && !prev.drop ? prev.dy : 0, dx = prev && !prev.drop ? prev.dx || 0 : 0;
          if (solve) {
            buildLines();
            const free = (d, e = 0) => { const r = rectOf({ ...it, x: it.x + e, y: it.y + d }); return within(r, view) && !lineHits(r, 2, true) && !placed.some((p) => hits(r, p)) && !obstacles.some((o) => hits(r, o)); };   // alloc-rare: a resistor's shift, solved only in a solve (the view settled, a reading changed), never in a carried frame
            const cost = (d, e) => { const r = rectOf({ ...it, x: it.x + e, y: it.y + d }); return !within(r, view) ? 1e9 : (obstacles.some((o) => !o.zone && hits(r, o)) ? 1e5 : 0) + lineHits(r, 2, { only: 'res' }) * 1e4 + (placed.some((p) => hits(r, p)) || obstacles.some((o) => o.zone && hits(r, o)) ? 1e3 : 0) + lineHits(r, 4, it.key === 'r:rColl' ? 'C1b' : it.key === 'r:rGut' ? 'A_SMA' : true) * 10 + lineHits(r, 2) + Math.hypot(d, e) / 100; };   // (no clear spot: off the cards, the zigzags, the labels and every vessel but its own lane, 4 px clear, nearest first: "×6.5" had touched the TIPS on a phone)   // alloc-rare: only in a solve
            if (!free(dy, dx)) { dy = 0; dx = 0; let ok = free(0); if (!ok) for (let d = 3; d <= 120; d += 3) { if (free(-d)) { dy = -d; ok = true; break; } if (free(d)) { dy = d; ok = true; break; } } if (!ok) for (let e = -80, c = cost(0, 0); e <= 80; e += 4) for (let d = -120; d <= 120; d += 3) { const q = cost(d, e); if (q < c) { c = q; dy = d; dx = e; } } }   // (no clear spot: the place within 80 px across and 120 up or down that is under no card, then off every zigzag, then off labels, then on the fewest vessels; 13 Nov 2026, an upright phone's "R collaterals ×6.5" had stayed on the liver's two zigzags)
            nextSol.set(it.key, { res: true, dir: 'res', pi: 0, dx, dy });   // alloc-rare: a resistor's shift, solved only in a solve (the view settled, a reading changed), never in a carried frame
          }
          it.x += dx; it.y += dy;
          out.push(it); placed.push({ ...rectOf(it), res: true });
        }
      }
      buildLines();
      // (A station's ring, 4 px round, stays clear of every reading's halo by 2 px. The halo widens with the text (styles/app.css,
      // #labels .lb.inline.bare text: 4 px a unit of --lbk; 7 px on a vessel, .on-vessel), and only the 3 px beside the words
      // (padX) leave less room than the line's own space above and below them, so the room kept to either side of the ring grows
      // with it: on an upright iPad, LHV's halo had covered its ring.)
      const ringR = 5, ringRX = 3.5 + Math.max(2 * live.labelK, 3.5);
      // The liver's stations show when zoomed in on it or when one is selected (there is no box to open them).
      const open = liverExpanded();
      const nodes = [], flagC = flagged(f);
      for (const n of NODES) {
        if (!hasDot.has(n.id) || !CIRCUIT_LABELS[n.id]) continue;
        if (!live.nodeVisible(n.id) || labelHidden(n.id)) continue;
        if ((n.id === 'VAR' || n.id === 'GV') && !hasVarices(n.id, f)) continue;
        if (!open && n.id !== 'HA' && LIVER_INNER.has(n.id) && !(st.selection?.type === 'node' && st.selection.id === n.id)) continue;   // (the hepatic artery's caption stays: it sits between the lobes, not in a lobe)
        // Levels of detail: none shows only a selected station; key, zoomed out, the major ones (and the flagged).
        const isSel = st.selection?.type === 'node' && st.selection.id === n.id, lvlC = st.labelLevel || 'key';
        if (!isSel && (lvlC === 'none' || (lvlC === 'key' && !zoomedIn() && CIRCUIT_LABELS[n.id].pri < (compact ? 8 : 5) && n.id !== 'HA' && !flagC.includes(n.id)))) continue;
        const { ax, ay, mid, tan, w: vw } = labelAnchor(n.id, t);
        // The station dot stays where it is; a callout on a vessel also keeps clear of its own marker.
        const [sx, sy] = worldToLocal(...nodePos(n.id, t));
        placed.push({ x0: sx - ringRX, y0: sy - ringR, x1: sx + ringRX, y1: sy + ringR, dot: true }); ringXY.push([sx, sy, ringRX]);
        if (mid) placed.push({ x0: ax - 4, y0: ay - 4, x1: ax + 4, y1: ay + 4, dot: true });
        const it = nodeItem(n.id, f, 'station', compact);
        it.align = 'middle'; it.ax = ax; it.ay = ay; it.mid = mid; it.tan = tan; it.vw = vw * live.CTM.sc; it.pri = it.sel ? 100 : CIRCUIT_LABELS[n.id].pri;
        nodes.push(it);
      }
      // (Every other dot keeps clear of the readings too: a station whose reading is left out at this level of detail, or has none, still
      // has its dot, and a reading had sat on it: the colon bed's, under the spleen's.)
      const labelled = new Set(nodes.map((it) => it.node));
      for (const d of bareDots(NODES.filter((n) => hasDot.has(n.id)), { labelled, shown: live.nodeVisible, at: (id) => worldToLocal(...nodePos(id, t)), scale: live.CTM.sc, minX: ringRX, minY: ringR })) {
        placed.push({ ...d.box, dot: true }); ringXY.push([d.x, d.y, ringRX]);
      }
      // Stations by priority, each beside its station: level with it first (beside a vertical run, over a horizontal one).
      // A minor station gives way rather than sit on a vessel or crowd its neighbours.
      const plan = nodes.sort((a, b) => b.pri - a.pri).map((it) => {
        const pref = it.mid ? (Math.abs(it.tan[0]) >= Math.abs(it.tan[1]) ? ['N', 'S'] : ['E', 'W']) : CIRCUIT_LABELS[it.node].dirs.map(dirOf);
        const dirs = [...pref, ...['N', 'S', 'E', 'W', 'NE', 'SE', 'NW', 'SW'].filter((d) => !pref.includes(d))];
        const half = it.vw / 2, minor = it.pri <= 4 && !it.sel, fine = [7, 12, 18, 24, 30, 36].map((g) => g + half), ring = [44, 54, 64, 76].map((g) => g + half);
        // (passes 0-2: beside the station, as always; from 3 on: a reading on a vessel looks for a clear spot, below)
        const passes = [...[7, 18, 30].map((g) => ({ gap: g + half, clear: minor })),
          ...fine.map((gap) => ({ gap, dirs: pref, clear: true, inView: true })), ...fine.map((gap) => ({ gap, clear: true, inView: true })),
          ...ring.map((gap) => ({ gap, dirs: RING_DIRS, ring: 'clean', clear: true, inView: true })), ...ring.map((gap) => ({ gap, dirs: RING_DIRS, ring: 'any', clear: true, inView: true }))].map((ps) => ({ ...ps, leader: false }));
        return { it, dirs, passes, half };
      });
      rings = plan.map(({ it }) => it);
      // As they were (v2): each beside its station, shortened, or given up, where there is no room.
      for (const { it, dirs, passes, half } of plan) {
        if (solve && sliceOver()) yield;
        it._full = { lines: it.lines, w: it.w, h: it.h, short: it.short, abbr: it.abbr };   // (its whole form, for the rescue below)
        if (!placeMulti(it, dirs, passes, 0, 3) && it.sel) place(it, dirs, 40 + half, true);
      }
      // Then a reading that sits on a vessel moves to the nearest clear spot, the others staying where they are: beside its
      // station, else a little further out with a short leader (one that crosses no vessel first, then one that crosses no
      // label or leader); with no clear spot near it stays where it was, its halo solid and no flow arrowhead under it
      // (onVessel: renderBlock, noChevBoxes). (A nearer spot on a vessel used to beat a clear one a little further out:
      // "7.8 mmHg" ran into the portal trunk, "4.1" sat on the liver's zigzag, and RA's "mmHg" on its branch.)
      // (A spot outside the free space counts too: the reading is later pulled back into view, onto whatever is there.)
      // (All of them leave their spots first, so a reading moving out is not blocked by one that is about to move too.)
      // (So does one under a card, which the card would hide.)
      const onVessel = solve && useLines ? plan.filter(({ it }) => it._r && out.includes(it) && (lineHits(it._r, 2) || !within(it._r, view) || obstacles.some((o) => !o.zone && hits(it._r, o)))) : [];
      // (Each keeps its old spot reserved until it finds a new one, so one that finds none keeps it.)
      for (const { it } of onVessel) { it._keep = { x: it.x, y: it.y, dir: it.dir, leader: it.leader, sol: nextSol.get(it.key) }; it._r.old = true; out.splice(out.indexOf(it), 1); }
      for (const { it, dirs, passes } of onVessel) {
        if (solve && sliceOver()) yield;
        const r0 = it._r;
        placed.splice(placed.indexOf(r0), 1);
        if (placeMulti(it, dirs, passes, 3, passes.length, false)) continue;
        const k = it._keep;
        const onv = lineHits(r0, 2) > 0;
        Object.assign(it, { x: k.x, y: k.y, dir: k.dir, leader: k.leader, _r: r0, onVessel: onv }); nextSol.set(it.key, { ...k.sol, onv }); placed.push(r0); out.push(it);
      }
      // Last, a reading given up or left without its value is rescued, the others staying where they are: whole (else without
      // its units and change) in the nearest free spot further out, with a leader; else a little further out than its usual
      // spots, on a vessel if it must (with the solid halo); else over a zone's title, which then moves along its band or,
      // with no room there, gives way (see the last pass). Kept 12 px from a callout's row (a lone "Splenic v." 7 px after
      // "R liver ×1.0" read as one line). With no room at all it stays as it was.
      // (Readings already hidden or without their value leave their spots first, as on a vessel above, so a rescue's leader may
      // cross where they were: RA under a phone's data card has room only past IVC's name. One of them that then finds no room
      // goes back to its spot where that is still free, else is given up: it showed no value there either.)
      const rescueOf = [];
      const segOf = (o) => { const e = leaderEnd(rectOf(o), o.ax, o.ay); return { x0: o.ax, y0: o.ay, x1: e.x, y1: e.y }; };
      const free = (r) => !placed.some((p) => !p.dot && hits(r, p)) && !out.some((o) => o.leader && !o.live && segHitsBox(segOf(o), r, 2));
      if (solve && useLines) for (const e of plan) {
        const { it } = e, shown = out.includes(it);
        // (Also one under a card or callout, which would hide it.)
        // (And one over a station's ring, its own included: a halo there hides the ring.)
        // (And one outside the free space, which the pull below would set down on whatever is there.)
        const atRisk = shown && it._r && (!within(it._r, view) || obstacles.some((o) => !o.zone && hits(it._r, o)) || rings.some((o) => o.ax > it._r.x0 - 7 && o.ax < it._r.x1 + 7 && o.ay > it._r.y0 - 7 && o.ay < it._r.y1 + 7));
        if (it.sel || (shown && (it.short || 0) < 2 && !atRisk) || !it._full || (it._full.short || 0) >= 2) continue;
        const was = { lines: it.lines, w: it.w, h: it.h, short: it.short, abbr: it.abbr, x: it.x, y: it.y, dir: it.dir, leader: it.leader, _r: it._r, sol: nextSol.get(it.key) };
        const early = shown && (it.short || 0) >= 2;   // (a name without its value: off its spot from the start)
        if (early) { out.splice(out.indexOf(it), 1); placed.splice(placed.indexOf(it._r), 1); }
        rescueOf.push({ e, was, shown, early });
      }
      for (const { e: { it, dirs, passes, half }, was, shown, early } of rescueOf) {
        if (solve && sliceOver()) yield;
        if (shown && !early) { out.splice(out.indexOf(it), 1); placed.splice(placed.indexOf(it._r), 1); }
        // (Then further out still, on rings 90 to 118 px round: a station at the edge of the free space, RA under a phone's data card,
        // has no clear spot nearer.)
        const outer = [90, 104, 118].map((g) => g + half);
        const far = [...passes.slice(3), ...outer.map((gap) => ({ gap, dirs: RING_DIRS, ring: 'clean', clear: true, inView: true })), ...outer.map((gap) => ({ gap, dirs: RING_DIRS, ring: 'any', clear: true, inView: true }))].map((ps) => ({ ...ps, callGap: 12, resc: true }));
        const near = [...passes.slice(0, 3), { gap: passes[2].gap + 10 }, { gap: passes[2].gap + 18 }].map((ps) => ({ ...ps, clear: false, strict: true, inView: true, callGap: 12, resc: true }));
        // (Then out on the same rings over a vessel, with the solid halo: on a phone the free space round VAR is all vessels, and
        // nearer than the rings there is no room.)
        const farOn = far.map((ps) => ({ ...ps, clear: false, ring: 'any' }));
        // (Each try is a pass over every spot of its rings: the solve yields between tries, so a slice of the change between the views is never
        // one whole rescue. Entering the Circuit zoomed out, most readings come here, and a rescue in one go held each frame of the change for
        // tens of ms: 5 fps on the way into the Circuit, 60 on the way out. Same tries, same order, same answer.)
        let ok = false;
        const tries1 = [far, near, farOn, near.map((ps) => ({ ...ps, overZones: true }))];
        for (let ti = 0; ti < tries1.length && !ok; ti++) {
          if (solve && sliceOver()) yield;
          const R = tries1[ti];
          Object.assign(it, { lines: it._full.lines, w: it._full.w, h: it._full.h, short: it._full.short, abbr: it._full.abbr, one: false });   // (whole again for each try)
          ok = placeMulti(it, dirs, R, 0, R.length, false, 1);
        }
        if (!ok) {
          const tries2 = [far, near, farOn, far.map((ps) => ({ ...ps, overZones: true })), near.map((ps) => ({ ...ps, overZones: true }))];
          for (let sh = 0; sh < 2 && !ok; sh++) for (let ti = 0; ti < tries2.length && !ok; ti++) {
            if (solve && sliceOver()) yield;
            const R = tries2[ti];
            // (Else on one line, name then value (then without its units): a station at the top of the free space, RA under a phone's
            // data card, has room beside it only for a reading one line tall.)
            Object.assign(it, { lines: it._full.lines, w: it._full.w, h: it._full.h, short: it._full.short, abbr: it._full.abbr, one: false });
            if (sh && !((it.short || 0) < 1 && shortenItem(it, false) && it.short === 1)) continue;
            oneLine(it);
            ok = !!it.one && placeMulti(it, [...dirs, 'EL', 'WL'], R, 0, R.length, false, it.short || 0);
          }
        }
        // (Its slot is not one of the usual passes': marked so the next layout does not take it for one held there.)
        if (ok) { it.onVessel = lineHits(it._r, 2) > 0; const sol = nextSol.get(it.key); if (sol) { sol.onv = it.onVessel; sol.pi = -1; sol.one = !!it.one; } continue; }
        Object.assign(it, { lines: was.lines, w: was.w, h: was.h, short: was.short, abbr: was.abbr, x: was.x, y: was.y, dir: was.dir, leader: was.leader, _r: was._r, one: false });
        if (was.sol) nextSol.set(it.key, was.sol);
        if (shown && (!early || free(was._r))) { out.push(it); placed.push(was._r); } else if (shown) nextSol.set(it.key, { drop: true });
      }
      // Any reading left touching a vessel (within 3 px) takes the solid halo.
      if (solve && useLines) for (const { it } of plan) if (out.includes(it) && it._r && !it.onVessel && lineHits(it._r, 3)) { it.onVessel = true; const sol = nextSol.get(it.key); if (sol) sol.onv = true; }
      // (And any left on a station's ring is marked, so the next frames carry it rather than solve again: see placeMulti.)
      if (solve) for (const { it } of plan) { const sol = nextSol.get(it.key); if (sol && !sol.drop && out.includes(it) && placed.some((p) => p.dot && p !== it._r && hits(rectOf(it), p))) sol.dot = true; }
      // One unit rule for the whole circuit (17 Oct design review): where any reading had to drop its unit for room, every reading
      // shows its number alone ("Gut bed 21.1" had stood beside "SMV 18.7 mmHg"). Each one only narrows, toward its station, so it
      // runs into nothing it had cleared; its slot keeps the width it reserved, so the next frames carry it unchanged.
      if (solve) {
        const shown = plan.map(({ it }) => it).filter((it) => out.includes(it) && it.canShort);
        const bare = (l) => l.some((r) => r.cls === 'lb-val') && l.some((r, i) => i && r.cls !== 'lb-val' && r.cls !== 'lb-name');
        if (shown.some((it) => it.short === 1)) for (const it of shown) {
          if (it.short) continue;
          const w0 = it.w;
          if (it.one && bare(it.lines[0])) { it.lines = [it.lines[0].filter((r, i) => !i || r.cls === 'lb-val')]; it.w = lineW(it.lines[0]); it.short = 1; }
          else if (!it.one && it.lines.length === 2 && bare([it.lines[0][0], ...it.lines[1]])) shortenItem(it, false);
          else continue;
          const dw = w0 - it.w;
          it.x += it.dir?.includes('W') ? dw : it.dir?.includes('E') ? 0 : dw / 2;
          const sol = nextSol.get(it.key);
          if (sol && !sol.drop) sol.short = 1;
        }
      }
      // Tidy (3 Nov 2026, "leaders crossing vessels"): a reading whose leader runs through a vessel, whose leader is long, or whose words
      // sit on a vessel moves to the best spot within 120 px that has none of those faults: the least leader first, clear of every
      // other reading, ring, card and leader, its own leader through no reading, no leader and no vessel but the one it starts on.
      // A reading hung from the middle of its vessel may also slide its dot along the vessel (a fifth or so each way, a few px of cost
      // for each step), so its words can stand in the room beside another stretch of it. A reading with no better spot stays where it is.
      // (Solved once and recorded, like the rescue above, so a carry holds it.)
      if (solve && useLines) {
        const TIDY_LONG = 60, TIDY_GAPS = [7, 12, 18, 25, 33, 42, 52, 64, 78, 94, 112], TIDY_R = [24, 33, 42, 52, 64, 78, 94, 112], SLIDE = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82, 0.1, 0.9];   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
        const boxAt = (it, x, y) => ({ x0: x - it.padX, y0: y - it.padY, x1: x + it.w + it.padX, y1: y + it.h + it.padY });   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
        // (How many readings' words and other leaders a reading's leader, from (ax, ay) to its words in `r`, runs through; `lines`: the others' leaders.)
        const runsThrough = (it, le, ax, ay, lines, r) => {   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
          let n = 0;
          for (const p of placed) if (!p.dot && p !== it._r && !(ax >= p.x0 - 8 && ax <= p.x1 + 8 && ay >= p.y0 - 8 && ay <= p.y1 + 8) && crosses(ax, ay, le.x, le.y, p)) n++;
          for (const sg of lines) if (Math.hypot(sg[0] - ax, sg[1] - ay) > 4 && segsCross(sg, [ax, ay, le.x, le.y])) n++;   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
          for (const sg of lines) if (segHitsBox({ x0: sg[0], y0: sg[1], x1: sg[2], y1: sg[3] }, r, 1)) n++;   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
          return n;
        };
        const faults = (it, r, pass, ax, ay, lines) => {   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
          const le = leaderEnd(leadRectOf(it, r.x0 + it.padX, r.y0 + it.padY, ax, ay), ax, ay, 2), len = Math.hypot(le.x - ax, le.y - ay), drawn = len > 10;
          const vh = drawn ? leaderVesselHits(live.segIdx, ax, ay, le.x, le.y, 1) : 0, onv = lineHits(r, 2) > 0, xr = drawn ? runsThrough(it, le, ax, ay, lines, r) : 0;
          return { len, drawn, vh, onv, xr, le, cost: (drawn ? len : 0) + Math.min(vh, 3) * 600 + xr * 1500 + (onv ? 300 : 0) + pass };   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
        };
        const othersLeaders = (it) => out.filter((o) => o !== it && o.key.startsWith('n:') && !o.live && !o.hide).map((o) => { const e = leaderEnd(leadRectOf(o, o.x, o.y, o.ax, o.ay), o.ax, o.ay, 2); return Math.hypot(e.x - o.ax, e.y - o.ay) > 10 ? [o.ax, o.ay, e.x, e.y] : null; }).filter(Boolean);   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
        for (const { it, dirs } of [...plan, ...plan]) {   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
          if (!out.includes(it) || !it._r) continue;
          if (solve && sliceOver()) yield;
          const lines = othersLeaders(it), now = faults(it, it._r, 0, it.ax, it.ay, lines);
          if (!now.vh && !now.onv && !now.xr && now.len <= TIDY_LONG) continue;
          const old = it._r, was = { ax: it.ax, ay: it.ay, sol: nextSol.get(it.key) };   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
          placed.splice(placed.indexOf(old), 1);
          const dotAt = it.mid ? placed.find((p) => p.dot && p.x0 === it.ax - 4 && p.y1 === it.ay + 4 && p.x1 === it.ax + 4) : null;   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
          if (dotAt) placed.splice(placed.indexOf(dotAt), 1);
          const eid = it.mid ? LABEL_VESSEL[it.node] : null, P = eid && geo[eid]?.cur;
          const anchors = P?.length > 1 ? SLIDE.map((u) => { if (u === 0.5) return [it.ax, it.ay, 0, it.au ?? 0.5]; const m = arcMid(P, u), [x, y] = worldToLocal(m[0], m[1]); return [x, y, Math.abs(u - 0.5) * 50, u]; }) : [[it.ax, it.ay, 0, it.au ?? 0.5]];   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
          let best = null;
          for (const [ax, ay, slide, au] of anchors) {
            if (solve && sliceOver()) yield;   // (each of the reading's eleven anchors is 216 spots: a slice ends between them)
            const dot = it.mid ? { x0: ax - 4, y0: ay - 4, x1: ax + 4, y1: ay + 4 } : null;   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
            let rank = 0;
            const tryAt = (dir, gap, pass) => {   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
              const [dx, dy] = offset(dir, it, gap), r = boxAt(it, ax + dx, ay + dy);
              if (!within(r, view) || lineHits(r, 1, { only: 'res' })) return;   // (never onto a resistor's zigzag)
              // (The box tests first: they are cheap and reject most spots, and faults() walks every leader and vessel. The same spots pass.)
              if (dot && hits(r, dot)) return;
              if (placed.some((p) => (p.dot ? hits(r, p) : hits(r, { x0: p.x0 - 3, y0: p.y0 - 3, x1: p.x1 + 3, y1: p.y1 + 3 })))) return;   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
              if (obstacles.some((o) => !o.zone && hits(r, { x0: o.x0 - 10, y0: o.y0 - 10, x1: o.x1 + 10, y1: o.y1 + 10 }))) return;   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
              if (lines.some((sg) => segHitsBox({ x0: sg[0], y0: sg[1], x1: sg[2], y1: sg[3] }, r, 3))) return;   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
              const f = faults(it, r, pass + slide, ax, ay, lines);
              // (Words clear of the vessels now are never moved onto one: the tidy had traded a leader through vessels for words on a vessel,
              // which the rule for a station's spot forbids outright. Circuit slide 4 on a sideways iPad: the spleen's reading, rescued out on
              // a leader across four vessels, was tidied onto the colon's vein beside its station.)
              if ((f.onv && !now.onv) || f.cost >= now.cost - 1 || (best && f.cost >= best.f.cost)) return;
              best = { f, dx, dy, dir, r, ax, ay, au, dot };   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
            };
            for (const gap of TIDY_GAPS) for (const dir of ['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW']) tryAt(dir, gap + it.vw / 2, (rank++ % 8) * 0.01 + dirs.indexOf(dir) * 2);   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
            for (const gap of TIDY_R) for (const dir of RING_DIRS) tryAt(dir, gap + it.vw / 2, 8 + (rank++ % 16) * 0.01);
          }
          if (!best) { placed.push(old); if (dotAt) placed.push(dotAt); continue; }
          it.ax = best.ax; it.ay = best.ay; it.au = best.au;   // (au: how far along its vessel the point slid, 0.5 its middle: what the GPU pins the label to)
          // (Its leader by the one rule, from its new box, as placeMulti decides it.)
          const lead = needsLeader(false, boxGap(best.r, it.ax, it.ay), was.sol?.lead);
          it.x = it.ax + best.dx; it.y = it.ay + best.dy; it.dir = best.dir; it.leader = lead; it.onVessel = best.f.onv; it._r = best.r;
          placed.push(best.r);
          if (best.dot) placed.push({ ...best.dot, dot: true });   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
          const sol = was.sol;
          if (sol) { const [wx, wy] = localToWorld(it.ax, it.ay); nextSol.set(it.key, { ...sol, wx, wy, dx: best.dx, dy: best.dy, dir: best.dir, pi: -1, w: it.w, h: it.h, leader: lead, lead, onv: best.f.onv, dot: false, au: best.au }); }   // alloc-rare: the tidy runs in a solve (the view settled, a reading changed), never in a carried frame
        }
      }
      // Collateral and shunt lanes, captioned along their run.
      for (const [id, cap] of Object.entries(LANE_CAPTIONS)) {
        if (solve && sliceOver()) yield;
        const x = E[id];
        if (!x?.vis || x.ghost || labelHidden(id)) continue;
        // (A lane with a resistor's zigzag on it (the collaterals' on C1b, the gut's on A_SMA) is captioned in two lines, short enough to fit beside the zigzag along it: 13 Nov 2026, an upright phone's "Esophageal route → azygos" was longer than the lane on either side of its zigzag and ran through it.)
        const zig = !!sites.list && t >= 0.5 && sites.list.includes(id === 'C1b' ? 'rColl' : id === 'A_SMA' ? 'rGut' : '-'), cut = !zig ? -1 : cap.includes(' → ') ? cap.indexOf(' → ') : cap.lastIndexOf(' ', cap.length / 2), ln = (s) => [{ t: s, size: 10, weight: 550, cls: 'lb-lane' }];
        const it = { key: 'lane:' + id, cls: 'lane', lines: cut > 0 ? [ln(cap.slice(0, cut)), ln(cap.slice(cut + 1))] : [ln(cap)], align: 'middle', padX: 2, padY: 1, ax: 0, ay: 0 }; it.w = Math.max(...it.lines.map(lineW)); it.h = it.lines.reduce((a, l) => a + LINE_H(l), 0);
        // Turned upright, a lane that runs up the screen is captioned along it (text turned to read bottom to top), beside it.
        const at = (u) => { const [lx, ly] = pointAt(geo[id].cur, u); [it.ax, it.ay] = worldToLocal(lx, ly); };
        let vertical = false;
        if (turned) {
          at(laneU[id]);
          const [bx, by] = worldToLocal(...pointAt(geo[id].cur, Math.min(1, laneU[id] + 0.03)));
          vertical = Math.abs(by - it.ay) > Math.abs(bx - it.ax) * 1.2;
        }
        if (vertical) it.rot = true;
        const dirs = vertical ? ['E', 'W'] : [dirOf('N'), dirOf('S')], gaps = [3 + (x.width || 4) / 2, 12 + (x.width || 4) / 2];
        const spots = [laneU[id], ...(laneAlt[id] || [])];   // (Beside the lane at the spots no other vessel touches; failing that, on its own lane, never on another line.)
        const bx = (u) => { at(u); const hw = (it.rot ? it.h : it.w) / 2 + 2, hh = (it.rot ? it.w : it.h) / 2 + 2; return { x0: it.ax - hw, y0: it.ay - hh, x1: it.ax + hw, y1: it.ay + hh }; }; const ok = (u, skip) => { const b = bx(u); return within(b, view) && !obstacles.some((o) => !o.zone && hits(b, o)) && !lineHits(b, 1, skip); };   // alloc-rare: a lane's fallback, solved only in a solve (else on its lane, at the first spot in view and off the cards, clear of every other line, else of a resistor's zigzag) (none: left out, as a station's reading with no room is)
        if (!spots.some((u) => { at(u); return place(it, dirs, gaps, false, true); }) && (buildLines(), !(solve ? [...spots.filter((u) => ok(u, id)), ...spots.filter((u) => ok(u, { only: 'res' })), ...(lineHits(bx(laneU[id]), 1, { only: 'res' }) ? [] : [laneU[id]])] : [laneU[id]]).some((u) => { at(u); return place(it, ['C'], 0, false); })) && solve) nextSol.set(it.key, { drop: true });
      }
    }
    // (Beside a stent's column of three points the slide's mark keeps off the whole column, the gaps between its callouts included, so
    // the three read as one block in order.)
    if (solve && ptSide) {
      const col = out.filter((o) => o.point).map(rectOf);
      if (col.length > 1) placed.push({ x0: Math.min(...col.map((r) => r.x0)), y0: Math.min(...col.map((r) => r.y0)), x1: Math.max(...col.map((r) => r.x1)), y1: Math.max(...col.map((r) => r.y1)) });
    }
    // Boxes round what a procedure draws, in the stage's px (see the step callout below): the catheter's route as far as the tip has
    // gone, as wide as its balloon, and the vessel the step names, as wide as it is drawn or will be.
    const pinAvoid = (id) => {
      const out = [], box = (q, R) => {
        const [x, y] = worldToLocal(q[0], q[1]), [x2, y2] = worldToLocal(q[0] + R, q[1]), w = Math.hypot(x2 - x, y2 - y) + 3;
        out.push({ x0: x - w, y0: y - w, x1: x + w, y1: y + w });
      };
      const r = cath.st && cath.route, P = geo[id]?.cur;
      if (r) for (let j = 0; j < r.pts.length; j += 2) if (r.cum[j] >= procIn(r)) box(r.pts[j], (r.rad[j] || 2) * 1.4);
      const R = Math.max(E[id]?.width || 0, id === 'TIPS' ? cathRadOf('PVH_R', 0.5) * 1.6 : 0, 4) * 0.7;
      if (P?.length) for (let j = 0; j <= 48; j++) box(pointAt(P, j / 48), R);
      return out;
    };
    // Focus callout
    const foc = st.focus;
    for (const [i, m] of (foc ? foc.marks || [foc] : []).entries()) {
      if (solve && sliceOver()) yield;
      // (ghost: a procedure's step may name a vessel it has not opened yet, the tract before the stent; f: where along it.)
      if (!m.edges?.length || !E[m.edges[0]] || !(E[m.edges[0]].vis || (m.ghost && geo[m.edges[0]]?.cur?.length)) || (i && !m.label)) continue;
      // (A mark on one third of a stent points at that third.)
      const segAt = m.f ?? (m.seg && isStent(EDGES[EI[m.edges[0]]]) ? STENT_SITES[stentGate(m.seg, f.viewParams || st.params, m.edges[0])] : 0.5);
      const [x, y] = pointAt(geo[m.edges[0]].cur, segAt);
      const [ax, ay] = worldToLocal(x, y);
      const key = i || m.kind ? `focus${i}${m.kind || ''}` : 'focus', cls = 'focus' + (m.kind ? ` k-${m.kind}` : '');
      // (A mark whose words carry live readings, deck visuals V8: its words come from the slide's callouts, filled as the model moves.)
      const lk = `${m.edges[0]}|${m.kind || 'block'}`, lv = live.fx?.live?.[lk];
      // (A procedure's step callout: its number in bold, then its word, both in Inter's cut so the GPU draws it pinned: proc-anim.js stepMark.)
      const words = m.num ? [{ t: m.num, size: 11.5, weight: 800, cls: 'lb-focus' }, { t: m.word, size: 11.5, weight: 650, cls: 'lb-focus', gap: 5 }] : [{ t: m.label || 'Here', size: 11.5, weight: 650, cls: 'lb-focus' }];   // alloc-rare: only as the marks are laid out
      const it = lv ? fxPill(key, lv, cls, m.kind === 'note') : { key, cls, lines: [words], align: 'start', bg: true, padX: 8, padY: 4 };
      Object.assign(it, { mk: m.kind, ax, ay });
      if (lv) { it.src = ['fx', key]; fxBuild.set(key, () => live.fx?.live?.[lk] && fxPill(key, live.fx.live[lk], cls, m.kind === 'note')); }
      else { it.w = lineW(it.lines[0]); it.h = LINE_H(it.lines[0]); }
      // (A free mark stands by itself, with no leader: it names a group of vessels, so a line to the first would single it out.)
      const gap = 18 + (E[m.edges[0]].width || 4);
      // (Beside a stent called out at all three points the mark may stand a little farther off, on a leader that crosses no label.)
      // (...off the vessels first, even where that takes the credit's corner (the credit finds another), then clear of the credit;
      // each spot also nudged 8 or 16 px each way, so a pill that would touch a vessel by a pixel or two slides clear; its leader crosses
      // no label, the "60 %" included, and at each reach it first tries for a leader over no vessel (past the dot's own junction): a
      // short leader beats a long clean one; within a reach, the spot nearest the dot, nudged or not: Review 15 Oct.)
      const NUDGE = [[0, 0], [-8, 0], [0, 8], [8, 0], [0, -8], [-16, 0], [0, 16], [16, 0], [0, -16]];
      // (Where no such spot is off the vessels, any spot within 150 px that is, nearest first, before one over a vessel: Review 16 Oct.)
      const reach = (clear) => [true, false].flatMap((credit) => [gap, gap + 20, gap + 52, gap + 84, gap + 120].flatMap((g) => (clear ? [true, false] : [false]).map((lead) => ({ gap: g, leader: true, uncrossed: true, clear, lead, credit }))));
      const passes = dop.all && [...reach(true), { grid: true }, ...reach(false)].flatMap((ps, tier) => (ps.grid ? MARK_GRID.map((at) => ({ at, gap: 0, leader: true, uncrossed: true, clear: true, tier })) : NUDGE.map((shift) => ({ ...ps, shift, tier }))));
      // (A mark with live readings (package F) keeps its side as its numbers and the vessels under it change: its side first, a little
      // farther out if need be, before it tries another.)
      // (So does a treatment's step callout (pin): it names the vessel the step works on and stays on its side through the steps.)
      // (A mark on a stent's third, the "Narrowing" tag, is a callout too: its words off every vessel, on a leader that crosses as few
      // as the stent's own surroundings allow (the site stands where the stent joins the hepatic veins), as a step's callout does, so
      // it never stands on the stent or the vein it narrows into: his ask, 8 Nov 2026.)
      const onSite = !!m.seg && isStent(EDGES[EI[m.edges[0]]]), pinned = m.pin || onSite;
      const side = (lv || pinned) && !dop.all && prevSol.get(it.key);
      // (Its pill also touches nothing drawn: 6 px clear of every vessel, a varix's strands and glow included, and 12 px inside the stage.
      // So does a step callout, on a short leader, farther out where the close-up's vessels are wide: his ask, 29 Oct, the
      // "Sclerosant" pill covered the shunt.)
      // (A step callout also keeps off what the procedure draws, which the vessels' lines do not hold: the catheter and its balloon
      // on their route, and the vessel it names, drawn or not yet (the tract and its balloon): his ask, 29 Oct, "Tract dilated" sat on
      // the tract. Where no spot is clear of the vessels too, it still keeps off those.)
      const av = m.pin ? pinAvoid(m.edges[0]) : undefined;
      // (The stent's mark first with a leader over no vessel, then over one, each in turn at growing reach, then wherever its words are clear.)
      const tidy = (lv || pinned) && !dop.all ? [...(onSite ? [0, 1].flatMap((lmax) => [gap, gap + 14, gap + 30, gap + 50, gap + 80, gap + 120, gap + 170, gap + 230].map((g) => ({ gap: g, leader: true, clear: true, inView: true, pad: 6, edge: 12, avoid: av, lmax, uncrossed: true }))) : []),
        ...[gap, gap + 14, gap + 30, gap + 50, ...(pinned ? [gap + 80, gap + 120, gap + 170] : [])].map((g) => ({ gap: g, leader: true, clear: true, inView: true, pad: 6, edge: 12, avoid: av }))]
        .concat(pinned ? [gap, gap + 30, gap + 80, gap + 140].map((g) => ({ gap: g, leader: true, inView: true, pad: 6, edge: 12, avoid: av })) : []) : null;
      if (tidy) buildLines();
      // (Every mark first takes a spot in the free figure, off the cards (a phone's teaching card over the figure's bottom) and the other
      // callouts, before any that may cover one: his ask, 6 Nov 2026, "The shunt callout is covering the card on phone". A round that
      // finds none gives up without shortening or dropping it, and the spots it had before are tried as they were.)
      const free = !dop.all && solve ? [gap, gap + 20, gap + 52, gap + 84, gap + 120, gap + 170].map((g, gi) => ({ gap: g, leader: true, inView: true, bias: gi * 6 })) : null;
      let marked = dop.all ? placeMulti(it, FAR_DIRS, passes) : (tidy && ((side && !side.drop && placeMulti(it, [side.dir], tidy)) || placeMulti(it, ['E', 'W', 'NE', 'SE', 'N', 'S', 'NW', 'SW'], tidy))) || (free && placeMulti(it, ['E', 'W', 'NE', 'SE', 'N', 'S', 'NW', 'SW'], free, 0, free.length, false)) || (side && !side.drop && place(it, [side.dir], [gap, gap + 16, gap + 32], true)) || place(it, ['E', 'W', 'NE', 'SE', 'N', 'S'], gap, true);
      // (A mark that found no spot off the vessels, where the column's "60 %" blocks its way: the "60 %" tries its next spots off the
      // vessels, nearest first, and keeps the first that lets the mark stand clear; failing all, both stay as they were: Review 16 Oct.)
      if (marked && dop.all && clampAlts.length && clampAlts[0].el._box && placed.includes(clampAlts[0].el._box) && !passes[nextSol.get(it.key)?.pi]?.clear) {
        const el = clampAlts[0].el, keep = clampD.get(el._c.id), old = el._box, at = placed.indexOf(old), clearOnly = passes.map((ps) => (ps.clear ? ps : { ...ps, skip: true }));
        placed.pop(); out.pop();
        let freed = false;
        for (const a of clampAlts) {
          clampD.set(el._c.id, { d: a.d, t: a.t }); clampLabelAt(el);
          const b = boxOfEl(el, 6);
          if (!b || placed.some((p, j) => j !== at && hits(b, p))) continue;
          placed[at] = el._box = { ...b, lab: true };
          if (placeMulti(it, FAR_DIRS, clearOnly)) { freed = true; break; }
        }
        if (!freed) { clampD.set(el._c.id, keep); clampLabelAt(el); placed[at] = el._box = old; marked = placeMulti(it, FAR_DIRS, passes); }
      }
      // (Where no spot is off the vessels (a phone with the monitor open), the pill takes the one over the fewest, and a ring in the
      // stage's colour keeps them 2 px off its edge, as the column's halo does for its callouts: Review 16 Oct.)
      // (Nothing of the column hides: a mark with no spot under those rules takes one whose leader may cross a label or pass near
      // another dot, still off the cards, the labels and its own stent: Review 16 Oct.)
      if (!marked && dop.all) marked = placeMulti(it, FAR_DIRS, passes.map((ps) => (ps.clear ? { ...ps, skip: true } : { ...ps, uncrossed: false, loose: true })));
      const sol = marked && dop.all ? nextSol.get(it.key) : null;
      if (sol && solve) sol.ring = !passes[sol.pi]?.clear && useLines && lineHits(rectOf(it), 3) > 0;   // (only where a vessel comes within reach)
      if (sol?.ring) it.cls += ' ring';
      if (marked && !m.free) it.focusLeader = true;
      it.free = !!m.free;
    }
    // Deck visuals, package F (ext-callouts.js): the slide's marks on organs, its calipers' readings and its steps' numbers on the
    // anatomy, its brackets' readings on the circuit. Each keeps off the vessels where it can, as the stations' readings do.
    if (live.fx) {
      // (Each set of spots first in the free space only, inside the stage and off the cards, then anywhere.)
      const k = live.CTM.sc, roomy = (passes) => [...passes.map((ps) => ({ ...ps, inView: true })), ...passes];
      const nearFar = (near) => roomy([{ gap: near, leader: false, clear: true }, { gap: near + 16, leader: true, clear: true }, { gap: near, leader: false }, { gap: near + 16, leader: true }]);
      // A reading's pill touches nothing drawn: 5 px clear of every vessel as drawn (and the lines' boxes), of `avoid` (an organ),
      // and 12 px inside the stage, nearest first, on a short leader once it stands off; only where no such spot is left, the old
      // passes (it never vanishes).
      const clean = (near, avoid, rest) => [...[0, 10, 22, 36, 54, 78].map((d) => ({ gap: near + d, leader: d > 0, clear: true, inView: true, pad: 5, edge: 12, avoid })), ...rest];
      const organBox = (id) => { const a = organAnchor(id, (f.slow?.spleen ?? 11) / 11); if (!a) return null; const [x0, y0] = worldToLocal(a.at[0] - a.half[0], a.at[1] - a.half[1]), [x1, y1] = worldToLocal(a.at[0] + a.half[0], a.at[1] + a.half[1]); return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) }; };
      if (!circuit) live.fx.organs.forEach((m, i) => {
        // A mark on an organ: off the organ's box, on a leader to its middle (the spleen's box grows with it).
        const a = organAnchor(m.organ, (f.slow?.spleen ?? 11) / 11);
        if (!a || (m.organ !== 'ascites' && m.organ !== 'caudate' && !organEls[m.organ]) || (m.organ === 'spleen' && (f.viewParams || st.params)?.splenicRx === 2)) return;
        const key = `focusO${i}`, cls = `focus k-${m.kind}`, it = fxPill(key, m, cls, m.kind === 'note');
        const [ax, ay] = worldToLocal(...a.at), gx = a.half[0] * k + 12, gy = a.half[1] * k + 12, gd = Math.min(gx, gy);
        Object.assign(it, { mk: m.kind, ax, ay, src: ['fx', key] });
        fxBuild.set(key, () => live.fx?.organs?.[i] && fxPill(key, live.fx.organs[i], cls, m.kind === 'note'));
        const passes = roomy([true, false].flatMap((clear) => [0, 24, 56].flatMap((d) => [{ dirs: ['E', 'W'], gap: gx + d, leader: true, clear }, { dirs: ['N', 'S'], gap: gy + d, leader: true, clear }, { dirs: ['NE', 'SE', 'NW', 'SW'], gap: gd + d, leader: true, clear }])));
        const ob = m.organ !== 'ascites' && organBox(m.organ), av = ob ? [ob] : undefined;
        const tidy = [0, 24, 56].flatMap((d) => [{ dirs: ['E', 'W'], gap: gx + d, leader: true, clear: true, inView: true, pad: 5, edge: 12, avoid: av }, { dirs: ['N', 'S'], gap: gy + d, leader: true, clear: true, inView: true, pad: 5, edge: 12, avoid: av }, { dirs: ['NE', 'SE', 'NW', 'SW'], gap: gd + d, leader: true, clear: true, inView: true, pad: 5, edge: 12, avoid: av }]);
        buildLines();
        if (placeMulti(it, [], [...tidy, ...passes])) it.focusLeader = true;
      });
      if (!circuit) live.fx.calipers.forEach((c) => {
        // A caliper's reading at the line's middle, never an end: beside the middle where there is room, square to the line and 5 px
        // clear of it, its ticks, every vessel and the stage's edge (inside an organ it measures, as the spleen's); where there is no
        // room (across a narrow stent), called out on a leader from the middle, off the organ, as the slide's other callouts are.
        const g = caliperAt(c, f);
        if (!g) return;
        const [p0, p1] = [worldToLocal(...g.a), worldToLocal(...g.b)], mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
        const key = 'fxc:' + c.id, it = fxPill(key, c, 'fx-cal', true);
        Object.assign(it, { ax: mid[0], ay: mid[1], src: ['fx', key] });
        fxBuild.set(key, () => { const n = live.fx?.calipers?.find((x) => x.id === c.id); return n && fxPill(key, n, 'fx-cal', true); });
        buildLines();
        const ob = c.organ && organBox(c.organ), av = ob ? [ob] : undefined;
        const beside = [11, 16].map((gap) => ({ gap, leader: false, clear: true, inView: true, pad: 5, edge: 12 }));
        const out = [24, 36, 52, 72, 96].map((gap) => ({ gap, leader: true, clear: true, inView: true, pad: 5, edge: 12, avoid: av }));
        placeMulti(it, besideLine(p0, p1), [...beside, ...out, ...nearFar(24)]);
      });
      if (live.fx.steps) for (const g of stepGroups(live.slideGlow.filter((x) => E[x.id]?.vis), live.fx.steps)) {
        // A step's number by the middle of its vessel (the first of its vessels drawn), or on its organ, lit as its glow lights (V10).
        let ax, ay, near, fans = null;
        if (g.organ) {
          const a = !circuit && organEls[g.organ] && organAnchor(g.organ, (f.slow?.spleen ?? 11) / 11);
          if (!a) continue;
          [ax, ay] = worldToLocal(...a.at); near = 4;
        } else {
          const ids = g.ids.filter((x) => geo[x]?.cur?.length > 1 && !E[x].ghost);
          if (!ids.length) continue;
          // (A vein that fades out of its organ (TIP_FADE) is aimed at in the middle of its solid stretch, not at its middle, which is faint.)
          const mids = ids.map((x) => worldToLocal(...arcMid(geo[x].cur, TIP_FADE[x] > 0.5 ? (1 + TIP_FADE[x]) / 2 : 0.5)));
          // (A group's number stands between its vessels, on a leader to the middle of each: fans.)
          if (g.group && mids.length > 1) { fans = mids; ax = mids.reduce((a, p) => a + p[0], 0) / mids.length; ay = mids.reduce((a, p) => a + p[1], 0) / mids.length; near = 4; }
          else { [ax, ay] = mids[0]; near = Math.max(STEP_LEAD_GAP, 4 + ((E[ids[0]].width || 4) * k) / 2); }   // (2 px off, slide 51's number 5 on a phone had its dot on the chip and no leader: 10 Nov 2026)
        }
        const it = { key: 'fxs:' + g.n, cls: 'fx-step', lines: [[{ t: String(g.n), size: 11.5, weight: 750, cls: 'lb-step' }]], align: 'middle', bg: true, chip: true, padX: 5, padY: 2, ax, ay, pri: 20, delay: g.at, free: true, label: `Step ${g.n}` };   // (free: no dot where it stands on its point, or for a group or an organ: see below)
        it.h = LINE_H(it.lines[0]); it.w = Math.max(lineW(it.lines[0]), it.h - 4);
        buildLines();
        // (A group's spots keep its leaders clear first; where none does, it takes the usual ones, so the number never vanishes.)
        if (fans) it.fans = fans;
        const put = placeMulti(it, ['NE', 'NW', 'SE', 'SW', 'N', 'S', 'E', 'W'], fans ? [...nearFar(near).map((ps) => ({ ...ps, fans })), ...nearFar(24).map((ps) => ({ ...ps, fans })), ...nearFar(near)] : nearFar(near));
        // (A vessel's number that does not stand on its point is joined to it: a leader to a dot on the vessel, however near it stands. Off by
        // 4 to 12 px it had none (needsLeader starts at 12), and read as a badge floating beside the vessel: Mohammad, 5 Nov, "1,2,3,4,5 without
        // leaders". Decided from where it stands, so a solve and a carry agree. A group's number keeps its fan; an organ's, none.)
        if (put && !fans && !g.organ) {
          const r = rectOf(it);
          if (!(it.ax >= r.x0 && it.ax <= r.x1 && it.ay >= r.y0 && it.ay <= r.y1)) {
            it.leader = true; it.free = false;
            const sol = nextSol.get(it.key);
            if (sol && !sol.drop) sol.leader = sol.lead = true;
          }
        }
      }
      if (circuit) live.fx.spans.forEach((sp, i) => {
        // A bracket's reading, under its middle (above it where the stage ends first).
        const at = spanOf(sp.from, sp.to, fxK());
        if (!at) return;
        // (Turned upright on a phone, the bracket runs down the circuit's right side, where one line of words has no room: the reading
        // then takes two, its words over its number.)
        const turned = live.rotU > 0.5, D = (d) => (turned ? TURN_DIR[d] : d), split = turned;
        const [ax, ay] = worldToLocal((at.x0 + at.x1) / 2, at.y), key = 'fxb:' + i, it = fxPill(key, sp, 'fx-span', true, split);
        Object.assign(it, { ax, ay, src: ['fx', key] });
        buildLines();
        fxBuild.set(key, () => live.fx?.spans?.[i] && fxPill(key, live.fx.spans[i], 'fx-span', true, split));
        // Under the bracket on a leader, kept inside the stage 12 px from its edges and off every vessel; then beside it.
        // (Turned upright there is no room beside the bracket: the reading stands past its lower end instead, on a leader.)
        if (turned) { const [ex, ey] = worldToLocal(at.x0, at.y); it.ax = ex; it.ay = ey; }
        const order = turned ? ['S', 'SW', 'SE', 'W', 'E'] : [D('S'), D('SE'), D('SW'), D('E'), D('W')];
        placeMulti(it, order, clean(18, undefined, roomy([{ gap: 18, leader: true, clear: true }, { gap: 40, leader: true, clear: true }, { gap: 18, leader: true }])));
      });
    }
    // A stent's other two points, where they fit around the sampled point's callout and the slide's mark: off the vessels if they can.
    later.sort((a, b) => (b.pri - a.pri) || (b.jet - a.jet));
    for (const it of later) {
      if (solve && sliceOver()) yield;
      const near = 8 + it.vw / 2, far = 24 + it.vw / 2;
      placeMulti(it, ['NE', 'E', 'SE', 'NW', 'W', 'SW', 'N', 'S'], [{ gap: near, leader: false, clear: true }, { gap: far, leader: true, clear: true }, { gap: near, leader: false }, { gap: far, leader: true }])
        || placeMulti(it, FAR_DIRS, [{ gap: far + 12, leader: true, uncrossed: true }, { gap: far + 48, leader: true, uncrossed: true }])
        || placeMulti(it, FAR_DIRS, SLID(far));
    }
    if (stale) return false;
    if (solve && sliceOver()) yield;   // (the page's part below runs whole, in a slice of its own)
    if (solve) { live.labelSolSpare = live.labelSol; live.labelSol = nextSol; }
    if (dry) return true;
    // (The stations' rings, and the readings given up for want of room with where their stations are, for the browser checks:
    // tests/e2e/smoke.mjs. Written at every layout, a carried one too: written only when solved, they lagged behind a pan since,
    // and a reading carried with its ring looked to stand on where the ring had been.)
    const at = new Map(out.concat(rings).map((o) => [o.key, o]));
    const ringsAt = ringXY.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(' ');
    if (gLabels.dataset.rings !== ringsAt) gLabels.dataset.rings = ringsAt;
    const droppedAt = [...live.labelSol].filter(([k, v]) => v.drop && k.startsWith('n:')).map(([k]) => { const o = at.get(k); return `${k.slice(2)}@${o ? `${Math.round(o.ax)},${Math.round(o.ay)}` : ''}`; }).join(' ');
    if (gLabels.dataset.dropped !== droppedAt) gLabels.dataset.dropped = droppedAt;
    // Which labels show this frame. A slot never moves for a screen-fixed obstacle: a label whose box a
    // panel, card or title covers (or that has panned off the stage) is hidden, and shown again once it is
    // clear of the obstacle by a margin, so it cannot flicker at the edge. A selected label always shows.
    const stage = { x0: 0, y0: 0, x1: W, y1: H };
    // (A Circuit reading that the pull below would set on a station's ring, its own included, where its halo would hide the ring,
    // slides the least it needs instead, any way within 120 px: into the free space, onto no other reading as they will stand, its
    // leader through none of them and none of theirs through it. Failing that it is pulled in as before.)
    const ringPull = new Map();   // (what the ring pass below slid a reading by: part of the screen's edge pull, not of its slot)
    if (circuit && ringXY.length) {
      const ns = out.filter((o) => o.key.startsWith('n:') && !o.live && o.ax >= -8 && o.ax <= W + 8 && o.ay >= -8 && o.ay <= H + 8);
      const pull = new Map(ns.map((o) => { const e = rectOf(o), V = viewOf(o, S); return [o, [Math.max(V.x0 - e.x0, Math.min(0, V.x1 - e.x1)), Math.max(V.y0 - e.y0, Math.min(0, V.y1 - e.y1))]]; }));
      const pulledBox = (o) => { const [cx, cy] = pull.get(o); return rectOf({ ...o, x: o.x + cx, y: o.y + cy }); };
      const onRing = (r) => ringXY.some(([x, y, rx]) => x > r.x0 - rx && x < r.x1 + rx && y > r.y0 - 5 && y < r.y1 + 5);
      for (const it of ns) {
        const [cx, cy] = pull.get(it);
        if ((!cx && !cy) || !onRing(pulledBox(it))) continue;
        const near = ns.filter((o) => o !== it), others = near.map(pulledBox), V = viewOf(it, S);
        const lines = near.filter((o) => o.leader || Math.hypot(...pull.get(o)) > 2).map((o) => { const r = pulledBox(o), e = leaderEnd(r, o.ax, o.ay); return { x0: o.ax, y0: o.ay, x1: e.x, y1: e.y }; });
        const step = PULL_GRID.find(([dx, dy]) => {
          const r = rectOf({ ...it, x: it.x + cx + dx, y: it.y + cy + dy });
          if (!within(r, V) || onRing(r) || (useLines && lineHits(r, 1, { only: 'res' })) || others.some((o) => hits(r, o)) || lines.some((sg) => segHitsBox(sg, r, 2))) return false;
          const e = leaderEnd(r, it.ax, it.ay), sg = { x0: it.ax, y0: it.ay, x1: e.x, y1: e.y };
          return !others.some((o) => segHitsBox(sg, o, 2));
        });
        if (!step) continue;
        it.x += cx + step[0]; it.y += cy + step[1]; it.leader = true; pull.set(it, [0, 0]); ringPull.set(it, [cx + step[0], cy + step[1]]);
        if (solve && useLines && lineHits(rectOf(it), 2)) { it.onVessel = true; const sol = nextSol.get(it.key); if (sol) sol.onv = true; }   // (on a vessel: the solid halo)
      }
    }
    for (const it of out) {
      // (How far the stage's edge pulled this label in from its slot: the glide eases the slot, never this, which is fixed to the screen.)
      const rp = ringPull.get(it);
      it.px = rp ? rp[0] : 0; it.py = rp ? rp[1] : 0;
      if (it.live) { it.hide = false; continue; }
      // A label a pan has pushed over the stage edge is pulled back inside (with a leader to its station)
      // so it is never cut off; once its station has left the stage the label goes too.
      // (A caption turned upright takes its box turned too: pulled in by its unturned box, one beside the right edge slid left across the lanes.)
      const edge = it.rot ? rectOf({ ...it, w: it.h, h: it.w }) : rectOf(it), V = viewOf(it, S);
      // An organ's name is pinned inside its organ: where a card or the stage edge covers it, it hides with the organ, never slides.
      // (Shown, it hides as a card first touches it; hidden, it comes back only once 10 px clear of the card as of the stage's edge, so a card
      // easing at its edge cannot flick it on and off.)
      if (it.cls === 'organ') { const was = labelVis.get(it.key) !== false, m = was ? 0 : 10, grown = { x0: edge.x0 - m, y0: edge.y0 - m, x1: edge.x1 + m, y1: edge.y1 + m }; it.hide = !within(grown, V) || obstacles.some((o) => hits(grown, o)); labelVis.set(it.key, !it.hide); continue; }
      const cx = Math.max(V.x0 - edge.x0, Math.min(0, V.x1 - edge.x1)), cy = Math.max(V.y0 - edge.y0, Math.min(0, V.y1 - edge.y1));
      if (cx || cy) { it.x += cx; it.y += cy; it.px += cx; it.py += cy; if (Math.hypot(cx, cy) > 2 && !it.key.startsWith('z:')) it.leader = true; }
      // (A reading pulled in onto a vessel takes the solid halo there too.)
      if ((cx || cy) && solve && useLines && it.key.startsWith('n:') && lineHits(rectOf(it), 2)) { it.onVessel = true; const sol = nextSol.get(it.key); if (sol) sol.onv = true; } if ((cx || cy) && !it.sel && useLines && lineHits(rectOf(it), 1, { only: 'res' })) { it.hide = true; labelVis.set(it.key, false); continue; }   // (pulled in onto a resistor's zigzag: hidden instead. Circuit slide 4 on a phone: "IVC", pulled out from under the card onto the liver's)
      if (!it.sel && (it.ax < -8 || it.ax > W + 8 || it.ay < -8 || it.ay > H + 8)) { it.hide = true; labelVis.set(it.key, false); continue; }
      if (it.sel) { it.hide = false; continue; }
      const r = it.rot ? rectOf({ ...it, w: it.h, h: it.w }) : rectOf(it), was = labelVis.get(it.key) !== false, m = was ? 0 : it.point || (dop.all && /^focus/.test(it.key)) ? 4 : 10;   // (a turned caption: its box turned too; a stent's point or its mark was placed 4 px off the cards)
      // A zone title is a label too: a reading is never hidden by one (the overlap pass below settles any
      // clash, and a reading outranks a zone title); other labels give way to it only where they truly overlap.
      it.hide = !hits(r, stage) || obstacles.some((o) => !(it.point && o.probe) && (o.zone ? !it.key.startsWith('n:') && o.key !== it.key && hits(r, o) : hits(r, { x0: o.x0 - m, y0: o.y0 - m, x1: o.x1 + m, y1: o.y1 + m })));
      // (A stent's point, or the slide's mark beside it, that the figure's move carried under a card is placed again rather than hidden
      // (nothing of the column hides: Review 16 Oct); at most every quarter second, so a card still easing cannot keep it searching.)
      if (it.hide && !solve && dop.all && (it.point || /^focus/.test(it.key)) && performance.now() - live.colResolve > 250) { live.colResolve = performance.now(); return false; }
      labelVis.set(it.key, !it.hide);
    }
    // Last pass: no two labels showing may overlap. A pan can pull a label in from the stage edge onto
    // another, and carried slots are not searched again. The more important label keeps its place; the
    // other drops its value and, if that is not enough, hides until there is room.
    const rank = (it) => (it.sel ? 1e3 : it.key.startsWith('focus') ? 900 : it.cls === 'organ' ? 0 : it.cls === 'lane' ? 1 : it.key.startsWith('z:') && !it.sel ? 1.5 : (it.pri ?? 2) + 2);
    const kept = [];
    // A caption turned upright takes its box turned too (it cannot shorten, so it hides when crowded).
    const boxOf = (it) => (it.rot ? rectOf({ ...it, w: it.h, h: it.w }) : rectOf(it));
    // (A label this pass hid at the last layout comes back only with 4 px to spare, so two labels sliding past each other in a pan, a zoom
    // or a glide cannot flick the lesser on and off: 2 Nov.)
    const lapWas = live.lapHid, crowded = (it, r) => { const p = lapWas.has(it.key) ? 4 : 0; return kept.some((k) => hits({ x0: r.x0 - p, y0: r.y0 - p, x1: r.x1 + p, y1: r.y1 + p }, k)); };
    live.lapHid = new Set();
    for (const it of out.filter((o) => !o.hide && !o.live).sort((a, b) => rank(b) - rank(a))) {
      let r = boxOf(it);
      if (it.rot) { if (!it.sel && crowded(it, r)) { it.hide = true; live.lapHid.add(it.key); continue; } kept.push(r); continue; }
      if (crowded(it, r)) {
        const d = it.dir || '';
        for (let w0 = it.w, h0 = it.h; it.canShort && kept.some((k) => hits(r, k)) && shortenItem(it); w0 = it.w, h0 = it.h) {
          it.x += d.includes('W') ? w0 - it.w : d.includes('E') ? 0 : (w0 - it.w) / 2;
          it.y += d.includes('N') ? h0 - it.h : d.includes('S') ? 0 : (h0 - it.h) / 2;
          r = rectOf(it);
        }
        if (!it.sel && crowded(it, r)) { it.hide = true; live.lapHid.add(it.key); continue; }
        // (Shortened where it stands, a reading may come to sit on a vessel: it takes the solid halo there.)
        if (solve && useLines && it.key.startsWith('n:') && !it.onVessel && lineHits(r, 2)) { it.onVessel = true; const sol = nextSol.get(it.key); if (sol) sol.onv = true; }
      }
      kept.push(r);
    }
    // A zone's title under a reading that had nowhere else to go (placeMulti's overZones) slides along its band to the nearest
    // free spot; with none, it gives way.
    const shownBoxes = (z) => out.filter((o) => !o.hide && !o.live && o !== z).map(boxOf);
    for (const z of out) {
      if (!z._zr || z.sel || z.hide || !out.some((o) => o.key.startsWith('n:') && !o.hide && hits(rectOf(o), z._zr))) continue;
      const busy = shownBoxes(z), { at, c, lo, hi } = z._slide;
      let spot = null;
      for (let d = 4; spot === null && (c - d >= lo || c + d <= hi); d += 4) {
        for (const cc of [c - d, c + d]) {
          if (cc < lo || cc > hi) continue;
          const zr = at(cc);
          if (within(zr, { x0: 6, y0: 6, x1: W - 6, y1: H - 6 }) && !busy.some((k) => hits(zr, { x0: k.x0 - 2, y0: k.y0 - 2, x1: k.x1 + 2, y1: k.y1 + 2 })) && !obstacles.some((o) => !o.zone && hits(zr, o))) { spot = cc; break; }
        }
      }
      if (spot !== null) z._zr = at(spot); else { at(c); z.hide = true; }
    }
    // Leader lines and anchor dots, for the labels showing. (Every line goes down before any dot, so no leader runs over a dot.)
    // (A stent's point: its dot sits on a solid disc of the stage's colour, and every leader that ends there, its own or the slide's
    // mark's, stops 2 px outside the disc; one left shorter than 4 px is not drawn: Review 15 Oct.)
    // The heart's rate and output, after every label is placed, only where it fits beside its label (heart-label.js).
    heartPass(out, { f, solve, circuit, on: !!live.fx?.heart, sol: nextSol, was: prevSol, lineW, LINE_H, lineHits: useLines ? lineHits : null, obstacles, view: (it) => viewOf(it, S), boxOf, rectOf, leaderEnd });
    labelGlide(out);
    // No flow arrowhead runs under a reading that has to sit on its vessel (veins-gl.js noChev; world boxes, 3 px of air: its halo's reach).
    // (Taken where the label is drawn this frame, after its glide, not where it is going: the boxes ran ahead of a gliding
    // label; round 2 review, B8.)
    live.noChevBoxes = out.filter((it) => it.onVessel && !it.hide).slice(0, 12).map((it) => {
      const r = rectOf(it), c = [[r.x0 - 3, r.y0 - 3], [r.x1 + 3, r.y0 - 3], [r.x0 - 3, r.y1 + 3], [r.x1 + 3, r.y1 + 3]].map(([x, y]) => localToWorld(x, y));
      return [Math.min(...c.map((p) => p[0])), Math.min(...c.map((p) => p[1])), Math.max(...c.map((p) => p[0])), Math.max(...c.map((p) => p[1]))];
    });
    const DISC = 5, pts = out.filter((it) => it.point && !it.hide);
    const dots = [];
    const lineFrom = (it, le) => {
      let x0 = it.ax, y0 = it.ay;
      const d = pts.find((p) => Math.hypot(p.ax - x0, p.ay - y0) < DISC + 2);
      if (d) {
        const L = Math.hypot(le.x - d.ax, le.y - d.ay);
        if (L < DISC + 2 + 4) return null;
        x0 = d.ax + ((le.x - d.ax) / L) * (DISC + 2); y0 = d.ay + ((le.y - d.ay) / L) * (DISC + 2);
      }
      return `M${x0.toFixed(1)} ${y0.toFixed(1)} L${le.x.toFixed(1)} ${le.y.toFixed(1)}`;
    };
    for (const it of out) {
      if (it.hide || it.live || it.cls === 'organ' || it.cls === 'lane' || it.key === 'scan') continue;
      let r = rectOf(it);
      // (A numbered step's group: a leader from each of its vessels to the number, none to the point between them.)
      if (it.fans) {
        it.fans.forEach(([fx, fy], j) => {
          const le = leaderEnd(r, fx, fy, 6);
          if (Math.hypot(le.x - fx, le.y - fy) > 4) leaders.push({ k: `lf:${it.key}:${j}`, tag: 'path', at: { class: 'leader fan', 'data-k': it.key, d: `M${fx.toFixed(1)} ${fy.toFixed(1)} L${le.x.toFixed(1)} ${le.y.toFixed(1)}` }, fanOf: it });
        });
        continue;
      }
      // (A Circuit reading's leader reaches its text: the nearer of its lines, as wide as that line's words, not the block's box.)
      if (circuit && it.key.startsWith('n:')) r = leadRectOf(it, it.x, it.y, it.ax, it.ay);
      // (Elsewhere the leader stops on the edge of the letters it meets first, run by run: seenEnd.)
      const le = circuit ? leaderEnd(r, it.ax, it.ay, 2) : seenEnd(it);
      // (Exactly where the layout decided one (it.leader: needsLeader at the solve, kept by a carry; a pull off the stage's edge joins it too), or a slide's mark.)
      const dl = (it.focusLeader || it.leader) && lineFrom(it, le);
      if (dl) leaders.push({ k: 'l:' + it.key, tag: 'path', at: { class: it.focusLeader ? `leader focus${it.mk ? ` k-${it.mk}` : ''}` : `leader${it.sel ? ' hl' : ''}`, 'data-k': it.key, d: dl } });
      if (it.focusLeader || it.free) continue;
      const cx = it.ax.toFixed(1), cy = it.ay.toFixed(1);
      if (it.point) dots.push({ k: 'h:' + it.key, tag: 'circle', at: { class: 'leader-dot-halo', 'data-k': it.key, cx, cy, r: String(DISC) } });
      if (!circuit || it.mid) dots.push({ k: 'd:' + it.key, tag: 'circle', at: { class: 'leader-dot', 'data-k': it.key, cx, cy, r: '2.4' } });
    }
    // (A "60 %" that stands off from its clamp, moved off the probe or put where the stent's column of callouts leaves room, is
    // joined to the clamp's nearer outer tip by a leader, fading with it; one at its usual spot has none. Read from the label as it
    // stands now, in a carried layout too, so a pan or a nudge of the figure keeps the line.)
    if (!isImaging()) for (const el of clampW.querySelectorAll('.clamp-label')) {
      const c = el._c, m = c && clampMv.get(c.id), own = c && c.id === live.clampFor && live.ptSide && clampD.get(c.id);
      if (!c || m?.busy || !(m?.cur || own)) continue;
      const b = boxOfEl(el, (6 * live.clampBase) / 12);   // (the leader stops short of the text by the same 6 px at 12 px text, in step with its size)
      if (!b) continue;
      const tips = [[c.x + c.nx * (c.off + 8), c.y + c.ny * (c.off + 8)], [c.x - c.nx * (c.off + 8), c.y - c.ny * (c.off + 8)]].map((q) => worldToLocal(...q));
      const gap = (q) => Math.hypot(Math.max(b.x0 - q[0], 0, q[0] - b.x1), Math.max(b.y0 - q[1], 0, q[1] - b.y1));
      const [ax, ay] = gap(tips[1]) < gap(tips[0]) ? tips[1] : tips[0], le = leaderEnd(b, ax, ay, 1);
      if (Math.hypot(le.x - ax, le.y - ay) > (m?.cur ? 4 : 28)) leaders.push({ k: 'cl:' + c.id, tag: 'path', at: { class: 'leader', d: `M${ax.toFixed(1)} ${ay.toFixed(1)} L${le.x.toFixed(1)} ${le.y.toFixed(1)}` } });
    }
    leaders.push(...dots);
    // (The flow's arrowheads keep out from under the points' callouts, within 17 px of their dots, and 5 px either side of
    // every leader that ends at a point, the slide's mark's included, so no line runs through one: Review 15 Oct.)
    const holes = [], k = 1 / Math.max(live.CTM.sc, 1e-3);
    for (const it of pts) {
      const r = rectOf(it), [ax, ay] = localToWorld(r.x0, r.y0), [bx, by] = localToWorld(r.x1, r.y1), [dx, dy] = localToWorld(it.ax, it.ay);
      holes.push([Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by), 3 * k], [dx, dy, dx, dy, 17 * k]);
    }
    for (const it of out) {
      if (it.hide || it.live || !(it.point || it.focusLeader) || !pts.some((p) => Math.hypot(p.ax - it.ax, p.ay - it.ay) < DISC + 2)) continue;
      const le = leaderEnd(rectOf(it), it.ax, it.ay), [x0, y0] = localToWorld(it.ax, it.ay), [x1, y1] = localToWorld(le.x, le.y);
      holes.push([x0, y0, x1, y1, -5 * k]);
    }
    const hk = holes.map((h) => h.map((v) => v.toFixed(1)).join(',')).join(';');
    if (hk !== live.holesKey) { live.holesKey = hk; live.chevHoles = holes; }
    // (This layout's labels are the whole of what is wanted: a build asked for by an earlier one and not yet made is dropped, or it would
    // make a label nothing then removes.)
    live.laidFrame = live.frameNo; blockWant.clear();
    for (const it of out) renderBlock(it);
    live.lbRects = out.filter((it) => !it.hide && it.w && it.h).map((it) => it._r || rectOf(it));
    live.colShown = out.some((it) => it.point && !it.hide && it.w && it.h);
    // (A step's number comes in as its vessel lights: begun by renderBlock as its block is first rendered, stage-label-layer.js stepIn.)
    const sit = out.find((o) => o.key === 'scan'), sblk = pool.get('scan');
    if (sit && !sit.hide) {
      const le = seenEnd(sit);
      // (Handed to label-gl as text, which writes the SVG's copy only while it does not draw it: L3 P6.)
      const [lp, ld] = gScan.children, lg = live.labelGL, d = `M${sit.ax.toFixed(1)} ${sit.ay.toFixed(1)} L${le.x.toFixed(1)} ${le.y.toFixed(1)}`, cx = sit.ax.toFixed(1), cy = sit.ay.toFixed(1);
      if (lg) { lg.markAt(lp, d); lg.markAt(ld, cx, cy, ld.getAttribute('r') || ''); } else { lp.setAttribute('d', d); ld.setAttribute('cx', cx); ld.setAttribute('cy', cy); }
      if (gScan.classList.contains('off')) { gScan.classList.remove('off'); lg?.markLook(gScan); }
    } else { if (!gScan.classList.contains('off')) { gScan.classList.add('off'); live.labelGL?.markLook(gScan); } if (sblk && sblk.seen !== live.frameNo && !sblk.g.classList.contains('lb-off')) { sblk.g.classList.add('lb-off'); live.labelGL?.dirty(sblk.g); } }   // no callout this frame (circuit view, covered): it fades, never pops
    live.labelShown = out.filter((it) => it.src && !it.hide);
    // A label no longer wanted fades out (lb-off), then leaves; one wanted again before then simply fades back (renderBlock).
    for (const [k, b] of pool) {
      if (b.seen === live.frameNo || (k === 'scan' && (scan.leaving || scan.on))) continue;
      b.at = null; b.gl = null;
      b.box = '';   // (gone from the labels the credit avoids: labelBoxStamp)
      if (b.gone || b.g.style.display === 'none') continue;
      if (reduceMotion.matches || live.camMove) { b.g.style.display = 'none'; live.labelGL?.dirty(b.g); continue; }
      if (!b.g.classList.contains('lb-off')) { b.g.classList.add('lb-off'); live.labelGL?.dirty(b.g); }
      labelStop(b, true);
      const tok = b.gone = {};
      setTimeout(() => { if (b.gone === tok) { b.gone = null; b.g.style.display = 'none'; live.labelGL?.dirty(b.g); } }, 360);
    }
    paintLeaders(leaders);
    // Keep the camera of every committed layout, including a carry before a sliced solve. A slice itself commits nothing; labelTail
    // must not stamp an old picture with the current camera merely because its solver has finished or was skipped.
    live.layCTM = stagePx(live.CTM);
    if (HOVER_LINK && (live.linkLit.size || vh.id || live.linkPtr || live.linkKbd)) { live.linkHeld(); live.linkSync(); }   // (a label or leader just built, or one whose class was written again, takes its lift)
    // (A group's leaders come in with its number, as its vessels light: label-gl draws them at the number's own opacity, from its record's fans,
    // with no fade of their own: one in a Web Animation's delay was read at opacity 0 and kept so, and step 2's fan never showed, 6 Nov 2026.
    // Only the SVG, drawing the labels when there is no GPU layer, fades its own copy of the lines.)
    if (!live.labelGL) for (const w of leaders) {
      const el = w.fanOf && leadEls.get(w.k), wait = el && w.fanOf.delay - (performance.now() - live.glowSetAt);
      if (!el || el.fxIn) continue;
      el.fxIn = true;
      if (wait > 0 && !reduceMotion.matches) el.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: D_SURFACE, delay: wait, easing: EASE_ARRIVE, fill: 'backwards' });
    }
    return true;
  }
  return { layoutLabelsGen };
}
