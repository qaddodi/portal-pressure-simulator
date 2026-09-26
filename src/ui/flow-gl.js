// Flow marks on the GPU (WebGL2). The same picture as the Canvas2D renderer in stage.js, drawn
// as one instanced batch per frame: each arrowhead and bleed droplet is a quad (the trail kind is kept but unused)
// whose shape (a signed distance field) is cut in the fragment shader, antialiased at any zoom.
//
// Occlusion (a mark sliding under an organ or a nearer vessel) comes from a mask texture the
// GPU renders when the layout changes: vessel centerlines as round-capped segments, plus the
// organ outlines, rasterized once in world space and drawn through the current view transform.
// Channel R hides marks of depth 0 (behind the organs and every nearer vessel), G hides depth
// 0–1 (behind the portal tree in front).
//
// createFlowGL(canvas) returns null when WebGL2 is unavailable; stage.js then uses Canvas2D.

const QUAD = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

const MARK_VS = `#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in vec2 pos;
layout(location=2) in vec2 dir;
layout(location=3) in vec4 geo;    // size, kind (0 dart, 1 trail, 2 ellipse), p1, p2
layout(location=4) in vec4 fill;
layout(location=5) in vec4 halo;
layout(location=6) in vec4 misc;   // halo width, depth, alpha, -
uniform mat3 world;                // world → device pixels
uniform vec2 size;                 // canvas size in device pixels
uniform float pad;                 // antialiasing margin, world units
out vec2 vLocal;
flat out vec4 vGeo, vFill, vHalo, vMisc;
void main() {
  float s = geo.x, kind = geo.y;
  vec2 lo, hi;
  float m = pad + misc.x;
  if (kind < 0.5) { lo = vec2(-0.45 * s, -0.45 * s); hi = vec2(0.55 * s, 0.45 * s); }
  else if (kind < 1.5) { float r = 0.15 * s; lo = vec2(-geo.w - r, -r); hi = vec2(-geo.z + r, r); }
  else { lo = -geo.zw; hi = geo.zw; }
  vec2 local = mix(lo - m, hi + m, corner * 0.5 + 0.5);
  vec2 n = vec2(-dir.y, dir.x);
  vec2 w = pos + dir * local.x + n * local.y;
  vec3 d = world * vec3(w, 1.0);
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
  vLocal = local; vGeo = geo; vFill = fill; vHalo = halo; vMisc = misc;
}`;

