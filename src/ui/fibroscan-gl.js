// The FibroScan's elastogram on the GPU: the same map drawElastogram (fibroscan.js) computes pixel by pixel, from the same
// noise grids and the same formula, one fragment per map pixel. On the CPU a map took 13 to 29 ms (140 to 300 pixels a
// side), too long for a frame at 120 a second; here it costs a fraction of a millisecond. Where WebGL2 is missing or the
// context is lost there is no map (fibroscan.js keeps the CPU's map only as the checks' reference).
//
// A panel's map is drawn inside its chart drawer's own context (elastogramUnder, under the words); elastogramGL's own small
// context is kept for the checks and for a panel drawn without the chart drawer (?tracegl=0).

import { startProgram, checkProgram, exerciseDraw, publishWhenDone } from './gl-compile.js?v=5096509185';

const VS = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

// Mirrors drawElastogram line for line. Each noise field is a periodic grid of values sampled with a smoothstep blend;
// a field's offset along the stream (uOff*) is reduced by its own period on the CPU in double precision, so the
// float32 arithmetic here never works with large coordinates.
const FS = `#version 300 es
precision highp float;
uniform sampler2D uA1, uA2, uB1, uB2, uP1, uP2;
uniform vec3 uCell;        // the cells of the a, b and p fields
uniform vec4 uOffA;        // a1, a2: x offset, y offset (twice: the two fields share their period)
uniform vec4 uOffB;
uniform vec4 uOffP;
uniform float uN, uNB, uC, uT0;
uniform vec2 uRes;          // the target's size in device px (the map's N × N, or a chart's whole canvas, stretched as the map was)
uniform float uRad;         // its corners' radius in device px (0: square)
uniform vec3 uCos, uSin;   // cos and sin of the three mixing phases
out vec4 o;
float field(sampler2D g, float cell, float x, float y) {
  ivec2 gs = textureSize(g, 0);
  float fx = x / cell, fy = y / cell, fix = floor(fx), fiy = floor(fy);
  float tx = fx - fix, ty = fy - fiy, sx = tx * tx * (3.0 - 2.0 * tx), sy = ty * ty * (3.0 - 2.0 * ty);
  float gw = float(gs.x), gh = float(gs.y);
  int ix = int(mod(fix, gw)), iy = int(mod(fiy, gh)), jx = int(mod(fix + 1.0, gw)), jy = int(mod(fiy + 1.0, gh));
  float a = texelFetch(g, ivec2(ix, iy), 0).r, b = texelFetch(g, ivec2(jx, iy), 0).r;
  float c = texelFetch(g, ivec2(ix, jy), 0).r, d = texelFetch(g, ivec2(jx, jy), 0).r;
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
void main() {
  if (uRad > 0.0) {   // (a chart's rounded box: nothing drawn past its corners)
    vec2 q = abs(gl_FragCoord.xy - uRes * 0.5) - (uRes * 0.5 - uRad);
    if (length(max(q, 0.0)) > uRad) discard;
  }
  // (Map px at this fragment: on an N × N target the pixel's own index; on a chart's canvas the same map stretched to it.)
  float x = (gl_FragCoord.x - 0.5) * uN / uRes.x, y = uN - 1.0 - (gl_FragCoord.y - 0.5) * uN / uRes.y;   // (the map's first row is the top)
  float tMs = (x / uN) * 80.0, depth = 20.0 + (y / uN) * 50.0;   // (fibroscan.js DEPTH0, DEPTH_SPAN)
  float s = tMs - uT0 - (depth - 25.0) / uC;   // (WIN0: the wave reaches the top of the M probe's window at uT0)
  float across = (s / 80.0) * uNB * 1.6 + uNB * 1.7, along = y * (uNB / uN) * 0.65 + uNB * 0.6;
  float a = 0.5 + (field(uA1, uCell.x, across + uOffA.x, along + uOffA.y) - 0.5) * uCos.x + (field(uA2, uCell.x, across + uOffA.z, along + uOffA.w) - 0.5) * uSin.x;
  float b = 0.5 + (field(uB1, uCell.y, across * 1.4 + uOffB.x, along + uOffB.y) - 0.5) * uCos.y + (field(uB2, uCell.y, across * 1.4 + uOffB.z, along + uOffB.w) - 0.5) * uSin.y;
  float jit = (0.5 + (field(uP1, uCell.z, across + uOffP.x, along + uOffP.y) - 0.5) * uCos.z + (field(uP2, uCell.z, across + uOffP.z, along + uOffP.w) - 0.5) * uSin.z - 0.5) * 2.2;
  float noise = a * 0.6 + b * 0.4;
  float w = cos(6.283185307179586 * 0.05 * s + jit);
  float u = clamp((s + 9.0) / 6.0, 0.0, 1.0), arrive = u * u * (3.0 - 2.0 * u);
  float amp = (0.2 + 0.8 * arrive) * clamp(1.0 - max(s, 0.0) / 40.0, 0.12, 1.0) * clamp(1.2 - (depth - 20.0) / 110.0, 0.5, 1.0);
  float q = (s + 3.5) / 3.2, band = exp(-(q * q));
  float k = pow(clamp(0.76 + w * 0.32 * amp + (noise - 0.5) * 1.25 - band * 0.55, 0.0, 1.0), 1.5);
  o = vec4((20.0 + 220.0 * k) / 255.0, (10.0 + 126.0 * k) / 255.0, (8.0 + 64.0 * k) / 255.0, 1.0);
}`;

