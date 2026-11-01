// The moving parts of a chart or monitor on the GPU (Mohammad, 1 Nov 2026: "Move everything to GPU"). A WebGL2 canvas laid over a chart's
// 2D canvas: the 2D canvas keeps the still parts (the panel, the grid, the words that hold), drawn again only when they change, and this
// draws what moves on every frame: the traces, their bands and shading, dots, carets and pills, and the words and numbers that ride with
// them. Nothing it draws is made on the CPU in a frame: a word is set into the atlas once (a number from its digits, set once each), the
// lines are the samples' own points, and the GPU makes the strokes.
//
// Strokes: each line's segments are drawn as round-capped capsules into a coverage target with MAX blending (so the overlapping capsules of
// a dense trace never darken their joins or edges), then laid down once in the line's colour, as one stroke of the 2D canvas is. Dashes
// (on, off in CSS px; round or butt ends) are measured along the line as the 2D canvas measures them.
// Fills are vertical-pair strips (a band from trough to peak, an area under a line, the gap between two lines) or plain triangles, in one
// colour, with an optional fade from top to bottom. Pills, ticks and dots are rounded boxes with a fill and an edge. Text is the atlas's
// pictures of the words, set at the canvas's own pixel grid, tinted.
//
// Where WebGL2 is missing, the renderer is software, the shader is not yet ready, or the context is lost, begin() returns false and the
// chart draws its 2D picture whole, as before (?tracegl=0 keeps that always).

import { startProgram, checkProgram, exerciseDraw, publishWhenDone } from './gl-compile.js?v=d90ea8acf6';

/** ?tracegl=0 in a page's search string: every chart and monitor draws its moving parts on its 2D canvas, as before. */
export const traceGLOff = (search) => /[?&]tracegl=0\b/.test(String(search ?? ''));

const SEG_VS = `#version 300 es
layout(location = 0) in vec4 seg;    // a.xy, b.xy (device px, y down)
layout(location = 1) in float s0;    // distance along the line at a (device px)
uniform vec2 res;
uniform float hw;                    // half the line's width (device px)
out vec2 vP;
flat out vec2 vA, vB;
flat out float vS0;
void main() {
  vec2 a = seg.xy, b = seg.zw, d = b - a;
  float L = length(d);
  vec2 t = L > 1e-4 ? d / L : vec2(1.0, 0.0), n = vec2(-t.y, t.x);
  float e = hw + 1.0;
  int id = gl_VertexID;
  vec2 p = (id < 2 ? a - t * e : b + t * e) + n * e * ((id == 0 || id == 2) ? -1.0 : 1.0);
  vP = p; vA = a; vB = b; vS0 = s0;
  gl_Position = vec4(p.x / res.x * 2.0 - 1.0, 1.0 - p.y / res.y * 2.0, 0.0, 1.0);
}`;
const SEG_FS = `#version 300 es
precision highp float;
uniform float hw;
uniform vec3 dash;                   // on, off (device px; on 0: solid), round ends (1) or butt (0)
in vec2 vP;
flat in vec2 vA, vB;
flat in float vS0;
out vec4 o;
void main() {
  vec2 d = vB - vA;
  float L2 = dot(d, d), L = sqrt(L2);
  float hu = L2 > 0.0 ? dot(vP - vA, d) / L2 : 0.0, h = clamp(hu, 0.0, 1.0);
  float perp = length(vP - vA - d * h);
  float dist = perp;
  if (dash.x > 0.0) {
    float P = dash.x + dash.y, u = vS0 + hu * L, m = mod(u, P);
    if (dash.z > 0.5) {
      float g = m <= dash.x ? 0.0 : min(m - dash.x, P - m);
      vec2 q = vec2(g, perp);
      dist = length(q);
    } else {
      if (m > dash.x || hu < 0.0 || hu > 1.0) discard;
      dist = perp;
    }
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
uniform vec4 col;                    // premultiplied
out vec4 o;
void main() { o = col * texelFetch(cov, ivec2(gl_FragCoord.xy), 0).r; }`;
const FILL_VS = `#version 300 es
layout(location = 0) in vec2 p;      // CSS px
uniform vec2 res;
uniform float k;
out float vY;
void main() {
  vec2 q = p * k;
  vY = p.y;
  gl_Position = vec4(q.x / res.x * 2.0 - 1.0, 1.0 - q.y / res.y * 2.0, 0.0, 1.0);
}`;
const FILL_FS = `#version 300 es
precision highp float;
uniform vec4 col;                    // premultiplied
uniform vec4 grad;                   // y0, y1 (CSS px), share at y0, share at y1 (grad.x == grad.y: none)
in float vY;
out vec4 o;
void main() {
  float s = grad.x == grad.y ? 1.0 : mix(grad.z, grad.w, clamp((vY - grad.x) / (grad.y - grad.x), 0.0, 1.0));
  o = col * s;
}`;
// A rounded box: x, y, w, h (CSS px), radius, edge width; its fill and its edge (premultiplied).
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
  float e = rs.y * 0.5 + 1.5 / k;
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

