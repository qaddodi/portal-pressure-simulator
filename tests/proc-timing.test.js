// One rhythm for the procedures (motion recommendations 7, 8, 9, 23): travel legs at a steady pace on a cruise profile and one speed,
// balloons on one table of times and one curve, shots timed by the camera, the HVPG trace on the model's beat and breath with a capped
// clock, and the catheter's fade-out driven by one value.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cruise, legMs, TRAVEL_SPEED, ROUTE_LEN, BALLOON_IN_MS, BALLOON_OUT_MS, T as HT, balloonAt, timeOfBalloon, pressureAt, venousAt, newWave, syncWave, cathFadeAlpha, A_WAVE_PHASE, BREATH_S } from '../src/ui/hvpg-clock.js';
import { PROCS, MEASURES, ENDO, procFrame, playProcedure } from '../src/ui/proc-anim.js';
import { procSpecs, rawRoute } from '../src/ui/proc-routes.js';
import { EUS_ROUTE, EUS_GLUE_ROUTE } from '../src/ui/eus-scope.js';
import { EDGE_PATH } from '../src/ui/anatomy.js';
import { easeMove, easeIn } from '../src/ui/motion.js';
import { raWave } from '../src/engine/physiology.js';

// ── 7: the cruise profile ──
test('cruise: a steady pace with soft starts and stops', () => {
  assert.equal(cruise(0), 0); assert.equal(cruise(1), 1); assert.equal(cruise(-1), 0); assert.equal(cruise(2), 1);
  let prev = 0;
  for (let i = 1; i <= 1000; i++) { const v = cruise(i / 1000); assert.ok(v >= prev - 1e-12, `never backwards at ${i}`); prev = v; }
  for (const t of [0.05, 0.13, 0.2, 0.37, 0.5]) assert.ok(Math.abs(cruise(t) + cruise(1 - t) - 1) < 1e-12, `symmetric at ${t}`);
  // The first fifth of the time covers 12.5% of the way (the cubic in-out covered 3%), and the peak speed is 1.25 times the mean (it was 3).
  assert.ok(Math.abs(cruise(0.2) - 0.125) < 1e-12);
  const h = 1e-5, speed = (t) => (cruise(t + h) - cruise(t - h)) / (2 * h);
  assert.ok(Math.abs(speed(0.5) - 1.25) < 1e-4, 'cruising at 1.25 times the mean');
  assert.ok(Math.abs(speed(0.3) - speed(0.7)) < 1e-6, 'steady between the ramps');
  // Speed and acceleration are continuous: no step where a ramp meets the cruise (slope of the speed across 0.2 and 0.8).
  for (const b of [0.2, 0.8]) assert.ok(Math.abs(speed(b - 1e-3) - speed(b + 1e-3)) < 5e-3, `speed continuous at ${b}`);
  assert.ok(speed(0.001) < 0.01 && speed(0.999) < 0.01, 'it starts and stops at rest');
});

test('the travel legs use it; balloons, the needle and the column keep an eased curve', () => {
  for (const k of ['tips', 'brto', 'bato']) {
    const T = PROCS[k].T, mid = (a, b, x) => a + (b - a) * x;
    const f = procFrame(k, mid(T.travel0, T.travel1, 0.2), { tract: [0.5, 0.8], rpv: [0.8, 0.9] });
    assert.ok(Math.abs(f.u - (k === 'tips' ? 0.5 : 1) * 0.125) < 1e-9, `${k}: a fifth of the way in the first fifth of the time`);
  }
  { const T = MEASURES.eus.T; assert.ok(Math.abs(procFrame('eus', T.travel0 + (T.travel1 - T.travel0) * 0.2).u - 0.125) < 1e-9, 'eus: the same'); }
  // (The glue's scope has a speed of its own per stretch, 10 Nov 2026: fast down the esophagus, slow for the turn; see tests/eus-glue.test.js.)
  { const T = ENDO.eusglue.T, u = (x) => procFrame('eusglue', T.travel0 + (T.travel1 - T.travel0) * x).u;
    assert.equal(u(0), 0); assert.ok(Math.abs(u(1) - 1) < 1e-9); assert.ok(u(0.2) > 0.2, 'quicker than a steady leg through the esophagus'); }
  // Balloons ease and hold on the one inflation curve.
  for (const k of ['tips', 'brto', 'bato']) {
    const T = PROCS[k].T;
    assert.equal(procFrame(k, T.inflate0 + (T.inflate1 - T.inflate0) * 0.25).balloon, easeMove(0.25), `${k}: balloon on easeMove`);
  }
  assert.equal(balloonAt(HT.inflate + (HT.wedge - HT.inflate) * 0.3), easeMove(0.3), 'the HVPG balloon too');
  for (const b of [0, 0.1, 0.5, 0.9, 1]) assert.ok(Math.abs(balloonAt(timeOfBalloon(b)) - b) < 1e-6);
});

