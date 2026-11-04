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
// know, a keyboard focus ring) stays drawn by the SVG, label by label. Without WebGL2, on a software renderer, or
// once the context is lost, the SVG draws them all, as it always has.

import { glGet, glCap } from './gl-state.js';
import { frameFor, cancelFrame } from './frame.js';
import { ucOf } from './uniform-cache.js';
import { classOnly, GESTURE_LOOK } from './idle-keys.js';
import { startProgram, checkProgram, publishWhenDone } from './gl-compile.js';
import { createAtlasPacker } from './atlas-pack.js';
import { easeMove, D_SURFACE, D_SMALL } from './ease.js';
import { createShapeGL, flattenPath, polyMeshInto, ellipsePoly } from './shape-gl.js';
import { createOrganPaint, parseColor, mul } from './organ-paint.js';
import { textPolys, textWidth, loadGlyphs, glyphsReady, textCovers } from './text-gl.js';
import { watchSize, sizeOf, rectSoon } from './geom.js';
import { trackOf, trackAt, settleUnder, mixColour, mixRgbaInto, timingOf, progressAt, keysOf } from './label-track.js';
import { caught } from './caught.js';
import { booting, holdCover } from './quiet.js';
import { planRepack, stepRepack, reconcileRepack, commitRepack } from './label-repack.js';
import { classSoon } from './class-soon.js';
import { readStyle } from './layout-snap.js';
const HOLE_MESH = { tri: null, seg: null, nTri: 0, nSeg: 0 };   // alloc-rare: made once (a hole's mask is meshed into it and released after its draw)
// (The colour a clear writes, one array for every clear: none made per call, plan rev 2 §2.8.)
const CLEAR0 = new Float32Array(4);

// (1 Nov 2026, the GPU motion review.) A label's or a leader's fade or colour ease is followed from its animations (label-track.js), and its
// style read off the frame (styleOf): nothing on the page is read in a frame.
const TRACK = true;
// (2 Nov 2026, "labels turn on and off randomly", iPhone. A label's opacity on the GPU is never taken from a kept at-rest style while its
// CSS fade toward it may be starting: the kept style of a class (lb-off, or a new label's) is its end state, and drawn at once it made a
// fade-out a snap off, a new label pop in at full before its fade, a step's number show before its turn. Such a label holds the opacity
// it was drawn at (a new one 0, where its fade starts) and is followed from the next frame, when its fades are known. And mid-fade, a
// frame whose animations are not taken yet keeps following the fade it had, instead of a reading of the fade's first frame (0), which
// blinked the label out for one to three frames.)
const HOLD_MAX = 400;   // (ms: the longest a label waits at its last drawn opacity for its animations, see takeAnims)
const REDUCE = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

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
// ── Numbers read in place (2 Nov 2026) ──
// A colour, a path or a transform is read a character at a time into kept numbers: no match(), split(), map() or regular expression's
// result array, so a frame that reads the probes' places or a leader's line makes no garbage. numFrom(s, i, strict) finds the next
// number at or after i (strict: only white space and commas may come before it), sets NUM_V and returns the index after it, or -1. It
// reads what Number() reads of these strings: digits, one point, an exponent; a % sign makes it NaN.
const P10 = new Float64Array(23), SC = new Float64Array(4);
for (let i = 0, p = 1; i < 23; i++, p *= 10) P10[i] = p;
let NUM_V = 0;
function numFrom(s, i, strict) {
  const n = s.length;
  for (; i < n; i++) {
    let c = s.charCodeAt(i), j = i, neg = false;
    if (c === 45) {
      const d = j + 1 < n ? s.charCodeAt(j + 1) : 0;
      if (!((d >= 48 && d <= 57) || d === 46)) { if (strict) return -1; continue; }
      neg = true; j++; c = d;
    }
    if (!((c >= 48 && c <= 57) || c === 46)) { if (strict && c > 32 && c !== 44) return -1; continue; }
    let mant = 0, scale = 0, exp = 0, dot = false, digits = 0, sig = 0;
    for (; j < n; j++) {
      c = s.charCodeAt(j);
      if (c === 46) { if (dot) break; dot = true; continue; }
      if (c < 48 || c > 57) break;
      digits++;
      if (sig < 15) { mant = mant * 10 + (c - 48); if (mant > 0) sig++; if (dot) scale++; } else if (!dot) exp++;
    }
    if (!digits) { i = j - 1; continue; }
    if (j < n && (s.charCodeAt(j) | 32) === 101) {
      let k = j + 1, eneg = false;
      if (k < n && (s.charCodeAt(k) === 45 || s.charCodeAt(k) === 43)) { eneg = s.charCodeAt(k) === 45; k++; }
      if (k < n && s.charCodeAt(k) >= 48 && s.charCodeAt(k) <= 57) {
        let e = 0;
        for (; k < n && s.charCodeAt(k) >= 48 && s.charCodeAt(k) <= 57; k++) e = e * 10 + (s.charCodeAt(k) - 48);
        exp += eneg ? -e : e; j = k;
      }
    }
    let v = scale > 22 ? mant / 10 ** scale : mant / P10[scale];
    if (exp) v *= 10 ** exp;
    if (j < n && s.charCodeAt(j) === 37) { v = NaN; j++; }
    NUM_V = neg ? -v : v;
    return j;
  }
  return -1;
}
/** The numbers of `s` from index `i` into `out` (a Float64Array): how many were read (at most out.length). */
export function readNums(s, i, out) {
  let n = 0;
  while (n < out.length) { i = numFrom(s || '', i, false); if (i < 0) break; out[n++] = NUM_V; }
  return n;
}
// A computed colour as premultiplied RGBA, 0 … 1, written into `out` (4 numbers).
export function rgbaInto(out, c) {
  out[0] = out[1] = out[2] = out[3] = 0;
  if (!c) return out;
  // (A colour-mix() is computed as color(srgb r g b / a), each 0 … 1.)
  let i = c.indexOf('rgb('), div = 255;
  if (i >= 0) i += 4;
  else if ((i = c.indexOf('rgba(')) >= 0) i += 5;
  else if ((i = c.indexOf('color(srgb')) >= 0) { i += 10; div = 1; } else return out;
  let n = 0;
  for (; n < 4; n++) { i = numFrom(c, i, false); if (i < 0) break; SC[n] = NUM_V; }
  if (n < 3) return out;
  const a = n > 3 ? SC[3] : 1;
  out[0] = SC[0] / div * a; out[1] = SC[1] / div * a; out[2] = SC[2] / div * a; out[3] = a;
  return out;
}
// A computed colour as premultiplied RGBA, 0 … 1 (a new array: for what is made once, not in a frame; rgbaInto writes into one).
export const rgba = (c) => rgbaInto([0, 0, 0, 0], c);
/** A leader's path "M x y L x y" (and nothing else) written into `out` (4 numbers): whether it is one straight piece. */
export function lineInto(d, out) {
  if (!d) return false;
  const n = d.length;
  let i = 0;
  while (i < n && d.charCodeAt(i) <= 32) i++;
  if (d.charCodeAt(i) !== 77) return false;
  i++;
  for (let k = 0; k < 4; k++) {
    if (k === 2) {
      while (i < n && d.charCodeAt(i) <= 32) i++;
      if (d.charCodeAt(i) !== 76) return false;
      i++;
    }
    i = numFrom(d, i, true);
    if (i < 0) return false;
    out[k] = NUM_V;
  }
  while (i < n && d.charCodeAt(i) <= 32) i++;
  return i >= n;
}
/** A path of straight pieces ("M x y L x y …") written into `out` as its segments, four numbers each: how many. */
function segsInto(d, out) {
  if (!d) return 0;
  let n = 0, i = d.indexOf('M');
  while (i >= 0 && n + 4 <= out.length) {
    let j = i + 1;
    for (let k = 0; k < 4; k++) {
      if (k === 2) {
        while (j < d.length && d.charCodeAt(j) <= 32) j++;
        if (d.charCodeAt(j) !== 76) { j = -1; break; }
        j++;
      }
      j = numFrom(d, j, true);
      if (j < 0) break;
      out[n + k] = NUM_V;
    }
    if (j >= 0) { n += 4; i = d.indexOf('M', j); } else i = d.indexOf('M', i + 1);
  }
  return n >> 2;
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
  const o = [0, 0, 0, 0];
  return lineInto(d, o) ? o : null;
}
const none = (c) => !c || c === 'none' || c === 'transparent' || /^rgba\([^)]*,\s*0\)$/.test(c);

