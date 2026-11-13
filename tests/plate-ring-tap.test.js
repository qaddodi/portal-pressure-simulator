// The cutouts plate's ring on the liver is the button that opens a shut lobule window again (13 Nov 2026, Mohammad: "i can't open the lobule
// anymore when i close it"). The real stage booted in node (stage-gl-boot.js), the real frame (cutout-frame-gl.js) with its spot on the figure,
// and real pointer events on the figure's svg: one press on the ring toggles the window once, in every state the figure can be in; the fallback
// listener (plate-ring-tap.js) only acts when the gesture code did not; and the shut window's chip stands inside the plate's room.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootGL, pump } from './stage-gl-boot.js';
import { createRingTap } from '../src/ui/plate-ring-tap.js';
import { plateRects } from '../src/ui/cutouts.js';

const tasks = () => new Promise((r) => setImmediate(r));

// (One stage for the file: a second boot in one process mixes two pages.)
let booted = null;
async function setup() {
  if (booted) { const b = await booted; b.set(false); for (let i = 0; i < 20; i++) await b.frame(); pump(400); const o = {}; b.gl.box(o); b.ring = [(o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2]; return b; }
  return (booted = boot());
}
async function boot() {
  const { st, page, frame } = await bootGL({});
  const { createCutoutFrame } = await import('../src/ui/cutout-frame-gl.js');
  const gl = createCutoutFrame({ top: () => st.figureTop?.() ?? null, xform: (o) => st.figureXform(o) });
  const win = { x: 800, y: 200, w: 300, h: 300, r: 150 };
  const world = { spot: [400, 400] };
  const plan = (open) => ({ win, free: { l: 12, t: 64, r: 1100, b: 700 }, open, spot: world.spot });
  const S = { open: false, toggles: 0 };
  const set = (open) => { S.open = open; S.toggles++; gl.set(plan(open)); };
  const tap = (cx, cy) => { if (!gl.hit(cx, cy)) return false; set(!S.open); return true; };
  st.onPlateTap(tap, (cx, cy) => gl.hit(cx, cy), (o) => gl.box(o));
  set(false);
  for (let i = 0; i < 30; i++) await frame();
  const svg = page.document.querySelector('#stageView > svg');
  const W = page.document.defaultView;
  const fire = (target, type, x, y, extra = {}) => {
    const e = new W.MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button: 0 });
    Object.defineProperties(e, { pointerId: { value: 1 }, isPrimary: { value: true }, pointerType: { value: extra.type || 'mouse' } });
    target.dispatchEvent(e);
  };
  const click = (x, y, target = svg) => { fire(target, 'pointerdown', x, y); fire(target, 'pointerup', x, y); };
  const o = {};
  assert.ok(gl.box(o), 'the ring shows through the camera');
  const ring = [(o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2];
  return { st, page, frame, gl, S, svg, click, fire, ring, set, W };
}

test('a press on the ring of a shut window opens it, and another shuts it, each time once', async () => {
  const { S, click, ring, frame, gl } = await setup();
  assert.equal(S.open, false);
  click(ring[0], ring[1]);
  assert.equal(S.open, true, 'opened by one press');
  for (let i = 0; i < 20; i++) await frame();
  click(ring[0], ring[1]); pump(400);
  assert.equal(S.open, false, 'shut by the next');
  for (let i = 0; i < 20; i++) await frame();
  pump(400);
  click(ring[0], ring[1]);
  assert.equal(S.open, true);
  assert.ok(gl.hit(ring[0], ring[1]));
});