const UNIS = ['uA1', 'uA2', 'uB1', 'uB2', 'uP1', 'uP2', 'uCell', 'uOffA', 'uOffB', 'uOffP', 'uN', 'uNB', 'uC', 'uT0', 'uCos', 'uSin', 'uRes', 'uRad'];
let st = null;   // { canvas, gl, U, publish, lost } once made; false when WebGL2 is unavailable

function make(F) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
  if (!gl) return false;
  // (lost: the GPU does not draw the map, from the loss until the rebuilt program is published.)
  let lost = false, started = null, stopPoll = null;
  const U = {};
  const s = { canvas, gl, U, failed: false, published: false, get lost() { return lost || s.failed; } };
  // The finished program read, its samplers set and one draw made into a throwaway 1 × 1 target, so the first map has no driver work left.
  s.publish = () => {
    if (s.published || s.failed || gl.isContextLost()) return;
    try {
      const prog = checkProgram(gl, started);
      gl.useProgram(prog);
      for (const n of UNIS) U[n] = gl.getUniformLocation(prog, n);
      ['a1', 'a2', 'b1', 'b2', 'p1', 'p2'].forEach((k, i) => gl.uniform1i(U[`u${k.toUpperCase()}`], i));
      exerciseDraw(gl, () => { gl.uniform1f(U.uN, 1); gl.uniform1f(U.uNB, 1); gl.uniform1f(U.uC, 1); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); });
      s.published = true; lost = false;   // (after a restore: the GPU draws the maps again)
    } catch (e) {
      if (gl.isContextLost()) return;   // (lost while it was read: the restore makes it again)
      s.failed = true; console.warn('FibroScan map: WebGL2 shader failed, drawn on the CPU.', e);
    }
  };
  // What the context holds: the program, the quad and the six noise grids. Made at the start, and again when a lost context comes back.
  function build() {
    s.published = false; s.failed = false;
    started = startProgram(gl, VS, FS, [['p', 0]]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    // The noise grids, as they are (one float a texel, fetched exactly).
    ['a1', 'a2', 'b1', 'b2', 'p1', 'p2'].forEach((k, i) => {
      const f = F[k], t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, f.gw, f.gh, 0, gl.RED, gl.FLOAT, Float32Array.from(f.grid));
    });
    stopPoll?.(); stopPoll = publishWhenDone(gl, [started], s.publish);
  }
  build();
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
  // A context the browser gives back is built afresh; the maps stay on the CPU (lost) until the program is published, at an idle moment.
  canvas.addEventListener('webglcontextrestored', () => {
    try { build(); } catch (e) { s.failed = true; console.warn('FibroScan map: WebGL2 could not be rebuilt, drawn on the CPU.', e); }
  });
  return s;
}

/**
 * The map for shear speed c (m/s) at time t (s), N × N pixels, drawn on the GPU: a canvas to copy from at once (its
 * top-left N × N pixels), or null (no WebGL2, or the context was lost: draw it on the CPU instead).
 * F: fibroscan.js's noise fields (each with its grid, gw, gh and cell); NB: their layout grid; t0: the wave's start (ms).
 */
export function elastogramGL(F, NB, t0, N, c, t) {
  if (st === null) { try { st = make(F); } catch (e) { console.warn('FibroScan map: WebGL2 unavailable, drawn on the CPU.', e); st = false; } }
  return st ? drawMap(st, F, NB, t0, N, c, t) : null;
}
/**
 * A panel's own map drawer, its canvas to put in the page (under the panel's words): { canvas, draw(F, NB, t0, N, c, t) → whether it
 * drew, lost }, or null without WebGL2. Each panel has its own, so two panels on screen never share one canvas.
 */
