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

import { startProgram, checkProgram, exerciseDraw, publishWhenDone, stillCompiling } from './gl-compile.js';
import { canvasSize, fitCanvas, onCanvasSized } from './util.js';
import { sdfAtlas } from './text-gl.js';   // (the app's one door to GPU text: its SDF atlas, for text that changes every frame)
import { notePass, hold } from './gpu-budget.js';
import { fontOf, measure } from './glyph-measure.js';
import { fbComplete } from './gl-state.js';
import { ucOf } from './uniform-cache.js';
import { caught } from './caught.js';
import { readBox } from './layout-snap.js';
const WHITE_INK = 'rgb(255 255 255)';   // colour-exempt: an eraser's ink, only its coverage counts
export { measure };
const { GLYPHS, KERN, BASELINES, BASE, RADIUS, CUTOFF, ATLAS_W, ATLAS_H, ATLAS_PNG } = sdfAtlas;

// A chart off the screen for PARK_MS gives back its WebGL context (WEBGL_lose_context), and takes it again as it nears the screen:
// a browser keeps 16 or so contexts a page and drops the oldest past that, which was the figure's (a FibroScan slide held about 20).
const PARK_MS = 4000;
// (2 Nov 2026, the review's "a deck opens 12 contexts": every chart draws in ONE WebGL2 context, an OffscreenCanvas the charts share. A
// chart's frame is drawn there at the chart's own size and handed whole to the chart's own canvas (transferToImageBitmap into its
// 'bitmaprenderer' context: the picture moves on the GPU, nothing is copied by the CPU). Its programs are compiled and its glyph field
// uploaded once for all charts, so a chart coming into view never waits for a compile or comes in blank, and none is parked. Where
// OffscreenCanvas WebGL2 is missing, each chart has its own context, as before.)
/** The still parts of a chart drawn through `ctx` kept on the GPU under `name` while `sig` holds (see the drawer's keep); any other pen draws them. */
export function keepLayer(ctx, name, sig, draw) {
  if (ctx && typeof ctx.keep === 'function') return ctx.keep(name, sig, draw);
  draw();
  return false;
}
// (2 Nov 2026, audit R04, then two-contexts plan D3/U2, 4 Nov 2026: ONE shared context for every chart. Its drawing buffer grows in CAP_STEP
// steps to the largest chart drawn lately (shrunk again after a quiet SHRINK_MS, see begin), so charts of different sizes never resize it. Each chart draws in the
// buffer's lower left W x H (viewport and scissor), and its card canvas, given the buffer's size by the hand-over, is shown at that size
// and clipped to the chart's own box (place), so pixels still map 1:1 and nothing is copied or resized.)
const pools = [];
/** Size reallocations of the shared buffer and pictures handed over, since the page opened (the ?perf readout, audit R04). */
// (P2, perf review 4 Nov 2026: the pool hands over its WHOLE buffer per chart, so a layer over a quarter of the screen, like the lobule's leaders once did,
// slows every chart. It is noted once in pps.caught() and the ?perf paste, to find the next one.)
let bigNoted = false;
const bigLayer = (Wd, Hd) => {
  const px = typeof screen !== 'undefined' && screen.width > 0 ? screen.width * screen.height * (devicePixelRatio || 1) ** 2 : 0;
  return px > 0 && Wd * Hd > px / 4;
};
export const sharedStats = { covRemade: 0, resizes: 0, transfers: 0, moves: 0, covAllocs: 0, uploads: 0, subUploads: 0 };
const CAP_STEP = 256;
const SHRINK_MS = 1000;   // (the shared buffer is cut back to the largest chart drawn in the last one to two seconds)
export const capOf = (n) => Math.ceil(Math.max(1, n) / CAP_STEP) * CAP_STEP;
function makePool() {
  const pool = { dead: true, users: 0 };   // alloc-rare: a drawing pool (a GL context) is made once, a timer ahead of the first chart that needs it
  if (typeof OffscreenCanvas !== 'function') return pool;
  let gl;
  const canvas = new OffscreenCanvas(1, 1);
  try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: true, preserveDrawingBuffer: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true }); } catch { gl = null; }   // alloc-rare: a drawing pool is made once
  if (!gl || typeof gl.createShader !== 'function' || typeof canvas.transferToImageBitmap !== 'function') return pool;
  Object.assign(pool, { dead: false, canvas, gl, gen: 0, started: null, atlasTex: null, atlasIn: false, active: null, cov: null });   // alloc-rare: a drawing pool is made once
  canvas.addEventListener?.('webglcontextlost', (e) => { e.preventDefault(); pool.started = null; pool.atlasTex = null; pool.atlasIn = false; pool.cov = null; });   // alloc-rare: a drawing pool is made once
  canvas.addEventListener?.('webglcontextrestored', () => { pool.gen++; });   // alloc-rare: a drawing pool is made once
  return pool;
}
// The programs of a started set as a list, made once for each set and handed on after (the compile checks ask for it while a chart waits on the driver).
const progLists = new WeakMap();
const progList = (started) => {
  let l = progLists.get(started);
  if (!l) { l = Object.values(started); progLists.set(started, l); }   // alloc-rare: made once for each set of started programs
  return l;
};
const NO_OPTS = Object.freeze({});   // (a stroke asked for with no options: nothing is made for it)
const LS_TEXT = new Map();
const lsText = (n) => LS_TEXT.get(n) ?? (LS_TEXT.size >= 400 && LS_TEXT.clear(), LS_TEXT.set(n, `${n}px`).get(n));   // alloc-rare: the text of a letter spacing is made the first time that spacing is set, then looked up
function sharedGL() {
  if (!pools.length) { const first = makePool(); pools.push(first); if (first.dead) return null; }
  if (pools[0].dead) return null;
  pools[0].users++;
  return pools[0];
}
const startPool = (p) => (p.started ||= Object.fromEntries(Object.entries(SRC).map(([k, [vs, fs]]) => [k, startProgram(p.gl, vs, fs)])));   // alloc-rare: a pool's programs are started once
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
const SRC = { seg: [SEG_VS, SEG_FS], comp: [QUAD_VS, COMP_FS], fill: [FILL_VS, FILL_FS], box: [BOX_VS, BOX_FS], text: [TEXT_VS, TEXT_FS], img: [IMG_VS, IMG_FS] };
if (typeof Image === 'function') { const im = new Image(); im.decoding = 'async'; im.onload = () => { glyphImage = im; for (const f of [...waiting]) f(); waiting.clear(); }; im.src = ATLAS_PNG; }

// A CSS colour as [r, g, b, a] (0–1, not premultiplied), read by hand (no canvas): #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba() in either
// syntax, color(srgb …), the few names the app writes, and color-mix(in srgb, a p%, b q%) of any of those. Cached per string.
const colours = new Map();
const NAMED = { transparent: [0, 0, 0, 0], white: [1, 1, 1, 1], black: [0, 0, 0, 1], red: [1, 0, 0, 1] };
const num = (t, scale) => (t.endsWith('%') ? parseFloat(t) / 100 : parseFloat(t) / scale);
// (the arguments of a function, split at top-level commas)
const args = (t) => { const out = []; let d = 0, cur = ''; for (const ch of t) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; };
export function parseColour(c) {
  // (The string as it came is looked up first: a colour with a capital letter or a space, read again every frame, made a new string each time it was lowercased.)
  const raw = c;
  if (typeof raw === 'string') { const hit = colours.get(raw); if (hit) return hit; }
  c = String(c ?? '').trim().toLowerCase();
  let v = colours.get(c);
  if (v) { if (typeof raw === 'string' && colours.size < 512) colours.set(raw, v); return v; }
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
  if (typeof raw === 'string' && raw !== c) colours.set(raw, v);
  return v;
}
const rgba = parseColour;
// (A colour premultiplied by its alpha and by `alpha`, written into out at o; returns the alpha. Nothing is made: the caller's buffer is written in place.)
// (The characters of a string as the 2D canvas's letterSpacing counts them: a surrogate pair is one.)
const pointsIn = (str) => { let n = str.length; for (let i = 0; i + 1 < str.length; i++) { const c = str.charCodeAt(i); if (c >= 0xd800 && c < 0xdc00) { const d = str.charCodeAt(i + 1); if (d >= 0xdc00 && d < 0xe000) { n--; i++; } } } return n; };
const premulInto = (out, o, c, alpha = 1) => { const v = rgba(c), a = v[3] * alpha; out[o] = v[0] * a; out[o + 1] = v[1] * a; out[o + 2] = v[2] * a; out[o + 3] = a; return a; };

