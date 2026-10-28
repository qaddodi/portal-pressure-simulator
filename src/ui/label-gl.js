// The figure's labels drawn on the GPU (Mohammad, 25 Oct: "move everything including every label and callout ... to GPU").
//
// The SVG label layer (#labels .lb) stays the model: stage.js lays every label out and writes it there as before, so the solver,
// its gaps and rules, the CSS (colours, the theme, the text size, a selection, a slide's term colours, the fades), clicks, keyboard
// focus, screen readers and every browser check work on the same elements. Here each label's look is read from those elements once
// it changes (their computed style, so the page's own CSS decides it), drawn once into a small picture by the browser's own text
// drawing (Canvas 2D: the same font, weights, sizes, halo and joins), at the screen's device pixel ratio, and the GPU lays the
// pictures out at whole device pixels, never scaled: a pan or a zoom moves pictures, it draws no text. The SVG's own copy of a label
// the GPU draws is made see-through (#labels .lb[data-gl] > *: opacity 0), so the page does not paint it.
//
// A label whose look this drawing cannot give exactly (a filter or letter spacing the browser's Canvas 2D lacks, a part it does not
// know, a keyboard focus ring) stays drawn by the SVG, label by label. Without WebGL2, on a software renderer, with ?gpulabels=0, or
// once the context is lost, the SVG draws them all, as it always has.

import { frameFor, cancelFrame } from './frame.js?v=7254a8a850';
import { startProgram, checkProgram } from './gl-compile.js?v=5c4cd6c14c';
import { createAtlasPacker, batchRuns } from './atlas-pack.js?v=43b8bc019d';

const nextFrame = frameFor('labels-gl');
const VS = `#version 300 es
uniform vec4 uR;      // the picture's box: left, top, width, height (device px, from the top left)
uniform vec2 uView;   // the canvas (device px)
const vec2 Q[4] = vec2[4](vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0));
void main() {
  vec2 p = uR.xy + Q[gl_VertexID] * uR.zw;
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
}`;
// One texel per device pixel, fetched (no filtering): the picture shows exactly as it was drawn.
const FS = `#version 300 es
precision highp float;
uniform sampler2D uT;
uniform vec4 uR;
uniform vec2 uView;
uniform float uA;
out vec4 o;
void main() {
  ivec2 q = ivec2(floor(vec2(gl_FragCoord.x, uView.y - gl_FragCoord.y) - uR.xy));
  o = texelFetch(uT, q, 0) * uA;
}`;

// The labels' pictures sit in atlas pages and are drawn as one instanced batch: each instance is a box on the canvas (device px) and
// the texel its picture starts at in the page. Instances blend in their order, which is the labels' painter order.
const AVS = `#version 300 es
in vec4 aR;           // the picture's box: left, top, width, height (device px, from the top left)
in vec4 aT;           // its first texel in the page (x, y), its opacity, unused
uniform vec2 uView;
flat out vec4 vR;
flat out vec3 vT;
const vec2 Q[4] = vec2[4](vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0));
void main() {
  vec2 p = aR.xy + Q[gl_VertexID] * aR.zw;
  vR = aR; vT = aT.xyz;
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
}`;
const AFS = `#version 300 es
precision highp float;
uniform sampler2D uT;
uniform vec2 uView;
flat in vec4 vR;
flat in vec3 vT;
out vec4 o;
void main() {
  ivec2 q = ivec2(floor(vec2(gl_FragCoord.x, uView.y - gl_FragCoord.y) - vR.xy)) + ivec2(vT.xy);
  o = texelFetch(uT, q, 0) * vT.z;
}`;

// The leaders and their dots, drawn as shapes (no picture: a zoom changes their length every frame). One quad over the mark; its
// coverage worked out per pixel from the distance to the line or the circle, as the browser's own smoothing gives an edge.
const MVS = `#version 300 es
uniform vec4 uBox;    // left, top, right, bottom (device px)
uniform vec2 uView;
const vec2 Q[4] = vec2[4](vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0));
void main() {
  vec2 p = mix(uBox.xy, uBox.zw, Q[gl_VertexID]);
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
}`;
const MFS = `#version 300 es
precision highp float;
uniform vec2 uView;
uniform int uKind;          // 0: a line (butt ends), 1: a circle, 2: a line with round ends, 3: a triangle filled with a linear gradient
uniform vec2 uT0, uT1, uT2; // the triangle (device px)
uniform vec4 uG;            // the gradient's start and end (device px)
uniform vec4 uS0, uS1, uS2; // its three stops, premultiplied
uniform vec3 uSO;           // their offsets
uniform vec4 uR4;           // an arc's start and end angles; a rectangle's turn
uniform vec4 uGeo;          // line: x0 y0 x1 y1; circle: cx cy r 0 (device px)
uniform float uW;           // stroke width (device px)
uniform vec2 uDash;         // dash, gap (device px; 0: solid)
uniform vec4 uStroke, uFill; // premultiplied
uniform float uA;
out vec4 o;
// The share of a pixel centred at x (one pixel wide) inside [a, b].
float span(float x, float a, float b) { return clamp(min(x + 0.5, b) - max(x - 0.5, a), 0.0, 1.0); }
void main() {
  vec2 p = vec2(gl_FragCoord.x, uView.y - gl_FragCoord.y);
  if (uKind == 4) {
    // An arc of the circle about uGeo.xy, radius uGeo.z, from angle uR4.x to uR4.y (radians, y down), its ends round.
    vec2 q = p - uGeo.xy;
    float a = atan(q.y, q.x), m = 0.5 * (uR4.x + uR4.y), h = 0.5 * (uR4.y - uR4.x);
    float da = abs(mod(a - m + 3.14159265, 6.28318531) - 3.14159265), dist;
    if (da <= h) dist = abs(length(q) - uGeo.z);
    else { vec2 e0 = uGeo.xy + uGeo.z * vec2(cos(uR4.x), sin(uR4.x)), e1 = uGeo.xy + uGeo.z * vec2(cos(uR4.y), sin(uR4.y)); dist = min(length(p - e0), length(p - e1)); }
    o = uStroke * clamp(uW * 0.5 + 0.5 - dist, 0.0, 1.0) * uA;
    return;
  }
  if (uKind == 5) {
    // A filled rounded rectangle: centre uGeo.xy, half sizes uGeo.zw, corner radius uW, turned uR4.x (radians).
    vec2 q = p - uGeo.xy, c = vec2(cos(uR4.x), sin(uR4.x));
    q = vec2(dot(q, c), dot(q, vec2(-c.y, c.x)));
    vec2 b = abs(q) - uGeo.zw + uW;
    float dist = length(max(b, 0.0)) + min(max(b.x, b.y), 0.0) - uW;
    o = uFill * clamp(0.5 - dist, 0.0, 1.0) * uA;
    return;
  }
  if (uKind == 2) {
    vec2 a = uGeo.xy, d = uGeo.zw - a;
    float h = clamp(dot(p - a, d) / max(dot(d, d), 1e-6), 0.0, 1.0);
    o = uStroke * clamp(uW * 0.5 + 0.5 - length(p - a - d * h), 0.0, 1.0) * uA;
    return;
  }
  if (uKind == 3) {
    // (Inside all three edges, each softened over a pixel; the gradient's colour where the pixel falls along it.)
    float c = 1.0;
    vec2 T[3] = vec2[3](uT0, uT1, uT2);
    float side = sign((T[1].x - T[0].x) * (T[2].y - T[0].y) - (T[1].y - T[0].y) * (T[2].x - T[0].x));
    for (int i = 0; i < 3; i++) {
      vec2 a = T[i], e = T[(i + 1) % 3] - a, n = normalize(vec2(e.y, -e.x)) * -side;
      c *= clamp(dot(p - a, n) + 0.5, 0.0, 1.0);
    }
    vec2 g = uG.zw - uG.xy;
    float t = clamp(dot(p - uG.xy, g) / max(dot(g, g), 1e-6), 0.0, 1.0);
    vec4 col = t <= uSO.y ? mix(uS0, uS1, clamp((t - uSO.x) / max(uSO.y - uSO.x, 1e-6), 0.0, 1.0)) : mix(uS1, uS2, clamp((t - uSO.y) / max(uSO.z - uSO.y, 1e-6), 0.0, 1.0));
    o = col * c * uA;
    return;
  }
  if (uKind == 0) {
    vec2 a = uGeo.xy, d = uGeo.zw - a;
    float L = length(d);
    if (L < 1e-4) discard;
    vec2 t = d / L;
    float u = dot(p - a, t), v = abs(dot(p - a, vec2(-t.y, t.x)));
    // (How much of the pixel the line covers, across it and along it: a hairline under a pixel wide shows fainter, not thinner.)
    float c = span(v, -uW * 0.5, uW * 0.5) * span(u, 0.0, L);
    if (uDash.x > 0.0) { float m = mod(u, uDash.x + uDash.y); c *= span(m, 0.0, uDash.x) + span(m, uDash.x + uDash.y, uDash.x + uDash.y + uDash.x); }
    o = uStroke * c * uA;
  } else {
    float d = length(p - uGeo.xy), r = uGeo.z;
    float f = span(d, -1.0, r), s = uW > 0.0 ? span(d, r - uW * 0.5, r + uW * 0.5) : 0.0;
    vec4 fill = uFill * f;
    o = (uStroke * s + fill * (1.0 - uStroke.a * s)) * uA;
  }
}`;

