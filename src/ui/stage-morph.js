// The change between the views on the GPU: the morph pieces, their binning ahead in a worker, and the frames of the change.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { inMotion } from './frame.js';
import { sinceInput } from './quiet.js';
import { lerp } from './util.js';
import { newJoinStore } from './vein-joins.js';
import { ENT_W } from './veins-bin.js';

import { stageScope } from './stage-scope.js';
export function createMorph(st, live) {
  const { BLOOD_PAD, EV, GL_ROWS, N_SAMPLES, cavaAsOne, cbAt, edgeVisible, geo, itemRadii, reachOf, strandAt, veinJoins, vesselAt, wrap } = st;
  // ── The change between the views on the GPU (2 Nov 2026, his iPhone: "going from anatomy to circuit is so laggy") ──
  // Each frame of the change had binned every vessel again on the CPU and sent the 4 MB list up. Now the change is cut into stretches
  // (MORPH_PIECES), and each stretch's binning, listing everything that can draw in a cell anywhere along it (veins-sweep.js), is made
  // ahead while the figure rests, in a worker (sweep-worker.js), from the vessels' courses at a few moments of it (vesselAt and the
  // rest of what glItems gives, as they will be), and put on the GPU in a set of its own. A frame of the change then sends only its
  // vessels' points and joins, a few rows (morphFrame); the vessels are drawn from them exactly as from a binning of their own. A frame
  // whose vessels do not fit the stretch made for it (another vessel showing, one wider than it was binned for, a course off its samples
  // by more than MORPH_SLACK) is binned as before. (Without Worker, as in a test page, every frame is binned.)
  const MORPH_GPU = typeof Worker !== 'undefined';
  const MORPH_PIECES = [[0, 1 / 6], [1 / 6, 1 / 3], [1 / 3, 0.5], [0.5, 2 / 3], [2 / 3, 5 / 6], [5 / 6, 1]];
  const MORPH_NEAR = 10;   // (and a pair's every contact, veinJoins)
  const MORPH_STEPS = 12, MORPH_SLACK = 6, MORPH_JSLACK = 30, MORPH_JSUB = 3;
  const mt = { key: '', pieces: null, using: null, gen: 0, checkT: 0, reach: [null, null], landAt: 0, stats: { gpu: 0, cpu: 0, builds: 0, miss: {} } };
  const morphMiss = (why) => { mt.stats.miss[why] = (mt.stats.miss[why] || 0) + 1; return false; };
  function morphOff() {
    if (!mt.using) return;
    mt.using = null;
    live.veins?.useMorphSet(null);
    live.binShown = null; live.bendShown = null;
  }
  function morphDrop() {
    morphOff();
    for (const pc of mt.pieces || []) if (pc.set) pc.set.owner.dropMorphSet(pc.set);
    mt.pieces = null; mt.key = ''; mt.gen++;
  }
  // Whether a vessel shows on the anatomy's side of the change (anat) or the circuit's (edgeVisible, asked as if the change were there).
  function visAt(x, anat) {
    if (!live.F) return false;
    const m = live.morph;
    live.morph = anat ? 0.25 : 0.75;
    try { return edgeVisible(x, live.F); } finally { live.morph = m; }
  }
  // What the vessels would be at t (eased) of the change, on its anatomy (anat) or circuit side: glItems' list, from vesselAt. `both`:
  // the vessels either side shows (one leaving draws itself out as it goes, one arriving draws in: either can be on in a frame of the
  // change), as the stretches are binned; else the side's own.
  function itemsAt(t, anat, both = true) {
    const items = [];
    for (const x of EV) {
      const vis = visAt(x, anat) || (both && visAt(x, !anat));
      // (A vessel not drawn yet has no radius function (rOf) until its first draw: it is binned all the same, see joinsOf.)
      if (!vis || !geo[x.e.id]?.cur) continue;
      const v = vesselAt(x, t);
      items.push({ x, obj: x, row: x.row, pts: v.pts, kind: 'v' });
      if (!anat && x.cbr) for (const cb of x.cbr) if (cb.w) items.push({ x, obj: cb, row: cb.row, pts: cbAt(cb, t), kind: 'c' });
      if (!anat || x.isArt || x.ghost) continue;
      for (const sd of x.strands || []) if (sd.cur && (sd.live ?? 1) > 0.02) items.push({ x, obj: sd, row: sd.row, pts: strandAt(x, sd, t, v), kind: 's' });
      for (const fd of x.feeders || []) if ((fd.live ?? 1) > 0.02 && fd.w) items.push({ x, obj: fd, row: fd.row, pts: fd.cur, kind: 'f' });
    }
    return cavaAsOne(items, live.lenOfArc);
  }
  // Joins and smoothed courses of a list (veinJoins, smoothRunOn), leaving the figure's own (glStraight, glRadDirty) as they were. A
  // vessel not drawn yet (the other side's: the circuit's branches, a vessel the anatomy leaves out) is given its radii as they would
  // be sent (itemRadii) for the while. Given a store (a frame of a morph: FR_STORES), the answer is written into it and is read before the
  // next call that is given the same store; without one it is made new, for the stretches that keep it.
  const LENT = [];   // alloc-rare: kept, made once for the stage
  function lendRadii(items) {
    let nLent = 0;
    for (let q = 0; q < items.length; q++) {
      const it = items[q], o = it.obj;
      if (o.glR) continue;
      // alloc-rare: only a vessel whose radii were not sent yet (the other side's, one the view leaves out) is lent them, here and in itemRadii
      const R = o.glRL || (o.glRL = new Float64Array(N_SAMPLES)), rc = it.kind === 'v' && !it.x.isArt && !it.x.rOf ? Math.max(0.5, (it.x.width || 2) / 2) : -1, rf = rc < 0 ? itemRadii(it)[1] : null;
      let mx = 0;
      for (let i = 0; i < N_SAMPLES; i++) { const r = rf ? rf(i) : rc; R[i] = r; mx = Math.max(mx, r); }
      o.glR = R; o.glMaxR = mx; LENT[nLent++] = o;
    }
    return nLent;
  }
  function takeBackRadii(nLent) {
    for (let q = 0; q < nLent; q++) { LENT[q].glR = undefined; LENT[q].glMaxR = undefined; LENT[q] = null; }
  }
  // (Run for each frame of a morph: the answer is written into the store it is given, FR_STORES' one for the frame, and read before the next call given it.)
  function joinsOf(items, st) {
    const gs = live.glStraight, gd = live.glRadDirty, gst = live.glStore, nLent = lendRadii(items);
    try {
      const J = veinJoins(items, st), smooth = live.smoothRunOn(items, st);
      st.res.J = J; st.res.smooth = smooth;
      return st.res;
    } finally { live.glStraight = gs; live.glRadDirty = gd; live.glStore = gst; takeBackRadii(nLent); }
  }
  // The same, made new for a stretch that keeps it (the change between the views, an ease), with the reach of each vessel by row.
  function joinsKept(items) {
    const gs = live.glStraight, gd = live.glRadDirty, gst = live.glStore, nLent = lendRadii(items);
    try {
      const st = newJoinStore(), J = veinJoins(items, st), smooth = live.smoothRunOn(items, st);
      return { J, smooth, reach: new Map(items.map((it) => [it.row, reachOf(it)])) };
    } finally { live.glStraight = gs; live.glRadDirty = gd; live.glStore = gst; takeBackRadii(nLent); }
  }
  // How wide a vessel is at t of the change between the views against how wide it is at rest in the view it is in (1 where unknown): the
  // joins of a stretch are found at the widths the frames will have, not the landed view's (an end lies on another vessel's course within
  // their radii, so at the widths between, joins come that the landed widths never had, and a frame with one fell back to binning on the CPU).
  function widthRatio(x, t) {
    const a = x.wAn, c = x.wCi;
    if (!(a > 0) || !(c > 0)) return 1;
    return lerp(a, c, t) / (live.morphTarget === 1 ? c : a);
  }
  // The same for a stretch of the change between the views, at t: the radii are scaled to that moment's widths (widthRatio), and the joins also
  // hold the contacts just past the limit of an end meeting a course (MORPH_NEAR) and a pair's every contact: a frame's courses are within the
  // slack of the stretch's, so a join at the limit is there in some frames and in no moment of the stretch, and which contact of a pair comes
  // first depends on the widths. Those a frame does not have are written as reaching nothing. (Made ahead, between frames, never in one.)
  function joinsAhead(items, t) {
    // alloc-rare: made ahead of the change, in a task between frames (the stretches' build), never in a frame
    const gs = live.glStraight, gd = live.glRadDirty, gst = live.glStore, nLent = lendRadii(items), saved = [];
    try {
      for (const it of items) {
        const o = it.obj, k = widthRatio(it.x, t);
        saved.push(o, o.glR, o.glMaxR);
        o.glR = o.glR.map((r) => r * k); o.glMaxR *= k;
      }
      try {
        // (The joins within the limit are made last, so the run-on state left is theirs.)
        const wide = veinJoins(items, newJoinStore(), MORPH_NEAR), st = newJoinStore(), J = veinJoins(items, st).slice(), have = J.slice();
        for (const j of wide) if (!have.some((h) => h.key === j.key && (h.x - j.x) ** 2 + (h.y - j.y) ** 2 < 1600)) J.push(j);
        return { J, smooth: live.smoothRunOn(items, st), reach: new Map(items.map((it) => [it.row, reachOf(it)])) };
      } finally {
        for (let i = 0; i < saved.length; i += 3) { saved[i].glR = saved[i + 1]; saved[i].glMaxR = saved[i + 2]; }
      }
    } finally { live.glStraight = gs; live.glRadDirty = gd; live.glStore = gst; takeBackRadii(nLent); }
  }
  // A join by what it joins: its members, the trunk they end on, a fork.
  const joinKey = (j) => j.key;   // (a join the joins pass made carries its key)
  const rowKey = (items) => items.map((it) => it.row).join(',');
  // What the stretches are made from, so they are made again when it changes (the vessels shown, their reach, a collateral's coil and a
  // varix's spread, the joins that run on): checked a moment after the figure last binned at rest.
  function morphTrackKey() {
    return [rowKey(itemsAt(0, true)), rowKey(itemsAt(1, false)), EV.map((x) => { const g = geo[x.e.id]; return `${(g.wig || 0).toFixed(1)}/${(g.spr ?? 1).toFixed(2)}`; }).join(','),
      EV.map((x) => (x.strands || []).map((sd) => +((sd.live ?? 1) > 0.02)).join('')).join(''), `turn ${live.rotU}`].join('|');
  }
  function morphTrackSoon() {
    if (!MORPH_GPU || mt.checkT) return;
    mt.checkT = stageScope.timer(morphTrackCheck, 400);
  }
  function morphTrackCheck() {
    mt.checkT = 0;
    if (!live.veins || live.veins.lost || live.morph !== live.morphTarget || !wrap.classList.contains('gl-on') || live.lobuleOn) return;
    if (inMotion()) { morphTrackSoon(); return; }
    const key = morphTrackKey();
    if (key === mt.key && mt.pieces && mt.pieces.every((pc) => !pc.set || pc.set.owner === live.veins)) return;
    mt.stats.builds++;
    // (The stretches made before stay on until each new one is up: a frame of the change still checks its courses against the one it
    // draws from. Those of a figure since replaced are of no use.)
    if (mt.pieces?.some((pc) => pc.set && pc.set.owner !== live.veins)) morphDrop();
    mt.gen++; mt.key = key;
    morphTrackBuild(mt.gen);
  }
  // The stretches, one at a time, each in its own task: its moments (itemsAt, joinsOf) here, its binning in the worker, its upload here.
  function morphTrackBuild(gen) {
    // (tight: the stretch's heads and runs also carry circles about one of their own points as it is in the frame, which the shader
    // tests instead of the circles swept over the whole stretch: see veins-sweep.js. Only the change's stretches, whose frames lie
    // between two neighbouring moments; a coil's ease is checked against any of its moments.)
    const blank = () => MORPH_PIECES.map(([t0, t1]) => ({ t0, t1, anat: t0 < 0.5, set: null, tight: true, gen: 0 }));
    const pieces = blank();
    mt.pieces ||= blank();
    // The order the stretches are made in: those with no binning first (none yet, or a failed one), then the oldest. In the order of the
    // change, a figure that kept changing at rest (a collateral's coil easing for half a minute after a slide change: a new key at every
    // check, every build begun again) remade the Anatomy's first stretch over and over and never reached the Circuit's half, and every
    // frame of that half was binned again on the CPU, 2 to 30 MB sent up a frame (8 Nov 2026, "anatomy to circuit like 10fps").
    const was = mt.pieces, rank = (i) => (was[i]?.set ? was[i].gen || 0 : -1);
    const order = MORPH_PIECES.map((_, i) => i).sort((a, b) => rank(a) - rank(b) || a - b);
    let k = 0, held = 0;
    // A stretch made takes the place of the one before it.
    const put = (pc) => {
      const at = order[k], old = mt.pieces[at];
      pc.gen = gen;
      mt.pieces[at] = pc;
      if (old?.set) { if (mt.using === old.set) morphOff(); old.set.owner.dropMorphSet(old.set); }
      k++; held = 0;
    };
    const next = () => {
      if (gen !== mt.gen || k >= pieces.length) return;
      // (Not while the figure moves at rest, for a while: a moment is a pass over every vessel.)
      // (A move holds it for as long as the move lasts, however long: beginMotion ends one itself after MOTION_MAX_MS. Only the person's
      // own input is capped, at twelve looks.)
      { const moving = inMotion(); if ((moving || (sinceInput() < 700 && held < 12)) && live.morph === live.morphTarget) { held++; stageScope.timer(next, 120); return; } }
      const pc = pieces[order[k]];
      const ts = Array.from({ length: MORPH_STEPS + 1 }, (_, i) => pc.t0 + (pc.t1 - pc.t0) * i / MORPH_STEPS);
      if (pc.t1 === 0.5) ts[MORPH_STEPS] = 0.5 - 1e-6;   // (the anatomy's side ends just short of the half, where the circuit's vessels take over)
      // (One pass over the joins a task: each is a pass over every vessel and its joins. A moment's passes in one task were a long
      // task each, start-up profile 2 Nov 2026.)
      pc.snaps ||= [];
      // (The joins of the side's own vessels too: a vessel binned for the other side changes the joins it takes part in.)
      if (pc.snaps.length < ts.length) {
        const t = ts[pc.snaps.length], w = pc.work ||= { items: itemsAt(t, pc.anat), own: itemsAt(t, pc.anat, false), o: null, all: null, q: 1, J2: [] };
        if (!w.o) { w.o = joinsAhead(w.own, t); stageScope.timer(next, 0); return; }
        if (!w.all) { w.all = joinsAhead(w.items, t); stageScope.timer(next, 0); return; }
        // (The joins at moments between too: one can be there for less than a step, as two ends pass each other.)
        if (pc.snaps.length && w.q < MORPH_JSUB) { const u = lerp(pc.snaps[pc.snaps.length - 1].t, t, w.q / MORPH_JSUB); w.J2.push(...joinsAhead(itemsAt(u, pc.anat, false), u).J); w.q++; stageScope.timer(next, 0); return; }
        pc.work = null;
        const { items, own, o } = w;
        pc.snaps.push({ t, items, ...w.all, J2: o.J.concat(w.J2), own: new Map(own.map((it) => [it.row, o.smooth.get(it.row) || it.pts])) });
        stageScope.timer(next, 0); return;
      }
      const snaps = pc.snaps;
      pc.snaps = null;
      const rows = rowKey(snaps[0].items);
      if (snaps.some((sn) => rowKey(sn.items) !== rows)) { pc.bad = 'vessels'; put(pc); stageScope.timer(next, 0); return; }
      const side = pc.anat ? 0 : 1;
      pc.ts = ts; pc.rows = rows;
      sweepPiece(pc, snaps, mt.reach[side]).then((b) => {
        if (gen !== mt.gen || !b || !live.veins || live.veins.lost) return;
        setOf(pc, b);
        put(pc);
        stageScope.timer(next, 0);
      }, (e) => { if (gen !== mt.gen) return; pc.bad = String(e); put(pc); stageScope.timer(next, 0); });
    };
    stageScope.timer(next, 0);
  }
  // A stretch's courses, joins and reach from its moments (snaps), and its binning made in the worker: the change between the views
  // (morphTrackBuild) and a coil or a varix's spread easing at rest (envCheck). `more`: reach a vessel had elsewhere, kept.
  function sweepPiece(pc, snaps, more) {
    pc.reach = new Map(snaps[0].items.map((it) => [it.row, Math.ceil(Math.max(live.vBinReach.get(it.row) || 0, more?.get(it.row) || 0, ...snaps.map((sn) => sn.reach.get(it.row) || 0)) * 1.25 / 2) * 2]));
    // (A course as the side's own vessels smooth it where it is one of them: the vessels only the other side shows change which ends run on.)
    pc.path = new Map(snaps[0].items.map((it) => [it.row, snaps.map((sn) => sn.own.get(it.row) || sn.smooth.get(it.row) || sn.items.find((o) => o.row === it.row).pts)]));
    pc.pathRows = Array.from(pc.path.keys());   // (the rows of the stretch, listed once for the frames that draw from it)
    // (The joins come and go as the vessels' ends move (veinJoins finds them by where the ends lie): every join of any moment, each
    // binned along its centres at the moments it is there; a frame lists the ones it has, the rest written as reaching nothing.)
    // (Joins of the same vessels at two places, a strand's two ends on its varix, are told apart by where they lie.)
    const U = [], byKey = new Map();
    for (const sn of snaps) sn.J.concat(sn.J2).forEach((j) => {
      const k = joinKey(j), list = byKey.get(k) || [];
      byKey.set(k, list);
      let u = null, best = 40 * 40;
      for (const v of list) { const q = v.path[v.path.length - 1], d = (q[0] - j.x) ** 2 + (q[1] - j.y) ** 2; if (d < best) { best = d; u = v; } }
      if (!u) { u = { path: [], reach: 0, j, i: U.length }; U.push(u); list.push(u); }
      u.path.push([j.x, j.y]); u.reach = Math.max(u.reach, j.reach);
    });
    pc.jby = new Map([...byKey].map(([k, list]) => [k, list.map((u) => u.i)]));
    pc.jof = U.map((u) => u.j);
    pc.jpath = U.map((u) => u.path);
    pc.jreach = U.map((u) => u.reach * 1.5 + 6);
    const tubes = snaps[0].items.map((it) => { const r = pc.reach.get(it.row); return { id: it.row, path: pc.path.get(it.row), reach: r, core: r - 18 + BLOOD_PAD }; });
    pc.tubes = tubes;   // (the sweep's tubes as the worker gets them: the vector renderer's morph bounds read their courses, setOf)
    const joins = U.map(({ j }, ji) => ({ path: pc.jpath[ji], reach: pc.jreach[ji] + MORPH_JSLACK - MORPH_SLACK, k: j.k, fillet: j.fillet, members: j.members, trunk: j.trunk, fork: j.fork }));
    return live.sweepBin({ tubes, joins, opts: { rows: GL_ROWS, samples: N_SAMPLES, slack: MORPH_SLACK, tight: !!pc.tight } });
  }
  function setOf(pc, b) {
    pc.set = live.veins.makeMorphSet(b, pc.tubes);
    pc.frame = new Float32Array((b.rows - b.entRows) * ENT_W * 4);
    pc.posBase = b.posBase - b.entRows * ENT_W; pc.joinBase = b.joinBase - b.entRows * ENT_W;
  }
  return { MORPH_GPU, MORPH_JSLACK, MORPH_SLACK, joinKey, joinsKept, joinsOf, morphMiss, morphOff, morphTrackSoon, mt, rowKey, setOf, sweepPiece, visAt };
}
