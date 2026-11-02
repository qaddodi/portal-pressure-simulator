// One context for the figure, the lobule and the dive's field (gl-share.js): each renderer's state is its own, a layer's default framebuffer
// is its layer, and the affine that places a layer is the CSS transform it stands for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shareGL, cssAffine, compose, IDENTITY } from '../src/ui/gl-share.js';

// A context that records what it holds, enough of WebGL2 for the hub.
class FakeGL {
  constructor() {
    Object.assign(this, { FRAMEBUFFER: 1, READ_FRAMEBUFFER: 2, DRAW_FRAMEBUFFER: 3, ARRAY_BUFFER: 4, ELEMENT_ARRAY_BUFFER: 5, TEXTURE_2D: 6, TEXTURE0: 100, BLEND: 7, SCISSOR_TEST: 8, DITHER: 9,
      ONE: 10, ZERO: 11, FUNC_ADD: 12, LESS: 13, ALWAYS: 14, KEEP: 15, BACK: 16, FRONT: 17, CCW: 18, VIEWPORT: 19, SCISSOR_BOX: 20, RGBA8: 21, RGBA: 22, UNSIGNED_BYTE: 23, LINEAR: 24,
      TEXTURE_MIN_FILTER: 25, TEXTURE_MAG_FILTER: 26, TEXTURE_WRAP_S: 27, TEXTURE_WRAP_T: 28, CLAMP_TO_EDGE: 29, RENDERBUFFER: 30, DEPTH24_STENCIL8: 31, COLOR_ATTACHMENT0: 32,
      DEPTH_STENCIL_ATTACHMENT: 33, COLOR_BUFFER_BIT: 34, PACK_ALIGNMENT: 35, UNPACK_ALIGNMENT: 36, UNPACK_FLIP_Y_WEBGL: 37, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 38,
      UNPACK_COLORSPACE_CONVERSION_WEBGL: 39, BROWSER_DEFAULT_WEBGL: 40, FRAMEBUFFER_BINDING: 41, READ_FRAMEBUFFER_BINDING: 42, VERTEX_ARRAY_BINDING: 43 });
    this.st = { fbR: null, fbD: null, prog: null, vao: null, blend: false, unit: 100, tex: new Map(), vp: [0, 0, 300, 150] };
    this.canvas = { width: 300, height: 150, addEventListener() {}, removeEventListener() {} };
    this.n = 0;
  }
  getParameter(k) { return k === this.VIEWPORT ? this.st.vp : k === this.SCISSOR_BOX ? [0, 0, 300, 150] : k === this.FRAMEBUFFER_BINDING ? this.st.fbD : null; }
  bindFramebuffer(t, f) { if (t !== this.DRAW_FRAMEBUFFER) this.st.fbR = f; if (t !== this.READ_FRAMEBUFFER) this.st.fbD = f; }
  useProgram(p) { this.st.prog = p; }
  bindVertexArray(v) { this.st.vao = v; }
  enable(c) { if (c === this.BLEND) this.st.blend = true; }
  disable(c) { if (c === this.BLEND) this.st.blend = false; }
  activeTexture(u) { this.st.unit = u; }
  bindTexture(t, x) { this.st.tex.set(this.st.unit, x); }
  viewport(...v) { this.st.vp = v; }
  createVertexArray() { return { vao: ++this.n }; }
  createTexture() { return { tex: ++this.n }; }
  createRenderbuffer() { return { rb: ++this.n }; }
  createFramebuffer() { return { fb: ++this.n }; }
  texImage2D() {} texParameteri() {} bindRenderbuffer() {} renderbufferStorage() {} framebufferTexture2D() {} framebufferRenderbuffer() {}
  clearColor() {} colorMask() {} clear() {} scissor() {} blendFuncSeparate() {} blendEquationSeparate() {} pixelStorei() {} bindBuffer() {}
  drawArrays() {} isContextLost() { return false; } getContextAttributes() { return {}; } getExtension() { return null; }
}

