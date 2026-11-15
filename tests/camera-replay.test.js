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
import { readFileSync } from 'node:fs';
import { DECKS, REGIONS } from '../src/ui/decks.js';
import { VB_ANAT, VB_CIRC, VIEW } from '../src/ui/anatomy.js';
import { camPath, camWindow, geomView, lerpVT, viewGeom, blendPaths } from '../src/ui/cam-arc.js';
import { alongPath, ALONG_OFF } from '../src/ui/cam-routes.js';
import { isCamOn, regionBox } from '../src/ui/cam-frame.js';
import { camMs, carried, easeMove } from '../src/ui/ease.js';

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

test('the arcs and the glide\'s time read the stage\'s view box, never the old plate', () => {
  const ride = readFileSync(new URL('../src/ui/stage-ride.js', import.meta.url), 'utf8'), glide = readFileSync(new URL('../src/ui/stage-glide.js', import.meta.url), 'utf8');
  assert.ok(/function arcRoom\([^)]*\)[\s\S]*?camWindow\(/.test(ride), 'arcRoom is camWindow of the kept svg box and the view box');
  assert.ok(!/VIEW\./.test(ride), 'stage-ride.js reads no fixed plate');
  assert.ok(!/camMs\([^)]*VIEW\.w/.test(glide) && !/springSlope\([^)]*VIEW\.w/.test(glide), 'a glide\'s time and carried speed count a screen\'s width, not the plate\'s');
  assert.ok(/arcRoom\(freeAsk\)/.test(glide), 'a framing\'s arc travels the middle of the room the cards left');
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
