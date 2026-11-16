// The layout's kept records
// (moved out of lobule-zoom.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { classHas, classSoon } from './class-soon.js';
import { LONG_LEAD, SHORT_LEAD, discInto, needsLeader } from './label-place.js';
import { runInside } from './leader-end.js';
import { fanCost, fanSpot, mkFan, tractFan } from './lobule-tract-labels.js';
import { restAttr, restPass } from './rest-pass.js';
import { camId, camSet, camThen } from './scene-cam.js';
import { createSearchBudget } from './search-budget.js';
import { geoOf, setGeo } from './svg-gl.js';
import { clamp } from './util.js';

export function createLobuleRecords(st, live) {
  const { CARD, CORE, DESIGN, DIVE, LAY_ORDER, LIT_OF, PAN, V, anchorOf, bakeRides, callEl, callLine, callOutMain, callRing, callRingAt, cap, cvKeep, dimmed, fadeIn, fadeOut, fillBase, followEnd, follows, freeRect, freezeLabelGlides, handOn, hexOf, isHid, keepDiscs, labKey, labelLayerOff, labels, labs, leadGL, leadOff, leadOn, leadTo, leaders, lzLoop, measureRun, mirrorAll, mkCallOut, named, nextFrame, noteAt, pick, pickAnchors, placeCall, placeZones, put, relayout, ride, ringDepth, sX, sY, sameBase, setHid, shiftGeo, sinAt, sizeEnv, snap, spot, trClear, unglide, wantLabels } = st;
  const VIEW = [1, 0, 0], VIEWC = { k: 1, x: 0, y: 0 };   // (the composed view, written in place)
  function applyView() {
    camThen(VIEWC, CARD, camThen(VIEWC, DIVE, PAN));   // (the card ∘ the dive ∘ the pan: each record has one writer, a card's zoom camera is never written by the dive's frames)
    VIEW[0] = VIEWC.k; VIEW[1] = VIEWC.x; VIEW[2] = VIEWC.y;
    cap.view(VIEW[0], VIEW[1], VIEW[2]); leadGL.view(VIEW[0], VIEW[1], VIEW[2]);
  }
  const unpan = () => { if (!live.panOn) return; live.panOn = false; camId(PAN); applyView(); };
  const setDive = (k, e, f) => { if (DIVE.k === k && DIVE.x === e && DIVE.y === f) return; camSet(DIVE, k, e, f); applyView(); };
  // Writes the pan's shift into the labels' and leaders' own positions and drops the shared shift, so they glide on from where they are seen.
  function bakeFollow() {
    if (bakeRides()) { clearTimeout(live.followT); unpan(); return true; }
    clearTimeout(live.followT);
    // (Only this function's own shift is a pan: the dive's is a scale about a point, kept in its own record.)
    if (!live.panOn) return false;
    const dx = PAN.x, dy = PAN.y;
    unpan();
    if (!dx && !dy) return false;
    for (let e = labels.firstElementChild; e; e = e.nextElementSibling) { const p = spot.get(e); if (p) put(e, p[0] + dx, p[1] + dy); }
    unglide();
    for (let e = leaders.firstElementChild; e; e = e.nextElementSibling) shiftGeo(e, dx, dy);
    leadGL.paint();
    return true;
  }
  // (The layout's geometry, shared with the zoom's ride check: rideHolds.)
  const overlap = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l))
    * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t)), into = discInto;
  // Leaders run to each label's centre; a leader never crosses another label, and a label never sits on another's leader.
  // (The segment's parameter range, narrowed by each axis in turn: kept here, so a test makes no array.)
  let ct0 = 0, ct1 = 1;
  const clipAxis = (d, lo, hi, o) => {
    if (Math.abs(d) < 1e-9) return !(o < lo || o > hi);
    let u = (lo - o) / d, v = (hi - o) / d;
    if (u > v) { const w = u; u = v; v = w; }
    ct0 = Math.max(ct0, u); ct1 = Math.min(ct1, v);
    return !(ct0 > ct1);
  };
  const crosses = (p, q, b) => {
    ct0 = 0; ct1 = 1;
    return clipAxis(q[0] - p[0], b.l, b.r, p[0]) && clipAxis(q[1] - p[1], b.t, b.b, p[1]);
  };
  // Two leaders never cross each other either (a shared end, two labels on one spot, is not a crossing).
  const side = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const cut = (p, q, r, t) => side(p, q, r) * side(p, q, t) < 0 && side(r, t, p) * side(r, t, q) < 0;
  // ── The layout's kept records ──
  // A layout (and the ride and the leaders' sync around it) makes no array, object or closure of its own: what it works on is kept here
  // and written in place (2 Nov 2026: a pinch whose labels cannot ride is laid out on every frame, and a layout tried hundreds of spots
  // as arrays and objects). Nothing in it is read after the layout that wrote it but through the records the layout leaves: follow
  // (the ride's check), L.a (each label's spot, in its own pair), and the boxes in sol.
  const mkRes = () => ({ k: '', it: null, out: false, x: 0, y: 0, cost: 0, crossed: false, box: { l: 0, r: 0, t: 0, b: 0 }, pair: [null, [0, 0]] });   // alloc-rare: made with the view, and in the settled re-layout that still has a clash (never a frame of a hand's move)
  const mkSol = () => ({ res: [mkRes(), mkRes(), mkRes(), mkRes(), mkRes(), mkRes()], n: 0, total: 0, pl: [], ld: [], lead: null, call: null });   // alloc-rare: made with the view, and in the settled re-layout that still has a clash (never a frame of a hand's move)
  const mkItem = () => ({ k: '', L: null, w: 0, hh: 0, a: [0, 0], ea: [0, 0], edge: null });
  const mkInk = () => ({ x0: 0, y0: 0, x1: 0, y1: 0, r: 0, L: null });
  const searchBudget = createSearchBudget();   // (LZ2-1: the settled order search keeps to a deadline and is run again, longer, in a later frame)
  const LC = {
    fr: null, ring: null, cards: null, keep: null, lk: 1, hx: 0, hy: 0,
    placed: [], pre: [], base: [], ld0: [], none: [], shK: [], shL: [], stack: [], sizes: [],
    items: [], pool: [mkItem(), mkItem(), mkItem(), mkItem(), mkItem(), mkItem()],
    inks: [mkInk(), mkInk(), mkInk(), mkInk(), mkInk(), mkInk()], ink0: mkInk(),
    syncOn: [], syncInks: [mkInk(), mkInk(), mkInk(), mkInk(), mkInk(), mkInk()],
    want: { ks: [], fw: 0 }, ord: [], idx: [], core: [], rest: [],
    hex: null, ux: -1, uy: 0, nx: 0, ny: -1, tractR: 14, paired: false, pairN: 0, triIt: null, lyIt: null, px: 0, py: 0,
    cand: new Float64Array(2048), cb: { l: 0, r: 0, t: 0, b: 0 }, bb: { l: 0, r: 0, t: 0, b: 0 }, q: [0, 0], disc: { x: 0, y: 0, r: 10 },
    room: { fr: [0, 0, 0, 0], pad: 0, hx: 0, hy: 0, keep: [], nk: 0, cards: null },
    vb: '', vbW: -1, vbH: -1, fan: mkFan(),
  };
  const SOL_A = mkSol(), SOL_B = mkSol();
  const N7 = [0, -1, 1, -2, 2, -3, 3], R3 = [1, 1.6, 2.4];
  const rnd1 = (v) => Math.round(v * 10) / 10;
  // The room the labels were given, written between frames for the browser check that a label left out had no clear spot (a rest pass,
  // from the numbers the last layout left).
  let roomT = 0;
  function writeRoom() {
    roomT = 0;
    const R = LC.room, keep = [], cards = [];
    for (let i = 0; i < R.nk; i++) keep.push([R.keep[i][0], R.keep[i][1], R.keep[i][2]].map(rnd1));
    for (const c of R.cards) cards.push([c.l, c.t, c.r, c.b].map(rnd1));
    labels.setAttribute('data-room', JSON.stringify({ fr: R.fr.map(rnd1), pad: rnd1(R.pad), hx: rnd1(R.hx), hy: rnd1(R.hy), lead: LONG_LEAD, keep, cards }));
  }
  // A label's letters: its box less the padding, written into `o`. A leader stops on the letters, lit or not: a lit name is outlined
  // text in its term's colour with no pill (13 Nov 2026, unification audit 12).
  const lettersInto = (o, L, l, t, w, hh) => {
    o.L = L;
    const p = L.pad;
    o.x0 = l + (p ? p[0] : 0); o.y0 = t + (p ? p[2] : 0); o.x1 = l + w - (p ? p[1] : 0); o.y1 = t + hh - (p ? p[3] : 0); o.r = 0;
    return o;
  };
  // The cost of leaving a label out, by how much it matters: a label the slide names most, a vessel label next.
  const dropCost = (k) => (named(k) ? 2e7 : CORE.includes(k) ? 1e7 : 3e4);
  // The ring a spot lies just outside of, for a vessel label (the centre's, where the label sits beside it).
  const ownR = (a) => {
    const keep = LC.keep;
    for (let i = 0; i < keep.length; i++) { const q = keep[i]; if (Math.hypot(q.x - a[0], q.y - a[1]) < q.r) return q.r + Math.hypot(q.x - a[0], q.y - a[1]); }
    return 10;
  };
  // The designed spots (Mohammad, 2 Nov 2026, label mocks: "shorter callout lines, that are better, and well placed"). The portal
  // tract's venule and lymphatic are named as a pair just outside their corner, one on each side of the ray from the central vein
  // through it (above and below on a side corner, left and right on a top or bottom one), so their short leaders splay apart and
  // never cross; the central vein's name stands right beside the vein, on the side away from the tract, with no leader; the
  // sinusoids' just below their sinusoid, on a short straight one.
  // Sets LC.px, LC.py to the label's preferred spot.
  function setPreferred(k, a, w, hh) {
    const ux = LC.ux, uy = LC.uy, nx = LC.nx, ny = LC.ny, hx = LC.hx, hy = LC.hy, keep = LC.keep, triIt = LC.triIt, paired = LC.paired;
    if (fanSpot(LC.fan, k, LC)) return;   // (the portal tract's labels: each out along its own spoke, lobule-tract-labels.js)
    const ex = Math.abs(ux) * w / 2 + Math.abs(uy) * hh / 2, ey = Math.abs(ux) * hh / 2 + Math.abs(uy) * w / 2;
    // (Offsets reach past each box's margins (hx, hy): the box's inner corner just clears the tract's disc, or the lymphatic's own spot.)
    const mx = Math.abs(ux) * hx + Math.abs(uy) * hy, my = Math.abs(ux) * hy + Math.abs(uy) * hx;
    if (k === 'triad' && paired) { const cu = a[0] * ux + a[1] * uy + ex + mx + LC.tractR + 2, cn = LC.pairN + ey + my + 2; LC.px = ux * cu + nx * cn; LC.py = uy * cu + ny * cn; }
    else if (k === 'lymph' && paired) { const cu = a[0] * ux + a[1] * uy + ex + mx + 12, cn = LC.pairN - ey - my - 2; LC.px = ux * cu + nx * cn; LC.py = uy * cu + ny * cn; }
    else if (k === 'triad') { LC.px = a[0]; LC.py = a[1] + hh / 2 + 12; }
    else if (k === 'lymph') { LC.px = a[0]; LC.py = a[1] - hh / 2 - 14; }
    else if (k === 'cv') { const sd = triIt && triIt.a[0] > a[0] + 1 ? -1 : 1; LC.px = a[0] + sd * (keep[0].r + hx + 2 + w / 2); LC.py = a[1]; }
    else if (k === 'sin') { LC.px = a[0]; LC.py = a[1] + hh / 2 + hy + 14; }
    else if (k === 'ha' || k === 'bd') { LC.px = a[0] + (k === 'ha' ? -1 : 1) * (w / 2 + 14); LC.py = a[1] - hh / 2 - 10; }   // (only with no spoke: fanSpot)
    else { LC.px = a[0]; LC.py = a[1]; }
  }
  // Places the labels of `order` one at a time into `S` (a kept solution: its result for each label, its boxes and its leaders), on top of
  // the boxes pl0 and the leaders ld0 already standing; the candidate spots are written into a kept buffer, in the order they are tried, and
  // the cheapest kept (the first of equals).
  function solve(order, pl0, ld0, S) {
    const fr = LC.fr, cards = LC.cards, keep = LC.keep, ring = LC.ring, lk = LC.lk, hx = LC.hx, hy = LC.hy, cb = LC.cb, bb = LC.bb, q = LC.q, disc = LC.disc;
    const pl = S.pl, ld = S.ld, res = S.res, pad = 8 + 4 * lk;
    pl.length = 0; for (let i = 0; i < pl0.length; i++) pl.push(pl0[i]);
    ld.length = 0; for (let i = 0; i < ld0.length; i++) ld.push(ld0[i]);
    let total = 0, nr = 0;
    for (let oi = 0; oi < order.length; oi++) {
      const it = order[oi], k = it.k, w = it.w, hh = it.hh, a = it.a, edge = it.edge, step = hh + 12, r = res[nr++];
      r.k = k; r.it = it;
      let have = false, bestCost = 0, bestX = 0, bestY = 0;
      if (edge) {   // an edge chip slides along its edge only as far as it needs to clear the others
        const near = Math.abs(edge[0] - fr.l) < 40 + w || Math.abs(edge[0] - fr.r) < 40 + w;
        for (let ni = 0; ni < N7.length; ni++) {
          const n = N7[ni];
          const x = clamp(edge[0] + (near ? 0 : n * (w / 2 + 12)), fr.l + w / 2 + pad, fr.r - w / 2 - pad), y = clamp(edge[1] + (near ? n * step : 0), fr.t + hh / 2 + pad, fr.b - hh / 2 - pad);
          cb.l = x - w / 2 - hx; cb.r = x + w / 2 + hx; cb.t = y - hh / 2 - hy; cb.b = y + hh / 2 + hy;
          let plS = 0, cardS = 0;
          for (let i = 0; i < pl.length; i++) plS = plS + (overlap(cb, pl[i]) > 0 ? 1e6 + overlap(cb, pl[i]) * 100 : 0);
          for (let i = 0; i < cards.length; i++) cardS = cardS + (overlap(cb, cards[i]) > 0 ? 1e6 + overlap(cb, cards[i]) * 400 : 0);
          const cost = plS + cardS + Math.abs(n) * 10;
          if (!have || cost < bestCost) { have = true; bestCost = cost; bestX = x; bestY = y; bb.l = cb.l; bb.r = cb.r; bb.t = cb.t; bb.b = cb.b; }
        }
        if (bestCost >= 1e6) { r.out = true; total += dropCost(k); continue; }
        r.out = false; r.x = bestX; r.y = bestY; r.cost = bestCost; r.box.l = bb.l; r.box.r = bb.r; r.box.t = bb.t; r.box.b = bb.b;
        pl.push(r.box); total += bestCost;
        continue;
      }
      setPreferred(k, a, w, hh);
      const px = LC.px, py = LC.py;
      const pw = DESIGN.includes(k) ? 6 : 0.5;   // (a designed spot holds unless it clashes: its pull beats a shorter leader elsewhere)
      const nameless = !CORE.includes(k) && !named(k);
      // A name the slide leaves unlit is drawn faint (DIM_A): over the hexagon's vessels and cells it reads as a ghost, so it stands clear of the outline or is left out.
      const unlit = !CORE.includes(k) && dimmed(LIT_OF[k]);
      // Steps in proportion to the label, so larger text searches proportionally farther (above, below, beside, diagonally).
      let cand = LC.cand;
      const need = 2 * (35 + 96 + 49 + 4 * pl.length);
      if (cand.length < need) cand = LC.cand = new Float64Array(need * 2);   // alloc-once: the buffer grows the first time more boxes stand than it holds, then it is reused
      let nc = 0;
      cand[nc++] = px; cand[nc++] = py;
      for (let di = 0; di < 5; di++) {
        const dx = di === 0 ? 0 : di === 1 ? -(w / 2 + 12) : di === 2 ? w / 2 + 12 : di === 3 ? -(w + 24) : w + 24;
        for (let ni = 0; ni < N7.length; ni++) { const n = N7[ni]; if (dx || n) { cand[nc++] = px + dx; cand[nc++] = py + n * step; } }
      }
      // And all round what it names, just clear of it and a little farther, so a crowded side still leaves a free spot near it.
      const r0 = ownR(a);
      for (let ri = 0; ri < 3; ri++) {
        const rr = R3[ri];
        for (let i = 0; i < 16; i++) {
          const t = (i / 16) * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t);
          cand[nc++] = a[0] + c * (w / 2 + 18) * rr; cand[nc++] = a[1] + sn * (hh / 2 + 18) * rr;
          const d = (r0 + 10) * rr + Math.min(w / 2 / Math.max(Math.abs(c), 1e-6), hh / 2 / Math.max(Math.abs(sn), 1e-6));
          cand[nc++] = a[0] + c * d; cand[nc++] = a[1] + sn * d;
        }
      }
      // And a coarse grid over the whole free space, a last resort that still finds the one clear band on a short phone figure.
      for (let gx = 0; gx <= 6; gx++) for (let gy = 0; gy <= 6; gy++) { cand[nc++] = fr.l + (fr.r - fr.l) * gx / 6; cand[nc++] = fr.t + (fr.b - fr.t) * gy / 6; }
      // Snug against each label already placed (above, below or beside it), so a tight gap between two is found.
      for (let i = 0; i < pl.length; i++) {
        const o = pl[i];
        cand[nc++] = px; cand[nc++] = o.b + hh / 2 + hy; cand[nc++] = px; cand[nc++] = o.t - hh / 2 - hy;
        cand[nc++] = o.r + w / 2 + hx; cand[nc++] = py; cand[nc++] = o.l - w / 2 - hx; cand[nc++] = py;
      }
      for (let ci = 0; ci < nc; ci += 2) {
        const x = clamp(cand[ci], fr.l + w / 2 + pad, fr.r - w / 2 - pad);
        const y = clamp(cand[ci + 1], fr.t + hh / 2 + pad, fr.b - hh / 2 - pad);
        cb.l = x - w / 2 - hx; cb.r = x + w / 2 + hx; cb.t = y - hh / 2 - hy; cb.b = y + hh / 2 + hy;
        // A label with a leader keeps a visible stretch of it: it never sits right over the vessel it names.
        const lead = Math.hypot(Math.max(0, Math.abs(a[0] - x) - w / 2), Math.max(0, Math.abs(a[1] - y) - hh / 2));
        q[0] = x; q[1] = y;
        // Two labels never touch, and no leader runs under a label: any spot clear of both beats every spot that is not.
        let plS = 0, ldS = 0, cardS = 0, keepS = 0;
        for (let i = 0; i < pl.length; i++) { const o = pl[i]; plS = plS + (overlap(cb, o) > 0 ? 1e6 + overlap(cb, o) * 100 : 0) + (crosses(a, q, o) ? 1e5 : 0); }
        for (let i = 0; i < ld.length; i++) { const p = ld[i][0], e = ld[i][1]; ldS = ldS + (crosses(p, e, cb) ? 1e5 : 0) + (cut(p, e, a, q) ? 1e5 : 0); }
        for (let i = 0; i < cards.length; i++) cardS = cardS + (overlap(cb, cards[i]) > 0 ? 1e6 + overlap(cb, cards[i]) * 400 : 0);
        const rd = ringDepth(ring, cb);
        for (let i = 0; i < keep.length; i++) { const d = into(keep[i], cb); keepS = keepS + (d > 0 ? 1e6 + d * 1e3 : 0); }
        disc.x = a[0]; disc.y = a[1];
        const cost = plS + ldS
          + Math.max(0, 16 - lead) * 40
          + cardS
          + (rd > 0 ? 1e6 + rd * 1e3 : 0)
          + keepS
          + (into(disc, cb) > 0 ? 1e6 : 0) + fanCost(LC.fan, k, a, q)
          + lead * 8 + Math.max(0, lead - 3 * hh) * 60 + Math.max(0, lead - SHORT_LEAD) * 30 + Math.hypot(x - px, y - py) * pw
          // A label no slide names (the lymph, an arteriole, a ductule) is left out sooner than sent far from what it names
          // on a leader across the lobule (a phone once ran the Lymph label's 420 px over it, past every other label).
          + (nameless && lead > LONG_LEAD ? 1e6 : Math.max(0, lead - LONG_LEAD) * 400)
          + (unlit && LC.hex.share(cb) > 0 ? 1e6 : 0);
        if (!have || cost < bestCost) { have = true; bestCost = cost; bestX = x; bestY = y; bb.l = cb.l; bb.r = cb.r; bb.t = cb.t; bb.b = cb.b; }
      }
      if (bestCost >= 1e6) { r.out = true; total += dropCost(k); continue; }
      r.out = false; r.x = bestX; r.y = bestY; r.cost = bestCost; r.box.l = bb.l; r.box.r = bb.r; r.box.t = bb.t; r.box.b = bb.b;
      pl.push(r.box);
      r.pair[0] = a; r.pair[1][0] = bestX; r.pair[1][1] = bestY; ld.push(r.pair);
      total += bestCost;
    }
    S.n = nr; S.total = total;
    return S;
  }
  // The orders of the first n of a list, one after the other (the next after idx, in the order the orders sort by their positions).
  function nextPerm(a, n) {
    let i = n - 2;
    while (i >= 0 && a[i] >= a[i + 1]) i--;
    if (i < 0) return false;
    let j = n - 1;
    while (a[j] <= a[i]) j--;
    let t = a[i]; a[i] = a[j]; a[j] = t;
    for (let l = i + 1, r = n - 1; l < r; l++, r--) { t = a[l]; a[l] = a[r]; a[r] = t; }
    return true;
  }
  const permStart = (idx, n) => { idx.length = n; for (let i = 0; i < n; i++) idx[i] = i; };
  const permOf = (src, idx, out) => { out.length = idx.length; for (let i = 0; i < idx.length; i++) out[i] = src[idx[i]]; return out; };
  // A kept solution's results copied into another's (the first n).
  const copyRes = (dst, i, src) => {
    const d = dst.res[i];
    d.k = src.k; d.it = src.it; d.out = src.out; d.x = src.x; d.y = src.y; d.cost = src.cost; d.box.l = src.box.l; d.box.r = src.box.r; d.box.t = src.box.t; d.box.b = src.box.b;
  };
  const isCoreK = (k) => CORE.includes(k) || named(k);
  const outsOf = (s) => { let n = 0; for (let i = 0; i < s.n; i++) if (s.res[i].out && isCoreK(s.res[i].k)) n++; return n; };
  const betterSol = (p, q) => outsOf(p) < outsOf(q) || (outsOf(p) === outsOf(q) && p.total < q.total);
  // The pill's state as it stands (where it was put, its ends, what it cost), kept to put back should a layout not win.
  const callState = (lead) => ({ lead, pOn: live.cpOn, pAt: live.cpAt, pDx: live.cpDx, pDy: live.cpDy, cost: live.callCost, hasAt: spot.has(callEl), ax: spot.has(callEl) ? spot.get(callEl)[0] : 0, ay: spot.has(callEl) ? spot.get(callEl)[1] : 0, line: [geoOf(callLine, 'x1'), geoOf(callLine, 'y1'), geoOf(callLine, 'x2'), geoOf(callLine, 'y2')] });   // alloc-rare: only the settled re-layout that still has a clash (sol.total >= 1e5, the hand up), never a frame of a hand's move
  // A vessel label hidden or crowded: two more layouts are tried, and the one hiding the fewest vessel labels (central
  // vein, sinusoids, portal tract, and any the slide names), then crowding least, is kept. First, the vessel labels
  // placed before the slide's pill, the pill clear of them and their leaders, the optional labels in what is left.
  // Second, as the sinusoids are everywhere, another sinusoid in view for its label, when the one picked leaves none
  // (a crowded phone band once dropped the Sinusoids label on a slide about the sinusoids). The pill is never left on a label.
  // Runs only in the settled re-layout that still has a clash (the first order left sol.total >= 1e5 and no hand is moving the view):
  // its objects are made fresh, once per such layout.
  function coreFirst(items, fr, ring, hex, cards, keep, callLead) {
    const core = [], rest = [];   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
    for (const it of items) (isCoreK(it.k) ? core : rest).push(it);   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
    let s1 = solve(core, LC.pre, LC.none, mkSol()), tb = mkSol();   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
    const idx = [], ord = [];   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
    permStart(idx, core.length);
    do { if (s1.total < 1e5 || searchBudget.over()) break; const t = solve(permOf(core, idx, ord), LC.pre, LC.none, tb); if (t.total < s1.total) { tb = s1; s1 = t; } } while (nextPerm(idx, core.length));
    const pl2 = s1.pl.slice();   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
    const lead2 = placeCall(fr, pl2, cards, s1.ld, crosses, ring, hex, keep, into, mkCallOut());   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
    if (callLead && live.callCost >= 1e6) return null;
    const s3 = solve(rest, pl2, lead2 ? [...s1.ld, lead2] : s1.ld, mkSol());   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
    const out = mkSol();   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
    for (let i = 0; i < s1.n; i++) copyRes(out, i, s1.res[i]);
    for (let i = 0; i < s3.n; i++) copyRes(out, s1.n + i, s3.res[i]);
    out.n = s1.n + s3.n; out.total = s1.total + s3.total; out.lead = lead2; out.call = callState(lead2);
    return out;
  }
  function pillFirst(items, shown) {
    const ld = shown.lead ? [shown.lead] : [];   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
    let s2 = solve(items, LC.base, ld, mkSol()), tb = mkSol();   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
    if (items.length <= 5) {
      const idx = [], ord = [];   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
      permStart(idx, items.length);
      do { if (s2.total < 1e5 || searchBudget.over()) break; const t = solve(permOf(items, idx, ord), LC.base, ld, tb); if (t.total < s2.total) { tb = s2; s2 = t; } } while (nextPerm(idx, items.length));
    }
    s2.lead = shown.lead; s2.call = shown;
    return s2;
  }
  function retryClash(sol, items, fr, ring, hex, cards, keep, callLead) {
    const shown = callState(callLead);
    let won = null;
    if (callLead) { const c = coreFirst(items, fr, ring, hex, cards, keep, callLead); if (c && betterSol(c, sol)) { sol = c; won = c; } }
    let sinIt = null;
    for (let i = 0; i < items.length; i++) if (items[i].k === 'sin' && !items[i].edge) { sinIt = items[i]; break; }
    let sinOut = false;
    if (sinIt) for (let i = 0; i < sol.n; i++) if (sol.res[i].k === 'sin' && sol.res[i].out) sinOut = true;
    if (sinIt && sinOut) {
      const g = live.geo, cx = (fr.l + fr.r) / 2, cy = (fr.t + fr.b) / 2, a0x = sinIt.a[0], a0y = sinIt.a[1];
      const cands = [];   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
      for (const list of [g.L1, g.L2, g.L0]) for (const t of list) {   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
        const q = sinAt(t), p = [sX(q[0]), sY(q[1])];   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
        if (p[0] > fr.l + 30 && p[0] < fr.r - 30 && p[1] > fr.t + 30 && p[1] < fr.b - 30) cands.push([t, p]);   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
      }
      cands.sort((p, q) => Math.hypot(p[1][0] - cx, p[1][1] - cy) - Math.hypot(q[1][0] - cx, q[1][1] - cy));   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
      cands.length = Math.min(cands.length, 8);   // (LZ2-1: 8 other sinusoids at most, nearest the middle first; the deadline bounds the rest)
      let winX = a0x, winY = a0y;
      for (const [t, a] of cands) {   // alloc-rare: only the settled re-layout that still has a clash, never a frame of a hand's move
        if (searchBudget.over()) break;
        sinIt.a[0] = a[0]; sinIt.a[1] = a[1];
        const s2 = pillFirst(items, shown);
        if (betterSol(s2, sol)) { sol = s2; won = s2; winX = a[0]; winY = a[1]; pick.sin = t.id; }
        const s3 = callLead ? coreFirst(items, fr, ring, hex, cards, keep, callLead) : null;
        if (s3 && betterSol(s3, sol)) { sol = s3; won = s3; winX = a[0]; winY = a[1]; pick.sin = t.id; }
        if (outsOf(sol) === 0) break;
      }
      sinIt.a[0] = winX; sinIt.a[1] = winY;
    }
    const c = won ? won.call : shown;
    live.cpOn = c.pOn; live.cpAt = c.pAt; live.cpDx = c.pDx; live.cpDy = c.pDy; live.callCost = c.cost;
    if (c.hasAt) put(callEl, c.ax, c.ay); else { spot.delete(callEl); trClear(callEl); }
    for (let i = 0; i < 4; i++) setGeo(callLine, CALL_ENDS[i], c.line[i] ?? null);
    leadGL.paint();
    return sol;
  }
  const CALL_ENDS = ['x1', 'y1', 'x2', 'y2'];
  function layoutLabels() {
    const fr0 = freeRect(), g = live.geo;
    const sameB = !!live.follow && sameBase(live.follow, fr0, g);
    if (live.layoutKey && sameB && V.k === live.follow.k && V.x === live.follow.x && V.y === live.follow.y) return;
    // While a hand pans the lobule (a drag, its flick, a trackpad scroll), the labels ride with the picture as one
    // layer: placing them again every frame (measuring each, then trying hundreds of spots and orders) is what made
    // panning lag on a phone. They are placed again, gliding to their new spots, once the hand lets go.
    if (sameB && V.k === live.follow.k && handOn() && !live.rides) {
      const dx = V.x - live.follow.x, dy = V.y - live.follow.y;
      if (!live.panOn) freezeLabelGlides();
      camSet(PAN, 1, dx, dy); live.panOn = true;
      applyView();
      clearTimeout(live.followT); live.followT = setTimeout(followEnd, 140);
      return;
    }
    // A short glide (+, −, Fit, a space that holds still) carries each label, leader and zone name with the spot it names, at
    // its own size, and lays them out once where the glide lands (they glide there from where they are seen). Solving the
    // layout on every frame of the glide (measuring the cards, trying hundreds of spots and orders) stalled it on a phone.
    if (sameB && live.gliding && !handOn() && !live.panOn) { ride(); return; }
    // A hand's zoom (a pinch, the wheel, a trackpad's pinch) carries them the same way, each with its own spot at its own size, for as
    // long as that leaves every label clear of the others, of their leaders, of the structures, of the cards and inside the free space
    // (rideHolds); a frame where it would not, they are placed again (gliding there), and once the hand lets go, placed for where it
    // stopped. Placing them in full on every frame of a pinch (measuring, then trying hundreds of spots) is what made zooming lag.
    // (While a hand zooms, the labels keep their slots and ride with the figure whether or not the spot they ride to is still clear: they are placed
    // again, gliding, when the hand lets go. Placed again mid-gesture, a label jumped to another slot while the figure moved under the hand: 3 Nov 2026.)
    if (sameB && live.follow.ride && V.k !== live.follow.k && handOn()) {
      unpan();   // (a pan's shared shift before it: ride moves each piece from the layout itself)
      ride(); clearTimeout(live.followT); live.followT = setTimeout(followEnd, 140);
      return;
    }
    // Baked where they are seen (bakeFollow): drawn so this frame, and laid out in the next one, gliding from here. The page used to be
    // made to take the baked places in at once (a layout read in the frame) so the glide could start in the same frame.
    if (bakeFollow()) { relayout(); return; }
    // (No glide after a hand's pan or zoom lets go: the labels take their final spots at once, never easing there; Mohammad, 6 Nov 2026.)
    live.layoutN++;
    // A label that moves while the view holds still (a term lit, a value's width changed) is there in this frame, and so is one that follows
    // a pan or zoom (the DOM label no longer glides under its GPU name: the glide class and its rule were removed, 8 Nov 2026).
    const wasFollow = live.follow;   // (put back should the labels wait to be measured, below)
    const nf = wasFollow === follows[0] ? follows[1] : follows[0];
    // (A name travels with the camera while a hand, a camera glide or the dive moves it: it is carried, never faded. Any other layout's move fades, Reduce Motion too.)
    const still = !handOn() && !live.gliding && !live.layerScaled;
    live.layoutKey = 'laid'; fillBase(nf, fr0, g); nf.k = V.k; nf.x = V.x; nf.y = V.y; nf.ride = null; live.follow = nf;
    pickAnchors(fr0);
    if (LC.vbW !== g.W || LC.vbH !== g.H) { LC.vbW = g.W; LC.vbH = g.H; LC.vb = `0 0 ${g.W} ${g.H}`; }   // alloc-rare: only when the lobule's size changed
    if (setGeo(leaders, 'viewBox', LC.vb)) leadGL.paint();
    // Every label has a leader to what it names, aimed at the label's centre and stopping on the edge of its letters.
    // Score nearby placements together so zooming, panning and narrow screens do not stack labels.
    const fr = fr0, placed = LC.placed;
    placed.length = 0;
    if (live.lymphOn) {
      // The lymph label follows whichever lymphatic is in view (the picked triad's first, else the one nearest the middle).
      const mx = (fr0.l + fr0.r) / 2, my = (fr0.t + fr0.b) / 2, cur = pick.lt ?? pick.triad;
      let curIn = false, bestI = -1, bestD = 0;
      for (let i = 0; i < 6; i++) {
        const p = g.triads[i].lv.pts[0], x = p[0] * V.k + V.x, y = p[1] * V.k + V.y;
        if (!(x > 0 && x < g.W && y > 0 && y < g.H)) continue;
        if (i === cur) curIn = true;
        const d = Math.hypot(x - mx, y - my);
        if (bestI < 0 || d < bestD) { bestI = i; bestD = d; }
      }
      pick.lt = curIn ? cur : bestI < 0 ? null : bestI;
      if (pick.lt == null) pick.lt = pick.triad;
    }
    // Open cards over the figure (a presenter slide's numbers, notices) and the labelled structures themselves:
    // a label pays heavily to sit on either, so at large text sizes the labels move off them rather than cover them.
    // (Their boxes as kept, snap.cards: read at a rest boundary, never in the frame; a new reading is a new list, this one is never written.)
    const cards = snap.cards;
    // What no label may cover: the central vein, every portal tract (venule, arteriole, ductule and lymphatic) and the
    // spot each label names, each a disc on screen. A label is pinned just beside what it names, on a short leader, clear of them all.
    const keep = keepDiscs(g);
    // The letters' halo reaches past each label's box, more so at larger text: the margins grow with it.
    // Each box also takes in the label's pill (it reaches 4×5 px past the text at --label-k 1) and half the gap kept
    // between two labels, so no two pills ever touch.
    const lk = parseFloat(document.documentElement.style.getPropertyValue('--label-k')) || 1, hm = 4 + 2 * lk,
      hx = Math.max(hm, 4 * lk + 5), hy = Math.max(hm, 5 * lk + 5);
    LC.fr = fr; LC.cards = cards; LC.keep = keep; LC.lk = lk; LC.hx = hx; LC.hy = hy;
    // (What a label must keep clear of, for the browser check that proves a label left out had no clear spot: written between frames.)
    const room = LC.room;
    room.fr[0] = fr.l; room.fr[1] = fr.t; room.fr[2] = fr.r; room.fr[3] = fr.b; room.pad = 8 + 4 * lk; room.hx = hx; room.hy = hy; room.cards = cards; room.nk = keep.length;
    for (let i = 0; i < keep.length; i++) { const kr = room.keep[i] || (room.keep[i] = [0, 0, 0]); kr[0] = keep[i].x; kr[1] = keep[i].y; kr[2] = keep[i].r; }   // alloc-once: a pair is made the first time that many discs are kept, then reused
    if (!roomT) roomT = restPass(writeRoom);
    const zoneBoxes = placeZones(fr0, hx, hy, callRingAt(fr0));
    for (let i = 0; i < zoneBoxes.length; i++) placed.push(zoneBoxes[i]);
    // Measured first; then placed one at a time, in a few orders, keeping the order that leaves no label on another
    // and no leader under another label (or the fewest), so an early label never blocks a later one's only clear spot.
    const items = LC.items;
    items.length = 0;
    const shK = LC.shK, shL = LC.shL;
    let ns = 0;
    for (let ki = 0; ki < LAY_ORDER.length; ki++) {
      const k = LAY_ORDER[ki], L = labs[k];
      if (!L) continue;
      if (labelLayerOff(k)) { fadeOut(L.el); leadOff(L); continue; }   // (the arteriole and the ductule are named always, 16 Nov 2026; left out first where room is short: dropCost)
      // (Shown to be measured; one that was hidden and stays out is hidden again before anything is drawn.)
      L.peek = isHid(L.el); setHid(L.el, false);
      shK[ns] = k; shL[ns] = L; ns++;
    }
    // Too wide for the free space (large text, a narrow screen): the label stacks its second reading.
    // A label's size is read back from the page only when what decides it changed (its text and classes, the text size,
    // the theme, the window, the fonts): each read lays the page out, and two of them on every frame of a pinch were most
    // of what placing the lobule's labels cost. Otherwise the sizes last read are used, which are the same numbers.
    const env = sizeEnv(), fw = (fr.r - fr.l) * 0.32, stack = LC.stack, sizes = LC.sizes;
    let allKnown = true;
    for (let i = 0; i < ns; i++) { const sz = shL[i].sz; if (!(sz && (sz.w0 > fw && sz.u2 ? sz.s1 : sz.s0))) { allKnown = false; break; } }
    if (allKnown) {
      // (Measured for what decides their sizes now, or, where something changed since (a class on the lobule mid-dive, new words),
      // for what came before: laid out with those, and measured afresh in a task after this frame (measureRun), which lays them out
      // again only should a size have changed.)
      let stale = false;
      for (let i = 0; i < ns; i++) if (shL[i].sz.key !== labKey(env, shL[i])) { stale = true; break; }
      if (stale) { wantLabels(ns, fw); if (!live.measT) live.measT = restPass(measureRun); }
      for (let i = 0; i < ns; i++) {
        const L = shL[i], sz = L.sz;
        stack[i] = sz.w0 > fw && sz.u2;
        classSoon(L.el, 'stack', stack[i]);
      }
      for (let i = 0; i < ns; i++) sizes[i] = stack[i] ? shL[i].sz.s1 : shL[i].sz.s0;
    } else {
      // Never measured at this width: measured in a task after this frame (measureRun), and laid out in the next frame. The labels
      // stay as they are seen until then (one frame); the frame itself never reads the page.
      for (let i = 0; i < ns; i++) if (shL[i].peek) setHid(shL[i].el, true);
      wantLabels(ns, fw);
      if (!live.measT) live.measT = restPass(measureRun);
      live.layoutKey = ''; live.follow = wasFollow;
      return;
    }
    let ni = 0;
    for (let i = 0; i < ns; i++) {
      const k = shK[i], L = shL[i], w = sizes[i][0], hh = sizes[i][1];
      const p = anchorOf(k), ax = p[0] * V.k + V.x, ay = p[1] * V.k + V.y;
      const outside = k === 'lymph' ? ax < 0 || ax > g.W || ay < 0 || ay > g.H : ax < fr.l - 4 || ax > fr.r + 4 || ay < fr.t - 4 || ay > fr.b + 4;
      // What it names has left the screen: the label waits at the free space's edge, pointing the way (a tap brings it back into view).
      const chip = outside && k !== 'lymph';
      const off = (outside && !chip) || fr.r - fr.l < w + 16 || fr.b - fr.t < hh + 16;
      if (off) { if (L.peek) { setHid(L.el, true); classSoon(L.el, 'edge', false); } else fadeOut(L.el); leadOff(L); continue; }
      classSoon(L.el, 'edge', chip);
      const it = LC.pool[ni++];
      it.k = k; it.L = L; it.w = w; it.hh = hh; it.a[0] = ax; it.a[1] = ay; it.edge = null;
      if (chip) {
        const mx = (fr.l + fr.r) / 2, my = (fr.t + fr.b) / 2, dx = ax - mx, dy = ay - my, pad = 10;
        const sx = (fr.r - fr.l) / 2 - w / 2 - pad, sy = (fr.b - fr.t) / 2 - hh / 2 - pad;
        const f = Math.min(sx / Math.max(Math.abs(dx), 1e-6), sy / Math.max(Math.abs(dy), 1e-6));
        const ang = Math.atan2(dy, dx), c = Math.cos(ang), sn = Math.sin(ang);
        it.ea[0] = mx + dx * f; it.ea[1] = my + dy * f; it.edge = it.ea;
        const er = Math.min(w / 2 / Math.max(Math.abs(c), 1e-6), hh / 2 / Math.max(Math.abs(sn), 1e-6)) + 7;
        L.edgeA = ang; L.edgeR = er;
      }
      items.push(it);
    }
    const ring = callRingAt(fr), hex = hexOf();
    LC.ring = ring; LC.hex = hex;
    // The slide's pointer pill is placed first (it is the slide's point): the labels then keep clear of it and its leader.
    const pre = LC.pre, base = LC.base;
    pre.length = 0; for (let i = 0; i < placed.length; i++) pre.push(placed[i]);
    const callLead = placeCall(fr, placed, cards, LC.none, crosses, ring, hex, keep, into, callOutMain);
    base.length = 0; for (let i = 0; i < placed.length; i++) base.push(placed[i]);
    LC.ld0.length = 0; if (callLead) LC.ld0.push(callLead);
    // The designed spots: where the portal tract stands, outward from the central vein.
    let triIt = null, lyIt = null;
    for (let i = 0; i < items.length; i++) { if (items[i].k === 'triad') triIt = items[i]; else if (items[i].k === 'lymph') lyIt = items[i]; }
    const paired = !!triIt && !!lyIt && !triIt.edge && !lyIt.edge && (pick.lt ?? pick.triad) === pick.triad;
    // (Outward along the screen's axis nearest the ray: out to the side from a side corner, down or up from a bottom or top one. The
    // venule's name is split above (side corner) or left (top or bottom corner) of that axis, the lymphatic's below or right.)
    if (triIt) {
      const dx = triIt.a[0] - (g.cx * V.k + V.x), dy = triIt.a[1] - (g.cy * V.k + V.y);
      if (Math.abs(dx) >= Math.abs(dy)) { LC.ux = Math.sign(dx) || -1; LC.uy = 0; } else { LC.ux = 0; LC.uy = Math.sign(dy) || 1; }
    } else { LC.ux = -1; LC.uy = 0; }
    LC.nx = LC.ux ? 0 : -1; LC.ny = LC.ux ? -1 : 0;
    let tractR = 14;
    if (triIt) for (let i = 0; i < keep.length; i++) if (Math.hypot(keep[i].x - triIt.a[0], keep[i].y - triIt.a[1]) < 1) { tractR = keep[i].r ?? 14; break; }
    LC.tractR = tractR; LC.paired = paired; LC.triIt = triIt; LC.lyIt = lyIt;
    // (The two split about the line midway between the venule and the lymphatic, each box, margins and all, wholly on its side; on a
    // phone whose corner is near the screen's edge the line moves toward the venule's side until the lymphatic's name fits.)
    const nx = LC.nx, ny = LC.ny;
    let pairN = paired ? (triIt.a[0] * nx + triIt.a[1] * ny + (lyIt.a[0] * nx + lyIt.a[1] * ny)) / 2 : 0;
    if (paired) {
      const pad = 8 + 4 * lk, half = nx ? lyIt.w / 2 + hx : lyIt.hh / 2 + hy;
      // (how far the lymphatic's box, its far edge 2 px + its width past the line, reaches past the free space on its side)
      const far = pairN - 2 - 2 * half, lim = nx ? (nx < 0 ? -(fr.r - pad + hx) : fr.l + pad - hx) : (ny < 0 ? -(fr.b - pad + hy) : fr.t + pad - hy);
      const over = lim - far;
      if (over > 0) pairN += over + 1;
    }
    LC.pairN = pairN; tractFan(LC.fan, g.triads[pick.triad], [g.cx * V.k + V.x, g.cy * V.k + V.y], V, g.R, keep[pick.triad + 1].r, items, (pick.lt ?? pick.triad) === pick.triad, fr, hx, hy);   // alloc-rare: one pair a layout, never a frame of a hand's move
    let sol = solve(items, base, LC.ld0, SOL_A);
    // (Mid-pinch, the first order is kept; the full search runs once the hand lets go.)
    live.rough = sol.total >= 1e5 && handOn();
    if (live.rough) { clearTimeout(live.followT); live.followT = setTimeout(followEnd, 140); }
    if (sol.total >= 1e5 && !live.rough) {
      // Every order of up to six labels (720 at most, only while a clash remains: a few milliseconds).
      let trial = SOL_B;
      const idx = LC.idx, ord = LC.ord;
      permStart(idx, items.length);
      searchBudget.begin();
      do {
        const s2 = solve(permOf(items, idx, ord), base, LC.ld0, trial);
        if (s2.total < sol.total) { trial = sol; sol = s2; }
        if (sol.total < 1e5 && items.length > 5) break;   // (up to five labels, 120 orders at most: the shortest leaders win, not just the first clear order)
        if (searchBudget.over()) break;
      } while (nextPerm(idx, items.length));
      if (sol.total >= 1e5 && !searchBudget.over()) sol = retryClash(sol, items, fr, ring, hex, cards, keep, callLead);
      // (Cut at its deadline: the best layout so far is laid, and the search is run again from the start next frame with a longer one, LZ2-1.)
      if (searchBudget.end()) nextFrame(() => { if (live.geo && live.fade > 0) { live.layoutKey = ''; lzLoop.want(true); } });
    }
    // A label waiting at the edge (what it names is off screen) never lies across another label's leader: its place is
    // set by the way it points, so it gives way (at 200 % text on a phone the Central vein's chip covered the Sinusoids' node).
    const res = sol.res, nr = sol.n, lt = LC.ink0, qq = LC.q;
    let anyCrossed = false;
    for (let i = 0; i < nr; i++) {
      const r = res[i], c = r.it;
      r.crossed = false;
      if (r.out || !c.edge) continue;
      lettersInto(lt, c.L, r.x - c.w / 2, r.y - c.hh / 2, c.w, c.hh);
      for (let j = 0; j < nr; j++) {
        const o = res[j];
        if (o === r || o.out || o.it.edge) continue;
        qq[0] = o.x; qq[1] = o.y;
        if (runInside(o.it.a, qq, lt) > 0.5) { r.crossed = true; anyCrossed = true; break; }
      }
    }
    if (anyCrossed) for (let i = 0; i < nr; i++) if (res[i].crossed) res[i].out = true;
    // (What a hand's zoom checks as it carries them: rideHolds.)
    if (!classHas(callRing, 'on')) {
      const R = live.follow.rideBuf;
      let nl = 0, nc = 0;
      for (let i = 0; i < nr; i++) {
        const r = res[i];
        if (r.out) continue;
        const a = r.it.a;
        if (!r.it.edge) {
          const e = R.labs[nl++] || (R.labs[nl - 1] = { a: [0, 0], c: [0, 0], box: { l: 0, r: 0, t: 0, b: 0 } });   // alloc-once: a record is made the first time that many labels ride, then reused
          e.a[0] = a[0]; e.a[1] = a[1]; e.c[0] = r.x; e.c[1] = r.y; e.box.l = r.box.l; e.box.r = r.box.r; e.box.t = r.box.t; e.box.b = r.box.b;
        } else {
          const e = R.chips[nc++] || (R.chips[nc - 1] = { a: [0, 0], box: { l: 0, r: 0, t: 0, b: 0 } });   // alloc-once: a record is made the first time that many chips ride, then reused
          e.a[0] = a[0]; e.a[1] = a[1]; e.box.l = r.box.l; e.box.r = r.box.r; e.box.t = r.box.t; e.box.b = r.box.b;
        }
      }
      for (let i = 0; i < zoneBoxes.length; i++) {
        const z = R.zones[i] || (R.zones[i] = { l: 0, r: 0, t: 0, b: 0 }), b = zoneBoxes[i];   // alloc-once: a box is made the first time that many zone names ride, then reused
        z.l = b.l; z.r = b.r; z.t = b.t; z.b = b.b;
      }
      R.nl = nl; R.nc = nc; R.nz = zoneBoxes.length; R.cards = cards; R.ix = 8 + 4 * lk - hx; R.iy = 8 + 4 * lk - hy;
      live.follow.ride = R;
    }
    // (A call-out's ring on, the buffer above is not filled, but a hand's zoom still carries the labels by ride(), which moves the call-out too: the flag must stand,
    // or a pinch laid every label out in full on every frame there, and they jumped between slots. 6 Nov 2026.)
    if (!live.follow.ride) live.follow.ride = live.follow.rideBuf;
    // (Every label's letters where it lands, for the leaders to keep off.)
    const inks = LC.inks;
    let nInk = 0;
    for (let i = 0; i < nr; i++) {
      const r = res[i];
      if (r.out) continue;
      const c = r.it;
      lettersInto(inks[nInk++], c.L, r.x - c.w / 2, r.y - c.hh / 2, c.w, c.hh);
    }
    for (let i = 0; i < nr; i++) {
      const r = res[i], it = r.it, L = it.L, k = it.k, w = it.w, hh = it.hh, a = it.a, edge = it.edge, x = r.x, y = r.y;
      const ax = rnd1(a[0]), ay = rnd1(a[1]);
      if (L.atX !== ax || L.atY !== ay) { L.atX = ax; L.atY = ay; L.atS = `${ax},${ay}`; }
      restAttr(L.el, 'data-at', L.atS);
      if (r.out) { if (L.peek) { setHid(L.el, true); classSoon(L.el, 'edge', false); } else fadeOut(L.el); leadOff(L); continue; }
      fadeIn(L.el);
      put(L.el, x - w / 2, y - hh / 2);
      noteAt(L, still && !L.peek);
      classSoon(L.el, 'left', !edge && (k === 'triad' || k === 'lymph') && x + w / 2 < a[0] - 4);
      if (edge) { leadOff(L); continue; }
      // (The label's spot is kept in the label's own pair: the layout's records are written again by the next.)
      const ab = L.ab || (L.ab = [0, 0]);   // alloc-once: a label's pair is made with its first layout
      ab[0] = a[0]; ab[1] = a[1];
      // (One leader rule for every view, label-place.js needsLeader: the line shows once the name stands past 12 px of what it names, from the letters' box
      // to the point, or to the central vein's rim, and stays until it comes within 8; a name that stands against it names it by standing there.)
      const gapPx = Math.hypot(Math.max(0, Math.abs(a[0] - x) - w / 2), Math.max(0, Math.abs(a[1] - y) - hh / 2)) - (k === 'cv' ? cvKeep(g) + hx : 0);
      L.hadLead = needsLeader(false, gapPx, L.hadLead);
      if (!L.hadLead) { classSoon(L.line, 'ld-gone', true); classSoon(L.dotEl, 'ld-gone', true); L.a = ab; continue; }
      leadOn(L);
      L.a = ab;
      setGeo(L.line, 'x1', a[0]); setGeo(L.line, 'y1', a[1]);
      leadTo(L, lettersInto(lt, L, x - w / 2, y - hh / 2, w, hh), inks, nInk);
      setGeo(L.dotEl, 'cx', a[0]); setGeo(L.dotEl, 'cy', a[1]);
      leadGL.paint();
    }
    mirrorAll();   // (their classes as laid out, a label at the edge or on the left, and the ones now shown: read again between frames)
  }
  return { LC, VIEW, applyView, layoutLabels, lettersInto, setDive };
}