const NUM = (v) => parseFloat(v) || 0;
// A computed colour as premultiplied RGBA, 0 … 1.
export function rgba(c) {
  const m = /rgba?\(([^)]+)\)/.exec(c || '');
  if (!m) return [0, 0, 0, 0];
  const v = m[1].split(/[\s,/]+/).filter(Boolean).map(Number), a = v.length > 3 ? v[3] : 1;
  return [v[0] / 255 * a, v[1] / 255 * a, v[2] / 255 * a, a];
}
/** A leader's or dot's look: null when it draws nothing; false when it is not a shape drawn here (the SVG keeps it). */
export function describeMark(el, cs = getComputedStyle) {
  const c = cs(el);
  if (c.display === 'none') return null;
  const st = { op: NUM(c.opacity), stroke: none(c.stroke) ? null : rgba(c.stroke), w: NUM(c.strokeWidth), fill: none(c.fill) ? null : rgba(c.fill), dash: [0, 0] };
  if (c.strokeDasharray && c.strokeDasharray !== 'none') {
    const d = c.strokeDasharray.split(/[\s,]+/).map(NUM);
    if (d.length !== 2 || NUM(c.strokeDashoffset)) return false;
    st.dash = d;
  }
  if (el.tagName === 'path') { if (c.strokeLinecap !== 'butt' || st.fill) return false; }
  else if (el.tagName !== 'circle') return false;
  return st;
}
/** A leader's path as one straight piece [x0, y0, x1, y1], or null when it is anything else. */
export function lineOf(d) {
  const m = /^\s*M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*L\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*$/.exec(d || '');
  return m ? [+m[1], +m[2], +m[3], +m[4]] : null;
}
const none = (c) => !c || c === 'none' || c === 'transparent' || /^rgba\([^)]*,\s*0\)$/.test(c);

/** What a label's group draws, read from the page: null when it shows nothing; { svg: why } when this drawing cannot give it. */
export function describeBlock(g, cs = getComputedStyle) {
  const gs = cs(g);
  if (g.style.display === 'none' || gs.display === 'none') return null;
  try { if (g.matches(':focus-visible')) return { svg: 'focus' }; } catch { if (g === document.activeElement) return { svg: 'focus' }; }
  const d = { opacity: NUM(gs.opacity), filter: gs.filter === 'none' ? '' : gs.filter, parts: [] };
  for (const el of g.children) {
    const c = cs(el);
    if (c.display === 'none') continue;
    if (el.tagName === 'rect') {
      d.parts.push({ k: 'rect', x: NUM(el.getAttribute('x')), y: NUM(el.getAttribute('y')), w: NUM(el.getAttribute('width')), h: NUM(el.getAttribute('height')),
        rx: NUM(el.getAttribute('rx')), fill: none(c.fill) ? '' : c.fill, stroke: none(c.stroke) ? '' : c.stroke, sw: NUM(c.strokeWidth),
        strokeFirst: /^stroke/.test(c.paintOrder), filter: c.filter === 'none' ? '' : c.filter });
    } else if (el.tagName === 'text') {
      const line = { k: 'text', x: NUM(el.getAttribute('x')), y: NUM(el.getAttribute('y')), anchor: el.getAttribute('text-anchor') || 'start', runs: [] };
      for (const sp of el.children) {
        if (sp.tagName !== 'tspan') return { svg: 'part' };
        const r = cs(sp);
        if (r.display === 'none') continue;
        line.runs.push({ t: sp.textContent, dx: NUM(sp.getAttribute('dx')), font: `${r.fontStyle === 'normal' ? '' : r.fontStyle + ' '}${r.fontWeight} ${r.fontSize} ${r.fontFamily}`,
          size: NUM(r.fontSize), ls: r.letterSpacing === 'normal' ? 0 : NUM(r.letterSpacing), tnum: /tabular-nums/.test(r.fontVariantNumeric),
          fill: none(r.fill) ? '' : r.fill, stroke: none(r.stroke) ? '' : r.stroke, sw: NUM(r.strokeWidth), join: r.strokeLinejoin, strokeFirst: /^stroke/.test(r.paintOrder) });
      }
      // (Spaces as the SVG sets them: runs of white space as one, none at the line's ends.)
      let prev = true;
      for (const r of line.runs) { r.t = r.t.replace(/\s+/g, ' '); if (prev) r.t = r.t.replace(/^ /, ''); prev = r.t === '' ? prev : r.t.endsWith(' '); }
      for (let i = line.runs.length - 1; i >= 0; i--) { const r = line.runs[i]; r.t = r.t.replace(/ $/, ''); if (r.t) break; }
      d.parts.push(line);
    } else return { svg: 'part' };
  }
  return d;
}

/** The look of a description, as a key: a picture is drawn again only when it changes (the opacity is the GPU's, not the picture's). */
export const lookKey = (d, rot, dpr) => JSON.stringify([d.filter, d.parts, rot, dpr]);

// What Canvas 2D can do here (asked once): letter spacing and filters are newer than the rest.
let caps = null;
function canvasCaps() {
  if (caps) return caps;
  const c = document.createElement('canvas').getContext('2d');
  caps = { ls: !!c && 'letterSpacing' in c, filter: !!c && 'filter' in c && (c.filter = 'blur(1px)', c.filter === 'blur(1px)') };
  return caps;
}
/** Why the SVG must draw this description itself ('' when the GPU can). */
export function svgOnly(d, cap = canvasCaps()) {
  if (d.svg) return d.svg;
  if (!cap.filter && (d.filter || d.parts.some((p) => p.filter))) return 'filter';
  if (!cap.ls && d.parts.some((p) => p.runs?.some((r) => r.ls))) return 'letter-spacing';
  return '';
}

