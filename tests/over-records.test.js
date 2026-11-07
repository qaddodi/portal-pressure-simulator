import { stageSource } from './stage-src.js';
// The figure's kept shapes (src/ui/over-records.js): records the overlay painter draws with no SVG element behind them, eased on a clock the
// caller gives (the page's own curve and length), checked here on a stepped clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recordLayer } from '../src/ui/over-records.js';
import { easeArrive, D_SURFACE } from '../src/ui/ease.js';

const STAGE = stageSource();
const out = { changed: false, moving: false };
const zig = () => [new Float32Array([0, 0, 10, 5, 20, 0])];
const part = (polys, extra = {}) => ({ polys, kind: 'stroke', rgb: [0.1, 0.2, 0.3], a: 0.8, w: 2, nss: true, cap: 1, ...extra });

test('an entry fades in over the surface step on the page\'s own curve, and the painter\'s ops carry that opacity', () => {
  const L = recordLayer({ ease: easeArrive, ms: D_SURFACE });
  L.show(1, 0, true);
  assert.equal(L.put('res:rLiver', [part(zig())], 0), true);
  assert.equal(L.spec.ops.length, 1);
  assert.equal(L.spec.ops[0].alpha, 0, 'it starts clear');
  L.step(D_SURFACE / 2, out);
  assert.equal(out.moving, true);
  assert.ok(Math.abs(L.spec.ops[0].alpha - 0.8 * easeArrive(0.5)) < 1e-9, 'half way along the curve');
  L.step(D_SURFACE, out);
  assert.equal(out.moving, false);
  assert.equal(L.spec.ops[0].alpha, 0.8);
});

test('an op has no element: the painter reads its frame and opacity from the op itself', () => {
  const L = recordLayer({ ease: easeArrive, ms: D_SURFACE });
  L.show(1, 0, true);
  L.put('a', [part(zig(), { kind: 'fill', closed: true })], 0, true);
  const op = L.spec.ops[0];
  assert.equal(op.chain, undefined, 'no chain of elements: organ-paint liveOf takes op.m and op.alpha');
  assert.equal(op.el, null);
  assert.deepEqual(op.m, [1, 0, 0, 1, 0, 0]);
  assert.equal(op.alpha, 0.8);
  assert.deepEqual(op.paint.solid, [0.1, 0.2, 0.3, 1]);
  assert.equal(op.geom.poly[0].closed, true);
  assert.equal(op.nss, true);
});

test('an entry that goes fades out whole, then leaves the set, which is then a new group', () => {
  const L = recordLayer({ ease: easeArrive, ms: D_SURFACE });
  L.show(1, 0, true);
  L.put('a', [part(zig())], 0, true);
  const spec0 = L.spec, v0 = L.ver;
  assert.equal(L.drop('a', 100), false, 'still drawn while it fades');
  L.step(100 + D_SURFACE / 2, out);
  assert.equal(L.spec, spec0);
  assert.ok(L.spec.ops[0].alpha > 0 && L.spec.ops[0].alpha < 0.8);
  L.step(100 + D_SURFACE + 1, out);
  assert.equal(out.changed, true);
  assert.equal(L.spec, null, 'nothing left to draw');
  assert.ok(L.ver > v0);
});

test('a part kept as it was keeps its op (and the painter its mesh); a part that changed is made again', () => {
  const L = recordLayer({ ease: easeArrive, ms: D_SURFACE });
  L.show(1, 0, true);
  const polys = zig();
  L.put('a', [part(polys)], 0, true);
  const op = L.spec.ops[0], v = L.ver;
  assert.equal(L.put('a', [part(polys)], 10, true), false, 'the same points, colour, width and cap');
  assert.equal(L.spec.ops[0], op);
  assert.equal(L.ver, v);
  assert.equal(L.put('a', [part(polys, { w: 3 })], 20, true), true);
  assert.notEqual(L.spec.ops[0], op);
  assert.equal(L.put('a', [part(zig())], 30, true), true, 'new points');
});

test('a part\'s own opacity eases (a line lit) without making a new op', () => {
  const L = recordLayer({ ease: easeArrive, ms: D_SURFACE });
  L.show(1, 0, true);
  const polys = zig();
  L.put('a', [part(polys, { a: 0.8 })], 0, true);
  const op = L.spec.ops[0];
  assert.equal(L.put('a', [part(polys, { a: 1 })], 100), false);
  assert.equal(L.spec.ops[0], op);
  L.step(100 + D_SURFACE / 2, out);
  assert.ok(Math.abs(op.alpha - (0.8 + 0.2 * easeArrive(0.5))) < 1e-9);
  assert.equal(out.changed, true);
});

test('the layer\'s own opacity (the circuit view fading in) multiplies every entry\'s', () => {
  const L = recordLayer({ ease: easeArrive, ms: D_SURFACE });
  L.show(0, 0, true);
  L.put('a', [part(zig())], 0, true);
  L.step(0, out);
  assert.equal(L.spec.ops[0].alpha, 0, 'the anatomy: no resistors');
  assert.equal(L.show(1, 1000), true);
  L.step(1000 + D_SURFACE / 2, out);
  assert.ok(Math.abs(L.spec.ops[0].alpha - 0.8 * easeArrive(0.5)) < 1e-9);
  assert.equal(L.show(1, 1000 + 10), false, 'the same goal asked again moves nothing');
});

test('a step that moves nothing says so (a still frame writes nothing and asks nothing of the painter)', () => {
  const L = recordLayer({ ease: easeArrive, ms: D_SURFACE });
  L.show(1, 0, true);
  L.put('a', [part(zig())], 0, true);
  L.step(5, out);
  L.step(50, out);
  assert.equal(out.changed, false);
  assert.equal(out.moving, false);
});

test('the stage keeps the circuit\'s resistors as records, hands them to the painter, and writes no element for them', () => {
  assert.match(STAGE, /import \{ recordLayer \} from '\.\/over-records\.js/);
  assert.match(STAGE, /const recs = recordLayer\(\{ ease: easeArrive, ms: D_SURFACE \}\);/);
  const RESISTORS = readFileSync(new URL('../src/ui/stage-resistors.js', import.meta.url), 'utf8');   // (the resistors moved out of stage.js)
  const rp = RESISTORS.slice(RESISTORS.indexOf('  function resPaint('));
  assert.match(rp, /recs\.put\(RES_KEYS\[k\]/);
  assert.match(rp, /recs\.drop\(RES_KEYS\[k\]/);
  assert.match(RESISTORS, /RES_KEYS\[k\] = 'res:' \+ k/, 'each reading\'s record key is res:<name>, made once');
  assert.doesNotMatch(rp, /setAttribute|classList|\.style\.|setProperty|dataset|createElementNS|cloneNode/, 'a resistor writes no element, class or style');
  assert.doesNotMatch(STAGE, /res-one|RES_TPL/, 'no resistor element is built');
  // The painter is told when a kept shape was written in place (the page's watch cannot see it), and when the set of shapes changed.
  assert.match(STAGE, /(?:live\.)?veins\.overlay\.touch\(\);/);
  assert.match(STAGE, /if \(recs\.spec\) \{ groups\.set\('rec', \[recGroup\]\); names\.push\('rec'\); \}/);
  // The circuit view fades them as .circuit-only did.
  assert.match(STAGE, /recs\.show\(t > 0\.5 \? 1 : 0, performance\.now\(\), reduceMotion\.matches\)/);
});
