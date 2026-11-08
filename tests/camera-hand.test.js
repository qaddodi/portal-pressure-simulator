// Camera and hand (motion recommendations, push E: items 11, 12 and 14). Pure pieces run as they are; the stage's glide and ride are made
// with stand-ins for their parts, and a clock the test moves.
import './dom-shim.js';   // (the stage's parts reach the menu glass and util, which touch the page as they load)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { camMs, lobuleMs, CAM_MS_MIN, CAM_MS_MAX, LOBULE_MS_MAX, springSlope, settleSlope, carryRate, carried, easeMove, createGlideTracker, CARRY_MAX } from '../src/ui/ease.js';
import { lerpVT } from '../src/ui/cam-arc.js';
import { VIEW } from '../src/ui/anatomy.js';
import { createWheelGlide, isPadWheel, WHEEL_GLIDE_MS } from '../src/ui/wheel-glide.js';
import { createCardZoom, reverseMs, reverseSlope, SHUT_MS, ZOOM_MS } from '../src/ui/card-zoom.js';

const { createGlide } = await import('../src/ui/stage-glide.js');
const { createRide } = await import('../src/ui/stage-ride.js');


// ── Item 12: glide times by reach ──────────────────────────────────────────────────────────────────────────────────────────────────
test('camMs times a glide by its reach: 480 ms to half a screen, in proportion beyond, at most the ceiling', () => {
  const w = 1000, A = { k: 1, x: 0, y: 0 };
  assert.equal(camMs(A, { k: 1, x: -50, y: 0 }, w), CAM_MS_MIN, 'a nudge');
  assert.equal(camMs(A, { k: 1, x: -500, y: 0 }, w), CAM_MS_MIN, 'half a screen');
  assert.equal(camMs(A, { k: 1, x: -750, y: 0 }, w), 720, 'three quarters of a screen');
  assert.equal(camMs(A, { k: 1, x: -3000, y: 0 }, w), CAM_MS_MAX, 'across the figure');
  assert.equal(camMs(A, { k: 2, x: 0, y: 0 }, w), CAM_MS_MIN, 'a doubling counts as half a screen');
});

test('the lobule has its own reach-timed version with a ceiling near 1500 ms', () => {
  const w = 800, A = { k: 1, x: 0, y: 0 };
  assert.equal(LOBULE_MS_MAX, 1500);
  assert.equal(lobuleMs(A, { k: 1, x: -20, y: 0 }, w), CAM_MS_MIN, 'a step between two nearby zones is the least');
  assert.equal(lobuleMs(A, { k: 2, x: -100, y: 0 }, w), camMs(A, { k: 2, x: -100, y: 0 }, w), 'under the stage ceiling it is the same time');
  const far = { k: 5, x: -2400, y: -900 };
  assert.ok(camMs(A, far, w) === CAM_MS_MAX && lobuleMs(A, far, w) > CAM_MS_MAX, 'a long dive takes longer than the stage\'s ceiling');
  assert.equal(lobuleMs(A, { k: 20, x: -9000, y: 0 }, w), LOBULE_MS_MAX, 'and never longer than 1500');
  let last = 0;
  for (let x = 0; x <= 4000; x += 100) { const m = lobuleMs(A, { k: 1, x: -x, y: 0 }, w); assert.ok(m >= last, `grows with distance (${x})`); last = m; }
});

// ── Item 11: spring-back carries the hand's speed ─────────────────────────────────────────────────────────────────────────────────────
test('a pan let go while still coming back starts its spring-back at the finger\'s speed along the way (settleSlope); one going away starts from rest', () => {
  const from = { k: 2, x: 100, y: 0 }, to = { k: 2, x: 0, y: 0 }, w = 1000, ms = 480;
  const homeward = { dlogk: 0, x: -0.1, y: 0 }, away = { dlogk: 0, x: 0.1, y: 0 }, across = { dlogk: 0, x: 0, y: 0.1 };
  assert.equal(springSlope(homeward, from, to, w, ms), settleSlope(0.1, 100, ms, CARRY_MAX));
  assert.ok(Math.abs(springSlope(homeward, from, to, w, ms) - 0.1 * ms / 100) < 1e-12);
  assert.equal(springSlope(away, from, to, w, ms), 0);
  assert.equal(springSlope(across, from, to, w, ms), 0);
  assert.equal(springSlope(null, from, to, w, ms), 0);
  assert.equal(springSlope({ dlogk: 0, x: -10, y: 0 }, from, to, w, ms), CARRY_MAX, 'a fast one is capped where carried() caps it');
  // (the same as carryRate for a pure pan, so one glide carries a pan over a glide and a pan over a spring-back alike)
  assert.ok(Math.abs(springSlope(homeward, from, to, w, ms) - carryRate(homeward, from, to, w) * ms) < 1e-9);
});

