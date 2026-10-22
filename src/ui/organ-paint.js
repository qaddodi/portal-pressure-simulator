// Organs painted on the GPU from their own SVG (WebGL2, with the shape drawer shape-gl.js): an organ's group read once into a
// list of paint operations, each a shape (its path or ellipse, through its transforms) filled or stroked with the colour,
// gradient and opacity the page's own styles give it, clipped where the SVG clips it; the list painted back to front into
// a layer of the organ's own, which is laid on the stack with the group's opacity and its mask. The colours are read from the
// page (computed styles, gradient stops), never written twice, so every theme and state paints as the SVG does; the edges are
// the shape drawer's (within a few levels of the browser's, Mohammad's OK of 22 Oct).
//
// What it reads: path, ellipse, circle and rect; fill and stroke (solid colours, linear and radial gradients in the element's
// box or in user space, with stops, a gradientTransform, pad spread); fill-, stroke- and element opacity (an opacity on a group
// is carried to its shapes, which in these organs never overlap: the liver's two sheens); stroke width and caps (every joint is
// drawn round: the organs' outlines are round-joined, and the flank's miter joints are on a smooth curve, where they agree);
// clip-path (one shape, in the user space of the element it clips); a group mask whose content is itself such shapes (its
// luminance). Anything else (a dash, a filter, a nested mask, a focal point) and the organ is not read: null, and the caller
// keeps the organ's picture.

import { flattenPath, ellipsePoly, polyBox, polyMesh } from './shape-gl.js?v=c4003c5526';

const ID = [1, 0, 0, 1, 0, 0];
/** a ∘ b: b applied first (SVG matrices [a, b, c, d, e, f]). */
export const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
export const inv = (m) => { const d = m[0] * m[3] - m[1] * m[2] || 1e-12; return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d]; };
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** A CSS colour as computed ("rgb(…)", "rgba(…)", "color(srgb r g b / a)", "transparent") → [r, g, b, a] in 0..1, or null. */
export function parseColor(s) {
  s = String(s || '').trim();
  if (s === 'transparent') return [0, 0, 0, 0];
  let m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (m) return [m[1] / 255, m[2] / 255, m[3] / 255, m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]];
  m = s.match(/^color\(srgb\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/);
  if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]];
  return null;
}

const matOf = (el) => { const t = el.transform?.baseVal; if (!t || !t.numberOfItems) return ID; const k = t.consolidate().matrix; return [k.a, k.b, k.c, k.d, k.e, k.f]; };
const urlId = (v) => String(v || '').match(/url\(\s*["']?#([^)"']+)["']?\s*\)/)?.[1] || null;
const num = (el, a, dflt) => { const v = el.getAttribute(a); if (v == null || v === '') return dflt; const n = parseFloat(v); return v.trim().endsWith('%') ? n / 100 : n; };

/** A gradient by id → { kind: 1 linear | 2 radial, box (objectBoundingBox units), gt (gradientTransform), p (x1 y1 x2 y2 | cx cy r), stops: [[offset, r, g, b, a]] }, or null. */
function readGradient(doc, id) {
  const g = doc.getElementById(id);
  if (!g || !/^(linear|radial)Gradient$/.test(g.localName)) return null;
  if (g.getAttribute('href') || g.getAttribute('xlink:href')) return null;
  const sm = g.getAttribute('spreadMethod');
  if (sm && sm !== 'pad') return null;
  const box = (g.getAttribute('gradientUnits') || 'objectBoundingBox') === 'objectBoundingBox';
  const gt = matOf(g.gradientTransform ? { transform: g.gradientTransform } : g);
  let p;
  if (g.localName === 'linearGradient') p = [num(g, 'x1', 0), num(g, 'y1', 0), num(g, 'x2', 1), num(g, 'y2', 0)];
  else {
    p = [num(g, 'cx', 0.5), num(g, 'cy', 0.5), num(g, 'r', 0.5)];
    const fx = g.getAttribute('fx'), fy = g.getAttribute('fy');
    if ((fx != null && num(g, 'fx', 0) !== p[0]) || (fy != null && num(g, 'fy', 0) !== p[1])) return null;
  }
  const stops = [];
  let last = 0;
  for (const s of g.querySelectorAll(':scope > stop')) {
    const cs = getComputedStyle(s), c = parseColor(cs.stopColor || cs.getPropertyValue('stop-color'));
    if (!c) return null;
    const o = Math.min(1, Math.max(last, num(s, 'offset', 0)));
    last = o;
    stops.push([o, c[0], c[1], c[2], c[3] * (parseFloat(cs.stopOpacity || cs.getPropertyValue('stop-opacity')) || 0)]);
  }
  if (!stops.length || stops.length > 8) return null;
  return { kind: g.localName === 'linearGradient' ? 1 : 2, box, gt, p, stops };
}

