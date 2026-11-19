// The ?watch motion rules (src/ui/watch/motion-rules.js): each fires on the glitch it names and stays quiet on the case that looks like it and is fine.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOTION_RULES, flash, stuckMid, labelSlide, labelDetached, labelDimAlpha, numberWidthJump, cameraStraight, cameraSlide, judgeMotion, viewSegments } from '../src/ui/watch/motion-rules.js';
import { DIM_ALPHA } from '../src/ui/label-explain.js';
import { camWindow, lerpVT } from '../src/ui/cam-arc.js';
import { VB_ANAT } from '../src/ui/anatomy.js';
import { planSlide, slideEase } from '../src/ui/slide-cam.js';

const DT = 16;
/** n samples DT apart; fn(i) -> { c?, L?, K? } (a part left out is null: not readable). */
const run = (n, fn) => Array.from({ length: n }, (_, i) => ({ t: i * DT, c: null, L: null, K: null, ...fn(i) }));
const lab = (key, a, x = 100, y = 100, ax, ay) => (ax == null ? [key, x, y, 40, 12, a] : [key, x, y, 40, 12, a, ax, ay]);
const hist = (samples, more = {}) => ({ samples, events: [], traces: [], vb: null, env: { vw: 1440 }, ...more });
const rules = (fs) => fs.map((f) => f.rule);

test('flash: a label that is shown, gone for three frames and back is named, with its time and its owner', () => {
  const a = [1, 1, 1, 0.05, 0.05, 0.05, 1, 1, 1];
  const fs = flash(hist(run(a.length, (i) => ({ L: [lab('n:portal-vein', a[i])] }))));
  assert.equal(fs.length, 1);
  assert.equal(fs[0].rule, 'flash'); assert.match(fs[0].what, /n:portal-vein/); assert.match(fs[0].owner, /label-gl/); assert.ok(fs[0].why);
});

test('flash must not fire: a slow fade out and back, a label gone for a second, a dim label, a label that never was', () => {
  const slow = run(120, (i) => ({ L: [lab('a', i < 40 ? 1 - i / 40 : i < 80 ? 0 : (i - 80) / 40)] }));   // (out over 640 ms, gone 640 ms, in over 640 ms)
  assert.deepEqual(flash(hist(slow)), []);
  const gap = run(90, (i) => ({ L: i < 20 || i > 80 ? [lab('a', 1)] : [] }));   // (gone from the list for 60 frames: a second)
  assert.deepEqual(flash(hist(gap)), []);
  assert.deepEqual(flash(hist(run(30, () => ({ L: [lab('a', DIM_ALPHA)] })))), []);
  assert.deepEqual(flash(hist(run(30, () => ({ L: [] })))), []);
  const unknown = run(12, (i) => ({ L: i === 5 || i === 6 ? null : [lab('a', 1)] }));   // (the source could not be read in two frames: unknown, not gone)
  assert.deepEqual(flash(hist(unknown)), []);
});

test('flash: a card blinks the same way', () => {
  const a = [1, 1, 0, 0, 1, 1];
  const fs = flash(hist(run(a.length, (i) => ({ K: [['pz-data', 10, 10, 300, 200, a[i]]] }))));
  assert.equal(fs.length, 1); assert.match(fs[0].what, /card "pz-data"/);
});

test('stuck-mid: a card held at half for two seconds at the end is named; a finished fade, a short hold and a dim label are not', () => {
  assert.equal(stuckMid(hist(run(150, () => ({ K: [['pz-text', 0, 0, 300, 100, 0.5]] })))).length, 1);
  assert.deepEqual(stuckMid(hist(run(150, () => ({ K: [['pz-text', 0, 0, 300, 100, 1]] })))), []);
  assert.deepEqual(stuckMid(hist(run(150, () => ({ K: [['pz-text', 0, 0, 300, 100, 0]] })))), []);
  assert.deepEqual(stuckMid(hist(run(150, (i) => ({ K: [['pz-text', 0, 0, 300, 100, i < 120 ? i / 120 : 0.5]] })))), [], 'half for 30 frames (480 ms) is a fade passing through');
  assert.deepEqual(stuckMid(hist(run(150, () => ({ L: [lab('n:x', DIM_ALPHA)] })))), [], 'a dimmed label rests at the dim alpha');
});

test('label-dim-alpha: a label resting at another alpha is named; at the dim alpha it is not', () => {
  const fs = labelDimAlpha(hist(run(150, () => ({ L: [lab('n:x', 0.5)] }))));
  assert.equal(fs.length, 1); assert.match(fs[0].where, /0\.65/);
  assert.deepEqual(labelDimAlpha(hist(run(150, () => ({ L: [lab('n:x', DIM_ALPHA)] })))), []);
  assert.deepEqual(labelDimAlpha(hist(run(150, () => ({ L: [lab('n:x', 1)] })))), []);
});