test('a pinch let go while still coming back in zoom starts its spring-back at the pinch\'s rate (carryRate), and the progress starts with that slope', () => {
  const from = { k: 6.8, x: -300, y: -100 }, to = { k: 6, x: -250, y: -80 }, w = 1000, ms = 600;
  // the pinch was closing at 10 % a 100 ms, toward the limit
  const v = { dlogk: Math.log(0.9) / 100, x: 0, y: 0 };
  const c = springSlope(v, from, to, w, ms);
  assert.ok(c > 0, `carried ${c}`);
  const h = 1e-5, p = (t) => carried(easeMove(t), t, c);
  assert.ok(Math.abs((p(h) - p(0)) / h - Math.min(c, CARRY_MAX)) < 1e-3, 'the spring-back leaves at that slope');
  assert.equal(p(1), 1, 'and arrives at rest on 1');
  assert.equal(springSlope({ dlogk: -v.dlogk, x: 0, y: 0 }, from, to, w, ms), 0, 'zooming further out while it should come in: nothing to carry');
});

test('the hand\'s speed sample is the one tracker, older samples are let go after their age', () => {
  const t = createGlideTracker();
  t.sample({ k: 1, x: 0, y: 0 }, 1000); t.sample({ k: 1, x: 10, y: 0 }, 1010);
  assert.deepEqual({ dlogk: t.take(1030).dlogk, x: t.take(1030).x }, { dlogk: 0, x: 1 });
  assert.equal(t.take(1100), null, 'older than 80 ms');
  assert.ok(t.take(1100, 300), 'a trackpad pinch\'s spring-back asks for longer');
  t.begin(); t.sample({ k: 1, x: 99, y: 0 }, 1500);
  assert.equal(t.take(1500, 300), null, 'after begin() one sample has no speed of its own, and the old one is too old');
});

// ── Item 11: the mouse-wheel notch glide ───────────────────────────────────────────────────────────────────────────────────────────
// A frame loop the test steps: ask(cb) -> id, cancel(id), run(now).
function loop() {
  let n = 0, pending = new Map();
  return {
    ask: (cb) => { pending.set(++n, cb); return n; },
    cancel: (id) => pending.delete(id),
    run(now) { const cbs = [...pending.values()]; pending = new Map(); for (const cb of cbs) cb(now); },
    get waiting() { return pending.size; },
  };
}
function rig(ms = WHEEL_GLIDE_MS) {
  const f = loop(), calls = [];
  const wg = createWheelGlide({ ask: f.ask, cancel: f.cancel, apply: (d, x, y) => calls.push({ d, x, y }), ms });
  return { f, wg, calls, total: () => calls.reduce((a, c) => a + c.d, 0) };
}

test('a notch glides to its full step over WHEEL_GLIDE_MS, on the camera curve, and lands exactly', () => {
  assert.ok(WHEEL_GLIDE_MS >= 80 && WHEEL_GLIDE_MS <= 120);
  const { f, wg, calls, total } = rig();
  wg.push(0.15, 300, 200, 1000);
  assert.ok(wg.active && Math.abs(wg.left() - 0.15) < 1e-12);
  let t = 1000, partial = 0;
  while (f.waiting && t < 1500) { t += 16; f.run(t); if (t === 1048) partial = total(); }
  assert.ok(t - 1000 <= WHEEL_GLIDE_MS + 16, `done by ${t - 1000} ms`);
  assert.ok(Math.abs(total() - 0.15) < 1e-12, 'the whole step, no more');
  assert.ok(partial > 0.03 && partial < 0.11, `half way through the time it is about half way (${partial.toFixed(3)} of 0.15)`);
  assert.ok(calls.every((c) => c.d >= 0 && c.x === 300 && c.y === 200), 'always forward, about the pointer');
  assert.ok(calls.length >= 5, 'several frames, not one step');
  assert.ok(!wg.active && wg.left() === 0);
  // zoom out is the same, backwards
  const o = rig(); o.wg.push(-0.15, 1, 1, 0); for (let t2 = 16; o.f.waiting; t2 += 16) o.f.run(t2);
  assert.ok(Math.abs(o.total() + 0.15) < 1e-12);
});

