import { stageSource } from './stage-src.js';
// Settings › Figure performance (30 Oct, Round 3 of the resolution review): one switch per idea, each off by default, and off
// changes nothing: every path a switch adds is behind its own check, and the code it leaves runs as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');
const main = src('main.js');
const settings = main.slice(main.indexOf('function openSettings('), main.indexOf('function presenterSettings('));

async function freshFrame(store = new Map()) {
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const f = await import(`../src/ui/frame.js?t=lab${Math.random()}`);
  return { f, store };
}

test('every switch is off by default, stored only when on, heard by its own listeners and not by the resolution', async () => {
  const { f, store } = await freshFrame();
  for (const [k, v] of Object.entries(f.FIG_LAB)) assert.equal(f.figLab(k), v[0], `${k} off by default`);
  let lab = 0, res = 0;
  f.onFigLab(() => lab++);
  f.onRenderScale(() => res++);
  for (const [k, v] of Object.entries(f.FIG_LAB)) f.setFigLab(k, v[1]);
  f.setFigLab('motion60', false); f.setFigLab('nope', true); f.setFigLab('glassCache', 2);   // (no change, or not a choice: not heard)
  assert.equal(lab, Object.keys(f.FIG_LAB).length);
  assert.equal(res, 0, 'no switch reallocates the canvas or redraws for a resolution');
  for (const k of Object.keys(f.FIG_LAB)) assert.ok(store.has(`pps.fig.${k}`));
  for (const [k, v] of Object.entries(f.FIG_LAB)) f.setFigLab(k, v[0]);
  for (const k of Object.keys(f.FIG_LAB)) assert.ok(!store.has(`pps.fig.${k}`), `${k} off stores nothing`);
  delete globalThis.localStorage;
});

test('a stored value is read back; a stored value that is not a choice is ignored', async () => {
  const { f } = await freshFrame(new Map([['pps.fig.motion60', 'false'], ['pps.fig.glassCache', '7']]));
  assert.equal(f.figLab('motion60'), false);
  assert.equal(f.figLab('glassCache'), false);
  delete globalThis.localStorage;
});

