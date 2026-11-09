// Acceptance 5 (vector-renderer-plan.md section 11): fades and selection without double-darkening.
// Node judges, with C's JS twin of the region shader's tier and group compositing (compositeGroups: accB, accN, accT): a faded network over
// two overlapping vessels is the group's alpha once, not the product of two; the selected vessel's own share lies over the faded group, the
// same inside the overlap and outside it; a tier's translucency is composited as one shape before the fade. On the region shader's text: the
// network's fade is applied once. On the devices: select a vessel over another.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/ui/vec-contract.js';

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });
const { compositeGroups, over, vecRegionFS } = await import('../src/ui/vec-region-glsl.js');
const GL = await import('../src/ui/veins-gl.js');

const rnd = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const pm = (r, g, b, a) => [r * a, g * a, b * a, a];   // a premultiplied colour
const near = (a, b, e = 1e-12) => a.every((v, i) => Math.abs(v - b[i]) <= e);
const net = (c, extra = {}) => ({ grp: 1, c, ...extra });

test('a faded network over two overlapping opaque vessels has the group\'s alpha once: the overlap is as faded as the vessels apart', () => {
  const r = rnd(21);
  for (let n = 0; n < 2000; n++) {
    const a = 0.05 + r() * 0.9, c1 = pm(r(), r(), r(), 1), c2 = pm(r(), r(), r(), 1);
    const overlap = compositeGroups([net(c1), net(c2)], a), apart1 = compositeGroups([net(c1)], a), apart2 = compositeGroups([net(c2)], a);
    assert.ok(Math.abs(overlap[3] - a) < 1e-12 && Math.abs(apart1[3] - a) < 1e-12 && Math.abs(apart2[3] - a) < 1e-12, `alpha ${overlap[3]} is the network's ${a}`);
    // what the overlap shows is the vessel in front, faded as the group
    assert.ok(near(overlap, c2.map((v) => v * a)), 'the front vessel, faded once');
    // double-darkening would be each vessel faded alone and then laid over the other
    const twice = over(c2.map((v) => v * a), c1.map((v) => v * a));
    assert.ok(twice[3] > overlap[3] || a > 0.999, 'the naive way (each vessel faded, then laid over the other) is denser: that is the double-darkening this avoids');
  }
});

test('translucent vessels are composited as one shape, and the fade multiplies that shape once', () => {
  const r = rnd(22);
  for (let n = 0; n < 2000; n++) {
    const a = 0.1 + r() * 0.85, al1 = 0.2 + r() * 0.7, al2 = 0.2 + r() * 0.7;
    const c1 = pm(r(), r(), r(), al1), c2 = pm(r(), r(), r(), al2), shape = over(c2, c1);
    const got = compositeGroups([net(c1), net(c2)], a);
    assert.ok(near(got, shape.map((v) => v * a)), 'the group\'s shape, times the fade, once');
    assert.ok(Math.abs(got[3] - a * (1 - (1 - al1) * (1 - al2))) < 1e-12);
  }
});

test('the selected vessel\'s own share lies over the faded network, the same inside the overlap as outside it', () => {
  const r = rnd(23);
  for (let n = 0; n < 2000; n++) {
    const a = 0.05 + r() * 0.5, sel = pm(r(), r(), r(), 1), other = pm(r(), r(), r(), 1);
    const outside = compositeGroups([net(sel, { wsel: 1 })], a), inside = compositeGroups([net(other), net(sel, { wsel: 1 })], a);
    assert.ok(near(outside, sel), 'alone, the selected vessel is shown whole, not faded');
    assert.ok(near(inside, sel), 'over another vessel it is shown whole as well: not darkened by the other, and not faded twice');
    // and when the other vessel is in front, the selected one still lies over it
    const behind = compositeGroups([net(sel, { wsel: 1 }), net(other)], a);
    assert.ok(near(behind, over(sel, other.map((v) => v * a))), 'a vessel in front of the selected one is only the faded group, with the selected lying over it');
  }
});

test('a lifted vessel and a vessel behind the organs are layers of their own: the fade is not applied to them', () => {
  const r = rnd(24);
  for (let n = 0; n < 1000; n++) {
    const a = 0.1 + r() * 0.8, back = pm(r(), r(), r(), 0.6 + r() * 0.4), lift = pm(r(), r(), r(), 0.5 + r() * 0.5), mid = pm(r(), r(), r(), 1);
    const got = compositeGroups([{ grp: 0, c: back }, net(mid), { grp: 2, c: lift }], a);
    assert.ok(near(got, over(lift, over(mid.map((v) => v * a), back))), 'behind, then the faded network, then the lifted one');
  }
});

test('the region shader fades the composited network exactly as the twin does: every place it forms the pixel multiplies accN by the fade once, and nothing else does', () => {
  const K = { F_DIFFUSE: GL.F_DIFFUSE, F_EDGE: GL.F_EDGE, F_SHADOW: GL.F_SHADOW, F_SPEC: GL.F_SPEC, F_VEIL: GL.F_VEIL, F_WHOLE: GL.F_WHOLE, F_SEL: GL.F_SEL, F_DOTTED: GL.F_DOTTED, F_NOCASE: GL.F_NOCASE, VEIL_K: GL.VEIL_K };
  for (const v of [C.V_FULL, C.V_BASE, C.V_BLOOD]) {
    const src = vecRegionFS(v, K), count = (t) => src.split(t).length - 1;
    const formed = count('vec4 o = over(accT, over(accN * netAlpha, accB));');   // (the lumen test and the picture each form the pixel from the layers)
    assert.ok(formed >= 1 && formed <= 2, `variant ${v}: the pixel is formed from the layers in ${formed} place(s)`);
    assert.equal(count('* netAlpha'), formed, `variant ${v}: the fade multiplies the composited network there and nowhere else`);
  }
});
