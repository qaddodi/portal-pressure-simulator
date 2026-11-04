// The vitals monitor on the GPU (vitals-monitor.js). Nothing is drawn with a 2D context while it runs:
// - the panel, the baseline and a reading's alarm patch are rounded rectangles, each one instance of a quad whose edge is found in the shader;
// - the EKG strip is a line of capsules, one instance per segment, read from the strip's points (two floats a point, the only data sent a frame);
// - every word and digit is a glyph of the shared SDF atlas of Inter (glyphs-inter.js, made offline by scripts/glyph-atlas.mjs), laid out
//   from its own advances and kerning and edged in the shader at the canvas's density, so a number that changes, a reading that turns to
//   the alarm colour or a new size needs no new picture.
// It has no WebGL context of its own (gpu-two-contexts-plan.md, U1, 4 Nov 2026): it draws in the chart pool's context (trace-gl.js, the
// same move the Doppler and the FibroScan map made), as the first thing in a frame of the monitor's chart drawer, and the drawer hands the
// picture to the monitor's own small canvas. The glyphs come from the pool's atlas texture, not a copy of its own.
// Its three programs are started when the context is first met (gl-compile.js) and published once the driver says they are done; a frame
// before that draws nothing new. A context made again, or the chart moved to another pool, builds everything afresh.
import { sdfAtlas } from './text-gl.js';   // (the app's one door to GPU text: its SDF atlas, for text that changes every frame)
const { GLYPHS, KERN, BASE, RADIUS, CUTOFF, ATLAS_W, ATLAS_H } = sdfAtlas;
import { startProgram, compileDone, checkProgram, publishWhenDone } from './gl-compile.js';
import { createTraceGL } from './trace-gl.js';

