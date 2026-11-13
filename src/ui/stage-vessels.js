// The vessels on the GPU: coil and varix-spread ease, the morph frame, colours, radii, colour pass, syncVeins and drawVeins.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { TIERS_ON, TIER_TOP, motionK, sharpMoving, tierK } from './adapt-tier.js';
import { CONTEXT_EDGES, FEEDERS, IVC_EDGES, SIN_EDGES, VIEW } from './anatomy.js';
import { cssColor8 } from './css-color.js';
import { createColourFollow } from './display-state.js';
import { D_SURFACE, easeMove } from './ease.js';
import { PEEL_GLOW, peelAt, peelGlow } from './flow-peel.js';
import { PINCH_LOW_K, easeNow, figLab, figOpt, inMotion } from './frame.js';
import { writeGlowTexels } from './glow-texels.js';
import { gpuProbe } from './gpu-probe.js';
import { liftEnd, nearPath } from './highlight-math.js';
import { LIGHT } from './light.js';
import { lookChanged, newLookSig } from './look-sig.js';
import { reduceMotionMQ as reduceMotion } from './motion.js';
import { alongCurve } from './pressure-along.js';
import { sinceInput } from './quiet.js';
import { SIN_PERFUSION, sinStrandRadius } from './sin-perfusion.js';
const VARIX_FADE_TO = 0.88;   // how much of the esophageal varices fades while the EUS-PPG scope is in front of them (a faint ghost of them stays)
import { createSweepClient } from './sweep-client.js';
import { clamp } from './util.js';
import { frontKey, fronted } from './collateral-front.js';
import { beadRadius } from './varix-bead.js';
import { LOOK_SITE } from './varix-look.js';
import { JOIN_F_NOFADE } from './tube-join-glsl.js';
import { newJoinStore, runOnSamples, smoothRunOn as smoothPass, veinJoins as joinsPass } from './vein-joins.js';
import { F_DIFFUSE, F_DOTTED, F_NOCASE, F_SHADOW, F_SHUNT, F_SPEC, F_VEIL, F_WHOLE, TUBE_TEXELS, binVeins } from './veins-gl.js';
import { writeJoinNow, writePoints } from './veins-sweep.js';
import { chainsOf, planChainInto } from './vessel-taper.js';