test('notches that come while the last still moves run together: the speed carries and the sum is the sum of the notches', () => {
  const { f, wg, calls, total } = rig();
  const dt = 40, notches = [0.15, 0.15, 0.15, 0.15];
  let t = 0, i = 0;
  wg.push(notches[i++], 10, 10, t);
  const speeds = [];
  while (f.waiting && t < 2000) {
    t += 16; f.run(t);
    if (i < notches.length && t >= i * dt) { const before = total(); wg.push(notches[i++], 10 + i, 10, t); void before; }
    if (calls.length) speeds.push(calls[calls.length - 1].d / 16);
  }
  assert.ok(Math.abs(total() - 0.6) < 1e-9, `all four notches arrive (${total()})`);
  assert.ok(calls.every((c) => c.d >= -1e-12), 'never backwards on the way');
  // run together: no frame stands still between the first notch and the last landing (a stepped zoom would)
  const mid = calls.slice(2, calls.length - 2);
  assert.ok(mid.every((c) => c.d > 0), 'no stop between notches');
  // faster than a lone notch would have been: the lone one peaks at 1.875 × its mean
  const lonePeak = (0.15 / WHEEL_GLIDE_MS) * 1.875;
  assert.ok(Math.max(...speeds) > lonePeak, `a run of notches goes faster (${Math.max(...speeds).toFixed(5)} > ${lonePeak.toFixed(5)})`);
  assert.equal(calls.at(-1).x, 14, 'about the pointer of the newest notch');
});

test('a notch the other way turns the zoom round: the targets add, so it comes back by what went in, with no frame jumping', () => {
  const { f, wg, calls, total } = rig();
  wg.push(0.15, 0, 0, 0); f.run(16); f.run(32); f.run(48);
  const at = total();
  assert.ok(at > 0.02 && at < 0.15);
  wg.push(-0.15, 0, 0, 56);
  for (let t = 64; f.waiting && t < 1000; t += 16) f.run(t);
  assert.ok(Math.abs(total()) < 1e-9, 'out by what went in: the sum of the two notches');
  assert.ok(calls.every((c) => Math.abs(c.d) < 0.08), 'no frame takes a big step');
  assert.ok(!wg.active);
});

test('a cancel stops the glide where it is and owes nothing', () => {
  const { f, wg, total } = rig();
  wg.push(0.15, 0, 0, 0); f.run(16); f.run(32);
  const got = total();
  wg.cancel();
  assert.equal(f.waiting, 0);
  assert.equal(wg.left(), 0);
  f.run(48);
  assert.equal(total(), got);
});

test('a trackpad stays direct: its pinch (ctrlKey), its scroll and its gesture events are not notches; a wheel\'s notch is', () => {
  // Chrome and Safari give a trackpad's legacy wheelDeltaY as exactly three times its delta; a notch is 100 with 120; Firefox's notch is 3 lines.
  assert.equal(isPadWheel({ deltaMode: 0, deltaX: 0, deltaY: 4, wheelDeltaY: -12 }), true, 'trackpad scroll');
  assert.equal(isPadWheel({ deltaMode: 0, deltaX: 3, deltaY: 100, wheelDeltaY: -120 }), true, 'a sideways delta');
  assert.equal(isPadWheel({ deltaMode: 0, deltaX: 0, deltaY: 1.5 }), true, 'a synthesized pinch (Safari gesture events): no wheelDeltaY');
  assert.equal(isPadWheel({ deltaMode: 0, deltaX: 0, deltaY: 100, wheelDeltaY: -120 }), false, 'a notch');
  assert.equal(isPadWheel({ deltaMode: 1, deltaX: 0, deltaY: 3, wheelDeltaY: -9 }), false, 'a notch in lines (Firefox)');
});

