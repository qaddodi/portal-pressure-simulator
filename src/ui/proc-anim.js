// Treatment procedures played on the anatomy: TIPS, BRTO and BATO, each a catheter on its real route (stage.js
// PROC_ROUTES draws it on the vessels, as the HVPG catheter). It travels in, does its work (a needle and a balloon for a
// TIPS, a balloon and sclerosant for BRTO and BATO), and comes back out. When it ends, the model holds what the procedure
// did, as the Treat buttons leave it (apply). Tests › HVPG plays them from its buttons; a slide's `procedure` plays one.
// Routes (AASLD 2024 names BATO among the obliterative therapies without a route; this is the transhepatic one):
//   TIPS: right internal jugular vein → SVC → IVC → right hepatic vein; a needle through the liver into the right portal vein.
//   BRTO: right femoral vein → IVC → left renal vein → the gastrorenal shunt, its balloon near the renal end.
//   BATO: through the liver into the right portal vein → portal and splenic veins → the short gastric feeder of the varices.

import { frameFor, cancelFrame } from './frame.js?v=9f2b0fae80';
import { ease, k01 } from './hvpg-clock.js?v=553551a92a';
const nextFrame = frameFor('proc-anim');

// Each step: [id, its word (the callout on the part it works on, and its numbered step in the teaching card), the caption, a
// short word, the shot it plays in, the vessel its callout names, the station names shown with it, where along that vessel the
// callout points (0..1 of its drawn course: the tract for a TIPS, the balloon on the shunt, the varices the sclerosant fills)].
// Shots, all close enough to see the catheter and its balloon: 'way', on the tip from where it enters, the view following it
// in (panning only, at one scale); 'tip', the stretch it works on, held still (for BRTO and BATO the tip and its balloon alone,
// closer); 'work', BRTO and BATO's tip on to the varices. A new shot glides in only between steps, and
// playProcedure waits for it to land before anything moves (his asks, 29 Oct: the zoom jumped, the callouts moved, the catheter
// could not be seen; recs in review/procedure-animation-ideas). The first step's callout comes once the catheter has arrived.
// T: the sequence in ms from the start (apply: the model takes the change; back: the catheter starts out; end: it has gone).
// stops: where each step ends; presented, one Next plays one step and holds at its stop.
// before: what a slide that plays it opens on, the procedure not done yet (no TIPS, the shunt open): its words keep the after state.
const OBLIT_T = { travel0: 300, travel1: 6500, inflate0: 7400, inflate1: 9000, fill0: 10200, fill1: 15200, apply: 15500, fillOut: 16500, deflate: 17700, back: 18900, end: 22000 };
const OBLIT_STOPS = [7100, 9900, 16300, 22000];
// How long a shot glides (ms), as a slide's own camera does; the procedure waits this long, and a little more, at each new shot.
const SHOT_MS = 1500;
export const PROCS = {
  tips: {
    name: 'TIPS', label: 'TIPS', balloonSpan: 'tract',
    T: { travel0: 300, travel1: 4000, needle0: 4900, needle1: 6700, wire1: 7600, inflate0: 8100, inflate1: 9300, deflate0: 9900, deflate1: 10700, apply: 10800, back: 11400, end: 14400 },
    stops: [4600, 7900, 9700, 14400],
    steps: [
      ['enter', 'Catheter in', 'In through the right internal jugular vein, down the SVC and the IVC into the right hepatic vein.', 'In', 'way', 'RHV_IVC', ['IVCS', 'RHV'], 0.5],
      ['needle', 'Needle across', 'A needle crosses the liver from the hepatic vein into the right portal vein, and a wire follows it into the portal trunk.', 'Needle', 'tip', 'TIPS', ['RHV'], 0.5],
      ['dilate', 'Tract dilated', 'A balloon opens the tract through the liver to the width of the stent.', 'Balloon', 'tip', 'TIPS', ['RHV'], 0.5],
      ['done', 'Stent in', 'A covered stent holds the tract open: portal blood now reaches the hepatic vein without crossing the sinusoids.', 'Stent', 'tip', 'TIPS', ['RHV', 'RPV'], 0.5],
    ],
    can: (p) => (p.tips?.on ? 'A TIPS is already in place.' : (p.thrombus?.RHV_IVC || 0) >= 0.8 ? 'The right hepatic vein is clotted, so a TIPS has no route.' : ''),
    apply: (p) => { p.tips = { ...p.tips, on: true, d: p.tips?.d || 8 }; return p; },
    had: (p) => !!p.tips?.on,
    undo: (p) => { p.tips = { ...p.tips, on: false }; return p; },
    before: { tips: { on: false } },
  },
  brto: {
    name: 'BRTO', label: 'BRTO', T: OBLIT_T, stops: OBLIT_STOPS,
    steps: [
      ['enter', 'Catheter in', 'Up from the right femoral vein, through the IVC and the left renal vein into the gastrorenal shunt.', 'In', 'way', 'C5', ['IVCI', 'LRV'], 0.8],
      ['balloon', 'Balloon up', 'The balloon blocks the shunt near the renal vein, so nothing washes out into it.', 'Balloon', 'tip', 'C5', ['LRV'], 0.84],
      ['fill', 'Sclerosant', 'Sclerosant fills the shunt back up to the fundal varices, and they clot.', 'Fill', 'work', 'C5', ['LRV'], 0.35],
      ['done', 'Shunt closed', 'The shunt and the varices are closed. Their blood stays in the portal system, so the portal pressure rises.', 'Closed', 'work', 'C5', ['LRV'], 0.5],
    ],
    can: oblitCan,
    apply: oblitApply, had: oblitHad, undo: oblitUndo, before: { occluded: { C5: false } },
  },
  bato: {
    name: 'BATO', label: 'BATO', T: OBLIT_T, stops: OBLIT_STOPS,
    steps: [
      ['enter', 'Catheter in', 'Through the liver into the right portal vein, then along the portal and splenic veins into the short gastric veins.', 'In', 'way', 'C2', ['CONF', 'SV'], 0.35],
      ['balloon', 'Balloon up', 'The balloon blocks the feeding vein, so the inflow to the varices stops.', 'Balloon', 'tip', 'C2', ['SV'], 0.31],
      ['fill', 'Sclerosant', 'Sclerosant fills the varices from the portal side, and they clot.', 'Fill', 'work', 'C2', ['SV'], 0.7],
      ['done', 'Varices closed', 'The varices and their gastrorenal shunt are closed. Their blood stays in the portal system, so the portal pressure rises.', 'Closed', 'work', 'C2', ['SV'], 0.5],
    ],
    can: (p, m) => oblitCan(p, m) || ((p.thrombus?.PV_TRUNK || 0) >= 0.8 ? 'The portal vein is clotted, so BATO has no route.' : ''),
    apply: oblitApply, had: oblitHad, undo: oblitUndo, before: { occluded: { C5: false } },
  },
};
export const PROC_KINDS = Object.keys(PROCS);
// Fundal varices large enough to grade (the Fundal varices card's own "none" below 2.4 mm): BRTO and BATO treat them, so
// without them neither is offered. m: the live frame's metrics (no frame yet: the params alone decide).
export const GV_MIN_MM = 2.4;
export const hasGastricVarices = (m) => !m?.gastricVarix || (m.gastricVarix.d || 0) >= GV_MIN_MM;
function oblitCan(p, m) {
  return p.spontaneous?.C5 === false ? 'This patient has no gastrorenal shunt.' : p.occluded?.C5 ? 'The gastrorenal shunt is already closed.'
    : !hasGastricVarices(m) ? 'This patient has no gastric varices to treat.' : '';
}
// (The model's occlusion of the gastrorenal shunt closes its short gastric feeder too: topology.js isOccluded.)
function oblitApply(p) { p.occluded = { ...p.occluded, C5: true }; return p; }
function oblitHad(p) { return !!p.occluded?.C5; }
function oblitUndo(p) { p.occluded = { ...p.occluded, C5: false }; return p; }

