// The figure callouts' frosted glass drawn on the GPU (his pick, 25 Oct: "GPU glass"). The callouts stay HTML, and each one's
// glass (.cl-glass, callout.js) keeps its shape and its 2 px outline; only the blur and the tint behind it move here, to one
// WebGL2 canvas laid just under the callout layers. The browser's backdrop blur redrew every callout over the moving figure on
// every frame; here a small copy of the figure (a quarter of its size: the blur hides the rest) is taken without waiting
// (createImageBitmap), blurred once in two passes, and each callout's shape is cut from it.
// What differs from the browser's glass: only the GPU's figure (veins-gl: the plate, the vessels, the blood) is under the blur;
// the SVG drawn over it (stents, guides) and the labels are hidden behind the glass rather than blurred into it.
// Off (the browser's glass, as before): no WebGL2, a software renderer, ?gpulabels=0, Settings' blur effect off, reduced
// transparency, a browser without backdrop blur (whose solid card stays), or a copy the browser refuses.

import { gpuProbe, COUNTED } from './gpu-probe.js?v=be7cefbb53';
import { finalFrameFor, cancelFrame } from './frame.js?v=f9b2b8e123';

/** The CSS glass this draws (app.css .cl-glass: blur(16px) saturate(1.15) over 58 % of --surface). */
export const GLASS = { blur: 16, sat: 1.15, tint: 0.58 };
/** The liver label's pane (app.css .lb-glass: blur(9px) saturate(1.2) over --frost, its corners its border radius). */
export const PANE = { blur: 9, sat: 1.2 };
/** A rounded rectangle's outline (w × h, corner radius r), as an SVG path. */
export function roundPath(w, h, r) {
  const f = (n) => +n.toFixed(2), q = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M${f(q)} 0H${f(w - q)}A${f(q)} ${f(q)} 0 0 1 ${f(w)} ${f(q)}V${f(h - q)}A${f(q)} ${f(q)} 0 0 1 ${f(w - q)} ${f(h)}H${f(q)}A${f(q)} ${f(q)} 0 0 1 0 ${f(h - q)}V${f(q)}A${f(q)} ${f(q)} 0 0 1 ${f(q)} 0Z`;
}
const SCALE = 4;    // CSS px for each texel of the blurred copy
const MARGIN = 48;  // CSS px of the figure taken around the callouts: three of the blur's sigmas (blur(16px): sigma 16 px)

const NUM = (v) => parseFloat(v) || 0;
/** The first shadow of a computed box-shadow: { c: [r, g, b, a] (0–1), x, y, blur, spread } or null. */
export function parseShadow(s) {
  if (!s || s === 'none') return null;
  const c = /rgba?\(([^)]+)\)/.exec(s);
  if (!c) return null;
  const v = c[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  const n = s.replace(c[0], '').match(/-?[\d.]+px/g)?.map(NUM) || [];
  if (/inset/.test(s) || n.length < 2) return null;
  return { c: [v[0] / 255, v[1] / 255, v[2] / 255, v.length > 3 ? v[3] : 1], x: n[0], y: n[1], blur: n[2] || 0, spread: n[3] || 0 };
}
/** Whether the page asks for frosted glass at all (Settings' blur effect, reduced transparency, a browser with backdrop blur). */
export function glassWanted(doc = document, win = window) {
  return glassCheck(doc, win)();
}
function glassCheck(doc, win) {
  const css = win.CSS, can = !!css?.supports && (css.supports('backdrop-filter', 'blur(1px)') || css.supports('-webkit-backdrop-filter', 'blur(1px)'));
  const rt = win.matchMedia?.('(prefers-reduced-transparency: reduce)');
  return () => can && !rt?.matches && !doc.documentElement.hasAttribute('data-noglass');
}
/** Gaussian weights for a blur of sigma `s` texels, taps 0..n (one side; the shader mirrors them), summing to 1 over both sides. */
export function gaussTaps(s, n = 12) {
  const w = Array.from({ length: n + 1 }, (_, i) => Math.exp(-(i * i) / (2 * s * s)));
  const sum = w[0] + 2 * w.slice(1).reduce((a, b) => a + b, 0);
  return w.map((v) => v / sum);
}

const QVS = `#version 300 es
uniform vec4 uBox;    // left, top, width, height (device px, y down)
uniform vec2 uView;
const vec2 Q[4] = vec2[4](vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0));
void main() {
  vec2 p = uBox.xy + Q[gl_VertexID] * uBox.zw;
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
}`;
// One pass of the blur (across, then down), over the small copy; texels outside it are its edge's.
const BFS = `#version 300 es
precision highp float;
uniform sampler2D uT;
uniform vec4 uBox;          // (its size: the copy's, in texels)
uniform vec2 uDir;          // one texel across or down
uniform float uW[13];
out vec4 o;
void main() {
  vec2 sz = uBox.zw, uv = gl_FragCoord.xy / sz;
  vec4 c = texture(uT, uv) * uW[0];
  for (int i = 1; i < 13; i++) { vec2 d = uDir * float(i) / sz; c += (texture(uT, uv + d) + texture(uT, uv - d)) * uW[i]; }
  o = c;
}`;
// A callout's glass: the blurred figure under it over the stage's own colour, saturated as the CSS does, under the tint, cut
// to the callout's shape (its mask). Where the pointer reaches past the card, the card's own shadow (the DOM's, painted over
// this layer) is allowed for, so the pointer stays the card's tint as one shape.
const PFS = `#version 300 es
precision highp float;
uniform vec2 uView;
uniform vec4 uBox;          // the glass (device px)
uniform vec2 uMS;           // the share of the mask the glass fills
uniform vec4 uReg;          // the blurred copy's place (device px)
uniform sampler2D uScene, uMask;
uniform vec3 uBg;
uniform vec4 uTint;         // premultiplied
uniform float uSat, uA;
uniform vec4 uBB;           // the card's border box (device px: left, top, right, bottom)
uniform vec4 uShC;          // its shadow's colour (straight) and strength
uniform vec4 uShB;          // the shadow's box (device px, offset)
uniform float uShS;         // its sigma (device px)
out vec4 o;
float erfa(float x) { float a = 0.147, x2 = x * x; return sign(x) * sqrt(1.0 - exp(-x2 * (1.2732395 + a * x2) / (1.0 + a * x2))); }
float cover(float x, float a, float b, float s) { return 0.5 * (erfa((x - a) / (s * 1.4142136)) - erfa((x - b) / (s * 1.4142136))); }
void main() {
  vec2 p = vec2(gl_FragCoord.x, uView.y - gl_FragCoord.y);
  float m = texture(uMask, (p - uBox.xy) / uBox.zw * uMS).a;
  if (m <= 0.0) discard;
  vec4 s = texture(uScene, clamp((p - uReg.xy) / uReg.zw, 0.0, 1.0));
  vec3 c = s.rgb + uBg * (1.0 - s.a);
  float k = uSat;
  mat3 M = mat3(0.213 + 0.787 * k, 0.213 - 0.213 * k, 0.213 - 0.213 * k,
                0.715 - 0.715 * k, 0.715 + 0.285 * k, 0.715 - 0.715 * k,
                0.072 - 0.072 * k, 0.072 - 0.072 * k, 0.072 + 0.928 * k);
  c = clamp(M * c, 0.0, 1.0);
  c = uTint.rgb + c * (1.0 - uTint.a);
  if (uShC.a > 0.0 && (p.x < uBB.x || p.x > uBB.z || p.y < uBB.y || p.y > uBB.w)) {
    float a = uShC.a * (uShS > 0.0 ? cover(p.x, uShB.x, uShB.z, uShS) * cover(p.y, uShB.y, uShB.w, uShS) : 1.0);
    a = min(a, 0.9);
    c = clamp((c - uShC.rgb * a) / (1.0 - a), 0.0, 1.0);
  }
  o = vec4(c, 1.0) * m * uA;
}`;

/**
 * The GPU glass for the callouts under `layers` (the .cath-labels layers), over the figure drawn on `source` (veins-gl's canvas,
 * which keeps its drawing buffer). The canvas is laid just before `layers[0]`. With `pane` (an .lb-glass element), it draws that one
 * rounded pane instead, its canvas laid just before it (under the labels, where the pane lies). `live()`: whether the figure is on that canvas now
 * (else the browser's glass, which sees the SVG figure). `capture()`: called just before a copy is taken, so the figure is on `source` whole whether or not it keeps its own picture. `version()`: a number that changes whenever the figure on `source` is drawn
 * again; while it, the region behind the callouts and the canvas' place on the page all hold, the copy already taken is still the
 * figure, so none is taken (without it, one is taken whenever the last has arrived). `onFigure(f)`: calls f each time the figure is
 * drawn again, and returns the call that stops it: the glass, settled, sleeps until then (or until a callout changes). Null when it cannot run.
 */
export function createGlassGL(wrap, source, layers, { software = false, off = false, live = () => true, pane = null, version = null, capture = null, onFigure = null } = {}) {
  const look = pane ? PANE : GLASS;
  if (off || software || !source || typeof WebGL2RenderingContext === 'undefined' || typeof createImageBitmap !== 'function') return null;
  const canvas = document.createElement('canvas');
  canvas.id = pane ? 'paneGl' : 'glassGl'; canvas.setAttribute('aria-hidden', 'true');
  let gl = null;
  try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, failIfMajorPerformanceCaveat: true }); } catch { gl = null; }
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const link = (fs) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, QVS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null; };
  const bprog = link(BFS), pprog = link(PFS);
  if (!bprog || !pprog) return null;
  const uni = (p, ks) => Object.fromEntries(ks.map((k) => [k, gl.getUniformLocation(p, k)]));
  const BU = uni(bprog, ['uBox', 'uView', 'uT', 'uDir', 'uW']);
  const PU = uni(pprog, ['uBox', 'uView', 'uMS', 'uReg', 'uScene', 'uMask', 'uBg', 'uTint', 'uSat', 'uA', 'uBB', 'uShC', 'uShB', 'uShS']);
  const vao = gl.createVertexArray();
  const tex = (filter) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const copy = tex(gl.LINEAR), pass = tex(gl.LINEAR), blurred = tex(gl.LINEAR);
  const fbPass = gl.createFramebuffer(), fbOut = gl.createFramebuffer();
  (pane || layers[0]).before(canvas);

  let lost = false, dead = false, raf = 0, W = 0, H = 0, dpr = 1, pending = false, fails = 0, ready = null, drawn = false, fbSize = '', takenKey = '';
  // (shown: the glass drew the last time it looked; drawnKey: everything that picture was drawn from, so a frame that would draw it the
  // same is skipped; quiet: the frames in a row that changed nothing; liveUntil: a callout's transition or animation runs until then;
  // poll: the slow look while it sleeps; gen: a copy asked for before the glass was let go is never put in.)
  let shown = false, drawnKey = '', quiet = 0, liveUntil = 0, poll = 0, gen = 0, readySeq = 0;
  const masks = new WeakMap(), maskTex = new Set(), marked = new Set();
  const norm = document.createElement('canvas').getContext('2d');
  const colour = (str, fb) => {   // any CSS colour, as straight [r, g, b, a] (0–1), through the canvas' own parser
    norm.fillStyle = 'transparent'; norm.fillStyle = str || fb;
    const v = norm.fillStyle, m = /^#([\da-f]{6})$/i.exec(v);
    if (m) { const n = parseInt(m[1], 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1]; }
    const q = /rgba?\(([^)]+)\)/.exec(v)?.[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return q ? [q[0] / 255, q[1] / 255, q[2] / 255, q.length > 3 ? q[3] : 1] : [0, 0, 0, 0];
  };
  const unmark = () => { for (const g of marked) g.removeAttribute('data-gl'); marked.clear(); };
  const wanted = glassCheck(document, window);
  const glassesOf = () => (pane ? (pane.isConnected ? [pane] : []) : layers.flatMap((l) => [...l.getElementsByClassName('cl-glass')]));

  // A callout's shape as a mask, drawn from its own outline path (callout.js), again only when that or its size changes.
  function maskOf(g, d, w, h) {
    const key = `${d}|${w}|${h}|${dpr}`;
    let m = masks.get(g);
    if (m?.key === key) return m;
    const cv = document.createElement('canvas'), mw = Math.max(1, Math.ceil(w * dpr)), mh = Math.max(1, Math.ceil(h * dpr));
    cv.width = mw; cv.height = mh;
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = 'black'; c.fill(new Path2D(d));
    if (!m) { m = { tex: tex(gl.LINEAR) }; maskTex.add(m.tex); }
    gl.bindTexture(gl.TEXTURE_2D, m.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    Object.assign(m, { key, ms: [w * dpr / mw, h * dpr / mh] });
    masks.set(g, m);
    return m;
  }
  // A new small copy of the figure behind the callouts, blurred once in two passes when it arrives.
  function take(reg, cr) {
    const sr = source.getBoundingClientRect();
    if (!sr.width || !sr.height || !source.width) return;
    // (The key of the figure as it is copied now, read before the copy is asked for: the browser takes its snapshot in that call.)
    const key = version ? `${version()}|${reg.x}|${reg.y}|${reg.w}|${reg.h}|${cr.left}|${cr.top}|${sr.left}|${sr.top}|${sr.width}|${sr.height}|${source.width}x${source.height}` : '';
    if (key && key === takenKey && ready) { if (gpuProbe.on) gpuProbe.note(COUNTED.glassSkip); return; }
    const kx = source.width / sr.width, ky = source.height / sr.height;
    const bw = Math.max(1, Math.ceil(reg.w / SCALE)), bh = Math.max(1, Math.ceil(reg.h / SCALE));
    pending = true;
    if (gpuProbe.on) gpuProbe.note(COUNTED.glassCopy);
    const job = gen;
    let p;
    try {
      capture?.();   // (the figure's whole picture is on the canvas for this copy, whether or not the canvas keeps its own)
      p = createImageBitmap(source, Math.round((reg.x + cr.left - sr.left) * kx), Math.round((reg.y + cr.top - sr.top) * ky), Math.max(1, Math.round(reg.w * kx)), Math.max(1, Math.round(reg.h * ky)),
        { resizeWidth: bw, resizeHeight: bh, resizeQuality: 'medium', premultiplyAlpha: 'premultiply' });
    } catch { p = Promise.reject(); }
    p.then((bm) => {
      pending = false;
      if (lost || dead || job !== gen) { bm.close?.(); return; }
      fails = 0;
      gl.bindTexture(gl.TEXTURE_2D, copy);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bm);
      bm.close?.();
      if (fbSize !== `${bw}x${bh}`) {
        fbSize = `${bw}x${bh}`;
        for (const [t, fb] of [[pass, fbPass], [blurred, fbOut]]) {
          gl.bindTexture(gl.TEXTURE_2D, t);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, bw, bh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        }
      }
      gl.useProgram(bprog); gl.bindVertexArray(vao); gl.disable(gl.BLEND);
      gl.viewport(0, 0, bw, bh);
      gl.uniform4f(BU.uBox, 0, 0, bw, bh); gl.uniform2f(BU.uView, bw, bh); gl.uniform1i(BU.uT, 0);
      gl.uniform1fv(BU.uW, gaussTaps(look.blur / SCALE));
      gl.activeTexture(gl.TEXTURE0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbPass); gl.bindTexture(gl.TEXTURE_2D, copy); gl.uniform2f(BU.uDir, 1, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbOut); gl.bindTexture(gl.TEXTURE_2D, pass); gl.uniform2f(BU.uDir, 0, 1); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      ready = { ...reg };
      takenKey = key;
      readySeq++;
      ask();
    }, () => {
      // (A browser that refuses the copy keeps its own glass.)
      pending = false;
      if (job !== gen) return;
      if (++fails > 3) { dead = true; unmark(); clear(); }
    });
  }
  function clear() {
    if (!drawn || lost) return;
    gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); drawn = false;
  }
  function draw() {
    if (lost || dead || gl.isContextLost()) return false;
    const list = glassesOf();
    if (!list.length || !wanted() || !live()) { unmark(); clear(); return false; }
    const cr = canvas.getBoundingClientRect(), k = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(cr.width * k)), h = Math.max(1, Math.round(cr.height * k));
    if (w !== W || h !== H) { W = w; H = h; canvas.width = w; canvas.height = h; }
    dpr = k;
    // Each callout's glass as the page lays it out this frame (its fades, glides and the card's shadow included).
    const panes = [];
    for (const g of list) {
      const el = g.parentElement, cs = getComputedStyle(g);
      if (!el || cs.display === 'none' || cs.visibility !== 'visible') continue;
      const a = NUM(cs.opacity);
      const r = g.getBoundingClientRect(), lw = NUM(g.style.width), lh = NUM(g.style.height);
      if (!r.width || !r.height || !lw || !lh || !(a > 0.001)) continue;
      // (The liver's pane: its own rounded box, tinted with --frost as it stands; its soft shadow, outside it, stays the DOM's.)
      if (pane) { panes.push({ g, el, a, r, d: roundPath(lw, lh, NUM(cs.borderTopLeftRadius)), lw, lh, er: r, shadow: null, tint: cs.getPropertyValue('--frost'), k: 1 }); continue; }
      const d = g.firstChild?.firstChild?.getAttribute?.('d');
      if (!d) continue;
      panes.push({ g, el, a, r, d, lw, lh, er: el.getBoundingClientRect(), shadow: parseShadow(getComputedStyle(el).boxShadow), tint: cs.getPropertyValue('--surface'), k: GLASS.tint });
    }
    // The figure taken around them all (CSS px from the canvas' corner).
    if (panes.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of panes) { x0 = Math.min(x0, p.r.left); y0 = Math.min(y0, p.r.top); x1 = Math.max(x1, p.r.right); y1 = Math.max(y1, p.r.bottom); }
      x0 = Math.max(0, x0 - cr.left - MARGIN); y0 = Math.max(0, y0 - cr.top - MARGIN);
      x1 = Math.min(cr.width, x1 - cr.left + MARGIN); y1 = Math.min(cr.height, y1 - cr.top + MARGIN);
      if (x1 > x0 && y1 > y0 && !pending) take({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, cr);
    }
    // No glass shows (all hidden, faded out or empty): the canvas is cleared once and nothing more is done.
    if (!panes.length) { clear(); return false; }
    // (Until the first copy is in, the browser's own glass stays.)
    if (!ready) return true;
    const ws = getComputedStyle(wrap), bgs = ws.backgroundColor, bg = colour(bgs, 'transparent');
    const bgVar = bg[3] > 0 ? '' : ws.getPropertyValue('--stage-bg').trim() || ws.getPropertyValue('--bg').trim();
    // Everything this picture is drawn from: the blurred copy, the canvas, the stage's colour and each glass as laid out now (its place,
    // fade, shape, tint and the card's shadow). The same as the picture on the canvas: it is left as it is ('same').
    let key = `${W}x${H}|${dpr}|${readySeq}|${cr.left}|${cr.top}|${bgs}|${bgVar}`;
    for (const p of panes) {
      const s = p.shadow, e = p.er;
      key += `|${p.r.left},${p.r.top},${p.r.width},${p.r.height},${p.a},${p.lw},${p.lh},${p.d},${p.tint}`
        + (pane ? '' : `,${e.left},${e.top},${e.right},${e.bottom},${s ? `${s.c},${s.x},${s.y},${s.blur},${s.spread}` : '-'}`);
    }
    if (drawn && key === drawnKey) return 'same';
    if (gpuProbe.on) gpuProbe.note(COUNTED.glassDrawn);
    gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(pprog); gl.bindVertexArray(vao);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform2f(PU.uView, W, H); gl.uniform1i(PU.uScene, 0); gl.uniform1i(PU.uMask, 1); gl.uniform1f(PU.uSat, look.sat);
    gl.uniform4f(PU.uReg, ready.x * dpr, ready.y * dpr, ready.w * dpr, ready.h * dpr);
    const base = bg[3] > 0 ? bg : colour(bgVar, 'transparent');
    gl.uniform3f(PU.uBg, base[0], base[1], base[2]);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, blurred);
    const now = new Set();
    for (const p of panes) {
      const m = maskOf(p.g, p.d, p.lw, p.lh), t = colour(p.tint.trim(), 'transparent'), ta = t[3] * p.k;
      const bx = (p.r.left - cr.left) * dpr, by = (p.r.top - cr.top) * dpr;
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, m.tex); gl.activeTexture(gl.TEXTURE0);
      gl.uniform4f(PU.uBox, bx, by, p.r.width * dpr, p.r.height * dpr);
      gl.uniform2f(PU.uMS, m.ms[0], m.ms[1]);
      gl.uniform4f(PU.uTint, t[0] * ta, t[1] * ta, t[2] * ta, ta);
      gl.uniform1f(PU.uA, Math.min(1, p.a));
      const e = p.er, L = (e.left - cr.left) * dpr, T = (e.top - cr.top) * dpr, R = (e.right - cr.left) * dpr, B = (e.bottom - cr.top) * dpr;
      gl.uniform4f(PU.uBB, L, T, R, B);
      const s = p.shadow, sp = (s?.spread || 0) * dpr;
      gl.uniform4f(PU.uShC, ...(s ? s.c : [0, 0, 0, 0]));
      gl.uniform4f(PU.uShB, L + (s?.x || 0) * dpr - sp, T + (s?.y || 0) * dpr - sp, R + (s?.x || 0) * dpr + sp, B + (s?.y || 0) * dpr + sp);
      gl.uniform1f(PU.uShS, (s?.blur || 0) / 2 * dpr);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      // (Marked in the frame its glass is first drawn here: the browser's blur and this one never both show, nor neither.)
      if (!p.g.hasAttribute('data-gl')) p.g.setAttribute('data-gl', '');
      now.add(p.g);
    }
    for (const g of marked) if (!now.has(g) && !g.isConnected) marked.delete(g);
    for (const g of now) marked.add(g);
    drawn = true; drawnKey = key;
    return true;
  }
  // While a callout shows, every frame something under or in it moves: the figure drawn again (the blood under it), a callout
  // written (its place, its size, a class), or one of its transitions or animations running. A frame that would draw the same
  // picture draws nothing, and two such frames in a row put the glass to sleep (a paused figure, settled callouts): no copy, no
  // blur, no draw and no frame asked for, only a look once a second in case a change came by a path that does not wake it.
  // A callout written outside a frame is drawn at once, in the microtask after the write, so the glass never trails its outline.
  // (On the shared scheduler's final phase: after every other surface's frame, the figure's own pass and the callouts' writes
  // included, so it blurs the figure of this frame, not the last, and is drawn once in a frame whoever asked.)
  const later = finalFrameFor(pane ? 'glass-pane' : 'glass');
  const loop = () => { raf = 0; mo.takeRecords(); settle(draw()); };   // (the writes made before it in this frame are drawn here, not again after it)
  function ask() { if (!raf && !lost && !dead) raf = later(loop); }
  /** Something the glass shows may have changed: it looks again (for two frames at least). */
  function wake() { quiet = 0; ask(); }
  function settle(r) {
    shown = !!r;
    clearTimeout(poll); poll = 0;
    if (lost || dead) return;
    quiet = r === 'same' ? quiet + 1 : 0;
    const running = performance.now() < liveUntil;
    // (Showing: on while it drew, a copy is on its way, or for two quiet frames. Not showing: on only while a transition may bring it in.)
    if (r ? r === true || pending || quiet < 2 || running : running) { ask(); return; }
    // (Asleep: a slow look while any glass is on the page; none, and only a new callout (a write to the layers) wakes it.)
    if (glassesOf().length) poll = setTimeout(() => { poll = 0; ask(); }, 1000);
  }
  let batched = false;
  const mo = new MutationObserver(() => {
    if (batched) return;
    batched = true;
    queueMicrotask(() => { batched = false; quiet = 0; settle(draw()); });
  });
  const watched = pane ? [pane] : layers;
  for (const l of watched) mo.observe(l, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class', 'data-at', 'hidden'] });
  const again = () => wake();
  const observers = [mo, new MutationObserver(again), new MutationObserver(again)];
  observers[1].observe(document.documentElement, { attributes: true, attributeFilter: ['data-noglass', 'data-theme', 'class'] });
  observers[2].observe(wrap, { attributes: true, attributeFilter: ['class'] });   // (the GPU figure on or off: live(); the stage's look)
  // A callout's fade, glide or hover moves its glass with no write to wake it: it is followed while it runs.
  const held = () => { liveUntil = performance.now() + 800; wake(); };
  const EVENTS = ['transitionrun', 'transitionstart', 'transitionend', 'transitioncancel', 'animationstart', 'animationend', 'animationcancel', 'pointerover', 'pointerout'];
  for (const l of watched) for (const t of EVENTS) l.addEventListener(t, held, true);
  addEventListener('resize', again);
  // (The figure drawn again: the blur under a glass that shows is taken again. With none showing, the figure is not its business.)
  const offFigure = onFigure?.(() => { if (shown) wake(); });
  const onLost = (e) => { e.preventDefault(); lost = true; unmark(); };
  canvas.addEventListener('webglcontextlost', onLost);
  ask();
  return {
    canvas,
    redraw() { wake(); },
    get on() { return !lost && !dead; },
    /** Let go of it: its frames, timers, observers, listeners and GPU objects, and its canvas; the browser's glass shows again. */
    dispose() {
      if (gen < 0) return;
      dead = true; gen = -1;
      cancelFrame(raf); raf = 0; clearTimeout(poll); poll = 0;
      for (const o of observers) o.disconnect();
      for (const l of watched) for (const t of EVENTS) l.removeEventListener(t, held, true);
      removeEventListener('resize', again);
      offFigure?.();
      canvas.removeEventListener('webglcontextlost', onLost);
      unmark();
      if (!lost) {
        for (const t of [copy, pass, blurred, ...maskTex]) gl.deleteTexture(t);
        gl.deleteFramebuffer(fbPass); gl.deleteFramebuffer(fbOut);
        gl.deleteProgram(bprog); gl.deleteProgram(pprog); gl.deleteVertexArray(vao);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
      maskTex.clear();
      canvas.remove();
    },
  };
}
