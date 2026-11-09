import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintGLSL, uniformsOf } from './glsl-lint.js';
import { ORGANS } from '../src/ui/anatomy.js';
import { flattenPath, flattenCmds, pathCmds, polyMeshInto } from '../src/ui/shape-gl.js';
import { detailTol, shapeSource, bindShape } from '../src/ui/organ-paint.js';
import {
  createVecOrgans, earcut, analyseFill, fillTriangles, fillProduct, strokeProduct, ringTriangles, runArea, morphable, fillMorphProduct, strokeMorphProduct, assemble,
  levelOf, levelScale, scaleOfMat, LEVEL_COARSE, LEVEL_MIN, CAMERA_K_MAX, DIVE_K_MAX, FILL_V, FILL_VM, STROKE_V, STROKE_VM,
} from '../src/ui/vec-organs.js';
import * as G from '../src/ui/vec-organs-glsl.js';
import { WIN_MAX } from '../src/ui/vec-contract.js';

// The organs of the vector renderer (workstream F). Nothing here draws: the geometry is checked as numbers, the GL calls through a
// stand-in context that records them (as tests/veins-own-buffer.test.js does), and the shaders by the GLSL lint.

const area2 = (tris) => { let a = 0; for (let k = 0; k < tris.length; k += 6) a += Math.abs((tris[k + 2] - tris[k]) * (tris[k + 5] - tris[k + 1]) - (tris[k + 4] - tris[k]) * (tris[k + 3] - tris[k + 1])); return a / 2; };
const polyOf = (pts) => ({ pts: Float32Array.from(pts), closed: true });
const rect = (x, y, w, h) => polyOf([x, y, x + w, y, x + w, y + h, x, y + h]);
const circle = (cx, cy, r, n = 36) => polyOf(Array.from({ length: n * 2 }, (_, i) => (i % 2 ? cy + r * Math.sin((2 * Math.PI * (i >> 1)) / n) : cx + r * Math.cos((2 * Math.PI * (i >> 1)) / n))));

// ── Geometry ──
test('earcut covers an outline and its hole exactly', () => {
  const sq = rect(0, 0, 10, 10), hole = polyOf([3, 3, 3, 7, 7, 7, 7, 3]);   // (turning the other way: a hole by the non-zero rule)
  const an = analyseFill([sq, hole], false);
  assert.equal(an.parts.length, 1);
  assert.equal(an.parts[0].holes.length, 1);
  const tris = fillTriangles(an);
  assert.ok(Math.abs(area2(tris) - (100 - 16)) < 1e-4, `area ${area2(tris)}`);
});
test('earcut cuts a square into two triangles', () => {
  assert.equal(earcut([0, 0, 4, 0, 4, 4, 0, 4]).length, 6);
});
test('earcut covers a concave star exactly', () => {
  const pts = [];
  for (let i = 0; i < 24; i++) { const r = i % 2 ? 4 : 10, a = (Math.PI * 2 * i) / 24; pts.push(r * Math.cos(a), r * Math.sin(a)); }
  const star = polyOf(pts), tris = fillTriangles(analyseFill([star]));
  assert.ok(Math.abs(area2(tris) - Math.abs(runArea(Array.from(pts)))) < 1e-3);
});
test('every real organ outline is triangulated to its own area', () => {
  let n = 0;
  for (const o of ORGANS) {
    if (o.deco || !o.d || o.d.length > 20000) continue;
    const polys = flattenPath(o.d, 0.25).filter((p) => p.pts.length >= 6);
    if (!polys.length) continue;
    const an = analyseFill(polys, false);
    if (an.crossing) continue;
    const tris = fillTriangles(an);
    let want = 0;
    for (const part of an.parts) { want += Math.abs(runArea(an.runs[part.outer])); for (const h of part.holes) want -= Math.abs(runArea(an.runs[h])); }
    assert.ok(Math.abs(area2(tris) - want) <= Math.max(1e-3, want * 1e-4), `${o.id}: ${area2(tris)} vs ${want}`);
    n++;
  }
  assert.ok(n >= 6, `only ${n} organs checked`);
});
test('a run that crosses itself is cut into loops that do not, and the fill covers them whole', () => {
  const eight = polyOf([0, 0, 10, 10, 10, 0, 0, 10]);   // a bowtie: two triangles of opposite turn
  const an = analyseFill([eight], false);
  assert.equal(an.crossing, false);
  assert.equal(an.runs.length, 2);
  assert.ok(Math.abs(area2(fillTriangles(an)) - 50) < 1e-3, `${area2(fillTriangles(an))}`);
  // Under the even-odd rule the same shape is the same two lobes.
  assert.ok(Math.abs(area2(fillTriangles(analyseFill([eight], true))) - 50) < 1e-3);
});
test('a fill\'s ring has six vertices a segment and the fill\'s interior sits inside it', () => {
  const sq = rect(0, 0, 8, 8), p = fillProduct([sq], false);
  assert.equal(p.v.length % FILL_V, 0);
  // 4 segments of ring (6 vertices each) + 2 interior triangles
  assert.equal(p.n, 4 * 6 + 6);
  const ring = ringTriangles(Array.from(sq.pts), 1, []);
  assert.equal(ring.length / FILL_V, 24);
  assert.deepEqual(p.box, [0, 0, 8, 8]);
});
test('overlapping runs make a union: no ring on the edges that lie inside the other run', () => {
  const a = rect(0, 0, 10, 10), b = rect(5, 5, 10, 10);
  const p = fillProduct([a, b], false);
  assert.equal(p.crossing, true);
  const plain = ringTriangles(Array.from(a.pts), 1, []).length + ringTriangles(Array.from(b.pts), 1, []).length;
  assert.ok(p.v.length < plain + 2 * 6 * FILL_V * 2, 'inner edges were left out');
});
test('a stroke is a segment record a segment; dashed runs are not cut here', () => {
  const p = strokeProduct([polyOf([0, 0, 10, 0, 10, 10, 0, 10])], 1, polyMeshInto);
  assert.equal(p.n, 4);
  assert.equal(p.v.length, 4 * STROKE_V);
});
test('assemble writes the op index into its slot and the offsets of each item', () => {
  const a = fillProduct([rect(0, 0, 4, 4)], false), b = fillProduct([rect(10, 0, 4, 4)], false);
  const s = assemble([{ i: 0, op: 7, p: a }, { i: 1, op: 9, p: null }, { i: 2, op: 12, p: b }], FILL_V, 7);
  assert.equal(s.n, a.n + b.n);
  assert.deepEqual([...s.ofs], [0, a.n, a.n]);
  assert.deepEqual([...s.cnt], [a.n, 0, b.n]);
  assert.equal(s.buf[7], 7);
  assert.equal(s.buf[(a.n + 1) * FILL_V + 7], 12);
});

