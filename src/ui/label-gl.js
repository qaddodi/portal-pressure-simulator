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

import { frameFor, cancelFrame } from './frame.js?v=7710f677e2';
import { classOnly, GESTURE_LOOK } from './idle-keys.js?v=81fbedda6b';
import { startProgram, checkProgram, publishWhenDone } from './gl-compile.js?v=e48e05cdb3';
import { createAtlasPacker, batchRuns } from './atlas-pack.js?v=43b8bc019d';
import { easeMove, D_SURFACE } from './ease.js?v=fc509dabe4';
import { createShapeGL, flattenPath, polyMesh, ellipsePoly } from './shape-gl.js?v=f7d920b7d0';
import { createOrganPaint, parseColor, mul } from './organ-paint.js?v=1c406a11a6';
import { textPolys, textWidth, loadGlyphs, glyphsReady } from './text-gl.js?v=b384a10c15';
import { trackOf, trackAt, mixColour, timingOf, progressAt, keysOf } from './label-track.js?v=56dc51edb3';

// (1 Nov 2026, the GPU motion review.) A label's or a leader's fade or colour ease is followed from its animations (label-track.js), and its
// style read off the frame (styleOf): nothing on the page is read in a frame. ?atlasidle=0: a full atlas is packed again at once, mid-move,
// and its second page made only when a picture first needs it, as before.
const SEARCH = typeof location !== 'undefined' ? location.search || '' : '';
const TRACK = true, ATLAS_IDLE = !/[?&]atlasidle=0\b/.test(SEARCH);

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
uniform int uKind;          // 0: a line (butt ends), 1: a circle, 2: a line with round ends, 3: a triangle filled with a linear gradient,
                            // 4: an arc, 5: a turned rounded rectangle, 6: a box with its own radius at each corner,
                            // 7: a soft sector (the FibroScan beam) filled with a two-stop radial gradient, its edges blurred
                            // 8: a rounded box's drop shadow (blurred), 9: a rectangle's outline (a focus ring)
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
// erf, to within 0.0002 (Winitzki).
float erf1(float x) { float x2 = x * x, k = 0.147 * x2; return sign(x) * sqrt(1.0 - exp(-x2 * (1.27323954 + k) / (1.0 + k))); }
void main() {
  vec2 p = vec2(gl_FragCoord.x, uView.y - gl_FragCoord.y);
  if (uKind == 8) {
    // A drop shadow: the rounded box (centre uGeo.xy, half sizes uGeo.zw, corner radius uW) blurred by a Gaussian of standard deviation
    // uDash.x, in its colour uFill (premultiplied, the box's own opacity in it), as CSS's drop-shadow() casts it.
    vec2 b = abs(p - uGeo.xy) - uGeo.zw + uW;
    float dist = length(max(b, 0.0)) + min(max(b.x, b.y), 0.0) - uW;
    float c = uDash.x > 0.25 ? 0.5 - 0.5 * erf1(dist / (1.41421356 * uDash.x)) : clamp(0.5 - dist, 0.0, 1.0);
    o = uFill * c * uA;
    return;
  }
  if (uKind == 9) {
    // A rectangle's outline (uGeo: left, top, right, bottom of its stroke's middle; uW wide), square cornered, as an outline is drawn.
    float h = uW * 0.5;
    float outer = span(p.x, uGeo.x - h, uGeo.z + h) * span(p.y, uGeo.y - h, uGeo.w + h);
    float inner = span(p.x, uGeo.x + h, uGeo.z - h) * span(p.y, uGeo.y + h, uGeo.w - h);
    o = uStroke * max(outer - inner, 0.0) * uA;
    return;
  }
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
  if (uKind == 7) {
    // A sector from its apex uGeo.xy, radius uGeo.z, about direction uR4.x (radians, y down) by half angle uR4.y, as a Gaussian blur of
    // sigma uW (device px) blurs it: each edge's share is the blur's normal curve (a logistic fit) across it, a product of the three
    // (two straight sides and the arc). Coloured by a radial gradient from uR4.zw over radius uGeo.w, its stops uS0, uS1 at uSO.xy.
    vec2 q = p - uGeo.xy, dir = vec2(cos(uR4.x), sin(uR4.x));
    vec2 n1 = vec2(cos(uR4.x - uR4.y - 1.5707963), sin(uR4.x - uR4.y - 1.5707963)), n2 = vec2(cos(uR4.x + uR4.y + 1.5707963), sin(uR4.x + uR4.y + 1.5707963));
    float sg = max(uW, 0.5) / 1.702;
    float c = 1.0 / (1.0 + exp(dot(q, n1) / sg));
    c *= 1.0 / (1.0 + exp(dot(q, n2) / sg));
    c *= 1.0 / (1.0 + exp((length(q) - uGeo.z) / sg));
    if (dot(q, dir) < -3.0 * max(uW, 0.5)) c = 0.0;
    float t = clamp(length(p - uR4.zw) / max(uGeo.w, 1e-6), 0.0, 1.0);
    vec4 col = mix(uS0, uS1, clamp((t - uSO.x) / max(uSO.y - uSO.x, 1e-6), 0.0, 1.0));
    o = col * c * uA;
    return;
  }
  if (uKind == 6) {
    // A box with a radius of its own at each corner (uR4: top left, top right, bottom right, bottom left), from its top left uGeo.xy, its
    // size uGeo.zw (device px): a frosted glass's shape, which the labels leave out (setHoles).
    vec2 c = p - uGeo.xy - uGeo.zw * 0.5;
    float r = c.x < 0.0 ? (c.y < 0.0 ? uR4.x : uR4.w) : (c.y < 0.0 ? uR4.y : uR4.z);
    r = min(r, min(uGeo.z, uGeo.w) * 0.5);
    vec2 q = abs(c) - uGeo.zw * 0.5 + r;
    float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
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
  if (!m) {
    // (A colour-mix() is computed as color(srgb r g b / a), each 0 … 1.)
    const k = /color\(srgb\s+([^)]+)\)/.exec(c || '');
    if (!k) return [0, 0, 0, 0];
    const v = k[1].split(/[\s/]+/).filter(Boolean).map(Number), a = v.length > 3 ? v[3] : 1;
    return [v[0] * a, v[1] * a, v[2] * a, a];
  }
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
  let focused;
  try { focused = g.matches(':focus-visible'); } catch { focused = g === document.activeElement; }
  if (focused && !GPU_FOCUS) return { svg: 'focus' };
  const d = { opacity: NUM(gs.opacity), filter: gs.filter === 'none' ? '' : gs.filter, parts: [] };
  // (Focused from the keyboard: its ring, as the page's styles give it (an outline round the label's box, eased in by focus-ring.js), is
  // drawn into its picture; the label's own parts take their focus colours from the page's styles as any other state's. Read each frame
  // while it eases: focusin holds it live.)
  if (focused) {
    const w = NUM(gs.outlineWidth);
    if (gs.outlineStyle && gs.outlineStyle !== 'none' && w > 0 && !none(gs.outlineColor)) {
      let b;
      try { const bb = g.getBBox(); b = [bb.x, bb.y, bb.width, bb.height]; } catch { b = null; }
      if (!b) return { svg: 'focus' };
      d.ring = { w, color: gs.outlineColor, off: NUM(gs.outlineOffset), box: b.map((v) => +v.toFixed(2)) };
    }
  }
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
  // (Read off the 2D context's prototype: no canvas made to ask.)
  const P = typeof CanvasRenderingContext2D !== 'undefined' ? CanvasRenderingContext2D.prototype : {};
  caps = { ls: 'letterSpacing' in P, filter: 'filter' in P };
  return caps;
}
/** Why the SVG must draw this description itself ('' when the GPU can). */
export function svgOnly(d, cap = canvasCaps()) {
  if (d.svg) return d.svg;
  // (A rect's drop shadows are drawn by the GPU, under its picture (shadowsOf, shadowBox); any other filter, or one on the whole label
  // (none in the stylesheet), is the SVG's. Nothing is drawn through a canvas filter. ?labelfx=0: every filter is the SVG's.)
  if (d.filter || d.parts.some((p) => p.filter && !(LABEL_FX && p.k === 'rect' && shadowsOf(p.filter)))) return 'filter';
  // (Without the canvas's own letter spacing, each letter is set by hand at the SVG's place for it: runPieces.)
  if (!cap.ls && !LABEL_FX && d.parts.some((p) => p.runs?.some((r) => r.ls))) return 'letter-spacing';
  return '';
}
// ?labelfx=0: a label with a filter or letter spacing the canvas lacks, or a keyboard focus, is drawn by the SVG, as before.
const LABEL_FX = !(typeof location !== 'undefined' && /[?&]labelfx=0\b/.test(location.search || ''));
const GPU_FOCUS = LABEL_FX;
// A filter's functions, split at the top level: 'drop-shadow(<colour> 0px 1px 1.5px) blur(2px)' → ['drop-shadow(...)', 'blur(2px)'].
function filterFns(f) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of f) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) { if (cur) out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
/** A filter made only of drop shadows, as [{ x, y, blur, color }] (px; blur the CSS standard deviation), or null for any other. */
export function shadowsOf(f) {
  if (!f) return null;
  const out = [];
  for (const fn of filterFns(f.trim())) {
    const m = /^drop-shadow\((.*)\)$/.exec(fn);
    if (!m) return null;
    // (Its colour and two or three lengths, in any order the browser writes them: lengths in px, the colour whatever is left.)
    const toks = filterFns(m[1]), lens = [], col = [];
    for (const t of toks) { const n = /^(-?[\d.]+)(px)?$/.exec(t); if (n && (n[2] || +n[1] === 0)) lens.push(+n[1]); else col.push(t); }
    if (lens.length < 2 || lens.length > 3) return null;
    out.push({ x: lens[0], y: lens[1], blur: lens[2] || 0, color: col.join(' ') || 'black' });
  }
  return out.length ? out : null;
}
// The widths of a run, digit by digit as the SVG sets them with tabular figures (every digit as wide as a zero, centred in it),
// the rest as the font sets them, so the run is as wide as the labels' own measure (stage.js textW) and the SVG's.
function runPieces(ctx, r) {
  ctx.font = r.font;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${r.ls}px`;
  else if (r.ls && LABEL_FX) return spacedPieces(ctx, r);
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

// Letter spacing set by hand (a canvas without its own): each letter where the SVG sets it, the run's width up to it (kerning kept) and
// the spacing after each letter before it; tabular digits as wide as a zero, centred in it, as above.
function spacedPieces(ctx, r) {
  const out = [], zero = r.tnum ? ctx.measureText('0').width : 0;
  let x = 0;
  for (const m of (r.tnum ? r.t.match(/\d|\D+/g) : [r.t]) || []) {
    if (r.tnum && /\d/.test(m)) { const w = ctx.measureText(m).width; out.push({ t: m, x: x + (zero - w) / 2 }); x += zero + r.ls; continue; }
    const ch = Array.from(m);
    let pre = '';
    for (let i = 0; i < ch.length; i++) { out.push({ t: ch[i], x: x + ctx.measureText(pre).width + i * r.ls }); pre += ch[i]; }
    x += ctx.measureText(m).width + ch.length * r.ls;
  }
  return { pieces: out, w: x };
}
/** A rounded rectangle as one closed polyline (its corners' quarter circles cut fine enough for a probe's body at any zoom). */
export function roundRectPoly(x, y, w, h, r) {
  r = Math.max(0, Math.min(r || 0, w / 2, h / 2));
  const out = [], n = r > 0 ? 8 : 0;
  const corner = (cx, cy, a0) => { if (!n) { out.push(cx, cy); return; } for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * Math.PI / 2; out.push(cx + r * Math.cos(a), cy + r * Math.sin(a)); } };
  corner(x + w - r, y + r, -Math.PI / 2); corner(x + w - r, y + h - r, 0); corner(x + r, y + h - r, Math.PI / 2); corner(x + r, y + r, Math.PI);
  return [{ pts: new Float32Array(out), closed: true }];
}
const roundRect = (ctx, x, y, w, h, r) => {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
};
// How far a filter's drop shadows and blurs reach (px): the picture is grown by that much.
// The FibroScan beam drawn by the shader as a soft sector (kind 7), not painted into a 2D picture through a CSS blur and uploaded.
// ?beamgl=0: the 2D picture, as before.
const BEAM_GL = !/[?&]beamgl=0\b/.test(SEARCH);
// A callout's shaped hole (the glass's outline the labels leave out) filled into its mask by the GPU's shape drawer (shape-gl.js), not
// painted on a 2D canvas and uploaded (the only way since 1 Nov: no 2D mask is made at all).
/** The beam's path (apex, a side, an arc of radius r to the other side) and its blur as a sector, in its own units, or null. */
export function beamSector({ d, filter }) {
  const n = String(d || '').match(/-?[\d.]+(?:e-?\d+)?/g)?.map(Number);
  if (!/^\s*M[^L]*L[^A]*A[^Z]*Z\s*$/i.test(String(d || '')) || !n || n.length !== 11) return null;
  const apex = [n[0], n[1]], e0 = [n[2], n[3]], e1 = [n[9], n[10]], r = n[4];
  const f = String(filter || '').trim(), bm = /^blur\(\s*([\d.]+)px\s*\)$/.exec(f);
  if (f && !bm) return null;
  const a0 = Math.atan2(e0[1] - apex[1], e0[0] - apex[0]), a1 = Math.atan2(e1[1] - apex[1], e1[0] - apex[0]);
  let h = (a1 - a0) / 2;
  if (h < 0) h += Math.PI;
  return { apex, r, dir: a0 + h, half: Math.abs(h), blur: bm ? +bm[1] : 0 };
}

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
    if (p.k === 'rect') { const m = p.sw / 2; grow(p.x - m, p.y - m, p.x + p.w + m, p.y + p.h + m); continue; }
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
  // Device px, the label's origin on a whole pixel (where the GPU puts it).
  const L = Math.floor(x0 * dpr), T = Math.floor(y0 * dpr), R = Math.ceil(x1 * dpr), B = Math.ceil(y1 * dpr);
  const W = rot ? B - T : R - L, H = rot ? R - L : B - T;
  // (A canvas already of this size is only cleared below: a value that ticks to another digit keeps its width, and setting the size again
  // frees the bitmap and allocates it afresh. Everything this draws sets what it reads, so nothing carries over from the last picture.)
  const cw = Math.max(1, W), ch = Math.max(1, H);
  if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
  const c = ctx0;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, cv.width, cv.height);
  // (The label's own px to the picture's: scaled, then moved so its extent starts at 0; turned, the label's x runs up the picture.)
  if (rot) c.setTransform(0, -dpr, dpr, 0, -T, R);
  else c.setTransform(dpr, 0, 0, dpr, -L, -T);
  // (A point of the label's own px in the picture's device px.)
  const at = (px, py) => (rot ? [dpr * py - T, R - dpr * px] : [dpr * px - L, dpr * py - T]);
  // A rect's drop shadows (the soft knockout under a value's paper) are not in the picture: each is a blurred rounded box the GPU draws
  // under it (shadowBox), so no canvas filter, shadow or scratch canvas makes them. Kept in the picture's device px.
  const shadows = [];
  for (const p of d.parts) {
    if (p.k === 'rect') {
      if (p.filter) {
        const fa = Math.max(rgba(p.fill)[3], p.sw > 0 ? rgba(p.stroke)[3] : 0);
        for (const sh of shadowsOf(p.filter) || []) {
          const col = rgba(sh.color);
          if (!(col[3] > 0) || !(fa > 0)) continue;
          const [cx, cy] = at(p.x + p.w / 2 + sh.x, p.y + p.h / 2 + sh.y), hw = (p.w / 2 + p.sw / 2) * dpr, hh = (p.h / 2 + p.sw / 2) * dpr;
          shadows.push({ cx, cy, hw: rot ? hh : hw, hh: rot ? hw : hh, r: Math.min(p.rx * dpr, hw, hh), sig: sh.blur * dpr, col: col.map((v) => v * fa) });
        }
      }
      c.save();
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
  return rot ? { ox: T, oy: -R, w: cv.width, h: cv.height, shadows, frame: [L, T, R, true] } : { ox: L, oy: T, w: cv.width, h: cv.height, shadows, frame: [L, T, R, false] };
}
/** A keyboard focus's ring, in the picture's device px (`frame`: drawBlock's), or null. It is not in the picture: a plain rectangle the GPU
 *  strokes over the label (the marks' shader, kind 9), its stroke centred outlineOffset + half its width out, as the browser draws an
 *  outline; so a focus, and its colour easing in, sends no picture. */
export function ringBox(d, dpr, frame) {
  if (!d?.ring || !frame) return null;
  const [L, T, R, rot] = frame, at = (px, py) => (rot ? [dpr * py - T, R - dpr * px] : [dpr * px - L, dpr * py - T]);
  const e = d.ring.off + d.ring.w / 2, [bx, by, bw, bh] = d.ring.box, p0 = at(bx - e, by - e), p1 = at(bx + bw + e, by + bh + e);
  return { x0: Math.min(p0[0], p1[0]), y0: Math.min(p0[1], p1[1]), x1: Math.max(p0[0], p1[0]), y1: Math.max(p0[1], p1[1]), w: d.ring.w * dpr, col: rgba(d.ring.color) };
}

/**
 * The GPU's label layer: a WebGL2 canvas laid over `svg` (the #labels layer, which it follows: its inline style, the dive's zoom and
 * fades included, is copied over), drawing the label groups under `blocks`. Null without a usable WebGL2.
 *   sync(list): the labels as stage.js laid them out this frame, [{ g, x, y, rot }] (x, y: the group's origin, stage px).
 * With `host` ({ gl, canvas, ask, now, active }: the vessel canvas, veins-gl top), no canvas of its own: the labels are drawn into the
 * host's, over the figure, each time it lays its picture (drawInto); ask() asks it to lay it again, now() lays it at once. While active() is false (the
 * figure's overlays not all on the GPU, the labels' layer fading or hidden), it draws nothing and the SVG shows every label.
 * `force`: on a software renderer too (CI's visual check, ?stageover=gpu).
 */
export function createLabelGL(svg, blocks, { software = false, off = false, marks = [], host = null, force = false, onBoxes = null } = {}) {
  if (off || (software && !force) || typeof WebGL2RenderingContext === 'undefined') return null;
  const canvas = host ? host.canvas : document.createElement('canvas');
  if (!host) { canvas.id = 'labelGl'; canvas.setAttribute('aria-hidden', 'true'); }
  let gl = host ? host.gl : null;
  if (!host) { try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, failIfMajorPerformanceCaveat: true }); } catch { gl = null; } }
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
  // The programs, the vertex arrays and the atlas's buffer: made now, and again when a lost context comes back (none of a context's
  // objects survives a loss). All four programs are started before any is read, so the driver compiles them side by side (gl-compile.js).
  let prog, mprog, rprog, aprog, U, MU, RU, AU, vao, avao, abuf;
  function start() {
    const hp = startProgram(gl, VS, FS), hm = startProgram(gl, MVS, MFS), hr = startProgram(gl, RVS, RFS), ha = startProgram(gl, AVS, AFS, [['aR', 0], ['aT', 1]]);
    return [hp, hm, hr, ha];
  }
  function finish([hp, hm, hr, ha]) {
    prog = checkProgram(gl, hp); mprog = checkProgram(gl, hm); rprog = checkProgram(gl, hr); aprog = checkProgram(gl, ha);
    U = Object.fromEntries(['uR', 'uView', 'uT', 'uA'].map((k) => [k, gl.getUniformLocation(prog, k)]));
    MU = Object.fromEntries(['uBox', 'uView', 'uKind', 'uGeo', 'uW', 'uDash', 'uStroke', 'uFill', 'uA', 'uT0', 'uT1', 'uT2', 'uG', 'uS0', 'uS1', 'uS2', 'uSO', 'uR4'].map((k) => [k, gl.getUniformLocation(mprog, k)]));
    RU = Object.fromEntries(['uView', 'uP', 'uS', 'uO', 'uAng', 'uT', 'uA'].map((k) => [k, gl.getUniformLocation(rprog, k)]));
    vao = gl.createVertexArray();
    // The atlas: pages of pictures (each a square texture, at most two), and the instance list drawn from them.
    AU = Object.fromEntries(['uView', 'uT'].map((k) => [k, gl.getUniformLocation(aprog, k)]));
    avao = gl.createVertexArray(); abuf = gl.createBuffer();
    gl.bindVertexArray(avao); gl.bindBuffer(gl.ARRAY_BUFFER, abuf);
    for (const [loc, off] of [[0, 0], [1, 16]]) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 32, off); gl.vertexAttribDivisor(loc, 1); }
    gl.bindVertexArray(null);
  }
  try { finish(start()); } catch { return null; }
  const packer = createAtlasPacker({ size: Math.min(2048, gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048), pad: 2, maxPages: 2 });
  const pageTex = [];
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
  if (!host) svg.after(canvas);
  let lost = false, dpr = 1, W = 1, H = 1, last = [], raf = 0;
  // A slide's camera glide (stage.js, ?labelride=0 off): the labels ride with the figure on the GPU instead of fading out for the whole
  // move. rideM maps where they were laid out (stage px) to where that point is now; each label's picture keeps its size, its centre
  // carried. At the landing they are laid out again, and each label glides from where it rode to its new place (one that stays), fades
  // in (a new one) or fades out where it rode (one that goes), over D_SURFACE on the app's curve: nothing jumps.
  let rideM = null, rideFrom = null, rideT0 = 0;
  const glides = new Map();   // group → { fx, fy (device px, where it rode), t0 } or { fadeIn: true, t0 }
  let outgoing = [];          // [{ g, st, x, y, a, t0 }]: labels gone at the landing, fading out where they rode
  const RIDE_MS = D_SURFACE;
  // (Host mode: whether a picture with the labels is owed to the host's canvas; whether the SVG was given every label back.)
  let owed = false, released = true;   // (at first the SVG shows every label: none is marked yet)
  // (Host mode: the labels and marks the SVG still draws, as of the last picture: what lies between the figure's canvas and the callouts'
  // glass, which is drawn into that canvas only where it crosses none of them; svgLeft.)
  const svgLeft = new Set();
  // (What the last picture drew, as boxes [left, top, right, bottom] in CSS px from the canvas's corner: each label's picture, each mark's,
  // the probes'. The figure's frosted glass is drawn under this canvas, so it is drawn only where it crosses none of them (stage.js
  // frostOver); onBoxes() is told when they change.)
  let boxes = [], boxKey = '', blank = false;
  const boxAt = (x0, y0, x1, y1) => boxes.push([x0 / dpr, y0 / dpr, x1 / dpr, y1 / dpr]);
  const sprites = new WeakMap();   // group → { key, tex, ox, oy, w, h }
  // ── Styles, read off the frame (1 Nov 2026: no layout or style read in a frame) ──
  // A label's or mark's computed style is kept by what decides it: each element's tag, classes, inline style and attributes, up to the
  // labels' SVG, its hover and keyboard focus, and the page's look (epoch: the theme, a mode, the text size). A picture is drawn from the
  // kept style; one not kept yet (a new class, a hover, a new theme) is read in a task of its own just after the frame (fillStyles), the
  // label keeping its last picture meanwhile, or the SVG drawing it for that one frame. An element whose style is easing as it is read
  // is kept for itself alone till its animations end (its eases are followed meanwhile: label-track.js), then read again at rest.
  const MISS = new Error('style not read yet');
  const STYLE_PROPS = ['display', 'opacity', 'filter', 'outlineStyle', 'outlineWidth', 'outlineColor', 'outlineOffset', 'fill', 'stroke', 'strokeWidth', 'paintOrder',
    'fontStyle', 'fontWeight', 'fontSize', 'fontFamily', 'letterSpacing', 'fontVariantNumeric', 'strokeLinejoin', 'strokeLinecap', 'strokeDasharray', 'strokeDashoffset'];
  const VOLATILE = new Set(['x', 'y', 'dx', 'dy', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'd', 'transform', 'data-gl', 'aria-label', 'tabindex', 'role']);
  let epoch = 0, fillT = 0;
  const snaps = new Map(), easing = new WeakMap(), unread = new Set(), waiting = new Set();
  function styleKey(el) {
    let k = String(epoch);
    for (let e = el; e; e = e.parentElement) {
      k += `|${e.tagName}`;
      if (e === svg) { k += `.${e.getAttribute('class') || ''}`; break; }
      for (const a of e.attributes) if (!VOLATILE.has(a.name)) k += ` ${a.name}=${a.value}`;
      if (e.classList?.contains('lb')) { try { k += `:${e.matches(':hover') ? 'h' : ''}${e.matches(':focus-visible') ? 'f' : ''}`; } catch { /* no state */ } }
    }
    return k;
  }
  function styleOf(el) {
    const k = styleKey(el), e = easing.get(el);
    if (e && e.key === k) return e.s;
    const s = snaps.get(k);
    if (s) return s;
    unread.add(el);
    if (!fillT) fillT = setTimeout(fillStyles, 0);
    throw MISS;
  }
  function fillStyles() {
    fillT = 0;
    const els = [...unread];
    unread.clear();
    for (const el of els) {
      if (!el.isConnected) continue;
      const k = styleKey(el);
      if (snaps.has(k) || easing.get(el)?.key === k) continue;
      const c = getComputedStyle(el), s = {};
      for (const p of STYLE_PROPS) s[p] = c[p];
      let anims;
      try { anims = el.getAnimations().filter((a) => a.playState !== 'finished' && a.playState !== 'idle'); } catch { anims = []; }
      if (!anims.length) { snaps.set(k, s); continue; }
      easing.set(el, { key: k, s });
      Promise.allSettled(anims.map((a) => a.finished)).then(() => { if (easing.get(el)?.key === k) easing.delete(el); unread.add(el); if (!fillT) fillT = setTimeout(fillStyles, 0); });
    }
    if (snaps.size > 2000) snaps.clear();
    // (The labels and marks that waited for these are read again at the next picture.)
    for (const el of waiting) { if (markOf(el)) markDirty.add(el); else dirty.add(el); }
    waiting.clear();
    ask();
  }
  const restyle = () => { epoch++; };
  // (A Map that only ever lengthens a label's time: a short event's 700 ms never cuts a held fade's longer one, e.g. a step's number waiting for its turn.)
  class Until extends Map { set(k, t) { return super.set(k, Math.max(t, this.get(k) || 0)); } }
  const live = new Until();          // group → until (ms): a fade, an ease or a hover is running, its look read each frame
  // (Of those, the ones read from the page each frame even with TRACK: a hover, a focus, the theme or a mode changing, whose look can change
  // through what no animation of the label's own shows. The rest, its own CSS fades and colour eases and script fades, are followed: label-track.js.)
  const exact = new Until();
  const dirty = new Set();
  const scratch = document.createElement('canvas');
  // The label layer's inline style (the dive's zoom and fade, its visibility) is the canvas's too; its classes' rules are in app.css.
  const copyStyle = () => { const w = canvas.style.width, h = canvas.style.height; canvas.style.cssText = svg.style.cssText; canvas.style.width = w; canvas.style.height = h; placeSoon(); };
  if (!host) new MutationObserver(copyStyle).observe(svg, { attributes: true, attributeFilter: ['style'] });
  // (Host mode: the layer's own fade or visibility changed (the dive's, a camera move's): whether the labels may be drawn over the
  // figure is asked again, at the next picture, and when its fade ends, so they come back onto the GPU once it has settled.)
  if (host) {
    new MutationObserver(() => check()).observe(svg, { attributes: true, attributeFilter: ['style', 'class'] });
    svg.addEventListener('transitionend', (e) => { if (e.target === svg) ask(); });
  }
  // A label changed (its words, a class, a colour, its place in the list): its look is read again.
  const labelOf = (n) => (n.nodeType === 1 ? n : n.parentElement)?.closest?.('.lb');
  // (Not its transform: where it stands comes with sync, every frame of a pan, and asks for no new picture. A write that changed
  // nothing (classList.add of a class it has) is passed over.)
  const changed = (r) => r.type !== 'attributes' || r.oldValue !== r.target.getAttribute(r.attributeName);
  // (The layer's own group: its text scale, --lbk, sets the halos' width: every label.)
  const take = (rs) => { for (const r of rs) { if (!changed(r)) continue; if (r.target === blocks && r.type === 'attributes') { restyle(); for (const s of last) dirty.add(s.g); continue; } const g = labelOf(r.target); if (g) dirty.add(g); } };
  const mo = new MutationObserver((rs) => { take(rs); if (dirty.size) ask(); });
  mo.observe(blocks, { subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style', 'x', 'y', 'dx', 'width', 'height', 'rx', 'fill', 'font-size', 'font-weight', 'letter-spacing', 'text-anchor'] });
  // Anything outside them that can change how they look (the theme, the glass setting, the text size, a mode's class): every label.
  const all = () => { restyle(); const t = performance.now() + 700; for (const s of last) { dirty.add(s.g); live.set(s.g, t); if (!TRACK) exact.set(s.g, t); } allMarks(); ask(); };
  // (Not for a gesture's own classes, which change no label's look (idle-keys.js GESTURE_LOOK): each one made every label and mark read
  // again on every frame for 0.7 s as a pan or pinch began and as it ended. 30 Oct, review G3.)
  const outer = new MutationObserver((rs) => { if (rs.some((r) => changed(r) && !classOnly(r, GESTURE_LOOK))) all(); });
  for (let el = svg.parentElement; el; el = el.parentElement) outer.observe(el, { attributes: true, attributeOldValue: true, attributeFilter: ['class', 'data-theme', 'data-palette', 'data-noglass', 'data-mode'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', all);
  addEventListener('pps:labelscale', all);   // (the text size: --label-k on the page)
  // A CSS fade or colour ease, a hover, a focus: that label's eases are followed till they end (its style read once, off the frame: styleOf).
  const hold = (ev, ms = 700) => { const g = labelOf(ev.target); if (g) { dirty.add(g); const t = performance.now() + ms; live.set(g, t); if (!TRACK) exact.set(g, t); ask(); } };
  for (const t of ['transitionrun', 'transitionend', 'transitioncancel', 'animationstart', 'animationend', 'animationcancel', 'pointerover', 'pointerout', 'focusin', 'focusout']) blocks.addEventListener(t, (ev) => hold(ev), true);
  // The leaders and their dots (marks: their layers, the leaders' and the FibroScan callout's): read as the labels are.
  const looks = new WeakMap(), markLive = new Until(), markDirty = new Set(), markExact = new Until();
  const markOf = (n) => { const el = n.nodeType === 1 ? n : n.parentElement; return marks.includes(el) ? el : marks.includes(el?.parentElement) ? el : null; };
  const mmo = new MutationObserver((rs) => { for (const r of rs) { if (!changed(r)) continue; const el = markOf(r.target); if (el) markDirty.add(el); } ask(); });
  for (const root of marks) {
    mmo.observe(root, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style'] });
    for (const t of ['transitionrun', 'transitionend', 'transitioncancel', 'animationstart', 'animationend', 'animationcancel']) root.addEventListener(t, (ev) => { const el = markOf(ev.target); if (el) { markDirty.add(el); markLive.set(el, performance.now() + 800); ask(); } }, true);
  }
  const allMarks = () => { const t = performance.now() + 700; for (const root of marks) { markDirty.add(root); markLive.set(root, t); if (!TRACK) markExact.set(root, t); for (const el of root.children) { markDirty.add(el); markLive.set(el, t); if (!TRACK) markExact.set(el, t); } } };
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); lost = true;
    for (const s of last) s.g.removeAttribute('data-gl');
    for (const root of marks) for (const el of root.children) el.removeAttribute('data-gl');
    probe?.removeAttribute('data-gl'); scanEl?.removeAttribute('data-gl');
  });
  // The context given back (iOS Safari returns to the page, or a GPU process restarts): the programs are started again at once and read
  // when the driver has finished them, at an idle moment, not in a frame (the SVG draws every label meanwhile, as in the loss). Then every
  // picture goes up again, packed afresh, and the layer is drawn: the labels, marks and probes are the GPU's again, in the same frame.
  // (Host mode has no restore of its own: the host owns the context and the layer is not made with one.)
  if (!host) canvas.addEventListener('webglcontextrestored', () => {
    let hs;
    try { hs = start(); } catch { return; }
    publishWhenDone(gl, hs, () => {
      if (!lost || gl.isContextLost()) return;   // (lost again: the next restore starts over)
      try { finish(hs); } catch { return; }   // (the shaders will not build: the SVG keeps every label)
      pageTex.length = 0; needRepack = false; packer.reset(); outgoing = []; glides.clear(); rideFrom = null;
      holeMasks = new WeakMap(); holeShape = null; picPaint = null; headSp = null; sHeadSp = null;
      for (const s of last) { const st = sprites.get(s.g); if (st) { st.slot = null; st.key = ''; } dirty.add(s.g); }
      pReadSoon(); sReadSoon(); allMarks(); boxKey = '';
      lost = false;
      ask();
    });
  });
  // (The host's canvas, sized by its owner at the screen's density: stage.js resizeCanvas. Read as each picture is laid: no layout.)
  function hostSize() {
    const k = devicePixelRatio || 1, w = canvas.width, h = canvas.height;
    if (w === W && h === H && k === dpr) return false;
    W = w; H = h; dpr = k;
    for (const s of last) dirty.add(s.g);
    return true;
  }
  // (Its own canvas: sized from the stage's box when that changes (the ResizeObserver below, and a change of screen density), never in a frame.)
  function size() {
    if (host) return hostSize();
    const r = svg.parentElement.getBoundingClientRect(), k = devicePixelRatio || 1;   // (the stage's box: the dive zooms the layer itself)
    const w = Math.max(1, Math.round(r.width * k)), h = Math.max(1, Math.round(r.height * k));
    if (w === W && h === H && k === dpr) return false;
    W = w; H = h; dpr = k; canvas.width = w; canvas.height = h;
    // (Exactly one canvas pixel per device pixel: a canvas scaled even a little would be filtered, and the words soften.)
    canvas.style.width = `${w / k}px`; canvas.style.height = `${h / k}px`;
    for (const s of last) dirty.add(s.g);
    return true;
  }
  // (Its callback runs once the page is laid out: the canvas's place read there costs no extra layout.)
  new ResizeObserver(() => { placeHoles(); if (size()) ask(); }).observe(svg.parentElement);
  matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener?.('change', () => { size(); ask(); });
  size();
  function ask() {
    if (lost) return;
    // (Given back to the SVG and still not to be drawn over the figure: no picture is laid again for them.)
    if (host) { if (released && !host.active()) return; owed = true; host.ask(); return; }
    if (!raf) raf = nextFrame(() => { raf = 0; draw(); });
  }
  // Host mode, whenever something that decides whether the labels may be drawn over the figure changed (stage.js watches it): drawn
  // there and not to be any more, the picture is laid again now, without them, and the SVG given them in the same task, so they never
  // show twice nor vanish for a frame; given back and now to be drawn there again, a picture with them is asked for.
  function check() {
    if (!host || lost) return;
    if (!released) { if (!host.active()) { host.now(); if (!released) release(); } return; }
    if (host.active()) ask();
  }
  // Every label, mark and the probes given back to the SVG (host mode, while the labels may not be drawn over the figure).
  function release() {
    for (const s of last) s.g.removeAttribute('data-gl');
    for (const root of marks) for (const el of root.children) el.removeAttribute('data-gl');
    probe?.removeAttribute('data-gl'); scanEl?.removeAttribute('data-gl');
    released = true;
  }
  // A label's state, read again when its look may have changed: 'gl' (its picture, drawn again only when its look changed), 'svg'
  // (the SVG draws it) or 'none' (it shows nothing).
  function refresh(g, rot, given = null) {
    let st = sprites.get(g);
    if (!st) { st = { mode: 'none', key: '', slot: null }; sprites.set(g, st); }
    let d;
    try { d = given || describeBlock(g, styleOf); } catch (e) {
      if (e !== MISS) throw e;
      // (Its style not read yet: its last picture stays, or the SVG draws it for this frame; read just after it, then drawn again.)
      waiting.add(g);
      if (st.mode !== 'gl' || !st.slot) st.mode = 'svg';
      return st;
    }
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
    st.ring = GPU_FOCUS ? ringBox(d, dpr, st.frame) : null;
    st.opacity = d.opacity;
    return st;
  }
  // A label whose animations are followed (TRACK): they are read once here (getAnimations: keyframes, timing, easing), with its look, and
  // each frame after works out its opacity and its colours from them, reading nothing (label-track.js). Its look is described with each
  // eased colour as a token, filled in per frame (fillLook). One that cannot be followed exactly is read each frame, as before (trk false).
  const TOK = '\u0001';
  const paintOk = (g) => (el) => (el.tagName === 'rect' && el.parentElement === g) || (el.tagName === 'tspan' && el.parentElement?.tagName === 'text' && el.parentElement.parentElement === g);
  function capture(g, rot, now) {
    let m;
    try { m = trackOf(g.getAnimations({ subtree: true }), g, paintOk(g), now); } catch { m = null; }
    let st;
    if (m?.paint) {
      const pairs = m.paint.pairs;
      const cs = (el) => {
        const c = styleOf(el), mine = [];
        pairs.forEach((q, i) => { if (q.el === el) mine.push([q.prop, TOK + i]); });
        return mine.length ? new Proxy(c, { get: (o, k) => { const hit = mine.find((x) => x[0] === k); return hit ? hit[1] : o[k]; } }) : c;
      };
      let base;
      try { base = describeBlock(g, cs); } catch (e) { if (e !== MISS) throw e; base = null; }
      if (base && !base.svg && base.parts) {
        m.base = base; m.w = trackAt(m, now).w;
        st = refresh(g, rot, fillLook(m, m.w));
      } else m = null;
    }
    if (!st) st = refresh(g, rot);
    if (!m || st.mode !== 'gl') { st.trk = false; return st; }
    if (m.end <= now) m.ended = true;
    st.trk = m;
    return st;
  }
  function fillLook(m, w) {
    const { pairs } = m.paint;
    const sub = (v) => { if (typeof v !== 'string' || v[0] !== TOK) return v; const q = pairs[+v.slice(1)], c = mixColour(q.from, q.to, w); return none(c) ? '' : c; };
    return { ...m.base, parts: m.base.parts.map((p) => (p.k === 'rect' ? { ...p, fill: sub(p.fill), stroke: sub(p.stroke) } : { ...p, runs: p.runs.map((r) => ({ ...r, fill: sub(r.fill), stroke: sub(r.stroke) })) })) };
  }
  // The pages were full: every picture is given back and drawn again, packed afresh (at most one such frame in a while).
  function repack() {
    needRepack = false;
    packer.reset(); outgoing = [];
    for (const s of last) { const st = sprites.get(s.g); if (st) { st.slot = null; st.key = ''; } dirty.add(s.g); }
    ask();
  }
  let reserveT = 0;
  function reserve() {
    if (reserveT) return;
    reserveT = setTimeout(() => {
      reserveT = 0;
      if (lost || gl.isContextLost() || pageTex[1]) return;
      const was = gl.getParameter(gl.TEXTURE_BINDING_2D);
      pageOf(1);
      gl.bindTexture(gl.TEXTURE_2D, was);
    }, 120);
  }
  // A drop shadow of a label's rect (kind 8), its centre at (x, y) device px; its reach is three standard deviations.
  function shadowBox(x, y, sh, a) {
    const m = sh.sig * 3 + 1, box = [x - sh.hw - m, y - sh.hh - m, x + sh.hw + m, y + sh.hh + m];
    if (box[0] > W || box[1] > H || box[2] < 0 || box[3] < 0) return;
    boxAt(...box);
    gl.uniform4f(MU.uBox, ...box); gl.uniform4f(MU.uGeo, x, y, sh.hw, sh.hh); gl.uniform1f(MU.uW, sh.r);
    gl.uniform2f(MU.uDash, sh.sig, 0); gl.uniform4f(MU.uFill, ...sh.col); gl.uniform1f(MU.uA, Math.min(1, a));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  // A keyboard focus's ring (kind 9) over the label's picture at (x, y) device px.
  function ringDraw(x, y, r, a) {
    const m = r.w / 2 + 1, box = [x + r.x0 - m, y + r.y0 - m, x + r.x1 + m, y + r.y1 + m];
    if (box[0] > W || box[1] > H || box[2] < 0 || box[3] < 0) return;
    boxAt(...box);
    gl.uniform4f(MU.uBox, ...box); gl.uniform4f(MU.uGeo, x + r.x0, y + r.y0, x + r.x1, y + r.y1); gl.uniform1f(MU.uW, r.w);
    gl.uniform4f(MU.uStroke, ...r.col); gl.uniform1f(MU.uA, Math.min(1, a));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  function draw() {
    if (lost || gl.isContextLost()) return;
    if (host) {
      owed = false;
      hostSize();
      if (!host.active()) { if (!released) release(); return; }
      if (released) { released = false; for (const s of last) dirty.add(s.g); allMarks(); pReadSoon(); sReadSoon(); }
    }
    svgLeft.clear();
    boxes = [];
    const now = performance.now();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    if (!host) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
    gl.useProgram(prog); gl.bindVertexArray(vao);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform2f(U.uView, W, H); gl.uniform1i(U.uT, 0); gl.activeTexture(gl.TEXTURE0);
    let moving = drawProbe(now);
    moving = drawMarks(now) || moving;
    // (Every label's box and atlas place, in painter order; drawn below as one batch per run of pictures on a page.)
    const items = [];
    // (The labels gone at a ride's landing first, under the rest, fading out where they rode; their pictures given back once faded.)
    if (outgoing.length) {
      const keep = [];
      for (const o of outgoing) {
        const u = easeMove(Math.min(1, (now - o.t0) / RIDE_MS));
        if (u >= 1 || !o.st.slot) { if (o.st.slot) packer.free(o.st.slot); continue; }
        keep.push(o); moving = true;
        if (o.x > W || o.y > H || o.x + o.st.w < 0 || o.y + o.st.h < 0) continue;
        items.push({ page: o.st.slot.page, x: o.x, y: o.y, w: o.st.w, h: o.st.h, ax: o.st.slot.x, ay: o.st.slot.y, a: o.a * (1 - u), st: o.st });
        boxAt(o.x, o.y, o.x + o.st.w, o.y + o.st.h);
      }
      outgoing = keep;
    }
    for (const s of last) {
      const { g } = s, rot = !!s.rot;
      const until = live.get(g);
      if (until != null && until < now) { live.delete(g); dirty.add(g); }   // (read once more as it ends)
      const ex = exact.get(g);
      if (ex != null && ex < now) exact.delete(g);
      let st = sprites.get(g);
      if (st?.trk && !st.trk.ended && now >= st.trk.end) { st.trk.ended = true; dirty.add(g); }   // (its animations over: read once more)
      const isLive = live.has(g);
      if (!st || dirty.has(g) || st.rot !== rot || (isLive && (exact.has(g) || !st.trk))) {
        const tracked = TRACK && isLive && !exact.has(g) && (!st || st.trk !== false || dirty.has(g) || st.rot !== rot);
        st = tracked ? capture(g, rot, now) : refresh(g, rot);
        if (!tracked) st.trk = isLive && st.trk === false ? false : null;
        st.rot = rot;
      }
      if (st.trk) {
        // (Followed: this frame's colours and opacity from the track, nothing read; a colour ease's picture drawn again only as it changes.)
        const v = trackAt(st.trk, now);
        if (st.trk.base && v.w !== st.trk.w) { st.trk.w = v.w; refresh(g, rot, fillLook(st.trk, v.w)); }
        if (v.op != null) st.opacity = v.op;
        if (st.trk.ended && !exact.has(g)) live.delete(g);
      }
      if (live.has(g)) moving = true;
      // (Marked in the same frame as the picture is drawn, so neither the SVG's copy and the picture both show, nor neither.)
      if (st.mode !== 'gl') { if (g.hasAttribute('data-gl')) g.removeAttribute('data-gl'); if (st.mode === 'svg') svgLeft.add(g); continue; }
      if (!g.hasAttribute('data-gl')) g.setAttribute('data-gl', '');
      if (!(st.opacity > 0.001)) continue;
      // (The label's origin on a whole device pixel, the picture at its offset from it.)
      let x = Math.round(s.x * dpr) + st.ox, y = Math.round(s.y * dpr) + st.oy, a = Math.min(1, st.opacity);
      if (rideM) {
        // (Riding: its centre carried by the camera's move since it was laid out, on a whole device pixel.)
        const cx = (x + st.w / 2) / dpr, cy = (y + st.h / 2) / dpr, M = rideM;
        x = Math.round((M[0] * cx + M[2] * cy + M[4]) * dpr - st.w / 2); y = Math.round((M[1] * cx + M[3] * cy + M[5]) * dpr - st.h / 2);
      } else {
        const gl0 = glides.get(g);
        if (gl0) {
          const u = easeMove(Math.min(1, (now - gl0.t0) / RIDE_MS));
          if (gl0.fadeIn) a *= u; else { x = Math.round(gl0.fx + (x - gl0.fx) * u); y = Math.round(gl0.fy + (y - gl0.fy) * u); }
          if (u >= 1) glides.delete(g); else moving = true;
        }
      }
      st.dx = x; st.dy = y; st.drawn = now;
      if (x > W || y > H || x + st.w < 0 || y + st.h < 0) continue;
      items.push({ page: st.slot.page, x, y, w: st.w, h: st.h, ax: st.slot.x, ay: st.slot.y, a, st });
      boxAt(x, y, x + st.w, y + st.h);
    }
    // (Under the pictures, their rects' drop shadows; over them, a keyboard focus's ring: shapes the GPU draws, not pixels in the pictures.)
    if (items.some((it) => it.st?.shadows?.length)) {
      gl.useProgram(mprog); gl.uniform2f(MU.uView, W, H); gl.uniform1i(MU.uKind, 8);
      for (const it of items) for (const sh of it.st?.shadows || []) shadowBox(it.x + sh.cx, it.y + sh.cy, sh, it.a);
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
    if (items.some((it) => it.st?.ring)) {
      gl.useProgram(mprog); gl.uniform2f(MU.uView, W, H); gl.uniform1i(MU.uKind, 9);
      for (const it of items) if (it.st?.ring) ringDraw(it.x, it.y, it.st.ring, it.a);
    }
    dirty.clear();
    moving = drawScan(now) || moving;   // (the FibroScan probe over the labels, as its layer lay)
    if (!host && holes.length) cutHoles();
    // (In the host's context: its state as its own passes expect to find it.)
    if (host) {
      gl.disable(gl.BLEND); gl.bindVertexArray(null); gl.useProgram(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    }
    // (ATLAS_IDLE: a full atlas is packed again once nothing moves, not mid-move, where every picture drawn again at once is a burst of
    // work in one frame; the labels that did not fit stay the SVG's till then. And the second page is made at rest, ahead of the first
    // picture that needs it, once the first is more than half full.)
    if (needRepack && (!ATLAS_IDLE || !moving)) repack();
    if (ATLAS_IDLE && !moving && !pageTex[1] && packer.maxPages > 1 && packer.used > packer.size * packer.size * 0.5) reserve();
    let key = '';
    for (const b of boxes) key += `${Math.floor(b[0])},${Math.floor(b[1])},${Math.ceil(b[2])},${Math.ceil(b[3])};`;
    if (key !== boxKey) { boxKey = key; try { onBoxes?.(); } catch { /* (a listener's failure is not the labels') */ } }
    // (Nothing drawn at all (every label, mark and probe has a box): the canvas is hidden, so the compositor does not blend a full-stage layer of
    // nothing over the figure on every frame the blood moves. It shows again in the task that draws the first thing back. app.css [data-blank].)
    if (!host) { const empty = boxes.length === 0; if (empty !== blank) { blank = empty; canvas.toggleAttribute('data-blank', empty); } }
    if (moving) ask();
  }
  // ── Holes (1 Nov 2026): the frosted glasses drawn in the figure's canvas, under this one (glass-gl.js onHoles) ──
  // The labels, marks and probes are left out under each, by its fade: what the browser's blur would show of them there is a faint smear.
  // A rounded box is cut as a shape (uKind 6); a callout's outline (its pointer included) from a mask drawn once from its path.
  let holes = [], holesKey = '';
  let holeMasks = new WeakMap();
  function holeMask(h) {
    const key = `${h.d}|${h.lw}|${h.lh}|${dpr}`;
    let m = holeMasks.get(h.el);
    if (m?.key === key) return m;
    const mw = Math.max(1, Math.ceil(h.lw * dpr)), mh = Math.max(1, Math.ceil(h.lh * dpr));
    return holeMaskGL(h, m, key, mw, mh);
  }
  // The shaped hole's mask on the GPU: the path's coverage (shape-gl's stencil fill, its edge smoothed) in every channel of a texture of
  // its own, laid as the 2D one was (its first row the path's top). The blend cutHoles set is set again after (the fill leaves it off).
  let holeShape = null;
  function holeMaskGL(h, m, key, mw, mh) {
    holeShape ||= createShapeGL(gl);
    if (!m?.fbo) {
      m = { tex: gl.createTexture(), fbo: gl.createFramebuffer(), st: gl.createRenderbuffer() };
      gl.bindTexture(gl.TEXTURE_2D, m.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    if (m.w !== mw || m.h !== mh) {
      gl.bindTexture(gl.TEXTURE_2D, m.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, mw, mh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindRenderbuffer(gl.RENDERBUFFER, m.st); gl.renderbufferStorage(gl.RENDERBUFFER, gl.STENCIL_INDEX8, mw, mh);
      gl.bindFramebuffer(gl.FRAMEBUFFER, m.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, m.tex, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.STENCIL_ATTACHMENT, gl.RENDERBUFFER, m.st);
      m.w = mw; m.h = mh;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, m.fbo);
    gl.viewport(0, 0, mw, mh);
    gl.disable(gl.BLEND);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]); gl.clearBufferfi(gl.DEPTH_STENCIL, 0, 1, 0);
    // (Path px → the target's y-down px, turned over so that its first row holds the path's top, as an uploaded canvas's does.)
    const mesh = polyMesh(flattenPath(h.d, Math.min(0.25, 0.2 / dpr)), 0);
    holeShape.fill(mesh, [dpr, 0, 0, -dpr, 0, mh], [mw, mh], [true, true, true, true]);
    holeShape.release(mesh);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    Object.assign(m, { key, sw: h.lw * dpr / mw, sh: h.lh * dpr / mh });
    holeMasks.set(h.el, m);
    return m;
  }
  // (The canvas's place on the page, read only when the page may have moved it: the stage laid out again (its resize, the window's), its own
  // style changing, a scroll (read in a task after it, once per burst). Never in a frame: a read there, after the stage has written that
  // frame's places, made the browser lay the page out again mid-frame.)
  let holeCr = { left: 0, top: 0 }, holeT = 0;
  function placeHoles() { if (!host) holeCr = canvas.getBoundingClientRect(); }
  function placeSoon() { if (!host && !holeT) holeT = setTimeout(() => { holeT = 0; placeHoles(); }, 0); }
  const holeOrigin = () => holeCr;
  if (!host) { addEventListener('resize', placeHoles); addEventListener('scroll', placeSoon, { capture: true, passive: true }); }
  function cutHoles() {
    const cr = holeOrigin();
    // (Each hole takes away what lies under it: the destination kept by one less the hole's cover.)
    gl.enable(gl.BLEND); gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    for (const h of holes) {
      if (!(h.a > 0.001) || !(h.w > 0) || !(h.h > 0)) continue;
      const x = (h.x - cr.left) * dpr, y = (h.y - cr.top) * dpr, w = h.w * dpr, hh = h.h * dpr;
      if (x > W || y > H || x + w < 0 || y + hh < 0) continue;
      if (h.d) {
        const m = holeMask(h);
        gl.useProgram(rprog); gl.bindVertexArray(vao);
        gl.uniform2f(RU.uView, W, H); gl.uniform2f(RU.uP, x, y); gl.uniform2f(RU.uS, w / m.sw, hh / m.sh); gl.uniform2f(RU.uO, 0, 0);
        gl.uniform1f(RU.uAng, 0); gl.uniform1i(RU.uT, 0); gl.uniform1f(RU.uA, h.a);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, m.tex);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      } else {
        gl.useProgram(mprog); gl.bindVertexArray(vao);
        gl.uniform2f(MU.uView, W, H);
        gl.uniform4f(MU.uBox, x - 1, y - 1, x + w + 1, y + hh + 1);
        gl.uniform1i(MU.uKind, 6);
        gl.uniform4f(MU.uGeo, x, y, w, hh);
        gl.uniform4f(MU.uR4, ...h.rad.map((r) => r * dpr));
        gl.uniform4f(MU.uFill, 1, 1, 1, 1);
        gl.uniform1f(MU.uA, h.a);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
  /** The glasses drawn in the figure's canvas now (client px boxes, their fades, their shapes): the labels leave them out, drawn again at
   *  once when they changed, so the labels and the glass change in the same frame. */
  function setHoles(list) {
    if (host || lost) return;
    let key = '';
    for (const h of list) key += `|${h.x},${h.y},${h.w},${h.h},${h.a},${h.d || h.rad},${h.lw},${h.lh}`;
    if (key === holesKey) return;
    holesKey = key; holes = list;
    if (raf) { cancelFrame(raf); raf = 0; }
    draw();
  }
  // A mark's look, read again while it may be changing.
  // (TRACK: a fade or colour ease of its own is read once as it starts and followed (label-track.js); a theme or mode change, each frame.)
  const lookOf = (el, now) => {
    let lk = looks.get(el);
    const until = markLive.get(el);
    if (until != null && until < now) { markLive.delete(el); markDirty.add(el); }
    const ex = markExact.get(el);
    if (ex != null && ex < now) markExact.delete(el);
    if (lk?.trk && !lk.trk.ended && now >= lk.trk.end) { lk.trk.ended = true; markDirty.add(el); }
    const isLive = markLive.has(el), exactly = markExact.has(el);
    if (!lk || markDirty.has(el) || (isLive && (exactly || !lk.trk))) {
      const tracked = TRACK && isLive && !exactly && (!lk || lk.trk !== false || markDirty.has(el));
      let st0;
      try { st0 = el.tagName === 'g' ? { op: NUM(styleOf(el).opacity) } : describeMark(el, styleOf); } catch (e) {
        if (e !== MISS) throw e;
        // (Its style not read yet: as it was, or the SVG's for this frame.)
        waiting.add(el); markDirty.delete(el);
        return lk ? (lk.cur || lk.st) : false;
      }
      lk = { st: st0, trk: tracked ? false : null };
      if (tracked && lk.st) {
        let m;
        try { m = trackOf(el.getAnimations(), el, (t) => t === el && el.tagName !== 'g', now); } catch { m = null; }
        if (m) { if (m.end <= now) m.ended = true; lk.trk = m; }
      }
      looks.set(el, lk);
    }
    if (!lk.trk || !lk.st) return lk.st;
    if (lk.trk.ended && !exactly) markLive.delete(el);
    const v = trackAt(lk.trk, now), out = lk.cur ||= { ...lk.st };
    if (v.op != null) out.op = v.op;
    if (lk.trk.paint) for (const q of lk.trk.paint.pairs) { const c = mixColour(q.from, q.to, v.w); out[q.prop] = none(c) ? null : rgba(c); }
    return out;
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
        if (st === false || (st && !geo)) { if (el.hasAttribute('data-gl')) el.removeAttribute('data-gl'); svgLeft.add(el); continue; }
        if (!el.hasAttribute('data-gl')) el.setAttribute('data-gl', '');
        const a = (st?.op ?? 0) * (ro?.op ?? 1);
        if (!st || !(a > 0.001) || (!st.stroke && !st.fill)) continue;
        const w = st.stroke ? st.w * dpr : 0, m = w / 2 + 2;
        const box = el.tagName === 'path' ? [Math.min(geo[0], geo[2]) - m, Math.min(geo[1], geo[3]) - m, Math.max(geo[0], geo[2]) + m, Math.max(geo[1], geo[3]) + m]
          : [geo[0] - geo[2] - m, geo[1] - geo[2] - m, geo[0] + geo[2] + m, geo[1] + geo[2] + m];
        if (box[0] > W || box[1] > H || box[2] < 0 || box[3] < 0) continue;
        // (A leader's boxes follow its line in short pieces: one box round a long slanted leader covered a card it never touched, and the
        // card's glass left the figure's canvas while the leader faded with the view, stage.js frostOver.)
        if (el.tagName === 'path') {
          const k = Math.max(1, Math.min(32, Math.ceil(Math.max(Math.abs(geo[2] - geo[0]), Math.abs(geo[3] - geo[1])) / (24 * dpr))));
          for (let i = 0; i < k; i++) {
            const ax = geo[0] + (geo[2] - geo[0]) * i / k, ay = geo[1] + (geo[3] - geo[1]) * i / k, bx = geo[0] + (geo[2] - geo[0]) * (i + 1) / k, by = geo[1] + (geo[3] - geo[1]) * (i + 1) / k;
            boxAt(Math.min(ax, bx) - m, Math.min(ay, by) - m, Math.max(ax, bx) + m, Math.max(ay, by) + m);
          }
        } else boxAt(...box);
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
  // A probe's eased values, read once as their animations start and run by the frame with no read of the page (label-track.js's
  // timing): `list` is [[element, CSS property, parse (keyframe value → number), set (number → the look)]]; each animation of that
  // property on that element is taken with its keyframes and clock. easeStep(tracks, now) sets each value where it stands and says
  // whether any still runs. A value whose animation cannot be followed exactly stays as last read (the read after its end corrects it).
  function easeCapture(list, now) {
    const out = [];
    for (const [el, prop, parse, set] of list) {
      if (!el) continue;
      for (const an of el.getAnimations?.() || []) {
        if (an.effect?.target !== el || an.effect.pseudoElement) continue;
        let kf;
        try { kf = an.effect.getKeyframes(); } catch { continue; }
        const keys = keysOf(kf, prop), t = keys && timingOf(an, now);
        if (!t) continue;
        const v = keys.map((k) => ({ o: k.o, ease: k.ease, v: parse(k.v) }));
        if (v.every((k) => Number.isFinite(k.v))) out.push({ t, keys: v, set, end: t.t0 + t.delay + t.dur });
      }
    }
    return out;
  }
  function easeStep(tracks, now) {
    let on = false;
    for (const k of tracks) {
      const p = progressAt(k.t, now);
      if (now < k.end) on = true;
      if (p == null) continue;
      let i = 0;
      while (i < k.keys.length - 2 && p >= k.keys[i + 1].o) i++;
      const a = k.keys[i], b = k.keys[i + 1], span = b.o - a.o, u = span > 0 ? a.ease(Math.min(1, Math.max(0, (p - a.o) / span))) : 1;
      k.set(a.v + (b.v - a.v) * u);
    }
    return on;
  }
  // A small picture (a probe's head) painted on the GPU: `ops` (organ-paint ops, their frames in the picture's px, y down) laid by the
  // organs' painter into a texture of its own, w × h, its first row the picture's top (as the labels' shader fetches it). The labels'
  // drawing state is set again after (the painter leaves its own).
  let picPaint = null;
  function picture(sp, w, h, ops) {
    picPaint ||= createOrganPaint(gl, createShapeGL(gl));
    if (!sp?.fbo) {
      sp = { tex: gl.createTexture(), fbo: gl.createFramebuffer() };
      gl.bindTexture(gl.TEXTURE_2D, sp.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    if (sp.w !== w || sp.h !== h) {
      gl.bindTexture(gl.TEXTURE_2D, sp.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, sp.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sp.tex, 0);
      sp.w = w; sp.h = h;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, sp.fbo);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
    // (Turned over: the painter's top row is the target's last, the labels' shader reads the first row as the top.)
    picPaint.paintGroupInto({ ops, opacity: 1, mask: null }, [1, 0, 0, -1, 0, h], w, h, sp.fbo, w, h);
    picPaint.endFrame();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.bindVertexArray(vao); gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    return sp;
  }
  // A shape's fill and stroke as the painter's ops (solid colours as the page computes them), the fill under the stroke as SVG lays them.
  function shapeOps(ops, geom, m, fill, stroke, sw) {
    const f = fill ? parseColor(fill) : null, k = stroke && sw > 0 ? parseColor(stroke) : null;
    if (f && f[3] > 0) ops.push({ geom, m, kind: 'fill', paint: { solid: f }, alpha: 1, clip: null });
    if (k && k[3] > 0) ops.push({ geom, m, kind: 'stroke', paint: { solid: k }, alpha: 1, w: sw, cap: 0, clip: null });
  }
  // ── The Doppler probe (stage.js dprobePaint draws it into its own SVG, the model, as before; dop-probe.js) ──
  // Its marks are drawn here as shapes (the faded beam a triangle with its gradient, the lines with their round ends, black rim under
  // white line), and its head as a small picture drawn at its angle and size (again only when either changes), under the leaders and
  // labels as the SVG lay. Its look (colours, widths, fades) is read from its elements while one may be changing.
  // Its look is read from the page after the frame that changed it (a task of its own, never inside a frame), and while a fade runs its
  // opacities are followed from the fade's own clock (easeCapture), with no read of the page in the frame.
  let probe = null, pLook = null, pTracks = [], pReadT = 0;
  const pRead = () => {
    pReadT = 0;
    if (!probe?.isConnected) return;
    const now = performance.now();
    pLook = probeLookRead(probe);
    const L = pLook, head = probe.querySelector('.dpr-head');
    pTracks = easeCapture([[probe, 'opacity', parseFloat, (v) => { L.op = v; }], [head, 'opacity', parseFloat, (v) => { L.headOp = v; }]], now);
    ask();
  };
  const pReadSoon = () => { if (!pReadT) pReadT = setTimeout(pRead, 0); };
  const pmo = new MutationObserver((rs) => { if (rs.some((r) => r.attributeName === 'class' && changed(r))) pReadSoon(); ask(); });
  const holdProbe = () => { pReadSoon(); ask(); };
  let headSp = null;
  function setProbe(el) {
    if (probe === el) return;
    probe = el; pLook = null; pTracks = [];
    if (el) pReadSoon();
    pmo.disconnect();
    if (!el) return;
    pmo.observe(el, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style', 'transform', 'd'] });
    for (const t of ['transitionrun', 'transitionend', 'transitioncancel', 'animationstart', 'animationend']) el.addEventListener(t, holdProbe, true);
  }
  const probeStroke = (el) => { const c = getComputedStyle(el); return { col: none(c.stroke) ? null : rgba(c.stroke), w: NUM(c.strokeWidth), cap: c.strokeLinecap, raw: c.stroke, fill: c.fill, join: c.strokeLinejoin }; };
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
      rimL: probeStroke(q('.dpr-rim-l')), line: probeStroke(q('.dpr-line')), gateRim: probeStroke(q('.dpr-gate-rim')), gate: probeStroke(q('.dpr-gate')),
      head: ['.dpr-rim', '.dpr-body', '.dpr-face', '.dpr-light'].map((k) => { const e = q(k), c = getComputedStyle(e); return { d: e.getAttribute('d'), circle: e.tagName === 'circle' ? [NUM(e.getAttribute('cx')), NUM(e.getAttribute('cy')), NUM(e.getAttribute('r'))] : null, fill: none(c.fill) ? '' : c.fill, stroke: none(c.stroke) ? '' : c.stroke, w: NUM(c.strokeWidth), join: c.strokeLinejoin }; }),
    };
  }
  // A path of straight pieces ("M x y L x y …") as its segments; a closed three-point one as its triangle.
  const segsOf = (d) => { const out = [], re = /M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*L\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/g; let m; while ((m = re.exec(d || ''))) out.push([+m[1], +m[2], +m[3], +m[4]]); return out; };
  const triOf = (d) => { const n = (d || '').match(/-?[\d.]+/g)?.map(Number); return n?.length === 6 ? [[n[0], n[1]], [n[2], n[3]], [n[4], n[5]]] : null; };
  function drawProbe(now) {
    if (!probe?.isConnected) return false;
    if (!pLook) return false;   // (read after this frame: pReadSoon)
    const live = easeStep(pTracks, now);
    if (!probe.hasAttribute('data-gl')) probe.setAttribute('data-gl', '');
    const L = pLook;
    if (!(L.op > 0.001)) return live;
    const tm = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(probe.style.transform || ''), rm = /rotate\((-?[\d.]+)\)/.exec(probe.querySelector('.dpr-rot')?.getAttribute('transform') || '');
    if (!tm) return live;
    const gx = +tm[1], gy = +tm[2], ang = rm ? +rm[1] : 0, ca = Math.cos(ang * Math.PI / 180), sa = Math.sin(ang * Math.PI / 180);
    // (Its box, for the glass: every point it is drawn through, grown by the head's reach.)
    let ex0 = gx * dpr, ey0 = gy * dpr, ex1 = ex0, ey1 = ey0;
    const at = (x, y) => { const p = [(gx + x * ca - y * sa) * dpr, (gy + x * sa + y * ca) * dpr]; ex0 = Math.min(ex0, p[0]); ey0 = Math.min(ey0, p[1]); ex1 = Math.max(ex1, p[0]); ey1 = Math.max(ey1, p[1]); return p; };
    const probeBox = (m) => boxAt(ex0 - m, ey0 - m, ex1 + m, ey1 + m);
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
        // Its shapes filled and stroked on the GPU (the organs' painter, into a texture of its own): no 2D canvas.
        const m = [ca * k * dpr, sa * k * dpr, -sa * k * dpr, ca * k * dpr, -x0, -y0], ops = [];
        for (const h of L.head) {
          const geom = { poly: h.circle ? ellipsePoly(h.circle[0], h.circle[1], h.circle[2], h.circle[2]) : flattenPath(h.d || '', 0.05) };
          shapeOps(ops, geom, m, h.fill, h.stroke, h.w);
        }
        headSp = picture(headSp, Math.max(1, x1 - x0), Math.max(1, y1 - y0), ops);
        Object.assign(headSp, { key, ox: x0, oy: y0 });
      }
      const [hx, hy] = at(D, 0);
      gl.useProgram(prog);
      gl.uniform2f(U.uView, W, H); gl.uniform1i(U.uT, 0);
      gl.bindTexture(gl.TEXTURE_2D, headSp.tex);
      gl.uniform4f(U.uR, Math.round(hx) + headSp.ox, Math.round(hy) + headSp.oy, headSp.w, headSp.h); gl.uniform1f(U.uA, Math.min(1, L.op * L.headOp));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      ex0 = Math.min(ex0, Math.round(hx) + headSp.ox); ey0 = Math.min(ey0, Math.round(hy) + headSp.oy);
      ex1 = Math.max(ex1, Math.round(hx) + headSp.ox + headSp.w); ey1 = Math.max(ey1, Math.round(hy) + headSp.oy + headSp.h);
    }
    probeBox(4 * dpr);
    return live;
  }
  // ── The FibroScan probe (stage.js scanPaint and scanTick write its SVGs, the model, as before) ──
  // Over the labels, as its layer lay. Its beam (blurred) is a picture drawn once and turned here; its waves are arcs and its cable a
  // line, drawn as shapes each frame; its body, screen and reading a picture drawn at its angle (again only when that or the reading
  // changes); the tip, which taps, a rounded rectangle at its place each frame.
  let scanEl = null, sLook = null, sTracks = [], sReadT = 0, sHeadSp = null;
  // (Its look read after the frame that changed it, never inside one, and its eases (the turn, the fades, the tip's tap) followed from
  // their own clocks: easeCapture. The waves' opacities and the probe's place change every frame and are read off their attributes.)
  const tipXOf = (t) => { const m = /matrix\(([^)]+)\)/.exec(t || ''); return m ? Number(m[1].split(',')[4]) : /translate(?:X)?\(\s*(-?[\d.]+)px/.exec(t || '') ? Number(/translate(?:X)?\(\s*(-?[\d.]+)px/.exec(t)[1]) : t === 'none' ? 0 : NaN; };
  const sRead = () => {
    sReadT = 0;
    if (!scanEl?.isConnected) return;
    const now = performance.now(), q = (k) => scanEl.querySelector(k);
    sLook = scanLookRead(scanEl);
    const L = sLook;
    if (L) sTracks = easeCapture([[scanEl, 'opacity', parseFloat, (v) => { L.op = v; }], [scanEl.querySelectorAll(':scope > svg')[1], 'transform', (t) => (t === 'none' ? 0 : /matrix/.test(t) ? angOf(t) : NaN), (v) => { L.ang = v; }],
      [q('.sp-head'), 'opacity', parseFloat, (v) => { L.headOp = v; }], [q('.sp-cable'), 'opacity', parseFloat, (v) => { L.cableOp = v; }], [q('.sp-tip'), 'transform', tipXOf, (v) => { L.tipX = v; }]], now);
    ask();
  };
  const sReadSoon = () => { if (!sReadT) sReadT = setTimeout(sRead, 0); };
  const smo = new MutationObserver((rs) => { if (rs.some((r) => changed(r) && r.target !== scanEl && !r.target.closest?.('.sp-waves'))) sReadSoon(); ask(); });
  const holdScan = () => { sReadSoon(); ask(); };
    function setScan(el) {
    if (scanEl === el) return;
    scanEl?.removeAttribute('data-gl');
    scanEl = el; sLook = null; sTracks = []; sHeadSp = null;
    if (el) sReadSoon();
    if (el && !glyphsReady()) loadGlyphs().then(() => { sHeadSp = null; ask(); }, () => {});   // (the reading's outlines, ahead of its first picture)
    smo.disconnect();
    ask();
    if (!el) return;
    smo.observe(el, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style'], characterData: true, childList: true });
    for (const t of ['transitionrun', 'transitionend', 'transitioncancel', 'animationstart', 'animationend', 'animationcancel']) el.addEventListener(t, holdScan, true);
  }
  const angOf = (t) => { const m = /matrix\(([^)]+)\)/.exec(t || ''); if (!m) return 0; const v = m[1].split(',').map(Number); return Math.atan2(v[1], v[0]); };
  function scanLookRead(el) {
    const q = (k) => el.querySelector(k), scs = (e) => getComputedStyle(e);
    const svgs = el.querySelectorAll(':scope > svg'), beam = q('.sp-beam'), body = q('.sp-body'), tip = q('.sp-tip'), screen = q('.sp-screen'), cable = q('.sp-cable'), read = q('.sp-read');
    if (svgs.length !== 2 || !beam || !body || !tip || !screen || !read) return null;
    const bc = scs(beam), stops = [...el.querySelectorAll('#sp-beam stop')].map((st) => { const c = scs(st); return [NUM(st.getAttribute('offset')), c.stopColor, NUM(c.stopOpacity)]; });
    const rect = (e) => { const c = scs(e); return { x: NUM(e.getAttribute('x')), y: NUM(e.getAttribute('y')), w: NUM(e.getAttribute('width')), h: NUM(e.getAttribute('height')), rx: NUM(e.getAttribute('rx')), fill: none(c.fill) ? '' : c.fill, stroke: none(c.stroke) ? '' : c.stroke, sw: NUM(c.strokeWidth) }; };
    const runs = [...read.children].map((sp) => { const r = scs(sp); return { t: sp.textContent, dx: NUM(sp.getAttribute('dx')), font: `${r.fontWeight} ${r.fontSize} ${r.fontFamily}`, weight: r.fontWeight, size: NUM(r.fontSize), ls: 0, tnum: /tabular-nums/.test(r.fontVariantNumeric), fill: none(r.fill) ? '' : r.fill }; });
    const cc = scs(cable), wave = (k) => { const e = q(k); if (!e) return null; const c = scs(e); return { col: rgba(c.stroke), so: NUM(c.strokeOpacity), w: NUM(c.strokeWidth) }; };
    return {
      op: NUM(scs(el).opacity), ang: angOf(scs(svgs[1]).transform), headOp: NUM(scs(q('.sp-head')).opacity), cableOp: NUM(cc.opacity),
      beam: { d: beam.getAttribute('d'), filter: bc.filter && bc.filter !== 'none' ? bc.filter : NUM(bc.getPropertyValue?.('--sp-soft')) > 0 ? `blur(${NUM(bc.getPropertyValue('--sp-soft'))}px)` : '',   // (its softness: app.css --sp-soft, drawn once here, never a CSS blur)
      stops, grad: ['cx', 'cy', 'r'].map((k) => NUM(el.querySelector('#sp-beam').getAttribute(k))) },
      body: rect(body), screen: rect(screen), tip: rect(tip), tipX: (() => { const m = /matrix\(([^)]+)\)/.exec(scs(tip).transform); return m ? Number(m[1].split(',')[4]) : 0; })(),
      read: { x: NUM(read.getAttribute('x')), y: NUM(read.getAttribute('y')), anchor: read.getAttribute('text-anchor') || 'start', runs },
      cable: { d: cable.getAttribute('d'), col: none(cc.stroke) ? null : rgba(cc.stroke), w: NUM(cc.strokeWidth), cap: cc.strokeLinecap },
      rip: wave('.sp-rip'), front: wave('.sp-front'),
    };
  }
  const PIV = [66, 48];   // (the tip: the point the probe turns about, in its SVGs' own px; stage.js SCAN_TIP)
  function drawScan(now) {
    if (!scanEl?.isConnected) return false;
    if (!sLook) return false;   // (read after this frame: sReadSoon)
    const live = easeStep(sTracks, now), L = sLook;
    // (The beam's blur needs the canvas's filter only where the 2D picture draws it: the shader's sector needs none, as on Safari.)
    // (A beam the shader cannot draw as its sector (another markup), or ?beamgl=0: the SVG keeps the probe.)
    if (!L || !(BEAM_GL && L.beam.stops.length === 2 && beamSector(L.beam))) { if (scanEl.hasAttribute('data-gl')) scanEl.removeAttribute('data-gl'); return live; }
    if (!scanEl.hasAttribute('data-gl')) scanEl.setAttribute('data-gl', '');
    if (!(L.op > 0.001)) return live;
    const tm = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(scanEl.style.transform || '');
    if (!tm) return live;
    // (Its box stands at the written place, raised by half its height (app.css translate: 0 −50%); its SVGs turn about the tip.)
    const px = +tm[1] + PIV[0], py = +tm[2], ca = Math.cos(L.ang), sa = Math.sin(L.ang);
    const at = (u, v) => [(px + (u - PIV[0]) * ca - (v - PIV[1]) * sa) * dpr, (py + (u - PIV[0]) * sa + (v - PIV[1]) * ca) * dpr];
    // (Its box, for the glass: everything it draws lies within 170 px of the tip: the beam's 150 px arc and its blur, the body.)
    boxAt((px - 170) * dpr, (py - 170) * dpr, (px + 170) * dpr, (py + 170) * dpr);
    // The beam: a soft sector drawn by the shader (kind 7), its blur worked out per pixel, so no picture of it is made off the GPU.
    const bsec = BEAM_GL && L.beam.stops.length === 2 ? beamSector(L.beam) : null;
    if (bsec) {
      const [ax, ay] = at(bsec.apex[0], bsec.apex[1]), [gx, gy] = at(L.beam.grad[0], L.beam.grad[1]), R = bsec.r * dpr, sg = bsec.blur * dpr, m = R + 4 * sg + 2;
      const st = L.beam.stops.map(([o, col, a]) => [o, rgba(col).map((v) => v * a)]);   // (rgba: premultiplied; times the stop's opacity)
      gl.useProgram(mprog);
      gl.uniform2f(MU.uView, W, H);
      gl.uniform1i(MU.uKind, 7);
      gl.uniform4f(MU.uBox, ax - m, ay - m, ax + m, ay + m);
      gl.uniform4f(MU.uGeo, ax, ay, R, L.beam.grad[2] * dpr);
      gl.uniform4f(MU.uR4, bsec.dir + L.ang, bsec.half, gx, gy);
      gl.uniform1f(MU.uW, sg);
      gl.uniform4f(MU.uS0, ...st[0][1]); gl.uniform4f(MU.uS1, ...st[1][1]); gl.uniform3f(MU.uSO, st[0][0], st[1][0], 1);
      gl.uniform1f(MU.uA, Math.min(1, L.op));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
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
    if (L.headOp > 0.001 && glyphsReady()) {
      // The body, its screen and the reading: a picture at the probe's angle, drawn again when that or the reading changes.
      const hkey = JSON.stringify([L.body, L.screen, L.read, L.ang.toFixed(4), dpr]);
      if (!sHeadSp || sHeadSp.key !== hkey) {
        const pts = [[-14, 31], [62, 31], [-14, 65], [62, 65]].map(([u, v]) => [((u - PIV[0]) * ca - (v - PIV[1]) * sa) * dpr, ((u - PIV[0]) * sa + (v - PIV[1]) * ca) * dpr]);
        const x0 = Math.floor(Math.min(...pts.map((p) => p[0]))), y0 = Math.floor(Math.min(...pts.map((p) => p[1]))), x1 = Math.ceil(Math.max(...pts.map((p) => p[0]))), y1 = Math.ceil(Math.max(...pts.map((p) => p[1])));
        // Its body, screen and reading filled on the GPU (the organs' painter, the reading from the font's own outlines: text-gl.js), into
        // a texture of its own: no 2D canvas.
        const m = mul([ca * dpr, sa * dpr, -sa * dpr, ca * dpr, -x0, -y0], [1, 0, 0, 1, -PIV[0], -PIV[1]]), ops = [];
        for (const b of [L.body, L.screen]) shapeOps(ops, { poly: roundRectPoly(b.x, b.y, b.w, b.h, b.rx) }, m, b.fill, b.stroke, b.sw);
        const look = (r) => ({ weight: r.weight, size: r.size, tnum: r.tnum, ls: r.ls || 0 });
        const ws = L.read.runs.map((r) => textWidth(r.t, look(r)));
        let w = 0; ws.forEach((q, i) => { w += (i ? L.read.runs[i].dx : 0) + q; });
        let x = L.read.anchor === 'middle' ? L.read.x - w / 2 : L.read.anchor === 'end' ? L.read.x - w : L.read.x;
        L.read.runs.forEach((r, i) => {
          if (i) x += r.dx;
          if (r.fill) shapeOps(ops, { poly: textPolys(r.t, x, L.read.y, look(r)).polys }, m, r.fill, '', 0);
          x += ws[i];
        });
        sHeadSp = picture(sHeadSp, Math.max(1, x1 - x0), Math.max(1, y1 - y0), ops);
        Object.assign(sHeadSp, { key: hkey, ox: x0, oy: y0 });
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
    redraw() { if (lost) return; if (host) { ask(); return; } if (raf) { cancelFrame(raf); raf = 0; } draw(); },
    setHoles,
    /** Whether the labels leave the figure's glasses out (setHoles): their own canvas, drawn by the GPU. */
    get holes() { return !host && !lost; },
    /** Host mode: draws the labels into the host's canvas now (veins-gl top, at the end of each present). */
    drawInto() { if (host) draw(); },
    /** Host mode: something that decides whether the labels may be drawn over the figure changed (see check). */
    check() { check(); },
    /** Host mode: whether the host's canvas owes a picture with the labels. */
    get owed() { return owed; },
    /** The label groups and marks the SVG drew itself at the last picture (in host mode, none while it draws them all). */
    svgLeft: () => [...svgLeft],
    /** The ?perf surfaces list (gpu-surfaces.js): the labels laid out at the last picture, and how many of them the SVG drew itself. */
    counts: () => ({ labels: last.length, svg: last.filter((s) => svgLeft.has(s.g)).length, marks: [...svgLeft].filter((el) => !last.some((s) => s.g === el)).length }),
    /** What the last picture drew, as boxes [left, top, right, bottom] (CSS px from the canvas's corner). */
    get boxes() { return boxes; },
    get lost() { return lost; },
    /** This frame's labels: drawn now, in the same frame as the SVG's layout. */
    sync(list) {
      if (lost) return;
      if ((devicePixelRatio || 1) !== dpr) size();   // (moved to a screen of another density)
      take(mo.takeRecords());
      for (const r of mmo.takeRecords()) { if (!changed(r)) continue; const el = markOf(r.target); if (el) markDirty.add(el); }
      const was = new Set(last.map((s) => s.g));
      // (The first layout after a ride: each label that stays glides from where it rode, a new one fades in, one that goes fades out.)
      const from = rideFrom;
      rideFrom = null;
      if (from) {
        const t0 = performance.now(), now2 = new Set(list.map((s) => s.g));
        for (const s of list) { const f = from.get(s.g); glides.set(s.g, f ? { fx: f.x, fy: f.y, t0 } : { fadeIn: true, t0 }); }
        for (const [g, f] of from) if (!now2.has(g)) { const st = sprites.get(g); if (st?.slot && st.mode === 'gl') { outgoing.push({ g, st, x: f.x, y: f.y, a: f.a, t0 }); sprites.delete(g); } }
      }
      last = list;
      for (const s of list) was.delete(s.g);
      for (const g of was) { g.removeAttribute('data-gl'); glides.delete(g); const st = sprites.get(g); if (st) { packer.free(st.slot); sprites.delete(g); } live.delete(g); }
      if (host) { ask(); return; }
      if (raf) { cancelFrame(raf); raf = 0; }
      draw();
    },
    /** Whether the labels can ride a camera move on the GPU: every label on screen is drawn here (none left to the SVG). */
    canRide() { return !lost && !host && ![...svgLeft].some((el) => el.classList?.contains('lb')); },
    /** A camera move's carry, [a, b, c, d, e, f] (where the labels were laid out, stage px, to where that point is now), drawn now. */
    ride(m) {
      if (lost) return;
      if (m && !rideM) rideT0 = performance.now();
      rideM = m; glides.clear();
      if (raf) { cancelFrame(raf); raf = 0; }
      draw();
    },
    /** The ride is over: the next layout (sync) glides each label on from where it rode. */
    rideEnd() {
      if (!rideM) return;
      rideM = null;
      const from = new Map();
      for (const s of last) { const st = sprites.get(s.g); if (st && st.mode === 'gl' && st.drawn >= rideT0) from.set(s.g, { x: st.dx, y: st.dy, a: Math.min(1, st.opacity) }); }
      rideFrom = from.size ? from : null;
    },
    get riding() { return !!rideM; },
    /** A label animated by script (the Web Animations API, which sends no events): read each frame for `ms`. */
    hold(g, ms) {
      if (!g) return;
      if (markOf(g)) { markDirty.add(g); markLive.set(g, performance.now() + ms + 100); } else { dirty.add(g); live.set(g, performance.now() + ms + 100); }
      ask();
    },
  };
}
