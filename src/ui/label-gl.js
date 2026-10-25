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

import { frameFor, cancelFrame } from './frame.js?v=19b3f2915c';

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
uniform int uKind;          // 0: a line (butt ends), 1: a circle
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
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  const U = Object.fromEntries(['uR', 'uView', 'uT', 'uA'].map((k) => [k, gl.getUniformLocation(prog, k)]));
  const mprog = gl.createProgram();
  gl.attachShader(mprog, sh(gl.VERTEX_SHADER, MVS)); gl.attachShader(mprog, sh(gl.FRAGMENT_SHADER, MFS)); gl.linkProgram(mprog);
  if (!gl.getProgramParameter(mprog, gl.LINK_STATUS)) return null;
  const MU = Object.fromEntries(['uBox', 'uView', 'uKind', 'uGeo', 'uW', 'uDash', 'uStroke', 'uFill', 'uA'].map((k) => [k, gl.getUniformLocation(mprog, k)]));
  const vao = gl.createVertexArray();
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
    if (!st) { st = { mode: 'none', key: '', tex: null }; sprites.set(g, st); }
    const d = describeBlock(g);
    st.mode = !d ? 'none' : svgOnly(d) ? 'svg' : 'gl';
    if (st.mode !== 'gl') return st;
    const key = lookKey(d, rot, dpr);
    if (st.key !== key) {
      const at = drawBlock(scratch, d, dpr, rot);
      if (!at) { st.mode = 'none'; return st; }
      st.tex ||= gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, st.tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scratch);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      Object.assign(st, at, { key });
    }
    st.opacity = d.opacity;
    return st;
  }
  function draw() {
    if (lost || gl.isContextLost()) return;
    const now = performance.now();
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(prog); gl.bindVertexArray(vao);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform2f(U.uView, W, H); gl.uniform1i(U.uT, 0); gl.activeTexture(gl.TEXTURE0);
    let moving = drawMarks(now);
    gl.useProgram(prog);
    gl.uniform2f(U.uView, W, H); gl.uniform1i(U.uT, 0);
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
      gl.bindTexture(gl.TEXTURE_2D, st.tex);
      gl.uniform4f(U.uR, x, y, st.w, st.h); gl.uniform1f(U.uA, Math.min(1, st.opacity));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    dirty.clear();
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
  return {
    canvas,
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
      for (const g of was) { g.removeAttribute('data-gl'); const st = sprites.get(g); if (st) { if (st.tex) gl.deleteTexture(st.tex); sprites.delete(g); } live.delete(g); }
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
