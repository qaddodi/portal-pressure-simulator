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

test('the readout lists every frame that missed the refresh, keeps GPU timing apart, and counts every copy path', () => {
  const r = src('perf-readout.js');
  assert.doesNotMatch(r, /GAP = 20/);
  assert.match(r, /const hz = refreshOf\(recent\), limit = hz \? 1500 \/ hz : 20;/);
  assert.match(r, /cur\.stats = hz \? intervalStats\(cur\.dts, hz\) : null;/);
  assert.match(r, /cur\.surfaces = surfaceLine\(cur\.totals, perf\(\)\.totals\);/);
  assert.match(r, /gpuProbe\.cpuOnly = true; gpuProbe\.on = true;/, 'recordings time script only unless GPU timing is turned on');
  // The two glasses apart (two drawn in a frame are not one drawn twice), and the copies and targets made again.
  assert.notEqual(COUNTED.paneDrawn, COUNTED.glassDrawn);
  assert.ok(TWICE.has(COUNTED.paneDrawn) && TWICE.has(COUNTED.glassDrawn));
  const g = src('glass-gl.js');
  assert.match(g, /gpuProbe\.note\(cards \? COUNTED\.cardCopy : pane \? COUNTED\.paneCopy : COUNTED\.glassCopy\)/);
  assert.match(g, /noteDraw\(cards \? 'glass-cards' : pane \? 'glass-pane' : 'glass'\);/);
  const v = src('veins-gl.js');
  for (const k of ['present', 'fboAlloc']) assert.ok(v.includes(`COUNTED.${k}`), k);
  // (A pan copies nothing since 31 Oct: the layer wraps, so there is no pan blit to count.)
  assert.ok(!v.includes('COUNTED.panBlit') && !('panBlit' in COUNTED));
  const shift = v.slice(v.indexOf('  function shiftLayer('), v.indexOf('  // The binned cells on the CPU'));
  assert.ok(shift.length > 100 && !shift.includes('blitFramebuffer'), 'a pan copies no target');
  assert.ok(v.includes("gpuProbe.note('uploaded: noise'"));
  assert.match(v, /patchGeometry: 'uploads', setRadii: 'uploads', setBend: 'uploads'/);
  const f = src('res-fade.js');
  assert.equal((f.match(/COUNTED\.fadeCopy/g) || []).length, 3, 'the fade\'s three copies');
  for (const n of ['uploaded: patchGeometry', 'uploaded: setBend', 'uploaded: noise']) assert.ok(r.includes(n.slice(10)), n);
});

// ── Group 2: the same picture for less work ──
test('G1: a pan takes the width step instead of the whole update; a zoom or a turn still takes the update', () => {
  const s = src('stage.js');
  const fn = s.slice(s.indexOf('  function stepWidths() {'), s.indexOf('  // In the same way, while the organs ease'));
  assert.match(fn, /if \(!f \|\| f !== widthF \|\| storeVer !== widthVer \|\| !widthCTM \|\| coilEasing \|\| organsEasing \|\| catchUp\) return false;/);
  assert.match(fn, /if \(!CTM\) refreshCTM\(\);/);
  assert.match(fn, /if \(CTM !== widthCTM && \(CTM\.sc !== widthCTM\.sc \|\| CTM\.a !== widthCTM\.a \|\| CTM\.b !== widthCTM\.b\)\) return false;/);
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
  const lg = src('label-gl.js');
  assert.match(lg, /const outer = new MutationObserver\(\(rs\) => \{ if \(rs\.some\(\(r\) => changed\(r\) && !classOnly\(r, GESTURE_LOOK\)\)\) all\(\); \}\);/);
});

test('H3: the glass canvases hold at most 2 device px per CSS px; the labels keep the screen\'s own', async () => {
  globalThis.window = globalThis;
  const { glassDpr } = await import('../src/ui/glass-gl.js');
  for (const [d, k] of [[3, 2], [2, 2], [1.5, 1.5], [1, 1], [undefined, 1]]) { globalThis.devicePixelRatio = d; assert.equal(glassDpr(), k, `${d}`); }
  delete globalThis.devicePixelRatio;
  const g = src('glass-gl.js');
  assert.doesNotMatch(g.replace(/export const glassDpr = [^\n]+/, ''), /devicePixelRatio/, 'every density in the glass is the capped one');
  assert.match(src('label-gl.js'), /const r = svg\.parentElement\.getBoundingClientRect\(\), k = devicePixelRatio \|\| 1;/, 'labels at the screen\'s density');
});

