// Treatment procedures played on the anatomy: TIPS, BRTO and BATO, each a catheter on its real route (stage.js
// PROC_ROUTES draws it on the vessels, as the HVPG catheter). It travels in, does its work (a needle and a balloon for a
// TIPS, a balloon and sclerosant for BRTO and BATO), and comes back out. When it ends, the model holds what the procedure
// did, as the Treat buttons leave it (apply). Tests › HVPG plays them from its buttons; a slide's `procedure` plays one.
// Routes (AASLD 2024 names BATO among the obliterative therapies without a route; this is the transhepatic one):
//   TIPS: right internal jugular vein → SVC → IVC → right hepatic vein; a needle through the liver into the right portal vein.
//   BRTO: right femoral vein → IVC → left renal vein → the gastrorenal shunt, its balloon near the renal end.
//   BATO: through the liver into the right portal vein → portal and splenic veins → the short gastric feeder of the varices.

import { frameFor, cancelFrame } from './frame.js?v=19b3f2915c';
import { ease, k01 } from './hvpg-clock.js?v=553551a92a';
const nextFrame = frameFor('proc-anim');

// Each step: [id, the word on the tip's callout, the caption]. T: the sequence in ms from the start (apply: the model takes
// the change; back: the catheter starts out; end: it has gone; zoom: the camera closes on the stretch it works on; work: closer
// still, on the vein it treats, while the sclerosant fills it).
// (BRTO and BATO play at about two thirds of their first speed, each step long enough to read and watch: review 23 Oct.)
const OBLIT_T = { travel0: 600, travel1: 7600, zoom: 6600, inflate0: 8400, inflate1: 10200, work: 10400, fill0: 10800, fill1: 15800, apply: 16400, fillOut: 17000, deflate: 18400, back: 19600, end: 24000 };
// How long each camera move glides (ms): slow and even, so the eye can follow the catheter from the route into the close-up.
const CAM_MS = { route: 1400, tip: 2000, work: 1800, home: 1800 };
export const PROCS = {
  tips: {
    name: 'TIPS', label: 'TIPS', balloonSpan: 'tract',
    T: { travel0: 300, travel1: 3800, zoom: 3400, needle0: 4200, needle1: 6000, wire1: 7000, inflate0: 7400, inflate1: 8600, deflate0: 9000, deflate1: 9800, apply: 10000, back: 10800, end: 13600 },
    steps: [
      ['enter', 'Catheter in', 'In through the right internal jugular vein, down the SVC and the IVC into the right hepatic vein.'],
      ['needle', 'Needle across', 'A needle crosses the liver from the hepatic vein into the right portal vein, and a wire follows it into the portal trunk.'],
      ['dilate', 'Tract dilated', 'A balloon opens the tract through the liver to the width of the stent.'],
      ['done', 'Stent in', 'A covered stent holds the tract open: portal blood now reaches the hepatic vein without crossing the sinusoids.'],
    ],
    can: (p) => (p.tips?.on ? 'A TIPS is already in place.' : (p.thrombus?.RHV_IVC || 0) >= 0.8 ? 'The right hepatic vein is clotted, so a TIPS has no route.' : ''),
    apply: (p) => { p.tips = { ...p.tips, on: true, d: p.tips?.d || 8 }; return p; },
    had: (p) => !!p.tips?.on,
    undo: (p) => { p.tips = { ...p.tips, on: false }; return p; },
  },
  brto: {
    name: 'BRTO', label: 'BRTO', T: OBLIT_T, camMs: CAM_MS, follow: true,
    steps: [
      ['enter', 'Catheter in', 'Up from the right femoral vein, through the IVC and the left renal vein into the gastrorenal shunt.'],
      ['balloon', 'Balloon up', 'The balloon blocks the shunt near the renal vein, so nothing washes out into it.'],
      ['fill', 'Sclerosant', 'Sclerosant fills the shunt back up to the fundal varices, and they clot.'],
      ['done', 'Shunt closed', 'The shunt and the varices are closed. Their blood stays in the portal system, so the portal pressure rises.'],
    ],
    can: oblitCan,
    apply: oblitApply, had: oblitHad, undo: oblitUndo,
  },
  bato: {
    name: 'BATO', label: 'BATO', T: OBLIT_T, camMs: CAM_MS, follow: true,
    steps: [
      ['enter', 'Catheter in', 'Through the liver into the right portal vein, then along the portal and splenic veins into the short gastric veins.'],
      ['balloon', 'Balloon up', 'The balloon blocks the feeding vein, so the inflow to the varices stops.'],
      ['fill', 'Sclerosant', 'Sclerosant fills the varices from the portal side, and they clot.'],
      ['done', 'Varices closed', 'The varices and their gastrorenal shunt are closed. Their blood stays in the portal system, so the portal pressure rises.'],
    ],
    can: (p, m) => oblitCan(p, m) || ((p.thrombus?.PV_TRUNK || 0) >= 0.8 ? 'The portal vein is clotted, so BATO has no route.' : ''),
    apply: oblitApply, had: oblitHad, undo: oblitUndo,
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

/**
 * The procedure at t ms (pure): { u (0..1 of the way in), balloon, column (the sclerosant, 0..1), opacity, step (index into
 * steps, -1 once it has gone), cam ('route' | 'tip' | 'home') }. stops: the route's stretches as u (stage.cathStops), for the
 * TIPS its tract ({ tract: [u0, u1] }); without them the tract sits where it usually does.
 */
export function procFrame(kind, t, stops = null) {
  const P = PROCS[kind], T = P.T, back = ease(k01(t, T.back, T.end - 400));
  const opacity = 1 - k01(t, T.end - 800, T.end);
  const cam = t < T.zoom ? 'route' : t < T.back ? (T.work != null && t >= T.work ? 'work' : 'tip') : 'home';
  if (kind === 'tips') {
    const [a, b] = stops?.tract || [0.62, 0.86];
    const u = (t < T.needle0 ? a * ease(k01(t, T.travel0, T.travel1)) : t < T.needle1 ? a + (b - a) * ease(k01(t, T.needle0, T.needle1)) : b + (1 - b) * ease(k01(t, T.needle1, T.wire1))) * (1 - back);
    const balloon = ease(k01(t, T.inflate0, T.inflate1)) * (1 - ease(k01(t, T.deflate0, T.deflate1)));
    const step = t >= T.end ? -1 : t < T.needle0 ? 0 : t < T.inflate0 ? 1 : t < T.apply ? 2 : 3;
    return { u, balloon, column: 0, opacity, step, cam };
  }
  const u = ease(k01(t, T.travel0, T.travel1)) * (1 - back);
  const balloon = ease(k01(t, T.inflate0, T.inflate1)) * (1 - ease(k01(t, T.deflate, T.back)));
  const column = ease(k01(t, T.fill0, T.fill1)) * (1 - ease(k01(t, T.fillOut, T.deflate)));
  const step = t >= T.end ? -1 : t < T.inflate0 ? 0 : t < T.fill0 ? 1 : t < T.apply ? 2 : 3;
  return { u, balloon, column, opacity, step, cam };
}

/**
 * Plays a procedure on the figure. apply(): the model takes the change (called once, at T.apply, unless stopped first);
 * onFrame(frame, t): each frame; onEnd(): once the catheter has gone. Returns { stop({ home }) } (the catheter fades out, the
 * camera goes back unless home is false, and the model is left as it is).
 */
export function playProcedure(stage, kind, { apply = null, onFrame = null, onEnd = null } = {}) {
  const P = PROCS[kind];
  const t0 = performance.now();
  let raf = 0, cam = '', applied = false, stops = null, over = false;
  function step() {
    const t = performance.now() - t0, f = procFrame(kind, t, stops);
    const s = P.steps[f.step];
    // The step's word on the tip, while the catheter is in (it goes as the catheter starts out).
    const labels = s && t < P.T.back + 600 ? [{ key: s[0], at: 'side', kicker: P.name, text: s[1], unit: '', cls: 'step' }] : [];
    stage.setCatheter({ route: kind, u: f.u, balloon: f.balloon, balloonSpan: P.balloonSpan, column: f.column, columnColor: 'var(--tr-scler)',
      ring: null, clock: t, opacity: f.opacity, labels });
    stops ||= stage.cathStops?.() || null;
    // (Each camera move waits until the anatomy is on screen: a switch from the circuit takes a moment.)
    const ms = P.camMs || {};
    if (f.cam !== cam && (f.cam !== 'route' || t > 250) && stage.cathFocus(f.cam, ms[f.cam] || (f.cam === 'tip' ? 1100 : 900))) cam = f.cam;
    // (Between the route's framing and the close-up, the view drifts after the tip as it travels, as the HVPG catheter's does.)
    else if (cam === 'route' && f.cam === 'route' && P.follow) stage.cathFollow?.();
    if (!applied && t >= P.T.apply) { applied = true; apply?.(); }
    onFrame?.(f, t);
    if (t < P.T.end) raf = nextFrame(step);
    else finish();
  }
  function finish() { raf = 0; over = true; stage.setCatheter(null); onEnd?.(); }
  function stop({ home = true } = {}) {
    if (over) return;
    cancelFrame(raf); raf = 0; over = true;
    stage.setCatheter(null);
    if (home && cam && cam !== 'home') stage.cathFocus('home', P.camMs?.home || 700);
    onEnd?.();
  }
  step();
  return { stop, get running() { return !over; } };
}
