// Every slide-to-slide camera move, replayed (15 Nov 2026, Mohammad: "make sure the camera movement is not funky, like going around in circles
// while zooming in or out or panning in slides"). Node only: each deck's neighbouring framings are worked out the way the stage frames a region
// (a box fitted into the room the cards leave, centred there), on the three screens, and the path the camera takes between them is the app's own
// (cam-arc.js camPath and lerpVT, ease.js easeMove and carried, and stage-glide.js animateVT itself on a clock the test moves), judged on the screen:
//   - the framing the slide lands on never goes away from where it will be and back (no reversal), never curls (turning of its screen path), and
//     comes in on one straight line;
//   - the zoom never overshoots the two framings (a plain move) or goes out once and back in (a pull-back), and a pull-back never goes wider than
//     the whole figure's fit;
//   - no frame jumps: the step between two frames stays within a small share of the whole move.
// (16 Nov 2026, Mohammad, Sites and causes 2 to 3: "I THOUGHT WE FIXED THIS AT THE ORIGIN". The path was one straight glide; what read as
// funky was its clock: 480 ms for a third of a screen, and a 1 s frame stall near its end that landed the last fifth in one jump. This file
// judged only the path's shape, on the decks' raw slide lists (no outline, a visual with no camera breaking the chain), never the glide as it
// runs. It now also walks every deck as presented, both ways, on four screens, through animateVT with a stall, a late first frame and the
// cards' refits injected: one move per slide, every point of the figure on a straight line, no frame jumping, the slide's time.)
// The window the paths are worked out in is the stage's real view box (cam-arc.js camWindow), never the 1400 x 1000 plate the arcs and the glide's
// times read until 15 Nov 2026, which put every width, overlap test and pull-back out by the plate's ratio (differently on a phone and a Mac).
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS, REGIONS, withOverview } from '../src/ui/decks.js';
import { oneLadder } from '../src/ui/teach-extras.js';
import { instrumentOf } from '../src/ui/slide-instrument.js';
import { STALL_MAX } from '../src/ui/glide-clock.js';
import { VB_ANAT, VB_CIRC, VIEW } from '../src/ui/anatomy.js';
import { camPath, camWindow, geomView, lerpVT, viewGeom, blendPaths } from '../src/ui/cam-arc.js';
import { isCamOn, regionBox } from '../src/ui/cam-frame.js';
import { CAM_CARRY_MAX, CAM_MS_FAR, CAM_MS_MAX, SLIDE_MS_MIN, camMs, carriedCam, carried, easeMove, createGlideTracker, slideMs } from '../src/ui/ease.js';
import { diveAlong, diveMapInto } from '../src/ui/dive-map.js';
import { viewBoxAt, viewXfCameraInto, viewXfRetarget } from '../src/ui/view-xf.js';

const { createGlide } = await import('../src/ui/stage-glide.js');
const { createRide } = await import('../src/ui/stage-ride.js');
const BOX = { x: VB_ANAT[0], y: VB_ANAT[1], width: VB_ANAT[2], height: VB_ANAT[3] };
// (the svg's box and the rectangle the cards leave for the figure, in px: a phone stands the cards under the figure, an iPad and a Mac to its side)
const SCREENS = {
  iPhone: { sw: 390, sh: 520, free: { l: 8, t: 60, r: 382, b: 330 } },
  iPad: { sw: 1024, sh: 700, free: { l: 360, t: 60, r: 1004, b: 680 } },
  Mac: { sw: 1440, sh: 800, free: { l: 500, t: 70, r: 1420, b: 770 } },
  'iPhone on its side': { sw: 844, sh: 340, free: { l: 330, t: 20, r: 830, b: 330 } },
};
const FRAMES = 120;

// The framing of a box on a screen, as the stage's boxVT does it: the largest zoom that fits the box in the free rectangle (0.6 to kMax), its middle at that rectangle's middle.
function framing(box, scr, kMax = 3.2) {
  const s0 = Math.min(scr.sw / BOX.width, scr.sh / BOX.height), f = scr.free, vb = camWindow(scr.sw, scr.sh, BOX, f);
  const k = Math.max(0.6, Math.min(kMax, Math.min((f.r - f.l) / s0 / (box[2] - box[0]), (f.b - f.t) / s0 / (box[3] - box[1]))));
  return { k, x: vb.cx - (k * (box[0] + box[2])) / 2, y: vb.cy - (k * (box[1] + box[3])) / 2 };
}
const FIT_BOX = [VB_ANAT[0], VB_ANAT[1], VB_ANAT[0] + VB_ANAT[2], VB_ANAT[1] + VB_ANAT[3]];

/** The screen path of the world point `t` under a path: [[x, y], ...] at FRAMES + 1 eased steps. */
function screenPath(at, t) {
  const out = [];
  for (let i = 0; i <= FRAMES; i++) { const v = at(easeMove(i / FRAMES)); out.push([v.k * t[0] + v.x, v.k * t[1] + v.y]); }
  return out;
}
/** Reversals (a step turning back on the one before) and the total turn (radians) of a polyline. */
function bend(pts) {
  let rev = 0, turn = 0, lv = null;
  for (let i = 1; i < pts.length; i++) {
    const v = [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]], m = Math.hypot(...v);
    if (m < 1e-9) continue;
    if (lv) { const c = (v[0] * lv[0] + v[1] * lv[1]) / (m * Math.hypot(...lv)); if (c < -1e-6) rev++; turn += Math.acos(Math.max(-1, Math.min(1, c))); }
    lv = v;
  }
  return { rev, turn };
}

