// Treatment procedures played on the anatomy: TIPS, BRTO and BATO, each a catheter on its real route (stage.js
// PROC_ROUTES draws it on the vessels, as the HVPG catheter). It travels in, does its work (a needle and a balloon for a
// TIPS, a balloon and sclerosant for BRTO and BATO), and comes back out. When it ends, the model holds what the procedure
// did, as the Treat buttons leave it (apply). Tests › HVPG plays them from its buttons; a slide's `procedure` plays one.
// Routes (AASLD 2024 names BATO among the obliterative therapies without a route; this is the transhepatic one):
//   TIPS: right internal jugular vein → SVC → IVC → right hepatic vein; a needle through the liver into the right portal vein.
//   BRTO: right femoral vein → IVC → left renal vein → the gastrorenal shunt, its balloon near the renal end.
//   BATO: through the liver into the right portal vein → portal and splenic veins → the short gastric feeder of the varices.

import { frameFor, cancelFrame } from './frame.js';
import { ease, cruise, k01, legMs, ROUTE_LEN, BALLOON_IN_MS, BALLOON_OUT_MS } from './hvpg-clock.js';
import { easeMove, createReversible } from './motion.js';
import { NODES } from '../engine/topology.js';
import { hvpgSev } from '../engine/pressure-cuts.js';
const NODE_I = Object.fromEntries(NODES.map((n, i) => [n.id, i]));
const nextFrame = frameFor('proc-anim');