// A colour as the 2D canvas reads it, premultiplied by its own alpha and by `alpha` (0–1). Read once per string through a 1 × 1 canvas.
const colours = new Map();
let normCtx = null;
function colour(c, alpha = 1) {
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
      else if (c === 'transparent') a = 0;
    }
    v = [r, g, b, a];
    if (colours.size > 256) colours.clear();
    colours.set(c, v);
  }
  const a = v[3] * alpha;
  return [v[0] * a, v[1] * a, v[2] * a, a];
}

/** The GPU drawer for one chart's moving parts, over `host` (the chart's 2D canvas), or null where it cannot be (the 2D path stays). */
export function createTraceGL(host, { search = globalThis.location?.search } = {}) {
  if (typeof document === 'undefined' || traceGLOff(search)) return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'trace-gl';
  canvas.style.pointerEvents = 'none';
  const atlasCv = document.createElement('canvas');
  atlasCv.width = atlasCv.height = ATLAS;
  // (A canvas kept in memory, not on the GPU: a new word's few pixels are read from it and sent up alone, never the whole atlas.)
  const actx = atlasCv.getContext('2d', { willReadFrequently: true });
  let entries = new Map(), shelfX = 0, shelfY = 0, shelfH = 0, atlasK = 0;
  const widths = new Map();
  let gl = null;
  try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: true }); } catch { gl = null; }
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
  const UN = { seg: ['res', 'hw', 'dash'], comp: ['cov', 'col'], fill: ['res', 'k', 'col', 'grad'], box: ['res', 'k'], text: ['res', 'atlas'] };

  function build() {
    P = null; failed = false; covW = covH = 0;
    started = Object.fromEntries(Object.entries(SRC).map(([k, [vs, fs]]) => [k, startProgram(gl, vs, fs)]));
    quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    quadVao = gl.createVertexArray(); gl.bindVertexArray(quadVao);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    segBuf = gl.createBuffer(); segVao = gl.createVertexArray(); gl.bindVertexArray(segVao); gl.bindBuffer(gl.ARRAY_BUFFER, segBuf);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 20, 0); gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 20, 16); gl.vertexAttribDivisor(1, 1);
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
        gl.useProgram(out.fill.p); gl.bindVertexArray(quadVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.useProgram(out.comp.p); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null);
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
  // (The atlas sits in the page beside the chart, hidden, so its words take the same type settings the chart's own canvas inherits from
  // the page, its tabular figures and stylistic sets: a canvas apart from the page set "11.2" narrower than the 2D chart does.)
  atlasCv.style.display = 'none';
  atlasCv.setAttribute('aria-hidden', 'true');
  canvas.after(atlasCv);

  // ── The atlas: each word (in its font and baseline) set once; a number from its characters, each set once ──
  function resetAtlas(k) {
    entries = new Map(); widths.clear(); shelfX = shelfY = shelfH = 0; atlasK = k;
    actx.setTransform(1, 0, 0, 1, 0, 0); actx.clearRect(0, 0, ATLAS, ATLAS); dirty = null;
  }
  /** A word's width in CSS px in `font`, as the 2D canvas measures it. */
  function measure(str, font) {
    const key = font + '\u0001' + str;
    let w = widths.get(key);
    if (w === undefined) { actx.font = font; w = actx.measureText(str).width; widths.set(key, w); }
    return w;
  }
  // An atlas entry: where its picture is (texels), its size, and where its anchor (the left end of its baseline) is in it.
  function entry(str, font, base, k) {
    if (k !== atlasK) resetAtlas(k);
    const key = font + '\u0001' + base + '\u0001' + str;
    let e = entries.get(key);
    if (e) return e;
    actx.setTransform(1, 0, 0, 1, 0, 0);
    actx.font = font; actx.textBaseline = base; actx.textAlign = 'left';
    const m = actx.measureText(str);
    const asc = Math.ceil((m.actualBoundingBoxAscent || 0) * k) + 2, desc = Math.ceil((m.actualBoundingBoxDescent || 0) * k) + 2;
    const left = Math.ceil(Math.max(0, m.actualBoundingBoxLeft || 0) * k) + 2, right = Math.ceil(Math.max(m.width, m.actualBoundingBoxRight || 0) * k) + 2;
    const w = left + right, hh = Math.max(1, asc + desc);
    if (shelfX + w > ATLAS) { shelfX = 0; shelfY += shelfH; shelfH = 0; }
    if (shelfY + hh > ATLAS) { resetAtlas(k); return entry(str, font, base, k); }
    const x = shelfX, y = shelfY;
    shelfX += w; shelfH = Math.max(shelfH, hh);
    actx.save();
    actx.beginPath(); actx.rect(x, y, w, hh); actx.clip();
    actx.setTransform(k, 0, 0, k, x + left, y + asc);
    actx.font = font; actx.textBaseline = base; actx.textAlign = 'left'; actx.fillStyle = '#fff';   // colour-exempt: the atlas holds coverage (a mask), tinted in the shader
    actx.fillText(str, 0, 0);
    actx.restore();
    e = { x, y, w, h: hh, ax: left, ay: asc };
    entries.set(key, e);
    dirty = dirty ? [Math.min(dirty[0], x), Math.min(dirty[1], y), Math.max(dirty[2], x + w), Math.max(dirty[3], y + hh)] : [x, y, x + w, y + hh];
    return e;
  }

  // ── A frame ──
  let W = 1, H = 1, K = 1, clipR = null, inFrame = false;
  let segData = new Float32Array(4096), fillData = new Float32Array(4096);
  let textData = new Float32Array(400), textN = 0, boxData = new Float32Array(560), boxN = 0;
  const grow = (a, n) => { if (a.length >= n) return a; let m = a.length; while (m < n) m *= 2; const b = new Float32Array(m); b.set(a); return b; };
  function scissor(r) {
    if (!r) { gl.disable(gl.SCISSOR_TEST); return true; }
    const x0 = Math.max(0, Math.floor(r[0] * K)), y0 = Math.max(0, Math.floor(r[1] * K)), x1 = Math.min(W, Math.ceil((r[0] + r[2]) * K)), y1 = Math.min(H, Math.ceil((r[1] + r[3]) * K));
    if (x1 <= x0 || y1 <= y0) return false;
    gl.enable(gl.SCISSOR_TEST); gl.scissor(x0, H - y1, x1 - x0, y1 - y0);
    return true;
  }
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
  const api = {
    canvas,
    /** False while the GPU cannot draw (no shader yet, a lost context): the chart then draws its 2D picture whole. */
    get ready() { publish(); return !!P && !lost && !failed && !dead && !gl.isContextLost(); },
    /** Starts a frame over a chart of w × h CSS px whose 2D canvas is Wd × Hd device px. False: draw the 2D picture whole instead. */
    begin(w, h, Wd = host.width, Hd = host.height) {
      if (!api.ready) { if (canvas.style.visibility !== 'hidden') canvas.style.visibility = 'hidden'; return false; }
      if (canvas.width !== Wd || canvas.height !== Hd) { canvas.width = Wd; canvas.height = Hd; }
      W = Wd; H = Hd; K = w > 0 ? Wd / w : 1;
      gl.viewport(0, 0, W, H);
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      clipR = null; inFrame = true; textN = boxN = 0;
      return true;
    },
    /** Ends the frame (what is batched is drawn). */
    end() { if (!inFrame) return; flush(); gl.bindVertexArray(null); inFrame = false; if (canvas.style.visibility) canvas.style.visibility = ''; },
    /** Hides the drawer's canvas (the chart drew its 2D picture whole). */
    hide() { if (canvas.style.visibility !== 'hidden') canvas.style.visibility = 'hidden'; },
    /** Everything drawn after this is clipped to the box (CSS px), or not (null). */
    clip(x, y, w, h) { flush(); clipR = x == null ? null : [x, y, w, h]; },
    measure,
    /**
     * A stroke through the points (CSS px; xs, ys arrays or typed arrays, from `from` for `n` points). A point with a NaN breaks the line.
     * o: { alpha, dash: [on, off] (CSS px), round: round ends (true) or butt, offset: the dash pattern's start (CSS px) }.
     */
    line(xs, ys, n, color, width, o = {}) {
      if (n < 2) return;
      flush();
      const from = o.from || 0;
      segData = grow(segData, (n - 1) * 5);
      let m = 0, s = (o.offset || 0) * K, px = NaN, py = NaN;
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (let i = from; i < from + n; i++) {
        const x = xs[i] * K, y = ys[i] * K;
        if (x !== x || y !== y) { px = NaN; continue; }
        if (px === px) {
          segData[m++] = px; segData[m++] = py; segData[m++] = x; segData[m++] = y; segData[m++] = s;
          s += Math.hypot(x - px, y - py);
        }
        if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
        px = x; py = y;
      }
      const count = m / 5;
      if (!count) return;
      const hw = (width * K) / 2, pad = hw + 2;
      // (The coverage target: the canvas's size, made again only when that changes.)
      if (covW !== W || covH !== H) {
        gl.bindTexture(gl.TEXTURE_2D, covTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, covTex, 0);
        covW = W; covH = H;
      }
      // The box drawn: the line's own, inside the clip.
      let r = [(bx0 - pad) / K, (by0 - pad) / K, (bx1 - bx0 + 2 * pad) / K, (by1 - by0 + 2 * pad) / K];
      if (clipR) {
        const x0 = Math.max(r[0], clipR[0]), y0 = Math.max(r[1], clipR[1]), x1 = Math.min(r[0] + r[2], clipR[0] + clipR[2]), y1 = Math.min(r[1] + r[3], clipR[1] + clipR[3]);
        if (x1 <= x0 || y1 <= y0) return;
        r = [x0, y0, x1 - x0, y1 - y0];
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      if (!scissor(r)) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); return; }
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.blendEquation(gl.MAX); gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(P.seg.p);
      gl.uniform2f(P.seg.u.res, W, H); gl.uniform1f(P.seg.u.hw, hw);
      gl.uniform3f(P.seg.u.dash, o.dash ? o.dash[0] * K : 0, o.dash ? o.dash[1] * K : 0, o.round === false ? 0 : 1);
      gl.bindVertexArray(segVao); gl.bindBuffer(gl.ARRAY_BUFFER, segBuf);
      gl.bufferData(gl.ARRAY_BUFFER, segData.subarray(0, m), gl.STREAM_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(P.comp.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, covTex); gl.uniform1i(P.comp.u.cov, 0);
      gl.uniform4fv(P.comp.u.col, colour(color, o.alpha ?? 1));
      gl.bindVertexArray(quadVao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    /** A fill between two lines over the same xs: (xs[i], ya[i]) to (xs[i], yb[i]) (CSS px), from `from` for n points. grad: [y0, y1, s0, s1]. */
    strip(xs, ya, yb, n, color, alpha = 1, grad = null, from = 0) {
      if (n < 2) return;
      flush();
      fillData = grow(fillData, n * 4);
      let m = 0;
      for (let i = from; i < from + n; i++) {
        const x = xs[i], a = typeof ya === 'number' ? ya : ya[i], b = typeof yb === 'number' ? yb : yb[i];
        if (x !== x || a !== a || b !== b) continue;
        fillData[m++] = x; fillData[m++] = a; fillData[m++] = x; fillData[m++] = b;
      }
      api.fillRaw(fillData, m / 2, gl.TRIANGLE_STRIP, color, alpha, grad);
    },
    /** Triangles (flat [x, y, …], CSS px) in one colour. */
    tris(pts, color, alpha = 1) { flush(); api.fillRaw(pts instanceof Float32Array ? pts : new Float32Array(pts), pts.length / 2, gl.TRIANGLES, color, alpha, null); },
    fillRaw(data, count, mode, color, alpha, grad) {
      if (count < 3 || !scissor(clipR)) return;
      gl.useProgram(P.fill.p);
      gl.uniform2f(P.fill.u.res, W, H); gl.uniform1f(P.fill.u.k, K);
      gl.uniform4fv(P.fill.u.col, colour(color, alpha));
      gl.uniform4f(P.fill.u.grad, ...(grad || [0, 0, 1, 1]));
      gl.bindVertexArray(fillVao); gl.bindBuffer(gl.ARRAY_BUFFER, fillBuf);
      gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, count * 2), gl.STREAM_DRAW);
      gl.drawArrays(mode, 0, count);
    },
    /** A rounded box (CSS px): its fill and, if `stroke`, its edge `sw` wide, centred on the box's outline as the 2D canvas strokes it. */
    box(x, y, w, h, r, fill, stroke = null, sw = 0, alpha = 1) {
      if (textN) flush();
      boxData = grow(boxData, (boxN + 1) * 14);
      const f = fill ? colour(fill, alpha) : [0, 0, 0, 0], s = stroke && sw > 0 ? colour(stroke, alpha) : [0, 0, 0, 0], o = boxN * 14;
      boxData[o] = x; boxData[o + 1] = y; boxData[o + 2] = w; boxData[o + 3] = h; boxData[o + 4] = r; boxData[o + 5] = stroke ? sw : 0;
      boxData.set(f, o + 6); boxData.set(s, o + 10);
      boxN++;
    },
    /** A filled dot of radius r (CSS px). */
    dot(x, y, r, fill, alpha = 1) { api.box(x - r, y - r, 2 * r, 2 * r, r, fill, null, 0, alpha); },
    /**
     * Words at (x, y) (CSS px) in `font`, aligned as the 2D canvas aligns them (align: left, right, center; base: its textBaseline).
     * A number is set from its characters, each one's picture made once; a word's picture is made once. Returns the words' width.
     */
    text(str, x, y, font, color, align = 'left', base = 'alphabetic', alpha = 1) {
      str = String(str);
      if (!str) return 0;
      if (boxN) flush();
      const k = K, tint = colour(color, alpha);
      if (tint[3] <= 0) return 0;
      const parts = NUMERIC.test(str) ? [...str] : [str];
      let width = 0;
      const adv = parts.map((p) => { const a = measure(p, font); width += a; return a; });
      let cx = align === 'right' || align === 'end' ? x - width : align === 'center' ? x - width / 2 : x;
      textData = grow(textData, (textN + parts.length) * 10);
      for (let i = 0; i < parts.length; i++) {
        const e = entry(parts[i], font, base, k);
        const dx = Math.round(cx * k) - e.ax, dy = Math.round(y * k) - e.ay, o = textN * 10;
        textData[o] = dx; textData[o + 1] = dy; textData[o + 2] = e.w; textData[o + 3] = e.h;
        textData[o + 4] = e.x; textData[o + 5] = e.y;
        textData.set(tint, o + 6);
        textN++;
        cx += adv[i];
      }
      return width;
    },
    /** Words set again from scratch (the web fonts arrived). */
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
    },
  };
  globalThis.document?.fonts?.addEventListener?.('loadingdone', () => api.fonts());
  return api;
}