/** The invariants of one move (see the top of the file). `arc`: the path pulls back. Throws with `what` in the message. */
function judge(at, from, to, vb, cap, arc, what) {
  const g1 = viewGeom(to, vb), T = [g1.cx, g1.cy];
  const sp = screenPath(at, T), { rev, turn } = bend(sp);
  assert.equal(rev, 0, `${what}: the landing framing goes away and back`);
  assert.ok(turn < 0.02, `${what}: the landing framing curls on the screen (${turn.toFixed(3)} rad)`);
  // zoom: plain, between the two; a pull-back, out once then in, never wider than the cap
  const ks = [];
  for (let i = 0; i <= FRAMES; i++) ks.push(at(easeMove(i / FRAMES)).k);
  const lo = Math.min(from.k, to.k) * (1 - 1e-6), hi = Math.max(from.k, to.k) * (1 + 1e-6);
  let turns = 0, dir = 0;
  for (let i = 1; i < ks.length; i++) { const d = Math.sign(ks[i] - ks[i - 1]); if (Math.abs(ks[i] - ks[i - 1]) > 1e-9 * ks[i]) { if (dir && d !== dir) turns++; dir = d; } }
  if (arc) {
    assert.ok(turns <= 1, `${what}: the pull-back zooms out and in more than once (${turns} turns)`);
    assert.ok(vb.w / Math.min(...ks) <= cap * 1.001, `${what}: the pull-back goes wider than the whole figure`);
  } else {
    assert.equal(turns, 0, `${what}: the zoom turns back`);
    for (const k of ks) assert.ok(k >= lo && k <= hi, `${what}: the zoom overshoots the two framings (${k})`);
  }
  // no frame jumps: the zoom (log) and the landing framing's screen step stay small against the whole move
  const span = Math.max(1, Math.hypot(sp[0][0] - sp[FRAMES][0], sp[0][1] - sp[FRAMES][1]));
  for (let i = 1; i < sp.length; i++) assert.ok(Math.hypot(sp[i][0] - sp[i - 1][0], sp[i][1] - sp[i - 1][1]) <= 0.1 * span + 1e-6, `${what}: frame ${i} jumps`);
  for (let i = 1; i < ks.length; i++) assert.ok(Math.abs(Math.log(ks[i] / ks[i - 1])) < 0.12, `${what}: frame ${i} zooms in a jump`);
}

// Every slide-to-slide move of every deck as it is presented (withOverview: the outline first; the presenter's own slide mapping), Next and
// Back: the framing the camera stands at on leaving a slide (its time-lapse's end, lapse.cam, when it has one) to the framing it frames on
// arriving (going forward a time-lapse opens on its own camera; going back, on where its days end). A visual with no camera leaves the camera
// where it is, so the move after it starts from the framing before it. A circuit slide, a lobule or sinusoid framing and a catheter slide are
// other moves (view-xf.js, the lobule's own camera, the catheter's choreography): they break the chain.
const SHOWN = (d) => withOverview(d).slides.map(oneLadder).map(instrumentOf);
function frameOf(s, cam) {
  if (isCamOn(cam)) cam = cam.near;
  if (typeof cam === 'string' && /^(lobule|sinusoid)/.test(cam)) return null;
  const fit = !cam || cam === 'fit', box = fit ? FIT_BOX : regionBox(cam, REGIONS);
  return box ? { box, kMax: fit ? 1.15 : s.kMax || 3.2 } : null;
}
function moves() {
  const out = [];
  for (const deck of Object.values(DECKS)) {
    let prev = null, n = 0;   // (prev: the slide the camera last framed, and where it left it)
    SHOWN(deck).forEach((s, i) => {
      n++;
      if (s.view === 'circuit' || s.cath) { prev = null; return; }
      const cam = s.visual ? s.cam || null : s.cam || 'fit';
      if (!cam) return;   // (a visual over the figure with no camera: the camera stays)
      const lc = !s.visual && s.lapse?.cam ? s.lapse.cam : null, arrive = frameOf(s, cam), arriveBack = lc ? frameOf(s, lc) : arrive, leave = arriveBack;
      if (!arrive || !leave) { prev = null; return; }
      const at = `${deck.id} ${i + 1}`;
      if (prev) {
        out.push({ from: prev.leave, to: arrive, at: `${prev.at} to ${at}` });
        out.push({ from: leave, to: prev.arriveBack, back: true, at: `${at} back to ${prev.at}` });   // (16 Nov 2026, Carvedilol going back from 6 to 5)
      }
      prev = { leave, arriveBack, at };
    });
    assert.ok(n > 0, `${deck.id} has slides`);
  }
  return out;
}

test('the stage window is the real view box: a phone, a Mac, and the circuit', () => {
  const ph = camWindow(390, 520, BOX), mac = camWindow(1440, 800, BOX);
  assert.equal(Math.round(ph.w), 820, 'a phone is as wide as the view box (it meets it by its width)');
  assert.ok(ph.h > BOX.height, 'and shows more above and below');
  assert.ok(Math.abs(mac.w / mac.h - 1440 / 800) < 1e-9 && Math.abs(mac.h - BOX.height) < 1e-6, 'a Mac is as tall as the view box and shows more to the sides');
  assert.deepEqual([ph.cx, ph.cy], [BOX.x + BOX.width / 2, BOX.y + BOX.height / 2], 'centred on the view box');
  const f = camWindow(1000, 700, BOX, { l: 400, t: 0, r: 1000, b: 700 }), s0 = Math.min(1000 / BOX.width, 700 / BOX.height);
  assert.ok(Math.abs(f.cx - (BOX.x + BOX.width / 2 + 200 / s0)) < 1e-9 && f.cy === BOX.y + BOX.height / 2, 'its middle moves to the middle of the room the cards leave');
  const c = camWindow(900, 600, { x: VB_CIRC[0], y: VB_CIRC[1], width: VB_CIRC[2], height: VB_CIRC[3] });
  assert.ok(Math.abs(c.w - VB_CIRC[2]) < 1e-6 && c.w !== VIEW.w, 'the circuit has its own box');
  assert.ok(Math.abs(camWindow(390, 520, BOX).w - VIEW.w) > 100, 'not the 1400 x 1000 plate the arcs read until 15 Nov 2026');
});