/** A paint (computed fill or stroke) → { solid: [r, g, b, a] } | { grad }, or null for none; false: not readable. */
function readPaintValue(doc, v) {
  v = String(v || '').trim();
  if (!v || v === 'none') return null;
  const id = urlId(v);
  if (id) { const grad = readGradient(doc, id); return grad ? { grad } : false; }
  const c = parseColor(v);
  return c ? { solid: c } : false;
}

/** The shape an element draws, in its own units: { el, d } (a path, read again at each paint), or { poly } (fixed), or null. */
function readGeom(el) {
  switch (el.localName) {
    case 'path': return { el, d: true };
    case 'ellipse': return { poly: ellipsePoly(num(el, 'cx', 0), num(el, 'cy', 0), num(el, 'rx', 0), num(el, 'ry', 0)) };
    case 'circle': { const r = num(el, 'r', 0); return { poly: ellipsePoly(num(el, 'cx', 0), num(el, 'cy', 0), r, r) }; }
    case 'rect': {
      if (el.getAttribute('rx') || el.getAttribute('ry')) return false;
      const x = num(el, 'x', 0), y = num(el, 'y', 0), w = num(el, 'width', 0), h = num(el, 'height', 0);
      return { poly: [{ pts: new Float32Array([x, y, x + w, y, x + w, y + h, x, y + h]), closed: true }] };
    }
    default: return false;
  }
}

/** A clip-path by id, in the user space `m` (to the group's frame) of the element it clips: { geom, m }, or false. */
function readClip(doc, id, m) {
  const c = doc.getElementById(id);
  if (!c || c.localName !== 'clipPath' || (c.getAttribute('clipPathUnits') || 'userSpaceOnUse') !== 'userSpaceOnUse') return false;
  const kids = [...c.children];
  if (kids.length !== 1 || c.getAttribute('clip-path')) return false;
  const geom = readGeom(kids[0]);
  if (!geom) return false;
  return { geom, m: mul(m, matOf(kids[0])) };
}

/**
 * An SVG group read for painting: { ops, opacity, mask } where each op is { geom, m (its units → the group's frame), kind:
 * 'fill' | 'stroke', paint ({ solid } | { grad }), alpha, w (stroke width), cap (0 butt, 1 round, 2 square), clip ({ geom, m }
 * | null) }, opacity the group's own and mask a group read the same way (its content), or null. Null when anything in it is
 * outside what the painter draws (the caller keeps the picture). `withMask`: read the group's mask (else it is left to the caller).
 */