/** '#rgb', '#rrggbb', 'rgb()' or 'rgba()' as premultiplied [r, g, b, a] in 0–1. */
export function colorOf(c) {
  const hit = COLORS.get(c);
  if (hit) return hit;
  const out = parseColor(c);   // alloc-rare: a colour string not seen before, then kept
  if (COLORS.size > 64) COLORS.clear();
  COLORS.set(c, out);
  return out;
}
// (A colour's answer is kept by its string and handed out as the same array: the monitor asks for eight a frame and only reads them.)
const COLORS = new Map();
function parseColor(c0) {
  const c = String(c0 || '').trim(); // alloc-rare: a colour string not seen before, parsed once and kept
  let r, g, b, a = 1;
  if (c[0] === '#') {
    const x = c.length < 6 ? [...c.slice(1, 4)].map((d) => d + d).join('') : c.slice(1, 7); // alloc-rare: a colour string not seen before, parsed once and kept
    [r, g, b] = [0, 2, 4].map((k) => parseInt(x.slice(k, k + 2), 16) / 255); // alloc-rare: a colour string not seen before, parsed once and kept
    if (c.length === 9) a = parseInt(c.slice(7, 9), 16) / 255; // alloc-rare: a colour string not seen before, parsed once and kept
  } else {
    const n = c.match(/[\d.]+/g) || []; // alloc-rare: a colour string not seen before, parsed once and kept
    [r, g, b] = [0, 1, 2].map((k) => (+n[k] || 0) / 255); // alloc-rare: a colour string not seen before, parsed once and kept
    if (n.length > 3) a = +n[3];
  }
  return [r * a, g * a, b * a, a]; // alloc-rare: a colour string not seen before, parsed once and kept
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

const WEIGHTS = Object.keys(GLYPHS).map(Number);
function weightOf(w) {
  let a = WEIGHTS[0];
  for (let i = 1; i < WEIGHTS.length; i++) { const b = WEIGHTS[i]; if (Math.abs(b - w) < Math.abs(a - w)) a = b; }
  return a;
}
/** A word's width in CSS px at weight w and size px, from the atlas's advances and kerning (no canvas). */
export function textWidth(str, w, px) {
  const g = GLYPHS[weightOf(w)], kw = KERN[weightOf(w)];
  let em = 0, prev = '';
  if (typeof str !== 'string') str = String(str);   // alloc-rare: only a caller that passes a number or null, not a word
  for (const ch of str) { em += (g[ch] || g['?'])[0] + (prev ? kw[prev + ch] || 0 : 0); prev = ch; }
  return em * px;
}

/**
 * A GPU renderer for the monitor whose layout box is `cv`, or null where WebGL 2 cannot be had (nothing is drawn then). `redraw`: called
 * when the monitor can be drawn that it could not be (the pool's programs or atlas came in, a context came back).
 */
export function createVitalsGL(cv, { redraw = null } = {}) {
  if (typeof WebGL2RenderingContext === 'undefined') return null;
  let S = null;   // the frame being drawn (set by draw, read by under as the chart drawer's frame begins)
  let R = null, glOf = null, genOf = -1, drew = false, dead = false, failed = null, cancelPub = null;
  const pen = createTraceGL(cv, { redraw, keep: true, under: (gl) => { drew = false; if (sync(gl) && S) drew = paint(gl, S); } });
  if (!pen) return null;

  // What the pool's context holds for this monitor: three programs (started now, published when the driver is done), a quad and the
  // instance buffers of each. Made when the monitor first meets a context, and again whenever the chart's context is made again or the
  // chart moves to another pool: none of it survives that.
  function init(gl) {
    release();
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
    R = {
      gl, progs, ready: false, u: null, qb,
      rect: mk([[1, 4, 36, 0], [2, 1, 36, 16], [3, 4, 36, 20]]),
      line: mk([[1, 2, 8, 0], [2, 2, 8, 8]]),
      glyph: mk([[1, 4, 52, 0], [2, 4, 52, 16], [3, 4, 52, 32], [4, 1, 52, 48]]),
    };
    glOf = gl; failed = null;
    const mine = R;
    cancelPub = publishWhenDone(gl, Object.values(progs), () => { cancelPub = null; if (!dead && R === mine && !gl.isContextLost() && publish()) { try { redraw?.(); } catch (e) { console.warn('Vitals monitor: the redraw failed.', e); } } });
  }
  // Lets go of what this monitor made in the context it was in (not for a lost context: it holds nothing).
  function release() {
    if (cancelPub) { try { cancelPub(); } catch { /* already done */ } cancelPub = null; }
    const r = R; R = null;
    if (!r || r.gl.isContextLost()) return;
    try {
      const gl = r.gl;
      if (r.p) for (const k of Object.keys(r.p)) gl.deleteProgram(r.p[k]);
      for (const k of ['rect', 'line', 'glyph']) { gl.deleteVertexArray(r[k].vao); gl.deleteBuffer(r[k].buf); }
      gl.deleteBuffer(r.qb);
    } catch { /* a lost context holds nothing */ }
  }
  function publish() {
    if (R.ready) return true;
    if (!compileDone(R.gl, Object.values(R.progs))) return false;
    const gl = R.gl;
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
    } catch (e) { if (gl.isContextLost()) return false; failed = R.failed = String(e?.message || e); return false; }
    return true;
  }
  // The build for the context the chart draws in now: false where there is none or its programs are not published yet.
  function sync(gl) {
    if (dead || !gl || gl.isContextLost()) return false;
    if (!R || glOf !== gl || genOf !== pen.gen) { genOf = pen.gen; init(gl); }
    return publish();
  }
  function send(gl, slot, data) {
    gl.bindBuffer(gl.ARRAY_BUFFER, slot.buf);
    if (data.length > slot.cap) { slot.cap = Math.max(64, data.length * 2); gl.bufferData(gl.ARRAY_BUFFER, slot.cap * 4, gl.DYNAMIC_DRAW); }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
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
  // The frame, inside the chart drawer's own (its target cleared, its viewport the whole canvas): the pool's atlas is the glyphs' texture.
  function paint(gl, s) {
    const { W, H, dpr } = s;
    const atlas = pen.atlas;
    gl.viewport(0, 0, W, H);
    gl.disable(gl.SCISSOR_TEST);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    // Rectangles.
    const rd = new Float32Array(s.rects.length * 9);
    s.rects.forEach(([x, y, w, h, r, col], i) => { rd.set([x * dpr, y * dpr, w * dpr, h * dpr, r * dpr, ...col], i * 9); });
    if (s.rects.length) {
      gl.useProgram(R.p.rect); gl.uniform2f(R.u.rect.size, W, H);
      send(gl, R.rect, rd); gl.bindVertexArray(R.rect.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, s.rects.length);
    }
    // The strip.
    const L = s.line;
    if (L && L.n > 1) {
      gl.useProgram(R.p.line); gl.uniform2f(R.u.line.size, W, H); gl.uniform1f(R.u.line.half, L.half); gl.uniform4fv(R.u.line.col, L.col);
      gl.enable(gl.SCISSOR_TEST);
      const [cx, cy, cw, ch] = L.clip; gl.scissor(Math.round(cx), Math.round(H - cy - ch), Math.round(cw), Math.round(ch));
      send(gl, R.line, L.pts.subarray(0, L.n * 2)); gl.bindVertexArray(R.line.vao);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, L.n - 1);
      gl.disable(gl.SCISSOR_TEST);
    }
    // Words and digits, from the pool's atlas (the drawer only begins a frame once it is in).
    if (s.texts.length && atlas) {
      let cap = 0; for (const t of s.texts) cap += String(t[0]).length;
      const gd = new Float32Array(cap * 13);
      let n = 0;
      for (const [str, w, px, x, y, col] of s.texts) n = layText(gd, n, str, w, px, x, y, col, dpr);
      if (n) {
        gl.useProgram(R.p.glyph); gl.uniform2f(R.u.glyph.size, W, H); gl.uniform2f(R.u.glyph.atlas, ATLAS_W, ATLAS_H); gl.uniform2f(R.u.glyph.sdf, RADIUS, CUTOFF);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, atlas); gl.uniform1i(R.u.glyph.tex, 0);
        send(gl, R.glyph, gd.subarray(0, n * 13)); gl.bindVertexArray(R.glyph.vao); gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
      }
    }
    gl.bindVertexArray(null);
    return true;
  }

  return {
    get ready() { return !dead && !!R && !R.gl.isContextLost() && R.ready; },
    get lost() { return !dead && pen.lost; },
    get failed() { return failed; },
    /**
     * One frame. `s`: { W, H (device pixels), dpr, rects: [[x, y, w, h, r, col], …] (CSS pixels), line: { pts: Float32Array of device
     * pixels, n, half, col, clip: [x, y, w, h] device }, texts: [[text, weight, px, x, y, col], …] (x, y the pen on the baseline, CSS px) }.
     * False when nothing could be drawn (no program yet, a lost context, the pool's atlas not in): the monitor asks again; the last
     * completed picture stays on show meanwhile.
     */
    draw(s) {
      if (dead) return false;
      // (Built and published before the frame begins: a frame that cannot draw the monitor never clears the picture on show.)
      const gl = pen.glNow();
      if (!gl || !sync(gl)) return false;
      S = s; drew = false;
      try {
        if (!pen.begin(s.W / s.dpr, s.H / s.dpr, s.W, s.H)) return false;
        return pen.end() && drew;
      } finally { S = null; }
    },
    dispose() {
      if (dead) return;
      dead = true;
      release();
      pen.dispose();
    },
  };
}