test('the stage\'s arc room and screen width are its real view box\'s, the free room\'s middle, and the circuit\'s own', () => {
  const box = { ...BOX }, live = { fitKept: 1.1, morphTarget: 0, lastFree: null };
  const ride = createRide({ stageBox: () => ({ sw: 390, sh: 520 }), vbBox: box }, live);
  const room = ride.arcRoom(null);
  assert.equal(Math.round(room.vb.w), 820, 'a phone shows the anatomy 820 wide, not the old plate\'s 1400');
  assert.ok(Math.abs(room.wMax - room.vb.w / 1.1) < 1e-9, 'the widest pull-back is the whole figure\'s fit');
  assert.equal(Math.round(ride.screenW()), 820, 'and a screen is that many units wide for a glide\'s time');
  const free = ride.arcRoom({ l: 8, t: 60, r: 382, b: 330 });
  assert.ok(free.vb.cy < room.vb.cy, 'the path travels the middle of the room above the cards, not of the whole screen');
  Object.assign(box, { x: VB_CIRC[0], y: VB_CIRC[1], width: VB_CIRC[2], height: VB_CIRC[3] }); live.morphTarget = 1;
  const circ = ride.arcRoom(null);
  assert.ok(Math.abs(circ.vb.w - 390 / Math.min(390 / VB_CIRC[2], 520 / VB_CIRC[3])) < 1e-9 && circ.wMax === circ.vb.w, 'the circuit has its own box, and its whole is the box');
  assert.equal(createRide({ stageBox: () => ({ sw: 0, sh: 0 }), vbBox: box }, live).arcRoom(), null, 'no box yet: no room');
});

for (const [name, scr] of Object.entries(SCREENS)) {
  test(`${name}: every slide-to-slide move of every deck lands straight, in zoom without overshoot, and never reverses`, () => {
    const vb = camWindow(scr.sw, scr.sh, BOX, scr.free), fit = framing(FIT_BOX, scr, 1.15), wMax = vb.w / fit.k;
    let n = 0, arcs = 0;
    for (const { from, to, at } of moves()) {
      const a = framing(from.box, scr, from.kMax), b = framing(to.box, scr, to.kMax), p = camPath(a, b, vb, wMax);
      if (p.arc) arcs++;
      // (the glide's own progress: eased by the quintic; each path asked at the eased value, as animateVT's step does)
      judge((u) => p.at(u), a, b, vb, Math.max(wMax, vb.w / a.k, vb.w / b.k), p.arc, `${name}, ${at}`);
      n++;
    }
    assert.ok(n > 600, `the decks have their moves, forward and back (${n})`);
    assert.ok(arcs <= n);
  });

  // The glide as it runs: animateVT on the test's clock, asked as the presenter's camera() asks a slide's framing (1500 ms, an arc allowed,
  // scaled, the slide's own move), with what a real slide change throws at it: a late first frame, the cards' entry making a 1 s frame, and
  // the cards' refits (a near one while it runs and just after it lands, a real change while it runs).
  test(`${name}: every deck's slide moves run as one straight glide, through a stall, a late first frame and the cards' refits`, () => {
    const vb = camWindow(scr.sw, scr.sh, BOX, scr.free), fit = framing(FIT_BOX, scr, 1.15), wMax = vb.w / fit.k;
    let n = 0, worstStep = 0, stalls = 0;
    const list = moves();
    list.forEach(({ from, to, at }, j) => {
      const a = framing(from.box, scr, from.kMax), b = framing(to.box, scr, to.kMax);
      if (Math.abs(a.k - b.k) < 1e-3 * a.k && Math.hypot(a.x - b.x, a.y - b.y) < 1) return;   // (the same framing: no move)
      const r = rig(a, { vb, wMax });
      try {
        // the slide's points: the middle of the landing framing and four more across the figure, as the viewer sees them
        const g1 = viewGeom(b, vb), pts = [[g1.cx, g1.cy], [400, 200], [1000, 250], [500, 800], [950, 750]], track = pts.map(() => []), ks = [];
        const rec = () => { const v = r.live.vt; pts.forEach((P, i) => track[i].push([v.k * P[0] + v.x, v.k * P[1] + v.y])); ks.push(v.k); };
        r.now(0); rec();
        r.g.animateVT(b, 1500, { arc: true, scale: true, slide: true });
        const plan = r.moves[0], ms = plan?.ms;
        assert.ok(plan && plan.slide, `${name}, ${at}: the slide's move is asked`);
        assert.ok(ms >= SLIDE_MS_MIN && ms <= Math.round(CAM_MS_FAR * 1.3), `${name}, ${at}: a slide's glide takes ${ms} ms, never under ${SLIDE_MS_MIN}`);
        // a late first frame (the move's own layout pass), then 16 ms frames, a 1 s stall somewhere in the move (seeded by the move), a near refit
        // half way, and a near refit 300 ms after the landing
        const stallAt = 0.15 + ((j * 0.37) % 0.75), late = 120 + (j % 4) * 60;
        let t = late, stalled = false, refit = false;
        for (let guard = 0; guard < 2000 && (r.live.vtGliding || guard === 0); guard++) {
          const u = Math.max(0, (t - late) / ms);
          if (!stalled && u >= stallAt) { stalled = true; t += 1000; stalls++; }
          r.run(t); rec();
          if (!refit && u >= 0.5) { refit = true; r.now(t); r.g.animateVT(nudge(b, vb, 0.012), 400, { steady: true }); }
          t += 16;
        }
        assert.ok(!r.live.vtGliding, `${name}, ${at}: it lands`);
        r.now(t + 300); r.g.animateVT(nudge(b, vb, -0.015), 400, { steady: true });
        for (let k = 0; k < 60 && r.live.vtGliding; k++) { t += 16; r.run(t + 300); rec(); }
        const glides = r.moves.filter((m) => m.kind === 'glide');
        assert.equal(glides.length, 1, `${name}, ${at}: one move, not ${glides.length} (${r.moves.map((m) => m.kind).join(', ')})`);
        assert.ok(Math.abs(r.live.vt.k - b.k) < 1e-9 && Math.abs(r.live.vt.x - b.x) < 1e-6 && Math.abs(r.live.vt.y - b.y) < 1e-6, `${name}, ${at}: on the slide's framing`);
        // every point on one straight line, never back along it (the plain glide; a pull-back keeps its middle on the line, judged above)
        if (!plan.arc) track.forEach((P, i) => { const w = wander(P); assert.ok(w.dev < 0.5 + 0.002 * w.L && w.back < 0.5, `${name}, ${at}: point ${i} is off its line by ${w.dev.toFixed(1)} of ${w.L.toFixed(0)}, back ${w.back.toFixed(1)}`); });
        // the zoom one way (or, on a pull-back, out once and in)
        let turns = 0, dir = 0;
        for (let i = 1; i < ks.length; i++) { const d = Math.sign(ks[i] - ks[i - 1]); if (Math.abs(ks[i] - ks[i - 1]) > 1e-9 * ks[i]) { if (dir && d !== dir) turns++; dir = d; } }
        assert.ok(turns <= (plan.arc ? 1 : 0), `${name}, ${at}: the zoom turns back ${turns} times`);
        // no frame jumps, the stall's and the late first frame's included: a frame moves the landing point no more than STALL_MAX of the
        // quintic's top speed (1.875 times its mean) allows, times the zoom's own lead (zf)
        const L = track[0], span = Math.max(1, Math.hypot(L[0][0] - L[L.length - 1][0], L[0][1] - L[L.length - 1][1])), zr = b.k / a.k, zf = Math.abs(zr - 1) < 1e-9 ? 1 : (Math.abs(Math.log(zr)) * Math.max(zr, 1)) / Math.abs(zr - 1), cap = (1.875 * STALL_MAX * zf) / ms;   // (zf: the plain glide's screen pace runs ahead of its eased progress by up to this, the zoom on a log scale)
        for (let i = 1; i < L.length; i++) { const st = Math.hypot(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]) / span; worstStep = Math.max(worstStep, st); assert.ok(st <= cap + 0.002, `${name}, ${at}: frame ${i} jumps ${(st * 100).toFixed(1)} % of the move (at most ${(cap * 100).toFixed(1)})`); }
        assert.ok(Math.hypot(L[1][0] - L[0][0], L[1][1] - L[0][1]) / span < 0.02, `${name}, ${at}: the late first frame shows the start`);
        n++;
      } finally { r.done(); }
    });
    assert.ok(n > 200 && stalls === n, `the walk runs the decks' moves (${n})`);
    assert.ok(worstStep > 0, 'and measures them');
  });
}

