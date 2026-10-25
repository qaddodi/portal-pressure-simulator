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

import { flattenPath, ellipsePoly, polyBox, polyMesh } from './shape-gl.js?v=b9a7bdbd53';
import { strHash } from './liver-geo.js?v=977185f80a';

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
  return { geom, m: mul(m, matOf(kids[0])), km: matOf(kids[0]) };
}

/**
 * An SVG group read for painting: { ops, opacity, mask } where each op is { geom, m (its units → the group's frame), kind:
 * 'fill' | 'stroke', paint ({ solid } | { grad }), alpha, w (stroke width), cap (0 butt, 1 round, 2 square), clip ({ geom, m }
 * | null) }, opacity the group's own and mask a group read the same way (its content), or null. Null when anything in it is
 * outside what the painter draws (the caller keeps the picture). `withMask`: read the group's mask (else it is left to the caller).
 * `nest`: a group inside it with a mask, or see-through (opacity below 1), is read as a group of its own, an op { kind: 'group',
 * ops, mask, chain, a0 } painted in a layer of its own and laid with its opacity and mask, as the browser lays it (without it such
 * a group's opacity is carried to its shapes, and a mask inside is not read). (The organs drawn as pictures, organs-gl bake: the
 * gut's see-through shades, the stomach's and duodenum's fades, each a group of overlapping shapes.)
 */
export function readGroup(root, { withMask = true, nest = false } = {}) {
  const doc = root.ownerDocument, ops = [];
  let ok = true;
  // (Visibility as the picture's copy takes it, svg-inline.js inlineStyles: the element's own setting, else its parent's. The
  // computed one is hidden under the whole figure while the GPU draws it (.gl-plate); the liver's congestion, islands and gloss
  // are hidden with their own style in the imaging view, whatever their opacity.)
  // What eases on the page is written inline (an element's style or its own attribute: the liver parts' opacity, the cuts'
  // fill-opacity, the organs' transforms), so an op keeps its chain of elements down from the root and the painter reads those
  // from the chain at each paint (liveOf); what the page's styles give (read here, computed) stands until the group is read again.
  // (out: the list the ops go to, the root's or a nested group's; a0: where in the chain the ops' opacities start, past a nested
  // group's own, which is laid with its layer.)
  const walk = (el, m, alpha, clip, vis = 'visible', chain = [], out = ops, a0 = 0) => {
    if (!ok) return;
    // (Definitions kept inside an organ's own art (the colon's and the bowel's clips) paint nothing where they are.)
    if (el !== root && /^(defs|clipPath|mask|pattern|linearGradient|radialGradient|symbol|marker|style|title|desc|metadata)$/.test(el.localName)) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return;
    const own = el.style?.visibility || el.getAttribute('visibility');
    if (own && own !== 'inherit') vis = own;
    const o = parseFloat(cs.opacity);
    if (!(o > 0) && !ownO(el)) return;   // (at nothing by the page's styles: never shown; by its own setting: shown as it eases)
    if ((cs.filter && cs.filter !== 'none') || (cs.mixBlendMode && cs.mixBlendMode !== 'normal')) { ok = false; return; }
    const masked = el !== root && ((cs.mask && cs.mask !== 'none') || !!el.getAttribute('mask'));
    const own2 = nest && el !== root && el.localName === 'g' && (masked || o < 1);
    if (masked && !own2) { ok = false; return; }
    const me = el === root ? ID : mul(m, matOf(el)), a = el === root ? 1 : alpha * o;
    const ch = el === root ? chain : [...chain, el];
    CS_O.set(el, o);
    let cl = clip;
    const cid = el === root ? null : urlId(cs.clipPath && cs.clipPath !== 'none' ? cs.clipPath : el.getAttribute('clip-path'));
    if (cid) {
      if (clip) { ok = false; return; }   // (two clips, one inside the other: not drawn here)
      cl = readClip(doc, cid, me);
      if (!cl) { ok = false; return; }
      cl.chain = ch;
    }
    if (own2) {
      // A group of its own: its shapes at their own opacities (from below it in the chain), its mask in its own frame.
      const sub = [];
      for (const k of el.children) walk(k, me, 1, cl, vis, ch, sub, ch.length);
      if (!ok) return;
      let mk = null;
      if (masked) {
        const mel = doc.getElementById(urlId(cs.mask && cs.mask !== 'none' ? cs.mask : el.getAttribute('mask')));
        if (!mel || mel.localName !== 'mask' || (mel.getAttribute('maskContentUnits') || 'userSpaceOnUse') !== 'userSpaceOnUse') { ok = false; return; }
        mk = readGroup(mel);
        if (!mk) { ok = false; return; }
      }
      if (sub.length) out.push({ kind: 'group', ops: sub, mask: mk, m: me, alpha: a, el, chain: ch, a0 });
      return;
    }
    if (el.localName === 'g' || el === root) { for (const k of el.children) walk(k, me, a, cl, vis, ch, out, a0); return; }
    if (/^(title|desc|metadata)$/.test(el.localName) || vis !== 'visible') return;
    const geom = readGeom(el);
    if (!geom) { ok = false; return; }
    if (geom.d && !el.getAttribute('d')) return;
    if (cs.strokeDasharray && cs.strokeDasharray !== 'none') { ok = false; return; }
    if ((cs.fillRule || 'nonzero') !== 'nonzero') { ok = false; return; }
    const fill = readPaintValue(doc, cs.fill), stroke = readPaintValue(doc, cs.stroke);
    if (fill === false || stroke === false) { ok = false; return; }
    if (fill) {
      const fo = parseFloat(cs.fillOpacity) || 0;
      CS_FO.set(el, fo);
      if (a * fo > 0 || ownFO(el) || ch.some(ownO)) out.push({ geom, m: me, kind: 'fill', paint: fill, alpha: a * fo, clip: cl, el, chain: ch, a0 });
    }
    if (stroke) {
      const so = parseFloat(cs.strokeOpacity) || 0, w = parseFloat(cs.strokeWidth) || 0;
      CS_SO.set(el, so);
      if ((a * so > 0 || ownSO(el) || ch.some(ownO)) && w > 0) {
        out.push({ geom, m: me, kind: 'stroke', paint: stroke, alpha: a * so, w, cap: { butt: 0, round: 1, square: 2 }[cs.strokeLinecap] ?? 0, clip: cl, el, chain: ch, a0 });
      }
    }
  };
  walk(root, ID, 1, null);
  if (!ok) return null;
  const rcs = getComputedStyle(root);
  CS_O.set(root, parseFloat(rcs.opacity) || 0);
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
  return { ops, opacity: parseFloat(rcs.opacity) || 0, mask, root };
}