/** The GPU drawer for one chart, over `host` (the chart's 2D canvas), or null where it cannot be (the 2D canvas draws the chart). */
// alloc-rare: made once with the chart (createTraceGL runs once for a chart), never in a frame
export function createTraceGL(host, { redraw = null, under = null, lose = null, keep = false } = {}) {   // (keep: a widget's picture is never taken down by a frame the GPU could not draw: the last completed picture stays until the retry draws it again)
  // (canvasSize never measures: a chart drawn before the observer reported its box drew nothing, and draws again once it has one,
  // with or without this drawer)
  let unsized = null;   // (the size subscription's release, called by dispose)
  if (redraw && host && typeof ResizeObserver !== 'undefined') unsized = onCanvasSized(host, redraw);
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'trace-gl';
  canvas.style.pointerEvents = 'none';
  let gl = null, glCanvas = canvas, shown = null;
  let shared = sharedGL();
  if (shared) {
    try { shown = canvas.getContext('bitmaprenderer'); } catch { shown = null; }
    if (shown) { gl = shared.gl; glCanvas = shared.canvas; }
  }
  // alloc-rare: made once with the chart (createTraceGL runs once for a chart), never in a frame
  if (!gl) try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: true, preserveDrawingBuffer: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true }); } catch { gl = null; }
  if (!gl || typeof gl.createShader !== 'function' || typeof host?.after !== 'function') return null;
  const loser = shown ? null : gl.getExtension('WEBGL_lose_context');   // (the shared context is never given back: every chart draws in it)   // (kept now: a lost context gives no extensions)
  // (A software renderer draws it too: a chart is a few hundred small shapes, well within one.)

  let lost = false, dead = false, failed = false, missed = false, parked = false, back = false, gen = 0;   // (missed: a frame asked for the GPU while it could not draw)
  // alloc-rare: made once with the chart (createTraceGL runs once for a chart), never in a frame
  // (lose: told when the context is lost, so a surface that was showing this picture can show its fallback again; the redraw asked for
  // when the context is built again is the one that shows it again.)
  const onLost = (e) => { e.preventDefault(); lost = true; if (redraw) missed = true; if (lose) { try { lose(); } catch (e2) { caught('trace-gl:lose', e2); } } };
  glCanvas.addEventListener?.('webglcontextlost', onLost);
  let P = null, started = null, stopPoll = null;
  let quad = null, quadVao = null, segBuf = null, segVao = null, fillBuf = null, fillVao = null, boxBuf = null, boxVao = null, textBuf = null, textVao = null;
  let covTex = null, fbo = null, ownCov = null, atlasTex = null, atlasIn = false, unitBuf = null, unitVao = null;
  // alloc-rare: made once with the chart (createTraceGL runs once for a chart), never in a frame
  const images = new Map();   // (a picture's key → { tex, ver }: textures kept from frame to frame, a few at most)
  // alloc-rare: made once with the chart (createTraceGL runs once for a chart), never in a frame
  const PU = ['pc', 'po', 'pl', 'pn', 'ga', 'pr', 'pk', 'pm'];
  // alloc-rare: made once with the chart (createTraceGL runs once for a chart), never in a frame
  const UN = { seg: ['res', 'hw', 'dash', 'cap'], comp: ['cov', 'res', 'k', ...PU], fill: ['res', 'k', ...PU], box: ['res', 'k'], text: ['res', 'asz', 'atlas', 'sdf'], img: ['res', 'k', 'box', 'img', 'ga'] };

  function build() {
    P = null; failed = false; gen++;
    // (Shared: the programs compiled once for every chart; each chart only finds its uniforms.)
    if (shown) startPool(shared);
    // alloc-rare: build runs when the chart's context is made or made again (its creation, a context restored), never in a frame
    started = shown ? shared.started : Object.fromEntries(Object.entries(SRC).map(([k, [vs, fs]]) => [k, startProgram(gl, vs, fs)]));
    quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    // alloc-rare: build runs when the chart's context is made or made again (its creation, a context restored), never in a frame
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    quadVao = gl.createVertexArray(); gl.bindVertexArray(quadVao);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    segBuf = gl.createBuffer(); segVao = gl.createVertexArray(); gl.bindVertexArray(segVao); gl.bindBuffer(gl.ARRAY_BUFFER, segBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 24, 0); gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 24, 16); gl.vertexAttribDivisor(1, 1);
    fillBuf = gl.createBuffer(); fillVao = gl.createVertexArray(); gl.bindVertexArray(fillVao); gl.bindBuffer(gl.ARRAY_BUFFER, fillBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    boxBuf = gl.createBuffer(); boxVao = gl.createVertexArray(); gl.bindVertexArray(boxVao); gl.bindBuffer(gl.ARRAY_BUFFER, boxBuf);
    // alloc-rare: build runs when the chart's context is made or made again (its creation, a context restored), never in a frame
    for (const [i, n, off] of [[0, 4, 0], [1, 2, 16], [2, 4, 24], [3, 4, 40]]) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, n, gl.FLOAT, false, 56, off); gl.vertexAttribDivisor(i, 1); }
    textBuf = gl.createBuffer(); textVao = gl.createVertexArray(); gl.bindVertexArray(textVao); gl.bindBuffer(gl.ARRAY_BUFFER, textBuf);
    // alloc-rare: build runs when the chart's context is made or made again (its creation, a context restored), never in a frame
    for (const [i, n, off] of [[0, 4, 0], [1, 4, 16], [2, 4, 32], [3, 2, 48], [4, 4, 56]]) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, n, gl.FLOAT, false, TS * 4, off); gl.vertexAttribDivisor(i, 1); }
    gl.bindVertexArray(null);
    unitBuf = gl.createBuffer(); unitVao = gl.createVertexArray(); gl.bindVertexArray(unitVao); gl.bindBuffer(gl.ARRAY_BUFFER, unitBuf);
    // alloc-rare: build runs when the chart's context is made or made again (its creation, a context restored), never in a frame
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    images.clear();
    // (Coverage: the pool's one target when shared, else the chart's own; grown in steps, never shrunk: coverTarget.)
    // alloc-rare: build runs when the chart's context is made or made again (its creation, a context restored), never in a frame
    ownCov = shown ? null : { tex: gl.createTexture(), fb: gl.createFramebuffer(), w: 0, h: 0 };
    covTex = fbo = null;
    if (shown && shared.atlasTex) atlasTex = shared.atlasTex;
    else {
      atlasTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      // alloc-rare: build runs when the chart's context is made or made again (its creation, a context restored), never in a frame
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      if (shown) { shared.atlasTex = atlasTex; shared.atlasIn = false; }
    }
    // (The glyphs' field goes up once, from the decoded PNG, when the context is made or made again; 1 MB, never in a frame of motion.)
    atlasIn = false;
    // alloc-rare: build runs when the chart's context is made or made again (its creation, a context restored), never in a frame
    stopPoll?.(); stopPoll = publishWhenDone(gl, Object.values(started), publish);
  }
  // The glyphs' field, sent once per context (generation), shared by every chart drawn in the shared context.
  function sendAtlas() {
    if (shown && shared.atlasIn) atlasIn = true;
    if (atlasIn || !glyphImage || !atlasTex || dead || lost || gl.isContextLost()) return atlasIn;
    if (shown) shared.atlasIn = true;
    gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, ATLAS_W, ATLAS_H, 0, gl.RED, gl.UNSIGNED_BYTE, glyphImage);
    atlasIn = true;
    return true;
  }
  let atlasSoon = false;
  function sendAtlasSoon() {
    if (atlasSoon) return;
    atlasSoon = true;
    // alloc-rare: at most once for each context: atlasSoon holds a second one off until the first has run
    const later = typeof requestIdleCallback === 'function' ? (f) => requestIdleCallback(f, { timeout: 120 }) : (f) => setTimeout(f, 16);
    // alloc-rare: at most once for each context: atlasSoon holds a second one off until the first has run
    later(() => { atlasSoon = false; if (sendAtlas() && redraw && !dead) { try { redraw(); } catch (e) { console.warn('Charts on the GPU: the redraw failed.', e); } } });
  }
  // (The uniform cache (uniform-cache.js) is keyed by the location object and believes what it last sent through it. Charts in one pool share one program,
  // so they must share its locations too: each chart with locations of its own made its cache believe in values (the size, the line's half width, the
  // colour, the alpha) that another chart had since replaced in the program, so a stroke was sent with another chart's numbers or none, and a chart's lines
  // vanished while its fills, words and dots, which a size change happens to refresh, still drew.)
  function ulocs(p, k) {
    const make = () => Object.fromEntries(UN[k].map((n) => [n, gl.getUniformLocation(p, n)]));   // alloc-rare: once per program
    if (!shown) return make();
    const m = shared.ulocs ||= new WeakMap();   // alloc-rare: once per pool
    let u = m.get(p);
    if (!u) m.set(p, u = make());
    return u;
  }
  function publish() {
    if (P || failed || gl.isContextLost()) return;
    try {
      // alloc-rare: publish runs once when the programs have compiled (or a context is made again), never in a frame
      const out = {};
      // alloc-rare: publish runs once when the programs have compiled (or a context is made again), never in a frame
      for (const k of Object.keys(SRC)) { const p = checkProgram(gl, started[k]); out[k] = { p, u: ulocs(p, k) }; }
      // alloc-rare: publish runs once when the programs have compiled (or a context is made again), never in a frame
      exerciseDraw(gl, () => {
        gl.bindVertexArray(quadVao);
        // alloc-rare: publish runs once when the programs have compiled (or a context is made again), never in a frame
        for (const k of ['fill', 'comp']) { gl.useProgram(out[k].p); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
        gl.bindVertexArray(null);
      });
      P = out; lost = false;
      sendAtlas();   // (the glyphs go up with the programs, in the same idle moment, not in the first frame)
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
  // alloc-rare: made once with the chart (createTraceGL runs once for a chart), never in a frame
  const onRestored = () => {
    if (dead) return;
    try { build(); } catch (e) { failed = true; console.warn('Charts on the GPU: could not be rebuilt; the chart is not drawn.', e); }
  };
  glCanvas.addEventListener?.('webglcontextrestored', onRestored);
  // The chart's own objects in its context (not the pool's programs, glyph field or coverage): let go on a move or a dispose.
  function freeOwn() {
    try {
      // alloc-rare: teardown, when the chart's context is let go, never in a frame
      for (const b of [quad, segBuf, fillBuf, boxBuf, textBuf, unitBuf]) gl.deleteBuffer(b);
      // alloc-rare: teardown, when the chart's context is let go, never in a frame
      for (const v of [quadVao, segVao, fillVao, boxVao, textVao, unitVao]) gl.deleteVertexArray(v);
      for (const e of images.values()) dropImage(e);
      images.clear();
      for (const e of layers.values()) dropLayer(e);
      layers.clear();
      layerHold?.drop(); layerHold = null;
      if (ownCov) { gl.deleteTexture(ownCov.tex); gl.deleteFramebuffer(ownCov.fb); ownCov = null; }
    } catch (e) { caught('trace-gl:501', e); /* a lost context holds nothing */ }
  }
  host.after(canvas);
  // (Parking: the context is given back while the chart is off the screen, display:none included, and taken again as it comes near.)
  let parkT = 0, seen = null;
  if (loser && typeof IntersectionObserver === 'function') {
    // alloc-rare: made once with the chart (createTraceGL runs once for a chart), never in a frame
    seen = new IntersectionObserver((es) => {
      if (dead) return;
      const on = es[es.length - 1].isIntersecting;
      clearTimeout(parkT); parkT = 0;
      if (on) { if (parked) { parked = false; back = true; loser.restoreContext(); } }
      // alloc-rare: made when the chart leaves the view (the observer's callback), not in a frame
      else if (!parked) parkT = setTimeout(() => { parkT = 0; if (dead || parked) return; parked = true; stopPoll?.(); loser.loseContext(); }, PARK_MS);
    // alloc-rare: made once with the chart (createTraceGL runs once for a chart), never in a frame
    }, { rootMargin: '50%' });
    seen.observe(host);
  }

  // ── A frame ──
  let W = 1, H = 1, K = 1, clipR = null, inFrame = false, lastEnd = true;
  const clipBox = [0, 0, 0, 0];   // alloc-rare: made once with the drawer (the clip rectangle, written in place)
  // (R16: the target a frame's draws land in: the chart's canvas (null), or a kept layer's texture while keep() draws one.)
  let outFb = null;
  // alloc-rare: made once with the chart (createTraceGL runs once for a chart), never in a frame
  const layers = new Map();   // (a kept layer's name → { tex, fb, rb, w, h, gen, sig }: the still parts of a chart, drawn once per sig)
  // (Review pass item 8: a chart's kept layers are held in the global budget as 'retained': let go, least recently drawn first, only while the
  // registry is over its envelope; drawn again at the next frame. Let go inside a frame, they go when it ends.)
  let layerHold = null, dropAfter = false;
  // alloc-rare: made once with the chart (createTraceGL runs once for a chart), never in a frame
  const layerBytes = () => { let b = 0; for (const e of layers.values()) b += e.w * e.h * 5; return b; };
  // alloc-rare: made once with the chart (createTraceGL runs once for a chart), never in a frame
  const dropLayers = () => { for (const e of layers.values()) dropLayer(e); layers.clear(); };
  // alloc-rare: made once with the chart (createTraceGL runs once for a chart), never in a frame
  const holdLayers = () => { if (layerHold?.held) layerHold.touch(); else layerHold = hold({ owner: 'chart layers', kind: 'retained', gl, bytes: layerBytes, release: () => { layerHold = null; if (inFrame) dropAfter = true; else dropLayers(); } }); };
  // alloc-rare: made once with the chart (createTraceGL runs once for a chart), never in a frame
  const dropLayer = (e) => { try { gl.deleteTexture(e.tex); gl.deleteFramebuffer(e.fb); gl.deleteRenderbuffer(e.rb); } catch (e) { caught('trace-gl:542', e); /* lost */ } };
  // (A kept picture let go: its texture, and the framebuffer it was shaded through if it was shaded here.)
  const dropImage = (e) => { gl.deleteTexture(e.tex); if (e.fb) gl.deleteFramebuffer(e.fb); };   // alloc-rare: a kept picture is let go when the oldest of six is, or the chart is
  // alloc-rare: made once with the chart (createTraceGL runs once for a chart), never in a frame
  let segData = new Float32Array(6144), fillData = new Float32Array(4096);
  // alloc-rare: made once with the chart (createTraceGL runs once for a chart), never in a frame
  let textData = new Float32Array(18 * 32), textN = 0, boxData = new Float32Array(560), boxN = 0;
  // alloc-rare: made once with the chart (createTraceGL runs once for a chart), never in a frame
  const grow = (a, n) => { if (a.length >= n) return a; let m = a.length; while (m < n) m *= 2; const b = new Float32Array(m); b.set(a); return b; };
  function scissor(r) {
    if (!r) { gl.disable(gl.SCISSOR_TEST); return true; }
    const x0 = Math.max(0, Math.floor(r[0] * K)), y0 = Math.max(0, Math.floor(r[1] * K)), x1 = Math.min(W, Math.ceil((r[0] + r[2]) * K)), y1 = Math.min(H, Math.ceil((r[1] + r[3]) * K));
    if (x1 <= x0 || y1 <= y0) return false;
    gl.enable(gl.SCISSOR_TEST); gl.scissor(x0, H - y1, x1 - x0, y1 - y0);
    return true;
  }
  // (The box x, y, w, h cut to the clip's rectangle, written into one kept box and returned (null: nothing of it is inside the clip). The next call writes it again.)
  const IB = new Float64Array(4);   // alloc-rare: made once with the drawer
  // alloc-rare: made once with the chart (createTraceGL runs once for a chart), never in a frame
  const inter = (x, y, w, h) => {
    if (!clipR) { IB[0] = x; IB[1] = y; IB[2] = w; IB[3] = h; return IB; }
    const x0 = Math.max(x, clipR[0]), y0 = Math.max(y, clipR[1]), x1 = Math.min(x + w, clipR[0] + clipR[2]), y1 = Math.min(y + h, clipR[1] + clipR[3]);
    if (!(x1 > x0 && y1 > y0)) return null;
    IB[0] = x0; IB[1] = y0; IB[2] = x1 - x0; IB[3] = y1 - y0;
    return IB;
  };
  // ── The clip by a path (the stencil's top bit; its low bits count a fill's windings) ──
  let clipOn = false;
  // (every draw onto the canvas passes only inside the clip)
  function clipState() {
    if (!clipOn) { gl.disable(gl.STENCIL_TEST); return; }
    gl.enable(gl.STENCIL_TEST); gl.stencilMask(0); gl.stencilFunc(gl.EQUAL, 0x80, 0x80); gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
  }
  // (the triangles of a path's pieces, as a fan from each piece's first point: their windings counted in the stencil's low bits. The pieces are
  // kept in one row of points, b (x, y pairs), a piece's start in st; pieces p0 up to p1, the last ending at `end`: see the shim's path.)
  function fanData(b, st, p0, p1, end) {
    let n = 0;
    for (let q = p0; q < p1; q++) { const len = (q + 1 < p1 ? st[q + 1] : end) - st[q]; if (len >= 6) n += (len / 2 - 2) * 3; }
    if (!n) return 0;
    fillData = grow(fillData, Math.max(n * 2, 8));
    let m = 0;
    for (let q = p0; q < p1; q++) {
      const a = st[q], e = q + 1 < p1 ? st[q + 1] : end;
      if (e - a < 6) continue;
      for (let i = a + 2; i + 3 < e; i += 2) { fillData[m++] = b[a]; fillData[m++] = b[a + 1]; fillData[m++] = b[i]; fillData[m++] = b[i + 1]; fillData[m++] = b[i + 2]; fillData[m++] = b[i + 3]; }
    }
    return m;
  }
  // alloc-rare: made once with the chart (createTraceGL runs once for a chart), never in a frame
  const fullQuad = () => { fillData[0] = -1e5; fillData[1] = -1e5; fillData[2] = 1e5; fillData[3] = -1e5; fillData[4] = -1e5; fillData[5] = 1e5; fillData[6] = 1e5; fillData[7] = 1e5; gl.bufferData(gl.ARRAY_BUFFER, fillData, gl.STREAM_DRAW, 0, 8); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
  /** The clip: the intersection of the first `count` paths held in `cl` (the shim's clip rows: b the points, st each piece's start, ep each
   *  path's end in pieces, en in points; CSS px), filled by the nonzero rule; 0 for none. */
  function clipPaths(cl, count) {
    flush();
    if (!count) { clipOn = false; gl.disable(gl.STENCIL_TEST); return; }
    gl.disable(gl.SCISSOR_TEST);
    gl.stencilMask(0xff); gl.clearStencil(0); gl.clear(gl.STENCIL_BUFFER_BIT);
    gl.enable(gl.STENCIL_TEST); gl.colorMask(false, false, false, false);
    gl.useProgram(P.fill.p); ucOf(gl).f2(P.fill.u.res, W, H); ucOf(gl).f1(P.fill.u.k, K);
    gl.bindVertexArray(fillVao); gl.bindBuffer(gl.ARRAY_BUFFER, fillBuf);
    for (let i = 0; i < count; i++) {
      const m = fanData(cl.b, cl.st, i ? cl.ep[i - 1] : 0, cl.ep[i], cl.en[i]);
      // (its windings counted in the low bits, within the clip so far)
      gl.stencilMask(0x7f);
      if (i) gl.stencilFunc(gl.EQUAL, 0x80, 0x80); else gl.stencilFunc(gl.ALWAYS, 0, 0);
      gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP); gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP);
      if (m) { gl.bufferData(gl.ARRAY_BUFFER, fillData, gl.STREAM_DRAW, 0, m); gl.drawArrays(gl.TRIANGLES, 0, m / 2); }
      gl.stencilMask(0xff);
      // (in the clip so far but outside this path: out)
      if (i) { gl.stencilFunc(gl.EQUAL, 0x80, 0xff); gl.stencilOp(gl.KEEP, gl.KEEP, gl.ZERO); fullQuad(); }
      // (inside it: in, its count cleared; the reference is 0x80, its low bits 0, so the test is "a count")
      gl.stencilFunc(gl.NOTEQUAL, 0x80, 0x7f); gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE); fullQuad();
    }
    gl.colorMask(true, true, true, true);
    clipOn = true; clipState();
  }
  // The outline glyphs batched by text() (white, so their coverage is their red), laid into the coverage target with MAX blending and
  // painted once in the outline's premultiplied colour over r (CSS px).
  // alloc-rare: made once with the chart (createTraceGL runs once for a chart), never in a frame
  const outPC = new Float32Array(64);   // (the outline's colour as the paint's one stop, kept: nothing made per frame)
  function outline(tint, bx, by, bw, bh) {
    const r = inter(bx, by, bw, bh), n = textN;
    textN = 0;
    if (!r) return;
    coverTarget();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    if (!scissor(r)) { gl.bindFramebuffer(gl.FRAMEBUFFER, outFb); return; }
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(P.text.p);
    ucOf(gl).f2(P.text.u.res, W, H); ucOf(gl).f2(P.text.u.asz, ATLAS_W, ATLAS_H); ucOf(gl).f2(P.text.u.sdf, RADIUS, CUTOFF);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, atlasTex); ucOf(gl).i1(P.text.u.atlas, 0);
    gl.bindVertexArray(textVao); gl.bindBuffer(gl.ARRAY_BUFFER, textBuf);
    gl.bufferData(gl.ARRAY_BUFFER, textData, gl.STREAM_DRAW, 0, n * TS);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    gl.bindFramebuffer(gl.FRAMEBUFFER, outFb);
    gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(P.comp.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, covTex); ucOf(gl).i1(P.comp.u.cov, 0);
    ucOf(gl).f2(P.comp.u.res, W, H); ucOf(gl).f1(P.comp.u.k, K);
    outPC.set(tint);
    ucOf(gl).fv4(P.comp.u.pc, outPC); ucOf(gl).i1(P.comp.u.pn, 1); ucOf(gl).f1(P.comp.u.ga, 1);
    gl.bindVertexArray(quadVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  function flush() {
    if (textN) {
      if (scissor(clipR)) {
        gl.useProgram(P.text.p);
        ucOf(gl).f2(P.text.u.res, W, H); ucOf(gl).f2(P.text.u.asz, ATLAS_W, ATLAS_H); ucOf(gl).f2(P.text.u.sdf, RADIUS, CUTOFF);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, atlasTex); ucOf(gl).i1(P.text.u.atlas, 0);
        gl.bindVertexArray(textVao); gl.bindBuffer(gl.ARRAY_BUFFER, textBuf);
        gl.bufferData(gl.ARRAY_BUFFER, textData, gl.STREAM_DRAW, 0, textN * TS);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, textN);
      }
      textN = 0;
    }
    if (boxN) {
      if (scissor(clipR)) {
        gl.useProgram(P.box.p);
        ucOf(gl).f2(P.box.u.res, W, H); ucOf(gl).f1(P.box.u.k, K);
        gl.bindVertexArray(boxVao); gl.bindBuffer(gl.ARRAY_BUFFER, boxBuf);
        gl.bufferData(gl.ARRAY_BUFFER, boxData, gl.STREAM_DRAW, 0, boxN * 14);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, boxN);
      }
      boxN = 0;
    }
  }
  // Paint uniforms: a colour string, or a gradient from the context ({ grad: [x0, y0, x1, y1], stops: [[offset, colour], …] }).
  const TINT = new Float32Array(4), WHITE = new Float32Array([1, 1, 1, 1]);   // alloc-rare: made once with the drawer (the words' colour, premultiplied, and the outline's white ink)
  const ID3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);   // alloc-rare: made once with the drawer
  // alloc-rare: made once with the chart (createTraceGL runs once for a chart), never in a frame
  const PM = new Float32Array(9);   // (the path's matrix, refilled for each draw)
  // (A gradient's stops are taken, at most 16, into these kept rows and put in order of offset by an insertion sort: nothing is made.)
  const SPC = new Float32Array(64), SPO = new Float32Array(16), SPI = new Int32Array(16);   // alloc-rare: made once with the drawer
  function setPaint(u, style, alpha) {
    if (style && (style.grad || style.rad)) {
      const offs = style.offs, cols = style.cols, n = Math.min(16, style.n);
      if (n) {
        for (let i = 0; i < n; i++) {
          const o = offs[i];
          let j = i;
          while (j > 0 && SPO[j - 1] > o) { SPO[j] = SPO[j - 1]; SPI[j] = SPI[j - 1]; j--; }
          SPO[j] = o; SPI[j] = i;
        }
        SPC.fill(0);
        for (let i = 0; i < n; i++) premulInto(SPC, i * 4, cols[SPI[i]]);
        SPO.fill(0, n);
        ucOf(gl).fv4(u.pc, SPC); ucOf(gl).fv1(u.po, SPO); ucOf(gl).i1(u.pn, n); ucOf(gl).f1(u.ga, alpha);
        if (style.rad) { const r = style.rad; ucOf(gl).f4(u.pl, r[0], r[1], r[3], r[4]); ucOf(gl).f2(u.pr, r[2], r[5]); ucOf(gl).i1(u.pk, 1); }
        else { ucOf(gl).fv4(u.pl, style.grad); ucOf(gl).i1(u.pk, 0); }
        // (the gradient lies in the space it was filled under: inv maps the page's px back to it)
        const m = style.inv;
        if (m) { PM[0] = m[0]; PM[1] = m[1]; PM[2] = 0; PM[3] = m[2]; PM[4] = m[3]; PM[5] = 0; PM[6] = m[4]; PM[7] = m[5]; PM[8] = 1; ucOf(gl).m3(u.pm, PM); } else ucOf(gl).m3(u.pm, ID3);
        return;
      }
    }
    SPC.fill(0);
    if (typeof style === 'string') premulInto(SPC, 0, style);
    ucOf(gl).fv4(u.pc, SPC); ucOf(gl).i1(u.pn, 1); ucOf(gl).f1(u.ga, alpha);
  }
  // (Review pass item 6: one coverage target per pool (the chart's own without one), grown to the largest chart drawn in CAP_STEP steps and
  // never shrunk: a frame draws into its lower left W x H (texelFetch at the fragment's own pixel), so a chart of another size reallocates
  // nothing. The rows past W x H are never read: each stroke clears its own scissored box first.)
  // (R17: the target is looked at once a frame, not trusted. A stroke is a pass into it and a composite out of it, so a target that was lost (its
  // texture or framebuffer gone with a context made again, or let go under memory pressure) or was never complete (an allocation the driver
  // refused) made every stroke vanish while the fills, which need no target, kept drawing. A target that is gone or incomplete is made again.)
  let covOk = false;
  function coverTarget() {
    // alloc-rare: the coverage target is made the first time one is needed and kept (the shared one, or the chart's own)
    const c = shown ? (shared.cov ||= { tex: gl.createTexture(), fb: gl.createFramebuffer(), w: 0, h: 0 }) : ownCov;
    if (!covOk) {
      covOk = true;
      if (c.w && (gl.isTexture(c.tex) === false || gl.isFramebuffer(c.fb) === false)) {
        // alloc-rare: only when the target was lost
        c.tex = gl.createTexture(); c.fb = gl.createFramebuffer(); c.w = c.h = 0; sharedStats.covRemade++;
      }
    }
    if (c.w < W || c.h < H) {
      const nw = Math.max(c.w, capOf(W)), nh = Math.max(c.h, capOf(H));
      gl.bindTexture(gl.TEXTURE_2D, c.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, nw, nh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      // alloc-rare: the coverage target is made the first time one is needed and kept (the shared one, or the chart's own)
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      gl.bindFramebuffer(gl.FRAMEBUFFER, c.fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, c.tex, 0);
      // (an incomplete target is not kept as grown: the next stroke makes it again, from nothing)
      if (fbComplete(gl, gl.FRAMEBUFFER, 'rgba8', nw, nh)) { c.w = nw; c.h = nh; } else { c.w = c.h = 0; sharedStats.covRemade++; }
      sharedStats.covAllocs++;
    }
    covTex = c.tex; fbo = c.fb;
  }

  // (U2: the card canvas holds the whole buffer (bw x bh device px). It is shown at that size in CSS px, drawn from the box's top left, and
  // moved up and clipped so that only the chart's lower-left W x H shows, exactly over its box. Written only when a number changes.)
  let plW = -1, plH = -1, plBW = -1, plBH = -1, plK = -1;
  function place(bw, bh) {
    if (plW === W && plH === H && plBW === bw && plBH === bh && plK === K) return;
    plW = W; plH = H; plBW = bw; plBH = bh; plK = K;
    const st = canvas.style;
    if (bw === W && bh === H) { st.width = st.height = st.translate = st.clipPath = ''; return; }
    const dy = (bh - H) / K, dx = (bw - W) / K;
    st.width = `${bw / K}px`; st.height = `${bh / K}px`; st.translate = `0 ${-dy}px`; st.clipPath = `inset(${dy}px ${dx}px 0px 0px)`;
  }
  // alloc-rare: made once with the chart (createTraceGL runs once for a chart), never in a frame
  const api = {
    canvas,
    // (The ?perf surfaces list: whether the drawer's picture is the one on show (it hides the host as it lays one), and whether the drawer can no longer draw.)
    get presented() { return host.style.opacity === '0'; },
    get gone() { return dead || failed || lost; },
    // ── For a drawer that shares this chart's context (the Doppler's trace, doppler-gl.js; pure-GPU plan B1: one context for the cards' drawings) ──
    /** The context this chart draws in now (null where it cannot draw), and which build of it this is: with the context, gen changes whenever it is made again (and the context itself when the chart moves to another pool). */
    glNow() { return lost || failed || dead || gl.isContextLost() ? null : gl; },
    get gen() { return shown ? shared.gen : gen; },
    /** The glyph atlas texture of the context the chart draws in (the pool's one copy), for a sharer that sets glyphs from it (vitals-gl.js); null before it is made. */
    get atlas() { return atlasIn ? atlasTex : null; },
    /** Enters the open frame for a pass of the sharer's own: what the chart batched is laid first, scissor and clip are off. Null where no frame is open. leave() gives the chart's state back. */
    enter() {
      if (!inFrame || !P || lost || failed || dead || gl.isContextLost()) return null;
      flush();
      gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST);
      return gl;
    },
    leave() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, outFb); gl.bindVertexArray(null); gl.useProgram(null); gl.activeTexture(gl.TEXTURE0);
      gl.viewport(0, 0, W, H); clipState(); scissor(clipR);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    },
    // alloc-rare: made once with the chart (createTraceGL runs once for a chart), never in a frame
    get ready() {
      // (R10: still compiling, the draw is not where it is published: the chart keeps what it shows, the poller publishes it as soon as
      // the driver is done and draws it then. ?shaderready=0: published here, as before.)
      if (!P && !failed && !dead && started && stillCompiling(gl, progList(started))) { missed = true; stopPoll?.want?.(); return false; }
      missed = false;   // (published here, the frame asking draws it: no second draw from publish)
      publish();
      if (!glyphImage && redraw && !dead) waiting.add(redraw);
      if (!P || lost || failed || dead || gl.isContextLost() || !glyphImage) return false;
      if (shown && shared.atlasIn) atlasIn = true;
      if (!atlasIn) {
        // (Review pass 2, item 2: the glyphs' 1 MB field is never sent inside the frame that first asks for it. It goes up as the
        // programs are published (publish) or, if the picture was decoded later, at the next idle moment, and the chart is drawn then.)
        sendAtlasSoon(); return false;
      }
      return true;
    },
    /** Starts a frame over a chart w × h CSS px, drawn at Wd × Hd device px. False: the GPU cannot draw now (the 2D canvas draws the chart). */
    begin(w, h, Wd, Hd) {
      if (!api.ready || w < 1 || h < 1) { api.hide(); return false; }
      if (!bigNoted && bigLayer(Wd, Hd)) { bigNoted = true; caught('trace-gl:big-layer', new Error(`a chart layer of ${Wd} x ${Hd} device px went through the shared pool: every hand-over copies the whole buffer`)); }   // alloc-rare: once per page
      if (shown) {
        // (Another chart's frame still open in the shared context is finished first: its picture handed over before this one starts.)
        if (shared.active && shared.active !== api) shared.active.end();
        shared.active = api;
        // (U2: the one buffer grows to the largest chart in CAP_STEP steps; a smaller chart draws in its lower left.)
        // (It shrinks again once no chart has needed its size for a second (SHRINK_MS): every hand-over transfers the WHOLE buffer, so
        // after one full-screen layer drew (the lobule's leaders, 3700 x 2400 device px on a Mac) each small card chart handed over a
        // 9 MP picture, and its card canvas held one: svg-gl 163 ms a frame in the lobule, 5 fps (4 Nov 2026, Mohammad's ?perf).)
        const t = performance.now();
        if (!(t - shared.winT0 <= SHRINK_MS)) { shared.lastW = shared.winW || 0; shared.lastH = shared.winH || 0; shared.winW = 0; shared.winH = 0; shared.winT0 = t; }
        if (Wd > shared.winW) shared.winW = Wd;
        if (Hd > shared.winH) shared.winH = Hd;
        const fitW = capOf(Math.max(shared.lastW, shared.winW)), fitH = capOf(Math.max(shared.lastH, shared.winH));
        if (glCanvas.width < Wd || glCanvas.height < Hd || glCanvas.width > fitW || glCanvas.height > fitH) {
          glCanvas.width = Math.max(fitW, capOf(Wd)); glCanvas.height = Math.max(fitH, capOf(Hd)); sharedStats.resizes++;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindVertexArray(null); gl.useProgram(null);
        gl.clearStencil(0); gl.stencilMask(0xff);
      }
      if (!shown && (canvas.width !== Wd || canvas.height !== Hd)) { canvas.width = Wd; canvas.height = Hd; }   // (a shared chart's canvas takes the buffer's size from the hand-over)
      W = Wd; H = Hd; K = Wd / w;
      gl.viewport(0, 0, W, H);
      gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST);
      if (shown) { gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, W, H); }   // (only the chart's own W x H of the larger buffer is cleared)
      gl.clearColor(0, 0, 0, 0); gl.clear(shown ? gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT : gl.COLOR_BUFFER_BIT);
      if (shown) gl.disable(gl.SCISSOR_TEST);
      if (under) {
        // (A picture of the chart's own drawn first in this context, under the words: gen changes when the context is made again,
        // so its programs and textures are made again.)
        try { under(gl, W, H, gen); } catch (e) { console.warn('Charts on the GPU: the picture under the chart failed.', e); }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindVertexArray(null); gl.useProgram(null); gl.activeTexture(gl.TEXTURE0);
        gl.viewport(0, 0, W, H); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      }
      gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      clipR = null; clipOn = false; inFrame = true; textN = boxN = 0; covOk = false;
      return true;
    },
    /** Ends the frame (what is batched is drawn) and shows the GPU's picture in place of the 2D canvas's. */
    end() {
      if (!inFrame) return lastEnd;
      flush(); gl.bindVertexArray(null); inFrame = false;
      if (dropAfter) { dropAfter = false; dropLayers(); }
      else if (layers.size) holdLayers();
      // (B09: the picture's hand-over can throw (a lost or starved context). Then the chart's own picture is not hidden and the page's
      // host keeps showing, the last completed picture stays in the canvas, and the caller is told: false. A bitmap made but not taken
      // is closed.)
      let ok = true;
      if (shown) {
        if (shared.active === api) shared.active = null;
        sharedStats.transfers++; notePass('transfer', W * H);
        let bmp = null;
        try { bmp = glCanvas.transferToImageBitmap(); shown.transferFromImageBitmap(bmp); bmp = null; place(glCanvas.width, glCanvas.height); } catch (e) { ok = false; console.warn('Charts on the GPU: the picture could not be handed over.', e); }
        if (bmp) { try { bmp.close?.(); } catch { /* already gone */ } }
      }
      if (ok) {
        if (canvas.style.visibility) canvas.style.visibility = '';
        if (host.style.opacity !== '0') host.style.opacity = '0';
      }
      return (lastEnd = ok);
    },
    /** The picture on show cleared without drawing a frame (no buffer sized, nothing handed over): true when it was. Only for a chart in the
     *  shared context (its canvas takes pictures); a chart with a context of its own draws an empty frame instead. */
    clearShown() {
      if (!shown || dead || inFrame) return false;
      try { shown.transferFromImageBitmap(null); } catch (e) { caught('trace-gl:clearShown', e); return false; }
      return true;
    },
    /** The 2D canvas draws the chart (shown again); the GPU's picture is hidden. */
    hide() {
      // (A completed GPU picture stays through a frame the GPU cannot draw (a program still compiling, a pool move, a restore): its page look is out of
      // the way, so a hidden picture would leave a hole, and the retry (missed/redraw) draws it again. A widget always keeps it; any other chart keeps it
      // while the GPU can still come back. Only a chart whose GPU is gone for good (failed or dead) shows the page's own drawing.)
      if ((keep || (!failed && !dead)) && host.style.opacity === '0') return;
      if (canvas.style.visibility !== 'hidden') canvas.style.visibility = 'hidden';
      if (host.style.opacity) host.style.opacity = '';
    },
    // (The rectangle is copied into the drawer's own: the shim's states each hold theirs, and a state given back would change this one.)
    clip(r) { flush(); if (!r) clipR = null; else { clipR = clipBox; clipBox[0] = r[0]; clipBox[1] = r[1]; clipBox[2] = r[2]; clipBox[3] = r[3]; } },
    measure,
    /**
     * A stroke through pieces of line (CSS px): xs, ys (n points; a NaN starts a new piece). o: { alpha, paint (a colour or a gradient),
     * dash: [on, off, …] (CSS px, the first dashN of them), offset (CSS px), round: round ends (true) or butt }.
     */
    line(xs, ys, n, style, width, o = NO_OPTS) {
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
          s += Math.sqrt((x - px) * (x - px) + (y - py) * (y - py));
          first = m;
        }
        if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
        px = x; py = y;
      }
      if (first >= 0 && m) segData[m - 1] += 2;
      const count = m / 6;
      if (!count) return;
      const hw = (width * K) / 2, pad = hw + 2;
      const r = inter((bx0 - pad) / K, (by0 - pad) / K, (bx1 - bx0 + 2 * pad) / K, (by1 - by0 + 2 * pad) / K);
      if (!r) return;
      coverTarget();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      if (!scissor(r)) { gl.bindFramebuffer(gl.FRAMEBUFFER, outFb); return; }
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(P.seg.p);
      ucOf(gl).f2(P.seg.u.res, W, H); ucOf(gl).f1(P.seg.u.hw, hw);
      const dash = o.dash && o.dashN >= 2 && o.dash[0] + o.dash[1] > 0 ? o.dash : null;
      ucOf(gl).f3(P.seg.u.dash, dash ? Math.max(1e-3, dash[0]) * K : 0, dash ? dash[1] * K : 0, (o.offset || 0) * K);
      ucOf(gl).i1(P.seg.u.cap, o.round === false ? 0 : 1);
      gl.bindVertexArray(segVao); gl.bindBuffer(gl.ARRAY_BUFFER, segBuf);
      gl.bufferData(gl.ARRAY_BUFFER, segData, gl.STREAM_DRAW, 0, m);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
      gl.bindFramebuffer(gl.FRAMEBUFFER, outFb);
      gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(P.comp.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, covTex); ucOf(gl).i1(P.comp.u.cov, 0);
      ucOf(gl).f2(P.comp.u.res, W, H); ucOf(gl).f1(P.comp.u.k, K);
      setPaint(P.comp.u, style, o.alpha ?? 1);
      gl.bindVertexArray(quadVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    /** A path's pieces p0 up to p1 filled by the nonzero rule, as the 2D canvas fills a path: the points are b (x, y pairs, CSS px), a piece's
     *  start is st[p] and the last one ends at `end`. */
    poly(b, st, p0, p1, end, style, alpha = 1) {
      flush();
      let n = 0;
      for (let q = p0; q < p1; q++) { const len = (q + 1 < p1 ? st[q + 1] : end) - st[q]; if (len >= 6) n += (len / 2 - 2) * 3; }
      if (!n) return;
      fillData = grow(fillData, n * 2);
      let m = 0, bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (let q = p0; q < p1; q++) {
        const a = st[q], e = q + 1 < p1 ? st[q + 1] : end;
        if (e - a < 6) continue;
        for (let i = a; i < e; i += 2) { const x = b[i], y = b[i + 1]; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
        for (let i = a + 2; i + 3 < e; i += 2) { fillData[m++] = b[a]; fillData[m++] = b[a + 1]; fillData[m++] = b[i]; fillData[m++] = b[i + 1]; fillData[m++] = b[i + 2]; fillData[m++] = b[i + 3]; }
      }
      const r = inter(bx0 - 1, by0 - 1, bx1 - bx0 + 2, by1 - by0 + 2);
      if (!r || !scissor(r)) return;
      gl.useProgram(P.fill.p);
      ucOf(gl).f2(P.fill.u.res, W, H); ucOf(gl).f1(P.fill.u.k, K);
      gl.bindVertexArray(fillVao); gl.bindBuffer(gl.ARRAY_BUFFER, fillBuf);
      // (A convex piece alone, three corners or a fan that never folds, needs no stencil: most fills in the charts are one.)
      // (the windings in the stencil's low bits, counted only inside the clip when there is one; its top bit is the clip's)
      gl.stencilMask(0x7f); gl.clearStencil(0); gl.clear(gl.STENCIL_BUFFER_BIT);
      gl.enable(gl.STENCIL_TEST);
      gl.colorMask(false, false, false, false);
      if (clipOn) gl.stencilFunc(gl.EQUAL, 0x80, 0x80); else gl.stencilFunc(gl.ALWAYS, 0, 0);
      gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP);
      gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP);
      gl.bufferData(gl.ARRAY_BUFFER, fillData, gl.STREAM_DRAW, 0, m);
      gl.drawArrays(gl.TRIANGLES, 0, m / 2);
      gl.colorMask(true, true, true, true);
      gl.stencilMask(0);
      gl.stencilFunc(gl.NOTEQUAL, 0, 0x7f);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      fillData[0] = r[0]; fillData[1] = r[1]; fillData[2] = r[0] + r[2]; fillData[3] = r[1]; fillData[4] = r[0]; fillData[5] = r[1] + r[3]; fillData[6] = r[0] + r[2]; fillData[7] = r[1] + r[3];
      setPaint(P.fill.u, style, alpha);
      gl.bufferData(gl.ARRAY_BUFFER, fillData, gl.STREAM_DRAW, 0, 8);
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
      // (A picture shaded here, into a texture of this context (shade), has its first row at the foot: laid with a negative height, as the kept layers are.)
      ucOf(gl).f2(P.img.u.res, W, H); ucOf(gl).f1(P.img.u.k, K); if (e.fb) ucOf(gl).f4(P.img.u.box, x, y + h, w, -h); else ucOf(gl).f4(P.img.u.box, x, y, w, h); ucOf(gl).f1(P.img.u.ga, alpha);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, e.tex); ucOf(gl).i1(P.img.u.img, 0);
      gl.bindVertexArray(unitVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null);
    },
    /** A picture taken up as the texture kept under key, unless it holds this ver already (a canvas from another context: copied on the GPU).
     *  Returns its entry, or null where the drawer cannot draw now. */
    upload(src, key = src, ver = 0) {
      if (!P || lost || failed || dead || gl.isContextLost()) return null;
      let e = images.get(key);
      if (!e || e.ver !== ver || e.img !== src) {
        if (!e) {
          // (a few kept at most: the oldest let go)
          if (images.size >= 6) { const [k0, e0] = images.entries().next().value; dropImage(e0); images.delete(k0); }
          const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
          for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);   // alloc-rare: an image goes up to the GPU once (the first time it is drawn, then kept by its key)
          e = { tex }; images.set(key, e);   // alloc-rare: an image goes up to the GPU once
        }
        gl.bindTexture(gl.TEXTURE_2D, e.tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        // (Review pass item 5/6: the same size again is written into the storage there, texSubImage2D, not specified afresh.)
        const sw = src.width || src.videoWidth || 0, sh = src.height || src.videoHeight || 0;
        if (e.w === sw && e.h === sh && sw > 0) { gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, src); sharedStats.subUploads++; }
        else { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); e.w = sw; e.h = sh; sharedStats.uploads++; }
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        notePass('upload', sw * sh);
        e.ver = ver; e.img = src;
      }
      return e;
    },
    /**
     * A picture shaded by the sharer (endo-gl.js: the endoscopy field) straight into the texture kept under key, res × res, from where
     * image(null, …, key) lays it: nothing is copied from another context. drawer.draw(gl, res) draws it with the target bound and
     * the viewport set (no blending, scissor or clip); true when it drew. Inside an open frame the chart's batched draws are laid first and
     * its state given back after.
     */
    shade(key, ver, res, drawer) {
      if (lost || failed || dead || gl.isContextLost() || !(res > 0)) return false;
      const inF = inFrame;
      if (inF) flush(); else if (shown && shared.active && shared.active !== api) shared.active.end();   // (another chart's frame still open here is finished first)
      let e = images.get(key);
      if (e && !e.fb) return false;   // (that key holds an uploaded picture)
      if (!e) {
        if (images.size >= 6) { const [k0, e0] = images.entries().next().value; dropImage(e0); images.delete(k0); }
        e = { tex: gl.createTexture(), fb: gl.createFramebuffer(), w: 0, h: 0, ver: -1, img: null };   // alloc-rare: a shaded picture's texture and target are made once, the first time its key is shaded
        gl.bindTexture(gl.TEXTURE_2D, e.tex);
        for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);   // alloc-rare: as above
        images.set(key, e);
      }
      let ok;
      try {
        if (e.w !== res || e.h !== res) {
          gl.bindTexture(gl.TEXTURE_2D, e.tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, res, res, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          gl.bindFramebuffer(gl.FRAMEBUFFER, e.fb);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, e.tex, 0);
          e.w = e.h = res;
        } else gl.bindFramebuffer(gl.FRAMEBUFFER, e.fb);
        gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST); gl.disable(gl.BLEND);
        gl.viewport(0, 0, res, res);
        ok = drawer.draw(gl, res) === true;
        if (ok) { e.ver = ver; e.img = drawer; }
      } catch (er) { caught('trace-gl:shade', er); ok = false; }
      finally {
        if (inF) api.leave();
        else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindVertexArray(null); gl.useProgram(null); gl.activeTexture(gl.TEXTURE0); }
      }
      return ok;
    },
    /** The picture kept under `from` kept on under `to` (its texture moved, nothing copied): a fade's old picture. */
    keepImage(from, to) {
      const e = images.get(from);
      if (!e) return false;
      const old = images.get(to);
      if (old && old !== e) dropImage(old);
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
      const o = boxN * 14;
      boxData[o] = x; boxData[o + 1] = y; boxData[o + 2] = w; boxData[o + 3] = h; boxData[o + 4] = Math.max(0, r); boxData[o + 5] = sw < 0 ? sw : stroke ? sw : 0;
      if (typeof fill === 'string') premulInto(boxData, o + 6, fill, alpha); else boxData.fill(0, o + 6, o + 10);
      if (typeof stroke === 'string' && sw > 0) premulInto(boxData, o + 10, stroke, alpha); else boxData.fill(0, o + 10, o + 14);
      boxN++;
    },
    /** Takes a rounded box (CSS px, the canvas's own, no transform) out of what is drawn so far: each pixel kept by one less `alpha`
     *  (a glass lying over this layer: the labels under it are left out, as the GPU's glass does for the figure's labels). */
    erase(x, y, w, h, r, alpha = 1) {
      if (!(alpha > 0)) return;
      flush();
      gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
      this.box(x, y, w, h, r, WHITE_INK, null, 0, Math.min(1, alpha));   // colour-exempt: an eraser's ink, only its coverage counts
      flush();
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    },
    /** Words at (x, y) (CSS px) in `font`, aligned as the 2D canvas aligns them. sw: the words' outline that wide instead of the words.
     *  turn: [ox, oy, angle] turns them about (ox, oy) (CSS px) by the angle (radians, clockwise on the page, as the 2D canvas's rotate). */
    text(str, x, y, font, color, align = 'left', base = 'alphabetic', alpha = 1, sw = 0, turn = null, ls = 0) {
      // alloc-rare: only when the argument is not already a string (the 2D canvas converts it the same way); a string is not copied
      if (typeof str !== 'string') str = String(str);
      if (!str || typeof color !== 'string') return;
      // (An outline is laid as coverage first, glyph by glyph with MAX blending, then painted once in its colour: as the 2D canvas strokes
      // a line of words in one go. Blended glyph by glyph, a see-through outline came out darker where two letters' outlines met.)
      if (boxN || sw) flush();
      const tint = TINT;
      if (premulInto(tint, 0, color, alpha) <= 0) return;
      const f = fontOf(font), g = GLYPHS[f.w], kw = KERN[f.w], s = f.px / BASE, sk = s * K;
      // (An outline never reaches past the atlas's field, which ends (1 - CUTOFF) * RADIUS atlas px from a glyph's edge: wider, the whole
      // glyph's cell read as inside it and the outline drew as a box, FibroScan's "kPa" on a dark block, 2 Nov 2026.)
      const hwd = sw ? Math.min((sw / 2) * K, (1 - CUTOFF) * RADIUS * sk - 0.75) : 0;
      const ink = sw ? WHITE : tint;
      let qx0 = Infinity, qy0 = Infinity, qx1 = -Infinity, qy1 = -Infinity;
      // (ls: letter spacing (CSS px), added after every character as the 2D canvas's letterSpacing and CSS add it, the last one too.)
      const width = measure(str, font) + (ls ? ls * pointsIn(str) : 0);
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
          textData.set(ink, o + 8);
          textData[o + 12] = sk; textData[o + 13] = hwd;
          if (sw) { qx0 = Math.min(qx0, textData[o]); qy0 = Math.min(qy0, textData[o + 1]); qx1 = Math.max(qx1, textData[o] + textData[o + 2]); qy1 = Math.max(qy1, textData[o + 1] + textData[o + 3]); }
          textData[o + 14] = rx; textData[o + 15] = ry; textData[o + 16] = rc; textData[o + 17] = rs;
          textN++;
        }
        cx += e[0] * f.px + ls;
        prev = ch;
      }
      if (sw && textN) { if (turn) outline(TINT, 0, 0, W / K, H / K); else outline(TINT, qx0 / K - 1, qy0 / K - 1, (qx1 - qx0) / K + 2, (qy1 - qy0) / K + 2); }
    },
    /**
     * A 2D context for the chart's own drawing code, w × h CSS px at Wd × Hd device px, drawn by the GPU; null where it cannot draw now
     * (the chart then takes fitCanvas's pen, which draws nothing, and is drawn again once the GPU can). The frame ends with the context's end().
     */
    ctx2d(w, h, Wd, Hd) {
      if (!api.begin(w, h, Wd, Hd)) { missed = true; return null; }
      return shim.reset(K);
    },
    /**
     * R16: the still parts of a chart (axes, grid, ticks, units, fixed labels) kept as a picture on the GPU. draw() is called, into the
     * layer's own texture, only when sig (what those parts are drawn from: the layout, the scale, the theme's colours) or the canvas's size
     * changed, or the context was made again; every other frame lays the kept picture, one textured quad, with no path, word or buffer
     * built by the CPU. Inside a clip it simply draws (the layer is the whole canvas).
     */
    keep(name, sig, draw) {
      if (!inFrame || !P || clipR || clipOn || outFb) { draw(); return false; }
      flush();
      let e = layers.get(name);
      if (e && e.gen !== gen) { layers.delete(name); e = null; }   // (a context made again holds none of the old ones)
      if (!e) {
        if (layers.size >= 4) { const [k0, e0] = layers.entries().next().value; dropLayer(e0); layers.delete(k0); }
        // alloc-rare: a kept layer is made the first time its name is drawn and kept by name after (layers holds at most four)
        e = { tex: gl.createTexture(), fb: gl.createFramebuffer(), rb: gl.createRenderbuffer(), w: 0, h: 0, gen, sig: null };
        layers.set(name, e);
      }
      if (e.w !== W || e.h !== H) {
        gl.bindTexture(gl.TEXTURE_2D, e.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        // alloc-rare: a kept layer is made the first time its name is drawn and kept by name after (layers holds at most four)
        for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
        gl.bindRenderbuffer(gl.RENDERBUFFER, e.rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.STENCIL_INDEX8, W, H); gl.bindRenderbuffer(gl.RENDERBUFFER, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, e.fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, e.tex, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.STENCIL_ATTACHMENT, gl.RENDERBUFFER, e.rb);
        const okFb = fbComplete(gl, gl.FRAMEBUFFER, 'rgba8+s8', W, H);   // (asked per framebuffer, size and attachment set: gl-state.js)
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        if (!okFb) { dropLayer(e); layers.delete(name); draw(); return false; }
        e.w = W; e.h = H; e.sig = null;
      }
      if (e.sig !== sig) {
        outFb = e.fb; gl.bindFramebuffer(gl.FRAMEBUFFER, e.fb);
        gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST);
        gl.clearColor(0, 0, 0, 0); gl.stencilMask(0xff); gl.clearStencil(0); gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
        try { draw(); flush(); } finally {
          outFb = null; gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          clipR = null; clipOn = false; gl.disable(gl.STENCIL_TEST); gl.disable(gl.SCISSOR_TEST); gl.stencilMask(0xff);
          gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        }
        e.sig = sig;
      }
      // (laid texel for texel, premultiplied over what is drawn so far, as its draws would have been; the texture's first row is the foot)
      gl.disable(gl.SCISSOR_TEST);
      gl.useProgram(P.img.p);
      ucOf(gl).f2(P.img.u.res, W, H); ucOf(gl).f1(P.img.u.k, K); ucOf(gl).f4(P.img.u.box, 0, H / K, W / K, -H / K); ucOf(gl).f1(P.img.u.ga, 1);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, e.tex); ucOf(gl).i1(P.img.u.img, 0);
      gl.bindVertexArray(unitVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null);
      return true;
    },
    // alloc-rare: made once with the chart (createTraceGL runs once for a chart), never in a frame
    get lost() { return (lost && !parked && !back) || failed; },   // (a parked chart is not lost: it draws again on its return)
    /** True while the chart is off the screen and its context given back (drawn again by redraw when it returns). */
    // alloc-rare: made once with the chart (createTraceGL runs once for a chart), never in a frame
    get parked() { return parked; },
    dispose() {
      if (dead) return;   // (idempotent: the listeners, the size subscription and the atlas wait are let go once)
      dead = true; stopPoll?.(); clearTimeout(parkT); seen?.disconnect();
      unsized?.(); unsized = null;
      if (redraw) waiting.delete(redraw);
      glCanvas.removeEventListener?.('webglcontextlost', onLost); glCanvas.removeEventListener?.('webglcontextrestored', onRestored);
      freeOwn();
      try {
        if (!shown) gl.deleteTexture(atlasTex);
        // alloc-rare: teardown, when the chart is let go, never in a frame
        if (P && !shown) for (const k of Object.keys(P)) gl.deleteProgram(P[k].p);   // (shared: the programs and the field stay for the others)
      } catch (e) { caught('trace-gl:1029', e); /* a lost context holds nothing */ }
      if (shown && shared.active === api) shared.active = null;
      if (shown) shared.users = Math.max(0, shared.users - 1);
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
export function createShim(G) {
  const TAU = Math.PI * 2;
  let st = null, K = 1;
  const GR = [];   // alloc-rare: made once with the shim (the gradients handed out, round and round: grN of them are out in this frame)
  let grN = 0;
  const stack = [];   // alloc-rare: made once with the shim
  const keepSlots = [];   // alloc-rare: made once with the shim
  let keepDepth = 0;
  // The path, kept in rows that are written in place and grow only when a path is longer than any before (nothing is made for a path in a frame):
  //   pb: the points of every piece, x, y pairs (in the drawing's own space, the transform already applied); pn: the numbers used.
  //   ps: where each piece starts in pb (piece q ends where q + 1 starts, the last where pb is used up); pc: the pieces.
  //   curOn: the last piece is the open one (a lineTo goes on with it); the pieces before pcB, and the shapes before shB, are an outer
  //   path's, kept while a keep() draws (beginPath starts above them).
  //   sh: the whole shapes (x, y, w, h, r) a fill of them draws as boxes; shn: how many; only: the path is made of those and nothing else.
  let pb = new Float64Array(2048), ps = new Int32Array(64), sh = new Float64Array(80);   // alloc-rare: made once with the shim
  let pn = 0, pc = 0, curOn = false, pcB = 0, pnB = 0, shn = 0, shB = 0, only = true;
  const LP = new Float64Array(2);   // alloc-rare: made once with the shim (lx, ly: the path's last point in the drawing's own space; a number kept in a closure's variable is a heap object made anew at each assignment)
  let sx = new Float32Array(1024), sy = new Float32Array(1024);   // alloc-rare: made once with the shim (a stroke's points, kept from frame to frame)
  // The clip paths of the states, kept the same way: entry i is the path of the i-th clip() of the states now open (nested as save and restore
  // are), its pieces up to ep[i] (ep, en: where its pieces and its points end), so a state remembers its clips by how many it has.
  const CL = { b: new Float64Array(256), st: new Int32Array(16), ep: new Int32Array(8), en: new Int32Array(8) };   // alloc-rare: made once with the shim
  const DSA = new Float64Array(16);   // alloc-rare: made once with the shim (a stroke's dashes, scaled)
  const spare = [];   // alloc-rare: made once with the shim (the states given back by restore, used again by the next save)
  const STO = { alpha: 1, dash: null, dashN: 0, offset: 0, round: true };   // alloc-rare: made once with the shim (a stroke's options, written in place)
  const GP = { grad: null, rad: null, offs: null, cols: null, n: 0, inv: null };   // alloc-rare: made once with the shim (a gradient fill's paint)
  const INV = new Float64Array(6), MT = { width: 0 }, GT = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };   // alloc-rare: made once with the shim (a gradient's matrix back, measureText's and getTransform's answers: read at once by every caller, written again by the next call)
  // alloc-rare: a state is made only until the stack has been this deep once
  const fresh = () => ({ ls: 0, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic', globalAlpha: 1, dash: new Float64Array(16), dn: 0, lineDashOffset: 0, clip: null, clipA: [0, 0, 0, 0], nClip: 0, m: null, mA: new Float64Array(6) });   // colour-exempt: the 2D canvas's own defaults; alloc-rare: a state is made only until the stack has been this deep once
  // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
  const defaults = (t) => { t.ls = 0; t.fillStyle = '#000'; t.strokeStyle = '#000'; t.lineWidth = 1; t.lineCap = 'butt'; t.lineJoin = 'miter'; t.font = '10px sans-serif'; t.textAlign = 'start'; t.textBaseline = 'alphabetic'; t.globalAlpha = 1; t.dn = 0; t.lineDashOffset = 0; t.clip = null; t.nClip = 0; t.m = null; return t; };   // colour-exempt: the 2D canvas's own defaults
  // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
  const grow1 = (a, n, T) => { let q = a.length; while (q < n) q *= 2; const b = new T(q); b.set(a); return b; };
  const needPts = (n) => { if (pb.length < n) pb = grow1(pb, n, Float64Array); };   // alloc-rare: grows only for a path longer than any before
  const needPieces = (n) => { if (ps.length < n) ps = grow1(ps, n, Int32Array); };   // alloc-rare: grows only for a path of more pieces than any before
  // The transform (m: [a, b, c, d, e, f], null for none), as the 2D canvas's, over the drawer's own device scale. Paths are kept on the page.
  // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
  const X = (x, y) => (st.m ? st.m[0] * x + st.m[2] * y + st.m[4] : x), Y = (x, y) => (st.m ? st.m[1] * x + st.m[3] * y + st.m[5] : y);
  // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
  const moved = () => !st.m || (st.m[0] === 1 && st.m[1] === 0 && st.m[2] === 0 && st.m[3] === 1);   // (no turn or scale: shapes stay shapes)
  // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
  const ox = () => (st.m ? st.m[4] : 0), oy = () => (st.m ? st.m[5] : 0);
  // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
  const putPt = (x, y) => { needPts(pn + 2); pb[pn++] = x; pb[pn++] = y; };
  // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
  const openPiece = () => { needPieces(pc + 1); ps[pc++] = pn; curOn = true; };
  // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
  const startPiece = (x, y) => { LP[0] = x; LP[1] = y; openPiece(); putPt(X(x, y), Y(x, y)); };
  // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
  const add = (x, y) => { if (!curOn) { startPiece(x, y); return; } LP[0] = x; LP[1] = y; putPt(X(x, y), Y(x, y)); };
  // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
  const pieceLen = () => pn - ps[pc - 1];   // (the numbers in the open piece)
  const addShape = (x, y, w, h, r) => { if (sh.length < (shn + 1) * 5) sh = grow1(sh, (shn + 1) * 5, Float64Array); const o = shn++ * 5; sh[o] = x; sh[o + 1] = y; sh[o + 2] = w; sh[o + 3] = h; sh[o + 4] = r; };   // alloc-rare: grows only for a path of more shapes than any before
  // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
  const sc = () => (st.m ? Math.sqrt(Math.abs(st.m[0] * st.m[3] - st.m[1] * st.m[2])) || 1 : 1);
  // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
  const textAt = (t, x, y, colour, sw) => {
    const m = st.m, ang = m ? Math.atan2(m[1], m[0]) : 0, px = X(x, y), py = Y(x, y);
    if (ang) { TURN[0] = px; TURN[1] = py; TURN[2] = ang; }
    // (Two text policies, R07. Constant screen size (the default): the transform places and turns the words, their size is the font's, as
    // a caller that sizes its own words for the screen (svg-gl.js) sets it. Layer-scaled (ctx.textScale = true): the transform's scale carries
    // the glyphs too, with their letter spacing and outline, as it carries a line's width.)
    const k = textScaled ? sc() : 1;
    G.text(t, px, py, k === 1 ? st.font : scaledFont(st.font, k), colour, align(), st.textBaseline, st.globalAlpha, sw * k, ang ? TURN : null, st.ls * k);
  };
  let textScaled = false, sfK = 0;   // alloc-rare: made once with the shim (the policy, and the scale the scaled font texts below were made for)
  const sfMap = new Map();   // alloc-rare: made once with the shim (font text → its scaled text at sfK: a frame of mixed-size runs makes each once)
  // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
  const scaledFont = (font, k) => {
    if (k !== sfK) { sfK = k; sfMap.clear(); }
    let f = sfMap.get(font);
    if (f === undefined) {
      if (sfMap.size > 32) sfMap.clear();
      f = font.replace(/([\d.]+)px/, `${(fontOf(font).px * k).toFixed(3)}px`);   // alloc-rare: only when a font text is first met at this scale
      sfMap.set(font, f);
    }
    return f;
  };
  const TURN = new Float64Array(3);   // alloc-rare: made once with the shim (a turned word's centre and angle)
  // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
  const ellPts = (cx, cy, rx, ry, rot, a0, a1, ccw) => {
    let sweep = a1 - a0;
    if (!ccw && sweep < 0) sweep = (sweep % TAU) + TAU; if (ccw && sweep > 0) sweep = (sweep % TAU) - TAU;
    if (Math.abs(a1 - a0) >= TAU) sweep = ccw ? -TAU : TAU;
    const n = Math.max(2, Math.ceil((Math.abs(sweep) * Math.max(1, Math.max(rx, ry) * K * sc())) / 3));
    const cr = Math.cos(rot), sr = Math.sin(rot);
    // (The points go straight into the row, the transform worked in the loop: a call for each point made two numbers each time.)
    needPts(pn + 2 * (n + 1) + 2);
    if (!curOn) openPiece();
    const m = st.m;
    let x = 0, y = 0;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (sweep * i) / n, u = rx * Math.cos(a), v = ry * Math.sin(a);
      x = cx + u * cr - v * sr; y = cy + u * sr + v * cr;
      pb[pn++] = m ? m[0] * x + m[2] * y + m[4] : x;
      pb[pn++] = m ? m[1] * x + m[3] * y + m[5] : y;
    }
    LP[0] = x; LP[1] = y;
  };
  // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
  const arcPts = (cx, cy, r, a0, a1, ccw) => ellPts(cx, cy, r, r, 0, a0, a1, ccw);
  // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
  const align = () => (st.textAlign === 'end' ? 'right' : st.textAlign === 'start' ? 'left' : st.textAlign);
  // (a gradient as it is filled: in the space of the transform it is filled under; written into INV, null for none)
  // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
  const inv = () => {
    const m = st.m;
    if (!m) return null;
    const a = m[0], b = m[1], c0 = m[2], d = m[3], e = m[4], f = m[5], det = a * d - b * c0 || 1;
    INV[0] = d / det; INV[1] = -b / det; INV[2] = -c0 / det; INV[3] = a / det; INV[4] = (c0 * f - d * e) / det; INV[5] = (b * e - a * f) / det;
    return INV;
  };
  // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
  const paintOf = (style) => {
    if (typeof style === 'string') return style;
    if (!(style && style.offs)) return 'transparent';
    GP.grad = style.grad; GP.rad = style.rad; GP.offs = style.offs; GP.cols = style.cols; GP.n = style.n; GP.inv = inv();
    return GP;
  };
  // (A clip by a path that is not a rectangle: its pieces of 3 points or more copied into the clip rows after the clips of the states open, and the drawer told.)
  // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
  const pushClip = () => {
    const i = st.nClip, p0 = i ? CL.ep[i - 1] : 0, n0 = i ? CL.en[i - 1] : 0;
    let np = 0, npts = 0;
    for (let q = pcB; q < pc; q++) { const len = (q + 1 < pc ? ps[q + 1] : pn) - ps[q]; if (len >= 6) { np++; npts += len; } }
    if (CL.ep.length < i + 1) { CL.ep = grow1(CL.ep, i + 1, Int32Array); CL.en = grow1(CL.en, i + 1, Int32Array); }   // alloc-rare: grows only for more clips open at once than ever before
    if (CL.st.length < p0 + np) CL.st = grow1(CL.st, p0 + np, Int32Array);   // alloc-rare: grows only for more clip pieces than ever before
    if (CL.b.length < n0 + npts) CL.b = grow1(CL.b, n0 + npts, Float64Array);   // alloc-rare: grows only for more clip points than ever before
    let pi = p0, w = n0;
    for (let q = pcB; q < pc; q++) {
      const a = ps[q], e = q + 1 < pc ? ps[q + 1] : pn;
      if (e - a < 6) continue;
      CL.st[pi++] = w;
      for (let k = a; k < e; k++) CL.b[w++] = pb[k];
    }
    CL.ep[i] = pi; CL.en[i] = w;
    st.nClip = i + 1;
    G.clipPaths(CL, st.nClip);
  };
  // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
  const c = {
    gpu: G,
    onGPU: true,   // (what a chart asks to know it draws through this; a real context has no such field)
    canvas: null,
    reset(k) {
      K = k; grN = 0;
      while (stack.length) spare.push(stack.pop());
      if (st) spare.push(st);
      st = defaults(spare.pop() || fresh());
      pn = pc = shn = pcB = pnB = shB = 0; curOn = false; only = true;
      return c;
    },
    /** R16: the still parts drawn by draw() kept as a GPU picture while sig holds (the drawer's keep); the context's state is as it was after. */
    keep(name, sig, draw) {
      // (The path state to put back, and the drawing to run, are kept in a slot for this depth: no array and no closure made for each call. The drawing's
      // own paths are made above the outer path's pieces and shapes, which stay as they were.)
      const k = keepDepth++, slot = keepSlots[k] || (keepSlots[k] = { pc: 0, pn: 0, shn: 0, curOn: false, only: true, pcB: 0, pnB: 0, shB: 0, draw: null, run: null });   // alloc-rare: a slot is made once for each depth of nesting
      slot.pc = pc; slot.pn = pn; slot.shn = shn; slot.curOn = curOn; slot.only = only; slot.pcB = pcB; slot.pnB = pnB; slot.shB = shB; slot.draw = draw;
      pcB = pc; pnB = pn; shB = shn;
      if (!slot.run) slot.run = () => { c.save(); try { slot.draw(); } finally { c.restore(); } };   // alloc-rare: made once for each depth of nesting
      try { return G.keep(name, sig, slot.run); } finally {
        slot.draw = null; keepDepth--;
        pc = slot.pc; pn = slot.pn; shn = slot.shn; curOn = slot.curOn; only = slot.only; pcB = slot.pcB; pnB = slot.pnB; shB = slot.shB;
      }
    },
    end() { return G.end(); },
    // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
    get fillStyle() { return st.fillStyle; }, set fillStyle(v) { st.fillStyle = v; },
    // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
    get strokeStyle() { return st.strokeStyle; }, set strokeStyle(v) { st.strokeStyle = v; },
    // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
    get lineWidth() { return st.lineWidth; }, set lineWidth(v) { if (v > 0) st.lineWidth = v; },
    // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
    get lineCap() { return st.lineCap; }, set lineCap(v) { st.lineCap = v; },
    // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
    get lineJoin() { return st.lineJoin; }, set lineJoin(v) { st.lineJoin = v; },
    // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
    get font() { return st.font; }, set font(v) { st.font = v; },
    // (The 2D canvas's letterSpacing, '0.72px'; the words are measured with it too.)
    // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
    /** Whether the transform's scale also carries the words' size, letter spacing and outline (R07); false: constant screen size. */
    get textScale() { return textScaled; }, set textScale(v) { textScaled = !!v; },
    get letterSpacing() { return lsText(st.ls); }, set letterSpacing(v) { st.ls = parseFloat(v) || 0; },
    // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
    get textAlign() { return st.textAlign; }, set textAlign(v) { st.textAlign = v; },
    // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
    get textBaseline() { return st.textBaseline; }, set textBaseline(v) { st.textBaseline = v; },
    // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
    get globalAlpha() { return st.globalAlpha; }, set globalAlpha(v) { if (v >= 0 && v <= 1) st.globalAlpha = v; },
    // alloc-rare: made once with the shim, which is made once with its chart, never in a frame
    get lineDashOffset() { return st.lineDashOffset; }, set lineDashOffset(v) { st.lineDashOffset = v; },
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
    // (A state's dashes are its own row of numbers, written in place: an odd list is read twice over, as the 2D canvas reads it.)
    setLineDash(d) {
      const n = d.length;
      if (!n) { st.dn = 0; return; }
      const row = st.dash, len = n % 2 ? Math.min(n, 8) : Math.min(n, 16);
      for (let i = 0; i < len; i++) row[i] = d[i];
      if (n % 2) { for (let i = 0; i < len; i++) row[len + i] = d[i]; st.dn = len * 2; } else st.dn = len;
    },
    // alloc-rare: the API hands back an array of its own; no chart asks for it
    getLineDash() { return Array.from(st.dash.subarray(0, st.dn)); },
    // (A state saved is copied into one given back by an earlier restore. The clip rectangle, the dashes and the transform are copied into the
    // saved state's own; its clip paths are the first nClip of the clip rows, which a later clip() writes past, never over.)
    save() {
      const t = spare.pop() || fresh();   // alloc-rare: a state is made only until the stack has been this deep once
      t.ls = st.ls; t.fillStyle = st.fillStyle; t.strokeStyle = st.strokeStyle; t.lineWidth = st.lineWidth; t.lineCap = st.lineCap; t.lineJoin = st.lineJoin;
      t.font = st.font; t.textAlign = st.textAlign; t.textBaseline = st.textBaseline; t.globalAlpha = st.globalAlpha;
      t.lineDashOffset = st.lineDashOffset; t.nClip = st.nClip;
      t.dn = st.dn; for (let i = 0; i < st.dn; i++) t.dash[i] = st.dash[i];
      if (st.m) { const a = st.m, b = t.mA; b[0] = a[0]; b[1] = a[1]; b[2] = a[2]; b[3] = a[3]; b[4] = a[4]; b[5] = a[5]; t.m = b; } else t.m = null;
      if (st.clip) { const a = t.clipA, b = st.clipA; a[0] = b[0]; a[1] = b[1]; a[2] = b[2]; a[3] = b[3]; t.clip = a; } else t.clip = null;
      stack.push(t);
    },
    restore() {
      if (!stack.length) return;
      const prev = st;
      st = stack.pop();
      const a = st.clip, b = prev.clip;
      if (a ? !b || a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2] || a[3] !== b[3] : b) G.clip(a);
      if (st.nClip !== prev.nClip) G.clipPaths(CL, st.nClip);
      spare.push(prev);
    },
    // (The drawer's device scale is its own: a chart's setTransform to its device pixels sets none here.)
    setTransform() { st.m = null; }, resetTransform() { st.m = null; },
    transform(a, b, c0, d, e, f) {
      const m = st.m;
      if (m) {
        const m0 = m[0], m1 = m[1], m2 = m[2], m3 = m[3], m4 = m[4], m5 = m[5];
        m[0] = m0 * a + m2 * b; m[1] = m1 * a + m3 * b; m[2] = m0 * c0 + m2 * d; m[3] = m1 * c0 + m3 * d; m[4] = m0 * e + m2 * f + m4; m[5] = m1 * e + m3 * f + m5;
      } else { const q = st.mA; q[0] = a; q[1] = b; q[2] = c0; q[3] = d; q[4] = e; q[5] = f; st.m = q; }
    },
    translate(dx, dy) { c.transform(1, 0, 0, 1, dx, dy); },
    rotate(a) { const co = Math.cos(a), si = Math.sin(a); c.transform(co, si, -si, co, 0, 0); },
    scale(x, y) { c.transform(x, 0, 0, y, 0, 0); },
    // (The answer is one record, written again by the next call: every caller reads it at once.)
    getTransform() {
      const m = st.m;
      GT.a = K * (m ? m[0] : 1); GT.b = K * (m ? m[1] : 0); GT.c = K * (m ? m[2] : 0); GT.d = K * (m ? m[3] : 1); GT.e = K * (m ? m[4] : 0); GT.f = K * (m ? m[5] : 0);
      return GT;
    },
    beginPath() { pc = pcB; pn = pnB; shn = shB; curOn = false; only = true; },
    /** Pieces made earlier (a word's outlines, cached by the caller) added to the open path in one go: `pts` x, y pairs from `starts[q]` to the
     *  next piece's start (the last ends at `n`), `np` pieces, drawn at (ox, oy) and scaled by `k`, through the transform. No call for a point. */
    addPolys(pts, starts, np, n, ox, oy, k = 1) {
      only = false;
      needPts(pn + n); needPieces(pc + np);
      const m = st.m;
      for (let q = 0; q < np; q++) {
        ps[pc++] = pn;
        const e = q + 1 < np ? starts[q + 1] : n;
        for (let i = starts[q]; i < e; i += 2) {
          const x = ox + pts[i] * k, y = oy + pts[i + 1] * k;
          pb[pn++] = m ? m[0] * x + m[2] * y + m[4] : x;
          pb[pn++] = m ? m[1] * x + m[3] * y + m[5] : y;
        }
      }
      curOn = false;
    },
    moveTo(x, y) { only = false; startPiece(x, y); },
    lineTo(x, y) { only = false; add(x, y); },
    closePath() { if (curOn && pieceLen() >= 4) { const a = ps[pc - 1], x = pb[a], y = pb[a + 1]; putPt(x, y); openPiece(); putPt(x, y); } },
    rect(x, y, w, h) {
      if (moved()) addShape(x + ox(), y + oy(), w, h, 0); else only = false;
      startPiece(x, y); add(x + w, y); add(x + w, y + h); add(x, y + h); add(x, y); curOn = false;
    },
    roundRect(x, y, w, h, r = 0) {
      const rr = Array.isArray(r) ? (typeof r[0] === 'number' ? r[0] : r[0]?.x ?? 0) : typeof r === 'number' ? r : r?.x ?? 0;
      if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; }
      const q = Math.max(0, Math.min(rr, w / 2, h / 2));
      if (moved()) addShape(x + ox(), y + oy(), w, h, q); else only = false;
      // (Its outline as a piece too, for a clip or a stroke mixed with other pieces.)
      curOn = false;
      arcPts(x + w - q, y + q, q, -Math.PI / 2, 0); arcPts(x + w - q, y + h - q, q, 0, Math.PI / 2); arcPts(x + q, y + h - q, q, Math.PI / 2, Math.PI); arcPts(x + q, y + q, q, Math.PI, Math.PI * 1.5);
      const a = ps[pc - 1];
      putPt(pb[a], pb[a + 1]); curOn = false;
    },
    arc(x, y, r, a0, a1, ccw = false) {
      const whole = Math.abs(a1 - a0) >= TAU - 1e-6;
      if (whole && !curOn && pc === pcB && moved()) addShape(x - r + ox(), y - r + oy(), 2 * r, 2 * r, r);
      else only = false;
      arcPts(x, y, r, a0, a1, ccw);
      if (whole && shn > shB) curOn = false;
    },
    ellipse(x, y, rx, ry, rot, a0, a1, ccw = false) { only = false; ellPts(x, y, rx, ry, rot, a0, a1, ccw); },
    arcTo(x1, y1, x2, y2, r) {
      only = false;
      if (!curOn) { startPiece(x1, y1); return; }
      const x0 = LP[0], y0 = LP[1];
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
      if (!curOn) startPiece(qx, qy);
      const x0 = LP[0], y0 = LP[1];
      for (let i = 1; i <= 12; i++) { const t = i / 12, u = 1 - t; add(u * u * x0 + 2 * u * t * qx + t * t * x, u * u * y0 + 2 * u * t * qy + t * t * y); }
    },
    bezierCurveTo(ax, ay, bx, by, x, y) {
      only = false;
      if (!curOn) startPiece(ax, ay);
      const x0 = LP[0], y0 = LP[1];
      const n = Math.max(6, Math.min(48, Math.ceil(Math.hypot(x - x0, y - y0) * K * sc() / 4)));
      for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; add(u * u * u * x0 + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x, u * u * u * y0 + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * y); }
    },
    /** A series as part of the path, in one call: the points (ax + bx * xs[i], ay + by * ys[i]) for i = 0 … n - 1, or from n - 1 down when dir is -1,
     *  the first as a moveTo when `move` is set and a lineTo otherwise: what a chart's own loop of lineTo calls drew, with no call for each point. */
    tracePoints(xs, ys, n, dir, ax, bx, ay, by, move) {
      if (n < 1) return;
      only = false;
      needPts(pn + 2 * n + 2);
      const m = st.m;
      let x = 0, y = 0;
      for (let k = 0; k < n; k++) {
        const i = dir > 0 ? k : n - 1 - k;
        x = ax + bx * xs[i]; y = ay + by * ys[i];
        if (k === 0 && move) { openPiece(); } else if (!curOn) openPiece();
        pb[pn++] = m ? m[0] * x + m[2] * y + m[4] : x;
        pb[pn++] = m ? m[1] * x + m[3] * y + m[5] : y;
      }
      LP[0] = x; LP[1] = y;
    },
    /** A series as the line a chart draws for it (pressure-time.js): every stride-th sample, a NaN reading lifting the pen, and the last sample. */
    traceLine(xs, ys, n, stride, ax, bx, ay, by) {
      if (n < 1) return;
      only = false;
      needPts(pn + 2 * n + 4);
      const m = st.m;
      let on = false, x = 0, y = 0;
      for (let i = 0; i < n; i += stride) {
        const v = ys[i];
        if (v !== v) { on = false; continue; }
        x = ax + bx * xs[i]; y = ay + by * v;
        if (!on) { openPiece(); on = true; } else if (!curOn) openPiece();
        pb[pn++] = m ? m[0] * x + m[2] * y + m[4] : x;
        pb[pn++] = m ? m[1] * x + m[3] * y + m[5] : y;
      }
      if ((n - 1) % stride) {
        x = ax + bx * xs[n - 1]; y = ay + by * ys[n - 1];
        if (!curOn) openPiece();
        pb[pn++] = m ? m[0] * x + m[2] * y + m[4] : x;
        pb[pn++] = m ? m[1] * x + m[3] * y + m[5] : y;
      }
      LP[0] = x; LP[1] = y;
    },
    fill() {
      const a = st.globalAlpha;
      if (only && shn > shB && typeof st.fillStyle === 'string') {
        for (let i = shB; i < shn; i++) { const o = i * 5; G.box(sh[o], sh[o + 1], sh[o + 2], sh[o + 3], sh[o + 4], st.fillStyle, null, 0, a); }
        return;
      }
      G.poly(pb, ps, pcB, pc, pn, paintOf(st.fillStyle), a);
    },
    stroke() {
      const a = st.globalAlpha, k = sc(), w = st.lineWidth * k, o = STO;
      o.alpha = a; o.offset = st.lineDashOffset * k; o.round = st.lineCap === 'round';
      if (st.dn) { for (let i = 0; i < st.dn; i++) DSA[i] = st.dash[i] * k; o.dash = DSA; o.dashN = st.dn; } else { o.dash = null; o.dashN = 0; }
      if (only && shn > shB && !st.dn && typeof st.strokeStyle === 'string') {
        for (let i = shB; i < shn; i++) { const q = i * 5; G.box(sh[q], sh[q + 1], sh[q + 2], sh[q + 3], sh[q + 4], null, st.strokeStyle, w, a); }
        return;
      }
      const n = (pn - pnB) / 2 + (pc - pcB) + 1;
      if (sx.length < n) { let q = sx.length; while (q < n) q *= 2; sx = new Float32Array(q); sy = new Float32Array(q); }   // alloc-rare: grows only for a stroke of more points than any before
      const xs = sx, ys = sy;
      let m = 0;
      for (let q = pcB; q < pc; q++) {
        const s0 = ps[q], e = q + 1 < pc ? ps[q + 1] : pn;
        if (e - s0 < 4) continue;   // (a lone point draws nothing, as on the 2D canvas)
        for (let i = s0; i < e; i += 2) { xs[m] = pb[i]; ys[m] = pb[i + 1]; m++; }
        xs[m] = ys[m] = NaN; m++;
      }
      G.line(xs, ys, m, paintOf(st.strokeStyle), w, o);
    },
    clip() {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = pnB; i < pn; i += 2) { x0 = Math.min(x0, pb[i]); x1 = Math.max(x1, pb[i]); y0 = Math.min(y0, pb[i + 1]); y1 = Math.max(y1, pb[i + 1]); }
      // (The rectangle is written into the state's own four numbers, intersected with the clip so far.)
      const r = st.clipA;
      let rx = 0, ry = 0, rw = 0, rh = 0;
      if (x1 > x0 && y1 > y0) { rx = x0; ry = y0; rw = x1 - x0; rh = y1 - y0; }
      if (st.clip) { const q = st.clip, a0 = Math.max(rx, q[0]), b0 = Math.max(ry, q[1]), a1 = Math.min(rx + rw, q[0] + q[2]), b1 = Math.min(ry + rh, q[1] + q[3]); rx = a0; ry = b0; rw = Math.max(0, a1 - a0); rh = Math.max(0, b1 - b0); }
      r[0] = rx; r[1] = ry; r[2] = rw; r[3] = rh;
      st.clip = r; G.clip(r);
      // (a rectangle is the scissor alone; any other shape is clipped by the stencil too: its pieces are copied after the clips of the open states)
      if (!(only && shn - shB === 1 && sh[shB * 5 + 4] === 0)) pushClip();
    },
    fillRect(x, y, w, h) {
      if (typeof st.fillStyle === 'string' && moved()) { G.box(x + ox(), y + oy(), w, h, 0, st.fillStyle, null, 0, st.globalAlpha); return; }
      // (The rectangle is a path of its own, laid above the one being built, and taken away again.)
      const pc0 = pc, pn0 = pn, cur0 = curOn, only0 = only;
      curOn = false; only = false;
      startPiece(x, y); add(x + w, y); add(x + w, y + h); add(x, y + h); add(x, y);
      G.poly(pb, ps, pc0, pc, pn, paintOf(st.fillStyle), st.globalAlpha);
      pc = pc0; pn = pn0; curOn = cur0; only = only0;
    },
    strokeRect(x, y, w, h) { G.box(x + ox(), y + oy(), w, h, 0, null, st.strokeStyle, st.lineWidth, st.globalAlpha); },
    clearRect() {},
    // (Words placed where the transform puts their anchor (x, y), as the 2D canvas places them, and turned with it about that point; their
    // size is not scaled by it (the caller sets the type at its size on the screen). The anchor used to take the transform's offset alone,
    // not its scale: words in a model drawn into a box larger or smaller than its viewBox sat off their place, toward the box's corner
    // (the Ascites pressure dial's IAP, number, unit and word piled on each other and on the 12, Mohammad, 2 Nov 2026).)
    fillText(t, x, y) { textAt(t, x, y, typeof st.fillStyle === 'string' ? st.fillStyle : stopColour(st.fillStyle), 0); },
    strokeText(t, x, y) { textAt(t, x, y, typeof st.strokeStyle === 'string' ? st.strokeStyle : stopColour(st.strokeStyle), st.lineWidth); },
    // (The answer is one record, written again by the next call: every caller reads its width at once.)
    // alloc-rare: only when the argument is not already a string (the 2D canvas converts it the same way); a string is not copied
    measureText(t) { const s = typeof t === 'string' ? t : String(t); MT.width = G.measure(s, st.font) + (st.ls ? st.ls * pointsIn(s) : 0); return MT; },
    createLinearGradient(x0, y0, x1, y1) {
      const g = GR[grN] || (GR[grN] = new Gradient()); grN++;   // alloc-rare: the context makes a gradient only until a frame has asked for as many as any frame will
      const a = g.g4; a[0] = x0; a[1] = y0; a[2] = x1; a[3] = y1;
      g.grad = a; g.rad = null; g.n = 0;
      return g;
    },
    createRadialGradient(x0, y0, r0, x1, y1, r1) {
      const g = GR[grN] || (GR[grN] = new Gradient()); grN++;   // alloc-rare: the context makes a gradient only until a frame has asked for as many as any frame will
      const r = g.r6; r[0] = x0; r[1] = y0; r[2] = r0; r[3] = x1; r[4] = y1; r[5] = r1;
      g.rad = r; g.grad = null; g.n = 0;
      return g;
    },
    /** A picture (canvas, image or ImageData) in a box, translated with the transform: drawImage(src, x, y) or (src, x, y, w, h). The
     *  picture goes up to the GPU once per src.glVer (a canvas the caller draws again bumps it). */
    drawImage(src, x, y, w, h) {
      if (w === undefined) { w = src.width; h = src.height; }
      G.image(src, x + ox(), y + oy(), w, h, st.globalAlpha, src, src.glVer || 0);
    },
    /** A soft shadow under a rounded box (the GPU's own, in place of a blurred picture): its colour, blur and offset as the 2D canvas's. */
    eraseBox(x, y, w, h, r, alpha) { G.erase(x, y, w, h, r, alpha); },
    shadowBox(x, y, w, h, r, colour, blur, dy = 0) { G.box(x, y + dy, w, h, r, colour, null, -blur / 2, 1); },
  };
  return c;
}
const stopColour = (g) => (g && g.n ? g.cols[0] : 'transparent');

