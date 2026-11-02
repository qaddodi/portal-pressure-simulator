// Charts and monitors drawn on the GPU (Mohammad, 1 Nov 2026: "Move everything to GPU"; "Why would anything stay in 2D canvas?").
// A WebGL2 canvas laid over a chart's canvas draws the whole chart, the still parts and the moving ones, every frame; the chart's own
// canvas is left blank (and see-through) under it, kept only as the box the chart is laid out and touched in. Nothing is drawn by the
// CPU in a frame: a word's picture is set into an atlas once (a number from its digits, each set once), the lines are the samples' own
// points, and the GPU makes the strokes, fills, pills and dots.
//
// The charts keep their drawing code: ctx2d() hands them a context with the 2D canvas's own calls and state (paths, strokes and fills,
// dashes, line ends, words, clips to a box, linear gradients, save and restore), which this turns into GPU draws:
// - a stroke: every piece of the path's line, as round- or butt-ended capsules, into a coverage target with MAX blending (so the overlapping
//   capsules of a dense trace never darken their joins or edges, and two pieces of one path that cross are drawn once, as one 2D stroke
//   draws them), then laid down once in its colour or gradient; dashes are measured along the path as the 2D canvas measures them;
// - a fill: a rounded box or a dot as a shape with a soft edge; any other path by the stencil (the nonzero rule, as the 2D canvas fills);
// - words: the atlas's pictures, set at the canvas's own pixel grid, tinted (strokeText: the words' outline, set once as its own picture).
//
// Where WebGL2 is missing, the renderer is software, the shader is not yet ready, or the context is lost, ctx2d() returns null and the
// chart is not drawn until the GPU can draw it (fitCanvas's pen draws nothing; no 2D canvas is drawn on), and it draws again the moment
// the GPU can (publish). ?tracegl=0 keeps every chart undrawn.

import { startProgram, checkProgram, exerciseDraw, publishWhenDone } from './gl-compile.js?v=e48e05cdb3';
import { canvasSize, fitCanvas, onCanvasSized } from './util.js?v=92114c1315';
import { sdfAtlas } from './text-gl.js?v=8db702aacd';   // (the app's one door to GPU text: its SDF atlas, for text that changes every frame)
import { fontOf, measure } from './glyph-measure.js?v=131d137ce2';
export { measure };
const { GLYPHS, KERN, BASELINES, BASE, RADIUS, CUTOFF, ATLAS_W, ATLAS_H, ATLAS_PNG } = sdfAtlas;

/** ?tracegl=0 in a page's search string: every chart and monitor draws on its 2D canvas, as before. */
export const traceGLOff = (search) => /[?&]tracegl=0\b/.test(String(search ?? ''));
// A chart off the screen for PARK_MS gives back its WebGL context (WEBGL_lose_context), and takes it again as it nears the screen:
// a browser keeps 16 or so contexts a page and drops the oldest past that, which was the figure's (a FibroScan slide held about 20).
// ?ctxpark=0 keeps every chart's context.
export const ctxParkOff = (search) => /[?&]ctxpark=0\b/.test(String(search ?? ''));
const PARK_MS = 4000;
// (2 Nov 2026, the review's "a deck opens 12 contexts": every chart draws in ONE WebGL2 context, an OffscreenCanvas the charts share. A
// chart's frame is drawn there at the chart's own size and handed whole to the chart's own canvas (transferToImageBitmap into its
// 'bitmaprenderer' context: the picture moves on the GPU, nothing is copied by the CPU). Its programs are compiled and its glyph field
// uploaded once for all charts, so a chart coming into view never waits for a compile or comes in blank, and none is parked. Where
// OffscreenCanvas WebGL2 is missing, each chart has its own context, as before. ?ctxshare=0: each its own, as before.)
export const ctxShareOff = (search) => /[?&]ctxshare=0\b/.test(String(search ?? ''));
let pool = null;
function sharedGL() {
  if (pool) return pool.dead ? null : pool;
  pool = { dead: true };
  if (typeof OffscreenCanvas !== 'function') return null;
  let gl;
  const canvas = new OffscreenCanvas(1, 1);
  try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: true, preserveDrawingBuffer: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true }); } catch { gl = null; }
  if (!gl || typeof gl.createShader !== 'function' || typeof canvas.transferToImageBitmap !== 'function') return null;
  pool = { dead: false, canvas, gl, gen: 0, started: null, atlasTex: null, atlasIn: false, active: null };
  canvas.addEventListener?.('webglcontextlost', (e) => { e.preventDefault(); pool.started = null; pool.atlasTex = null; pool.atlasIn = false; });
  canvas.addEventListener?.('webglcontextrestored', () => { pool.gen++; });
  return pool;
}

