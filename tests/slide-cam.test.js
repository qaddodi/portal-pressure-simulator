// The slide camera (slide-cam.js, 16 Nov 2026 rewrite): its lock, its clock, and its judge. The judge is the one the unit gate
// (camera-replay.test.js, every deck both ways on four screens) and the app's own gate (window.pps.cameraGate, on a real device) use, so it
// must fail every kind of funky move Mohammad has reported, and pass the slide camera's own.
import './dom-shim.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blendPaths, camPath, camWindow, lerpVT } from '../src/ui/cam-arc.js';
import { VB_ANAT } from '../src/ui/anatomy.js';
import { STEP_MAX, createCamLock, createSlideClock, judgeSlideMove, lockedWrite, planSlide, slideEase } from '../src/ui/slide-cam.js';

const BOX = { x: VB_ANAT[0], y: VB_ANAT[1], width: VB_ANAT[2], height: VB_ANAT[3] };
const vb = camWindow(1440, 800, BOX, { l: 500, t: 70, r: 1420, b: 770 });
const A = { k: 0.8, x: 406, y: 38 }, B = { k: 1.14, x: 240, y: -28 };   // (Sites and causes 2 to 3, as his Mac recorded it)

/** A trace as the lock records it: frames [t, k, x, y] from a path `at(u)` sampled by a clock `prog(t)` at the frame times `ts`. */
function traceOf(plan, ts, prog, at = plan.at) {
  return { plan, t0: 0, end: 'landed', frames: ts.map((t) => { const v = at(slideEase(prog(t))); return [t, v.k, v.x, v.y]; }), held: [], blocked: [] };
}
const frames = (ms, dt = 16, from = 0) => { const out = []; for (let t = from; t <= ms + from + dt; t += dt) out.push(t); return out; };

test('the slide camera\'s own move passes its judge: one plan, the plain path, its clock, through a 1 s stall', () => {
  const plan = planSlide(A, B, vb.w, 1500);
  assert.ok(plan.ms >= 800 && plan.ms <= 1400, `a calm time (${plan.ms} ms)`);
  const clock = createSlideClock(plan.ms), ts = [];
  for (let t = 0, i = 0; i < 400; i++) { ts.push(t); t += i === 20 ? 1000 : 16; }   // (a 1 s stall a third of the way in)
  const tr = { plan, t0: 0, end: 'landed', frames: [], held: [], blocked: [] };
  for (const t of ts) { const r = clock.tick(t); const v = plan.at(slideEase(r)); tr.frames.push([t, v.k, v.x, v.y]); if (r >= 1) break; }
  assert.deepEqual(judgeSlideMove(tr, vb), []);
  assert.ok(tr.stalls?.includes(1000), 'and the stall is listed, so a device run shows where the frames went');
});

test('the judge fails a wall-clock glide whose last part lands in one jump after a stall (Sites and causes 2 to 3)', () => {
  const plan = planSlide(A, B, vb.w, 480, true);   // (480 ms, as it was)
  const ts = [0, 16, 32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224, 240, 256, 272, 288, 304, 320, 336, 352, 368, 1400];
  const tr = traceOf(plan, ts, (t) => Math.min(1, t / plan.ms));
  assert.ok(judgeSlideMove(tr, vb).some((f) => /jumps/.test(f)), judgeSlideMove(tr, vb).join('; '));
});

test('the judge fails a glide that bends along a vessel while it zooms (Acute variceal bleed 2 to 3)', () => {
  const plan = planSlide(A, B, vb.w, 1500);
  const wiggle = (u) => { const v = lerpVT(A, B, u), off = 0.15 * Math.sin(Math.PI * u) * Math.sin(3 * Math.PI * u) * 300; return { k: v.k, x: v.x + off * 0.6, y: v.y - off * 0.8 }; };
  const tr = traceOf(plan, frames(plan.ms), (t) => Math.min(1, t / plan.ms), wiggle);
  assert.ok(judgeSlideMove(tr, vb).some((f) => /straight line|goes back/.test(f)), judgeSlideMove(tr, vb).join('; '));
});

test('the judge fails a move bent by a refit mid-way, a pull-back that zooms out and in, a second move, and a late start', () => {
  const plan = planSlide(A, B, vb.w, 1500), C = { k: 1.3, x: 120, y: -90 };
  // a refit blended in half way (the old arcs' way): it lands elsewhere and leaves the line
  const bent = blendPaths((u) => lerpVT(A, B, u), (u) => lerpVT(A, C, u), 0.5, vb);
  const f1 = judgeSlideMove(traceOf(plan, frames(plan.ms), (t) => Math.min(1, t / plan.ms), bent), vb);
  assert.ok(f1.some((f) => /plan|straight line/.test(f)), f1.join('; '));
  // a pull-back (far move): the zoom turns back
  const far = { k: 3.2, x: -2600, y: -400 }, near = { k: 3.2, x: -200, y: -1600 }, arc = camPath(far, near, vb, vb.w);
  assert.ok(arc.arc, 'the old far move pulled back');
  const p2 = planSlide(far, near, vb.w, 1500), f2 = judgeSlideMove(traceOf(p2, frames(p2.ms), (t) => Math.min(1, t / p2.ms), arc.at), vb);
  assert.ok(f2.some((f) => /zoom (turns back|overshoots|changes)/.test(f)), f2.join('; '));
  // a second move after the landing, and a first frame 600 ms late, and 1.5 s after the press
  const tr = traceOf(plan, frames(plan.ms, 16, 600), (t) => Math.min(1, (t - 600) / plan.ms));
  tr.after = 'refit'; tr.press = -900;
  const f3 = judgeSlideMove(tr, vb);
  assert.ok(f3.some((f) => /second move/.test(f)) && f3.some((f) => /after it was asked/.test(f)) && f3.some((f) => /after the press/.test(f)), f3.join('; '));
});

