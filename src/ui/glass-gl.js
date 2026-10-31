// The figure callouts' frosted glass drawn on the GPU (his pick, 25 Oct: "GPU glass"). The callouts stay HTML, and each one's
// glass (.cl-glass, callout.js) keeps its shape and its 2 px outline; only the blur and the tint behind it move here, to one
// WebGL2 canvas laid just under the callout layers. The browser's backdrop blur redrew every callout over the moving figure on
// every frame; here a small copy of the figure (a quarter of its size: the blur hides the rest) is taken without waiting
// (createImageBitmap), blurred once in two passes, and each callout's shape is cut from it.
// What differs from the browser's glass: only the GPU's figure (veins-gl: the plate, the vessels, the blood) is under the blur;
// the SVG drawn over it (stents, guides) and the labels are hidden behind the glass rather than blurred into it.
// Off (the browser's glass, as before): no WebGL2, a software renderer, ?gpulabels=0, Settings' blur effect off, reduced
// transparency, a browser without backdrop blur (whose solid card stays), or a copy the browser refuses.

import { gpuProbe, COUNTED } from './gpu-probe.js?v=9832eccfbe';
import { finalFrameFor, cancelFrame, noteDraw } from './frame.js?v=d389474997';

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
// The glass's canvas holds at most 2 device px per CSS px (30 Oct, review H3): what it draws is a blur, a flat tint and a soft shadow,
// whose edge lies under the callout's own 2 px outline (the DOM's, at the screen's full density), so a 3× screen shows the same glass
// from four ninths of the pixels. The masks are drawn at the same density.
export const glassDpr = () => Math.min(2, window.devicePixelRatio || 1);
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
uniform vec4 uRad;          // a card's corner radii (device px: top left, top right, bottom right, bottom left); its box is its shape (uMode 1)
uniform int uMode;          // 0: the shape is the mask texture (a callout, the pane); 1: a rounded box, from uBox and uRad
out vec4 o;
// A rounded box's coverage at p (device px from its top left; wh its size): 1 inside, 0 outside, across one pixel at its edge, each
// corner with its own radius (the signed distance to the box with that corner's radius; the CSS clips a backdrop to the border box).
float boxCover(vec2 p, vec2 wh, vec4 rad) {
  vec2 c = p - wh * 0.5;
  float r = c.x < 0.0 ? (c.y < 0.0 ? rad.x : rad.w) : (c.y < 0.0 ? rad.y : rad.z);
  r = min(r, min(wh.x, wh.y) * 0.5);
  vec2 q = abs(c) - wh * 0.5 + r;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  return clamp(0.5 - d, 0.0, 1.0);
}
float erfa(float x) { float a = 0.147, x2 = x * x; return sign(x) * sqrt(1.0 - exp(-x2 * (1.2732395 + a * x2) / (1.0 + a * x2))); }
float cover(float x, float a, float b, float s) { return 0.5 * (erfa((x - a) / (s * 1.4142136)) - erfa((x - b) / (s * 1.4142136))); }
void main() {
  vec2 p = vec2(gl_FragCoord.x, uView.y - gl_FragCoord.y);
  float m = uMode == 1 ? boxCover(p - uBox.xy, uBox.zw, uRad) : texture(uMask, (p - uBox.xy) / uBox.zw * uMS).a;
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

// The blur's and the glass's programs, linked in a context (the glass's own, or the figure's when it draws there: host).
function programsOf(gl) {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const link = (fs) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, QVS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); return gl.getProgramParameter(p, gl.LINK_STATUS) ? p : null; };
  const bprog = link(BFS), pprog = link(PFS);
  if (!bprog || !pprog) { if (bprog) gl.deleteProgram(bprog); if (pprog) gl.deleteProgram(pprog); return null; }
  const uni = (p, ks) => Object.fromEntries(ks.map((k) => [k, gl.getUniformLocation(p, k)]));
  const BU = uni(bprog, ['uBox', 'uView', 'uT', 'uDir', 'uW']);
  const PU = uni(pprog, ['uBox', 'uView', 'uMS', 'uReg', 'uScene', 'uMask', 'uBg', 'uTint', 'uSat', 'uA', 'uBB', 'uShC', 'uShB', 'uShS', 'uRad', 'uMode']);
  return { bprog, pprog, BU, PU };
}
function texOf(gl, filter) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

/**
 * The GPU glass for the callouts under `layers` (the .cath-labels layers), over the figure drawn on `source` (veins-gl's canvas,
 * which keeps its drawing buffer). The canvas is laid just before `layers[0]`. With `pane` (an .lb-glass element), it draws that one
 * rounded pane instead, its canvas laid just before it (under the labels, where the pane lies). `live()`: whether the figure is on that canvas now
 * (else the browser's glass, which sees the SVG figure). `capture()`: called just before a copy is taken, so the figure is on `source` whole whether or not it keeps its own picture. `version()`: a number that changes whenever the figure on `source` is drawn
 * again; while it, the region behind the callouts and the canvas' place on the page all hold, the copy already taken is still the
 * figure, so none is taken (without it, one is taken whenever the last has arrived). `onFigure(f)`: calls f each time the figure is
 * drawn again, and returns the call that stops it: the glass, settled, sleeps until then (or until a callout changes). Null when it cannot run.
 * `keep()` (Settings › Figure performance › Callout glass kept, off by default): while true, each glass's box, fade, shape and shadow,
 * the canvas's and the figure's boxes and the stage's colour are read once and kept until something says they may have changed
 * (keptStale), so a frame where only the figure under them was drawn again reads no style and forces no layout. `due()`: the page's
 * layout watch (idle-keys.js), true while a card, bar or the stage may have moved.
 * setHost(h) (the callouts' glass only; recs A1, glass): h = { gl, canvas, now, active, over }, the figure's own canvas (veins-gl top).
 * While h.active() and no glass crosses an element of h.over() (what the page lays between that canvas and this one), the glass is
 * drawn into the figure's canvas, at the end of each picture it lays (drawInto), from that picture itself: no copy of the canvas, no
 * canvas of its own. Otherwise, and for the frame of each change, it is drawn here as before.
 */