/** The view b moved by `f` of a screen sideways (a refit to cards that settled a little). */
function nudge(b, vb, f) { return { k: b.k, x: b.x + f * vb.w, y: b.y }; }

test('a far move pulls back once and lands straight, on every screen', () => {
  let seed = 3;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  let arcs = 0;
  for (const [name, scr] of Object.entries(SCREENS)) {
    const vb = camWindow(scr.sw, scr.sh, BOX, scr.free), wMax = vb.w * 1.05;
    for (let i = 0; i < 400; i++) {
      const a = geomView({ cx: 300 + rnd() * 820, cy: rnd() * 920, w: vb.w / (1 + rnd() * 2.5) }, vb), b = geomView({ cx: 300 + rnd() * 820, cy: rnd() * 920, w: vb.w / (1 + rnd() * 2.5) }, vb);
      const p = camPath(a, b, vb, wMax);
      if (p.arc) arcs++;
      judge((u) => p.at(u), a, b, vb, Math.max(wMax, vb.w / a.k, vb.w / b.k), p.arc, `${name} #${i}`);
    }
  }
  assert.ok(arcs > 100, `the sweep reaches the pull-back (${arcs})`);
});

test('a refit while a move runs takes the move over without a jump or a turn back', () => {
  // (the cards settle half way through a pull-back: the same arc from where it began, now to the new framing, blended in from the moment of the refit)
  const scr = SCREENS.Mac, vb = camWindow(scr.sw, scr.sh, BOX, scr.free), wMax = vb.w * 1.05;
  const a = geomView({ cx: 380, cy: 120, w: vb.w / 3 }, vb), b = geomView({ cx: 1000, cy: 800, w: vb.w / 3 }, vb), b2 = geomView({ cx: 1030, cy: 780, w: vb.w / 2.9 }, vb);
  const first = camPath(a, b, vb, wMax);
  assert.ok(first.arc);
  for (const uR of [0.2, 0.4, 0.6, 0.8]) {
    const second = camPath(a, b2, vb, wMax), at = blendPaths((u) => first.at(u), (u) => second.at(u), uR, vb);
    const here = at(uR), was = first.at(uR);
    assert.ok(Math.abs(here.k - was.k) < 1e-9 && Math.abs(here.x - was.x) < 1e-6 && Math.abs(here.y - was.y) < 1e-6, `the refit at ${uR} starts where the move stands`);
    const end = at(1);
    assert.ok(Math.abs(end.k - b2.k) < 1e-9 && Math.abs(end.x - b2.x) < 1e-6, 'and lands on the new framing');
    const g1 = viewGeom(b2, vb), sp = [];
    for (let i = 0; i <= FRAMES; i++) { const v = at(easeMove(i / FRAMES)); sp.push([v.k * g1.cx + v.x, v.k * g1.cy + v.y]); }
    assert.equal(bend(sp).rev, 0, `the refit at ${uR}: the landing framing goes away and back`);
  }
});

test('a plain move with the speed of one it took over from stays ahead of the start and never passes the end', () => {
  const a = { k: 3, x: -3000, y: -600 }, b = { k: 1.2, x: 600, y: 300 };
  for (const c of [0.1, 0.4, 0.8]) {
    let last = 0;
    for (let i = 0; i <= 400; i++) { const t = i / 400, p = carried(easeMove(t), t, c); assert.ok(p >= last - 1e-12 && p <= 1, `c=${c} t=${t}`); last = p; }
    const p = (u) => lerpVT(a, b, carried(easeMove(u), u, c));
    assert.deepEqual(p(1), lerpVT(a, b, 1));
  }
});

test('a glide\'s time counts the screen\'s real width: a phone\'s pan reaches further than the plate said', () => {
  const ph = camWindow(390, 520, BOX), a = { k: 2, x: 0, y: 0 }, b = { k: 2, x: -500, y: 0 };
  assert.ok(camMs(a, b, ph.w) > camMs(a, b, VIEW.w), 'against the real 820 a 500 unit pan is more screens than against 1400');
});