test('H4: a frame of the moving blood alone takes no new copy for the glass and does not wake it; anything else does', () => {
  const v = src('veins-gl.js');
  assert.match(v, /const pictured = \(blood = false\) => \{ if \(blood\) \{ bloodSeq\+\+; return; \} pictureSeq\+\+; for \(const f of onPicture\) f\(\); \};/);
  assert.match(v, /pictured\(!full && !part && !dirt && !pool && !\(fl\?\.ripple && nFluid\) && !cath && bare && same && !figNew\);/);
  // Every upload a blood frame could show, other than the blood's own rows, counts the figure as drawn again.
  const api = v.slice(v.indexOf('  const api = {'));
  for (const k of ['setGeometry(bins)', 'patchGeometry(bins)', 'setRadii(row, r, along = null)', 'setTubes(data)', 'setDye(data)', 'setFluidCells(cells)']) {
    assert.match(api, new RegExp(`    ${k.replace(/[()]/g, '\\$&')} \\{\\n      figVer\\+\\+;`), k);
  }
  assert.doesNotMatch(api.slice(api.indexOf('    setFlow(data) {'), api.indexOf('    setDye(data) {')), /figVer/, 'the blood\'s own rows are the blood');
  // (A curvature row is counted only when it is sent: one the texture already holds changes nothing.)
  assert.match(api, /if \(same\) return;\n[^\n]*\n[^\n]*\n\s*figVer\+\+;\n\s*moved\[row\] = 1;/);
  // The reuse and clear paths are figure changes.
  assert.match(v, /clear\(\) \{ pictured\(\);/);
});

test('H4b: the glass observer asks for the glass\'s frame; it never draws in a microtask', () => {
  const g = src('glass-gl.js');
  assert.match(g, /const mo = new MutationObserver\(\(\) => \{ keptStale = true; quiet = 0; ask\(\); \}\);/);
  assert.doesNotMatch(g, /queueMicrotask|batched/);
});

test('H6: a still catheter repaints only its box (now and as last drawn), whole there; else, or past half the picture, the whole picture', () => {
  const v = src('veins-gl.js');
  const comp = v.slice(v.indexOf('    composite(look, blood = {}, full = false, part = 0) {'), v.indexOf('    /** Whether organ outlines can be drawn here'));
  assert.match(comp, /if \(cath && !moving && cathAt\) \{/);
  assert.match(comp, /u = b && \[Math\.min\(b\[0\], cathAt\[0\]\), Math\.min\(b\[1\], cathAt\[1\]\), Math\.max\(b\[2\], cathAt\[2\]\), Math\.max\(b\[3\], cathAt\[3\]\)\];/);
  assert.match(comp, /if \(u && \(u\[2\] - u\[0\]\) \* \(u\[3\] - u\[1\]\) <= PW\(\) \* PH\(\) \/ 2\) cathRect = u;/);
  assert.match(comp, /if \(\(cath && !cathRect\) \|\| cathWas && !cath\) full = true;/, 'a moving view, the first frame and the frame after it is gone: whole');
  // In the box: the whole build with no outline layer, the catheter, then the outlines: exactly the whole picture's order there.
  const box = comp.slice(comp.indexOf('      if (cathRect) {'), comp.indexOf('      } else if (cath) gpuProbe'));
  const order = ['gl.scissor(cathRect[0], PH() - cathRect[3]', 'compBind(cathPass.u, false, glow, warm, useStack);', 'gl.uniform1i(cathPass.u.stillOn, 0);', 'gl.uniform1i(cathPass.u.bloodOnly, 0);', 'gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);', 'drawCath(m)', 'if (hard) gpuProbe.time(gl, \'outlines\', () => drawLines(m, false));', 'gl.disable(gl.SCISSOR_TEST);'];
  let at = -1;
  for (const k of order) { const i = box.indexOf(k); assert.ok(i > at, k); at = i; }
  assert.match(comp, /const cathPass = cathRect \? \(bare \? plain : comp\) : null;/, 'the whole picture\'s own build');
  assert.match(comp, /cathAt = cath \? cathBox\(m\) : null;/, 'where it was drawn, for the next frame');
  // The box takes every vertex the draws use, base and frame alike, and a margin.
  const fn = v.slice(v.indexOf('  function cathBox(m) {'), v.indexOf('  function drawCath(m) {'));
  assert.match(fn, /for \(let i = d\.first, e = d\.first \+ d\.count; i < e; i\+\+\) \{\n\s+const a = i < nb \? base : V, o = \(i < nb \? i : i - nb\) \* 6;/);
  assert.match(fn, /Math\.floor\(x0\) - 2/);
  assert.match(fn, /Math\.ceil\(y1\) \+ 2/);
});

test('H7: the pressure strip and the vitals monitor scroll at the pace the figure\'s steady motion keeps (every frame by default)', () => {
  const pt = src('pressure-time.js'), vm = src('vitals-monitor.js');
  assert.match(pt, /const pace = paceMs\(\);\n\s+if \(pace && now - tickAt < pace\) return;\n\s+tickAt = now;\n\s+draw\(\);/);
  assert.match(vm, /if \(!pace \|\| now - loopAt >= pace\) \{ loopAt = now; draw\(now\); noteDraw\('vitals-monitor'\); \}\n\s+loopRaf = nextFrame\(loop\);/);
});

test('H10: the FibroScan probe\'s tap restarts with a style read, not a layout of the whole page', () => {
  const s = src('stage.js');
  assert.doesNotMatch(s, /void scan\.el\.offsetWidth/);
  assert.match(s, /scan\.el\.classList\.remove\('tap'\); void getComputedStyle\(scan\.el\.querySelector\('\.sp-tip'\) \|\| scan\.el\)\.animationName; scan\.el\.classList\.add\('tap'\);/);
});

test('none of the visible trade-offs changed their defaults', async () => {
  const { figLab, figOpt, renderSetting, paceMs } = await import('../src/ui/frame.js');
  assert.equal(figLab('motion60'), false);
  assert.equal(figLab('pinchLow'), false);
  assert.equal(figLab('glassCache'), false);
  assert.equal(renderSetting(), 1);
  assert.equal(figOpt('move'), 1);
  assert.equal(paceMs(), 0);
});
