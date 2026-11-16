// The slide camera (16 Nov 2026 rewrite; Mohammad: "Go to root and fix it from the problem even if you had to destroy the app").
//
// Why it exists. Until now the camera had no owner: fourteen files could write the view, and one slide change set several of them off a few
// hundred ms apart (the slide's framing, the cards' refits as they came in and fitted, the stage's home fit, the vessel layer's home fit, a
// sheet). Each new ask bent the running glide (a blend), restarted it with the speed it had, or wrote the view outright. The one glide
// function had grown nine modes (plain, pull-back arc, vessel-following, blended refit, carried speed, drift, steady clock, late-start shift,
// view-switch retarget), and which one ran depended on timing. The replay test modelled the maths with made-up rectangles, so it never saw any
// of that. Each fix calmed one writer; the next deck showed another.
//
// The law here, for every slide's move over the plate:
//   1. One plan, made once, from where the view stands to the slide's final framing (planSlide). Nothing re-plans it.
//   2. One path: the even glide (cam-arc.js lerpInto): the zoom on a log scale and the pan tied to it, so one progress u moves both, the zoom
//      goes one way only, and every point of the figure travels a straight line on the screen. No pull-back, no vessel path, no carried speed.
//   3. One clock, frame by frame (createSlideClock): a frame moves the move on by what it took, never by more than STEP_MAX, so a stalled frame
//      pauses the move where it stood instead of landing the next part of it in one jump; the first frame draws the start.
//   4. One writer while it runs (createCamLock, checked by the stage's single view write, writeVT, and by animateVT): every other write of the
//      view is refused and every other glide asked for is held. A hand (pinch, drag, wheel, the zoom pill), a new slide, a turn of the device,
//      a change of view or a card's zoom lets go of it: those are the person's own moves. A held glide that would land somewhere else is the
//      one move after the landing, and the trace says so ("after"): that is a framing the plan got wrong, and the gate fails it.
//   5. Every move is recorded frame by frame (the trace), and judged by one judge (judgeSlideMove), the same in the unit gate and in the app
//      (window.pps.cameraGate), so what the tests check is what the device does.
import { lerpInto, viewGeom } from './cam-arc.js';
import { easeMove, slideMs } from './ease.js';

/** The most one frame moves a slide's move on, in ms (a 20 fps frame). A longer frame pauses the move for the rest of it. */
export const STEP_MAX = 50;
/** The least and most a slide's move takes, in ms (a third of a screen in 480 ms read as a swoop: Sites and causes 2 to 3). */
export const SLIDE_MIN_MS = 800, SLIDE_MAX_MS = 1400;
/** Within these a held glide is the landing itself (dropped): the zoom within 4%, the middle within 2% of a screen. */
export const NEAR_ZOOM = Math.log(1.04), NEAR_PAN = 0.02;
/** How long after a landing a near glide (the cards settling) is still dropped, in ms. */
export const SETTLE_MS = 2000;

/** Whether two views are within the near tolerance: zoom and the world point at the middle of the view (vb: { w, h, cx, cy }). */
export function nearView(a, b, vb) {
  if (!a || !b) return false;
  if (!(Math.abs(Math.log(a.k / b.k)) <= NEAR_ZOOM)) return false;
  const ga = viewGeom(a, vb), gb = viewGeom(b, vb);
  return Math.hypot(ga.cx - gb.cx, ga.cy - gb.cy) <= NEAR_PAN * Math.max(ga.w, gb.w);
}

/**
 * A slide's move, planned once: { from, to, ms, at(u, out) } (u: the eased progress, 0 to 1). `w`: the screen's width in view units (the
 * stage's screenW). `ms`: the time asked (reduced motion passes its own short one, and 0 is a jump).
 */
export function planSlide(from, to, w, ms = SLIDE_MAX_MS, reduced = false) {
  // alloc-rare: once per slide move (its plan)
  const f = { k: from.k, x: from.x, y: from.y }, t = { k: to.k, x: to.x, y: to.y };
  const span = reduced || ms <= 0 ? Math.max(0, ms) : Math.min(SLIDE_MAX_MS, Math.max(SLIDE_MIN_MS, slideMs(f, t, w)), Math.max(SLIDE_MIN_MS, ms));
  return { from: f, to: t, ms: Math.round(span), at: (u, out = { k: 0, x: 0, y: 0 }) => (u >= 1 ? Object.assign(out, t) : lerpInto(f, t, u, out)) };
}

