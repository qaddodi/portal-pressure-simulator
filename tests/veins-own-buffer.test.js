import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The stage's vessel canvas keeps no picture of its own (120 fps addendum §7; on by default since 31 Oct, recs A3): it is made
// without preserveDrawingBuffer, and the picture the frames repaint in part is kept in a texture of the renderer's own, copied whole
// onto the canvas whenever it is drawn on. A renderer that is neither the stage's nor the lobule's keeps its canvas's picture itself.

globalThis.ResizeObserver ??= class { observe() {} };
globalThis.MutationObserver ??= class { observe() {} };
globalThis.window ??= globalThis;
globalThis.Element ??= class {};
globalThis.matchMedia ??= () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.document ??= { documentElement: { dataset: {}, style: { setProperty() {} } }, addEventListener() {}, createElement: () => ({ getContext: () => ({}) }) };
globalThis.addEventListener ??= () => {};
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => '' });

function fakeGL() {
  const calls = [], enums = new Map();
  let nextObj = 1;
  const gl = new Proxy({}, {
    get(_, k) {
      if (typeof k !== 'string') return undefined;
      if (/^[A-Z0-9_]+$/.test(k)) { if (!enums.has(k)) enums.set(k, 0x10000 + enums.size); return enums.get(k); }
      return (...a) => {
        calls.push([k, ...a]);
        if (k === 'getShaderParameter') return true;
        if (k === 'getProgramParameter') return a[1] === gl.ACTIVE_UNIFORMS ? 0 : true;
        if (k === 'getExtension') return null;
        if (k === 'getParameter') return 'stand-in';
        if (k.startsWith('create')) return { obj: nextObj++, kind: k };
        return undefined;
      };
    },
  });
  return { gl, calls };
}
async function renderer(url, who) {
  const mod = await import(url);
  const f = fakeGL();
  let attrs = null;
  const canvas = { width: 800, height: 600, getContext: (_, a) => { attrs = a; return f.gl; }, addEventListener() {}, removeEventListener() {}, toDataURL: () => 'data:' };
  const g = mod.createVeinsGL(canvas, { tubes: 4, force: true, ...(who ? { who } : {}) });
  const line = (y) => Array.from({ length: mod.N_SAMPLES }, (_, i) => [40 + i * 10, y]);
  g.setGeometry(mod.binVeins([{ id: 0, pts: line(100), reach: 30 }, { id: 1, pts: line(300), reach: 30 }], []));
  const look = { shOff: [0, 0], light: [0, -1], reach: 11, organs: 0, casing: [0, 0, 0, 1], shadow: [0, 0, 0, 0], sheen: [1, 1, 1, 0], shade: [0, 0, 0, 0], ring: [0, 0, 0, 0], netAlpha: 1, fx: true, tierAlpha: Array(mod.MAX_TIERS).fill(1), tierGroup: Array(mod.MAX_TIERS).fill(1) };
  return { g, f, attrs, canvas, look };
}
const blits = (f, from) => f.calls.slice(from).filter((c) => c[0] === 'blitFramebuffer');

function keepsItsOwn({ g, f, attrs, look }) {
  assert.equal(attrs.preserveDrawingBuffer, true);
  const n0 = f.calls.length;
  g.draw([1, 0, 0, 1, 0, 0], look, { on: false });
  g.composite(look, { on: true });
  assert.equal(blits(f, n0).length, 0);
  // The composite draws onto the canvas itself (framebuffer null).
  const binds = f.calls.slice(n0).filter((c) => c[0] === 'bindFramebuffer');
  assert.deepEqual(binds.at(-1), ['bindFramebuffer', f.gl.FRAMEBUFFER, null]);
}

test('the stage\'s vessel canvas is not kept by the browser: the renderer keeps it (keep-screen.js) and has no stencil of its own: the kept picture holds it', async () => {
  const { attrs } = await renderer('../src/ui/veins-gl.js');
  assert.equal(attrs.preserveDrawingBuffer, false);
  assert.equal(attrs.stencil, false);
});

test('a renderer neither the stage\'s nor the lobule\'s keeps its own picture; there is no ?lzone switch', async () => {
  keepsItsOwn(await renderer('../src/ui/veins-gl.js', 'apart'));
  assert.doesNotMatch(readFileSync(new URL('../src/ui/veins-gl.js', import.meta.url), 'utf8'), /LZ_ONE|lzone=/);
});

