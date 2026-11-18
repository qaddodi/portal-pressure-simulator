// The vessel glow engine: one set of glow sources (hover, slides, focus, Doppler, pressure change) lit by the GPU with the vessels.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { EDGES, STENT_SPANS, isStent, stentGate } from '../engine/topology.js';
import { makeProbeDraw, makeProbePose } from './dop-probe.js';
import { D_SMALL, D_SURFACE } from './ease.js';
import { store } from './store.js';

export function createGlow(st, live) {
  const { E, EI } = st;
  // ── Vessel glow sources: who asks for which vessels to be lit ──
  // Hover, a slide's glows, a step's focus, the Doppler's vessel and a change in pressure each name vessels, in a colour. No vessel takes a glow or a
  // halo any more (owner, 13 Nov 2026: "remove it"; the glow program, its passes and this engine's easing were deleted 15 Nov 2026, app review R1-7, with the
  // classic renderer: Q1), so there is nothing to ease and no frame to ask for. What is kept is the bookkeeping other code reads: `glow.src` (what each
  // source named: the steady-glow check, the Doppler's glow on a stent) and `glow.lit` (the vessels any source names now: the chevrons stay on a vessel
  // the key is on, see stage-blood.js).
  const GLOW_RANK = ['spot', 'sel', 'hover', 'flash', 'delta', 'dop', 'slide', 'focus', 'shunt', 'key'];
  // (A Map for every source GLOW_RANK names, made here once: setGlowSrc is asked only for those, so none is made on a call.)
  const glow = { src: new Map(GLOW_RANK.map((k) => [k, new Map()])), lit: new Map(), raf: 0, t: 0 };
  const LIT = { to: 1 };   // (the one record every named vessel has: only `to` is read)
  /** list: [{ id, col, amt, wide, at, span ... }] as the sources write them; only the vessel ids matter now. */
  function setGlowSrc(src, list) {
    const mine = glow.src.get(src);
    if (!mine) return;
    mine.clear();
    if (list) for (let i = 0; i < list.length; i++) if (E[list[i].id]) mine.set(list[i].id, list[i]);
    glow.lit.clear();
    for (const m of glow.src.values()) for (const id of m.keys()) glow.lit.set(id, LIT);
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
  const dopGlow = { id: null, col: 'var(--dop-glow)', amt: 1.1, wide: 0.8, dur: D_SURFACE, top: true, span: null }, dopGlowList = [dopGlow], noGlows = [];
  function dopApply() {
    // (pin false: the slide's Doppler reads a vessel with no probe on the figure, the scope is the probe (a tool's probe: 'scope'); Explore's choice does not bring one back.)
    let id = dop.pin === false ? null : (dop.pin ?? dop.want ?? null);
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
    // (A stent's lit third takes the stent's own colour, soft and slim, its ends easing out over a fifth of the stent: the white halo round the gate
    // read as a bright round blob with fringed edges (Mohammad, 11 Nov). Any other vessel keeps the Doppler's white.)
    if (id) { dopGlow.id = id; dopGlow.span = seg ? STENT_SPANS[seg] : null; dopGlow.col = seg ? null : 'var(--dop-glow)'; dopGlow.amt = seg ? 0.85 : 1.1; dopGlow.wide = seg ? 0.6 : 0.8; }
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
      o.id = g.id; o.col = toneCol(g.tone || 'accent'); o.amt = g.soft ? 0.55 : 1; o.wide = g.soft ? 0.8 : 0.75; o.at = g.at; o.dur = D_SURFACE;
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
  const SEL_FADE = D_SMALL / 1000;   // (seconds: a small step of the motion scale)
  const selAKey = () => { let k = ''; for (const [id, v] of vh.selA) k += id + v; return k; };
  return { SEL_FADE, dop, dopApply, dopGateOf, dpr, glow, noGlows, revShown, selAKey, setGlow, setGlowSrc, spot, spotOn, toneCol, vh };
}