// ── The zoom into a sinusoid ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The map the zoom into a sinusoid had until 15 Nov 2026: the similarity (p to c, turned by rot, grown by Z) taken g of the way about its fixed point q. */
function oldDive(p, c, rot, Z, g, x) {
  const m = Z * Math.cos(rot), n = Z * Math.sin(rot), bx = c[0] - (m * p[0] - n * p[1]), by = c[1] - (n * p[0] + m * p[1]), a = 1 - m, b = n, det = a * a + b * b;
  const q = [(a * bx - b * by) / det, (b * bx + a * by) / det], zg = Z ** g, rg = rot * g, d = [x[0] - q[0], x[1] - q[1]];
  return [q[0] + zg * (Math.cos(rg) * d[0] - Math.sin(rg) * d[1]), q[1] + zg * (Math.sin(rg) * d[0] + Math.cos(rg) * d[1])];
}
const diveAt = (p, c, rot, Z, g, x) => {
  const M = diveMapInto(p, c, rot, Z, g, {}), ct = Math.cos(M.rot), st = Math.sin(M.rot), d = [x[0] - M.ox, x[1] - M.oy];
  return [M.ox + M.tx + M.Z * (ct * d[0] - st * d[1]), M.oy + M.ty + M.Z * (st * d[0] + ct * d[1])];
};

test('the zoom into a sinusoid carries the sinusoid straight to where the view draws it, however far it has to turn', () => {
  let seed = 5;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  let oldCurled = 0;
  for (let i = 0; i < 600; i++) {
    const p = [rnd() * 400, rnd() * 600], c = [100 + rnd() * 300, 100 + rnd() * 400], rot = (rnd() * 2 - 1) * Math.PI, Z = 1.5 * Math.exp(rnd() * Math.log(400 / 1.5));
    const path = [], was = [];
    for (let j = 0; j <= FRAMES; j++) { const g = easeMove(j / FRAMES); path.push(diveAt(p, c, rot, Z, g, p)); was.push(oldDive(p, c, rot, Z, g, p)); }
    const { rev, turn } = bend(path);
    assert.equal(rev, 0, `#${i}: the sinusoid goes away and back`);
    assert.ok(turn < 0.02, `#${i}: the sinusoid curls on its way (${turn.toFixed(3)} rad)`);
    if (bend(was).turn > 0.3) oldCurled++;
    assert.ok(Math.hypot(path[0][0] - p[0], path[0][1] - p[1]) < 1e-9 && Math.hypot(path[FRAMES][0] - c[0], path[FRAMES][1] - c[1]) < 1e-6, `#${i}: from where it was to where the view draws it`);
    // every other point of the lobule: the same picture at the two ends as the zoom has always had (so the landing, and a zoom out's start, are unchanged)
    for (const x of [[0, 0], [300, 100], [50, 500]]) {
      for (const g of [0, 1]) { const a = diveAt(p, c, rot, Z, g, x), b = oldDive(p, c, rot, Z, g, x); assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6 * Math.max(1, Z), `#${i}: the end at g=${g} moved`); }
    }
    // the growth is the zoom's own: the lobule's scale at g is Z**g, the turn rot * g
    const M = diveMapInto(p, c, rot, Z, 0.4, {});
    assert.ok(Math.abs(M.Z - Z ** 0.4) < 1e-9 && Math.abs(M.rot - rot * 0.4) < 1e-12);
  }
  assert.ok(oldCurled > 100, `the sweep reaches the turns the fixed point's spiral curled on (${oldCurled})`);
  // with no turn it is the zoom about one fixed point, exactly as before
  const p = [120, 80], c = [300, 260], Z = 12;
  for (const g of [0.1, 0.5, 0.9]) for (const x of [[0, 0], [200, 50]]) { const a = diveAt(p, c, 0, Z, g, x), b = oldDive(p, c, 1e-12, Z, g, x); assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6, `no turn, g=${g}`); }
  assert.equal(diveAlong(Z, 0), 0); assert.equal(diveAlong(Z, 1), 1);
});


// ── The change between Anatomy and Circuit ──────────────────────────────────────────────────────────────────────────────────────────────────