// The computed opacities read with a group (by element), for the chain elements whose own setting is not inline.
const CS_O = new WeakMap(), CS_FO = new WeakMap(), CS_SO = new WeakMap();
const ownV = (el, prop, attr) => { const v = el.style?.[prop]; if (v != null && v !== '') return v; const a = el.getAttribute(attr); return a != null && a !== '' ? a : null; };
const ownO = (el) => ownV(el, 'opacity', 'opacity') != null;
const ownFO = (el) => ownV(el, 'fillOpacity', 'fill-opacity') != null;
const ownSO = (el) => ownV(el, 'strokeOpacity', 'stroke-opacity') != null;
const clamp01 = (v) => Math.min(1, Math.max(0, parseFloat(v) || 0));
const liveO = (el, cs) => { const v = ownV(el, 'opacity', 'opacity'); return v != null ? clamp01(v) : cs.get(el) ?? 1; };
const livePO = (el, prop, attr, cs) => { const v = ownV(el, prop, attr); return v != null ? clamp01(v) : cs.get(el) ?? 1; };
/** A group's own opacity now (its root's own setting, else as read). */
export const specOpacity = (spec) => (spec.root ? liveO(spec.root, CS_O) : spec.opacity);
/** The frame of an element chain (each element's transform, outermost first) now. */
export const chainM = (chain) => { let m = ID; for (const el of chain) m = mul(m, matOf(el)); return m; };
/**
 * An op as it stands now: its frame (the chain's transforms), its alpha (the chain's opacities and its own fill or stroke
 * opacity) and its clip's frame, read from the page's inline settings, else as read with the group.
 */