test('label-slide: a label that moves 30 px against its anchor while shown slid; one that jumps 100 px popped', () => {
  const s = run(40, (i) => ({ c: [1, 0, 0], L: [lab('n:a', 1, 100 + Math.min(i, 20) * 1.5, 100, 100, 100)] }));
  const fs = labelSlide(hist(s));
  assert.equal(fs.length, 1); assert.match(fs[0].where, /slid 30 px/);
  const j = run(20, (i) => ({ c: [1, 0, 0], L: [lab('n:a', 1, i < 10 ? 100 : 200, 100, 100, 100)] }));
  const fj = labelSlide(hist(j));
  assert.equal(fj.length, 1); assert.match(fj[0].where, /jumped 100 px/);
});

test('label-slide must not fire: a label riding its anchor through a camera move, a fade in place, a label that moves while gone, a tiny settle', () => {
  const ride = run(60, (i) => ({ c: [1 + i / 100, i * 3, 0], L: [lab('n:a', 1, 100 + i * 3, 100, 100 + i * 3, 100)] }));
  assert.deepEqual(labelSlide(hist(ride)), []);
  const fade = run(30, (i) => ({ c: [1, 0, 0], L: [lab('n:a', i / 30, 100, 100, 100, 100)] }));
  assert.deepEqual(labelSlide(hist(fade)), []);
  const hidden = run(40, (i) => ({ c: [1, 0, 0], L: [lab('n:a', i < 20 ? 0.05 : 1, i < 20 ? 100 + i * 5 : 200, 100, 100, 100)] }));
  assert.deepEqual(labelSlide(hist(hidden)), [], 'moving while it is nearly invisible, then fading in at its new spot, is how labels change spots');
  const settle = run(40, (i) => ({ c: [1, 0, 0], L: [lab('n:a', 1, 100 + Math.min(i, 5) * 0.4, 100, 100, 100)] }));
  assert.deepEqual(labelSlide(hist(settle)), []);
  // no anchor and the camera moving: nothing to judge by
  const noAnchor = run(40, (i) => ({ c: [1 + i / 50, 0, 0], L: [lab('n:a', 1, 100 + i * 4, 100)] }));
  assert.deepEqual(labelSlide(hist(noAnchor)), []);
});

test('label-slide: with no anchor and a still camera a slide is still named', () => {
  const s = run(40, (i) => ({ c: [1, 0, 0], L: [lab('k:a', 1, 100 + Math.min(i, 20) * 2, 100)] }));
  assert.equal(labelSlide(hist(s)).length, 1);
});

test('label-detached: a label that stands still while its anchor travels with the camera is named; one that follows is not', () => {
  const stuck = run(20, (i) => ({ c: [1, i * 6, 0], L: [lab('n:a', 1, 100, 100, 100 + i * 6, 100)] }));
  const fs = labelDetached(hist(stuck));
  assert.ok(fs.some((f) => /does not keep up/.test(f.where)), JSON.stringify(fs));
  const far = run(5, (i) => ({ c: [1, 0, 0], L: [lab('n:a', 1, 100, 100, 900, 100)] }));
  assert.ok(labelDetached(hist(far, { env: { vw: 1440 } })).some((f) => /from its anchor/.test(f.where)));
  const follow = run(20, (i) => ({ c: [1, i * 6, 0], L: [lab('n:a', 1, 100 + i * 6, 100, 100 + i * 6, 100)] }));
  assert.deepEqual(labelDetached(hist(follow)), []);
  const lag = run(20, (i) => ({ c: [1, i * 6, 0], L: [lab('n:a', 1, 100 + Math.max(0, i - 1) * 6, 100, 100 + i * 6, 100)] }));   // (one frame behind in a pipelined renderer)
  assert.deepEqual(labelDetached(hist(lag)), []);
});

test('number-width-jump: a same-length number whose width moves while its card holds is named; a longer number or a growing card is not', () => {
  const ev = (o) => ({ t: 1000, k: 'num', id: '#1', text: '18', w: 14, cw: 300, pt: '17', pw: 13, pcw: 300, ...o });
  const fs = numberWidthJump(hist([], { events: [ev({})] }));
  assert.equal(fs.length, 1); assert.match(fs[0].what, /"17" to "18"/);
  assert.deepEqual(numberWidthJump(hist([], { events: [ev({ text: '118', w: 21 })] })), [], 'a longer number is wider');
  assert.deepEqual(numberWidthJump(hist([], { events: [ev({ cw: 340 })] })), [], 'the card itself changed width');
  assert.deepEqual(numberWidthJump(hist([], { events: [ev({ w: 13 })] })), []);
  assert.deepEqual(numberWidthJump(hist([], { events: [ev({ pt: null })] })), [], 'a first sight has nothing before it');
});