export function readGroup(root, { withMask = true } = {}) {
  const doc = root.ownerDocument, ops = [];
  let ok = true;
  // (Visibility as the picture's copy takes it, svg-inline.js inlineStyles: the element's own setting, else its parent's. The
  // computed one is hidden under the whole figure while the GPU draws it (.gl-plate); the liver's congestion, islands and gloss
  // are hidden with their own style in the imaging view, whatever their opacity.)
  const walk = (el, m, alpha, clip, vis = 'visible') => {
    if (!ok) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return;
    const own = el.style?.visibility || el.getAttribute('visibility');
    if (own && own !== 'inherit') vis = own;
    const o = parseFloat(cs.opacity);
    if (!(o > 0)) return;
    if ((cs.filter && cs.filter !== 'none') || (cs.mixBlendMode && cs.mixBlendMode !== 'normal')) { ok = false; return; }
    if (el !== root && ((cs.mask && cs.mask !== 'none') || el.getAttribute('mask'))) { ok = false; return; }
    const me = el === root ? ID : mul(m, matOf(el)), a = el === root ? 1 : alpha * o;
    let cl = clip;
    const cid = el === root ? null : urlId(cs.clipPath && cs.clipPath !== 'none' ? cs.clipPath : el.getAttribute('clip-path'));
    if (cid) {
      if (clip) { ok = false; return; }   // (two clips, one inside the other: not drawn here)
      cl = readClip(doc, cid, me);
      if (!cl) { ok = false; return; }
    }
    if (el.localName === 'g' || el === root) { for (const k of el.children) walk(k, me, a, cl, vis); return; }
    if (/^(title|desc|metadata)$/.test(el.localName) || vis !== 'visible') return;
    const geom = readGeom(el);
    if (!geom) { ok = false; return; }
    if (geom.d && !el.getAttribute('d')) return;
    if (cs.strokeDasharray && cs.strokeDasharray !== 'none') { ok = false; return; }
    if ((cs.fillRule || 'nonzero') !== 'nonzero') { ok = false; return; }
    const fill = readPaintValue(doc, cs.fill), stroke = readPaintValue(doc, cs.stroke);
    if (fill === false || stroke === false) { ok = false; return; }
    if (fill) {
      const fa = a * (parseFloat(cs.fillOpacity) || 0);
      if (fa > 0) ops.push({ geom, m: me, kind: 'fill', paint: fill, alpha: fa, clip: cl, el });
    }
    if (stroke) {
      const sa = a * (parseFloat(cs.strokeOpacity) || 0), w = parseFloat(cs.strokeWidth) || 0;
      if (sa > 0 && w > 0) {
        ops.push({ geom, m: me, kind: 'stroke', paint: stroke, alpha: sa, w, cap: { butt: 0, round: 1, square: 2 }[cs.strokeLinecap] ?? 0, clip: cl, el });
      }
    }
  };
  walk(root, ID, 1, null);
  if (!ok) return null;
  const rcs = getComputedStyle(root);
  let mask = null;
  const mid = urlId(rcs.mask && rcs.mask !== 'none' ? rcs.mask : root.getAttribute('mask'));
  if (mid && withMask) {
    const mel = doc.getElementById(mid);
    if (!mel || mel.localName !== 'mask' || (mel.getAttribute('maskContentUnits') || 'userSpaceOnUse') !== 'userSpaceOnUse') return null;
    mask = readGroup(mel);
    if (!mask) return null;
  } else if (mid) mask = undefined;
  const clipId = urlId(rcs.clipPath && rcs.clipPath !== 'none' ? rcs.clipPath : null);
  if (clipId) return null;
  return { ops, opacity: parseFloat(rcs.opacity) || 0, mask };
}

/** The element's paint's box in its own units (an objectBoundingBox gradient's), from its flattened outline. */
function boxOf(polys) { const b = polyBox(polys); return [b[0], b[1], b[2] - b[0], b[3] - b[1]]; }

// ── GL ──
const QUAD_VS = `#version 300 es
layout(location=0) in vec2 corner;
void main() { gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0); }`;
// One paint operation: the shape's coverage (scratch r) times its clip's (scratch g), painted with its colour or gradient.
const PAINT_FS = `#version 300 es
precision highp float;
uniform highp sampler2D cov;
uniform int useClip;
uniform int kind;           // 0 solid, 1 linear, 2 radial
uniform vec4 color;         // straight
uniform mat3 toGrad;        // device px (y down) → the gradient's own space
uniform vec4 gp;            // linear: x1 y1 x2 y2; radial: cx cy r
uniform float stopO[8];
uniform vec4 stopC[8];      // straight
uniform int nStops;
uniform float alpha;
uniform float H;
out vec4 o;
vec4 grad(float t) {
  if (t <= stopO[0]) return stopC[0];
  for (int i = 1; i < 8; i++) {
    if (i >= nStops) break;
    if (t <= stopO[i]) { float w = stopO[i] - stopO[i - 1]; return w > 0.0 ? mix(stopC[i - 1], stopC[i], (t - stopO[i - 1]) / w) : stopC[i]; }
  }
  return stopC[nStops - 1];
}
void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  vec4 cv = texelFetch(cov, ip, 0);
  float c = cv.r * (useClip == 1 ? cv.g : 1.0);
  if (c <= 0.0) discard;
  vec4 col = color;
  if (kind != 0) {
    vec2 g = (toGrad * vec3(gl_FragCoord.x, H - gl_FragCoord.y, 1.0)).xy;
    float t;
    if (kind == 1) { vec2 d = gp.zw - gp.xy; float L2 = dot(d, d); t = L2 > 0.0 ? dot(g - gp.xy, d) / L2 : 0.0; }
    else t = gp.z > 0.0 ? length(g - gp.xy) / gp.z : 1.0;
    col = grad(clamp(t, 0.0, 1.0));
  }
  float a = col.a * alpha * c;
  o = vec4(col.rgb * a, a);
}`;
// A painted group laid over the target: its pixels times its opacity and, with a mask, the mask's luminance there.
const LAY_FS = `#version 300 es
precision highp float;
uniform sampler2D src, mask;
uniform int useMask;
uniform float opacity;
out vec4 o;
void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  float k = opacity;
  if (useMask == 1) { vec4 m = texelFetch(mask, ip, 0); k *= dot(m.rgb, vec3(0.2125, 0.7154, 0.0721)); }
  o = texelFetch(src, ip, 0) * k;
}`;

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
  for (let k = 0; k < n; k++) { const name = gl.getActiveUniform(p, k).name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}

