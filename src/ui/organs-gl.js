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
//
// A layer's picture is painted on the GPU from its organs' own shapes where the painter can read them (bake): into a texture of its
// own, which stays on the GPU, so a pan or zoom only moves it and a change paints it again, a few organs a frame, with no image,
// canvas, read back or upload on the way. Only a layer it cannot read is still rasterized from the SVG copy (stage.js rasterPlate).

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
uniform ivec2 flip;         // a picture painted on the GPU (bake) has its first row at the bottom
out vec4 o;
void main() {
  vec2 u1 = (vW - r1.xy) / r1.zw;
  if (has1 == 1 && all(greaterThanEqual(u1, vec2(0.0))) && all(lessThanEqual(u1, vec2(1.0)))) o = texture(t1, flip.y == 1 ? vec2(u1.x, 1.0 - u1.y) : u1);
  else { vec2 u0 = (vW - r0.xy) / r0.zw; o = texture(t0, flip.x == 1 ? vec2(u0.x, 1.0 - u0.y) : u0); }
}`;

import { createShapeGL } from './shape-gl.js?v=a5ba46162b';
import { createOrganPaint, mul } from './organ-paint.js?v=63466e2844';
import { netChanged } from './idle-keys.js?v=235443a2a3';

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

// `shared`: another stack's painter to paint with (the figure's overlays share the organs': organ-paint keeps its targets grown to the
// largest size asked, so the two never make them again), which this one then neither makes nor gives back.
export function createOrganStack(gl, { painter: shared = null } = {}) {
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
  // The live groups and cuts as last drawn (name → [{ sig, ops: [[sig, box]] }], organ-paint describe) and the view they were drawn
  // in: a render with the same view draws again only the boxes of the ops that changed (a liver ease moves the liver's own box, not
  // the whole screen). `liveVer` moves with setLive; `ver` with anything that needs the whole stack drawn again.
  let liveVer = 0, drawnAt = '', drawnDesc = new Map();
  // The live organs (name → [{ spec (organ-paint readGroup), m (its frame → world) }]) and the layers' live masks (name → { spec, m }).
  let liveOrgans = new Map(), cuts = new Map(), painter = null;
  if (shared) painter = shared;
  else try { painter = createOrganPaint(gl, createShapeGL(gl)); } catch (e) { console.warn('Organ stack: the live painter failed; the organs stay pictures.', e); }
  // What the painter reads from the page at each paint (organ-paint liveOf, describe) is the live groups' elements' own attributes
  // and inline styles (an outline's d, a transform, an opacity), and each entry's own frame (its `el`, the m getter's element). A
  // watch on exactly those elements moves `pageVer` on any write that leaves one different, so a render with nothing written since
  // the last returns at once, without describing every op as strings on every blood frame (review item 3). The records are taken
  // synchronously at each check (takeRecords), so a write made in the same task as the composite is seen by that composite.
  // (No MutationObserver: every render describes, as before.)
  let pageVer = 0;
  const watch = typeof MutationObserver === 'function' ? new MutationObserver((rs) => { if (netChanged(rs)) pageVer++; }) : null;
  const pull = () => { if (!watch) return; const rs = watch.takeRecords(); if (rs.length && netChanged(rs)) pageVer++; };
  const elsOf = (spec, out) => {
    if (!spec) return;
    out.add(spec.root);
    for (const op of spec.ops) {
      out.add(op.el); out.add(op.geom?.el);
      for (const e of op.chain || []) out.add(e);
      if (op.clip) { out.add(op.clip.geom?.el); for (const e of op.clip.chain || []) out.add(e); }
    }
    elsOf(spec.mask, out);
  };
  function watchLive() {
    if (!watch) return;
    pull(); watch.disconnect();
    const els = new Set();
    for (const list of liveOrgans.values()) for (const o of list) { elsOf(o.spec, els); els.add(o.el); }
    for (const c of cuts.values()) { elsOf(c.spec, els); els.add(c.el); }
    for (const el of els) if (el?.nodeType === 1) watch.observe(el, { attributes: true, attributeOldValue: true });
    pageVer++;
  }
  const liveNow = () => !!(painter && (liveOrgans.size || cuts.size));
  const keyOf = (m, cw, ch) => { pull(); return `${ver}|${liveVer}|${watch ? pageVer : ''}|${m.join(',')}|${cw}x${ch}`; };
  const free = (map) => { for (const L of map.values()) gl.deleteTexture(L.tex); map.clear(); };
  const mat = new Float32Array(9);
  return {
    /**
     * A layer's raster for `slot` (0 whole, 1 view), its texture filled (veins-gl plateJob), over world rect: held until commit.
     * `at`: for a layer that can be moved (shift), where it was drawn.
     */
    stage(slot, name, tex, rect, at = 0, flip = false) {
      const was = staged[slot].get(name);
      if (was) gl.deleteTexture(was.tex);
      staged[slot].set(name, { tex, rect, at, flip });
    },
    /**
     * A layer's picture painted on the GPU from its organs' own shapes (organ-paint readGroup, nest), with no image, canvas or
     * upload on the way: `groups` (each { spec, m: its frame → world }, back to front) over world rect at `scale` px per unit,
     * into a texture of its own that stays on the GPU. Returns a job: step(until) paints on until that time (performance.now)
     * and returns true once the picture is whole, the texture then staged for `slot` as a raster's would be (commit shows it);
     * drop() gives it up. `at`: as stage's.
     */
    bake(slot, name, groups, rect, scale, at = 0) {
      if (!painter) return null;
      const W = Math.max(1, Math.round(rect[2] * scale)), H = Math.max(1, Math.round(rect[3] * scale));
      const tex = gl.createTexture(), fb = gl.createFramebuffer();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.viewport(0, 0, W, H);
      gl.disable(gl.SCISSOR_TEST);
      gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
      // (World → the picture's pixels, y down; on the GPU its first row lands at the bottom, which the layer's draw turns back: flip.)
      const T = [W / rect[2], 0, 0, H / rect[3], -rect[0] * W / rect[2], -rect[1] * H / rect[3]];
      const pic = painter.beginPicture();
      // (gi: the group being painted, its job `cur`; a group's job paints a few ops a step, however deep its groups nest.)
      let gi = 0, cur = null, done = false, live = true;
      const free = () => { cur?.drop(); cur = null; if (fb) gl.deleteFramebuffer(fb); };
      return {
        step(until = Infinity) {
          if (!live || done) return done;
          while (gi < groups.length) {
            const g = groups[gi];
            cur ||= painter.bakeJob(g.spec, mul(T, g.m), W, H, fb, pic);
            const r = cur.step(until);
            if (r === 'lost') {
              // (The painter's layers were made again meanwhile, a half-painted group with them: the picture starts over.)
              cur = null; gi = 0;
              gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, W, H); gl.disable(gl.SCISSOR_TEST);
              gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
              break;
            }
            if (r !== 'done') break;
            cur = null; gi++;
            if (performance.now() > until) break;
          }
          gl.bindVertexArray(null); gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST); gl.activeTexture(gl.TEXTURE0);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
          if (gi < groups.length) return false;
          done = true; live = false; free();
          const was = staged[slot].get(name);
          if (was) gl.deleteTexture(was.tex);
          staged[slot].set(name, { tex, rect, at, flip: true });
          return true;
        },
        drop() { if (!live) return; live = false; free(); gl.deleteTexture(tex); },
      };
    },
    /** Lets go of the shapes the pictures keep on the GPU (bake), when no picture is being made. */
    dropKept() { painter?.dropKept(); },
    /** What the painter holds on the GPU (organ-paint stats), or null without one. */
    stats: () => painter?.stats() || null,
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
    setLive(organs, masks) { liveOrgans = organs || new Map(); cuts = masks || new Map(); liveVer++; watchLive(); },
    /** A layer gathered under a cut (its `under`) now at dy world units down (drawn at its `at`), as of the next render. */
    shift(name, dy) {
      for (const c of cuts.values()) for (const u of c.under || []) if (u.name === name && u.dy !== dy) { u.dy = dy; liveVer++; }
    },
    /** The names the stack lays, back to front (the layers' and the live organs'). */
    setOrder(names) { order = names.slice(); ver++; },
    drop(slot) { if (live[slot].size) { free(live[slot]); ver++; } free(staged[slot]); },
    has: (slot) => live[slot].size > 0,
    /** Whether a render at transform m and this size would draw something new (a pan, a zoom, a new set, a live group written). */
    // (Without the page watch, a render is always asked while groups are live: what they draw is read from the page there, and
    // nothing is drawn when it is as it was.)
    stale: (m, cw, ch) => drawnKey !== keyOf(m, cw, ch) || (!watch && liveNow()),
    /**
     * The stack drawn for transform m (world → device px) into its texture, the canvas's size. Returns what changed in it: true for
     * the whole (the view or the layers changed), a device box [x0, y0, x1, y1] when only live groups changed (their boxes, old and new),
     * or null when nothing on it changed.
     */
    render(m, cw, ch) {
      const key = keyOf(m, cw, ch);
      if (key === drawnKey && (watch || !liveNow())) return null;
      drawnKey = key;
      const at = `${ver}|${m.join(',')}|${cw}x${ch}`, same = at === drawnAt && !!painter;
      drawnAt = at;
      // Every live group and cut described as it is now (its ops' strings and boxes); against the last drawing, the box that changed.
      let dirty = null, whole = !same;
      const desc = new Map();
      if (painter) {
        for (const n of order) {
          const lv = liveOrgans.get(n), cut = cuts.get(n);
          if (lv) desc.set(n, lv.map((o) => painter.describe(o.spec, mul(m, o.m))));
          else if (cut && live[0].get(n)) {
            const d = painter.describe(cut.spec, mul(m, cut.m));
            d.sig += `|${cut.opacity ?? 1}|${(cut.under || []).map((u) => `${u.name}:${u.dy || 0}`).join()}`;
            desc.set(n, [d]);
          }
        }
        if (!whole) {
          const add = (b) => { if (b) dirty = dirty ? [Math.min(dirty[0], b[0]), Math.min(dirty[1], b[1]), Math.max(dirty[2], b[2]), Math.max(dirty[3], b[3])] : b.slice(); };
          const all = (list) => { for (const d of list || []) for (const [, b] of d.ops) add(b); };
          for (const n of new Set([...desc.keys(), ...drawnDesc.keys()])) {
            const a = drawnDesc.get(n), b = desc.get(n);
            if (!a || !b || a.length !== b.length) { all(a); all(b); continue; }
            for (let i = 0; i < a.length; i++) {
              if (a[i].sig !== b[i].sig || a[i].ops.length !== b[i].ops.length) { all([a[i]]); all([b[i]]); continue; }
              for (let k = 0; k < a[i].ops.length; k++) if (a[i].ops[k][0] !== b[i].ops[k][0]) { add(a[i].ops[k][1]); add(b[i].ops[k][1]); }
            }
          }
          // (A cut's box is its layer's: a change in it is drawn over that box, cut to the ops that changed.)
          if (dirty) dirty = [Math.max(0, Math.floor(dirty[0])), Math.max(0, Math.floor(dirty[1])), Math.min(cw, Math.ceil(dirty[2])), Math.min(ch, Math.ceil(dirty[3]))];
          if (dirty && !(dirty[2] > dirty[0] && dirty[3] > dirty[1])) dirty = null;
        }
      }
      drawnDesc = desc;
      if (!whole && !dirty) { painter?.endFrame(); return null; }
      const within = whole ? null : dirty;
      const clip = () => { if (within) { gl.enable(gl.SCISSOR_TEST); gl.scissor(within[0], ch - within[3], within[2] - within[0], within[3] - within[1]); } else gl.disable(gl.SCISSOR_TEST); };
      if (w !== cw || h !== ch) {
        w = cw; h = ch;
        gl.bindTexture(gl.TEXTURE_2D, stackTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, stackTex, 0);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, w, h);
      clip();
      gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
      gl.disable(gl.SCISSOR_TEST);
      mat.set([m[0], m[1], 0, m[2], m[3], 0, m[4], m[5], 1]);
      // (A layer's quad within the box being drawn: `b` for one laid under a cut, else the stack's.)
      const drawLayer = (L0, L1, mm = mat, b = within) => {
        const U = layerP.u;
        if (b) { gl.enable(gl.SCISSOR_TEST); gl.scissor(b[0], h - b[3], b[2] - b[0], b[3] - b[1]); } else gl.disable(gl.SCISSOR_TEST);
        gl.useProgram(layerP.p);
        gl.uniformMatrix3fv(U.world, false, mm);
        gl.uniform2f(U.size, w, h);
        gl.uniform1i(U.t0, 0); gl.uniform1i(U.t1, 1);
        gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.bindVertexArray(vao);
        gl.uniform4f(U.rect, ...L0.rect); gl.uniform4f(U.r0, ...L0.rect);
        gl.uniform4f(U.r1, ...(L1 ? L1.rect : [0, 0, 1, 1])); gl.uniform1i(U.has1, L1 ? 1 : 0);
        gl.uniform2i(U.flip, L0.flip ? 1 : 0, L1?.flip ? 1 : 0);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, L0.tex);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, L1 ? L1.tex : L0.tex);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
      };
      const dev = (r) => { const xs = [r[0], r[0] + r[2]].map((x) => m[0] * x + m[4]), ys = [r[1], r[1] + r[3]].map((y) => m[3] * y + m[5]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
      for (const n of order) {
        const lv = painter && liveOrgans.get(n);
        if (lv) { for (const o of lv) painter.paintGroup(o.spec, mul(m, o.m), w, h, fbo, within); continue; }
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
          painter.layMasked((_, b) => { gl.viewport(0, 0, w, h); for (const [U0, U1, mm] of under) drawLayer(U0, U1, mm, b); drawLayer(L0, L1, mat, b); }, box, cut.spec, mul(m, cut.m), w, h, fbo, cut.opacity ?? 1, within);
        }
        else { gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, w, h); drawLayer(L0, L1); }
      }
      painter?.endFrame();
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return whole ? true : dirty;
    },
    get texture() { return stackTex; },
    /** The painter it paints with (or null), for a stack that shares it. */
    get painter() { return painter; },
    /** Gives back the stack's canvas-sized texture while nothing is shown (the next render makes it again). */
    trim() {
      if (!w) return;
      w = h = 0; drawnKey = ''; drawnAt = ''; drawnDesc = new Map();
      if (!shared) painter?.trim();
      gl.bindTexture(gl.TEXTURE_2D, stackTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    },
    dispose() {
      for (const s of [0, 1]) { free(live[s]); free(staged[s]); }
      if (!shared) painter?.dispose();
      watch?.disconnect();
      gl.deleteTexture(stackTex); gl.deleteFramebuffer(fbo); gl.deleteBuffer(quad); gl.deleteVertexArray(vao); gl.deleteProgram(layerP.p);
    },
  };
}