// ── Item 14 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// followAt, run against a stand-in stage.
function rideRig() {
  const live = { following: true, followScene: false, follow0: null, follow1: null, vt: { k: 1, x: 0, y: 0 }, cath: {}, sites: {}, scan: {}, dprobePaint() {}, CTM: null };
  const scene = [];
  const st = { applyVT() {}, dpr: {}, labelSettleSoon() {}, refreshCTM() {}, sameView: () => false, sceneSet: (...a) => scene.push(a), sceneStart() {}, sitesPaint() {}, stageBox: () => ({ sx: 0, sy: 0, sw: 1000, sh: 600 }), updateLabels() {}, vCanvas: null, vbBox: { x: 0, y: 0, width: 1000, height: 600 }, wrap: { classList: { toggle() {} } } };
  return { ride: createRide(st, live), live, scene };
}
test('the card-room follow runs the zoom on a log scale, the pan in step with it', () => {
  const { ride, live } = rideRig();
  live.follow0 = { k: 1, x: 0, y: 0 }; live.follow1 = { k: 2, x: -300, y: -120 };
  ride.followAt(0.5);
  assert.ok(Math.abs(live.vt.k - Math.SQRT2) < 1e-12, `half way is the geometric mean (${live.vt.k})`);
  const ref = lerpVT(live.follow0, live.follow1, 0.5);
  assert.deepEqual([live.vt.k, live.vt.x, live.vt.y], [ref.k, ref.x, ref.y], 'exactly the glides\' own lerpVT');
  // the zoom doubles in two equal ratios: even on screen
  const ks = [0.25, 0.5, 0.75].map((f) => { ride.followAt(f); return live.vt.k; });
  assert.ok(Math.abs(ks[1] / ks[0] - ks[2] / ks[1]) < 1e-12);
  ride.followAt(1);
  assert.deepEqual(live.vt, { k: 2, x: -300, y: -120 }, 'and lands exactly');
  ride.followAt(0);
  assert.equal(live.vt.k, 1);
});
test('the scene-camera follow scales by the log-space zoom too', () => {
  const { ride, live, scene } = rideRig();
  live.followScene = true; live.follow0 = { k: 1, x: 0, y: 0 }; live.follow1 = { k: 4, x: -200, y: 0 };
  ride.followAt(0.5);
  assert.ok(Math.abs(scene.at(-1)[0] - 2) < 1e-12, `S at half way is 2, not 2.5 (${scene.at(-1)[0]})`);
});

// An arc glide retargeted to a far framing carries the old speed. animateVT is run with a clock the test moves and stand-ins for its parts.
function glideRig({ carry = true } = {}) {
  let clock = 0, frames = [];
  const realNow = performance.now;
  const live = { aiming: false, vtAnim: 0, arcRun: null, drifting: false, vtTarget: null, vt: { k: 3, x: -1000, y: -600 }, vtGliding: false, cath: {}, sites: {}, scan: {}, camMove: false, dprLet() {}, dprobePaint() {}, gestureOn: () => false, following: false, rideCTM: null };
  const tr = createGlideTracker();
  const vtTrack = carry ? tr : { take: () => null, begin() {}, sample() {} };
  const st = {
    CIRC_C: [0, 0], applyVT() {}, arcRoom: () => ({ vb: { w: 1000, h: 600, cx: 500, cy: 300 }, wMax: 1000 }), camSettle() {}, camSettleIdle() {}, circVB: () => [0, 0, 1000, 600], dpr: {}, driftEnd() {},
    glideXfStart() {}, glideXfStep() {}, logMove() {}, nextFrame: (cb) => { frames.push(cb); return frames.length; }, refreshCTM() {}, rideStep() {}, safeInsets: () => ({ l: 0, t: 0, r: 0, b: 0 }),
    sameView: (a, b) => a && b && Math.abs(a.k - b.k) < 0.001 && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1, sitesPaint() {}, svg: {}, vbCenter: () => [500, 300], vtTrack,
  };
  const g = createGlide(st, live);
  return {
    live, g,
    now: (t) => { clock = t; performance.now = () => clock; },
    run(t) { clock = t; const cbs = frames; frames = []; for (const cb of cbs) cb(t); },
    done() { performance.now = realNow; },
  };
}
test('an arc glide retargeted to a far framing starts at the speed it has instead of from rest (item 14)', () => {
  // (B first: the arc pulls back toward the middle of the figure; the retarget C goes on in that direction, so there is speed to carry.)
  const B = { k: 3, x: -3500, y: -600 }, C = { k: 1.2, x: 800, y: 300 };
  const firstStep = (carry) => {
    const r = glideRig({ carry });
    try {
      r.now(0); r.g.animateVT(B, 900, { arc: true, scale: true });
      assert.ok(r.live.arcRun, 'the first glide is an arc');
      for (let t = 16; t <= 320; t += 16) r.run(t);
      assert.ok(r.live.vtGliding, 'still moving');
      const before = { ...r.live.vt };
      r.now(320); r.g.animateVT(C, 900, { arc: true, scale: true });
      assert.ok(r.live.arcRun, 'the retarget is an arc of its own, not a blend (the two framings do not overlap)');
      r.run(336);
      const after = r.live.vt;
      return Math.hypot(after.x - before.x, after.y - before.y, (Math.log(after.k / before.k)) * 300);
    } finally { r.done(); }
  };
  const withCarry = firstStep(true), fromRest = firstStep(false);
  assert.ok(fromRest < 3, `from rest the first frame hardly moves (${fromRest.toFixed(2)})`);
  assert.ok(withCarry > fromRest * 2, `with the old speed it moves at once (${withCarry.toFixed(2)} against ${fromRest.toFixed(2)})`);
});

