import { test } from 'node:test';
import assert from 'node:assert/strict';

// Performance recommendations A2 to A5 and D1 (the figure's GPU present): exact changes to which passes load, which
// frame presents how often, and what the overlays' lay and a trim touch. The GL context is recorded, not run.

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver = class { observe() {} disconnect() {} takeRecords() { return []; } };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });

// (Array arguments are copied as they are recorded: the renderer passes one kept list to invalidateFramebuffer.)
function fakeGL() {
  const calls = [], enums = new Map();
  let nextObj = 1;
  const gl = new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) { if (!enums.has(k)) enums.set(k, 0x10000 + enums.size); return enums.get(k); }
      return (...a) => {
        calls.push([k, ...a.map((x) => (Array.isArray(x) ? [...x] : x))]);
        if (k === 'getShaderParameter') return true;
        if (k === 'getProgramParameter') return a[1] === gl.ACTIVE_UNIFORMS ? 0 : true;
        if (k === 'getExtension') return null;
        if (k === 'getParameter') return 'stand-in';
        if (k === 'getContextAttributes') return { stencil: true };
        if (k.startsWith('create')) return { obj: nextObj++, kind: k };
        return undefined;
      };
    },
  });
  return { gl, calls };
}
const mod = await import('../src/ui/veins-gl.js');
function renderer(who = 'stage') {
  const f = fakeGL();
  const canvas = { width: 800, height: 600, getContext: () => f.gl, addEventListener() {}, removeEventListener() {}, toDataURL: () => 'data:' };
  const g = mod.createVeinsGL(canvas, { tubes: 4, force: true, who });
  const line = (y) => Array.from({ length: mod.N_SAMPLES }, (_, i) => [40 + i * 10, y]);
  g.setGeometry(mod.binVeins([{ id: 0, pts: line(100), reach: 30 }, { id: 1, pts: line(300), reach: 30 }], []));
  const look = { shOff: [0, 0], light: [0, -1], reach: 11, organs: 0, casing: [0, 0, 0, 1], shadow: [0, 0, 0, 0], sheen: [1, 1, 1, 0], shade: [0, 0, 0, 0], ring: [0, 0, 0, 0], netAlpha: 1, fx: true, tierAlpha: Array(mod.MAX_TIERS).fill(1), tierGroup: Array(mod.MAX_TIERS).fill(1) };
  return { g, f, canvas, look };
}
const M1 = [1, 0, 0, 1, 0, 0];
// The framebuffer a call acted on: the last bind of that target before it.
function boundAt(f, idx, target) {
  for (let i = idx - 1; i >= 0; i--) { const c = f.calls[i]; if (c[0] === 'bindFramebuffer' && (c[1] === target || (c[1] === f.gl.FRAMEBUFFER && (target === f.gl.DRAW_FRAMEBUFFER || target === f.gl.FRAMEBUFFER)))) return c[2]; }
  return undefined;
}
const invals = (f, n0) => f.calls.map((c, i) => [c, i]).filter(([c, i]) => i >= n0 && c[0] === 'invalidateFramebuffer');

// ── A2 ──
test('A2: a whole picture drawn straight onto the canvas invalidates the canvas colour before its draw', () => {
  const { g, f, look } = renderer();
  const n0 = f.calls.length;
  g.draw(M1, look, { on: false });
  const inv = invals(f, n0);
  assert.equal(inv.length, 1);
  const [c, at] = inv[0];
  assert.deepEqual(c.slice(1), [f.gl.FRAMEBUFFER, [f.gl.COLOR]]);
  assert.equal(boundAt(f, at, f.gl.FRAMEBUFFER), null, 'the canvas is bound');
  assert.ok(f.calls.slice(at).some((x) => x[0] === 'drawArrays'), 'then drawn');
  const bind = f.calls.findLastIndex((x, i) => i < at && x[0] === 'bindFramebuffer' && x[1] === f.gl.FRAMEBUFFER && x[2] === null);
  assert.ok(!f.calls.slice(bind, at).some((x) => x[0] === 'drawArrays' || x[0] === 'drawArraysInstanced'), 'before any draw in that pass');
});

test('A2: a whole picture into the kept picture invalidates its colour, and the copy invalidates the canvas', () => {
  const { g, f, look } = renderer();
  g.draw(M1, look, { on: true });   // (blood on: straight onto the canvas since A1.3, 8 Nov 2026)
  const n0 = f.calls.length;
  g.composite(look, { on: true });   // (the frame after a direct one makes the kept picture whole again, then copies it onto the canvas)
  const inv = invals(f, n0);
  assert.equal(inv.length, 2);
  const [kept, canvas] = inv;
  assert.deepEqual(kept[0].slice(1), [f.gl.FRAMEBUFFER, [f.gl.COLOR_ATTACHMENT0]]);
  assert.ok(boundAt(f, kept[1], f.gl.FRAMEBUFFER)?.kind === 'createFramebuffer', 'the kept picture is bound');
  assert.deepEqual(canvas[0].slice(1), [f.gl.DRAW_FRAMEBUFFER, [f.gl.COLOR]]);
  assert.equal(boundAt(f, canvas[1], f.gl.DRAW_FRAMEBUFFER), null);
  const blit = f.calls.findIndex((c, i) => i > canvas[1] && c[0] === 'blitFramebuffer');
  assert.ok(blit > canvas[1], 'before the copy');
  assert.ok(!f.calls.slice(canvas[1], blit).some((c) => c[0] === 'drawArrays'), 'with no draw between');
});