// Each step: [id, its word (the callout on the part it works on, and its numbered step in the teaching card), the caption, a
// short word, the shot it plays in, the vessel its callout names, the station names shown with it, where along that vessel the
// callout points (0..1 of its drawn course: the tract for a TIPS, the balloon on the shunt, the varices the sclerosant fills)].
// Shots, all close enough to see the catheter and its balloon: 'way', on the tip from where it enters, the view following it
// in (panning only, at one scale); 'tip', the stretch it works on, held still (for BRTO and BATO the balloon with the vessel ahead,
// closer); 'fill', BRTO and BATO's sclerosant, the view following its front up to the varices; 'work', their result, the shunt and the
// varices (stage-cath.js oblitFocus: mock B, his pick, 7 Nov 2026). A new shot glides in only between steps, and
// playProcedure waits for it to land before anything moves (his asks, 29 Oct: the zoom jumped, the callouts moved, the catheter
// could not be seen; recs in review/procedure-animation-ideas). The first step's callout comes once the catheter has arrived.
// T: the sequence in ms from the start (apply: the model takes the change; back: the catheter starts out; end: it has gone).
// stops: where each step ends; presented, one Next plays one step and holds at its stop.
// before: what a slide that plays it opens on, the procedure not done yet (no TIPS, the shunt open): its words keep the after state.
// (apply comes after step 3's stop, as step 4 starts: the model closes the shunt, and its plug's X shows, only at step 4, "Shunt closed";
// at 15500 it landed inside step 3, so the X was on the shunt while the sclerosant step was on show. Mohammad, 7 Nov 2026.)
// (The travel legs, the balloons and the shots are timed from one table, hvpg-clock.js: a leg takes legMs of its route's length at one speed,
// a balloon BALLOON_IN_MS up and BALLOON_OUT_MS down on easeMove, a shot the camera's own camMs. What was written out per procedure is laid
// out from it below; the gaps between events are the ones the tables always had. Old and new travel times, ms: TIPS in 3700 -> 3600, its
// catheter over the wire 1400 -> 2400, BRTO 6200 -> 6200, BATO 6200 -> 9100, EUS scope 4900 -> 5200, glue 5700 -> 6200, HVPG 4000 -> 3400.)
const LEG = { tips: legMs(ROUTE_LEN.tips), tipsOver: legMs(ROUTE_LEN.tipsOver), brto: legMs(ROUTE_LEN.brto), bato: legMs(ROUTE_LEN.bato), eus: legMs(ROUTE_LEN.eus), eusglue: legMs(ROUTE_LEN.eusglue) };
/** A table of event times (ms) with the events at or after each `at` moved by `d`, for each [at, d] of moves, in the table as first written. */
const retime = (T, moves) => {
  const at = (x) => { let d = 0; for (let i = 0; i < moves.length; i++) if (x >= moves[i][0]) d += moves[i][1]; return x + d; };
  return Array.isArray(T) ? T.map(at) : Object.fromEntries(Object.entries(T).map(([k, x]) => [k, at(x)]));
};
// BRTO and BATO (one table of gaps, a leg of its own length each).
const oblitT = (leg) => {
  const travel1 = 300 + leg, inflate0 = travel1 + 900, inflate1 = inflate0 + BALLOON_IN_MS, fill0 = inflate1 + 1200, fill1 = fill0 + 5000, apply = fill1 + 1300;
  const deflate = apply + 1200, back = deflate + BALLOON_OUT_MS;
  return { travel0: 300, travel1, inflate0, inflate1, fill0, fill1, apply, fillOut: apply, deflate, back, end: back + 3100 };
};
const oblitStops = (T) => [T.travel1 + 600, T.inflate1 + 900, T.apply - 200, T.end];
const OBLIT_TS = { brto: oblitT(LEG.brto), bato: oblitT(LEG.bato) };
const OBLIT_STOPS = { brto: oblitStops(OBLIT_TS.brto), bato: oblitStops(OBLIT_TS.bato) };
// TIPS: the catheter in to where the tract leaves the hepatic vein, the needle across, the wire on, the catheter over them, the balloon.
const tipsT = () => {
  const travel1 = 300 + LEG.tips, needle0 = travel1 + 900, needle1 = needle0 + 1600, flash0 = needle1 - 100, flash1 = flash0 + 800, wire0 = flash0 + 500, wire1 = wire0 + 900;
  const over0 = wire1 + 200, over1 = over0 + LEG.tipsOver, inflate0 = over1 + 700, inflate1 = inflate0 + BALLOON_IN_MS, deflate0 = inflate1 + 600, deflate1 = deflate0 + BALLOON_OUT_MS;
  const apply = deflate1 + 100, back = apply + 600;
  return { travel0: 300, travel1, needle0, needle1, flash0, flash1, wire0, wire1, over0, over1, inflate0, inflate1, deflate0, deflate1, apply, back, end: back + 3000 };
};
const TIPS_T = tipsT();
const TIPS_STOPS = [TIPS_T.travel1 + 600, TIPS_T.over1 + 300, TIPS_T.inflate1 + 400, TIPS_T.end];
// How long a shot may glide (ms), as a slide's own camera does: it asks for the camera's own time for the move (cathFocus scale: stage-glide.js
// camMs, 480 to 900 ms by how far it goes), this being the ceiling. The procedure waits for the glide to land, and a little more, at each new shot.
const SHOT_MS = 1500;
// (cathFocus's options, made once. A shot with no times of its own is timed by the camera, on an arc for a long move; BRTO's, BATO's and the glue's keep their own, straight.)
const SHOT_CAM = { arc: true, scale: true }, SHOT_OWN = { arc: false, scale: false };
// BRTO and BATO glide straight (no arc), each shot as long as its move needs: the way in, the short push in to the balloon, the fill (the
// same framing: no move), the pull back to the result. Played step by step, their result stays framed when they end, until the slide
// moves on (holdEnd: the old camera glided home while the catheter was still backing out). Mock B, his pick, 7 Nov 2026.
const OBLIT_SHOT_MS = { way: 1200, tip: 800, fill: 300, work: 1200 };
export const PROCS = {
  tips: {
    name: 'TIPS', label: 'TIPS', balloonSpan: 'tract',
    // (Step 2, his ask, 5 Nov: the catheter parks in the hepatic vein, a needle runs out of it across the liver into the right
    // portal vein, a flash marks the portal hit, the wire runs on into the trunk, then the catheter slides over them into the
    // right portal vein. Mock: tips-needle-mock.html; design: the TIPS closer zoom and needle step doc.)
    T: TIPS_T,
    stops: TIPS_STOPS,
    steps: [
      ['enter', 'Catheter in', 'In through the right internal jugular vein, down the SVC and the IVC into the right hepatic vein.', 'In', 'way', 'RHV_IVC', ['IVCS', 'RHV'], 0.5],
      ['needle', 'Needle across', 'A needle crosses the liver from the hepatic vein into the right portal vein. A wire goes through it into the portal trunk, and the catheter slides over them.', 'Needle', 'tip', 'TIPS', ['RHV'], 0.5],
      ['dilate', 'Tract dilated', 'A balloon opens the tract through the liver to the width of the stent.', 'Balloon', 'tip', 'TIPS', ['RHV'], 0.5],
      ['done', 'Stent in', 'A covered stent holds the tract open: portal blood now reaches the hepatic vein without crossing the sinusoids.', 'Stent', 'tip', 'TIPS', ['RHV', 'RPV'], 0.5],
    ],
    can: (p) => (p.tips?.on ? 'A TIPS is already in place.' : (p.thrombus?.RHV_IVC || 0) >= 0.8 ? 'The right hepatic vein is clotted, so a TIPS has no route.' : ''),
    apply: (p) => { p.tips = { ...p.tips, on: true, d: p.tips?.d || 8 }; return p; },   // alloc-rare: runs once, when the sequence passes T.apply: the model takes the change (a new params record)
    had: (p) => !!p.tips?.on,
    undo: (p) => { p.tips = { ...p.tips, on: false }; return p; },
    before: { tips: { on: false } },
  },
  brto: {
    name: 'BRTO', label: 'BRTO', T: OBLIT_TS.brto, stops: OBLIT_STOPS.brto, shotMs: OBLIT_SHOT_MS, holdEnd: true,
    steps: [
      ['enter', 'Catheter in', 'Up from the right femoral vein, through the IVC and the left renal vein into the gastrorenal shunt.', 'In', 'way', 'C5', ['IVCI', 'LRV'], 0.8],
      ['balloon', 'Balloon up', 'The balloon blocks the shunt near the renal vein, so nothing washes out into it.', 'Balloon', 'tip', 'C5', ['LRV'], 0.84],
      ['fill', 'Sclerosant', 'Sclerosant fills the shunt back up to the fundal varices, and they clot.', 'Fill', 'fill', 'C5', ['LRV'], 0.35],
      ['done', 'Shunt closed', 'The shunt and the varices are closed. Their blood stays in the portal system, so the portal pressure rises.', 'Closed', 'work', 'C5', ['LRV'], 0.5],
    ],
    can: oblitCan,
    apply: oblitApply, had: oblitHad, undo: oblitUndo, before: { occluded: { C5: false } },
  },
  bato: {
    name: 'BATO', label: 'BATO', T: OBLIT_TS.bato, stops: OBLIT_STOPS.bato, shotMs: OBLIT_SHOT_MS, holdEnd: true,
    steps: [
      ['enter', 'Catheter in', 'Through the liver into the right portal vein, then along the portal and splenic veins into the short gastric veins.', 'In', 'way', 'C2', ['CONF', 'SV'], 0.35],
      ['balloon', 'Balloon up', 'The balloon blocks the feeding vein, so the inflow to the varices stops.', 'Balloon', 'tip', 'C2', ['SV'], 0.31],
      ['fill', 'Sclerosant', 'Sclerosant fills the varices from the portal side, and they clot.', 'Fill', 'fill', 'C2', ['SV'], 0.7],
      ['done', 'Varices closed', 'The varices and their gastrorenal shunt are closed. Their blood stays in the portal system, so the portal pressure rises.', 'Closed', 'work', 'C2', ['SV'], 0.5],
    ],
    can: (p, m) => oblitCan(p, m) || ((p.thrombus?.PV_TRUNK || 0) >= 0.8 ? 'The portal vein is clotted, so BATO has no route.' : ''),
    apply: oblitApply, had: oblitHad, undo: oblitUndo, before: { occluded: { C5: false } },
  },
};
export const PROC_KINDS = Object.keys(PROCS);
// The measurements played the same way, step by step on the anatomy, that change nothing in the model: EUS-PPG (Tests › Scope).
// They stay out of PROCS (the HVPG card's treatment buttons and their tests), and every player below takes them through specOf.
// EUS-PPG, the endoscopic ultrasound-guided portal pressure gradient (Huang 2017; the EchoTip Insight technique): a linear
// echoendoscope in the stomach, and one 25-gauge FNA needle, primed with heparinized saline and joined to a compact manometer by
// non-compressible tubing, passed through the stomach wall and the left lobe into the left portal vein (its umbilical part), then
// into a hepatic vein (here the left; the middle, or the IVC, serve as well). Each reading is the mean of three. EUS-PPG = PV − HV.
// The scope works from the proximal stomach, just below the cardia, then from the cardia itself (eus-scope.js): its tip turned a little
// toward the lesser curvature, the needle raised by the elevator toward each vein in the plane of the image.
// (Written for a way in of 4900 ms, 300 to 5200; retimed to the leg its length takes. The scope turns as it arrives, so its aim starts at 5000.)
const EUS_MOVE = [[5000, LEG.eus - 4900]];
const EUS_T = retime({ travel0: 300, travel1: 5200, aim0: 5000, aim1: 6300, fan0: 5600, fan1: 6600,
  pv0: 7000, pv1: 8800, pvFlash0: 8700, pvFlash1: 9500, pvRead0: 9400, pvRead1: 11300, pvOut0: 11700, pvOut1: 12600,
  move0: 12800, move1: 14400, hv0: 14800, hv1: 16600, hvFlash0: 16500, hvFlash1: 17300, hvRead0: 17200, hvRead1: 19100,
  hvOut0: 19500, hvOut1: 20400, apply: 20500, fanOut0: 20400, fanOut1: 21200, back: 21300, end: 25600 }, EUS_MOVE);
