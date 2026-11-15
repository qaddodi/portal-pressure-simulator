// Every slide-to-slide camera move, replayed (15 Nov 2026, Mohammad: "make sure the camera movement is not funky, like going around in circles
// while zooming in or out or panning in slides"). Node only: each deck's neighbouring framings are worked out the way the stage frames a region
// (a box fitted into the room the cards leave, centred there), on the three screens, and the path the camera takes between them is the app's own
// (cam-arc.js camPath and lerpVT, cam-routes.js alongPath, ease.js easeMove and carried), judged on the screen:
//   - the framing the slide lands on never goes away from where it will be and back (no reversal), never curls (turning of its screen path), and
//     comes in on one straight line;
//   - the zoom never overshoots the two framings (a plain move) or goes out once and back in (a pull-back), and a pull-back never goes wider than
//     the whole figure's fit;
//   - no frame jumps: the step between two frames stays within a small share of the whole move.
// The window the paths are worked out in is the stage's real view box (cam-arc.js camWindow), never the 1400 x 1000 plate the arcs and the glide's
// times read until 15 Nov 2026, which put every width, overlap test and pull-back out by the plate's ratio (differently on a phone and a Mac).
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DECKS, REGIONS } from '../src/ui/decks.js';
import { VB_ANAT, VB_CIRC, VIEW } from '../src/ui/anatomy.js';
import { camPath, camWindow, geomView, lerpVT, viewGeom, blendPaths } from '../src/ui/cam-arc.js';
import { alongPath, ALONG_OFF } from '../src/ui/cam-routes.js';
import { isCamOn, regionBox } from '../src/ui/cam-frame.js';
import { camMs, carried, easeMove, createGlideTracker } from '../src/ui/ease.js';
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

// The anatomic neighbours of every deck: a slide framed on a region (or the fit) beside the next one framed so. A circuit slide, a lobule or
// sinusoid framing, a visual and a view change are other moves (view-xf.js, the lobule's own camera): they are not on the plate's camera.
function moves() {
  const out = [];
  for (const [id, deck] of Object.entries(DECKS)) {
    let prev = null;
    (deck.slides || []).forEach((s, i) => {
      if (s.view === 'circuit' || s.visual) { prev = null; return; }
      let cam = s.cam || 'fit';
      if (isCamOn(cam)) cam = cam.near;
      if (typeof cam === 'string' && /^(lobule|sinusoid)/.test(cam)) { prev = null; return; }
      const box = cam === 'fit' || !cam ? FIT_BOX : regionBox(cam, REGIONS);
      if (!box) { prev = null; return; }
      const cur = { box, kMax: s.kMax || 3.2, at: `${id} ${i}` };
      if (prev) out.push({ from: prev, to: cur });
      prev = cur;
    });
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
    for (const { from, to } of moves()) {
      const a = framing(from.box, scr, from.kMax), b = framing(to.box, scr, to.kMax), p = camPath(a, b, vb, wMax);
      if (p.arc) arcs++;
      // (the glide's own progress: eased by the quintic; each path asked at the eased value, as animateVT's step does)
      judge((u) => p.at(u), a, b, vb, Math.max(wMax, vb.w / a.k, vb.w / b.k), p.arc, `${name}, ${from.at} to ${to.at}`);
      n++;
    }
    assert.ok(n > 250, `the decks have their moves (${n})`);
    assert.ok(arcs <= n);
  });
}

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

test('a glide that follows a vessel never goes back along it, and stays within its calm band of the straight line', () => {
  let seed = 11;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const lines = [[[400, 300], [550, 330], [700, 350], [850, 330], [1000, 300]], [[600, 100], [620, 300], [640, 500], [630, 700]]];
  let followed = 0;
  for (const [name, scr] of Object.entries(SCREENS)) {
    const vb = camWindow(scr.sw, scr.sh, BOX, scr.free);
    for (let i = 0; i < 3000; i++) {
      const k0 = 1 + rnd() * 2.5, k1 = k0 * (1 + (rnd() - 0.5) * 0.8);
      const a = geomView({ cx: 400 + rnd() * 600, cy: 100 + rnd() * 600, w: vb.w / k0 }, vb), b = geomView({ cx: 400 + rnd() * 600, cy: 100 + rnd() * 600, w: vb.w / k1 }, vb);
      const p = alongPath(a, b, lines, vb);
      if (!p) continue;
      followed++;
      const g0 = viewGeom(a, vb), g1 = viewGeom(b, vb), d = Math.hypot(g1.cx - g0.cx, g1.cy - g0.cy);
      let last = -Infinity;
      for (let j = 0; j <= FRAMES; j++) {
        const g = viewGeom(p.at(easeMove(j / FRAMES)), vb), f = ((g.cx - g0.cx) * (g1.cx - g0.cx) + (g.cy - g0.cy) * (g1.cy - g0.cy)) / (d * d), off = Math.abs((g.cx - g0.cx) * (g1.cy - g0.cy) - (g.cy - g0.cy) * (g1.cx - g0.cx)) / d / d;
        assert.ok(f >= last - 1e-9, `${name} #${i}: the glide goes back along the vessel`);
        assert.ok(off <= ALONG_OFF + 1e-6, `${name} #${i}: the glide swings off the straight line (${off.toFixed(3)})`);
        last = f;
      }
    }
  }
  assert.ok(followed > 200, `the sweep reaches the vessel-following glide (${followed})`);
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
function rig(from) {
  let clock = 0, frames = [];
  const vb = camWindow(1440, 800, BOX), real = performance.now;
  const live = { aiming: false, vtAnim: 0, arcRun: null, drifting: false, vtTarget: null, vt: { ...from }, vtGliding: false, cath: {}, sites: {}, scan: {}, camMove: false, dprLet() {}, dprobePaint() {}, gestureOn: () => false, following: false, rideCTM: null, morphTarget: 0, lastFree: null };
  const st = { CIRC_C: [0, 0], applyVT() {}, arcRoom: () => ({ vb, wMax: vb.w }), screenW: () => vb.w, camSettle() {}, camSettleIdle() {}, circVB: () => [0, 0, 1000, 600], dpr: {}, driftEnd() {}, glideXfStart() {}, glideXfStep() {}, logMove() {}, nextFrame: (cb) => { frames.push(cb); return frames.length; }, refreshCTM() {}, rideStep() {}, safeInsets: () => ({ l: 0, t: 0, r: 0, b: 0 }), sameView: (a, b) => a && b && Math.abs(a.k - b.k) < 0.001 && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1, sitesPaint() {}, svg: {}, vbCenter: () => [0, 0], vtTrack: createGlideTracker(), viewXfRetargetTo: () => false, geo: {} };
  const g = createGlide(st, live);
  return { live, g, vb, now(t) { clock = t; performance.now = () => clock; }, run(t) { clock = t; const c = frames; frames = []; for (const cb of c) cb(t); }, done() { performance.now = real; } };
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