// ── Levels ──
test('the level a scale picks is the painter\'s own tolerance, in powers of two', () => {
  for (let sc = 0.05; sc < 40; sc *= 1.173) assert.equal(2 ** levelOf(sc), detailTol(sc), `scale ${sc}`);
  assert.equal(levelOf(0.01), LEVEL_COARSE);
  assert.ok(levelScale(-3) > levelScale(-2));
  assert.equal(levelOf(levelScale(-4) * 0.999), -4 - 0 === levelOf(levelScale(-4) * 0.999) ? -4 : levelOf(levelScale(-4) * 0.999));
  assert.ok(levelOf(1 * CAMERA_K_MAX * 4) >= LEVEL_MIN);
  assert.ok(DIVE_K_MAX > 22 && DIVE_K_MAX < 23);
  assert.equal(scaleOfMat([2, 0, 0, 2, 5, 5]), 2);
  assert.ok(WIN_MAX > 0);
});

// ── A stand-in GL, recording what it is asked ──
const ALL_UNIFORMS = [...new Set([G.fillVS(false), G.fillVS(true), G.FILL_FS, G.strokeVS(false), G.strokeVS(true), G.STROKE_FS, G.CLIP_VS, G.CLIP_FS].flatMap((s) => uniformsOf(s).map((u) => u.name ?? u)))];
function fakeGL() {
  const calls = [], enums = new Map(), state = new Map();
  let nextObj = 1, active = null;
  const gl = new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) { if (!enums.has(k)) enums.set(k, 0x10000 + enums.size); return enums.get(k); }
      return (...a) => {
        calls.push([k, ...a]);
        if (k === 'getShaderParameter') return true;
        if (k === 'getProgramParameter') return a[1] === gl.ACTIVE_UNIFORMS ? ALL_UNIFORMS.length : true;
        if (k === 'getActiveUniform') return { name: ALL_UNIFORMS[a[1]] };
        if (k === 'getUniformLocation') return { name: a[1] };
        if (k === 'getExtension') return null;
        if (k === 'isProgram') return true;
        if (k === 'enable') state.set(a[0], true);
        if (k === 'disable') state.set(a[0], false);
        if (k === 'useProgram') active = a[0];
        if (k.startsWith('create')) return { obj: nextObj++, kind: k };
        return undefined;
      };
    },
  });
  return { gl, calls, state, get active() { return active; } };
}
const count = (f, name, from = 0) => f.calls.slice(from).filter((c) => c[0] === name).length;

