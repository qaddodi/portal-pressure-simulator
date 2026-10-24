// The lobule dive's field on the GPU: the picture paintField (lobule-zoom.js) lays down with the 2D canvas, one fragment per
// pixel in a single pass. On the 2D canvas each frame of the dive took four passes over the whole screen on the main thread
// (the liver-toned tile, the quieted tile over it, the fade into the page, the emerging mask); here the same picture is drawn
// by the GPU, with the tiles kept on it as textures (sent once, ahead of the dive), so a frame costs the page almost nothing.
//
// The tiles are drawn at sizes a factor of 2 apart, each with its own detail (simple lobules small, the sinusoids and fibres
// only on the large ones). The 2D canvas showed one size at a time and switched to the next as the zoom passed it; here the two
// nearest are blended by where the zoom is between them (fieldBlend, lobule-look.js), so the lobules gain their detail gradually
// as they grow, never in a step. Both are drawn at or above the size on screen, and mipmapped, so nothing is shown blurrier.
//
// Without WebGL2 (or on a software renderer, or once the context is lost) createFieldGL returns null / reports lost, and the
// field is drawn on the 2D canvas as before.

const VS = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

// Mirrors paintField's 2D passes. The tile's pattern puts one repeat (two lobules wide, two high: 6 R by 2√3 R) per
// 6 rd by 2√3 rd device px, with the landing lobule's centre at uO, the same for every size of tile.
const FS = `#version 300 es
precision highp float;
uniform sampler2D uA, uB, uQA, uQB;   // the liver-toned and the quieted tiles, at the two sizes blended
uniform float uMix;                    // how much of the larger size (0 … 1)
uniform float uQuiet;                  // the quieted tile laid over the liver-toned one (globalAlpha d.quiet)
uniform vec2 uO;                       // the landing lobule's centre (device px, from the top left)
uniform float uRd, uH;                 // its radius (device px); the canvas's height
uniform vec4 uFade;                    // r0, r1, q (the fade into the page's strength), on (1 / 0)
uniform float uMid;                    // FADE_MID: the fade's middle stop
uniform vec3 uBg;                      // the page's colour
uniform vec4 uMask;                    // ox, oy, rho (the emerging mask), on (1 / 0)
out vec4 o;
void main() {
  vec2 p = vec2(gl_FragCoord.x, uH - gl_FragCoord.y);
  vec2 uv = (p - uO) / (uRd * vec2(6.0, 3.4641016151377544));
  vec3 c = mix(texture(uA, uv).rgb, texture(uB, uv).rgb, uMix);
  if (uQuiet > 0.0) c = mix(c, mix(texture(uQA, uv).rgb, texture(uQB, uv).rgb, uMix), uQuiet);
  // The fade into the page: a radial gradient from r0 (clear) through FADE_MID · q halfway to q at r1 and beyond.
  if (uFade.w > 0.0) {
    float s = clamp((length(p - uO) - uFade.x) / max(uFade.y - uFade.x, 1e-6), 0.0, 1.0);
    float a = s < 0.5 ? uMid * uFade.z * (s * 2.0) : mix(uMid * uFade.z, uFade.z, s * 2.0 - 1.0);
    c = mix(c, uBg, a);
  }
  // Emerging: whole inside rho · 0.35, gone at rho.
  float m = 1.0;
  if (uMask.w > 0.0) m = 1.0 - clamp((length(p - uMask.xy) - uMask.z * 0.35) / max(uMask.z * 0.65, 1e-6), 0.0, 1.0);
  o = vec4(c * m, m);
}`;

export function createFieldGL(canvas) {
  let gl = null;
  try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, failIfMajorPerformanceCaveat: true }); } catch { gl = null; }
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(prog, 0, 'p'); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (err) { console.warn('The lobule field falls back to the 2D canvas.', err); gl.getExtension('WEBGL_lose_context')?.loseContext(); return null; }
  const U = Object.fromEntries(['uA', 'uB', 'uQA', 'uQB', 'uMix', 'uQuiet', 'uO', 'uRd', 'uH', 'uFade', 'uMid', 'uBg', 'uMask'].map((n) => [n, gl.getUniformLocation(prog, n)]));
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // one triangle over the whole canvas
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.useProgram(prog);
  gl.uniform1i(U.uA, 0); gl.uniform1i(U.uB, 1); gl.uniform1i(U.uQA, 2); gl.uniform1i(U.uQB, 3);
  gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);

  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => { lost = true; texs.clear(); e.preventDefault?.(); });
  // A tile's texture, made once per tile canvas (a new canvas for each tissue state and tone) and kept until that canvas is
  // given back (width 0: forget, sweep).
  const texs = new Map();
  function texFor(cv) {
    let t = texs.get(cv);
    if (t && t.w === cv.width && t.h === cv.height) return t.tex;
    if (t) gl.deleteTexture(t.tex);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    texs.set(cv, { tex, w: cv.width, h: cv.height });
    return tex;
  }
  return {
    get lost() { return lost || gl.isContextLost(); },
    /** Sends a tile to the GPU now (ahead of the dive), so no frame of it waits for one. */
    upload(cv) { if (!this.lost && cv?.width) texFor(cv); },
    /** Gives back the textures of tiles whose canvases were given back (or are no longer wanted: keep(cv) false). */
    sweep(keep = () => true) {
      for (const [cv, t] of texs) if (!cv.width || !keep(cv)) { if (!lost) gl.deleteTexture(t.tex); texs.delete(cv); }
    },
    /** One frame of the field. W, H: the canvas's size (device px); a, b, qa, qb: the tiles' canvases (liver-toned and
     *  quieted, at the smaller and larger size); the rest as paintField's (see FS). */
    draw({ W, H, a, b, qa, qb, mix, quiet, ox, oy, rd, fade, mid, bg, mask }) {
      if (this.lost) return false;
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      gl.viewport(0, 0, W, H);
      gl.useProgram(prog);
      const bind = (unit, cv) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texFor(cv)); };
      bind(0, a); bind(1, b || a);
      if (quiet > 0) { bind(2, qa); bind(3, qb || qa); }
      gl.uniform1f(U.uMix, b ? mix : 0); gl.uniform1f(U.uQuiet, quiet);
      gl.uniform2f(U.uO, ox, oy); gl.uniform1f(U.uRd, rd); gl.uniform1f(U.uH, H);
      gl.uniform4f(U.uFade, fade ? fade[0] : 0, fade ? fade[1] : 0, fade ? fade[2] : 0, fade ? 1 : 0); gl.uniform1f(U.uMid, mid);
      gl.uniform3f(U.uBg, bg[0], bg[1], bg[2]);
      gl.uniform4f(U.uMask, mask ? mask[0] : 0, mask ? mask[1] : 0, mask ? mask[2] : 0, mask ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return true;
    },
  };
}