// ── 8: the timing table ──
test('legMs: one speed, so a longer route takes longer and moves at the same pace', () => {
  assert.equal(TRAVEL_SPEED, 80);
  assert.equal(legMs(80), 1000); assert.equal(legMs(160), 2000); assert.equal(legMs(494), 6200);
  for (const len of [150, 286, 414, 728]) { const ms = legMs(len); assert.equal(ms % 100, 0); assert.ok(Math.abs(len / (ms / 1000) - TRAVEL_SPEED) < 0.7 * TRAVEL_SPEED / (ms / 100) + 1, `${len}`); }
  assert.ok(legMs(10) >= 1000, 'a very short leg is not a blink');
  assert.ok(legMs(728) > legMs(494) && legMs(494) > legMs(286));
});

// The routes as plain geometry from the figure's own outlines (the test and the stage lay them with the same builders).
function poly(d) {
  const toks = d.match(/[MLCZ]|-?\d+(?:\.\d+)?/g), pts = [];
  let i = 0, cur = [0, 0], cmd = 'M';
  const num = () => parseFloat(toks[i++]);
  while (i < toks.length) {
    if (/[MLCZ]/.test(toks[i])) cmd = toks[i++];
    if (cmd === 'Z') continue;
    if (cmd === 'M' || cmd === 'L') { cur = [num(), num()]; pts.push(cur); }
    else { const a = [num(), num()], b = [num(), num()], c = [num(), num()]; for (let k = 1; k <= 24; k++) { const t = k / 24, s = 1 - t; pts.push([s ** 3 * cur[0] + 3 * s * s * t * a[0] + 3 * s * t * t * b[0] + t ** 3 * c[0], s ** 3 * cur[1] + 3 * s * s * t * a[1] + 3 * s * t * t * b[1] + t ** 3 * c[1]]); } cur = c; }
  }
  return pts;
}
const geo = Object.fromEntries(Object.entries(EDGE_PATH).map(([k, d]) => [k, { cur: poly(d) }]));
const within = (got, want, tol, what) => assert.ok(Math.abs(got - want) <= want * tol, `${what}: ${got.toFixed(1)} against ${want}`);