// (31 Oct, premium-feel R14: the Figure performance heading and its switches are no longer in Settings; each stays, off, in the code.
// tests/settings-product.test.js pins that they are gone and that what a build stored for them is cleared at start.)
test('no Figure performance heading or switch in Settings', () => {
  assert.equal(settings.split("'Figure performance'").length - 1, 0);
  assert.doesNotMatch(main, /function figLabRows\(|setFigLab\(/);
  const { FIG_LAB } = { FIG_LAB: Object.fromEntries([...src('frame.js').match(/export const FIG_LAB = \{([^}]+)\}/)[1].matchAll(/(\w+): \[/g)].map((m) => [m[1], 1])) };
  for (const k of Object.keys(FIG_LAB)) assert.doesNotMatch(settings, new RegExp(`'${k}'`), `${k} has no row`);
});

test('Motion at 60 (on by default since 4 Nov 2026): paceMs is 10 ms (every other frame at 120 Hz, every frame at 60 or 90 Hz); off, 0', async () => {
  const { f } = await freshFrame();
  assert.equal(f.paceMs(), f.MOTION60_MS, 'on by default');
  // (The readers skip a frame when now − last drawn < paceMs(), and set last drawn to now.)
  const drawn = (gap) => { let last = 0, n = 0; for (let t = gap; t < 1000; t += gap) if (t - last >= f.paceMs()) { last = t; n++; } return n; };
  assert.ok(Math.abs(drawn(1000 / 120) - 60) <= 1, '120 Hz: about 60 a second');
  assert.ok(Math.abs(drawn(1000 / 60) - 60) <= 1, '60 Hz: all of them');
  assert.ok(Math.abs(drawn(1000 / 90) - 90) <= 1, '90 Hz: all of them');
  f.setSaver(true);
  assert.equal(f.paceMs(), f.SAVER_MS, 'Battery saver still wins');
  f.setSaver(false); f.setFigLab('motion60', false);
  assert.equal(f.paceMs(), 0, 'off: every frame');
  delete globalThis.localStorage;
});

test('Lobule rec 6 (6 Nov 2026): a calm lobule draws its blood-only frames at 30 Hz; the flow gap, a hand and a moving lobule stay at the glide rate', async () => {
  const { f } = await freshFrame();
  assert.equal(f.frameGapFor('flow'), f.MOTION60_MS, 'the anatomy and the sinusoid keep the flow gap');
  assert.equal(f.calmFlowGapFor(), f.CALM_FLOW_MS);
  const rate = (hz, gap) => { let last = -1e9, n = 0; for (let t = 0; t < 1000; t += 1000 / hz) if (t - last >= gap) { last = t; n++; } return n; };
  for (const hz of [60, 90, 120]) assert.ok(Math.abs(rate(hz, f.calmFlowGapFor()) - 30) <= 1, `${hz} Hz screen: 30 a second`);
  f.setSaver(true);
  assert.equal(f.calmFlowGapFor(), f.SAVER_MS, 'Battery saver still wins');
  f.setSaver(false); f.setFigLab('motion60', false);
  assert.equal(f.calmFlowGapFor(), 0, 'Motion at 60 off lifts the cap');
  delete globalThis.localStorage;
  // The lobule's loop takes it only once calm: anything moving, a hand included, resets calmAt and the gap is the glide's.
  const lz = src('lobule-zoom.js');
  assert.match(lz, /const pace = calmNow \? Math\.max\(paceMs\(\), calmFlowGapFor\(cheap\)\) : paceMs\(\)/);
  assert.match(lz, /cheap = calmNow && gl\?\.tubeStage\?\.\(\) === 3/);
  assert.match(lz, /handOn\(\) \|\| fade < 0\.98[^\n]*\) calmAt = now;/);
});

test('Tube speed plan P1 (10 Nov 2026): a calm lobule drawn by Tube stage 3 takes the blood at the screen\'s rate; saver and the other renderers keep their caps', async () => {
  const { f } = await freshFrame();
  assert.equal(f.calmFlowGapFor(), f.CALM_FLOW_MS, 'default: 30 Hz');
  assert.equal(f.calmFlowGapFor(false), f.CALM_FLOW_MS, 'Classic, Mesh, Tube 1 and 2: 30 Hz');
  assert.equal(f.calmFlowGapFor(true), 0, 'Tube stage 3: every frame');
  assert.equal(f.frameGapFor('flow'), f.MOTION60_MS, 'the anatomy and the sinusoid are unchanged');
  assert.equal(f.calmFlowRule(false), 'calm 30 Hz');
  assert.equal(f.calmFlowRule(true), 'calm every frame (tube 3)');
  f.setSaver(true);
  assert.equal(f.calmFlowGapFor(true), f.SAVER_MS, 'Battery saver: 15 Hz either way');
  assert.equal(f.calmFlowGapFor(false), f.SAVER_MS);
  assert.match(f.calmFlowRule(true), /15 Hz/);
  f.setSaver(false); f.setFigLab('motion60', false);
  assert.equal(f.calmFlowGapFor(false), 0);
  assert.equal(f.calmFlowRule(false), 'calm every frame (Motion at 60 off)');
  f.noteCalmRule('calm 30 Hz'); assert.equal(f.calmRuleText(), 'calm 30 Hz'); f.noteCalmRule(''); assert.equal(f.calmRuleText(), '');
  delete globalThis.localStorage;
});

test('Motion at 60 in the figure loop: off, the interval and the gate are as before; on, no phase is carried; view moves never wait', () => {
  const stage = stageSource();
  const fn = stage.slice(stage.indexOf('function animate(now)'), stage.indexOf('const dt = Math.min(0.1, (now - lastT) / 1000);', stage.indexOf('function animate(now)')));
  assert.match(fn, /const m60 = !paceOf\(quality\) && figLab\('motion60'\);/);
  // (Since the frame governor, 4 Nov 2026: the base gap is the governor's 'glide' gap (MOTION60_MS) on, paceOf(quality) off; a calm frame
  // (only the blood moving) is held to CALM_MS at least.)
  assert.match(fn, /const base = m60 \? frameGapFor\('glide'\) : paceOf\(quality\);/);
  assert.match(fn, /const interval = calm \? Math\.max\(base, CALM_MS\) : base;/);
  assert.match(fn, /if \(interval && !viewMoved && !forceDraw && now - flowGate < interval\) \{ askAnimate\(\); return; \}/);
  assert.match(fn, /flowGate = interval && \(!m60 \|\| calm\) \? now - \(\(now - flowGate\) % interval\) : now;/);
  // (Off: m60 false, so the gate is `interval ? … : now`, the old line exactly. On and not calm: no phase is carried.)
  const gate = (m60, interval, now, flowGate, calm = false) => (interval && (!m60 || calm) ? now - ((now - flowGate) % interval) : now);
  const old = (interval, now, flowGate) => (interval ? now - ((now - flowGate) % interval) : now);
  for (const [i, n, g] of [[0, 100, 90], [1000 / 15, 200, 120], [1000 / 8, 500, 300]]) assert.equal(gate(false, i, n, g), old(i, n, g));
  // (On, at 120 Hz: drawn every other frame, never two in a row.)
  let flowGate = 0, drawn = 0, prev = -1, twice = false;
  for (let k = 1; k <= 120; k++) {
    const now = (k * 1000) / 120;
    if (now - flowGate < 10) continue;
    flowGate = gate(true, 10, now, flowGate); drawn++;
    if (prev === k - 1) twice = true;
    prev = k;
  }
  assert.equal(drawn, 60); assert.ok(!twice);
});

test('Credit check in talks: off, Present looks every second as before; on, only on the same signs as outside a talk', () => {
  const credit = src('credit.js');
  // (The lobule and the sinusoid no longer look every second since 1 Nov 2026: their view and gliding names are in the key.)
  assert.match(credit, /if \(watch\.due\(\) \|\| k !== polled \|\| \(app\?\.classList\.contains\('presenting'\) && !figLab\('creditLean'\)\)\) soon\(\);/);
  assert.match(stageSource(), /labelStamp: \(\) => `\$\{stats\.layouts\}\|\$\{vt\.k\},\$\{vt\.x\},\$\{vt\.y\}\|\$\{morph\}\|\$\{rotU\}\|\$\{lz\?\.isOpen\?\.\(\) \? lz\.viewKey\(\) : ''\}\|\$\{lz\?\.sinusoidMoving\?\.\(\) \? performance\.now\(\) : ''\}`,/);
});

test('Lymph is dashes the vessel composite lays from flow rows: no drops, beads or eraser are built on the CPU or drawn by the overlay', () => {
  // (6 Nov 2026, "dashes in the channel": the drops, their beads and the eraser that cut them away under the blood were ~16k instanced capsules
  // and two full-screen passes a frame for a drift of ~10 px/s. The overlay keeps only the collagen lining, which does not move.)
  const lz = src('lobule-zoom.js');
  const fx = lz.slice(lz.indexOf('  function fxOnGPU(W, H, dpr, dark, dt, can) {'), lz.indexOf('\n  }\n', lz.indexOf('  function fxOnGPU(W, H, dpr, dark, dt, can) {')));
  assert.doesNotMatch(lz, /lyDrops|lyPut|fxGLErase|fxDI|fxBI/);
  assert.match(fx, /lymph\.drops = fxNone; lymph\.beadRings = fxNone; lymph\.erase = fxNone;/, 'nothing but the lining goes to the overlay');
  assert.match(fx, /if \(moving\) fxGLKey = '';/, 'a moving overlay is drawn every frame, a still one only when it changes');
  assert.match(lz, /fxMovesArg = \{ lymph: false,/, 'the lymph no longer keeps the overlay awake');
  assert.doesNotMatch(lz, /function paintFx\(|lyTiles|lyKey|fxBoxes/);
});

// (31 Oct, laptop heat H7: the credit's lean look is the default. In Present the credit's look measures every card and label, and it ran every
// second whatever had happened. A stored "false" is read back too, so a choice made before it stays; no screen offers the switch.)
test('H7: the credit looks again in a talk only when the layout may have changed, by default', async () => {
  const { f } = await freshFrame();
  assert.equal(f.figLab('creditLean'), true);
  assert.equal(f.FIG_LAB.creditLean[0], true);
  f.setFigLab('creditLean', false);
  assert.equal(f.figLab('creditLean'), false);
  const again = await freshFrame(new Map([['pps.fig.creditLean', 'false']]));
  assert.equal(again.f.figLab('creditLean'), false, 'a stored off is read back');
  delete globalThis.localStorage;
});

test('the lymph rows are written in place once a frame, and the overlay buffers still grow only when outgrown', () => {
  const lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
  const fx = readFileSync(new URL('../src/ui/fx-gl.js', import.meta.url), 'utf8');
  assert.match(lz, /mo\.ld = \(\(\(\(mo\.ld \?\? t\.id \* 0\.371 \* pitch\)/, 'the dashes\' phase kept in the tube\'s motion record');
  assert.match(lz, /flowData\[o\+ 4\] = -1|flowData\[o \+ 4\] = -1/, 'a lymph row is marked f1.x = -1');
  assert.match(fx, /if \(data\.byteLength <= B\.cap\) gl\.bufferSubData\(gl\.ARRAY_BUFFER, 0, data\);/);
  assert.match(fx, /const dropsOn = !!lymph && lymph\.drops\.length > 0;/, 'no coverage target without drops');
});