const r1 = (v) => Math.round(v * 10) / 10;
const EUS_MARK_T = [...retime([6800, 11400, 19200], EUS_MOVE), EUS_T.apply], EUS_SUM_OFF = 400;
// (The readings the scope's labels show, kept and written in place: the portal vein's at the PV target (at 'ahead'), the hepatic vein's at
// the HV target (at 'tip'), and the summary that takes them both in.)
const EUS_PV = { key: 'w', at: 'ahead', kicker: 'PV', text: '', unit: 'mmHg', cls: 'pv' };
const EUS_HV = { key: 'f', at: 'tip', kicker: 'HV', text: '', unit: 'mmHg', cls: 'free' };
const EUS_ROW_PV = { at: 'ahead', kicker: 'PV', text: '', unit: 'mmHg', cls: 'pv' }, EUS_ROW_HV = { at: 'tip', kicker: 'HV', text: '', unit: 'mmHg', cls: 'free' };
const EUS_CALC = { kicker: 'EUS-PPG', text: '', unit: 'mmHg', cls: '' };
const EUS_SUM = { key: 's', at: 'sum', mid: true, rows: [EUS_ROW_HV, EUS_ROW_PV], calc: EUS_CALC };   // (mid: placed midway between its two points; HV above PV, as their veins lie, so the leaders never cross: his ask, 6 Nov 2026)
const EUS_RESULT_CLS = { danger: 'result danger', caution: 'result caution', ok: 'result ok' };
const NO_MARKS = Object.freeze([]);
const mmHg = (v) => (Number.isFinite(v) ? v.toFixed(1) : '\u2014');
export const MEASURES = {
  eus: {
    name: 'EUS-PPG', label: 'EUS-PPG', measure: true, T: EUS_T,
    stops: retime([6800, 11500, 19300], EUS_MOVE).concat(EUS_T.end),
    // (Each callout once its reading has settled; the result as soon as the needle is back in the scope, so it stands while the
    // scope comes out.)
    markT: EUS_MARK_T,
    steps: [
      ['enter', 'Scope in', 'A linear echoendoscope goes down the esophagus into the stomach. From the proximal stomach it images the left lobe of the liver through the wall; color Doppler finds the left portal vein, the left hepatic vein, and a path to each through the liver with no other vessel in the way.', 'Scope', 'way', null, [], 0.5],
      ['pv', 'Portal vein', 'A 25-gauge needle, primed with heparinized saline, crosses the stomach wall and the left lobe into the umbilical part of the left portal vein. A compact manometer on its hub reads the pressure once it settles: the mean of three readings.', 'PV', 'tip', 'PVH_L', ['LPV'], 0.9],
      ['hv', 'Hepatic vein', 'The needle comes back into the scope. The scope draws back to the cardia and the elevator raises the needle toward the dome, and it crosses the left lobe into the left hepatic vein (the middle hepatic vein, or the IVC, serve as well): again the mean of three readings.', 'HV', 'tip', 'LHV_IVC', ['LPV', 'LHV'], 0.6],
      ['done', 'EUS-PPG', 'EUS-PPG = portal vein \u2212 hepatic vein, both read by one needle in one session. It is read on the HVPG\u2019s cut-offs: 5 mmHg or more is portal hypertension, 10 or more clinically significant. It is still being validated against the HVPG, which stays the reference.', 'PPG', 'work', 'PVH_L', ['LPV', 'LHV'], 0.9],
    ],
    // The readings, taken once each callout comes (read: the model frame; its node pressures P): the portal vein at the left portal
    // vein's node, the hepatic vein at the left hepatic vein's, and their difference as every screen shows it, at one decimal.
    capture(i, rd, f) {
      const P = f?.P;
      if (i === 1) rd.pv = P ? r1(P[NODE_I.LPV]) : NaN;
      if (i === 2) { rd.hv = P ? r1(P[NODE_I.LHV]) : NaN; rd.ppg = r1(rd.pv - rd.hv); }
    },
    // Its callouts are the HVPG catheter's (his ask, 6 Nov 2026: "the callouts should be similar to the HVPG callouts; PV... then HV...
    // then they come over each other and the difference is EUS-PPG"): the needle's reading on the portal vein as it reads, then the
    // hepatic vein's, then the two travel into one summary that gives their difference (stage-cath.js cathLabels: keys w, f and s, as
    // WHVP, FHVP and HVPG). No step callouts on the vessels besides.
    marks: () => NO_MARKS,
    labels(t, rd, f, out) {
      out.length = 0;
      const T = EUS_T, P = f?.P, live = (i) => (P ? r1(P[i]) : NaN);
      // (The result stands while the scope comes out, and goes as the scope does: at the end, before the view goes home.)
      if (t >= T.end - EUS_SUM_OFF || t < T.pvRead0) return out;
      if (t >= EUS_MARK_T[3] && Number.isFinite(rd.ppg)) {
        EUS_ROW_PV.text = mmHg(rd.pv); EUS_ROW_HV.text = mmHg(rd.hv);
        EUS_CALC.text = mmHg(rd.ppg); EUS_CALC.cls = EUS_RESULT_CLS[hvpgSev(rd.ppg)];
        out.push(EUS_SUM);
        return out;
      }
      // (While the needle reads, the manometer's number as it settles; once read, the reading taken.)
      EUS_PV.text = mmHg(t >= EUS_MARK_T[1] && Number.isFinite(rd.pv) ? rd.pv : live(NODE_I.LPV)); out.push(EUS_PV);
      if (t >= T.hvRead0) { EUS_HV.text = mmHg(t >= EUS_MARK_T[2] && Number.isFinite(rd.hv) ? rd.hv : live(NODE_I.LHV)); out.push(EUS_HV); }
      return out;
    },
    can: () => '', apply: (p) => p, had: () => false, undo: (p) => p, before: {},
  },
};
// A bypass graft is a surgical procedure: no catheter, no route to follow. The graft itself is the thing played (the Meso-Rex bypass:
// the model takes the change as the sequence passes T.apply, and the stage draws the new vessel on from the gut end, stage-transitions
// REX_GROW_MS, so it is seen growing along its path, from the superior mesenteric vein up to the left portal vein). The camera stays
// where the slide or the learner put it (no shot of its own: a step's shot is '' and the figure is not moved).
// Meso-Rex bypass: a vein graft (the internal jugular vein, or the patient's saphenous vein) from the superior mesenteric vein below a
// clotted portal trunk to the left portal vein in the Rex recess, the umbilical portion running up into the liver's fissure
// (Baveno VIII 9.31: it needs an open intrahepatic portal system; the Rex shunt restores physiological flow into the liver).
const occludedAt = (p, id) => 1 - (1 - (p.stenosis?.[id] || 0)) * (1 - (p.thrombus?.[id] || 0));
/** Whether the portal trunk is clotted (the case for a Meso-Rex bypass) and the left portal vein is open (the Rex recess it joins). */
export const rexSuitable = (p) => occludedAt(p || NO_PARAMS, 'PV_TRUNK') >= 0.8 && occludedAt(p || NO_PARAMS, 'PVH_L') < 0.8;
export const GRAFTS = {
  rex: {
    name: 'Meso-Rex bypass', label: 'Meso-Rex bypass', graft: true,
    T: { apply: 2300, back: 7000, end: 8000 },
    stops: [2000, 5000, 6500, 8000],
    steps: [
      ['expose', 'Expose', 'The surgeon exposes the superior mesenteric vein below the clot, and the left portal vein where it turns up into the liver (the Rex recess).', 'Expose', '', 'SMV_CONF', ['SMV'], 0.25],
      ['graft', 'Graft', 'A vein graft is sewn to the superior mesenteric vein and runs up, past the clotted trunk, toward the liver.', 'Graft', '', 'REX', ['SMV'], 0.45],
      ['sew', 'Sewn to the liver', 'Its other end is sewn to the left portal vein in the Rex recess.', 'Sewn', '', 'REX', ['SMV', 'LPV'], 0.9],
      ['done', 'Flow to the liver', 'The gut\u2019s blood now runs through the graft into the left portal vein and the liver, not into the veins of the body.', 'Flow', '', 'REX', ['LPV'], 0.5],
    ],
    can: (p) => (p.rex ? 'A Meso-Rex bypass is already in place.' : occludedAt(p, 'PV_TRUNK') < 0.8 ? 'The portal trunk is open: a Meso-Rex bypass is for a clotted trunk.'
      : occludedAt(p, 'PVH_L') >= 0.8 ? 'The left portal vein is clotted: there is no open Rex recess to join.' : ''),
    offered: rexSuitable,
    apply: (p) => { p.rex = true; return p; },
    had: (p) => !!p.rex,
    undo: (p) => { p.rex = false; return p; },
    before: { rex: false },
  },
};
// A treatment through the echoendoscope (EUS-guided coils and glue, Baveno VIII 5.40), played as BRTO and BATO are, step by step with a
// numbered callout on the varix. It changes the model (the varix is closed), so it is not a measurement; it is not a catheter either, so
// it stays off the HVPG card's treatment buttons (PROCS). A slide plays it: Gastric varices, its own Coils and glue slide just before Treat the spleen (his ask, 7 Nov 2026: "EUS
// guided coiling and glue injection ... before embolizing and removing the spleen as a step").
// The scope goes down the esophagus, through the cardia on one wide turn and on under the fundus to a station over the varix
// (eus-scope.js EUS_GLUE_ROUTE); straight there, its transducer faces the varix and the needle goes square from it into the varix (no sharp
// bend: his ask). Coils are pushed out of the needle's point and curl on inside the varix, then cyanoacrylate is injected over them and casts it.
// The model then closes the varix alone (occluded C2: its X sits on the varix, never on the gastrorenal shunt, and the flow in it slows to
// a stop as the model eases), as step 5 starts, after the glue's stop (as BRTO's shunt closes only at its step 4).
// (Written for a way in of 5700 ms, 300 to 6000; retimed to the leg its length takes.)
const GLUE_MOVE = [[6000, LEG.eusglue - 5700]];
const GLUE_T = retime({ travel0: 300, travel1: 6000, aim0: 6400, aim1: 7200, fan0: 6500, fan1: 7300, needle0: 7600, needle1: 9000, flash0: 8900, flash1: 9700,
  coil0: 10300, coil1: 12700, fill0: 13300, fill1: 16000, apply: 16600, needleOut0: 16900, needleOut1: 17800, fanOut0: 17600, fanOut1: 18400,
  aimOut0: 17800, aimOut1: 18600, back: 18800, end: 22600 }, GLUE_MOVE);