test('ROUTE_LEN is what the routes measure on the figure’s outlines', () => {
  const S = procSpecs(geo, () => 1), travel = (spec) => { const r = rawRoute(spec, geo); return r.free - r.start; };
  const tips = rawRoute(S.tips, geo), tract0 = tips.spans.tract[0] - tips.start;
  within(tract0, ROUTE_LEN.tips, 0.03, 'TIPS to where the tract leaves the hepatic vein');
  // (over the wire: from there to a bit into the right portal vein, CATH_RPV of it, as procFrame's tip does)
  within(tips.spans.rpv[0] + (tips.spans.rpv[1] - tips.spans.rpv[0]) * 0.28 - tips.spans.tract[0], ROUTE_LEN.tipsOver, 0.03, 'TIPS over the wire');
  within(travel(S.brto), ROUTE_LEN.brto, 0.03, 'BRTO');
  within(travel(S.bato), ROUTE_LEN.bato, 0.03, 'BATO');
  within(travel(S.brtoC6), ROUTE_LEN.brtoC6, 0.03, 'BRTO into the splenorenal shunt');
  within(travel(EUS_ROUTE), ROUTE_LEN.eus, 0.03, 'EUS scope');
  within(travel(EUS_GLUE_ROUTE), ROUTE_LEN.eusglue, 0.03, 'EUS glue');
  // The HVPG catheter's: the neck, the SVC, the IVC, the right hepatic vein, to the tip's reading place (stage-cath.js cathRoute).
  const top = geo.SVC_RA.cur[0], pts = [[top[0] - 6, top[1] - 150], [top[0] - 2, top[1] - 60], top], marks = [0];
  const add = (id, rev) => { const P = rev ? geo[id].cur.slice().reverse() : geo[id].cur; marks.push(pts.length); for (let i = 1; i < P.length; i++) pts.push(P[i]); };
  add('SVC_RA', false); add('IVCS_RA', true);
  const ost = geo.RHV_IVC.cur.at(-1), I = geo.IVC_IS.cur.slice().reverse();
  for (let i = 1; i < I.length && I[i][1] < ost[1] - 4; i++) pts.push(I[i]);
  add('RHV_IVC', true); add('POST_R_RHV', true);
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = (i) => cum[Math.min(marks[i], cum.length - 1)], free = L(3) + (L(4) - L(3)) * 0.62;
  within(free - L(1) * 0.55, ROUTE_LEN.hvpg, 0.03, 'HVPG');
});

test('each procedure’s table is built from the timing table', () => {
  const D = (T, a, b) => T[b] - T[a];
  const tips = PROCS.tips.T;
  assert.equal(D(tips, 'travel0', 'travel1'), legMs(ROUTE_LEN.tips));
  assert.equal(D(tips, 'over0', 'over1'), legMs(ROUTE_LEN.tipsOver));
  for (const k of ['tips', 'brto', 'bato']) {
    const T = PROCS[k].T;
    assert.equal(D(T, 'inflate0', 'inflate1'), BALLOON_IN_MS, `${k}: one fill time`);
    assert.equal(k === 'tips' ? D(T, 'deflate0', 'deflate1') : D(T, 'deflate', 'back'), BALLOON_OUT_MS, `${k}: one let-down time`);
  }
  for (const k of ['brto', 'bato']) assert.equal(D(PROCS[k].T, 'travel0', 'travel1'), legMs(ROUTE_LEN[k]), `${k}: its leg`);
  assert.equal(D(MEASURES.eus.T, 'travel0', 'travel1'), legMs(ROUTE_LEN.eus));
  assert.equal(D(ENDO.eusglue.T, 'travel0', 'travel1'), 3500, 'the glue’s way in: 3.5 s, not the steady leg’s legMs(ROUTE_LEN.eusglue) = 6200 (his ask, 10 Nov 2026; faster through the esophagus)');
  assert.equal(D(HT, 'travel0', 'travel1'), legMs(ROUTE_LEN.hvpg));
  assert.equal(D(HT, 'inflate', 'wedge'), BALLOON_IN_MS, 'the HVPG’s fill');
  // The old and the new, ms: the legs stay close to what they were but for BATO’s long route.
  assert.deepEqual([legMs(ROUTE_LEN.tips), legMs(ROUTE_LEN.tipsOver), legMs(ROUTE_LEN.brto), legMs(ROUTE_LEN.bato), legMs(ROUTE_LEN.eus), legMs(ROUTE_LEN.eusglue), legMs(ROUTE_LEN.hvpg)], [4000, 2400, 6200, 9100, 5200, 6200, 3400]);
  // BRTO’s and BATO’s sequence after the way in is the one Mohammad has watched (7 Nov): the gaps are the same.
  assert.deepEqual(Object.fromEntries(Object.entries(PROCS.brto.T).map(([k, v]) => [k, v - PROCS.brto.T.travel1])), { travel0: -6200, travel1: 0, inflate0: 900, inflate1: 2500, fill0: 3700, fill1: 8700, apply: 10000, fillOut: 10000, deflate: 11200, back: 12400, end: 15500 });
  // Stops stay in order, each step's events inside it, whatever the legs.
  for (const [k, P] of [...Object.entries(PROCS), ['eus', MEASURES.eus], ['eusglue', ENDO.eusglue]]) {
    for (let i = 1; i < P.stops.length; i++) assert.ok(P.stops[i] > P.stops[i - 1], `${k}: stops in order`);
    // (The glue's scope stays parked at its last stop and fades out over end - back when the slide moves on: parkMs.)
    if (P.parkMs) assert.equal(P.stops.at(-1), P.T.back, `${k}: parked at its last stop, to fade in place`);
    else assert.equal(P.stops.at(-1), P.T.end, `${k}: ends with the catheter gone`);
    assert.ok(P.stops[0] > P.T.travel1, `${k}: the first step holds once the way in is over`);
  }
  // The EUS and glue sequences keep every gap they had (retimed, not rewritten).
  assert.equal(MEASURES.eus.T.end - MEASURES.eus.T.back, 4300); assert.equal(MEASURES.eus.T.aim0, MEASURES.eus.T.travel1 - 200);
  assert.equal(ENDO.eusglue.T.end - ENDO.eusglue.T.back, 800); assert.equal(ENDO.eusglue.T.aim0 - ENDO.eusglue.T.travel1, 400);
});