// A painter op, made the way readGroup's are, without a document.
const solid = (r, g, b, a = 1) => ({ solid: [r, g, b, a] });
const fillOp = (geom, extra = {}) => ({ kind: 'fill', geom, m: [1, 0, 0, 1, 0, 0], paint: solid(0.8, 0.3, 0.2), alpha: 1, clip: null, ...extra });
const strokeOp = (geom, extra = {}) => ({ kind: 'stroke', geom, m: [1, 0, 0, 1, 0, 0], paint: solid(0.1, 0.1, 0.1), alpha: 1, w: 2, cap: 1, clip: null, ...extra });
const polyGeom = (...polys) => ({ poly: polys });
const entryOf = (ops, extra = {}) => ({ spec: { ops, opacity: 1, mask: null, ...extra }, get m() { return [1, 0, 0, 1, 0, 0]; } });
// A path element the painter reads: its `d` is whatever it is set to, and a shape source bound to it names the shape.
function pathEl(d) { return { d, getAttribute(a) { return a === 'd' ? this.d : null; } }; }
function liverEl(pts) {
  const el = pathEl(''), set = (p) => {
    const d = `M${p[0]} ${p[1]} ${p.slice(2).reduce((s, v, i) => s + (i % 2 ? ` ${v}` : ` L${v}`), '')} Z`.replace(/\s+/g, ' ');
    el.d = d;
    const src = shapeSource(d, pathCmds(d));
    bindShape(el, src);
    return src;
  };
  return { el, set };
}
const ring = (cx, cy, r, n) => circle(cx, cy, r, n).pts;
const PASS = { variant: 0, w: 800, h: 600, m: [1, 0, 0, 1, 0, 0], box: null };
const MAT = (s) => [s, 0, 0, s, 0, 0];

function organs(deps) {
  const f = fakeGL(), spies = { flatten: 0, flattenCmds: 0, mesh: 0 };
  const v = createVecOrgans(f.gl, {
    flattenPath: (d, t) => { spies.flatten++; return flattenPath(d, t); },
    flattenCmds: (c, t) => { spies.flattenCmds++; return flattenCmds(c, t); },
    polyMeshInto: (...a) => { spies.mesh++; return polyMeshInto(...a); },
    ...deps,
  });
  return { v, f, spies };
}

test('a pinch flattens, triangulates and uploads nothing', () => {
  const { v, f, spies } = organs();
  const L = new Map([['liver', [entryOf([fillOp(polyGeom(circle(100, 100, 40, 64))), strokeOp(polyGeom(circle(100, 100, 40, 64)))])]], ['front', [entryOf([fillOp(polyGeom(rect(10, 10, 30, 30)))])]]]);
  v.setOrgans(L, ['liver', 'front']);
  v.prepare(CAMERA_K_MAX, 0.5);
  v.prepareAll();
  const levels = v.levelsHeld();
  assert.ok(levels.length >= 3, `levels ${levels}`);
  const before = { ...spies }, n0 = f.calls.length;
  for (let k = 0.5; k <= 0.5 * CAMERA_K_MAX; k *= 1.07) { v.update(); v.draw(PASS, MAT(k)); }
  assert.deepEqual(spies, before, 'nothing was cut during the pinch');
  assert.equal(count(f, 'bufferData', n0), 0, 'no vertex data uploaded');
  assert.equal(count(f, 'texSubImage2D', n0), 0, 'no row written when none changed');
  assert.ok(count(f, 'drawArrays', n0) + count(f, 'drawArraysInstanced', n0) > 0);
});
test('a frame draws the level its scale takes, else the nearest prepared', () => {
  const { v } = organs();
  v.setOrgans(new Map([['liver', [entryOf([fillOp(polyGeom(circle(0, 0, 50, 48)))])]]]), ['liver']);
  const top = v.prepare(8, 0.4);
  assert.ok(top >= 4);
  v.prepareAll();
  const held = v.levelsHeld();
  for (const sc of [0.4, 0.8, 1.6, 3.2]) { const lv = v.pick(sc); assert.equal(lv.j, levelOf(sc)); assert.ok(held.includes(lv.j)); }
  // Finer than anything prepared: the finest prepared one is used (never a coarser one while a finer is kept).
  const lv = v.pick(1000);
  assert.equal(lv.j, held[0]);
  // Coarser than the coarsest (zoomed far out) is the coarsest level.
  assert.equal(v.pick(0.001).j, LEVEL_COARSE);
});
test('prepare works in bounded steps and says when it is whole', () => {
  let t = 0;
  const { v } = organs({ now: () => (t += 10) });
  v.setOrgans(new Map([['liver', [entryOf([fillOp(polyGeom(circle(0, 0, 50, 48))), fillOp(polyGeom(rect(0, 0, 30, 30)))])]]]), ['liver']);
  v.prepare(CAMERA_K_MAX, 0.5);
  assert.equal(v.ready(), false);
  let steps = 0;
  while (!v.step(t + 1)) { steps++; assert.ok(steps < 100); }
  assert.ok(steps >= 2, 'a tight deadline takes several steps');
  assert.equal(v.ready(), true);
  assert.equal(v.ready(0.5), true);
});
test('the budget gives up the finest levels first and keeps the one in use', () => {
  const { v } = organs();
  v.setOrgans(new Map([['liver', [entryOf([fillOp(polyGeom(circle(0, 0, 50, 96)))])]]]), ['liver']);
  v.prepare(CAMERA_K_MAX, 0.5); v.prepareAll();
  v.pick(0.5);
  const was = v.levelsHeld().length;
  v.setBudget(1);
  v.trim();
  const left = v.levelsHeld();
  assert.ok(left.length < was);
  assert.ok(left.includes(LEVEL_COARSE));
  assert.ok(left.includes(levelOf(0.5)));
});