const GLUE_STOPS = retime([6200, 9900, 13000, 16300, 22600], GLUE_MOVE);
const GLUE_SHOT_MS = { way: 1200, tip: 800, work: 1200 };
// (The callouts on the varix: none while the scope goes in, then each step's number and word where the needle went in. The varix is
// the short gastric feeder's course, C2, at the glue's point (eus-scope.js EUS_GLUE_TARGET).)
const GLUE_F = 0.8;
const GLUE_STEPS = [
  ['enter', 'Scope in', 'A linear echoendoscope goes down the esophagus, through the cardia and on under the fundus. From there it images the fundal varix through the stomach wall, and color Doppler shows the blood running through it.', 'Scope', 'way', 'C2', [], GLUE_F],
  ['needle', 'Needle in', 'The transducer faces the varix. A 19-gauge needle, raised square to the scope, crosses the stomach wall into the varix.', 'Needle', 'tip', 'C2', ['GV'], GLUE_F],
  ['coils', 'Coils', 'Coils are pushed through the needle and curl inside the varix. They hold the glue that follows, so less of it washes away into the shunt.', 'Coils', 'tip', 'C2', ['GV'], GLUE_F],
  ['glue', 'Glue', 'Cyanoacrylate is injected over the coils. It sets in seconds and casts the varix from inside.', 'Glue', 'tip', 'C2', ['GV'], GLUE_F],
  ['done', 'Varix closed', 'The varix is closed: the flow in it slows and stops. The gastrorenal shunt stays open, and the clotted splenic vein is still there, so the spleen is treated next.', 'Closed', 'work', 'C2', ['GV'], GLUE_F],
];
const GLUE_MARKS = GLUE_STEPS.map((s, i) => (i ? Object.freeze([{ edges: [s[5]], label: `${i + 1} ${s[1]}`, num: String(i + 1), word: s[1], kind: 'treat', f: s[7], pin: true, ghost: true }]) : Object.freeze([])));
const glueHad = (p) => !!p.occluded?.C2;
export const ENDO = {
  eusglue: {
    name: 'EUS coils and glue', label: 'EUS coils and glue', T: GLUE_T, stops: GLUE_STOPS, shotMs: GLUE_SHOT_MS, holdEnd: true,
    steps: GLUE_STEPS,
    marks: (i) => GLUE_MARKS[i] || GLUE_MARKS[0],
    can: (p, m) => (p.spontaneous?.C5 === false ? 'This patient has no fundal varices.' : p.occluded?.C2 || p.occluded?.C5 ? 'The fundal varices are already closed.'
      : !hasGastricVarices(m) ? 'This patient has no gastric varices to treat.' : ''),
    apply: (p) => { p.occluded = { ...p.occluded, C2: true }; return p; },   // alloc-rare: once, as the sequence passes T.apply
    had: glueHad,
    undo: (p) => { p.occluded = { ...p.occluded, C2: false }; return p; },   // alloc-rare: once, going back past T.apply
    before: { occluded: { C2: false } },
  },
};
/** A procedure's, a measurement's, a graft's or an endoscopic treatment's definition. */
export const specOf = (kind) => PROCS[kind] || MEASURES[kind] || GRAFTS[kind] || ENDO[kind] || null;
// The readings each kind's last run took (its callouts and its card read them): { pv, hv, ppg } for EUS-PPG.
export const READS = { eus: { pv: NaN, hv: NaN, ppg: NaN } };
// (No params at all: the checks below only read, so one empty record stands in, not a new one each call.)
const NO_PARAMS = Object.freeze({});
// (A callout names no stations: one empty list, never written to.)
const NO_NAMES = [];
const TRACT = [0.62, 0.86], RPV = [0.86, 0.93];
// (How far into the right portal vein the TIPS catheter slides over the wire: the wire alone goes on into the trunk.)
const CATH_RPV = 0.28;
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
export const procBlocked = (kind, p, m = null) => (specOf(kind) ? specOf(kind).can(p || NO_PARAMS, m) : 'Unknown procedure.');
/** Whether a procedure is offered at all for this patient: BRTO and BATO only while there are gastric varices (or the
 *  procedure has already closed them, so it can be watched again). TIPS always is (dimmed when it cannot run). */