// A stand-in for the stage and the frame clock (the one tests/proc-anim.test.js uses): the options each shot was asked with.
function rig() {
  const q = [];
  let now = 0, gl = 0;
  globalThis.performance = { now: () => now };
  globalThis.requestAnimationFrame = (fn) => { q.push(fn); return q.length; };
  globalThis.cancelAnimationFrame = () => {};
  const moves = [];
  const stage = {
    setCatheter: () => {},
    cathFocus: (mode, ms, opt) => { moves.push({ mode, ms, opt }); gl = now + 1; return true; },
    gliding: () => now < gl,
  };
  const run = (ms, step = 16) => { for (let t = 0; t < ms; t += step) { now += step; const f = q.splice(0); for (const fn of f) fn(now); } };
  return { stage, run, moves };
}

test('shots with no times of their own are timed by the camera (scale), on an arc; BRTO’s, BATO’s and the glue’s keep theirs, straight', () => {
  const saved = { p: globalThis.performance, r: globalThis.requestAnimationFrame, c: globalThis.cancelAnimationFrame };
  try {
    for (const k of ['tips', 'eus', 'brto', 'bato', 'eusglue']) {
      const R = rig();
      playProcedure(R.stage, k, {});
      R.run(70000);
      assert.ok(R.moves.length >= 3, `${k}: shots`);
      const own = !!(PROCS[k] || MEASURES[k] || ENDO[k]).shotMs;
      for (const m of R.moves) {
        if (m.mode === 'home') assert.equal(m.opt.scale, true, `${k}: home by the camera’s time`);
        else assert.equal(!!m.opt.scale, !own, `${k} ${m.mode}: ${own ? 'its own time' : 'the camera’s time'}`);
      }
    }
    assert.deepEqual(PROCS.brto.shotMs, { way: 1200, tip: 800, fill: 300, work: 1200 }, 'BRTO and BATO keep their shot times (7 Nov)');
    assert.equal(PROCS.bato.shotMs, PROCS.brto.shotMs);
  } finally { Object.assign(globalThis, { performance: saved.p, requestAnimationFrame: saved.r, cancelAnimationFrame: saved.c }); }
});

