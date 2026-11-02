// The streak noise's lattice table (blood-noise.js) filled on the GPU (2 Nov 2026, Mohammad: "Move. Everything. To. GPU.").
// The table was filled in script, a vessel row's block at a time (noiseBlock: about 4,000 corners hashed a row, then a 67 KB upload),
// the first time each row's flow drew streaks, and every streaming row again whenever the table grew: a frame of up to 70 ms, headless,
// in the first seconds after a load, when the blood starts to stream (start-up profile, 2 Nov 2026). Here one draw of a whole-table
// triangle writes every block at once: each texel's four corners hashed in the fragment shader, bit for bit as noiseBlock hashes them
// (the same 32-bit hash, the same 24-bit unit value, exact in a 32-bit float), so the composite reads the same table.
// Needs a float colour target (EXT_color_buffer_float); without one, or while its program is still compiling, the caller fills the
// table in script as before. The program is started when the filler is made and taken up only once the driver says it is done
// (KHR_parallel_shader_compile), so no frame waits on its compile.
import { startProgram, compileDone, checkProgram } from './gl-compile.js?v=79231d7c6b';
import { glGet, glOn, fbComplete } from './gl-state.js?v=4163c507aa';
import { NOISE_W, NOISE_H, NOISE_PER_ROW, OCTAVES } from './blood-noise.js?v=bc65994b25';

export const NOISE_VS = `#version 300 es
void main() { gl_Position = vec4(float((gl_VertexID & 1) << 2) - 1.0, float((gl_VertexID & 2) << 1) - 1.0, 0.0, 1.0); }`;

const [C, F] = OCTAVES;
export const NOISE_FS = `#version 300 es
precision highp float;
precision highp int;
out vec4 o;
uint hsh(uint x) { x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u; return x; }
float h01(uint x) { return float(hsh(x) & 0xffffffu) / 16777216.0; }
float corner(uint s, uint x, uint y) { return h01(s ^ (x * 73856093u) ^ (y * 19349663u)); }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int bx = p.x / ${NOISE_W}, by = p.y / ${NOISE_H}, lx = p.x - bx * ${NOISE_W}, cy = p.y - by * ${NOISE_H};
  uint id = uint(by * ${NOISE_PER_ROW} + bx);
  bool fine = lx >= ${F.x};
  int P = fine ? ${F.period} : ${C.period}, rows = fine ? ${F.rows} : ${C.rows}, yo = fine ? ${F.yo} : ${C.yo};
  if (cy >= rows) { o = vec4(0.0); return; }
  uint s = fine ? id * ${F.mul}u + ${F.add}u : id * ${C.mul}u + ${C.add}u;
  int x0 = lx - (fine ? ${F.x} : ${C.x}), x1 = (x0 + 1) % P;
  uint y0 = uint(cy - yo + 4096);
  o = vec4(corner(s, uint(x0), y0), corner(s, uint(x1), y0), corner(s, uint(x0), y0 + 1u), corner(s, uint(x1), y0 + 1u));
}`;

// The states a fill turns off, and which of them were on (written in place by each fill, which never runs inside another). The
// numbers are the WebGL constants gl.SCISSOR_TEST, BLEND, DEPTH_TEST, STENCIL_TEST, CULL_FACE, RASTERIZER_DISCARD and SAMPLE_ALPHA_TO_COVERAGE.
const caps = [0x0C11, 0x0BE2, 0x0B71, 0x0B90, 0x0B44, 0x8C89, 0x809E];
const capOn = [false, false, false, false, false, false, false];

/**
 * A filler for gl's noise tables, or null where the context cannot render to a float texture.
 *   fill(tex, w, h): writes the whole table (an RGBA32F texture w × h) and returns true; false when it cannot yet (the program still
 *     compiling) or at all (it failed, or the target is not complete): the caller fills it in script.
 *   dispose(): frees what it made.
 */
export function createNoiseFiller(gl) {
  if (!gl || gl.isContextLost?.() || !gl.getExtension('EXT_color_buffer_float')) return null;
  let h = null, prog = null, fbo = null, vao = null, broken = false;
  try { h = startProgram(gl, NOISE_VS, NOISE_FS); } catch { return null; }
  const take = () => {
    if (prog || broken) return !!prog;
    if (!compileDone(gl, h)) return false;
    try { prog = checkProgram(gl, h); } catch (e) { console.warn('Noise table: the GPU fill could not be made; filled in script.', e); broken = true; gl.deleteProgram(h.p); }
    for (const s of h.sh) gl.deleteShader(s);
    if (prog) { fbo = gl.createFramebuffer(); vao = gl.createVertexArray(); }
    return !!prog;
  };
  return {
    fill(tex, w, hgt) {
      if (broken || gl.isContextLost() || !take()) return false;
      const fbR = glGet(gl, gl.READ_FRAMEBUFFER_BINDING), fbD = glGet(gl, gl.DRAW_FRAMEBUFFER_BINDING), vp = glGet(gl, gl.VIEWPORT);
      const was = glGet(gl, gl.CURRENT_PROGRAM), wasVao = glGet(gl, gl.VERTEX_ARRAY_BINDING), mask = glGet(gl, gl.COLOR_WRITEMASK);
      for (let i = 0; i < caps.length; i++) capOn[i] = glOn(gl, caps[i]);
      try {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        if (!fbComplete(gl, gl.FRAMEBUFFER, 'rgba32f', w, hgt)) { broken = true; return false; }
        for (let i = 0; i < caps.length; i++) if (capOn[i]) gl.disable(caps[i]);
        gl.colorMask(true, true, true, true);
        gl.viewport(0, 0, w, hgt);
        gl.useProgram(prog);
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        return true;
      } finally {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0);
        if ((fbR ?? null) === (fbD ?? null)) gl.bindFramebuffer(gl.FRAMEBUFFER, fbD ?? null);
        else { gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbR ?? null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fbD ?? null); }
        if (vp?.length === 4) gl.viewport(vp[0], vp[1], vp[2], vp[3]);
        gl.useProgram(was ?? null);
        gl.bindVertexArray(wasVao ?? null);
        if (mask?.length === 4) gl.colorMask(mask[0], mask[1], mask[2], mask[3]);
        for (let i = 0; i < caps.length; i++) if (capOn[i]) gl.enable(caps[i]);
      }
    },
    dispose() {
      if (prog) gl.deleteProgram(prog); else if (h && !broken) { gl.deleteProgram(h.p); for (const s of h.sh) gl.deleteShader(s); }
      if (fbo) gl.deleteFramebuffer(fbo);
      if (vao) gl.deleteVertexArray(vao);
      prog = fbo = vao = null; broken = true;
    },
  };
}
