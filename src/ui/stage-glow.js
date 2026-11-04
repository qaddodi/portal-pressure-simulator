// The vessel glow engine: one set of glow sources (hover, slides, focus, Doppler, pressure change) lit by the GPU with the vessels.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { EDGES, STENT_SPANS, isStent, stentGate } from '../engine/topology.js';
import { makeProbeDraw, makeProbePose } from './dop-probe.js';
import { D_SMALL } from './ease.js';
import { reduceMotionMQ as reduceMotion } from './motion.js';
import { store } from './store.js';

export function createGlow(st, live) {
  const { ALL_EDGES, E, EI, geo, nextFrame } = st;
  // ── Vessel glow: one engine for every highlight ──
  // Hover, a slide's glows, a step's focus, the Doppler's vessel and a change in pressure all light a vessel the same
  // way: a thin soft band hugging its live wall on both sides, fading to nothing at a free end, drawn by the GPU with
  // the vessels (veins-gl.js, tube rows 10 and 11). It follows every move and pulse for free: no blur, no mask, no
  // outline to rebuild. Each source asks for vessels in a colour (null: the vessel's own); a vessel several sources
  // light takes the colour of the last in GLOW_RANK. Each eases in and out on its own, so a change cross-fades.
  const GLOW_RANK = ['spot', 'sel', 'hover', 'flash', 'delta', 'dop', 'slide', 'focus', 'shunt', 'key'];
  // (A Map for every source GLOW_RANK names, made here once: setGlowSrc is asked only for those, so none is made on a call.)
  const glow = { src: new Map(GLOW_RANK.map((k) => [k, new Map()])), lit: new Map(), raf: 0, t: 0 };
  /** list: [{ id, col (a CSS colour, or null), amt (strength, 1 by default), wide (band width ×, ≤ 1.3), at (ms to wait before easing in),
   *  span ([from, to] along the vessel, 0–1: only that stretch glows, as a stent's third) }] */
  const glowWant = new Map();   // (the vessels wanted: emptied and filled again by each setGlowSrc)
  const glowPairs = [];   // (each wanted vessel's two ends, as node, colour, node, colour…: how many glow in which colour at a node)
  // (Two sources lighting a vessel in one colour are merged into one of these, written in place: one per vessel, made once, and read only
  // within the call that fills glowWant.)
  const glowLitPool = {};
  for (const id in E) glowLitPool[id] = { v: 0, to: 0, col: null, from: null, cu: 1, rgb: undefined, end: [0, 0], endT: [0, 0], span: [0, 0], spanT: [0, 1] };
  const glowMergePool = ALL_EDGES.map(() => ({ merged: true, id: undefined, col: undefined, amt: undefined, wide: undefined, at: undefined, top: undefined, dur: undefined, span: undefined }));
  // How far from its end a glow fades: a free end over a third of the vessel, an end that meets another colour over a few units, and none
  // where it runs on into a vessel glowing in the same colour.
  function glowEnd(n, key, len) {
    let tot = 0, same = 0;
    for (let i = 0; i < glowPairs.length; i += 2) if (glowPairs[i] === n) { tot++; if (glowPairs[i + 1] === key) same++; }
    return tot < 2 ? 0.35 * len : same > 1 ? 0 : Math.min(0.3 * len, 16);
  }
  function setGlowSrc(src, list) {
    const mine = glow.src.get(src);
    if (mine) { mine.clear(); if (list) for (let i = 0; i < list.length; i++) if (E[list[i].id]) mine.set(list[i].id, list[i]); }
    const want = glowWant;
    want.clear();
    let merged = 0;
    // (Two sources lighting a vessel in the same colour keep the stronger, wider glow: hovering a selected vessel never dims it.)
    for (let ri = 0; ri < GLOW_RANK.length; ri++) {
      const m = glow.src.get(GLOW_RANK[ri]);
      if (m) for (const [id, g] of m) {
        const was = want.get(id);
        if (was && (was.col ?? null) === (g.col ?? null)) {
          // (A vessel merged again by a third source takes its own record on: one record per vessel is all a call can need.)
          const o = was.merged === true ? was : glowMergePool[merged++], amt = Math.max(was.amt ?? 1, g.amt ?? 1), wide = Math.max(was.wide || 1, g.wide || 1);
          o.id = g.id; o.col = g.col; o.at = g.at; o.top = g.top; o.dur = g.dur; o.span = g.span; o.amt = amt; o.wide = wide;
          want.set(id, o);
        } else want.set(id, g);
      }
    }
    // (The Doppler's gate on a stent outranks a slide's or a mark's glow on it: the third it samples is the one that shows.)
    const dm = glow.src.get('dop');
    if (dm) for (const [id, g] of dm) if (g.span) want.set(id, g);
    // Which ends fade: an end that meets another vessel glowing in the same colour runs on into it (even where a third colour also joins, as the IMV joins the splenic vein); one that meets
    // another colour fades over a few units, so the two meet softly; a free end fades over a third of the vessel.
    glowPairs.length = 0;
    for (const [id, g] of want) { const e = E[id].e, c = g.col ?? ''; glowPairs.push(e.from, c, e.to, c); }
    const now = performance.now();
    for (const [id, g] of want) {
      const len = Math.max(1, geo[id]?.len || 60), key = g.col ?? '';
      let l = glow.lit.get(id);
      if (!l) {   // (a vessel's record from its own, made once; it is as a new one would be, taken out of glow.lit when its glow ends and put back as it starts)
        l = glowLitPool[id];
        l.v = 0; l.to = 0; l.col = g.col; l.from = null; l.cu = 1; l.rgb = undefined;
        l.end[0] = 0; l.end[1] = 0; l.endT[0] = 0; l.endT[1] = 0; l.span[0] = 0; l.span[1] = 0; l.spanT[0] = 0; l.spanT[1] = 1;
        glow.lit.set(id, l);
      }
      if (!l.to) l.start = now + (g.at || 0);
      if (l.col !== g.col) { l.from = l.v > 0 && l.col && l.rgb ? l.rgb : null; l.cu = l.from ? 0 : 1; l.col = g.col; }
      l.to = 1; l.amt = g.amt ?? 1; l.wide = g.wide || 1; l.top = !!g.top; l.dur = (g.dur || 450) / 1000;
      l.endT[0] = glowEnd(E[id].e.from, key, len); l.endT[1] = glowEnd(E[id].e.to, key, len);
      if (l.v <= 0) { l.end[0] = l.endT[0]; l.end[1] = l.endT[1]; }
      // A stretch eases along the vessel to its new place (a whole vessel is the stretch 0–1).
      if (g.span) { l.spanT[0] = g.span[0]; l.spanT[1] = g.span[1]; } else { l.spanT[0] = 0; l.spanT[1] = 1; }
      if (l.v <= 0) { l.span[0] = l.spanT[0]; l.span[1] = l.spanT[1]; }
    }
    // (A slide's halos leave in one small step with its cards and labels, not at the 500 ms they come in over: a leave takes the step below its
    // entrance, and the camera sets off as the cards are gone, so no old halo is still fading as it moves. ?onemove=0: as before.)
    for (const [id, l] of glow.lit) if (!want.has(id)) { l.to = 0; if (src === 'slide') l.dur = Math.min(l.dur, D_SMALL / 1000); }
    if (!glow.raf) { glow.t = now; glow.raf = nextFrame(glowStep); }
  }
  function glowStep(now) {
    const dt = Math.min(0.1, (now - glow.t) / 1000); glow.t = now;
    let moving = false;
    for (const [id, l] of glow.lit) {
      if (l.to && now < l.start) { moving = true; continue; }
      const k = reduceMotion.matches ? 1 : dt / l.dur;
      l.v = l.to > l.v ? Math.min(1, l.v + k) : Math.max(0, l.v - k);
      l.cu = Math.min(1, l.cu + k);
      for (let i = 0; i < 2; i++) { const d = l.endT[i] - l.end[i]; l.end[i] = Math.abs(d) < 0.5 ? l.endT[i] : l.end[i] + d * Math.min(1, k * 2); }
      for (let i = 0; i < 2; i++) { const d = l.spanT[i] - l.span[i]; l.span[i] = Math.abs(d) < 0.003 ? l.spanT[i] : l.span[i] + d * Math.min(1, k * 1.5); }
      if (l.v <= 0 && !l.to) glow.lit.delete(id);
      else if (l.v !== l.to || l.cu < 1 || l.end[0] !== l.endT[0] || l.end[1] !== l.endT[1] || l.span[0] !== l.spanT[0] || l.span[1] !== l.spanT[1]) moving = true;
    }
    live.glowSync = true; live.stageWake();
    glow.raf = moving ? nextFrame(glowStep) : 0;
  }
  // The watched vessels (REVERSAL_WATCH) whose flow runs against its healthy direction, as shown: their stations' value
  // pills carry ⟲. In an imaging case it waits, as the blood does, until a Doppler has looked at the flow.
  const revShown = new Set();
  // The Doppler's vessel glows (--dop-glow: white on the dark themes, ink on the light ones; 19 Oct, it was the Doppler's green, which
  // reads as "normal") while its instrument is open; on a stent, only the third its gate samples. The probe looks at it (dprobePaint).
  // (points: a slide's Doppler on a stent shows a callout at each of its three points, not just the sampled one.)
  const dop = { id: null, want: null, pin: null, key: '', seg: '', points: false, all: false };
  const dopGateOf = (id) => (dop.id === id && dop.seg ? dop.seg : '');   // the third of a stent the Doppler samples ('' when it is elsewhere)
  // The Doppler probe on the figure (dprobePaint): live once the stage is built (dopApply runs before its pieces exist).
  // (The Doppler probe's state, all of it numbers made once: where it stands (cur, eased to tgt; nxt is the place being weighed), how far it has
  // swung out (oP, 0 … 1) and how much of its head shows (headP), and `draw`, the record the labels' GPU layer draws it from, label-gl.js drawProbe.
  // `el` is a model of plain styled nodes the layer reads its look from, never placed or changed: dprMake.)
  const dpr = { el: null, on: false, keyOn: false, keyId: null, keySeg: null, side: 0, reach: 0, rev: false, k: 1, has: false, cur: { ang: 0, d: 0, k: 1, o: 0 }, tgt: { ang: 0, d: 0, k: 1, ax: 0, r: 0, sw: 0 }, nxt: { ang: 0, d: 0, k: 1, ax: 0, r: 0, sw: 0 },
    hold: 0, mon: false, noneT: 0, headOff: false, headP: 1, eRaf: 0, eAt: 0, box: null, boxA: { x0: 0, y0: 0, x1: 0, y1: 0 }, marks: [], swap: 0, ready: false, gate: null, gateA: [0, 0], monAt: 0, syncKey: -1, searchAt: 0, searchGap: 150, lastSig: -1,
    refitUntil: 0, carry: false, track: false, oP: 1, leaving: false, leaveT: 0, draw: makeProbeDraw(), pose: makeProbePose(), hId: null, hIdV: 0, hSeg: null, hSegV: 0 };
  let dopKeyOn = false, dopKeyId = null, dopKeySeg = '', dopKeyAll = false;   // (what dop.key was made of)
  const dopGlow = { id: null, col: 'var(--dop-glow)', amt: 1.1, wide: 0.8, dur: 360, top: true, span: null }, dopGlowList = [dopGlow], noGlows = [];
  function dopApply() {
    let id = dop.pin ?? dop.want ?? null;
    if (id && !E[id]) id = null;
    const st = store.get(), seg = id && isStent(EDGES[EI[id]]) ? stentGate(st.dopGate, st.params, id) : '';
    const all = !!seg && dop.points && id === dop.pin;
    if (dopKeyOn && id === dopKeyId && seg === dopKeySeg && all === dopKeyAll) return;   // (the key's text is made only when one of the three moved)
    dopKeyOn = true; dopKeyId = id; dopKeySeg = seg; dopKeyAll = all;
    const key = `${id}|${seg}|${+all}`;
    dop.id = id; dop.key = key; dop.seg = seg; dop.all = all;
    dpr.kick?.();   // (the monitor's look, now for this vessel: dprMonTick)
    // (On a slide it waits for the slide's camera: the framing comes a moment after the slide's tool, once its cards land, and the
    // probe showed before the zoom, went with it and came back after (Doppler 2, Mohammad, 20 Oct). animateVT lets it go.)
    if (id && store.get().presenting) live.dprHold();
    // (On top of every vessel it crosses, as a glow should lie (18f2e33): the stent's lit third over the hepatic vein above it, Review 15 Oct.)
    if (id) { dopGlow.id = id; dopGlow.span = seg ? STENT_SPANS[seg] : null; }
    setGlowSrc('dop', id ? dopGlowList : noGlows);
    live.dprobePaint();
  }
  // A presenter slide's glows (glow: [...] and its terms' vessels), each in its station's colour. Slide, focus and
  // Doppler glows are a slim, soft band (smaller than a hover's), so they mark the vessel without swamping it.
  const toneCol = (tone) => (tone.startsWith('--') ? `var(${tone})` : tone === 'accent' ? 'var(--accent)' : `var(--tr-${tone})`);
  const slideGlowObjs = [], slideGlowOut = [];   // (the glows handed to setGlowSrc, written in place; it keeps the objects only until the next call)
  function setGlow(list) {
    live.slideGlow = list || [];
    live.glowSetAt = performance.now();
    slideGlowOut.length = 0;
    if (list) for (let i = 0; i < list.length; i++) {
      const g = list[i], o = slideGlowObjs[i] || (slideGlowObjs[i] = {});
      o.id = g.id; o.col = toneCol(g.tone || 'accent'); o.amt = g.soft ? 0.55 : 1; o.wide = g.soft ? 0.8 : 0.75; o.at = g.at; o.dur = 500;
      slideGlowOut.push(o);
    }
    setGlowSrc('slide', slideGlowOut);
  }
  // The hovered vessel glows softly in its own colour (and its lumen brightens a little, vh: tube row 9).
  // Each vessel's brightening eases in and out on its own, so moving from one vessel to the next cross-fades.
  // The selected vessel (sel: it and, on the cava, the rest of the cava) takes the same brightening, and selA eases its
  // standing out of the dimmed network in and out (syncVeins), so selecting and deselecting never snap.
  const vh = { id: null, also: null, amt: new Map(), sel: new Set(), selKey: '', selA: new Map(), raf: 0, t: 0 };
  // A slide's spotlight (deck visuals V2, ext-highlights.js: spot): the network and the organs step back as for a selection,
  // the named vessels stand out of it as a selected one does (selA, vhStep) and the named organs are outlined. Never in the
  // liver's own views. live: from the spotlight set until the plate has eased back after it (the ascites follows it there).
  const spot = { ids: new Set(), on: false, live: false };
  const spotOn = () => spot.on && !store.get().lobule && !store.get().sinusoid;
  const SEL_FADE = 0.3;
  const selAKey = () => { let k = ''; for (const [id, v] of vh.selA) k += id + v; return k; };
  return { SEL_FADE, dop, dopApply, dopGateOf, dpr, glow, noGlows, revShown, selAKey, setGlow, setGlowSrc, spot, spotOn, toneCol, vh };
}
