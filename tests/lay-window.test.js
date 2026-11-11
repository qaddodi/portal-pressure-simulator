// top.lay with a `win` (brief from the "Three scales on one plate" thread, 11 Nov 2026): a shared renderer's texture laid through the same affine map but only inside a rounded rect or circle,
// its edge about a pixel soft, the canvas outside it left as it is (no clear), the draw scissored to the window's box; calls without win lay as they always did. The coverage has a JS twin.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

function fakeGL() {
  const calls = [], enums = new Map(), progs = new Map();
  let nextObj = 1, cur = null;
  const uniformsOf = (p) => [...new Set((progs.get(p) || []).flatMap((sh) => [...(sh.src || '').matchAll(/^uniform\s+\w+\s+\w+\s+(\w+(?:\s*,\s*\w+)*);|^uniform\s+\w+\s+(\w+);/gm)].flatMap((m) => (m[1] || m[2]).split(/\s*,\s*/))))];
  const gl = new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (k === 'calls') return calls;
      if (/^[A-Z0-9_]+$/.test(k)) { if (!enums.has(k)) enums.set(k, 0x10000 + enums.size); return enums.get(k); }
      return (...a) => {
        calls.push([k, ...a]);
        if (k === 'getShaderParameter') return true;
        if (k === 'getProgramParameter') return a[1] === gl.ACTIVE_UNIFORMS ? uniformsOf(a[0]).length : true;
        if (k === 'getActiveUniform') return { name: uniformsOf(a[0])[a[1]] };
        if (k === 'getExtension') return null;
        if (k === 'getParameter') return 'stand-in';
        if (k === 'checkFramebufferStatus') return gl.FRAMEBUFFER_COMPLETE;
        if (k === 'getUniformLocation') return { name: a[1], prog: a[0] };
        if (k === 'createShader') return { obj: nextObj++, kind: k, type: a[0] };
        if (k === 'shaderSource') { a[0].src = a[1]; return undefined; }
        if (k === 'attachShader') { (progs.get(a[0]) || progs.set(a[0], []).get(a[0])).push(a[1]); return undefined; }
        if (k === 'useProgram') { cur = a[0]; return undefined; }
        if (k.startsWith('create')) return { obj: nextObj++, kind: k };
        return undefined;
      };
    },
  });
  return { gl, calls, srcOf: (p) => (progs.get(p) || []).map((s) => s.src).join('\n'), cur: () => cur };
}
const mod = await import('../src/ui/veins-gl.js');

function figure() {
  const f = fakeGL();
  const canvas = { width: 800, height: 600, getContext: () => f.gl, addEventListener() {}, removeEventListener() {}, toDataURL: () => 'data:' };
  const g = mod.createVeinsGL(canvas, { tubes: 2, force: true });
  return { g, f };
}
const lays = (f, from) => f.calls.slice(from);

test('the window\'s coverage twin: inside 1, outside 0, the edge a pixel soft, a circle and a rounded rect', () => {
  const circle = { x: 100, y: 50, w: 200, h: 200, r: 100 };
  assert.equal(mod.layWinCoverage(200, 150, circle), 1, 'the centre');
  assert.equal(mod.layWinCoverage(10, 10, circle), 0, 'far outside');
  assert.ok(mod.layWinCoverage(100.25, 150, circle) > 0.5 && mod.layWinCoverage(100.25, 150, circle) < 1, 'the edge');
  assert.ok(Math.abs(mod.layWinCoverage(100, 150, circle) - 0.5) < 1e-9, 'half on the edge itself');
  assert.equal(mod.layWinCoverage(101, 150, circle), 1, 'a pixel inside is whole');
  assert.equal(mod.layWinCoverage(99, 150, circle), 0, 'a pixel outside is none');
  // a circle's corner of its box is outside, a rounded rect's corner is cut
  assert.equal(mod.layWinCoverage(101, 51, circle), 0, 'the circle\'s box corner');
  const rr = { x: 0, y: 0, w: 200, h: 100, r: 20 };
  assert.equal(mod.layWinCoverage(1, 1, rr), 0, 'the rounded corner is cut');
  assert.equal(mod.layWinCoverage(100, 1.5, rr), 1, 'the straight edge is whole a pixel in');
  assert.equal(mod.layWinCoverage(20, 20, rr), 1, 'where the corner arc starts');
  // the radius is clamped to half the shorter side
  assert.equal(mod.layWinCoverage(100, 50, { x: 0, y: 0, w: 200, h: 100, r: 999 }), 1);
  assert.equal(mod.layWinCoverage(2, 2, { x: 0, y: 0, w: 200, h: 100, r: 999 }), 0);
});

test('lay with a win: scissored to the window, blended, the canvas not cleared, the window\'s own program', () => {
  const { g, f } = figure();
  assert.ok(g.top?.lay);
  const tex = { tex: 1 };
  const n0 = f.calls.length;
  g.top.lay(tex, 0.25, 0, 0, 0.25, 40, 30, 1, { x: 40, y: 30, w: 200, h: 200, r: 100 });
  const c = lays(f, n0), names = c.map((x) => x[0]);
  assert.ok(names.includes('drawArrays'), 'drawn');
  assert.equal(names.includes('clear'), false, 'no clear of the canvas');
  assert.equal(names.includes('clearBufferfv'), false);
  const sc = c.find((x) => x[0] === 'scissor');
  assert.ok(sc, 'scissored');
  // canvas 800 x 600, window x 40..240, y 30..230 (down) = 370..570 (up): a pixel out each side
  assert.deepEqual(sc.slice(1), [39, 369, 202, 202]);
  assert.ok(names.indexOf('enable') >= 0 && c.some((x) => x[0] === 'enable' && x[1] === f.gl.SCISSOR_TEST));
  assert.equal(c.at(-1)[0] === 'disable' && c.at(-1)[1] === f.gl.SCISSOR_TEST, true, 'the scissor is left off');
  const prog = c.find((x) => x[0] === 'useProgram')[1];
  assert.match(f.srcOf(prog), /uWin/, 'the window program');
  const win = c.find((x) => x[0] === 'uniform4f' && x[2] === 40 && x[3] === 30 && x[4] === 200 && x[5] === 200);
  assert.ok(win, 'the window passed in canvas px');
  const wr = c.filter((x) => x[0] === 'uniform1f').map((x) => x[2]);
  assert.ok(wr.includes(100), 'the radius');
});

test('lay without a win is as before (no scissor, the plain program), and a window with no area draws nothing', () => {
  const { g, f } = figure();
  const n0 = f.calls.length;
  g.top.lay({ tex: 1 }, 1, 0, 0, 1, 0, 0, 1);
  const c = lays(f, n0), names = c.map((x) => x[0]);
  assert.ok(names.includes('drawArrays'));
  assert.equal(names.includes('scissor'), false);
  const prog = c.find((x) => x[0] === 'useProgram')[1];
  assert.doesNotMatch(f.srcOf(prog), /uWin/);
  const n1 = f.calls.length;
  g.top.lay({ tex: 1 }, 1, 0, 0, 1, 0, 0, 1, { x: 10, y: 10, w: 0, h: 50, r: 5 });
  assert.equal(lays(f, n1).some((x) => x[0] === 'drawArrays'), false);
  const n2 = f.calls.length;
  g.top.lay({ tex: 1 }, 1, 0, 0, 1, 0, 0, 1, { x: 900, y: 10, w: 50, h: 50, r: 5 });
  assert.equal(lays(f, n2).some((x) => x[0] === 'drawArrays'), false, 'a window off the canvas draws nothing');
});
