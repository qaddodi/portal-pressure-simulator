// The organs on the GPU as a stack (WebGL2, on the vessels' context: veins-gl.js): the organs' picture drawn layer by layer,
// back to front, into a texture the size of the canvas, which the composite then lays under the vessels in place of the
// one flattened organ picture (the plate).
//
// Each layer is a picture of some of the organs, rasterized from the same SVG copy the plate is (stage.js rasterPlate), as
// the plate is: one of the whole of it at the whole plate's scale (slot 0) and, once a pan or zoom has settled, a sharper
// one of the part in view (slot 1), each cropped to the layer's own box on the plate's pixel grid. Composited in the SVG's
// order with plain "over", each layer with its group's opacity baked in, they give the plate's picture (within a level of
// rounding a layer). The split is what lets an organ that changes shape (the liver, the spleen) be drawn on its own while
// the rest stay pictures: no organ below it or above it is drawn again when it changes.
//
// A layer set is made a slot at a time and swapped in whole (commit), so the picture never shows layers of two states.
//
// The organs that change (the liver with its ghost line, the spleen, the diaphragm, the falciform line) can instead be painted
// live from their own SVG at each render (organ-paint.js, setLive), at the screen's resolution, in their place in the order;
// and a layer whose mask changes with them (the gut's cut by the liver and the spleen, the stomach's see-through liver) is a
// picture of its organs without the mask, the mask painted live over it (its cut). A cut can gather other layers under its
// layer into the one group (`under`, each with its own shift): the bowel, which floats up on the ascites, is a picture of its
// own, moved on the GPU from where it was drawn (`at`) to where it is, under the rest of the gut, the gut's opacity and its mask
// laid over the two together, as the SVG lays its group: no picture is made again while the fluid eases.

const LAYER_VS = `#version 300 es
layout(location=0) in vec2 corner;
uniform vec4 rect;     // the layer's world rectangle (x, y, w, h)
uniform mat3 world;    // world → device pixels (y down)
uniform vec2 size;
out vec2 vW;
void main() {
  vW = rect.xy + corner * rect.zw;
  vec2 d = (world * vec3(vW, 1.0)).xy;
  gl_Position = vec4(d.x / size.x * 2.0 - 1.0, 1.0 - d.y / size.y * 2.0, 0.0, 1.0);
}`;
const LAYER_FS = `#version 300 es
precision highp float;
in vec2 vW;
uniform sampler2D t0, t1;   // the layer's whole picture and its sharper one of the view (premultiplied)
uniform vec4 r0, r1;
uniform int has1;
out vec4 o;
void main() {
  vec2 u1 = (vW - r1.xy) / r1.zw;
  if (has1 == 1 && all(greaterThanEqual(u1, vec2(0.0))) && all(lessThanEqual(u1, vec2(1.0)))) o = texture(t1, u1);
  else o = texture(t0, (vW - r0.xy) / r0.zw);
}`;

import { createShapeGL } from './shape-gl.js?v=c4003c5526';
import { createOrganPaint, mul } from './organ-paint.js?v=c8d9d9670a';

function program(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    gl.attachShader(p, sh); gl.deleteShader(sh);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let k = 0; k < n; k++) { const name = gl.getActiveUniform(p, k).name; u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}

/**
 * A rectangle `want` (world x, y, w, h) cut to `box` ([x0, y0, x1, y1]) and grown outward to whole pixels of `want`'s grid
 * at `scale` (so a layer's pixels sit on the plate's own: the same samples). Null when they miss.
 */
export function cropToGrid(want, box, scale) {
  const x0 = Math.max(want[0], box[0]), y0 = Math.max(want[1], box[1]);
  const x1 = Math.min(want[0] + want[2], box[2]), y1 = Math.min(want[1] + want[3], box[3]);
  if (!(x1 > x0 && y1 > y0)) return null;
  const gx0 = Math.floor((x0 - want[0]) * scale), gy0 = Math.floor((y0 - want[1]) * scale);
  const gx1 = Math.min(Math.round(want[2] * scale), Math.ceil((x1 - want[0]) * scale)), gy1 = Math.min(Math.round(want[3] * scale), Math.ceil((y1 - want[1]) * scale));
  if (gx1 <= gx0 || gy1 <= gy0) return null;
  return [want[0] + gx0 / scale, want[1] + gy0 / scale, (gx1 - gx0) / scale, (gy1 - gy0) / scale];
}

