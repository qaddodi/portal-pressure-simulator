// One WebGL2 context for the figure and the lobule (2 Nov 2026, Mohammad: "CARDS ARE GLASS", on the lobule dive).
//
// The anatomy, the dive's field and the lobule were three canvases, each with its own context, stacked by the page. A card's frosted
// glass is drawn inside one canvas and blurs what that canvas holds, so over the dive (the field fading in over the anatomy, the lobule
// over the field) no canvas held the whole picture under a card, and the cards stood solid for the whole zoom. Here the lobule's and the
// field's renderers draw in the figure's own context instead, each into a layer of its own (a texture the size its canvas was), and the
// figure lays those layers over its picture before any glass takes its blur (veins-gl top.add, their prep). Nothing is copied between
// contexts (a canvas read into another context is a readback to the CPU on Safari).
//
// Each renderer keeps writing WebGL as if the context were its own: it is handed a context of its own (an owner, below) whose calls go
// to the one real context. An owner keeps a record of the state it set (bindings, switches, blend, viewport, scissor, the unpack
// switches); the first call of an owner after another owner's puts that state back as it left it, and every name the other owner set and
// it did not back to the context's starting value. So no renderer sees another's state. A layer owner's default framebuffer (null) is its
// layer, its default vertex array one of its own, and its canvas a stand-in whose width and height size the layer.

import { startProgram, checkProgram, publishWhenDone } from './gl-compile.js?v=0ca233872f';


const hubs = new WeakMap();

/** The hub for real context gl (made on the first call; one per context). */
export function shareGL(gl) {
  let h = hubs.get(gl);
  if (!h) { h = makeHub(gl); hubs.set(gl, h); }
  return h;
}

/** True for an owner's context (one a hub handed out). */
export const isShared = (g) => !!g && !!g.__share;