/** What a label's group draws, read from the page: null when it shows nothing; { svg: why } when this drawing cannot give it. */
export function describeBlock(g, cs = getComputedStyle, boxOf) {   // (boxOf: a focused label's box, kept outside the frames: ringBoxOf)
  const gs = cs(g);
  if (g.style.display === 'none' || gs.display === 'none') return null;
  let focused;
  try { focused = g.matches(':focus-visible'); } catch { focused = g === document.activeElement; }
  const d = { opacity: NUM(gs.opacity), filter: gs.filter === 'none' ? '' : gs.filter, parts: [] };
  // (Focused from the keyboard: its ring, as the page's styles give it (an outline round the label's box, eased in by focus-ring.js), is
  // drawn into its picture; the label's own parts take their focus colours from the page's styles as any other state's. Read each frame
  // while it eases: focusin holds it live.)
  if (focused) {
    const w = NUM(gs.outlineWidth);
    if (gs.outlineStyle && gs.outlineStyle !== 'none' && w > 0 && !none(gs.outlineColor)) {
      let b;
      try { const bb = boxOf(g); b = [bb.x, bb.y, bb.width, bb.height]; } catch (e) { if (e?.message === 'style not read yet') throw e; b = null; }
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
    } else if (el.tagName === 'polygon') {
      // (A filled shape of straight edges: an arrow's triangle, a legend's dot as a many-sided one.)
      const pts = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(NUM);
      if (pts.length < 6 || pts.length % 2) return { svg: 'part' };
      d.parts.push({ k: 'poly', pts, fill: none(c.fill) ? '' : c.fill, stroke: none(c.stroke) ? '' : c.stroke, sw: NUM(c.strokeWidth), strokeFirst: /^stroke/.test(c.paintOrder) });
    } else if (el.tagName === 'text') {
      const line = { k: 'text', x: NUM(el.getAttribute('x')), y: NUM(el.getAttribute('y')), anchor: el.getAttribute('text-anchor') || 'start', runs: [] };
      for (const sp of el.children) {
        if (sp.tagName !== 'tspan') return { svg: 'part' };
        const r = cs(sp);
        if (r.display === 'none') continue;
        line.runs.push({ t: sp.textContent, dx: NUM(sp.getAttribute('dx')), font: `${r.fontStyle === 'normal' ? '' : r.fontStyle + ' '}${r.fontWeight} ${r.fontSize} ${r.fontFamily}`,
          size: NUM(r.fontSize), wt: NUM(r.fontWeight) || 400, it: r.fontStyle !== 'normal', fam: r.fontFamily,
          ls: r.letterSpacing === 'normal' ? 0 : NUM(r.letterSpacing), tnum: /tabular-nums/.test(r.fontVariantNumeric),
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
// The label layer's own canvas is capped at 2 device px per CSS px (the figure's cap, stage.js resizeCanvas): a 3x iPhone Pro Max made it a
// 1320 x 2868 buffer.
export const LABEL_DPR_MAX = 2;
export const labelDensity = (dpr) => Math.min(dpr || 1, LABEL_DPR_MAX);
export const lookKey = (d, rot, dpr) => JSON.stringify([d.filter, d.parts, rot, dpr]);

const INTER = /^\s*"?Inter\b/i;
/** Why the SVG must draw this description itself ('' when the GPU can). Its words are filled from Inter's outlines (text-gl.js), so till
 *  they have come, or for a font other than Inter, a character they lack or a colour the painter cannot read, the SVG keeps the label. */
export function svgOnly(d, ready = glyphsReady()) {
  if (d.svg) return d.svg;
  // (A rect's drop shadows are drawn by the GPU, under its picture (shadowsOf, shadowBox); any other filter, or one on the whole label
  // (none in the stylesheet), is the SVG's.)
  if (d.filter || d.parts.some((p) => p.filter && !(p.k === 'rect' && shadowsOf(p.filter)))) return 'filter';
  const paints = (c) => !c || !!parseColor(c);
  for (const p of d.parts) {
    if (p.k === 'rect' || p.k === 'poly') { if (!paints(p.fill) || !paints(p.stroke)) return 'colour'; continue; }
    for (const r of p.runs) {
      if (r.fam && !INTER.test(r.fam)) return 'font';
      if (!ready) return 'glyphs';
      if (!textCovers(r.t)) return 'glyph';
      if (!paints(r.fill) || !paints(r.stroke)) return 'colour';
    }
  }
  return '';
}
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
/** A rounded rectangle as one closed polyline (its corners' quarter circles cut fine enough for a probe's body at any zoom). */
export function roundRectPoly(x, y, w, h, r) {
  r = Math.max(0, Math.min(r || 0, w / 2, h / 2));
  const out = [], n = r > 0 ? 8 : 0;
  const corner = (cx, cy, a0) => { if (!n) { out.push(cx, cy); return; } for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * Math.PI / 2; out.push(cx + r * Math.cos(a), cy + r * Math.sin(a)); } };
  corner(x + w - r, y + r, -Math.PI / 2); corner(x + w - r, y + h - r, 0); corner(x + r, y + h - r, Math.PI / 2); corner(x + r, y + r, Math.PI);
  return [{ pts: new Float32Array(out), closed: true }];
}
// How far a filter's drop shadows and blurs reach (px): the picture is grown by that much.
// The FibroScan beam drawn by the shader as a soft sector (kind 7), not painted into a 2D picture through a CSS blur and uploaded.
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

// A run's type as text-gl.js sets it (its widths are the font's own advances and kerning, as the browser's).
const typeOf = (r) => ({ weight: r.wt, size: r.size, tnum: r.tnum, ls: r.ls });
// (No italic face is shipped: the browser slants Inter itself, by this much; the GPU slants its outlines the same.)
const SLANT = 0.25;
/**
 * A description laid out at `dpr` device px per px, turned −90° when `rot` (a caption read bottom to top: its origin then is the box's
 * bottom left), with nothing measured on the page or on a canvas: { ox, oy, w, h (the picture's offset from the label's origin and its
 * size, device px), lines, shadows (its rects' drop shadows), frame, m (the label's px to the picture's) }, or null when it draws nothing.
 */
export function layBlock(d, dpr, rot = false) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (a, b, c, e) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, e); };
  const lines = [];
  for (const p of d.parts) {
    if (p.k === 'rect') { const m = p.sw / 2; grow(p.x - m, p.y - m, p.x + p.w + m, p.y + p.h + m); continue; }
    if (p.k === 'poly') { const m = p.sw / 2; for (let i = 0; i < p.pts.length; i += 2) grow(p.pts[i] - m, p.pts[i + 1] - m, p.pts[i] + m, p.pts[i + 1] + m); continue; }
    const runs = p.runs.map((r) => ({ r, w: textWidth(r.t, typeOf(r)) }));
    let w = 0;
    runs.forEach((q, i) => { w += (i ? q.r.dx : 0) + q.w; });
    let x = p.anchor === 'end' ? p.x - w : p.anchor === 'middle' ? p.x - w / 2 : p.x;
    for (const [i, q] of runs.entries()) {
      if (i) x += q.r.dx;
      q.x = x; x += q.w;
      const h = q.r.stroke ? q.r.sw / 2 : 0, lean = q.r.it ? q.r.size * SLANT : 0;
      grow(q.x - h - 2, p.y - q.r.size * 1.1 - h - 2, q.x + q.w + lean + h + 2, p.y + q.r.size * 0.35 + h + 2);
    }
    lines.push({ p, runs });
  }
  if (!(x1 > x0)) return null;
  // Device px, the label's origin on a whole pixel (where the GPU puts it).
  const L = Math.floor(x0 * dpr), T = Math.floor(y0 * dpr), R = Math.ceil(x1 * dpr), B = Math.ceil(y1 * dpr);
  const w = Math.max(1, rot ? B - T : R - L), h = Math.max(1, rot ? R - L : B - T);
  // (A point of the label's own px in the picture's device px.)
  const at = (px, py) => (rot ? [dpr * py - T, R - dpr * px] : [dpr * px - L, dpr * py - T]);
  // A rect's drop shadows (the soft knockout under a value's paper) are not in the picture: each is a blurred rounded box the GPU draws
  // under it (shadowBox), so no filter, shadow or scratch canvas makes them. Kept in the picture's device px.
  const shadows = [];
  for (const p of d.parts) {
    if (p.k !== 'rect' || !p.filter) continue;
    const fa = Math.max(rgba(p.fill)[3], p.sw > 0 ? rgba(p.stroke)[3] : 0);
    for (const sh of shadowsOf(p.filter) || []) {
      const col = rgba(sh.color);
      if (!(col[3] > 0) || !(fa > 0)) continue;
      const [cx, cy] = at(p.x + p.w / 2 + sh.x, p.y + p.h / 2 + sh.y), hw = (p.w / 2 + p.sw / 2) * dpr, hh = (p.h / 2 + p.sw / 2) * dpr;
      shadows.push({ cx, cy, hw: rot ? hh : hw, hh: rot ? hw : hh, r: Math.min(p.rx * dpr, hw, hh), sig: sh.blur * dpr, col: col.map((v) => v * fa) });
    }
  }
  return { ox: rot ? T : L, oy: rot ? -R : T, w, h, lines, shadows, frame: [L, T, R, rot], m: rot ? [0, -dpr, dpr, 0, -T, R] : [dpr, 0, 0, dpr, -L, -T] };
}
/**
 * A laid-out description as the GPU painter's operations (organ-paint.js), in the SVG's paint order: each rect a rounded box filled and
 * outlined, each run's words filled from Inter's outlines (text-gl.js) with their halo (the SVG's stroke, round-joined) under or over
 * them. Drawn into the label's place in the atlas by the shape drawer; nothing is painted on a 2D canvas.
 */
export function blockOps(d, lay) {
  const ops = [];
  const put = (geom, m, fill, stroke, sw, strokeFirst) => {
    const f = fill ? parseColor(fill) : null, k = stroke && sw > 0 ? parseColor(stroke) : null;
    const F = () => { if (f && f[3] > 0) ops.push({ geom, m, kind: 'fill', paint: { solid: f }, alpha: 1, clip: null }); };
    const S = () => { if (k && k[3] > 0) ops.push({ geom, m, kind: 'stroke', paint: { solid: k }, alpha: 1, w: sw, cap: 0, clip: null }); };
    if (strokeFirst) { S(); F(); } else { F(); S(); }
  };
  for (const p of d.parts) {
    if (p.k === 'rect') { put({ poly: roundRectPoly(p.x, p.y, p.w, p.h, p.rx) }, lay.m, p.fill, p.stroke, p.sw, p.strokeFirst); continue; }
    if (p.k === 'poly') { put({ poly: [{ pts: Float32Array.from(p.pts), closed: true }] }, lay.m, p.fill, p.stroke, p.sw, p.strokeFirst); continue; }
    for (const q of lay.lines.find((l) => l.p === p).runs) {
      const r = q.r;
      if (!r.t) continue;
      // (Slanted about its baseline when italic: x moves right by SLANT per px above it.)
      const m = r.it ? mul(lay.m, [1, 0, -SLANT, 1, SLANT * p.y, 0]) : lay.m;
      put({ poly: textPolys(r.t, q.x, p.y, typeOf(r)).polys }, m, r.fill, r.stroke, r.sw, r.strokeFirst);
    }
  }
  return ops;
}
/** A keyboard focus's ring, in the picture's device px (`frame`: layBlock's), or null. It is not in the picture: a plain rectangle the GPU
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
/** Whether the pictures stand off their DOM labels (a camera ride, or glides moving labels): pointer activation is held off meanwhile. */
export const displacedNow = (riding, gliding) => riding || gliding > 0;
/** One drawn picture as the snapshot reports it: device px in, CSS px out; clipped when any of it lies outside the canvas. */
export function snapshotItem(key, dx, dy, dw, dh, a, dpr, W, H) {
  return { key, x: dx / dpr, y: dy / dpr, w: dw / dpr, h: dh / dpr, a, clipped: dx < 0 || dy < 0 || dx + dw > W || dy + dh > H };
}
export function createLabelGL(svg, blocks, { software = false, marks = [], host = null, force = false, onBoxes = null, id = 'labelGl' } = {}) {
  if ((software && !force) || typeof WebGL2RenderingContext === 'undefined') return null;
  const canvas = host ? host.canvas : document.createElement('canvas');
  if (!host) { canvas.id = id; canvas.setAttribute('aria-hidden', 'true'); }
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
  const ATLAS = { size: Math.min(2048, glCap(gl, gl.MAX_TEXTURE_SIZE) || 2048), pad: 2, maxPages: 2 };
  let packer = createAtlasPacker(ATLAS);
  let pageTex = [];
  let inst = new Float32Array(64 * 8), needRepack = false;
  const pageOf = (n) => pageTex[n] || (pageTex[n] = makePage());
  const makePage = () => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, packer.size, packer.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  if (!host) svg.after(canvas);
  // (The labels' words are Inter's outlines (text-gl.js), fetched as the layer starts: till they come, the SVG shows every label.)
  if (!glyphsReady()) loadGlyphs().then(() => { for (const s of last) dirty.add(s.g); ask(); }, () => {});
  let lost = false, dpr = 1, W = 1, H = 1, last = [], raf = 0;
  // (The loading cover waits for the labels' first picture, inside its own cap (index.html): it lifted on a figure with no labels, and
  // they arrived a beat later. 1.5 s here, so a view that shows none does not hold it.)
  let coverOpen = null;   // alloc-rare: one promise for the cover, made once, only while it is up
  if (booting()) holdCover(new Promise((done) => { coverOpen = done; setTimeout(done, 1500); }));
  let frameSeq = 0, gen = 0, displaced = false;   // (the displayed-label snapshot: frames drawn so far, and the layout/atlas generation, up by every layout and every repack)
  const rafDraw = () => { raf = 0; draw(); };   // (the frame's callback, made once)
  // A slide's camera glide (stage.js, ?labelride=0 off): the labels ride with the figure on the GPU instead of fading out for the whole
  // move. rideM maps where they were laid out (stage px) to where that point is now; each label's picture keeps its size, its centre
  // carried. At the landing they are laid out again, and each label glides from where it rode to its new place (one that stays), fades
  // in (a new one) or fades out where it rode (one that goes), over D_SURFACE on the app's curve: nothing jumps.
  let rideM = null, rideFrom = null, rideT0 = 0;
  // Labels part of the figure (Mohammad, 3 Nov 2026: "can you put labels as part of the figure", "the labels jump all over the place with
  // zooming and switching and panning", "the lines go all over the place and move and elongate"). A station's label is pinned to the point
  // it names: the layout gives it an offset from that point (its place minus the point, both as laid out: pos.pax, pos.pay), and every
  // frame draws it at the point where the figure has it now (pinAt, the stage's labelAnchor under this frame's camera and morph) plus that
  // offset, its dot on the point and its leader from the point to the label, all moved by the same step in the same frame. No ride, carry
  // or follow moves a pinned label: a pan, a pinch or a view change moves its point, and the label goes with it, rigid. Only a new layout
  // changes the offset, and the label takes it at once (no glide), its point and dot not moving.
  let pinAt = null, pinWorldAt = null;
  const PIN = [0, 0];
  // (The offset each pinned label was last drawn at, by its group, kept past its picture: a label whose picture is made again (its text
  // size changes with the zoom) still eases from where it stood, never jumps to its new offset.)
  const pinLast = new WeakMap();   // group -> Float64Array [ox, oy]
  // (A label with a world anchor (pwv set: step 3, every figure label) is pinned by that world point, taken to the stage under the camera of this frame;
  // a station's is named by its id. Either way the label is its point now plus its layout's offset.)
  const pinOf = (s) => {
    if (!pinAt || !s || s.pid == null) return null;
    if (s.pwv != null) return pinWorldAt && pinWorldAt(s.pwx, s.pwy, s.pwv, PIN) ? s : null;
    return pinAt(s.pid, PIN, s.pmid, s.pau) ? s : null;
  };
  // (The offset a pinned label is drawn at this frame, CSS px, into OFF: its layout's, or part way there from where it was drawn while its
  // glide runs. Returns the glide's share, 1 once it is over or there is none. The marks and the label read the same.)
  const OFF = [0, 0];
  function pinOff(s) {
    // (A new layout's offset is taken at once: no glide, no wait for the hand. The label is rigid on its point.)
    OFF[0] = s.x - s.pax; OFF[1] = s.y - s.pay;
    return 1;
  }
  const glides = new Map();   // group → { fx, fy (device px, where it rode), t0 } or { fadeIn: true, t0 }
  const outgoing = [];        // [{ g, st, x, y, a, t0 }]: labels gone at the landing, fading out where they rode
  // (These records are taken from a pool and given back when a glide or fade ends, so a landing makes none: x, y, a, t0 for a label that
  // rode, fx, fy, t0, fadeIn for one that glides.)
  const gpool = [];
  const takeRec = () => gpool.pop() || { g: null, st: null, x: 0, y: 0, a: 0, t0: 0, fx: 0, fy: 0, fadeIn: false };   // alloc-rare: one record for each label that rides at once, the most there ever were
  const dropGlide = (g) => { const r = glides.get(g); if (r) { glides.delete(g); gpool.push(r); } };
  const fromMap = new Map();  // the labels that rode: group → { x, y, a } (rideEnd), read by the next layout (sync)
  const RIDE_MS = D_SURFACE;
  // (Host mode: whether a picture with the labels is owed to the host's canvas; whether the SVG was given every label back.)
  let owed = false, released = true;   // (at first the SVG shows every label: none is marked yet)
  // (Host mode: the labels and marks the SVG still draws, as of the last picture: what lies between the figure's canvas and the callouts'
  // glass, which is drawn into that canvas only where it crosses none of them; svgLeft.)
  const svgLeft = new Set();
  // (What the last picture drew, as boxes [left, top, right, bottom] in CSS px from the canvas's corner: each label's picture, each mark's,
  // the probes'. The figure's frosted glass is drawn under this canvas, so it is drawn only where it crosses none of them (stage.js
  // frostOver); onBoxes() is told when they change.)
  // (Written into BX as each is drawn (four numbers a box), and compared with the frame before's BP: `boxes` is a new array only when one
  // changed, so what keys on its identity keeps its picture while the labels stand still. BK holds the whole pixels onBoxes is told by.)
  let boxes = [], blank = false;
  let BX = new Float64Array(256), BP = new Float64Array(256), BK = new Int32Array(256), nb = 0, npb = 0, nbk = 0;
  const BOXP = [];   // the box arrays handed out, kept to fill again
  function growBoxes() {
    // alloc-rare: only when a frame has more boxes than any before it (doubling)
    const n = BX.length * 2, a = new Float64Array(n), b = new Float64Array(n), k = new Int32Array(n);
    a.set(BX); b.set(BP); k.set(BK);
    BX = a; BP = b; BK = k;
  }
  const boxAt = (x0, y0, x1, y1) => {
    if (nb + 4 > BX.length) growBoxes();
    BX[nb] = x0 / dpr; BX[nb + 1] = y0 / dpr; BX[nb + 2] = x1 / dpr; BX[nb + 3] = y1 / dpr; nb += 4;
  };
  // Every box of this frame drawn: the same array as last frame's when none moved, else a new one; says whether onBoxes is owed (a box
  // changed by a whole pixel).
  function settleBoxes() {
    let same = nb === npb;
    for (let i = 0; same && i < nb; i++) if (BX[i] !== BP[i]) same = false;
    if (!same) {
      const n = nb >> 2;
      while (BOXP.length < n) BOXP.push([0, 0, 0, 0]);   // alloc-rare: one array per box the most there ever were
      for (let i = 0; i < n; i++) { const b = BOXP[i], o = i << 2; b[0] = BX[o]; b[1] = BX[o + 1]; b[2] = BX[o + 2]; b[3] = BX[o + 3]; }
      boxes = BOXP.slice(0, n);
      BP.set(BX.subarray(0, nb)); npb = nb;
    }
    let pix = nb !== nbk;
    for (let i = 0; i < nb; i++) { const v = (i & 2) ? Math.ceil(BX[i]) : Math.floor(BX[i]); if (BK[i] !== v) { BK[i] = v; pix = true; } }
    nbk = nb;
    return pix;
  }
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
  const VOLATILE = new Set(['points', 'x', 'y', 'dx', 'dy', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'd', 'transform', 'data-gl', 'aria-label', 'tabindex', 'role']);
  let epoch = 0, fillT = 0, rideLook = !!svg.parentElement?.closest?.('.lb-ride');   // (rideLook: the stage is in a ride, see outer)
  const snaps = new Map(), easing = new WeakMap(), unread = new Set(), waiting = new Set();
  // The key of an element's style is a number worked out from the same things the text key was made of (the epoch, each ancestor's tag,
  // its attributes but the volatile ones, its hover and focus), mixed into two 32-bit hashes kept in a 53-bit integer, so a label
  // looked at in a frame makes no string (2 Nov 2026, scripts/frame-alloc.mjs). A field ends in a separator, so "ab" + "c" is not "a" + "bc".
  let kh1 = 0, kh2 = 0;
  const mixC = (c) => { kh1 = Math.imul(kh1 ^ c, 0x01000193); kh2 = (Math.imul(kh2 + c + 1, 0x85ebca6b) ^ (kh2 >>> 13)) | 0; };
  const mixS = (str) => { for (let i = 0; i < str.length; i++) mixC(str.charCodeAt(i)); mixC(1); };
  function styleKey(el) {
    kh1 = 0x811c9dc5 | 0; kh2 = 0x9e3779b9 | 0;
    mixC(epoch & 0xffff); mixC((epoch >>> 16) & 0xffff); mixC(2);
    for (let e = el; e; e = e.parentElement) {
      mixS(e.tagName);
      if (e === svg) { mixC(3); mixS(e.getAttribute('class') || ''); break; }
      const at = e.attributes;
      for (let i = 0; i < at.length; i++) { const a = at[i]; if (!VOLATILE.has(a.name)) { mixC(4); mixS(a.name); mixC(5); mixS(a.value); } }
      if (e.classList?.contains('lb')) { try { mixC(e.matches(':hover') ? 6 : 7); mixC(e.matches(':focus-visible') ? 8 : 9); } catch (err) { caught('label-gl:581', err); /* no state */ } }
      if (e.classList?.contains('lb') && rideLook && !e.hasAttribute('data-gl')) mixC(12);   // (a label the SVG still draws is faded under lb-ride, app.css: read apart from its look at rest)
      if (e.classList?.contains('lb-leaders')) mixC(rideLook ? 10 : 11);   // (the stage's lb-ride fades this layer on the page: the leaders and dots stand for it, see outer)
    }
    return (kh1 >>> 0) * 2097152 + ((kh2 >>> 0) & 0x1fffff);
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
  // (2 Nov 2026, the iPhone trace: a label's or a mark's animations were asked for (getAnimations) in the frame that began following them,
  // after that frame's writes, and the browser restyled the page there. They are taken where the page is up to date: in the event that
  // announced them (a transition or animation starting, a hover, a focus), or else in a task just after the frame; the frame only takes
  // what was kept, and one with nothing kept yet is drawn as it was for that frame and followed from the next. ?animskept=0: read in the
  // frame, as before.)
  const animsKept = new WeakMap(), animsWant = new Map();
  let animsT = 0;
  function keepAnims(el, sub) {
    if (!el || !el.isConnected) return;   // (not on the page yet: none of its animations runs; taken once it is)
    let a;
    try { a = sub ? el.getAnimations({ subtree: true }) : el.getAnimations(); } catch { a = []; }
    animsKept.set(el, { a, sub, at: performance.now() });
  }
  // (A focused label's box for its ring likewise: read in the focus event or just after a frame, kept till the label is written again.)
  const ringKept = new WeakMap(), ringWant = new Set();
  let ringT = 0;
  function keepRing(g) { try { ringKept.set(g, g.getBBox()); } catch { ringKept.delete(g); } }
  function ringBoxOf(g) {
    const b = ringKept.get(g);
    if (b) return b;
    ringWant.add(g);
    if (!ringT) ringT = setTimeout(fillRings, 0);
    throw MISS;
  }
  function fillRings() {
    ringT = 0;
    for (const g of ringWant) if (g.isConnected) { keepRing(g); dirty.add(g); }
    ringWant.clear();
    ask();
  }
  /** The element's animations as kept in the last 100 ms, or kept as the answer to its own ask (any age), or null (then read just after
   *  this frame, and the element looked at again).
   *  (2 Nov 2026, "empty labels", "or faded": an answer had to be taken within 100 ms of the task that read it. A frame later than that
   *  (a slow frame, the deck's way out of the lobule, a software renderer every frame) found it stale and asked again, for ever: the label
   *  was held at the opacity it was last drawn at, 0 or a fade's midpoint, while the page showed it whole. An answer stays good until
   *  the label is written again or a new event keeps a newer list; the animations carry their own clocks, so its age changes nothing.) */
  function takeAnims(el, sub) {
    const k = animsKept.get(el);
    if (k && k.sub === sub && (k.ans || performance.now() - k.at < 100)) { animsKept.delete(el); return k.a; }
    animsWant.set(el, sub);
    if (!animsT) animsT = setTimeout(fillAnims, 0);
    return null;
  }
  function fillAnims() {
    animsT = 0;
    for (const [el, sub] of animsWant) { if (!el.isConnected) continue; keepAnims(el, sub); const k = animsKept.get(el); if (k) k.ans = true; if (markOf(el)) markDirty.add(el); else dirty.add(el); }
    animsWant.clear();
    ask();
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
      // (Read mid-ease, this style is that moment's: the label's fades are followed from the next frame instead.)
      { const g = labelOf(el); if (g?.isConnected && !markOf(g)) { keepAnims(g, true); live.set(g, performance.now() + 700); dirty.add(g); } }
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
  const take = (rs) => { for (const r of rs) { if (!changed(r)) continue; if (r.target === blocks && r.type === 'attributes') { restyle(); for (const s of last) dirty.add(s.g); continue; } const g = labelOf(r.target); if (g) { dirty.add(g); ringKept.delete(g); if (animsKept.get(g)?.ans) animsKept.delete(g); } } };
  const mo = new MutationObserver((rs) => { take(rs); if (dirty.size) ask(); });
  mo.observe(blocks, { subtree: true, childList: true, characterData: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style', 'points', 'x', 'y', 'dx', 'width', 'height', 'rx', 'fill', 'font-size', 'font-weight', 'letter-spacing', 'text-anchor'] });
  // Anything outside them that can change how they look (the theme, the glass setting, the text size, a mode's class): every label.
  const all = () => { restyle(); const t = performance.now() + 700; for (const s of last) { dirty.add(s.g); live.set(s.g, t); if (!TRACK) exact.set(s.g, t); } allMarks(); ask(); };
  // (Not for a gesture's own classes, which change no label's look (idle-keys.js GESTURE_LOOK): each one made every label and mark read
  // again on every frame for 0.7 s as a pan or pinch began and as it ended. 30 Oct, review G3.)
  // (One of them does change a look: lb-ride, a hand's or a presenter's ride, fades the leaders' layer on the page (app.css), and the layer's
  // kept style is keyed by what is under the labels' SVG only, so it stayed whole at the opacity it had before the ride: the labels rode the
  // camera and their leaders and dots stood still at full strength over the figure (2 Nov 2026, "labels stuck"). The leaders' layer keys
  // on it (styleKey), and only the marks are read again when it comes or goes: no label's look is touched.)
  const rideSeen = () => {
    const on = !!svg.parentElement?.closest?.('.lb-ride');
    if (on === rideLook) return;
    rideLook = on;
    allMarks(); ask();
  };
  const outer = new MutationObserver((rs) => {
    rideSeen();
    if (rs.some((r) => changed(r) && !classOnly(r, GESTURE_LOOK))) { all(); pReadSoon(); }   // (the Doppler probe's look follows the theme too)
  });
  for (let el = svg.parentElement; el; el = el.parentElement) outer.observe(el, { attributes: true, attributeOldValue: true, attributeFilter: ['class', 'data-theme', 'data-palette', 'data-noglass', 'data-mode'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { all(); pReadSoon(); });
  addEventListener('pps:labelscale', all);   // (the text size: --label-k on the page)
  // A CSS fade or colour ease, a hover, a focus: that label's eases are followed till they end (its style read once, off the frame: styleOf).
  const hold = (ev, ms = 700) => { const g = labelOf(ev.target); if (g) { keepAnims(g, true); if (ev.type === 'focusin') keepRing(g); dirty.add(g); const t = performance.now() + ms; live.set(g, t); if (!TRACK) exact.set(g, t); ask(); } };
  for (const t of ['transitionrun', 'transitionend', 'transitioncancel', 'animationstart', 'animationend', 'animationcancel', 'pointerover', 'pointerout', 'focusin', 'focusout']) blocks.addEventListener(t, (ev) => hold(ev), true);
  // The leaders and their dots (marks: their layers, the leaders' and the FibroScan callout's): read as the labels are.
  const looks = new WeakMap(), markLive = new Until(), markDirty = new Set(), markExact = new Until();
  const markOf = (n) => { const el = n.nodeType === 1 ? n : n.parentElement; return marks.includes(el) ? el : marks.includes(el?.parentElement) ? el : null; };
  const mmo = new MutationObserver((rs) => { for (const r of rs) { if (!changed(r)) continue; const el = markOf(r.target); if (el) markDirty.add(el); } ask(); });
  for (const root of marks) {
    mmo.observe(root, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style'] });
    for (const t of ['transitionrun', 'transitionend', 'transitioncancel', 'animationstart', 'animationend', 'animationcancel']) root.addEventListener(t, (ev) => { const el = markOf(ev.target); if (el) { keepAnims(el, false); markDirty.add(el); markLive.set(el, performance.now() + 800); ask(); } }, true);
  }
  const allMarks = () => { const t = performance.now() + 700; for (const root of marks) { markDirty.add(root); markLive.set(root, t); if (!TRACK) markExact.set(root, t); for (const el of root.children) { markDirty.add(el); markLive.set(el, t); if (!TRACK) markExact.set(el, t); } } };
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); lost = true; undisplace();
    for (const s of last) s.g.removeAttribute('data-gl');
    for (const root of marks) for (const el of root.children) el.removeAttribute('data-gl');
    scanEl?.removeAttribute('data-gl');
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
      pageTex = []; rpDrop(); retry.clear(); pending.clear(); stuck = false; needRepack = false; packer.reset(); outgoing.length = 0; glides.clear(); rideFrom = null;
      holeMasks = new WeakMap(); holeShape = null; picPaint = null; lostPic(headSp); lostPic(sHeadSp); slotTex = null;
      for (const s of last) { const st = sprites.get(s.g); if (st) { st.slot = null; st.key = ''; } dirty.add(s.g); }
      pReadSoon(); sReadSoon(); allMarks(); nbk = -1;
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
    const r = sizeOf(svg.parentElement), k = labelDensity(devicePixelRatio);   // (the stage's box, kept by geom.js's observer: the dive zooms the layer itself; null until it first reports, and then the observer below asks again)
    if (!r) return false;
    const w = Math.max(1, Math.round(r.w * k)), h = Math.max(1, Math.round(r.h * k));
    if (w === W && h === H && k === dpr) return false;
    W = w; H = h; dpr = k; canvas.width = w; canvas.height = h;
    // (Exactly one canvas pixel per device pixel: a canvas scaled even a little would be filtered, and the words soften.)
    canvas.style.width = `${w / k}px`; canvas.style.height = `${h / k}px`;
    for (const s of last) dirty.add(s.g);
    return true;
  }
  // (Its callback runs once the page is laid out: the canvas's place read there costs no extra layout.)
  watchSize(svg.parentElement, () => { placeHoles(); if (size()) ask(); });
  let densT = 0;
  const densRun = () => { densT = 0; size(); ask(); };
  const densityChanged = () => { if (!densT) densT = setTimeout(densRun, 0); };
  // (The query names the density now in force and fires once it stops matching, so it is made anew each time: a third density, a
  // scaled monitor or a page zoom, would otherwise leave the labels at the wrong sharpness.)
  const watchDensity = () => matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener?.('change', () => { densityChanged(); watchDensity(); }, { once: true });
  watchDensity();
  size();
  function ask() {
    if (lost) return;
    // (Given back to the SVG and still not to be drawn over the figure: no picture is laid again for them.)
    if (host) { if (released && !host.active()) return; owed = true; host.ask(); return; }
    if (!raf) raf = nextFrame(rafDraw);
  }
  // Host mode, whenever something that decides whether the labels may be drawn over the figure changed (stage.js watches it): drawn
  // there and not to be any more, the picture is laid again now, without them, and the SVG given them in the same task, so they never
  // show twice nor vanish for a frame; given back and now to be drawn there again, a picture with them is asked for.
  function check() {
    if (!host || lost) return;
    if (!released) { if (!host.active()) { host.now(); if (!released) release(); } return; }
    if (host.active()) ask();
  }
  // (No picture standing off its label any more, the SVG's labels being the ones shown: their pointer events are theirs again.)
  function undisplace() { if (displaced) { displaced = false; classSoon(svg, 'lb-displaced', false); } }
  // Every label, mark and the probes given back to the SVG (host mode, while the labels may not be drawn over the figure).
  function release() {
    undisplace();
    for (const s of last) s.g.removeAttribute('data-gl');
    for (const root of marks) for (const el of root.children) el.removeAttribute('data-gl');
    scanEl?.removeAttribute('data-gl');
    released = true;
  }
  // A label's state, read again when its look may have changed: 'gl' (its picture, drawn again only when its look changed), 'svg'
  // (the SVG draws it) or 'none' (it shows nothing).
  function refresh(g, rot, given = null) {
    let st = sprites.get(g);
    if (!st) { st = { mode: 'none', key: '', slot: null }; sprites.set(g, st); }
    let d;
    try { d = given || describeBlock(g, styleOf, ringBoxOf); } catch (e) {
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
      const lay = layBlock(d, dpr, rot);
      if (!lay) { st.mode = 'none'; return st; }
      // (Its place in the atlas: kept while the picture stays the same size, else a new one found before the old is given back, so a
      // full atlas leaves it the picture it had, R12.)
      let slot = st.slot;
      if (slot && (slot.w !== lay.w || slot.h !== lay.h)) { slot = packer.alloc(lay.w, lay.h); if (slot) { packer.free(st.slot); st.slot = slot; } }
      else if (!slot) { slot = packer.alloc(lay.w, lay.h); st.slot = slot; }
      if (!slot) {
        // (The pages are full: the atlas is packed again beside this one (repackWork), the label keeping the picture it has, or none shown
        // till the new pages are in place, never the SVG's copy; asked again once they are.)
        needRepack = true; st.wait = true; retry.add(g);
        return st;
      }
      st.wait = false;
      paintSlot(st.slot, lay, blockOps(d, lay));
      st.ver = (st.ver | 0) + 1;
      Object.assign(st, { ox: lay.ox, oy: lay.oy, w: lay.w, h: lay.h, shadows: lay.shadows, frame: lay.frame }, { key });
    }
    st.ring = ringBox(d, dpr, st.frame);
    st.opacity = d.opacity;
    return st;
  }
  // A label whose animations are followed (TRACK): they are read once here (getAnimations: keyframes, timing, easing), with its look, and
  // each frame after works out its opacity and its colours from them, reading nothing (label-track.js). Its look is described with each
  // eased colour as a token, filled in per frame (fillLook). One that cannot be followed exactly is read each frame, as before (trk false).
  const TOK = '\u0001';
  const paintOk = (g) => (el) => (el.tagName === 'rect' && el.parentElement === g) || (el.tagName === 'tspan' && el.parentElement?.tagName === 'text' && el.parentElement.parentElement === g);
  // (A property of a style that an ease is moving: the token its colour will be filled in as, else the style's own.)
  function easedOf(mine, k, o) {
    for (let i = 0; i < mine.length; i++) if (mine[i][0] === k) return mine[i][1];
    return o[k];
  }
  function capture(g, rot, now) {
    let list;
    try { list = takeAnims(g, true); } catch { list = []; }
    if (!list) {   // (its animations taken just after this frame: followed from the next)
      const prev = sprites.get(g), was = prev?.held, old = prev?.trk;
      const st0 = refresh(g, rot);
      st0.trk = null;
      // (A hold never outlasts HOLD_MAX: whatever kept its animations from coming, the label is then drawn as the page shows it.)
      st0.holdSince ??= now;
      if (st0.mode === 'gl' && !REDUCE?.matches && now - st0.holdSince < HOLD_MAX) {
        // (Its opacity held where it was: on the fade it had, while that runs, else as it was last drawn, a new label at 0.)
        if (old && !old.ended && old.ops?.length) st0.trk = { ops: old.ops, under: old.under, paint: null, end: old.end, carry: true };
        else if (was === null) st0.mode = 'svg';   // (the SVG drew it last frame, at an opacity not known here: it keeps it till then)
        else st0.opacity = was ?? 0;
      }
      return st0;
    }
    { const s0 = sprites.get(g); if (s0) s0.holdSince = null; }   // (its animations came: a later hold has its own HOLD_MAX)
    let m;
    try { m = trackOf(list, g, paintOk(g), now); } catch { m = null; }
    let st;
    if (m?.paint) {
      const pairs = m.paint.pairs;
      const cs = (el) => {
        const c = styleOf(el), mine = [];
        pairs.forEach((q, i) => { if (q.el === el) mine.push([q.prop, TOK + i]); });
        return mine.length ? new Proxy(c, { get: (o, k) => easedOf(mine, k, o) }) : c;
      };
      let base;
      try { base = describeBlock(g, cs, ringBoxOf); } catch (e) { if (e !== MISS) throw e; base = null; }
      if (base && !base.svg && base.parts) {
        m.base = base; m.w = trackAt(m, now).w;
        st = refresh(g, rot, fillLook(m, m.w));
      } else m = null;
    }
    if (!st) st = refresh(g, rot);
    if (!m || st.mode !== 'gl') { st.trk = false; return st; }
    settleUnder(m, now, st.opacity);   // (read while no fade has an effect: the page's own opacity, which a fade with no fill leaves behind it)
    if (m.end <= now) m.ended = true;
    st.trk = m;
    return st;
  }
  function fillLook(m, w) {
    const { pairs } = m.paint;
    const eased = (v) => { if (typeof v !== 'string' || v[0] !== TOK) return v; const q = pairs[+v.slice(1)], c = mixColour(q.from, q.to, w); return none(c) ? '' : c; };
    return { ...m.base, parts: m.base.parts.map((p) => (p.k === 'rect' || p.k === 'poly' ? { ...p, fill: eased(p.fill), stroke: eased(p.stroke) } : { ...p, runs: p.runs.map((r) => ({ ...r, fill: eased(r.fill), stroke: eased(r.stroke) })) })) };
  }
  // ── Between frames (2 Nov 2026, "label-gl fully to the GPU") ──
  // A label's look is described, laid out and painted into the atlas here, never inside a frame's draw: a draw uses the pictures it has
  // kept, from numbers it has kept, and makes nothing. The pass runs as a microtask, straight after the callback that found a look
  // changed and before the browser paints, and draws the layer again at once (settle): the changed label is on screen in the same frame
  // as its new look, never a frame late, and the SVG's copy that the first draw showed for a label with no picture yet is hidden again
  // before anything is painted (an attribute written and written back in one task is never drawn).
  // todo: label → what it is owed (1 turned, 2 its look changed, 4 its colour ease moved, 8 read it again).
  const todo = new Map();
  let touched = false, settleQ = false, settling = false;
  const settleSoon = () => { if (!settleQ && !settling) { settleQ = true; queueMicrotask(settle); } };
  function settle() {
    settleQ = false;
    if (lost || gl.isContextLost()) { todo.clear(); mtodo.clear(); return; }
    rebuildPass();
    markPass();
    if (host) { ask(); return; }
    if (raf) { cancelFrame(raf); raf = 0; }
    settling = true;
    try { draw(); } finally { settling = false; }
    if (todo.size || mtodo.size || rp) ask();   // (what the redraw found owed again, e.g. a label read each frame while it eases: the next frame)
  }
  // (R11: the pass builds what the page owes in chunks, new labels first, within REBUILD_MS of a frame's time; the labels it leaves for the
  // next chunk keep the picture they have, or are hidden if they have none, so a slide change that owes many captions does not build
  // them all before one paint. At least REBUILD_LEAST labels go each time, so it always ends.)
  const REBUILD_MS = 4, REBUILD_LEAST = 12;
  let rushUntil = 0;   // (a view change has landed: every picture the page owes is built now, within no frame budget)
  function rebuildPass() {
    if (host && !host.active()) { todo.clear(); pending.clear(); return; }
    const now = performance.now();
    let did = 0, over = false;
    for (let pass = 0; pass < 2 && !over; pass++) {
      for (const [g, f] of todo) {
        if (!g.isConnected) { todo.delete(g); pending.delete(g); continue; }
        let st = sprites.get(g);
        if ((pass === 0) !== !st) continue;
        if (did >= REBUILD_LEAST && now >= rushUntil && performance.now() - now > REBUILD_MS) { over = true; break; }
        did++; todo.delete(g); pending.delete(g);
        const rot = (f & 1) !== 0;
        if (f & 8) {
          const isLive = live.has(g), dirtyG = (f & 2) !== 0;
          const tracked = TRACK && isLive && !exact.has(g) && (!st || st.trk !== false || dirtyG || st.rot !== rot);
          const was = st?.held;   // (a label with no picture yet: as a new label, held at 0 where its fade starts; the SVG's copy its first draw showed is never painted)
          st = tracked ? capture(g, rot, now) : refresh(g, rot);
          if (!tracked) st.trk = isLive && st.trk === false ? false : null;
          st.rot = rot;
          // (Read at rest with a new opacity: its fade may only now be starting. Held where it was drawn, and followed from the next frame.)
          if (!tracked && !isLive && st.mode === 'gl' && was !== null && !REDUCE?.matches && Math.abs((was ?? 0) - st.opacity) > 0.01) {
            st.opacity = was ?? 0;
            st.holdSince = now;
            live.set(g, now + 700);
          }
        } else if ((f & 4) && st?.trk?.base) {
          const v = trackAt(st.trk, now);
          if (v.w !== st.trk.w) { st.trk.w = v.w; refresh(g, st.rot, fillLook(st.trk, v.w)); }
        }
      }
    }
    if (over) for (const g of todo.keys()) pending.add(g);
    repackWork();
    // (The host's context as its own passes expect to find it, as after a picture of the labels.)
    if (host && touched) hostTail();
    touched = false;
  }
  function hostTail() {
    gl.disable(gl.BLEND); gl.bindVertexArray(null); gl.useProgram(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, null); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }
  // The pages were full or fragmented (R12): the pictures are laid out again in a second packer and copied, on the GPU and a few a frame, into
  // second pages while the first stay drawable; every label takes its new place in one step (label-repack.js). Nothing is painted again,
  // no label loses its picture, and the SVG is not asked to stand in. If even the compact layout is too much, the labels without a place
  // are the SVG's as before (stuck), till some label goes.
  let rp = null, repackAlt = null, rpTex = [], rpFbo = null, stuck = false;
  const retry = new Set();   // (labels that found no place: described again once the new pages are in)
  const pending = new Set();   // (labels the pass left for the next frame, R11: shown by what they had, or hidden, never the SVG's copy)
  function liveSprites() {
    const a = [];   // alloc-rare: a repack's step, between frames
    for (const s of last) { const st = sprites.get(s.g); if (st?.slot) a.push(st); }   // alloc-rare: as above
    for (const o of outgoing) if (o.st?.slot) a.push(o.st);   // alloc-rare: as above
    return a;
  }
  function rpCopy(from, to, w, h) {
    touched = true;
    rpFbo ||= gl.createFramebuffer();
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, rpFbo);
    gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pageOf(from.page), 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rpTex[to.page] ||= makePage());
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, to.x, to.y, from.x, from.y, w, h);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  }
  const rpClock = () => performance.now();
  function rpDrop() {
    for (const t of rpTex) if (t) gl.deleteTexture(t);
    rpTex = []; rp = null; repackAlt?.reset();
  }
  // One step of the repack, between frames; true while more is owed.
  function repackWork() {
    if (lost || gl.isContextLost()) return false;
    if (!rp) {
      if (!needRepack || stuck) return false;
      needRepack = false;
      repackAlt ||= createAtlasPacker(ATLAS);
      repackAlt.reset();
      rp = planRepack(liveSprites(), repackAlt);
      if (!rp) { stuck = true; for (const g of retry) { const st = sprites.get(g); if (st) st.wait = false; } retry.clear(); return false; }   // (it will not fit even packed: the SVG shows what has no place)
    }
    if (!stepRepack(rp, rpCopy, rpClock, 2, 16)) return true;
    if (!reconcileRepack(rp, liveSprites(), rpCopy)) { rpDrop(); stuck = true; return false; }
    commitRepack(rp);
    const old = packer;
    packer = rp.packer; repackAlt = old; old.reset();
    for (const t of pageTex) if (t) gl.deleteTexture(t);
    pageTex = rpTex; rpTex = []; rp = null; gen++;
    needRepack = false;
    for (const g of retry) { dirty.add(g); const st = sprites.get(g); if (st) st.wait = false; }
    retry.clear();
    ask();
    return false;
  }
  let reserveT = 0;
  function reserveRun() {
    reserveT = 0;
    if (lost || gl.isContextLost() || pageTex[1]) return;
    const was = glGet(gl, gl.TEXTURE_BINDING_2D);   // (gl-state.js: the record, not the driver)
    pageOf(1);
    gl.bindTexture(gl.TEXTURE_2D, was);
  }
  function reserve() {
    if (reserveT) return;
    reserveT = setTimeout(reserveRun, 120);
  }
  // (This frame's pictures, in painter order: records kept and written again each frame, with the count; and a scratch box.)
  const ITEMS = [], SBOX = new Float64Array(4);
  let ni = 0;
  function takeItem(page, x, y, w, h, ax, ay, a, st) {
    const it = ITEMS[ni] || (ITEMS[ni] = { page: 0, x: 0, y: 0, w: 0, h: 0, ax: 0, ay: 0, a: 0, st: null });   // alloc-rare: one record per picture the most there ever were
    it.page = page; it.x = x; it.y = y; it.w = w; it.h = h; it.ax = ax; it.ay = ay; it.a = a; it.st = st;
    ni++;
  }
  // A drop shadow of a label's rect (kind 8), its centre at (x, y) device px; its reach is three standard deviations.
  function shadowBox(x, y, sh, a) {
    const m = sh.sig * 3 + 1, box = SBOX;
    box[0] = x - sh.hw - m; box[1] = y - sh.hh - m; box[2] = x + sh.hw + m; box[3] = y + sh.hh + m;
    if (box[0] > W || box[1] > H || box[2] < 0 || box[3] < 0) return;
    boxAt(box[0], box[1], box[2], box[3]);
    ucOf(gl).f4a(MU.uBox, box); ucOf(gl).f4(MU.uGeo, x, y, sh.hw, sh.hh); ucOf(gl).f1(MU.uW, sh.r);
    ucOf(gl).f2(MU.uDash, sh.sig, 0); ucOf(gl).f4a(MU.uFill, sh.col); ucOf(gl).f1(MU.uA, Math.min(1, a));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  // A keyboard focus's ring (kind 9) over the label's picture at (x, y) device px.
  function ringDraw(x, y, r, a) {
    const m = r.w / 2 + 1, box = SBOX;
    box[0] = x + r.x0 - m; box[1] = y + r.y0 - m; box[2] = x + r.x1 + m; box[3] = y + r.y1 + m;
    if (box[0] > W || box[1] > H || box[2] < 0 || box[3] < 0) return;
    boxAt(box[0], box[1], box[2], box[3]);
    ucOf(gl).f4a(MU.uBox, box); ucOf(gl).f4(MU.uGeo, x + r.x0, y + r.y0, x + r.x1, y + r.y1); ucOf(gl).f1(MU.uW, r.w);
    ucOf(gl).f4a(MU.uStroke, r.col); ucOf(gl).f1(MU.uA, Math.min(1, a));
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
    nb = 0;
    frameSeq++;
    const now = performance.now();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    if (!host) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
    gl.useProgram(prog); gl.bindVertexArray(vao);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    ucOf(gl).f2(U.uView, W, H); ucOf(gl).i1(U.uT, 0); gl.activeTexture(gl.TEXTURE0);
    let moving = drawProbe();
    moving = drawMarks(now) || moving;
    // (Every label's box and atlas place, in painter order; drawn below as one batch per run of pictures on a page.)
    ni = 0;
    let shifted = 0;   // (pictures standing off their DOM label: glides on their way)
    // (The labels gone at a ride's landing first, under the rest, fading out where they rode; their pictures given back once faded.)
    if (outgoing.length) {
      let kept = 0;
      for (let i = 0; i < outgoing.length; i++) {
        const o = outgoing[i];
        const u = easeMove(Math.min(1, (now - o.t0) / RIDE_MS));
        if (u >= 1 || !o.st.slot) { if (o.st.slot) packer.free(o.st.slot); o.g = null; o.st = null; gpool.push(o); continue; }
        outgoing[kept++] = o; moving = true;
        if (o.x > W || o.y > H || o.x + o.st.w < 0 || o.y + o.st.h < 0) continue;
        takeItem(o.st.slot.page, o.x, o.y, o.st.w, o.st.h, o.st.slot.x, o.st.slot.y, o.a * (1 - u), o.st);
        boxAt(o.x, o.y, o.x + o.st.w, o.y + o.st.h);
      }
      outgoing.length = kept;
    }
    for (const s of last) {
      const { g } = s, rot = !!s.rot;
      const until = live.get(g);
      if (until != null && until < now) { live.delete(g); dirty.add(g); }   // (read once more as it ends)
      const ex = exact.get(g);
      if (ex != null && ex < now) exact.delete(g);
      const st = sprites.get(g);
      if (st?.trk && !st.trk.ended && now >= st.trk.end) { st.trk.ended = true; dirty.add(g); }   // (its animations over: read once more)
      const isLive = live.has(g);
      // (2 Nov 2026, "label-gl fully to the GPU": a label whose look may have changed is described, laid out and painted again between
      // frames (rebuildPass), never here: a frame draws what it has kept, and the SVG shows a label that has no picture yet. todo holds
      // what the pass owes each label: 1 turned, 2 its look changed, 4 its colour ease moved, 8 read it again.)
      if (!st || dirty.has(g) || st.rot !== rot || (isLive && (exact.has(g) || !st.trk || st.trk.carry))) {
        todo.set(g, (todo.get(g) | 0) | 8 | (rot ? 1 : 0) | (dirty.has(g) ? 2 : 0));
        settleSoon();
      }
      if ((!st || st.rot !== rot || (st.mode === 'gl' && !st.slot)) && (pending.has(g) || (st?.wait && !stuck && st.rot === rot))) {
        // (Owed a picture by the pass's next chunk, or by the atlas being packed: shown by no stand-in, the SVG's copy kept hidden.)
        if (!g.hasAttribute('data-gl')) g.setAttribute('data-gl', '');
        continue;
      }
      if (!st || st.rot !== rot || (st.mode === 'gl' && !st.slot)) {   // (no picture of its own yet, or of the other way up, or its place in the atlas given back: the SVG draws it till the pass has made one)
        if (g.hasAttribute('data-gl')) g.removeAttribute('data-gl');
        svgLeft.add(g);
        continue;
      }
      if (st.trk) {
        // (Followed: this frame's colours and opacity from the track, nothing read; a colour ease's picture drawn again as it changes, by the pass.)
        const v = trackAt(st.trk, now);
        if (st.trk.base && v.w !== st.trk.w) { todo.set(g, (todo.get(g) | 0) | 4); settleSoon(); }
        if (v.op != null) st.opacity = v.op;
        if (st.trk.ended && !exact.has(g)) live.delete(g);
      }
      st.held = st.opacity;   // (the opacity it is drawn at this frame, its own)
      if (live.has(g)) moving = true;
      // (Marked in the same frame as the picture is drawn, so neither the SVG's copy and the picture both show, nor neither.)
      if (st.mode !== 'gl') st.held = st.mode === 'none' ? 0 : null;   // (nothing shown, or the SVG's own opacity, not known here: not held)
      if (st.mode !== 'gl') { if (g.hasAttribute('data-gl')) g.removeAttribute('data-gl'); if (st.mode === 'svg') svgLeft.add(g); continue; }
      if (!g.hasAttribute('data-gl')) g.setAttribute('data-gl', '');
      if (!(st.opacity > 0.001)) continue;
      // (The label's origin on a whole device pixel, the picture at its offset from it.)
      let x = Math.round(s.x * dpr) + st.ox, y = Math.round(s.y * dpr) + st.oy, a = Math.min(1, st.opacity);
      const pinned = pinOf(s);
      if (pinned) {
        // (Pinned: at its point now plus its offset, the offset easing from where it was drawn only while a new layout's glide runs.)
        pinOff(s);
        const ox = OFF[0], oy = OFF[1];
        const fi = glides.get(g);
        if (fi?.fadeIn) { const u = easeMove(Math.min(1, (now - fi.t0) / RIDE_MS)); a *= u; if (u >= 1) dropGlide(g); else moving = true; }
        st.pox = ox; st.poy = oy; st.pin = true; st.ppx = PIN[0]; st.ppy = PIN[1];
        let pl = pinLast.get(g); if (!pl) pinLast.set(g, pl = new Float64Array(2));   // alloc-rare: one per pinned label
        pl[0] = ox; pl[1] = oy;
        x = Math.round((PIN[0] + ox) * dpr) + st.ox; y = Math.round((PIN[1] + oy) * dpr) + st.oy;
      } else if (rideM) {
        // (Riding: its centre carried by the camera's move since it was laid out, on a whole device pixel, and kept inside the stage: a
        // label carried past the edge by the zoom stood half off the screen with its leader coming from beyond it, and glided in from there.)
        rideAt(s, st);
        x = RIDE_XY[0]; y = RIDE_XY[1];
        // (A zone title is screen furniture placed by its band, not a figure label: carried and clamped it sat at the stage's edge over the wrong vessels. It is hidden while the camera rides and the layout places it.)
        if ((st.fk ??= g.dataset?.key)?.startsWith('z:')) a = 0;
      } else {
        const gl0 = glides.get(g);
        if (gl0) {
          const u = easeMove(Math.min(1, (now - gl0.t0) / RIDE_MS));
          if (gl0.fadeIn) a *= u; else { x = Math.round(gl0.fx + (x - gl0.fx) * u); y = Math.round(gl0.fy + (y - gl0.fy) * u); if (u < 1) shifted++; }
          if (u >= 1) dropGlide(g); else moving = true;
        }
      }
      if (!pinned) st.pin = false;
      if (fol.on && !pinned) {
        const k = st.fk ??= g.dataset?.key, f = k && fol.m.get(k);
        if (f) { x += Math.round(f.dx * dpr); y += Math.round(f.dy * dpr); } else a *= fol.fade;
      }
      st.dx = x; st.dy = y; st.drawn = now;
      if (x > W || y > H || x + st.w < 0 || y + st.h < 0) continue;
      st.seq = frameSeq;
      takeItem(st.slot.page, x, y, st.w, st.h, st.slot.x, st.slot.y, a, st);
      boxAt(x, y, x + st.w, y + st.h);
    }
    // (Under the pictures, their rects' drop shadows; over them, a keyboard focus's ring: shapes the GPU draws, not pixels in the pictures.)
    let anyShadow = false, anyRing = false;
    for (let i = 0; i < ni; i++) { const q = ITEMS[i].st; if (q?.shadows?.length) anyShadow = true; if (q?.ring) anyRing = true; }
    if (anyShadow) {
      gl.useProgram(mprog); ucOf(gl).f2(MU.uView, W, H); ucOf(gl).i1(MU.uKind, 8);
      for (let i = 0; i < ni; i++) { const it = ITEMS[i], sw = it.st?.shadows; if (sw) for (let j = 0; j < sw.length; j++) shadowBox(it.x + sw[j].cx, it.y + sw[j].cy, sw[j], it.a); }
    }
    if (ni) {
      if (inst.length < ni * 8) inst = new Float32Array(Math.max(ni * 8, inst.length * 2));   // alloc-rare: only when there are more pictures than ever before (doubling)
      for (let i = 0; i < ni; i++) { const it = ITEMS[i], o = i * 8; inst[o] = it.x; inst[o + 1] = it.y; inst[o + 2] = it.w; inst[o + 3] = it.h; inst[o + 4] = it.ax; inst[o + 5] = it.ay; inst[o + 6] = it.a; inst[o + 7] = 0; }
      gl.useProgram(aprog); gl.bindVertexArray(avao);
      ucOf(gl).f2(AU.uView, W, H); ucOf(gl).i1(AU.uT, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, abuf);
      gl.bufferData(gl.ARRAY_BUFFER, inst, gl.DYNAMIC_DRAW, 0, ni * 8);
      // (Consecutive pictures on one page are one draw: a run ends where the page changes.)
      for (let from = 0, to; from < ni; from = to) {
        const page = ITEMS[from].page;
        for (to = from + 1; to < ni && ITEMS[to].page === page; to++);
        gl.bindTexture(gl.TEXTURE_2D, pageOf(page));
        // (WebGL2 has no first-instance argument: the run's start is the attributes' byte offset.)
        gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, from * 32); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, from * 32 + 16);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, to - from);
      }
      gl.bindVertexArray(vao);
    }
    // (The pinned labels' dots and leaders, after the pictures: each label's opacity and place are this frame's by now.)
    if (pinAt) { gl.useProgram(mprog); ucOf(gl).f2(MU.uView, W, H); moving = drawPins(now) || moving; gl.bindVertexArray(vao); }
    if (anyRing) {
      gl.useProgram(mprog); ucOf(gl).f2(MU.uView, W, H); ucOf(gl).i1(MU.uKind, 9);
      for (let i = 0; i < ni; i++) { const it = ITEMS[i]; if (it.st?.ring) ringDraw(it.x, it.y, it.st.ring, it.a); }
    }
    for (let i = 0; i < ni; i++) ITEMS[i].st = null;   // (the pictures are not held past the frame)
    dirty.clear();
    moving = drawScan(now) || moving;   // (the FibroScan probe over the labels, as its layer lay)
    if (!host && holes.length) cutHoles();
    // (In the host's context: its state as its own passes expect to find it.)
    if (host) hostTail();
    // (R09: while a ride or a landing glide has the pictures off their DOM labels, the labels' pointer events are held off, app.css
    // #labels.lb-displaced: a click or a hover would land where the label was. A class between frames; keyboard and focus are untouched.)
    { const off = displacedNow(!!rideM || fol.on, shifted); if (off !== displaced) { displaced = off; classSoon(svg, 'lb-displaced', off); } }
    // (A full atlas is packed again beside the old one, never reset (repackWork). And the second page is made at rest, ahead of the first
    // picture that needs it, once the first is more than half full.)
    if ((needRepack && !stuck) || rp || todo.size) settleSoon();   // (a repack goes on a few copies a frame, and what the pass left over is built next, R11/R12)
    if (!moving && !pageTex[1] && packer.maxPages > 1 && packer.used > packer.size * packer.size * 0.5) reserve();
    if (settleBoxes()) { try { onBoxes?.(); } catch (e) { caught('label-gl:1031', e); /* (a listener's failure is not the labels') */ } }
    // (Nothing drawn at all (every label, mark and probe has a box): the canvas is hidden, so the compositor does not blend a full-stage layer of
    // nothing over the figure on every frame the blood moves. It shows again in the task that draws the first thing back. app.css [data-blank].)
    if (!host) { const empty = nb === 0; if (empty !== blank) { blank = empty; canvas.toggleAttribute('data-blank', empty); } }
    if (nb && coverOpen) { coverOpen(); coverOpen = null; }
    if (moving) ask();
  }
  // ── Holes (1 Nov 2026): the frosted glasses drawn in the figure's canvas, under this one (glass-gl.js onHoles) ──
  // The labels, marks and probes are left out under each, by its fade: what the browser's blur would show of them there is a faint smear.
  // A rounded box is cut as a shape (uKind 6); a callout's outline (its pointer included) from a mask drawn once from its path.
  let holes = [], hpn = -1, HP = new Float64Array(128);
  const HD = [], RAD = new Float64Array(4), HMAT = [1, 0, 0, -1, 0, 0], HSZ = [0, 0], HCH = [true, true, true, true];   // (the last list of holes as numbers; scratch for a mask and a corner: kept)
  let holeMasks = new WeakMap();
  function holeMask(h) {
    const m = holeMasks.get(h.el);
    if (m && m.d === h.d && m.lw === h.lw && m.lh === h.lh && m.dpr === dpr) return m;
    const mw = Math.max(1, Math.ceil(h.lw * dpr)), mh = Math.max(1, Math.ceil(h.lh * dpr));
    return holeMaskGL(h, m, mw, mh);
  }
  // The shaped hole's mask on the GPU: the path's coverage (shape-gl's stencil fill, its edge smoothed) in every channel of a texture of
  // its own, laid as the 2D one was (its first row the path's top). The blend cutHoles set is set again after (the fill leaves it off).
  let holeShape = null;
  function holeMaskGL(h, m, mw, mh) {
    holeShape ||= createShapeGL(gl);
    if (!m?.fbo) {
      m = m || { tex: null, fbo: null, st: null, w: 0, h: 0, d: null, lw: 0, lh: 0, dpr: 0, sw: 0, sh: 0 };   // alloc-rare: one record for each glass with a shaped hole, made the first time it is seen
      m.tex = gl.createTexture(); m.fbo = gl.createFramebuffer(); m.st = gl.createRenderbuffer();
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
    gl.clearBufferfv(gl.COLOR, 0, CLEAR0); gl.clearBufferfi(gl.DEPTH_STENCIL, 0, 1, 0);
    // (Path px → the target's y-down px, turned over so that its first row holds the path's top, as an uploaded canvas's does.)
    const mesh = polyMeshInto(flattenPath(h.d, Math.min(0.25, 0.2 / dpr)), 0, null, HOLE_MESH);
    HMAT[0] = dpr; HMAT[3] = -dpr; HMAT[5] = mh; HSZ[0] = mw; HSZ[1] = mh;
    holeShape.fill(mesh, HMAT, HSZ, HCH);
    holeShape.release(mesh);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    m.d = h.d; m.lw = h.lw; m.lh = h.lh; m.dpr = dpr; m.sw = h.lw * dpr / mw; m.sh = h.lh * dpr / mh;
    holeMasks.set(h.el, m);
    return m;
  }
  // (The canvas's place on the page, read only when the page may have moved it: the stage laid out again (its resize, the window's), its own
  // style changing, a scroll (read in a task after it, once per burst). Never in a frame: a read there, after the stage has written that
  // frame's places, made the browser lay the page out again mid-frame.)
  let holeCr = { left: 0, top: 0 }, holeT = 0;
  function placeHoles() { if (!host) holeCr = canvas.getBoundingClientRect(); }
  const holeGot = (r) => { holeT = 0; holeCr = r; };
  function placeSoon() { if (!host && !holeT) { holeT = 1; rectSoon(canvas).then(holeGot); } }   // (the browser's own next layout hands the box over: no read)
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
        ucOf(gl).f2(RU.uView, W, H); ucOf(gl).f2(RU.uP, x, y); ucOf(gl).f2(RU.uS, w / m.sw, hh / m.sh); ucOf(gl).f2(RU.uO, 0, 0);
        ucOf(gl).f1(RU.uAng, 0); ucOf(gl).i1(RU.uT, 0); ucOf(gl).f1(RU.uA, h.a);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, m.tex);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      } else {
        gl.useProgram(mprog); gl.bindVertexArray(vao);
        ucOf(gl).f2(MU.uView, W, H);
        ucOf(gl).f4(MU.uBox, x - 1, y - 1, x + w + 1, y + hh + 1);
        ucOf(gl).i1(MU.uKind, 6);
        ucOf(gl).f4(MU.uGeo, x, y, w, hh);
        for (let i = 0; i < 4; i++) RAD[i] = h.rad[i] * dpr;
        ucOf(gl).f4a(MU.uR4, RAD);
        ucOf(gl).f4(MU.uFill, 1, 1, 1, 1);
        ucOf(gl).f1(MU.uA, h.a);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
  /** The glasses drawn in the figure's canvas now (client px boxes, their fades, their shapes): the labels leave them out, drawn again at
   *  once when they changed, so the labels and the glass change in the same frame. */
  // (Whether this list of holes is the last one, number by number: no key string is made.)
  function holesSame(list) {
    if (list.length !== hpn) return false;
    for (let i = 0; i < list.length; i++) {
      const h = list[i], o = i * 11, r = h.rad;
      if (HP[o] !== h.x || HP[o + 1] !== h.y || HP[o + 2] !== h.w || HP[o + 3] !== h.h || HP[o + 4] !== h.a || HP[o + 5] !== h.lw || HP[o + 6] !== h.lh || HD[i] !== (h.d || '')) return false;
      if (r && (HP[o + 7] !== r[0] || HP[o + 8] !== r[1] || HP[o + 9] !== r[2] || HP[o + 10] !== r[3])) return false;
    }
    return true;
  }
  function holesKeep(list) {
    if (list.length * 11 > HP.length) HP = new Float64Array(list.length * 22);   // alloc-rare: only when there are more holes than ever before (doubling)
    for (let i = 0; i < list.length; i++) {
      const h = list[i], o = i * 11, r = h.rad;
      HP[o] = h.x; HP[o + 1] = h.y; HP[o + 2] = h.w; HP[o + 3] = h.h; HP[o + 4] = h.a; HP[o + 5] = h.lw; HP[o + 6] = h.lh; HD[i] = h.d || '';
      HP[o + 7] = r ? r[0] : 0; HP[o + 8] = r ? r[1] : 0; HP[o + 9] = r ? r[2] : 0; HP[o + 10] = r ? r[3] : 0;
    }
    hpn = list.length;
  }
  function setHoles(list) {
    if (host || lost) return;
    if (holesSame(list)) return;
    holesKeep(list);
    holes = list;
    if (raf) { cancelFrame(raf); raf = 0; }
    draw();
  }
  // A mark's look, read again while it may be changing: a frame draws the look it has kept and, when it may have changed, owes it to the
  // pass between frames (markPass, as the labels': 2 Nov 2026), which describes it again and keeps the result.
  // (TRACK: a fade or colour ease of its own is read once as it starts and followed (label-track.js); a theme or mode change, each frame.)
  const mtodo = new Map();   // mark → what it is owed: 2 its look changed, 8 read it again
  function markPass() {
    const now = performance.now();
    for (const [el, f] of mtodo) {
      if (!el.isConnected) continue;
      const lk0 = looks.get(el), isLive = markLive.has(el), exactly = markExact.has(el);
      const tracked = TRACK && isLive && !exactly && (!lk0 || lk0.trk !== false || (f & 2) !== 0);
      let st0;
      try { st0 = el.tagName === 'g' ? { op: NUM(styleOf(el).opacity) } : describeMark(el, styleOf); } catch (e) {
        if (e !== MISS) throw e;
        // (Its style not read yet: as it was, or the SVG's for this frame.)
        waiting.add(el); markDirty.delete(el);
        continue;
      }
      const lk = { st: st0, trk: tracked ? false : null, cur: null };
      if (tracked && lk.st) {
        let m;
        let list;
        try { list = takeAnims(el, false); } catch { list = []; }
        if (!list) lk.trk = null;   // (taken just after this frame: followed from the next)
        else {
          try { m = trackOf(list, el, (t) => t === el && el.tagName !== 'g', now); } catch { m = null; }
          if (m) { settleUnder(m, now, lk.st.op); if (m.end <= now) m.ended = true; lk.trk = m; }
        }
      }
      // (A followed mark's look as this frame has it: its opacity and eased colours written into these, never a new object in a frame.)
      if (lk.trk && lk.st) lk.cur = { ...lk.st, sa: new Float64Array(4), fa: new Float64Array(4) };
      looks.set(el, lk);
      if (el.tagName !== 'g' && !markGeo.has(el)) markGeo.set(el, { a0: null, a1: null, a2: null, ok: false, v: new Float64Array(4), d: new Float64Array(4), seq: -1, a: 0, pv: new Float64Array(4), pgen: -1, pok: false, k: null });
    }
    mtodo.clear();
  }
  const lookOf = (el, now) => {
    const lk = looks.get(el);
    const until = markLive.get(el);
    if (until != null && until < now) { markLive.delete(el); markDirty.add(el); }
    const ex = markExact.get(el);
    if (ex != null && ex < now) markExact.delete(el);
    if (lk?.trk && !lk.trk.ended && now >= lk.trk.end) { lk.trk.ended = true; markDirty.add(el); }
    const isLive = markLive.has(el), exactly = markExact.has(el);
    if (!lk || markDirty.has(el) || (isLive && (exactly || !lk.trk))) {
      mtodo.set(el, (mtodo.get(el) | 0) | 8 | (markDirty.has(el) ? 2 : 0));
      settleSoon();
      if (!lk) return false;   // (no look of its own yet: the SVG draws it till the pass has read it)
    }
    if (!lk.trk || !lk.st) return lk.st;
    if (lk.trk.ended && !exactly) markLive.delete(el);
    const v = trackAt(lk.trk, now), out = lk.cur;
    if (v.op != null) out.op = v.op;
    if (lk.trk.paint) {
      const prs = lk.trk.paint.pairs;
      for (let i = 0; i < prs.length; i++) {
        const q = prs[i];
        if (q.prop === 'stroke') out.stroke = mixPre(out.sa, q, v.w) ? out.sa : null;
        else if (q.prop === 'fill') out.fill = mixPre(out.fa, q, v.w) ? out.fa : null;
      }
    }
    return out;
  };
  // An eased pair's colour at w as premultiplied RGBA (0 … 1) written into `out`, no text made (the numeric mixer); false where it is not visible.
  // A pair the mixer does not take (w at an end, a colour that is not rgb()) reads mixColour's own answer, which makes no text either.
  const KEPT4 = [0, 0, 0, 0];
  function mixPre(out, q, w) {
    if (mixRgbaInto(KEPT4, q.from, q.to, w)) {
      const a = KEPT4[3];
      out[0] = KEPT4[0] / 255 * a; out[1] = KEPT4[1] / 255 * a; out[2] = KEPT4[2] / 255 * a; out[3] = a;
      return a > 0;
    }
    const c = mixColour(q.from, q.to, w);
    if (none(c)) return false;
    rgbaInto(out, c);
    return true;
  }
  let markDrawn = 0;   // (the marks, leaders and dots, drawn in the last frame that drew any: for the checks, which look at what the GPU shows)
  // A label's place under a camera ride (device px): its centre carried by the ride's matrix, then held inside the canvas (4 px margin) when
  // it fits. RIDE_XY: [x, y, how far the hold moved it in x, in y].
  // A view change (circuit <-> anatomy): each label's picture, leader and dot carried by how far its own station has moved in the figure
  // (stage.js followStep), in the same frame as the figure, so they never lag it or stand where the other view had them. A label of no
  // station that moves fades out with the change's progress. After it, the carried places hold until the new layout is handed in (sync),
  // from which each glides on.
  const fol = { on: false, end: false, m: new Map(), fade: 1 };
  const RIDE_XY = [0, 0, 0, 0];
  function rideAt(s, st) {
    const x = Math.round(s.x * dpr) + st.ox, y = Math.round(s.y * dpr) + st.oy, M = rideM;
    const cx = (x + st.w / 2) / dpr, cy = (y + st.h / 2) / dpr;
    const ux = Math.round((M[0] * cx + M[2] * cy + M[4]) * dpr - st.w / 2), uy = Math.round((M[1] * cx + M[3] * cy + M[5]) * dpr - st.h / 2);
    const m = 4 * dpr;
    const kx = st.w <= W - 2 * m ? Math.max(m, Math.min(W - m - st.w, ux)) : ux, ky = st.h <= H - 2 * m ? Math.max(m, Math.min(H - m - st.h, uy)) : uy;
    RIDE_XY[0] = kx; RIDE_XY[1] = ky; RIDE_XY[2] = kx - ux; RIDE_XY[3] = ky - uy;
  }
  const labelByKey = new Map();   // (key → the layout's entry for that label, written at each layout: a leader finds its label's glide by it)
  const markGeo = new WeakMap(), MGEO = new Float64Array(4), MBOX = new Float64Array(4), CLEAR = new Float64Array(4);
  // (A mark's line or circle, parsed again only when its attributes changed.)
  function markParse(el, mg, isPath) {
    const a0 = el.getAttribute(isPath ? 'd' : 'cx'), a1 = isPath ? '' : el.getAttribute('cy'), a2 = isPath ? '' : el.getAttribute('r');
    if (mg.a0 === a0 && mg.a1 === a1 && mg.a2 === a2) return;
    mg.a0 = a0; mg.a1 = a1; mg.a2 = a2;
    mg.k = el.getAttribute('data-k');   // (the label a leader belongs to, its line's far end being that label's)
    if (isPath) mg.ok = lineInto(a0, mg.v);
    else { mg.v[0] = NUM(a0); mg.v[1] = NUM(a1); mg.v[2] = NUM(a2); mg.v[3] = 0; mg.ok = true; }
  }
  function drawMarks(now) {
    let moving = false;
    markDrawn = 0;
    if (!marks.length) return false;
    gl.useProgram(mprog);
    ucOf(gl).f2(MU.uView, W, H);
    for (const root of marks) {
      const ro = lookOf(root, now);
      if (markLive.has(root)) moving = true;
      for (const el of root.children) {
        const st = lookOf(el, now);
        if (markLive.has(el)) moving = true;
        let geo = null, folA = 1, mgD = null;
        if (st) {
          // (A leader's line is parsed when its path changes, a dot's centre when its attributes do: kept on the mark, scaled into a scratch.)
          const isPath = el.tagName === 'path';
          const mg = markGeo.get(el);
          mgD = mg;
          if (mg) {
            markParse(el, mg, isPath);
            // (A pinned label's marks are drawn from their geometry as of the layout the GPU was last handed (sync), never a newer one the page
            // already holds: a layout held back (a ride, a solve for another view) wrote its dots and leaders before its labels came, and a dot
            // moved by its point's step from another layout's place stood off its vessel.)
            const pl0 = mg.k ? pinOf(labelByKey.get(mg.k)) : null;
            // (A pinned label's dot and leader are not the page's: drawn below from the point and the label as they are this frame (drawPins),
            // in the look the page gives them, kept here. Its SVG copy stays hidden.)
            if (pl0) {
              let pk = pinLooks.get(mg.k);
              if (!pk) pinLooks.set(mg.k, pk = { line: null, dot: null, halo: null, dotR: 2.4, haloR: 5 });   // alloc-rare: one record per pinned label key
              const cls = el.getAttribute('class') || '';
              if (isPath) pk.line = st; else if (cls.includes('halo')) { pk.halo = st; if (mg.ok) pk.haloR = mg.v[2]; } else { pk.dot = st; if (mg.ok) pk.dotR = mg.v[2]; }
              if (!el.hasAttribute('data-gl')) el.setAttribute('data-gl', '');
              continue;
            }
            const src = pl0 ? mg.pv : mg.v;
            if (pl0 ? mg.pok : mg.ok) { geo = MGEO; for (let i = 0; i < 4; i++) geo[i] = src[i] * dpr; }
            // (A pinned label's dot and leader: moved by its point's step since the layout, in this frame; the leader's label end also by the
            // offset's glide, so the line always runs from the point to the label as drawn. Nothing below moves them again.)
            const pl = geo && mg.k ? pinOf(labelByKey.get(mg.k)) : null;
            if (pl) {
              const dx = (PIN[0] - pl.pax) * dpr, dy = (PIN[1] - pl.pay) * dpr;
              geo[0] += dx; geo[1] += dy;
              if (isPath) {
                pinOff(pl, now);
                geo[2] += dx + (OFF[0] - (pl.x - pl.pax)) * dpr; geo[3] += dy + (OFF[1] - (pl.y - pl.pay)) * dpr;
              }
            }
            if (pl) { /* pinned: placed */ } else {
            // (A camera ride carries the leaders and dots as it carries the labels: each point where the figure's matching point now is, the
            // lines keeping their width and the dots their size. Left where they were laid out, they stretched from their points to the
            // labels that rode on, and spread over the figure, for as long as the ride lasted.)
            // (After a ride's landing each label glides from where it rode to its slot, and its leader's label end goes with it, not to the
            // slot at once: the line was longer than the distance to the label for as long as the glide ran.)
            if (geo && fol.on) {
              const f = mg.k && fol.m.get(mg.k);
              if (f) { for (let i = 0; i < (isPath ? 2 : 1); i++) { geo[i * 2] += f.dx * dpr; geo[i * 2 + 1] += f.dy * dpr; } }
              else folA = fol.fade;
            }
            if (geo && !rideM && isPath && mg.k && glides.size) {
              const ls = labelByKey.get(mg.k), gl0 = ls && glides.get(ls.g), lst = gl0 && !gl0.fadeIn && sprites.get(ls.g);
              if (lst && lst.mode === 'gl') {
                const u = easeMove(Math.min(1, (now - gl0.t0) / RIDE_MS));
                if (u < 1) { geo[2] += (gl0.fx - (Math.round(ls.x * dpr) + lst.ox)) * (1 - u); geo[3] += (gl0.fy - (Math.round(ls.y * dpr) + lst.oy)) * (1 - u); }
              }
            }
            if (geo && rideM) {
              const M = rideM, n = isPath ? 2 : 1;
              for (let i = 0; i < n; i++) {
                const cx = mg.v[i * 2], cy = mg.v[i * 2 + 1];
                geo[i * 2] = (M[0] * cx + M[2] * cy + M[4]) * dpr; geo[i * 2 + 1] = (M[1] * cx + M[3] * cy + M[5]) * dpr;
              }
              // (Its label end goes with the label as the label is drawn: the label keeps its size and is carried by its centre, so its end of
              // the line is the old end moved by the label's own move, not the end carried as geometry, which a zoom pulled off the label's edge
              // by (scale − 1) × its distance from the centre (external review EXT-LBL-2).)
              if (isPath && mg.k) {
                const ls = labelByKey.get(mg.k), lst = ls && sprites.get(ls.g);
                if (lst && lst.mode === 'gl') {
                  rideAt(ls, lst);
                  geo[2] = mg.v[2] * dpr + (RIDE_XY[0] - (Math.round(ls.x * dpr) + lst.ox)); geo[3] = mg.v[3] * dpr + (RIDE_XY[1] - (Math.round(ls.y * dpr) + lst.oy));
                }
              }
            }
            }
          }
        }
        // (A mark this drawing cannot give stays the SVG's; one it draws is hidden there, in the same frame.)
        if (st === false || (st && !geo)) { if (el.hasAttribute('data-gl')) el.removeAttribute('data-gl'); svgLeft.add(el); continue; }
        if (!el.hasAttribute('data-gl')) el.setAttribute('data-gl', '');
        const a = (st?.op ?? 0) * (ro?.op ?? 1) * folA;
        if (!st || !(a > 0.001) || (!st.stroke && !st.fill)) continue;
        const w = st.stroke ? st.w * dpr : 0, m = w / 2 + 2;
        const box = MBOX;
        if (el.tagName === 'path') { box[0] = Math.min(geo[0], geo[2]) - m; box[1] = Math.min(geo[1], geo[3]) - m; box[2] = Math.max(geo[0], geo[2]) + m; box[3] = Math.max(geo[1], geo[3]) + m; }
        else { box[0] = geo[0] - geo[2] - m; box[1] = geo[1] - geo[2] - m; box[2] = geo[0] + geo[2] + m; box[3] = geo[1] + geo[2] + m; }
        if (box[0] > W || box[1] > H || box[2] < 0 || box[3] < 0) continue;
        // (A leader's boxes follow its line in short pieces: one box round a long slanted leader covered a card it never touched, and the
        // card's glass left the figure's canvas while the leader faded with the view, stage.js frostOver.)
        if (el.tagName === 'path') {
          const k = Math.max(1, Math.min(32, Math.ceil(Math.max(Math.abs(geo[2] - geo[0]), Math.abs(geo[3] - geo[1])) / (24 * dpr))));
          for (let i = 0; i < k; i++) {
            const ax = geo[0] + (geo[2] - geo[0]) * i / k, ay = geo[1] + (geo[3] - geo[1]) * i / k, bx = geo[0] + (geo[2] - geo[0]) * (i + 1) / k, by = geo[1] + (geo[3] - geo[1]) * (i + 1) / k;
            boxAt(Math.min(ax, bx) - m, Math.min(ay, by) - m, Math.max(ax, bx) + m, Math.max(ay, by) + m);
          }
        } else boxAt(box[0], box[1], box[2], box[3]);
        ucOf(gl).f4a(MU.uBox, box);
        ucOf(gl).i1(MU.uKind, el.tagName === 'path' ? 0 : 1);
        ucOf(gl).f4a(MU.uGeo, geo);
        ucOf(gl).f1(MU.uW, w);
        ucOf(gl).f2(MU.uDash, st.dash[0] * dpr, st.dash[1] * dpr);
        ucOf(gl).f4a(MU.uStroke, st.stroke || CLEAR);
        ucOf(gl).f4a(MU.uFill, st.fill || CLEAR);
        ucOf(gl).f1(MU.uA, Math.min(1, a));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        markDrawn++;
        if (mgD) { mgD.seq = frameSeq; mgD.a = Math.min(1, a); for (let i = 0; i < 4; i++) mgD.d[i] = geo[i]; }   // (what this frame drew, for the browser check's snapshot: no read, four numbers)
      }
    }
    markDirty.clear();
    return moving;
  }
  // The dots and leaders of the pinned labels: the dot on the point as the figure has it this frame, the leader from that point to where the
  // label's picture is drawn this frame, cut at its edge. Rigid: they cannot lag, stretch on their own or point at nothing. A dot is drawn
  // where the layout gave the label one (pinWant, taken at sync), a leader wherever the picture stands clear of its point.
  const pinLooks = new Map(), pinWant = new Map(), pinDrawn = new Map();
  const PG = new Float64Array(4);
  let defLine = null, defDot = null, PIN_LINE0 = null;
  function pinMark(st, geo, isPath, a) {
    if (!st || !(a > 0.001) || (!st.stroke && !st.fill)) return false;
    const w = st.stroke ? st.w * dpr : 0, m = w / 2 + 2, box = MBOX;
    if (isPath) { box[0] = Math.min(geo[0], geo[2]) - m; box[1] = Math.min(geo[1], geo[3]) - m; box[2] = Math.max(geo[0], geo[2]) + m; box[3] = Math.max(geo[1], geo[3]) + m; }
    else { box[0] = geo[0] - geo[2] - m; box[1] = geo[1] - geo[2] - m; box[2] = geo[0] + geo[2] + m; box[3] = geo[1] + geo[2] + m; }
    if (box[0] > W || box[1] > H || box[2] < 0 || box[3] < 0) return false;
    if (isPath) {
      const k = Math.max(1, Math.min(32, Math.ceil(Math.max(Math.abs(geo[2] - geo[0]), Math.abs(geo[3] - geo[1])) / (24 * dpr))));
      for (let i = 0; i < k; i++) {
        const ax = geo[0] + (geo[2] - geo[0]) * i / k, ay = geo[1] + (geo[3] - geo[1]) * i / k, bx = geo[0] + (geo[2] - geo[0]) * (i + 1) / k, by = geo[1] + (geo[3] - geo[1]) * (i + 1) / k;
        boxAt(Math.min(ax, bx) - m, Math.min(ay, by) - m, Math.max(ax, bx) + m, Math.max(ay, by) + m);
      }
    } else boxAt(box[0], box[1], box[2], box[3]);
    ucOf(gl).f4a(MU.uBox, box);
    ucOf(gl).i1(MU.uKind, isPath ? 0 : 1);
    ucOf(gl).f4a(MU.uGeo, geo);
    ucOf(gl).f1(MU.uW, w);
    ucOf(gl).f2(MU.uDash, st.dash[0] * dpr, st.dash[1] * dpr);
    ucOf(gl).f4a(MU.uStroke, st.stroke || CLEAR);
    ucOf(gl).f4a(MU.uFill, st.fill || CLEAR);
    ucOf(gl).f1(MU.uA, Math.min(1, a));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    markDrawn++;
    return true;
  }
  function drawPins(now) {
    for (const lk of pinLooks.values()) { if (lk.line?.stroke && lk.line.op > 0.5 && !defLine) defLine = lk.line; if (lk.dot && !defDot) defDot = lk.dot; }
    // (No leader seen yet, a Circuit opened with none: the page's leader colour, read once from a leader the page has, else its text's.)
    if (!defLine) defLine = PIN_LINE0 ||= { op: 1, stroke: rgba(readStyle(svg).getPropertyValue('--leader').trim() || readStyle(svg).color), w: 1, fill: null, dash: [0, 0] };   // alloc-rare: once
    for (const s of last) {
      const key = s.g.dataset?.key;
      if (!key || !pinOf(s)) continue;
      const st = sprites.get(s.g);
      if (!st || st.mode !== 'gl' || !(st.opacity > 0.001)) continue;
      const want = pinWant.get(key) | 0, lk = pinLooks.get(key);
      let a = Math.min(1, st.opacity);
      const fi = glides.get(s.g);
      if (fi?.fadeIn) a *= easeMove(Math.min(1, (now - fi.t0) / RIDE_MS));
      const px = PIN[0] * dpr, py = PIN[1] * dpr;
      pinOff(s, now);
      const lx = Math.round((PIN[0] + OFF[0]) * dpr) + st.ox, ly = Math.round((PIN[1] + OFF[1]) * dpr) + st.oy;
      let rec = pinDrawn.get(key);
      if (!rec) pinDrawn.set(key, rec = { seq: -1, hasLine: false, hasDot: false, line: new Float64Array(4), dot: new Float64Array(2), a: 0 });   // alloc-rare: one record per pinned label key
      rec.seq = frameSeq; rec.hasLine = false; rec.hasDot = false; rec.a = a;
      // (The leader: from the point to the picture's edge, where the picture stands more than 10 px clear of it.)
      const cx = lx + st.w / 2, cy = ly + st.h / 2, dx = cx - px, dy = cy - py, hw = st.w / 2, hh = st.h / 2;
      const gap = Math.hypot(Math.max(lx - px, 0, px - (lx + st.w)), Math.max(ly - py, 0, py - (ly + st.h))) / dpr;
      if (gap > 10) {
        const t = 1 - Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
        PG[0] = px; PG[1] = py; PG[2] = px + dx * t; PG[3] = py + dy * t;
        if (pinMark(lk?.line?.stroke ? lk.line : defLine, PG, true, a)) { rec.hasLine = true; for (let i = 0; i < 4; i++) rec.line[i] = PG[i] / dpr; }
      }
      if (want & 1) {
        const ds = lk?.dot || defDot;
        if (lk?.halo) { PG[0] = px; PG[1] = py; PG[2] = lk.haloR * dpr; PG[3] = 0; pinMark(lk.halo, PG, false, a * (lk.halo.op ?? 1)); }
        PG[0] = px; PG[1] = py; PG[2] = (lk?.dotR ?? 2.4) * dpr; PG[3] = 0;
        if (pinMark(ds, PG, false, a * (ds?.op ?? 1))) { rec.hasDot = true; rec.dot[0] = px / dpr; rec.dot[1] = py / dpr; }
      }
    }
    return false;
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
  // (A probe's picture: the record of its texture, kept for good and made again after a lost context; the painter's group and frame are
  // kept too, written before each use: it reads them and keeps neither.)
  const newPic = () => ({ tex: null, fbo: null, w: 0, h: 0, ox: 0, oy: 0, kq: NaN, k: NaN, dpr: 0, ver: -1 });
  const headSp = newPic(), sHeadSp = newPic();
  const lostPic = (sp) => { sp.tex = null; sp.fbo = null; sp.w = sp.h = 0; sp.ver = -1; };
  const PSPEC = { ops: null, opacity: 1, mask: null }, PMAT = [1, 0, 0, -1, 0, 0];
  function picture(sp, w, h, ops) {
    picPaint ||= createOrganPaint(gl, createShapeGL(gl));
    if (!sp.fbo) {
      sp.tex = gl.createTexture(); sp.fbo = gl.createFramebuffer(); sp.w = sp.h = 0;
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
    gl.clearBufferfv(gl.COLOR, 0, CLEAR0);
    // (Turned over: the painter's top row is the target's last, the labels' shader reads the first row as the top.)
    PSPEC.ops = ops; PMAT[5] = h;
    picPaint.paintGroupInto(PSPEC, PMAT, w, h, sp.fbo, w, h);
    PSPEC.ops = null;
    picPaint.endFrame();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.bindVertexArray(vao); gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    return sp;
  }
  // A label's picture drawn by the GPU into its place in the atlas: painted by the shape drawer into the corner of a scratch texture (made
  // once, grown only for a larger label), then copied on the GPU into its rectangle of the atlas page, rows as the atlas keeps them (the
  // top first). Nothing crosses to the CPU and nothing is uploaded.
  let slotTex = null, slotFbo = null, slotW = 0, slotH = 0;
  function paintSlot(slot, lay, ops) {
    touched = true;
    picPaint ||= createOrganPaint(gl, createShapeGL(gl));
    if (!slotTex) { slotTex = gl.createTexture(); slotFbo = gl.createFramebuffer(); slotW = slotH = 0; }
    if (slotW < lay.w || slotH < lay.h) {
      slotW = Math.max(slotW, lay.w, 512); slotH = Math.max(slotH, lay.h, 128);
      gl.bindTexture(gl.TEXTURE_2D, slotTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, slotW, slotH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, slotFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, slotTex, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, slotFbo);
    gl.viewport(0, 0, lay.w, lay.h);
    gl.disable(gl.BLEND);
    gl.clearBufferfv(gl.COLOR, 0, CLEAR0);
    // (Turned over: the painter's top row is the target's last; the copy below keeps the rows, and the atlas's first row is the top.)
    picPaint.paintGroupInto({ ops, opacity: 1, mask: null }, [1, 0, 0, -1, 0, lay.h], lay.w, lay.h, slotFbo, lay.w, lay.h);
    picPaint.endFrame();
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, slotFbo);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, pageOf(slot.page));
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, slot.x, slot.y, 0, 0, lay.w, lay.h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.bindVertexArray(vao);
    gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
  // A shape's fill and stroke as the painter's ops (solid colours as the page computes them), the fill under the stroke as SVG lays them.
  function shapeOps(ops, geom, m, fill, stroke, sw) {
    const f = fill ? parseColor(fill) : null, k = stroke && sw > 0 ? parseColor(stroke) : null;
    if (f && f[3] > 0) ops.push({ geom, m, kind: 'fill', paint: { solid: f }, alpha: 1, clip: null });
    if (k && k[3] > 0) ops.push({ geom, m, kind: 'stroke', paint: { solid: k }, alpha: 1, w: sw, cap: 0, clip: null });
  }
  // ── The Doppler probe (stage.js keeps its numbers in a record, dop-probe.js makeProbeDraw; nothing of it is a page element) ──
  // Its marks are drawn here as shapes (the faded beam a triangle with its gradient, the lines with their round ends, black rim under
  // white line), and its head as a small picture drawn at its angle and size (again only when either changes), under the leaders and
  // labels as the SVG lay. Where it stands, its turn, its draw back and its fades are the record's numbers, written a frame at a time by
  // the stage's ease: nothing is parsed, read from the page or made in a frame. Only its look (colours, widths, the head's outline) is
  // read from a model element of plain styled nodes, in a task of its own after the theme or the model changes, never inside a frame.
  let probe = null, probeSt = null, pLook = null, pLookV = 0, pReadT = 0;
  const pRead = () => {
    pReadT = 0;
    if (!probe?.isConnected) return;
    pLook = probeLookRead(probe); pLook.ver = ++pLookV;
    ask();
  };
  const pReadSoon = () => { if (!pReadT) pReadT = setTimeout(pRead, 0); };
  function setProbe(el, st) {
    if (probe === el && probeSt === st) return;
    probe = el; probeSt = st; pLook = null;
    if (el) pReadSoon();
  }
  const probeStroke = (el) => { const c = readStyle(el); return { col: none(c.stroke) ? null : rgba(c.stroke), w: NUM(c.strokeWidth), cap: c.strokeLinecap, raw: c.stroke, fill: c.fill, join: c.strokeLinejoin }; };
  function probeLookRead(el) {
    const q = (k) => el.querySelector(k);
    // (A stop's colour times its stop-opacity, premultiplied.)
    const stops = [...el.querySelectorAll('.dpr-stop')].map((st) => {
      const c = readStyle(st), [r, g, b, k] = rgba(c.stopColor), a = NUM(c.stopOpacity) * k, u = k > 0 ? a / k : 0;
      return [NUM(st.getAttribute('offset')), [r * u, g * u, b * u, a]];
    });
    const look = {
      stops, ver: 0, hm: [1, 0, 0, 1, 0, 0], headOps: [],
      rimL: probeStroke(q('.dpr-rim-l')), line: probeStroke(q('.dpr-line')), gateRim: probeStroke(q('.dpr-gate-rim')), gate: probeStroke(q('.dpr-gate')),
      // (The head's four shapes, each with its outline flattened once here: the picture is laid from them at every angle.)
      head: ['.dpr-rim', '.dpr-body', '.dpr-face', '.dpr-light'].map((k) => {
        const e = q(k), c = readStyle(e), circle = e.hasAttribute('r') ? [NUM(e.getAttribute('cx')), NUM(e.getAttribute('cy')), NUM(e.getAttribute('r'))] : null;
        return { geom: { poly: circle ? ellipsePoly(circle[0], circle[1], circle[2], circle[2]) : flattenPath(e.getAttribute('d') || '', 0.05) }, fill: none(c.fill) ? '' : c.fill, stroke: none(c.stroke) ? '' : c.stroke, w: NUM(c.strokeWidth) };
      }),
    };
    // (The head's shapes as the painter's ops with a matrix of their own, made here once: a frame writes the angle into the matrix and paints
    // the head again from them, so no ops, shapes or arrays are made in a frame.)
    for (const h of look.head) shapeOps(look.headOps, h.geom, look.hm, h.fill, h.stroke, h.w);
    return look;
  }
  // The frame's working numbers, kept: the probe's turn and place in pixels, the box its marks cover (for the glass), a segment's ends.
  let pCa = 1, pSa = 0, pGx = 0, pGy = 0, pEx0 = 0, pEy0 = 0, pEx1 = 0, pEy1 = 0;
  const pX = (x, y) => (pGx + x * pCa - y * pSa) * dpr, pY = (x, y) => (pGy + x * pSa + y * pCa) * dpr;
  const pGrow = (X, Y) => { if (X < pEx0) pEx0 = X; if (X > pEx1) pEx1 = X; if (Y < pEy0) pEy0 = Y; if (Y > pEy1) pEy1 = Y; };
  const pSegOp = (st, op) => {
    // (One straight piece in the probe's frame: ends in P4, stroked in `st`'s colour and width with round or butt ends, at the probe's opacity.)
    if (!st.col || !(st.w > 0)) return;
    const x0 = pX(P4[0], P4[1]), y0 = pY(P4[0], P4[1]), x1 = pX(P4[2], P4[3]), y1 = pY(P4[2], P4[3]), w = st.w * dpr, m = w / 2 + 2;
    pGrow(x0, y0); pGrow(x1, y1);
    ucOf(gl).i1(MU.uKind, st.cap === 'round' ? 2 : 0);
    ucOf(gl).f4(MU.uBox, Math.min(x0, x1) - m, Math.min(y0, y1) - m, Math.max(x0, x1) + m, Math.max(y0, y1) + m);
    ucOf(gl).f4(MU.uGeo, x0, y0, x1, y1); ucOf(gl).f1(MU.uW, w); ucOf(gl).f2(MU.uDash, 0, 0);
    ucOf(gl).f4a(MU.uStroke, st.col); ucOf(gl).f1(MU.uA, op);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  const P4 = [0, 0, 0, 0], PT0 = [0, 0], PT1 = [0, 0], PT2 = [0, 0], PT = new Float64Array(2);   // (PT: the FibroScan probe's point, below)
  const pSeg = (x0, y0, x1, y1, st, op) => { P4[0] = x0; P4[1] = y0; P4[2] = x1; P4[3] = y1; pSegOp(st, op); };
  function drawProbe() {
    const S = probeSt;
    if (!probe?.isConnected || !S || !S.live || !pLook) return false;   // (the look is read after this frame: pReadSoon)
    const L = pLook, op = Math.min(1, S.op);
    if (!(op > 0.001)) return false;
    const G = S.g, ang = S.ang, ca = Math.cos(ang * Math.PI / 180), sa = Math.sin(ang * Math.PI / 180);
    pCa = ca; pSa = sa; pGx = S.x; pGy = S.y;
    // (Its box, for the glass: every point it is drawn through, grown by the head's reach.)
    pEx0 = pEx1 = S.x * dpr; pEy0 = pEy1 = S.y * dpr;
    gl.useProgram(mprog);
    ucOf(gl).f2(MU.uView, W, H);
    // The faded beam: its gradient runs across the wedge's box from its right edge (the probe's face) to its left (past the far wall).
    if (L.stops.length === 3) {
      PT0[0] = pX(G.dh, 0); PT0[1] = pY(G.dh, 0); PT1[0] = pX(G.far, -G.wk); PT1[1] = pY(G.far, -G.wk); PT2[0] = pX(G.far, G.wk); PT2[1] = pY(G.far, G.wk);
      pGrow(PT0[0], PT0[1]); pGrow(PT1[0], PT1[1]); pGrow(PT2[0], PT2[1]);
      ucOf(gl).i1(MU.uKind, 3);
      ucOf(gl).f4(MU.uBox, Math.min(PT0[0], PT1[0], PT2[0]) - 2, Math.min(PT0[1], PT1[1], PT2[1]) - 2, Math.max(PT0[0], PT1[0], PT2[0]) + 2, Math.max(PT0[1], PT1[1], PT2[1]) + 2);
      ucOf(gl).f2a(MU.uT0, PT0); ucOf(gl).f2a(MU.uT1, PT1); ucOf(gl).f2a(MU.uT2, PT2);
      ucOf(gl).f4(MU.uG, PT0[0], PT0[1], pX(G.far, 0), pY(G.far, 0));
      ucOf(gl).f4a(MU.uS0, L.stops[0][1]); ucOf(gl).f4a(MU.uS1, L.stops[1][1]); ucOf(gl).f4a(MU.uS2, L.stops[2][1]);
      ucOf(gl).f3(MU.uSO, L.stops[0][0], L.stops[1][0], L.stops[2][0]);
      ucOf(gl).f1(MU.uA, op);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    // Rim under line, the line of sight, then the flow axis, then the gate's bars on top (dop-probe.js PROBE_MODEL's order).
    pSeg(G.dh, 0, G.bx1, 0, L.rimL, op); pSeg(G.dh, 0, G.bx1, 0, L.line, op);
    if (G.open) {
      pSeg(-G.axx, -G.axy, G.axx, G.axy, L.rimL, op); pSeg(-G.axx, -G.axy, G.axx, G.axy, L.line, op);
      pSeg(-G.at, -G.half, -G.at, G.half, L.gateRim, op); pSeg(G.at, -G.half, G.at, G.half, L.gateRim, op);
      pSeg(-G.at, -G.half, -G.at, G.half, L.gate, op); pSeg(G.at, -G.half, G.at, G.half, L.gate, op);
    }
    // The head: its picture at its angle and size, drawn again only when either (or its look) changes.
    const hop = op * S.headOp;
    if (hop > 0.001) {
      const k = G.hs;
      if (headSp.ver !== L.ver || Math.abs(headSp.kq - ang) > 0.02 || headSp.k !== k || headSp.dpr !== dpr) {
        // (Its box: the body's −3 … 48 along it, ±11 across, grown for the rim, turned with it.)
        let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
        for (let i = 0; i < 4; i++) {
          const u = i & 1 ? 50 : -5, v = i & 2 ? 14 : -14, X = (u * ca - v * sa) * k * dpr, Y = (u * sa + v * ca) * k * dpr;
          if (X < bx0) bx0 = X; if (X > bx1) bx1 = X; if (Y < by0) by0 = Y; if (Y > by1) by1 = Y;
        }
        const x0 = Math.floor(bx0), y0 = Math.floor(by0), x1 = Math.ceil(bx1), y1 = Math.ceil(by1), M = L.hm;
        // Its shapes filled and stroked on the GPU (the organs' painter, into a texture of its own): no 2D canvas.
        M[0] = ca * k * dpr; M[1] = sa * k * dpr; M[2] = -sa * k * dpr; M[3] = ca * k * dpr; M[4] = -x0; M[5] = -y0;
        picture(headSp, Math.max(1, x1 - x0), Math.max(1, y1 - y0), L.headOps);
        headSp.ver = L.ver; headSp.kq = ang; headSp.k = k; headSp.dpr = dpr; headSp.ox = x0; headSp.oy = y0;
      }
      const hx = pX(G.dh, 0), hy = pY(G.dh, 0);
      gl.useProgram(prog);
      ucOf(gl).f2(U.uView, W, H); ucOf(gl).i1(U.uT, 0);
      gl.bindTexture(gl.TEXTURE_2D, headSp.tex);
      ucOf(gl).f4(U.uR, Math.round(hx) + headSp.ox, Math.round(hy) + headSp.oy, headSp.w, headSp.h); ucOf(gl).f1(U.uA, Math.min(1, hop));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      pGrow(Math.round(hx) + headSp.ox, Math.round(hy) + headSp.oy); pGrow(Math.round(hx) + headSp.ox + headSp.w, Math.round(hy) + headSp.oy + headSp.h);
    }
    boxAt(pEx0 - 4 * dpr, pEy0 - 4 * dpr, pEx1 + 4 * dpr, pEy1 + 4 * dpr);
    return false;
  }
  // ── The FibroScan probe (stage.js scanPaint and scanTick write its SVGs, the model, as before) ──
  // Over the labels, as its layer lay. Its beam (blurred) is a picture drawn once and turned here; its waves are arcs and its cable a
  // line, drawn as shapes each frame; its body, screen and reading a picture drawn at its angle (again only when that or the reading
  // changes); the tip, which taps, a rounded rectangle at its place each frame.
  let scanEl = null, sLook = null, sTracks = [], sReadT = 0, sVer = 0;
  // (Its look read after the frame that changed it, never inside one, and its eases (the turn, the fades, the tip's tap) followed from
  // their own clocks: easeCapture. The waves' opacities and the probe's place change every frame and are read off their attributes.)
  const tipXOf = (t) => { const m = /matrix\(([^)]+)\)/.exec(t || ''); return m ? Number(m[1].split(',')[4]) : /translate(?:X)?\(\s*(-?[\d.]+)px/.exec(t || '') ? Number(/translate(?:X)?\(\s*(-?[\d.]+)px/.exec(t)[1]) : t === 'none' ? 0 : NaN; };
  const PIV = [66, 48];   // (the tip: the point the probe turns about, in its SVGs' own px; stage.js SCAN_TIP)
  // What a frame needs of its look as kept numbers, worked out once per read here (a task of its own): the beam's sector and its two
  // stops premultiplied, the waves' colours with their opacity, the cable's two ends, the tip's colour, and the body, screen and reading
  // as the painter's ops with a matrix of their own, which a frame writes the angle into to paint the head again. Nothing in a frame
  // makes an array, a string or an op.
  const WN = new Float64Array(16), CN = new Float64Array(64), SHC = new Float64Array([-14, 31, 62, 31, -14, 65, 62, 65]);
  function prepScan(L) {
    L.ver = ++sVer;
    L.wavesEl = scanEl.querySelector('.sp-waves');
    L.sec = L.beam.stops.length === 2 ? beamSector(L.beam) : null;
    L.drawn = !!L.sec;
    if (L.drawn) {
      L.st0 = rgbaInto(new Float64Array(4), L.beam.stops[0][1]); L.st1 = rgbaInto(new Float64Array(4), L.beam.stops[1][1]);
      for (let k = 0; k < 4; k++) { L.st0[k] *= L.beam.stops[0][2]; L.st1[k] *= L.beam.stops[1][2]; }
    }
    for (const w of [L.front, L.rip]) if (w) { w.pm = new Float64Array(4); for (let k = 0; k < 4; k++) w.pm[k] = w.col[k] * w.so; }
    L.cp = null;
    const nc = readNums(L.cable.d || '', 0, CN);
    if (nc >= 4) L.cp = new Float64Array([CN[0], CN[1], CN[nc - 2], CN[nc - 1]]);
    L.tip.fa = rgbaInto(new Float64Array(4), L.tip.fill);
    L.hm = [1, 0, 0, 1, 0, 0]; L.headOps = null;
    if (glyphsReady()) {
      const ops = [];
      for (const b of [L.body, L.screen]) shapeOps(ops, { poly: roundRectPoly(b.x, b.y, b.w, b.h, b.rx) }, L.hm, b.fill, b.stroke, b.sw);
      const look = (r) => ({ weight: r.weight, size: r.size, tnum: r.tnum, ls: r.ls || 0 });
      const ws = L.read.runs.map((r) => textWidth(r.t, look(r)));
      let w = 0; ws.forEach((q, i) => { w += (i ? L.read.runs[i].dx : 0) + q; });
      let x = L.read.anchor === 'middle' ? L.read.x - w / 2 : L.read.anchor === 'end' ? L.read.x - w : L.read.x;
      L.read.runs.forEach((r, i) => {
        if (i) x += r.dx;
        if (r.fill) shapeOps(ops, { poly: textPolys(r.t, x, L.read.y, look(r)).polys }, L.hm, r.fill, '', 0);
        x += ws[i];
      });
      L.headOps = ops;
    }
  }
  const sRead = () => {
    sReadT = 0;
    if (!scanEl?.isConnected) return;
    const now = performance.now(), q = (k) => scanEl.querySelector(k);
    sLook = scanLookRead(scanEl);
    const L = sLook;
    if (L) prepScan(L);
    if (L) sTracks = easeCapture([[scanEl, 'opacity', parseFloat, (v) => { L.op = v; }], [scanEl.querySelectorAll(':scope > .sp-svg')[1], 'transform', (t) => (t === 'none' ? 0 : /matrix/.test(t) ? angOf(t) : NaN), (v) => { L.ang = v; }],
      [q('.sp-head'), 'opacity', parseFloat, (v) => { L.headOp = v; }], [q('.sp-cable'), 'opacity', parseFloat, (v) => { L.cableOp = v; }], [q('.sp-tip'), 'transform', tipXOf, (v) => { L.tipX = v; }]], now);
    ask();
  };
  const sReadSoon = () => { if (!sReadT) sReadT = setTimeout(sRead, 0); };
  const smo = new MutationObserver((rs) => { if (rs.some((r) => changed(r) && r.target !== scanEl && !r.target.closest?.('.sp-waves'))) sReadSoon(); ask(); });
  const holdScan = () => { sReadSoon(); ask(); };
  const noop = () => {};
  const scanGlyphs = () => { sReadSoon(); ask(); };   // (the reading's outlines came: its head is made with them)
  // (Handed over by the stage in a frame, taken up in a task of its own: its observers, listeners and glyph wait are set then.)
  let scanWant = null, scanSwapT = 0;
  function setScan(el) {
    if (scanWant === el) return;
    scanWant = el;
    if (!scanSwapT) scanSwapT = setTimeout(scanSwap, 0);
  }
  function scanSwap() {
    scanSwapT = 0;
    const el = scanWant;
    if (scanEl === el) return;
    scanEl?.removeAttribute('data-gl');
    scanEl = el; sLook = null; sTracks = []; lostPic(sHeadSp);
    if (el) sReadSoon();
    if (el && !glyphsReady()) loadGlyphs().then(scanGlyphs, noop);   // (the reading's outlines, ahead of its first picture)
    smo.disconnect();
    ask();
    if (!el) return;
    smo.observe(el, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style'], characterData: true, childList: true });
    for (const t of ['transitionrun', 'transitionend', 'transitioncancel', 'animationstart', 'animationend', 'animationcancel']) el.addEventListener(t, holdScan, true);
  }
  const angOf = (t) => { const m = /matrix\(([^)]+)\)/.exec(t || ''); if (!m) return 0; const v = m[1].split(',').map(Number); return Math.atan2(v[1], v[0]); };
  function scanLookRead(el) {
    const q = (k) => el.querySelector(k), scs = (e) => getComputedStyle(e);
    const svgs = el.querySelectorAll(':scope > .sp-svg'), beam = q('.sp-beam'), body = q('.sp-body'), tip = q('.sp-tip'), screen = q('.sp-screen'), cable = q('.sp-cable'), read = q('.sp-read');
    if (svgs.length !== 2 || !beam || !body || !tip || !screen || !read) return null;
    const bc = scs(beam), stops = [...el.querySelectorAll('#sp-beam .sp-stop')].map((st) => { const c = scs(st); return [NUM(st.getAttribute('offset')), c.stopColor, NUM(c.stopOpacity)]; });
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
  // A point of the FibroScan probe's own px as its stage px × density, in PT (it turns about the tip).
  let sgx = 0, sgy = 0, sca = 1, ssa = 0;
  function sat(u, v) {
    PT[0] = (sgx + (u - PIV[0]) * sca - (v - PIV[1]) * ssa) * dpr;
    PT[1] = (sgy + (u - PIV[0]) * ssa + (v - PIV[1]) * sca) * dpr;
  }
  function drawScan(now) {
    if (!scanEl?.isConnected) return false;
    if (!sLook) return false;   // (read after this frame: sReadSoon)
    const live = easeStep(sTracks, now), L = sLook;
    // (The beam's blur needs the canvas's filter only where the 2D picture draws it: the shader's sector needs none, as on Safari.)
    // (A beam the shader cannot draw as its sector (another markup), or ?beamgl=0: the SVG keeps the probe.)
    if (!L.drawn) { if (scanEl.hasAttribute('data-gl')) scanEl.removeAttribute('data-gl'); return live; }
    if (!scanEl.hasAttribute('data-gl')) scanEl.setAttribute('data-gl', '');
    if (!(L.op > 0.001)) return live;
    const tf = scanEl.style.transform || '';
    let j = tf.indexOf('translate(');
    if (j < 0) return live;
    j = numFrom(tf, j + 10, true);
    if (j < 0) return live;
    const tx = NUM_V;
    if (numFrom(tf, j, false) < 0) return live;
    // (Its box stands at the written place, raised by half its height (app.css translate: 0 −50%); its SVGs turn about the tip.)
    const px = tx + PIV[0], py = NUM_V, ca = Math.cos(L.ang), sa = Math.sin(L.ang);
    sgx = px; sgy = py; sca = ca; ssa = sa;
    // (Its box, for the glass: everything it draws lies within 170 px of the tip: the beam's 150 px arc and its blur, the body.)
    boxAt((px - 170) * dpr, (py - 170) * dpr, (px + 170) * dpr, (py + 170) * dpr);
    // The beam: a soft sector drawn by the shader (kind 7), its blur worked out per pixel, so no picture of it is made off the GPU.
    const bsec = L.sec;
    sat(bsec.apex[0], bsec.apex[1]);
    const ax = PT[0], ay = PT[1];
    sat(L.beam.grad[0], L.beam.grad[1]);
    const gx = PT[0], gy = PT[1], R = bsec.r * dpr, sg = bsec.blur * dpr, bm = R + 4 * sg + 2;
    gl.useProgram(mprog);
    ucOf(gl).f2(MU.uView, W, H);
    ucOf(gl).i1(MU.uKind, 7);
    ucOf(gl).f4(MU.uBox, ax - bm, ay - bm, ax + bm, ay + bm);
    ucOf(gl).f4(MU.uGeo, ax, ay, R, L.beam.grad[2] * dpr);
    ucOf(gl).f4(MU.uR4, bsec.dir + L.ang, bsec.half, gx, gy);
    ucOf(gl).f1(MU.uW, sg);
    ucOf(gl).f4a(MU.uS0, L.st0); ucOf(gl).f4a(MU.uS1, L.st1); ucOf(gl).f3(MU.uSO, L.beam.stops[0][0], L.beam.stops[1][0], 1);
    ucOf(gl).f1(MU.uA, Math.min(1, L.op));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // The waves: each packet's arcs (read off the probe's model every frame, where scanTick writes them), at the packet's opacity.
    sat(PIV[0], PIV[1]);
    const cx = PT[0], cy = PT[1], wv = L.wavesEl ? L.wavesEl.children : null;
    if (wv) {
      for (let a = 0; a < wv.length; a++) {
        const pk = wv[a];
        if (!pk.classList.contains('sp-pk')) continue;
        const po = NUM(pk.style.opacity === '' ? '1' : pk.style.opacity);
        if (!(po > 0.001)) continue;
        const kids = pk.children;
        for (let b = 0; b < kids.length; b++) {
          const path = kids[b];
          if (readNums(path.getAttribute('d') || '', 0, WN) < 9) continue;
          const st = path.classList.contains('sp-front') ? L.front : L.rip;
          if (!st) continue;
          const r = WN[2], a0 = Math.atan2(WN[1] - PIV[1], WN[0] - PIV[0]) + L.ang, a1 = Math.atan2(WN[8] - PIV[1], WN[7] - PIV[0]) + L.ang, wr = r * dpr, w = st.w * dpr;
          ucOf(gl).i1(MU.uKind, 4);
          ucOf(gl).f4(MU.uBox, cx - wr - w - 2, cy - wr - w - 2, cx + wr + w + 2, cy + wr + w + 2);
          ucOf(gl).f4(MU.uGeo, cx, cy, wr, 0); ucOf(gl).f4(MU.uR4, a0, a1 < a0 ? a1 + Math.PI * 2 : a1, 0, 0); ucOf(gl).f1(MU.uW, w);
          ucOf(gl).f4a(MU.uStroke, st.pm); ucOf(gl).f1(MU.uA, Math.min(1, L.op * po));
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
      }
    }
    // The cable's short stub (a straight line written as a curve), round-ended, fading with the head.
    if (L.cp && L.cable.col && L.cableOp > 0.001) {
      sat(L.cp[0], L.cp[1]);
      const x0 = PT[0], y0 = PT[1];
      sat(L.cp[2], L.cp[3]);
      const x1 = PT[0], y1 = PT[1], w = L.cable.w * dpr, m = w / 2 + 2;
      ucOf(gl).i1(MU.uKind, L.cable.cap === 'round' ? 2 : 0);
      ucOf(gl).f4(MU.uBox, Math.min(x0, x1) - m, Math.min(y0, y1) - m, Math.max(x0, x1) + m, Math.max(y0, y1) + m);
      ucOf(gl).f4(MU.uGeo, x0, y0, x1, y1); ucOf(gl).f1(MU.uW, w); ucOf(gl).f2(MU.uDash, 0, 0);
      ucOf(gl).f4a(MU.uStroke, L.cable.col); ucOf(gl).f1(MU.uA, Math.min(1, L.op * L.cableOp));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    if (L.headOp > 0.001 && L.headOps && glyphsReady()) {
      // The body, its screen and the reading: a picture at the probe's angle, painted again when that or the reading changes.
      const aq = Math.round(L.ang * 10000);
      if (sHeadSp.ver !== L.ver || sHeadSp.kq !== aq || sHeadSp.dpr !== dpr) {
        let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
        for (let i = 0; i < 8; i += 2) {
          const qx = ((SHC[i] - PIV[0]) * ca - (SHC[i + 1] - PIV[1]) * sa) * dpr, qy = ((SHC[i] - PIV[0]) * sa + (SHC[i + 1] - PIV[1]) * ca) * dpr;
          bx0 = Math.min(bx0, qx); by0 = Math.min(by0, qy); bx1 = Math.max(bx1, qx); by1 = Math.max(by1, qy);
        }
        const x0 = Math.floor(bx0), y0 = Math.floor(by0), x1 = Math.ceil(bx1), y1 = Math.ceil(by1), m = L.hm;
        // (The turn about the tip, then the picture's corner: the ops' matrix, written in place.)
        m[0] = ca * dpr; m[1] = sa * dpr; m[2] = -sa * dpr; m[3] = ca * dpr;
        m[4] = ca * dpr * -PIV[0] + -sa * dpr * -PIV[1] - x0; m[5] = sa * dpr * -PIV[0] + ca * dpr * -PIV[1] - y0;
        picture(sHeadSp, Math.max(1, x1 - x0), Math.max(1, y1 - y0), L.headOps);
        sHeadSp.ver = L.ver; sHeadSp.kq = aq; sHeadSp.dpr = dpr; sHeadSp.ox = x0; sHeadSp.oy = y0;
      }
      gl.useProgram(prog);
      ucOf(gl).f2(U.uView, W, H); ucOf(gl).i1(U.uT, 0);
      gl.bindTexture(gl.TEXTURE_2D, sHeadSp.tex);
      ucOf(gl).f4(U.uR, Math.round(px * dpr) + sHeadSp.ox, Math.round(py * dpr) + sHeadSp.oy, sHeadSp.w, sHeadSp.h); ucOf(gl).f1(U.uA, Math.min(1, L.op * L.headOp));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      // The tip, over the body, at its tap's place along the probe.
      const t = L.tip;
      if (t.fill) {
        sat(t.x + t.w / 2 + L.tipX, t.y + t.h / 2);
        const tcx = PT[0], tcy = PT[1];
        gl.useProgram(mprog);
        ucOf(gl).f2(MU.uView, W, H);
        ucOf(gl).i1(MU.uKind, 5);
        const TR = Math.hypot(t.w, t.h) / 2 * dpr + 2;
        ucOf(gl).f4(MU.uBox, tcx - TR, tcy - TR, tcx + TR, tcy + TR);
        ucOf(gl).f4(MU.uGeo, tcx, tcy, t.w / 2 * dpr, t.h / 2 * dpr); ucOf(gl).f1(MU.uW, Math.min(t.rx, t.w / 2, t.h / 2) * dpr); ucOf(gl).f4(MU.uR4, L.ang, 0, 0, 0);
        ucOf(gl).f4a(MU.uFill, t.fa); ucOf(gl).f1(MU.uA, Math.min(1, L.op * L.headOp));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }
    return live;
  }
  const WAS = new Set(), NOW2 = new Set(), SVGL = [], CNT = { marksDrawn: 0, labels: 0, svg: 0, marks: 0 };   // (kept: a layout, the SVG's list and the counts make none)
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
    svgLeft: () => { SVGL.length = 0; for (const el of svgLeft) SVGL.push(el); return SVGL; },
    /** The ?perf surfaces list (gpu-surfaces.js): the labels laid out at the last picture, and how many of them the SVG drew itself. */
    counts: () => {
      let sv = 0, mk = 0;
      for (const s of last) if (svgLeft.has(s.g)) sv++;
      for (const el of svgLeft) { let own = false; for (const s of last) if (s.g === el) { own = true; break; } if (!own) mk++; }
      CNT.marksDrawn = markDrawn; CNT.labels = last.length; CNT.svg = sv; CNT.marks = mk;
      return CNT;
    },
    /** What the last picture drew, as boxes [left, top, right, bottom] (CSS px from the canvas's corner). */
    get boxes() { return boxes; },
    get lost() { return lost; },
    /** This frame's labels: drawn now, in the same frame as the SVG's layout. */
    sync(list) {
      if (lost) return;
      // Compare the density actually used by this canvas. On a 3x screen its 2x cap otherwise looked like a density change on every sync,
      // repeatedly scheduling a resize task and another GPU draw throughout a gesture.
      if ((host ? (devicePixelRatio || 1) : labelDensity(devicePixelRatio)) !== dpr) densityChanged();
      take(mo.takeRecords());
      for (const r of mmo.takeRecords()) { if (!changed(r)) continue; const el = markOf(r.target); if (el) markDirty.add(el); }
      // A sliced landing or a value refresh may sync while the camera still carries the old layout. Taking its new positions here
      // would apply that camera move twice. rideEnd hands the drawn positions to the first sync of the landed layout instead.
      if (rideM || (fol.on && !fol.end)) { ask(); return; }
      if (fol.on) { fol.on = false; fol.end = false; fol.m.clear(); fol.fade = 1; }   // (the new layout is in: the carried places are done, each label glides on from where it was drawn)
      WAS.clear();
      for (const s of last) WAS.add(s.g);
      // (The first layout after a ride: each label that stays glides from where it rode, a new one fades in, one that goes fades out.)
      const from = rideFrom;
      rideFrom = null;
      if (from) {
        const t0 = performance.now();
        NOW2.clear();
        for (const s of list) NOW2.add(s.g);
        for (const s of list) {
          const f = from.get(s.g);
          dropGlide(s.g);
          const r = takeRec();
          r.t0 = t0; r.fadeIn = !f;
          if (f) { r.fx = f.x; r.fy = f.y; }
          glides.set(s.g, r);
        }
        for (const [g, f] of from) {
          if (NOW2.has(g)) continue;
          const st = sprites.get(g);
          if (st?.slot && st.mode === 'gl') { const o = takeRec(); o.g = g; o.st = st; o.x = f.x; o.y = f.y; o.a = f.a; o.t0 = t0; outgoing.push(o); sprites.delete(g); }
        }
        for (const f of from.values()) gpool.push(f);
        from.clear();
      }
      // (Pinned labels take their layout's offset at once; no glide. A ride's or a follow's glide is not theirs.)
      if (pinAt) for (const x of list) if (x.pid != null && glides.get(x.g)?.fadeIn !== true) dropGlide(x.g);
      last = list; gen++; stuck = false;
      // (The marks as they stand with this layout: what a pinned label's dot and leader are drawn from until the next.)
      for (const root of marks) for (const el of root.children) {
        if (el.tagName === 'g') continue;
        let mg = markGeo.get(el);
        if (!mg) markGeo.set(el, mg = { a0: null, a1: null, a2: null, ok: false, v: new Float64Array(4), d: new Float64Array(4), seq: -1, a: 0, pv: new Float64Array(4), pgen: -1, pok: false, k: null });   // alloc-rare: once per mark element
        markParse(el, mg, el.tagName === 'path');
        mg.pv.set(mg.v); mg.pok = mg.ok; mg.pgen = gen;
      }
      // (Which pinned labels the layout gave a dot (1) or a leader (4): drawPins draws them so until the next layout.)
      pinWant.clear();
      for (const root of marks) for (const el of root.children) {
        const k = el.getAttribute('data-k');
        if (!k) continue;
        const cls = el.getAttribute('class') || '';
        pinWant.set(k, (pinWant.get(k) | 0) | (el.tagName === 'path' ? 4 : cls.includes('halo') ? 2 : 1));
      }
      labelByKey.clear();
      for (const s of list) { const k = s.g.dataset?.key; if (k) labelByKey.set(k, s); }
      for (const s of list) WAS.delete(s.g);
      for (const g of WAS) { g.removeAttribute('data-gl'); todo.delete(g); dropGlide(g); const st = sprites.get(g); if (st) { packer.free(st.slot); sprites.delete(g); } live.delete(g); }
      if (host) { ask(); return; }
      if (raf) { cancelFrame(raf); raf = 0; }
      draw();
    },
    /** Whether the labels can ride a camera move on the GPU. A label the SVG still draws (one with a glyph Inter's cut lacks, as the Circuit's
     *  "Epigastric → SVC" caption) cannot be carried: the stage fades it with the leaders for the ride (app.css lb-ride), it is back at the landing. */
    canRide() { return !lost && !host; },
    /** A camera move's carry, [a, b, c, d, e, f] (where the labels were laid out, stage px, to where that point is now), drawn now. */
    ride(m) {
      if (lost) return;
      if (m && !rideM) {
        rideT0 = performance.now();
        // The caller alternates and refills two lists. Own this ride's layout until it ends, even across several syncs.
        last = last.slice();   // alloc-rare: once when a camera ride starts, never on its steps
      }
      rideM = m;
      for (const r of glides.values()) gpool.push(r);
      glides.clear();
      if (raf) { cancelFrame(raf); raf = 0; }
      draw();
    },
    /** The ride is over: the next layout (sync) glides each label on from where it rode. */
    rideEnd() {
      if (!rideM) return;
      rideM = null;
      for (const f of fromMap.values()) gpool.push(f);
      fromMap.clear();
      for (const s of last) {
        const st = sprites.get(s.g);
        if (st && st.mode === 'gl' && st.drawn >= rideT0 && !(st.fk ??= s.g.dataset?.key)?.startsWith('z:')) { const f = takeRec(); f.x = st.dx; f.y = st.dy; f.a = Math.min(1, st.opacity); fromMap.set(s.g, f); }
      }
      rideFrom = null;   // (no glide from where the labels rode: the layout stands as it lands)
      for (const f of fromMap.values()) gpool.push(f);
      fromMap.clear();
    },
    /** The pictures owed are built without a frame budget for the next `ms` (a view change has landed and shows its labels at once). */
    rush(ms) { rushUntil = performance.now() + ms; },
    get riding() { return !!rideM; },
    /** Pins the station labels to the figure: f(id, out) writes where the figure has station id's point now (stage px) and returns true. */
    pinTo(f, w = null) { pinAt = f; pinWorldAt = w; ask(); },
    /** The figure moved (its camera or its morph): the pinned labels drawn with it, in this frame. */
    pinDraw() { if (lost || !pinAt) return; if (raf) { cancelFrame(raf); raf = 0; } draw(); },
    /** A view change begins: the labels now laid out are carried by their stations (followPut), the rest faded (followDraw). */
    followStart() { fol.on = true; fol.end = false; fol.fade = 1; rideT0 = performance.now(); },
    /** How far a label's station has moved since the layout (CSS px). A label with none is faded by followDraw's `fade`. */
    followPut(key, dx, dy) { let f = fol.m.get(key); if (!f) { f = { dx: 0, dy: 0 }; fol.m.set(key, f); } f.dx = dx; f.dy = dy; },   // alloc-rare: a record per label, once
    followDraw(fade) { if (lost || !fol.on) return; fol.fade = fade; if (raf) { cancelFrame(raf); raf = 0; } draw(); },
    /** The change is over: the carried places stand till the next layout (sync) is handed in, which each label glides on from. */
    followEnd() {
      if (!fol.on) return;
      for (const f of fromMap.values()) gpool.push(f);
      fromMap.clear();
      for (const s of last) {
        const st = sprites.get(s.g);
        if (st && st.mode === 'gl' && st.drawn >= rideT0) { const f = takeRec(); f.x = st.dx; f.y = st.dy; f.a = Math.min(1, st.opacity * (fol.m.has(st.fk) ? 1 : fol.fade)); fromMap.set(s.g, f); }
      }
      rideFrom = fromMap.size ? fromMap : null;
      fol.end = true;
    },
    get following() { return fol.on; },
    /** Where each label's picture stood in the last frame, keyed: [{ key, x, y, w, h, a (its opacity) }] in CSS px from the canvas's corner (the browser check's lag test). */
    drawnLabels() {
      const o = [];   // alloc-rare: asked only by the browser check
      for (const s of last) { const st = sprites.get(s.g); if (st && st.mode === 'gl' && st.drawn && s.g.dataset?.key) o.push({ key: s.g.dataset.key, x: st.dx / dpr, y: st.dy / dpr, w: st.w / dpr, h: st.h / dpr, a: st.held ?? 0 }); }
      return o;
    },
    /** What the last frame drew, for the browser checks: { seq (frames drawn), gen (layout and atlas generation), items: [{ key, x, y, w, h, a, clipped }] }
     *  in CSS px from the canvas's corner (stage.js labelSnapshot adds the corner, so they are page px). Only the pictures drawn in that frame. */
    snapshot() {
      const items = [];   // alloc-rare: asked only by the browser check
      for (const s of last) {
        const st = sprites.get(s.g);
        if (st && st.mode === 'gl' && st.seq === frameSeq && s.g.dataset?.key) { const it = snapshotItem(s.g.dataset.key, st.dx, st.dy, st.w, st.h, st.held ?? 0, dpr, W, H); it.pin = !!st.pin; if (st.pin) { it.px = st.ppx; it.py = st.ppy; } it.glide = glides.has(s.g); items.push(it); }
      }
      // (The marks this frame drew: each dot's centre and radius, each leader's two ends, keyed by its label, CSS px from the canvas's corner.)
      const marksOut = [];   // alloc-rare: asked only by the browser check
      for (const root of marks) for (const el of root.children) {
        const mg = markGeo.get(el);
        if (!mg || mg.seq !== frameSeq) continue;
        const d = mg.d, line = el.tagName === 'path';
        marksOut.push({ k: el.getAttribute('data-k') || '', kind: line ? 'line' : el.getAttribute('class') || 'dot', x0: d[0] / dpr, y0: d[1] / dpr, x1: line ? d[2] / dpr : d[0] / dpr, y1: line ? d[3] / dpr : d[1] / dpr, r: line ? 0 : d[2] / dpr, a: mg.a });
      }
      for (const [k, r] of pinDrawn) {
        if (r.seq !== frameSeq) continue;
        if (r.hasDot) marksOut.push({ k, kind: 'leader-dot', x0: r.dot[0], y0: r.dot[1], x1: r.dot[0], y1: r.dot[1], r: 2.4, a: r.a });
        if (r.hasLine) marksOut.push({ k, kind: 'line', x0: r.line[0], y0: r.line[1], x1: r.line[2], y1: r.line[3], r: 0, a: r.a });
      }
      return { seq: frameSeq, gen, items, marks: marksOut };
    },
    /** A label animated by script (the Web Animations API, which sends no events): read each frame for `ms`. */
    hold(g, ms) {
      if (!g) return;
      if (markOf(g)) { markDirty.add(g); markLive.set(g, performance.now() + ms + 100); } else { dirty.add(g); live.set(g, performance.now() + ms + 100); }
      ask();
    },
  };
}