// A gradient the 2D context hands out: its ends or circles, and up to MAX_STOPS stops (offsets and colours in rows), written in place. The context keeps a
// few of these and hands them round and round, one for each gradient a frame asks for, so a frame that asks for the same gradients makes nothing. One
// is good until the context is reset for the next frame (a chart's frame start); a caller that wants a gradient in the next frame asks again.
const MAX_STOPS = 16;
class Gradient {
  constructor() { this.g4 = new Float32Array(4); this.r6 = new Float64Array(6); this.grad = null; this.rad = null; this.offs = new Float64Array(MAX_STOPS); this.cols = new Array(MAX_STOPS).fill(''); this.n = 0; }   // alloc-rare: a gradient is made only until a frame has asked for as many as any frame will; they go round after
  addColorStop(o, col) { if (this.n < MAX_STOPS) { this.offs[this.n] = o; this.cols[this.n++] = col; } }
}

/** The pen a chart draws with: the GPU drawer's 2D context where it can draw now ({ ctx, w, h }, ctx.end() ends the frame), else the chart's
 *  canvas sized as fitCanvas sizes it and a pen that draws nothing (util.js), until the GPU can draw it. */
const PENS = new WeakMap();
/**
 * The glasses lying over a pen's canvas, taken out of its picture last (the labels under a card are left out under it, as label-gl.js
 * cutHoles does for the anatomy's): `holes` as glass-gl.js tellHoles gives them (client px: x, y, w, h, a, rad, d), `cv` the canvas, `w`, `h` its
 * size in the pen's px. The canvas's place is read once a frame that has a glass over it; it may be scaled or moved (a dive), so its box is the map.
 * A pen with no GPU under it (no `eraseBox`) draws no glass, so there is nothing to leave out.
 */