function makeHub(real) {
  const G = real;
  const canvas = G.canvas;
  // What the real context holds now, for every name an owner has set (name -> value), and the context's starting values.
  let R = new Map();
  const vp0 = Array.from(G.getParameter(G.VIEWPORT) || [0, 0, 0, 0]), sci0 = Array.from(G.getParameter(G.SCISSOR_BOX) || [0, 0, 0, 0]);
  const ALL = 0xffffffff;
  const DEF = (o, k) => {
    switch (k) {
      case 'vao': return o.vao0;
      case 'fbR': case 'fbD': return o.fb0();
      case 'vp': return vp0;
      case 'sci': return sci0;
      case 'prog': case 'rb': return null;
      case 'unit': return G.TEXTURE0;
      case 'bf': return [G.ONE, G.ZERO, G.ONE, G.ZERO];
      case 'be': return [G.FUNC_ADD, G.FUNC_ADD];
      case 'bc': return [0, 0, 0, 0];
      case 'cm': return [true, true, true, true];
      case 'cc': return [0, 0, 0, 0];
      case 'dm': return true;
      case 'df': return G.LESS;
      case 'cd': return 1;
      case 'cs': return 0;
      case 'sfF': case 'sfB': return [G.ALWAYS, 0, ALL];
      case 'soF': case 'soB': return [G.KEEP, G.KEEP, G.KEEP];
      case 'smF': case 'smB': return ALL;
      case 'cf': return G.BACK;
      case 'ff': return G.CCW;
      case 'lw': return 1;
      case 'po': return [0, 0];
      default:
        if (k.charCodeAt(0) === 99) return +k.slice(1) === G.DITHER;   // c<cap>
        if (k.charCodeAt(0) === 98) return null;                        // b<target>
        if (k.charCodeAt(0) === 116) return null;                       // t<unit>:<target>
        if (k.charCodeAt(0) === 112) {                                  // p<pname>
          const p = +k.slice(1);
          if (p === G.PACK_ALIGNMENT || p === G.UNPACK_ALIGNMENT) return 4;
          if (p === G.UNPACK_COLORSPACE_CONVERSION_WEBGL) return G.BROWSER_DEFAULT_WEBGL;
          return p === G.UNPACK_FLIP_Y_WEBGL || p === G.UNPACK_PREMULTIPLY_ALPHA_WEBGL ? false : 0;
        }
        return undefined;
    }
  };
  const same = (a, b) => {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  };
  // Sets name k to v on the real context (the record R follows).
  function put(k, v) {
    switch (k) {
      case 'vao': G.bindVertexArray(v); break;
      case 'fbR': G.bindFramebuffer(G.READ_FRAMEBUFFER, v); break;
      case 'fbD': G.bindFramebuffer(G.DRAW_FRAMEBUFFER, v); break;
      case 'vp': G.viewport(v[0], v[1], v[2], v[3]); break;
      case 'sci': G.scissor(v[0], v[1], v[2], v[3]); break;
      case 'prog': G.useProgram(v); break;
      case 'rb': G.bindRenderbuffer(G.RENDERBUFFER, v); break;
      case 'unit': G.activeTexture(v); break;
      case 'bf': G.blendFuncSeparate(v[0], v[1], v[2], v[3]); break;
      case 'be': G.blendEquationSeparate(v[0], v[1]); break;
      case 'bc': G.blendColor(v[0], v[1], v[2], v[3]); break;
      case 'cm': G.colorMask(v[0], v[1], v[2], v[3]); break;
      case 'cc': G.clearColor(v[0], v[1], v[2], v[3]); break;
      case 'dm': G.depthMask(v); break;
      case 'df': G.depthFunc(v); break;
      case 'cd': G.clearDepth(v); break;
      case 'cs': G.clearStencil(v); break;
      case 'sfF': G.stencilFuncSeparate(G.FRONT, v[0], v[1], v[2]); break;
      case 'sfB': G.stencilFuncSeparate(G.BACK, v[0], v[1], v[2]); break;
      case 'soF': G.stencilOpSeparate(G.FRONT, v[0], v[1], v[2]); break;
      case 'soB': G.stencilOpSeparate(G.BACK, v[0], v[1], v[2]); break;
      case 'smF': G.stencilMaskSeparate(G.FRONT, v); break;
      case 'smB': G.stencilMaskSeparate(G.BACK, v); break;
      case 'cf': G.cullFace(v); break;
      case 'ff': G.frontFace(v); break;
      case 'lw': G.lineWidth(v); break;
      case 'po': G.polygonOffset(v[0], v[1]); break;
      default: {
        const c = k.charCodeAt(0);
        if (c === 99) { if (v) G.enable(+k.slice(1)); else G.disable(+k.slice(1)); }
        else if (c === 98) G.bindBuffer(+k.slice(1), v);
        else if (c === 112) G.pixelStorei(+k.slice(1), v);
        else if (c === 116) {
          const i = k.indexOf(':'), u = +k.slice(1, i), t = +k.slice(i + 1);
          if (R.get('unit') !== u) { G.activeTexture(u); R.set('unit', u); }
          G.bindTexture(t, v);
        }
      }
    }
    R.set(k, v);
  }
  let cur = null;   // the owner whose state the real context holds
  const primaryRec = { vao0: null, fb0: () => null };
  const owners = new Set();
  // The first call of owner o after another's: o's state put back, name by name.
  function enter(o) {
    if (cur === o) return;
    if (!o.vao0Made && o.layer) { o.vao0Made = true; o.vao0 = G.createVertexArray(); }
    const keys = new Set([...R.keys(), ...o.s.keys(), 'vao', 'fbR', 'fbD']);
    // (Textures first: each binds through its unit, and the owner's own unit is put back after them.)
    for (const k of keys) {
      if (k.charCodeAt(0) !== 116) continue;
      const want = o.s.has(k) ? o.s.get(k) : null;
      if (!same(R.has(k) ? R.get(k) : null, want)) put(k, want);
    }
    for (const k of keys) {
      if (k.charCodeAt(0) === 116) continue;
      const want = o.s.has(k) ? o.s.get(k) : DEF(o, k);
      if (want === undefined) continue;
      // (A name nobody has set holds the context's starting value: the figure's, null for a binding.)
      const has = R.has(k) ? R.get(k) : DEF(primaryRec, k);
      if (!same(has, want)) put(k, want);
    }
    cur = o;
  }
  // An object deleted by any owner is bound by none: every record that held it reads null from then on.
  function forget(x) {
    if (!x) return;
    for (const o of [...owners, { s: R }]) for (const [k, v] of o.s) if (v === x) o.s.set(k, null);
  }
  // A loss or a restore: the context starts again from its starting state, with nothing any owner made.
  function reset() {
    R = new Map(); cur = null;
    for (const o of owners) { o.s = new Map(); o.vao0 = null; o.vao0Made = false; o.layerLost(); }
  }
  canvas.addEventListener?.('webglcontextlost', reset);
  canvas.addEventListener?.('webglcontextrestored', reset);

  // An owner's context: every method of the real one, called as itself, with the state calls recorded.
  function makeOwner(name, layer) {
    const o = { name, layer: !!layer, s: new Map(), vao0: null, vao0Made: false, fb0: () => (layer ? layer.fbo() : null), layerLost: () => layer?.lost() };
    owners.add(o);
    const w = { __share: o };
    const proto = Object.getPrototypeOf(G);
    const names = new Set();
    for (let p = proto; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) for (const n of Object.getOwnPropertyNames(p)) names.add(n);
    for (const n of names) {
      if (n === 'constructor' || Object.prototype.hasOwnProperty.call(w, n)) continue;
      let d = null;
      for (let p = proto; p && !d; p = Object.getPrototypeOf(p)) d = Object.getOwnPropertyDescriptor(p, n);
      if (d && 'value' in d && typeof d.value === 'number') { w[n] = d.value; continue; }
      if (d && 'value' in d && typeof d.value === 'function') {
        w[n] = function () { if (cur !== o) enter(o); return G[n].apply(G, arguments); };
      }
    }
    const rec = (k, v) => { o.s.set(k, v); R.set(k, v); };
    const call = (n, f) => { w[n] = function () { if (cur !== o) enter(o); return f.apply(null, arguments); }; };
    const FB = G.FRAMEBUFFER, RFB = G.READ_FRAMEBUFFER, DFB = G.DRAW_FRAMEBUFFER, EAB = G.ELEMENT_ARRAY_BUFFER;
    const mapFb = (fb) => (fb === null && layer ? layer.fbo() : fb);
    call('bindFramebuffer', (t, fb) => {
      if (fb === null && layer && t !== RFB) layer.drawn?.();   // (its layer about to be drawn in: the figure lays it again)
      const f = mapFb(fb);
      G.bindFramebuffer(t, f);
      if (t === FB || t === RFB) rec('fbR', f);
      if (t === FB || t === DFB) rec('fbD', f);
    });
    call('bindVertexArray', (v) => { const x = v === null ? o.vao0 : v; G.bindVertexArray(x); rec('vao', x); });
    call('bindBuffer', (t, b) => { G.bindBuffer(t, b); if (t !== EAB) rec(`b${t}`, b); });
    call('bindRenderbuffer', (t, b) => { G.bindRenderbuffer(t, b); rec('rb', b); });
    call('useProgram', (p) => { G.useProgram(p); rec('prog', p); });
    call('activeTexture', (u) => { G.activeTexture(u); rec('unit', u); });
    call('bindTexture', (t, x) => { G.bindTexture(t, x); rec(`t${R.get('unit') ?? G.TEXTURE0}:${t}`, x); });
    call('enable', (c) => { G.enable(c); rec(`c${c}`, true); });
    call('disable', (c) => { G.disable(c); rec(`c${c}`, false); });
    call('viewport', (x, y, a, b) => { G.viewport(x, y, a, b); rec('vp', [x, y, a, b]); });
    call('scissor', (x, y, a, b) => { G.scissor(x, y, a, b); rec('sci', [x, y, a, b]); });
    call('blendFunc', (s, d) => { G.blendFunc(s, d); rec('bf', [s, d, s, d]); });
    call('blendFuncSeparate', (a, b, c, d) => { G.blendFuncSeparate(a, b, c, d); rec('bf', [a, b, c, d]); });
    call('blendEquation', (m) => { G.blendEquation(m); rec('be', [m, m]); });
    call('blendEquationSeparate', (a, b) => { G.blendEquationSeparate(a, b); rec('be', [a, b]); });
    call('blendColor', (a, b, c, d) => { G.blendColor(a, b, c, d); rec('bc', [a, b, c, d]); });
    call('colorMask', (a, b, c, d) => { G.colorMask(a, b, c, d); rec('cm', [a, b, c, d]); });
    call('clearColor', (a, b, c, d) => { G.clearColor(a, b, c, d); rec('cc', [a, b, c, d]); });
    call('depthMask', (v) => { G.depthMask(v); rec('dm', v); });
    call('depthFunc', (v) => { G.depthFunc(v); rec('df', v); });
    call('clearDepth', (v) => { G.clearDepth(v); rec('cd', v); });
    call('clearStencil', (v) => { G.clearStencil(v); rec('cs', v); });
    call('stencilFunc', (f, r, m) => { G.stencilFunc(f, r, m); rec('sfF', [f, r, m]); rec('sfB', [f, r, m]); });
    call('stencilFuncSeparate', (face, f, r, m) => { G.stencilFuncSeparate(face, f, r, m); if (face !== G.BACK) rec('sfF', [f, r, m]); if (face !== G.FRONT) rec('sfB', [f, r, m]); });
    call('stencilOp', (a, b, c) => { G.stencilOp(a, b, c); rec('soF', [a, b, c]); rec('soB', [a, b, c]); });
    call('stencilOpSeparate', (face, a, b, c) => { G.stencilOpSeparate(face, a, b, c); if (face !== G.BACK) rec('soF', [a, b, c]); if (face !== G.FRONT) rec('soB', [a, b, c]); });
    call('stencilMask', (m) => { G.stencilMask(m); rec('smF', m); rec('smB', m); });
    call('stencilMaskSeparate', (face, m) => { G.stencilMaskSeparate(face, m); if (face !== G.BACK) rec('smF', m); if (face !== G.FRONT) rec('smB', m); });
    call('cullFace', (v) => { G.cullFace(v); rec('cf', v); });
    call('frontFace', (v) => { G.frontFace(v); rec('ff', v); });
    call('lineWidth', (v) => { G.lineWidth(v); rec('lw', v); });
    call('polygonOffset', (a, b) => { G.polygonOffset(a, b); rec('po', [a, b]); });
    call('pixelStorei', (p, v) => { G.pixelStorei(p, v); rec(`p${p}`, v); });
    for (const n of ['deleteTexture', 'deleteBuffer', 'deleteFramebuffer', 'deleteRenderbuffer', 'deleteVertexArray', 'deleteProgram']) {
      call(n, (x) => { forget(x); G[n](x); });
    }
    if (layer) {
      // (Asked for the default framebuffer's binding, a layer answers null for its layer, as its own canvas's context would.)
      call('getParameter', (k) => {
        const v = G.getParameter(k);
        if ((k === G.FRAMEBUFFER_BINDING || k === G.READ_FRAMEBUFFER_BINDING) && v === layer.fbo()) return null;
        if (k === G.VERTEX_ARRAY_BINDING && v === o.vao0) return null;
        return v;
      });
      // (A layer never takes the shared context down with it: its renderer's give-up path stops only itself.)
      const stub = { loseContext() { /* the shared context stays: see above */ }, restoreContext() { /* likewise */ } };
      call('getExtension', (n) => (n === 'WEBGL_lose_context' ? stub : G.getExtension(n)));
    }
    Object.defineProperty(w, 'canvas', { get: () => (layer ? layer.canvas : G.canvas) });
    Object.defineProperty(w, 'drawingBufferWidth', { get: () => (layer ? layer.canvas.width : G.drawingBufferWidth) });
    Object.defineProperty(w, 'drawingBufferHeight', { get: () => (layer ? layer.canvas.height : G.drawingBufferHeight) });
    w.getContextAttributes = () => (layer ? { alpha: true, premultipliedAlpha: true, antialias: false, depth: true, stencil: true, preserveDrawingBuffer: true } : G.getContextAttributes());
    w.isContextLost = () => G.isContextLost();
    // (Every other accessor of the context, read and written on the real one; then the context's own prototype, so the owner is a
    // WebGL2RenderingContext to every check (gl-state.js keeps its record for it as for any context).)
    for (let p = proto; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
      for (const n of Object.getOwnPropertyNames(p)) {
        const d = Object.getOwnPropertyDescriptor(p, n);
        if (!d || !d.get || Object.prototype.hasOwnProperty.call(w, n)) continue;
        Object.defineProperty(w, n, { get: () => G[n], set: d.set ? (v) => { G[n] = v; } : undefined, configurable: true });
      }
    }
    Object.setPrototypeOf(w, proto);
    return w;
  }

  // A layer: a texture (and its depth-stencil) the size its stand-in canvas is given, made on first use and again after a loss.
  function makeLayer(name, drawn = null) {
    let W = 0, H = 0, tex = null, ds = null, fb = null, made = '';
    const fake = {
      get width() { return W; }, set width(v) { v = Math.max(0, v | 0); if (v !== W) { W = v; made = ''; } },
      get height() { return H; }, set height(v) { v = Math.max(0, v | 0); if (v !== H) { H = v; made = ''; } },
      style: {},
      addEventListener: (t, f, opt) => canvas.addEventListener(t, f, opt),
      removeEventListener: (t, f, opt) => canvas.removeEventListener(t, f, opt),
      getContext: () => owner,
      remove() { /* not in the page */ },
    };
    const L = {
      canvas: fake, drawn,
      // The layer's framebuffer, sized to the canvas now (made here, in the owner's turn: the real bindings it touches are put back).
      fbo() {
        // (With no size, a pixel of its own: a layer never draws into the figure's canvas.)
        const w0 = W || 1, h0 = H || 1;
        if (made === `${w0}x${h0}` && fb) return fb;
        const tb = R.get(`t${R.get('unit') ?? G.TEXTURE0}:${G.TEXTURE_2D}`) ?? null, rb = R.has('rb') ? R.get('rb') : null;
        const fr = R.has('fbR') ? R.get('fbR') : null, fd = R.has('fbD') ? R.get('fbD') : null;
        if (!tex) tex = G.createTexture();
        G.bindTexture(G.TEXTURE_2D, tex);
        G.texImage2D(G.TEXTURE_2D, 0, G.RGBA8, w0, h0, 0, G.RGBA, G.UNSIGNED_BYTE, null);
        G.texParameteri(G.TEXTURE_2D, G.TEXTURE_MIN_FILTER, G.LINEAR); G.texParameteri(G.TEXTURE_2D, G.TEXTURE_MAG_FILTER, G.LINEAR);
        G.texParameteri(G.TEXTURE_2D, G.TEXTURE_WRAP_S, G.CLAMP_TO_EDGE); G.texParameteri(G.TEXTURE_2D, G.TEXTURE_WRAP_T, G.CLAMP_TO_EDGE);
        G.bindTexture(G.TEXTURE_2D, tb);
        if (!ds) ds = G.createRenderbuffer();
        G.bindRenderbuffer(G.RENDERBUFFER, ds);
        G.renderbufferStorage(G.RENDERBUFFER, G.DEPTH24_STENCIL8, w0, h0);
        G.bindRenderbuffer(G.RENDERBUFFER, rb);
        if (!fb) fb = G.createFramebuffer();
        G.bindFramebuffer(G.FRAMEBUFFER, fb);
        G.framebufferTexture2D(G.FRAMEBUFFER, G.COLOR_ATTACHMENT0, G.TEXTURE_2D, tex, 0);
        G.framebufferRenderbuffer(G.FRAMEBUFFER, G.DEPTH_STENCIL_ATTACHMENT, G.RENDERBUFFER, ds);
        G.clearColor(0, 0, 0, 0); G.colorMask(true, true, true, true); G.disable(G.SCISSOR_TEST); G.clear(G.COLOR_BUFFER_BIT);
        { const v = R.get('cc') ?? [0, 0, 0, 0]; G.clearColor(v[0], v[1], v[2], v[3]); }
        { const v = R.get('cm') ?? [true, true, true, true]; G.colorMask(v[0], v[1], v[2], v[3]); }
        if (R.get(`c${G.SCISSOR_TEST}`)) G.enable(G.SCISSOR_TEST);
        G.bindFramebuffer(G.READ_FRAMEBUFFER, fr); G.bindFramebuffer(G.DRAW_FRAMEBUFFER, fd);
        made = `${w0}x${h0}`;
        return fb;
      },
      /** The layer's picture, for the figure to lay (null while it has no size or has not been made). */
      texture: () => (W && H && made === `${W}x${H}` && tex ? tex : null),
      lost() { tex = null; ds = null; fb = null; made = ''; },
    };
    const owner = makeOwner(name, L);
    L.gl = owner;
    return L;
  }

  const primary = makeOwner('figure', null);
  return {
    gl: G,
    /** The figure's own context (its default framebuffer the canvas). */
    primary,
    /** A new layer: { gl, canvas (its stand-in), texture() }; drawn() is called as its renderer starts drawing into it. */
    layer: makeLayer,
  };
}

