// The camera glide and framing: whether a move can carry the labels, the dry landing solve, animateVT, zoom to a box, the best-view box fit, frameBox and the rise.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { VB_ANAT, VIEW } from './anatomy.js';
import { blendPaths, camPath, driftEase, lerpVT, viewsOverlap } from './cam-arc.js';
import { ALONG_MAX_MS, ROUTES, alongPath, routeLine } from './cam-routes.js';
import { camMs, carried, easeMove, springSlope } from './ease.js';
import { cancelFrame } from './frame.js';
import { glideClock } from './glide-clock.js';
import { reduceMotionMQ as reduceMotion, reducedMs } from './motion.js';
import { store } from './store.js';
import { clamp } from './util.js';

import { stageScope } from './stage-scope.js';
export function createGlide(st, live) {
  const { CIRC_C, applyVT, arcRoom, camSettle, camSettleIdle, circVB, dpr, driftEnd, geo, glideXfStart, glideXfStep, logMove, nextFrame, refreshCTM, rideStep, safeInsets, sameView, sitesPaint, svg, vbCenter, vtTrack, viewXfRetargetTo } = st;
  // (T4: the vessel paths as the figure draws them now, for a glide between neighbouring slides that follows one: cam-routes.js. Built when
  // such a glide is asked for, once a slide change, never in a frame.)
  const ptsOf = (id) => geo?.[id]?.cur || geo?.[id]?.A || null;
  const routeLines = () => Object.values(ROUTES).map((ids) => routeLine(ids, ptsOf));
  let alongAsk = false;   // (frameBox asks for its glide to follow a vessel path: set only around its animateVT call)
  // The camera's curve and its time (ease.js; combined plan M2): the quintic, with no catch half way, and a glide asked to be scaled
  // (opt.scale: a slide's framing, a fit, a camera set) takes the time its reach on screen needs, 480 to 900 ms, never longer than
  // asked.
  const camEase = easeMove;
  // (camEase backwards, for the one place that has only the eased progress: an older arc's path, asked for its view at u by a refit's blend.
  // Bisection on a rising curve; run once a frame for the few frames a carried arc is being blended away.)
  const camEaseInv = (u) => { let lo = 0, hi = 1; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (camEase(m) < u) lo = m; else hi = m; } return (lo + hi) / 2; };
  // opt.steady: a refit to cards that moved (a data card tucked or untucked, a turn): timed by glideClock, so a slow frame at its start
  // (the layout and label passes the same change set off) holds it back a little instead of carrying it part of the way in one step.
  const NO_OPT = {};   // (the options of a glide asked for with none: read only)
  const aimedBuf = { k: 1, x: 0, y: 0 };   // (where a framing would go, written in place; aimView reads it at once)
  function animateVT(to, ms = 700, opt = NO_OPT) {
    if (live.aiming) { aimedBuf.k = to.k; aimedBuf.x = to.x; aimedBuf.y = to.y; live.aimed = aimedBuf; return; }   // (asked only where it would go: aimView)
    // (A change between the views running: the framing asked for is the change's new end, and the camera goes there on its clock, no second glide: view-xf.js.)
    if (live.viewXf && viewXfRetargetTo(to)) { live.following = false; return; }
    live.following = false;   // (a glide or a framing set outright takes over from a card the view was following)
    cancelFrame(live.vtAnim);
    const prev = live.arcRun; live.arcRun = null;
    const drift = !!opt.drift && ms > 0 && !reduceMotion.matches;   // (reduced motion: a drift is the short plain glide)
    if (live.drifting && !drift) driftEnd();
    live.drifting = drift;
    live.vtTarget = to;
    const from = { ...live.vt };
    let t0 = performance.now();
    if (reduceMotion.matches) ms = reducedMs(ms, true);   // (reduced motion: a short glide, never a jump: REDUCED_MOVE_MS, the exception motion.js writes down)
    else if (opt.scale && !drift && ms > 0) ms = Math.min(ms, camMs(from, to, VIEW.w));
    // Lite mode: a jump, and a move that changes the view (not a small refit) fades the figure in at its new framing.
    if (ms <= 0) {
      live.drifting = false;
      if (!sameView(from, to)) logMove({ t: t0, ms, restart: live.vtGliding, kind: 'glide', zoom: Math.abs(Math.log(to.k / from.k)), pan: Math.hypot(to.x - from.x, to.y - from.y) });
      live.vtGliding = false; live.vt = to; applyVT(); live.CTM = null; camSettle(); live.dprLet(); return;
    }
    let at = (u) => (u >= 1 ? { ...to } : lerpVT(from, to, u)), newArc = null;
    // (Another plain glide still moving: this one carries its speed on, instead of starting over from rest. The arcs blend their own.)
    // (opt.v0: the hand's own speed when it let go, a spring-back's: stage-gestures.js.)
    const v0 = opt.v0 || (!drift && live.vtGliding ? vtTrack.take(performance.now()) : null);
    vtTrack.begin();
    const room = opt.arc && !reduceMotion.matches ? arcRoom() : null;   // (reduced motion: no pull-back, the plain short glide)
    if (room && prev && live.vtGliding && performance.now() < prev.t0 + prev.ms && viewsOverlap(prev.to, to, room.vb)) {
      // A refit while an arc runs (the cards settled, the screen turned): the same arc from where it began, now to the new framing,
      // taken over gradually from here on, keeping its pace and its end time. Nothing jumps and it does not start over from rest.
      const u = camEase(clamp((performance.now() - prev.t0) / prev.ms, 0, 1));
      const path = camPath(prev.from, to, room.vb, room.wMax);
      at = blendPaths(prev.at, path.at, u, room.vb);
      t0 = prev.t0; ms = prev.ms;
      live.arcRun = { from: prev.from, to, t0, ms, at };
    } else if (room) {
      // (A presenter's move between neighbouring slides on one vessel path travels along it, T4, its time lengthened with the path, to
      // ALONG_MAX_MS at most; any other long move pulls back over the figure on its arc.)
      const along = alongAsk && live.morphTarget === 0 && !store.get().lobule ? alongPath(from, to, routeLines(), room.vb) : null;
      const path = along ? null : camPath(from, to, room.vb, room.wMax);
      if (along) { ms = Math.min(Math.round(ms * along.stretch), ALONG_MAX_MS); at = (u) => along.at(u); live.arcRun = { from, to, t0, ms, at }; newArc = at; }
      else if (path.arc) { ms = Math.round(ms * path.stretch); at = path.at; live.arcRun = { from, to, t0, ms, at }; newArc = path.at; }
    }
    let c0 = 0;
    if (v0 && (!live.arcRun || newArc) && !sameView(from, to)) {
      c0 = springSlope(v0, from, to, VIEW.w, ms);
      // (A new arc takes the old speed on too, along the straight line to its end: an arc leaves the old framing toward the same side, and
      // the cap keeps the carried term from running the progress past 1. A refit's blend reads an older arc by u alone, so the carried
      // arc finds its clock from u again.)
      if (c0 > 0 && newArc) { at = (u, raw) => newArc(carried(u, raw ?? camEaseInv(u), c0)); live.arcRun.at = at; }
      else if (c0 > 0) at = (u, raw) => (u >= 1 ? { ...to } : lerpVT(from, to, carried(u, raw, c0)));
    }
    if (!sameView(from, to)) logMove({ t: t0, ms, restart: live.vtGliding, kind: drift ? 'drift' : 'glide', arc: !!live.arcRun, zoom: Math.abs(Math.log(to.k / from.k)), pan: Math.hypot(to.x - from.x, to.y - from.y) });
    const left = Math.max(0, t0 + ms - performance.now());
    // (Not for a drift or a move on an arc: those keep their end time, which a refit that bends them reads from the wall clock.)
    const clock = opt.steady && !drift && !live.arcRun ? glideClock() : null;
    live.vtGliding = true; live.vtUntil = t0 + ms; live.vtMs = ms;
    // (A presenter's glide: the new slide's labels solved now for where it lands and crossed with the old on its progress, glideXfStep; label-system-review #6.)
    if (live.cath.st?.keep && !sameView(from, to) || store.get().presenting && !drift && !sameView(from, to)) { if (store.get().presenting && !drift) glideXfStart(to); live.camMove = true; dpr.carry = dpr.on && performance.now() < dpr.refitUntil; stageScope.timer(camSettleIdle, left + 80); } else camSettle();
    live.dprLet();   // (a probe waiting for the slide's framing: a move hides it till it lands, a refit shows it now)
    // (0, 4 Nov 2026: a glide moves its camera every frame again while the figure flicker is chased; at 60 on a 120 Hz screen the figure
    // stepped every other frame beside cards and labels that moved every frame.)
    const stepGap = 0;
    let stepAt = -1e9;
    const step = (now) => {
      // A newer glide (or a framing set outright) took over: this one stops. A glide started from inside this step's
      // frame (a refit a view change set off) left two running, and the older could land last, where nobody wanted it.
      if (live.vtTarget !== to) return;
      // (The governor, frame.js: a glide the app runs itself moves the camera 60 times a second, not 120, camera, labels and figure together
      // (they all read this step's camera, so none is a frame ahead of another). Its time is the clock's, so nothing jumps; the landing and a hand's
      // frames are never held.)
      if (now - stepAt < stepGap && now - t0 < ms - 20 && !live.gestureOn()) { live.vtAnim = nextFrame(step); return; }
      stepAt = now;
      const raw = clamp((clock ? clock(now) : now - t0) / ms, 0, 1), u = (drift ? driftEase : camEase)(raw);
      live.vt = at(u, raw);
      if (!drift) {   // (the speed a glide begun now would carry on: per ms, the zoom as its logarithm)
        vtTrack.sample(live.vt, now);
      }
      applyVT(); live.CTM = null;
      if (live.rideCTM) rideStep();   // (a card's zoom, which owns the ride)
      // With the catheter in, the vessels, the catheter and its labels follow the camera in this very frame (the labels and the
      // vessel layer after the frame's other steps: cathLabelsSoon, then animate's one render pass).
      if (live.cath.st) { refreshCTM(); live.cathLabelsSoon(); }
      if (live.sites.list) { refreshCTM(); sitesPaint(); }
      if (live.scan.on) live.scanPaint();
      live.dprobePaint();
      glideXfStep(u);
      if (u < 1) live.vtAnim = nextFrame(step); else { live.vtGliding = false; live.arcRun = null; camSettle(); if (drift) driftEnd(); }
    };
    live.vtAnim = nextFrame(step);
  }
  function zoomToBox(x0, y0, x1, y1) {
    live.fitted = false;
    const k = clamp(Math.min(VIEW.w / (x1 - x0), VIEW.h / (y1 - y0)) * 0.9, 1, 5);
    animateVT({ k, x: VIEW.w / 2 - ((x0 + x1) / 2) * k, y: VIEW.h / 2 - ((y0 + y1) / 2) * k }, 400);
  }
  // (boxVT's working numbers, kept: its helpers read them, so no closure is made for each call. bvPref: the rectangles that suit the box;
  // bvDefault: the one rectangle left when the presenter names none.)
  let bvX0 = 0, bvY0 = 0, bvX1 = 0, bvY1 = 0, bvS0 = 1, bvPad = 0, bvKMax = 4;
  const bvPref = [], bvRect = { l: 0, t: 0, r: 0, b: 0 }, bvDefault = [bvRect];
  function bvFitK(q) { return Math.min(Math.max(40, q.r - q.l - 2 * bvPad) / bvS0 / (bvX1 - bvX0), Math.max(40, q.b - q.t - 2 * bvPad) / bvS0 / (bvY1 - bvY0)); }
  const bvScore = (q) => Math.min(bvFitK(q), bvKMax);
  const bvArea = (q) => (q.r - q.l) * (q.b - q.t);
  function boxVT(box, kMax = 4, clear = false) {
    // (In the circuit the box is in the circuit's world units, turned a quarter turn about its centre when the map stands upright,
    // and the view box is the circuit's: the same sums, the other plate.)
    const circ = live.morphTarget === 1, VB = circ ? circVB() : VB_ANAT, turn = circ && live.rotTarget;
    const x0 = turn ? CIRC_C[0] + (box[1] - CIRC_C[1]) : box[0], y0 = turn ? CIRC_C[1] - (box[2] - CIRC_C[0]) : box[1];
    const x1 = turn ? CIRC_C[0] + (box[3] - CIRC_C[1]) : box[2], y1 = turn ? CIRC_C[1] - (box[0] - CIRC_C[0]) : box[3];
    const rw = svg.clientWidth, rh = svg.clientHeight;
    if (!rw || !rh) return null;
    bvX0 = x0; bvY0 = y0; bvX1 = x1; bvY1 = y1; bvKMax = kMax;
    const s0 = bvS0 = Math.min(rw / VB[2], rh / VB[3]);
    bvPad = clear ? 12 : 0;   // (clear: a margin for the vessels' glow)
    let rects = store.get().presenting && live.freeArea ? live.freeArea() : null;
    if (rects) {   // (between the cards, when the box fits there)
      const least = clear ? 0.3 : 0.6;
      bvPref.length = 0;
      for (let i = 0; i < rects.length; i++) if (rects[i].pref && bvFitK(rects[i]) >= least) bvPref.push(rects[i]);
      if (bvPref.length) rects = bvPref;
    }
    if (!rects?.length) { const ins = safeInsets(clear); bvRect.l = ins.l; bvRect.t = ins.t; bvRect.r = rw - ins.r; bvRect.b = rh - ins.b; rects = bvDefault; }
    // (A clearly larger fit wins; within 4% the larger rectangle does, so a near tie never flips the framing about.)
    let f = rects[0];
    for (let i = 1; i < rects.length; i++) { const q = rects[i]; if (bvScore(q) > bvScore(f) * 1.04 || (bvScore(q) >= bvScore(f) / 1.04 && bvArea(q) > bvArea(f))) f = q; }
    live.lastFree = { ...f, box: [x0, y0, x1, y1] };
    const k = clamp(bvFitK(f), clear ? 0.3 : 0.6, kMax);
    const cx = VB[0] + VB[2] / 2 + ((f.l + f.r) / 2 - rw / 2) / s0, cy = VB[1] + VB[3] / 2 + ((f.t + f.b) / 2 - rh / 2) / s0;
    return { k, x: cx - k * ((x0 + x1) / 2), y: cy - k * ((y0 + y1) / 2) };
  }
  // (opt.drift: a slow push, see drifting.)
  function frameBox(box, ms = 1300, kMax = 4, clear = false, opt = {}) {
    live.fitted = false; live.handed = false;
    if (live.morphTarget !== 0 && live.morphTarget !== 1) return;   // (the anatomy or the circuit; not on the way between)
    const to = boxVT(box, kMax, clear);
    if (!to || sameView(to, live.vtGliding ? live.vtTarget : live.vt)) return;
    alongAsk = !!opt.along;   // (T4: read by the glide this asks for, at once)
    if (opt.drift) animateVT(to, ms, { drift: true }); else animateVT(to, ms, { arc: true, steady: !!opt.steady, scale: !opt.steady });   // (a drift never arcs)
    alongAsk = false;
  }
  function riseTo(box, kMax, clear) { live.riseBox = box ? { box, kMax, clear } : null; live.riseExp = performance.now() + 4000; }
  function riseVT() {
    const r = live.riseBox; live.riseBox = null; live.handed = false;
    if (!r || performance.now() > live.riseExp) return null;
    const box = typeof r.box === 'function' ? r.box() : r.box;
    return box ? boxVT(box, r.kMax, r.clear) : null;
  }
  function vtFor(wx, wy, k) { const [cx, cy] = vbCenter(); return { k, x: cx - wx * k, y: cy - wy * k }; }
  return { animateVT, frameBox, riseTo, riseVT, vtFor, zoomToBox };
}