// ── 6 (the procedure clock): Back or Next while a step is still moving slows and turns, it does not flip in one frame ──
test('Back while a step is still moving turns the procedure’s clock round over D_FLIP, not in one frame', () => {
  const saved = { p: globalThis.performance, r: globalThis.requestAnimationFrame, c: globalThis.cancelAnimationFrame };
  try {
    const R = rig(), ts = [], ends = [];
    const play = playProcedure(R.stage, 'tips', { stepped: true, onFrame: (f, t) => ts.push(t), onEnd: (e) => ends.push(e) });
    let backed = -1;
    for (let i = 0; i < 4000 && backed < 0; i++) { R.run(16); if (ts.length && ts.at(-1) > 1500) { play.back(); backed = ts.length; } }
    assert.ok(backed > 0, 'it was moving when Back came');
    R.run(20000);
    const d = ts.slice(backed - 3).map((t, i, a) => (i ? t - a[i - 1] : 0)).slice(1);
    let worst = 0; for (let i = 1; i < 12; i++) worst = Math.max(worst, Math.abs(d[i] - d[i - 1]));
    assert.ok(Math.min(...d) < 0 && d.some((x) => x > 10), 'it ran on a little, then back');
    assert.ok(worst < 12, `the step changes by at most ${worst.toFixed(1)} ms a frame through the turn (a flip would change it by 40)`);
    assert.deepEqual(ends, [{ done: false, rewound: true }]);
  } finally { Object.assign(globalThis, { performance: saved.p, requestAnimationFrame: saved.r, cancelAnimationFrame: saved.c }); }
});

// ── 9: the HVPG trace on the model’s clock ──
const v = { fhvp: 5, whvp: 17, hvpg: 12 };
const frame = (t, phase, extra = {}) => ({ t, phase, running: true, speed: 1, clock: 'hemo', resp: true, metrics: { hr: 60 }, ...extra });

test('the trace’s beat is the model’s: the a wave lands where the right atrium contracts, one beat a heart-rate period', () => {
  assert.equal(A_WAVE_PHASE, 0.88);
  // (the model’s own atrial wave peaks at phase 0.88)
  let best = 0, at = 0; for (let i = 0; i < 1000; i++) if (raWave(i / 1000) > best) { best = raWave(i / 1000); at = i / 1000; }
  assert.ok(Math.abs(at - A_WAVE_PHASE) < 0.01);
  const w = newWave();
  syncWave(w, frame(10, 0.88), 3000, 5000);
  // At the head the venous phase is 0: the a wave, whatever the procedure’s time is.
  const free = { fhvp: 5, whvp: 17 };
  const head = pressureAt(3000, free, w) - 5, a0 = venousAt(0) + Math.sin((10 / BREATH_S) * 2 * Math.PI) * 0.45;
  assert.ok(Math.abs(head - a0) < 1e-9, 'the head is on the model’s beat and breath');
  // One beat earlier (1 s at 60/min) the trace shows the same point of the beat, and a quarter beat earlier a different one.
  const prevBeat = pressureAt(2000, free, w) - 5;
  assert.ok(Math.abs(prevBeat - (venousAt(0) + Math.sin(((10 - 1) / BREATH_S) * 2 * Math.PI) * 0.45)) < 1e-9);
  assert.ok(Math.abs(pressureAt(2750, free, w) - pressureAt(3000, free, w)) > 0.05);
  // A faster heart packs more beats into the same stretch: the spacing follows the model’s rate.
  const w2 = newWave(); syncWave(w2, frame(10, 0.88, { metrics: { hr: 120 } }), 3000, 5000);
  assert.ok(Math.abs(pressureAt(2500, free, w2) - 5 - (venousAt(0) + Math.sin(((10 - 0.5) / BREATH_S) * 2 * Math.PI) * 0.45)) < 1e-9, 'a beat each half second at 120');
});

test('the breath is the model’s 4 s sine, and is off while the model does not breathe', () => {
  const w = newWave();
  syncWave(w, frame(1, 0.88), 1000, 0);
  const free = { fhvp: 5, whvp: 5 };
  // 1 s of a 4 s sine is its peak: head = venous a wave + the full swing.
  assert.ok(Math.abs(pressureAt(1000, free, w) - 5 - (venousAt(0) + 0.45)) < 1e-9);
  const dry = newWave(); syncWave(dry, frame(1, 0.88, { resp: false }), 1000, 0);
  assert.ok(Math.abs(pressureAt(1000, free, dry) - 5 - venousAt(0)) < 1e-9);
});

