// The FibroScan's elastogram on the GPU: the same map drawElastogram (fibroscan.js) computes pixel by pixel, from the same
// noise grids and the same formula, one fragment per map pixel. On the CPU a map took 13 to 29 ms (140 to 300 pixels a
// side), too long for a frame at 120 a second; here it costs a fraction of a millisecond.
//
// It has no WebGL context of its own (gpu-two-contexts-plan.md, U1, 4 Nov 2026): the map is drawn inside the chart pool's context
// (elastogramUnder, under the words), as the first thing in a frame of the panel's chart drawer, and the drawer hands the picture to the
// panel's own small canvas. Where WebGL2 is missing, the pool cannot draw or a context is lost there is no map (fibroscan.js keeps the CPU's
// map, elastogramPixels, only as the checks' reference); the last completed picture stays until the retry draws it again.

import { startProgram, checkProgram, exerciseDraw, publishWhenDone } from './gl-compile.js';

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
uniform vec3 uLo, uHi;     // the map's colours, 0-255: the dark end, and what the brightest adds (the liver's orange, the spleen's violet)
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
  float noise = a * 0.6 + b * 0.4;
  float u = clamp((s + 9.0) / 6.0, 0.0, 1.0), arrive = u * u * (3.0 - 2.0 * u);
  // Look G (Mohammad's pick, 6 Nov 2026): one dark, ragged shear-wave band just right of the fitted line (s = 0: the line on its leading
  // edge), its width and course wobbling slowly down the depth, a faint second band behind it, on calm tissue.
  float wob = 0.5 + (field(uP1, uCell.z, uNB * 0.3 + uOffP.x, along + uOffP.y) - 0.5) * uCos.z + (field(uP2, uCell.z, uNB * 0.3 + uOffP.z, along + uOffP.w) - 0.5) * uSin.z;
  float hw = 4.6 * (0.8 + 0.4 * wob), dv = abs(s - (0.3 + hw * 0.8) - (wob - 0.5) * 1.0 - (a - 0.5) * 1.8);
  float vein = 1.0 - smoothstep(hw * 0.45, hw, dv);
  float d2 = (s - 19.0 - (a - 0.5) * 3.0) / 4.5, echo = exp(-(d2 * d2)) * 0.4;
  float k = pow(clamp(0.8 + (noise - 0.5) * (0.45 + 0.45 * arrive), 0.0, 1.0), 1.4) * (1.0 - 0.78 * vein) * (1.0 - 0.55 * echo);
  o = vec4((uLo + uHi * k) / 255.0, 1.0);
}`;

// The map's pixels in the small target of elastogramUnder (at most), and the second pass that stretches it over the chart.
const MAP_PX = 200000;
const SHOW_FS = `#version 300 es
precision highp float;
uniform sampler2D uMap;
uniform vec2 uRes;
uniform float uRad;
out vec4 o;
void main() {
  if (uRad > 0.0) {
    vec2 q = abs(gl_FragCoord.xy - uRes * 0.5) - (uRes * 0.5 - uRad);
    if (length(max(q, 0.0)) > uRad) discard;
  }
  o = vec4(texture(uMap, gl_FragCoord.xy / uRes).rgb, 1.0);
}`;

const UNIS = ['uA1', 'uA2', 'uB1', 'uB2', 'uP1', 'uP2', 'uCell', 'uOffA', 'uOffB', 'uOffP', 'uN', 'uNB', 'uC', 'uT0', 'uCos', 'uSin', 'uRes', 'uRad', 'uLo', 'uHi'];
const LIVER_LO = [20, 10, 8], LIVER_HI = [220, 126, 64];   // (fibroscan.js elastogramPixels: the checks' reference map is the liver's)
const per = (v, P) => ((v % P) + P) % P;   // (a field's offset reduced by its own period)
function setMap(gl, U, F, NB, t0, N, c, t) {
  const th1 = t * 1.3, th2 = t * 1.9 + 1, th3 = t * 2.3 + 2, flowY = t * 22, flowX = t * 9;
  // Each field's offset, reduced by the field's own period (exact in double precision).
  const { a1, a2, b1, b2, p1, p2 } = F;
  gl.uniform3f(U.uCell, a1.cell, b1.cell, p1.cell);
  gl.uniform4f(U.uOffA, per(flowX, a1.gw * a1.cell), per(flowY, a1.gh * a1.cell), per(flowX, a2.gw * a2.cell), per(flowY, a2.gh * a2.cell));
  gl.uniform4f(U.uOffB, per(flowX * 1.4, b1.gw * b1.cell), per(flowY, b1.gh * b1.cell), per(flowX * 1.4, b2.gw * b2.cell), per(flowY, b2.gh * b2.cell));
  gl.uniform4f(U.uOffP, per(flowX, p1.gw * p1.cell), per(flowY, p1.gh * p1.cell), per(flowX, p2.gw * p2.cell), per(flowY, p2.gh * p2.cell));
  gl.uniform1f(U.uN, N); gl.uniform1f(U.uNB, NB); gl.uniform1f(U.uC, c); gl.uniform1f(U.uT0, t0);
  gl.uniform3f(U.uCos, Math.cos(th1), Math.cos(th2), Math.cos(th3));
  gl.uniform3f(U.uSin, Math.sin(th1), Math.sin(th2), Math.sin(th3));
}

/**
 * The map drawn inside another context: a chart drawer's own (trace-gl.js createTraceGL's `under`), so a FibroScan panel needs no
 * WebGL context of its own (a page holds only so many; past that the browser drops the oldest, the figure's). Returns
 * under(gl, W, H, gen): draws the map set by .set({ NB, t0, N, c, t, rad, lo?, hi? }) over the whole W × H target, its corners cut at rad device
 * px; its program and grids made in that context, again whenever gen changes (the context made again), compiled beside the page
 * (nothing drawn until then: .ready()).
 */
export function elastogramUnder(F) {
  let gen = -1, G = null, args = null, drew = false;
  function build(gl) {
    const started = startProgram(gl, VS, FS, [['p', 0]]);
    const started2 = startProgram(gl, VS, SHOW_FS, [['p', 0]]);
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
    // (The map's own small target: it is smooth, so it is worked out at about a quarter of the chart's device pixels (never more than
    // MAP_PX of them) and stretched to the chart linearly in a second, cheap pass. The 24 field reads and the trig run on a fraction of
    // the pixels: on a phone's 3× screen the full-size map was most of the frame's GPU time.)
    const mapT = gl.createTexture(), fbo = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, mapT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    const g = { vao, tex, mapT, fbo, mw: 0, mh: 0, prog: null, show: null, U: {}, S: {}, failed: false };
    // (Published once the driver says it is compiled: never a wait in a frame.)
    publishWhenDone(gl, [started, started2], () => {
      if (G !== g || gl.isContextLost()) return;
      try {
        g.prog = checkProgram(gl, started); for (const n of UNIS) g.U[n] = gl.getUniformLocation(g.prog, n);
        g.show = checkProgram(gl, started2); for (const n of ['uMap', 'uRes', 'uRad']) g.S[n] = gl.getUniformLocation(g.show, n);
        // (One 1 × 1 draw of each, so the browser builds their GPU pipelines now, beside the page, not in the panel's first frame: Safari's was 37 ms.)
        exerciseDraw(gl, () => {
          gl.bindVertexArray(vao);
          gl.useProgram(g.prog); gl.uniform1f(g.U.uN, 1); gl.uniform1f(g.U.uNB, 1); gl.uniform1f(g.U.uC, 1); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          gl.useProgram(g.show); gl.uniform2f(g.S.uRes, 1, 1); gl.uniform1f(g.S.uRad, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          gl.bindVertexArray(null);
        });
      } catch (e) { g.failed = true; g.prog = g.show = null; console.warn('FibroScan map: shader failed.', e); }
      under.onReady?.();   // (the first map can be drawn now: the panel draws again, also while paused)
    });
    return g;
  }
  const under = (gl, W, H, g) => {
    drew = false;
    if (g !== gen || !G) { gen = g; G = build(gl); }
    if (!G.prog || !G.show || !args) return;
    // The small target's size: half the chart's device pixels a side, held to MAP_PX pixels in all.
    const k = Math.min(0.5, Math.sqrt(MAP_PX / Math.max(1, W * H)));
    const mw = Math.max(2, Math.round(W * k)), mh = Math.max(2, Math.round(H * k));
    if (G.mw !== mw || G.mh !== mh) {
      gl.bindTexture(gl.TEXTURE_2D, G.mapT);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, mw, mh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, G.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, G.mapT, 0);
      G.mw = mw; G.mh = mh;
    }
    gl.bindVertexArray(G.vao);
    // Pass 1: the map, over the small target.
    gl.bindFramebuffer(gl.FRAMEBUFFER, G.fbo);
    gl.viewport(0, 0, mw, mh);
    gl.disable(gl.BLEND);
    gl.useProgram(G.prog);
    for (let i = 0; i < G.tex.length; i++) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, G.tex[i]); gl.uniform1i(G.U[UNIS[i]], i); }
    gl.uniform2f(G.U.uRes, mw, mh); gl.uniform1f(G.U.uRad, 0);
    setMap(gl, G.U, F, args.NB, args.t0, args.N, args.c, args.t);
    const lo = args.lo || LIVER_LO, hi = args.hi || LIVER_HI;
    gl.uniform3f(G.U.uLo, lo[0], lo[1], lo[2]); gl.uniform3f(G.U.uHi, hi[0], hi[1], hi[2]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    for (let i = 0; i < G.tex.length; i++) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, null); }
    // Pass 2: stretched over the chart, its corners cut.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(G.show);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.mapT); gl.uniform1i(G.S.uMap, 0);
    gl.uniform2f(G.S.uRes, W, H); gl.uniform1f(G.S.uRad, args.rad || 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindTexture(gl.TEXTURE_2D, null);
    drew = true;
  };
  under.set = (a) => { args = a; };
  /** Whether the last frame drew the map. */
  under.drew = () => drew;
  return under;
}