/**
 * The painter, on a WebGL2 context, drawing with `shape` (createShapeGL on the same context). paintGroup(spec, m, w, h, fbo)
 * lays the group read by readGroup, under `m` (the group's frame → device pixels, y down), over framebuffer `fbo` (w × h).
 */
export function createOrganPaint(gl, shape) {
  const paintP = program(gl, QUAD_VS, PAINT_FS), layP = program(gl, QUAD_VS, LAY_FS);
  const quad = gl.createBuffer(), vao = gl.createVertexArray();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  // Canvas-sized targets: the coverage scratch (with the stencil the fills need), and a group and a mask layer for each depth.
  const tex = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); return t; };
  const target = () => ({ tex: tex(), fbo: gl.createFramebuffer() });
  const scratch = target(), stencil = gl.createRenderbuffer(), layers = [target(), target()];
  let W = 0, H = 0;
  function size(w, h) {
    if (w === W && h === H) return;
    W = w; H = h;
    for (const t of [scratch, ...layers]) {
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
    }
    gl.bindRenderbuffer(gl.RENDERBUFFER, stencil);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.STENCIL_INDEX8, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, scratch.fbo);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.STENCIL_ATTACHMENT, gl.RENDERBUFFER, stencil);
    gl.clearBufferfi(gl.DEPTH_STENCIL, 0, 1, 0);
  }
  // Meshes by shape and tolerance: an outline written to several paths (the liver's fill, its shades, its clip) is cut once a frame.
  let meshes = new Map(), meshesOld = new Map();
  function meshOf(geom, cap, tol) {
    const d = geom.d ? geom.el.getAttribute('d') || '' : null;
    const key = geom.d ? `${tol}|${cap}|${d}` : geom;
    let r = meshes.get(key) || meshesOld.get(key);
    if (!r) {
      const polys = geom.d ? flattenPath(d, tol) : geom.poly;
      r = { mesh: polyMesh(polys, cap), polys, box: boxOf(polys) };
    }
    meshes.set(key, r);
    return r;
  }
  const scaleOf = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
  // A device box [x0, y0, x1, y1] (y down) of polylines under m, grown by `g` px, cut to the canvas; null if empty.
  function devBox(box, m, g) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of [[box[0], box[1]], [box[0] + box[2], box[1]], [box[0], box[1] + box[3]], [box[0] + box[2], box[1] + box[3]]]) {
      const [u, v] = apply(m, x, y);
      x0 = Math.min(x0, u); y0 = Math.min(y0, v); x1 = Math.max(x1, u); y1 = Math.max(y1, v);
    }
    x0 = Math.max(0, Math.floor(x0 - g)); y0 = Math.max(0, Math.floor(y0 - g)); x1 = Math.min(W, Math.ceil(x1 + g)); y1 = Math.min(H, Math.ceil(y1 + g));
    return x1 > x0 && y1 > y0 ? [x0, y0, x1, y1] : null;
  }
  const scissor = (b) => { gl.enable(gl.SCISSOR_TEST); gl.scissor(b[0], H - b[3], b[2] - b[0], b[3] - b[1]); };
  const mat = new Float32Array(9), stopO = new Float32Array(8), stopC = new Float32Array(32);
  const drawQuad = () => { gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };

  /** Paints the ops of a group into the bound target (cleared by the caller), under m. */
  function paintOps(spec, m, into) {
    const sz = [W, H];
    let clipKey = null;
    for (const op of spec.ops) {
      // (The tolerance in powers of two, a fifth of a pixel or finer: a pinch reuses the meshes until the zoom doubles.)
      const om = mul(m, op.m), sc = scaleOf(om), tol = Math.min(0.5, 2 ** Math.floor(Math.log2(0.2 / sc)));
      const sh = meshOf(op.geom, op.kind === 'stroke' ? op.cap : 0, tol);
      const grow = op.kind === 'stroke' ? (op.w / 2) * sc + 2 : 2;
      let b = devBox(sh.box, om, grow);
      let cm = null, csh = null;
      if (op.clip) {
        cm = mul(m, op.clip.m);
        csh = meshOf(op.clip.geom, 0, Math.min(0.5, 0.2 / scaleOf(cm)));
        const cb = devBox(csh.box, cm, 2);
        b = b && cb && [Math.max(b[0], cb[0]), Math.max(b[1], cb[1]), Math.min(b[2], cb[2]), Math.min(b[3], cb[3])];
        if (b && !(b[2] > b[0] && b[3] > b[1])) b = null;
      }
      if (!b) continue;
      // The shape's coverage into the scratch's red, its clip's into green (kept while the next op has the same clip).
      gl.bindFramebuffer(gl.FRAMEBUFFER, scratch.fbo);
      gl.viewport(0, 0, W, H);
      const ck = op.clip ? `${op.clip.geom.d ? op.clip.geom.el.getAttribute('d') : ''}|${cm.join(',')}` : null;
      const newClip = !!op.clip && ck !== clipKey;
      // (Cleared over the whole canvas when the clip is new: a later op with the same clip may reach further.)
      gl.colorMask(true, newClip, false, false);
      if (newClip) gl.disable(gl.SCISSOR_TEST); else scissor(b);
      gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
      gl.colorMask(true, true, true, true);
      gl.disable(gl.SCISSOR_TEST);
      if (op.kind === 'fill') shape.fill(sh.mesh, om, sz, [true, false, false, false]);
      else shape.stroke(sh.mesh, om, sz, [true, false, false, false], op.w);
      if (newClip) { shape.fill(csh.mesh, cm, sz, [false, true, false, false]); clipKey = ck; }
      // Painted over the target within the op's box.
      gl.bindFramebuffer(gl.FRAMEBUFFER, into);
      gl.viewport(0, 0, W, H);
      scissor(b);
      const U = paintP.u;
      gl.useProgram(paintP.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, scratch.tex);
      gl.uniform1i(U.cov, 0);
      gl.uniform1i(U.useClip, op.clip ? 1 : 0);
      gl.uniform1f(U.alpha, op.alpha);
      gl.uniform1f(U.H, H);
      const p = op.paint;
      if (p.solid) { gl.uniform1i(U.kind, 0); gl.uniform4fv(U.color, p.solid); }
      else {
        const g = p.grad;
        // device → the element's units → (its box) → the gradient's space (its transform undone).
        let toG = inv(om);
        if (g.box) { const bx = sh.box; toG = mul([1 / (bx[2] || 1), 0, 0, 1 / (bx[3] || 1), -bx[0] / (bx[2] || 1), -bx[1] / (bx[3] || 1)], toG); }
        toG = mul(inv(g.gt), toG);
        mat.set([toG[0], toG[1], 0, toG[2], toG[3], 0, toG[4], toG[5], 1]);
        gl.uniformMatrix3fv(U.toGrad, false, mat);
        gl.uniform1i(U.kind, g.kind);
        gl.uniform4f(U.gp, g.p[0], g.p[1], g.p[2], g.p[3] ?? 0);
        stopO.fill(0); stopC.fill(0);
        g.stops.forEach((s, i) => { stopO[i] = s[0]; stopC.set(s.slice(1), 4 * i); });
        gl.uniform1fv(U.stopO, stopO); gl.uniform4fv(U.stopC, stopC); gl.uniform1i(U.nStops, g.stops.length);
        gl.uniform4f(U.color, 0, 0, 0, 0);
      }
      gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      drawQuad();
      gl.disable(gl.BLEND);
      gl.disable(gl.SCISSOR_TEST);
    }
  }

  /** The device box of everything a group paints under m (with its strokes), or null. */
  function groupBox(spec, m) {
    let u = null;
    for (const op of spec.ops) {
      const om = mul(m, op.m), sh = meshOf(op.geom, op.kind === 'stroke' ? op.cap : 0, Math.min(0.5, 0.2 / scaleOf(om)));
      const b = devBox(sh.box, om, op.kind === 'stroke' ? (op.w / 2) * scaleOf(om) + 2 : 2);
      if (b) u = u ? [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])] : b;
    }
    return u;
  }

  // The group's layer (and the mask's) cleared within b.
  function clearIn(b, withMask) {
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    for (const t of withMask ? layers : [layers[0]]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.viewport(0, 0, W, H);
      scissor(b); gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]); gl.disable(gl.SCISSOR_TEST);
    }
  }
  // The group's layer laid over fbo within b, times opacity and, withMask, the mask layer's luminance.
  function lay(b, opacity, withMask, fbo) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, W, H);
    scissor(b);
    gl.useProgram(layP.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, layers[0].tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, layers[1].tex);
    gl.uniform1i(layP.u.src, 0); gl.uniform1i(layP.u.mask, 1);
    gl.uniform1i(layP.u.useMask, withMask ? 1 : 0);
    gl.uniform1f(layP.u.opacity, opacity);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    drawQuad();
    gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(null);
  }
  return {
    /** Lays the group `spec` (readGroup) under m over framebuffer `fbo` of size w × h, with its opacity and mask. */
    paintGroup(spec, m, w, h, fbo) {
      size(w, h);
      const b = groupBox(spec, m);
      if (!b) return;
      clearIn(b, !!spec.mask);
      paintOps(spec, m, layers[0].fbo);
      // (A mask's content is in the user space of the element it masks: the group's frame.)
      if (spec.mask) paintOps(spec.mask, m, layers[1].fbo);
      lay(b, spec.opacity, !!spec.mask, fbo);
    },
    /**
     * A layer drawn by `draw(fbo)` (a picture of some organs, under its own program) laid over framebuffer `fbo` (w × h) times the
     * luminance of a mask group painted under m: the gut's cut and the stomach's see-through, made live while the layer stays a
     * picture. `box`: the layer's device box [x0, y0, x1, y1] (y down); `opacity`: the group's own, laid with the mask.
     */
    layMasked(draw, box, maskSpec, m, w, h, fbo, opacity = 1) {
      size(w, h);
      const b = [Math.max(0, Math.floor(box[0])), Math.max(0, Math.floor(box[1])), Math.min(W, Math.ceil(box[2])), Math.min(H, Math.ceil(box[3]))];
      if (!(b[2] > b[0] && b[3] > b[1])) return;
      clearIn(b, true);
      gl.bindFramebuffer(gl.FRAMEBUFFER, layers[0].fbo);
      gl.viewport(0, 0, W, H);
      draw(layers[0].fbo);
      paintOps(maskSpec, m, layers[1].fbo);
      lay(b, opacity, true, fbo);
    },
    /** Ends a frame of painting: meshes not used in it are let go. */
    endFrame() { meshesOld = meshes; meshes = new Map(); },
    trim() { if (!W) return; W = H = 0; for (const t of [scratch, ...layers]) { gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); } gl.bindRenderbuffer(gl.RENDERBUFFER, stencil); gl.renderbufferStorage(gl.RENDERBUFFER, gl.STENCIL_INDEX8, 1, 1); },
    dispose() {
      for (const t of [scratch, ...layers]) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
      gl.deleteRenderbuffer(stencil); gl.deleteBuffer(quad); gl.deleteVertexArray(vao); gl.deleteProgram(paintP.p); gl.deleteProgram(layP.p);
    },
  };
}
