import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOrganPaint } from '../src/ui/organ-paint.js';

// The painter run on a stand-in WebGL2 context (every call recorded, every object a plain one): what a picture's job paints, in
// which order and in how many steps, without a browser.
function fakeGL() {
  const calls = [];
  let id = 0;
  const gl = new Proxy({ canvas: { width: 800, height: 600 } }, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'string' && /^[A-Z0-9_]+$/.test(k)) return k;   // (constants: their names)
      return (...a) => {
        calls.push([k, ...a]);
        if (/^create/.test(k)) return { id: ++id, kind: k };
        if (k === 'getShaderParameter' || k === 'getProgramParameter') return a[1] === 'ACTIVE_UNIFORMS' ? 0 : true;
        return undefined;
      };
    },
  });
  return { gl, calls };
}
function fakeShape() {
  const log = [];
  return { log, fill: (mesh) => log.push(['fill', mesh]), stroke: (mesh) => log.push(['stroke', mesh]), release: (mesh) => log.push(['release', mesh]), count: () => 0, dispose: () => log.push(['dispose']) };
}
const ID = [1, 0, 0, 1, 0, 0];
const square = (x, y, s = 10) => ({ geom: { poly: [{ pts: new Float32Array([x, y, x + s, y, x + s, y + s, x, y + s]), closed: true }] }, m: ID, kind: 'fill', paint: { solid: [1, 0, 0, 1] }, alpha: 1, clip: null });
const group = (ops, alpha = 0.5) => ({ kind: 'group', ops, mask: null, m: ID, alpha });
// (The clock moves 10 ms at each read: a step with 5 ms left paints one op.)
function withClock(f) {
  const was = performance.now;
  let t = 0;
  performance.now = () => (t += 10);
  try { return f(); } finally { performance.now = was; }
}
const count = (calls, name) => calls.filter((c) => c[0] === name).length;

test("a picture's job paints one op a step, through nested groups, and lays each nested layer once its shapes are in", () => {
  const { gl, calls } = fakeGL(), shape = fakeShape(), p = createOrganPaint(gl, shape);
  // Two shapes, a see-through group of three (one of them a group of its own), and a last shape.
  const spec = { ops: [square(0, 0), square(20, 0), group([square(0, 20), group([square(10, 30)], 0.4), square(20, 20)]), square(40, 40)], opacity: 1, mask: null, root: null };
  const job = p.bakeJob(spec, ID, 100, 100, { fb: 1 });
  const results = withClock(() => { const r = []; for (let i = 0; i < 20 && r.at(-1) !== 'done'; i++) r.push(job.step(performance.now() + 5)); return r; });
  // Seven ops (four shapes at the top, the group, three inside it with the inner group, one inside that): one a step.
  assert.equal(results.length, 8, results.join());
  assert.deepEqual(results.slice(0, -1), Array(7).fill('more'));
  assert.equal(results.at(-1), 'done');
  assert.equal(shape.log.filter((l) => l[0] === 'fill').length, 6, 'every shape painted once');
  assert.equal(count(calls, 'drawArrays'), 6 + 2, 'six shapes painted over their targets, two nested layers laid');
});

test('one picture at a time holds the nested layers; a job whose layers were made again starts over', () => {
  const { gl } = fakeGL(), shape = fakeShape(), p = createOrganPaint(gl, shape);
  const spec = () => ({ ops: [group([square(0, 0), square(10, 0), square(20, 0)])], opacity: 1, mask: null, root: null });
  const a = p.bakeJob(spec(), ID, 100, 100, {}), b = p.bakeJob(spec(), ID, 100, 100, {});
  withClock(() => {
    assert.equal(a.step(performance.now() + 5), 'more');
    assert.equal(b.step(performance.now() + 5), 'wait', 'the other picture waits');
    // The live painting grows the targets (a bigger canvas): the half-painted group is gone with them.
    p.paintGroup({ ops: [square(0, 0)], opacity: 1, mask: null, root: null }, ID, 400, 400, null);
    assert.equal(a.step(performance.now() + 5), 'lost');
    assert.notEqual(b.step(performance.now() + 5), 'wait', 'a lost job lets go of the layers');
    a.drop(); b.drop();
  });
  // A job given up lets go of them too.
  const c = p.bakeJob(spec(), ID, 100, 100, {}), d = p.bakeJob(spec(), ID, 100, 100, {});
  withClock(() => {
    assert.equal(c.step(performance.now() + 5), 'more');
    c.drop();
    assert.notEqual(d.step(performance.now() + 5), 'wait');
  });
});