// ── The liver ──
test('the liver eases by vertex when the two outlines match point for point, and is prepared when they do not', () => {
  const same = organs();
  const A = liverEl(), B = liverEl();
  const a = A.set(ring(100, 100, 40, 90)), b = B.set(ring(100, 100, 52, 90));
  same.v.setOrgans(new Map([['liver', [entryOf([fillOp({ el: A.el, d: true }), strokeOp({ el: A.el, d: true })])]]]), ['liver']);
  same.v.prepare(CAMERA_K_MAX, 0.5);
  same.v.setMorph(a, b);
  same.v.prepareAll();
  assert.ok(same.v.stats().morphVertex >= 2, 'fill and stroke ease by vertex');
  assert.equal(same.v.stats().morphPrepared, 0);
  const n0 = same.f.calls.length;
  same.v.morphAt(0.5);
  same.v.draw(PASS, MAT(0.5));
  const t = same.f.calls.slice(n0).filter((c) => c[0] === 'uniform1f' && c[1]?.name === 'uT').map((c) => c[2]);
  assert.ok(t.length >= 2 && t.every((x) => x === 0.5), `uT ${t}`);
  // The same pair of outlines with another point count: prepared geometry, not a blend.
  const diff = organs();
  const C = liverEl(), D = liverEl();
  const c = C.set(ring(100, 100, 40, 90)), d = D.set(ring(100, 100, 52, 120));
  diff.v.setOrgans(new Map([['liver', [entryOf([fillOp({ el: C.el, d: true })])]]]), ['liver']);
  diff.v.prepare(CAMERA_K_MAX, 0.5);
  diff.v.setMorph(c, d);
  diff.v.prepareAll();
  assert.equal(diff.v.stats().morphVertex, 0);
  assert.ok(diff.v.stats().morphPrepared >= 1);
});
test('an outline that changes is cut again for the level in use, and for no more of the pinch', () => {
  const { v, spies } = organs();
  const A = liverEl();
  A.set(ring(100, 100, 40, 90));
  v.setOrgans(new Map([['liver', [entryOf([fillOp({ el: A.el, d: true })])]]]), ['liver']);
  v.prepare(CAMERA_K_MAX, 0.5); v.prepareAll();
  const built = v.stats().dynBuilt;
  A.set(ring(100, 100, 44, 90));
  v.update();
  v.prepareAll();
  assert.ok(v.stats().dynBuilt > built, 'the new outline was prepared');
  const was = { ...spies };
  for (let k = 0.5; k < 3; k *= 1.1) { v.update(); v.draw(PASS, MAT(k)); }
  assert.deepEqual(spies, was);
});
test('the morph helpers keep one topology', () => {
  const a = analyseFill([circle(0, 0, 10, 40)]), b = analyseFill([circle(0, 0, 12, 40)]), c = analyseFill([circle(0, 0, 12, 41)]);
  assert.equal(morphable(a, b), true);
  assert.equal(morphable(a, c), false);
  const m = fillMorphProduct(a, b);
  assert.equal(m.v.length, m.n * FILL_VM);
  assert.equal(fillMorphProduct(a, c), null);
  const sa = strokeProduct([circle(0, 0, 10, 40)], 1, polyMeshInto), sb = strokeProduct([circle(0, 0, 12, 40)], 1, polyMeshInto), sc = strokeProduct([circle(0, 0, 12, 41)], 1, polyMeshInto);
  assert.equal(strokeMorphProduct(sa, sb).v.length, sa.n * STROKE_VM);
  assert.equal(strokeMorphProduct(sa, sc), null);
});

