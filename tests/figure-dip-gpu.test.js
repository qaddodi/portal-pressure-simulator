// The figure's dip in a talk (presenter.js #stageView.pz-out, as a case card comes up) is an alpha in the canvas's present, never the stage
// view's CSS opacity: that dimmed the canvas with every glass drawn in it, so the case card's glass came up at a fifth of its strength and
// turned to glass in one step as the figure came back. Mohammad, 11 Nov 2026: "notice how the glass changes blur or tint or something when the
// case card appears".
import { test } from 'node:test';
import assert from 'node:assert/strict';

let T = 0;
performance.now = () => T;
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} }, classList: { contains: () => false } }, addEventListener() {}, removeEventListener() {}, createElement: () => ({ getContext: () => ({}), style: {} }) };
globalThis.addEventListener ??= () => {};
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} unobserve() {} };
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location ??= { search: "", href: "http://x/", hash: "" };
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const mos = [];
globalThis.MutationObserver = class { constructor(cb) { this.cb = cb; mos.push(this); } observe() {} disconnect() {} takeRecords() { return []; } };
const { createDive } = await import('../src/ui/stage-dive.js');

const cls = (...a) => { const s = new Set(a); return { contains: (c) => s.has(c), add: (c) => s.add(c), remove: (c) => s.delete(c) }; };
test('pz-out dips the canvas through its present\'s alpha, eased over D_SURFACE, and back', () => {
  const app = { classList: cls('app', 'presenting') };
  const wrap = { nodeType: 1, classList: cls('stage-view'), closest: () => app };
  const cams = [];
  const live = { camDive: 1, camShow: 1, lobIn: false, boxW: 100, boxH: 100, veins: { lost: false, setCameraRec: (k, x, y, a) => cams.push(a) } };
  let q = [];
  const drawFrame = (f) => { q.push(f); return q.length; };
  const n0 = mos.length;
  createDive({ drawFrame, nextFrame: drawFrame, vCanvas: { width: 100, height: 100 }, wrap, svg: {} }, live);
  const mine = mos.slice(n0);
  assert.equal(mine.length, 1, 'one class watch');
  const tick = (ms) => { T += ms; const f = q; q = []; f.forEach((x) => x(T)); };
  wrap.classList.add('pz-out'); mine.forEach((m) => m.cb([]));
  for (let i = 0; i < 40; i++) tick(16);
  assert.ok(Math.abs(cams.at(-1) - 0.22) < 1e-9, `dipped: ${cams.at(-1)}`);
  assert.ok(cams.every((a, i) => i === 0 || a <= cams[i - 1] + 1e-12), 'only down');
  assert.ok(cams.length > 10, 'eased, not a step');
  wrap.classList.remove('pz-out'); mine.forEach((m) => m.cb([]));
  for (let i = 0; i < 40; i++) tick(16);
  assert.equal(cams.at(-1), 1);
});