/** The move's clock: tick(now) answers its raw progress 0..1. The first frame is 0; each frame after adds what it took, at most STEP_MAX. */
export function createSlideClock(ms) {
  // alloc-rare: once per slide move (its clock)
  let last = -1, at = 0;
  return {
    tick(now) { if (last >= 0) at += Math.min(Math.max(0, now - last), STEP_MAX); last = now; return ms > 0 ? Math.min(1, at / ms) : 1; },
    /** ms still to run, at the frame rate so far */
    left: () => Math.max(0, ms - at),
  };
}

/** The progress u at raw clock progress r: one curve for zoom and pan (the quintic: at rest at both ends). */
export const slideEase = easeMove;

/**
 * The lock. hold(plan, why) makes a run the camera's one writer; mine(run) says whether it still is; release(why) lets go. While a run holds
 * it, refuse() answers true for any write of the view that is not the run's own (as(), inside its step) or a dry solve's (dry(), which puts the
 * view back before anything is drawn), and hold() of a glide keeps the last one asked for (pend) to judge at the landing. A trace of the
 * last runs is kept for the judge (traces()).
 */
const FRAMES_MAX = 600;
// (A run's frames as rows [t, k, x, y], for the judge and the console.)
function rows(r) { const out = []; for (let i = 0; i < r.n; i++) out.push([r.buf[i * 4], r.buf[i * 4 + 1], r.buf[i * 4 + 2], r.buf[i * 4 + 3]]); return out; }
export function createCamLock({ now = () => performance.now(), keep = 24 } = {}) {
  let run = null, writing = 0, dry = 0, settle = null, pressAt = -1, stepsNext = null;
  const traces = [];
  const lock = {
    get run() { return run; },
    hold(plan, why = 'slide') {
      if (run) lock.release('new slide');
      const t = now();
      // alloc-rare: once per slide move (its record; the frames go into one kept buffer, read back as rows only by the judge)
      run = { plan, why, t0: t, press: pressAt >= 0 && t - pressAt < 15000 ? pressAt : null, buf: new Float64Array(FRAMES_MAX * 4), n: 0, get frames() { return rows(this); }, held: [], blocked: [], pend: null, after: null, end: '', raf: 0 };
      pressAt = -1; if (stepsNext) { run.steps = stepsNext; stepsNext = null; }
      traces.push(run); if (traces.length > keep) traces.shift();
      settle = null;
      return run;
    },
    mine: (r) => !!r && r === run,
    /** A slide change was asked for (Next, Back, a jump): the last run lets go, and the next run counts its start from now. */
    pressed() { lock.release('new slide'); pressAt = now(); settle = null; stepsNext = null; },
    /** The slide change's steps so far ([name, at, name, at ...], slide-txn.js), kept with the next run: [[step, ms from the press], ...]. */
    steps(trail) {
      if (!trail || pressAt < 0) { stepsNext = null; return; }
      if (trail.length > 1 && trail[1] < pressAt) pressAt = trail[1];   // (the change began before its run did: counted from its first step)
      // alloc-rare: once per slide move
      const out = [];
      for (let k = 0; k + 1 < trail.length; k += 2) out.push([trail[k], Math.round(trail[k + 1] - pressAt)]);
      stepsNext = out;
    },
    release(why) { settle = null; if (!run) return; if (!run.end) run.end = why; run = null; },
    /** The run has landed: its trace is closed and near asks are dropped for SETTLE_MS. Answers the held ask to run after it, or null. */
    land(r, vb) {
      if (r !== run) return null;
      r.end = 'landed'; run = null;
      settle = { to: r.plan.to, until: now() + SETTLE_MS, vb };
      const p = r.pend;
      if (p && !nearView(p.to, r.plan.to, vb)) { r.after = p.why || 'refit'; return p; }
      return null;
    },
    /** Whether a write of the view now would be another's while a run holds the camera. */
    foreign: () => !!run && !writing && !dry,
    /** A write of the view by the run itself. */
    as(fn) { writing++; try { return fn(); } finally { writing--; } },
    /** A write that is put back before anything is drawn (the labels solved at a glide's or a change's end). */
    dry(fn) { dry++; try { return fn(); } finally { dry--; } },
    /** Whether a write of the view is refused (and noted). `who`: a short name of the writer, when known. */
    refuse(who) {
      if (!run || writing || dry) return false;
      // alloc-rare: a refused write, which a slide's move should never meet (it is what the trace is for)
      if (run.blocked.length < 40) run.blocked.push({ t: now() - run.t0, who: who || callerOf() });
      return true;
    },
    /** Whether a glide asked for now is held (and kept to judge at the landing). Near asks are dropped for a while after a landing too. */
    holdAsk(to, ask, vb) {
      // alloc-rare: a glide asked while a slide's move runs (a refit, a home fit): a few a slide change at most
      if (run) { run.pend = { to: { k: to.k, x: to.x, y: to.y }, ...ask }; if (run.held.length < 40) run.held.push({ t: now() - run.t0, why: ask.why || '', near: nearView(to, run.plan.to, vb) }); return true; }
      if (settle && now() < settle.until && nearView(to, settle.to, vb)) return true;
      settle = null;
      return false;
    },
    /** One frame of the run: its time and view. */
    frame(r, t, v) { if (r.n >= FRAMES_MAX) return; const i = r.n++ * 4; r.buf[i] = t - r.t0; r.buf[i + 1] = v.k; r.buf[i + 2] = v.x; r.buf[i + 3] = v.y; },
    traces: (clear) => (clear ? traces.splice(0) : traces.slice()),
  };
  return lock;
}
/** The stage's one write of the view asks this first (stage.js writeVT): true lets the write through. A hand on the figure (handOn())
 *  lets go of the lock and writes; anyone else's write while a run holds the camera is refused and noted. */