/** Why a procedure cannot run on these params ('' when it can). m: the live frame's metrics (BRTO and BATO need fundal varices). */
export const procBlocked = (kind, p, m = null) => (PROCS[kind] ? PROCS[kind].can(p || {}, m) : 'Unknown procedure.');
/** Whether a procedure is offered at all for this patient: BRTO and BATO only while there are gastric varices (or the
 *  procedure has already closed them, so it can be watched again). TIPS always is (dimmed when it cannot run). */
export const procOffered = (kind, p, m = null) => !!PROCS[kind] && (kind === 'tips' || PROCS[kind].had(p || {}) || (p?.spontaneous?.C5 !== false && hasGastricVarices(m)));

/** The step a time falls in (pure): each runs up to and including its stop, so a procedure held at a stop still shows that step. */
export const stepAt = (kind, t) => { const S = PROCS[kind].stops, i = S.findIndex((x) => t <= x); return i < 0 ? S.length - 1 : i; };
// (The step's number on its callout, as a filled circle: the same number as its step in the teaching card.)
export const STEP_NUM = ['\u278A', '\u278B', '\u278C', '\u278D', '\u278E', '\u278F'];
/** When a step's callout comes (pure, ms): once the step has played, at its stop; the last step's once the stent is in or the
 *  balloon is down, as the catheter starts out. */