const VB_CIRC_R = [VB_CIRC[0] + VB_CIRC[2] / 2 - VB_CIRC[3] / 2, VB_CIRC[1] + VB_CIRC[3] / 2 - VB_CIRC[2] / 2, VB_CIRC[3], VB_CIRC[2]];
/** How far a path wanders: the most it is off the chord from its first to its last point, and the most it goes back along it (px). */
function wander(pts) {
  const a = pts[0], b = pts[pts.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  let dev = 0, back = 0, top = 0;
  for (const q of pts) {
    dev = Math.max(dev, Math.abs((q[0] - a[0]) * (b[1] - a[1]) - (q[1] - a[1]) * (b[0] - a[0])) / L);
    const f = ((q[0] - a[0]) * (b[0] - a[0]) + (q[1] - a[1]) * (b[1] - a[1])) / L; back = Math.max(back, top - f); top = Math.max(top, f);
  }
  return { dev, back, L };
}
const POINTS = [[700, 400], [500, 200], [900, 700], [400, 800], [1100, 300]];   // (places in the view box's units: the screen path of each is what the viewer sees)

for (const [name, sw, sh, endBox, rr] of [['iPhone (upright circuit)', 390, 520, VB_CIRC_R, 1], ['Mac', 1440, 800, VB_CIRC, 0], ['iPad', 1024, 700, VB_CIRC, 0]]) {
  test(`${name}: through the change between the views every place on the figure keeps to a straight path, though the view box moves under the camera`, () => {
    const cases = [[{ k: 1, x: 0, y: 0 }, { k: 1, x: 0, y: 0 }], [{ k: 2.5, x: -900, y: -300 }, { k: 1, x: 0, y: 0 }], [{ k: 1, x: 0, y: 0 }, { k: 2.2, x: -700, y: -900 }], [{ k: 2.5, x: -900, y: -300 }, { k: 2, x: -300, y: -100 }], [{ k: 1.6, x: -200, y: -500 }, { k: 2.4, x: -1000, y: -150 }]];
    let oldWorst = 0;
    for (const [from, to] of cases) {
      for (const [p0, back] of [[0, false], [0.35, true]]) {
        const x = { from: { ...from }, to: { ...to }, vb0: [...VB_ANAT] }, vb1 = viewBoxAt(1, rr, VB_ANAT, VB_CIRC, VB_CIRC_R, [0, 0, 0, 0]), out = { k: 0, x: 0, y: 0 };
        if (back) {   // (a framing asked for part way through: the camera sets out again from where it stands, in the view box it stands in)
          const vbAt = viewBoxAt(easeMove(p0), rr, VB_ANAT, VB_CIRC, VB_CIRC_R, [0, 0, 0, 0]);
          const start = viewXfCameraInto(x, easeMove(p0), vbAt, vb1, sw, sh, { k: 0, x: 0, y: 0 });
          assert.ok(viewXfRetarget(x, start, to, easeMove(p0), false, vbAt));
        }
        const base = back ? easeMove(p0) : 0, paths = POINTS.map(() => []), olds = POINTS.map(() => []);
        for (let i = 0; i <= FRAMES; i++) {
          const t = easeMove(i / FRAMES);
          if (t < base) continue;
          const vbNow = viewBoxAt(t, rr, VB_ANAT, VB_CIRC, VB_CIRC_R, [0, 0, 0, 0]), s = Math.min(sw / vbNow[2], sh / vbNow[3]), u = base >= 1 ? 1 : (t - base) / (1 - base);
          const v = viewXfCameraInto(x, u, vbNow, vb1, sw, sh, out), old = lerpVT(x.from, x.to, u);
          POINTS.forEach((X, j) => {
            paths[j].push([s * (v.k * X[0] + v.x - vbNow[0]) + (sw - vbNow[2] * s) / 2, s * (v.k * X[1] + v.y - vbNow[1]) + (sh - vbNow[3] * s) / 2]);
            olds[j].push([s * (old.k * X[0] + old.x - vbNow[0]) + (sw - vbNow[2] * s) / 2, s * (old.k * X[1] + old.y - vbNow[1]) + (sh - vbNow[3] * s) / 2]);
          });
          if (u >= 1) { assert.ok(Math.abs(v.k - to.k) < 1e-9 && Math.abs(v.x - to.x) < 1e-6 && Math.abs(v.y - to.y) < 1e-6, 'it lands on the framing asked for'); }
        }
        paths.forEach((pts, j) => { const w = wander(pts); assert.ok(w.dev < 0.5 + 0.002 * w.L && w.back < 0.5, `${name} ${JSON.stringify(from)}>${JSON.stringify(to)} p0 ${p0} point ${j}: off its line by ${w.dev.toFixed(1)} px, back ${w.back.toFixed(1)} px of ${w.L.toFixed(0)}`); });
        olds.forEach((pts) => { const w = wander(pts); oldWorst = Math.max(oldWorst, w.dev / Math.max(w.L, 1)); });
      }
    }
    assert.ok(oldWorst > 0.02, `the test sees what the unit-for-unit lerp did (${oldWorst.toFixed(3)} of the travel)`);
  });
}

test('with no change in the view box the camera through a change is the plain even glide, as it was', () => {
  const x = { from: { k: 1.4, x: -120, y: 60 }, to: { k: 2.2, x: -500, y: -90 }, vb0: [...VB_ANAT] }, vb = [...VB_ANAT];
  for (const u of [0, 0.25, 0.7, 1]) {
    const a = viewXfCameraInto(x, u, vb, vb, 390, 520, { k: 0, x: 0, y: 0 }), b = lerpVT(x.from, x.to, u);
    assert.ok(Math.abs(a.k - b.k) < 1e-9 && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6, `u=${u}`);
  }
  const no = { from: { k: 1, x: 0, y: 0 }, to: { k: 2, x: -100, y: 0 } };
  assert.deepEqual(viewXfCameraInto(no, 0.5, vb, vb, 390, 520, { k: 0, x: 0, y: 0 }), lerpVT(no.from, no.to, 0.5), 'a change begun with no box recorded takes the plain lerp');
  assert.deepEqual(viewBoxAt(0, 1, VB_ANAT, VB_CIRC, VB_CIRC_R, [0, 0, 0, 0]), [...VB_ANAT]);
  assert.deepEqual(viewBoxAt(1, 0, VB_ANAT, VB_CIRC, VB_CIRC_R, [0, 0, 0, 0]), [...VB_CIRC]);
  assert.deepEqual(viewBoxAt(1, 1, VB_ANAT, VB_CIRC, VB_CIRC_R, [0, 0, 0, 0]), VB_CIRC_R);
});


// ── A framing asked for while a move runs ───────────────────────────────────────────────────────────────────────────────────────────────────

// animateVT itself, run on a clock the test moves (as camera-hand.test.js does), on a Mac's window, with the stage's other parts stood in for.
function rig(from, room = null) {
  let clock = 0, frames = [];
  const moves = [], vb = room?.vb || camWindow(1440, 800, BOX), wMax = room?.wMax || vb.w, real = performance.now;
  const live = { aiming: false, vtAnim: 0, arcRun: null, drifting: false, vtTarget: null, vt: { ...from }, vtGliding: false, cath: {}, sites: {}, scan: {}, camMove: false, dprLet() {}, dprobePaint() {}, gestureOn: () => false, following: false, rideCTM: null, morphTarget: 0, lastFree: null };
  const st = { CIRC_C: [0, 0], applyVT() {}, arcRoom: () => ({ vb, wMax }), screenW: () => vb.w, camSettle() {}, camSettleIdle() {}, circVB: () => [0, 0, 1000, 600], dpr: {}, driftEnd() {}, glideXfStart() {}, glideXfStep() {}, logMove: (m) => moves.push(m), nextFrame: (cb) => { frames.push(cb); return frames.length; }, refreshCTM() {}, rideStep() {}, safeInsets: () => ({ l: 0, t: 0, r: 0, b: 0 }), sameView: (a, b) => a && b && Math.abs(a.k - b.k) < 0.001 && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1, sitesPaint() {}, svg: { clientWidth: 1440, clientHeight: 800 }, vbCenter: () => [vb.cx, vb.cy], vtTrack: createGlideTracker(), viewXfRetargetTo: () => false, geo: {} };
  const g = createGlide(st, live);
  return { live, g, vb, moves, now(t) { clock = t; performance.now = () => clock; }, run(t) { clock = t; const c = frames; frames = []; for (const cb of c) cb(t); }, done() { performance.now = real; } };
}

test('a framing asked for while a move runs (the cards settled, or the next slide) goes on to it without going back or overshooting', () => {
  const A = { k: 1.2, x: -100, y: -50 }, B = { k: 3, x: -2300, y: -1000 };
  const cases = [
    ['the cards settle half way: a small correction', 0.5, { k: 3.05, x: -2330, y: -1010 }, { arc: true, steady: true }, 400],
    ['the cards settle near the end', 0.8, { k: 3.05, x: -2330, y: -1010 }, { arc: true, steady: true }, 400],
    ['the cards settle: a bigger correction', 0.5, { k: 3.2, x: -2450, y: -1000 }, { arc: true, steady: true }, 400],
    ['Next pressed half way: on the same way', 0.5, { k: 3.6, x: -2900, y: -1300 }, { arc: true, scale: true }, 900],
  ];
  for (const [what, f, C, opt, ms2] of cases) {
    const r = rig(A);
    try {
      const g1 = viewGeom(C, r.vb), T = [g1.cx, g1.cy], pts = [];
      const rec = () => pts.push([r.live.vt.k * T[0] + r.live.vt.x, r.live.vt.k * T[1] + r.live.vt.y, r.live.vt.k]);
      r.now(0); r.g.animateVT(B, 900, { arc: true, scale: true }); rec();
      const tr = Math.round((f * 900) / 16) * 16;
      for (let t = 16; t <= tr; t += 16) { r.run(t); rec(); }
      r.now(tr); r.g.animateVT(C, ms2, opt);
      for (let t = tr + 16; t <= tr + 2000 && (t === tr + 16 || r.live.vtGliding); t += 16) { r.run(t); rec(); }
      assert.ok(!r.live.vtGliding, `${what}: it lands`);
      assert.ok(Math.abs(r.live.vt.k - C.k) < 1e-9 && Math.abs(r.live.vt.x - C.x) < 1e-6, `${what}: on the framing asked for`);
      assert.equal(bend(pts.map((p) => [p[0], p[1]])).rev, 0, `${what}: the landing framing goes away and back`);
      for (const p of pts) assert.ok(p[2] >= Math.min(A.k, B.k, C.k) - 1e-9 && p[2] <= Math.max(A.k, B.k, C.k) + 1e-9, `${what}: the zoom overshoots (${p[2]})`);
    } finally { r.done(); }
  }
});

// ── The move in from a case card ─────────────────────────────────────────────────────────────────────────────────────────────
// A slide with a case card (vignette) has the camera back out to the whole patient behind the card, then in to the slide's framing as the card
// lifts (presenter-case.js caseRun, presenter.js caseLifted). That move starts at the fit, never at the last slide's framing, which the replay
// above did not model (Mohammad, 15 Nov 2026, slide 7 of the circulation in cirrhosis: "after the case card the camera does a funky move").
test('the move in from a case card\'s whole patient lands straight on every screen, and takes the time the move out took', () => {
  let n = 0;
  for (const [name, scr] of Object.entries(SCREENS)) {
    const vb = camWindow(scr.sw, scr.sh, BOX, scr.free), fit = framing(FIT_BOX, scr, 1.15), wMax = vb.w / fit.k;
    for (const [id, deck] of Object.entries(DECKS)) {
      (deck.slides || []).forEach((s, i) => {
        if (!s.vignette || s.view === 'circuit' || s.visual) return;
        let cam = s.cam || 'fit';
        if (isCamOn(cam)) cam = cam.near;
        if (typeof cam !== 'string' || /^(lobule|sinusoid)/.test(cam)) return;
        const box = cam === 'fit' ? FIT_BOX : regionBox(cam, REGIONS);
        if (!box) return;
        const b = framing(box, scr, s.kMax || 3.2), p = camPath(fit, b, vb, wMax);
        judge((u) => p.at(u), fit, b, vb, Math.max(wMax, vb.w / b.k), p.arc, `${name}, ${id} ${i}, in from the case card`);
        n++;
      });
    }
  }
  assert.ok(n >= 10, `the decks have case-card slides (${n})`);
  // the glide itself: the plain one takes the time its reach asks (a short move 480 ms), the one in from a case card 900
  const A = { k: 0.8, x: 400, y: 40 }, box = [600, 200, 1000, 600];
  for (const slow of [false, true]) {
    const r = rig(A);
    try {
      r.live.vt = { ...A }; r.now(0);
      r.g.frameBox(box, 1500, 3.2, false, slow ? { slow: true } : {});
      assert.equal(r.moves.length, 1, 'one move');
      if (slow) assert.ok(r.moves[0].ms >= CAM_MS_MAX, 'in from a case card: never quicker than the move out');
      else assert.ok(r.moves[0].ms <= CAM_MS_FAR);
    } finally { r.done(); }
  }
});

// ── The rail's time and its start ────────────────────────────────────────────────────────────────────────────────────────────
test('a slide\'s glide time grows with the reach, never stops short of a hand\'s, and settles toward its ceiling', () => {
  const at = { k: 1, x: 0, y: 0 }, w = 800;
  let last = 0;
  for (let x = 0; x <= 8000; x += 25) {
    const b = { k: 1, x, y: 0 }, m = slideMs(at, b, w);
    assert.ok(m >= last, `monotone at ${x}`); last = m;
    assert.ok(m >= camMs(at, b, w) && m >= SLIDE_MS_MIN && m <= CAM_MS_FAR, `between a hand's glide (and a slide's least) and the ceiling at ${x}`);
    if (camMs(at, b, w) < CAM_MS_MAX) assert.equal(m, Math.max(SLIDE_MS_MIN, camMs(at, b, w)), 'a hand\'s time where it has not stopped, never under a slide\'s least');
  }
  assert.ok(slideMs(at, { k: 1, x: 1600, y: 0 }, w) > CAM_MS_MAX + 100 && slideMs(at, { k: 1, x: 6400, y: 0 }, w) > CAM_MS_FAR - 60, 'two screens are slower than 900, many nearly the ceiling');
  // no kink in the time: the steps between neighbouring reaches stay small across the 900 ms knee
  for (let x = 25; x <= 8000; x += 25) assert.ok(Math.abs(slideMs(at, { k: 1, x, y: 0 }, w) - slideMs(at, { k: 1, x: x - 25, y: 0 }, w)) <= 31, `a smooth step at ${x}`);
});

test('a glide whose first frame comes late starts from where it stood, and its end moves later by what it did not run', () => {
  const A = { k: 1.2, x: -100, y: -50 }, B = { k: 3, x: -2300, y: -1000 };
  for (const late of [20, 60, 150, 400]) {
    const r = rig(A);
    try {
      r.now(0); r.g.animateVT(B, 900, { arc: true, scale: true });
      const ms = r.live.vtMs;
      r.run(late);
      const frac = Math.log(r.live.vt.k / A.k) / Math.log(B.k / A.k);
      assert.ok(frac <= easeMove(Math.min(1, 40 / ms)) * 1.5 + 1e-9, `a first frame ${late} ms late shows the start, not ${(frac * 100).toFixed(1)} % of the move`);
      const t0 = Math.max(0, late - 40);
      assert.ok(Math.abs(r.live.vtUntil - (t0 + ms)) < 1e-6, 'its end moves with its start');
      let t = late; while (t < late + ms + 200 && r.live.vtGliding) { t += 16; r.run(t); }
      assert.ok(!r.live.vtGliding && t >= t0 + ms - 16, 'it runs its whole time from the start it was given');
    } finally { r.done(); }
  }
  // a first frame on time is not held
  const r = rig(A);
  try { r.now(0); r.g.animateVT(B, 900, { arc: true, scale: true }); const u0 = r.live.vtUntil; r.run(16); assert.equal(r.live.vtUntil, u0, 'on time: nothing moves'); } finally { r.done(); }
});

test('a move taken over mid-way keeps its speed: the landing framing\'s screen step does not jump or stop at the hand-over', () => {
  const A = { k: 1.2, x: -100, y: -50 }, B = { k: 3, x: -2300, y: -1000 };
  for (const [what, C] of [['on the same way', { k: 3.6, x: -2900, y: -1300 }], ['a small correction', { k: 3.1, x: -2380, y: -1020 }]]) {
    const r = rig(A);
    try {
      const g1 = viewGeom(C, r.vb), T = [g1.cx, g1.cy], pts = [];
      const rec = () => pts.push([r.live.vt.k * T[0] + r.live.vt.x, r.live.vt.k * T[1] + r.live.vt.y]);
      r.now(0); r.g.animateVT(B, 900, { arc: true, scale: true }); rec();
      let t = 0; for (; t < 400; t += 16) { r.run(t + 16); rec(); }
      const before = pts.length - 1;
      r.now(t); r.g.animateVT(C, 900, { arc: true, scale: true });
      for (t += 16; t < 3000 && r.live.vtGliding; t += 16) { r.run(t); rec(); }
      const step = (i) => Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const v0 = step(before), v1 = step(before + 2);
      assert.ok(v0 > 0, 'it was moving');
      assert.ok(v1 > 0.6 * v0 && v1 < 1.3 * v0, `${what}: the screen step before the hand-over ${v0.toFixed(2)} and after ${v1.toFixed(2)} agree`);
    } finally { r.done(); }
  }
});

test('the camera\'s carried progress leaves at the old speed, rises without overshoot and arrives at rest, up to its cap', () => {
  for (const c of [0, 0.3, 0.8, 1.5, 2.2, CAM_CARRY_MAX, 9]) {
    const p = (t) => carriedCam(easeMove(t), t, c), h = 1e-5, want = Math.min(c, CAM_CARRY_MAX);
    assert.ok(Math.abs((p(h) - p(0)) / h - want) < 1e-3, `c=${c}: it leaves at slope ${want}`);
    assert.ok(Math.abs((p(1) - p(1 - h)) / h) < 1e-3, `c=${c}: it arrives at rest`);
    assert.ok(Math.abs(p(1) - 1) < 1e-12 && p(0) === 0, `c=${c}: from 0 to 1`);
    // (no acceleration jump at the start: the speed rises smoothly from the carried one)
    assert.ok(Math.abs((p(2 * h) - 2 * p(h) + p(0)) / (h * h)) < 40 * (1 + want), `c=${c}: no acceleration jump at the start`);
    let last = 0;
    for (let i = 0; i <= 2000; i++) { const t = i / 2000, v = p(t); assert.ok(v >= last - 1e-12 && v <= 1 + 1e-12, `c=${c} t=${t}: monotone and under 1 (${v})`); last = v; }
  }
});

// ── The slide's one move against a real change while it runs ─────────────────────────────────────────────────────────────────────────────
test('a real change asked while a slide\'s move runs (a card folded, the screen turned) is one glide after the landing, never a bend in it', () => {
  const A = { k: 1.2, x: -100, y: -50 }, B = { k: 1.9, x: -700, y: -300 }, C = { k: 1.6, x: -400, y: -100 };
  const r = rig(A);
  try {
    const g1 = viewGeom(B, r.vb), T = [g1.cx, g1.cy], first = [];
    r.now(0); r.g.animateVT(B, 1500, { arc: true, scale: true, slide: true });
    const ms = r.live.vtMs;
    let t = 16;
    for (; r.live.vtTarget === B && t < 4000; t += 16) {
      r.run(t);
      first.push([r.live.vt.k * T[0] + r.live.vt.x, r.live.vt.k * T[1] + r.live.vt.y]);
      if (r.live.vtTarget !== B) break;   // (landed, and the change set off from there)
      if (Math.abs(t - Math.round(ms / 2 / 16) * 16) < 1) { r.now(t); r.g.animateVT(C, 400, { steady: true }); }
    }
    assert.ok(Math.abs(first.at(-1)[0] - (B.k * T[0] + B.x)) < 1e-6, 'the slide\'s move ran to its own framing');
    const w = wander(first);
    assert.ok(w.dev < 0.5 + 0.002 * w.L && w.back < 0.5, `the slide's move kept its line (off by ${w.dev.toFixed(1)}, back ${w.back.toFixed(1)})`);
    for (; r.live.vtGliding && t < 6000; t += 16) r.run(t);
    assert.ok(Math.abs(r.live.vt.k - C.k) < 1e-9 && Math.abs(r.live.vt.x - C.x) < 1e-6, 'and then the change, once');
    const kinds = r.moves.map((m) => m.kind);
    assert.deepEqual(kinds, ['glide', 'held', 'glide'], `the slide's glide, the change held, then its glide (${kinds.join(', ')})`);
    // a new slide, a hand and a slow push are never held
    r.now(t); r.g.animateVT(B, 1500, { arc: true, scale: true, slide: true });
    r.now(t + 100); r.g.animateVT(A, 900, { scale: true, v0: { k: 0, x: 0.1, y: 0 } });
    assert.equal(r.live.vtTarget, A, 'a hand takes over at once');
  } finally { r.done(); }
});