export function liveOf(op) {
  if (!op.chain) return { m: op.m, alpha: op.alpha, cm: op.clip ? op.clip.m : null };
  let a = 1;
  for (let i = op.a0 || 0; i < op.chain.length; i++) a *= liveO(op.chain[i], CS_O);
  if (op.kind === 'group') return { m: chainM(op.chain), alpha: a, cm: null };
  a *= op.kind === 'fill' ? livePO(op.el, 'fillOpacity', 'fill-opacity', CS_FO) : livePO(op.el, 'strokeOpacity', 'stroke-opacity', CS_SO);
  const m = chainM(op.chain);
  return { m, alpha: a, cm: op.clip ? mul(op.clip.chain ? chainM(op.clip.chain) : op.m, op.clip.km) : null };
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
  // (depths[d]: the group and mask layers of a group nested d deep, depths[0] the root's; made as a nesting first needs them.)
  const scratch = target(), stencil = gl.createRenderbuffer(), depths = [[target(), target()]], layers = depths[0];
  // W × H: the target painted now (the canvas, or a picture's texture: organs-gl bake), drawn from the targets' bottom-left
  // corner; AW × AH: what the targets hold, only ever grown, so a picture of another size never makes them all again.
  let W = 0, H = 0, AW = 0, AH = 0, allocVer = 0;
  // (The picture job painting with the nested layers now (bakeJob): one at a time.)
  let holder = null;
  const alloc = (list) => {
    for (const t of list) {
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, AW, AH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
    }
  };
  function size(w, h) {
    W = w; H = h;
    if (w <= AW && h <= AH) return;
    AW = Math.max(AW, w); AH = Math.max(AH, h);
    allocVer++;   // (every target made again, what they held lost: a picture's job half done starts over)
    alloc([scratch, ...depths.flat()]);
    gl.bindRenderbuffer(gl.RENDERBUFFER, stencil);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.STENCIL_INDEX8, AW, AH);
    gl.bindFramebuffer(gl.FRAMEBUFFER, scratch.fbo);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.STENCIL_ATTACHMENT, gl.RENDERBUFFER, stencil);
    gl.clearBufferfi(gl.DEPTH_STENCIL, 0, 1, 0);
  }
  const depth = (d) => { while (depths.length <= d) { const pair = [target(), target()]; depths.push(pair); if (AW) alloc(pair); } return depths[d]; };
  // Meshes by shape and tolerance: an outline written to several paths (the liver's fill, its shades, its clip) is cut once a frame.
  let meshes = new Map(), meshesOld = new Map();
  // (The pictures' meshes (bake): kept across frames, so a picture made again at the same detail cuts no outline again. Each mesh's
  // arrays stay on the GPU while it is kept (shape-gl.js), and are given back when it is let go.)
  let kept = new Map(), keeping = false;
  // (A path's `d` named by its hash and length, worked out once a frame: the liver's is thousands of characters, the nodules'
  // tens of thousands, and an outline written to several paths is hashed once.)
  let dKeys = new Map();
  const dKey = (d) => { let k = dKeys.get(d); if (!k) { k = `${d.length}:${strHash(d)}`; dKeys.set(d, k); } return k; };
  function meshOf(geom, cap, tol) {
    const d = geom.d ? geom.el.getAttribute('d') || '' : null;
    const key = geom.d ? `${tol}|${cap}|${dKey(d)}` : geom;
    if (keeping) {
      let k = kept.get(key);
      if (!k) {
        if (kept.size > 4000) { for (const [kk, v] of kept) if (!meshes.has(kk) && !meshesOld.has(kk)) shape.release(v.mesh); kept = new Map(); }
        const polys = geom.d ? flattenPath(d, tol) : geom.poly;
        kept.set(key, (k = { mesh: polyMesh(polys, cap), polys, box: boxOf(polys) }));
      }
      return k;
    }
    let r = meshes.get(key) || meshesOld.get(key) || kept.get(key);
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

  const meet = (a, c) => { if (!a || !c) return null; const r = [Math.max(a[0], c[0]), Math.max(a[1], c[1]), Math.min(a[2], c[2]), Math.min(a[3], c[3])]; return r[2] > r[0] && r[3] > r[1] ? r : null; };
  const join = (a, c) => (a && c ? [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[2]), Math.max(a[3], c[3])] : a || c);
  // An op under m: its mesh, its clip's, and the device box it paints within (with its stroke, its clip), or null for none.
  // (An op's inline settings are read once a frame: describe and the paint both ask.)
  let lives = new Map();
  function liveAt(op) { let l = lives.get(op); if (!l) { l = liveOf(op); lives.set(op, l); } return l; }
  function opAt(op, m) {
    const lv = liveAt(op);
    if (op.kind === 'group') {
      let b = null;
      for (const k of op.ops) b = join(b, opAt(k, m).b);
      return { b: lv.alpha > 0 ? b : null, alpha: lv.alpha, mm: mul(m, lv.m) };
    }
    // (The tolerance in powers of two, a fifth of a pixel or finer: a pinch reuses the meshes until the zoom doubles.)
    const om = mul(m, lv.m), sc = scaleOf(om), tol = Math.min(0.5, 2 ** Math.floor(Math.log2(0.2 / sc)));
    const sh = meshOf(op.geom, op.kind === 'stroke' ? op.cap : 0, tol);
    const grow = op.kind === 'stroke' ? (op.w / 2) * sc + 2 : 2;
    // (At no opacity it paints nothing: no box, so a change check sees it come and go.)
    let b = lv.alpha > 0 ? devBox(sh.box, om, grow) : null, cm = null, csh = null;
    if (op.clip) {
      cm = mul(m, lv.cm);
      csh = meshOf(op.clip.geom, 0, Math.min(0.5, 0.2 / scaleOf(cm)));
      b = meet(b, devBox(csh.box, cm, 2));
    }
    return { om, sh, cm, csh, b, alpha: lv.alpha };
  }
  // Painting as a job: frames of ops (a group's, a nested group's into its own layer, its mask's into the mask layer, and the
  // layer laid over what it belongs to once both are in), painted in order and resumable between any two ops. A picture
  // (organs-gl bake) is painted a few ms a frame however deep its groups nest (a nested group was painted whole within one
  // op: the gut's see-through shades, all at once). `ck`: the clip whose coverage the scratch's green holds (none after a pause:
  // the scratch is the live painting's between two steps).
  const frameOf = (ops, m, into, within, d) => ({ ops, m, into, within, d, i: 0 });
  /** Runs a job's frames until they are all painted (true) or, after at least one op, `until` (performance.now) has passed (false). */
  function runJob(job, until = Infinity) {
    let n = 0;
    job.ck = null;
    while (job.frames.length) {
      const f = job.frames[job.frames.length - 1];
      if (f.lay) { job.frames.pop(); layOver(...f.lay); job.ck = null; continue; }
      if (f.i >= f.ops.length) { job.frames.pop(); continue; }
      if (n > 0 && performance.now() > until) return false;
      const op = f.ops[f.i++];
      n++;
      if (op.kind === 'group') {
        // A nested group (readGroup nest): painted in its own layer, laid with its opacity and mask, as the browser lays it.
        const at = opAt(op, f.m), b = f.within ? meet(at.b, f.within) : at.b;
        if (!b) continue;
        const [g, k] = depth(f.d + 1);
        clearTargets(b, op.mask ? [g, k] : [g]);
        // (Last in, first painted: its shapes, then its mask, then the layer laid.)
        job.frames.push({ lay: [g, k, b, at.alpha, !!op.mask, f.into] });
        if (op.mask) job.frames.push(frameOf(op.mask.ops, at.mm, k.fbo, b, f.d + 1));
        job.frames.push(frameOf(op.ops, f.m, g.fbo, b, f.d + 1));
        job.ck = null;
        continue;
      }
      paintOp(op, f.m, f.into, f.within, job);
    }
    return true;
  }
  /** Paints the ops of a group into the bound target (cleared by the caller), under m; only within `within` (a device box) if given. */
  // (d: how deep in nested groups the ops are, whose layers are depths[d + 1].)
  function paintOps(spec, m, into, within = null, d = 0) { runJob({ frames: [frameOf(spec.ops, m, into, within, d)] }); }
  /** One shape's op painted over `into` under m, within `within`. */
  function paintOp(op, m, into, within, job) {
    const sz = [W, H];
    const at = opAt(op, m), { om, sh, cm, csh } = at;
    let b = within ? meet(at.b, within) : at.b;
    if (!b) return false;
    // The shape's coverage into the scratch's red, its clip's into green (kept while the next op has the same clip).
    gl.bindFramebuffer(gl.FRAMEBUFFER, scratch.fbo);
    gl.viewport(0, 0, W, H);
    const ck = op.clip ? `${op.clip.geom.d ? dKey(op.clip.geom.el.getAttribute('d') || '') : ''}|${cm.join(',')}` : null;
    const newClip = !!op.clip && ck !== job.ck;
    // (A new clip's green is cleared over the clip's own box, with this op's: a later op with the same clip is cut to that box, so
    // it never reads the green outside it. It was the whole canvas, on every clipped group, every frame.)
    gl.colorMask(true, newClip, false, false);
    scissor(newClip ? join(b, devBox(csh.box, cm, 2)) : b);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
    gl.colorMask(true, true, true, true);
    gl.disable(gl.SCISSOR_TEST);
    if (op.kind === 'fill') shape.fill(sh.mesh, om, sz, [true, false, false, false]);
    else shape.stroke(sh.mesh, om, sz, [true, false, false, false], op.w);
    if (newClip) { shape.fill(csh.mesh, cm, sz, [false, true, false, false]); job.ck = ck; }
    // Painted over the target within the op's box.
    gl.bindFramebuffer(gl.FRAMEBUFFER, into);
    gl.viewport(0, 0, W, H);
    scissor(b);
    const U = paintP.u;
    gl.useProgram(paintP.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, scratch.tex);
    gl.uniform1i(U.cov, 0);
    gl.uniform1i(U.useClip, op.clip ? 1 : 0);
    gl.uniform1f(U.alpha, at.alpha);
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
    return true;
  }

  /** The device box of everything a group paints under m (with its strokes), or null. */
  function groupBox(spec, m) {
    let u = null;
    for (const op of spec.ops) u = join(u, opAt(op, m).b);
    return u;
  }
  // What an op paints, as a string: what it is painted with (fixed while the spec lives: kept on the op) and where (its outline's
  // `d` and its frame, read now). Two frames with the same string paint the same pixels in the same box.
  const paintKey = (op) => op.pk || (op.pk = JSON.stringify([op.kind, op.w, op.cap, op.paint]));
  const opSig = (op, m) => { const lv = liveAt(op); return `${paintKey(op)}|${lv.alpha}|${lv.m.join(',')}|${lv.cm ? lv.cm.join(',') : ''}|${m.join(',')}|${op.geom.d ? dKey(op.geom.el.getAttribute('d') || '') : ''}|${op.clip ? (op.clip.geom.d ? dKey(op.clip.geom.el.getAttribute('d') || '') : '') : ''}`; };
  /**
   * The group under m described for a change check: its own string (opacity, whether masked) and, per op (the mask's after its
   * own), [string, device box]. The meshes it will paint are touched (kept for the frame).
   */
  function describe(spec, m) {
    const ops = [];
    const add = (list, pre) => { for (const op of list) if (op.kind === 'group') { ops.push([`${pre}group|${liveAt(op).alpha}|${liveAt(op).m.join(',')}`, opAt(op, m).b]); add(op.ops, pre); if (op.mask) add(op.mask.ops, `${pre}gmask|`); } else ops.push([`${pre}${opSig(op, m)}`, opAt(op, m).b]); };
    if (spec.ops.some((op) => op.kind === 'group')) add(spec.ops, '');
    else for (const op of spec.ops) ops.push([opSig(op, m), opAt(op, m).b]);
    if (spec.mask) for (const op of spec.mask.ops) ops.push([`mask|${opSig(op, m)}`, opAt(op, m).b]);
    return { sig: `${specOpacity(spec)}|${spec.mask ? 1 : 0}`, ops };
  }

  // The group's layer (and the mask's) cleared within b.
  function clearTargets(b, list) {
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    for (const t of list) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.viewport(0, 0, W, H);
      scissor(b); gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]); gl.disable(gl.SCISSOR_TEST);
    }
  }
  const clearIn = (b, withMask) => clearTargets(b, withMask ? layers : [layers[0]]);
  // The group's layer laid over fbo within b, times opacity and, withMask, the mask layer's luminance.
  const lay = (b, opacity, withMask, fbo) => layOver(layers[0], layers[1], b, opacity, withMask, fbo);
  function layOver(g, k, b, opacity, withMask, fbo) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, W, H);
    scissor(b);
    gl.useProgram(layP.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, g.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, k.tex);
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
    paintGroup(spec, m, w, h, fbo, within = null) {
      size(w, h);
      const b = meet(groupBox(spec, m), within || [0, 0, w, h]);
      if (!b) return;
      clearIn(b, !!spec.mask);
      paintOps(spec, m, layers[0].fbo, b);
      // (A mask's content is in the user space of the element it masks: the group's frame.)
      if (spec.mask) paintOps(spec.mask, m, layers[1].fbo, b);
      lay(b, specOpacity(spec), !!spec.mask, fbo);
    },
    /**
     * A picture's group (organs-gl bake), laid over framebuffer `fbo` (w × h) as paintGroup lays it, as a job painted a few ops at a
     * time, its meshes kept across frames: step(until) paints on until that time (performance.now) and returns 'done' once all is
     * painted, 'more', 'wait' while another picture's job holds the nested layers (one at a time: they keep a half-painted group
     * between steps), or 'lost' when those layers were made again meanwhile (the canvas grew: the picture must start over). A group
     * with no opacity of its own and no mask is painted straight onto the picture (the same pixels: "over" onto what is under it);
     * any other in a layer of its own, laid once whole. drop() gives it up.
     */
    bakeJob(spec, m, w, h, fbo) {
      let job = null, ver = -1;
      const me = {
        step(until = Infinity) {
          if (holder && holder !== me) return 'wait';
          holder = me;
          size(w, h);
          keeping = true;
          try {
            if (!job) {
              ver = allocVer;
              if (spec.mask || specOpacity(spec) < 1) {
                const b = meet(groupBox(spec, m), [0, 0, w, h]);
                job = { frames: [] };
                if (b) {
                  const [g, k] = depth(1);
                  clearTargets(b, spec.mask ? [g, k] : [g]);
                  // (A mask's content is in the user space of the element it masks: the group's frame.)
                  job.frames.push({ lay: [g, k, b, specOpacity(spec), !!spec.mask, fbo] });
                  if (spec.mask) job.frames.push(frameOf(spec.mask.ops, m, k.fbo, b, 1));
                  job.frames.push(frameOf(spec.ops, m, g.fbo, b, 1));
                }
              } else job = { frames: [frameOf(spec.ops, m, fbo, [0, 0, w, h], 0)] };
            } else if (ver !== allocVer) { holder = null; return 'lost'; }
            if (!runJob(job, until)) return 'more';
            holder = null;
            return 'done';
          } finally { keeping = false; lives = new Map(); dKeys = new Map(); }
        },
        drop() { if (holder === me) holder = null; job = null; },
      };
      return me;
    },
    /** What it holds on the GPU: meshes with arrays there, and those the pictures keep. */
    stats: () => ({ meshes: shape.count?.() ?? 0, kept: kept.size }),
    /** Lets go of the pictures' kept meshes (their GPU arrays too). */
    dropKept() { for (const [k, v] of kept) if (!meshes.has(k) && !meshesOld.has(k)) shape.release(v.mesh); kept = new Map(); },
    /** The group's device box under m (groupBox), and its description (describe), for the stack's change check. */
    box: (spec, m) => groupBox(spec, m),
    describe,
    /**
     * A layer drawn by `draw(fbo)` (a picture of some organs, under its own program) laid over framebuffer `fbo` (w × h) times the
     * luminance of a mask group painted under m: the gut's cut and the stomach's see-through, made live while the layer stays a
     * picture. `box`: the layer's device box [x0, y0, x1, y1] (y down); `opacity`: the group's own, laid with the mask.
     */
    layMasked(draw, box, maskSpec, m, w, h, fbo, opacity = 1, within = null) {
      size(w, h);
      let b = [Math.max(0, Math.floor(box[0])), Math.max(0, Math.floor(box[1])), Math.min(W, Math.ceil(box[2])), Math.min(H, Math.ceil(box[3]))];
      if (within) b = meet(b, within);
      if (!b || !(b[2] > b[0] && b[3] > b[1])) return;
      clearIn(b, true);
      gl.bindFramebuffer(gl.FRAMEBUFFER, layers[0].fbo);
      gl.viewport(0, 0, W, H);
      draw(layers[0].fbo, b);
      paintOps(maskSpec, m, layers[1].fbo, b);
      lay(b, opacity, true, fbo);
    },
    /** Ends a frame of painting: meshes not used in it are let go. */
    endFrame() {
      // (A mesh let go is given back to the GPU, unless a picture keeps it.)
      for (const [k, v] of meshesOld) if (!meshes.has(k) && !kept.has(k)) shape.release(v.mesh);
      meshesOld = meshes; meshes = new Map(); dKeys = new Map(); lives = new Map();
    },
    trim() { this.dropKept(); if (!AW) return; W = H = AW = AH = 0; for (const t of [scratch, ...depths.flat()]) { gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); } gl.bindRenderbuffer(gl.RENDERBUFFER, stencil); gl.renderbufferStorage(gl.RENDERBUFFER, gl.STENCIL_INDEX8, 1, 1); },
    dispose() {
      for (const t of [scratch, ...depths.flat()]) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
      gl.deleteRenderbuffer(stencil); gl.deleteBuffer(quad); gl.deleteVertexArray(vao); gl.deleteProgram(paintP.p); gl.deleteProgram(layP.p);
    },
  };
}