import { stageScope } from './stage-scope.js';
export function createVessels(st, live) {
  const { E, EV, FADE_DOWN_Y, FADE_IN, FEEDER_FADE_Y, GL_ROWS, IVC_JOIN, LIGATED, MAP, MORPH_GPU, MORPH_JSLACK, MORPH_SLACK, N_SAMPLES, ORIGIN_LUMEN, PORTAL_CASING, SIN_FADE, STRAIGHT_COLL, TIER_ALPHA, TIER_ART, TIER_GROUP, TIER_LIFT, TIER_LIFT_FRONT, W_TAU, arcLen, binList, binMemo, binTube, binTubeOf, divideLen, easeInOut, edgeQ, geo, getOrganCovers, glow, joinKey, joinRoom, joinsKept, joinsOf, keep, layerMode, lenOfItem, levelTier, morphMiss, morphOff, morphTrackSoon, mt, noteMoveFrame, reachOf, refreshCTM, rowKey, selAKey, setOf, settleRes, spot, spotOn, strandAt, subPixel, sweepPiece, syncMapInk, tubeData, tubeFill, vCanvas, vesselAt, vh, viewKeep, viewNext, viewSame, widthMoving, wrap, wrapCS, wrapCls } = st;
  // ── A coil or a varix's spread easing at rest, on the GPU (2 Nov 2026, Mohammad: "Move. Everything. To. GPU.") ──
  // A slide change that grows or shrinks a varix eases its channels' coil (g.wig toward g.wigT) and its strands' fan (g.spr toward
  // g.sprT) over a second or two, and the strands spread into cells their binning did not list: 10 to 19 whole binnings of every vessel
  // and 46 to 121 MB sent up in one Varices slide change (motion budget, headless phone, 3 Nov). The targets move as the model does
  // through the change (a channel's growth there went 0, 0.42, 0.24, 0.33, 1), so no course made for one target lasts. But a coil and a
  // fan only ever lie between their bounds (a coil's amplitude 0 to COIL_MAX, a fan 0.55 to 1, varix-look.js), so every shape a
  // collateral can take lies within the courses its points take round that box (ENV_AT: its corners, sides and a diagonal; a point
  // between them is nearer one of them than the slack). That envelope is made once while the figure rests (envCheck), in the worker,
  // as a stretch of the change between the views is (sweepPiece), for every collateral whether shown or not and every strand however
  // faded, so the vessels a slide change shows are in it too. Each frame of an ease then sends only its points and joins (frameFrom),
  // and the vessels are drawn from them exactly as from a binning of their own. A frame that leaves it (a vessel shown that was not
  // there, one wider than it was binned for) is binned as before, and the envelope made again at the next rest.
  const EASE_GPU = MORPH_GPU, COIL_MAX = 5, COLL_REACH = 32;
  const ENV_AT = [[0, 0.55], [COIL_MAX / 2, 0.55], [COIL_MAX, 0.55], [COIL_MAX, 0.775], [COIL_MAX, 1], [COIL_MAX / 2, 1], [0, 1], [0, 0.775], [0, 0.55], [COIL_MAX / 2, 0.775], [COIL_MAX, 1]];
  const et = { key: '', gen: 0, pc: null, restT: 0, checkT: 0, stats: { gpu: 0, builds: 0, miss: {} } };
  // (A vessel it does not hold, or one wider than it was made for: made again at the next rest. A course or a join off it is binned as before.)
  const easeMiss = (why) => { et.stats.miss[why] = (et.stats.miss[why] || 0) + 1; if (why === 'vessels' || why === 'reach') { et.key = ''; envSoon(); } return false; };
  const coils = (x) => x.e.kind === 'collateral' && !x.e.spontaneous && !STRAIGHT_COLL.has(x.e.id);
  // Everything an ease can draw: the figure's vessels (as glItems lists them) with every vessel, strand and feeder,
  // shown or not, with a coil of w and a fan of sp. Pure: the coils and fans are put back.
  function envItemsAt(w, sp) {
    const saved = [], t = easeInOut(live.morph), anat = live.morph < 0.5, items = [];
    for (const x of EV) if (coils(x)) { const g = geo[x.e.id]; saved.push([g, g.wig, g.spr]); g.wig = w; if (x.strands && LOOK_SITE[x.e.id]) g.spr = sp; }
    try {
      for (const x of EV) {
        const g = geo[x.e.id];
        if (!g?.cur) continue;
        const v = vesselAt(x, t);
        items.push({ x, obj: x, row: x.row, pts: v.pts, kind: 'v' });
        if (!anat && x.cbr) for (const cb of x.cbr) if (cb.w) items.push({ x, obj: cb, row: cb.row, pts: cb.cur, kind: 'c' });
        if (!anat || x.isArt || x.ghost) continue;
        for (const sd of x.strands || []) if (sd.cur) items.push({ x, obj: sd, row: sd.row, pts: strandAt(x, sd, t, v), kind: 's' });
        for (const fd of x.feeders || []) if (fd.cur) items.push({ x, obj: fd, row: fd.row, pts: fd.cur, kind: 'f' });
      }
      return cavaAsOne(items, lenOfGeo);
    } finally { for (const [g, wg, s0] of saved) { g.wig = wg; g.spr = s0; } }
  }
  function envSoon() {
    if (!EASE_GPU || et.checkT) return;
    et.checkT = stageScope.timer(envCheck, 600);
  }
  // At rest, the envelope for the figure as it stands, made when what it holds changed (the view's side, the vessels it can show).
  function envCheck() {
    et.checkT = 0;
    if (!live.veins || live.veins.lost || live.morph !== live.morphTarget || !wrap.classList.contains('gl-on') || live.lobuleOn) return;
    if (inMotion() || live.coilEasing) { envSoon(); return; }
    const rows = rowKey(envItemsAt(0, 1)), key = `${live.morph}|${rows}`;
    if (key === et.key && et.pc?.set?.owner === live.veins) return;
    et.key = key;
    const gen = ++et.gen, snaps = [], pc = { set: null }, shown = new Set(glItems().map((it) => it.row));
    et.stats.builds++;
    // (One moment a task, as the change's stretches are made: each is a pass over every vessel and its joins.)
    // (Each pass over the joins is a task of its own, and none starts while the page is touched or moving: three passes a moment in
    // one task were 150 to 270 ms each, headless, a dozen of them through the first seconds after a load, start-up profile 2 Nov 2026.)
    let part = null;
    const next = () => {
      if (gen !== et.gen || !live.veins || live.veins.lost) return;
      if ((inMotion() || sinceInput() < 700) && snaps.length < 2 * ENV_AT.length) { stageScope.timer(next, 200); return; }
      if (snaps.length < 2 * ENV_AT.length) {
        const m = snaps.length >> 1, [w, sp] = ENV_AT[m];
        if (!part) { const items = envItemsAt(w, sp); part = { items, o: joinsKept(items), J2: null }; stageScope.timer(next, 0); return; }
        // (The joins half way from the moment before too: an end's join can move across the step.)
        const P = m && ENV_AT[m - 1];
        if (!part.J2) { part.J2 = P ? joinsKept(envItemsAt((P[0] + w) / 2, (P[1] + sp) / 2)).J : []; stageScope.timer(next, 0); return; }
        const { items, o, J2 } = part;
        part = null;
        // (Each moment twice: with only the vessels shown now, and with every one. Which vessels are there changes how their runs are
        // smoothed where they meet (smoothRunOn): a vein running on into a hidden collateral was 6.4 off its course with every one.)
        const own = joinsKept(items.filter((it) => shown.has(it.row)));
        snaps.push({ items, J: own.J, smooth: own.smooth, reach: o.reach, J2: [], own: own.smooth }, { items, ...o, J2, own: o.smooth });
        stageScope.timer(next, 0); return;
      }
      if (snaps.some((sn) => rowKey(sn.items) !== rows)) return;
      pc.rows = rows;
      // (A collateral widens as its varix grows through the change: its reach given 40% more room, past the quarter every vessel gets.
      // A frame wider than that was binned on the CPU, 12 of the 35 frames of a Varices 2 to 3 change, headless phone. The reach only
      // says which cells list a vessel; the drawing is unchanged.)
      const coll = new Set(snaps[0].items.filter((it) => it.x.e.kind === 'collateral').map((it) => it.row));
      // (A feeder not grown yet has no reach of its own to go by (C3's, 20 to 22 once grown, was binned for none): a collateral's rows
      // get at least COLL_REACH.)
      const more = new Map(snaps[0].items.map((it) => [it.row, coll.has(it.row) ? Math.max(COLL_REACH, (live.vBinReach.get(it.row) || snaps[0].reach.get(it.row) || 0) * 1.4) : live.vBinReach.get(it.row) || 0]));
      sweepPiece(pc, snaps, more).then((b) => {
        if (gen !== et.gen || !b || !live.veins || live.veins.lost) return;
        setOf(pc, b);
        const old = et.pc;
        et.pc = pc;
        if (old?.set) { if (mt.using === old.set) morphOff(); old.set.owner.dropMorphSet(old.set); }
      }, () => {});
    };
    stageScope.timer(next, 0);
  }
  // A frame of an ease drawn from its stretch, when its vessels fit it. Each vessel's course is followed between the two moments its
  // share of the ease left lies between (the vessels not easing have one course at every moment).
  const sOfNone = () => -1;
  let morphS = 0;   // (the moment a frame of the change lies at, for sOfMorph: frameFrom runs at once and is never re-entered)
  const sOfMorph = () => morphS;
  function coilFrame(items) {
    const pc = et.pc;
    if (!EASE_GPU || !pc?.set || pc.set.owner !== live.veins) return false;
    if (!live.coilEasing && mt.using !== pc.set) return false;   // (at rest, from a binning of its own: binned as before)
    // (Each point checked against its courses round the box: an ease can be anywhere in it.)
    if (!frameFrom(pc, items, sOfNone, easeMiss)) return false;
    et.stats.gpu++;
    // (Landed, the figure goes back to a binning of its own once the page is quiet: the envelope's lists are wider than it needs.)
    stageScope.clear(et.restT);
    et.restT = stageScope.timer(easeRest, 1500);
    return true;
  }
  function easeRest() {
    et.restT = 0;
    if (live.easeHeld) return;   // (held for a check: binned when it asks, rebinNow)
    if (!et.pc?.set || mt.using !== et.pc.set) return;
    if (live.coilEasing || inMotion() || live.inUpdate) { et.restT = stageScope.timer(easeRest, 600); return; }
    morphOff();
    live.vBinKey = ''; live.binShown = null; live.bendShown = null;
    syncVeins(easeInOut(live.morph));
  }
  // (The worker's lifecycle, sweep-client.js: a dead or stuck one is dropped and its requests rejected; the next request restarts it,
  // up to a few times in a row, and the callers fall back to the main thread on a rejection.)
  const sweeper = createSweepClient(() => new Worker(new URL('./sweep-worker.js', import.meta.url), { type: 'module' }));
  const sweepBin = (msg) => sweeper.request(msg);
  const FAR_ROW = Array.from({ length: N_SAMPLES }, () => [1e9, 1e9]);
  // How far (squared) a join's centre lies from the course of its centres through the stretch.
  function joinOff(x, y, C) {
    if (C.length === 1) return (x - C[0][0]) ** 2 + (y - C[0][1]) ** 2;
    let best = Infinity;
    for (let i = 0; i + 1 < C.length; i++) {
      const ax = C[i][0], ay = C[i][1], dx = C[i + 1][0] - ax, dy = C[i + 1][1] - ay, L2 = dx * dx + dy * dy || 1e-9;
      const h = clamp(((x - ax) * dx + (y - ay) * dy) / L2, 0, 1), ex = ax + dx * h - x, ey = ay + dy * h - y;
      best = Math.min(best, ex * ex + ey * ey);
    }
    return best;
  }
  // A frame of the change drawn from the stretch made for it, when its vessels fit it: their points and joins sent up; else false.
  function morphFrame(items) {
    if (live.morph === live.morphTarget && coilFrame(items)) return true;   // (a coil or a varix's spread easing at rest: envCheck)
    if (!MORPH_GPU || !mt.pieces) return false;
    const t = easeInOut(live.morph), now = performance.now();
    if (live.morph !== live.morphTarget) mt.landAt = now;
    else if (!mt.using || now - mt.landAt > 1000) return false;   // (at rest: binned as before; the landing frames stay on the stretch)
    const anat = live.morph < 0.5;
    let pc;   // (the first stretch of this side that t falls in: a loop, no closure)
    for (let q = 0; q < mt.pieces.length; q++) { const p = mt.pieces[q]; if (p.anat === anat && t >= p.t0 && (anat ? t < p.t1 || p.t1 === 0.5 : t <= p.t1)) { pc = p; break; } }
    if (!pc?.set || pc.set.owner !== live.veins) return morphMiss(pc?.bad ? 'unfit stretch' : 'not ready');
    // Where t falls among the stretch's moments.
    let s = 0;
    while (s < pc.ts.length - 2 && t > pc.ts[s + 1]) s++;
    morphS = s;
    if (!frameFrom(pc, items, sOfMorph, morphMiss)) return false;
    // (Landed, the figure goes back to a binning of its own once the page is quiet, as after a coil's ease (easeRest): left on the piece at rest, every model
    // frame's colour update was refused as a partial draw ('switch piece', 6a768ab) and drew the whole vessel layer again, 6 a second, "no kept layer"
    // (his Mac ?perf, 11 Nov 2026: 25 fps at rest, the GPU 29 ms a frame).)
    stageScope.clear(mt.restT);
    mt.restT = stageScope.timer(pieceRest, 1000);
    return true;
  }
  function pieceRest() {
    mt.restT = 0;
    if (!mt.using) return;
    if (live.easeHeld) return;   // (held for a check: binned when it asks, rebinNow)
    if (live.morph !== live.morphTarget || live.coilEasing || inMotion() || live.inUpdate) { mt.restT = stageScope.timer(pieceRest, 600); return; }
    morphOff();
    live.vBinKey = ''; live.binShown = null; live.bendShown = null;
    syncVeins(easeInOut(live.morph));
  }
  // A frame drawn from a stretch's binning (pc), when its vessels fit it, with `sOf(it)` the moments its course lies between: every point
  // within the slack of where it went between its two (the cells and the circles were swept over the hull of each piece of a vessel at
  // the two, so a piece whose ends are within the slack of their courses is within the slack of that hull). Else morphMiss(why), false.
  // (Kept for frameFrom, which runs every frame of a vessel morph and is never re-entered: the rows it draws, the joins it has used, and a join's test.)
  const FR_DRAWN = new Set(), NO_JOINS = [];   // alloc-rare: kept, made once for the stage
  let FR_ON = new Uint8Array(64);   // alloc-rare: kept, made once for the stage (grown below if a stretch has more joins)
  function joinMatches(q, j) {
    if (q.trunk !== j.trunk || !!q.fork !== !!j.fork) return false;
    for (let a = 0; a < j.members.length; a++) { const i = q.members.indexOf(j.members[a]); if (!(i >= 0 && i < 4)) return false; }
    for (let a = 0; a < q.members.length; a++) { const m = q.members[a]; if (FR_DRAWN.has(m) && !j.members.includes(m)) return false; }
    return true;
  }
  const FR_STORES = [newJoinStore(), newJoinStore()];   // alloc-rare: kept, made once for the stage
  let frFlip = 0;
  function frameFrom(pc, items, sOf, morphMiss) {
    for (let i = 0; i < items.length; i++) if (!pc.path.has(items[i].row)) return morphMiss('vessels');
    // (A store of its own for this frame, the other the last one's: the courses it handed the renderer are not written over while it may read them.)
    frFlip ^= 1;
    const { J, smooth } = joinsOf(items, FR_STORES[frFlip]);
    const S2 = MORPH_SLACK * MORPH_SLACK;
    const buf = pc.frame;
    // (A vessel binned for the stretch that this frame does not draw is put far out of every cell's reach.)
    FR_DRAWN.clear();
    for (let i = 0; i < items.length; i++) FR_DRAWN.add(items[i].row);
    for (let q = 0; q < pc.pathRows.length; q++) if (!FR_DRAWN.has(pc.pathRows[q])) writePoints(buf, pc.posBase, N_SAMPLES, pc.pathRows[q], FAR_ROW);
    for (const it of items) {
      if (reachOf(it) > pc.reach.get(it.row)) return morphMiss('reach');
      const P = smooth.get(it.row) || it.pts, R = pc.path.get(it.row), s = sOf(it);
      if (P.length !== N_SAMPLES) return morphMiss('samples');
      // (s below 0: any of its courses, the nearest.)
      const s0 = s < 0 ? 0 : Math.min(s, R.length - 2), s1 = s < 0 ? R.length - 2 : s0;
      for (let i = 0; i < N_SAMPLES; i++) {
        let best = Infinity;
        for (let q = s0; q <= Math.max(s0, s1) && best > S2; q++) {
          const A = R[q], B = R[q + 1] || A;
          const ax = A[i][0], ay = A[i][1], ux = B[i][0] - ax, uy = B[i][1] - ay, L2 = ux * ux + uy * uy || 1e-9;
          const h = clamp(((P[i][0] - ax) * ux + (P[i][1] - ay) * uy) / L2, 0, 1), dx = P[i][0] - ax - ux * h, dy = P[i][1] - ay - uy * h;
          best = Math.min(best, dx * dx + dy * dy);
        }
        if (best > S2) return morphMiss('course');
      }
      writePoints(buf, pc.posBase, N_SAMPLES, it.row, P);
    }
    const nJ = pc.jpath.length;
    if (FR_ON.length < nJ) FR_ON = new Uint8Array(nJ * 2);   // alloc-rare: grown only when a stretch has more joins than any before
    else FR_ON.fill(0, 0, nJ);
    const on = FR_ON;
    for (let ji = 0; ji < J.length; ji++) {
      const j = J[ji];
      let u = -1, off = MORPH_JSLACK ** 2;
      for (const v of pc.jby.get(joinKey(j)) || NO_JOINS) { const d = joinOff(j.x, j.y, pc.jpath[v]); if (!on[v] && d <= off) { off = d; u = v; } }
      // (Else a join binned with more members, those this frame does not draw, and the same trunk: the shader blends only the members
      // a pixel has in reach, and a vessel not drawn has none, so it draws exactly this join. A vessel shown that the stretch binned
      // hidden changes which ends meet where: the joins of the vessels shown now are then among those of every vessel.)
      if (u < 0) for (let v = 0; v < pc.jof.length; v++) {
        const q = pc.jof[v];
        if (on[v] || !joinMatches(q, j)) continue;
        const d = joinOff(j.x, j.y, pc.jpath[v]);
        if (d <= off) { off = d; u = v; }
      }
      if (u < 0) return morphMiss('joins');
      if (j.reach > pc.jreach[u]) return morphMiss('join');
      writeJoinNow(buf, pc.joinBase, u, j.x, j.y, j.reach, j.k, j.fillet);
      on[u] = 1;
    }
    for (let u = 0; u < nJ; u++) if (!on[u]) writeJoinNow(buf, pc.joinBase, u, 0, 0, -1, 0, 0);
    for (const it of items) if (it.kind === 'v') it.obj.glPts = smooth.get(it.row) || it.pts;
    live.veins.useMorphSet(pc.set);
    live.veins.setMorphFrame(buf);
    for (const it of items) live.veins.setBend(it.row, smooth.get(it.row) || it.pts);
    mt.using = pc.set; live.binShown = null; live.bendShown = null; live.tubesNew = true;
    mt.stats.gpu++;
    return true;
  }
  const veinsRows = new Set();   // vessel rows whose attributes changed since the vessel layer was drawn (only those, while veinsDirty is false)
  // A lens switch crossfades every vessel from the colors it showed to the new lens's (no one-frame recolor).
  // The lumens' colours follow the model's through the widths' filter (display-state.js; combined plan M1), so a slider's step or
  // a model frame's is an ease, not a step. A crossfade (a lens change, a jump) carries its own change: the filter then shows the
  // target at once, as does Reduce Motion.
  const colFollow = createColourFollow({ tau: W_TAU }), colT = new Array(6);
  // (The rows the colour pass stepped this sync, for colFollow.prune: a row's number against this sync's, so none is cleared or made. Rows are small whole numbers.)
  const colRows = {
    gen: 1, a: new Uint32Array(1024),   // alloc-rare: kept, made once for the stage (doubled below if a row is beyond it)
    begin() { this.gen++; },
    add(r) { if (r >= this.a.length) { const b = new Uint32Array(Math.max(r + 1, this.a.length * 2)); b.set(this.a); this.a = b; } this.a[r] = this.gen; },   // alloc-rare: doubled only when a row beyond any before appears
    has(r) { return r < this.a.length && this.a[r] === this.gen; },
  };
  const JUMP_MMHG = 2;
  let jumpP = null, jumpF = null;
  function modelJumped(f) {
    if (!f || f === jumpF) return false;
    jumpF = f;
    const P = f.Pf || f.P;
    if (!P) return false;
    let big = false;
    if (jumpP && jumpP.length === P.length) for (let i = 0; i < P.length; i++) if (Math.abs(P[i] - jumpP[i]) > JUMP_MMHG) { big = true; break; }
    if (!jumpP || jumpP.length !== P.length) jumpP = new Float64Array(P.length);
    jumpP.set(P);
    return big && live.shownCol.size > 0;
  }
  const LENS_FADE = D_SURFACE;   // (a lens crossfade is a surface step of the motion scale, ease.js; the organs' and the lobule's clocks are the same)
  // (The lens crossfade and the plate's ease over it run on the honest wall clock, frame.js easeNow: the long frame a lens change can
  // bring, the vessels recoloured and the organs' picture redrawn, shows them where the wall clock puts them.)
  const lensNow = () => easeNow();
  const lensFading = () => !!live.lensFrom && lensNow() - live.lensT0 < LENS_FADE + 20;
  const rgbCache = new Map(), rgbVarName = new Map();
  // Any CSS color (rgb(), #hex, a named var) as [r, g, b] in 0–1.
  function toRGB(c, cs) {
    let v = c;
    if (typeof c === 'string' && c.startsWith('var(')) {
      let nm = rgbVarName.get(c);   // (the property a var(--x) names, found once for each such string, not by a pattern at every call)
      if (nm === undefined) { const m = /^var\((--[\w-]+)\)$/.exec(c); nm = m ? m[1] : null; rgbVarName.set(c, nm); }
      if (nm) v = cs.getPropertyValue(nm).trim();
    }
    let out = rgbCache.get(v);
    if (out) return out;
    // (Parsed in script, css-color.js, in 8-bit steps as a canvas's fillStyle gave it: no 2D canvas. Anything unreadable is black.)
    out = cssColor8(v || 'black').slice(0, 3);
    if (rgbCache.size > 512) rgbCache.clear();
    rgbCache.set(v, out);
    return out;
  }
  const mix3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const cssNum = (cs, name, dflt) => { const v = parseFloat(cs.getPropertyValue(name)); return Number.isFinite(v) ? v : dflt; };
  const tripletKept = new Map();   // (a property's text → its triplet, parsed once: callers copy it, none keeps or writes it)
  const cssTriplet = (cs, name) => {
    const raw = cs.getPropertyValue(name);
    let out = tripletKept.get(raw);
    if (out) return out;
    const k = raw.trim().split(/[\s,/]+/).map(Number);
    out = k.length >= 3 && k.every(Number.isFinite) ? k.slice(0, 3).map((v) => v / 255) : [0, 0, 0];
    if (tripletKept.size > 64) tripletKept.clear();
    tripletKept.set(raw, out);
    return out;
  };
  /** Whether the GPU draws the vessels (always, except while an SVG export is built). */
  const glWanted = () => !!live.veins && !live.veins.lost;
  // What the GPU draws this frame: each vessel on screen, its strands and its tributaries. Strands
  // and tributaries lie where the anatomy has them, so the circuit leaves them out (as the SVG did).
  // (The items are kept entries in two pools, written in place: the whole sync's (its list stays as the glow memo's until the next whole sync
  // writes it again, and nothing else asks for that pool), and a scratch for the callers that read a list at once (envCheck, buildSegs).)
  const GLI_SYNC = { list: [], objs: [], n: 0 }, GLI_SCRATCH = { list: [], objs: [], n: 0 }, NO_LIST = [];
  function glItem(pool, x, obj, row, pts, kind) {
    const i = pool.n++;
    const it = pool.objs[i] || (pool.objs[i] = { x: null, obj: null, row: 0, pts: null, kind: '', ra: undefined, f: undefined, len: undefined, endNode: undefined });
    it.x = x; it.obj = obj; it.row = row; it.pts = pts; it.kind = kind;
    it.ra = undefined; it.f = undefined; it.len = undefined; it.endNode = undefined;   // (what cavaAsOne sets on the cava's, cleared for the entry's next use)
    pool.list.push(it);
  }
  function glItems(pool = GLI_SCRATCH) {
    const items = pool.list;
    items.length = 0; pool.n = 0;
    const anat = live.morph < 0.5;
    for (const x of EV) {
      const pts = geo[x.e.id].cur;
      if (!x.vis || !pts || (!x.isArt && !x.rOf)) continue;
      glItem(pool, x, x, x.row, pts, 'v');
      // The liver's branches lie where the circuit has them, so the anatomy leaves them out.
      if (!anat && x.cbr) for (const cb of x.cbr) if (cb.w) glItem(pool, x, cb, cb.row, cb.cur, 'c');
      if (!anat || x.isArt || x.ghost) continue;
      for (const sd of x.strands || NO_LIST) if (sd.cur && (sd.live ?? 1) > 0.02) glItem(pool, x, sd, sd.row, sd.cur, 's');
      for (const fd of x.feeders || NO_LIST) if ((fd.live ?? 1) > 0.02 && fd.w) glItem(pool, x, fd, fd.row, fd.cur, 'f');
    }
    return cavaAsOne(items, lenOfGeo);
  }
  const lenOfGeo = (id, P) => geo[id].len || arcLen(P), lenOfArc = (id, P) => arcLen(P);   // (kept: cavaAsOne's length function, no closure made per call)
  const cavaMemo = { P: null, Q: null, La: 0, Lb: 0, pts: null };   // (the cava's resample and the two courses it was made from)
  function cavaAsOne(items, lenOf) {
    // The cava is drawn as one vessel: its two stretches (below and above the hepatic veins) are two
    // edges of the model, but one tube on screen, with one course, one shading and one chevron track.
    // Drawn where they would meet, two capped ends layered as an arc, a band and a seam.
    let a = null, b = null;   // (the first of each, by a loop: no closure)
    for (let q = 0; q < items.length; q++) {
      const it = items[q];
      if (it.kind !== 'v') continue;
      if (!a && it.x.e.id === 'IVC_IS') a = it;
      if (!b && it.x.e.id === 'IVCS_RA') b = it;
    }
    if (a && b && a.pts.length > 1 && b.pts.length > 1) {
      const P = a.pts, Q = b.pts, q = P[P.length - 1], La = lenOf('IVC_IS', P), Lb = lenOf('IVCS_RA', Q);
      // Re-sampled evenly by arc length to the usual count of samples (a sample's index is its place along the vessel).
      // (Kept while its two stretches are the same courses: a vessel's course is a new array whenever it moves (updateGeometry) and
      // is never written in place, so the same two arrays give the same resample. It was made again on every sync, 2 Nov 2026.)
      const cm = cavaMemo;
      if (cm.P === P && cm.Q === Q && cm.La === La && cm.Lb === Lb) a.pts = cm.pts;
      else {
        const C = P.concat(Math.hypot(Q[0][0] - q[0], Q[0][1] - q[1]) < 0.5 ? Q.slice(1) : Q), cum = [0];   // alloc-rare: only when the cava's course moved
        for (let i = 1; i < C.length; i++) cum.push(cum[i - 1] + Math.hypot(C[i][0] - C[i - 1][0], C[i][1] - C[i - 1][1]));
        const L = cum[cum.length - 1] || 1;
        a.pts = Array.from({ length: N_SAMPLES }, (_, i) => {   // alloc-rare: only when the cava's course moved
          const d = (L * i) / (N_SAMPLES - 1);
          let j = 1;
          while (j < C.length - 1 && cum[j] < d) j++;
          const t = cum[j] > cum[j - 1] ? clamp((d - cum[j - 1]) / (cum[j] - cum[j - 1]), 0, 1) : 0;
          return [C[j - 1][0] + (C[j][0] - C[j - 1][0]) * t, C[j - 1][1] + (C[j][1] - C[j - 1][1]) * t];   // alloc-rare: only when the cava's course moved
        });
        cm.P = P; cm.Q = Q; cm.La = La; cm.Lb = Lb; cm.pts = a.pts;
      }
      a.ra = b.x; a.f = La / (La + Lb); a.len = La + Lb; a.endNode = b.x.e.to;
      items.splice(items.indexOf(b), 1);
    }
    return items;
  }
  // Lumen radius along an item, and the key it changes with.
  function itemRadii(it) {
    const { x, kind } = it;
    if (kind === 'v' && it.ra) {
      const { ra, f } = it;
      return [`${x.shadeVer}|${ra.shadeVer}|${f.toFixed(4)}`, (i) => { const u = i / (N_SAMPLES - 1); return u < f ? x.rOf(u / f) : ra.rOf((u - f) / (1 - f)); }];
    }
    if (kind === 'v' && !x.isArt) return [x.shadeVer, (i) => x.rOf(i / (N_SAMPLES - 1))];
    // (The esophageal balloon squeezes the varices' strands while it is up: balloonSqueeze, 1 … 0.55.)
    const r = (kind === 'v' ? Math.max(0.5, x.width / 2) : kind === 's' ? Math.max(1.6, x.width * it.obj.k) / 2 : it.obj.w / 2) * (kind === 's' && x.e.id === 'C1a' ? live.balloonSqueeze : 1);
    // (A varix strand beaded by the varix's size: varix-bead.js.)
    const b = kind === 's' ? it.obj.bead || 0 : 0, o = it.obj;
    keep(o, 'kr', r, widthMoving(x) ? edgeQ() : 0);
    const rk = String(o.kr);
    if (b > 0) return [`${rk}|${b}|${Math.round(o.len || 0)}`, (i) => beadRadius(r, b, i / (N_SAMPLES - 1), o.len || 1, o.ph * 1.7, o.u0 || 0, o.beadL)];
    // (A sinusoid strand narrows across its stretch: sin-perfusion.js.)
    if (kind === 's' && SIN_EDGES.has(x.e.id)) { const w = x.width; return [`${r.toFixed(2)}|${w.toFixed(2)}|sin`, (i) => sinStrandRadius(r, w, i / (N_SAMPLES - 1), o.span)]; }
    return [rk, () => r];
  }
  function veinJoins(items, st = newJoinStore(), margin = 0) {
    live.glRadDirty = true; live.glStore = st;
    for (let i = 0; i < items.length; i++) { const it = items[i], id = it.kind === 'v' ? it.x.e.id : ''; it.cut = id === 'SV_MID' ? divideLen(id) : 0; it.ghost0 = id === 'PV_TRUNK' && divideLen(id) > 0; }   // (the Warren shunt's cut splenic vein: its cut-away start meets nothing, vein-joins.js cutAway. Not the portal trunk's: the portocaval junction keeps its five ends, whose pairwise fillets drew it whole; four ends read as one blended group and sheared, 13 Nov)
    const J = joinsPass(items, N_SAMPLES, st, margin);
    live.glStraight = st.straight;
    return J;
  }
  const smoothRunOn = (items, st = live.glStore) => smoothPass(items, live.glStraight, st);
  // (The memo is one kept object written in place by each whole sync, with its widths list and its classes buffer; glowBits' second slot is the
  // scratch the glow-only check compares against. The buffers grow when a sync has more items than they hold.)
  const glowMemoObj = { items: null, t: 0, netA: 0, vf: 0, cs: null, mode: '', origin: false, cath: null, F: null, geo: 0, plate: false, cls: '', bits: null, reach: 0, selK: '', wide: [] };
  const glowBitsBuf = [new Uint8Array(512), new Uint8Array(512)];
  const IVC_LIST = [...IVC_EDGES];
  // Each item's classes the whole sync reads (selected, hovered, ghost; on its own and the cava's upper stretch), and the cava's.
  function glowBits(items, slot) {
    const n = items.length + IVC_LIST.length;
    let b = glowBitsBuf[slot];
    if (b.length < n) glowBitsBuf[slot] = b = new Uint8Array(n * 2);
    for (let i = 0; i < items.length; i++) { const it = items[i]; b[i] = (it.x.sel ? 1 : 0) | (it.x.ghost ? 4 : 0) | (it.ra?.sel ? 8 : 0) | (it.x.lifted ? 32 : 0) | (it.x.reveal ? 64 : 0); }
    for (let i = 0; i < IVC_LIST.length; i++) b[items.length + i] = E[IVC_LIST[i]]?.sel ? 1 : 0;
    return b;
  }
  // Whether a selected or spotlit vessel eases back into the network toward its end at node n (highlight-math.js liftEnd).
  const selJoins = [], SEL_JOIN_POOL = EV.map(() => ({ lit: false, ghost: false }));   // (a list and its entries, kept: at most one per vessel, written in place)
  // (A lit neighbour counts as the vessel carrying on only where it is drawn at this end: nearPath. They share the node in the model, not
  // always the spot: the TIPS meets the right hepatic vein 40 units in from its end, which then eased back into nothing: a hard cut-off.)
  function selEnd(id, n, atEnd) {
    const joins = selJoins;
    joins.length = 0;
    const P = geo[id]?.cur, pe = P && P.length ? P[atEnd ? P.length - 1 : 0] : null, w0 = E[id]?.width || 0;
    for (const y of EV) {
      if (y.e.id === id || !y.vis || (y.e.from !== n && y.e.to !== n)) continue;
      const jn = SEL_JOIN_POOL[joins.length];
      jn.lit = (vh.sel.has(y.e.id) || spot.ids.has(y.e.id)) && (!pe || nearPath(geo[y.e.id]?.cur, pe[0], pe[1], END_TOUCH + 0.5 * ((y.width || 0) + w0)));
      jn.ghost = y.ghost;
      joins.push(jn);
    }
    return liftEnd(spot.ids.has(id) && spotOn(), joins);
  }
  const END_TOUCH = 3;
  let rgbGlowCs = null;
  const rgbGlowOf = (c) => toRGB(c, rgbGlowCs);   // (the glow-only sync's colour reader, kept; rgbGlowCs the style it reads)
  // (A vessel attribute counts as changed once it is a 255th away from what the layer was drawn with: a colour step under that cannot show, and a
  // running model's colours follow a little on every frame. The difference is kept, so the steps add up; NaN counts as changed.)
  const tubeMoved = (a, b) => !(Math.abs(a - b) <= 0.0039);
  function glowOnlyOk(t) {
    const m = live.glowMemo;
    if (!m || !live.veins || live.veins.lost || !live.vLook || live.tubesNew || live.lensFrom || live.colEasing || !live.tubesShown || live.tubesShown.length !== tubeData.length) return false;
    if (m.t !== t || m.F !== live.F || m.geo !== live.geometryVersion || m.netA !== live.netA || m.cs !== wrapCS() || m.mode !== layerMode() || m.origin !== live.originOn()) return false;
    if (m.selK !== selAKey() || m.cath !== live.cathTint || m.vf !== live.varixFade || m.plate !== live.veins.hasPlate(0) || m.cls !== wrapCls() || m.reach !== (glow.lit.size ? 20 : 11)) return false;
    const b = glowBits(m.items, 1), nb = m.items.length + IVC_LIST.length;   // (the buffer may be longer than the items it holds)
    for (let i = 0; i < nb; i++) if (b[i] !== m.bits[i] || b[i] & 64) return false;   // (a vessel drawing on changes with the clock: whole syncs)
    return true;
  }
  /** The glow-only sync: true when it stood in for syncVeins (see glowMemo). */
  function syncGlowOnly(t) {
    if (!glowOnlyOk(t)) return false;
    live.glowSync = false;
    const cs = live.glowMemo.cs, rgbCs = rgbGlowOf, W = TUBE_TEXELS * 4;
    rgbGlowCs = cs;
    let changed = false;
    for (const it of live.glowMemo.items) {
      if (it.kind !== 'v' && it.kind !== 's') continue;
      const o = it.row * W;
      writeGlowTexels(tubeData, o, it.kind, it.x.e.id, it.ra?.e.id, it.obj.len, glow.lit, vh.amt, rgbCs, easeInOut);
      for (let i = o + 39; i < o + 48; i++) if (tubeMoved(tubeData[i], live.tubesShown[i])) { veinsRows.add(it.row); live.tubesShown.set(tubeData.subarray(o, o + W), o); changed = true; break; }
    }
    if (changed) live.veins.setTubes(tubeData);
    return true;
  }
  // (Timed, binning included, for the debug overlay's GPU readout: gpu-probe.js.)
  // Radii: re-sent only when a tube changed.
  // (Allocation-free, 2 Nov 2026: the radii sync ran on every model frame, about 80% of the figure's per-frame garbage: a key
  // string, a [key, rOf] pair and a closure per vessel per sync, a new radii array per changed vessel, the eased radii in new
  // arrays and Maps, and the taper's chains and stations made again whenever any caliber moved. Now each vessel keeps its own
  // buffers (glR0 its radii, glE the eased, glRSent what the GPU has, which is glR), changes are told by numbers kept on it
  // (gkC/gk1-3 the key, glR0v and glRv versions), and the taper's chains are found again only when the links change. The
  // numbers sent are the same as before, in the same arithmetic.)
  let radR = 0, radB = 0, radW = 0, radCase = 0;   // (the item's radii case and numbers, from radFresh, for radFill)
  /** Whether the item's radii key changed (itemRadii's key, kept as numbers on the object); sets the case for radFill. */
  function radFresh(it) {
    const { x, kind } = it, o = it.obj;
    let c, k1, k2 = 0, k3 = 0;
    if (kind === 'v' && it.ra) { c = 1; k1 = x.shadeVer | 0; k2 = it.ra.shadeVer | 0; k3 = Math.round(it.f * 1e4); }
    else if (kind === 'v' && !x.isArt) { c = 2; k1 = x.shadeVer | 0; k2 = frontKey(x, performance.now()); }   // (a collateral's front of width runs with the clock: collateral-front.js)
    else {
      // (As itemRadii: the esophageal balloon squeezes the varices' strands, a varix strand is beaded, a sinusoid strand narrows.)
      const r = (kind === 'v' ? Math.max(0.5, x.width / 2) : kind === 's' ? Math.max(1.6, x.width * o.k) / 2 : o.w / 2) * (kind === 's' && x.e.id === 'C1a' ? live.balloonSqueeze : 1);
      const b = kind === 's' ? o.bead || 0 : 0;
      keep(o, 'kr', r, widthMoving(x) ? edgeQ() : 0);
      radR = r; radB = b;
      if (b > 0) { c = 3; k1 = o.kr; k2 = b; k3 = Math.round(o.len || 0); }
      else if (kind === 's' && SIN_EDGES.has(x.e.id)) { c = 4; radW = x.width; k1 = Math.round(r * 100); k2 = Math.round(radW * 100); }
      else { c = 5; k1 = o.kr; }
    }
    radCase = c;
    if (o.glR0 && o.gkC === c && o.gk1 === k1 && o.gk2 === k2 && o.gk3 === k3) return false;
    o.gkC = c; o.gk1 = k1; o.gk2 = k2; o.gk3 = k3;
    return true;
  }
  /** The item's lumen radii (itemRadii's rOf at each sample) into out. */
  function radFill(it, out) {
    const { x } = it, o = it.obj, n1 = N_SAMPLES - 1;
    if (radCase === 1) tubeFill(x, it.ra, it.f, out);
    else if (radCase === 2) tubeFill(x, null, 0, out);
    else if (radCase === 3) for (let i = 0; i < N_SAMPLES; i++) out[i] = beadRadius(radR, radB, i / n1, o.len || 1, o.ph * 1.7, o.u0 || 0, o.beadL);
    else if (radCase === 4) for (let i = 0; i < N_SAMPLES; i++) out[i] = sinStrandRadius(radR, radW, i / n1, o.span);
    else out.fill(radR);
  }
  // The eased radii's generation: an object eased in the last pass that worked them out has glEs === easeGen (its glE holds them).
  let easeGen = 0, memoPairs = null, memoN = 0;
  const memoV = [];   // (the radii versions the last pass worked from, two per straight join: a vessel at each end, -1 for none)
  const rowIt = [];   // (row → item, this sync's; cleared after)
  // The taper's runs, found again only when the joins that make them change (chainsOf allocates): the links and chains of the last.
  let tapLinksN = 0, tapChains = [], tapIds = new Set(), tapRows = [];
  const tapLinks = [], tapPrev = [], tapPlan = new Map(), tapS = [], tapY = [], tapD = [], tapH = [], tapK = [];
  const tapBodyOf = (row) => rowIt[row].obj.tapBody, tapLenOf = (row) => rowIt[row].obj.tapLen;   // (kept on the vessel: no Map of boxed numbers)
  const tapPlanOf = (row) => { let p = tapPlan.get(row); if (!p) tapPlan.set(row, (p = { y0: 0, y1: 0, d0: 0, d1: 0, j0: false, j1: false })); return p; };
  const easeBuf = (O) => { if (O.glEs === easeGen) return O.glE; if (!O.glE || O.glE.length !== O.glR0.length) O.glE = new Float64Array(O.glR0.length); O.glE.set(O.glR0); O.glEs = easeGen; return O.glE; };   // alloc-rare: a vessel's eased buffer, made the first time it is eased (then refilled in place)
  const SMOOTH = (u) => u * u * (3 - 2 * u);
  const plainRow = (row) => { const it = rowIt[row]; return !!it && it.kind !== 's' && !it.ra && !!it.obj.glR0; };
  // Where a stenosed vessel's colour stands along it (pressure-along.js; combined plan V1): by the resistance its narrowing adds,
  // so the colour falls at the waist. Null for any other (the plain mix by arc, as before): a strand, a tributary drawn into a trunk,
  // a liver branch, a vessel with no stenosis. The cava drawn as one takes each stretch's own.
  const alongK = new Float64Array(N_SAMPLES), alongBuf = new Float32Array(N_SAMPLES);
  function alongOf(it) {
    if (it.kind !== 'v') return null;
    const fa = it.x.stenF, fb = it.ra?.stenF, f = it.f;
    if (!fa && !fb) return null;
    for (let i = 0; i < N_SAMPLES; i++) {
      const u = i / (N_SAMPLES - 1);
      alongK[i] = !it.ra ? fa(u) : u < f ? (fa ? fa(u / f) : 1) : fb ? fb((u - f) / (1 - f)) : 1;
    }
    return alongCurve(alongK, alongBuf);
  }
  function sendRadii(items) {
    for (let q = 0; q < items.length; q++) {
      const it = items[q];
      if (!radFresh(it)) continue;
      const o = it.obj;
      live.glRadDirty = true;
      if (!o.glR0 || o.glR0.length !== N_SAMPLES) o.glR0 = new Float64Array(N_SAMPLES);   // alloc-rare: a vessel's radii buffer, made once (then refilled in place)
      radFill(it, o.glR0);
      o.glR0v = (o.glR0v || 0) + 1;
    }
    if (!live.glRadDirty) return;
    // Where one vessel runs on into the next, both ends ease to the same caliber, so the tube is one
    // smooth course (no step and no swelling at the join): a run of vessels joined end to end at two-vessel nodes is one
    // continuous taper through the whole run (vessel-taper.js), in length, so caliber and slope meet at every join.
    // (Kept while the radii they start from are the same: the same versions, and those rows are then skipped below.)
    for (let q = 0; q < items.length; q++) rowIt[items[q].row] = items[q];
    let fresh = !live.glStraight.length;
    if (live.glStraight.length) {
      let same = memoPairs === live.glStraight && memoN === live.glStraight.length * 2;
      for (let q = 0, j = 0; q < live.glStraight.length; q++) {
        const L = live.glStraight[q], A = rowIt[L.a]?.obj, B = rowIt[L.b]?.obj;
        const va = A?.glR0 ? A.glR0v : -1, vb = B?.glR0 ? B.glR0v : -1;
        if (same && (memoV[j] !== va || memoV[j + 1] !== vb)) same = false;
        memoV[j++] = va; memoV[j++] = vb;
      }
      memoN = live.glStraight.length * 2;
      if (!same) { memoPairs = live.glStraight; fresh = true; }
    }
    if (fresh) easeGen++;   // (nothing eased from before counts)
    if (fresh && live.glStraight.length) {
      // The runs: vessels that run on into one another at a node of two vessels. (The cava drawn as one, with its caliber
      // eased to the heart's, and any strand keep the pairwise ease below; a fork has its funnel below too.)
      let n = 0, linksSame = true;
      for (let q = 0; q < live.glStraight.length; q++) {
        const L = live.glStraight[q];
        L.chained = !L.fork && plainRow(L.a) && plainRow(L.b);
        if (!L.chained) continue;
        if (tapPrev[n] !== L) linksSame = false;
        tapPrev[n++] = L;
      }
      if (n !== tapLinksN) linksSame = false;
      tapLinksN = n;
      if (n) {
        if (!linksSame) {
          tapLinks.length = 0;
          for (let q = 0; q < n; q++) { const L = tapPrev[q]; tapLinks.push({ a: L.a, ea: L.ia, b: L.b, eb: L.ib }); }   // alloc-rare: the taper's links, made again only when the joins that make them change
          tapIds = new Set();   // alloc-rare: only when the joins change
          for (const { a, b } of tapLinks) { tapIds.add(a); tapIds.add(b); }
          tapChains = chainsOf(tapIds, tapLinks).filter((c) => c.length >= 2);   // alloc-rare: only when the joins change (chainsOf)
          tapRows = [...tapIds];   // alloc-rare: only when the joins change
        }
        for (let q = 0; q < tapRows.length; q++) {
          const it = rowIt[tapRows[q]], O = it.obj, R = O.glR0;
          let mx = -Infinity;
          for (let j = 0; j < R.length; j++) if (R[j] > mx) mx = R[j];
          O.tapBody = mx; O.tapLen = lenOfItem(it);
        }
        for (let q = 0; q < tapChains.length; q++) {
          const chain = tapChains[q];
          planChainInto(chain, tapBodyOf, tapLenOf, tapPlanOf, tapS, tapY, tapD, tapH, tapK);
          for (let w = 0; w < chain.length; w++) {
            const c = chain[w], O = rowIt[c.id].obj, body = O.tapBody, len = O.tapLen, p = tapPlan.get(c.id);
            // (Its own radii scaled by the plan over its own caliber: a stenosis's waist and a narrowed end ride on the taper, and where
            // the plan is its own caliber the scale is exactly 1.)
            if (!(body > 0)) continue;
            if (!O.glE || O.glE.length !== O.glR0.length) O.glE = new Float64Array(O.glR0.length);   // alloc-rare: a vessel's eased buffer, made the first time it is tapered (then refilled in place)
            const R0 = O.glR0, E = O.glE;
            // (taperAt written out in the loop, the same arithmetic: a call that hands back a number boxes it in a new object each time.)
            const y0 = p.y0, y1 = p.y1, d0 = p.d0, d1 = p.d1;
            if (y0 === y1 && d0 === 0 && d1 === 0) for (let i = 0; i < R0.length; i++) E[i] = R0[i] * (y0 / body);
            else for (let i = 0; i < R0.length; i++) {
              const u = i / (N_SAMPLES - 1), u2 = u * u, u3 = u2 * u;
              E[i] = R0[i] * (((2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * len * d0 + (-2 * u3 + 3 * u2) * y1 + (u3 - u2) * len * d1) / body);
            }
            O.glEs = easeGen;
          }
        }
      }
      for (let q = 0; q < live.glStraight.length; q++) {
        const L = live.glStraight[q];
        if (L.chained) continue;
        const { a, ia, b, ib, fork } = L;
        const A = rowIt[a]?.obj, B = rowIt[b]?.obj;
        if (!A?.glR0 || !B?.glR0) continue;
        const ra = A.glR0[ia ? N_SAMPLES - 1 : 0], rb = B.glR0[ib ? N_SAMPLES - 1 : 0];
        // In a fork the narrower stretch widens to the wider one's caliber at the node instead (the wider never narrows):
        // a tributary there meets the trunk at full width, so its end stays inside the trunk's walls (the splenorenal
        // shunt on the splenic vein, where the splenic vein's last stretch carries little).
        if (fork) {
          const m = Math.max(ra, rb);
          for (let side = 0; side < 2; side++) {
            const O = side ? B : A, i = side ? ib : ia, r0 = side ? rb : ra, row = side ? b : a;
            if (r0 >= m) continue;
            // (Over about three trunk radii, not half its course: a short funnel, not a long cone.)
            const it = rowIt[row], step = lenOfItem(it) / (N_SAMPLES - 1) || 1;
            const En = Math.min(runOnSamples(it, N_SAMPLES >> 1), Math.max(2, Math.round((3 * m) / step))), R = easeBuf(O);
            for (let s = 0; s < En; s++) R[i ? N_SAMPLES - 1 - s : s] += (m - r0) * (1 - SMOOTH(s / En));
          }
          continue;
        }
        // One smoothstep from A's caliber (half A's course back) to B's (half B's course on), so the
        // taper runs steadily through the join: no plateau there, which read as a crease.
        for (let side = 0; side < 2; side++) {
          const O = side ? B : A, i = side ? ib : ia, row = side ? b : a;
          const En = runOnSamples(rowIt[row], N_SAMPLES >> 1), R = easeBuf(O);
          for (let s = 0; s < En; s++) {
            const u = side ? 0.5 + 0.5 * (s / En) : 0.5 - 0.5 * (s / En), j = i ? N_SAMPLES - 1 - s : s;
            R[j] += side ? (ra - rb) * (1 - SMOOTH(u)) : (rb - ra) * SMOOTH(u);
          }
        }
      }
    }
    const radTol = 0.3 / Math.max(0.05, Math.hypot(drawT[0], drawT[1]) || 1);   // (world units: a third of a device pixel at the view last drawn)
    for (let q = 0; q < items.length; q++) {
      const it = items[q], o = it.obj, R = o.glEs === easeGen ? o.glE : o.glR0;
      // (Compared with a copy of the radii last sent, element by element, and copied only when they change: a joined string
      // per vessel per sync was megabytes a second of garbage; round 2 review, P6.)
      const sent = o.glRSent;
      // (A change under a third of a device pixel at every sample is not sent: the vessels' caliber follows the model's pressures, and
      // each tiny step redrew the whole vessel layer at the model's rate (Mohammad's photo, 4 Nov: 14 whole draws a second, 10 fps). The
      // difference is kept, so the steps add up and one is sent once it is a third of a pixel; the lobule's radii work the same way.)
      if (sent && sent.length === R.length) { let d = 0; for (let j = 0; j < R.length; j++) { const x = Math.abs(sent[j] - R[j]); if (x > d) d = x; } if (d <= radTol) continue; }
      let mx = -Infinity;
      for (let j = 0; j < R.length; j++) if (R[j] > mx) mx = R[j];
      // (The copy is refilled in place when it is the same size: no new array per changed vessel per frame of an ease. It is the
      // figure's glR, what the GPU draws: its version glRv moves with each change, for a reader that follows it, cathLive.)
      if (sent && sent.length === R.length) sent.set(R); else o.glRSent = Float64Array.from(R);
      o.glR = o.glRSent; o.glMaxR = mx; o.glRv = (o.glRv || 0) + 1;
      // (A vessel's new radii change only its own cells: drawn again as a colour change is, see drawVeins.)
      live.veins.setRadii(it.row, R, alongOf(it)); veinsRows.add(it.row);
    }
    for (let q = 0; q < items.length; q++) rowIt[items[q].row] = undefined;
    live.glRadDirty = false;
  }
  // The colour pass's frame (syncVeinsNow sets these, colPass reads them; nothing is made per frame).
  let cpItems = null, cpCs = null, cpT0 = 0, cpNow = 0, cpArtery = null, cpOrigin = false, cpIvcOn = false, cpDt = 0;
  const NEUTRAL = 'var(--lens-neutral)', FAN_FR = [0.7, 0.4];
  // A vessel gets its light line (F_SPEC) from this drawn width (x.width, px at the default fit): between 3.4 and about 5 the light line, the dark line and the rim together
  // covered most of the lumen and a thin vessel read striped (V4, visual-style review).
  const SPEC_MIN_W = 6;
  const cpRgb = (c) => toRGB(c, cpCs);
  const cpMixA = [0, 0, 0], cpMixB = [0, 0, 0], cpFade = new Float64Array(8);
  const mix3To = (out, a, b, k) => { out[0] = a[0] + (b[0] - a[0]) * k; out[1] = a[1] + (b[1] - a[1]) * k; out[2] = a[2] + (b[2] - a[2]) * k; return out; };
  // (The figure's colours as last shown, by row: [c0, c1]. Kept maps and pairs, three in turn: the one a crossfade reads from
  // (lensFrom) is never written while it fades.)
  const shownMaps = [live.shownCol, new Map(), new Map()], shownPairs = new Map();
  function nextShown() {
    let m = shownMaps[0];
    for (let q = 0; q < shownMaps.length; q++) { m = shownMaps[q]; if (m !== live.lensFrom && m !== live.shownCol) break; }
    m.clear();
    return m;
  }
  function shownPair(m, row) {
    let pp = shownPairs.get(m);
    if (!pp) shownPairs.set(m, (pp = []));
    return (pp[row] ||= [[0, 0, 0], [0, 0, 0]]);
  }
  /** A fade's eight numbers into cpFade (true: the vessel has one). */
  function put8(v0, v1, v2, v3, v4, v5, v6, v7) { const F8 = cpFade; F8[0] = v0; F8[1] = v1; F8[2] = v2; F8[3] = v3; F8[4] = v4; F8[5] = v5; F8[6] = v6; F8[7] = v7; return true; }
  // (On the cava drawn as one, a stretch's tint end t placed along the whole: from lo, over w; an unset end, below 0, stays.)
  const tintAlong = (t, lo, w) => (t < 0 ? t : lo + t * w);
  const SURGICAL_SHUNTS = new Set(['dsrs', 'portocaval', 'mesocaval', 'rex']);   // (the surgical shunts: their rows keep their own opacity at a join, JOIN_F_NOFADE)
  const ligatedAt = (id) => { for (let q = 0; q < LIGATED.length; q++) if (LIGATED[q][1] === id) return true; return false; };
  function colPass() {
    const items = cpItems, cs = cpCs, T0 = cpT0, now = cpNow, artery = cpArtery, originMode = cpOrigin, ivcOn = cpIvcOn, colDt = cpDt;
    for (let q = 0; q < items.length; q++) {
      const it = items[q];
      const { x, kind, obj } = it, id = x.e.id, o = it.row * TUBE_TEXELS * 4;
      const ghost = x.ghost;
      const ra = it.ra;
      let c0, c1;
      if (x.isArt) c0 = c1 = artery;
      else {
        const a = toRGB(x.col ? x.col[0] : NEUTRAL, cs), b = toRGB(x.col ? x.col[1] : NEUTRAL, cs);
        if (kind === 'f' || kind === 'c') {
          if (obj.col) { c0 = toRGB(obj.col[0], cs); c1 = toRGB(obj.col[1], cs); }
          else {
            // A tributary takes its trunk's gradient where it lies along the trunk's chord.
            const P = geo[id].cur, A = P[0], B = P[P.length - 1], dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy || 1;
            const q0 = it.pts[0], q1 = it.pts[it.pts.length - 1];
            c0 = mix3To(cpMixA, a, b, clamp(((q0[0] - A[0]) * dx + (q0[1] - A[1]) * dy) / L2, 0, 1));
            c1 = mix3To(cpMixB, a, b, clamp(((q1[0] - A[0]) * dx + (q1[1] - A[1]) * dy) / L2, 0, 1));
          }
        } else if (kind === 's' && obj.tie) {
          // (A strand that runs only a stretch of its vessel (the cavernoma's fine channel, in two halves) takes the vessel's gradient over that stretch, so the halves meet in one colour.)
          c0 = mix3To(cpMixA, a, b, obj.tie[0]); c1 = mix3To(cpMixB, a, b, obj.tie[1]);
        } else { c0 = a; c1 = ra ? toRGB(ra.col ? ra.col[1] : NEUTRAL, cs) : b; }
        // Coloring the blood by origin: the lumen steps back to a quiet grey so the parcels' colors read.
        if (originMode) c0 = c1 = ORIGIN_LUMEN;
      }
      let alpha = x.isArt ? (x.e.shunt === 'ap' ? 0.55 : 0.85) : kind === 'c' ? clamp(2 * T0 - 1, 0, 1) : kind === 's' || kind === 'f' ? (obj.live ?? 1) * clamp(1 - 2 * T0, 0, 1) : 1;
      const sinStrand = kind === 's' && SIN_EDGES.has(id);
      const tier = x.lifted && !x.back ? (x.front ? TIER_LIFT_FRONT : TIER_LIFT) : x.isArt ? TIER_ART : levelTier(x);
      // The network recedes to netA with a vessel selected (the lifted tier and the vessels behind the organs are not faded as a
      // group): the selected vessel eases out of that dimming and, deselected, back into it (selA), so it never snaps.
      if (x.back || tier >= TIER_LIFT) alpha *= live.netA + (1 - live.netA) * easeInOut(Math.max(vh.selA.get(id) || 0, ra ? vh.selA.get(ra.e.id) || 0 : 0));
      const shade = (!x.isArt || x.tube) && !ghost;
      const veil = IVC_EDGES.has(id) && !ivcOn, whole = IVC_EDGES.has(id) && ivcOn;
      const spec = shade && !veil && kind !== 'f' && kind !== 'c' && !CONTEXT_EDGES.has(id) && !x.back && x.width >= SPEC_MIN_W;
      const flags = (shade ? F_DIFFUSE : 0) | (spec ? F_SPEC : 0) | (!x.back && !x.isArt && !ghost && !veil ? F_SHADOW : 0) | (ghost ? F_DOTTED : 0) | (x.isArt && !x.tube ? F_NOCASE : 0) | (veil ? F_VEIL : 0) | (whole ? F_WHOLE : 0) | (x.e.kind === 'shunt' && x.e.shunt !== 'ap' ? F_SHUNT : 0) | (x.e.kind === 'shunt' && SURGICAL_SHUNTS.has(x.e.shunt) ? JOIN_F_NOFADE : 0);
      const z = (kind === 'v' ? x.row + 0.5 : x.row) / GL_ROWS;
      colT[0] = c0[0]; colT[1] = c0[1]; colT[2] = c0[2]; colT[3] = c1[0]; colT[4] = c1[1]; colT[5] = c1[2];
      const k = colFollow.step(it.row, colT, colDt, !!live.lensFrom || reduceMotion.matches || live.themeSnap);
      const pair = shownPair(live.shownCol, it.row), s0 = pair[0], s1 = pair[1];
      s0[0] = k[0]; s0[1] = k[1]; s0[2] = k[2]; s1[0] = k[3]; s1[1] = k[4]; s1[2] = k[5];
      colRows.add(it.row);
      if (live.lensFrom) {
        const was = live.lensFrom.get(it.row), u = easeMove(clamp((easeNow() - live.lensT0) / LENS_FADE, 0, 1));
        if (was) { mix3To(s0, was[0], s0, u); mix3To(s1, was[1], s1, u); }
      }
      live.shownCol.set(it.row, pair);
      // The sinusoids' strands are drawn faint and fine (sin-perfusion.js).
      if (sinStrand) alpha *= SIN_PERFUSION.fade;
      // The esophageal varices stand aside while the EUS-PPG scope works in the esophagus (a ghost of them stays, so the anatomy still reads).
      if (live.varixFade && id === 'C1a') alpha *= 1 - VARIX_FADE_TO * live.varixFade;
      // (The portal tree carries a slightly heavier casing than the systemic side, PORTAL_CASING: how an atlas separates the system
      // it is about from the rest without colour. Looks review, 31 Oct.)
      tubeData[o] = s0[0]; tubeData[o + 1] = s0[1]; tubeData[o + 2] = s0[2]; tubeData[o + 3] = x.isArt && !x.tube ? 0 : x.wallPx * (x.front ? PORTAL_CASING : 1);
      tubeData[o + 4] = s1[0]; tubeData[o + 5] = s1[1]; tubeData[o + 6] = s1[2]; tubeData[o + 7] = alpha;
      tubeData[o + 8] = tier; tubeData[o + 9] = z; tubeData[o + 10] = flags; tubeData[o + 11] = 0;
      // Fades, as the SVG masks: into an organ (TIP_FADE), out of the plate, into a deeper vein,
      // tributaries toward the bowel they drain.
      const F8 = cpFade;
      let fade = false;
      if (kind === 'f') {
        const cfg = FEEDERS[id];
        if (obj.fadeMask && !x.feedJoined) { const yy = FEEDER_FADE_Y[id]; fade = put8(0, yy[0], 0, yy[1], 0, 1, 0, 1); }
        else if (obj.fan && cfg.fan) { const fan = cfg.fan, fr = fan.fade === undefined ? FAN_FR : fan.fade; fade = put8(fan.at[0], fan.at[1], fan.len * (fan.levels ? 2.7 : 1.35), 0, 0, fr[0], fr[1], 2); }
      } else if (x.tipFade) { const L = x.tipFade.line; fade = put8(L[0], L[1], L[2], L[3], 0, x.tipFade.joined ? 1 : x.tipFade.keep ? 0 : T0, 1, 1); }
      else if (x.endFade) { const L = x.endFade.line; fade = put8(L[0], L[1], L[2], L[3], 0, 1, 0, 1); }
      else if (kind === 'v' && IVC_JOIN[id]) { if (!ivcOn) { const J = IVC_JOIN[id]; fade = put8(J[0], J[1], J[2], J[3], J[4], J[5], J[6], J[7]); } }
      else if (FADE_DOWN_Y[id] && !(ivcOn && IVC_EDGES.has(id))) { const yy = FADE_DOWN_Y[id]; fade = put8(0, yy[0], 0, yy[1], 0, 1, 0, 1); }
      else if (SIN_FADE[id] && (kind === 'v' || kind === 's')) { const J = SIN_FADE[id]; fade = put8(J[0], J[1], J[2], J[3], J[4], J[5], J[6], J[7]); }
      else if (FADE_IN[id] && kind === 'v') { const J = FADE_IN[id]; fade = put8(J[0], J[1], J[2], J[3], J[4], 1, J[5] === undefined ? 0.3 : J[5], 1); }
      // The fades are drawn in the anatomy's coordinates: they let go as the circuit takes over.
      // (The tip fade already does: it is cleared in the circuit.)
      if (fade && T0 > 0 && !(kind !== 'f' && x.tipFade)) { F8[5] += (1 - F8[5]) * T0; F8[6] += (1 - F8[6]) * T0; }
      if (fade) for (let j = 0; j < 8; j++) tubeData[o + 12 + j] = F8[j];
      // The drawn stretch: a vessel drawing on (or retracting) grows along its flow. A tributary's arc length is its own
      // (not its trunk's), or its chevrons and streaks would run along it many times too fast and bunch into ticks.
      let lo = 0, hi = 1;
      if (x.reveal && kind !== 'f' && kind !== 'c' && !fronted(x)) {   // (a collateral keeps its whole length: its front is a width, radFill)
        const r = x.reveal, u = clamp((now - r.t0) / r.dur, 0, 1), off = r.out ? easeInOut(u) : 1 - easeInOut(u);
        if (r.dir > 0) hi = 1 - off; else lo = off;
      }
      // (A vessel whose direction reverses between the views draws out toward its downstream end over the first half of the change and draws
      // in from its upstream end over the second, never shrinking to a point and flipping: geo flip, vessel-transition-recs v3.4.)
      // (On the vessel's own share of the change, taken at its middle: the flow peel, flow-peel.js.)
      if (kind === 'v' && !ra && !x.reveal && T0 > 0 && T0 < 1) { const fl = geo[id].flip; if (fl && fl[live.rotU > 0.5 ? 1 : 0]) { const tv = peelAt(T0, geo[id].rk[N_SAMPLES >> 1]); if (tv < 0.5) lo = 2 * tv; else hi = 2 * tv - 1; } }
      if (kind === 'v' && ligatedAt(id)) lo = Math.max(lo, divideLen(id) / (it.len || geo[id].len || 1));
      tubeData[o + 20] = lo; tubeData[o + 21] = hi; tubeData[o + 22] = kind === 's' ? obj.len : kind === 'f' ? lenOfItem(it) || 1 : it.len || geo[id].len || 1;
      for (let j = 23; j < 28; j++) tubeData[o + j] = 0;
      let tint = kind === 'v' && live.cathTint?.[id], t0 = 0, t1 = 0;
      if (tint) { t0 = tint[0]; t1 = tint[1]; }
      if (ra && kind === 'v') {
        // On the cava drawn as one, each stretch's tint is placed along the whole.
        const f = it.f, tb = live.cathTint?.[ra.e.id], m = tintAlong;
        if (tint) { t0 = m(t0, 0, f); t1 = m(t1, 0, f); }
        if (tb) {
          if (tint) { t0 = Math.min(t0 < 0 ? 0 : t0, m(tb[0], f, 1 - f)); t1 = Math.max(t1, m(tb[1], f, 1 - f)); }
          else { t0 = m(tb[0], f, 1 - f); t1 = m(tb[1], f, 1 - f); }
          tint = true;
        }
      }
      if (tint) {
        const tc = toRGB(live.cathTint.col, cs);
        tubeData[o + 32] = tc[0]; tubeData[o + 33] = tc[1]; tubeData[o + 34] = tc[2]; tubeData[o + 35] = live.cathTint.cast ? 2 : 1;   // (2: an opaque cast, the EUS glue: the blood stops inside it, veins-gl.js castAt)
        tubeData[o + 36] = t0; tubeData[o + 37] = t1; tubeData[o + 38] = live.cathTint.soft; tubeData[o + 39] = 0;
      } else if (kind === 's' && obj.wale > 0 && !originMode) {
        // The red wale sign on a varix strand (visual-style V3): the figure's --red-wale a share of the way into the lumen over the strand's middle
        // (it eases in and out over 15 % of the strand's length at each end, where it rejoins its trunk), by the same recolour texels.
        const wc = toRGB('var(--red-wale)', cs);
        tubeData[o + 32] = wc[0]; tubeData[o + 33] = wc[1]; tubeData[o + 34] = wc[2]; tubeData[o + 35] = obj.wale;
        tubeData[o + 36] = 0.1; tubeData[o + 37] = 0.9; tubeData[o + 38] = 0.15 * (obj.len || 1); tubeData[o + 39] = 0;
      }
      writeGlowTexels(tubeData, o, kind, id, ra?.e.id, obj.len, glow.lit, vh.amt, cpRgb, easeInOut);
      // The moving front of the flow peel: a vessel on its way between the views is lit a little in its own hue (the hover's lift, veins-gl
      // shov), a bell on its own share of the change, so the blood seems to lead the change (flow-peel.js; 0 at rest and with reduced motion).
      if (kind === 'v' && !ra && T0 > 0 && T0 < 1 && !reduceMotion.matches) { const gw = PEEL_GLOW * peelGlow(T0, geo[id].rk[N_SAMPLES >> 1]); if (gw > tubeData[o + 39]) tubeData[o + 39] = gw; }
      // The selected vessel's standing out of the dimmed network (its tributaries' too); the cava and the vessels behind the
      // organs take it in their alpha above. Toward an end where another visible vessel joins and none of the selection, it
      // eases back into the network; a free end, or one into the rest of the selection, stays at full.
      const sa = tier < TIER_LIFT && !x.back && !SIN_EDGES.has(id) ? vh.selA.get(id) || 0 : 0;
      if (sa > 0) {
        tubeData[o + 48] = easeInOut(sa);
        // (Its ends' eases for a vessel, none for a tributary or strand; the row's last texel stays 0, cleared with the rest.)
        if (kind === 'v') { tubeData[o + 49] = selEnd(id, x.e.from, false); tubeData[o + 50] = selEnd(id, x.e.to, true); } else { tubeData[o + 49] = 0; tubeData[o + 50] = 0; }
      }
    }
  }
  function syncVeins(t) {
    // (Heat and pan recs S2, 12 Nov 2026, Mohammad picked it: while a hand moves the camera, the vessels' own changes (a model frame's
    // colours and widths, an ease) wait, and are taken together HAND_HOLD_MS after the hand lets go. Each one drew cells again on top
    // of the pan's shift, or the whole layer, in the frames of the pan. Not before the first sync, nor for a new binning or a view change.)
    if (handHolds()) { live.veinsSyncOwed = true; if (!handHoldT) handHoldT = stageScope.timer(handHoldWait, HAND_HOLD_MS); return; }
    live.veinsSyncOwed = false;
    return gpuProbe.time(null, 'vessel sync (script)', syncVeinsNow, t);
  }
  const HAND_HOLD_MS = 150;
  let handHoldT = 0, handAt = -1e9;
  function handHolds() {
    if (!live.veins || live.veins.lost || !live.vLook || !live.tubesShown || live.tubesNew || live.morph !== live.morphTarget || live.lobuleOn) return false;
    const now = performance.now();
    if (live.gestureOn?.()) handAt = now;
    return now - handAt < HAND_HOLD_MS;
  }
  function handHoldWait() {
    handHoldT = 0;
    if (!live.veinsSyncOwed) return;
    if (handHolds()) { handHoldT = stageScope.timer(handHoldWait, 50); return; }
    syncVeins(easeInOut(live.morph));
    live.stageWake?.();
  }
  // The binning's key (the layout's version and the rows drawn, in order), built again only when one of them changed: it was a
  // string joined from every row on every sync (2 Nov 2026). The same string as before, so every reset to '' still re-bins.
  let binKeyRows = new Int32Array(64), binKeyN = -1, binKeyGeo = -1, binKeyStr = '';
  function binKeyOf(items) {
    let same = binKeyGeo === live.geometryVersion && binKeyN === items.length;
    if (same) for (let q = 0; q < items.length; q++) if (binKeyRows[q] !== items[q].row) { same = false; break; }
    if (same) return binKeyStr;
    if (binKeyRows.length < items.length) binKeyRows = new Int32Array(items.length * 2);   // alloc-rare: more vessels than ever drawn
    for (let q = 0; q < items.length; q++) binKeyRows[q] = items[q].row;
    binKeyN = items.length; binKeyGeo = live.geometryVersion;
    binKeyStr = `${live.geometryVersion}|` + items.map((it) => it.row).join(',');   // alloc-rare: only when the layout or the rows changed
    return binKeyStr;
  }
  function binningStep(items, key, grew) {
    morphOff();
    if (live.morph !== live.morphTarget) mt.stats.cpu++;
    live.vBinKey = key;
    // A vessel that outgrows its reach gets a quarter more room than it needs: a widening vein (a congested IVC easing
    // in over a slide) was re-binned and its geometry uploaded again at every 2 px of growth, about 4 MB each time, a
    // hundred times in one slide change. (The reach only says which cells list a vessel; the drawing is unchanged.)
    const reachNext = live.vBinSpare;   // (the reach map is kept in two, written into the spare and swapped: the old one is read while the new is filled)
    reachNext.clear();
    for (let q = 0; q < items.length; q++) { const it = items[q]; reachNext.set(it.row, grew ? Math.max(live.vBinReach.get(it.row) || 0, Math.ceil(reachOf(it) * 1.25 / 2) * 2) : reachOf(it)); }
    live.vBinSpare = live.vBinReach; live.vBinReach = reachNext;
    const J = veinJoins(items), smooth = smoothRunOn(items);
    joinRoom(J, items);
    for (const it of items) if (it.kind === 'v') { it.obj.glPts = smooth.get(it.row) || it.pts; }
    // (Binned against the last binning: a coiling collateral re-tests only its own cells, and when nothing the GPU holds
    // changed (another vessel's coil easing while it is hidden), nothing is uploaded.)
    binList.length = items.length;
    for (let q = 0; q < items.length; q++) binList[q] = binTube(items[q], smooth.get(items[q].row) || items[q].pts, binTubeOf(q));
    const bins = binVeins(binList, J, binMemo);
    // (Patched in place, only the rows that changed go up again: the cells and every other entry are as uploaded.)
    // (A patch changes only the cells of the vessels and joins it wrote again (veins-gl patchGeometry): they are drawn again as vessels
    // whose radii changed are, veinsRows, instead of the whole layer. A whole binning draws the whole layer, as before.)
    // (The same bins as shown, a binning that found nothing the GPU holds changed, draw nothing: a coil easing on a hidden
    // vessel moved the geometry's version at every model frame for 20–35 s after a patient change, and each was a whole draw.)
    let patched = null, whole = false;
    if (bins !== live.binShown) {
      if (bins.patch && live.binShown?.ent === bins.ent) { live.veins.patchGeometry(bins); if (bins.patchRows) patched = bins.patchRows; else whole = true; } else { live.veins.setGeometry(bins); whole = true; }
      live.binShown = bins;
    }
    // (Each axis's curvature with it, so the flow arrowheads keep their shape on a bend: veins-gl chevAt.)
    if (bins !== live.bendShown) { live.bendShown = bins; for (const it of items) live.veins.setBend(it.row, smooth.get(it.row) || it.pts); }
    if (patched) for (const r of patched) veinsRows.add(r);
    else if (whole) live.tubesNew = true;
    if (live.morph === live.morphTarget) { mt.reach[live.morphTarget] = new Map(live.vBinReach); morphTrackSoon(); envSoon(); }
  }
  const VLOOK = { shOff: [1.4, 2.8], light: LIGHT, reach: 0, organs: 0, casing: [0, 0, 0, 0], shadow: [0, 0, 0, 0], sheen: [0, 0, 0, 0], shade: [0, 0, 0, 0], rim: [0, 0, 0, 0], paper: [0, 0, 0, 0], ring: [0, 0, 0, 0], netAlpha: 0, fx: true, tierAlpha: TIER_ALPHA, tierGroup: TIER_GROUP, fluid: null, map: MAP, plate: null };   // alloc-rare: kept, made once for the stage
  const lookRgba = (out, rgb, a) => { out[0] = rgb[0]; out[1] = rgb[1]; out[2] = rgb[2]; out[3] = a; };
  const LOOK_SIG = newLookSig();   // (what the look held at the last sync that drew it: look-sig.js)
  function syncVeinsNow(t) {
    if (!live.veins || live.veins.lost) { live.colEasing = false; return; }
    live.glowSync = false;
    // (Here the GPU holds its context: the guard above. `gl-on` is the class of that: set when the GPU was made or its context came back, taken off
    // when it was lost (webglcontextlost). `gl-plate` follows what the GPU holds of the plate, looked at when it said that changed.)
    const plateWas = live.plateOn();
    if (live.plateDirty) { live.plateDirty = false; wrap.classList.toggle('gl-plate', live.veins.hasPlate(0)); }
    live.syncOrganDim();
    if (!live.glOrgans) {
      // The organ covers, painted once on the GPU into their world-space texture (1.5 texels per unit): tiers behind them fade.
      // (They were drawn on a 2D canvas and uploaded.)
      live.veins.paintOrgans(getOrganCovers().map(({ src, w }) => ({ ...src, w })), [0, 0, VIEW.w, VIEW.h], 1.5);
      live.glOrgans = true; live.tubesNew = true;
    }
    const items = gpuProbe.time(null, 'vessel sync: list', glItems, GLI_SYNC);
    const cs = wrapCS();
    const mode = layerMode();
    // A jump in the model (a new patient, Undo or History, a time jump, Compare's Then and Now, Settle) recolours the vessels
    // through the same crossfade as a lens change, instead of in one frame (round 2 review, B6): a frame whose pressures moved
    // by more than JUMP_MMHG anywhere since the last one drawn. The running model's own steps (well under that) are drawn as
    // they come.
    // (So does a held reversal turning in the Direction lens: B3.)
    const jumped = modelJumped(live.F), flipped = live.revFlip && mode === 'direction';
    live.revFlip = false;
    if (((live.lensMode && mode !== live.lensMode) || jumped || flipped) && !reduceMotion.matches) { live.lensFrom = live.shownCol; live.lensT0 = lensNow(); }
    live.lensMode = mode;
    if (live.lensFrom && !lensFading()) live.lensFrom = null;
    live.shownCol = nextShown();
    gpuProbe.time(null, 'vessel sync: radii', sendRadii, items);
    // Geometry: re-binned when the layout, the set of vessels or a vessel's reach grows.
    const key = binKeyOf(items);
    let grew = false;
    if (key === live.vBinKey) for (let q = 0; q < items.length; q++) if (reachOf(items[q]) > (live.vBinReach.get(items[q].row) || 0)) { grew = true; break; }
    // (Between the views, a binning made ahead for this stretch of the change, the frame's points sent up in a few rows: morphFrame.)
    if ((key !== live.vBinKey || grew) && gpuProbe.time(null, 'vessel sync: morph frame', morphFrame, items)) live.vBinKey = key;
    else if (key !== live.vBinKey || grew) gpuProbe.time(null, 'vessel sync: binning', binningStep, items, key, grew);
    // Attributes, every frame. (Allocation-free, 2 Nov 2026: the pass wrote each vessel's texels through array literals and spreads,
    // mapped its colours, mixed them into new arrays and kept them in a new Map every frame; now the numbers go straight into
    // tubeData and into kept colour pairs, colPass below, in the same arithmetic.)
    cpT0 = easeInOut(live.morph); cpNow = performance.now(); cpCs = cs;
    // (The Change and Heat lenses draw their "higher" in red, ΔE 3 from --artery: there the arteries step back to the lens's neutral grey, C4.)
    cpArtery = toRGB(mode === 'delta' || mode === 'heat' ? 'var(--lens-neutral)' : 'var(--artery)', cs);
    cpOrigin = live.originOn();
    const T0 = cpT0;
    tubeData.fill(0);
    // Selecting or spotlighting any part of the IVC shows it whole: no veil and no organ fading it, and no fades on it or on the
    // tributaries joining it. It stays in its own tier (behind the network), as the body has it: the portal tree, which lies in front
    // of the cava, and the hepatic veins that end on it still draw over it where they cross (it was lifted above them, 1 Nov).
    cpIvcOn = false;
    for (let q = 0; q < IVC_LIST.length; q++) { const id = IVC_LIST[q]; if (E[id] && (E[id].sel || vh.selA.get(id) > 0)) cpIvcOn = true; }
    // (The colours' filter steps by the time since the last sync: every display frame while it moves, colEasing. From rest the
    // first step is at most one 60 Hz frame, whatever time has passed since the figure last synced, so an ease starts gently.)
    cpDt = Math.min(live.colEasing ? 0.1 : 1 / 60, (cpNow - (live.colAt || cpNow)) / 1000);
    live.colAt = cpNow; colFollow.begin(); colRows.begin();
    cpItems = items;
    gpuProbe.time(null, 'vessel sync: colours', colPass);
    cpItems = null; cpCs = null;
    live.colEasing = colFollow.moving;
    live.themeSnap = false;   // (a new look's colours were taken at once, above)
    colFollow.prune(colRows);
    // (Uploaded only when some vessel's attributes changed: most model frames in a steady state change none.)
    let tubesChanged = !live.tubesShown || live.tubesShown.length !== tubeData.length;
    if (!tubesChanged) for (let i = 0; i < tubeData.length; i++) if (tubeMoved(tubeData[i], live.tubesShown[i])) { tubesChanged = true; break; }
    if (tubesChanged) live.veins.setTubes(tubeData);
    // (The look handed to the vessels' painter: one kept object and its colour lists, written in place each sync; its signature is numbers
    // compared with the last one's, lookChanged, not text made of it.)
    const vl = VLOOK;
    vl.reach = glow.lit.size ? 20 : 11; vl.organs = 1 - T0; vl.fluid = live.fluidLook;
    lookRgba(vl.casing, cssTriplet(cs, '--casing-rgb'), cssNum(cs, '--casing-a', 0.56));
    lookRgba(vl.shadow, cssTriplet(cs, '--shadow-rgb'), cssNum(cs, '--shadow-a', 0.15));
    lookRgba(vl.sheen, toRGB('var(--light-ink)', cs), cssNum(cs, '--tube-sheen', 0.42));
    lookRgba(vl.shade, toRGB('var(--tube-shade-ink)', cs), cssNum(cs, '--tube-shade', 0.2));
    lookRgba(vl.rim, toRGB('var(--light-ink)', cs), cssNum(cs, '--vessel-rim-a', 0));
    lookRgba(vl.paper, toRGB('var(--stage-bg)', cs), cssNum(cs, '--vessel-knock-a', 1));
    lookRgba(vl.ring, live.olCol = toRGB('var(--accent)', cs), 0.34);
    vl.netAlpha = live.netA;
    live.vLook = vl;
    syncMapInk(cs);
    live.syncPlateLook();
    // The vessel layer is drawn again only when what it is drawn from changed: a running model sends a frame about ten
    // times a second, and in a steady state most of them leave every vessel's colour, width and fade exactly as they were.
    const lookDiffers = lookChanged(vl, live.plateOn(), LOOK_SIG);
    // Most of those that do change only a few vessels' colours (the pulse), and the vessel layer then redraws only those
    // vessels' cells (veinsRows; see drawVeins): a whole redraw at a Retina size is the heaviest thing the figure draws.
    if (live.tubesNew || lookDiffers || !live.tubesShown || live.tubesShown.length !== tubeData.length) {
      live.veinsDirty = true;
      if (tubesChanged) live.tubesShown = tubeData.slice();
    } else if (tubesChanged) {
      const W = TUBE_TEXELS * 4;
      for (let o = 0; o < tubeData.length; o += W) {
        for (let i = o; i < o + W; i++) if (tubeMoved(tubeData[i], live.tubesShown[i])) { veinsRows.add(o / W); live.tubesShown.set(tubeData.subarray(o, o + W), o); break; }
      }
    }
    live.tubesNew = false;
    const gm = glowMemoObj;
    gm.items = items; gm.t = t; gm.netA = live.netA; gm.cs = cs; gm.mode = mode; gm.origin = cpOrigin; gm.cath = live.cathTint; gm.vf = live.varixFade; gm.F = live.F; gm.geo = live.geometryVersion;
    gm.plate = live.veins.hasPlate(0); gm.cls = wrapCls(); gm.bits = glowBits(items, 0); gm.reach = live.vLook.reach;
    gm.selK = selAKey();   // (the selection's ease sets the vessels' alpha, which the glow-only sync does not write)
    gm.wide.length = items.length;   // (the sheen's width: syncRadiiOnly)
    for (let q = 0; q < items.length; q++) gm.wide[q] = items[q].x.width >= SPEC_MIN_W;
    live.glowMemo = gm;
    // The SVG organs just hid for the GPU plate: draw it now, so no frame shows neither.
    if (!plateWas && live.plateOn()) drawVeins(false, 'plate shown');
  }
  /** Redraws the vessel layer (and the picture) if anything in it changed; true when it did. `by`: who asked (gpu-probe.js BY). */
  function drawVeins(fullComposite = false, by = 'frame') {
    // (For the ?perf readout: the caller, counted with each whole draw and each target sized again in it.)
    const byWas = gpuProbe.by;
    gpuProbe.by = by;
    try { return drawVeinsNow(fullComposite); } finally { gpuProbe.by = byWas; }
  }
  // (Kept, written in place each draw: the view's six numbers in canvas pixels, the same six in stage pixels, the rows to name, and none.)
  const drawT = [0, 0, 0, 0, 0, 0], glMBuf = [0, 0, 0, 0, 0, 0], pendRows = [], NO_ROWS = [];
  const pendPush = (r) => { pendRows.push(r); };
  function rowsShown() { for (let i = 0; i < pendRows.length; i++) veinsRows.delete(pendRows[i]); }
  function drawVeinsNow(fullComposite) {
    // (The bowel's float handed to the live stack only when it moved or a setLive made new cuts (bowelAt NaN): handed every drawn frame, it marked the textures new (veins-gl
    // shift), so no rest frame was the blood's alone: every lumen repainted, a new picture for the glass each time. 13 Nov 2026, the Mac's heat at rest.)
    if (live.liveSet || live.liveOn()) { live.syncLiveOrgans(); if (live.liveSet) { const dy = live.bowelDy(); if (dy !== live.bowelAt) { live.bowelAt = dy; live.veins.organs.shift('bowel', dy); } } }
    if (!live.veins || live.veins.lost || !live.vLook || !live.F) return false;
    if (!live.CTM) refreshCTM();
    const m = live.CTM;
    const T = drawT;
    // (A card's zoom at rest on its landing, zoomSharp: the layer is drawn for the view the scene camera has carried it to, C after the view, so it is
    // sharp; the layout still reads the rest view (CTM). C is a scale S and a move in stage px: p' = S p + (tx, ty).)
    const dc = live.drawCam, S = dc ? dc[0] : 1, tx = dc ? dc[4] : 0, ty = dc ? dc[5] : 0;
    T[0] = live.vdpr * S * m.a; T[1] = live.vdpr * S * m.b; T[2] = live.vdpr * S * m.c; T[3] = live.vdpr * S * m.d; T[4] = live.vdpr * (S * (m.e - live.wrapRect.left) + tx); T[5] = live.vdpr * (S * (m.f - live.wrapRect.top) + ty);
    subPixel(T);
    // (The view switch drawn lower, morph-low.js (12 Nov 2026, Mohammad's Mac at Figure size Full: a switch at 12 fps, every frame a whole Tube draw of a 9 MP layer): while the figure morphs between the
    // views, veins-gl draws a big picture's layer and lumen in a corner of their targets and the compositor reads the corner. The draw after the change lands is whole at Full: asked for here, in the
    // first frame the stage sees it landed, and the page woken for it. Settings > Sharp while moving keeps the switch whole, as it does a pan.)
    const lowMorph = live.morph !== live.morphTarget && !sharpMoving();
    live.veins.setMorphLow?.(lowMorph);
    if (!lowMorph && live.veins.lowKept) { live.veinsDirty = true; live.stageWake?.(); }
    // (R04: the view the layer was drawn in is kept as numbers (thousandths) and compared one by one; a new view gets a new number
    // as its key. Nothing is joined into a string on a camera frame.)
    const key = viewSame(T, vCanvas.width, vCanvas.height) ? live.veinsDrawKey : ++live.viewKeyN;
    // The rows changed since the layer was drawn, taken once and kept until a draw has shown them: a refused partial draw
    // passes them on to the whole draw that stands in for it, and they are let go only once one of the two has drawn.
    pendRows.length = 0;
    if (veinsRows.size) veinsRows.forEach(pendPush);
    const pending = pendRows.length ? pendRows : null;
    if (!live.veinsDirty && key === live.veinsDrawKey) {
      if (!pending) return false;
      // Only some vessels' attributes changed: their cells alone are drawn again (the same picture as a whole redraw).
      if (live.veins.drawRows(T, live.vLook, live.bloodLook(), pending, fullComposite)) { rowsShown(); return true; }
    }
    if (key !== live.veinsDrawKey) {
      settleRes();   // (the view moved: Figure resolution looks again once it settles)
      if (figOpt('adapt')) noteMoveFrame();
      if (live.plateOn()) live.schedulePlateView();
    }
    // (Moved with only some vessels' attributes changed, those vessels are named: a drag while the model plays still
    // moves the drawn layer, and draws their cells again, rather than drawing it all.)
    const rows = live.veinsDirty ? null : pending || NO_ROWS;
    live.veinsDirty = false; live.veinsDrawKey = key; viewKeep.set(viewNext); rowsShown();
    glMBuf[0] = S * m.a; glMBuf[1] = S * m.b; glMBuf[2] = S * m.c; glMBuf[3] = S * m.d; glMBuf[4] = S * (m.e - live.wrapRect.left) + tx; glMBuf[5] = S * (m.f - live.wrapRect.top) + ty;
    live.glM = glMBuf;
    // (Settings › Figure performance › Pinch frame reuse (frame.js): only while a hand zooms; a frame that laid the last picture again
    // leaves the layer to be drawn whole, so the view a pinch stops at is always shaded afresh.)
    const reuse = figLab('pinchReuse');
    live.veins.setReuse?.(reuse, !!reuse && live.gestureOn());
    // (Vessels lower while pinching: likewise only while a hand zooms, and a frame drawn lower leaves the layer to be drawn whole.)
    const low = figLab('pinchLow');
    // (Quality tiers, adapt-tier.js (R07): under deadline pressure every zoom frame of a move, a hand's or a glide's, draws the layer at
    // the tier's share inside targets made once at the top tier's size; the view a move stops at is drawn at Full. ?tiers=0: off.)
    // (Not through the change between the views: its frames drawn lower and the landing at Full read as a flicker, soft then sharp, on the figure.)
    // (B3, pure-gpu-plan: while the camera glides, a hand or wheel zooms, or the figure morphs between the views, the vessels, blood and organs are drawn at
    // MOTION_K of the layer's width and height and stretched in the present; labels, lines and glass are on their own layers, at Full. The frame that
    // lands (morph at its target, the gesture over) draws the layer whole, and `soft` keeps the page awake until it has. Not in a dive, the lobule or a card's zoom.)
    // (A hand's move only (4 Nov 2026, Mohammad: "the slide figure flickers intermittently"). A glide the app runs steps its camera at 60 Hz
    // (the governor), so on a 120 Hz screen every other frame has the same camera: those skip the lower pass and the beat's radius patches
    // draw the layer whole, so the figure went soft, sharp, soft at 60 Hz through every slide change, and popped sharp as it landed. A morph
    // between the views is left whole for the same reason as the tiers above.)
    const morphing = live.morph !== live.morphTarget;
    const moving = TIERS_ON && !morphing && live.gestureOn() && !(live.diveT > 0) && !live.lobuleOn && !live.drawCam && !live.lz?.isOpen();
    const tk = TIERS_ON && !morphing ? tierK() : 0, mk = moving ? motionK() : 0;
    const lk = tk && mk ? Math.min(tk, mk) : tk || mk;
    live.veins.setLow?.(lk || (low ? PINCH_LOW_K : 0), lk ? true : low && live.gestureOn(), TIERS_ON ? TIER_TOP : 0, false);
    live.veins.draw(T, live.vLook, live.bloodLook(), rows);
    if (live.veins.reused || live.veins.soft) live.veinsDirty = true;
    return true;
  }
  return { JUMP_MMHG, LENS_FADE, NO_LIST, cavaAsOne, cssNum, drawVeins, et, glItems, glWanted, glowOnlyOk, itemRadii, lenOfArc, lensNow, mix3, sendRadii, smoothRunOn, sweepBin, syncGlowOnly, syncVeins, toRGB, veinJoins, veinsRows };
}