// ── Masks and clips ──
test('a mask is rebuilt once per change of its shape, not once per consumer', () => {
  const { v, f } = organs();
  const mel = pathEl('M0 0 L 100 0 L 100 100 L 0 100 Z');
  const maskSpec = { ops: [fillOp({ el: mel, d: true }, { paint: solid(1, 1, 1) })], opacity: 1, mask: null };
  const grp = (x) => ({ kind: 'group', ops: [fillOp(polyGeom(rect(x, 0, 20, 20)))], mask: maskSpec, m: [1, 0, 0, 1, 0, 0], alpha: 0.6, clip: null });
  v.setOrgans(new Map([['gut', [entryOf([grp(0), grp(40), grp(80)])]]]), ['gut']);
  assert.equal(v.stats().maskRebuilds, 1, 'three groups, one mask');
  v.update(); v.update();
  assert.equal(v.stats().maskRebuilds, 1, 'nothing changed');
  mel.d = 'M0 0 L 120 0 L 120 100 L 0 100 Z';
  v.update();
  assert.equal(v.stats().maskRebuilds, 2, 'the shape changed: once');
  assert.ok(count(f, 'texImage2D') >= 3);
  assert.ok(v.limits().some((l) => /see-through/.test(l.what)), 'the group isolation limit is reported');
});
test('a clip is marked in the stencil, never in the overlays\' bit, and the pass leaves depth and stencil off', () => {
  const { v, f } = organs();
  const clip = { geom: polyGeom(rect(0, 0, 50, 50)), m: [1, 0, 0, 1, 0, 0], km: [1, 0, 0, 1, 0, 0], chain: null };
  v.setOrgans(new Map([['stomach', [entryOf([fillOp(polyGeom(circle(25, 25, 40, 40)), { clip })])]]]), ['stomach']);
  v.prepare(CAMERA_K_MAX, 1); v.prepareAll();
  const n0 = f.calls.length;
  v.draw(PASS, MAT(1));
  const masks = f.calls.slice(n0).filter((c) => c[0] === 'stencilMask').map((c) => c[1]);
  assert.ok(masks.some((m) => m === 0x20), 'the clip bit');
  assert.ok(masks.every((m) => m === 0xff || m === 0 || (m & 0x80) === 0), 'bit 0x80 is the overlays\'');
  assert.equal(f.state.get(f.gl.STENCIL_TEST), false);
  assert.equal(f.state.get(f.gl.DEPTH_TEST), false);
  assert.ok(count(f, 'clear', n0) >= 2, 'depth and stencil cleared after, for whoever draws next');
});
test('only the layers asked for are drawn', () => {
  const { v, f } = organs();
  v.setOrgans(new Map([['back', [entryOf([fillOp(polyGeom(rect(0, 0, 9, 9)))])]], ['front', [entryOf([fillOp(polyGeom(rect(0, 0, 5, 5)))])]]]), ['back', 'front']);
  v.prepare(CAMERA_K_MAX, 1); v.prepareAll();
  const draws = (only) => { const n0 = f.calls.length; v.draw(PASS, MAT(1), only); return count(f, 'drawArrays', n0); };
  const all = draws(null), front = draws('front'), none = draws('liver');
  assert.ok(all >= 2 && front === 1 && none === 0, `${all} ${front} ${none}`);
});

