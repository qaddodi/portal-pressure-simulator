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
  assert.match(lz, /const pace = calmNow \? Math\.max\(paceMs\(\), calmFlowGapFor\(cheap\), restGapFor\(now, calmAt\)\) : paceMs\(\)/);
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
  // (Rest pacing counts from restAt, which the model's own vessel updates do not stamp, and holds frames whether or not the figure is calm, 12 Nov 2026.)
  assert.match(fn, /const restGap = restGapFor\(now, restAt\);/);
  assert.match(fn, /const interval = calm \? Math\.max\(base, CALM_MS, restGap\) : Math\.max\(base, restGap\);/);
  assert.match(fn, /if \(viewMoved \|\| forceDraw \|\| drawOnce \|\| restOn \|\| restU !== 1\) busyAt = restAt = now;/);
  // (A held frame at rest waits on a timer (parkFor) instead of asking every screen frame, 12 Nov 2026; any other held frame asks the next one.)
  assert.match(fn, /if \(interval && !viewMoved && !forceDraw && now - flowGate < interval\) \{ if \(restGap && parkFor\(interval - \(now - flowGate\)\)\) return; askAnimate\(\); return; \}/);
  assert.match(stage, /const parkFor = \(left\) => \{ if \(left < 18\) return false; if \(!parkT\) parkT = stageScope\.timer\(parkWake, left - 8\); return true; \};/);
  assert.match(stage, /if \(!\(restGap && restAt !== now && parkFor\(interval\)\)\) askAnimate\(\);/);
  const restLine = stage.split('\n').find((l) => l.includes('restAt = now;   // (motion of the figure itself'));
  assert.ok(restLine && !/veinsRows|widthEasing|colEasing|veinsDirty|glowSync/.test(restLine), 'the model\'s own vessel updates never stamp restAt');
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


// ── Brief H1 (10 Nov 2026): rest pacing on touch devices ──
async function freshRest(touch) {
  const { f } = await freshFrame();
  f.setRestTouch(touch);
  return f;
}
// (A loop's draw rule, as the three loops have it: a frame is drawn when now − last drawn ≥ the gap; no phase is carried.)
const drawnPerSecond = (hz, gap) => { let last = -1e9, n = 0; for (let t = 0; t < 1000; t += 1000 / hz) if (t - last >= gap) { last = t; n++; } return n; };

test('H1: on a touch device the gap is 0 for 4 s after an input, 28 ms after that, 62 ms after 30 s, and 0 on the frame after any input', async () => {
  const f = await freshRest(true);
  const t0 = 100000;
  f.noteInput(t0);
  assert.equal(f.restGapFor(t0 + 1), 0, 'just touched');
  assert.equal(f.restGapFor(t0 + f.REST_AFTER_MS - 1), 0, 'under 4 s');
  assert.equal(f.restGapFor(t0 + f.REST_AFTER_MS), f.REST_MS, '4 s: 28 ms');
  assert.equal(f.restGapFor(t0 + f.IDLE_AFTER_MS - 1), f.REST_MS, 'under 30 s still 28');
  assert.equal(f.restGapFor(t0 + f.IDLE_AFTER_MS), f.IDLE_MS, '30 s: 62 ms');
  assert.equal(f.REST_MS, 28); assert.equal(f.IDLE_MS, 62); assert.equal(f.REST_AFTER_MS, 4000); assert.equal(f.IDLE_AFTER_MS, 30000);
  f.noteInput(t0 + 31000);
  assert.equal(f.restGapFor(t0 + 31001), 0, 'the frame after an input is drawn at once, at the full rate');
  assert.equal(f.restGapFor(t0 + 31000 + f.REST_AFTER_MS), f.REST_MS, 'and the clock runs again');
  for (const hz of [60, 120]) {
    assert.ok(Math.abs(drawnPerSecond(hz, f.REST_MS) - 30) <= 1, `${hz} Hz screen: 30 a second at rest`);
    assert.ok(Math.abs(drawnPerSecond(hz, f.IDLE_MS) - 15) <= 1, `${hz} Hz screen: 15 a second idle`);
  }
});