test('by default the lobule\'s vessel canvas draws into its kept picture too, so its overlay can be laid over each present', async () => {
  const { g, f, attrs, canvas, look } = await renderer('../src/ui/veins-gl.js', 'lobule');
  assert.equal(attrs.preserveDrawingBuffer, false);
  assert.ok(g.top, 'a top for the overlay');
  const n0 = f.calls.length;
  g.draw([1, 0, 0, 1, 0, 0], look, { on: false });
  assert.equal(blits(f, n0).length, 1, 'one copy for the drawn picture');
  assert.ok(canvas.width > 0);
});

test('a whole picture is drawn straight onto the canvas (no copy), and the next partial frame draws whole into the kept picture first', async () => {
  const { g, f, look } = await renderer('../src/ui/veins-gl.js?direct');
  const n0 = f.calls.length;
  g.draw([1, 0, 0, 1, 0, 0], look, { on: false });
  assert.equal(blits(f, n0).length, 0, 'no copy for a whole picture');
  const binds = f.calls.slice(n0).filter((c) => c[0] === 'bindFramebuffer' && c[1] === f.gl.FRAMEBUFFER);
  assert.ok(binds.some((c) => c[2] === null));
  // (The blood's own frame next: the kept picture is out of date, so it is drawn whole into it and copied once.)
  const n1 = f.calls.length;
  g.composite(look, { on: true });
  assert.equal(blits(f, n1).length, 1, 'drawn into the kept picture, then copied');
});

test('a picture drawn into the kept texture is copied whole onto the canvas', async () => {
  {
    const { g, f, attrs, canvas, look } = await renderer('../src/ui/veins-gl.js');
    assert.equal(attrs.preserveDrawingBuffer, false);
    g.draw([1, 0, 0, 1, 0, 0], look, { on: false });
    // (The whole picture went straight onto the canvas; the blood's frame after it is drawn whole into the kept picture.)
    const n0 = f.calls.length;
    g.composite(look, { on: true });
    const b = blits(f, n0);
    assert.equal(b.length, 1, 'one copy for the drawn picture');
    assert.deepEqual(b[0].slice(1), [0, 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height, f.gl.COLOR_BUFFER_BIT, f.gl.NEAREST], 'whole, unscaled, unfiltered');
    // The copy goes from the kept picture to the canvas, with no scissor cutting it.
    const before = f.calls.slice(n0, f.calls.indexOf(b[0]));
    const read = before.filter((c) => c[0] === 'bindFramebuffer' && c[1] === f.gl.READ_FRAMEBUFFER).at(-1);
    const draw = before.filter((c) => c[0] === 'bindFramebuffer' && c[1] === f.gl.DRAW_FRAMEBUFFER).at(-1);
    assert.ok(read[2] && read[2].kind === 'createFramebuffer');
    assert.equal(draw[2], null);
    assert.ok(before.some((c) => c[0] === 'disable' && c[1] === f.gl.SCISSOR_TEST));
    // The composite drew into that same kept picture, not onto the canvas.
    const compBind = before.filter((c) => c[0] === 'bindFramebuffer' && c[1] === f.gl.FRAMEBUFFER && c[2] === read[2]);
    assert.ok(compBind.length >= 1);
    // A blood-only frame: copied whole again (the canvas may have dropped the last one). (Its blood fading, so it is not the last picture.)
    const n1 = f.calls.length;
    g.composite(look, { on: true, alpha: 0.5 });
    assert.equal(blits(f, n1).length, 1);
    // A picture taken (snapshot) copies first, and the first picture after a resize is drawn whole.
    const n2 = f.calls.length;
    assert.equal(g.snapshot(), 'data:');
    assert.equal(blits(f, n2).length, 1);
    canvas.width = 640;
    g.draw([1, 0, 0, 1, 0, 0], look, { on: false });
    const n3 = f.calls.length;
    g.composite(look, { on: true });
    assert.deepEqual(blits(f, n3)[0].slice(3, 4), [640]);
    // Cleared: the kept picture is cleared too, so no part of the old one comes back in a later partial frame.
    const n4 = f.calls.length;
    g.clear();
    const cl = f.calls.slice(n4);
    assert.ok(cl.findIndex((c) => c[0] === 'bindFramebuffer' && c[2] === read[2]) < cl.findIndex((c) => c[0] === 'clear'));
    assert.equal(cl.filter((c) => c[0] === 'clear').length, 2);
  }
});

test('by default capture() copies the kept picture onto the canvas before an export reads it', async () => {
  const { g, f, canvas, look } = await renderer('../src/ui/veins-gl.js');
  g.draw([1, 0, 0, 1, 0, 0], look, { on: false });
  const n = f.calls.length;
  assert.equal(g.capture(), canvas);
  assert.equal(blits(f, n).length, 1);
});