// A layer laid on the figure's canvas: its picture (a texture whose rows run y up, as a canvas's do) over the canvas's rectangle as the
// affine m places it, in fractions of the canvas, y down: a point q of the layer (0..1 each way) lands at
// (m[0] q.x + m[2] q.y + m[4], m[1] q.x + m[3] q.y + m[5]); [1, 0, 0, 1, 0, 0] lays it as it is. Premultiplied, times alpha, over what is
// there (or in place of it, over: false). Drawn by the GPU in one quad; nothing is read back.
const LAY_VS = `#version 300 es
layout(location = 0) in vec2 aQ;
uniform vec2 uA, uB, uC;
out vec2 vT;
void main() {
  vec2 p = uA * aQ.x + uB * aQ.y + uC;
  vT = vec2(aQ.x, 1.0 - aQ.y);
  gl_Position = vec4(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0, 0.0, 1.0);
}`;
const LAY_FS = `#version 300 es
precision mediump float;
uniform sampler2D uT;
uniform float uAlpha;
in vec2 vT;
out vec4 o;
void main() { o = texture(uT, vT) * uAlpha; }`;
export const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);

/** The program that lays a layer (made on context gl, the figure's owner): { ready(), draw(tex, m, alpha, over = true), lost() }. Compiled
 *  in the background (ready() false until then); made again after a loss. */