test('the waves are on model time: a rewind of the procedure’s clock never plays them backwards, and a held model lets them go on', () => {
  const free = { fhvp: 5, whvp: 5 }, w = newWave();
  // The model beats on (phase advancing at 60/min) while the procedure’s head jumps back by two seconds (Back, or a restart of the sweep).
  syncWave(w, frame(20, 0.5), 5000, 1000);
  const before = pressureAt(5000, free, w) - 5;
  syncWave(w, frame(20.1, 0.6), 3000, 1100);
  const after = pressureAt(3000, free, w) - 5;
  assert.ok(Math.abs(after - (venousAt(0.6 - A_WAVE_PHASE) + Math.sin((20.1 / BREATH_S) * 2 * Math.PI) * 0.45)) < 1e-9, 'the head is where the model is');
  assert.ok(Math.abs(before - (venousAt(0.5 - A_WAVE_PHASE) + Math.sin((20 / BREATH_S) * 2 * Math.PI) * 0.45)) < 1e-9);
  // Between two model frames the beat is carried on at the model’s rate, so a draw does not wait for the next frame.
  const f = frame(30, 0.2), w3 = newWave();
  syncWave(w3, f, 1000, 5000);
  const at0 = pressureAt(1000, free, w3);
  syncWave(w3, f, 1100, 5100);   // (the same frame, 100 ms later: the model is 0.1 s on, a tenth of a beat at 60/min)
  assert.ok(Math.abs(w3.cyc - 0.3) < 1e-9 && Math.abs(w3.m - 30.1) < 1e-9);
  assert.ok(Math.abs(pressureAt(1100, free, w3) - 5 - (venousAt(0.3 - A_WAVE_PHASE) + Math.sin((30.1 / BREATH_S) * 2 * Math.PI) * 0.45)) < 1e-9);
  void at0;
  // Held model (paused): the last alignment stays and the waves go on by the procedure’s clock, as they did.
  const w4 = newWave(); syncWave(w4, frame(5, 0.4), 1000, 0);
  const pausedFrame = frame(5, 0.4, { running: false });
  syncWave(w4, pausedFrame, 1500, 500);
  assert.equal(w4.t, 1000, 'not re-aligned while paused');
  assert.ok(Math.abs(pressureAt(1500, free, w4) - 5 - (venousAt(0.4 - A_WAVE_PHASE + 0.5) + Math.sin(((5 + 0.5) / BREATH_S) * 2 * Math.PI) * 0.45)) < 1e-9);
  // Long frames are not carried far: at most 250 ms of the model’s clock between two of its frames.
  const f5 = frame(5, 0), w5 = newWave(); syncWave(w5, f5, 0, 0); syncWave(w5, f5, 100, 9000);
  assert.ok(Math.abs(w5.m - 5.25) < 1e-9);
  // No model yet (or a test with none): the trace keeps its own beat and breath.
  assert.equal(pressureAt(1234, v), pressureAt(1234, v, newWave()));
  // The balloon still sets the level; the waves are damped by it as before.
  assert.ok(Math.abs(pressureAt(HT.wedge + 1000, v, w) - v.whvp) < 0.2 * 1.25 + 0.01);
});

// ── 23: one value for the catheter’s fade-out ──
test('the catheter’s fade-out is one value for the GPU draw and the SVG group', () => {
  assert.equal(cathFadeAlpha(0), 1); assert.equal(cathFadeAlpha(1), 0);
  let prev = 1;
  for (let i = 1; i <= 100; i++) { const a = cathFadeAlpha(i / 100); assert.ok(a <= prev + 1e-12); prev = a; }
  assert.equal(cathFadeAlpha(0.5), 1 - easeIn(0.5));
});
