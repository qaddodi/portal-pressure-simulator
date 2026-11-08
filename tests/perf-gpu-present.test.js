import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stageSource, stageFn } from './stage-src.js';

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
  const n0 = f.calls.length;
  g.draw(M1, look, { on: true });   // (blood on: the kept picture, then the copy onto the canvas)
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
  const n0 = f.calls.length;
  g.composite(look, { on: true, alpha: 0.5 });
  const inv = invals(f, n0).filter(([c]) => c[1] === f.gl.FRAMEBUFFER);
  assert.equal(inv.length, 0, 'a dirty-row composite keeps its load');
});

test('A2: Sharper upscaling\'s whole-canvas draw and the plain upscale copy invalidate the canvas', () => {
  for (const lin of [false, true]) {
    const { g, f, look } = renderer();
    g.setPicture([400, 300], lin);
    const n0 = f.calls.length;
    g.draw([0.5, 0, 0, 0.5, 0, 0], look, { on: false });
    const inv = invals(f, n0).filter(([c]) => c[2][0] === f.gl.COLOR);
    assert.equal(inv.length, 1, lin ? 'the filtered copy' : 'the upscale draw');
    assert.equal(boundAt(f, inv[0][1], inv[0][0][1]), null);
  }
});

test('A2: the organ stack\'s camera move and the reuse target say so before they write the whole target', () => {
  const organs = readFileSync(new URL('../src/ui/organs-gl.js', import.meta.url), 'utf8');
  assert.match(organs, /gl\.useProgram\(moveP\.p\);\n\s+setM\(U\.toS/);
  assert.match(organs, /gl\.disable\(gl\.SCISSOR_TEST\); gl\.disable\(gl\.BLEND\);\n\s+INVC\[0\] = gl\.COLOR_ATTACHMENT0; gl\.invalidateFramebuffer\(gl\.FRAMEBUFFER, INVC\);[^\n]*\n\s+gl\.useProgram\(moveP\.p\);/);
  const veins = readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8');
  assert.match(veins, /gl\.bindFramebuffer\(gl\.DRAW_FRAMEBUFFER, rz\.fbo\);\n\s+if \(!own \|\| \(own\.w === rz\.w && own\.h === rz\.h\)\) noLoad\(gl\.DRAW_FRAMEBUFFER, false\);[^\n]*\n\s+gl\.blitFramebuffer\(0, 0, rz\.w, rz\.h/);
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

test('A3: the stage lays the overlays alone after its draw, and only if the draw laid no picture', () => {
  const stage = stageSource();
  assert.doesNotMatch(stage, /if \(OVER_ON && veins\?\.overlay\?\.stale && !veins\.lost\) veins\.present\(\);/, 'no present ahead of the draw');
  assert.match(stage, /const overAt = OVER_ON && veins\?\.top \? veins\.top\.presents : -1;/);
  const fn = stageFn('overAlone');
  assert.match(fn, /veins\?\.overlay\?\.stale && !veins\.lost && veins\.top\.presents === at\) veins\.present\(\)/);
  // (After the draw and before the still key is copied; and where a still figure goes to sleep.)
  assert.match(stage, /veins\.composite\(vLook, bloodLook\(\), fluidMoved\) !== false\) \{[^\n]*\n\s+overAlone\(overAt\);\n\s+drawnView = viewVersion;/);
  assert.match(stage, /!anyReveal\(\)\) \{ overAlone\(overAt\); sleep\(\); return; \}/);
});
