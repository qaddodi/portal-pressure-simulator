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
// chart draws on its own 2D canvas, as before (?tracegl=0 keeps that always).

import { startProgram, checkProgram, exerciseDraw, publishWhenDone } from './gl-compile.js?v=e48e05cdb3';
import { canvasSize, fitCanvas } from './util.js?v=f7055730cc';

/** ?tracegl=0 in a page's search string: every chart and monitor draws on its 2D canvas, as before. */
export const traceGLOff = (search) => /[?&]tracegl=0\b/.test(String(search ?? ''));

// Paint (a colour or a linear gradient of up to four stops), shared by the fills and the strokes' laying down. Positions in CSS px.
const PAINT = `
uniform vec4 pc[4];                  // the stops' colours (premultiplied)
uniform vec4 po;                     // the stops' offsets
uniform vec4 pl;                     // the gradient's line: x0, y0, x1, y1 (CSS px)
uniform int pn;                      // how many stops (1: a plain colour)
vec4 paint(vec2 p) {
  if (pn < 2) return pc[0];
  vec2 d = pl.zw - pl.xy;
  float t = dot(d, d) > 0.0 ? dot(p - pl.xy, d) / dot(d, d) : 0.0;
  if (t <= po.x) return pc[0];
  vec4 c = pc[0];
  for (int i = 1; i < 4; i++) {
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
// Text: the atlas's picture (its alpha) copied texel for texel to the canvas's pixels, tinted.
const TEXT_VS = `#version 300 es
layout(location = 0) in vec4 dst;    // x, y, w, h (device px, whole)
layout(location = 1) in vec2 src;    // the picture's top left in the atlas (texels)
layout(location = 2) in vec4 tc;     // premultiplied
uniform vec2 res;
out vec2 vT;
flat out vec4 vC;
void main() {
  int id = gl_VertexID;
  vec2 f = vec2(id == 1 || id == 3 ? 1.0 : 0.0, id >= 2 ? 1.0 : 0.0);
  vec2 q = dst.xy + dst.zw * f;
  vT = src + dst.zw * f;
  vC = tc;
  gl_Position = vec4(q.x / res.x * 2.0 - 1.0, 1.0 - q.y / res.y * 2.0, 0.0, 1.0);
}`;
const TEXT_FS = `#version 300 es
precision highp float;
uniform sampler2D atlas;
in vec2 vT;
flat in vec4 vC;
out vec4 o;
void main() {
  float a = texelFetch(atlas, ivec2(floor(vT)), 0).a;
  if (a <= 0.0) discard;
  o = vC * a;
}`;

const NUMERIC = /^[-−+0-9.,%]+$/;
const ATLAS = 1024;

// A colour as the 2D canvas reads it, [r, g, b, a] (0–1, not premultiplied). Read once per string through a 1 × 1 canvas.
const colours = new Map();
let normCtx = null;
function rgba(c) {
  let v = colours.get(c);
  if (!v) {
    normCtx ||= document.createElement('canvas').getContext('2d');
    normCtx.fillStyle = '#000'; normCtx.fillStyle = c;   // colour-exempt: a reset, so a colour the canvas cannot read stays black
    const s = String(normCtx.fillStyle);
    let r = 0, g = 0, b = 0, a = 1;
    const m = /^#([\da-f]{6})$/i.exec(s);
    if (m) { const n = parseInt(m[1], 16); r = (n >> 16) / 255; g = ((n >> 8) & 255) / 255; b = (n & 255) / 255; }
    else {
      const q = /rgba?\(([^)]+)\)/.exec(s)?.[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      if (q) { r = q[0] / 255; g = q[1] / 255; b = q[2] / 255; a = q.length > 3 ? q[3] : 1; }
    }
    v = [r, g, b, a];
    if (colours.size > 512) colours.clear();
    colours.set(c, v);
  }
  return v;
}
const premul = (c, alpha = 1) => { const v = rgba(c), a = v[3] * alpha; return [v[0] * a, v[1] * a, v[2] * a, a]; };

/** The GPU drawer for one chart, over `host` (the chart's 2D canvas), or null where it cannot be (the 2D canvas draws the chart). */
export function createTraceGL(host, { search = globalThis.location?.search } = {}) {
  if (typeof document === 'undefined' || traceGLOff(search)) return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'trace-gl';
  canvas.style.pointerEvents = 'none';
  const atlasCv = document.createElement('canvas');
  atlasCv.width = atlasCv.height = ATLAS;
  // (A canvas kept in memory, not on the GPU, never shown: a new word's few pixels are read from it and sent up alone, never the whole atlas.)
  const actx = atlasCv.getContext('2d', { willReadFrequently: true });
  let entries = new Map(), shelfX = 0, shelfY = 0, shelfH = 0, atlasK = 0;
  const widths = new Map();
  let gl = null;
  try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: true, preserveDrawingBuffer: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true }); } catch { gl = null; }
  if (!gl || typeof gl.createShader !== 'function' || typeof host?.after !== 'function') return null;
  try {
    const ri = gl.getExtension('WEBGL_debug_renderer_info');
    if (/SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(String(gl.getParameter(ri ? ri.UNMASKED_RENDERER_WEBGL : gl.RENDERER)))) { gl.getExtension('WEBGL_lose_context')?.loseContext(); return null; }
  } catch { /* the renderer's name withheld: taken as a GPU */ }

  let lost = false, dead = false, failed = false;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
  let P = null, started = null, stopPoll = null;
  let quad = null, quadVao = null, segBuf = null, segVao = null, fillBuf = null, fillVao = null, boxBuf = null, boxVao = null, textBuf = null, textVao = null;
  let covTex = null, fbo = null, covW = 0, covH = 0, atlasTex = null, dirty = null;
  const SRC = { seg: [SEG_VS, SEG_FS], comp: [QUAD_VS, COMP_FS], fill: [FILL_VS, FILL_FS], box: [BOX_VS, BOX_FS], text: [TEXT_VS, TEXT_FS] };
  const PU = ['pc', 'po', 'pl', 'pn', 'ga'];
  const UN = { seg: ['res', 'hw', 'dash', 'cap'], comp: ['cov', 'res', 'k', ...PU], fill: ['res', 'k', ...PU], box: ['res', 'k'], text: ['res', 'atlas'] };

  function build() {
    P = null; failed = false; covW = covH = 0;
    started = Object.fromEntries(Object.entries(SRC).map(([k, [vs, fs]]) => [k, startProgram(gl, vs, fs)]));
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
    for (const [i, n, off] of [[0, 4, 0], [1, 2, 16], [2, 4, 24]]) { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, n, gl.FLOAT, false, 40, off); gl.vertexAttribDivisor(i, 1); }
    gl.bindVertexArray(null);
    covTex = gl.createTexture(); fbo = gl.createFramebuffer();
    atlasTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, atlasTex);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ATLAS, ATLAS, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    // (A context built again holds none of the words: every one set so far goes up once more.)
    dirty = shelfY + shelfH > 0 || shelfX > 0 ? [0, 0, ATLAS, Math.min(ATLAS, shelfY + shelfH)] : null;
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
    } catch (e) {
      if (gl.isContextLost()) { P = null; return; }
      failed = true; console.warn('Charts on the GPU: shader failed; the 2D chart stays.', e);
    }
  }
  try { build(); } catch (e) { console.warn('Charts on the GPU: could not start; the 2D chart stays.', e); gl.getExtension('WEBGL_lose_context')?.loseContext(); return null; }
  canvas.addEventListener('webglcontextrestored', () => {
    if (dead) return;
    try { build(); } catch (e) { failed = true; console.warn('Charts on the GPU: could not be rebuilt; the 2D chart stays.', e); }
  });
  host.after(canvas);
  // (The atlas sits in the page beside the chart, never shown, so its words take the type settings the chart's own canvas inherits from the
  // page, its tabular figures and stylistic sets: a canvas apart from the page set "11.2" narrower than the 2D chart does.)
  atlasCv.style.display = 'none';
  atlasCv.setAttribute('aria-hidden', 'true');
  canvas.after(atlasCv);

  // ── The atlas: each word (in its font, baseline and outline) set once; a number from its characters, each set once ──
  function resetAtlas(k) {
    entries = new Map(); widths.clear(); shelfX = shelfY = shelfH = 0; atlasK = k;
    actx.setTransform(1, 0, 0, 1, 0, 0); actx.clearRect(0, 0, ATLAS, ATLAS); dirty = null;
  }
  function measure(str, font) {
    const key = font + '\u0001' + str;
    let w = widths.get(key);
    if (w === undefined) { actx.font = font; w = actx.measureText(str).width; widths.set(key, w); }
    return w;
  }
  function entry(str, font, base, k, sw = 0) {
    if (k !== atlasK) resetAtlas(k);
    const key = font + '\u0001' + base + '\u0001' + sw + '\u0001' + str;
    let e = entries.get(key);
    if (e) return e;
    actx.setTransform(1, 0, 0, 1, 0, 0);
    actx.font = font; actx.textBaseline = base; actx.textAlign = 'left';
    const m = actx.measureText(str);
    const ex = Math.ceil((sw / 2) * k) + 2;   // (an outline's reach past the letters)
    const asc = Math.ceil((m.actualBoundingBoxAscent || 0) * k) + ex, desc = Math.ceil((m.actualBoundingBoxDescent || 0) * k) + ex;
    const left = Math.ceil(Math.max(0, m.actualBoundingBoxLeft || 0) * k) + ex, right = Math.ceil(Math.max(m.width, m.actualBoundingBoxRight || 0) * k) + ex;
    const w = left + right, hh = Math.max(1, asc + desc);
    if (shelfX + w > ATLAS) { shelfX = 0; shelfY += shelfH; shelfH = 0; }
    if (shelfY + hh > ATLAS) { resetAtlas(k); return entry(str, font, base, k, sw); }
    const x = shelfX, y = shelfY;
    shelfX += w; shelfH = Math.max(shelfH, hh);
    actx.save();
    actx.beginPath(); actx.rect(x, y, w, hh); actx.clip();
    actx.setTransform(k, 0, 0, k, x + left, y + asc);
    actx.font = font; actx.textBaseline = base; actx.textAlign = 'left'; actx.fillStyle = actx.strokeStyle = '#fff';   // colour-exempt: the atlas holds coverage (a mask), tinted in the shader
    if (sw) { actx.lineWidth = sw; actx.lineJoin = 'round'; actx.strokeText(str, 0, 0); } else actx.fillText(str, 0, 0);
    actx.restore();
    e = { x, y, w, h: hh, ax: left, ay: asc };
    entries.set(key, e);
    dirty = dirty ? [Math.min(dirty[0], x), Math.min(dirty[1], y), Math.max(dirty[2], x + w), Math.max(dirty[3], y + hh)] : [x, y, x + w, y + hh];
    return e;
  }

  // ── A frame ──
  let W = 1, H = 1, K = 1, clipR = null, inFrame = false;
  let segData = new Float32Array(6144), fillData = new Float32Array(4096);
  let textData = new Float32Array(400), textN = 0, boxData = new Float32Array(560), boxN = 0;
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
  function flush() {
    if (textN) {
      if (dirty) {
        // (Only the new words' rectangle: a few hundred bytes, read from the atlas kept in memory.)
        const [x0, y0, x1, y1] = dirty, img = actx.getImageData(x0, y0, x1 - x0, y1 - y0);
        gl.bindTexture(gl.TEXTURE_2D, atlasTex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, x1 - x0, y1 - y0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(img.data.buffer));
        dirty = null;
      }
      if (scissor(clipR)) {
        gl.useProgram(P.text.p);
        gl.uniform2f(P.text.u.res, W, H);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, atlasTex); gl.uniform1i(P.text.u.atlas, 0);
        gl.bindVertexArray(textVao); gl.bindBuffer(gl.ARRAY_BUFFER, textBuf);
        gl.bufferData(gl.ARRAY_BUFFER, textData.subarray(0, textN * 10), gl.STREAM_DRAW);
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
  function setPaint(u, style, alpha) {
    if (style && style.grad) {
      const st = style.stops.slice().sort((a, b) => a[0] - b[0]).slice(0, 4);
      if (st.length) {
        const pc = new Float32Array(16), po = new Float32Array(4);
        st.forEach(([o, c], i) => { pc.set(premul(c), i * 4); po[i] = o; });
        gl.uniform4fv(u.pc, pc); gl.uniform4fv(u.po, po); gl.uniform4fv(u.pl, style.grad); gl.uniform1i(u.pn, st.length); gl.uniform1f(u.ga, alpha);
        return;
      }
    }
    const pc = new Float32Array(16); pc.set(premul(typeof style === 'string' ? style : 'transparent'));
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
    get ready() { publish(); return !!P && !lost && !failed && !dead && !gl.isContextLost(); },
    /** Starts a frame over a chart w × h CSS px, drawn at Wd × Hd device px. False: the GPU cannot draw now (the 2D canvas draws the chart). */
    begin(w, h, Wd, Hd) {
      if (!api.ready || w < 1 || h < 1) { api.hide(); return false; }
      if (canvas.width !== Wd || canvas.height !== Hd) { canvas.width = Wd; canvas.height = Hd; }
      W = Wd; H = Hd; K = Wd / w;
      gl.viewport(0, 0, W, H);
      gl.disable(gl.SCISSOR_TEST); gl.disable(gl.STENCIL_TEST);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      clipR = null; inFrame = true; textN = boxN = 0;
      return true;
    },
    /** Ends the frame (what is batched is drawn) and shows the GPU's picture in place of the 2D canvas's. */
    end() {
      if (!inFrame) return;
      flush(); gl.bindVertexArray(null); inFrame = false;
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
      gl.clearStencil(0); gl.clear(gl.STENCIL_BUFFER_BIT);
      gl.enable(gl.STENCIL_TEST);
      gl.colorMask(false, false, false, false);
      gl.stencilFunc(gl.ALWAYS, 0, 0xff);
      gl.stencilOpSeparate(gl.FRONT, gl.KEEP, gl.KEEP, gl.INCR_WRAP);
      gl.stencilOpSeparate(gl.BACK, gl.KEEP, gl.KEEP, gl.DECR_WRAP);
      gl.bufferData(gl.ARRAY_BUFFER, fillData.subarray(0, m), gl.STREAM_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, m / 2);
      gl.colorMask(true, true, true, true);
      gl.stencilFunc(gl.NOTEQUAL, 0, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
      fillData[0] = r[0]; fillData[1] = r[1]; fillData[2] = r[0] + r[2]; fillData[3] = r[1]; fillData[4] = r[0]; fillData[5] = r[1] + r[3]; fillData[6] = r[0] + r[2]; fillData[7] = r[1] + r[3];
      setPaint(P.fill.u, style, alpha);
      gl.bufferData(gl.ARRAY_BUFFER, fillData.subarray(0, 8), gl.STREAM_DRAW);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disable(gl.STENCIL_TEST);
    },
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
    /** Words at (x, y) (CSS px) in `font`, aligned as the 2D canvas aligns them. sw: the words' outline that wide instead of the words. */
    text(str, x, y, font, color, align = 'left', base = 'alphabetic', alpha = 1, sw = 0) {
      str = String(str);
      if (!str || typeof color !== 'string') return;
      if (boxN) flush();
      const tint = premul(color, alpha);
      if (tint[3] <= 0) return;
      const parts = NUMERIC.test(str) && !sw ? [...str] : [str];
      let width = 0;
      const adv = parts.map((p) => { const a = measure(p, font); width += a; return a; });
      let cx = align === 'right' || align === 'end' ? x - width : align === 'center' ? x - width / 2 : x;
      textData = grow(textData, (textN + parts.length) * 10);
      for (let i = 0; i < parts.length; i++) {
        const e = entry(parts[i], font, base, K, sw);
        const o = textN * 10;
        textData[o] = Math.round(cx * K) - e.ax; textData[o + 1] = Math.round(y * K) - e.ay; textData[o + 2] = e.w; textData[o + 3] = e.h;
        textData[o + 4] = e.x; textData[o + 5] = e.y;
        textData.set(tint, o + 6);
        textN++;
        cx += adv[i];
      }
    },
    /**
     * A 2D context for the chart's own drawing code, w × h CSS px at Wd × Hd device px, drawn by the GPU; null where it cannot draw now
     * (the chart then takes its own canvas's context). The frame ends with the context's end().
     */
    ctx2d(w, h, Wd, Hd) {
      if (!api.begin(w, h, Wd, Hd)) return null;
      return shim.reset(K);
    },
    fonts() { resetAtlas(-1); },
    get lost() { return lost || failed; },
    dispose() {
      dead = true; stopPoll?.();
      try {
        for (const b of [quad, segBuf, fillBuf, boxBuf, textBuf]) gl.deleteBuffer(b);
        for (const v of [quadVao, segVao, fillVao, boxVao, textVao]) gl.deleteVertexArray(v);
        gl.deleteTexture(covTex); gl.deleteTexture(atlasTex); gl.deleteFramebuffer(fbo);
        if (P) for (const k of Object.keys(P)) gl.deleteProgram(P[k].p);
      } catch { /* a lost context holds nothing */ }
      canvas.width = canvas.height = 0; atlasCv.width = atlasCv.height = 0; atlasCv.remove();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
      host.style.opacity = '';
    },
  };
  const shim = createShim(api);
  globalThis.document?.fonts?.addEventListener?.('loadingdone', () => api.fonts());
  return api;
}

// ── The 2D context the charts draw through ──
// The subset of CanvasRenderingContext2D the charts and monitors use, with its state, turned into the drawer's GPU draws. A path is kept as
// pieces of line (an arc or a curve as short chords) plus the shapes it is made of whole (a rectangle, a rounded box, a circle), so a fill
// of one of those draws it as a shape with a soft edge, and anything else by the stencil.
function createShim(G) {
  const TAU = Math.PI * 2;
  let st, stack, K = 1;
  let pieces = [], cur = null, shapes = [], only = true;
  let sx = new Float32Array(1024), sy = new Float32Array(1024);   // (a stroke's points, kept from frame to frame)   // (only: the path is made of whole shapes and nothing else)
  const fresh = () => ({ fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter', font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic', globalAlpha: 1, dash: [], lineDashOffset: 0, clip: null });   // colour-exempt: the 2D canvas's own defaults
  const startPiece = (x, y) => { cur = [x, y]; pieces.push(cur); };
  const add = (x, y) => { if (!cur) startPiece(x, y); else cur.push(x, y); };
  const arcPts = (cx, cy, r, a0, a1, ccw) => {
    let sweep = a1 - a0;
    if (!ccw && sweep < 0) sweep = (sweep % TAU) + TAU; if (ccw && sweep > 0) sweep = (sweep % TAU) - TAU;
    if (Math.abs(a1 - a0) >= TAU) sweep = ccw ? -TAU : TAU;
    const n = Math.max(2, Math.ceil((Math.abs(sweep) * Math.max(1, r * K)) / 3));
    for (let i = 0; i <= n; i++) { const a = a0 + (sweep * i) / n; add(cx + r * Math.cos(a), cy + r * Math.sin(a)); }
  };
  const align = () => (st.textAlign === 'end' ? 'right' : st.textAlign === 'start' ? 'left' : st.textAlign);
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
    setLineDash(d) { st.dash = d.length % 2 ? [...d, ...d] : [...d]; },
    getLineDash() { return [...st.dash]; },
    save() { stack.push({ ...st, dash: [...st.dash] }); },
    restore() { if (!stack.length) return; const prev = st.clip; st = stack.pop(); if (st.clip !== prev) G.clip(st.clip); },
    setTransform() {}, resetTransform() {},
    getTransform() { return { a: K, b: 0, c: 0, d: K, e: 0, f: 0 }; },
    beginPath() { pieces = []; cur = null; shapes = []; only = true; },
    moveTo(x, y) { only = false; startPiece(x, y); },
    lineTo(x, y) { only = false; add(x, y); },
    closePath() { if (cur && cur.length >= 4) { const x = cur[0], y = cur[1]; cur.push(x, y); cur.closed = true; startPiece(x, y); } },
    rect(x, y, w, h) { shapes.push({ x, y, w, h, r: 0 }); startPiece(x, y); add(x + w, y); add(x + w, y + h); add(x, y + h); add(x, y); cur.closed = true; cur = null; },
    roundRect(x, y, w, h, r = 0) {
      const rr = Array.isArray(r) ? (typeof r[0] === 'number' ? r[0] : r[0]?.x ?? 0) : typeof r === 'number' ? r : r?.x ?? 0;
      if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; }
      const q = Math.max(0, Math.min(rr, w / 2, h / 2));
      shapes.push({ x, y, w, h, r: q });
      // (Its outline as a piece too, for a clip or a stroke mixed with other pieces.)
      cur = null;
      arcPts(x + w - q, y + q, q, -Math.PI / 2, 0); arcPts(x + w - q, y + h - q, q, 0, Math.PI / 2); arcPts(x + q, y + h - q, q, Math.PI / 2, Math.PI); arcPts(x + q, y + q, q, Math.PI, Math.PI * 1.5);
      cur.push(cur[0], cur[1]); cur.closed = true; cur = null;
    },
    arc(x, y, r, a0, a1, ccw = false) {
      if (Math.abs(a1 - a0) >= TAU - 1e-6 && !cur && !pieces.length) shapes.push({ x: x - r, y: y - r, w: 2 * r, h: 2 * r, r });
      else only = false;
      arcPts(x, y, r, a0, a1, ccw);
      if (shapes.length && shapes[shapes.length - 1].r === r && Math.abs(a1 - a0) >= TAU - 1e-6) cur = null;
    },
    arcTo(x1, y1, x2, y2, r) {
      only = false;
      if (!cur) { startPiece(x1, y1); return; }
      const x0 = cur[cur.length - 2], y0 = cur[cur.length - 1];
      const ax = x0 - x1, ay = y0 - y1, bx = x2 - x1, by = y2 - y1, la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      const cos = (ax * bx + ay * by) / (la * lb || 1), ang = Math.acos(Math.max(-1, Math.min(1, cos)));
      if (!r || la < 1e-9 || lb < 1e-9 || ang < 1e-6 || Math.abs(ang - Math.PI) < 1e-6) { add(x1, y1); return; }
      const d = r / Math.tan(ang / 2), ux = ax / la, uy = ay / la, vx = bx / lb, vy = by / lb;
      const t0x = x1 + ux * d, t0y = y1 + uy * d, t1x = x1 + vx * d, t1y = y1 + vy * d;
      const nx = ux + vx, ny = uy + vy, nl = Math.hypot(nx, ny), cd = r / Math.sin(ang / 2), cx = x1 + (nx / nl) * cd, cy = y1 + (ny / nl) * cd;
      add(t0x, t0y);
      const s = Math.atan2(t0y - cy, t0x - cx), e = Math.atan2(t1y - cy, t1x - cx);
      let sw = e - s; while (sw > Math.PI) sw -= TAU; while (sw < -Math.PI) sw += TAU;
      arcPts(cx, cy, r, s, s + sw, sw < 0);
    },
    quadraticCurveTo(qx, qy, x, y) {
      only = false;
      if (!cur) startPiece(qx, qy);
      const x0 = cur[cur.length - 2], y0 = cur[cur.length - 1];
      for (let i = 1; i <= 12; i++) { const t = i / 12, u = 1 - t; add(u * u * x0 + 2 * u * t * qx + t * t * x, u * u * y0 + 2 * u * t * qy + t * t * y); }
    },
    bezierCurveTo(ax, ay, bx, by, x, y) {
      only = false;
      if (!cur) startPiece(ax, ay);
      const x0 = cur[cur.length - 2], y0 = cur[cur.length - 1];
      const n = Math.max(6, Math.min(48, Math.ceil(Math.hypot(x - x0, y - y0) * K / 4)));
      for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; add(u * u * u * x0 + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x, u * u * u * y0 + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * y); }
    },
    fill() {
      const a = st.globalAlpha;
      if (only && shapes.length) { for (const s of shapes) G.box(s.x, s.y, s.w, s.h, s.r, typeof st.fillStyle === 'string' ? st.fillStyle : stopColour(st.fillStyle), null, 0, a); return; }
      G.poly(pieces.filter((p) => p.length >= 6), st.fillStyle, a);
    },
    stroke() {
      const a = st.globalAlpha, o = { alpha: a, dash: st.dash.length ? st.dash : null, offset: st.lineDashOffset, round: st.lineCap === 'round' };
      if (only && shapes.length && !st.dash.length && typeof st.strokeStyle === 'string') { for (const s of shapes) G.box(s.x, s.y, s.w, s.h, s.r, null, st.strokeStyle, st.lineWidth, a); return; }
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
      G.line(xs, ys, m, st.strokeStyle, st.lineWidth, o);
    },
    clip() {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of pieces) for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]); }
      let r = x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : [0, 0, 0, 0];
      if (st.clip) { const q = st.clip, a0 = Math.max(r[0], q[0]), b0 = Math.max(r[1], q[1]), a1 = Math.min(r[0] + r[2], q[0] + q[2]), b1 = Math.min(r[1] + r[3], q[1] + q[3]); r = [a0, b0, Math.max(0, a1 - a0), Math.max(0, b1 - b0)]; }
      st.clip = r; G.clip(r);
    },
    fillRect(x, y, w, h) { G.box(x, y, w, h, 0, typeof st.fillStyle === 'string' ? st.fillStyle : stopColour(st.fillStyle), null, 0, st.globalAlpha); },
    strokeRect(x, y, w, h) { G.box(x, y, w, h, 0, null, st.strokeStyle, st.lineWidth, st.globalAlpha); },
    clearRect() {},
    fillText(t, x, y) { G.text(t, x, y, st.font, typeof st.fillStyle === 'string' ? st.fillStyle : stopColour(st.fillStyle), align(), st.textBaseline, st.globalAlpha); },
    strokeText(t, x, y) { G.text(t, x, y, st.font, typeof st.strokeStyle === 'string' ? st.strokeStyle : stopColour(st.strokeStyle), align(), st.textBaseline, st.globalAlpha, st.lineWidth); },
    measureText(t) { return { width: G.measure(String(t), st.font) }; },
    createLinearGradient(x0, y0, x1, y1) { const g = { grad: [x0, y0, x1, y1], stops: [], addColorStop(o, col) { g.stops.push([o, col]); } }; return g; },
    /** A soft shadow under a rounded box (the GPU's own, in place of a blurred picture): its colour, blur and offset as the 2D canvas's. */
    shadowBox(x, y, w, h, r, colour, blur, dy = 0) { G.box(x, y + dy, w, h, r, colour, null, -blur / 2, 1); },
  };
  return c;
}
const stopColour = (g) => (g && g.stops && g.stops.length ? g.stops[0][1] : 'transparent');

/** The pen a chart draws with: the GPU drawer's 2D context where it can draw now ({ ctx, w, h }, ctx.end() ends the frame), else the chart's
 *  own canvas's context, fitted as fitCanvas fits it. */
export function fitPen(canvas, gpu) {
  if (gpu) {
    const z = canvasSize(canvas);
    const ctx = gpu.ctx2d(z.w, z.h, z.W, z.H);
    if (ctx) return { ctx, w: z.w, h: z.h };
  }
  return fitCanvas(canvas);
}