export function createLay(gl) {
  let prog = null, U = null, vao = null, buf = null, started = null, stop = null, failed = false;
  function build() {
    prog = null; U = null; failed = false;
    try { started = startProgram(gl, LAY_VS, LAY_FS, [['aQ', 0]]); } catch { failed = true; return; }
    vao = gl.createVertexArray(); buf = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    stop?.(); stop = publishWhenDone(gl, [started], publish);
  }
  function publish() {
    if (prog || failed || gl.isContextLost()) return;
    try {
      prog = checkProgram(gl, started);
      U = Object.fromEntries(['uA', 'uB', 'uC', 'uT', 'uAlpha'].map((n) => [n, gl.getUniformLocation(prog, n)]));
      gl.useProgram(prog); gl.uniform1i(U.uT, 0); gl.useProgram(null);
    } catch { if (!gl.isContextLost()) failed = true; prog = null; }
  }
  build();
  gl.canvas?.addEventListener?.('webglcontextrestored', () => { stop?.(); build(); });
  return {
    ready: () => !!prog && !gl.isContextLost(),
    draw(tex, m, alpha, over = true) {
      if (!prog || !tex || !(alpha > 0)) return false;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST); gl.disable(gl.DEPTH_TEST); gl.colorMask(true, true, true, true);
      if (over) { gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); } else gl.disable(gl.BLEND);
      gl.useProgram(prog);
      gl.uniform2f(U.uA, m[0], m[1]); gl.uniform2f(U.uB, m[2], m[3]); gl.uniform2f(U.uC, m[4], m[5]); gl.uniform1f(U.uAlpha, Math.min(1, alpha));
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
      return true;
    },
  };
}

/** The affine (fractions of a box of css size w x h, y down) of a CSS transform `translate(tx, ty) rotate(r) scale(k)` about origin (ox, oy),
 *  in px: p -> o + t + R(r) k (p - o). Composed with compose(outer, inner). */
export function cssAffine(w, h, { ox = 0, oy = 0, tx = 0, ty = 0, r = 0, k = 1 } = {}) {
  const c = Math.cos(r) * k, s = Math.sin(r) * k;
  // In px: x' = c x - s y + (ox + tx - c ox + s oy); y' = s x + c y + (oy + ty - s ox - c oy). In fractions, x = w qx, y = h qy, x' / w, y' / h.
  const e = ox + tx - c * ox + s * oy, f = oy + ty - s * ox - c * oy;
  return [c, (s * w) / h, (-s * h) / w, c, e / w, f / h];
}
export function compose(a, b) {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}