test('each owner of the shared context finds the state it left, and a layer draws into its own framebuffer, never the canvas', () => {
  const G = new FakeGL();
  const hub = shareGL(G);
  const fig = hub.primary, L = hub.layer('lobule');
  fig.useProgram('figProg'); fig.enable(G.BLEND); fig.bindVertexArray('figVao'); fig.activeTexture(G.TEXTURE0 + 2); fig.bindTexture(G.TEXTURE_2D, 'figTex');
  L.canvas.width = 64; L.canvas.height = 32;
  const lg = L.canvas.getContext('webgl2');
  assert.equal(lg, L.gl);
  lg.useProgram('lobProg');
  // (The layer's turn: none of the figure's state is left for it, and its default vertex array is its own.)
  assert.equal(G.st.blend, false);
  assert.notEqual(G.st.vao, 'figVao');
  assert.equal(G.st.prog, 'lobProg');
  lg.bindFramebuffer(G.FRAMEBUFFER, null);
  assert.ok(G.st.fbD && G.st.fbD.fb, 'null is the layer');
  assert.equal(lg.getParameter(G.FRAMEBUFFER_BINDING), null, 'and reads back as null to the layer');
  assert.ok(L.texture(), 'the layer has its picture');
  // (The figure's next call: its state back as it left it, its framebuffer the canvas.)
  fig.drawArrays();
  assert.equal(G.st.prog, 'figProg');
  assert.equal(G.st.blend, true);
  assert.equal(G.st.vao, 'figVao');
  assert.equal(G.st.fbD, null);
  assert.equal(G.st.tex.get(G.TEXTURE0 + 2), 'figTex');
  assert.equal(G.st.unit, G.TEXTURE0 + 2);
  // (And the layer's again.)
  lg.drawArrays();
  assert.equal(G.st.prog, 'lobProg');
  assert.ok(G.st.fbD?.fb);
  assert.equal(G.st.blend, false);
  assert.ok(lg instanceof FakeGL, 'an owner is a context of the same kind to every check');
});

test('a layer\'s place is its CSS transform: translate, rotate and scale about the origin, composed outer over inner', () => {
  const at = (m, x, y, w, h) => [(m[0] * (x / w) + m[2] * (y / h) + m[4]) * w, (m[1] * (x / w) + m[3] * (y / h) + m[5]) * h];
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
  // scale 2 about (50, 20): the origin stays, (60, 20) goes to (70, 20).
  const s = cssAffine(200, 100, { ox: 50, oy: 20, k: 2 });
  assert.ok(near(at(s, 50, 20, 200, 100), [50, 20]));
  assert.ok(near(at(s, 60, 20, 200, 100), [70, 20]));
  // rotate 90° (clockwise on the screen) about (100, 50): (150, 50) goes to (100, 100).
  assert.ok(near(at(cssAffine(200, 100, { ox: 100, oy: 50, r: Math.PI / 2 }), 150, 50, 200, 100), [100, 100]));
  // translate after the scale: the origin moves by it.
  assert.ok(near(at(cssAffine(200, 100, { ox: 50, oy: 20, tx: 5, ty: -3, k: 0.5 }), 50, 20, 200, 100), [55, 17]));
  // compose(outer, inner): inner first.
  const inner = cssAffine(200, 100, { ox: 0, oy: 0, k: 2 }), outer = cssAffine(200, 100, { tx: 10, ty: 0 });
  assert.ok(near(at(compose(outer, inner), 10, 10, 200, 100), [30, 20]));
  assert.ok(near(compose(IDENTITY, inner), inner));
});

test('the figure lays the lobule\'s and the field\'s layers under every glass, and keeps the cards\' glass in its canvas through the dive', () => {
  const st = readFileSync(new URL('../src/ui/stage.js', import.meta.url), 'utf8'), lz = readFileSync(new URL('../src/ui/lobule-zoom.js', import.meta.url), 'utf8');
  assert.match(st, /layOff = veins\.top\.add\(\{ order: -40, prep: layLayers, draw: \(\) => \{\} \}\);/);
  assert.match(st, /if \(diveT > 0 && !merged\) return 'the dive is under way';/);
  assert.match(st, /const mergedFrost = \(\) => !!lz\?\.merged\?\.\(\) && !lz\.sinusoidActive\?\.\(\);/);
  assert.match(lz, /gl = createVeinsGL\(surfOf\(\), \{ tubes: MAXT, force: true, who: 'lobule' \}\);/);
  assert.match(lz, /fieldGL = createFieldGL\(fieldSurf\(\)\)/);
  assert.match(readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8'), /\.stage-view\.gl-merge\.in-lobule #veins \{ visibility: visible; \}/);
});