const MARK_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
flat in vec4 vGeo, vFill, vHalo, vMisc;
uniform sampler2D mask;
uniform int useMask;
out vec4 outColor;
float sdDart(vec2 p, float s) {
  vec2 v[4] = vec2[4](vec2(0.55, 0.0) * s, vec2(-0.45, 0.45) * s, vec2(-0.2, 0.0) * s, vec2(-0.45, -0.45) * s);
  float d = dot(p - v[0], p - v[0]);
  float sg = 1.0;
  for (int i = 0, j = 3; i < 4; j = i, i++) {
    vec2 e = v[j] - v[i], w = p - v[i];
    vec2 b = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    d = min(d, dot(b, b));
    bvec3 c = bvec3(p.y >= v[i].y, p.y < v[j].y, e.x * w.y > e.y * w.x);
    if (all(c) || all(not(c))) sg = -sg;
  }
  return sg * sqrt(d);
}
void main() {
  float kind = vGeo.y, s = vGeo.x;
  vec4 col;
  if (kind < 0.5) {
    float d = sdDart(vLocal, s);
    float aa = max(fwidth(d), 1e-4);
    float hw = vMisc.x * 0.5;
    float fa = clamp(0.5 - d / aa, 0.0, 1.0) * vFill.a;
    float band = clamp(0.5 - (d - hw) / aa, 0.0, 1.0) - clamp(0.5 - (d + hw) / aa, 0.0, 1.0);
    float ha = band * vHalo.a;
    // The halo is stroked first and the fill drawn over it (premultiplied "over").
    col = vec4(vFill.rgb * fa, fa) + vec4(vHalo.rgb * ha, ha) * (1.0 - fa);
  } else {
    float d;
    if (kind < 1.5) {
      vec2 a = vec2(-vGeo.z, 0.0), b = vec2(-vGeo.w, 0.0), pa = vLocal - a, ba = b - a;
      float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
      d = length(pa - ba * h) - 0.15 * s;
    } else {
      vec2 r = vGeo.zw;
      d = (length(vLocal / r) - 1.0) * min(r.x, r.y);
    }
    float aa = max(fwidth(d), 1e-4);
    float fa = clamp(0.5 - d / aa, 0.0, 1.0) * vFill.a;
    col = vec4(vFill.rgb * fa, fa);
  }
  col *= vMisc.z;
  if (useMask == 1 && vMisc.y < 1.5) {
    vec2 m = texelFetch(mask, ivec2(gl_FragCoord.xy), 0).rg;
    col *= (vMisc.y < 0.5 ? 1.0 - m.r : 1.0) * (1.0 - m.g);
  }
  if (col.a < 0.002) discard;
  outColor = col;
}`;

// Mask: round-capped segments (vessel centerlines) written with MAX blending.
const SEG_VS = `#version 300 es
layout(location=0) in vec2 corner;
layout(location=1) in vec4 seg;    // ax, ay, bx, by (world)
layout(location=2) in vec4 info;   // radius (world), R, G, -
uniform mat3 world;
uniform vec2 size;
uniform float pad;
out vec2 vP;
flat out vec4 vSeg, vInfo;
void main() {
  vec2 a = seg.xy, b = seg.zw;
  vec2 t = b - a; float L = length(t);
  t = L > 1e-6 ? t / L : vec2(1.0, 0.0);
  vec2 n = vec2(-t.y, t.x);
  float r = info.x + pad;
  vec2 c = corner * 0.5 + 0.5;
  vec2 w = a + t * mix(-r, L + r, c.x) + n * mix(-r, r, c.y);
  vec3 d = world * vec3(w, 1.0);
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
  vP = w; vSeg = seg; vInfo = info;
}`;
const SEG_FS = `#version 300 es
precision highp float;
in vec2 vP;
flat in vec4 vSeg, vInfo;
out vec4 outColor;
void main() {
  vec2 pa = vP - vSeg.xy, ba = vSeg.zw - vSeg.xy;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  float d = length(pa - ba * h) - vInfo.x;
  float aa = max(fwidth(d), 1e-4);
  float c = clamp(0.5 - d / aa, 0.0, 1.0);
  outColor = vec4(vInfo.y * c, vInfo.z * c, 0.0, 1.0);
}`;
// Mask: the organ covers (a world-space bitmap) through the view transform, into R.
const TEX_VS = `#version 300 es
layout(location=0) in vec2 corner;
uniform mat3 world;
uniform vec2 size;
uniform vec4 rect;                 // world x, y, w, h of the bitmap
out vec2 vUV;
void main() {
  vec2 c = corner * 0.5 + 0.5;
  vec3 d = world * vec3(rect.xy + c * rect.zw, 1.0);
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
  vUV = c;
}`;
const TEX_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D tex;
out vec4 outColor;
void main() { outColor = vec4(texture(tex, vUV).a, 0.0, 0.0, 1.0); }`;

function compile(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    gl.attachShader(p, sh);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}

// Parses 'rgba(r, g, b, a)' / 'rgb(r, g, b)' once per distinct string.
const colorCache = new Map();
export function rgba(c) {
  let v = colorCache.get(c);
  if (v) return v;
  const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(c || '');
  v = m ? [m[1] / 255, m[2] / 255, m[3] / 255, m[4] == null ? 1 : +m[4]] : [0, 0, 0, 1];
  colorCache.set(c, v);
  return v;
}

export const MARK_FLOATS = 20;
export const SEG_FLOATS = 8;