export const procOffered = (kind, p, m = null) => !!specOf(kind) && (GRAFTS[kind] ? GRAFTS[kind].had(p || NO_PARAMS) || GRAFTS[kind].offered(p) : kind === 'tips' || !!MEASURES[kind] || specOf(kind).had(p || NO_PARAMS) || (p?.spontaneous?.C5 !== false && hasGastricVarices(m)));

/** The step a time falls in (pure): each runs up to and including its stop, so a procedure held at a stop still shows that step. */
export const stepAt = (kind, t) => { const S = specOf(kind).stops; for (let i = 0; i < S.length; i++) if (t <= S[i]) return i; return S.length - 1; };
// (The step's number on its callout: the same number as its step in the teaching card, a plain bold digit. Not a circled numeral (➊):
// Inter's cut the GPU draws the labels with has none, so the callout went to the SVG, which never follows the camera, and swapped
// between the two every frame (Mohammad, 6 Nov 2026, iPhone: the TIPS and BRTO callouts "don't stick to where they should and flicker").)
export const STEP_NUM = ['1', '2', '3', '4', '5', '6'];
/** When a step's callout comes (pure, ms): once the step has played, at its stop; the last step's once the stent is in or the
 *  balloon is down, as the catheter starts out (a measurement's: its markT, as each reading is taken). */
