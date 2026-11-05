// Blood look D (5 Nov 2026, blood-render-recs parts 4 and 5, recs 21 and 23): the streaks read from one baked tile, twice a pixel.
//
// Today's streaks (veins-gl.js shimN) hash a value-noise lattice per pixel: two lane speeds × two octaves × two zoom scales, four to
// eight RGBA32F reads and about sixty ALU ops, and the lanes step across the vessel. Look D bakes the same two octaves once into a small
// mipmapped RG8 tile and reads it twice a pixel, half a cycle apart, crossfading the two reads with triangle weights (the flow-map
// trick: the pattern slides with the flow for half a cycle at a time, and each read is hidden at the instant it resets). The speed
// across the vessel is the smooth Poiseuille profile, not eight lanes; mips do the fade of the fine octave and the zoom.
//
// The tile: TILE_W × (TILE_L · TILE_H) texels, TILE_L layers stacked, a vessel's row picks the layer by its row (id & 7) and a start
// along the tile by its golden-ratio fraction, so neighbours never show one pattern. A layer's R is the coarse octave (50 cells along,
// the lattice rows −8 … 8 across), its G the fine one (100 cells along, twice as fast across). U repeats; V is clamped inside a layer's
// padding. Baked on the GPU in one draw when the first frame asks for it, and read as the composite's noise unit (the lattice table is
// not read in a look-D frame, so no sampler is added: the composite already uses every unit).
import { startProgram, compileDone, checkProgram } from './gl-compile.js';
import { glGet, glOn, fbComplete } from './gl-state.js';

/** The blood styles (a view's choice, stage-blood.js bloodLook → `blood.style`): today's streaks, look D, look E (sines, no reads). */
export const STYLE_LEGACY = 0, STYLE_D = 1, STYLE_E = 2;
export const TILE_W = 512, TILE_H = 128, TILE_L = 8, TILE_PAD = 8, TILE_ROW = 7;   // (TILE_H = 2 · TILE_PAD + 16 lattice rows · TILE_ROW)
/** The distance a flow-map cycle lasts, world units of stream distance D (it divides blood.js PERIOD, so D's wrap is seamless). */
export const D_CYCLE = 64;

const TILE_VS = `#version 300 es
void main() { gl_Position = vec4(float((gl_VertexID & 1) << 2) - 1.0, float((gl_VertexID & 2) << 1) - 1.0, 0.0, 1.0); }`;
const TILE_FS = `#version 300 es
precision highp float;
precision highp int;
out vec4 o;
uint hsh(uint x) { x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u; return x; }
float h01(uint x) { return float(hsh(x) & 0xffffffu) / 16777216.0; }
float vn(vec2 q, uint seed, int period) {
  vec2 i = floor(q), f = fract(q);
  f = f * f * (3.0 - 2.0 * f);
  int x0 = int(i.x) % period; if (x0 < 0) x0 += period;
  int x1 = (x0 + 1) % period;
  uint y0 = uint(int(i.y) + 4096), y1 = y0 + 1u;
  float a = h01(seed ^ (uint(x0) * 73856093u) ^ (y0 * 19349663u)), b = h01(seed ^ (uint(x1) * 73856093u) ^ (y0 * 19349663u));
  float c = h01(seed ^ (uint(x0) * 73856093u) ^ (y1 * 19349663u)), d = h01(seed ^ (uint(x1) * 73856093u) ^ (y1 * 19349663u));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int layer = p.y / ${TILE_H}, ly = p.y - layer * ${TILE_H};
  float u = (float(p.x) + 0.5) / ${TILE_W}.0;
  float q = clamp((float(ly) + 0.5 - ${TILE_PAD}.0) / ${TILE_ROW}.0 - 8.0, -8.0, 8.0);
  uint L = uint(layer);
  float c = vn(vec2(u * 50.0, q), L * 31u, 50);
  float f = vn(vec2(u * 100.0, q * 1.7 + 7.3), L * 57u + 11u, 100);
  o = vec4(c, f, 0.0, 1.0);
}`;

/**
 * The composite's side of look D: the tile read (the noise unit), and dNoise, the streaks' noise at one stream position. Needs, from
 * the composite: noiseT (the tile, in look D), pxW, and lnWb, lnWf, lnS (the octaves' shares, set per vessel by bloodAt).
 *   s: arc length along the stream's pattern; qy: the lane coordinate across (lattice rows); D: the stream distance now (it carries
 *   the heartbeat: the shader runs it on at the display speed); ay: |y| across the lumen (0 … 1); cellA: world units a cell spans;
 *   drift: the stagnant blood's drift, in cells; dxu, dyv: the tile's coordinates per device pixel, along and across.
 */
