import { stageSource } from './stage-src.js';
// The performance and heat review of 30 Oct, groups 1 and 2: a ruler that can see a missed 120 Hz frame, and cuts that remove work
// that never reaches the screen (the picture stays the same; every setting keeps working).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { refreshOf, intervalStats, intervalLine, surfaceLine } from '../src/ui/perf-readout.js';
import { onlyClasses, classOnly, createLayoutWatch, GESTURE_LOOK, GESTURE_MOVE_FREE } from '../src/ui/idle-keys.js';
import { COUNTED, TWICE } from '../src/ui/gpu-probe.js';

const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');

// ── Group 1: the ruler ──
test('the refresh is told from the lower quartile of the intervals, even with half the frames dropped', () => {
  const at120 = Array.from({ length: 200 }, (_, i) => (i % 2 ? 16.67 : 8.33));
  assert.equal(refreshOf(at120), 120);
  assert.equal(refreshOf(Array.from({ length: 100 }, () => 16.7)), 60);
  assert.equal(refreshOf(Array.from({ length: 99 }, (_, i) => (i % 3 ? 22.2 : 11.1))), 90, 'two in three frames missed');
  // Safari at 60 Hz under load: a late frame (26 ms) then a short one (7 ms) one time in eight, the rest 16 and 17 (1 ms clock).
  const safari = Array.from({ length: 400 }, (_, i) => (i % 16 === 0 ? 26 : i % 16 === 1 ? 7 : i % 2 ? 16 : 17));
  assert.equal(refreshOf(safari), 60);
  assert.equal(refreshOf([8.3, 8.3]), 0, 'too few to tell');
});

test('frame intervals are binned in refreshes: at 120 Hz a frame is on time under 12.5 ms, and p50/p95/p99 are given', () => {
  const s = intervalStats([8.3, 8.4, 12.4, 12.6, 16.7, 25, 34, 50], 120);
  assert.deepEqual(s.bins, [3, 2, 1, 2]);
  assert.equal(s.p50.toFixed(1), '16.7');
  assert.equal(s.p99, 50);
  assert.equal(intervalLine(s), '  frame intervals at 120 Hz (8.3 ms): on time 3, 1 missed 2, 2 missed 1, 3+ missed 2; p50 16.7, p95 50.0, p99 50.0 ms');
  assert.equal(intervalLine(null), '  frame intervals: too few to tell the refresh');
  // At 60 Hz the same 16.7 ms frame is on time.
  assert.deepEqual(intervalStats([16.7, 16.6, 33.3], 60).bins, [2, 1, 0, 0]);
});

test('each surface\'s callbacks are set against the frames it really drew, over the window', () => {
  const a = { asks: { stage: 100, glass: 40 }, drawn: { stage: 90 } }, b = { asks: { stage: 340, glass: 160, doppler: 5 }, drawn: { stage: 210, glass: 3 } };
  assert.equal(surfaceLine(a, b), '  surfaces (callbacks / draws): stage 240 / 120, glass 120 / 3, doppler 5');
  assert.equal(surfaceLine(b, b), '');
});

// ── Group 2: the same picture for less work ──
test('G1: a pan takes the width step instead of the whole update; a zoom or a turn still takes the update', () => {
  const s = stageSource();
  const fn = s.slice(s.indexOf('  function stepWidths() {'), s.indexOf('  // In the same way, while the organs ease'));
  assert.match(fn, /if \(!f \|\| f !== (?:live\.)?(?:live\.)?widthF \|\| (?:live\.)?(?:live\.)?storeVer !== (?:live\.)?(?:live\.)?widthVer \|\| !(?:live\.)?(?:live\.)?widthCTM \|\| (?:live\.)?(?:live\.)?coilEasing \|\| (?:live\.)?(?:live\.)?organsEasing \|\| (?:live\.)?(?:live\.)?catchUp \|\| bandsMoving\(\) \|\| lesionsMoving\(\)\) return false;/);
  assert.match(fn, /if \(!(?:live\.)?CTM\) refreshCTM\(\);/);
  assert.match(fn, /if \((?:live\.)?CTM !== (?:live\.)?widthCTM && \((?:live\.)?CTM\.sc !== (?:live\.)?widthCTM\.sc \|\| (?:live\.)?CTM\.a !== (?:live\.)?widthCTM\.a \|\| (?:live\.)?CTM\.b !== (?:live\.)?widthCTM\.b\)\) return false;/);
});

