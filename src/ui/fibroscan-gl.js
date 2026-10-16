// The FibroScan's elastogram on the GPU: the same map drawElastogram (fibroscan.js) computes pixel by pixel, from the same
// noise grids and the same formula, one fragment per map pixel. On the CPU a map took 13 to 29 ms (140 to 300 pixels a
// side), too long for a frame at 120 a second; here it costs a fraction of a millisecond. fibroscan.js falls back to its
// own loop where WebGL2 is missing or the context is lost.
//
// One small context serves every FibroScan panel: a map is drawn into it (resized to the map's size) and copied out
// (drawImage) in the same task.

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
  float x = floor(gl_FragCoord.x), y = uN - 1.0 - floor(gl_FragCoord.y);   // (the map's first row is the top)
  float tMs = (x / uN) * 80.0, depth = 30.0 + (y / uN) * 60.0;
  float s = tMs - uT0 - (depth - 35.0) / uC;
  float across = (s / 80.0) * uNB * 1.6 + uNB * 1.7, along = y * (uNB / uN) * 0.65 + uNB * 0.6;
  float a = 0.5 + (field(uA1, uCell.x, across + uOffA.x, along + uOffA.y) - 0.5) * uCos.x + (field(uA2, uCell.x, across + uOffA.z, along + uOffA.w) - 0.5) * uSin.x;
  float b = 0.5 + (field(uB1, uCell.y, across * 1.4 + uOffB.x, along + uOffB.y) - 0.5) * uCos.y + (field(uB2, uCell.y, across * 1.4 + uOffB.z, along + uOffB.w) - 0.5) * uSin.y;
  float jit = (0.5 + (field(uP1, uCell.z, across + uOffP.x, along + uOffP.y) - 0.5) * uCos.z + (field(uP2, uCell.z, across + uOffP.z, along + uOffP.w) - 0.5) * uSin.z - 0.5) * 2.2;
  float noise = a * 0.6 + b * 0.4;
  float w = cos(6.283185307179586 * 0.05 * s + jit);
  float u = clamp((s + 9.0) / 6.0, 0.0, 1.0), arrive = u * u * (3.0 - 2.0 * u);
  float amp = (0.2 + 0.8 * arrive) * clamp(1.0 - max(s, 0.0) / 40.0, 0.12, 1.0) * clamp(1.2 - (depth - 30.0) / 110.0, 0.5, 1.0);
  float q = (s + 3.5) / 3.2, band = exp(-(q * q));
  float k = pow(clamp(0.76 + w * 0.32 * amp + (noise - 0.5) * 1.25 - band * 0.55, 0.0, 1.0), 1.5);
  o = vec4((20.0 + 220.0 * k) / 255.0, (10.0 + 126.0 * k) / 255.0, (8.0 + 64.0 * k) / 255.0, 1.0);
}`;

let st = null;   // { canvas, gl, prog, U, tex } once made; false when WebGL2 is unavailable

function make(F) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  if (!gl) return false;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.bindAttribLocation(prog, 0, 'p');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  for (const n of ['uA1', 'uA2', 'uB1', 'uB2', 'uP1', 'uP2', 'uCell', 'uOffA', 'uOffB', 'uOffP', 'uN', 'uNB', 'uC', 'uT0', 'uCos', 'uSin']) U[n] = gl.getUniformLocation(prog, n);
  // The noise grids, as they are (one float a texel, fetched exactly).
  ['a1', 'a2', 'b1', 'b2', 'p1', 'p2'].forEach((k, i) => {
    const f = F[k], t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + i);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, f.gw, f.gh, 0, gl.RED, gl.FLOAT, Float32Array.from(f.grid));
    gl.uniform1i(U[`u${k.toUpperCase()}`], i);
  });
  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
  return { canvas, gl, U, get lost() { return lost; } };
}

/**
 * The map for shear speed c (m/s) at time t (s), N × N pixels, drawn on the GPU: a canvas to copy from at once (its
 * top-left N × N pixels), or null (no WebGL2, or the context was lost: draw it on the CPU instead).
 * F: fibroscan.js's noise fields (each with its grid, gw, gh and cell); NB: their layout grid; t0: the wave's start (ms).
 */
export function elastogramGL(F, NB, t0, N, c, t) {
  if (st === null) { try { st = make(F); } catch (e) { console.warn('FibroScan map: WebGL2 unavailable, drawn on the CPU.', e); st = false; } }
  if (!st || st.lost) return null;
  const { gl, U, canvas } = st;
  if (canvas.width !== N || canvas.height !== N) { canvas.width = canvas.height = N; }
  gl.viewport(0, 0, N, N);
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
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return canvas;
}