export const markAt = (kind, i) => { const P = PROCS[kind]; return i >= P.stops.length - 1 ? P.T.back : P.stops[i]; };
/** The callout a step puts on the figure: a slide's own mark (a treatment's), numbered, at its point on the part it works on, kept
 *  on its side and clear of every vessel (pin); ghost: it may name a vessel not drawn yet (the tract, before the stent is in). */
export const stepMark = (kind, i) => {
  const s = PROCS[kind]?.steps[i];
  return s ? { edges: [s[5]], label: `${STEP_NUM[i]} ${s[1]}`, kind: 'treat', f: s[7] ?? 0.5, pin: true, ghost: true } : null;
};

/**
 * The procedure at t ms (pure): { u (0..1 of the way in), balloon, column (the sclerosant, 0..1), opacity, step (index into
 * steps, -1 once it has gone), shot ('way' | 'tip', '' once it has gone) }. stops: the route's stretches as u (stage.cathStops),
 * for the TIPS its tract ({ tract: [u0, u1] }); without them the tract sits where it usually does.
 */
export function procFrame(kind, t, stops = null) {
  const P = PROCS[kind], T = P.T, back = ease(k01(t, T.back, T.end - 400));
  const opacity = 1 - k01(t, T.end - 800, T.end);
  const step = t >= T.end ? -1 : stepAt(kind, t), shot = step >= 0 ? P.steps[step][4] : '';
  if (kind === 'tips') {
    const [a, b] = stops?.tract || [0.62, 0.86];
    const u = (t < T.needle0 ? a * ease(k01(t, T.travel0, T.travel1)) : t < T.needle1 ? a + (b - a) * ease(k01(t, T.needle0, T.needle1)) : b + (1 - b) * ease(k01(t, T.needle1, T.wire1))) * (1 - back);
    const balloon = ease(k01(t, T.inflate0, T.inflate1)) * (1 - ease(k01(t, T.deflate0, T.deflate1)));
    return { u, balloon, column: 0, opacity, step, shot };
  }
  const u = ease(k01(t, T.travel0, T.travel1)) * (1 - back);
  const balloon = ease(k01(t, T.inflate0, T.inflate1)) * (1 - ease(k01(t, T.deflate, T.back)));
  const column = ease(k01(t, T.fill0, T.fill1)) * (1 - ease(k01(t, T.fillOut, T.deflate)));
  return { u, balloon, column, opacity, step, shot };
}

// Going back through a step runs it backwards (the balloon goes down, the sclerosant drains, the catheter backs out), a little
// faster than forward. Autoplay (Tests) holds at each stop for AUTO_HOLD ms before the next step.
const BACK_SPEED = 1.6, AUTO_HOLD = 1600, LAND_MS = 160;

/**
 * Plays a procedure on the figure, step by step. stepped: hold at each step's stop until next(), back() or to(k) (a
 * presentation: Next and Back); otherwise each step follows the last after a short hold (Tests). to: the stop to play to first.
 * apply() / unapply(): the model takes the change as the sequence passes T.apply, and gives it back when going back past it.
 * onStep(i): the step on show changed. onMark(mark, names): the step's callout (a treatment mark) and the station names it shows;
 * false while it has none (the catheter on its way in); null once the procedure has gone. onFrame(frame, t): each frame. onEnd({ done, rewound }): it ended, played through or gone back to
 * before its start. Returns { next, back, to, stop({ home }), running, at, step }.
 */