test('G3: a gesture\'s own classes keep no layout watch due and make no label read again; a class that moves a bar still does', () => {
  assert.ok(onlyClasses('stage-view gl-on', 'stage-view gl-on panning pinch-hide', GESTURE_MOVE_FREE));
  assert.ok(onlyClasses('a b', 'b a', GESTURE_MOVE_FREE), 'the same classes');
  assert.ok(!onlyClasses('app', 'app figure-focus', GESTURE_MOVE_FREE), 'the phone\'s bars and zoom pill move with figure-focus');
  assert.ok(!onlyClasses('app', 'app stage-busy', GESTURE_MOVE_FREE), 'stage-busy fades placed pieces: still watched');
  assert.ok(onlyClasses('app', 'app stage-busy figure-focus', GESTURE_LOOK), 'but changes no label\'s look');
  assert.ok(!onlyClasses('stage-view', 'stage-view in-lobule panning', GESTURE_LOOK));
  const el = (cls) => ({ nodeType: 1, cls, getAttribute: () => cls, matches: () => true, querySelector: () => null });
  assert.ok(classOnly({ type: 'attributes', attributeName: 'class', oldValue: 'stage-view', target: el('stage-view panning') }, GESTURE_MOVE_FREE));
  assert.ok(!classOnly({ type: 'attributes', attributeName: 'style', oldValue: '', target: el('x') }, GESTURE_MOVE_FREE));
  // A watch over fake observers (the measured groups' and the page's): a pan's class settles it, a card's class wakes it.
  for (const which of [0, 1]) {
    let t = 0;
    const cbs = [];
    const MO = class { constructor(f) { cbs.push(f); } observe() {} takeRecords() { return []; } };
    const w = createLayoutWatch({ root: { querySelectorAll: () => [], ownerDocument: null }, settle: 100, now: () => t, MO, RO: null });
    t = 200;
    assert.equal(w.due(), false, 'settled');
    cbs[which]([{ type: 'attributes', attributeName: 'class', oldValue: 'stage-view gl-on', target: el('stage-view gl-on panning') }]);
    assert.equal(w.due(), false, `a pan's class: still settled (${which})`);
    cbs[which]([{ type: 'attributes', attributeName: 'class', oldValue: 'pz-data stage-blocker', target: el('pz-data stage-blocker pz-open') }]);
    assert.equal(w.due(), true, `a card's class: due (${which})`);
  }
  // (A gesture's classes read no label again: no observer watches the ancestors, the look's writers tell the layers, tests/label-theme.test.js.)
});

test('H3: the glass canvases hold at most 2 device px per CSS px; the labels too (2 Nov: capped at 2x)', async () => {
  globalThis.window = globalThis;
  const { glassDpr } = await import('../src/ui/glass-gl.js');
  for (const [d, k] of [[3, 2], [2, 2], [1.5, 1.5], [1, 1], [undefined, 1]]) { globalThis.devicePixelRatio = d; assert.equal(glassDpr(), k, `${d}`); }
  delete globalThis.devicePixelRatio;
  const g = src('glass-gl.js');
  assert.doesNotMatch(g.replace(/export const glassDpr = [^\n]+/, ''), /devicePixelRatio/, 'every density in the glass is the capped one');
  assert.match(src('label-gl.js'), /const hostK = \(\) => \(host\.scale \? host\.scale\(\) : 0\) \|\| devicePixelRatio \|\| 1;/, 'labels at the figure canvas\'s capped density');
});

test('H4b: the glass observer asks for the glass\'s frame; it never draws in a microtask', () => {
  const g = src('glass-gl.js');
  assert.match(g, /const mo = new MutationObserver\(\(recs\) => \{ if \(!recs\?\.length \|\| changed\(recs\)\) measureEarly\(\); quiet = 0; ask\(\); \}\);/);
  assert.doesNotMatch(g, /queueMicrotask|batched/);
});