test('the ring is pressable with no frame drawn since the labels laid themselves out, and after the camera moved', async () => {
  const { st, S, click, ring, frame, gl } = await setup();
  // (The labels' solve asks for the ring's box: that read must leave the press as it was.)
  for (let i = 0; i < 4; i++) st.labelLayoutNow();
  assert.ok(gl.hit(ring[0], ring[1]), 'after a label solve');
  // (Pressed worked out from the camera now: one that has moved with no frame drawn yet puts the ring where the camera puts it.)
  st.zoomIn?.();
  for (let i = 0; i < 40; i++) await frame();
  const o = {}; assert.ok(gl.box(o));
  const at = [(o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2];
  pump(400);
  click(at[0], at[1]);
  assert.equal(S.open, true, 'opened where the camera now has the ring');
});

test('a press beside the ring does nothing', async () => {
  const { S, click, ring } = await setup();
  click(ring[0] + 80, ring[1] + 80);
  assert.equal(S.open, false);
});

test('the fallback listener: acts only when the gesture code did not, and never twice', async () => {
  const listeners = {};
  const target = { addEventListener(t, f) { listeners[t] = f; }, removeEventListener(t) { delete listeners[t]; } };
  let toggles = 0, hits = 0, queued = [];
  const rt = createRingTap({ target, at: (x, y) => Math.hypot(x - 100, y - 100) < 22, toggles: () => toggles, toggle: () => { toggles++; hits++; }, later: (f) => queued.push(f) });
  const ev = (x, y, o = {}) => ({ clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0, ...o });
  const run = () => { const q = queued; queued = []; q.forEach((f) => f()); };
  // the gesture code did not: the fallback opens it
  listeners.pointerdown(ev(100, 100)); listeners.pointerup(ev(100, 100)); run();
  assert.equal(hits, 1);
  // the gesture code did (the count moved before the turn): the fallback leaves it alone
  listeners.pointerdown(ev(100, 100)); listeners.pointerup(ev(100, 100)); toggles++; run();
  assert.equal(hits, 1);
  // a press that moved, one that began off the ring, one that ended off it, a second finger, a right button: none
  listeners.pointerdown(ev(100, 100)); listeners.pointerup(ev(130, 100)); run();
  listeners.pointerdown(ev(300, 300)); listeners.pointerup(ev(100, 100)); run();
  listeners.pointerdown(ev(100, 100)); listeners.pointerup(ev(300, 300)); run();
  listeners.pointerdown(ev(100, 100, { isPrimary: false })); listeners.pointerup(ev(100, 100)); run();
  listeners.pointerdown(ev(100, 100, { button: 2 })); listeners.pointerup(ev(100, 100)); run();
  listeners.pointerdown(ev(100, 100)); listeners.pointercancel?.(); listeners.pointerup(ev(100, 100)); run();
  assert.equal(hits, 1);
  rt.dispose();
  assert.deepEqual(Object.keys(listeners), []);
});

test('on the real stage a press on the ring with the fallback listening opens the window once, not twice', async () => {
  const { S, page, svg, fire, ring, gl, W } = await setup();
  const view = page.document.getElementById('stageView'), t0 = S.toggles;
  createRingTap({ target: view, at: (x, y) => gl.hit(x, y), toggles: () => S.toggles, toggle: () => { S.open = !S.open; S.toggles++; }, later: (f) => setTimeout(f, 0) });
  fire(svg, 'pointerdown', ring[0], ring[1]); fire(svg, 'pointerup', ring[0], ring[1]);
  pump(50);
  assert.equal(S.open, true, 'opened once');
  assert.equal(S.toggles - t0, 1, 'one toggle for one press');
  void W;
});

test('the shut window\'s chip stands wholly inside the plate\'s room, whatever the room', () => {
  const CHIP_W = 104;
  for (const free of [{ l: 460, t: 64, r: 1180, b: 700 }, { l: 12, t: 64, r: 1780, b: 900 }, { l: 600, t: 64, r: 1100, b: 560 }]) {
    for (const kinds of [['lobule'], ['lobule', 'sinusoid'], ['sinusoid']]) {
      const win = plateRects(free, kinds, 'plate')[kinds[0]];
      const left = win.x + win.w - CHIP_W;
      assert.ok(left >= free.l && left + CHIP_W <= free.r, `${JSON.stringify(free)} ${kinds}`);
    }
  }
});

test('a press that lands on a label standing over the ring is the ring\'s, and the label does not open', async () => {
  const { S, page, svg, fire, ring } = await setup();
  const lb = page.document.querySelector('#labels .lb') || page.document.querySelector('.lb');
  assert.ok(lb, 'the stage has labels');
  let clicks = 0; lb.addEventListener('click', () => clicks++);
  const t0 = S.toggles;
  fire(lb, 'pointerdown', ring[0], ring[1]); fire(svg, 'pointerup', ring[0], ring[1]);
  pump(50);
  assert.equal(S.toggles - t0, 1, 'the ring took the press');
  assert.equal(clicks, 0, 'the label did not');
});