export const markAt = (kind, i) => { const P = specOf(kind); return P.markT ? P.markT[i] : i >= P.stops.length - 1 ? P.T.back : P.stops[i]; };
/** The callout a step puts on the figure: a slide's own mark (a treatment's), numbered (num, drawn bold before its word), at its point on the part it works on, kept
 *  on its side and clear of every vessel (pin); ghost: it may name a vessel not drawn yet (the tract, before the stent is in). */
export const stepMark = (kind, i) => {
  const P = specOf(kind), s = P?.steps[i];
  if (P?.marks) return stepMarks(kind, i)[0] || null;
  return s ? { edges: [s[5]], label: `${STEP_NUM[i]} ${s[1]}`, num: STEP_NUM[i], word: s[1], kind: 'treat', f: s[7] ?? 0.5, pin: true, ghost: true } : null;   // alloc-rare: only when the step on show changes (four times in a procedure); the mark is a new record the store keeps
};

/** Every callout a step puts on the figure (a measurement's carry their readings, READS, and keep the earlier ones beside them). */
export const stepMarks = (kind, i) => {
  const P = specOf(kind);
  if (P?.marks) return P.marks(i, READS[kind]);   // alloc-rare: only when the step on show changes (four times in a run)
  const m = stepMark(kind, i);
  return m ? [m] : NO_NAMES;
};

/**
 * The procedure at t ms (pure): { u (0..1 of the way in), balloon, column (the sclerosant, 0..1), opacity, step (index into
 * steps, -1 once it has gone), shot ('way' | 'tip', '' once it has gone), and for the TIPS needle and wire (their tips, as u; 0:
 * not out) and flash (0..1 of the portal hit's rings, 0: none) }. stops: the route's stretches as u (stage.cathStops),
 * for the TIPS its tract ({ tract: [u0, u1] }); without them the tract sits where it usually does. into: a record to write it in (a
 * playing procedure keeps one for its frames), else a new one.
 */
export function procFrame(kind, t, stops = null, into = null) {
  const P = specOf(kind), T = P.T, back = cruise(k01(t, T.back, T.end - 400));   // (going out is a travel leg too)
  const opacity = 1 - k01(t, T.end - 800, T.end);
  const step = t >= T.end ? -1 : stepAt(kind, t), shot = step >= 0 ? P.steps[step][4] : '';
  if (kind === 'eus') return eusFrame(T, t, back, opacity, step, shot, into || {});
  if (kind === 'eusglue') return glueFrame(T, t, back, opacity, step, shot, into || {});   // alloc-rare: only a caller that gives no record (a test); the run passes its own
  if (P.graft) {
    const f = into || {};   // alloc-rare: only a caller that gives no record (a test, a pure read); the run passes its own
    f.u = 0; f.balloon = 0; f.column = 0; f.opacity = opacity; f.step = step; f.shot = shot; f.needle = 0; f.wire = 0; f.flash = 0; f.aim = 0; f.tgt = 0; f.fan = 0; f.read = 0;
    return f;
  }
  if (kind === 'tips') {
    const tr = stops?.tract || TRACT, a = tr[0], b = tr[1], rp = stops?.rpv || RPV, c = Math.max(b, rp[0] + (rp[1] - rp[0]) * CATH_RPV);
    // The catheter in to where the tract leaves the hepatic vein, then (once the needle and wire are out) over them into the
    // right portal vein; the needle out along the tract a little past its end, covered again as the catheter reaches it; the
    // wire on from the needle's tip into the trunk (u 1). Going out, the wire comes back with the catheter.
    const tip = t < T.over0 ? a * cruise(k01(t, T.travel0, T.travel1)) : a + (c - a) * cruise(k01(t, T.over0, T.over1));
    const nd = a + (Math.min(c, b + 0.01) - a) * ease(k01(t, T.needle0, T.needle1));
    const u = tip * (1 - back);
    const needle = t >= T.needle0 && t < T.over1 && nd > tip ? nd : 0;
    const wd = nd + (1 - nd) * ease(k01(t, T.wire0, T.wire1)), wire = t >= T.wire0 ? Math.max(u, wd - (wd - u) * Math.min(1, back * 3)) : 0;
    const flash = t > T.flash0 && t < T.flash1 ? k01(t, T.flash0, T.flash1) : 0;
    const balloon = easeMove(k01(t, T.inflate0, T.inflate1)) * (1 - easeMove(k01(t, T.deflate0, T.deflate1)));
    const f = into || {};   // alloc-rare: only a caller that gives no record (a test, a pure read); the run passes its own
    f.u = u; f.balloon = balloon; f.column = 0; f.opacity = opacity; f.step = step; f.shot = shot; f.needle = needle; f.wire = wire > u ? wire : 0; f.flash = flash; f.aim = 0; f.tgt = 0; f.fan = 0; f.read = 0;
    return f;
  }
  const u = cruise(k01(t, T.travel0, T.travel1)) * (1 - back);
  const balloon = easeMove(k01(t, T.inflate0, T.inflate1)) * (1 - easeMove(k01(t, T.deflate, T.back)));
  const column = ease(k01(t, T.fill0, T.fill1)) * (1 - ease(k01(t, T.fillOut, T.deflate)));
  const f = into || {};   // alloc-rare: only a caller that gives no record (a test, a pure read); the run passes its own
  f.u = u; f.balloon = balloon; f.column = column; f.opacity = opacity; f.step = step; f.shot = shot; f.needle = 0; f.wire = 0; f.flash = 0; f.aim = 0; f.tgt = 0; f.fan = 0; f.read = 0;
  return f;
}

