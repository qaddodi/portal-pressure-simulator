// Moving blood, flow and dye: the streams and their ends, the rest ease, the chain rows, stepBlood, the dye bolus and the spray.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { EDGES, NODES } from '../engine/topology.js';
import { SITES } from './anatomy.js';
import { DRIFT_PERIOD, DRIFT_RATE, DYE_BINS, HIDDEN_SECONDS, KAPPA, KEY_CHEV_LANES, MEAN_TAU, ORIGIN_N, PERIOD, STASIS_MIN_D, advanceStreamAt, bleedShapes, chevFlowLevel, createBreathMean, createStreamChain, displaySpeed, fadeBleedShapes, keyChevron, originFractionsInto, stepBleedFade } from './blood.js';
import { createDyeRemote } from './dye-remote.js';
import { flowClose, retireRows } from './flow-rows.js';
import { COUNTED, gpuProbe } from './gpu-probe.js';
import { reduceMotionMQ as reduceMotion } from './motion.js';
import { store } from './store.js';
import { bloodColors, clamp } from './util.js';
import { FLOW_TEXELS } from './veins-gl.js';
import { CHEV_PITCH } from './chevron-glsl.js';
import { STYLE_D, STYLE_E } from './blood-tile.js';

// The blood look each view draws (blood-tile.js): Anatomy look D; Circuit look E (sines, no texture read).
const STYLE_ANATOMY = STYLE_D, STYLE_CIRCUIT = STYLE_E;