test('a carried arc that a refit blends away is read by its eased progress alone, without a jump', () => {
  const r = glideRig();
  try {
    const B = { k: 3, x: -3500, y: -600 }, C = { k: 1.2, x: 800, y: 300 };
    r.now(0); r.g.animateVT(B, 900, { arc: true, scale: true });
    for (let t = 16; t <= 320; t += 16) r.run(t);
    r.now(320); r.g.animateVT(C, 900, { arc: true, scale: true });
    const arc = r.live.arcRun;
    for (let t = 336; t <= 448; t += 16) r.run(t);
    const at = { ...r.live.vt }, e = (448 - arc.t0) / arc.ms;
    assert.ok(Number.isFinite(at.k) && Number.isFinite(at.x));
    // the older arc, asked for its view by the eased progress alone (as a blend does), is where the glide stands
    const u = easeMove(e), v = arc.at(u);
    assert.ok(Math.abs(v.k - at.k) < 1e-6 && Math.abs(v.x - at.x) < 1e-3 && Math.abs(v.y - at.y) < 1e-3, 'u alone gives the same view');
  } finally { r.done(); }
});

test('a card zoom turned back mid-way takes the share of the time that is left, and starts on the speed it carries (520 and 440 stay)', () => {
  assert.equal(ZOOM_MS, 520); assert.equal(SHUT_MS, 440);
  assert.equal(reverseMs(SHUT_MS, 2, 2), SHUT_MS, 'shut from the top: the whole time');
  assert.equal(reverseMs(SHUT_MS, 1.5, 2), 220, 'half way: half the time');
  assert.equal(reverseMs(SHUT_MS, 1.01, 2), Math.round(SHUT_MS * 0.35), 'barely out: not under 0.35 of it');
  assert.equal(reverseMs(SHUT_MS, 3, 2), SHUT_MS, 'never more than the whole');
  // a zoom going out when it is shut has no speed toward rest to carry; one going toward the target has
  const cur = { dx: 100, dy: 0, s: 1.6 }, outwards = { from: { dx: 0, dy: 0, s: 1 }, to: { dx: 200, dy: 0, s: 2 }, ms: 520, t0: 0 };
  const rest = { dx: 0, dy: 0, s: 1 };
  assert.equal(reverseSlope(outwards, 150, cur, rest, 300), 0, 'in then shut: going away from rest');
  const closing = { from: { dx: 200, dy: 0, s: 2 }, to: { dx: 0, dy: 0, s: 1 }, ms: 440, t0: 0 };
  const m0 = reverseSlope(closing, 200, { dx: 100, dy: 0, s: 1.5 }, rest, 300);
  assert.ok(m0 > 0 && m0 <= CARRY_MAX, `a glide already heading for rest keeps its pace (${m0})`);
  assert.equal(reverseSlope(null, 0, cur, rest, 300), 0);
  assert.equal(reverseSlope({ ...outwards, t0: null }, 0, cur, rest, 300), 0, 'not started');
});