export function createFlowGL(canvas, { force = false } = {}) {
  let gl = null;
  // Only on a real GPU: with software rendering (no GPU, or a blocklisted driver) the browser
  // refuses the context and the Canvas2D renderer, cheaper on a CPU, takes over.
  try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: !force }); } catch { gl = null; }
  if (!gl) return null;
  let mark, seg, tex;
  try { mark = compile(gl, MARK_VS, MARK_FS); seg = compile(gl, SEG_VS, SEG_FS); tex = compile(gl, TEX_VS, TEX_FS); } catch (e) { console.warn('Flow renderer: WebGL2 shaders failed, using Canvas2D.', e); return null; }

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);

  // Mark instances.
  const markVAO = gl.createVertexArray();
  const markBuf = gl.createBuffer();
  gl.bindVertexArray(markVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, markBuf);
  const MS = MARK_FLOATS * 4;
  [[1, 2, 0], [2, 2, 2], [3, 4, 4], [4, 4, 8], [5, 4, 12], [6, 4, 16]].forEach(([loc, n, off]) => {
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, MS, off * 4); gl.vertexAttribDivisor(loc, 1);
  });
  // Mask segments.
  const segVAO = gl.createVertexArray();
  const segBuf = gl.createBuffer();
  gl.bindVertexArray(segVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, segBuf);
  const SS = SEG_FLOATS * 4;
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, SS, 0); gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, SS, 16); gl.vertexAttribDivisor(2, 1);
  // Organ bitmap quad.
  const texVAO = gl.createVertexArray();
  gl.bindVertexArray(texVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  // Mask target, sized with the canvas.
  const maskTex = gl.createTexture();
  const fbo = gl.createFramebuffer();
  let maskW = 0, maskH = 0;
  function sizeMask() {
    if (maskW === canvas.width && maskH === canvas.height) return;
    maskW = canvas.width; maskH = canvas.height;
    gl.bindTexture(gl.TEXTURE_2D, maskTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, maskW, maskH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, maskTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  const organTex = gl.createTexture();
  let organRect = null;

  let markData = new Float32Array(MARK_FLOATS * 512), segData = new Float32Array(SEG_FLOATS * 4096);
  let W = [1, 0, 0, 1, 0, 0], pad = 1, hasMask = false, lost = false;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
  const mat = () => new Float32Array([W[0], W[1], 0, W[2], W[3], 0, W[4], W[5], 1]);

  return {
    kind: 'webgl2',
    get lost() { return lost; },
    /** World → device-pixel transform [a, b, c, d, e, f], as for Canvas2D setTransform. */
    setTransform(m) { W = m; pad = 1.5 / Math.max(1e-6, Math.hypot(m[0], m[1])); },
    ensureMarks(n) { if (markData.length < n * MARK_FLOATS) markData = new Float32Array(Math.ceil(n * 1.5) * MARK_FLOATS); return markData; },
    ensureSegs(n) { if (segData.length < n * SEG_FLOATS) segData = new Float32Array(Math.ceil(n * 1.5) * SEG_FLOATS); return segData; },
    /** The organ covers as a world-space bitmap: a canvas and the world rectangle it spans. */
    setOrgans(bitmap, rect) {
      gl.bindTexture(gl.TEXTURE_2D, organTex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      organRect = rect;
    },
    /** Renders the occlusion mask: `n` segments from ensureSegs(), plus the organs if asked. */
    buildMask(n, organs) {
      sizeMask();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, maskW, maskH);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.MAX);
      gl.blendFunc(gl.ONE, gl.ONE);
      const M = mat();
      if (organs && organRect) {
        gl.useProgram(tex.p);
        gl.uniformMatrix3fv(tex.u.world, false, M);
        gl.uniform2f(tex.u.size, maskW, maskH);
        gl.uniform4f(tex.u.rect, ...organRect);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, organTex);
        gl.uniform1i(tex.u.tex, 0);
        gl.bindVertexArray(texVAO);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      if (n) {
        gl.useProgram(seg.p);
        gl.uniformMatrix3fv(seg.u.world, false, M);
        gl.uniform2f(seg.u.size, maskW, maskH);
        gl.uniform1f(seg.u.pad, pad);
        gl.bindVertexArray(segVAO);
        gl.bindBuffer(gl.ARRAY_BUFFER, segBuf);
        gl.bufferData(gl.ARRAY_BUFFER, segData.subarray(0, n * SEG_FLOATS), gl.DYNAMIC_DRAW);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
      }
      gl.blendEquation(gl.FUNC_ADD);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindVertexArray(null);
      hasMask = true;
    },
    clearMask() { hasMask = false; },
    /** Clears the canvas and draws `n` marks from ensureMarks(). */
    draw(n) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!n) return;
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(mark.p);
      gl.uniformMatrix3fv(mark.u.world, false, mat());
      gl.uniform2f(mark.u.size, canvas.width, canvas.height);
      gl.uniform1f(mark.u.pad, pad);
      gl.uniform1i(mark.u.useMask, hasMask ? 1 : 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, maskTex);
      gl.uniform1i(mark.u.mask, 0);
      gl.bindVertexArray(markVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, markBuf);
      gl.bufferData(gl.ARRAY_BUFFER, markData.subarray(0, n * MARK_FLOATS), gl.DYNAMIC_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
      gl.bindVertexArray(null);
    },
    clear() { gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); },
  };
}