// The widths of a run, digit by digit as the SVG sets them with tabular figures (every digit as wide as a zero, centred in it),
// the rest as the font sets them, so the run is as wide as the labels' own measure (stage.js textW) and the SVG's.
function runPieces(ctx, r) {
  ctx.font = r.font;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${r.ls}px`;
  const out = [];
  if (!r.tnum) { out.push({ t: r.t, x: 0 }); return { pieces: out, w: ctx.measureText(r.t).width }; }
  const zero = ctx.measureText('0').width;
  let x = 0;
  for (const m of r.t.match(/\d|\D+/g) || []) {
    if (/\d/.test(m)) { const w = ctx.measureText(m).width; out.push({ t: m, x: x + (zero - w) / 2 }); x += zero; }
    else { out.push({ t: m, x }); x += ctx.measureText(m).width; }
  }
  return { pieces: out, w: x };
}

const roundRect = (ctx, x, y, w, h, r) => {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
};
// How far a filter's drop shadows and blurs reach (px): the picture is grown by that much.
const filterReach = (f) => (f ? Math.ceil((f.match(/-?[\d.]+px/g) || []).reduce((s, v) => s + Math.abs(parseFloat(v)), 0) * 3) + 2 : 0);

/**
 * Draws a description into `cv` (a canvas, resized here) at `dpr` device px per px, turned −90° when `rot` (a caption read bottom to
 * top: its origin then is the box's bottom left). Returns the picture's offset from the label's origin, { ox, oy } in device px.
 */
export function drawBlock(cv, d, dpr, rot = false) {
  const ctx0 = cv.getContext('2d');
  // The extent first, in the label's own px (before any turn).
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (a, b, c, e) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, e); };
  const lines = [];
  for (const p of d.parts) {
    if (p.k === 'rect') { const m = p.sw / 2 + filterReach(p.filter); grow(p.x - m, p.y - m, p.x + p.w + m, p.y + p.h + m); continue; }
    const runs = p.runs.map((r) => ({ r, ...runPieces(ctx0, r) }));
    let w = 0;
    runs.forEach((q, i) => { w += (i ? q.r.dx : 0) + q.w; });
    let x = p.anchor === 'end' ? p.x - w : p.anchor === 'middle' ? p.x - w / 2 : p.x;
    for (const [i, q] of runs.entries()) {
      if (i) x += q.r.dx;
      q.x = x; x += q.w;
      const h = q.r.stroke ? q.r.sw / 2 : 0;
      grow(q.x - h - 2, p.y - q.r.size * 1.1 - h - 2, q.x + q.w + h + 2, p.y + q.r.size * 0.35 + h + 2);
    }
    lines.push({ p, runs });
  }
  if (!(x1 > x0)) return null;
  const f = filterReach(d.filter);
  x0 -= f; y0 -= f; x1 += f; y1 += f;
  // Device px, the label's origin on a whole pixel (where the GPU puts it).
  const L = Math.floor(x0 * dpr), T = Math.floor(y0 * dpr), R = Math.ceil(x1 * dpr), B = Math.ceil(y1 * dpr);
  const W = rot ? B - T : R - L, H = rot ? R - L : B - T;
  cv.width = Math.max(1, W); cv.height = Math.max(1, H);
  const ctx = cv.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  // (A filter on the whole label (the glowing labels with the frosted glass off) applies to its picture as one: it is drawn on a
  // scratch canvas first and laid down through the filter, its lengths in device px.)
  let c = ctx, tmp = null;
  if (d.filter) { tmp = document.createElement('canvas'); tmp.width = cv.width; tmp.height = cv.height; c = tmp.getContext('2d'); }
  // (The label's own px to the picture's: scaled, then moved so its extent starts at 0; turned, the label's x runs up the picture.)
  if (rot) c.setTransform(0, -dpr, dpr, 0, -T, R);
  else c.setTransform(dpr, 0, 0, dpr, -L, -T);
  for (const p of d.parts) {
    if (p.k === 'rect') {
      c.save();
      if (p.filter) c.filter = p.filter.replace(/(-?[\d.]+)px/g, (_, v) => `${(+v * dpr).toFixed(3)}px`);
      roundRect(c, p.x, p.y, p.w, p.h, p.rx);
      const fill = () => { if (p.fill) { c.fillStyle = p.fill; c.fill(); } };
      const stroke = () => { if (p.stroke && p.sw > 0) { c.strokeStyle = p.stroke; c.lineWidth = p.sw; c.stroke(); } };
      if (p.strokeFirst) { stroke(); fill(); } else { fill(); stroke(); }
      c.restore();
      continue;
    }
    for (const q of lines.find((l) => l.p === p).runs) {
      const r = q.r;
      c.font = r.font;
      if ('letterSpacing' in c) c.letterSpacing = `${r.ls}px`;
      c.textBaseline = 'alphabetic'; c.textAlign = 'left';
      const stroke = () => { if (r.stroke && r.sw > 0) { c.strokeStyle = r.stroke; c.lineWidth = r.sw; c.lineJoin = r.join || 'miter'; c.miterLimit = 4; for (const s of q.pieces) c.strokeText(s.t, q.x + s.x, p.y); } };
      const fill = () => { if (r.fill) { c.fillStyle = r.fill; for (const s of q.pieces) c.fillText(s.t, q.x + s.x, p.y); } };
      if (r.strokeFirst) { stroke(); fill(); } else { fill(); stroke(); }
    }
  }
  if (tmp) {
    ctx.filter = d.filter.replace(/(-?[\d.]+)px/g, (_, v) => `${(+v * dpr).toFixed(3)}px`);
    ctx.drawImage(tmp, 0, 0);
    ctx.filter = 'none';
  }
  return rot ? { ox: T, oy: -R, w: cv.width, h: cv.height } : { ox: L, oy: T, w: cv.width, h: cv.height };
}

/**
 * The GPU's label layer: a WebGL2 canvas laid over `svg` (the #labels layer, which it follows: its inline style, the dive's zoom and
 * fades included, is copied over), drawing the label groups under `blocks`. Null without a usable WebGL2.
 *   sync(list): the labels as stage.js laid them out this frame, [{ g, x, y, rot }] (x, y: the group's origin, stage px).
 */
export function createLabelGL(svg, blocks, { software = false, off = false, marks = [] } = {}) {
  if (off || software || typeof WebGL2RenderingContext === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.id = 'labelGl'; canvas.setAttribute('aria-hidden', 'true');
  let gl = null;
  try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, failIfMajorPerformanceCaveat: true }); } catch { gl = null; }
  if (!gl) return null;
  // A picture turned on the GPU, sampled smoothly: only for what is soft anyway (the FibroScan's blurred beam), never for words.
  const RVS = `#version 300 es
uniform vec2 uView, uP, uS;   // the pivot (device px), the picture's size (device px)
uniform vec2 uO;              // the pivot's place in the picture (device px)
uniform float uAng;
out vec2 vUV;
const vec2 Q[4] = vec2[4](vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0));
void main() {
  vec2 l = Q[gl_VertexID] * uS - uO, c = vec2(cos(uAng), sin(uAng));
  vec2 p = uP + vec2(l.x * c.x - l.y * c.y, l.x * c.y + l.y * c.x);
  vUV = Q[gl_VertexID];
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
}`;
  const RFS = `#version 300 es