export function createOrganStack(gl) {
  let layerP;
  try { layerP = program(gl, LAYER_VS, LAYER_FS); } catch (e) { console.warn('Organ stack: shader failed; the organs stay one picture.', e); return null; }
  const quad = gl.createBuffer(), vao = gl.createVertexArray();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  // live[slot]: Map name → { tex, rect }, in the order the layers are drawn; staged[slot]: the set on its way in.
  const live = [new Map(), new Map()], staged = [new Map(), new Map()];
  let order = [];
  const stackTex = gl.createTexture(), fbo = gl.createFramebuffer();
  gl.bindTexture(gl.TEXTURE_2D, stackTex);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  let w = 0, h = 0, ver = 0, drawnKey = '';
  // The live organs (name → [{ spec (organ-paint readGroup), m (its frame → world) }]) and the layers' live masks (name → { spec, m }).
  let liveOrgans = new Map(), cuts = new Map(), painter = null;
  try { painter = createOrganPaint(gl, createShapeGL(gl)); } catch (e) { console.warn('Organ stack: the live painter failed; the organs stay pictures.', e); }
  const free = (map) => { for (const L of map.values()) gl.deleteTexture(L.tex); map.clear(); };
  const mat = new Float32Array(9);
  return {
    /**
     * A layer's raster for `slot` (0 whole, 1 view), its texture filled (veins-gl plateJob), over world rect: held until commit.
     * `at`: for a layer that can be moved (shift), where it was drawn.
     */
    stage(slot, name, tex, rect, at = 0) {
      const was = staged[slot].get(name);
      if (was) gl.deleteTexture(was.tex);
      staged[slot].set(name, { tex, rect, at });
    },
    /** Shows the staged set for `slot` in place of the one shown, drawn in the order of `names` (back to front). */
    commit(slot, names) {
      free(live[slot]);
      for (const n of names) { const L = staged[slot].get(n); if (L) { live[slot].set(n, L); staged[slot].delete(n); } }
      free(staged[slot]);
      if (slot === 0 && !liveOrgans.size) order = names.slice();
      ver++;
    },
    dropStaged(slot) { free(staged[slot]); },
    /** Whether organs can be painted live here. */
    get canLive() { return !!painter; },
    /**
     * The organs painted live, by layer name (each a list of { spec, m }), and the layers' live masks (name → { spec, m }), in
     * place of what was set before; null for none. Drawn at the next render.
     */
    setLive(organs, masks) { liveOrgans = organs || new Map(); cuts = masks || new Map(); ver++; },
    /** A layer gathered under a cut (its `under`) now at dy world units down (drawn at its `at`), as of the next render. */
    shift(name, dy) {
      for (const c of cuts.values()) for (const u of c.under || []) if (u.name === name && u.dy !== dy) { u.dy = dy; ver++; }
    },
    /** The names the stack lays, back to front (the layers' and the live organs'). */
    setOrder(names) { order = names.slice(); ver++; },
    drop(slot) { if (live[slot].size) { free(live[slot]); ver++; } free(staged[slot]); },
    has: (slot) => live[slot].size > 0,
    /** Whether a render at transform m and this size would draw something new (a pan, a zoom, a new set). */
    stale: (m, cw, ch) => drawnKey !== `${ver}|${m.join(',')}|${cw}x${ch}`,
    /** The stack drawn for transform m (world → device px) into its texture, the canvas's size; returns the texture. */
    render(m, cw, ch) {
      const key = `${ver}|${m.join(',')}|${cw}x${ch}`;
      if (key === drawnKey) return stackTex;
      drawnKey = key;
      if (w !== cw || h !== ch) {
        w = cw; h = ch;
        gl.bindTexture(gl.TEXTURE_2D, stackTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, stackTex, 0);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, w, h);
      gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
      mat.set([m[0], m[1], 0, m[2], m[3], 0, m[4], m[5], 1]);
      const drawLayer = (L0, L1, mm = mat) => {
        const U = layerP.u;
        gl.useProgram(layerP.p);
        gl.uniformMatrix3fv(U.world, false, mm);
        gl.uniform2f(U.size, w, h);
        gl.uniform1i(U.t0, 0); gl.uniform1i(U.t1, 1);
        gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.bindVertexArray(vao);
        gl.uniform4f(U.rect, ...L0.rect); gl.uniform4f(U.r0, ...L0.rect);
        gl.uniform4f(U.r1, ...(L1 ? L1.rect : [0, 0, 1, 1])); gl.uniform1i(U.has1, L1 ? 1 : 0);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, L0.tex);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, L1 ? L1.tex : L0.tex);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.disable(gl.BLEND);
      };
      const dev = (r) => { const xs = [r[0], r[0] + r[2]].map((x) => m[0] * x + m[4]), ys = [r[1], r[1] + r[3]].map((y) => m[3] * y + m[5]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
      for (const n of order) {
        const lv = painter && liveOrgans.get(n);
        if (lv) { for (const o of lv) painter.paintGroup(o.spec, mul(m, o.m), w, h, fbo); continue; }
        const L0 = live[0].get(n), L1 = live[1].get(n);
        if (!L0) continue;
        const cut = painter && cuts.get(n);
        if (cut) {
          // (The layers gathered under it, each moved by whole device pixels: on the view's picture's own pixel grid, as sharp as at rest.)
          const under = [], box = dev(L0.rect);
          for (const u of cut.under || []) {
            const U0 = live[0].get(u.name), U1 = live[1].get(u.name);
            if (!U0) continue;
            const dy = Math.round(((u.dy || 0) - U0.at) * m[3]), mm = mat.slice();
            mm[7] += dy;
            const b = dev(U0.rect);
            box[0] = Math.min(box[0], b[0]); box[1] = Math.min(box[1], b[1] + dy); box[2] = Math.max(box[2], b[2]); box[3] = Math.max(box[3], b[3] + dy);
            under.push([U0, U1 && U1.at === U0.at ? U1 : null, mm]);   // (the view's picture only if drawn where the whole one was)
          }
          painter.layMasked(() => { gl.viewport(0, 0, w, h); for (const [U0, U1, mm] of under) drawLayer(U0, U1, mm); drawLayer(L0, L1); }, box, cut.spec, mul(m, cut.m), w, h, fbo, cut.opacity ?? 1);
        }
        else { gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, w, h); drawLayer(L0, L1); }
      }
      painter?.endFrame();
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return stackTex;
    },
    get texture() { return stackTex; },
    /** Gives back the stack's canvas-sized texture while nothing is shown (the next render makes it again). */
    trim() {
      if (!w) return;
      w = h = 0; drawnKey = '';
      painter?.trim();
      gl.bindTexture(gl.TEXTURE_2D, stackTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    },
    dispose() {
      for (const s of [0, 1]) { free(live[s]); free(staged[s]); }
      painter?.dispose();
      gl.deleteTexture(stackTex); gl.deleteFramebuffer(fbo); gl.deleteBuffer(quad); gl.deleteVertexArray(vao); gl.deleteProgram(layerP.p);
    },
  };
}