test('A2: the blood\'s own frame keeps the kept picture it repaints in part: no colour invalidated for the part', () => {
  const { g, f, look } = renderer();
  g.draw(M1, look, { on: true });
  g.composite(look, { on: true });   // (the kept picture made whole again after the direct one, A1.3)
  const n0 = f.calls.length;
  g.composite(look, { on: true, alpha: 0.5 });
  const inv = invals(f, n0).filter(([c]) => c[1] === f.gl.FRAMEBUFFER);
  assert.equal(inv.length, 0, 'a dirty-row composite keeps its load');
});

test('A2: Sharper upscaling\'s whole-canvas draw and the plain upscale draw invalidate the canvas', () => {
  for (const lin of [false, true]) {
    const { g, f, look } = renderer();
    g.setPicture([400, 300], lin);
    const n0 = f.calls.length;
    g.draw([0.5, 0, 0, 0.5, 0, 0], look, { on: false });
    const inv = invals(f, n0).filter(([c]) => c[2][0] === f.gl.COLOR);
    assert.equal(inv.length, 1, lin ? 'the upscale draw, one filtered read' : 'the upscale draw');
    assert.equal(boundAt(f, inv[0][1], inv[0][0][1]), null);
  }
});

// ── A3 ──
test('A3: a frame that draws and has stale overlays lays one picture: the draw\'s own present lays them', () => {
  const { g, f, look } = renderer();
  g.draw(M1, look, { on: false });
  g.overlay.set(new Map([['o0', [{ spec: { ops: [], opacity: 1, mask: null }, m: [1, 0, 0, 1, 0, 0] }]]]), ['o0']);
  assert.equal(g.overlay.stale, true);
  const at = g.top.presents;
  const n0 = f.calls.length;
  g.draw([1, 0, 0, 1, 5, 0], look, { on: false });
  assert.equal(g.top.presents, at + 1, 'one picture laid for the frame');
  assert.equal(g.overlay.stale, false, 'with the overlays in it, so the stage lays no second one');
  assert.ok(f.calls.slice(n0).some((c) => c[0] === 'drawArrays'));
});

// ── A4 ──
test('A4: the overlays\' stack is drawn before the canvas is bound for the copy, and the lay alone follows it', () => {
  const { g, f, look } = renderer();
  g.draw(M1, look, { on: true });
  g.overlay.set(new Map([['o0', [{ spec: { ops: [], opacity: 1, mask: null }, m: [1, 0, 0, 1, 0, 0] }]]]), ['o0']);
  assert.equal(g.overlay.stale, true);
  const n0 = f.calls.length;
  g.present();
  const c = f.calls.slice(n0), blit = c.findIndex((x) => x[0] === 'blitFramebuffer');
  const made = c.findIndex((x) => x[0] === 'texImage2D' && x[4] === 800 && x[5] === 600);
  assert.ok(made >= 0 && made < blit, 'the stack drawn (made at the canvas\'s size) before the copy');
  const after = c.slice(blit);
  assert.ok(after.filter((x) => x[0] === 'bindFramebuffer' && x[1] !== f.gl.READ_FRAMEBUFFER).every((x) => x[2] === null), 'no other target is bound once the canvas is');
  assert.ok(!after.some((x) => x[0] === 'clearBufferfv' || x[0] === 'clear' || x[0] === 'texImage2D'), 'nothing drawn into the stack after the copy');
  assert.equal(after.filter((x) => x[0] === 'drawArrays').length, 1, 'the lay is the one draw');
  assert.equal(g.overlay.stale, false);
});

