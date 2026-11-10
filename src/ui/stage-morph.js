// The change between the views on the GPU: the morph pieces, their binning ahead in a worker, and the frames of the change.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { cancelMay, inMotion, mayTask, mayWaiting } from './frame.js';
import { sinceInput } from './quiet.js';
import { lerp } from './util.js';
import { newJoinStore } from './vein-joins.js';
import { ENT_W } from './veins-bin.js';

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
  const mt = { key: '', parts: null, firstAt: null, build: null, pieces: null, using: null, gen: 0, reach: [null, null], landAt: 0,
    stats: { gpu: 0, cpu: 0, builds: 0, miss: {}, restart: null, last: null, units: {}, over: 0 } };
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
    mt.pieces = null; mt.key = ''; mt.parts = null; mt.build = null; mt.gen++;
    cancelMay(TRACK_TAG);
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
  // ── What the stretches are made from, and when they are made again (R1, 10 Nov 2026) ──
  // The parts of the key, each judged on its own (morphTrackParts):
  //   anat, circ  the vessels each end of the change shows (rowKey of itemsAt at t = 0 and t = 1, either side's vessels). They decide
  //               which vessels a stretch lists at all, so a change restarts the build at once.
  //   turn        the Circuit's quarter turn as it settles (rotTarget): the Circuit's end is laid out turned by it. Judged only once the
  //               turn has landed (rotU = rotTarget); a turn on its way is not a geometry to build for, and `rotU` itself, the eased
  //               value, is not in the key (it changed at every frame of a turn and restarted the build each time).
  //   coil        each collateral's coil and fan as they settle (wig, spr). Judged only once no coil is easing: a coil easing for half a
  //               minute after a slide change went 0, 0.42, 0.24, 0.33, 1 and restarted the build at every check; one that returns to
  //               the shape the stretches were made for costs nothing. The first build does not wait for it (nothing is ready to lose).
  // (The strand flags that were in the key are in `anat` already: itemsAt lists a strand only when it is live and has a course.)
  // A frame that does not fit what is on the GPU is binned on the CPU as before (frameFrom's checks), so a stale stretch never draws wrong.
  function morphTrackParts() {
    return {
      anat: rowKey(itemsAt(0, true)), circ: rowKey(itemsAt(1, false)), turn: String(live.rotTarget),
      coil: EV.map((x) => { const g = geo[x.e.id]; return `${(g.wig || 0).toFixed(1)}/${(g.spr ?? 1).toFixed(2)}`; }).join(','),
    };
  }
  const partsDiff = (a, b) => {
    const r = [];
    if (a.anat !== b.anat) r.push('vessels shown at the Anatomy end');
    if (a.circ !== b.circ) r.push('vessels shown at the Circuit end');
    if (a.turn !== b.turn) r.push('Circuit turn');
    if (a.coil !== b.coil) r.push('coil shape');
    return r;
  };
  // The building is a may task (frame.js): a slice a frame at most, each under SLICE_MS, held for motion and input. The first check is
  // made in the frame after the first binning (the first picture), not 400 ms after it; later ones settle for 400 ms (a burst of
  // binnings is one check).
  const TRACK_TAG = 'view-switch pieces', CHECK_TAG = 'view-switch check', SLICE_MS = 8, SETTLE_MS = 400, COIL_WAIT_MS = 3000;
  function morphTrackSoon() {
    if (!MORPH_GPU || mayWaiting(CHECK_TAG)) return;
    mayTask(CHECK_TAG, morphTrackCheck, { notBefore: mt.parts || mt.firstAt ? performance.now() + SETTLE_MS : 0 });
  }
  function morphTrackCheck() {
    if (!live.veins || live.veins.lost || live.morph !== live.morphTarget || !wrap.classList.contains('gl-on') || live.lobuleOn) return;
    if (inMotion() || live.rotU !== live.rotTarget) { morphTrackSoon(); return; }
    const owned = !mt.pieces || mt.pieces.every((pc) => !pc.set || pc.set.owner === live.veins);
    // (The first build waits for a coil that is easing at load (a second or so), at most COIL_WAIT_MS: the stretches made on the way
    // would be made again when it settles, and the worker, which is what the build waits on, is busy with them.)
    const now = performance.now();
    if (!mt.parts) {
      mt.firstAt ??= now;
      if (live.coilEasing && now - mt.firstAt < COIL_WAIT_MS) { morphTrackSoon(); return; }
    }
    const parts = morphTrackParts();
    if (!mt.parts || !owned) { morphTrackStart(parts, !mt.parts ? 'first build' : 'figure replaced'); return; }
    const d = partsDiff(mt.parts, parts);
    if (!d.length) return;
    // (Only the coil differs and it is still easing: wait for it to settle, the sets already made keep serving the frames that fit them.)
    if (d.length === 1 && d[0] === 'coil shape' && live.coilEasing) { morphTrackSoon(); return; }
    morphTrackStart(parts, `${d.join(' + ')} changed`);
  }
  function morphTrackStart(parts, reason) {
    // (The stretches made before stay on until each new one is up: a frame of the change still checks its courses against the one it
    // draws from. Those of a figure since replaced are of no use.)
    if (mt.pieces?.some((pc) => pc.set && pc.set.owner !== live.veins)) morphDrop();
    mt.stats.builds++;
    mt.gen++; mt.parts = parts; mt.key = `${parts.anat}|${parts.circ}|${parts.turn}|${parts.coil}`;
    mt.pieces ||= MORPH_PIECES.map(([t0, t1]) => ({ t0, t1, anat: t0 < 0.5, set: null, tight: true, gen: 0 }));
    const now = performance.now();
    mt.stats.restart = { reason, at: now };
    // (tight: the stretch's heads and runs also carry circles about one of their own points as it is in the frame, which the shader
    // tests instead of the circles swept over the whole stretch: see veins-sweep.js. Only the change's stretches, whose frames lie
    // between two neighbouring moments; a coil's ease is checked against any of its moments.)
    mt.build = { gen: mt.gen, reason, t0: now, busy: 0, slices: 0, longest: 0, held: 0, stage: MORPH_PIECES.map(([t0, t1]) => ({ t0, t1, anat: t0 < 0.5, set: null, tight: true, gen: 0 })),
      done: MORPH_PIECES.map(() => false), ndone: 0, ready: [], inflight: -1, results: [] };
    morphTrackAsk();
  }
  const morphTrackAsk = () => mayTask(TRACK_TAG, morphTrackStep, { maxWait: 1 });
  // A piece to work on or send next, out of `cand` (indices): while the change is under way, the stretch being crossed and then those
  // ahead of it in the direction it travels (then those behind it); at rest, those with no binning first (none yet, or a failed one),
  // then the oldest. In the order of the change, a figure that kept changing at rest remade the Anatomy's first stretch over and over and
  // never reached the Circuit's half (8 Nov 2026, "anatomy to circuit like 10fps").
  function morphPick(cand) {
    let best = -1, bestK = Infinity;
    const going = live.morph !== live.morphTarget;
    let cur = 0, dir = 1;
    if (going) {
      const t = live.easeInOut(live.morph);
      dir = live.morphTarget > live.morph ? 1 : -1;
      for (let q = 0; q < MORPH_PIECES.length; q++) if (t >= MORPH_PIECES[q][0] && t <= MORPH_PIECES[q][1]) { cur = q; if (dir > 0) break; }
    }
    for (const i of cand) {
      let k;
      if (going) { k = (i - cur) * dir; if (k < 0) k += 100; } else k = mt.pieces[i]?.set ? mt.pieces[i].gen || 0 : -1;
      if (k < bestK || (k === bestK && i < best)) { best = i; bestK = k; }
    }
    return best;
  }
  // What a unit of the building costs (a moving mean, per kind), to fit several of them in one slice when they are small.
  const unitEst = {};
  const noteUnit = (kind, ms) => {
    unitEst[kind] = unitEst[kind] == null ? ms : Math.max(unitEst[kind] * 0.8, ms);
    const u = mt.stats.units[kind] || (mt.stats.units[kind] = { n: 0, ms: 0, max: 0 });   // alloc-rare: once per kind of unit
    u.n++; u.ms += ms; if (ms > u.max) u.max = ms;
  };
  // (What the next unit is expected to cost: an upload or a send as it has cost, else the most any of a stretch's own units has: which of
  // those comes next is not known, and the units of a stretch are small, so several are taken in one slice.)
  function unitNext(bd) {
    if (bd.results.length) return unitEst.upload ?? SLICE_MS;
    if (bd.inflight < 0 && bd.ready.length) return unitEst.send ?? SLICE_MS;
    let m = 0;
    for (const k in unitEst) if (k !== 'upload' && k !== 'send' && unitEst[k] > m) m = unitEst[k];
    return m || SLICE_MS;
  }
  // A stretch made takes the place of the one before it.
  function morphPut(bd, i, pc) {
    const old = mt.pieces[i];
    pc.gen = bd.gen;
    mt.pieces[i] = pc;
    if (old?.set) { if (mt.using === old.set) morphOff(); old.set.owner.dropMorphSet(old.set); }
    bd.done[i] = true; bd.ndone++; bd.held = 0;
  }
  // One slice of the building (a may task: a slice a frame at most). Units run one after another while the next one is expected to
  // end inside SLICE_MS; the first always runs (a unit is one pass over the joins, which cannot be cut here).
  function morphTrackStep() {
    const bd = mt.build;
    if (!bd || bd.gen !== mt.gen) return false;
    if (!live.veins || live.veins.lost) { mt.build = null; return false; }
    // (Not while the figure moves at rest, for a while: a moment is a pass over every vessel. A move holds it for as long as the move
    // lasts, however long: beginMotion ends one itself after MOTION_MAX_MS. Only the person's own input is capped, at twelve looks. A
    // change between the views under way is built for, not held.)
    if (live.morph === live.morphTarget && (inMotion() || (sinceInput() < 700 && bd.held < 12))) {
      bd.held++;
      mayTask(TRACK_TAG, morphTrackStep, { notBefore: performance.now() + 120 });
      return false;
    }
    const t0 = performance.now();
    let st;
    for (;;) {
      st = morphTrackUnit(bd);
      if (st !== 1 || bd.gen !== mt.gen) break;
      if (performance.now() - t0 + unitNext(bd) > SLICE_MS) break;
    }
    const ms = performance.now() - t0;
    bd.busy += ms; bd.slices++; if (ms > bd.longest) bd.longest = ms;
    if (ms > SLICE_MS) mt.stats.over++;
    if (st === 2) {
      mt.stats.last = { reason: bd.reason, wallMs: performance.now() - bd.t0, busyMs: bd.busy, slices: bd.slices, longestMs: bd.longest, bad: bd.stage.filter((pc) => pc.bad).length };
      if (mt.build === bd) mt.build = null;
    }
    return st === 1;
  }
  // One unit: 1 more to do now, 0 waiting for the worker (its answer asks for the next slice), 2 all six made.
  function morphTrackUnit(bd) {
    const u0 = performance.now();
    let kind;
    const n = MORPH_PIECES.length;
    if (bd.results.length) {
      kind = 'upload';
      const [i, pc, b] = bd.results.shift();
      try { if (!b) throw new Error('no binning'); setOf(pc, b); } catch (e) { pc.bad = String(e); }
      morphPut(bd, i, pc);
    } else if (bd.inflight < 0 && bd.ready.length) {
      kind = 'send';
      const i = morphPick(bd.ready);
      bd.ready.splice(bd.ready.indexOf(i), 1);
      const pc = bd.stage[i], snaps = pc.snaps, side = pc.anat ? 0 : 1;
      pc.snaps = null;
      bd.inflight = i;
      const gen = bd.gen;
      sweepPiece(pc, snaps, mt.reach[side]).then((b) => {
        if (gen !== mt.gen) return;
        bd.inflight = -1; bd.results.push([i, pc, b]); morphTrackAsk();
      }, (e) => {
        if (gen !== mt.gen) return;
        bd.inflight = -1; pc.bad = String(e); bd.results.push([i, pc, null]); morphTrackAsk();
      });
    } else {
      const cand = [];
      for (let i = 0; i < n; i++) if (!bd.done[i] && bd.inflight !== i && !bd.ready.includes(i)) cand.push(i);
      if (!cand.length) return bd.ndone >= n ? 2 : 0;
      const i = morphPick(cand);
      kind = morphPrep(bd, i);
    }
    noteUnit(kind, performance.now() - u0);
    return bd.ndone >= n ? 2 : 1;
  }
  // One unit of a stretch's moments: its items, the joins of the side's own vessels and of all, and the joins between two moments (a
  // pass over the joins each: a moment's passes in one task were a long task each, start-up profile 2 Nov 2026). Its last unit hands
  // the stretch over to the worker's queue (ready).
  function morphPrep(bd, i) {
    const pc = bd.stage[i];
    // (The anatomy's side ends just short of the half, where the circuit's vessels take over.)
    const ts = pc.ts ||= Array.from({ length: MORPH_STEPS + 1 }, (_, q) => (q === MORPH_STEPS && pc.t1 === 0.5 ? 0.5 - 1e-6 : pc.t0 + (pc.t1 - pc.t0) * q / MORPH_STEPS));
    const snaps = pc.snaps ||= [];
    const t = ts[snaps.length];
    let w = pc.work, kind;
    if (!w) { pc.work = { items: itemsAt(t, pc.anat), own: itemsAt(t, pc.anat, false), o: null, all: null, q: 1, J2: [] }; return 'items'; }
    // (The joins of the side's own vessels too: a vessel binned for the other side changes the joins it takes part in.)
    if (!w.o) { w.o = joinsAhead(w.own, t); return 'joins own'; }
    if (!w.all) { w.all = joinsAhead(w.items, t); kind = 'joins all'; }
    // (The joins at moments between too: one can be there for less than a step, as two ends pass each other.)
    else if (snaps.length && w.q < MORPH_JSUB) { const u = lerp(snaps[snaps.length - 1].t, t, w.q / MORPH_JSUB); w.J2.push(...joinsAhead(itemsAt(u, pc.anat, false), u).J); w.q++; kind = 'joins between'; }
    if (!(w.all && (!snaps.length || w.q >= MORPH_JSUB))) return kind;
    pc.work = null;
    const { items, own, o } = w;
    snaps.push({ t, items, ...w.all, J2: o.J.concat(w.J2), own: new Map(own.map((it) => [it.row, o.smooth.get(it.row) || it.pts])) });
    if (snaps.length < ts.length) return kind;
    const rows = rowKey(snaps[0].items);
    if (snaps.some((sn) => rowKey(sn.items) !== rows)) { pc.bad = 'vessels'; pc.snaps = null; morphPut(bd, i, pc); return kind; }
    pc.ts = ts; pc.rows = rows;
    bd.ready.push(i);
    return kind;
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
    const joins = U.map(({ j }, ji) => ({ path: pc.jpath[ji], reach: pc.jreach[ji] + MORPH_JSLACK - MORPH_SLACK, k: j.k, fillet: j.fillet, members: j.members, trunk: j.trunk, fork: j.fork }));
    return live.sweepBin({ tubes, joins, opts: { rows: GL_ROWS, samples: N_SAMPLES, slack: MORPH_SLACK, tight: !!pc.tight } });
  }
  function setOf(pc, b) {
    pc.set = live.veins.makeMorphSet(b);
    pc.frame = new Float32Array((b.rows - b.entRows) * ENT_W * 4);
    pc.posBase = b.posBase - b.entRows * ENT_W; pc.joinBase = b.joinBase - b.entRows * ENT_W;
  }
  return { MORPH_GPU, MORPH_JSLACK, MORPH_SLACK, joinKey, joinsKept, joinsOf, morphMiss, morphOff, morphTrackSoon, mt, rowKey, setOf, sweepPiece, visAt };
}