export function playProcedure(stage, kind, { stepped = false, to = 0, apply = null, unapply = null, onFrame = null, onStep = null, onMark = null, onEnd = null } = {}) {
  const P = PROCS[kind], T = P.T, n = P.stops.length;
  let at = stepped ? Math.max(0, Math.min(n - 1, to | 0)) : 0, goal = P.stops[at];
  let t = 0, raf = 0, last = performance.now(), shot = '', landT = 0, holdT = 0, applied = false, stops = null, over = false, step = -2, shownMark = -3;
  function wake() { if (!over && !raf) { last = performance.now(); raf = nextFrame(tick); } }
  function tick() {
    raf = 0;
    const now = performance.now(), dt = Math.min(64, now - last); last = now;
    const f = procFrame(kind, t, stops);
    if (f.step !== step && f.step >= 0) { step = f.step; onStep?.(step); }
    // (The callout: a step's word once its step has happened (his ask, 29 Oct: "the callout should show up AFTER the step happens"),
    // none while it plays.)
    const mk = f.step < 0 ? -2 : t >= markAt(kind, f.step) ? f.step : -1;
    if (mk !== shownMark && mk > -2) { shownMark = mk; onMark?.(mk >= 0 ? stepMark(kind, mk) : false, P.steps[f.step][6] || []); }
    // (The view follows the tip in on the first step, once its shot has landed.)
    stage.setCatheter({ route: kind, u: f.u, balloon: f.balloon, balloonSpan: P.balloonSpan, column: f.column, columnColor: 'var(--tr-scler)',
      ring: null, clock: t, opacity: f.opacity, labels: [], keep: true, follow: f.shot === 'way' && shot === 'way' && !stage.gliding?.() });
    stops ||= stage.cathStops?.() || null;
    // The step's shot, glided to once (a slide's own glide, arcing on a long move). Until it lands nothing moves: no step starts
    // with the camera on its way. (A switch from the circuit takes a moment: cathFocus says no until the route is drawn.)
    if (f.shot && f.shot !== shot && stage.cathFocus(f.shot, SHOT_MS, { arc: true })) shot = f.shot;
    if (!shot || stage.gliding?.()) landT = now;
    const still = !shot || now - landT < LAND_MS;
    if (!applied && t >= T.apply) { applied = true; apply?.(); }
    else if (applied && t < T.apply) { applied = false; unapply?.(); }
    onFrame?.(f, t);
    if (t >= T.end) { finish(false); return; }
    if (at < 0 && t <= 0) { finish(true); return; }
    const t0 = t;
    if (!still && t !== goal) { t = t < goal ? Math.min(goal, t + dt) : Math.max(goal, t - dt * BACK_SPEED); holdT = 0; }
    else if (!still && !stepped && at < n - 1) { holdT ||= now; if (now - holdT >= AUTO_HOLD) { at++; goal = P.stops[at]; holdT = 0; } }
    // (Held at a stop with the camera landed and its last frame drawn: no frames until Next, Back or a step's button asks.)
    if (still || t !== t0 || t !== goal || !stepped || at < 0) raf = nextFrame(tick);
  }
  function finish(rewound) {
    over = true; raf = 0;
    stage.setCatheter(null);
    if (shot) stage.cathFocus('home', SHOT_MS, { arc: true });
    onMark?.(null, null);
    onEnd?.({ done: !rewound, rewound });
  }
  function stop({ home = true } = {}) {
    if (over) return;
    cancelFrame(raf); raf = 0; over = true;
    stage.setCatheter(null);
    if (home && shot) stage.cathFocus('home', SHOT_MS, { arc: true });
    onMark?.(null, null);
    onEnd?.({ done: false, rewound: false });
  }
  // (The first frame next frame, never inside this call: a caller's callbacks may name the run this returns.)
  wake();
  return {
    /** On to the next step's stop (false on the last: the caller moves on). */
    next() { if (over || at >= n - 1) return false; at++; goal = P.stops[at]; holdT = 0; wake(); return true; },
    /** Back to the stop before, running the step backwards; from the first, back to before the start, where it ends. */
    back() { if (over) return false; at = at > 0 ? at - 1 : -1; goal = at < 0 ? 0 : P.stops[at]; holdT = 0; wake(); return true; },
    /** To step k's stop, forward or back. */
    to(k) { if (over) return false; at = Math.max(0, Math.min(n - 1, k | 0)); goal = P.stops[at]; holdT = 0; wake(); return true; },
    stop,
    /** The cards changed the room: the shot on show framed again (false when there is none yet). */
    refit(ms = 700) { if (over || !shot) return false; stage.cathFocus(shot, ms, { steady: true }); return true; },   // (the cards moved: a slow frame at its start holds the glide back, stage animateVT)
    get running() { return !over; },
    get at() { return at; },
    get step() { return step; },
  };
}
