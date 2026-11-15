// A slide's procedure and the HVPG catheter
// (moved out of presenter.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { hvpgSev } from '../engine/pressure-cuts.js';
import { CIRC_REGIONS, growBox, isCamOn, regionBox, unionBox } from './cam-frame.js';
import { anchorsOf, roomFor } from './cam-room.js';
import { throwState } from './card-throw.js';
import { REGIONS } from './decks.js';
import { cancelFrame } from './frame.js';
import { readAnims, readTiming } from './layout-snap.js';
import { reduceMotionMQ as reduce } from './motion.js';
import { camOn, slideTargets } from './presenter-words.js';
import { playProcedure, procBlocked, procKindOf, procOffered, specOf, stepMarks } from './proc-anim.js';
import { procNavPlan } from './proc-nav.js';
import { store, setViewKey } from './store.js';
import { clamp, cssVar, fmt } from './util.js';

export function createProc(st, live) {
  const { ease, evBack, evRun, liveSet, nextFrame, stage, stopLapse, toAnatomy, viewSettled } = st;
  // (left: only the entrances with more than this many ms still to run count: 0 is all of them; CARDS_SEEN, the cards in sight.)
  // (R01: the cards' way in is card-throw.js's, scheduler-driven inline transform and opacity that getAnimations() never lists: throwState says
  // what the throw of the words, their glass, the panel and the data card has still to run, and the browser's own animations still count.)
  const throwCards = () => [live.ui?.text, live.ui?.shade, live.ui?.panel, live.ui?.data];
  const throwEnters = (el, left) => { const s = el && !el.hidden ? throwState(el) : null; return !!s && s.kind !== 'out' && s.left > left; };
  const cardsEntering = (left = 0) => throwCards().some((el) => throwEnters(el, left)) || [live.ui?.text, live.ui?.panel, live.ui?.data].some((el) => el && !el.hidden && readAnims(el, { subtree: true }).some((a) => { if (a.playState !== 'running') return false; const t = readTiming(a.effect); return Number.isFinite(t?.endTime) && t.endTime - (t.localTime || 0) > left; }));
  // Where the way out of the lobule should land for a slide: its framing, asked for when the rise begins (null: the fit).
  const riseFor = (cam, s) => (cam === 'fit' ? null : { box: () => camBox(cam, s), kMax: s.kMax || 3.2, clear: !!s.clear });
  const figOf = (i) => (live.fig && live.fig.i === i ? live.fig.s : live.slides[i]);
  const lapseCam = (s) => (!s?.visual && !s?.cath && s?.lapse?.cam) || null;
  const figView = (s, lap) => (lapseCam(s) && !lap ? { ...s, cam: s.lapse.cam } : s);
  // The push: the camera drifts from the slide's framing to lapse.cam over `ms`, slow and even, the labels riding with it (stage.js
  // drifting). Where it cannot run smoothly (no live GPU organs: each frame of a move over the live drawing paints every organ), with
  // reduced motion, or in the circuit or the liver, the camera stays put and one eased move takes it there as the days end (pushEnd).
  function pushTo(s, to, ms) {
    const pc = lapseCam(s);
    if (!pc) return;
    live.fig = { i: to, s: { ...s, cam: pc } };
    if (reduce.matches || !stage.canDrift?.() || (s.view || 'anatomic') !== 'anatomic' || store.get().lobule || store.get().sinusoid) return;
    live.push = { i: to, until: performance.now() + ms };
    frameTo(pc, live.fig.s, ms, { drift: true });
  }
  // The days have ended (or Next ran them out): what is left of the push takes `ms`; with no push it is one eased move there. Measured
  // afresh, so an organ that grew through the days (the spleen) is framed as it ends.
  function pushEnd(s, to, ms) {
    if (!lapseCam(s) || live.fig?.i !== to) return;
    const v = live.fig.s, pc = v.cam, drift = !!live.push && live.push.i === to;
    live.push = drift ? { i: to, until: performance.now() + ms } : null;
    if ((s.view || 'anatomic') !== 'anatomic' || store.get().lobule || store.get().sinusoid) return;
    frameTo(pc, v, drift ? ms : Math.max(ms, reduce.matches ? 300 : 900), drift ? { drift: true } : {});
  }
  function frameTo(cam, s, ms, opt = {}) {
    // (A Circuit slide's cam is a Circuit region, a raw box in circuit units or 'fit'; a name the circuit lacks is the fit.)
    const circ = s.view === 'circuit', cb = circ && cam !== 'fit' ? regionBox(cam, CIRC_REGIONS) : null;
    if (cam === 'fit' || (circ && !cb)) { if (opt.drift) stage.fitDrift(ms); else stage.fitSlow(ms, opt); } else stage.frameBox(circ ? cb : camBox(cam, s), ms, s.kMax || 3.2, !!s.clear, live.alongOk && !opt.drift && !opt.steady ? { ...opt, along: true } : opt);
  }
  function camBox(cam, s) {
    let r = regionBox(isCamOn(cam) ? cam.near : cam, REGIONS);
    if (isCamOn(cam)) {
      // (cam: { on: [names] }: the vessels and organs as drawn now, the stations where they stand; a lone station or a thin vessel still gets room.)
      // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
      const n = camOn(cam.on), pts = unionBox(n.points.map(([x, y]) => [x, y, x, y]));
      // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
      r = growBox(r, unionBox([stage.focusBox(n), pts].filter(Boolean)), 30);
    }
    // (A slide with softly lit supporting veins frames every vessel it lights, so none runs off the edge.)
    // alloc-rare: slide arrival or a camera framing: once per slide change or card grab, never per frame
    const tg = slideTargets(s), f = stage.focusBox({ organs: tg.organs.map((o) => o.id), edges: tg.glow.some((g) => g.soft) ? tg.glow.map((g) => g.id) : [] });
    return roomFor(growBox(r || REGIONS.route, f), anchorsOf(s, tg));
  }
  // ── The HVPG catheter (stage.setCatheter, as Measure › HVPG draws it), choreographed slide by slide: in along
  // the jugular route with the camera following, the tip close up, the balloon up and the still column, the
  // readings; each step eases on from wherever the last one left it, and it slides out with its slides.
  const CC = { free: 'var(--mon-free)', wedge: 'var(--mon-wedge)', bad: 'var(--mon-alarm)' };   // the procedure's own colours
  const cath = { on: false, raf: 0, t0: 0, v: { u: 0, balloon: 0, column: 0, opacity: 1 }, tr: {}, show: [], ring: null, ostium: false, probeT0: 0, follow: false, cam: null, fp: null, keep: false, beside: false };
  // The still column is shaded in the catheter's wedge colour (the WHVP callout's), so it reads as the catheter's
  // column of still blood, not as one more pressure on the map.
  // (Read through the token cache, which a theme change clears: read afresh, it made every catheter frame restyle the page.)
  const wedgeInk = () => cssVar('--tr-wedge');
  function cathTrack(k, to, ms, delay = 0) { cath.tr[k] = { from: cath.v[k], to, t0: performance.now() + delay, ms: reduce.matches ? 0 : ms }; }
  // (The readings kept between frames: a catheter frame builds nothing. They are made again only when the slide's numbers change
  // (cath.fp is a new fingerprint); the wedge reading's words are written into its kept object as the column rises, and the list handed
  // to the stage is one array written in place. The stage reads them in the frame and keeps none of these lists.)
  // (The catheter's state handed to the stage each frame is one kept object, written in place.)
  const cathSt = { u: 0, balloon: 0, column: 0, columnColor: '', ring: null, pulse: 0, clock: 0, opacity: 1, labels: null, ostium: false, probe: 0, follow: false, keep: false };
  const NO_LABELS = [], cathMemo = { fp: null, fh: NaN, wh: NaN, hv: NaN, L: null, wedge: null, wv: NaN, out: [] };
  function cathLabels() {
    const f = cath.fp, v = cath.v, m = cathMemo;
    if (!f) return NO_LABELS;
    if (m.fp !== f || m.fh !== f.fhvp || m.wh !== f.whvp || m.hv !== f.hvpg) {
      m.fp = f; m.fh = f.fhvp; m.wh = f.whvp; m.hv = f.hvpg; m.wv = NaN;
      const sev = hvpgSev(f.hvpg);
      // alloc-rare: the slide's numbers changed (a new fingerprint), not each frame
      const free = { key: 'f', at: 'tip', kicker: 'FHVP', text: fmt(f.fhvp, 1), unit: 'mmHg', cls: 'free' };
      // alloc-rare: the slide's numbers changed (a new fingerprint), not each frame
      const wedge = { key: 'w', at: 'ahead', kicker: 'WHVP', text: '', unit: 'mmHg', cls: 'wedge' };
      m.wedge = wedge;
      // alloc-rare: the slide's numbers changed (a new fingerprint), not each frame
      const sum = { key: 's', at: 'sum', rows: [{ ...wedge, text: fmt(f.whvp, 1) }, free], calc: { kicker: 'HVPG', text: fmt(f.hvpg, 1), unit: 'mmHg', cls: 'result ' + sev } };
      // alloc-rare: the slide's numbers changed (a new fingerprint), not each frame
      const occ = { key: 'p', at: 'tip', kicker: 'Hepatic vein', text: 'Occluded', unit: '', cls: 'wedge' };
      // alloc-rare: the slide's numbers changed (a new fingerprint), not each frame
      const abort = { key: 'a', at: 'tip', kicker: 'Unable to cannulate', text: 'No reading', unit: '', cls: 'result danger' };
      // alloc-rare: the slide's numbers changed (a new fingerprint), not each frame
      m.L = { f: free, w: wedge, sum, occ, abort };
    }
    // (The wedge reading's words follow the column; formatted only when the number moved.)
    const wv = f.fhvp + (f.whvp - f.fhvp) * v.column;
    if (wv !== m.wv) { m.wv = wv; m.wedge.text = fmt(wv, 1); }
    const out = m.out, L = m.L;
    out.length = 0;
    for (const k of cath.show) out.push(L[k]);
    return out;
  }
  function cathFrame() {
    const now = performance.now(), v = cath.v;
    for (const k in cath.tr) {
      const t = cath.tr[k];
      const u = t.ms ? clamp((now - t.t0) / t.ms, 0, 1) : now >= t.t0 ? 1 : 0;
      v[k] = t.from + (t.to - t.from) * ease(u);
      if (u >= 1) delete cath.tr[k];
    }
    // Three short pushes against the clot (Budd–Chiari), each easing in and back out.
    const pk = cath.probeT0 ? clamp((now - cath.probeT0) / 3600, 0, 1) : 1, probe = pk < 1 ? Math.sin(pk * 3 * Math.PI) ** 2 * 0.9 : 0;
    const st = cathSt;
    st.u = v.u; st.balloon = v.balloon; st.column = v.column; st.columnColor = wedgeInk(); st.ring = cath.ring;
    st.pulse = 0.5 + 0.5 * Math.sin((now - cath.t0) / 170); st.clock = now - cath.t0; st.opacity = v.opacity; st.labels = cathLabels(); st.ostium = cath.ostium; st.probe = probe;
    st.keep = cath.keep;
    st.follow = cath.follow;
    stage.setCatheter(st);   // (the view drifts after the tip as the stage lays out this frame: catheter, camera, readings)
    live.mon?.balloon(v.balloon);   // the monitor's trace rides the same balloon value
    live.ui?.tools.balloon(v.balloon);   // (and the data card's tracing, on a slide whose tool follows the catheter)
    live.ui?.tools.reach(v.u >= 0.999 && cath.show.length > 0);   // (which starts only once the tip is parked in the vein: Mohammad, 12 Nov 2026)
    cath.raf = nextFrame(cathFrame);
  }
  function cathStop() {
    cancelFrame(cath.raf);
    if (cath.on) { stage.setCatheter(null); stage.cathForget(); }
    Object.assign(cath, { on: false, v: { u: 0, balloon: 0, column: 0, opacity: 1 }, tr: {}, show: [], ring: null, ostium: false, probeT0: 0, follow: false, cam: null, fp: null, keep: false, beside: false });
  }
  // (procParked: the run standing at its last stop since Back landed on the slide done, proc-anim.js park: it only shows the scope where the play-through left it and fades it when the slide moves on;
  // it is not a run to step through, so Back from it leaves the slide as it did before, and a swipe back turns the slide.)
  const procHeld = () => !!live.procRun && live.procRun !== live.procParked;
  // (A slide whose procedure is { kind: 'tips', then: 'tipsgrad' } plays a reading after it, as one more step on the same card: the TIPS catheter reads the
  // gradient across the new stent (proc-anim.js MEASURES.tipsgrad, TIPS step 5). procThenAt: the slide whose main run has played through with its reading
  // still to come; procQueued: a Next came while the main run was on its last step, so the reading starts as it ends.)
  const procThen = (s) => { const k = typeof s?.procedure === 'object' ? s.procedure.then : null; return k && specOf(k) ? k : null; };
  const procKind = (s) => procKindOf(s.procedure);   // ('brto' with a target plays that target's spec: proc-anim.js)
  // (home: the slide stays, so the camera glides back and its own marks and names come back through onMark; leaving it, the next
  // slide's camera and marks take over.)
  function procStop(home = false) {
    live.procQueued = false;
    if (!live.procRun) return;
    const r = live.procRun;
    if (home) r.stop({ home }); else { live.procRun = null; r.stop({ home }); stage.cathForget(); }
    live.procRun = null; live.procShown = -1; live.procShownAt = -1; live.procRing = -1; live.procRingAt = -1; procPaint();
  }
  // (Two marks on the steps (his ask, 13 Nov 2026). The fill is the step the animation is on: it follows the catheter or the scope and catches up. The ring is the step Next or Back
  // has navigated to, set at once, so after three quick Nexts the ring is on step 4 while the fill is still on its way; the ring on the last step says the next Next moves on.
  // After the play-through the two are one. Each belongs to a slide (procShownAt, procRingAt): a step is never marked on another slide's card.)
  const procAtOf = (i) => (live.procShownAt === i ? live.procShown : -1), procRingOf = (i) => (live.procRingAt === i ? live.procRing : -1);
  const procTarget = () => { if (!procHeld()) return; live.procRing = live.procRunBase + live.procRun.at; live.procRingAt = live.want; procPaint(); };
  function procPaint() {
    const cur = procAtOf(live.want), ring = procRingOf(live.want);
    live.ui?.text.querySelectorAll('.pz-proc').forEach((b, k) => { b.classList.toggle('on', k === cur); b.classList.toggle('done', k < cur); b.classList.toggle('at', k === ring); if (k === ring) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
  }
  // (The slide's treatment buttons press the one that now matches the live model.)
  function procCompare(s) {
    const has = (o, p) => Object.entries(o).every(([k, v]) => (v && typeof v === 'object' ? has(v, p?.[k] || {}) : !!p?.[k] === !!v && (typeof v === 'boolean' || p?.[k] === v)));
    const k = s.compare?.findIndex((o) => o.params && has(o.params, store.get().params)) ?? -1;
    if (k >= 0) live.ui?.text.querySelectorAll('.pz-abb:not(.pz-proc)').forEach((btn, j) => btn.setAttribute('aria-pressed', String(j === k)));
  }
  // The slide's own callouts and names, as it landed (a clot mark's words as the model now has them).
  const slideMarks = (i) => (live.markBase?.i === i ? live.markFocus(live.clotMarks(live.markBase.marks, store.get().params)) : null);
  async function procPlay(s, i, to = 0, kind = procKind(s), from = 0, park = false) {
    const isThen = kind !== procKind(s), base = isThen ? specOf(procKind(s)).steps.length : 0, mine = () => !!live.deck && live.shown?.i === i && live.slides[i] === s;
    const drop = () => { if (from) stage.setCatheter(null); };   // (a reading handed the catheter on: if it cannot start, the catheter goes with it)
    if (!specOf(kind) || !mine() || cath.on || live.procWait) { drop(); return; }
    if (live.procRun) { live.procRun.to(to); return; }
    if (live.lapseOn) stopLapse();
    // (A run that starts fresh lights nothing yet, or, for a reading after the stent, still the stent's last step: never the step another slide ended on.)
    if (!park) { live.procShown = base - 1; live.procShownAt = i; live.procRing = live.procRingAt === i ? Math.max(base, live.procRing) : base; live.procRingAt = i; }   // (the ring is where the presses have counted to: a run that was a while starting begins there)
    live.procWait = true; procPaint();
    try {
      await toAnatomy(null, () => !mine());
      if (!mine()) { drop(); return; }
      if (store.get().view !== 'anatomic') { setViewKey('anatomy'); await viewSettled(() => !mine(), stage); }
    } finally { live.procWait = false; }
    if (!mine() || live.procRun) { if (!mine()) drop(); procPaint(); return; }
    const before = structuredClone(store.get().params), names = store.get().presentLabels || [];
    // (Through liveSet as the change itself is: the slide's own state comes back whenever it is shown again.)
    if (!park && specOf(kind).had(before)) liveSet(s, i, specOf(kind).undo(structuredClone(before)));
    live.procRunKind = kind; live.procRunBase = base;
    const run = live.procRun = playProcedure(stage, kind, {
      stepped: true, to: park ? to : Math.max(to, Math.min(specOf(kind).stops.length - 1, (live.procRingAt === i ? live.procRing : base) - base)), from, park,
      // (With a reading to follow, the run holds at its last step, the catheter still in the portal vein, and the reading goes on from there: nothing goes in twice.)
      hold: !isThen && !!procThen(s),
      onHold: () => { if (live.procRun === run && live.procQueued && mine()) procChain(); },
      apply: () => {
        if (live.procRun !== run || !mine() || procBlocked(kind, store.get().params, store.get().frame?.metrics)) return;
        liveSet(s, i, specOf(kind).apply(structuredClone(store.get().params)), evRun(s, i)); procCompare(s);
      },
      unapply: () => { if (live.procRun === run && mine()) { evBack(s); liveSet(s, i, specOf(kind).undo(structuredClone(store.get().params))); procCompare(s); } },
      onStep: (k) => { if (live.procRun === run) { live.procShown = base + k; live.procShownAt = i; procPaint(); } },   // (the fill follows the catheter; the ring is the target, procTarget)
      // (Each frame's clock, for a tracing card that draws the reading as the procedure takes it: tool { kind: 'reading' }, tool-reading.js.)
      onFrame: (f, t) => { if (live.procRun === run || live.procParked === run) live.ui?.tools.proc(kind, t); },
      // (The step's callout stands in for the slide's marks while it plays; its names join the slide's. Then the slide's come back:
      // on the BRTO slides the last step's "Shunt closed" is the slide's own mark, so it stays where it is.)
      // (false: no callout while the catheter travels in, the names for its way kept.)
      read: () => store.get().frame,
      onMark: (m, add, all) => {
        if (live.procRun !== run || !mine()) return;
        // (Played through, a slide with no mark of its own keeps the last step's callout, which names what the procedure left: "Stent in".)
        const last = specOf(kind).stops.length - 1;
        store.set(m !== null ? { focus: m ? live.markFocus(all || [m]) : null, presentLabels: [...new Set([...names, ...(add || [])])] }
          : { focus: slideMarks(i) || (run.at === last ? live.markFocus(stepMarks(kind, last)) : null), presentLabels: names });
      },
      onEnd: ({ done, rewound }) => {
        if (live.procRun !== run) return;
        live.procRun = null;
        // (The reading changes nothing in the model: going back from its start only leaves the stent done, its steps lit to the last.)
        if (rewound && mine() && isThen) { live.procThenAt = i; live.procShown = base - 1; live.procShownAt = i; live.procRing = base - 1; live.procRingAt = i; }
        else if (rewound && mine()) { evBack(s); liveSet(s, i, before); procCompare(s); live.procShown = -1; live.procShownAt = -1; live.procRing = -1; live.procRingAt = -1; live.procDoneAt = -1; }
        else if (mine() && done && !isThen && procThen(s)) live.procThenAt = i;   // (the reading comes next)
        else if (mine()) live.procDoneAt = i;   // (played through: the next Next moves on)
        procPaint();
        if (live.procQueued && live.procThenAt === i && mine()) { live.procQueued = false; procPlay(s, i, 0, procThen(s)); }
      },
    });
    if (park) live.procParked = run;
    procPaint();
  }
  // Whether the slide's procedure can play on the live patient (as its card shows it).
  function procCan(s) {
    const kind = procKind(s), P = specOf(kind), p = store.get().params, m = store.get().frame?.metrics;
    return !!P && procOffered(kind, p, m) && (P.had(p) || !procBlocked(kind, p, m));
  }
  // Next and Back on a procedure's slide (true: they did a step; false: the slide moves on). Next starts it (the catheter goes
  // in), then plays each next step; once it has played through, Next moves on. (While the figure turns to the anatomy before
  // the first step, a Next waits with it rather than leaving.)
  // (Counted by the ring, never by the animation, his ask, 13 Nov 2026, the direct PPG slide, three reports of "I keep hitting next and it's stuck at 3": every press moves the
  // ring exactly one step, 1 to the last, and the press after the last moves on, whatever the catheter is doing. The animation is told where to go and catches up, by a jump
  // if it must (run.to), or starts at that step if it has not begun; a run that cannot start or never lands its shot never holds a press back: proc-nav.js.)
  const procNext = () => {
    if (live.shown?.i !== live.want) return false;
    const s = live.slides[live.want];
    if (!s?.procedure || live.procDoneAt === live.want || (live.procRun && live.procRun === live.procParked)) return false;
    const main = procKind(s), nMain = specOf(main).steps.length, thenK = procThen(s), ring0 = procRingOf(live.want);
    const plan = procNavPlan({ ring: ring0, steps: live.procSteps(s).length, nMain, hasThen: !!thenK, waiting: live.procWait, readingPending: live.procThenAt === live.want,
      run: live.procRun ? { reading: live.procRunKind !== main, at: live.procRun.at } : null });
    if (plan.to < 0) return false;   // (the last step has been reached: this Next moves on)
    const ring = () => { live.procRing = plan.to; live.procRingAt = live.want; procPaint(); };
    if (plan.how === 'wait') { if (plan.queue) live.procQueued = true; ring(); return true; }   // (a run is still starting: the press counts and the run starts where the ring is)
    if (plan.how === 'jump') { ring(); live.procRun.to(plan.at); return true; }
    if (plan.how === 'chain') { ring(); if (live.procRun.at < plan.at) live.procRun.to(plan.at); procChain(); ring(); return true; }   // (the run's last step first, then the reading that goes on from it)
    // (Nothing running: the main run's first step, or, with the stent in and its reading still to come, the reading.)
    const kind = plan.reading ? thenK : main;
    if (cath.on) return false;
    if (plan.reading && procBlocked(kind, store.get().params, store.get().frame?.metrics)) { live.procThenAt = -1; live.procDoneAt = live.want; return false; }
    if (!plan.reading && !procCan(s)) return false;
    ring();
    procPlay(s, live.want, plan.at, kind);
    if (!live.procRun && !live.procWait) {   // (it could not start: this Next moves on, never swallowed by a run that is not there)
      live.procRing = ring0; live.procRingAt = live.want; procPaint();
      if (plan.reading) { live.procThenAt = -1; live.procDoneAt = live.want; }
      return false;
    }
    return true;
  };
  // (A Next on the main run's last step: it holds there with the catheter in, and the reading goes on from the place it stands. A Next while it is still on its way to that
  // stop waits for it, not a Next lost to the next slide.)
  const procChain = () => {
    const s = live.slides[live.want];
    if (!live.procRun || !procThen(s) || live.procRunKind !== procKind(s) || live.shown?.i !== live.want) return false;
    const c = live.procRun.release();
    if (!c) return live.procQueue();
    live.procRun = null; live.procQueued = false;
    procPlay(s, live.want, 0, procThen(s), stage.cathCarry?.(c.u, c.route, specOf(procThen(s)).route || procThen(s)) ?? c.u);   // (the place on the reading's own route, which is longer or shorter than the one the coils were on)
    return true;
  };
  return { CC, cardsEntering, cath, cathFrame, cathStop, cathTrack, figOf, figView, frameTo, procAtOf, procHeld, procKind, procNext, procPaint, procPlay, procRingOf, procStop, procTarget, procThen, pushEnd, pushTo, riseFor, throwCards };
}