/**
 * EUS-PPG at t ms (pure): u, how far in the scope is (0..1 of the way to its low station); tgt, its target (0 the portal vein, 1 the
 * hepatic vein: the scope's station and its turn go between the two with it); aim, how far its tip has turned toward that target;
 * needle, how far out the needle is (0..1 of the way from the scope to the target); flash, the hit's rings; read, 1 or 2 while the
 * manometer reads the portal or the hepatic vein; fan, the ultrasound sector's strength. The scope turns only with the needle in.
 */
function eusFrame(T, t, back, opacity, step, shot, f) {
  const hv = t >= T.move0, tgt = ease(k01(t, T.move0, T.move1));
  const needle = hv ? ease(k01(t, T.hv0, T.hv1)) * (1 - ease(k01(t, T.hvOut0, T.hvOut1))) : ease(k01(t, T.pv0, T.pv1)) * (1 - ease(k01(t, T.pvOut0, T.pvOut1)));
  const fl0 = hv ? T.hvFlash0 : T.pvFlash0, fl1 = hv ? T.hvFlash1 : T.pvFlash1;
  f.u = cruise(k01(t, T.travel0, T.travel1)) * (1 - back); f.balloon = 0; f.column = 0; f.opacity = opacity; f.step = step; f.shot = shot;
  // (While the scope moves between its stations its tip straightens and turns again: the transducer's side and the elevator's angle
  // change only while it is straight.)
  const mv = k01(t, T.move0, T.move1), dip = mv > 0 && mv < 1 ? Math.sin(Math.PI * mv) : 0;
  f.tgt = tgt; f.aim = ease(k01(t, T.aim0, T.aim1)) * (1 - ease(k01(t, T.hvOut1, T.back + 600))) * (1 - dip);
  f.needle = needle; f.wire = 0; f.flash = t > fl0 && t < fl1 ? k01(t, fl0, fl1) : 0;
  f.read = t >= T.pvRead0 && t < T.pvRead1 ? 1 : t >= T.hvRead0 && t < T.hvRead1 ? 2 : 0;
  f.fan = ease(k01(t, T.fan0, T.fan1)) * (1 - ease(k01(t, T.fanOut0, T.fanOut1)));
  return f;
}

/**
 * EUS-guided coils and glue at t ms (pure): u, how far in the scope is; aim, its port open and the elevator up (the scope does not turn:
 * the needle leaves square to it, eus-scope.js); fan, the ultrasound sector; needle, how far out the needle is (0..1 of the way to the
 * varix); flash, the hit's rings; coil, how much of the coil is out in the varix (it stays there); column, the glue filling the varix along
 * its course (stage-cath.js tints it; it stays). tgt 0: one station, one target.
 */
function glueFrame(T, t, back, opacity, step, shot, f) {
  f.u = cruise(k01(t, T.travel0, T.travel1)) * (1 - back); f.balloon = 0; f.opacity = opacity; f.step = step; f.shot = shot; f.tgt = 0; f.wire = 0; f.read = 0;
  f.aim = ease(k01(t, T.aim0, T.aim1)) * (1 - ease(k01(t, T.aimOut0, T.aimOut1)));
  f.fan = ease(k01(t, T.fan0, T.fan1)) * (1 - ease(k01(t, T.fanOut0, T.fanOut1)));
  f.needle = ease(k01(t, T.needle0, T.needle1)) * (1 - ease(k01(t, T.needleOut0, T.needleOut1)));
  f.flash = t > T.flash0 && t < T.flash1 ? k01(t, T.flash0, T.flash1) : 0;
  f.coil = ease(k01(t, T.coil0, T.coil1));
  f.column = ease(k01(t, T.fill0, T.fill1));
  return f;
}

// How many procedures or measurements are playing (one catheter or scope on the figure at a time: each card asks before it starts one).
let runs = 0;
export const procRunning = () => runs > 0;

// Going back through a step runs it backwards (the balloon goes down, the sclerosant drains, the catheter backs out), a little
// faster than forward. Autoplay (Tests) holds at each stop for AUTO_HOLD ms before the next step.
const BACK_SPEED = 1.6, AUTO_HOLD = 1600, LAND_MS = 160;

/**
 * Plays a procedure on the figure, step by step. stepped: hold at each step's stop until next(), back() or to(k) (a
 * presentation: Next and Back); otherwise each step follows the last after a short hold (Tests). to: the stop to play to first.
 * apply() / unapply(): the model takes the change as the sequence passes T.apply, and gives it back when going back past it.
 * onStep(i): the step on show changed. onMark(mark, names, marks): the step's callout (a treatment mark), the station names it shows
 * and all its callouts (a measurement's keep the earlier readings beside it); false while it has none (the catheter on its way in);
 * null once the procedure has gone. read(): the model frame now (a measurement reads its pressures from it as each callout comes). onFrame(frame, t): each frame. onEnd({ done, rewound }): it ended, played through or gone back to
 * before its start. Returns { next, back, to, stop({ home }), running, at, step }.
 */