export function createBlood(st, live) {
  const { E, EI, EV, GL_ROWS, SIDE_HOSTS, bal, cath, easeInOut, geo, glow, holdReversals, layerMode, revHold } = st;
  // ── Moving blood ──────────────────────────────────
  // What is kept true, and what is exaggerated, is set out in blood.js. Every model vessel has a
  // stream (hidden ones too: a dye bolus passes through them); each drawn vessel, strand and
  // tributary row gets FLOW_TEXELS texels for the GPU:
  //   0: stream distance (world, modulo PERIOD), display speed (signed, from → to), parcels a
  //      second, stasis (0–1)
  //   1: free at the from end, free at the to end (parcels fade there), strength, reversed (0–1, eased)
  //   2: fraction of its blood from the SMV, the IMV, the splenic vein and the hepatic artery (rest: systemic)
  //   3: chevron visibility (0–1, eased: Key chevrons only fades the rest); the still chevrons' spacing level (reduced motion,
  //      chevFlowLevel); the stagnant blood's drift (shimmer cells, blood.js drift)
  //   6: the blood clock the stream was anchored at (from bEpoch) and its display speed's factor (0: not anchored);
  //      texels 0 and 3 then hold the distance and drift as they stood at that clock (anchorStream, veins-gl flowD);
  //      w: the origin blend's Péclet number along the vessel, signed by the flow from → to (0: one blood all along; blood.js originEnds)
  //   7: the downstream junction's blend (as texel 2), which the origin colours mix toward along a vessel whose blood sloshes
  // And beside the table, headRuns: the arrowheads' own run per row (blood-heads.js, 13 Nov 2026; veins-gl setHeadRuns): the offset
  // added to the run's A, and its B (0: the run's own, A 0 and B 1 for the vessel's own stream). The streaks cross-fade from one stream
  // to another through a junction's link (texel 4, w); the heads move over at once, onto the new stream placed where the old one stood
  // (chainRows), and then ease to the junction's own A and B, so a head never fades out for another to come in somewhere else.
  const flowData = new Float32Array(GL_ROWS * FLOW_TEXELS * 4);
  // (The rows written this frame and last: stepBlood clears a row once when its vessel stops drawing.)
  const flowNow = new Uint8Array(GL_ROWS), flowWas = new Uint8Array(GL_ROWS);
  let flowKept = null, flowKeptFor = null;   // (the table as last sent while the blood stood still: stepBlood)
  const dyeData = new Float32Array(GL_ROWS * DYE_BINS), dyeRow = new Float32Array(DYE_BINS);
  // (Every number a stream will hold is a number from the start, so each field is a double kept in place: a field that began as nothing, or as a
  // whole number, was stored as a new heap number at every write, about a hundred bytes for each vessel each frame. NaN is "not set yet":
  // advanceKept's vSlow and vm, anchorStream's aB.)
  const streams = EDGES.map((e, k) => ({ seed: k + 1, vSlow: NaN, vFast: NaN, D: 0.5, hold: 0.5, settle: 0.5, vOld: 0.5, vm: NaN, v: 0.5, vd: 0.5, stasis: 0.5, drift: 0.5, aB: NaN, aA: 0, vp: 0, aD: 0.5, aV: 0.5, aT: 0.5, aS: 0.5, aR: 0.5 }));
  const LARGE = EDGES.map((e) => (e.kind === 'vein' || e.kind === 'diode') && (e.d || 0) >= STASIS_MIN_D);
  // (The slugs step in a worker, dye-remote.js; ?dyeworker=0 keeps them here.)
  const bolus = createDyeRemote(EDGES, NODES, () => new Worker(new URL('./dye-worker.js', import.meta.url), { type: 'module' }));
  const net = { Q: new Float32Array(EDGES.length), vd: new Float32Array(EDGES.length), len: new Float32Array(EDGES.length) };
  // (The blood clock's epoch for the GPU: the shader takes the clock less it, kept under BT_SPAN seconds so its float stays fine; each
  // time it moves on, every stream is anchored again from its own distance.)
  const ACC_MAX = 200, BT_SPAN = 32, VD_HAIR = 0.01, VD_REL = 0.004, STASIS_HAIR = 0.002;
  let bEpoch = 0;
  // (The speed and the blood clock come in `so` (streamOpts: speed, bt), not as arguments: a number passed to a call that is not inlined is
  // boxed in a new heap number, two for each vessel of a frame.)
  function anchorStream(sm, so, reset) {
    const sp = so.speed, t = so.bt;
    if (!reset && t >= sm.aB) {
      const dt = t - sm.aB;
      // (Where the GPU has it now: the stream's own distance and drift follow it, so the two never part. The GPU integrates the
      // display speed's slope aA too (flowD), so a beat's swing needs no new anchor while the slope holds.)
      sm.D = (((sm.aD + (sm.aV + 0.5 * sm.aA * dt) * sm.aS * dt) % PERIOD) + PERIOD) % PERIOD;
      sm.drift = (sm.aR + sm.aT * DRIFT_RATE * dt) % DRIFT_PERIOD;
      if (sp === sm.aS && Math.abs(sm.vd - (sm.aV + sm.aA * dt)) <= VD_HAIR + VD_REL * Math.abs(sm.aV) && Math.abs(sm.stasis - sm.aT) <= STASIS_HAIR) { sm.vp = sm.vd; return; }
    }
    // (The new slope: this frame's change in the display speed over the blood clock it took; none while the clock stands still.)
    const a = so.dt > 0 && sm.aB === sm.aB ? (sm.vd - sm.vp) / so.dt : 0;
    sm.aA = a > ACC_MAX ? ACC_MAX : a < -ACC_MAX ? -ACC_MAX : a;
    sm.vp = sm.vd;
    sm.aB = t; sm.aD = sm.D; sm.aV = sm.vd; sm.aT = sm.stasis; sm.aS = sp; sm.aR = sm.drift || 0;
  }
  // In the imaging view the flow shows once a Doppler has looked at it (still in neutral colours: pressures stay unmeasured).
  const flowSeen = () => !store.get().imaging || !!store.get().found?.has('flow');
  const bloodOn = () => !!live.F && flowSeen() && store.get().layers.flow !== false;
  const chevOn = () => !!live.F && flowSeen() && !!store.get().blood?.chevrons;
  // Key chevrons only (Blood menu; always while presenting): chevrons keep to the portal story (the portal
  // inflow, the liver's beds, the hepatic veins, any open collateral or shunt) and to a lit vessel; the rest fade.
  // (Which vessels: keyChevron in blood.js; a vein in an open collateral's lane counts while it is open.)
  const laneOpen = (id) => !!E[id]?.vis && !E[id].ghost;
  const keyOnly = () => !!store.get().presenting || !!store.get().blood?.keyChevrons;
  // The Blood origin lens colors each lumen by where its blood comes from (streams side by side).
  // (Its sibling, the First pass lens, colors the same streams by what the liver did to the gut blood: blood.js FIRSTPASS.)
  const originOn = () => !!live.F && (layerMode() === 'origin' || layerMode() === 'firstpass');
  let oPass = false, oPassed = false;   // (the lens the origin colours are worked for; kept while the lens fades out, so they do not change colour on the way)
  // Its mixing along a vessel (blood.js originEnds): each vessel's flow forward and back, from the model's beat-by-beat flow, averaged
  // over a few breaths (ORIGIN_TAU s). Their difference is the mean that sets the blends at the junctions; the smaller of the two is the
  // blood that runs to and fro. One pass over the vessels a frame, a few sums each; the blends themselves are worked out once a model frame.
  const ORIGIN_TAU = 3;
  const oFwd = new Float64Array(EDGES.length), oBack = new Float64Array(EDGES.length), oMean = new Float64Array(EDGES.length);
  const oEnds = { slosh: new Float64Array(EDGES.length), down: new Float32Array(EDGES.length * ORIGIN_N), pe: new Float32Array(EDGES.length), join: new Float32Array(EDGES.length) };
  // A shunt drawn into the side of a vein part-way (stage-geo.js SIDE_HOSTS) whose model end is the shunt's own node: the left renal vein's
  // venules (V_KID_L) take the splenorenal shunt in front of the node, so from there on they carry the shunt's blood too (blood.js originEnds, join).
  const HOSTED = [];
  for (const cid of Object.keys(SIDE_HOSTS || {})) for (const hid of SIDE_HOSTS[cid][1] || []) if (EI[cid] != null && EI[hid] != null && EDGES[EI[cid]].to === EDGES[EI[hid]].to) HOSTED.push({ cid, hid, kc: EI[cid], kh: EI[hid] });
  // Where along `P` (a polyline of [x, y]) the point (px, py) falls, 0 to 1 by arc length.
  function arcFrac(P, px, py) {
    let tot = 0, best = Infinity, at = 0;
    for (let i = 1; i < P.length; i++) {
      const ax = P[i - 1][0], ay = P[i - 1][1], dx = P[i][0] - ax, dy = P[i][1] - ay, l2 = dx * dx + dy * dy, l = Math.sqrt(l2);
      const t = l2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0, d2 = (ax + t * dx - px) ** 2 + (ay + t * dy - py) ** 2;
      if (d2 < best) { best = d2; at = tot + t * l; }
      tot += l;
    }
    return tot > 0 ? at / tot : 0;
  }
  function setJoins() {
    oEnds.join.fill(0);
    if (live.morph >= 0.5) return;   // (the circuit draws no shunt into a vein's side)
    for (let i = 0; i < HOSTED.length; i++) {
      const h = HOSTED[i], c = E[h.cid], P = geo[h.hid]?.cur, C = geo[h.cid]?.cur;
      if (!c?.vis || c.ghost || !E[h.hid]?.vis || !P || P.length < 2 || !C || C.length < 2 || !(oMean[h.kc] > 0.01) || !(oMean[h.kh] > 0)) continue;
      const end = C[C.length - 1], j = arcFrac(P, end[0], end[1]);
      if (j > 0.02 && j < 0.98) oEnds.join[h.kh] = j;
    }
  }
  let oSeeded = false;
  function stepOriginFlow(dt) {
    const Q = live.F.Q, Qf = live.F.Qf || Q;
    if (!oSeeded) { oSeeded = true; for (let k = 0; k < EDGES.length; k++) { oFwd[k] = Math.max(0, Qf[k]); oBack[k] = Math.max(0, -Qf[k]); } }
    else if (dt > 0) {
      const a = -Math.expm1(-dt / ORIGIN_TAU);
      for (let k = 0; k < EDGES.length; k++) { const q = Q[k]; oFwd[k] += ((q > 0 ? q : 0) - oFwd[k]) * a; oBack[k] += ((q < 0 ? -q : 0) - oBack[k]) * a; }
    }
    for (let k = 0; k < EDGES.length; k++) { oMean[k] = oFwd[k] - oBack[k]; oEnds.slosh[k] = Math.min(oFwd[k], oBack[k]); }
  }
  // Mean velocity (cm/s) for a flow (mL/s): flow over lumen area; the liver beds are not one tube.
  function velOf(k, q) {
    const D = Math.max(0.5, live.F.D[k]) / 10;
    return EDGES[k].kind === 'liver' ? q * 0.6 : q / (Math.PI * D * D / 4);
  }
  // A drawn end is free when no other drawn vessel ends there: parcels fade in or out at it.
  // (Versioned: the geometry, the morph to two places and which vessels count, compared in place instead of a list and a
  // joined key built every frame; round 2 review, P8.)
  let endsIn = null, endsGeo = -1, endsMorph = -1;
  // Another drawn vessel ends at `node` within 20 units of (px, py)? (Each drawn vessel's two ends are looked at; no list of them is kept.)
  function endJoined(x, node, px, py) {
    for (let j = 0; j < EV.length; j++) {
      const y = EV[j];
      if (!endsIn[j] || y === x) continue;
      const P = geo[y.e.id].cur;
      if (y.e.from === node && Math.hypot(P[0][0] - px, P[0][1] - py) < 20) return true;
      if (y.e.to === node && Math.hypot(P[P.length - 1][0] - px, P[P.length - 1][1] - py) < 20) return true;
    }
    return false;
  }
  function syncEnds() {
    if (!endsIn || endsIn.length !== EV.length) { endsIn = new Uint8Array(EV.length); endsGeo = -1; }
    const mk = Math.round(live.morph * 100);
    let same = endsGeo === live.geometryVersion && endsMorph === mk;
    for (let i = 0; i < EV.length; i++) {
      const x = EV[i], v = x.vis && !x.isArt && !x.ghost ? 1 : 0;
      if (endsIn[i] !== v) { endsIn[i] = v; same = false; }
    }
    if (same) return;
    endsGeo = live.geometryVersion; endsMorph = mk;
    for (let i = 0; i < EV.length; i++) {
      if (!endsIn[i]) continue;
      const x = EV[i], P = geo[x.e.id].cur, a = P[0], b = P[P.length - 1];
      x.freeFrom = !endJoined(x, x.e.from, a[0], a[1]) && !x.feeders?.length;
      x.freeTo = !endJoined(x, x.e.to, b[0], b[1]);
    }
  }
  const streamOpts = { phasic: false, speed: 1, large: true, still: false, rev: false, dt: 0, bt: 0 };
  // Facts that change only with a model frame (or the healthy reference), kept per frame instead of worked out every display
  // frame: each vessel's reversed flag and its two velocities. Key chevrons: 1 for a vessel that always keeps them, 2 for one
  // that keeps them while an open collateral runs in its lane (asked each frame), 0 for none (round 2 review, P8).
  const velQf = new Float64Array(EDGES.length), velQ = new Float64Array(EDGES.length);
  // (Each vessel's |flow| over a breath (breathQ) and then on the chevrons' own time-averaged mean (MEAN_TAU), for the links through
  // junctions: chainRows. NaN: not set yet. breathQ: each vessel's flow over the last breath, from which the chevrons' mean starts.)
  const qSlow = new Float64Array(EDGES.length).fill(NaN), breathQ = createBreathMean(EDGES.length);
  let perF = null, perH = null;
  const KEY_K = EDGES.map((e) => (keyChevron(e) ? 1 : KEY_CHEV_LANES[e.id] ? 2 : 0));
  // Idle rest (idle-rest.js, main.js): left alone 30 s, the blood eases to a stop over REST_IN_S and the figure is drawn no more until
  // an input, which brings the motion back over REST_OUT_S from that frame. restK scales the blood's own clock: 1 moving, 0 at rest.
  const REST_IN_S = 1.5, REST_OUT_S = 0.4;
  const restStill = () => live.restOn && live.restU === 0;
  function stepRest(dt) {
    if (live.restOn ? live.restU === 0 : live.restU === 1) return;
    live.restU = clamp(live.restU + (live.restOn ? -dt / REST_IN_S : dt / REST_OUT_S), 0, 1);
    live.restK = easeInOut(live.restU);
  }
  const blendA = { s: null, c: null, o: null };   // shown share of the streaks, the chevrons and the origin colours (stepBlood)
  const eased = (v, to, k) => { if (Math.abs(to - v) <= 0.002) return to; live.bloodEasing = true; return v + (to - v) * k; };
  // Parcels through junctions (blood.js createStreamChain): each drawn vessel's main row, by its shown direction, with the model's
  // mean display speed (not the shown one, which eases to a stop on pause and swings with the beat: the link holds through both).
  // The cava is one tube of two edges (drawItems), so it keeps its own pattern. Written into the rows put() just filled: flow texel
  // 3 w the parent's row + 1; texel 4 the root's row + 1, A, B, w; texel 5 the root's distance and drift, and the ends' weights.
  const chain = createStreamChain(), chainIt = [], chainK = new Map();   // (chainK: row → edge, kept: a root fading out may no longer be drawn)
  const NO_CHAIN = new Set(['IVC_IS', 'IVCS_RA']);
  // (Rev 2 §2.8: the links are worked out again (chain.step, which builds its maps and lists) only when a candidate changed or a link
  // was still easing at the last step; otherwise the last step's answer, unchanged, is written into the rows again. Each candidate's
  // record is kept per slot, so a change is told by comparing each field as it is written, and a steady frame allocates nothing.)
  let chainLast = null;
  // The arrowheads' runs (flow texel 8), per row: the stream they are drawn on (-1 the vessel's own, else the root's row; -2 none last step),
  // that stream's edge, the A they were drawn with (target plus offset), their B and their offset. A head sits where A + B s − D is a
  // multiple of its spacing (blood-heads.js), D the stream's distance. When the stream a row's heads are drawn on changes (a link forms, lets
  // go or moves to another root), the new run takes B = ±(the old B) and A = D_new ± (A_old − D_old): the same lattice on the vessel, so
  // every head stays where it is (the sign keeps B's own: a run the other way round is the same set, j for −j). The offset to the junction's
  // own A is cut to the nearest two spacings at the zoom now (so every other head's fade matches too) and then eases to 0, and B to its
  // own, over HEAD_EASE seconds: the heads slide into step with the junction instead of fading out and in at new places.
  const HEAD_EASE = 0.5;
  const hRun = new Int32Array(GL_ROWS).fill(-2), hK = new Int32Array(GL_ROWS), hA = new Float64Array(GL_ROWS), hAt = new Float64Array(GL_ROWS), hB = new Float64Array(GL_ROWS), hDel = new Float64Array(GL_ROWS);
  const hSeen = new Uint32Array(GL_ROWS), headRuns = new Float32Array(GL_ROWS * 2);
  let hStamp = 0;
  function headRun(row, root, k, At, Bt, kH) {
    hSeen[row] = hStamp;
    const D = streams[k].D;
    // (Two spacings at the zoom now, in stream units: blood-heads.js headLevel, from the CSS px a world unit spans.)
    const sk = live.CTM?.sc || 1, Pt = CHEV_PITCH / sk;
    if (hRun[row] === -2) { hB[row] = Bt; hDel[row] = 0; }
    else if (hRun[row] !== root || hK[row] !== k || Math.sign(hB[row]) !== Math.sign(Bt) || Math.abs(At - hAt[row]) > 0.25 * Pt * Math.abs(hB[row])) {
      // (A new stream, or the junction's A moving by more than a quarter of a spacing in a frame: placed where it stood.)
      // (Placed where the old run stood: the old stream's distance now, the A it was last drawn with.)
      const sg = Math.sign(Bt) * Math.sign(hB[row]) || 1, B = sg * hB[row], Ad = D + sg * (hA[row] - streams[hK[row]].D);
      const n = Math.floor(Math.max(-1, Math.log2(Math.max(Pt * Math.abs(B), 1e-6) / 28))), M = 56 * 2 ** n;
      const d = Ad - At;
      hDel[row] = d - M * Math.round(d / M); hB[row] = B;
    } else if (kH > 0) {
      hDel[row] = Math.abs(hDel[row]) < 1e-3 ? 0 : hDel[row] * (1 - kH);
      hB[row] = Math.abs(Bt - hB[row]) < 1e-4 ? Bt : hB[row] + (Bt - hB[row]) * kH;
    }
    if (hDel[row] !== 0 || hB[row] !== Bt) live.bloodEasing = true;
    hRun[row] = root; hK[row] = k; hA[row] = At + hDel[row]; hAt[row] = At;
    headRuns[row * 2] = hDel[row]; headRuns[row * 2 + 1] = hB[row];
  }
  function chainRows(kW, kB, kH = kW) {
    hStamp++;
    let n = 0, changed = !chainLast || chainLast.easing;
    for (let ix = 0; ix < EV.length; ix++) {
      const x = EV[ix];
      if (!x.vis || x.isArt || x.ghost || NO_CHAIN.has(x.e.id) || !flowNow[x.row]) continue;
      const g = geo[x.e.id], P = g?.cur, len = g?.len;
      if (!P || P.length < 2 || !(len > 0)) continue;
      const k = EI[x.e.id], sm = streams[k], sg = sm.sgn || 1, fwd = sg > 0;
      let it = chainIt[n];
      if (!it) { it = chainIt[n] = {}; changed = true; }
      const up = fwd ? x.e.from : x.e.to, down = fwd ? x.e.to : x.e.from, upPt = fwd ? P[0] : P[P.length - 1], downPt = fwd ? P[P.length - 1] : P[0];
      // (By the time-averaged mean, as the chevrons themselves run (blood.js MEAN_TAU), not the model's 1.5 s flow: that still swings
      // with the breath and the beat, and a link near its bounds then broke and formed again every breath, the heads fading out and
      // others coming in at new places (6 Nov 2026). blood-chain.test.js)
      const s0 = fwd ? 0 : len, sj = fwd ? len : 0, q = qSlow[k], m = displaySpeed(sg * Math.max(0, sg * sm.vSlow));
      if (it.key !== x.row || it.k !== k || it.up !== up || it.down !== down || it.upPt !== upPt || it.downPt !== downPt || it.s0 !== s0 || it.sj !== sj || it.q !== q || it.m !== m) changed = true;
      it.key = x.row; it.k = k; it.up = up; it.down = down; it.upPt = upPt; it.downPt = downPt; it.s0 = s0; it.sj = sj; it.q = q; it.m = m;
      n++;
    }
    if (chainIt.length !== n) { chainIt.length = n; changed = true; }
    const c = changed ? (chainLast = chain.step(chainIt, kW, kB)) : chainLast;
    if (c.easing) live.bloodEasing = true;
    for (let i = 0; i < n; i++) chainK.set(chainIt[i].key, chainIt[i].k);
    for (let i = 0; i < n; i++) {
      const o = chainIt[i].key * FLOW_TEXELS * 4, w = c.w[i], ef = c.ef[i], et = c.et[i];
      // (The heads: on the root's stream while there is any link, else the vessel's own; never mixed. Reduced motion: each its own.)
      { const rk = w > 0 ? chainK.get(c.root[i]) : undefined, own = rk == null || reduceMotion.matches;
        headRun(chainIt[i].key, own ? -1 : c.root[i], own ? chainIt[i].k : rk, own ? 0 : c.A[i], own ? 1 : c.B[i], kH); }
      if (!(w > 0) && !ef && !et) continue;
      if (w > 0) {
        const rk = chainK.get(c.root[i]), rs = rk != null ? streams[rk] : null;
        if (rs) {
          flowData[o + 15] = c.par[i] + 1;
          flowData[o + 16] = c.root[i] + 1; flowData[o + 17] = c.A[i]; flowData[o + 18] = c.B[i]; flowData[o + 19] = w;
          flowData[o + 20] = rs.aD; flowData[o + 21] = rs.aR;   // (the shader reads the root's own row: rootDD)
        }
      }
      flowData[o + 22] = ef; flowData[o + 23] = et;
    }
    // (A row no longer in the chain starts afresh when it comes back: its heads come in with its blood.)
    for (let r = 0; r < GL_ROWS; r++) if (hSeen[r] !== hStamp) { hRun[r] = -2; headRuns[r * 2] = 0; headRuns[r * 2 + 1] = 0; }
  }
  // (One empty list for every vessel with no strands, feeders or branches, and for no spray: none made each frame. Never written.)
  const NONE = Object.freeze([]), NO_OBJ = Object.freeze({});
  // (One flow row written whole; a function made once, not a closure made on each step.)
  function put(row, k, q, f0, f1, strength, ends) {
    const o = row * FLOW_TEXELS * 4, sm = streams[k];
    flowData.fill(0, o, o + FLOW_TEXELS * 4); flowNow[row] = 1;
    flowData[o] = sm.aD; flowData[o + 1] = sm.aV; flowData[o + 2] = KAPPA * Math.abs(q); flowData[o + 3] = sm.aT;
    flowData[o + 24] = sm.aB; flowData[o + 25] = sm.aS; flowData[o + 26] = sm.aA;
    flowData[o + 4] = f0 ? 1 : 0; flowData[o + 5] = f1 ? 1 : 0; flowData[o + 6] = strength; flowData[o + 7] = sm.rev;
    if (live.origins) for (let c = 0; c < ORIGIN_N; c++) flowData[o + 8 + c] = live.origins[k * ORIGIN_N + c];
    // (The origin blend along the vessel: the main row and its strands; a tributary or a liver branch drawn into it keeps one blood.)
    if (live.origins && ends && oEnds.pe[k] !== 0) { flowData[o + 27] = oEnds.pe[k]; for (let c = 0; c < ORIGIN_N; c++) flowData[o + 28 + c] = oEnds.down[k * ORIGIN_N + c]; }
    flowData[o + 12] = sm.chevK ?? 1;
    // Reduced motion: the chevrons stand still, so their spacing carries the flow (veins-gl chevAt): a level of 0 (the
    // finest, 28 units) for 0.8 L/min or more, one level coarser for each halving, at most 3.
    flowData[o + 13] = chevFlowLevel(q);
    flowData[o + 14] = sm.aR;
  }
  function stepBlood(dt) {
    const st = store.get(), b = st.blood || NO_OBJ;
    const moving = st.running && !reduceMotion.matches;
    const speed = st.clock === 'hemo' ? clamp(Math.sqrt(st.speed), 0.5, 2) : 0.8;
    const Qf = live.F.Qf || live.F.Q;
    if (moving) live.bloodClock = (live.bloodClock + dt * live.restK) % 10000;
    const bReset = (live.bloodClock < bEpoch || live.bloodClock - bEpoch > BT_SPAN);
    if (bReset) bEpoch = live.bloodClock;
    const bT = live.bloodClock - bEpoch;
    // Reversed flow (against the healthy direction, as the Direction lens has it) eases in and out.
    // (Reduced motion: the streams stand still but follow the flow's direction at once, and nothing eases.)
    const still = st.running && reduceMotion.matches;
    const ease = reduceMotion.matches ? 1 : -Math.expm1(-dt / 0.5);
    // (One options object and one key-chevrons answer for the whole loop, not one per vessel per frame: advanceStream reads
    // the options at once and keeps none of them.)
    const so = streamOpts, key = keyOnly();
    const aQ = moving ? -Math.expm1(-dt * live.restK / MEAN_TAU) : 0;
    // (Steady: no heartbeat or breathing swing in the blood's speed. Look D had forced it on in Anatomy (3b9e9c8), which slid the chevrons
    // back and forth and stopped them short; real reversed flow still runs backwards, by the mean.)
    so.phasic = !!b.phasic;
    // (Each on its own line, never after a comment: 0eec029 left these four inside the comment above, so the streams never stepped (dt 0).
    // Their mean stayed the flow they were made with, and a vessel that turned reversed stood in its settle for ever, showing its old
    // hepatopetal speed under the reversed orange; a TIPS kept the no flow it had at boot and showed no chevrons. blood-clock.test.js)
    so.speed = speed;
    so.still = still;
    so.dt = moving ? dt * live.restK : 0;
    so.bt = bT;
    // (bloodEasing: a reversed colour or a chevron fade still on its way keeps the figure awake, paused too, so it never stops
    // part-way until Play; each lands exactly once within 0.002 of its end. Round 2 review, B10.)
    live.bloodEasing = false;
    const H = st.healthy;
    // (A new model frame joins the breath's average; the mean the chevrons follow starts from it, not from the 1.5 s flow, which still
    // swings with the breath: blood.js createBreathMean.)
    const newF = perF !== live.F;
    if (perF !== live.F || perH !== H) {
      perF = live.F; perH = H;
      holdReversals(live.F);
      if (newF) breathQ.step(Qf, live.F.t ?? 0);
      const Qm = breathQ.mean;
      for (let k = 0; k < EDGES.length; k++) { velQf[k] = velOf(k, Qm[k]); velQ[k] = velOf(k, live.F.Q[k]); }
    }
    for (let k = 0; k < EDGES.length; k++) {
      // One signal turns both: the reversed colour and the way the blood and its chevrons run (isReversed, held: B3).
      const rt = revHold[k];
      so.large = LARGE[k]; so.rev = !!rt;
      const sm = advanceStreamAt(streams[k], velQf, velQ, k, so);
      const qa = Math.abs(breathQ.mean[k]);
      qSlow[k] = qSlow[k] === qSlow[k] && !still ? qSlow[k] + (qa - qSlow[k]) * aQ : qa;
      anchorStream(sm, so, bReset);
      sm.rev = sm.rev == null ? rt : eased(sm.rev, rt, ease);
      const ct = !key || KEY_K[k] === 1 || (KEY_K[k] === 2 && keyChevron(EDGES[k], laneOpen)) || (glow.lit.get(EDGES[k].id)?.to || 0) > 0 ? 1 : 0;
      sm.chevK = sm.chevK == null ? ct : eased(sm.chevK, ct, ease);
    }
    // The streaks, the chevrons and the origin colours fade in and out (0.15 s) when switched, by their toggles, the catheter
    // (which hides the chevrons while it is in) or the lens, instead of in one frame; Reduce Motion keeps fades (round 2
    // review, B4).
    const kF = -Math.expm1(-dt / 0.15), tS = bloodOn() ? 1 : 0, tC = chevOn() && !cath.st ? 1 : 0, tO = originOn() ? 1 : 0;
    blendA.s = blendA.s == null ? tS : eased(blendA.s, tS, kF);
    blendA.c = blendA.c == null ? tC : eased(blendA.c, tC, kF);
    blendA.o = blendA.o == null ? tO : eased(blendA.o, tO, kF);
    if (!live.veins) return;
    const on = blendA.s > 0 || blendA.c > 0 || blendA.o > 0;
    stepOriginFlow(moving ? dt * live.restK : 0);
    if (originOn()) oPass = layerMode() === 'firstpass';
    if (blendA.o > 0 && (live.originsF !== live.F || oPassed !== oPass)) setJoins();
    if (blendA.o > 0 && (live.originsF !== live.F || oPassed !== oPass)) {
      live.origins = originFractionsInto(EDGES, NODES, oMean, live.F.Pf || live.F.P, live.origins?.length === EDGES.length * ORIGIN_N ? live.origins : new Float32Array(EDGES.length * ORIGIN_N), oEnds, oPass);
      live.originsF = live.F; oPassed = oPass;
    }
    syncEnds();
    // (Each row drawn is written whole and a row no longer drawn is cleared once after the loop (flow-rows.js retireRows): the
    // table ends as a clear of all of it before the writes left it, without clearing and refilling every row each frame.)
    // A vessel drawing on (a TIPS, a new collateral) or retracting carries its blood in step with its stroke, and a strand or a
    // tributary as it comes and goes: a strength that follows them, instead of no blood until the end and then all of it in
    // one frame (round 2 review, B4).
    const tR = performance.now();
    if (on) for (const x of EV) {
      // The hepatic artery keeps its own red in the Blood origin lens: its row carries no streams, but a -1 in the origin texel tells the
      // shader to keep the lumen's colour (an empty row read as 100 % systemic, a grey blue).
      if (x.tube && x.vis && !x.ghost) { const o = x.row * FLOW_TEXELS * 4; flowData.fill(0, o, o + FLOW_TEXELS * 4); flowNow[x.row] = 1; flowData[o + 8] = -1; continue; }
      if (!x.vis || x.isArt || x.ghost) continue;
      const r = x.reveal, rs = r ? (r.out ? 1 - easeInOut(clamp((tR - r.t0) / r.dur, 0, 1)) : easeInOut(clamp((tR - r.t0) / r.dur, 0, 1))) : 1;
      const k = EI[x.e.id], q = Qf[k];
      // A braided collateral's channels share its flow by cross-section (a channel still coming in, by its share of it).
      // (Summed in place, not through a filtered copy of the strands each frame.)
      const strands = live.morph < 0.5 ? x.strands : null;
      let area = 1;
      if (strands) for (const sd of strands) if ((sd.live ?? 1) > 0) area += sd.k * sd.k * (sd.live ?? 1);
      put(x.row, k, q / area, x.freeFrom, x.freeTo, rs, true);
      if (strands) for (const sd of strands) if ((sd.live ?? 1) > 0) put(sd.row, k, q * sd.k * sd.k / area, true, true, rs * (sd.live ?? 1), true);
      // Tributaries drawn into a trunk: a share of its flow by caliber.
      if (live.morph < 0.5) for (const fd of x.feeders || NONE) if ((fd.live ?? 1) > 0 && fd.w) put(fd.row, k, q * 0.5 * (fd.w / Math.max(1, x.width)) ** 2, true, false, rs * (fd.live ?? 1));
      // The liver's branches in the circuit: a share of the vessel's flow by caliber.
      if (live.morph >= 0.5) for (const cb of x.cbr || NONE) if (cb.w) put(cb.row, k, q * 0.5 * (cb.w / Math.max(1, x.width)) ** 2, true, true, rs, oPass);   // (First pass: a liver branch cleans along its length too)
    }
    if (on) {
      // (At idle rest the junctions' blends hold where the blood stopped: rewritten as they stand, no step taken, and a blend that was
      // still on its way does not keep the figure awake. It goes on from there when the motion comes back.)
      if (restStill()) { const was = live.bloodEasing; chainRows(0, 0, 0); live.bloodEasing = was; }
      else chainRows(reduceMotion.matches ? 1 : -Math.expm1(-dt / 0.25), reduceMotion.matches ? 1 : -Math.expm1(-dt / 1), reduceMotion.matches ? 1 : -Math.expm1(-dt / HEAD_EASE));
    }
    const retired = retireRows(flowData, flowWas, flowNow, FLOW_TEXELS * 4);
    if (retired && gpuProbe.on) for (let i = 0; i < retired; i++) gpuProbe.note(COUNTED.flowRetired);
    // (While the blood stands still, a table within a hundredth of what the GPU holds is not sent: the same picture, so the
    // figure sleeps through the model's own wobble instead of drawing again on each of its frames. flow-rows.js flowClose.)
    const flowing = moving && !restStill();   // (at rest the streams stand where they stopped: the same table, not sent again)
    if (flowing || flowKeptFor !== live.veins || !flowClose(flowData, flowKept, FLOW_TEXELS * 4, GL_ROWS)) {
      flowKeptFor = live.veins;
      live.veins.setFlow(flowData);
      live.veins.setHeadRuns?.(headRuns);
      if (flowing) flowKept = null; else (flowKept ||= new Float32Array(flowData.length)).set(flowData);
    }
    // The dye bolus, through every vessel (hidden ones take a second each).
    if (bolus.active) {
      for (let k = 0; k < EDGES.length; k++) {
        const x = E[EDGES[k].id];
        net.Q[k] = Qf[k];
        net.vd[k] = Math.max(3, Math.abs(streams[k].vd)) * speed;
        net.len[k] = x?.vis && geo[x.e.id]?.len ? geo[x.e.id].len : Math.max(20, net.vd[k] * HIDDEN_SECONDS);
      }
      if (moving) bolus.step(dt, net); else if (bolus.remote) bolus.step(0, net);   // (paused: the worker's table binned again for the lengths now)
      dyeData.fill(0);
      for (const x of EV) {
        if (!x.vis || x.isArt) continue;
        if (!bolus.field(EI[x.e.id], net, dyeRow)) continue;
        dyeData.set(dyeRow, x.row * DYE_BINS);
        for (const sd of x.strands || NONE) dyeData.set(dyeRow, sd.row * DYE_BINS);
      }
      live.veins.setDye(dyeData); live.dyeShown = true;
    } else if (live.dyeShown) { live.veins.setDye(null); live.dyeShown = false; }
  }
  /**
   * Starts a dye injection: into vessel `id` (default: the gut's veins, as in mesenteric
   * portography). `hold`: it goes on until releaseDye().
   */
  function injectDye(id, { hold = false } = {}) {
    const e = EDGES[EI[id]] ? id : 'V_INT';
    bolus.inject(EI[e], id && EDGES[EI[id]] ? 0.15 : 0, { hold });
    if (!store.get().running) store.set({ running: true });
  }
  // (A tamponade balloon that is up over the tear presses it shut: once it has filled, the spray and the pool ease out with it, and
  // they come back if it is let down while the model still bleeds. The model's own bleed ends BALLOON_SEAL_S after the balloon is on:
  // engine.js. Up here is the eased picture of it, tied to the balloon on screen, not to the model's clock.)
  const pressedShut = () => bal.wantGas && bal.gas >= 1;   // (the tube's gastric balloon, filled and drawn up, presses either tear shut: engine.js)
  const sprayOn = () => !!live.F?.bleed?.active && live.morph < 0.5 && !pressedShut();
  const sprayFading = () => live.sprayA !== (sprayOn() ? 1 : 0);
  function stepSpray(dt) {
    if (sprayOn()) live.sprayLast = { bleed: live.F.bleed, rate: live.F.metrics.bleeding?.rate };
    live.sprayA = stepBleedFade(live.sprayA, sprayOn(), dt, reduceMotion.matches);
    if (live.sprayA <= 0) live.sprayLast = null;
  }
  function bleedSpray() {
    if (live.sprayA <= 0 || !live.sprayLast) return NONE;
    // (A steady stream and its pool: no beat in them, so no clock here; the shader slides the stream on the blood's own clock.)
    return fadeBleedShapes(bleedShapes(live.sprayLast.bleed, live.sprayLast.rate, SITES), live.sprayA);
  }
  // (The look handed to the vessel layer is one kept record, written in place on each ask: the layer reads it at once; the colours are
  // the cached set bloodColors gives.)
  const BLOOD_LOOK = { on: false, still: false, chev: false, look: undefined, origin: false, streakA: 0, chevA: 0, originA: 0, streakLen: true, clock: 0, bt: 0, style: 0, dye: true, bleed: NONE, noChev: undefined, holes: undefined, vdpr: 1,
    originCol: null, dyeCol: null, inkLight: null, inkDark: null, revCol: null, chevInk: null, chevLight: null };
  function bloodLook() {
    const st = store.get(), b = st.blood || NO_OBJ, L = BLOOD_LOOK, bc = bloodColors();
    // (Each drawn while it shows at all, by its eased share: stepBlood's blendA; its own switch before the first step.)
    const sA = blendA.s ?? (bloodOn() ? 1 : 0), cA = blendA.c ?? (chevOn() && !cath.st ? 1 : 0), oA = blendA.o ?? (originOn() ? 1 : 0);
    L.on = sA > 0; L.still = reduceMotion.matches; L.chev = cA > 0; L.look = b.look; L.origin = oA > 0; L.streakA = sA; L.chevA = cA; L.originA = oA;
    L.style = live.morph < 0.5 ? STYLE_ANATOMY : STYLE_CIRCUIT;   // (a view's look: blood-tile.js STYLE_*; Circuit's is its own thread's to change)
    L.clock = live.bloodClock; L.bt = live.bloodClock - bEpoch; L.dye = !st.imaging; L.bleed = bleedSpray(); L.noChev = live.noChevBoxes; L.holes = live.chevHoles; L.vdpr = live.vdpr;
    L.originCol = bc.originCol; L.dyeCol = bc.dyeCol; L.inkLight = bc.inkLight; L.inkDark = bc.inkDark; L.revCol = bc.revCol; L.chevInk = bc.chevInk; L.chevLight = bc.chevLight;
    if (oPass) L.originCol = bc.firstCol;   // (the First pass lens's five colours in the origin slots)
    return L;
  }
  return { bloodLook, bloodOn, bolus, chevOn, injectDye, originOn, restStill, sprayFading, sprayOn, stepBlood, stepRest, stepSpray, streams };
}