// The controller itself, in a frame loop of 16 ms steps: stand-in pieces that keep the transform written to them.
function zoomRig() {
  const q = []; let t = 0;
  const raf = (cb) => { q.push(cb); return q.length; };
  const run = (ms) => { for (const end = t + ms; q.length && t < end;) { t += 16; const cbs = q.splice(0); for (const cb of cbs) cb(t); } };
  const mk = (rect) => ({ rect, style: { transform: 'none', transformOrigin: '' }, dataset: {}, classList: { add() {}, remove() {}, contains: () => false }, getBoundingClientRect() { return { ...this.rect, right: this.rect.left + this.rect.width, bottom: this.rect.top + this.rect.height }; } });
  const card = mk({ left: 40, top: 300, width: 420, height: 380 }), scrim = mk({ left: 0, top: 0, width: 1440, height: 900 }), app = mk({ left: 0, top: 0, width: 1440, height: 900 });
  const z = createCardZoom({ card, along: [], scrim, app, raf, area: () => ({ left: 0, top: 0, width: 1440, height: 900 }), scale: () => 1, reduce: () => false });
  const scale = () => { const m = /scale\(([\d.]+)\)/.exec(card.style.transform); return m ? +m[1] : 1; };
  return { z, run, scale, now: () => t };
}
test('a zoom shut part-way glides back in the share of SHUT_MS it got, and leaves its outward speed gently, not with a jump', () => {
  const old = globalThis.getComputedStyle; globalThis.getComputedStyle = (e) => e.style;
  try {
    const r = zoomRig();
    assert.equal(r.z.open(), true);
    r.run(200);   // part-way in
    const top = r.scale();
    assert.ok(top > 1.05, `part-way (${top})`);
    const plan = r.z.plan(), full = plan ? plan.s : 2;
    const t0 = r.now();
    r.z.close();
    const seen = [];
    for (let i = 0; i < 40; i++) { r.run(16); seen.push(r.scale()); if (seen.at(-1) === 1) break; }
    const took = r.now() - t0;
    const want = reverseMs(SHUT_MS, top, full);
    assert.ok(took <= want + 48 && took >= want - 48, `back in the share left: ${took} ms, wanted about ${want} (of ${SHUT_MS})`);
    assert.ok(seen.every((v, i) => i === 0 || v <= seen[i - 1] + 1e-9), 'only ever back');
    // the first frame of the way back barely moves (it starts at rest on the Hermite, not at the arrive curve's fast start)
    const first = top - seen[1], mean = (top - 1) / (want / 16);
    assert.ok(first < mean * 0.5, `first moving frame ${first.toFixed(4)} against a mean of ${mean.toFixed(4)} a frame`);
  } finally { globalThis.getComputedStyle = old; }
});
test('a zoom shut from rest, the ordinary way back, is still SHUT_MS on the arrive curve', () => {
  const old = globalThis.getComputedStyle; globalThis.getComputedStyle = (e) => e.style;
  try {
    const r = zoomRig();
    r.z.open(); r.run(ZOOM_MS + 200);
    const top = r.scale(), t0 = r.now();
    r.z.close();
    const seen = [];
    for (let i = 0; i < 60; i++) { r.run(16); seen.push(r.scale()); if (seen.at(-1) === 1) break; }
    const took = r.now() - t0;
    assert.ok(Math.abs(took - SHUT_MS) <= 48, `took ${took} ms`);
    // the arrive curve is quick off the mark: the first frame moves well more than the mean
    assert.ok(top - seen[1] > ((top - 1) / (SHUT_MS / 16)) * 1.5, 'quick off the mark, as it was');
  } finally { globalThis.getComputedStyle = old; }
});

test('a glide asked for the camera ceiling with `scale` takes the time its reach needs (Fit, the zoom pill, a reveal, a spring-back)', () => {
  for (const [to, ms] of [[{ k: 1, x: 30, y: 0 }, CAM_MS_MIN], [{ k: 2, x: -400, y: -100 }, null], [{ k: 6, x: -4000, y: -2500 }, CAM_MS_MAX]]) {
    const r = glideRig();
    try {
      r.live.vt = { k: 1, x: 0, y: 0 }; r.now(0);
      const from = { ...r.live.vt };
      r.g.animateVT(to, CAM_MS_MAX, { scale: true });
      assert.equal(r.live.vtMs, ms ?? camMs(from, to, VIEW.w), `${JSON.stringify(to)}`);
    } finally { r.done(); }
  }
});

test('a spring-back begun with the hand\'s speed (opt.v0) leaves at that speed, and at rest without it', () => {
  const first = (v0) => {
    const r = glideRig();
    try {
      r.live.vt = { k: 6.8, x: -300, y: -100 }; r.now(0);
      const to = { k: 6, x: -250, y: -80 }, from = { ...r.live.vt };
      // the pinch was closing toward the limit at 20 % in 100 ms
      r.g.animateVT(to, CAM_MS_MAX, { scale: true, v0: v0 ? { dlogk: Math.log(0.8) / 100, x: 0.2, y: 0.08 } : undefined });
      r.run(16);
      return Math.abs(Math.log(r.live.vt.k / from.k));
    } finally { r.done(); }
  };
  assert.ok(first(true) > first(false) * 3, 'carried');
  assert.equal(first(false) < 0.002, true, 'from rest it hardly moves in the first frame');
});