export function createElastogramGL(F) {
  let s = null;
  try { s = make(F); } catch (e) { console.warn('FibroScan map: WebGL2 unavailable.', e); s = null; }
  if (!s) return null;
  return { canvas: s.canvas, draw: (fMap, NB, t0, N, c, t) => !!drawMap(s, fMap, NB, t0, N, c, t), get lost() { return s.lost; },
    /** Lets the context go (the panel is off screen): a page holds only so many WebGL contexts, and past that the browser drops the oldest, the figure's. */
    dispose() { stopAll(s); } };
}
function stopAll(s) { try { s.gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* already gone */ } s.canvas.width = s.canvas.height = 0; s.canvas.remove(); }
function drawMap(s, F, NB, t0, N, c, t) {
  if (s.lost) return null;
  s.publish();
  if (s.lost || !s.published) return null;
  const { gl, U, canvas } = s;
  if (canvas.width !== N || canvas.height !== N) { canvas.width = canvas.height = N; }
  gl.viewport(0, 0, N, N);
  gl.uniform2f(U.uRes, N, N); gl.uniform1f(U.uRad, 0);
  setMap(gl, U, F, NB, t0, N, c, t);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return canvas;
}
function setMap(gl, U, F, NB, t0, N, c, t) {
  const th1 = t * 1.3, th2 = t * 1.9 + 1, th3 = t * 2.3 + 2, flowY = t * 22, flowX = t * 9;
  // Each field's offset, reduced by the field's own period (exact in double precision).
  const per = (v, P) => ((v % P) + P) % P, off = (f, mx) => [per(flowX * mx, f.gw * f.cell), per(flowY, f.gh * f.cell)];
  gl.uniform3f(U.uCell, F.a1.cell, F.b1.cell, F.p1.cell);
  gl.uniform4f(U.uOffA, ...off(F.a1, 1), ...off(F.a2, 1));
  gl.uniform4f(U.uOffB, ...off(F.b1, 1.4), ...off(F.b2, 1.4));
  gl.uniform4f(U.uOffP, ...off(F.p1, 1), ...off(F.p2, 1));
  gl.uniform1f(U.uN, N); gl.uniform1f(U.uNB, NB); gl.uniform1f(U.uC, c); gl.uniform1f(U.uT0, t0);
  gl.uniform3f(U.uCos, Math.cos(th1), Math.cos(th2), Math.cos(th3));
  gl.uniform3f(U.uSin, Math.sin(th1), Math.sin(th2), Math.sin(th3));
}

/**
 * The map drawn inside another context: a chart drawer's own (trace-gl.js createTraceGL's `under`), so a FibroScan panel needs no
 * WebGL context of its own (a page holds only so many; past that the browser drops the oldest, the figure's). Returns
 * under(gl, W, H, gen): draws the map set by .set({ NB, t0, N, c, t, rad }) over the whole W × H target, its corners cut at rad device
 * px; its program and grids made in that context, again whenever gen changes (the context made again), compiled beside the page
 * (nothing drawn until then: .ready()).
 */
export function elastogramUnder(F) {
  let gen = -1, G = null, args = null, drew = false;
  function build(gl) {
    const started = startProgram(gl, VS, FS, [['p', 0]]);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    const tex = ['a1', 'a2', 'b1', 'b2', 'p1', 'p2'].map((k) => {
      const f = F[k], t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, f.gw, f.gh, 0, gl.RED, gl.FLOAT, Float32Array.from(f.grid));
      return t;
    });
    gl.bindTexture(gl.TEXTURE_2D, null);
    const g = { vao, tex, prog: null, U: {}, failed: false };
    // (Published once the driver says it is compiled: never a wait in a frame.)
    publishWhenDone(gl, [started], () => {
      if (G !== g || gl.isContextLost()) return;
      try { g.prog = checkProgram(gl, started); for (const n of UNIS) g.U[n] = gl.getUniformLocation(g.prog, n); } catch (e) { g.failed = true; console.warn('FibroScan map: shader failed.', e); }
      under.onReady?.();   // (the first map can be drawn now: the panel draws again, also while paused)
    });
    return g;
  }
  const under = (gl, W, H, g) => {
    drew = false;
    if (g !== gen || !G) { gen = g; G = build(gl); }
    if (!G.prog || !args) return;
    gl.useProgram(G.prog);
    G.tex.forEach((t, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(G.U[UNIS[i]], i); });
    gl.uniform2f(G.U.uRes, W, H); gl.uniform1f(G.U.uRad, args.rad || 0);
    setMap(gl, G.U, F, args.NB, args.t0, args.N, args.c, args.t);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(G.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    for (let i = 0; i < G.tex.length; i++) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, null); }
    drew = true;
  };
  under.set = (a) => { args = a; };
  /** Whether the last frame drew the map. */
  under.drew = () => drew;
  return under;
}

/**
 * Starts the map's shader ahead of the first map (the panel's creation calls it), so the compile runs beside the page and is published
 * when the driver has finished; the first map publishes it itself if it comes sooner. A no-op once made.
 */
export function prepareElastogramGL(F) {
  if (st !== null) return;
  try { st = make(F); } catch (e) { console.warn('FibroScan map: WebGL2 unavailable, drawn on the CPU.', e); st = false; }
}