test('H6: a still catheter repaints only its box (now and as last drawn), whole there; else, or past half the picture, the whole picture', () => {
  const v = src('veins-gl.js');
  const comp = v.slice(v.indexOf('    composite(look, blood = NOBLOOD, full = false, part = 0) {'), v.indexOf('    /** Whether organ outlines can be drawn here'));
  // (A catheter that asks to be drawn whole every frame, EUS-PPG's scope, never takes the box: Mohammad, 6 Nov 2026, it flickered.)
  assert.match(comp, /if \(cath && !moving && cathAt && !cath\.whole\) \{/);
  // (The boxes are kept arrays written in place: the box now, the box last drawn in and their union.)
  assert.match(comp, /u\[0\] = Math\.min\(b\[0\], cathAt\[0\]\); u\[1\] = Math\.min\(b\[1\], cathAt\[1\]\); u\[2\] = Math\.max\(b\[2\], cathAt\[2\]\); u\[3\] = Math\.max\(b\[3\], cathAt\[3\]\);/);
  assert.match(comp, /if \(\(u\[2\] - u\[0\]\) \* \(u\[3\] - u\[1\]\) <= PW\(\) \* PH\(\) \/ 2\) cathRect = u;/);
  assert.match(comp, /if \(\(cath && !cathRect\) \|\| cathWas && !cath\) full = true;/, 'a moving view, the first frame and the frame after it is gone: whole');
  // In the box: the whole build with no outline layer, the catheter, then the outlines: exactly the whole picture's order there.
  const box = comp.slice(comp.indexOf('      if (cathRect) {'), comp.indexOf('      } else if (cath) gpuProbe'));
  const order = ['gl.scissor(cathRect[0], PH() - cathRect[3]', 'compBind(cathPass.u, false, glow, warm, useStack);', 'UC.i1(cathPass.u.stillOn, 0);', 'UC.i1(cathPass.u.bloodOnly, 0);', 'gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);', 'gpuProbe.time(gl, \'catheter\', cathT)', 'if (hard) gpuProbe.time(gl, \'outlines\', linesT);', 'gl.disable(gl.SCISSOR_TEST);'];
  let at = -1;
  for (const k of order) { const i = box.indexOf(k); assert.ok(i > at, k); at = i; }
  assert.match(comp, /const cathPass = cathRect \? \(bare \? plain : comp\) : null;/, 'the whole picture\'s own build');
  assert.match(comp, /cathAt = cath \? cathBox\(m, BOX_AT\) : null;/, 'where it was drawn, for the next frame');
  // The box takes every vertex the draws use, base and frame alike, and a margin.
  const fn = v.slice(v.indexOf('  function cathBox(m, into) {'), v.indexOf('  function drawCath(m) {'));
  assert.match(fn, /for \(let i = d\.first, e = d\.first \+ d\.count; i < e; i\+\+\) \{\n\s+const a = i < nb \? base : V, o = \(i < nb \? i : i - nb\) \* 6;/);
  assert.match(fn, /Math\.floor\(x0\) - 2/);
  assert.match(fn, /Math\.ceil\(y1\) \+ 2/);
});

test('H7: the pressure strip and the vitals monitor scroll at the pace the figure\'s steady motion keeps (every frame by default)', () => {
  const pt = src('pressure-time.js'), vm = src('vitals-monitor.js');
  assert.match(pt, /const pace = paceMs\(\);\n\s+if \(pace && now - tickAt < pace\) return;\n\s+tickAt = now;\n\s+draw\(\);/);
  assert.match(vm, /if \(!pace \|\| now - loopAt >= pace\) \{ loopAt = now; draw\(now\); noteDraw\('vitals-monitor'\); \}\n\s+loopRaf = nextFrame\(loop\);/);
});

test('H10: the FibroScan probe\'s tap restarts with no style read and no layout (1 Nov 2026: two copies of its animation, turned between)', () => {
  const s = stageSource();
  assert.doesNotMatch(s, /void scan\.el\.offsetWidth/);
  assert.doesNotMatch(s, /void getComputedStyle\(scan\.el/);
  assert.match(s, /scan\.tapB = !scan\.tapB; scan\.el\.classList\.toggle\('tap', !scan\.tapB\); scan\.el\.classList\.toggle\('tap2', scan\.tapB\);/);
});

test('none of the visible trade-offs changed their defaults', async () => {
  const { figLab, figOpt, renderSetting, paceMs } = await import('../src/ui/frame.js');
  assert.equal(figLab('motion60'), true);   // (on by default since 4 Nov 2026: steady motion at 60 a second, the camera and labels at the screen's rate)
  assert.equal(figLab('pinchLow'), false);
  assert.equal(figLab('glassCache'), false);
  assert.equal(renderSetting(), 1);
  assert.equal(figOpt('move'), 1);
  assert.equal(paceMs(), 10);
});