export function playProcedure(stage, kind, { stepped = false, to = 0, apply = null, unapply = null, onFrame = null, onStep = null, onMark = null, onEnd = null, read = null } = {}) {
  const P = specOf(kind), T = P.T, n = P.stops.length, rd = READS[kind];
  if (rd) { rd.pv = NaN; rd.hv = NaN; rd.ppg = NaN; }
  runs++;
  let at = stepped ? Math.max(0, Math.min(n - 1, to | 0)) : 0, goal = P.stops[at];
  // (One record for the frame and one for the catheter, kept for the whole run and written in place: the stage reads the catheter's as it
  // is given, and holds it only to read it again, so the last frame's values are what it keeps.)
  const fr = { u: 0, balloon: 0, column: 0, opacity: 0, step: 0, shot: '', needle: 0, wire: 0, flash: 0, aim: 0, tgt: 0, fan: 0, read: 0, coil: 0 };
  const cat = { route: kind, u: 0, needle: 0, wire: 0, flash: 0, coil: 0, balloon: 0, balloonSpan: P.balloonSpan, column: 0, columnColor: kind === 'eusglue' ? 'var(--dev-glue)' : 'var(--tr-scler)', aim: 0, tgt: 0, fan: 0, read: 0, ring: null, clock: 0, opacity: 0, labels: [], keep: true, follow: false };
  // (The procedure's clock, in ms of the sequence, 1 ms a ms forward and BACK_SPEED back: a reversible clock, so Back or Next while a step is still
  // moving slows the catheter and turns it round over D_FLIP, never in one frame. It lands exactly on each stop; the steps hold there.)
  const clock = createReversible({ ms: 1, min: 0, max: T.end, land: false, x: 0 });
  let t = 0, raf = 0, last = performance.now(), shot = '', landT = 0, holdT = 0, applied = false, stops = null, over = false, step = -2, shownMark = -3;
  function wake() { if (!over && !raf) { last = performance.now(); raf = nextFrame(tick); } }
  function tick() {
    raf = 0;
    const now = performance.now(), dt = Math.min(64, now - last); last = now;
    const f = procFrame(kind, t, stops, fr);
    if (f.step !== step && f.step >= 0) { step = f.step; onStep?.(step); }
    // (The callout: a step's word once its step has happened (his ask, 29 Oct: "the callout should show up AFTER the step happens"),
    // none while it plays.)
    const mk = f.step < 0 ? -2 : t >= markAt(kind, f.step) ? f.step : -1;
    if (mk !== shownMark && mk > -2) {
      shownMark = mk;
      if (mk >= 0 && rd) P.capture(mk, rd, read?.());
      const ms = mk >= 0 ? stepMarks(kind, mk) : NO_NAMES;
      onMark?.(ms[0] || false, P.steps[f.step][6] || NO_NAMES, ms);
    }
    // (The view follows the tip in on the first step, once its shot has landed; a measurement's, its work as well.)
    cat.u = f.u; cat.needle = f.needle; cat.wire = f.wire; cat.flash = f.flash; cat.balloon = f.balloon; cat.column = f.column; cat.clock = t; cat.opacity = f.opacity;
    cat.aim = f.aim; cat.tgt = f.tgt; cat.fan = f.fan; cat.read = f.read; cat.coil = f.coil || 0; if (rd) cat.ring = f.read === 1 ? 'var(--tr-pv)' : f.read === 2 ? 'var(--tr-hv)' : null;
    if (P.labels) P.labels(t, rd, read?.(), cat.labels);
    // (A measurement's scope is followed at its work too, from one station to the next: its shot names which, 'way' or 'tip'.)
    // (BRTO and BATO's 'fill': the view follows the sclerosant's front.)
    cat.follow = f.shot === shot && (shot === 'way' || shot === 'fill' || (P.measure && shot === 'tip')) && !stage.gliding?.() ? shot : false;
    stage.setCatheter(cat);
    stops ||= stage.cathStops?.() || null;
    // The step's shot, glided to once (a slide's own glide, arcing on a long move). Until it lands nothing moves: no step starts
    // with the camera on its way. (A switch from the circuit takes a moment: cathFocus says no until the route is drawn.)
    if (f.shot && f.shot !== shot && stage.cathFocus(f.shot, P.shotMs?.[f.shot] ?? SHOT_MS, P.shotMs ? SHOT_OWN : SHOT_CAM)) shot = f.shot;   // alloc-rare: only when a new step's shot starts to glide (a few times in a procedure)
    if (!shot || stage.gliding?.()) landT = now;
    // (A graft has no shot of its own: the figure stays where it is, so nothing waits for a camera.)
    const still = P.graft ? false : !shot || now - landT < LAND_MS;
    if (!applied && t >= T.apply) { applied = true; apply?.(); }
    else if (applied && t < T.apply) { applied = false; unapply?.(); }
    onFrame?.(f, t);
    if (t >= T.end) { finish(false); return; }
    if (at < 0 && t <= 0) { finish(true); return; }
    const t0 = t;
    if (!still && t !== goal) { clock.aim(goal, goal < t ? 1 / BACK_SPEED : 1); t = clock.step(dt); holdT = 0; }
    else if (!still && !stepped && at < n - 1) { holdT ||= now; if (now - holdT >= AUTO_HOLD) { at++; goal = P.stops[at]; holdT = 0; } }
    // (Held at a stop with the camera landed and its last frame drawn: no frames until Next, Back or a step's button asks.)
    if (still || t !== t0 || t !== goal || !stepped || at < 0) raf = nextFrame(tick);
  }
  function finish(rewound) {
    over = true; raf = 0; runs--;
    stage.setCatheter(null);
    // (Played through step by step, BRTO and BATO keep their result framed: the slide's next move takes the camera from there.)
    if (shot && !rewound && stepped && P.holdEnd) stage.cathForget?.();
    else if (shot) stage.cathFocus('home', SHOT_MS, SHOT_CAM);   // alloc-rare: once, as the procedure ends
    onMark?.(null, null);
    onEnd?.({ done: !rewound, rewound });   // alloc-rare: once, as the procedure ends
  }
  // alloc-rare: once, as the procedure is stopped (an options record in, the end record out)
  function stop({ home = true } = {}) {
    if (over) return;
    cancelFrame(raf); raf = 0; over = true; runs--;
    stage.setCatheter(null);
    // alloc-rare: once, as the procedure is stopped
    if (home && shot) stage.cathFocus('home', SHOT_MS, SHOT_CAM);
    onMark?.(null, null);
    // alloc-rare: once, as the procedure is stopped
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
    // alloc-rare: only when the cards changed the room (a resize or a slide's change), not in a frame
    refit(ms = 700) { if (over || !shot) return false; stage.cathFocus(shot, ms, { steady: true }); return true; },   // (the cards moved: a slow frame at its start holds the glide back, stage animateVT)
    get running() { return !over; },
    get at() { return at; },
    get step() { return step; },
  };
}