export function lockedWrite(lock, handOn) {
  if (!lock.foreign()) return true;
  let hand = false;
  try { hand = !!handOn(); } catch { /* (the gestures are made after the camera) */ }
  if (hand) { lock.release('hand'); return true; }
  lock.refuse();
  return false;
}
// (Who wrote the view, for the trace: the first frame of the stack outside the camera's own files. Only on a refused write, which is rare.)
function callerOf() {
  const s = String(new Error().stack || '').split('\n').slice(2);
  const l = s.find((x) => !/src\/ui\/slide-cam\.js|writeVT|set vt|lockedWrite/.test(x)) || s[0] || '';
  const m = /([\w.-]+\.m?js):(\d+)/.exec(l);
  return m ? `${m[1]}:${m[2]}` : 'unknown';
}

/**
 * The judge of one recorded move (a trace from the lock, or the gate's own): a list of failures, empty when it passes.
 * vb: the stage's view units ({ w, h, cx, cy }), for where the world points lie. opt.lateMs: how late after the ask its first moving frame may
 * come; opt.gapMs: the longest frame; opt.press: when the person pressed (the trace's clock), for the start counted from the press.
 *   - path: the zoom goes one way, never past its ends; the world point at the landing's middle travels one straight line on the screen, always
 *     forward; the move lands exactly on its plan's end;
 *   - one move: no glide after the landing ("after"), no second plan;
 *   - clock: no frame moves the move on by more than STEP_MAX of its time; frames longer than gapMs are listed as stalls;
 *   - start: its first moving frame comes within lateMs of the ask (and of the press, when given).
 */