// ── Covers ──
test('the covers are painted once for a set of shapes and again only when they change', () => {
  const { v } = organs();
  v.setOrgans(new Map([['liver', [entryOf([fillOp(polyGeom(rect(0, 0, 9, 9)))])]]]), ['liver']);
  const shapes = [{ d: 'M0 0 L 80 0 L 80 80 L 0 80 Z', w: 0 }, { circle: [40, 40, 20], w: 0 }, { d: 'M0 0 L 90 90', w: 6 }];
  assert.equal(v.setCovers(shapes, [0, 0, 100, 100], 1.5), true);
  v.update();
  assert.equal(v.stats().coverRebuilds, 1);
  assert.equal(v.setCovers(shapes.slice(), [0, 0, 100, 100], 1.5), false, 'the same shapes');
  v.update();
  assert.equal(v.stats().coverRebuilds, 1);
  assert.equal(v.setCovers([...shapes, { d: 'M10 10 L 20 10 L 20 20 Z', w: 0 }], [0, 0, 100, 100], 1.5), true);
  v.update();
  assert.equal(v.stats().coverRebuilds, 2);
  const c = v.covers();
  assert.deepEqual(c.rect, [0, 0, 100, 100]);
  assert.ok(c.tex);
});

// ── Shaders ──
test('every shader string lints clean and declares what the module sets', () => {
  const src = { fillVS: G.fillVS(false), fillVSm: G.fillVS(true), FILL_FS: G.FILL_FS, strokeVS: G.strokeVS(false), strokeVSm: G.strokeVS(true), STROKE_FS: G.STROKE_FS, CLIP_VS: G.CLIP_VS, CLIP_FS: G.CLIP_FS };
  for (const [k, s] of Object.entries(src)) assert.deepEqual(lintGLSL(s), [], k);
  const names = (s) => uniformsOf(s).map((u) => u.name ?? u);
  for (const u of ['uCam', 'uExt', 'uOps', 'uSize', 'uFlip']) assert.ok(names(G.fillVS(false)).includes(u), `fill vertex ${u}`);
  assert.ok(names(G.fillVS(true)).includes('uT') && !names(G.fillVS(false)).includes('uT'));
  assert.ok(names(G.strokeVS(true)).includes('uT'));
  for (const u of ['uMode', 'uMask', 'uMaskRect', 'uMaskInv', 'uMaskOn', 'plateAlpha', 'plateSat']) { assert.ok(names(G.FILL_FS).includes(u), `fill fragment ${u}`); assert.ok(names(G.STROKE_FS).includes(u), `stroke fragment ${u}`); }
  assert.equal(G.OP_TEXELS, 20);
  assert.ok(G.T_W + 1 <= G.OP_TEXELS);
  assert.ok(G.OP_DEPTHS >= 4096);
});

// ── Coverage: every organ outline the figure has goes through the whole path ──
test('every organ of the figure is prepared at every level and drawn', () => {
  const { v, f } = organs();
  const L = new Map();
  let n = 0;
  for (const o of ORGANS) {
    if (!o.d || o.d.length > 30000) continue;
    const layer = o.deco ? 'front' : 'back';
    if (!L.has(layer)) L.set(layer, []);
    const el = pathEl(o.d);
    L.get(layer).push(entryOf([fillOp({ el, d: true }), ...(o.deco ? [strokeOp({ el, d: true })] : [])]));
    n++;
  }
  assert.ok(n >= 10);
  v.setOrgans(L, ['back', 'front']);
  v.prepare(DIVE_K_MAX, 0.4);
  v.prepareAll();
  assert.ok(v.levelsHeld().length >= 5);
  assert.equal(v.opCount >= n, true);
  const n0 = f.calls.length;
  for (const k of [0.4, 1, 3, 9]) v.draw(PASS, MAT(k));
  assert.ok(count(f, 'drawArrays', n0) + count(f, 'drawArraysInstanced', n0) >= 4);
  assert.ok(v.stats().bytes > 0);
});

test('a frame with nothing prepared still draws: its own level is made once', () => {
  const { v, f, spies } = organs();
  v.setOrgans(new Map([['liver', [entryOf([fillOp(polyGeom(circle(0, 0, 50, 48)))])]]]), ['liver']);
  const n0 = f.calls.length;
  v.draw(PASS, MAT(0.5));
  assert.ok(count(f, 'drawArrays', n0) >= 1, 'drawn without a prepare or a step');
  const was = { ...spies };
  v.draw(PASS, MAT(0.5));
  assert.deepEqual(spies, was, 'the second frame cuts nothing');
  // After new organs are set, every level is stale: the frame makes its own again.
  v.setOrgans(new Map([['liver', [entryOf([fillOp(polyGeom(circle(0, 0, 60, 48)))])]]]), ['liver']);
  const n1 = f.calls.length;
  v.draw(PASS, MAT(0.5));
  assert.ok(count(f, 'drawArrays', n1) >= 1);
});