test('a picture group with an opacity of its own is painted in a layer, a few ops a step, and laid once with it', () => {
  const { gl, calls } = fakeGL(), shape = fakeShape(), p = createOrganPaint(gl, shape);
  const spec = { ops: [square(0, 0), square(10, 0), square(20, 0)], opacity: 0.6, mask: null, root: null };
  const job = p.bakeJob(spec, ID, 100, 100, {});
  const r = withClock(() => [job.step(performance.now() + 5), job.step(performance.now() + 5), job.step(performance.now() + 5)]);
  assert.deepEqual(r, ['more', 'more', 'done']);
  const lays = calls.filter((c) => c[0] === 'uniform1f').map((c) => c[2]).filter((v) => v === 0.6);
  assert.equal(lays.length, 1, 'laid once, with its opacity');
});

test('the meshes kept for pictures stay bounded over many pictures, and every one is given back when the painter goes', () => {
  const { gl } = fakeGL(), shape = fakeShape(), p = createOrganPaint(gl, shape);
  // (Three pictures of 2,500 shapes each, none shared: a patient or zoom change each, past the cap of 4,000 kept.)
  const made = new Set();
  for (let n = 0; n < 3; n++) {
    const ops = Array.from({ length: 2500 }, (_, i) => square(i % 50, Math.floor(i / 50), 1));
    const job = p.bakeJob({ ops, opacity: 1, mask: null, root: null }, ID, 100, 100, {}, p.beginPicture());
    assert.equal(job.step(), 'done');
    for (const l of shape.log) if (l[0] === 'fill') made.add(l[1]);
    assert.ok(p.stats().kept <= 5000, `picture ${n + 1}: ${p.stats().kept} kept`);
  }
  const released = new Set(shape.log.filter((l) => l[0] === 'release').map((l) => l[1]));
  assert.ok(released.size >= 2500, 'the first picture\'s meshes given back once two newer pictures are in');
  assert.equal(p.stats().kept, made.size - released.size);
  p.dispose();
  assert.ok(shape.log.some((l) => l[0] === 'dispose'), 'the shape drawer disposed with the painter (its meshes\' arrays with it)');
  assert.equal(p.stats().kept, 0);
});

test("a shape the app made is painted from its numbers while its path still says what they say, from its text once it does not", async () => {
  const { shapeSource, bindShape } = await import('../src/ui/organ-paint.js');
  const { pathCmds } = await import('../src/ui/shape-gl.js');
  const { gl } = fakeGL(), shape = fakeShape(), p = createOrganPaint(gl, shape);
  const d = 'M10 10 L60 10 L60 60 Q35 80 10 60 Z';
  const el = { d, getAttribute: (a) => (a === 'd' ? el.d : null) };
  const op = { geom: { el, d: true }, m: ID, kind: 'fill', paint: { solid: [1, 0, 0, 1] }, alpha: 1, clip: null };
  const spec = { ops: [op], opacity: 1, mask: null, root: null };
  const src = shapeSource(d, pathCmds(d));
  bindShape(el, src);
  assert.match(p.describe(spec, ID).ops[0][0], new RegExp(`\\|n${src.id}\\|`), 'named by its source, not by hashing its text');
  p.paintGroup(spec, ID, 100, 100, {});
  const viaNumbers = shape.log.filter((l) => l[0] === 'fill').at(-1)[1];
  // Written by anything else, the path is read from its text again.
  el.d = 'M10 10 L60 10 L60 60 Q35 80 10 60 L5 30 Z';
  p.endFrame();
  assert.doesNotMatch(p.describe(spec, ID).ops[0][0], new RegExp(`\\|n${src.id}\\|`));
  p.paintGroup(spec, ID, 100, 100, {});
  const viaText = shape.log.filter((l) => l[0] === 'fill').at(-1)[1];
  assert.notEqual(viaText, viaNumbers);
  assert.ok(viaText.nTri > viaNumbers.nTri, 'the new text, with its extra corner');
});