test('the clock moves a move on by what a frame took, never more than STEP_MAX, and starts at its first frame', () => {
  const c = createSlideClock(1000);
  assert.equal(c.tick(5000), 0, 'the first frame draws the start, however late it comes');
  assert.equal(c.tick(5016), 0.016);
  assert.equal(c.tick(6016), 0.016 + STEP_MAX / 1000, 'a 1 s frame moves it on by STEP_MAX only');
  assert.ok(Math.abs(c.left() - (1000 - 16 - STEP_MAX)) < 1e-9);
});

test('the lock: the run writes, a dry solve writes and puts back, anyone else is refused and named, a hand takes over', () => {
  let t = 0;
  const lock = createCamLock({ now: () => t });
  let vt = A, hand = false;
  const write = (v) => { if (lockedWrite(lock, () => hand)) vt = v; };
  write(B); assert.equal(vt, B, 'no run: any write');
  const run = lock.hold(planSlide(B, A, vb.w));
  write(A); assert.equal(vt, B, 'another\'s write is refused');
  assert.equal(run.blocked.length, 1); assert.match(run.blocked[0].who, /slide-cam\.test\.js:\d+/, 'and named by its file and line');
  lock.as(() => write(A)); assert.equal(vt, A, 'the run\'s own write');
  lock.dry(() => { write(B); write(A); }); assert.equal(vt, A, 'a dry solve writes and puts back');
  assert.ok(lock.holdAsk(B, { why: 'refit' }, vb), 'a glide asked meanwhile is held');
  assert.equal(run.pend.why, 'refit');
  hand = true; write(B); assert.equal(vt, B, 'a hand takes the camera');
  assert.ok(!lock.run && run.end === 'hand', 'and the run let go');
  // landing: a near ask is the landing itself, dropped; a far one is the move after it
  hand = false;
  const r2 = lock.hold(planSlide(A, B, vb.w));
  lock.holdAsk({ k: B.k, x: B.x + 1, y: B.y }, { why: 'refit' }, vb);
  assert.equal(lock.land(r2, vb), null, 'a near refit is dropped');
  assert.ok(lock.holdAsk({ k: B.k, x: B.x + 2, y: B.y }, {}, vb), 'and near ones are dropped for a while after the landing');
  t += 2100;
  assert.ok(!lock.holdAsk({ k: B.k, x: B.x + 2, y: B.y }, {}, vb), 'not after SETTLE_MS');
  const r3 = lock.hold(planSlide(B, A, vb.w));
  lock.holdAsk(B, { why: 'home fit' }, vb);
  assert.equal(lock.land(r3, vb)?.why, 'home fit', 'a far one runs after the landing');
  assert.equal(r3.after, 'home fit', 'and the trace says so');
  lock.hold(planSlide(A, B, vb.w)); lock.pressed();
  assert.ok(!lock.run, 'a new slide asked for lets go');
});
// (The wiring, that every write of the view asks the lock and every move of the person's lets go of it, is pinned in
// scripts/source-shapes/slide-cam-16nov.mjs, as rules-lint keeps source rules.)

// The device gate itself (cam-gate.js): it walks the decks by their ids (the app's DECKS is an array: 16 Nov 2026 it was handed the array's
// indices and judged nothing), Next and then Back, and judges every move's record.
test('pps.cameraGate walks each named deck Next and Back by its id and judges each move\'s record', async () => {
  const { createCameraGate } = await import('../src/ui/cam-gate.js');
  const plan = planSlide(A, B, vb.w, 1500), good = () => { const tr = traceOf(plan, frames(plan.ms), (t) => Math.min(1, t / plan.ms)); tr.vb = vb; tr.press = -40; tr.t0 = 0; return tr; };
  const started = [], went = [];
  let deck = null, traces = [];
  const presenter = { start: async (id) => { started.push(id); deck = id; }, go: (i) => { went.push(`${deck}:${i}`); traces = deck === 'b' && i === 1 ? [{ ...good(), after: 'refit' }] : [good()]; }, busy: () => false, count: () => 3, position: () => ({ id: deck, at: 0 }), skipLapse() {}, stop() {} };
  const stage = { gliding: () => false, cameraTraces: (clear) => { const t = traces; if (clear) traces = []; return t; } };
  const q = globalThis.document.querySelector; globalThis.document.querySelector = () => null;   // (no card up, no cover)
  const gate = createCameraGate({ presenter, stage, decks: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });
  const r = await gate({ decks: ['a', 'b'] });
  assert.deepEqual(started, ['a', 'b'], 'by id, not by index');
  assert.deepEqual(went, ['a:1', 'a:2', 'a:1', 'a:0', 'b:1', 'b:2', 'b:1', 'b:0'], 'Next to the end, then Back to the first');
  assert.equal(r.moves.length, 8);
  assert.equal(r.fail, 2, 'the two moves onto b\'s slide 2 made a second move after landing');
  assert.match(r.text, /6 of 8 slide moves pass/);
  await assert.rejects(gate({ decks: ['nope'] }), /no deck named nope/);
  // by its number or its title too; and a presenter that cannot count its slides fails loudly (main.js's facade had no count: "0 of 0", 16 Nov 2026)
  const g2 = createCameraGate({ presenter, stage, decks: [{ id: 'a', title: 'Deck A' }, { id: 'c' }] });
  started.length = 0; await g2({ decks: [2, 'deck a'], back: false });
  assert.deepEqual(started, ['c', 'a'], 'by number (1 first) and by title, any case');
  await assert.rejects(createCameraGate({ presenter: { ...presenter, count: undefined }, stage, decks: [{ id: 'a' }] })({}), /cannot count/);
  globalThis.document.querySelector = q;
});
