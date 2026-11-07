// N6 trace callouts (V-CHART-6): the marker maths and drawer, with a recording context.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>');
globalThis.window = dom.window; globalThis.document = dom.window.document;
globalThis.Element = dom.window.Element;
for (const k of ['Node', 'NodeFilter', 'MutationObserver', 'getComputedStyle']) globalThis[k] ??= dom.window[k];
globalThis.addEventListener ??= () => {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} };
const { dropK, edgeFade, sideFor, calloutCell, calloutText, drawCallout, DROP_MS } = await import('../src/ui/trace-callouts.js');

function fakeCtx() {
  const calls = [];
  const ctx = { globalAlpha: 1, calls, measureText: (s) => ({ width: s.length * 7 }) };
  for (const k of ['save', 'restore', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fill', 'arc', 'rect', 'roundRect']) ctx[k] = (...a) => calls.push([k, ...a]);
  ctx.fillText = (s, x, y) => calls.push(['fillText', s, x, y]); ctx.strokeText = () => {};
  return ctx;
}

test('a marker is not drawn before its reading and is whole after DROP_MS', () => {
  assert.equal(dropK(-5), 0);
  assert.equal(dropK(0), 0);
  assert.ok(dropK(DROP_MS / 2) > 0.5 && dropK(DROP_MS / 2) < 1);
  assert.equal(dropK(DROP_MS), 1);
  assert.equal(dropK(5000), 1);
});

test('a marker fades to nothing at the edge it scrolls off', () => {
  assert.equal(edgeFade(-3), 0);
  assert.equal(edgeFade(0), 0);
  assert.equal(edgeFade(48), 1);
  assert.ok(edgeFade(24) > 0.4 && edgeFade(24) < 0.6);
});

test('the words follow the number and are rebuilt only when it changes', () => {
  const c = calloutCell();
  assert.equal(calloutText(c, 'Wedge', 22.44), 'Wedge 22.4');
  const s = c.s;
  assert.equal(calloutText(c, 'Wedge', 22.44), s);
  assert.equal(calloutText(c, 'Free', 8, 0), 'Free 8');
});

test('a marker goes to the other side when its preferred side has no room', () => {
  assert.equal(sideFor(100, -1, 10, 200), -1);
  assert.equal(sideFor(20, -1, 10, 200), 1);
  assert.equal(sideFor(190, 1, 10, 200), -1);
});

test('drawCallout puts its words inside the box, on the point side, and draws nothing when hidden or not yet dropped', () => {
  const ctx = fakeCtx();
  drawCallout(ctx, 'Wedge 22.4', 5, 100, -1, '#fff', '#000', 1, 1, 20, 200, 10, 190);
  const t = ctx.calls.find((c) => c[0] === 'fillText');
  assert.ok(t && t[1] === 'Wedge 22.4');
  assert.ok(t[2] >= 20 && t[2] + 70 <= 200, 'text stays inside the left/right limits');
  assert.ok(t[3] < 100, 'above the point');
  for (const [drop, alpha] of [[0, 1], [1, 0]]) {
    const c2 = fakeCtx();
    drawCallout(c2, 'x', 50, 100, 1, '#fff', '#000', drop, alpha, 20, 200, 10, 190);
    assert.equal(c2.calls.length, 0);
  }
});
