// The labels' pictures laid by a worker (label-gl.js `remote`): the atlas pages, and the one instanced draw per frame, on the labels'
// own canvas. The page draws each label's picture when its look changes and sends it with its place in the atlas; each frame it sends
// the boxes in painter order. The same shaders and blending as label-gl.js draws with on the page.
import { AVS, AFS } from './label-gl.js?v=d9c295feeb';
import { startProgram, checkProgram } from './gl-compile.js?v=5c4cd6c14c';
import { batchRuns } from './atlas-pack.js?v=43b8bc019d';

/** items: a Float32Array of 8 per label: page, x, y, w, h, atlas x, atlas y, opacity. */
export function createLabelRenderer(canvas, { pageSize = 2048 } = {}) {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
  if (!gl) return null;
  const prog = checkProgram(gl, startProgram(gl, AVS, AFS, [['aR', 0], ['aT', 1]]));
  const uView = gl.getUniformLocation(prog, 'uView'), uT = gl.getUniformLocation(prog, 'uT');
  const size = Math.min(pageSize, gl.getParameter(gl.MAX_TEXTURE_SIZE) || pageSize);
  const pages = [];
  const page = (n) => {
    if (pages[n]) return pages[n];
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return (pages[n] = t);
  };
  const vao = gl.createVertexArray(), buf = gl.createBuffer();
  gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  for (const [loc, off] of [[0, 0], [1, 16]]) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 32, off); gl.vertexAttribDivisor(loc, 1); }
  gl.bindVertexArray(null);
  return {
    get size() { return size; },
    resize(w, h) { canvas.width = w; canvas.height = h; },
    /** A label's picture, to the atlas page `n` at (x, y). */
    sprite(n, x, y, bitmap) {
      gl.bindTexture(gl.TEXTURE_2D, page(n));
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
      bitmap.close?.();
    },
    frame(items, W, H) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      const n = items.length / 8;
      if (!n) return;
      const list = Array.from({ length: n }, (_, i) => ({ page: items[i * 8] }));
      const inst = new Float32Array(n * 8);
      for (let i = 0; i < n; i++) { const o = i * 8; inst.set([items[o + 1], items[o + 2], items[o + 3], items[o + 4], items[o + 5], items[o + 6], items[o + 7], 0], o); }
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(prog); gl.bindVertexArray(vao);
      gl.uniform2f(uView, W, H); gl.uniform1i(uT, 0); gl.activeTexture(gl.TEXTURE0);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, inst, gl.DYNAMIC_DRAW);
      for (const run of batchRuns(list)) {
        gl.bindTexture(gl.TEXTURE_2D, page(run.page));
        gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, run.from * 32); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, run.from * 32 + 16);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, run.to - run.from);
      }
      gl.bindVertexArray(null);
    },
  };
}