// ── A5 ──
test('A5: the box the camera lay is cut to holds every fragment that reads a texel inside the overlay bounds', () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const cw = 90, ch = 60;
  let boxes = 0, small = 0;
  for (let trial = 0; trial < 120; trial++) {
    const pw = trial % 3 ? cw : 45, ph = trial % 3 ? ch : 30;
    const x0 = Math.floor(rnd() * pw * 0.8), y0 = Math.floor(rnd() * ph * 0.8);
    const ob = [x0, y0, x0 + 1 + Math.floor(rnd() * (pw - x0 - 1)), y0 + 1 + Math.floor(rnd() * (ph - y0 - 1))];
    const k = [0.6, 1, 1.7, 3.3][trial % 4], ex = (rnd() - 0.5) * cw * 2, eyUp = (rnd() - 0.5) * ch * 2;
    const box = [0, 0, 0, 0], any = mod.camLayBox(box, ob, k, ex, eyUp, cw, ch, pw, ph);
    // (CAM_FS: q = (fragment - (ex, eyUp)) / k, uv = q / canvas; the texture is read bilinearly at uv * picture size, clamped at its edge.)
    let reads = 0;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const qx = (x + 0.5 - ex) / k, qy = (y + 0.5 - eyUp) / k, u = qx / cw, v = qy / ch;
      if (u < 0 || v < 0 || u > 1 || v > 1) continue;
      const tx = u * pw - 0.5, ty = v * ph - 0.5;   // (texel centres at integers; y up in the texture, ob is y down)
      let hit = false;
      for (const i of [Math.floor(tx), Math.floor(tx) + 1]) for (const j of [Math.floor(ty), Math.floor(ty) + 1]) {
        const ci = Math.min(pw - 1, Math.max(0, i)), cj = Math.min(ph - 1, Math.max(0, j));
        const row = ph - 1 - cj;   // (the texel's row, counted from the top)
        if (ci + 1 > ob[0] && ci < ob[2] && row + 1 > ob[1] && row < ob[3]) hit = true;
      }
      if (!hit) continue;
      reads++;
      assert.ok(any && x >= box[0] && x < box[2] && y >= box[1] && y < box[3], `fragment ${x},${y} reads the bounds ${ob} outside the box ${box} (k ${k})`);
    }
    if (any) { boxes++; if ((box[2] - box[0]) * (box[3] - box[1]) < cw * ch / 2) small++; }
    else assert.equal(reads, 0, 'an empty box reads nothing');
  }
  assert.ok(boxes > 30 && small > 10, `the boxes are real and mostly smaller than the canvas (${boxes}, ${small})`);
  assert.equal(mod.camLayBox([0, 0, 0, 0], [0, 0, 0, 0], 1, 0, 0, cw, ch, cw, ch), false, 'no ops: no box');
  assert.equal(mod.camLayBox([0, 0, 0, 0], [10, 10, 20, 20], 1, 500, 0, cw, ch, cw, ch), false, 'carried off the canvas');
});

test('A5: under a camera the overlay lay is cut to its bounds, and nothing is laid for an empty stack', () => {
  const { g, f, look } = renderer();
  g.draw(M1, look, { on: true });
  g.overlay.set(new Map([['o0', [{ spec: { ops: [], opacity: 1, mask: null }, m: [1, 0, 0, 1, 0, 0] }]]]), ['o0']);
  g.present();
  g.setCamera(2, 300, 200, 1);
  const n0 = f.calls.length;
  g.present();
  assert.equal(f.calls.slice(n0).filter((c) => c[0] === 'drawArrays').length, 1, 'only the picture under the camera: the empty overlay is not laid');
  // (A scissor left on would cut the glass and the labels drawn after the overlays.)
  const sc = f.calls.slice(n0).filter((c) => c[0] === 'enable' || c[0] === 'disable').filter((c) => c[1] === f.gl.SCISSOR_TEST);
  assert.notEqual(sc.at(-1)?.[0], 'enable');
});

// ── D1 ──
test('D1: trim() gives back the quality tiers\' targets, and prepLow makes them again', () => {
  const { g, f } = renderer();
  g.prepLow(0.7);
  const made = g.lowMade;
  assert.ok(made >= 1);
  let n0 = f.calls.length;
  g.trim();
  const c = f.calls.slice(n0);
  assert.equal(c.filter((x) => x[0] === 'deleteFramebuffer').length, 1, 'the tiers\' framebuffer');
  assert.ok(c.filter((x) => x[0] === 'deleteTexture').length >= 3, 'and their textures');
  n0 = f.calls.length;
  g.trim();
  assert.ok(!f.calls.slice(n0).some((x) => x[0] === 'deleteFramebuffer' || x[0] === 'deleteTexture'), 'a second trim has nothing more to give');
  g.prepLow(0.7);
  assert.equal(g.lowMade, made + 1, 'made again between frames, not at the first move');
});

test('D1: trim() of the lobule\'s shared renderer shrinks its texture of the host to a texel', () => {
  const host = renderer();
  const f = host.f;
  const canvas = { width: 640, height: 480, addEventListener() {}, removeEventListener() {} };
  const lob = mod.createVeinsGL(canvas, { tubes: 4, force: true, who: 'lobule', share: host.g.top });
  const t = lob.target, gen = t.gen;
  assert.equal(t.w, 640);
  const n0 = f.calls.length;
  lob.trim();
  const sh = f.calls.slice(n0).filter((x) => x[0] === 'texImage2D' && x[4] === 1 && x[5] === 1 && x[3] === f.gl.RGBA8);
  assert.ok(sh.length >= 2, 'the vessel layer\'s base and the host\'s texture');
  assert.equal(lob.target.w, 640, 'sized again, cleared, when it is next asked for at the canvas\'s size');
  assert.ok(lob.target.gen > gen, 'a new texture generation: a kept picture of it is out of date');
});
