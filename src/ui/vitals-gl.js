// The vitals monitor on the GPU (vitals-monitor.js; ?vitalsgl=0 keeps the 2D canvas). Nothing is drawn with a 2D context while it runs:
// - the panel, the baseline and a reading's alarm patch are rounded rectangles, each one instance of a quad whose edge is found in the shader;
// - the EKG strip is a line of capsules, one instance per segment, read from the strip's points (two floats a point, the only data sent a frame);
// - every word and digit is a glyph of the shared SDF atlas of Inter (glyphs-inter.js, made offline by scripts/glyph-atlas.mjs and loaded
//   as an image: no canvas draws a letter), laid out from its own advances and kerning and edged in the shader at the canvas's density,
//   so a number that changes, a reading that turns to the alarm colour or a new size needs no new picture.
// Its three programs are started when the monitor is made (gl-compile.js) and published once the driver says they are done; a frame
// before that draws nothing new. A lost context draws nothing until it is restored, when everything is made again.
import { sdfAtlas } from './text-gl.js?v=6be25e020a';   // (the app's one door to GPU text: its SDF atlas, for text that changes every frame)
const { GLYPHS, KERN, BASE, RADIUS, CUTOFF, ATLAS_W, ATLAS_H, ATLAS_PNG } = sdfAtlas;
import { startProgram, compileDone, checkProgram, publishWhenDone } from './gl-compile.js?v=0ca233872f';

/** '#rgb', '#rrggbb', 'rgb()' or 'rgba()' as premultiplied [r, g, b, a] in 0–1. */
export function colorOf(c) {
  c = String(c || '').trim();
  let r, g, b, a = 1;
  if (c[0] === '#') {
    const x = c.length < 6 ? [...c.slice(1, 4)].map((d) => d + d).join('') : c.slice(1, 7);
    [r, g, b] = [0, 2, 4].map((k) => parseInt(x.slice(k, k + 2), 16) / 255);
    if (c.length === 9) a = parseInt(c.slice(7, 9), 16) / 255;
  } else {
    const n = c.match(/[\d.]+/g) || [];
    [r, g, b] = [0, 1, 2].map((k) => (+n[k] || 0) / 255);
    if (n.length > 3) a = +n[3];
  }
  return [r * a, g * a, b * a, a];
}