export function createGlassGL(wrap, source, layers, { software = false, off = false, live = () => true, pane = null, cards = null, version = null, capture = null, onFigure = null, keep = null, due = null, copy = true } = {}) {
  const look = pane ? PANE : GLASS;
  // (cards: { find, watch, before, read? }: the Present cards' glass (recs A2, 31 Oct): find() lists the elements, each its own rounded box, its
  // corners its border radii and its tint the colour its CSS declares in --gl-tint (app.css: the same colour its background was), drawn
  // while its --gl-glass is 1 and no CSS filter lies on it; watch: the roots whose writes may move them; before: where the canvas goes.
  // Their DOM shadows and borders stay the page's. A card whose tint cannot be read, or whose glass its CSS has turned off (the phone's
  // sheet, drawn by its pseudo-elements), keeps the browser's glass.)
  // (copy: the glass may also be drawn on a canvas of its own, from a copy of the figure (createImageBitmap), whenever it cannot be drawn
  // into the figure's canvas (setHost). Without it (the default since 31 Oct, round 2, 2.1: on Safari that copy is a read of the GPU's
  // picture back to the page on every frame the figure changes, laggier than the browser's own blur) there is no canvas or context
  // here at all: the glass is drawn into the figure's canvas while it can be, and is otherwise the browser's.)
  if (off || software || !source || typeof WebGL2RenderingContext === 'undefined' || (copy && typeof createImageBitmap !== 'function')) return null;
  let canvas = null, gl = null, progs = null;
  if (copy) {
    canvas = document.createElement('canvas');
    canvas.id = cards ? 'cardGl' : pane ? 'paneGl' : 'glassGl'; canvas.setAttribute('aria-hidden', 'true');
    try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, failIfMajorPerformanceCaveat: true }); } catch { gl = null; }
    if (!gl) return null;
    progs = programsOf(gl);
    if (!progs) return null;
  }
  const { bprog, pprog, BU, PU } = progs || {};
  const vao = gl?.createVertexArray();
  const tex = (filter) => texOf(gl, filter);
  const copyTex = gl ? tex(gl.LINEAR) : null, pass = gl ? tex(gl.LINEAR) : null, blurred = gl ? tex(gl.LINEAR) : null;
  const fbPass = gl?.createFramebuffer(), fbOut = gl?.createFramebuffer();
  // (Where a fade from above stops being the glass's own: where its canvas lies, or would.)
  const stop = (cards ? cards.before : pane || layers[0]).parentNode;
  if (canvas) (cards ? cards.before : pane || layers[0]).before(canvas);

  let lost = false, dead = false, raf = 0, W = 0, H = 0, dpr = 1, pending = false, fails = 0, ready = null, drawn = false, fbSize = '', takenKey = '';
  // (shown: the glass drew the last time it looked; drawnKey: everything that picture was drawn from, so a frame that would draw it the
  // same is skipped; quiet: the frames in a row that changed nothing; liveUntil: a callout's transition or animation runs until then;
  // poll: the slow look while it sleeps; gen: a copy asked for before the glass was let go is never put in.)
  let shown = false, drawnKey = '', quiet = 0, liveUntil = 0, poll = 0, gen = 0, readySeq = 0;
  // (Callout glass kept: the page as last read for the glasses, and whether something may have changed it since; see drawKept.)
  let kept = null, keptStale = true;
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
  const glassesOf = () => (cards ? cards.find().filter((g) => g?.isConnected) : pane ? (pane.isConnected ? [pane] : []) : layers.flatMap((l) => [...l.getElementsByClassName('cl-glass')]));
  // A card's corner radii (CSS px, top left round to bottom left): the first length of each computed radius (an elliptical corner's across).
  const radiiOf = (cs) => [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(NUM);

  // What fades a glass from above: the opacity of whatever holds it, up to where the canvas takes over (the callout, its layer). The DOM
  // applies such a fade to the callout's words and outline as one, so the glass beside them takes it too: a layer faded as a whole once
  // left every pill solid until its words were removed. (A pane's canvas lies beside the pane: nothing holds it.)
  const heldBy = (g) => {
    let a = 1;
    for (let e = g.parentElement; e && e !== stop && a > 0.001; e = e.parentElement) {
      const v = parseFloat(getComputedStyle(e).opacity);
      if (v < 1) a *= v;   // (a missing or odd value is no fade)
    }
    return a;
  };
  // A callout's shape as a mask, drawn from its own outline path (callout.js), again only when that or its size changes.
  // (K: the figure's context's kit when the glass is drawn there (host), with its own masks, at that canvas's density.)
  function maskOf(g, d, w, h, K = null) {
    const G = K ? K.G : gl, k = K ? K.k : dpr, store = K ? K.masks : masks;
    const key = `${d}|${w}|${h}|${k}`;
    let m = store.get(g);
    if (m?.key === key) return m;
    const cv = document.createElement('canvas'), mw = Math.max(1, Math.ceil(w * k)), mh = Math.max(1, Math.ceil(h * k));
    cv.width = mw; cv.height = mh;
    const c = cv.getContext('2d');
    c.setTransform(k, 0, 0, k, 0, 0); c.fillStyle = 'black'; c.fill(new Path2D(d));
    if (!m) { m = { tex: texOf(G, G.LINEAR) }; (K ? K.maskTex : maskTex).add(m.tex); }
    G.bindTexture(G.TEXTURE_2D, m.tex);
    G.pixelStorei(G.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    G.texImage2D(G.TEXTURE_2D, 0, G.RGBA, G.RGBA, G.UNSIGNED_BYTE, cv);
    Object.assign(m, { key, ms: [w * k / mw, h * k / mh] });
    store.set(g, m);
    return m;
  }
  // A new small copy of the figure behind the callouts, blurred once in two passes when it arrives.
  function take(reg, cr, srKept = null) {
    const sr = srKept || source.getBoundingClientRect();
    if (!sr.width || !sr.height || !source.width) return;
    // (The key of the figure as it is copied now, read before the copy is asked for: the browser takes its snapshot in that call.)
    const key = version ? `${version()}|${reg.x}|${reg.y}|${reg.w}|${reg.h}|${cr.left}|${cr.top}|${sr.left}|${sr.top}|${sr.width}|${sr.height}|${source.width}x${source.height}` : '';
    if (key && key === takenKey && ready) { if (gpuProbe.on) gpuProbe.note(cards ? COUNTED.cardSkip : pane ? COUNTED.paneSkip : COUNTED.glassSkip); return; }
    const kx = source.width / sr.width, ky = source.height / sr.height;
    const bw = Math.max(1, Math.ceil(reg.w / SCALE)), bh = Math.max(1, Math.ceil(reg.h / SCALE));
    pending = true;
    if (gpuProbe.on) gpuProbe.note(cards ? COUNTED.cardCopy : pane ? COUNTED.paneCopy : COUNTED.glassCopy);
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
      gl.bindTexture(gl.TEXTURE_2D, copyTex);
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
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbPass); gl.bindTexture(gl.TEXTURE_2D, copyTex); gl.uniform2f(BU.uDir, 1, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
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
    if (!drawn || lost || !gl) return;
    gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); drawn = false;
  }
  // Each callout's glass as the page lays it out this frame (its fades, glides and the card's shadow included).
  function readPanes(list) {
    const panes = [];
    for (const g of list) {
      const el = cards ? g : g.parentElement, cs = getComputedStyle(g);
      if (!el || cs.display === 'none' || cs.visibility !== 'visible') continue;
      const a = NUM(cs.opacity) * heldBy(g);
      // (A glass whose box the page reads itself: cards.read(g) gives { r, rad | d, a, tint }, a list of them drawn in that order, or null
      // (none shows); undefined reads the card as usual. The lobule's pills and the split sheet's cards, pseudo-elements; d: a mask path.)
      const q = cards?.read ? cards.read(g) : undefined;
      if (q !== undefined) {
        for (const one of [].concat(q || [])) {
          if (!one || !(a * one.a > 0.001) || !one.r.width || !one.r.height) continue;
          panes.push({ g, el, a: a * one.a, r: one.r, d: one.d || null, rad: one.d ? null : one.rad, lw: one.r.width, lh: one.r.height, er: one.r, shadow: null, tint: one.tint, k: 1 });
        }
        continue;
      }
      if (cards) {
        // (Its CSS says whether this element's glass is its own (--gl-glass 1) and what its tint is; a filter on it (a brightness) would
        // not reach a glass drawn here, so such a card keeps the browser's.)
        if (cs.getPropertyValue('--gl-glass').trim() !== '1' || (cs.filter && cs.filter !== 'none')) continue;
        const r = g.getBoundingClientRect();
        if (!r.width || !r.height || !(a > 0.001)) continue;
        panes.push({ g, el, a, r, d: null, rad: radiiOf(cs), lw: r.width, lh: r.height, er: r, shadow: null, tint: cs.getPropertyValue('--gl-tint'), k: 1 });
        continue;
      }
      const r = g.getBoundingClientRect(), lw = NUM(g.style.width), lh = NUM(g.style.height);
      if (!r.width || !r.height || !lw || !lh || !(a > 0.001)) continue;
      // (The liver's pane: its own rounded box, tinted with --frost as it stands; its soft shadow, outside it, stays the DOM's.)
      if (pane) { panes.push({ g, el, a, r, d: roundPath(lw, lh, NUM(cs.borderTopLeftRadius)), lw, lh, er: r, shadow: null, tint: cs.getPropertyValue('--frost'), k: 1 }); continue; }
      const d = g.firstChild?.firstChild?.getAttribute?.('d');
      if (!d) continue;
      panes.push({ g, el, a, r, d, lw, lh, er: el.getBoundingClientRect(), shadow: parseShadow(getComputedStyle(el).boxShadow), tint: cs.getPropertyValue('--surface'), k: GLASS.tint });
    }
    return panes;
  }
  function draw() {
    if (lost || dead || gl?.isContextLost()) return false;
    const list = glassesOf();
    if (hostOn && (!list.length || !wanted() || !live())) dropHost(true);
    if (!list.length || !wanted() || !live()) { unmark(); clear(); kept = null; return false; }
    if (host) { const r = hostDraw(list); if (r !== undefined) return r; }
    // (No copy of its own: the browser's glass, until the figure's canvas can take it again.)
    if (!copy) { unmark(); kept = null; return false; }
    if (keep?.()) return drawKept(list);
    kept = null;
    const cr = canvas.getBoundingClientRect(), k = glassDpr();
    const w = Math.max(1, Math.round(cr.width * k)), h = Math.max(1, Math.round(cr.height * k));
    if (w !== W || h !== H) { W = w; H = h; canvas.width = w; canvas.height = h; }
    dpr = k;
    const panes = readPanes(list);
    // The figure taken around them all (CSS px from the canvas' corner).
    if (panes.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of panes) { x0 = Math.min(x0, p.r.left); y0 = Math.min(y0, p.r.top); x1 = Math.max(x1, p.r.right); y1 = Math.max(y1, p.r.bottom); }
      x0 = Math.max(0, x0 - cr.left - MARGIN); y0 = Math.max(0, y0 - cr.top - MARGIN);
      x1 = Math.min(cr.width, x1 - cr.left + MARGIN); y1 = Math.min(cr.height, y1 - cr.top + MARGIN);
      if (x1 > x0 && y1 > y0 && !pending) take({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, cr);
    }
    // No glass shows (all hidden, faded out or empty): the canvas is cleared once and nothing more is done. (A card still marked from an
    // earlier frame goes back to the browser's glass: its CSS may have turned its own off while it was the only one.)
    if (!panes.length) { if (cards) unmark(); clear(); return false; }
    // (Until the first copy is in, the browser's own glass stays.)
    if (!ready) return true;
    const ws = getComputedStyle(wrap), bgs = ws.backgroundColor, bg = colour(bgs, 'transparent');
    const bgVar = bg[3] > 0 ? '' : ws.getPropertyValue('--stage-bg').trim() || ws.getPropertyValue('--bg').trim();
    return paint(panes, cr, bgs, bg, bgVar);
  }
  // The glasses drawn over the blurred copy, unless the picture would be the one already on the canvas ('same').
  function paint(panes, cr, bgs, bg, bgVar) {
    // Everything this picture is drawn from: the blurred copy, the canvas, the stage's colour and each glass as laid out now (its place,
    // fade, shape, tint and the card's shadow). The same as the picture on the canvas: it is left as it is ('same').
    const key = `${W}x${H}|${dpr}|${readySeq}|${cr.left}|${cr.top}|${bgs}|${bgVar}` + panesKey(panes);
    if (drawn && key === drawnKey) return 'same';
    noteDraw(cards ? 'glass-cards' : pane ? 'glass-pane' : 'glass');
    if (gpuProbe.on) gpuProbe.note(cards ? COUNTED.cardDrawn : pane ? COUNTED.paneDrawn : COUNTED.glassDrawn);
    gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(pprog); gl.bindVertexArray(vao);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform2f(PU.uView, W, H); gl.uniform1i(PU.uScene, 0); gl.uniform1i(PU.uMask, 1); gl.uniform1f(PU.uSat, look.sat);
    gl.uniform4f(PU.uReg, ready.x * dpr, ready.y * dpr, ready.w * dpr, ready.h * dpr);
    const base = bg[3] > 0 ? bg : colour(bgVar, 'transparent');
    gl.uniform3f(PU.uBg, base[0], base[1], base[2]);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, blurred);
    drawPanes(gl, PU, panes, cr, dpr, (p) => maskOf(p.g, p.d, p.lw, p.lh));
    drawn = true; drawnKey = key;
    return true;
  }
  // (Each glass as laid out: its place, fade, shape, tint and the card's shadow.)
  function panesKey(panes) {
    let key = '';
    for (const p of panes) {
      const s = p.shadow, e = p.er;
      key += `|${p.r.left},${p.r.top},${p.r.width},${p.r.height},${p.a},${p.lw},${p.lh},${p.d},${p.rad || ''},${p.tint}`
        + (pane ? '' : `,${e.left},${e.top},${e.right},${e.bottom},${s ? `${s.c},${s.x},${s.y},${s.blur},${s.spread}` : '-'}`);
    }
    return key;
  }
  // Each glass over the blurred copy (bound on unit 0, the glass's program in use and its view set), in context G at k device px per
  // CSS px, marked as it is drawn; a mark no longer drawn is given back.
  function drawPanes(G, U, panes, cr, k, maskFor, now = new Set(), final = true) {
    for (const p of panes) {
      const t = colour(p.tint.trim(), 'transparent'), ta = t[3] * p.k;
      // (A card whose tint did not read as a colour (a browser that does not register custom properties): not drawn, and left to the
      // browser's glass, which still shows its declared background.)
      if (cards && !(ta > 0)) continue;
      const bx = (p.r.left - cr.left) * k, by = (p.r.top - cr.top) * k;
      if (p.rad) {
        G.uniform1i(U.uMode, 1);
        G.uniform4f(U.uRad, p.rad[0] * k, p.rad[1] * k, p.rad[2] * k, p.rad[3] * k);
        G.uniform2f(U.uMS, 1, 1);
      } else {
        const m = maskFor(p);
        G.activeTexture(G.TEXTURE1); G.bindTexture(G.TEXTURE_2D, m.tex); G.activeTexture(G.TEXTURE0);
        G.uniform1i(U.uMode, 0);
        G.uniform2f(U.uMS, m.ms[0], m.ms[1]);
      }
      G.uniform4f(U.uBox, bx, by, p.r.width * k, p.r.height * k);
      G.uniform4f(U.uTint, t[0] * ta, t[1] * ta, t[2] * ta, ta);
      G.uniform1f(U.uA, Math.min(1, p.a));
      const e = p.er, L = (e.left - cr.left) * k, T = (e.top - cr.top) * k, R = (e.right - cr.left) * k, B = (e.bottom - cr.top) * k;
      G.uniform4f(U.uBB, L, T, R, B);
      const s = p.shadow, sp = (s?.spread || 0) * k;
      G.uniform4f(U.uShC, ...(s ? s.c : [0, 0, 0, 0]));
      G.uniform4f(U.uShB, L + (s?.x || 0) * k - sp, T + (s?.y || 0) * k - sp, R + (s?.x || 0) * k + sp, B + (s?.y || 0) * k + sp);
      G.uniform1f(U.uShS, (s?.blur || 0) / 2 * k);
      G.drawArrays(G.TRIANGLE_STRIP, 0, 4);
      // (Marked in the frame its glass is first drawn here: the browser's blur and this one never both show, nor neither.)
      if (!p.g.hasAttribute('data-gl')) p.g.setAttribute('data-gl', '');
      now.add(p.g);
    }
    if (final) settleMarks(now);
  }
  // (A card not drawn this time, whatever the reason (hidden, faded out, its glass turned off by its CSS, its tint unread, something
  // between it and the figure's canvas), goes back to the browser's glass now: marked, it would show no glass at all. In the figure's
  // canvas a glass not drawn there goes back to the browser's whatever it is.)
  function settleMarks(now) {
    for (const g of marked) if (!now.has(g) && (cards || hostOn || !g.isConnected)) { if (g.isConnected) g.removeAttribute('data-gl'); marked.delete(g); }
    for (const g of now) marked.add(g);
  }
  // Drawn into the figure's canvas (setHost; recs A1, glass). The loop reads the glasses as before; when they, the canvas's place or the
  // stage's colour changed it asks the figure to lay its picture again at once (host.now: in the frame's final phase, so in the same
  // frame as the change). Each picture laid draws the glass over it (drawInto): the region behind the glasses taken from that picture
  // (halved until it is at most twice the blur's size, then down to it: each step an average, as the copy's resize was), blurred in two
  // passes and cut to each glass's shape. A picture laid while the figure under the glasses has not been drawn again (the same version)
  // keeps the blur already made. The figure drawn again needs no frame of the glass's own: the picture is laid with it.
  // (host.over(level): the boxes (client px: left, top, right, bottom) of what the page lays between the figure's canvas and this glass's
  // level ('low' for a card host.low(g) names, the teaching card's shade; 'high' for the other cards; undefined for the callouts and the
  // pane): a glass drawn into the figure's canvas would show those sharp through it, where the browser's blurs them. The callouts and
  // the pane go back to their own way as a whole when any of theirs crosses one; a card, alone.)
  const heldOut = new Map();
  let heldWake = 0;
  let host = null, hk = null, hostOn = false, hf = null, hostTops = [], hostMo = null;
  const crosses = (panes, rs) => {
    if (!rs?.length || !panes.length) return false;
    return panes.some((p) => rs.some((r) => r.right > r.left && r.bottom > r.top && p.r.left < r.right && r.left < p.r.right && p.r.top < r.bottom && r.top < p.r.bottom));
  };
  function hostKit() {
    const G = host.gl, P = programsOf(G);
    if (!P) return null;
    const K = { G, ...P, vao: G.createVertexArray(), copy: texOf(G, G.LINEAR), pass: texOf(G, G.LINEAR), blurred: texOf(G, G.LINEAR),
      fbCopy: G.createFramebuffer(), fbPass: G.createFramebuffer(), fbOut: G.createFramebuffer(), steps: [], size: '', key: '', reg: null, k: 1,
      masks: new WeakMap(), maskTex: new Set() };
    G.bindTexture(G.TEXTURE_2D, null);
    return K;
  }
  function hostFree() {
    const K = hk;
    hk = null;
    if (!K || K.G.isContextLost()) return;
    const G = K.G;
    for (const t of [K.copy, K.pass, K.blurred, ...K.steps.map((st) => st.t), ...K.maskTex]) G.deleteTexture(t);
    for (const fb of [K.fbCopy, K.fbPass, K.fbOut, ...K.steps.map((st) => st.fb)]) G.deleteFramebuffer(fb);
    G.deleteProgram(K.bprog); G.deleteProgram(K.pprog); G.deleteVertexArray(K.vao);
  }
  // Back to this canvas: the browser's glass shows until its first copy is in (marks given back), and the figure's picture is laid again
  // without the glass now (again), or by the figure's next picture (from inside one, which has just been laid without it).
  function dropHost(again) {
    if (!hostOn) return;
    hostOn = false; hf = null;
    if (hk) hk.key = '';
    unmark();
    if (canvas) canvas.style.visibility = '';
    if (again) host?.now(); else ask();
  }
  // The loop's turn while a host is set: true, 'same' or false as draw() returns, or undefined when the glass is drawn on its own canvas.
  function hostDraw(list) {
    if (!host.active()) { dropHost(true); return undefined; }
    const cr = host.canvas.getBoundingClientRect();
    if (!cr.width || !cr.height) { dropHost(true); return undefined; }
    // (A glass reaching past the figure's canvas could not be drawn there whole: the browser's, or its own canvas, takes it.)
    // (2 px of slack: the split sheet's glass panes reach 1 px past the card's box (their border) and the card moves by fractions of a pixel as the view follows it, so a pane
    // standing at the canvas's edge, as the readings' card does when fully out, was in and out of reach from frame to frame.)
    const inside = (p) => p.r.left >= cr.left - 2 && p.r.top >= cr.top - 2 && p.r.right <= cr.right + 2 && p.r.bottom <= cr.bottom + 2;
    let panes = readPanes(list);
    if (cards) {
      let lo = null, hi = null;
      // (A card is drawn here whole or not at all: marked, a card with one of its panes kept out (the split sheet's two, one reaching past the
      // canvas or crossing a label as it slides) would lose the browser's blur for that pane and show none, flickering as it moves.)
      const out = new Set(panes.filter((p) => !(inside(p) && !crosses([p], host.low?.(p.g) ? (lo ||= host.over?.('low') || []) : (hi ||= host.over?.('high') || [])))).map((p) => p.g));
      // (And a card kept out stays out for 400 ms after it could be drawn again: one sliding to its end, or a pull settling, can fall in and out
      // of reach from frame to frame, and each change swaps one blur for the other.)
      const nowT = performance.now();
      for (const g of out) heldOut.set(g, nowT);
      if (out.size && !heldWake) heldWake = setTimeout(() => { heldWake = 0; ask(); }, 420);
      for (const [g, t] of heldOut) { if (!g.isConnected || nowT - t > 400) heldOut.delete(g); else out.add(g); }
      panes = panes.filter((p) => !out.has(p.g));
    } else if (!panes.every(inside) || crosses(panes, host.over?.())) { dropHost(true); return undefined; }
    if (!hk && !(hk = hostKit())) { dropHost(true); host = null; return undefined; }
    const ws = getComputedStyle(wrap), bgs = ws.backgroundColor, bg = colour(bgs, 'transparent');
    const bgVar = bg[3] > 0 ? '' : ws.getPropertyValue('--stage-bg').trim() || ws.getPropertyValue('--bg').trim();
    const key = `${cr.left}|${cr.top}|${cr.width}|${cr.height}|${bgs}|${bgVar}` + panesKey(panes);
    if (!hostOn) {
      // (This canvas cleared and out of the page's layers; a copy on its way is not put in, and the next one here is taken afresh.)
      hostOn = true; hf = null; gen++; pending = false; ready = null; takenKey = ''; kept = null;
      if (canvas) {
        clear();
        canvas.style.visibility = 'hidden';
        W = H = 1; canvas.width = 1; canvas.height = 1;   // (its memory given back while it stands aside; sized again when it draws)
      }
    }
    if (hf && hf.key === key) return panes.length ? 'same' : false;
    hf = { panes, cr, base: bg[3] > 0 ? bg : colour(bgVar, 'transparent'), key };
    host.now();
    return panes.length ? true : false;
  }
  // A texture and framebuffer for one halving step, grown (never shrunk) to hold w × h.
  function step(i, w, h) {
    const G = hk.G;
    let st = hk.steps[i];
    if (!st) { st = { t: texOf(G, G.LINEAR), fb: G.createFramebuffer(), w: 0, h: 0 }; hk.steps[i] = st; }
    if (w > st.w || h > st.h) {
      st.w = Math.max(w, st.w); st.h = Math.max(h, st.h);
      G.bindTexture(G.TEXTURE_2D, st.t);
      G.texImage2D(G.TEXTURE_2D, 0, G.RGBA, st.w, st.h, 0, G.RGBA, G.UNSIGNED_BYTE, null);
      G.bindFramebuffer(G.FRAMEBUFFER, st.fb);
      G.framebufferTexture2D(G.FRAMEBUFFER, G.COLOR_ATTACHMENT0, G.TEXTURE_2D, st.t, 0);
    }
    return st;
  }
  // The region (CSS px from the canvas's corner) of the picture just laid, made small and blurred, as take() does from a copy.
  function hostBlur(reg, k, W2, H2) {
    const G = hk.G;
    let x0 = Math.max(0, Math.round(reg.x * k)), x1 = Math.min(W2, Math.round((reg.x + reg.w) * k));
    let y0 = Math.max(0, H2 - Math.round((reg.y + reg.h) * k)), y1 = Math.min(H2, H2 - Math.round(reg.y * k));
    let w = x1 - x0, h = y1 - y0;
    if (w < 1 || h < 1) return false;
    const bw = Math.max(1, Math.ceil(reg.w / SCALE)), bh = Math.max(1, Math.ceil(reg.h / SCALE));
    if (hk.size !== `${bw}x${bh}`) {
      hk.size = `${bw}x${bh}`;
      for (const [t, fb] of [[hk.copy, hk.fbCopy], [hk.pass, hk.fbPass], [hk.blurred, hk.fbOut]]) {
        G.bindTexture(G.TEXTURE_2D, t);
        G.texImage2D(G.TEXTURE_2D, 0, G.RGBA, bw, bh, 0, G.RGBA, G.UNSIGNED_BYTE, null);
        G.bindFramebuffer(G.FRAMEBUFFER, fb);
        G.framebufferTexture2D(G.FRAMEBUFFER, G.COLOR_ATTACHMENT0, G.TEXTURE_2D, t, 0);
      }
    }
    if (gpuProbe.on) gpuProbe.note(COUNTED.glassCopy);
    let src = null;
    for (let i = 0; w > bw * 2 || h > bh * 2; i++) {
      const nw = Math.max(bw, Math.ceil(w / 2)), nh = Math.max(bh, Math.ceil(h / 2)), st = step(i, nw, nh);
      G.bindFramebuffer(G.READ_FRAMEBUFFER, src); G.bindFramebuffer(G.DRAW_FRAMEBUFFER, st.fb);
      G.blitFramebuffer(x0, y0, x0 + w, y0 + h, 0, 0, nw, nh, G.COLOR_BUFFER_BIT, G.LINEAR);
      src = st.fb; x0 = 0; y0 = 0; w = nw; h = nh;
    }
    // (Turned over on the way: the copy's first row is the region's top, as a copy of the page's canvas is.)
    G.bindFramebuffer(G.READ_FRAMEBUFFER, src); G.bindFramebuffer(G.DRAW_FRAMEBUFFER, hk.fbCopy);
    G.blitFramebuffer(x0, y0, x0 + w, y0 + h, 0, bh, bw, 0, G.COLOR_BUFFER_BIT, G.LINEAR);
    G.bindFramebuffer(G.READ_FRAMEBUFFER, null); G.bindFramebuffer(G.DRAW_FRAMEBUFFER, null);
    G.useProgram(hk.bprog); G.bindVertexArray(hk.vao); G.disable(G.BLEND);
    G.viewport(0, 0, bw, bh);
    G.uniform4f(hk.BU.uBox, 0, 0, bw, bh); G.uniform2f(hk.BU.uView, bw, bh); G.uniform1i(hk.BU.uT, 0);
    G.uniform1fv(hk.BU.uW, gaussTaps(look.blur / SCALE));
    G.activeTexture(G.TEXTURE0);
    G.bindFramebuffer(G.FRAMEBUFFER, hk.fbPass); G.bindTexture(G.TEXTURE_2D, hk.copy); G.uniform2f(hk.BU.uDir, 1, 0); G.drawArrays(G.TRIANGLE_STRIP, 0, 4);
    G.bindFramebuffer(G.FRAMEBUFFER, hk.fbOut); G.bindTexture(G.TEXTURE_2D, hk.pass); G.uniform2f(hk.BU.uDir, 0, 1); G.drawArrays(G.TRIANGLE_STRIP, 0, 4);
    G.bindFramebuffer(G.FRAMEBUFFER, null);
    return true;
  }
  // The glass over the picture the figure has just laid (veins-gl top), into its canvas: first (prepInto, before any glass is drawn on
  // that picture) the region behind the glasses blurred from it, then each glass (drawInto) in its turn among the page's layers: the
  // pane under the labels, the teaching card's shade ('low'), the callouts, the other cards ('high'). The cards' two turns share one
  // blur and one set of marks, given back after the last turn (settleMarks).
  let frameMarks = new Set(), blurOK = false;
  function prepInto() {
    frameMarks = new Set(); blurOK = false;
    if (!hostOn || !hf || !hk || lost || dead) return;
    const G = hk.G;
    if (G.isContextLost() || !host.active()) return;
    const { panes, cr } = hf;
    if (!panes.length) return;
    const W2 = host.canvas.width, H2 = host.canvas.height, k = W2 / cr.width;
    if (!(k > 0) || !H2) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of panes) { x0 = Math.min(x0, p.r.left); y0 = Math.min(y0, p.r.top); x1 = Math.max(x1, p.r.right); y1 = Math.max(y1, p.r.bottom); }
    x0 = Math.max(0, x0 - cr.left - MARGIN); y0 = Math.max(0, y0 - cr.top - MARGIN);
    x1 = Math.min(cr.width, x1 - cr.left + MARGIN); y1 = Math.min(cr.height, y1 - cr.top + MARGIN);
    if (!(x1 > x0 && y1 > y0)) return;
    const reg = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    G.disable(G.SCISSOR_TEST); G.disable(G.STENCIL_TEST);
    const key = `${version ? version() : performance.now()}|${reg.x}|${reg.y}|${reg.w}|${reg.h}|${W2}x${H2}`;
    if (key !== hk.key) {
      const ok = hostBlur(reg, k, W2, H2);
      // (The figure's context left as its other passes expect to find it.)
      G.bindFramebuffer(G.FRAMEBUFFER, null); G.viewport(0, 0, W2, H2);
      G.bindTexture(G.TEXTURE_2D, null); G.useProgram(null); G.bindVertexArray(null);
      if (!ok) { hk.key = ''; return; }
      hk.key = key; hk.reg = reg;
    } else if (gpuProbe.on) gpuProbe.note(COUNTED.glassSkip);
    hk.k = k;
    blurOK = true;
  }
  // (pass: 'low', 'high' or 'all'; the last turn of the frame ('high', 'all') gives back the marks of the glasses not drawn.)
  function drawInto(pass = 'all') {
    if (!hostOn || !hf || !hk || lost || dead) return;
    const G = hk.G;
    if (G.isContextLost()) return;
    // (No longer to be drawn there: this picture was laid without it, and the browser's glass shows in the same frame.)
    if (!host.active()) { dropHost(false); return; }
    const final = pass !== 'low';
    const { cr } = hf;
    const panes = !blurOK ? [] : pass === 'all' ? hf.panes : hf.panes.filter((p) => !!host.low?.(p.g) === (pass === 'low'));
    if (!panes.length) { if (final) settleMarks(frameMarks); return; }
    const W2 = host.canvas.width, H2 = host.canvas.height, k = hk.k;
    noteDraw(cards ? 'glass-cards' : pane ? 'glass-pane' : 'glass');
    if (gpuProbe.on) gpuProbe.note(cards ? COUNTED.cardDrawn : pane ? COUNTED.paneDrawn : COUNTED.glassDrawn);
    const U = hk.PU, R = hk.reg;
    G.bindFramebuffer(G.FRAMEBUFFER, null);
    G.viewport(0, 0, W2, H2);
    G.disable(G.SCISSOR_TEST); G.disable(G.STENCIL_TEST);
    G.useProgram(hk.pprog); G.bindVertexArray(hk.vao);
    G.enable(G.BLEND); G.blendEquation(G.FUNC_ADD); G.blendFunc(G.ONE, G.ONE_MINUS_SRC_ALPHA);
    G.uniform2f(U.uView, W2, H2); G.uniform1i(U.uScene, 0); G.uniform1i(U.uMask, 1); G.uniform1f(U.uSat, look.sat);
    G.uniform4f(U.uReg, R.x * k, R.y * k, R.w * k, R.h * k);
    G.uniform3f(U.uBg, hf.base[0], hf.base[1], hf.base[2]);
    G.activeTexture(G.TEXTURE0); G.bindTexture(G.TEXTURE_2D, hk.blurred);
    drawPanes(G, U, panes, cr, k, (p) => maskOf(p.g, p.d, p.lw, p.lh, hk), frameMarks, final);
    // (The figure's context left as its other passes expect to find it.)
    G.disable(G.BLEND); G.bindVertexArray(null); G.useProgram(null);
    G.activeTexture(G.TEXTURE1); G.bindTexture(G.TEXTURE_2D, null); G.activeTexture(G.TEXTURE0); G.bindTexture(G.TEXTURE_2D, null);
    G.pixelStorei(G.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }
  const onHostLost = () => { hk = null; if (hostOn) { hostOn = false; hf = null; unmark(); if (canvas) canvas.style.visibility = ''; ask(); } };
  // Callout glass kept (keep()): what draw() reads from the page each frame, read only when keptStale says it may have changed. The
  // reads and the picture are draw()'s own; only when they are taken differs. (A list of glasses that is not the one measured, a new
  // screen density, a callout's transition or event in the last 0.8 s, an animation in the layers when last measured (a CSS transition
  // or keyframes, or a script's fade: measured again every frame until it ends), or the page's layout watch all measure again. A
  // script's fade started on a callout with no write to the layers would go unseen until one of those; nothing does that today.)
  const sameList = (a, b) => a.length === b.length && a.every((g, i) => g === b[i]);
  function measure(list) {
    const cr = canvas.getBoundingClientRect(), k = glassDpr();
    const panes = readPanes(list);
    const ws = getComputedStyle(wrap), bgs = ws.backgroundColor, bg = colour(bgs, 'transparent');
    const bgVar = bg[3] > 0 ? '' : ws.getPropertyValue('--stage-bg').trim() || ws.getPropertyValue('--bg').trim();
    return { list, cr, k, panes, bgs, bg, bgVar, sr: source.getBoundingClientRect(), anim: animating() };
  }
  function drawKept(list) {
    keepWatch();
    const k0 = glassDpr();
    if (!kept || keptStale || !sameList(kept.list, list) || kept.k !== k0 || kept.anim || performance.now() < liveUntil || due?.()) {
      keptStale = false;
      kept = measure(list);
    }
    const { cr, k, panes, bgs, bg, bgVar, sr } = kept;
    const w = Math.max(1, Math.round(cr.width * k)), h = Math.max(1, Math.round(cr.height * k));
    if (w !== W || h !== H) { W = w; H = h; canvas.width = w; canvas.height = h; }
    dpr = k;
    if (panes.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of panes) { x0 = Math.min(x0, p.r.left); y0 = Math.min(y0, p.r.top); x1 = Math.max(x1, p.r.right); y1 = Math.max(y1, p.r.bottom); }
      x0 = Math.max(0, x0 - cr.left - MARGIN); y0 = Math.max(0, y0 - cr.top - MARGIN);
      x1 = Math.min(cr.width, x1 - cr.left + MARGIN); y1 = Math.min(cr.height, y1 - cr.top + MARGIN);
      if (x1 > x0 && y1 > y0 && !pending) take({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, cr, sr);
    }
    if (!panes.length) { if (cards) unmark(); clear(); return false; }
    if (!ready) return true;
    return paint(panes, cr, bgs, bg, bgVar);
  }
  // While a callout shows, every frame something under or in it moves: the figure drawn again (the blood under it), a callout
  // written (its place, its size, a class), or one of its transitions or animations running. A frame that would draw the same
  // picture draws nothing, and two such frames in a row put the glass to sleep (a paused figure, settled callouts): no copy, no
  // blur, no draw and no frame asked for, only a look once a second in case a change came by a path that does not wake it.
  // A callout written outside a frame is drawn in the next frame's final phase, before that frame is shown, so the glass never trails its outline.
  // (On the shared scheduler's final phase: after every other surface's frame, the figure's own pass and the callouts' writes
  // included, so it blurs the figure of this frame, not the last, and is drawn once in a frame whoever asked.)
  const later = finalFrameFor(cards ? 'glass-cards' : pane ? 'glass-pane' : 'glass');
  const loop = () => { raf = 0; if (mo.takeRecords().length) keptStale = true; settle(draw()); };   // (the writes made before it in this frame are drawn here, not again after it)
  function ask() { if (!raf && !lost && !dead) raf = later(loop); }
  /** Something the glass shows may have changed: it looks again (for two frames at least). */
  function wake() { quiet = 0; ask(); }
  function settle(r) {
    shown = !!r;
    clearTimeout(poll); poll = 0;
    if (lost || dead) return;
    quiet = r === 'same' ? quiet + 1 : 0;
    const running = performance.now() < liveUntil;
    // (Showing: on while it drew, a copy is on its way, or for two quiet frames. Not showing: on only while a transition may bring it in.
    // Either way, never asleep while something in the layers is still animating: a script's fade sends no event.)
    if ((r ? r === true || pending || quiet < 2 : false) || running || animating()) { ask(); return; }
    // (Asleep: a slow look while any glass is on the page; none, and only a new callout (a write to the layers) wakes it.)
    if (glassesOf().length) poll = setTimeout(() => { poll = 0; ask(); }, 1000);
  }
  // (A write to the callouts asks for the glass's frame, not a draw of its own: a write made in a task (an event, a timer) is drawn in the
  // final phase of the frame that shows it, so the glass still never trails its outline, and one made in a frame before the glass's turn
  // is taken by its loop (takeRecords). The microtask draw it was had drawn a second time in a frame while callouts moved; 30 Oct,
  // review H4b.)
  const mo = new MutationObserver(() => { keptStale = true; quiet = 0; ask(); });
  const watched = cards ? cards.watch : pane ? [pane] : layers;
  for (const l of watched) mo.observe(l, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class', 'data-at', 'hidden'] });
  // Whether a callout layer still holds an animation that will end: a transition (its delay included), a keyframe animation or a
  // script's fade. Transitions and keyframes announce themselves (held, below); a script's (the Web Animations API) does not.
  const animating = () => {
    for (const l of watched) {
      const list = l.getAnimations?.({ subtree: true });
      if (list?.some((an) => an.playState === 'running' && Number.isFinite(an.effect?.getComputedTiming?.().endTime))) return true;
    }
    return false;
  };
  const again = () => { keptStale = true; wake(); };
  const observers = [mo, new MutationObserver(again), new MutationObserver(again)];
  observers[1].observe(document.documentElement, { attributes: true, attributeFilter: ['data-noglass', 'data-theme', 'class'] });
  observers[2].observe(wrap, { attributes: true, attributeFilter: ['class'] });   // (the GPU figure on or off: live(); the stage's look)
  // (Callout glass kept: what can move the glasses, the canvas or the figure without a write in the layers: a style, class or hidden on
  // any of their parents or on the figure's canvas (the dive's scale, a sub-pixel shift), a size change, a scroll. Each only marks the
  // boxes as stale. Set up the first time the switch is on (keepWatch); with it off, none of it exists.)
  const stale = () => { keptStale = true; };
  let keptMo = null, keptRo = null;
  function keepWatch() {
    if (keptMo) return;
    const chain = new Set();
    for (const el of [...watched, source]) for (let e = el === source ? el : el.parentElement; e && e.nodeType === 1; e = e.parentElement) chain.add(e);
    keptMo = new MutationObserver(stale);
    for (const e of chain) keptMo.observe(e, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    keptRo = typeof ResizeObserver === 'function' ? new ResizeObserver(stale) : null;
    for (const e of [canvas, source, wrap]) keptRo?.observe(e);
    document.addEventListener('scroll', stale, true);
    keptStale = true;
  }
  // A callout's fade, glide or hover moves its glass with no write to wake it: it is followed while it runs.
  const held = () => { liveUntil = performance.now() + 800; keptStale = true; wake(); };
  const EVENTS = ['transitionrun', 'transitionstart', 'transitionend', 'transitioncancel', 'animationstart', 'animationend', 'animationcancel', 'pointerover', 'pointerout'];
  for (const l of watched) for (const t of EVENTS) l.addEventListener(t, held, true);
  addEventListener('resize', again);
  // (The figure drawn again: the blur under a glass that shows is taken again. With none showing, the figure is not its business.)
  const offFigure = onFigure?.(() => { if (shown && !hostOn) wake(); });   // (drawn into the figure's canvas: laid with each picture)
  const onLost = (e) => { e.preventDefault(); lost = true; unmark(); };
  canvas?.addEventListener('webglcontextlost', onLost);
  ask();
  return {
    canvas,
    redraw() { wake(); },
    /** The figure's canvas to draw into while it may (see above); callouts only. */
    // (h: { gl, canvas, add, now, active, over, low, order }: the figure's canvas and its context (veins-gl top), add({ order, prep,
    // draw }) to be drawn at the end of each picture it lays, now() to lay one at once, active() whether the glass may be drawn there,
    // over(level) and low(g) as above, order the turn (a card's: { low, high }).)
    setHost(h) {
      if (!h?.gl || !h.add || dead) return;
      // (A host set again (the figure's context made anew after a loss): the old one's turns, watch and kit let go first.)
      if (host) {
        dropHost(false);
        for (const off of hostTops) off();
        hostTops = []; hostMo?.disconnect(); hostMo = null;
        host.canvas.removeEventListener('webglcontextlost', onHostLost);
        hostFree();
      }
      host = h;
      host.canvas.addEventListener('webglcontextlost', onHostLost);
      hostTops = cards
        ? [host.add({ order: h.order?.low ?? 1, prep: prepInto, draw: () => drawInto('low') }), host.add({ order: h.order?.high ?? 3, draw: () => drawInto('high') })]
        : [host.add({ order: h.order ?? 2, prep: prepInto, draw: () => drawInto('all') })];
      // (The figure's canvas faded, hidden or moved by a style of its own (a resolution's fade, a sub-pixel rest): looked at again.)
      hostMo = new MutationObserver(() => { if (host) wake(); });
      hostMo.observe(host.canvas, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
      wake();
    },
    /** Gives the figure's canvas back at once (the stage is about to copy its picture: a resolution's fade): the browser's glass, or the
     *  glass's own canvas, shows in the same frame. Drawn there again when active() says so. */
    release() { dropHost(false); },
    /** Into the figure's canvas, over the picture it has just laid (its top hook). */
    drawInto,
    /** Whether the glass is drawn into the figure's canvas now. */
    get hosted() { return hostOn; },
    get on() { return !lost && !dead; },
    /** Let go of it: its frames, timers, observers, listeners and GPU objects, and its canvas; the browser's glass shows again. */
    dispose() {
      if (gen < 0) return;
      dead = true; gen = -1;
      cancelFrame(raf); raf = 0; clearTimeout(poll); poll = 0;
      for (const o of observers) o.disconnect();
      if (keptMo) { keptMo.disconnect(); keptRo?.disconnect(); document.removeEventListener('scroll', stale, true); }
      for (const l of watched) for (const t of EVENTS) l.removeEventListener(t, held, true);
      removeEventListener('resize', again);
      offFigure?.();
      canvas?.removeEventListener('webglcontextlost', onLost);
      host?.canvas.removeEventListener('webglcontextlost', onHostLost);
      hostMo?.disconnect();
      for (const off of hostTops) off();
      hostTops = [];
      unmark();
      if (hostOn) { hostOn = false; hf = null; host?.now(); }
      hostFree();
      if (gl && !lost) {
        for (const t of [copyTex, pass, blurred, ...maskTex]) gl.deleteTexture(t);
        gl.deleteFramebuffer(fbPass); gl.deleteFramebuffer(fbOut);
        gl.deleteProgram(bprog); gl.deleteProgram(pprog); gl.deleteVertexArray(vao);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
      maskTex.clear();
      canvas?.remove();
    },
  };
}