export function eraseHoles(ctx, cv, w, h, holes) {
  if (!holes?.length || !ctx.eraseBox || !(w > 0) || !(h > 0)) return;
  const r = readBox(cv);
  if (!r || !(r.width > 0) || !(r.height > 0)) return;
  const sx = r.width / w, sy = r.height / h;
  for (const o of holes) {
    if (!(o.a > 0.001) || !(o.w > 0) || !(o.h > 0)) continue;
    const x = (o.x - r.left) / sx, y = (o.y - r.top) / sy, ww = o.w / sx, hh = o.h / sy;
    if (x > w || y > h || x + ww < 0 || y + hh < 0) continue;
    const q = o.rad ? Math.max(o.rad[0], o.rad[1], o.rad[2], o.rad[3]) / sx : o.d ? 12 : 0;
    ctx.eraseBox(x, y, ww, hh, q, o.a);
  }
}
export function fitPen(canvas, gpu) {
  if (gpu) {
    const z = canvasSize(canvas);
    const ctx = gpu.ctx2d(z.w, z.h, z.W, z.H);
    if (ctx) {
      // (The canvas's pen record is kept and written in place: every caller reads it at once, and a chart draws one canvas at a time.)
      let p = PENS.get(canvas);
      if (!p) PENS.set(canvas, p = { ctx: null, w: 0, h: 0, gpu: true });   // alloc-rare: one record for each canvas, the first time it is drawn
      p.ctx = ctx; p.w = z.w; p.h = z.h;
      return p;
    }
  }
  return fitCanvas(canvas);
}