// Paint (a colour or a linear gradient of up to sixteen stops: the profile's curve has a stop per station), shared by the fills and the strokes' laying down. Positions in CSS px.
const PAINT = `
uniform vec4 pc[16];                 // the stops' colours (premultiplied)
uniform float po[16];                // the stops' offsets
uniform vec4 pl;                     // the gradient's line: x0, y0, x1, y1 (CSS px)
uniform int pn;                      // how many stops (1: a plain colour)
uniform vec2 pr;                     // a radial gradient's two radii (pk 1: its circles are about pl.xy and pl.zw)
uniform int pk;                      // 0: linear, 1: radial
uniform mat3 pm;                     // the page's px to the gradient's own space (the transform it was filled under, inverted)
vec4 paint(vec2 p0) {
  if (pn < 2) return pc[0];
  vec2 p = (pm * vec3(p0, 1.0)).xy;
  float t;
  if (pk == 1) {
    // (the 2D canvas's radial gradient: the largest t whose circle, centre and radius both interpolated, passes through p)
    vec2 dc = pl.zw - pl.xy, q = p - pl.xy;
    float dr = pr.y - pr.x, a = dot(dc, dc) - dr * dr, b = dot(q, dc) + pr.x * dr, c = dot(q, q) - pr.x * pr.x;
    if (abs(a) < 1e-6) t = b != 0.0 ? c / (2.0 * b) : 0.0;
    else { float D = b * b - a * c; if (D < 0.0) return vec4(0.0); float r = sqrt(D); t = (b + r) / a; if (pr.x + t * dr < 0.0) t = (b - r) / a; }
  } else {
    vec2 d = pl.zw - pl.xy;
    t = dot(d, d) > 0.0 ? dot(p - pl.xy, d) / dot(d, d) : 0.0;
  }
  if (t <= po[0]) return pc[0];
  vec4 c = pc[0];
  for (int i = 1; i < 16; i++) {
    if (i >= pn) break;
    float a = po[i - 1], b = po[i];
    if (t <= b) return mix(pc[i - 1], pc[i], b > a ? (t - a) / (b - a) : 1.0);
    c = pc[i];
  }
  return c;
}`;
const SEG_VS = `#version 300 es
layout(location = 0) in vec4 seg;    // a.xy, b.xy (device px, y down)
layout(location = 1) in vec2 sf;     // the distance along the path at a (device px); the ends' flags (1: a starts a piece, 2: b ends one)
uniform vec2 res;
uniform float hw;                    // half the line's width (device px)
out vec2 vP;
flat out vec2 vA, vB;
flat out vec2 vSF;
void main() {
  vec2 a = seg.xy, b = seg.zw, d = b - a;
  float L = length(d);
  vec2 t = L > 1e-4 ? d / L : vec2(1.0, 0.0), n = vec2(-t.y, t.x);
  float e = hw + 1.0;
  int id = gl_VertexID;
  vec2 p = (id < 2 ? a - t * e : b + t * e) + n * e * ((id == 0 || id == 2) ? -1.0 : 1.0);
  vP = p; vA = a; vB = b; vSF = sf;
  gl_Position = vec4(p.x / res.x * 2.0 - 1.0, 1.0 - p.y / res.y * 2.0, 0.0, 1.0);
}`;
const SEG_FS = `#version 300 es
precision highp float;
uniform float hw;
uniform vec3 dash;                   // on, off (device px; on 0: solid), the pattern's offset (device px)
uniform int cap;                     // 1: round ends, 0: butt ends
in vec2 vP;
flat in vec2 vA, vB;
flat in vec2 vSF;
out vec4 o;
void main() {
  vec2 d = vB - vA;
  float L2 = dot(d, d), L = sqrt(L2);
  float hu = L2 > 0.0 ? dot(vP - vA, d) / L2 : 0.0, h = clamp(hu, 0.0, 1.0);
  float perp = length(vP - vA - d * h);
  int f = int(vSF.y + 0.5);
  // (Butt ends: nothing past a piece's own two ends; inside a piece the segments meet round, as the charts join them.)
  if (cap == 0 && ((hu < 0.0 && (f & 1) != 0) || (hu > 1.0 && (f & 2) != 0))) discard;
  float dist = perp;
  if (dash.x > 0.0) {
    float P = dash.x + dash.y, u = vSF.x + dash.z + hu * L, m = mod(u, P);
    if (cap == 1) { float g = m <= dash.x ? 0.0 : min(m - dash.x, P - m); dist = length(vec2(g, perp)); }
    else if (m > dash.x) discard;
  }
  float a = clamp(hw - dist + 0.5, 0.0, 1.0);
  if (a <= 0.0) discard;
  o = vec4(a, 0.0, 0.0, a);
}`;
const QUAD_VS = `#version 300 es
layout(location = 0) in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
const COMP_FS = `#version 300 es
precision highp float;
uniform sampler2D cov;
uniform vec2 res;
uniform float k, ga;
${PAINT}
out vec4 o;
void main() {
  vec2 p = vec2(gl_FragCoord.x, res.y - gl_FragCoord.y) / k;
  o = paint(p) * ga * texelFetch(cov, ivec2(gl_FragCoord.xy), 0).r;
}`;
const FILL_VS = `#version 300 es
layout(location = 0) in vec2 p;      // CSS px
uniform vec2 res;
uniform float k;
out vec2 vP;
void main() {
  vec2 q = p * k;
  vP = p;
  gl_Position = vec4(q.x / res.x * 2.0 - 1.0, 1.0 - q.y / res.y * 2.0, 0.0, 1.0);
}`;
const FILL_FS = `#version 300 es
precision highp float;
uniform float ga;
${PAINT}
in vec2 vP;
out vec4 o;
void main() { o = paint(vP) * ga; }`;
// A rounded box: x, y, w, h (CSS px); radius, edge width (a negative width: a soft shadow that fades over that many px); fill, edge.
const BOX_VS = `#version 300 es
layout(location = 0) in vec4 r;
layout(location = 1) in vec2 rs;
layout(location = 2) in vec4 fc;
layout(location = 3) in vec4 sc;
uniform vec2 res;
uniform float k;
out vec2 vP;
flat out vec4 vR;
flat out vec2 vRs;
flat out vec4 vF, vS;
void main() {
  int id = gl_VertexID;
  float e = abs(rs.y) + 1.5 / k;
  vec2 c = vec2(id == 1 || id == 3 ? r.x + r.z + e : r.x - e, id >= 2 ? r.y + r.w + e : r.y - e);
  vP = c; vR = r; vRs = rs; vF = fc; vS = sc;
  vec2 q = c * k;
  gl_Position = vec4(q.x / res.x * 2.0 - 1.0, 1.0 - q.y / res.y * 2.0, 0.0, 1.0);
}`;
const BOX_FS = `#version 300 es
precision highp float;
uniform float k;
in vec2 vP;
flat in vec4 vR;
flat in vec2 vRs;
flat in vec4 vF, vS;
out vec4 o;
void main() {
  vec2 h = vR.zw * 0.5, c = vR.xy + h;
  float rr = min(vRs.x, min(h.x, h.y));
  vec2 q = abs(vP - c) - h + rr;
  float d = (length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rr) * k;   // device px, < 0 inside
  if (vRs.y < 0.0) { float b = -vRs.y * k; o = vF * (1.0 - smoothstep(-b, b, d)); if (o.a <= 0.0) discard; return; }
  float af = clamp(0.5 - d, 0.0, 1.0);
  float sw = vRs.y * k;
  float as = sw > 0.0 ? clamp(sw * 0.5 - abs(d) + 0.5, 0.0, 1.0) : 0.0;
  o = vF * af * (1.0 - as) + vS * as;
  if (o.a <= 0.0) discard;
}`;
// A picture (a texture: a canvas or an ImageData, uploaded once per version) laid in a box (CSS px), faded by ga.
const IMG_VS = `#version 300 es
layout(location = 0) in vec2 p;      // 0..1 over the box
uniform vec2 res;
uniform float k;
uniform vec4 box;                    // x, y, w, h (CSS px)
out vec2 vT;
void main() {
  vT = p;
  vec2 q = (box.xy + box.zw * p) * k;
  gl_Position = vec4(q.x / res.x * 2.0 - 1.0, 1.0 - q.y / res.y * 2.0, 0.0, 1.0);
}`;
const IMG_FS = `#version 300 es
precision highp float;
uniform sampler2D img;
uniform float ga;
in vec2 vT;
out vec4 o;
void main() { o = texture(img, vT) * ga; }`;
// Text: the atlas's picture (its alpha) copied texel for texel to the canvas's pixels, tinted.
// (floats per glyph: its box, its atlas box, its tint, its scale and outline, its turn)
const TS = 18;
const TEXT_VS = `#version 300 es
layout(location = 0) in vec4 dst;    // x, y, w, h (device px)
layout(location = 1) in vec4 src;    // the glyph's box in the atlas (texels)
layout(location = 2) in vec4 tc;     // premultiplied
layout(location = 3) in vec2 sk;     // device px per atlas px; an outline's half width (device px; 0: the glyph itself)
layout(location = 4) in vec4 rot;    // words turned about (rot.xy) (device px) by the angle whose cos, sin are rot.zw
uniform vec2 res, asz;
out vec2 vT;
flat out vec4 vC;
flat out vec2 vK;
void main() {
  int id = gl_VertexID;
  vec2 f = vec2(id == 1 || id == 3 ? 1.0 : 0.0, id >= 2 ? 1.0 : 0.0);
  vec2 q = dst.xy + dst.zw * f - rot.xy;
  q = rot.xy + vec2(q.x * rot.z - q.y * rot.w, q.x * rot.w + q.y * rot.z);
  vT = (src.xy + src.zw * f) / asz;
  vC = tc; vK = sk;
  gl_Position = vec4(q.x / res.x * 2.0 - 1.0, 1.0 - q.y / res.y * 2.0, 0.0, 1.0);
}`;
// The glyph's distance from its edge, in device px, from the atlas's field; its coverage as the 2D canvas's antialiased edge (half a pixel
// each side), or an outline's (strokeText's) as wide as the stroke.
const TEXT_FS = `#version 300 es
precision highp float;
uniform sampler2D atlas;
uniform vec2 sdf;                    // the field's radius and cutoff (atlas px)
in vec2 vT;
flat in vec4 vC;
flat in vec2 vK;
out vec4 o;
void main() {
  float v = texture(atlas, vT).r;
  float d = (1.0 - sdf.y - v) * sdf.x * vK.x;   // device px, < 0 inside
  float a = vK.y > 0.0 ? clamp(vK.y - d + 0.5, 0.0, 1.0) : clamp(0.5 - d, 0.0, 1.0);
  if (a <= 0.0) discard;
  o = vC * a;
}`;

// The glyphs' field, decoded once for every chart (an image, no canvas).
let glyphImage = null;
// (A chart that drew on its own canvas while the field was still decoding is drawn again on the GPU once it is in.)
const waiting = new Set();
if (typeof Image === 'function') { const im = new Image(); im.decoding = 'async'; im.onload = () => { glyphImage = im; for (const f of [...waiting]) f(); waiting.clear(); }; im.src = ATLAS_PNG; }

// A CSS colour as [r, g, b, a] (0–1, not premultiplied), read by hand (no canvas): #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba() in either
// syntax, color(srgb …), the few names the app writes, and color-mix(in srgb, a p%, b q%) of any of those. Cached per string.
const colours = new Map();
const NAMED = { transparent: [0, 0, 0, 0], white: [1, 1, 1, 1], black: [0, 0, 0, 1], red: [1, 0, 0, 1] };
const num = (t, scale) => (t.endsWith('%') ? parseFloat(t) / 100 : parseFloat(t) / scale);
// (the arguments of a function, split at top-level commas)
const args = (t) => { const out = []; let d = 0, cur = ''; for (const ch of t) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; };
export function parseColour(c) {
  c = String(c ?? '').trim().toLowerCase();
  let v = colours.get(c);
  if (v) return v;
  v = [0, 0, 0, 0];
  let m;
  if (NAMED[c]) v = NAMED[c];
  else if ((m = /^#([\da-f]{3,8})$/.exec(c))) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((x) => x + x).join('');
    const n = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
    v = [n(0), n(2), n(4), h.length >= 8 ? n(6) : 1];
  } else if ((m = /^rgba?\((.*)\)$/.exec(c))) {
    const [rgb, al] = m[1].includes('/') ? m[1].split('/') : [m[1], null];
    const q = rgb.split(/[\s,]+/).filter(Boolean);
    const a = al != null ? num(al.trim(), 1) : q[3] != null ? num(q[3], 1) : 1;
    v = [num(q[0], 255), num(q[1], 255), num(q[2], 255), a];
  } else if ((m = /^color\(srgb\s+([^)]*)\)$/.exec(c))) {
    const [rgb, al] = m[1].split('/');
    const q = rgb.trim().split(/\s+/).map((x) => num(x, 1));
    v = [q[0], q[1], q[2], al == null ? 1 : num(al.trim(), 1)];
  } else if ((m = /^color-mix\(in srgb,(.*)\)$/.exec(c))) {
    const [A, B] = args(m[1]).map((t) => { const p = /\s([\d.]+%)$/.exec(t); return { c: parseColour(p ? t.slice(0, p.index) : t), p: p ? parseFloat(p[1]) / 100 : null }; });
    if (A && B) {
      let pa = A.p ?? (B.p != null ? 1 - B.p : 0.5), pb = B.p ?? 1 - pa;
      const sum = pa + pb, scale = sum < 1 ? sum : 1; pa /= sum || 1; pb /= sum || 1;
      // (mixed premultiplied, as CSS mixes)
      const a = A.c[3] * pa + B.c[3] * pb;
      v = a > 0 ? [0, 1, 2].map((i) => (A.c[i] * A.c[3] * pa + B.c[i] * B.c[3] * pb) / a).concat(a * scale) : [0, 0, 0, 0];
    }
  }
  v = v.map((x) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0));
  if (colours.size > 512) colours.clear();
  colours.set(c, v);
  return v;
}
const rgba = parseColour;
const premul = (c, alpha = 1) => { const v = rgba(c), a = v[3] * alpha; return [v[0] * a, v[1] * a, v[2] * a, a]; };

/** The GPU drawer for one chart, over `host` (the chart's 2D canvas), or null where it cannot be (the 2D canvas draws the chart). */
export function createTraceGL(host, { search = globalThis.location?.search, redraw = null, under = null } = {}) {
  // (canvasSize never measures: a chart drawn before the observer reported its box drew nothing, and draws again once it has one,
  // with or without this drawer)
  if (redraw && host && typeof ResizeObserver !== 'undefined') onCanvasSized(host, redraw);
  if (typeof document === 'undefined' || traceGLOff(search)) return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'trace-gl';
  canvas.style.pointerEvents = 'none';
  let gl = null, glCanvas = canvas, shown = null;
  const shared = !ctxShareOff(search) ? sharedGL() : null;
  if (shared) {
    try { shown = canvas.getContext('bitmaprenderer'); } catch { shown = null; }
    if (shown) { gl = shared.gl; glCanvas = shared.canvas; }
  }
  if (!gl) try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: true, preserveDrawingBuffer: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true }); } catch { gl = null; }
  if (!gl || typeof gl.createShader !== 'function' || typeof host?.after !== 'function') return null;
  const loser = shown ? null : gl.getExtension('WEBGL_lose_context');   // (the shared context is never given back: every chart draws in it)   // (kept now: a lost context gives no extensions)
  // (A software renderer draws it too: a chart is a few hundred small shapes, well within one.)

  let lost = false, dead = false, failed = false, missed = false, parked = false, back = false, gen = 0;   // (missed: a frame asked for the GPU while it could not draw)
  glCanvas.addEventListener?.('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
  let P = null, started = null, stopPoll = null;
  let quad = null, quadVao = null, segBuf = null, segVao = null, fillBuf = null, fillVao = null, boxBuf = null, boxVao = null, textBuf = null, textVao = null;
  let covTex = null, fbo = null, covW = 0, covH = 0, atlasTex = null, atlasIn = false, unitBuf = null, unitVao = null;
  const images = new Map();   // (a picture's key → { tex, ver }: textures kept from frame to frame, a few at most)
  const SRC = { seg: [SEG_VS, SEG_FS], comp: [QUAD_VS, COMP_FS], fill: [FILL_VS, FILL_FS], box: [BOX_VS, BOX_FS], text: [TEXT_VS, TEXT_FS], img: [IMG_VS, IMG_FS] };
  const PU = ['pc', 'po', 'pl', 'pn', 'ga', 'pr', 'pk', 'pm'];
  const UN = { seg: ['res', 'hw', 'dash', 'cap'], comp: ['cov', 'res', 'k', ...PU], fill: ['res', 'k', ...PU], box: ['res', 'k'], text: ['res', 'asz', 'atlas', 'sdf'], img: ['res', 'k', 'box', 'img', 'ga'] };

  function build() {
    P = null; failed = false; covW = covH = 0; gen++;
    // (Shared: the programs compiled once for every chart; each chart only finds its uniforms.)
    if (shown && !shared.started) shared.started = Object.fromEntries(Object.entries(SRC).map(([k, [vs, fs]]) => [k, startProgram(gl, vs, fs)]));
    started = shown ? shared.started : Object.fromEntries(Object.entries(SRC).map(([k, [vs, fs]]) => [k, startProgram(gl, vs, fs)]));
    quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    quadVao = gl.createVertexArray(); gl.bindVertexArray(quadVao);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    segBuf = gl.createBuffer(); segVao = gl.createVertexArray(); gl.bindVertexArray(segVao); gl.bindBuffer(gl.ARRAY_BUFFER, segBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 24, 0); gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 16); gl.vertexAttribDivisor(1, 1);
    fillBuf = gl.createBuffer(); fillVao = gl.createVertexArray(); gl.bindVertexArray(fillVao); gl.bindBuffer(gl.ARRAY_BUFFER, fillBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    boxBuf = gl.createBuffer(); boxVao = gl.createVertexArray(); gl.bindVertexArray(boxVao); gl.bindBuffer(gl.ARRAY_BUFFER, boxBuf);
    for (const [i, n, off] of [[0, 4, 0], [1, 2, 16], [2, 4, 24], [3, 4, 40]]) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, n, gl.FLOAT, false, 56, off); gl.vertexAttribDivisor(i, 1); }
    textBuf = gl.createBuffer(); textVao = gl.createVertexArray(); gl.bindVertexArray(textVao); gl.bindBuffer(gl.ARRAY_BUFFER, textBuf);
    for (const [i, n, off] of [[0, 4, 0], [1, 4, 16], [2, 4, 32], [3, 2, 48], [4, 4, 56]]) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, n, gl.FLOAT, false, TS * 4, off); gl.vertexAttribDivisor(i, 1); }
    gl.bindVertexArray(null);
    unitBuf = gl.createBuffer(); unitVao = gl.createVertexArray(); gl.bindVertexArray(unitVao); gl.bindBuffer(gl.ARRAY_BUFFER, unitBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    images.clear();
    covTex = gl.createTexture(); fbo = gl.createFramebuffer();
    if (shown && shared.atlasTex) atlasTex = shared.atlasTex;
    else {
      atlasTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      if (shown) { shared.atlasTex = atlasTex; shared.atlasIn = false; }
    }
    // (The glyphs' field goes up once, from the decoded PNG, when the context is made or made again; 1 MB, never in a frame of motion.)
    atlasIn = false;
    stopPoll?.(); stopPoll = publishWhenDone(gl, Object.values(started), publish);
  }
  function publish() {
    if (P || failed || gl.isContextLost()) return;
    try {
      const out = {};
      for (const k of Object.keys(SRC)) { const p = checkProgram(gl, started[k]); out[k] = { p, u: Object.fromEntries(UN[k].map((n) => [n, gl.getUniformLocation(p, n)])) }; }
      exerciseDraw(gl, () => {
        gl.bindVertexArray(quadVao);
        for (const k of ['fill', 'comp']) { gl.useProgram(out[k].p); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
        gl.bindVertexArray(null);
      });
      P = out; lost = false;
      // (A frame that came while the GPU could not draw (still compiling, or the context lost or parked and now built again) drew nothing:
      // the chart draws again now, at once, rather than at its next change.)
      if ((missed || back) && redraw && !dead) { missed = back = false; try { redraw(); } catch (e2) { console.warn('Charts on the GPU: the redraw failed.', e2); } }
      back = false;
    } catch (e) {
      if (gl.isContextLost()) { P = null; return; }
      failed = true; console.warn('Charts on the GPU: shader failed; the chart is not drawn.', e);
    }
  }
  try { build(); } catch (e) { console.warn('Charts on the GPU: could not start; the chart is not drawn.', e); gl.getExtension('WEBGL_lose_context')?.loseContext(); return null; }
  glCanvas.addEventListener?.('webglcontextrestored', () => {
    if (dead) return;
    try { build(); } catch (e) { failed = true; console.warn('Charts on the GPU: could not be rebuilt; the chart is not drawn.', e); }
  });
  host.after(canvas);
  // (Parking: the context is given back while the chart is off the screen, display:none included, and taken again as it comes near.)
  let parkT = 0, seen = null;
  if (loser && !ctxParkOff(search) && typeof IntersectionObserver === 'function') {
    seen = new IntersectionObserver((es) => {
      if (dead) return;
      const on = es[es.length - 1].isIntersecting;
      clearTimeout(parkT); parkT = 0;
      if (on) { if (parked) { parked = false; back = true; loser.restoreContext(); } }
      else if (!parked) parkT = setTimeout(() => { parkT = 0; if (dead || parked) return; parked = true; stopPoll?.(); loser.loseContext(); }, PARK_MS);
    }, { rootMargin: '50%' });
    seen.observe(host);
  }

  // ── A frame ──
  let W = 1, H = 1, K = 1, clipR = null, inFrame = false;
  let segData = new Float32Array(6144), fillData = new Float32Array(4096);
  let textData = new Float32Array(18 * 32), textN = 0, boxData = new Float32Array(560), boxN = 0;
  const grow = (a, n) => { if (a.length >= n) return a; let m = a.length; while (m < n) m *= 2; const b = new Float32Array(m); b.set(a); return b; };
  function scissor(r) {
    if (!r) { gl.disable(gl.SCISSOR_TEST); return true; }
    const x0 = Math.max(0, Math.floor(r[0] * K)), y0 = Math.max(0, Math.floor(r[1] * K)), x1 = Math.min(W, Math.ceil((r[0] + r[2]) * K)), y1 = Math.min(H, Math.ceil((r[1] + r[3]) * K));
    if (x1 <= x0 || y1 <= y0) return false;
    gl.enable(gl.SCISSOR_TEST); gl.scissor(x0, H - y1, x1 - x0, y1 - y0);
    return true;
  }
  const inter = (r) => {
    if (!clipR) return r;
    const x0 = Math.max(r[0], clipR[0]), y0 = Math.max(r[1], clipR[1]), x1 = Math.min(r[0] + r[2], clipR[0] + clipR[2]), y1 = Math.min(r[1] + r[3], clipR[1] + clipR[3]);
    return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : null;
  };
  // ── The clip by a path (the stencil's top bit; its low bits count a fill's windings) ──
  let clipOn = false;
  // (every draw onto the canvas passes only inside the clip)
  function clipState() {
    if (!clipOn) { gl.disable(gl.STENCIL_TEST); return; }
    gl.enable(gl.STENCIL_TEST); gl.stencilMask(0); gl.stencilFunc(gl.EQUAL, 0x80, 0x80); gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
  }
  // (the triangles of a path's pieces, as a fan from each piece's first point: their windings counted in the stencil's low bits)
  function fanData(pieces) {
    let n = 0;
    for (const p of pieces) if (p.length >= 6) n += (p.length / 2 - 2) * 3;
    if (!n) return 0;
    fillData = grow(fillData, Math.max(n * 2, 8));
    let m = 0;
    for (const p of pieces) {
      if (p.length < 6) continue;
      for (let i = 2; i + 3 < p.length; i += 2) { fillData[m++] = p[0]; fillData[m++] = p[1]; fillData[m++] = p[i]; fillData[m++] = p[i + 1]; fillData[m++] = p[i + 2]; fillData[m++] = p[i + 3]; }
    }
    return m;
  }
  const fullQuad = () => { fillData[0] = -1e5; fillData[1] = -1e5; fillData[2] = 1e5; fillData[3] = -1e5; fillData[4] = -1e5; fillData[5] = 1e5; fillData[6] = 1e5; fillData[7] = 1e5; gl.bufferData(gl.ARRAY_BUFFER, fillData.subarray(0, 8), gl.STREAM_DRAW); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
  /** The clip: the intersection of the paths in `stack` (each a list of pieces, CSS px), filled by the nonzero rule; [] for none. */
  function clipPaths(stack) {
    flush();
    if (!stack || !stack.length) { clipOn = false; gl.disable(gl.STENCIL_TEST); return; }
    gl.disable(gl.SCISSOR_TEST);
    gl.stencilMask(0xff); gl.clearStencil(0); gl.clear(gl.STENCIL_BUFFER_BIT);
    gl.enable(gl.STENCIL_TEST); gl.colorMask(false, false, false, false);
    gl.useProgram(P.fill.p); gl.uniform2f(P.fill.u.res, W, H); gl.uniform1f(P.fill.u.k, K);
    gl.bindVertexArray(fillVao); gl.bindBuffer(gl.ARRAY_BUFFER, fillBuf);
    stack.forEach((pieces, i) => {
      const m = fanData(pieces);
      // (its windings counted in the low bits, within the clip so far)
      gl.stencilMask(0x7f);
      if (i) gl.stencilFunc(gl.EQUAL, 0x80, 0x80); else gl.stencilFunc(gl.ALWAYS, 0, 0);
      gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP); gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP);
      if (m) { gl.bufferData(gl.ARRAY_BUFFER, fillData.subarray(0, m), gl.STREAM_DRAW); gl.drawArrays(gl.TRIANGLES, 0, m / 2); }
      gl.stencilMask(0xff);
      // (in the clip so far but outside this path: out)
      if (i) { gl.stencilFunc(gl.EQUAL, 0x80, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.ZERO); fullQuad(); }
      // (inside it: in, its count cleared; the reference is 0x80, its low bits 0, so the test is "a count")
      gl.stencilFunc(gl.NOTEQUAL, 0x80, 0x7f); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE); fullQuad();
    });
    gl.colorMask(true, true, true, true);
    clipOn = true; clipState();
  }
  function flush() {
    if (textN) {
      if (scissor(clipR)) {
        gl.useProgram(P.text.p);
        gl.uniform2f(P.text.u.res, W, H); gl.uniform2f(P.text.u.asz, ATLAS_W, ATLAS_H); gl.uniform2f(P.text.u.sdf, RADIUS, CUTOFF);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, atlasTex); gl.uniform1i(P.text.u.atlas, 0);
        gl.bindVertexArray(textVao); gl.bindBuffer(gl.ARRAY_BUFFER, textBuf);
        gl.bufferData(gl.ARRAY_BUFFER, textData.subarray(0, textN * TS), gl.STREAM_DRAW);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, textN);
      }
      textN = 0;
    }
    if (boxN) {
      if (scissor(clipR)) {
        gl.useProgram(P.box.p);
        gl.uniform2f(P.box.u.res, W, H); gl.uniform1f(P.box.u.k, K);
        gl.bindVertexArray(boxVao); gl.bindBuffer(gl.ARRAY_BUFFER, boxBuf);
        gl.bufferData(gl.ARRAY_BUFFER, boxData.subarray(0, boxN * 14), gl.STREAM_DRAW);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, boxN);
      }
      boxN = 0;
    }
  }
  // Paint uniforms: a colour string, or a gradient from the context ({ grad: [x0, y0, x1, y1], stops: [[offset, colour], …] }).
  const ID3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  function setPaint(u, style, alpha) {
    if (style && (style.grad || style.rad)) {
      const st = style.stops.slice().sort((a, b) => a[0] - b[0]).slice(0, 16);
      if (st.length) {
        const pc = new Float32Array(64), po = new Float32Array(16);
        st.forEach(([o, c], i) => { pc.set(premul(c), i * 4); po[i] = o; });
        gl.uniform4fv(u.pc, pc); gl.uniform1fv(u.po, po); gl.uniform1i(u.pn, st.length); gl.uniform1f(u.ga, alpha);
        if (style.rad) { const r = style.rad; gl.uniform4f(u.pl, r[0], r[1], r[3], r[4]); gl.uniform2f(u.pr, r[2], r[5]); gl.uniform1i(u.pk, 1); }
        else { gl.uniform4fv(u.pl, style.grad); gl.uniform1i(u.pk, 0); }
        // (the gradient lies in the space it was filled under: inv maps the page's px back to it)
        const m = style.inv;
        gl.uniformMatrix3fv(u.pm, false, m ? new Float32Array([m[0], m[1], 0, m[2], m[3], 0, m[4], m[5], 1]) : ID3);
        return;
      }
    }
    const pc = new Float32Array(64); pc.set(premul(typeof style === 'string' ? style : 'transparent'));
    gl.uniform4fv(u.pc, pc); gl.uniform1i(u.pn, 1); gl.uniform1f(u.ga, alpha);
  }
  function coverTarget() {
    if (covW !== W || covH !== H) {
      gl.bindTexture(gl.TEXTURE_2D, covTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, covTex, 0);
      covW = W; covH = H;
    }
  }

  const api = {
    canvas,
    get ready() {
      missed = false;   // (published here, the frame asking draws it: no second draw from publish)
      publish();
      if (!glyphImage && redraw && !dead) waiting.add(redraw);
      if (!P || lost || failed || dead || gl.isContextLost() || !glyphImage) return false;
      if (shown && shared.atlasIn) atlasIn = true;
      if (!atlasIn) {
        if (shown) shared.atlasIn = true;
        gl.bindTexture(gl.TEXTURE_2D, atlasTex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, ATLAS_W, ATLAS_H, 0, gl.RED, gl.UNSIGNED_BYTE, glyphImage);
        atlasIn = true;
      }
      return true;
    },
    /** Starts a frame over a chart w × h CSS px, drawn at Wd × Hd device px. False: the GPU cannot draw now (the 2D canvas draws the chart). */
    begin(w, h, Wd, Hd) {
      if (!api.ready || w < 1 || h < 1) { api.hide(); return false; }
      if (shown) {
        // (Another chart's frame still open in the shared context is finished first: its picture handed over before this one starts.)
        if (shared.active && shared.active !== api) shared.active.end();
        shared.active = api;
        if (glCanvas.width !== Wd || glCanvas.height !== Hd) { glCanvas.width = Wd; glCanvas.height = Hd; }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindVertexArray(null); gl.useProgram(null);
        gl.clearStencil(0); gl.stencilMask(0xff);
      }
      if (canvas.width !== Wd || canvas.height !== Hd) { canvas.width = Wd; canvas.height = Hd; }
      W = Wd; H = Hd; K = Wd / w;
      gl.viewport(0, 0, W, H);
      gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST);
      gl.clearColor(0, 0, 0, 0); gl.clear(shown ? gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT : gl.COLOR_BUFFER_BIT);
      if (under) {
        // (A picture of the chart's own drawn first in this context, under the words: gen changes when the context is made again,
        // so its programs and textures are made again.)
        try { under(gl, W, H, gen); } catch (e) { console.warn('Charts on the GPU: the picture under the chart failed.', e); }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindVertexArray(null); gl.useProgram(null); gl.activeTexture(gl.TEXTURE0);
        gl.viewport(0, 0, W, H); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      }
      gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      clipR = null; clipOn = false; inFrame = true; textN = boxN = 0;
      return true;
    },
    /** Ends the frame (what is batched is drawn) and shows the GPU's picture in place of the 2D canvas's. */
    end() {
      if (!inFrame) return;
      flush(); gl.bindVertexArray(null); inFrame = false;
      if (shown) {
        if (shared.active === api) shared.active = null;
        try { shown.transferFromImageBitmap(glCanvas.transferToImageBitmap()); } catch (e) { console.warn('Charts on the GPU: the picture could not be handed over.', e); }
      }
      if (canvas.style.visibility) canvas.style.visibility = '';
      if (host.style.opacity !== '0') host.style.opacity = '0';
    },
    /** The 2D canvas draws the chart (shown again); the GPU's picture is hidden. */
    hide() {
      if (canvas.style.visibility !== 'hidden') canvas.style.visibility = 'hidden';
      if (host.style.opacity) host.style.opacity = '';
    },
    clip(r) { flush(); clipR = r; },
    measure,
    /**
     * A stroke through pieces of line (CSS px): xs, ys (n points; a NaN starts a new piece). o: { alpha, paint (a colour or a gradient),
     * dash: [on, off] (CSS px), offset (CSS px), round: round ends (true) or butt }.
     */
    line(xs, ys, n, style, width, o = {}) {
      if (n < 2 || !(width > 0)) return;
      flush();
      segData = grow(segData, n * 6);
      let m = 0, s = 0, px = NaN, py = NaN, first = -1;
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (let i = 0; i < n; i++) {
        const x = xs[i] * K, y = ys[i] * K;
        if (x !== x || y !== y) { if (first >= 0) segData[first - 1] += 2; px = NaN; first = -1; continue; }
        if (px === px) {
          segData[m + 5] = first < 0 ? 1 : 0;
          segData[m] = px; segData[m + 1] = py; segData[m + 2] = x; segData[m + 3] = y; segData[m + 4] = s;
          m += 6;
          s += Math.hypot(x - px, y - py);
          first = m;
        }
        if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
        px = x; py = y;
      }
      if (first >= 0 && m) segData[m - 1] += 2;
      const count = m / 6;
      if (!count) return;
      const hw = (width * K) / 2, pad = hw + 2;
      const r = inter([(bx0 - pad) / K, (by0 - pad) / K, (bx1 - bx0 + 2 * pad) / K, (by1 - by0 + 2 * pad) / K]);
      if (!r) return;
      coverTarget();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      if (!scissor(r)) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); return; }
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(P.seg.p);
      gl.uniform2f(P.seg.u.res, W, H); gl.uniform1f(P.seg.u.hw, hw);
      const dash = o.dash && o.dash.length >= 2 && o.dash[0] + o.dash[1] > 0 ? o.dash : null;
      gl.uniform3f(P.seg.u.dash, dash ? Math.max(1e-3, dash[0]) * K : 0, dash ? dash[1] * K : 0, (o.offset || 0) * K);
      gl.uniform1i(P.seg.u.cap, o.round === false ? 0 : 1);
      gl.bindVertexArray(segVao); gl.bindBuffer(gl.ARRAY_BUFFER, segBuf);
      gl.bufferData(gl.ARRAY_BUFFER, segData.subarray(0, m), gl.STREAM_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(P.comp.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, covTex); gl.uniform1i(P.comp.u.cov, 0);
      gl.uniform2f(P.comp.u.res, W, H); gl.uniform1f(P.comp.u.k, K);
      setPaint(P.comp.u, style, o.alpha ?? 1);
      gl.bindVertexArray(quadVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    /** A path's pieces (each a flat [x, y, …] in CSS px) filled by the nonzero rule, as the 2D canvas fills a path. */
    poly(pieces, style, alpha = 1) {
      flush();
      let n = 0;
      for (const p of pieces) if (p.length >= 6) n += (p.length / 2 - 2) * 3;
      if (!n) return;
      fillData = grow(fillData, n * 2);
      let m = 0, bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (const p of pieces) {
        if (p.length < 6) continue;
        for (let i = 0; i < p.length; i += 2) { const x = p[i], y = p[i + 1]; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
        for (let i = 2; i + 3 < p.length; i += 2) { fillData[m++] = p[0]; fillData[m++] = p[1]; fillData[m++] = p[i]; fillData[m++] = p[i + 1]; fillData[m++] = p[i + 2]; fillData[m++] = p[i + 3]; }
      }
      const r = inter([bx0 - 1, by0 - 1, bx1 - bx0 + 2, by1 - by0 + 2]);
      if (!r || !scissor(r)) return;
      gl.useProgram(P.fill.p);
      gl.uniform2f(P.fill.u.res, W, H); gl.uniform1f(P.fill.u.k, K);
      gl.bindVertexArray(fillVao); gl.bindBuffer(gl.ARRAY_BUFFER, fillBuf);
      // (A convex piece alone, three corners or a fan that never folds, needs no stencil: most fills in the charts are one.)
      // (the windings in the stencil's low bits, counted only inside the clip when there is one; its top bit is the clip's)
      gl.stencilMask(0x7f); gl.clearStencil(0); gl.clear(gl.STENCIL_BUFFER_BIT);
      gl.enable(gl.STENCIL_TEST);
      gl.colorMask(false, false, false, false);
      if (clipOn) gl.stencilFunc(gl.EQUAL, 0x80, 0x80); else gl.stencilFunc(gl.ALWAYS, 0, 0);
      gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP);
      gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP);
      gl.bufferData(gl.ARRAY_BUFFER, fillData.subarray(0, m), gl.STREAM_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, m / 2);
      gl.colorMask(true, true, true, true);
      gl.stencilMask(0);
      gl.stencilFunc(gl.NOTEQUAL, 0, 0x7f);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      fillData[0] = r[0]; fillData[1] = r[1]; fillData[2] = r[0] + r[2]; fillData[3] = r[1]; fillData[4] = r[0]; fillData[5] = r[1] + r[3]; fillData[6] = r[0] + r[2]; fillData[7] = r[1] + r[3];
      setPaint(P.fill.u, style, alpha);
      gl.bufferData(gl.ARRAY_BUFFER, fillData.subarray(0, 8), gl.STREAM_DRAW);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      clipState();
    },
    /** The clip: the intersection of these paths (each a list of pieces, CSS px; nonzero rule), or none ([]). */
    clipPaths,
    /**
     * A picture (a canvas, an image or an ImageData) in the box x, y, w, h (CSS px), faded by alpha. key names the texture it is kept in (the
     * source itself by default) and ver its content: it goes up to the GPU only when ver changes (a canvas drawn again: a new ver).
     */
    image(src, x, y, w, h, alpha = 1, key = src, ver = 0) {
      if (!(w > 0) || !(h > 0) || alpha <= 0) return;
      flush();
      // (src null: the picture already kept under key)
      const e = src ? api.upload(src, key, ver) : images.get(key);
      if (!e || !scissor(clipR)) return;
      gl.useProgram(P.img.p);
      gl.uniform2f(P.img.u.res, W, H); gl.uniform1f(P.img.u.k, K); gl.uniform4f(P.img.u.box, x, y, w, h); gl.uniform1f(P.img.u.ga, alpha);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, e.tex); gl.uniform1i(P.img.u.img, 0);
      gl.bindVertexArray(unitVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null);
    },
    /** A picture taken up as the texture kept under key, unless it holds this ver already (a canvas from another context: copied on the GPU).
     *  Returns its entry, or null where the drawer cannot draw now. */
    upload(src, key = src, ver = 0) {
      if (!P || lost || failed || dead || gl.isContextLost()) return null;
      let e = images.get(key);
      if (!e || e.ver !== ver || e.src !== src) {
        if (!e) {
          // (a few kept at most: the oldest let go)
          if (images.size >= 6) { const [k0, e0] = images.entries().next().value; gl.deleteTexture(e0.tex); images.delete(k0); }
          const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
          for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
          e = { tex }; images.set(key, e);
        }
        gl.bindTexture(gl.TEXTURE_2D, e.tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        e.ver = ver; e.src = src;
      }
      return e;
    },
    /** The picture kept under `from` kept on under `to` (its texture moved, nothing copied): a fade's old picture. */
    keepImage(from, to) {
      const e = images.get(from);
      if (!e) return false;
      const old = images.get(to);
      if (old && old !== e) gl.deleteTexture(old.tex);
      images.delete(from); images.set(to, e);
      return true;
    },
    /** Whether a picture is kept under key. */
    hasImage(key) { return images.has(key); },
    /** A rounded box (CSS px): its fill and, if `stroke`, its edge `sw` wide centred on the outline; a negative sw is a soft shadow that wide. */
    box(x, y, w, h, r, fill, stroke = null, sw = 0, alpha = 1) {
      if (textN) flush();
      if (!(w > 0) || !(h > 0)) {
        if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; }
        if (!(w > 0) || !(h > 0)) return;
      }
      boxData = grow(boxData, (boxN + 1) * 14);
      const f = typeof fill === 'string' ? premul(fill, alpha) : [0, 0, 0, 0], s = typeof stroke === 'string' && sw > 0 ? premul(stroke, alpha) : [0, 0, 0, 0], o = boxN * 14;
      boxData[o] = x; boxData[o + 1] = y; boxData[o + 2] = w; boxData[o + 3] = h; boxData[o + 4] = Math.max(0, r); boxData[o + 5] = sw < 0 ? sw : stroke ? sw : 0;
      boxData.set(f, o + 6); boxData.set(s, o + 10);
      boxN++;
    },
    /** Words at (x, y) (CSS px) in `font`, aligned as the 2D canvas aligns them. sw: the words' outline that wide instead of the words.
     *  turn: [ox, oy, angle] turns them about (ox, oy) (CSS px) by the angle (radians, clockwise on the page, as the 2D canvas's rotate). */
    text(str, x, y, font, color, align = 'left', base = 'alphabetic', alpha = 1, sw = 0, turn = null) {
      str = String(str);
      if (!str || typeof color !== 'string') return;
      if (boxN) flush();
      const tint = premul(color, alpha);
      if (tint[3] <= 0) return;
      const f = fontOf(font), g = GLYPHS[f.w], kw = KERN[f.w], s = f.px / BASE, sk = s * K;
      const width = measure(str, font);
      const rx = turn ? turn[0] * K : 0, ry = turn ? turn[1] * K : 0, rc = turn ? Math.cos(turn[2]) : 1, rs = turn ? Math.sin(turn[2]) : 0;
      let cx = align === 'right' || align === 'end' ? x - width : align === 'center' ? x - width / 2 : x;
      const by = y + (BASELINES[f.w][base] ?? 0) * f.px;
      textData = grow(textData, (textN + str.length) * TS);
      let prev = '';
      for (const ch of str) {
        const e = g[ch] || g['?'];
        if (prev) cx += (kw[prev + ch] || 0) * f.px;
        if (ch !== ' ') {
          const o = textN * TS;
          textData[o] = (cx - e[5] * s) * K; textData[o + 1] = (by - e[6] * s) * K; textData[o + 2] = e[3] * sk; textData[o + 3] = e[4] * sk;
          textData[o + 4] = e[1]; textData[o + 5] = e[2]; textData[o + 6] = e[3]; textData[o + 7] = e[4];
          textData.set(tint, o + 8);
          textData[o + 12] = sk; textData[o + 13] = sw ? (sw / 2) * K : 0;
          textData[o + 14] = rx; textData[o + 15] = ry; textData[o + 16] = rc; textData[o + 17] = rs;
          textN++;
        }
        cx += e[0] * f.px;
        prev = ch;
      }
    },
    /**
     * A 2D context for the chart's own drawing code, w × h CSS px at Wd × Hd device px, drawn by the GPU; null where it cannot draw now
     * (the chart then takes fitCanvas's pen, which draws nothing, and is drawn again once the GPU can). The frame ends with the context's end().
     */
    ctx2d(w, h, Wd, Hd) {
      if (!api.begin(w, h, Wd, Hd)) { missed = true; return null; }
      return shim.reset(K);
    },
    get lost() { return (lost && !parked && !back) || failed; },   // (a parked chart is not lost: it draws again on its return)
    /** True while the chart is off the screen and its context given back (drawn again by redraw when it returns). */
    get parked() { return parked; },
    dispose() {
      dead = true; stopPoll?.(); clearTimeout(parkT); seen?.disconnect();
      try {
        for (const b of [quad, segBuf, fillBuf, boxBuf, textBuf, unitBuf]) gl.deleteBuffer(b);
        for (const v of [quadVao, segVao, fillVao, boxVao, textVao, unitVao]) gl.deleteVertexArray(v);
        for (const e of images.values()) gl.deleteTexture(e.tex);
        images.clear();
        gl.deleteTexture(covTex); if (!shown) gl.deleteTexture(atlasTex); gl.deleteFramebuffer(fbo);
        if (P && !shown) for (const k of Object.keys(P)) gl.deleteProgram(P[k].p);   // (shared: the programs and the field stay for the others)
      } catch { /* a lost context holds nothing */ }
      if (shown && shared.active === api) shared.active = null;
      canvas.width = canvas.height = 0;
      if (!gl.isContextLost()) loser?.loseContext();
      canvas.remove();
      host.style.opacity = '';
    },
  };
  const shim = createShim(api);
  return api;
}

// ── The 2D context the charts draw through ──
// The subset of CanvasRenderingContext2D the charts and monitors use, with its state, turned into the drawer's GPU draws. A path is kept as
// pieces of line (an arc or a curve as short chords) plus the shapes it is made of whole (a rectangle, a rounded box, a circle), so a fill
// of one of those draws it as a shape with a soft edge, and anything else by the stencil.
function createShim(G) {
  const TAU = Math.PI * 2;
  let st, stack, K = 1;
  // (only: the path is made of whole shapes and nothing else; lx, ly: the path's last point in the drawing's own space)
  let pieces = [], cur = null, shapes = [], only = true, lx = 0, ly = 0;
  let sx = new Float32Array(1024), sy = new Float32Array(1024);   // (a stroke's points, kept from frame to frame)
  const fresh = () => ({ fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic', globalAlpha: 1, dash: [], lineDashOffset: 0, clip: null, clips: null, m: null });   // colour-exempt: the 2D canvas's own defaults
  // The transform (m: [a, b, c, d, e, f], null for none), as the 2D canvas's, over the drawer's own device scale. Paths are kept on the page.
  const X = (x, y) => (st.m ? st.m[0] * x + st.m[2] * y + st.m[4] : x), Y = (x, y) => (st.m ? st.m[1] * x + st.m[3] * y + st.m[5] : y);
  const moved = () => !st.m || (st.m[0] === 1 && st.m[1] === 0 && st.m[2] === 0 && st.m[3] === 1);   // (no turn or scale: shapes stay shapes)
  const ox = () => (st.m ? st.m[4] : 0), oy = () => (st.m ? st.m[5] : 0);
  const startPiece = (x, y) => { lx = x; ly = y; cur = [X(x, y), Y(x, y)]; pieces.push(cur); };
  const add = (x, y) => { if (!cur) { startPiece(x, y); return; } lx = x; ly = y; cur.push(X(x, y), Y(x, y)); };
  const sc = () => (st.m ? Math.sqrt(Math.abs(st.m[0] * st.m[3] - st.m[1] * st.m[2])) || 1 : 1);
  const ellPts = (cx, cy, rx, ry, rot, a0, a1, ccw) => {
    let sweep = a1 - a0;
    if (!ccw && sweep < 0) sweep = (sweep % TAU) + TAU; if (ccw && sweep > 0) sweep = (sweep % TAU) - TAU;
    if (Math.abs(a1 - a0) >= TAU) sweep = ccw ? -TAU : TAU;
    const n = Math.max(2, Math.ceil((Math.abs(sweep) * Math.max(1, Math.max(rx, ry) * K * sc())) / 3));
    const cr = Math.cos(rot), sr = Math.sin(rot);
    for (let i = 0; i <= n; i++) { const a = a0 + (sweep * i) / n, u = rx * Math.cos(a), v = ry * Math.sin(a); add(cx + u * cr - v * sr, cy + u * sr + v * cr); }
  };
  const arcPts = (cx, cy, r, a0, a1, ccw) => ellPts(cx, cy, r, r, 0, a0, a1, ccw);
  const align = () => (st.textAlign === 'end' ? 'right' : st.textAlign === 'start' ? 'left' : st.textAlign);
  // (a gradient as it is filled: in the space of the transform it is filled under)
  const inv = () => {
    if (!st.m) return null;
    const [a, b, c0, d, e, f] = st.m, det = a * d - b * c0 || 1;
    return [d / det, -b / det, -c0 / det, a / det, (c0 * f - d * e) / det, (b * e - a * f) / det];
  };
  const paintOf = (style) => (typeof style === 'string' ? style : style && style.stops ? { ...style, inv: inv() } : 'transparent');
  const c = {
    gpu: G,
    onGPU: true,   // (what a chart asks to know it draws through this; a real context has no such field)
    canvas: null,
    reset(k) { K = k; st = fresh(); stack = []; pieces = []; cur = null; shapes = []; only = true; return c; },
    end() { G.end(); },
    get fillStyle() { return st.fillStyle; }, set fillStyle(v) { st.fillStyle = v; },
    get strokeStyle() { return st.strokeStyle; }, set strokeStyle(v) { st.strokeStyle = v; },
    get lineWidth() { return st.lineWidth; }, set lineWidth(v) { if (v > 0) st.lineWidth = v; },
    get lineCap() { return st.lineCap; }, set lineCap(v) { st.lineCap = v; },
    get lineJoin() { return st.lineJoin; }, set lineJoin(v) { st.lineJoin = v; },
    get font() { return st.font; }, set font(v) { st.font = v; },
    get textAlign() { return st.textAlign; }, set textAlign(v) { st.textAlign = v; },
    get textBaseline() { return st.textBaseline; }, set textBaseline(v) { st.textBaseline = v; },
    get globalAlpha() { return st.globalAlpha; }, set globalAlpha(v) { if (v >= 0 && v <= 1) st.globalAlpha = v; },
    get lineDashOffset() { return st.lineDashOffset; }, set lineDashOffset(v) { st.lineDashOffset = v; },
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
    setLineDash(d) { st.dash = d.length % 2 ? [...d, ...d] : [...d]; },
    getLineDash() { return [...st.dash]; },
    save() { stack.push({ ...st, dash: [...st.dash] }); },
    restore() {
      if (!stack.length) return;
      const prev = st;
      st = stack.pop();
      if (st.clip !== prev.clip) G.clip(st.clip);
      if (st.clips !== prev.clips) G.clipPaths(st.clips || []);
    },
    // (The drawer's device scale is its own: a chart's setTransform to its device pixels sets none here.)
    setTransform() { st.m = null; }, resetTransform() { st.m = null; },
    transform(a, b, c0, d, e, f) { const m = st.m || [1, 0, 0, 1, 0, 0]; st.m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c0 + m[2] * d, m[1] * c0 + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]]; },
    translate(dx, dy) { c.transform(1, 0, 0, 1, dx, dy); },
    rotate(a) { const co = Math.cos(a), si = Math.sin(a); c.transform(co, si, -si, co, 0, 0); },
    scale(x, y) { c.transform(x, 0, 0, y, 0, 0); },
    getTransform() { const m = st.m || [1, 0, 0, 1, 0, 0]; return { a: K * m[0], b: K * m[1], c: K * m[2], d: K * m[3], e: K * m[4], f: K * m[5] }; },
    beginPath() { pieces = []; cur = null; shapes = []; only = true; },
    moveTo(x, y) { only = false; startPiece(x, y); },
    lineTo(x, y) { only = false; add(x, y); },
    closePath() { if (cur && cur.length >= 4) { const x = cur[0], y = cur[1]; cur.push(x, y); cur.closed = true; cur = [x, y]; pieces.push(cur); } },
    rect(x, y, w, h) {
      if (moved()) shapes.push({ x: x + ox(), y: y + oy(), w, h, r: 0 }); else only = false;
      startPiece(x, y); add(x + w, y); add(x + w, y + h); add(x, y + h); add(x, y); cur.closed = true; cur = null;
    },
    roundRect(x, y, w, h, r = 0) {
      const rr = Array.isArray(r) ? (typeof r[0] === 'number' ? r[0] : r[0]?.x ?? 0) : typeof r === 'number' ? r : r?.x ?? 0;
      if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; }
      const q = Math.max(0, Math.min(rr, w / 2, h / 2));
      if (moved()) shapes.push({ x: x + ox(), y: y + oy(), w, h, r: q }); else only = false;
      // (Its outline as a piece too, for a clip or a stroke mixed with other pieces.)
      cur = null;
      arcPts(x + w - q, y + q, q, -Math.PI / 2, 0); arcPts(x + w - q, y + h - q, q, 0, Math.PI / 2); arcPts(x + q, y + h - q, q, Math.PI / 2, Math.PI); arcPts(x + q, y + q, q, Math.PI, Math.PI * 1.5);
      cur.push(cur[0], cur[1]); cur.closed = true; cur = null;
    },
    arc(x, y, r, a0, a1, ccw = false) {
      const whole = Math.abs(a1 - a0) >= TAU - 1e-6;
      if (whole && !cur && !pieces.length && moved()) shapes.push({ x: x - r + ox(), y: y - r + oy(), w: 2 * r, h: 2 * r, r });
      else only = false;
      arcPts(x, y, r, a0, a1, ccw);
      if (whole && shapes.length) cur = null;
    },
    ellipse(x, y, rx, ry, rot, a0, a1, ccw = false) { only = false; ellPts(x, y, rx, ry, rot, a0, a1, ccw); },
    arcTo(x1, y1, x2, y2, r) {
      only = false;
      if (!cur) { startPiece(x1, y1); return; }
      const x0 = lx, y0 = ly;
      const ax = x0 - x1, ay = y0 - y1, bx = x2 - x1, by = y2 - y1, la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      const cos = (ax * bx + ay * by) / (la * lb || 1), ang = Math.acos(Math.max(-1, Math.min(1, cos)));
      if (!r || la < 1e-9 || lb < 1e-9 || ang < 1e-6 || Math.abs(ang - Math.PI) < 1e-6) { add(x1, y1); return; }
      const d = r / Math.tan(ang / 2), ux = ax / la, uy = ay / la, vx = bx / lb, vy = by / lb;
      const t0x = x1 + ux * d, t0y = y1 + uy * d, t1x = x1 + vx * d, t1y = y1 + vy * d;
      const nx = ux + vx, ny = uy + vy, nl = Math.hypot(nx, ny), cd = r / Math.sin(ang / 2), cx = x1 + (nx / nl) * cd, cy = y1 + (ny / nl) * cd;
      add(t0x, t0y);
      const s0 = Math.atan2(t0y - cy, t0x - cx), e = Math.atan2(t1y - cy, t1x - cx);
      let sw = e - s0; while (sw > Math.PI) sw -= TAU; while (sw < -Math.PI) sw += TAU;
      arcPts(cx, cy, r, s0, s0 + sw, sw < 0);
    },
    quadraticCurveTo(qx, qy, x, y) {
      only = false;
      if (!cur) startPiece(qx, qy);
      const x0 = lx, y0 = ly;
      for (let i = 1; i <= 12; i++) { const t = i / 12, u = 1 - t; add(u * u * x0 + 2 * u * t * qx + t * t * x, u * u * y0 + 2 * u * t * qy + t * t * y); }
    },
    bezierCurveTo(ax, ay, bx, by, x, y) {
      only = false;
      if (!cur) startPiece(ax, ay);
      const x0 = lx, y0 = ly;
      const n = Math.max(6, Math.min(48, Math.ceil(Math.hypot(x - x0, y - y0) * K * sc() / 4)));
      for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; add(u * u * u * x0 + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x, u * u * u * y0 + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * y); }
    },
    fill() {
      const a = st.globalAlpha;
      if (only && shapes.length && typeof st.fillStyle === 'string') { for (const s of shapes) G.box(s.x, s.y, s.w, s.h, s.r, st.fillStyle, null, 0, a); return; }
      G.poly(pieces.filter((p) => p.length >= 6), paintOf(st.fillStyle), a);
    },
    stroke() {
      const a = st.globalAlpha, w = st.lineWidth * sc(), o = { alpha: a, dash: st.dash.length ? st.dash.map((v) => v * sc()) : null, offset: st.lineDashOffset * sc(), round: st.lineCap === 'round' };
      if (only && shapes.length && !st.dash.length && typeof st.strokeStyle === 'string') { for (const s of shapes) G.box(s.x, s.y, s.w, s.h, s.r, null, st.strokeStyle, w, a); return; }
      let n = 0;
      for (const p of pieces) n += p.length / 2 + 1;
      if (sx.length < n) { let q = sx.length; while (q < n) q *= 2; sx = new Float32Array(q); sy = new Float32Array(q); }
      const xs = sx, ys = sy;
      let m = 0;
      for (const p of pieces) {
        if (p.length < 4) continue;   // (a lone point draws nothing, as on the 2D canvas)
        for (let i = 0; i < p.length; i += 2) { xs[m] = p[i]; ys[m] = p[i + 1]; m++; }
        xs[m] = ys[m] = NaN; m++;
      }
      G.line(xs, ys, m, paintOf(st.strokeStyle), w, o);
    },
    clip() {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of pieces) for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
      let r = x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : [0, 0, 0, 0];
      if (st.clip) { const q = st.clip, a0 = Math.max(r[0], q[0]), b0 = Math.max(r[1], q[1]), a1 = Math.min(r[0] + r[2], q[0] + q[2]), b1 = Math.min(r[1] + r[3], q[1] + q[3]); r = [a0, b0, Math.max(0, a1 - a0), Math.max(0, b1 - b0)]; }
      st.clip = r; G.clip(r);
      // (a rectangle is the scissor alone; any other shape is clipped by the stencil too)
      if (!(only && shapes.length === 1 && shapes[0].r === 0)) { st.clips = [...(st.clips || []), pieces.filter((p) => p.length >= 6).map((p) => p.slice())]; G.clipPaths(st.clips); }
    },
    fillRect(x, y, w, h) {
      if (typeof st.fillStyle === 'string' && moved()) { G.box(x + ox(), y + oy(), w, h, 0, st.fillStyle, null, 0, st.globalAlpha); return; }
      const keep = [pieces, cur, shapes, only];
      pieces = []; cur = null; shapes = []; only = false;
      startPiece(x, y); add(x + w, y); add(x + w, y + h); add(x, y + h); add(x, y);
      G.poly(pieces, paintOf(st.fillStyle), st.globalAlpha);
      [pieces, cur, shapes, only] = keep;
    },
    strokeRect(x, y, w, h) { G.box(x + ox(), y + oy(), w, h, 0, null, st.strokeStyle, st.lineWidth, st.globalAlpha); },
    clearRect() {},
    // (Words at the transform's origin, turned with it; its scale is not applied to them.)
    fillText(t, x, y) { const m = st.m, ang = m ? Math.atan2(m[1], m[0]) : 0; G.text(t, x + ox(), y + oy(), st.font, typeof st.fillStyle === 'string' ? st.fillStyle : stopColour(st.fillStyle), align(), st.textBaseline, st.globalAlpha, 0, ang ? [ox(), oy(), ang] : null); },
    strokeText(t, x, y) { const m = st.m, ang = m ? Math.atan2(m[1], m[0]) : 0; G.text(t, x + ox(), y + oy(), st.font, typeof st.strokeStyle === 'string' ? st.strokeStyle : stopColour(st.strokeStyle), align(), st.textBaseline, st.globalAlpha, st.lineWidth, ang ? [ox(), oy(), ang] : null); },
    measureText(t) { return { width: G.measure(String(t), st.font) }; },
    createLinearGradient(x0, y0, x1, y1) { const g = { grad: [x0, y0, x1, y1], stops: [], addColorStop(o, col) { g.stops.push([o, col]); } }; return g; },
    createRadialGradient(x0, y0, r0, x1, y1, r1) { const g = { rad: [x0, y0, r0, x1, y1, r1], stops: [], addColorStop(o, col) { g.stops.push([o, col]); } }; return g; },
    /** A picture (canvas, image or ImageData) in a box, translated with the transform: drawImage(src, x, y) or (src, x, y, w, h). The
     *  picture goes up to the GPU once per src.glVer (a canvas the caller draws again bumps it). */
    drawImage(src, x, y, w, h) {
      if (w === undefined) { w = src.width; h = src.height; }
      G.image(src, x + ox(), y + oy(), w, h, st.globalAlpha, src, src.glVer || 0);
    },
    /** A soft shadow under a rounded box (the GPU's own, in place of a blurred picture): its colour, blur and offset as the 2D canvas's. */
    shadowBox(x, y, w, h, r, colour, blur, dy = 0) { G.box(x, y + dy, w, h, r, colour, null, -blur / 2, 1); },
  };
  return c;
}
const stopColour = (g) => (g && g.stops && g.stops.length ? g.stops[0][1] : 'transparent');

/** The pen a chart draws with: the GPU drawer's 2D context where it can draw now ({ ctx, w, h }, ctx.end() ends the frame), else the chart's
 *  canvas sized as fitCanvas sizes it and a pen that draws nothing (util.js), until the GPU can draw it. */
export function fitPen(canvas, gpu) {
  if (gpu) {
    const z = canvasSize(canvas);
    const ctx = gpu.ctx2d(z.w, z.h, z.W, z.H);
    if (ctx) return { ctx, w: z.w, h: z.h };
  }
  return fitCanvas(canvas);
}