precision highp float;
uniform sampler2D uT;
uniform float uA;
in vec2 vUV;
out vec4 o;
void main() { o = texture(uT, vUV) * uA; }`;
  // All four programs are started before any is read, so the driver compiles them side by side (gl-compile.js).
  const hp = startProgram(gl, VS, FS), hm = startProgram(gl, MVS, MFS), hr = startProgram(gl, RVS, RFS), ha = startProgram(gl, AVS, AFS, [['aR', 0], ['aT', 1]]);
  let prog, mprog, rprog, aprog;
  try { prog = checkProgram(gl, hp); mprog = checkProgram(gl, hm); rprog = checkProgram(gl, hr); aprog = checkProgram(gl, ha); } catch { return null; }
  const U = Object.fromEntries(['uR', 'uView', 'uT', 'uA'].map((k) => [k, gl.getUniformLocation(prog, k)]));
  const MU = Object.fromEntries(['uBox', 'uView', 'uKind', 'uGeo', 'uW', 'uDash', 'uStroke', 'uFill', 'uA', 'uT0', 'uT1', 'uT2', 'uG', 'uS0', 'uS1', 'uS2', 'uSO', 'uR4'].map((k) => [k, gl.getUniformLocation(mprog, k)]));
  const RU = Object.fromEntries(['uView', 'uP', 'uS', 'uO', 'uAng', 'uT', 'uA'].map((k) => [k, gl.getUniformLocation(rprog, k)]));
  const vao = gl.createVertexArray();
  // The atlas: pages of pictures (each a square texture, at most two), and the instance list drawn from them.
  const AU = Object.fromEntries(['uView', 'uT'].map((k) => [k, gl.getUniformLocation(aprog, k)]));
  const packer = createAtlasPacker({ size: Math.min(2048, gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048), pad: 2, maxPages: 2 });
  const pageTex = [];
  const avao = gl.createVertexArray(), abuf = gl.createBuffer();
  gl.bindVertexArray(avao); gl.bindBuffer(gl.ARRAY_BUFFER, abuf);
  for (const [loc, off] of [[0, 0], [1, 16]]) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 32, off); gl.vertexAttribDivisor(loc, 1); }
  gl.bindVertexArray(null);
  let inst = new Float32Array(64 * 8), needRepack = false;
  const pageOf = (n) => {
    if (pageTex[n]) return pageTex[n];
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, packer.size, packer.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return (pageTex[n] = t);
  };
  svg.after(canvas);
  let lost = false, dpr = 1, W = 1, H = 1, last = [], raf = 0;
  const sprites = new WeakMap();   // group → { key, tex, ox, oy, w, h }
  const live = new Map();          // group → until (ms): a fade, an ease or a hover is running, its look read each frame
  const dirty = new Set();
  const scratch = document.createElement('canvas');
  // The label layer's inline style (the dive's zoom and fade, its visibility) is the canvas's too; its classes' rules are in app.css.
  const copyStyle = () => { const w = canvas.style.width, h = canvas.style.height; canvas.style.cssText = svg.style.cssText; canvas.style.width = w; canvas.style.height = h; };
  new MutationObserver(copyStyle).observe(svg, { attributes: true, attributeFilter: ['style'] });
  // A label changed (its words, a class, a colour, its place in the list): its look is read again.
  const labelOf = (n) => (n.nodeType === 1 ? n : n.parentElement)?.closest?.('.lb');
  // (Not its transform: where it stands comes with sync, every frame of a pan, and asks for no new picture. A write that changed
  // nothing (classList.add of a class it has) is passed over.)
  const changed = (r) => r.type !== 'attributes' || r.oldValue !== r.target.getAttribute(r.attributeName);
  // (The layer's own group: its text scale, --lbk, sets the halos' width: every label.)
  const take = (rs) => { for (const r of rs) { if (!changed(r)) continue; if (r.target === blocks && r.type === 'attributes') { for (const s of last) dirty.add(s.g); continue; } const g = labelOf(r.target); if (g) dirty.add(g); } };
  const mo = new MutationObserver((rs) => { take(rs); if (dirty.size) ask(); });
  mo.observe(blocks, { subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style', 'x', 'y', 'dx', 'width', 'height', 'rx', 'fill', 'font-size', 'font-weight', 'letter-spacing', 'text-anchor'] });
  // Anything outside them that can change how they look (the theme, the glass setting, the text size, a mode's class): every label.
  const all = () => { for (const s of last) { dirty.add(s.g); live.set(s.g, performance.now() + 700); } allMarks(); ask(); };
  const outer = new MutationObserver((rs) => { if (rs.some(changed)) all(); });
  for (let el = svg.parentElement; el; el = el.parentElement) outer.observe(el, { attributes: true, attributeOldValue: true, attributeFilter: ['class', 'data-theme', 'data-noglass', 'data-mode'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', all);
  addEventListener('pps:labelscale', all);   // (the text size: --label-k on the page)
  // A CSS fade or colour ease, a hover (its colour comes with no class), a focus: that label is read each frame till it ends.
  const hold = (ev, ms = 700) => { const g = labelOf(ev.target); if (g) { dirty.add(g); live.set(g, performance.now() + ms); ask(); } };
  for (const t of ['transitionrun', 'transitionend', 'transitioncancel', 'animationstart', 'animationend', 'animationcancel', 'pointerover', 'pointerout', 'focusin', 'focusout']) blocks.addEventListener(t, (ev) => hold(ev), true);
  // The leaders and their dots (marks: their layers, the leaders' and the FibroScan callout's): read as the labels are.
  const looks = new WeakMap(), markLive = new Map(), markDirty = new Set();
  const markOf = (n) => { const el = n.nodeType === 1 ? n : n.parentElement; return marks.includes(el) ? el : marks.includes(el?.parentElement) ? el : null; };
  const mmo = new MutationObserver((rs) => { for (const r of rs) { if (!changed(r)) continue; const el = markOf(r.target); if (el) markDirty.add(el); } ask(); });
  for (const root of marks) {
    mmo.observe(root, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style'] });
    for (const t of ['transitionrun', 'transitionend', 'transitioncancel', 'animationstart', 'animationend', 'animationcancel']) root.addEventListener(t, (ev) => { const el = markOf(ev.target); if (el) { markDirty.add(el); markLive.set(el, performance.now() + 800); ask(); } }, true);
  }
  const allMarks = () => { const t = performance.now() + 700; for (const root of marks) { markDirty.add(root); markLive.set(root, t); for (const el of root.children) { markDirty.add(el); markLive.set(el, t); } } };
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); lost = true;
    for (const s of last) s.g.removeAttribute('data-gl');
    for (const root of marks) for (const el of root.children) el.removeAttribute('data-gl');
    probe?.removeAttribute('data-gl'); scanEl?.removeAttribute('data-gl');
  });
  function size() {
    const r = svg.parentElement.getBoundingClientRect(), k = devicePixelRatio || 1;   // (the stage's box: the dive zooms the layer itself)
    const w = Math.max(1, Math.round(r.width * k)), h = Math.max(1, Math.round(r.height * k));
    if (w === W && h === H && k === dpr) return false;
    W = w; H = h; dpr = k; canvas.width = w; canvas.height = h;
    // (Exactly one canvas pixel per device pixel: a canvas scaled even a little would be filtered, and the words soften.)
    canvas.style.width = `${w / k}px`; canvas.style.height = `${h / k}px`;
    for (const s of last) dirty.add(s.g);
    return true;
  }
  new ResizeObserver(() => { if (size()) ask(); }).observe(svg.parentElement);
  matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener?.('change', () => { size(); ask(); });
  size();
  function ask() { if (!raf && !lost) raf = nextFrame(() => { raf = 0; draw(); }); }
  // A label's state, read again when its look may have changed: 'gl' (its picture, drawn again only when its look changed), 'svg'
  // (the SVG draws it) or 'none' (it shows nothing).
  function refresh(g, rot) {
    let st = sprites.get(g);
    if (!st) { st = { mode: 'none', key: '', slot: null }; sprites.set(g, st); }
    const d = describeBlock(g);
    st.mode = !d ? 'none' : svgOnly(d) ? 'svg' : 'gl';
    if (st.mode !== 'gl') return st;
    const key = lookKey(d, rot, dpr);
    if (st.key !== key) {
      const at = drawBlock(scratch, d, dpr, rot);
      if (!at) { st.mode = 'none'; return st; }
      // (Its place in the atlas: kept while the picture stays the same size, else given back and found again. Only this rectangle is uploaded.)
      if (st.slot && (st.slot.w !== scratch.width || st.slot.h !== scratch.height)) { packer.free(st.slot); st.slot = null; }
      if (!st.slot) st.slot = packer.alloc(scratch.width, scratch.height);
      if (!st.slot) { needRepack = true; st.mode = 'svg'; st.key = ''; return st; }   // (the pages are full: the SVG draws it till they are packed again)
      gl.bindTexture(gl.TEXTURE_2D, pageOf(st.slot.page));
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, st.slot.x, st.slot.y, gl.RGBA, gl.UNSIGNED_BYTE, scratch);
      Object.assign(st, at, { key });
    }
    st.opacity = d.opacity;
    return st;
  }
  // The pages were full: every picture is given back and drawn again, packed afresh (at most one such frame in a while).
  function repack() {
    needRepack = false;
    packer.reset();
    for (const s of last) { const st = sprites.get(s.g); if (st) { st.slot = null; st.key = ''; } dirty.add(s.g); }
    ask();
  }
  function draw() {
    if (lost || gl.isContextLost()) return;
    const now = performance.now();
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(prog); gl.bindVertexArray(vao);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform2f(U.uView, W, H); gl.uniform1i(U.uT, 0); gl.activeTexture(gl.TEXTURE0);
    let moving = drawProbe(now);
    moving = drawMarks(now) || moving;
    // (Every label's box and atlas place, in painter order; drawn below as one batch per run of pictures on a page.)
    const items = [];
    for (const s of last) {
      const { g } = s;
      const until = live.get(g);
      if (until != null && until < now) { live.delete(g); dirty.add(g); }   // (read once more as it ends)
      if (live.has(g)) moving = true;
      let st = sprites.get(g);
      if (!st || dirty.has(g) || live.has(g) || st.rot !== !!s.rot) { st = refresh(g, !!s.rot); st.rot = !!s.rot; }
      // (Marked in the same frame as the picture is drawn, so neither the SVG's copy and the picture both show, nor neither.)
      if (st.mode !== 'gl') { if (g.hasAttribute('data-gl')) g.removeAttribute('data-gl'); continue; }
      if (!g.hasAttribute('data-gl')) g.setAttribute('data-gl', '');
      if (!(st.opacity > 0.001)) continue;
      // (The label's origin on a whole device pixel, the picture at its offset from it.)
      const x = Math.round(s.x * dpr) + st.ox, y = Math.round(s.y * dpr) + st.oy;
      if (x > W || y > H || x + st.w < 0 || y + st.h < 0) continue;
      items.push({ page: st.slot.page, x, y, w: st.w, h: st.h, ax: st.slot.x, ay: st.slot.y, a: Math.min(1, st.opacity) });
    }
    if (items.length) {
      if (inst.length < items.length * 8) inst = new Float32Array(Math.max(items.length * 8, inst.length * 2));
      items.forEach((it, i) => inst.set([it.x, it.y, it.w, it.h, it.ax, it.ay, it.a, 0], i * 8));
      gl.useProgram(aprog); gl.bindVertexArray(avao);
      gl.uniform2f(AU.uView, W, H); gl.uniform1i(AU.uT, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, abuf);
      gl.bufferData(gl.ARRAY_BUFFER, inst.subarray(0, items.length * 8), gl.DYNAMIC_DRAW);
      for (const run of batchRuns(items)) {
        gl.bindTexture(gl.TEXTURE_2D, pageOf(run.page));
        // (WebGL2 has no first-instance argument: the run's start is the attributes' byte offset.)
        gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, run.from * 32); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, run.from * 32 + 16);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, run.to - run.from);
      }
      gl.bindVertexArray(vao);
    }
    dirty.clear();
    moving = drawScan(now) || moving;   // (the FibroScan probe over the labels, as its layer lay)
    if (needRepack) repack();
    if (moving) ask();
  }
  // A mark's look, read again while it may be changing.
  const lookOf = (el, now) => {
    let lk = looks.get(el);
    const until = markLive.get(el);
    if (until != null && until < now) { markLive.delete(el); markDirty.add(el); }
    if (!lk || markDirty.has(el) || markLive.has(el)) { lk = { st: el.tagName === 'g' ? { op: NUM(getComputedStyle(el).opacity) } : describeMark(el) }; looks.set(el, lk); }
    return lk.st;
  };
  function drawMarks(now) {
    let moving = false;
    if (!marks.length) return false;
    gl.useProgram(mprog);
    gl.uniform2f(MU.uView, W, H);
    for (const root of marks) {
      const ro = lookOf(root, now);
      if (markLive.has(root)) moving = true;
      for (const el of root.children) {
        const st = lookOf(el, now);
        if (markLive.has(el)) moving = true;
        let geo = null;
        if (st) {
          if (el.tagName === 'path') { const q = lineOf(el.getAttribute('d')); geo = q && q.map((v) => v * dpr); }
          else geo = [NUM(el.getAttribute('cx')) * dpr, NUM(el.getAttribute('cy')) * dpr, NUM(el.getAttribute('r')) * dpr, 0];
        }
        // (A mark this drawing cannot give stays the SVG's; one it draws is hidden there, in the same frame.)
        if (st === false || (st && !geo)) { if (el.hasAttribute('data-gl')) el.removeAttribute('data-gl'); continue; }
        if (!el.hasAttribute('data-gl')) el.setAttribute('data-gl', '');
        const a = (st?.op ?? 0) * (ro?.op ?? 1);
        if (!st || !(a > 0.001) || (!st.stroke && !st.fill)) continue;
        const w = st.stroke ? st.w * dpr : 0, m = w / 2 + 2;
        const box = el.tagName === 'path' ? [Math.min(geo[0], geo[2]) - m, Math.min(geo[1], geo[3]) - m, Math.max(geo[0], geo[2]) + m, Math.max(geo[1], geo[3]) + m]
          : [geo[0] - geo[2] - m, geo[1] - geo[2] - m, geo[0] + geo[2] + m, geo[1] + geo[2] + m];
        if (box[0] > W || box[1] > H || box[2] < 0 || box[3] < 0) continue;
        gl.uniform4f(MU.uBox, ...box);
        gl.uniform1i(MU.uKind, el.tagName === 'path' ? 0 : 1);
        gl.uniform4f(MU.uGeo, ...geo);
        gl.uniform1f(MU.uW, w);
        gl.uniform2f(MU.uDash, st.dash[0] * dpr, st.dash[1] * dpr);
        gl.uniform4f(MU.uStroke, ...(st.stroke || [0, 0, 0, 0]));
        gl.uniform4f(MU.uFill, ...(st.fill || [0, 0, 0, 0]));
        gl.uniform1f(MU.uA, Math.min(1, a));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }
    markDirty.clear();
    return moving;
  }
  // ── The Doppler probe (stage.js dprobePaint draws it into its own SVG, the model, as before; dop-probe.js) ──
  // Its marks are drawn here as shapes (the faded beam a triangle with its gradient, the lines with their round ends, black rim under
  // white line), and its head as a small picture drawn at its angle and size (again only when either changes), under the leaders and
  // labels as the SVG lay. Its look (colours, widths, fades) is read from its elements while one may be changing.
  let probe = null, pLook = null, pDirty = true, pLive = 0;
  const pmo = new MutationObserver((rs) => { if (rs.some((r) => r.attributeName === 'class' && changed(r))) pDirty = true; ask(); });
  const holdProbe = () => { pDirty = true; pLive = performance.now() + 800; ask(); };
  const headCv = document.createElement('canvas');
  let headSp = null;
  function setProbe(el) {
    if (probe === el) return;
    probe = el; pDirty = true;
    pmo.disconnect();
    if (!el) return;
    pmo.observe(el, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style', 'transform', 'd'] });
    for (const t of ['transitionrun', 'transitionend', 'transitioncancel', 'animationstart', 'animationend']) el.addEventListener(t, holdProbe, true);
  }
  const stroke = (el) => { const c = getComputedStyle(el); return { col: none(c.stroke) ? null : rgba(c.stroke), w: NUM(c.strokeWidth), cap: c.strokeLinecap, raw: c.stroke, fill: c.fill, join: c.strokeLinejoin }; };
  function probeLookRead(el) {
    const q = (k) => el.querySelector(k);
    // (A stop's colour times its stop-opacity, premultiplied.)
    const stops = [...el.querySelectorAll('stop')].map((st) => {
      const c = getComputedStyle(st), [r, g, b, k] = rgba(c.stopColor), a = NUM(c.stopOpacity) * k, u = k > 0 ? a / k : 0;
      return [NUM(st.getAttribute('offset')), [r * u, g * u, b * u, a]];
    });
    const head = q('.dpr-head');
    return {
      op: NUM(getComputedStyle(el).opacity), headOp: head ? NUM(getComputedStyle(head).opacity) : 0, stops,
      rimL: stroke(q('.dpr-rim-l')), line: stroke(q('.dpr-line')), gateRim: stroke(q('.dpr-gate-rim')), gate: stroke(q('.dpr-gate')),
      head: ['.dpr-rim', '.dpr-body', '.dpr-face', '.dpr-light'].map((k) => { const e = q(k), c = getComputedStyle(e); return { d: e.getAttribute('d'), circle: e.tagName === 'circle' ? [NUM(e.getAttribute('cx')), NUM(e.getAttribute('cy')), NUM(e.getAttribute('r'))] : null, fill: none(c.fill) ? '' : c.fill, stroke: none(c.stroke) ? '' : c.stroke, w: NUM(c.strokeWidth), join: c.strokeLinejoin }; }),
    };
  }
  // A path of straight pieces ("M x y L x y …") as its segments; a closed three-point one as its triangle.
  const segsOf = (d) => { const out = [], re = /M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*L\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/g; let m; while ((m = re.exec(d || ''))) out.push([+m[1], +m[2], +m[3], +m[4]]); return out; };
  const triOf = (d) => { const n = (d || '').match(/-?[\d.]+/g)?.map(Number); return n?.length === 6 ? [[n[0], n[1]], [n[2], n[3]], [n[4], n[5]]] : null; };
  function drawProbe(now) {
    if (!probe?.isConnected) return false;
    if (pDirty || now < pLive || !pLook) { pLook = probeLookRead(probe); pDirty = false; }
    const live = now < pLive;
    if (!probe.hasAttribute('data-gl')) probe.setAttribute('data-gl', '');
    const L = pLook;
    if (!(L.op > 0.001)) return live;
    const tm = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(probe.style.transform || ''), rm = /rotate\((-?[\d.]+)\)/.exec(probe.querySelector('.dpr-rot')?.getAttribute('transform') || '');
    if (!tm) return live;
    const gx = +tm[1], gy = +tm[2], ang = rm ? +rm[1] : 0, ca = Math.cos(ang * Math.PI / 180), sa = Math.sin(ang * Math.PI / 180);
    const at = (x, y) => [(gx + x * ca - y * sa) * dpr, (gy + x * sa + y * ca) * dpr];
    const seg = (q, st) => {
      if (!st.col || !(st.w > 0)) return;
      const [x0, y0] = at(q[0], q[1]), [x1, y1] = at(q[2], q[3]), w = st.w * dpr, m = w / 2 + 2;
      gl.uniform1i(MU.uKind, st.cap === 'round' ? 2 : 0);
      gl.uniform4f(MU.uBox, Math.min(x0, x1) - m, Math.min(y0, y1) - m, Math.max(x0, x1) + m, Math.max(y0, y1) + m);
      gl.uniform4f(MU.uGeo, x0, y0, x1, y1); gl.uniform1f(MU.uW, w); gl.uniform2f(MU.uDash, 0, 0);
      gl.uniform4f(MU.uStroke, ...st.col); gl.uniform1f(MU.uA, Math.min(1, L.op));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    gl.useProgram(mprog);
    gl.uniform2f(MU.uView, W, H);
    // The faded beam: its gradient runs across the wedge's box from its right edge (the probe's face) to its left (past the far wall).
    const tri = triOf(probe.querySelector('.dpr-wedge')?.getAttribute('d'));
    if (tri && L.stops.length === 3) {
      const xs = tri.map((p) => p[0]), T = tri.map((p) => at(p[0], p[1])), g0 = at(Math.max(...xs), 0), g1 = at(Math.min(...xs), 0);
      gl.uniform1i(MU.uKind, 3);
      gl.uniform4f(MU.uBox, Math.min(...T.map((p) => p[0])) - 2, Math.min(...T.map((p) => p[1])) - 2, Math.max(...T.map((p) => p[0])) + 2, Math.max(...T.map((p) => p[1])) + 2);
      gl.uniform2f(MU.uT0, ...T[0]); gl.uniform2f(MU.uT1, ...T[1]); gl.uniform2f(MU.uT2, ...T[2]);
      gl.uniform4f(MU.uG, ...g0, ...g1);
      gl.uniform4f(MU.uS0, ...L.stops[0][1]); gl.uniform4f(MU.uS1, ...L.stops[1][1]); gl.uniform4f(MU.uS2, ...L.stops[2][1]);
      gl.uniform3f(MU.uSO, L.stops[0][0], L.stops[1][0], L.stops[2][0]);
      gl.uniform1f(MU.uA, Math.min(1, L.op));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    // Rim under line, the line of sight, then the flow axis, then the gate's bars on top (dop-probe.js PROBE_SVG's order).
    const beam = segsOf(probe.querySelector('.dpr-beam')?.getAttribute('d')), axis = segsOf(probe.querySelector('.dpr-axis')?.getAttribute('d')), bars = segsOf(probe.querySelector('.dpr-bars')?.getAttribute('d'));
    for (const q of beam) seg(q, L.rimL);
    for (const q of beam) seg(q, L.line);
    for (const q of axis) seg(q, L.rimL);
    for (const q of axis) seg(q, L.line);
    for (const q of bars) seg(q, L.gateRim);
    for (const q of bars) seg(q, L.gate);
    // The head: its picture at its angle and size, drawn again only when either (or its look) changes.
    const hm = /translate\((-?[\d.]+)[\s,]+(-?[\d.]+)\)\s*scale\((-?[\d.]+)\)/.exec(probe.querySelector('.dpr-head')?.getAttribute('transform') || '');
    if (hm && L.headOp > 0.001) {
      const D = +hm[1], k = +hm[3], key = JSON.stringify([L.head, ang.toFixed(2), k, dpr]);
      if (!headSp || headSp.key !== key) {
        // (Its box: the body's −3 … 48 along it, ±11 across, grown for the rim, turned with it.)
        const pts = [[-5, -14], [50, -14], [-5, 14], [50, 14]].map(([u, v]) => [(u * ca - v * sa) * k * dpr, (u * sa + v * ca) * k * dpr]);
        const x0 = Math.floor(Math.min(...pts.map((p) => p[0]))), y0 = Math.floor(Math.min(...pts.map((p) => p[1]))), x1 = Math.ceil(Math.max(...pts.map((p) => p[0]))), y1 = Math.ceil(Math.max(...pts.map((p) => p[1])));
        headCv.width = Math.max(1, x1 - x0); headCv.height = Math.max(1, y1 - y0);
        const c = headCv.getContext('2d');
        c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, headCv.width, headCv.height);
        c.setTransform(ca * k * dpr, sa * k * dpr, -sa * k * dpr, ca * k * dpr, -x0, -y0);
        for (const h of L.head) {
          const path = h.circle ? (() => { const p2 = new Path2D(); p2.arc(h.circle[0], h.circle[1], h.circle[2], 0, Math.PI * 2); return p2; })() : new Path2D(h.d);
          if (h.fill) { c.fillStyle = h.fill; c.fill(path); }
          if (h.stroke && h.w > 0) { c.strokeStyle = h.stroke; c.lineWidth = h.w; c.lineJoin = h.join || 'miter'; c.stroke(path); }
        }
        headSp ||= { tex: gl.createTexture() };
        gl.bindTexture(gl.TEXTURE_2D, headSp.tex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, headCv);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        Object.assign(headSp, { key, ox: x0, oy: y0, w: headCv.width, h: headCv.height });
      }
      const [hx, hy] = at(D, 0);
      gl.useProgram(prog);
      gl.uniform2f(U.uView, W, H); gl.uniform1i(U.uT, 0);
      gl.bindTexture(gl.TEXTURE_2D, headSp.tex);
      gl.uniform4f(U.uR, Math.round(hx) + headSp.ox, Math.round(hy) + headSp.oy, headSp.w, headSp.h); gl.uniform1f(U.uA, Math.min(1, L.op * L.headOp));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    return live;
  }
  // ── The FibroScan probe (stage.js scanPaint and scanTick write its SVGs, the model, as before) ──
  // Over the labels, as its layer lay. Its beam (blurred) is a picture drawn once and turned here; its waves are arcs and its cable a
  // line, drawn as shapes each frame; its body, screen and reading a picture drawn at its angle (again only when that or the reading
  // changes); the tip, which taps, a rounded rectangle at its place each frame.
  let scanEl = null, sLook = null, sDirty = true, sLive = 0, beamSp = null, sHeadSp = null;
  // (The waves' opacities and the probe's place change every frame and are read as it draws: they ask for a frame, not a new look.)
  const smo = new MutationObserver((rs) => { if (rs.some((r) => changed(r) && r.target !== scanEl && !r.target.closest?.('.sp-waves'))) sDirty = true; ask(); });
  const holdScan = () => { sDirty = true; sLive = performance.now() + 900; ask(); };
  const beamCv = document.createElement('canvas'), sHeadCv = document.createElement('canvas');
  function setScan(el) {
    if (scanEl === el) return;
    scanEl?.removeAttribute('data-gl');
    scanEl = el; sDirty = true; beamSp = null; sHeadSp = null;
    smo.disconnect();
    ask();
    if (!el) return;
    smo.observe(el, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style'], characterData: true, childList: true });
    for (const t of ['transitionrun', 'transitionend', 'transitioncancel', 'animationstart', 'animationend', 'animationcancel']) el.addEventListener(t, holdScan, true);
  }
  const angOf = (t) => { const m = /matrix\(([^)]+)\)/.exec(t || ''); if (!m) return 0; const v = m[1].split(',').map(Number); return Math.atan2(v[1], v[0]); };
  function scanLookRead(el) {
    const q = (k) => el.querySelector(k), cs = (e) => getComputedStyle(e);
    const svgs = el.querySelectorAll(':scope > svg'), beam = q('.sp-beam'), body = q('.sp-body'), tip = q('.sp-tip'), screen = q('.sp-screen'), cable = q('.sp-cable'), read = q('.sp-read');
    if (svgs.length !== 2 || !beam || !body || !tip || !screen || !read) return null;
    const bc = cs(beam), stops = [...el.querySelectorAll('#sp-beam stop')].map((st) => { const c = cs(st); return [NUM(st.getAttribute('offset')), c.stopColor, NUM(c.stopOpacity)]; });
    const rect = (e) => { const c = cs(e); return { x: NUM(e.getAttribute('x')), y: NUM(e.getAttribute('y')), w: NUM(e.getAttribute('width')), h: NUM(e.getAttribute('height')), rx: NUM(e.getAttribute('rx')), fill: none(c.fill) ? '' : c.fill, stroke: none(c.stroke) ? '' : c.stroke, sw: NUM(c.strokeWidth) }; };
    const runs = [...read.children].map((sp) => { const r = cs(sp); return { t: sp.textContent, dx: NUM(sp.getAttribute('dx')), font: `${r.fontWeight} ${r.fontSize} ${r.fontFamily}`, size: NUM(r.fontSize), ls: 0, tnum: /tabular-nums/.test(r.fontVariantNumeric), fill: none(r.fill) ? '' : r.fill }; });
    const cc = cs(cable), wave = (k) => { const e = q(k); if (!e) return null; const c = cs(e); return { col: rgba(c.stroke), so: NUM(c.strokeOpacity), w: NUM(c.strokeWidth) }; };
    return {
      op: NUM(cs(el).opacity), ang: angOf(cs(svgs[1]).transform), headOp: NUM(cs(q('.sp-head')).opacity), cableOp: NUM(cc.opacity),
      beam: { d: beam.getAttribute('d'), filter: bc.filter === 'none' ? '' : bc.filter, stops, grad: ['cx', 'cy', 'r'].map((k) => NUM(el.querySelector('#sp-beam').getAttribute(k))) },
      body: rect(body), screen: rect(screen), tip: rect(tip), tipX: (() => { const m = /matrix\(([^)]+)\)/.exec(cs(tip).transform); return m ? Number(m[1].split(',')[4]) : 0; })(),
      read: { x: NUM(read.getAttribute('x')), y: NUM(read.getAttribute('y')), anchor: read.getAttribute('text-anchor') || 'start', runs },
      cable: { d: cable.getAttribute('d'), col: none(cc.stroke) ? null : rgba(cc.stroke), w: NUM(cc.strokeWidth), cap: cc.strokeLinecap },
      rip: wave('.sp-rip'), front: wave('.sp-front'),
    };
  }
  const PIV = [66, 48];   // (the tip: the point the probe turns about, in its SVGs' own px; stage.js SCAN_TIP)
  function drawScan(now) {
    if (!scanEl?.isConnected) return false;
    if (sDirty || !sLook) { sLook = scanLookRead(scanEl); sDirty = false; }
    else if (now < sLive) {
      // (While something eases (the turn, a fade, the tip's tap) only what moves is read again, each frame.)
      const q = (k) => scanEl.querySelector(k), cs = (e) => getComputedStyle(e), m = /matrix\(([^)]+)\)/.exec(cs(q('.sp-tip')).transform);
      Object.assign(sLook, { op: NUM(cs(scanEl).opacity), ang: angOf(cs(scanEl.querySelectorAll(':scope > svg')[1]).transform), headOp: NUM(cs(q('.sp-head')).opacity), cableOp: NUM(cs(q('.sp-cable')).opacity), tipX: m ? Number(m[1].split(',')[4]) : 0 });
    }
    const live = now < sLive, L = sLook;
    if (!L || !canvasCaps().filter) { if (scanEl.hasAttribute('data-gl')) scanEl.removeAttribute('data-gl'); return live; }
    if (!scanEl.hasAttribute('data-gl')) scanEl.setAttribute('data-gl', '');
    if (!(L.op > 0.001)) return live;
    const tm = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(scanEl.style.transform || '');
    if (!tm) return live;
    // (Its box stands at the written place, raised by half its height (app.css translate: 0 −50%); its SVGs turn about the tip.)
    const px = +tm[1] + PIV[0], py = +tm[2], ca = Math.cos(L.ang), sa = Math.sin(L.ang);
    const at = (u, v) => [(px + (u - PIV[0]) * ca - (v - PIV[1]) * sa) * dpr, (py + (u - PIV[0]) * sa + (v - PIV[1]) * ca) * dpr];
    // The beam: drawn once, unturned, through its own filter, then turned here (it is soft through and through).
    const bkey = JSON.stringify([L.beam, dpr]);
    if (!beamSp || beamSp.key !== bkey) {
      const m = filterReach(L.beam.filter) + 4, x0 = 66 - m, y0 = -24 - m, x1 = 216 + m, y1 = 120 + m;   // (the beam's path: the tip, out to its 150 px arc)
      beamCv.width = Math.ceil((x1 - x0) * dpr); beamCv.height = Math.ceil((y1 - y0) * dpr);
      const c = beamCv.getContext('2d');
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, beamCv.width, beamCv.height);
      c.setTransform(dpr, 0, 0, dpr, -x0 * dpr, -y0 * dpr);
      const [gx, gy, gr] = L.beam.grad, g = c.createRadialGradient(gx, gy, 0, gx, gy, gr);
      for (const [o, col, a] of L.beam.stops) { const [r, gg, b, k] = rgba(col); const u = k > 0 ? 1 / k : 0; g.addColorStop(o, `rgba(${Math.round(r * u * 255)}, ${Math.round(gg * u * 255)}, ${Math.round(b * u * 255)}, ${a * k})`); }
      if (L.beam.filter) c.filter = L.beam.filter.replace(/(-?[\d.]+)px/g, (_, v) => `${(+v * dpr).toFixed(3)}px`);
      c.fillStyle = g; c.fill(new Path2D(L.beam.d));
      c.filter = 'none';
      beamSp ||= { tex: gl.createTexture() };
      gl.bindTexture(gl.TEXTURE_2D, beamSp.tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, beamCv);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      Object.assign(beamSp, { key: bkey, w: beamCv.width, h: beamCv.height, o: [(PIV[0] - x0) * dpr, (PIV[1] - y0) * dpr] });
    }
    gl.useProgram(rprog);
    gl.uniform2f(RU.uView, W, H); gl.uniform2f(RU.uP, px * dpr, py * dpr); gl.uniform2f(RU.uS, beamSp.w, beamSp.h); gl.uniform2f(RU.uO, ...beamSp.o);
    gl.uniform1f(RU.uAng, L.ang); gl.uniform1i(RU.uT, 0); gl.uniform1f(RU.uA, Math.min(1, L.op));
    gl.bindTexture(gl.TEXTURE_2D, beamSp.tex);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // The waves: each packet's arcs (read off the SVG every frame, where scanTick writes them), at the packet's opacity.
    gl.useProgram(mprog);
    gl.uniform2f(MU.uView, W, H);
    for (const pk of scanEl.querySelectorAll('.sp-waves > g')) {
      const po = NUM(pk.style.opacity === '' ? '1' : pk.style.opacity);
      if (!(po > 0.001)) continue;
      for (const path of pk.children) {
        const n = (path.getAttribute('d') || '').match(/-?[\d.]+/g)?.map(Number);
        if (!n || n.length < 9) continue;
        const st = path.classList.contains('sp-front') ? L.front : L.rip;
        if (!st) continue;
        const r = n[2], a0 = Math.atan2(n[1] - PIV[1], n[0] - PIV[0]) + L.ang, a1 = Math.atan2(n[8] - PIV[1], n[7] - PIV[0]) + L.ang, [cx, cy] = at(PIV[0], PIV[1]), R = r * dpr, w = st.w * dpr;
        gl.uniform1i(MU.uKind, 4);
        gl.uniform4f(MU.uBox, cx - R - w - 2, cy - R - w - 2, cx + R + w + 2, cy + R + w + 2);
        gl.uniform4f(MU.uGeo, cx, cy, R, 0); gl.uniform4f(MU.uR4, a0, a1 < a0 ? a1 + Math.PI * 2 : a1, 0, 0); gl.uniform1f(MU.uW, w);
        gl.uniform4f(MU.uStroke, ...st.col.map((v) => v * st.so)); gl.uniform1f(MU.uA, Math.min(1, L.op * po));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }
    // The cable's short stub (a straight line written as a curve), round-ended, fading with the head.
    const cn = (L.cable.d || '').match(/-?[\d.]+/g)?.map(Number);
    if (cn?.length >= 4 && L.cable.col && L.cableOp > 0.001) {
      const [x0, y0] = at(cn[0], cn[1]), [x1, y1] = at(cn[cn.length - 2], cn[cn.length - 1]), w = L.cable.w * dpr, m = w / 2 + 2;
      gl.uniform1i(MU.uKind, L.cable.cap === 'round' ? 2 : 0);
      gl.uniform4f(MU.uBox, Math.min(x0, x1) - m, Math.min(y0, y1) - m, Math.max(x0, x1) + m, Math.max(y0, y1) + m);
      gl.uniform4f(MU.uGeo, x0, y0, x1, y1); gl.uniform1f(MU.uW, w); gl.uniform2f(MU.uDash, 0, 0);
      gl.uniform4f(MU.uStroke, ...L.cable.col); gl.uniform1f(MU.uA, Math.min(1, L.op * L.cableOp));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    if (L.headOp > 0.001) {
      // The body, its screen and the reading: a picture at the probe's angle, drawn again when that or the reading changes.
      const hkey = JSON.stringify([L.body, L.screen, L.read, L.ang.toFixed(4), dpr]);
      if (!sHeadSp || sHeadSp.key !== hkey) {
        const pts = [[-14, 31], [62, 31], [-14, 65], [62, 65]].map(([u, v]) => [((u - PIV[0]) * ca - (v - PIV[1]) * sa) * dpr, ((u - PIV[0]) * sa + (v - PIV[1]) * ca) * dpr]);
        const x0 = Math.floor(Math.min(...pts.map((p) => p[0]))), y0 = Math.floor(Math.min(...pts.map((p) => p[1]))), x1 = Math.ceil(Math.max(...pts.map((p) => p[0]))), y1 = Math.ceil(Math.max(...pts.map((p) => p[1])));
        sHeadCv.width = Math.max(1, x1 - x0); sHeadCv.height = Math.max(1, y1 - y0);
        const c = sHeadCv.getContext('2d');
        c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, sHeadCv.width, sHeadCv.height);
        c.setTransform(ca * dpr, sa * dpr, -sa * dpr, ca * dpr, -x0, -y0);
        c.translate(-PIV[0], -PIV[1]);
        for (const b of [L.body, L.screen]) {
          roundRect(c, b.x, b.y, b.w, b.h, b.rx);
          if (b.fill) { c.fillStyle = b.fill; c.fill(); }
          if (b.stroke && b.sw > 0) { c.strokeStyle = b.stroke; c.lineWidth = b.sw; c.stroke(); }
        }
        const rs = L.read.runs.map((r) => ({ r, ...runPieces(c, r) }));
        let w = 0; rs.forEach((q, i) => { w += (i ? q.r.dx : 0) + q.w; });
        let x = L.read.anchor === 'middle' ? L.read.x - w / 2 : L.read.anchor === 'end' ? L.read.x - w : L.read.x;
        rs.forEach((q, i) => {
          if (i) x += q.r.dx;
          c.font = q.r.font; c.textBaseline = 'alphabetic'; c.textAlign = 'left';
          if (q.r.fill) { c.fillStyle = q.r.fill; for (const sp of q.pieces) c.fillText(sp.t, x + sp.x, L.read.y); }
          x += q.w;
        });
        sHeadSp ||= { tex: gl.createTexture() };
        gl.bindTexture(gl.TEXTURE_2D, sHeadSp.tex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sHeadCv);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        Object.assign(sHeadSp, { key: hkey, ox: x0, oy: y0, w: sHeadCv.width, h: sHeadCv.height });
      }
      gl.useProgram(prog);
      gl.uniform2f(U.uView, W, H); gl.uniform1i(U.uT, 0);
      gl.bindTexture(gl.TEXTURE_2D, sHeadSp.tex);
      gl.uniform4f(U.uR, Math.round(px * dpr) + sHeadSp.ox, Math.round(py * dpr) + sHeadSp.oy, sHeadSp.w, sHeadSp.h); gl.uniform1f(U.uA, Math.min(1, L.op * L.headOp));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      // The tip, over the body, at its tap's place along the probe.
      const t = L.tip;
      if (t.fill) {
        const [cx, cy] = at(t.x + t.w / 2 + L.tipX, t.y + t.h / 2);
        gl.useProgram(mprog);
        gl.uniform2f(MU.uView, W, H);
        gl.uniform1i(MU.uKind, 5);
        const R = Math.hypot(t.w, t.h) / 2 * dpr + 2;
        gl.uniform4f(MU.uBox, cx - R, cy - R, cx + R, cy + R);
        gl.uniform4f(MU.uGeo, cx, cy, t.w / 2 * dpr, t.h / 2 * dpr); gl.uniform1f(MU.uW, Math.min(t.rx, t.w / 2, t.h / 2) * dpr); gl.uniform4f(MU.uR4, L.ang, 0, 0, 0);
        gl.uniform4f(MU.uFill, ...rgba(t.fill)); gl.uniform1f(MU.uA, Math.min(1, L.op * L.headOp));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }
    return live;
  }
  return {
    canvas,
    setProbe,
    setScan,
    /** Draws now (a mark the stage just moved, outside a label layout: the probe's ease). */
    redraw() { if (!lost) { if (raf) { cancelFrame(raf); raf = 0; } draw(); } },
    get lost() { return lost; },
    /** This frame's labels: drawn now, in the same frame as the SVG's layout. */
    sync(list) {
      if (lost) return;
      if ((devicePixelRatio || 1) !== dpr) size();   // (moved to a screen of another density)
      take(mo.takeRecords());
      for (const r of mmo.takeRecords()) { if (!changed(r)) continue; const el = markOf(r.target); if (el) markDirty.add(el); }
      const was = new Set(last.map((s) => s.g));
      last = list;
      for (const s of list) was.delete(s.g);
      for (const g of was) { g.removeAttribute('data-gl'); const st = sprites.get(g); if (st) { packer.free(st.slot); sprites.delete(g); } live.delete(g); }
      if (raf) { cancelFrame(raf); raf = 0; }
      draw();
    },
    /** A label animated by script (the Web Animations API, which sends no events): read each frame for `ms`. */
    hold(g, ms) {
      if (!g) return;
      if (markOf(g)) { markDirty.add(g); markLive.set(g, performance.now() + ms + 100); } else { dirty.add(g); live.set(g, performance.now() + ms + 100); }
      ask();
    },
  };
}