// ---- the camera ----
const BOX = { x: VB_ANAT[0], y: VB_ANAT[1], width: VB_ANAT[2], height: VB_ANAT[3] };
const vb = camWindow(1440, 800, BOX, { l: 500, t: 70, r: 1420, b: 770 });
const A = { k: 0.8, x: 406, y: 38 }, B = { k: 1.14, x: 240, y: -28 };
/** Camera samples through a move at `at(u)`, 1 s of rest first, `ms` of motion, 0.5 s of rest after; the view change at 1000 ms. */
const move = (at, ms = 700, extra = {}) => {
  const n = Math.round((1000 + ms + 500) / DT);
  const samples = run(n, (i) => { const t = i * DT, u = t < 1000 ? 0 : Math.min(1, (t - 1000) / ms), v = at(slideEase(u)); return { c: [v.k, v.x, v.y] }; });
  return hist(samples, { vb, events: [{ t: 1000, k: 'view', to: 'circuit' }], ...extra });
};

test('camera-straight: one even glide from view to view passes; the segments are found', () => {
  const h = move((u) => lerpVT(A, B, u));
  assert.equal(viewSegments(h).length, 1);
  assert.deepEqual(cameraStraight(h), []);
});

test('camera-straight: a stop at the fit part way (a waypoint) is named', () => {
  const h = move((u) => (u < 0.3 ? lerpVT(A, B, u) : u < 0.7 ? lerpVT(A, B, 0.3) : lerpVT(A, B, u)));
  const fs = cameraStraight(h);
  assert.ok(fs.some((f) => /stops part way/.test(f.where)), JSON.stringify(fs));
});

test('camera-straight: zooming out to the fit and then in to the target is named (the zoom turns back)', () => {
  const FIT = { k: 0.5, x: 300, y: 0 };
  const h = move((u) => (u < 0.5 ? lerpVT(A, FIT, u * 2) : lerpVT(FIT, B, (u - 0.5) * 2)));
  assert.ok(cameraStraight(h).some((f) => /zoom turns back|goes back|leaves its straight line/.test(f.where)), JSON.stringify(cameraStraight(h)));
});

test('camera-straight must not fire: a hand on the screen during the move, a view change with no camera move, an overlapping next change', () => {
  const stopped = (u) => (u < 0.3 ? lerpVT(A, B, u) : u < 0.7 ? lerpVT(A, B, 0.3) : lerpVT(A, B, u));
  assert.deepEqual(cameraStraight(move(stopped, 700, { events: [{ t: 1000, k: 'view', to: 'circuit' }, { t: 1200, k: 'hand' }] })), []);
  const still = hist(run(100, () => ({ c: [1, 0, 0] })), { vb, events: [{ t: 500, k: 'view', to: 'anatomy' }] });
  assert.deepEqual(cameraStraight(still), []);
  assert.deepEqual(cameraStraight(move(stopped, 700, { events: [{ t: 1000, k: 'view', to: 'circuit' }, { t: 1300, k: 'view', to: 'anatomy' }] })), [], 'a move another change took over is not judged');
  assert.deepEqual(cameraStraight(move((u) => lerpVT(A, B, u), 700, { vb: null })), [], 'no view units known: not judged');
});

test('camera-slide: a slide trace is judged by judgeSlideMove (the gate\'s own judge)', () => {
  const plan = planSlide(A, B, vb.w, 1500);
  const mk = (frames) => ({ plan: { from: plan.from, to: plan.to, ms: plan.ms }, frames, end: 'landed', after: null, press: null, t0: 0, at: 0, vb, why: 'slide', stalls: [] });
  const good = []; for (let t = 0; t <= plan.ms + 16; t += 16) { const v = plan.at(slideEase(Math.min(1, t / plan.ms))); good.push([t, v.k, v.x, v.y]); }
  assert.deepEqual(cameraSlide(hist([], { traces: [mk(good)] })), []);
  const bad = good.map((f) => (f[0] > 300 && f[0] < 600 ? [f[0], f[1], f[2] + 40, f[3]] : f));   // (bows off its line)
  assert.ok(cameraSlide(hist([], { traces: [mk(bad)] })).length >= 1);
});

test('judgeMotion: every rule is registered with its why and owner; one that throws is reported, not swallowed', () => {
  for (const r of MOTION_RULES) { assert.equal(r.kind, 'series'); assert.ok(r.why && r.owner && typeof r.judge === 'function', r.id); }
  const out = judgeMotion(hist([]), [{ id: 'boom', why: 'x', judge: () => { throw new Error('bad'); } }]);
  assert.equal(out.length, 1); assert.match(out[0].where, /threw: bad/);
  assert.deepEqual(rules(judgeMotion(hist(run(30, () => ({ c: [1, 0, 0], L: [lab('n:a', 1, 100, 100, 100, 100)], K: [['pz-text', 0, 0, 100, 100, 1]] }))))), [], 'a calm screen has no finding');
});