export function judgeSlideMove(tr, vb, opt = {}) {
  const fails = [], seen = new Set(), { plan, frames } = tr, lateMs = opt.lateMs ?? 120, gapMs = opt.gapMs ?? 120;
  const once = (kind, text) => { if (!seen.has(kind)) { seen.add(kind); fails.push(text); } };
  if (!plan || !frames?.length) return tr.end === 'jump' ? fails : ['no frames'];
  const { from, to, ms } = plan;
  const g1 = viewGeom(to, vb), T = [g1.cx, g1.cy];
  const scr = frames.map(([, k, x, y]) => [k * T[0] + x, k * T[1] + y]);
  const s0 = [from.k * T[0] + from.x, from.k * T[1] + from.y], s1 = [to.k * T[0] + to.x, to.k * T[1] + to.y];
  const dx = s1[0] - s0[0], dy = s1[1] - s0[1], L = Math.hypot(dx, dy);
  const zl = Math.log(to.k / from.k);
  let lastA = -1e-9, lastZ = -1e-9, maxOff = 0;
  for (let i = 0; i < frames.length; i++) {
    const k = frames[i][1], z = Math.abs(zl) > 1e-6 ? Math.log(k / from.k) / zl : 1;
    if (Math.abs(zl) > 1e-6) {
      if (z < lastZ - 1e-6) once('turn', `zoom turns back at frame ${i} (${(lastZ * 100).toFixed(1)}% to ${(z * 100).toFixed(1)}%)`);
      if (z < -1e-6 || z > 1 + 1e-6) once('over', `zoom overshoots at frame ${i} (${(z * 100).toFixed(1)}%)`);
      lastZ = Math.max(lastZ, z);
    } else if (Math.abs(Math.log(k / from.k)) > 1e-4) once('over', `zoom changes on a move at one zoom, at frame ${i} (${(k / from.k).toFixed(3)} times)`);
    if (L > 0.5) {
      const p = scr[i], a = ((p[0] - s0[0]) * dx + (p[1] - s0[1]) * dy) / (L * L), off = Math.abs((p[0] - s0[0]) * dy - (p[1] - s0[1]) * dx) / L;
      if (a < lastA - 1e-4) once('back', `the landing point goes back at frame ${i}`);
      lastA = Math.max(lastA, a); maxOff = Math.max(maxOff, off);
    }
  }
  if (L > 0.5 && maxOff > Math.max(0.5, 0.01 * L)) fails.push(`the landing point leaves its straight line by ${maxOff.toFixed(1)} px (${((100 * maxOff) / L).toFixed(1)}% of the move)`);
  const last = frames[frames.length - 1];
  if (tr.end === 'landed' && (Math.abs(last[1] - to.k) > 1e-6 * to.k || Math.abs(last[2] - to.x) > 1e-3 || Math.abs(last[3] - to.y) > 1e-3)) fails.push('does not land on its plan');
  if (tr.after) fails.push(`a second move after the landing (${tr.after})`);
  // (the clock: each frame's share of the move, against what STEP_MAX allows)
  for (let i = 1; i < frames.length; i++) {
    const dt = frames[i][0] - frames[i - 1][0];
    if (dt > gapMs) (tr.stalls ||= []).push(Math.round(dt));
  }
  if (ms > 0) {
    let prevR = 0;
    for (let i = 0; i < frames.length; i++) {
      const r = progressOf(frames[i], from, to, T);
      if (i > 0 && r - prevR > STEP_MAX / ms + 0.01) { fails.push(`frame ${i} jumps ${(100 * (r - prevR)).toFixed(1)}% of the move`); break; }
      prevR = r;
    }
  }
  const first = frames.find((f) => Math.abs(f[1] - from.k) > 1e-9 * from.k || Math.abs(f[2] - from.x) > 1e-6 || Math.abs(f[3] - from.y) > 1e-6);
  if (frames[0][0] > lateMs) fails.push(`starts ${Math.round(frames[0][0])} ms after it was asked`);
  const press = opt.press ?? tr.press;
  if (press != null && first && first[0] + (tr.t0 - press) > (opt.pressMs ?? 900)) fails.push(`starts ${Math.round(first[0] + tr.t0 - press)} ms after the press`);
  return fails;
}
// (How far along the move a frame is: the eased progress, read back from the zoom, or from the landing point's place on the line for a pure pan.)
function progressOf(f, from, to, T) {
  const zl = Math.log(to.k / from.k);
  const u = Math.abs(zl) > 1e-6 ? Math.log(f[1] / from.k) / zl : (() => {
    const s0 = [from.k * T[0] + from.x, from.k * T[1] + from.y], s1 = [to.k * T[0] + to.x, to.k * T[1] + to.y], p = [f[1] * T[0] + f[2], f[1] * T[1] + f[3]];
    const dx = s1[0] - s0[0], dy = s1[1] - s0[1], L2 = dx * dx + dy * dy;
    return L2 > 1e-9 ? ((p[0] - s0[0]) * dx + (p[1] - s0[1]) * dy) / L2 : 1;
  })();
  // (u is the eased progress; the judge counts the clock's raw progress, the ease inverted by bisection)
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (slideEase(m) < u) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