export const D_GLSL = `
const float D_CYCLE = ${D_CYCLE}.0;
vec2 tileAt(int lay, float u, float qy, vec2 gx, vec2 gy) {
  float v = (float(lay * ${TILE_H}) + ${TILE_PAD}.0 + (clamp(qy, -8.0, 8.0) + 8.0) * ${TILE_ROW}.0) / ${TILE_H * TILE_L}.0;
  return textureGrad(noiseT, vec2(u, v), gx, gy).rg;
}
float dNoise(int id, float s, float qy, float D, float ay, float cellA, float drift, float dxu, float dyv) {
  // The smooth speed across the vessel (the laminar profile, fastest on the axis; the walls keep a quarter of the axis speed).
  float g = max(2.0, 16.0 * (1.0 - 0.64 * ay * ay)) * 0.125;
  float f0 = fract(D / D_CYCLE), f1 = fract(f0 + 0.5);
  float w0 = 1.0 - abs(1.0 - 2.0 * f0), w1 = 1.0 - abs(1.0 - 2.0 * f1);   // (w0 + w1 = 1: each read is hidden as it resets)
  float uo = fract(float(id) * 0.6180339);
  int lay = id & ${TILE_L - 1};
  vec2 gx = vec2(dxu, 0.0), gy = vec2(0.0, dyv);
  vec2 a = tileAt(lay, ((s - g * f0 * D_CYCLE) / cellA + drift) / 50.0 + uo, qy, gx, gy);
  vec2 b = tileAt(lay, ((s - g * f1 * D_CYCLE) / cellA + drift) / 50.0 + uo, qy, gx, gy);
  float na = lnWb * a.x + lnWf * a.y, nb = lnWb * b.x + lnWf * b.y;
  float nm = (w0 * (na - 0.5) + w1 * (nb - 0.5)) * inversesqrt(w0 * w0 + w1 * w1) + 0.5;   // (even contrast through the crossfade)
  return lnS == 1.0 ? nm : 0.5 + (nm - 0.5) * lnS;
}`;
/** Texel rows the tile moves a lattice row: the tile's V per lattice row (for the pixel gradients). */
export const TILE_V_PER_ROW = TILE_ROW / (TILE_H * TILE_L);

const caps = [0x0C11, 0x0BE2, 0x0B71, 0x0B90, 0x0B44, 0x8C89, 0x809E];
const capOn = [false, false, false, false, false, false, false];

/**
 * The tile's baker for gl, or null where the context cannot make one. tex(): the baked tile, or null while it is not ready (the
 * caller draws the lattice look meanwhile). bake(): starts or finishes the bake without waiting (the program is taken up only once
 * the driver says it compiled); true once the tile is there. dispose(): frees what it made.
 */
export function createBloodTile(gl) {
  if (!gl || gl.isContextLost?.()) return null;
  let h = null, prog = null, fbo = null, vao = null, tex = null, broken = false, baked = false;
  try { h = startProgram(gl, TILE_VS, TILE_FS); } catch { return null; }
  const take = () => {   // alloc-rare: built once when the first look-D frame asks and kept
    if (prog || broken) return !!prog;
    if (!compileDone(gl, h)) return false;
    try { prog = checkProgram(gl, h); } catch (e) { console.warn('Blood tile: the GPU bake could not be made; the streaks keep the lattice look.', e); broken = true; gl.deleteProgram(h.p); }
    for (const s of h.sh) gl.deleteShader(s);
    if (prog) { fbo = gl.createFramebuffer(); vao = gl.createVertexArray(); }
    return !!prog;
  };
  return {   // alloc-rare: built once when the renderer is made
    tex: () => (baked ? tex : null),
    bake() {
      if (baked) return true;
      if (broken || gl.isContextLost() || !take()) return false;
      const fbR = glGet(gl, gl.READ_FRAMEBUFFER_BINDING), fbD = glGet(gl, gl.DRAW_FRAMEBUFFER_BINDING), vp = glGet(gl, gl.VIEWPORT);
      const was = glGet(gl, gl.CURRENT_PROGRAM), wasVao = glGet(gl, gl.VERTEX_ARRAY_BINDING), mask = glGet(gl, gl.COLOR_WRITEMASK);
      const wasUnit = glGet(gl, gl.ACTIVE_TEXTURE), wasTex = glGet(gl, gl.TEXTURE_BINDING_2D);
      for (let i = 0; i < caps.length; i++) capOn[i] = glOn(gl, caps[i]);
      const W = TILE_W, H = TILE_H * TILE_L;
      try {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, W, H, 0, gl.RG, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        if (!fbComplete(gl, gl.FRAMEBUFFER, 'rg8', W, H)) { broken = true; gl.deleteTexture(t); return false; }
        for (let i = 0; i < caps.length; i++) if (capOn[i]) gl.disable(caps[i]);
        gl.colorMask(true, true, true, true);
        gl.viewport(0, 0, W, H);
        gl.useProgram(prog);
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.generateMipmap(gl.TEXTURE_2D);
        tex = t; baked = true;
        return true;
      } finally {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0);
        if ((fbR ?? null) === (fbD ?? null)) gl.bindFramebuffer(gl.FRAMEBUFFER, fbD ?? null);
        else { gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbR ?? null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fbD ?? null); }
        if (vp?.length === 4) gl.viewport(vp[0], vp[1], vp[2], vp[3]);
        gl.useProgram(was && gl.isProgram(was) ? was : null);
        gl.bindVertexArray(wasVao ?? null);
        if (mask?.length === 4) gl.colorMask(mask[0], mask[1], mask[2], mask[3]);
        for (let i = 0; i < caps.length; i++) if (capOn[i]) gl.enable(caps[i]);
        if (wasUnit != null) gl.activeTexture(wasUnit);
        gl.bindTexture(gl.TEXTURE_2D, wasTex ?? null);
      }
    },
    dispose() {
      if (prog) gl.deleteProgram(prog); else if (h && !broken) { gl.deleteProgram(h.p); for (const s of h.sh) gl.deleteShader(s); }
      if (fbo) gl.deleteFramebuffer(fbo);
      if (vao) gl.deleteVertexArray(vao);
      if (tex) gl.deleteTexture(tex);
      prog = fbo = vao = tex = null; broken = true; baked = false;
    },
  };
}