test('H1: a loop\'s own busy stamp (a camera move, glide, view switch, slide change, time-lapse step, model change) restarts the rest clock; the heartbeat is not a stamp', async () => {
  const f = await freshRest(true);
  f.noteInput(1000);
  assert.equal(f.restGapFor(1000 + 20000, 1000 + 19000), 0, 'something moved 1 s ago');
  assert.equal(f.restGapFor(1000 + 20000, 1000 + 15000), f.REST_MS, '5 s ago: rest');
  assert.equal(f.restGapFor(1000 + 40000, 1000 + 8000), f.IDLE_MS, '39 s since the input, 32 s since the stamp: idle');
  assert.equal(f.restGapFor(1000 + 40000, 1000 + 15000), f.REST_MS, '25 s since the stamp: rest');
  // (inMotion: a transition in flight counts as motion; read with the module's own clock.)
  const g = await freshRest(true);
  g.noteInput(0);
  const end = g.beginMotion('test', 60000);
  const now = performance.now();
  assert.equal(g.restGapFor(now + 50000), 0, 'a transition still running is motion');
  end();
  assert.equal(g.restGapFor(now + 50000 + 1000), 0, 'the clock restarts from the last frame it moved');
  assert.equal(g.restGapFor(now + 60000), g.REST_MS, 'and once it ends the clock goes on');
  assert.equal(g.restGapFor(now + 90000), g.IDLE_MS);
});

test('H1: rest pacing is on for every device by default (the Mac too, 12 Nov 2026); turned off it is 0; ?rest=off turns it off', async () => {
  const { f: d } = await freshFrame();
  d.noteInput(0);
  assert.equal(d.restGapFor(5000), d.REST_MS, 'on by default, whatever the pointer');
  const f = await freshRest(false);
  f.noteInput(0);
  for (const t of [1, 4000, 29999, 30000, 1e6]) assert.equal(f.restGapFor(t), 0, `pacing off at ${t}`);
  const g = await freshRest(true);
  g.noteInput(0);
  assert.equal(g.restGapFor(5000), g.REST_MS);
  g.setRestOff(true);
  assert.equal(g.restGapFor(5000), 0, '?rest=off');
  assert.equal(g.restGapFor(40000), 0);
});

test('H1: Battery saver wins when larger; a talk at rest holds 30 a second, then 20 after 30 s, never 15; Explore may reach 15', async () => {
  const f = await freshRest(true);
  f.noteInput(0);
  f.setSaver(true);
  assert.equal(f.restGapFor(5000), f.SAVER_MS, 'saver\'s gap is larger than 28');
  assert.equal(f.restGapFor(40000), f.SAVER_MS, 'and than 62');
  assert.equal(f.restGapFor(100), 0, 'before rest nothing is added (the loop\'s own saver gap stands)');
  f.setSaver(false);
  let talk = true;
  f.setRestTalk(() => talk);
  assert.equal(f.restGapFor(5000), f.REST_MS, 'a talk after 4 s: 30 a second');
  assert.equal(f.restRuleText(), 'rest 30 Hz');
  assert.equal(f.restGapFor(29999), f.REST_MS, 'a talk under 30 s: still 30');
  assert.equal(f.restGapFor(40000), f.TALK_IDLE_MS, 'a talk after 30 s: 20, never 15');
  assert.equal(f.restGapFor(1e6), f.TALK_IDLE_MS);
  assert.equal(f.restRuleText(), 'talk idle 20 Hz');
  talk = false;
  assert.equal(f.restGapFor(40000), f.IDLE_MS, 'Explore: 15 a second');
  assert.equal(f.restRuleText(), 'idle 15 Hz');
});

test('H1: the Mac\'s other gaps are untouched; every kind of input reaches the rest clock through idle-rest', async () => {
  const f = await freshRest(false);
  // The Mac: the lobule's rule 6, P1 and the flow gap are as before.
  assert.equal(f.calmFlowGapFor(), f.CALM_FLOW_MS); assert.equal(f.calmFlowGapFor(true), 0); assert.equal(f.frameGapFor('flow'), f.MOTION60_MS);
  const { createIdleRest } = await import('../src/ui/idle-rest.js');
  const seen = [];
  const listeners = new Map();
  const target = { addEventListener: (t, fn) => listeners.set(t, fn), removeEventListener() {} };
  const ir = createIdleRest({ target, onInput: (t) => seen.push(t), now: () => 77, setTimer: () => 1, clearTimer() {}, doc: null });
  for (const t of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll', 'focusin']) listeners.get(t)();
  assert.deepEqual(seen, [77, 77, 77, 77, 77, 77, 77], 'every kind of input reaches the rest clock');
  ir.dispose();
});