test('a canvas resized and not yet drawn again is not given the old picture (it would land in a corner)', async () => {
  const { g, f, canvas, look } = await renderer('../src/ui/veins-gl.js');
  g.draw([1, 0, 0, 1, 0, 0], look, { on: false });
  canvas.width = 1024; canvas.height = 700;
  const n = f.calls.length;
  g.present(); g.capture();
  assert.equal(blits(f, n).length, 0, 'nothing copied onto the resized canvas');
  g.draw([1, 0, 0, 1, 0, 0], look, { on: false });
  // (Since 753bd6d5 consecutive whole pictures stay direct: the next one is drawn whole straight onto the canvas, at its new size.)
  assert.equal(blits(f, n).length, 0, 'nothing copied: the next picture is drawn onto the canvas itself');
  const c = f.calls.slice(n), last = c.findLastIndex((x) => x[0] === 'viewport');
  assert.deepEqual(c[last].slice(1), [0, 0, 1024, 700], 'at the new size');
  assert.deepEqual(c.slice(0, last).findLast((x) => x[0] === 'bindFramebuffer'), ['bindFramebuffer', f.gl.FRAMEBUFFER, null], 'on the canvas');
});

// (Which framebuffer each copy wrote to: null is the canvas.)
function blitTargets(f, from) {
  let draw = null;
  const out = [];
  for (const c of f.calls.slice(from)) {
    if (c[0] === 'bindFramebuffer' && (c[1] === f.gl.FRAMEBUFFER || c[1] === f.gl.DRAW_FRAMEBUFFER)) draw = c[2];
    if (c[0] === 'blitFramebuffer') out.push(draw);
  }
  return out;
}

test('by default a pan copies at most the kept picture onto the canvas, once (the layer wraps and is not copied)', async () => {
  const { g, f, look } = await renderer('../src/ui/veins-gl.js');
  g.draw([1, 0, 0, 1, 0, 0], look, { on: false });
  const n = f.calls.length;
  g.draw([1, 0, 0, 1, 12, -7], look, { on: false });
  // (Since 753bd6d5 a whole pan frame after a whole frame is drawn straight onto the canvas: no copy at all. Any copy goes to the canvas.)
  const t = blitTargets(f, n);
  assert.ok(t.length <= 1 && t.every((x) => x === null), `copies: ${JSON.stringify(t)}`);
});

test('by default a zoom frame draws in one pass even where the context has no stencil: the kept picture brings its own', async () => {
  const { g, f, look } = await renderer('../src/ui/veins-gl.js');
  g.draw([1, 0, 0, 1, 0, 0], look, { on: true });
  const n = f.calls.length;
  g.draw([1.5, 0, 0, 1.5, 0, 0], look, { on: true });
  const c = f.calls.slice(n);
  assert.ok(c.some((x) => x[0] === 'enable' && x[1] === f.gl.STENCIL_TEST), 'the vessel cells marked in the stencil');
  assert.ok(f.calls.some((x) => x[0] === 'renderbufferStorage' && x[2] === f.gl.STENCIL_INDEX8), 'a stencil of the kept picture\'s own');
  assert.equal(blitTargets(f, n).at(-1), null, 'then copied onto the canvas');
});

test('a stand-in for the whole picture (top.replace) is drawn alone at the present, on a cleared canvas, and nothing is copied', async () => {
  const { g, f, look } = await renderer('../src/ui/veins-gl.js', 'lobule');
  g.draw([1, 0, 0, 1, 0, 0], look, { on: false });
  let on = true, drawn = 0;
  const off = g.top.replace({ on: () => on, draw: () => { drawn++; } });
  const p0 = g.top.presents, n = f.calls.length;
  g.present();
  assert.equal(drawn, 1, 'the stand-in drawn');
  assert.equal(g.top.presents, p0 + 1, 'counted as a present, so the owner does not present again');
  assert.equal(blits(f, n).length, 0, 'the kept picture is not copied under it');
  assert.ok(f.calls.slice(n).some((c) => c[0] === 'clear'), 'over a cleared canvas');
  on = false;
  const m = f.calls.length;
  g.present();
  assert.equal(drawn, 1, 'switched off: not drawn');
  assert.equal(blits(f, m).length, 1, 'the kept picture laid again');
  on = true; off();
  g.present();
  assert.equal(drawn, 1, 'removed: not drawn');
});