const VS_HEAD = '#version 300 es\nprecision highp float;\nuniform vec2 uSize;\nvec4 clipOf(vec2 p) { return vec4(p / uSize * vec2(2.0, -2.0) + vec2(-1.0, 1.0), 0.0, 1.0); }\n';
// (Rounded rectangles: iRect = x, y, w, h in device pixels; iR = corner radius; iCol premultiplied.)
const RECT_VS = `${VS_HEAD}in vec2 aCorner; in vec4 iRect; in float iR; in vec4 iCol;
out vec2 vP; out vec4 vRect; out float vR; out vec4 vCol;
void main() { vec2 p = iRect.xy - 1.0 + aCorner * (iRect.zw + 2.0); vP = p; vRect = iRect; vR = iR; vCol = iCol; gl_Position = clipOf(p); }`;
const RECT_FS = `#version 300 es
precision mediump float;
in highp vec2 vP; in highp vec4 vRect; in float vR; in vec4 vCol; out vec4 o;
void main() {
  highp vec2 c = vRect.xy + vRect.zw * 0.5, hs = vRect.zw * 0.5;
  highp vec2 q = abs(vP - c) - hs + vR;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - vR;
  o = vCol * clamp(0.5 - d, 0.0, 1.0);
}`;
// (The strip: iA, iB a segment's ends in device pixels, read from one buffer of points at two offsets; a capsule of half width uHalf.)
const LINE_VS = `${VS_HEAD}in vec2 aCorner; in vec2 iA; in vec2 iB; uniform float uHalf;
out vec2 vP; out vec2 vA; out vec2 vB;
void main() {
  vec2 d = iB - iA; float l = length(d); vec2 t = l > 1e-4 ? d / l : vec2(1.0, 0.0), n = vec2(-t.y, t.x);
  float e = uHalf + 1.0;
  vec2 p = mix(iA - t * e, iB + t * e, aCorner.x) + n * e * (aCorner.y * 2.0 - 1.0);
  vP = p; vA = iA; vB = iB; gl_Position = clipOf(p);
}`;
const LINE_FS = `#version 300 es
precision highp float;
in vec2 vP; in vec2 vA; in vec2 vB; uniform float uHalf; uniform vec4 uCol; out vec4 o;
void main() {
  vec2 pa = vP - vA, ba = vB - vA;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  float d = length(pa - ba * h);
  o = uCol * clamp(uHalf + 0.5 - d, 0.0, 1.0);
}`;
// (Glyphs: iDst = x, y, w, h on the canvas (device px), iSrc the glyph's box in the atlas (atlas px), iCol premultiplied, iK device px per
// atlas px. The field's distance to the edge, in device px, gives the coverage as a canvas's antialiased edge: half a pixel each side.)
const GLYPH_VS = `${VS_HEAD}in vec2 aCorner; in vec4 iDst; in vec4 iSrc; in vec4 iCol; in float iK; uniform vec2 uAtlas;
out vec2 vUV; out vec4 vCol; out float vK;
void main() { vUV = (iSrc.xy + aCorner * iSrc.zw) / uAtlas; vCol = iCol; vK = iK; gl_Position = clipOf(iDst.xy + aCorner * iDst.zw); }`;
const GLYPH_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec2 uSdf; in vec2 vUV; in vec4 vCol; in float vK; out vec4 o;
void main() {
  float d = (1.0 - uSdf.y - texture(uTex, vUV).r) * uSdf.x * vK;
  float a = clamp(0.5 - d, 0.0, 1.0);
  if (a <= 0.0) discard;
  o = vCol * a;
}`;

// The atlas's image, decoded once for every monitor (no canvas); a monitor drawn before it is in is drawn again when it is.
let atlasImage = null;
const waiting = new Set();
// (Review pass 2, item 2: each monitor's context takes the atlas up as the picture is decoded (a task of its own) or as its programs are
// published, never in the first frame that draws words. ?atlasidle=0: sent in that frame, as before.)
const ATLAS_IDLE = !(typeof location !== 'undefined' && /[?&]atlasidle=0\b/.test(location.search || ''));
const atlasTakers = new Set();
if (typeof Image === 'function') { const im = new Image(); im.decoding = 'async'; im.onload = () => { atlasImage = im; if (ATLAS_IDLE) { for (const f of [...atlasTakers]) f(); atlasTakers.clear(); } for (const f of [...waiting]) f(); waiting.clear(); }; im.src = ATLAS_PNG; }
const WEIGHTS = Object.keys(GLYPHS).map(Number);
const weightOf = (w) => WEIGHTS.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
/** A word's width in CSS px at weight w and size px, from the atlas's advances and kerning (no canvas). */
export function textWidth(str, w, px) {
  const g = GLYPHS[weightOf(w)], kw = KERN[weightOf(w)];
  let em = 0, prev = '';
  for (const ch of String(str)) { em += (g[ch] || g['?'])[0] + (prev ? kw[prev + ch] || 0 : 0); prev = ch; }
  return em * px;
}

/**
 * A GPU renderer on `cv`, or null where WebGL 2 cannot be had (the caller keeps its 2D canvas: no context of any kind was made on it then).
 */
export function createVitalsGL(cv) {
  if (typeof WebGL2RenderingContext === 'undefined') return null;
  let gl = null;
  try { gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false }); } catch { gl = null; }
  if (!gl) return null;
  let R = null, lost = false;
  let atlasIn = false;   // (the atlas's image is in this context's texture)

  function init() {
    const quad = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);
    const progs = {
      rect: startProgram(gl, RECT_VS, RECT_FS, [['aCorner', 0], ['iRect', 1], ['iR', 2], ['iCol', 3]]),
      line: startProgram(gl, LINE_VS, LINE_FS, [['aCorner', 0], ['iA', 1], ['iB', 2]]),
      glyph: startProgram(gl, GLYPH_VS, GLYPH_FS, [['aCorner', 0], ['iDst', 1], ['iSrc', 2], ['iCol', 3], ['iK', 4]]),
    };
    const qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const mk = (attrs) => {
      const vao = gl.createVertexArray(), buf = gl.createBuffer();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      for (const [loc, n, stride, off] of attrs) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, stride, off); gl.vertexAttribDivisor(loc, 1); }
      gl.bindVertexArray(null);
      return { vao, buf, cap: 0 };
    };
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    R = {
      progs, ready: false, u: null, tex,
      rect: mk([[1, 4, 36, 0], [2, 1, 36, 16], [3, 4, 36, 20]]),
      line: mk([[1, 2, 8, 0], [2, 2, 8, 8]]),
      glyph: mk([[1, 4, 52, 0], [2, 4, 52, 16], [3, 4, 52, 32], [4, 1, 52, 48]]),
    };
    atlasIn = false;
    if (ATLAS_IDLE) publishWhenDone(gl, Object.values(progs), () => { if (R && !lost && publish()) atlasReady(); });
  }
  const taker = () => { if (R && !lost && !gl.isContextLost()) atlasReady(); };
  if (ATLAS_IDLE && !atlasImage) atlasTakers.add(taker);
  function publish() {
    if (R.ready) return true;
    if (!compileDone(gl, Object.values(R.progs))) return false;
    try {
      const p = {}; for (const [k, h] of Object.entries(R.progs)) p[k] = checkProgram(gl, h);
      const u = (pr, n) => gl.getUniformLocation(pr, n);
      R.p = p;
      R.u = {
        rect: { size: u(p.rect, 'uSize') },
        line: { size: u(p.line, 'uSize'), half: u(p.line, 'uHalf'), col: u(p.line, 'uCol') },
        glyph: { size: u(p.glyph, 'uSize'), atlas: u(p.glyph, 'uAtlas'), tex: u(p.glyph, 'uTex'), sdf: u(p.glyph, 'uSdf') },
      };
      R.ready = true;
    } catch (e) { R.failed = String(e?.message || e); return false; }
    return true;
  }
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; R = null; });
  cv.addEventListener('webglcontextrestored', () => { lost = false; init(); });
  init();

  /** Puts the atlas's image in the texture once it is decoded (an upload of the image, once per context). False until then. */
  function atlasReady(redraw) {
    if (atlasIn) return true;
    if (!atlasImage) { if (redraw) waiting.add(redraw); return false; }
    gl.bindTexture(gl.TEXTURE_2D, R.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasImage);
    atlasIn = true;
    return true;
  }
  // A word's glyphs as instance data: each glyph's box on the canvas from the pen, its box in the atlas, the colour and the field's scale.
  function layText(out, n, str, w, px, x, y, col, dpr) {
    const wt = weightOf(w), g = GLYPHS[wt], kw = KERN[wt], k = px / BASE, kd = k * dpr;
    let pen = x * dpr, prev = '';
    const by = y * dpr;
    for (const ch of String(str)) {
      const e = g[ch] || g['?'];
      if (prev) pen += (kw[prev + ch] || 0) * px * dpr;
      if (e[3] > 0 && e[4] > 0) {
        out.set([pen - e[5] * kd, by - e[6] * kd, e[3] * kd, e[4] * kd, e[1], e[2], e[3], e[4], col[0], col[1], col[2], col[3], kd], n * 13);
        n++;
      }
      pen += e[0] * px * dpr; prev = ch;
    }
    return n;
  }
  function send(slot, data) {
    gl.bindBuffer(gl.ARRAY_BUFFER, slot.buf);
    if (data.length > slot.cap) { slot.cap = Math.max(64, data.length * 2); gl.bufferData(gl.ARRAY_BUFFER, slot.cap * 4, gl.DYNAMIC_DRAW); }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
  }

  return {
    get ready() { return !!R && !lost && publish(); },
    get lost() { return lost || gl.isContextLost(); },
    get failed() { return R?.failed || null; },
    /**
     * One frame. `s`: { W, H (device pixels), dpr, rects: [[x, y, w, h, r, col], …] (CSS pixels), line: { pts: Float32Array of device
     * pixels, n, half, col, clip: [x, y, w, h] device }, texts: [[text, weight, px, x, y, col], …] (x, y the pen on the baseline, CSS px),
     * redraw: called once the atlas is in if it was not yet }. False when nothing could be drawn (no program yet, a lost context).
     */
    draw(s) {
      if (!R || lost || gl.isContextLost() || !publish()) return false;
      const { W, H, dpr } = s;
      gl.viewport(0, 0, W, H);
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      // Rectangles.
      const rd = new Float32Array(s.rects.length * 9);
      s.rects.forEach(([x, y, w, h, r, col], i) => { rd.set([x * dpr, y * dpr, w * dpr, h * dpr, r * dpr, ...col], i * 9); });
      if (s.rects.length) {
        gl.useProgram(R.p.rect); gl.uniform2f(R.u.rect.size, W, H);
        send(R.rect, rd); gl.bindVertexArray(R.rect.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, s.rects.length);
      }
      // The strip.
      const L = s.line;
      if (L && L.n > 1) {
        gl.useProgram(R.p.line); gl.uniform2f(R.u.line.size, W, H); gl.uniform1f(R.u.line.half, L.half); gl.uniform4fv(R.u.line.col, L.col);
        gl.enable(gl.SCISSOR_TEST);
        const [cx, cy, cw, ch] = L.clip; gl.scissor(Math.round(cx), Math.round(H - cy - ch), Math.round(cw), Math.round(ch));
        send(R.line, L.pts.subarray(0, L.n * 2)); gl.bindVertexArray(R.line.vao);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, L.n - 1);
        gl.disable(gl.SCISSOR_TEST);
      }
      // Words and digits, from the shared atlas (none until its image is in; the monitor is drawn again then).
      if (s.texts.length && atlasReady(s.redraw)) {
        let cap = 0; for (const t of s.texts) cap += String(t[0]).length;
        const gd = new Float32Array(cap * 13);
        let n = 0;
        for (const [str, w, px, x, y, col] of s.texts) n = layText(gd, n, str, w, px, x, y, col, dpr);
        if (n) {
          gl.useProgram(R.p.glyph); gl.uniform2f(R.u.glyph.size, W, H); gl.uniform2f(R.u.glyph.atlas, ATLAS_W, ATLAS_H); gl.uniform2f(R.u.glyph.sdf, RADIUS, CUTOFF);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R.tex); gl.uniform1i(R.u.glyph.tex, 0);
          send(R.glyph, gd.subarray(0, n * 13)); gl.bindVertexArray(R.glyph.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
        }
      }
      gl.bindVertexArray(null);
      return true;
    },
    dispose() { atlasTakers.delete(taker); gl.getExtension('WEBGL_lose_context')?.loseContext(); R = null; lost = true; },
  };
}
