import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOrganStack, cacheBudget } from '../src/ui/organs-gl.js';

// A live group that holds still while another eases beside it is kept as a picture and laid again, not painted from its shapes
// (organs-gl, performance recs B6 item 2). A stand-in GL and painter count the work.

function fakeGL(log) {
  let id = 0;
  const gl = new Proxy({ canvas: { width: 400, height: 300 } }, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) return k;
      if (k === 'getShaderParameter' || k === 'getProgramParameter') return (_, what) => (what === 'ACTIVE_UNIFORMS' || what === gl.ACTIVE_UNIFORMS ? 0 : true);
      if (/^create/.test(k)) return () => ({ id: ++id });
      return (...a) => { log.push([k, ...a]); };
    },
  });
  return gl;
}

function setup() {
  const log = [], paints = [], intos = [];
  const gl = fakeGL(log);
  const watchless = globalThis.MutationObserver;
  globalThis.MutationObserver = undefined;   // (no page watch: a render with live groups always describes)
  const state = { liver: 0, dia: 0 };
  const box = (x0, x1) => [x0, 0, x1, 100];
  const painter = {
    describe(spec, m) { const x = spec.name === 'liver' ? state.liver : state.dia; return { sig: '1|0', ops: [[`${spec.name}|${x}|${m.join()}`, box(spec.x0, spec.x1 + x)]] }; },
    paintGroup(spec) { paints.push(spec.name); },
    paintGroupInto(spec, m, w, h) { intos.push([spec.name, m.slice(), w, h]); },
    layMasked() {}, endFrame() {}, trim() {}, dropKept() {}, stats: () => ({ meshes: 0, kept: 0 }), dispose() {},
  };
  const stack = createOrganStack(gl, { painter });
  const dia = { name: 'dia', x: 0, x0: 50, x1: 250 }, liv = { name: 'liver', x0: 100, x1: 150 };
  const id = [1, 0, 0, 1, 0, 0];
  stack.setOrder(['dia', 'liver']);
  stack.setLive(new Map([['dia', [{ spec: dia, m: id }]], ['liver', [{ spec: liv, m: id }]]]), null);
  const draw = (m = [1, 0, 0, 1, 0, 0], cw = 400, ch = 300) => stack.render(m, cw, ch);
  const done = () => { globalThis.MutationObserver = watchless; };
  return { stack, state, paints, intos, log, draw, done, dia, liv, id };
}

test('a standing group is laid from its picture while the group beside it eases', () => {
  const t = setup();
  try {
    assert.equal(t.draw(), true, 'the first render draws the whole');
    assert.deepEqual(t.paints, ['dia', 'liver']);
    t.paints.length = 0;
    t.state.liver = 10;
    assert.ok(Array.isArray(t.draw()), 'only the liver\'s box');
    assert.deepEqual(t.paints, ['liver'], 'the diaphragm is not painted from its shapes');
    assert.equal(t.intos.length, 1, 'its picture is made once');
    assert.deepEqual(t.intos[0].slice(2), [200, 100], 'the size of its box');
    assert.deepEqual(t.intos[0][1], [1, 0, 0, 1, -50, 0], 'its frame moved by whole device pixels to the box');
    assert.equal(t.stack.stats().cached, 1);
    assert.equal(t.stack.stats().cacheBytes, 200 * 100 * 4);
    t.paints.length = 0;
    t.state.liver = 20; t.draw(); t.state.liver = 30; t.draw();
    assert.deepEqual(t.paints, ['liver', 'liver']);
    assert.equal(t.intos.length, 1, 'no picture made again while it stands');
  } finally { t.done(); }
});

test('the picture is given up when the view, the group or the live set changes', () => {
  const t = setup();
  try {
    t.draw(); t.state.liver = 10; t.draw();
    assert.equal(t.stack.stats().cached, 1);
    t.draw([2, 0, 0, 2, 0, 0]);   // (a zoom: the whole is drawn)
    assert.equal(t.stack.stats().cached, 0, 'a view change');
    t.paints.length = 0; t.intos.length = 0;
    const z = [2, 0, 0, 2, 0, 0];
    t.state.liver = 20; t.draw(z);
    assert.equal(t.intos.length, 1, 'made again at the new view');
    t.state.dia = 5; t.state.liver = 30; t.draw(z);
    assert.equal(t.stack.stats().cached, 0, 'the diaphragm itself changed: its old picture is no use');
    assert.deepEqual(t.paints.slice(-2), ['dia', 'liver'], 'painted from its shapes while it moves');
    t.state.liver = 40; t.draw(z); t.state.liver = 50; t.draw(z);
    assert.equal(t.stack.stats().cached, 1, 'a picture again once it stands still');
    t.stack.setLive(null, null);
    assert.equal(t.stack.stats().cached, 0, 'a new live set');
    t.stack.setLive(new Map([['dia', [{ spec: t.dia, m: t.id }]], ['liver', [{ spec: t.liv, m: t.id }]]]), null);
    t.draw(z); t.state.liver = 60; t.draw(z); t.state.liver = 70; t.draw(z);
    assert.equal(t.stack.stats().cached, 1);
    t.stack.trim();
    assert.equal(t.stack.stats().cached, 0, 'trim gives the memory back');
  } finally { t.done(); }
});

test('no picture is made past the budget', () => {
  assert.equal(cacheBudget(400, 300), 400 * 300 * 4 * 0.75);
  assert.equal(cacheBudget(3000, 2000), 12e6, 'never more than 12 MB');
  const small = setup();
  try {
    // (A diaphragm across a 400 × 100 canvas: 160 KB against a budget of 120 KB.)
    small.dia.x0 = 0; small.dia.x1 = 400;
    small.draw(undefined, 400, 100); small.state.liver = 10; small.draw(undefined, 400, 100);
    assert.equal(small.stack.stats().cached, 0);
    assert.equal(small.intos.length, 0);
    assert.deepEqual(small.paints.slice(-2), ['dia', 'liver'], 'still painted from its shapes');
  } finally { small.done(); }
});

// B3: the lobule's tissue bitmap is capped by what the screen can ask for (the zoom stops at KMAX × the fit), not only by 3600 px.
test("the lobule's bitmap scale is capped by the deepest zoom the screen can reach", async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
  assert.match(src, /const worldCap = \(G, dpr\) => Math\.min\(3600 \/ \(2\.6 \* G\.R\), Math\.max\(dpr \* kFit \* KMAX, dpr \* V\.k\) \* Math\.SQRT2\);/);
  assert.equal((src.match(/worldCap\(/g) || []).length, 4, 'the four scale sites');
  assert.doesNotMatch(src, /3600 \/ \(2\.6 \* (geo|G)\.R\)\)/, 'no scale site keeps the bare constant');
});
