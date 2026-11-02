// The figure callouts' frosted glass drawn on the GPU (his pick, 25 Oct: "GPU glass"). The callouts stay HTML, and each one's
// glass (.cl-glass, callout.js) keeps its shape and its 2 px outline; only the blur and the tint behind it move here, to one
// WebGL2 canvas laid just under the callout layers. The browser's backdrop blur redrew every callout over the moving figure on
// every frame; here a small copy of the figure (a quarter of its size: the blur hides the rest) is taken without waiting
// (createImageBitmap), blurred once in two passes, and each callout's shape is cut from it.
// What differs from the browser's glass: only the GPU's figure (veins-gl: the plate, the vessels, the blood) is under the blur;
// the SVG drawn over it (stents, guides) and the labels are hidden behind the glass rather than blurred into it.
// Off (the browser's glass, as before): no WebGL2, a software renderer, ?gpulabels=0, Settings' blur effect off, reduced
// transparency, a browser without backdrop blur (whose solid card stays), or a copy the browser refuses.

import { GLASS_SHARE, shareFor, sharePrep, sharePlan, shareTurn, shareUse, shareRelease, shareBytes } from './blur-share.js?v=810f5774b8';
import { glCap, fbComplete } from './gl-state.js?v=4163c507aa';
import { hold } from './gpu-budget.js?v=5a5dcd699f';
import { gpuProbe, COUNTED } from './gpu-probe.js?v=625c2c9315';
import { finalFrameFor, readFrameFor, framePhase, frameCount, cancelFrame, noteDraw } from './frame.js?v=1d147c7c9a';
import { startProgram, checkProgram, compileDone, exerciseDraw, SHADER_WARM } from './gl-compile.js?v=f9222c848a';
import { shiftOf, translateOf, motionAt, movesOnly, clockOf, clockAt, fillsAfter } from './glass-motion.js?v=2b98554adc';
import { pathPolys, fanTriangles } from './path-poly.js?v=01766890c9';
import { easeArrive, D_SURFACE } from './ease.js?v=dc92422977';
import { caught } from './caught.js?v=b96b17594a';
import { viewSize } from './layout-snap.js?v=a48d65266b';
import { parseCssColor } from './css-color.js?v=59ed182174';

/** The CSS glass this draws (app.css .cl-glass: blur(16px) saturate(1.15) over 58 % of --surface). */
export const GLASS = { blur: 16, sat: 1.15, tint: 0.58 };
/** The liver label's pane (app.css .lb-glass: blur(9px) saturate(1.2) over --frost, its corners its border radius). */
export const PANE = { blur: 9, sat: 1.2 };
/** The Present cards' frost (Mohammad, 2 Nov 2026, on the iPhone: "the blur sucks now it's just transparent"): the callouts' 16 px blur
 *  left the vessels and organs readable through a card; 30 px under a 74 % tint (70ca81f6) read muddy, "not clean". A card is blurred at 22 px
 *  (sigma 22 px), on a grid of 8 CSS px a texel (2.75 texels, inside the 12 taps), from 3 sigmas of figure around it;
 *  its tint, app.css --pz-frost (66 % of the surface, 58 % before), is read from --gl-tint as before. ?cardfrost=soft: as before. */
const SOFT = typeof location !== 'undefined' && /[?&]cardfrost=soft\b/.test(location.search);
export const CARD = SOFT ? { ...GLASS } : { blur: 22, sat: 1.15, scale: 8, margin: 66 };
/** A rounded rectangle's outline (w × h, corner radius r), as an SVG path. */
export function roundPath(w, h, r) {
  const f = (n) => +n.toFixed(2), q = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M${f(q)} 0H${f(w - q)}A${f(q)} ${f(q)} 0 0 1 ${f(w)} ${f(q)}V${f(h - q)}A${f(q)} ${f(q)} 0 0 1 ${f(w - q)} ${f(h)}H${f(q)}A${f(q)} ${f(q)} 0 0 1 0 ${f(h - q)}V${f(q)}A${f(q)} ${f(q)} 0 0 1 ${f(q)} 0Z`;
}
const SCALE0 = 4;    // CSS px for each texel of the blurred copy
// The glass's canvas holds at most 2 device px per CSS px (30 Oct, review H3): what it draws is a blur, a flat tint and a soft shadow,
// whose edge lies under the callout's own 2 px outline (the DOM's, at the screen's full density), so a 3× screen shows the same glass
// from four ninths of the pixels. The masks are drawn at the same density.
export const glassDpr = () => Math.min(2, window.devicePixelRatio || 1);
const MARGIN0 = 48;  // CSS px of the figure taken around the callouts: three of the blur's sigmas (blur(16px): sigma 16 px)
/** The longest a glass drawn in the figure's canvas goes between two blurs when only the figure under it has been drawn again (a host that gives view()). */
export const REBLUR_MS = 50;
// (Off by default since 1 Nov 2026: on an iPhone the callouts' glass, blurred only every 50 ms while the figure under it moved each frame
// (a catheter's pulse, eased colours), stepped between a fresh blur and a stale one and read as a hard flicker (FHVP on HVPG 3, IVC on
// HVPG 7). ?reblur=1, or the option reblur: REBLUR_MS, brings the 50 ms hold back.)
const REBLUR_URL = typeof location !== 'undefined' && /[?&]reblur=1\b/.test(location.search || '');
// (Since 1 Nov 2026 (Mohammad: "is there a way to keep it and make it faster", and the sheet's cards flickering on his iPhone) the glass drawn in
// the figure's canvas is blurred again on every picture laid, the moving blood's frames too (option fresh: the figure's count of them), so
// the frost never holds an old blood picture and then jumps to a new one. Each blur reads only the texels some glass samples (blurBoxes):
// the same texels from the same pixels as a blur of the whole region, so the same glass, from a fraction of the figure. ?glasshold=1 keeps
// the blur through the blood's frames again, ?glassfull=1 blurs the whole region again, as before.)
const SEARCH = typeof location !== 'undefined' ? location.search || '' : '';
const HOLD_URL = /[?&]glasshold=1\b/.test(SEARCH), FULL_URL = /[?&]glassfull=1\b/.test(SEARCH);
/** Texels of the small copy kept around each glass when only part of it is blurred: the blur's 12 taps, one for the glass's smooth
 *  sampling between two texels, and one spare. */
export const BLUR_KEEP = 14;
/**
 * The parts of the small copy (texels, from its top left: [x0, y0, x1, y1], ends excluded) that a blur must make so every glass reads
 * what a blur of the whole copy gives it: each glass's box (CSS px from the canvas's corner: { x, y, w, h }) grown by `keep` texels and
 * held inside the copy (bw × bh texels, its top left at ox, oy CSS px, t CSS px to a texel), boxes that overlap made one. A copy texel a
 * glass reads lies within `keep` - 1 texels of its box: the blur's taps across and down, and the glass's sampling between two texels.
 */
export function blurBoxes(boxes, ox, oy, t, bw, bh, keep = BLUR_KEEP) {
  let out = [];
  for (const b of boxes) {
    const r = [Math.max(0, Math.floor((b.x - ox) / t) - keep), Math.max(0, Math.floor((b.y - oy) / t) - keep),
      Math.min(bw, Math.ceil((b.x + b.w - ox) / t) + keep), Math.min(bh, Math.ceil((b.y + b.h - oy) / t) + keep)];
    if (r[2] > r[0] && r[3] > r[1]) out.push(r);
  }
  for (let again = true; again;) {
    again = false;
    for (let i = 0; i < out.length && !again; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i], c = out[j];
        if (a[0] < c[2] && c[0] < a[2] && a[1] < c[3] && c[1] < a[3]) {
          out[i] = [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[2]), Math.max(a[3], c[3])];
          out.splice(j, 1); again = true; break;
        }
      }
    }
  }
  // (Parts that together cover most of the copy: the whole of it, in one go.)
  const sum = out.reduce((a, r) => a + (r[2] - r[0]) * (r[3] - r[1]), 0);
  return sum >= 0.85 * bw * bh ? [[0, 0, bw, bh]] : out;
}

const NUM = (v) => parseFloat(v) || 0;
// Boxes written in place: a frame's glass boxes are kept objects with these written into them (nowGeo), never new ones.
const newRect = () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });
function shiftInto(o, r, tx, ty) { o.left = r.left + tx; o.top = r.top + ty; o.right = r.right + tx; o.bottom = r.bottom + ty; o.width = r.width; o.height = r.height; return o; }
function copyRect(o, r) { o.left = r.left; o.top = r.top; o.right = r.right; o.bottom = r.bottom; o.width = r.width; o.height = r.height; return o; }
/** r zoomed by a (card-zoom.js zoomAffine: scale s about (ox, oy), then the move (dx, dy)), then moved by (tx, ty). */
function zoomInto(o, r, a, tx, ty) {
  const l = a.ox + (r.left - a.ox) * a.s + a.dx, t = a.oy + (r.top - a.oy) * a.s + a.dy, rt = a.ox + (r.right - a.ox) * a.s + a.dx, b = a.oy + (r.bottom - a.oy) * a.s + a.dy;
  o.left = l + tx; o.top = t + ty; o.right = rt + tx; o.bottom = b + ty; o.width = rt - l; o.height = b - t;
  return o;
}
/** Where a card's box is drawn at time t (its eased size while it morphs, else its rest box), moved by (tx, ty). */
function morphInto(o, q, t, tx, ty) {
  const M = q.morph, b = q.r0;
  const u = M ? Math.min(1, Math.max(0, (t - M.t0) / M.ms)) : 1;
  if (u >= 1) return shiftInto(o, b, tx, ty);
  const e = easeArrive(u), a = M.from, L = a.left + (b.left - a.left) * e, T = a.top + (b.top - a.top) * e;
  const W = a.width + (b.width - a.width) * e, H = a.height + (b.height - a.height) * e;
  o.left = L + tx; o.top = T + ty; o.right = L + W + tx; o.bottom = T + H + ty; o.width = W; o.height = H;
  return o;
}
/** Shared, read-only: a clear colour, and no glasses. Handed out in a frame in place of a fresh [0, 0, 0, 0] or []. */
const CLEAR4 = [0, 0, 0, 0], NONE = [];
// A frame's "same as last time" test, kept as numbers and strings in arrays that are written in place and compared field by field: no key
// string is built in a frame. (An array grows only when a frame has more glasses than any before it.)
const newKey = () => ({ n: [], s: [], ln: 0, ls: 0 });
const sameNum = (a, b) => a === b || (a !== a && b !== b);
function sameKey(a, b) {
  if (a.ln !== b.ln || a.ls !== b.ls) return false;
  for (let i = 0; i < a.ln; i++) if (!sameNum(a.n[i], b.n[i])) return false;
  for (let i = 0; i < a.ls; i++) if (a.s[i] !== b.s[i]) return false;
  return true;
}
/** Everything a laid-out picture of the glasses is drawn from: the canvas's place, the stage colour, each glass's place, fade, shape,
 *  tint and shadow (the numbers and strings the picture's key string held). */
function fillPanesKey(K, panes, cr, bgs, bgVar) {
  const N = K.n, S = K.s;
  let n = 0, m = 0;
  N[n++] = cr.left; N[n++] = cr.top; N[n++] = cr.width; N[n++] = cr.height; S[m++] = bgs; S[m++] = bgVar;
  for (const p of panes) {
    const r = p.r, e = p.er, sh = p.shadow, rad = p.rad;
    N[n++] = r.left; N[n++] = r.top; N[n++] = r.width; N[n++] = r.height; N[n++] = p.a; N[n++] = p.lw; N[n++] = p.lh;
    N[n++] = e.left; N[n++] = e.top; N[n++] = e.right; N[n++] = e.bottom;
    if (sh) { N[n++] = 1; N[n++] = sh.c[0]; N[n++] = sh.c[1]; N[n++] = sh.c[2]; N[n++] = sh.c[3]; N[n++] = sh.x; N[n++] = sh.y; N[n++] = sh.blur; N[n++] = sh.spread; }
    else { N[n++] = 0; N[n++] = 0; N[n++] = 0; N[n++] = 0; N[n++] = 0; N[n++] = 0; N[n++] = 0; N[n++] = 0; N[n++] = 0; }
    if (rad) { N[n++] = 1; N[n++] = rad[0]; N[n++] = rad[1]; N[n++] = rad[2]; N[n++] = rad[3]; }
    else { N[n++] = 0; N[n++] = 0; N[n++] = 0; N[n++] = 0; N[n++] = 0; }
    S[m++] = p.d; S[m++] = p.tint;
  }
  K.ln = n; K.ls = m;
}
/** What the labels need of the glasses (tellHoles): each one's place, fade and shape. */
function fillHolesKey(K, panes) {
  const N = K.n, S = K.s;
  let n = 0, m = 0;
  for (const p of panes) {
    const r = p.r, rad = p.rad;
    N[n++] = r.left; N[n++] = r.top; N[n++] = r.width; N[n++] = r.height; N[n++] = p.a; N[n++] = p.lw; N[n++] = p.lh;
    if (rad) { N[n++] = 1; N[n++] = rad[0]; N[n++] = rad[1]; N[n++] = rad[2]; N[n++] = rad[3]; }
    else { N[n++] = 0; N[n++] = 0; N[n++] = 0; N[n++] = 0; N[n++] = 0; }
    S[m++] = p.d;
  }
  K.ln = n; K.ls = m;
}
/** An element's box as the browser has it drawn, whatever the page has put in place of its getBoundingClientRect: a zoomed card (card-zoom.js
 *  pin) answers with the box it rests in, so its glass, read from that, stayed a small frosted patch at the card's old place while the card
 *  itself grew over the bare figure (Mohammad, 2 Nov 2026, the data card zoomed: "everything behind the glass glitches"). */
export const drawnRect = (e) => (e.drawnBox ? e.drawnBox() : e.getBoundingClientRect());
/**
 * A colour as the canvas gives it back (#rrggbb, rgb(), rgba(), or color(srgb r g b / a), which Chrome and Safari give for a colour mixed
 * by color-mix(), the cards' --gl-tint), as straight [r, g, b, a] (0–1); [0, 0, 0, 0] when it is none of those.
 * (The color(srgb) form was read as no colour until 1 Nov 2026, so a card tinted by color-mix() was never drawn in the figure's canvas.)
 */
export function parseColour(v) {
  const sv = String(v ?? '').trim();   // alloc-rare: colour parse: once per colour string (resolveColour caches it; a frame only looks it up)
  if (sv === 'transparent') return [0, 0, 0, 0];   // alloc-rare: colour parse: once per colour string (resolveColour caches it; a frame only looks it up)
  const h = /^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.exec(sv)?.[1];
  if (h) {
    const f = h.length <= 4 ? [...h].map((c) => c + c).join('') : h, n = (i) => parseInt(f.slice(i, i + 2), 16) / 255;   // alloc-rare: colour parse: once per colour string (resolveColour caches it; a frame only looks it up)
    return [n(0), n(2), n(4), f.length === 8 ? n(6) : 1];   // alloc-rare: colour parse: once per colour string (resolveColour caches it; a frame only looks it up)
  }
  const c = /^color\(srgb\s+([^)]+)\)$/i.exec(String(v).trim());   // alloc-rare: colour parse: once per colour string (resolveColour caches it; a frame only looks it up)
  if (c) {
    const [rgb, a] = c[1].split('/');   // alloc-rare: colour parse: once per colour string (resolveColour caches it; a frame only looks it up)
    const n = rgb.trim().split(/\s+/).map((x) => (x.endsWith('%') ? parseFloat(x) / 100 : parseFloat(x)));   // alloc-rare: colour parse: once per colour string (resolveColour caches it; a frame only looks it up)
    const al = a == null ? 1 : a.trim().endsWith('%') ? parseFloat(a) / 100 : parseFloat(a);   // alloc-rare: colour parse: once per colour string (resolveColour caches it; a frame only looks it up)
    if (n.length === 3 && n.every(Number.isFinite) && Number.isFinite(al)) return [...n.map((x) => Math.min(1, Math.max(0, x))), Math.min(1, Math.max(0, al))];   // alloc-rare: colour parse: once per colour string (resolveColour caches it; a frame only looks it up)
    return [0, 0, 0, 0];   // alloc-rare: colour parse: once per colour string (resolveColour caches it; a frame only looks it up)
  }
  const q = /^rgba?\(([^)]+)\)$/.exec(sv)?.[1].split(/[\s,/]+/).filter(Boolean).map((x, i) => (x.endsWith('%') ? (i < 3 ? 2.55 : 0.01) * parseFloat(x) : +x));   // alloc-rare: colour parse: once per colour string (resolveColour caches it; a frame only looks it up)
  return q && q.length >= 3 && q.every(Number.isFinite) ? [q[0] / 255, q[1] / 255, q[2] / 255, q.length > 3 ? q[3] : 1] : [0, 0, 0, 0];   // alloc-rare: colour parse: once per colour string (resolveColour caches it; a frame only looks it up)
}
/** The first shadow of a computed box-shadow: { c: [r, g, b, a] (0–1), x, y, blur, spread } or null. */
export function parseShadow(s) {
  if (!s || s === 'none') return null;
  const c = /rgba?\(([^)]+)\)/.exec(s);
  if (!c) return null;
  const v = c[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  const n = s.replace(c[0], '').match(/-?[\d.]+px/g)?.map(NUM) || [];
  if (/inset/.test(s) || n.length < 2) return null;
  return { c: [v[0] / 255, v[1] / 255, v[2] / 255, v.length > 3 ? v[3] : 1], x: n[0], y: n[1], blur: n[2] || 0, spread: n[3] || 0 };
}
/** Whether the page asks for frosted glass at all (Settings' blur effect, reduced transparency, a browser with backdrop blur). */
export function glassWanted(doc = document, win = window) {
  return glassCheck(doc, win)();
}
function glassCheck(doc, win) {
  const css = win.CSS, can = !!css?.supports && (css.supports('backdrop-filter', 'blur(1px)') || css.supports('-webkit-backdrop-filter', 'blur(1px)'));
  const rt = win.matchMedia?.('(prefers-reduced-transparency: reduce)');
  return () => can && !rt?.matches && !doc.documentElement.hasAttribute('data-noglass');
}
/** Gaussian weights for a blur of sigma `s` texels, taps 0..n (one side; the shader mirrors them), summing to 1 over both sides. */
export function gaussTaps(s, n = 12) {
  const w = Array.from({ length: n + 1 }, (_, i) => Math.exp(-(i * i) / (2 * s * s)));
  const sum = w[0] + 2 * w.slice(1).reduce((a, b) => a + b, 0);
  return w.map((v) => v / sum);
}

const QVS = `#version 300 es
uniform vec4 uBox;    // left, top, width, height (device px, y down)
uniform vec2 uView;
uniform vec4 uGrow;   // how far the quad reaches past the box (left, top, right, bottom; device px): a card's own shadow, drawn here
const vec2 Q[4] = vec2[4](vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0));
void main() {
  vec2 p = uBox.xy - uGrow.xy + Q[gl_VertexID] * (uBox.zw + uGrow.xy + uGrow.zw);
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
}`;
// One pass of the blur (across, then down), over the small copy; texels outside it are its edge's.
const BFS = `#version 300 es
precision highp float;
uniform sampler2D uT;
uniform vec4 uBox;          // (its size: the copy's, in texels)
uniform vec2 uDir;          // one texel across or down
uniform float uW[13];
out vec4 o;
void main() {
  vec2 sz = uBox.zw, uv = gl_FragCoord.xy / sz;
  vec4 c = texture(uT, uv) * uW[0];
  for (int i = 1; i < 13; i++) { vec2 d = uDir * float(i) / sz; c += (texture(uT, uv + d) + texture(uT, uv - d)) * uW[i]; }
  o = c;
}`;
// A callout's glass: the blurred figure under it over the stage's own colour, saturated as the CSS does, under the tint, cut
// to the callout's shape (its mask). Where the pointer reaches past the card, the card's own shadow (the DOM's, painted over
// this layer) is allowed for, so the pointer stays the card's tint as one shape.
const PFS = `#version 300 es
precision highp float;
uniform vec2 uView;
uniform vec4 uBox;          // the glass (device px)
uniform vec2 uMS;           // the share of the mask the glass fills
uniform vec4 uReg;          // the blurred copy's place (device px)
uniform sampler2D uScene, uMask;
uniform vec3 uBg;
uniform vec4 uTint;         // premultiplied
uniform float uSat, uA;
uniform vec4 uBB;           // the card's border box (device px: left, top, right, bottom)
uniform vec4 uShC;          // its shadow's colour (straight) and strength
uniform vec4 uShB;          // the shadow's box (device px, offset)
uniform float uShS;         // its sigma (device px)
uniform vec4 uRad;          // a card's corner radii (device px: top left, top right, bottom right, bottom left); its box is its shape (uMode 1)
uniform int uMode;          // 0: the shape is the mask texture (a callout, the pane); 1: a rounded box, from uBox and uRad
uniform vec4 uD0C, uD1C;    // a card's own drop shadows (its --gl-drop): colour (straight) and strength; .a 0: none
uniform vec4 uD0B, uD1B;    // their boxes (device px: left, top, right, bottom; offset and spread)
uniform vec2 uDS;           // their sigmas (device px)
uniform vec4 uLine;         // a card's own 1 px edge (its --gl-line), straight; .a 0: none
uniform float uLW;          // its width (device px)
out vec4 o;
// A rounded box's coverage at p (device px from its top left; wh its size): 1 inside, 0 outside, across one pixel at its edge, each
// corner with its own radius (the signed distance to the box with that corner's radius; the CSS clips a backdrop to the border box).
float boxCover(vec2 p, vec2 wh, vec4 rad) {
  vec2 c = p - wh * 0.5;
  float r = c.x < 0.0 ? (c.y < 0.0 ? rad.x : rad.w) : (c.y < 0.0 ? rad.y : rad.z);
  r = min(r, min(wh.x, wh.y) * 0.5);
  vec2 q = abs(c) - wh * 0.5 + r;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  return clamp(0.5 - d, 0.0, 1.0);
}
float erfa(float x) { float a = 0.147, x2 = x * x; return sign(x) * sqrt(1.0 - exp(-x2 * (1.2732395 + a * x2) / (1.0 + a * x2))); }
float cover(float x, float a, float b, float s) { return 0.5 * (erfa((x - a) / (s * 1.4142136)) - erfa((x - b) / (s * 1.4142136))); }
void main() {
  vec2 p = vec2(gl_FragCoord.x, uView.y - gl_FragCoord.y);
  float m = uMode == 1 ? boxCover(p - uBox.xy, uBox.zw, uRad) : texture(uMask, (p - uBox.xy) / uBox.zw * uMS).a;
  // (A card's drop shadows, outside its box only, as the CSS draws a box-shadow: so the card's box, its edge and its shadow are one GPU
  // shape that can change size in view with nothing of the page laid out again.)
  float d0 = uD0C.a > 0.0 ? uD0C.a * cover(p.x, uD0B.x, uD0B.z, max(uDS.x, 0.5)) * cover(p.y, uD0B.y, uD0B.w, max(uDS.x, 0.5)) : 0.0;
  float d1 = uD1C.a > 0.0 ? uD1C.a * cover(p.x, uD1B.x, uD1B.z, max(uDS.y, 0.5)) * cover(p.y, uD1B.y, uD1B.w, max(uDS.y, 0.5)) : 0.0;
  float sa = 1.0 - (1.0 - d0) * (1.0 - d1);
  vec3 sc = sa > 0.0 ? (uD0C.rgb * d0 * (1.0 - d1) + uD1C.rgb * d1) / sa : vec3(0.0);
  if (m <= 0.0) { if (sa <= 0.001) discard; o = vec4(sc * sa, sa) * uA; return; }
  vec4 s = texture(uScene, clamp((p - uReg.xy) / uReg.zw, 0.0, 1.0));
  vec3 c = s.rgb + uBg * (1.0 - s.a);
  float k = uSat;
  mat3 M = mat3(0.213 + 0.787 * k, 0.213 - 0.213 * k, 0.213 - 0.213 * k,
                0.715 - 0.715 * k, 0.715 + 0.285 * k, 0.715 - 0.715 * k,
                0.072 - 0.072 * k, 0.072 - 0.072 * k, 0.072 + 0.928 * k);
  c = clamp(M * c, 0.0, 1.0);
  c = uTint.rgb + c * (1.0 - uTint.a);
  if (uShC.a > 0.0 && (p.x < uBB.x || p.x > uBB.z || p.y < uBB.y || p.y > uBB.w)) {
    float a = uShC.a * (uShS > 0.0 ? cover(p.x, uShB.x, uShB.z, uShS) * cover(p.y, uShB.y, uShB.w, uShS) : 1.0);
    a = min(a, 0.9);
    c = clamp((c - uShC.rgb * a) / (1.0 - a), 0.0, 1.0);
  }
  if (uMode == 1 && uLine.a > 0.0 && uLW > 0.0) {
    float inner = boxCover(p - uBox.xy - uLW, uBox.zw - 2.0 * uLW, max(uRad - uLW, vec4(0.0)));
    c = mix(c, uLine.rgb, uLine.a * (1.0 - inner));
  }
  o = (vec4(c, 1.0) * m + vec4(sc * sa, sa) * (1.0 - m)) * uA;
}`;

// The blur's and the glass's programs, linked in a context (the glass's own, or the figure's when it draws there: host).
function programsOf(gl) {
  // (Through gl-compile.js: both started before either is read, so the driver compiles them side by side, and only the link's status
  // read when it went. ?shaderwarm=0 links and reads one, then the other.)
  const start = (fs) => startProgram(gl, QVS, fs);   // alloc-rare: a context's two programs are linked once (setHost, a restored context), never per frame
  const read = (h) => { try { return checkProgram(gl, h); } catch { gl.deleteProgram(h.p); return null; } };   // alloc-rare: a context's two programs are linked once (setHost, a restored context), never per frame
  let bprog, pprog;
  if (SHADER_WARM) { const b = start(BFS), q = start(PFS); bprog = read(b); pprog = read(q); }
  else { bprog = read(start(BFS)); pprog = read(start(PFS)); }
  if (!bprog || !pprog) { if (bprog) gl.deleteProgram(bprog); if (pprog) gl.deleteProgram(pprog); return null; }
  return uniformsOf(gl, bprog, pprog);
}
function uniformsOf(gl, bprog, pprog) {
  const uni = (p, ks) => Object.fromEntries(ks.map((k) => [k, gl.getUniformLocation(p, k)]));   // alloc-rare: a context's two programs are linked once (setHost, a restored context), never per frame
  const BU = uni(bprog, ['uBox', 'uView', 'uT', 'uDir', 'uW']);   // alloc-rare: a context's two programs are linked once (setHost, a restored context), never per frame
  const PU = uni(pprog, ['uBox', 'uView', 'uMS', 'uReg', 'uScene', 'uMask', 'uBg', 'uTint', 'uSat', 'uA', 'uBB', 'uShC', 'uShB', 'uShS', 'uRad', 'uMode', 'uGrow', 'uD0C', 'uD1C', 'uD0B', 'uD1B', 'uDS', 'uLine', 'uLW']);   // alloc-rare: a context's two programs are linked once (setHost, a restored context), never per frame
  return { bprog, pprog, BU, PU };   // alloc-rare: a context's two programs are linked once (setHost, a restored context), never per frame
}
// Shader warm-up for the glass drawn in the figure's canvas (GPU practice, MDN "WebGL best practices": compile and link early, read the
// status later, KHR_parallel_shader_compile where there is one). The blur's and the glass's programs are started the moment the figure's
// context is handed over (setHost), long before the first card shows, and only their link status is read, at the first glass, by when the
// driver has long finished: that frame no longer compiles and links two programs and waits on them. One set
// per context, shared by every glass drawn there (cards, panes, callouts compiled the same two programs each before). ?glasswarm=0 in the
// address: each glass compiles its own at its first frame, as before.
const GLASS_WARM = !(typeof location !== 'undefined' && /[?&]glasswarm=0\b/.test(location.search));
const warmed = new WeakMap();
// (One blur per look per picture, shared by every glass of that look drawn in a context: blur-share.js. Forgotten with the context.)
const shares = new WeakMap();
/** A context's shared blurs (tests and the ?perf readout): look → { blurs, skips, allocs, size }. */
export function shareStats(gl) { const m = shares.get(gl); return m ? Object.fromEntries([...m].map(([k, S]) => [k, { blurs: S.blurs, skips: S.skips, allocs: S.t?.allocs || 0, size: S.t?.size || '' }])) : {}; }
function warmPrograms(gl, now) {
  let e = warmed.get(gl);
  if (!e) {
    if (gl.isContextLost()) return null;
    gl.getExtension('KHR_parallel_shader_compile');   // (asked for, the driver compiles and links on threads of its own)
    const sh = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); return x; };   // alloc-rare: a context's two programs are linked once (setHost, a restored context), never per frame
    const start = (fs) => { const p = gl.createProgram(), v = sh(gl.VERTEX_SHADER, QVS), f = sh(gl.FRAGMENT_SHADER, fs); gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p); return { p, sh: [v, f] }; };   // alloc-rare: a context's two programs are linked once (setHost, a restored context), never per frame
    e = { hs: [start(BFS), start(PFS)], P: undefined };   // (nothing read back here)   // alloc-rare: a context's two programs are linked once (setHost, a restored context), never per frame
    warmed.set(gl, e);   // (forgotten when the context is lost: onHostLost)
  }
  if (now) readWarm(gl, e);
  return e.P ?? null;
}
// The warmed set published at a free moment of the figure's renderer (veins-gl top.warmIn, GPU practice §2): once the driver says both
// are compiled, their link status and uniforms are read and each is drawn once with the glass's own blend into a throwaway 1 × 1 target
// (exerciseDraw), so the first card or pane that shows neither waits on a link nor has Metal build the pipeline in its frame.
// One task per context. ?shaderwarm=0: read at the first glass, as before.
function warmTask(gl) {
  const e = warmed.get(gl);
  if (!e || e.task) return null;
  e.task = true;
  return {
    done: () => e.P !== undefined || gl.isContextLost() || compileDone(gl, e.hs),
    run() {
      if (warmed.get(gl) !== e || gl.isContextLost()) return;
      const first = e.P === undefined;
      readWarm(gl, e);
      if (!first || !e.P) return;
      const { bprog, pprog, BU, PU } = e.P;
      exerciseDraw(gl, () => {
        for (const [p, U, blend] of [[bprog, BU, false], [pprog, PU, true]]) {
          gl.useProgram(p);
          gl.uniform4f(U.uBox, 0, 0, 1, 1); gl.uniform2f(U.uView, 1, 1);
          if (blend) { gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); } else gl.disable(gl.BLEND);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        gl.disable(gl.BLEND);
      });
    },
  };
}
function readWarm(gl, e) {
  if (e.P !== undefined || gl.isContextLost()) return;
  // (Through gl-compile.js checkProgram: the link's status first, a shader's only for a failure's log. Published by warmTask once the
  // driver says both are compiled, so this read no longer waits.)
  const ok = e.hs.map((h) => { try { checkProgram(gl, h); return true; } catch { return false; } });   // alloc-rare: a context's two programs are linked once (setHost, a restored context), never per frame
  e.P = ok[0] && ok[1] ? uniformsOf(gl, e.hs[0].p, e.hs[1].p) : null;
}
// A mask's fill (fillMask): the triangles of a callout's outline (mask px, y down) turn each pixel they cover over, 0 to 1 and back
// (blend: one minus the destination), so a pixel inside the outline is turned an odd number of times and shows; the texture's row 0 is
// the mask's top, as the glass samples it.
const MVS = `#version 300 es
in vec2 aP;
uniform vec2 uS;
void main() { gl_Position = vec4(aP / uS * 2.0 - 1.0, 0.0, 1.0); }`;
const MFS = `#version 300 es
precision mediump float;
out vec4 o;
void main() { o = vec4(1.0); }`;
const fills = new WeakMap();   // (context → its fill program, vertex array and buffer, made at its first mask)
function fillKit(G) {
  let f = fills.get(G);
  if (f !== undefined) return f;
  try {
    const p = checkProgram(G, startProgram(G, MVS, MFS));
    const vao = G.createVertexArray(), buf = G.createBuffer();
    G.bindVertexArray(vao); G.bindBuffer(G.ARRAY_BUFFER, buf);
    const at = G.getAttribLocation(p, 'aP');
    G.enableVertexAttribArray(at); G.vertexAttribPointer(at, 2, G.FLOAT, false, 0, 0);
    G.bindVertexArray(null); G.bindBuffer(G.ARRAY_BUFFER, null);
    f = { p, vao, buf, uS: G.getUniformLocation(p, 'uS') };   // alloc-rare: the mask fill kit is made once per context, at its first mask
  } catch { f = null; }   // (it will not build: no mask is made, and each such glass keeps the CSS's solid look)
  fills.set(G, f);
  return f;
}
/** Fills mask m (its texture bound on the active unit, mw × mh) with the outline d at ss mask px per CSS px, on the GPU. Leaves the
 *  framebuffer, program, vertex array and blend as the caller sets them next (paint, drawInto); depth test and culling as they were. */
function fillMask(G, m, d, ss, mw, mh) {
  const f = fillKit(G);
  if (!f) return;
  const tri = fanTriangles(pathPolys(d, 0.25 / ss), ss);
  G.bindFramebuffer(G.FRAMEBUFFER, m.fb);
  G.framebufferTexture2D(G.FRAMEBUFFER, G.COLOR_ATTACHMENT0, G.TEXTURE_2D, m.tex, 0);
  G.viewport(0, 0, mw, mh);
  G.disable(G.SCISSOR_TEST); G.disable(G.STENCIL_TEST);
  const depth = G.isEnabled(G.DEPTH_TEST), cull = G.isEnabled(G.CULL_FACE);
  if (depth) G.disable(G.DEPTH_TEST);
  if (cull) G.disable(G.CULL_FACE);
  G.clearColor(0, 0, 0, 0); G.clear(G.COLOR_BUFFER_BIT);
  if (tri.length) {
    G.useProgram(f.p); G.bindVertexArray(f.vao);
    G.bindBuffer(G.ARRAY_BUFFER, f.buf); G.bufferData(G.ARRAY_BUFFER, tri, G.STREAM_DRAW);
    G.uniform2f(f.uS, mw, mh);
    G.enable(G.BLEND); G.blendEquation(G.FUNC_ADD); G.blendFuncSeparate(G.ONE_MINUS_DST_COLOR, G.ZERO, G.ONE_MINUS_DST_ALPHA, G.ZERO);
    G.drawArrays(G.TRIANGLES, 0, tri.length / 2);
    G.disable(G.BLEND); G.bindBuffer(G.ARRAY_BUFFER, null); G.bindVertexArray(null); G.useProgram(null);
  }
  if (depth) G.enable(G.DEPTH_TEST);
  if (cull) G.enable(G.CULL_FACE);
  G.bindFramebuffer(G.FRAMEBUFFER, null);
}
function texOf(gl, filter) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

/**
 * The GPU glass for the callouts under `layers` (the .cath-labels layers), over the figure drawn on `source` (veins-gl's canvas,
 * which keeps its drawing buffer). The canvas is laid just before `layers[0]`. With `pane` (an .lb-glass element), it draws that one
 * rounded pane instead, its canvas laid just before it (under the labels, where the pane lies). `live()`: whether the figure is on that canvas now
 * (else the browser's glass, which sees the SVG figure). `capture()`: called just before a copy is taken, so the figure is on `source` whole whether or not it keeps its own picture. `version()`: a number that changes whenever the figure on `source` is drawn
 * again; while it, the region behind the callouts and the canvas' place on the page all hold, the copy already taken is still the
 * figure, so none is taken (without it, one is taken whenever the last has arrived). `onFigure(f)`: calls f each time the figure is
 * drawn again, and returns the call that stops it: the glass, settled, sleeps until then (or until a callout changes). Null when it cannot run.
 * Each glass's box, fade, shape and shadow, the canvas's and the figure's boxes and the stage's colour are read outside any frame and
 * kept (measureGeo), their glides and fades put back each frame (nowGeo), so no frame reads layout or style (1 Nov 2026; `keep()` is
 * no longer asked: always so). `due()`: the page's layout watch (idle-keys.js), true while a card, bar or the stage may have moved:
 * the page is read again just after that frame.
 * setHost(h) (the callouts' glass only; recs A1, glass): h = { gl, canvas, now, active, over }, the figure's own canvas (veins-gl top).
 * While h.active() and no glass crosses an element of h.over() (what the page lays between that canvas and this one), the glass is
 * drawn into the figure's canvas, at the end of each picture it lays (drawInto), from that picture itself: no copy of the canvas, no
 * canvas of its own. Otherwise, and for the frame of each change, it is drawn here as before.
 */
// (What the glass reads from the page, read outside any frame and kept, its motion put back each frame from what it is given: measureGeo,
// glass-motion.js. ?glassmotion=0: any write to a glass or what holds it reads the page again, its motion included.)
const MOTION = typeof location === 'undefined' || !/[?&]glassmotion=0\b/.test(location.search);
// (A card's own edge and drop shadows drawn with its glass on the GPU (--gl-line, --gl-drop), and its size eased there when the page asks
// (data-gl-morph): Mohammad, 2 Nov 2026, "Do it" to review/slide-motion-recs-2nov (the glass stays up through a slide change and
// changes size in view). ?gpuedge=0: the page draws them, and a glass jumps to a new size, as before.)
const GPU_EDGE = typeof location === 'undefined' || !/[?&]gpuedge=0\b/.test(location.search);
/** A --gl-drop value ("x y blur spread colour, ..." as written, var() substituted) as [{ x, y, blur, spread, c }] (CSS px), at most two. */
export function dropsOf(v) {
  const out = [];
  let depth = 0, cur = '';
  const parts = [];
  for (const ch of v || '') { if (ch === '(') depth++; else if (ch === ')') depth--; if (ch === ',' && !depth) { parts.push(cur); cur = ''; } else cur += ch; }
  if (cur.trim()) parts.push(cur);
  for (const part of parts) {
    const t = part.trim();
    if (!t || /\binset\b/.test(t)) continue;
    const m = /^((?:-?[\d.]+(?:px)?\s+){1,3}-?[\d.]+(?:px)?)\s+(.+)$/.exec(t);
    if (!m) continue;
    const n = m[1].trim().split(/\s+/).map(NUM);
    out.push({ x: n[0] || 0, y: n[1] || 0, blur: n[2] || 0, spread: n[3] || 0, c: m[2].trim() });
    if (out.length === 2) break;
  }
  return out;
}
export function createGlassGL(wrap, source, layers, { software = false, off = false, live = () => true, pane = null, cards = null, version = null, capture = null, onFigure = null, keep = null, due = null, copy = true, reblur = REBLUR_URL ? REBLUR_MS : 0, fresh = null, full = FULL_URL, onHoles = null } = {}) {
  if (HOLD_URL || reblur > 0) fresh = null;
  const look = pane ? PANE : cards ? CARD : GLASS;
  const SCALE = look.scale || SCALE0, MARGIN = look.margin || MARGIN0;
  // (While the cards' glass is drawn in the figure's canvas (html[data-cardgl]), a card not yet marked as drawn there shows no solid card
  // (app.css): a card coming in showed the solid fallback for its first frame or two, before its glass's first draw, a flash of solid then
  // frost (Mohammad, 2 Nov 2026: "the blur flickers when new card opens"). ?cardfallback=1: the solid card until then, as before.)
  const CARD_MARK = !/[?&]cardfallback=1\b/.test(SEARCH);
  // (cards: { find, watch, before, read? }: the Present cards' glass (recs A2, 31 Oct): find() lists the elements, each its own rounded box, its
  // corners its border radii and its tint the colour its CSS declares in --gl-tint (app.css: the same colour its background was), drawn
  // while its --gl-glass is 1 and no CSS filter lies on it; watch: the roots whose writes may move them; before: where the canvas goes.
  // Their DOM shadows and borders stay the page's. A card whose tint cannot be read, or whose glass its CSS has turned off (the phone's
  // sheet, drawn by its pseudo-elements), keeps the browser's glass.)
  // (copy: the glass may also be drawn on a canvas of its own, from a copy of the figure (createImageBitmap), whenever it cannot be drawn
  // into the figure's canvas (setHost). Without it (the default since 31 Oct, round 2, 2.1: on Safari that copy is a read of the GPU's
  // picture back to the page on every frame the figure changes, laggier than the browser's own blur) there is no canvas or context
  // here at all: the glass is drawn into the figure's canvas while it can be, and is otherwise the browser's.)
  if (off || software || !source || typeof WebGL2RenderingContext === 'undefined' || (copy && typeof createImageBitmap !== 'function')) return null;
  let canvas = null, gl = null, progs = null;
  if (copy) {
    canvas = document.createElement('canvas');
    canvas.id = cards ? 'cardGl' : pane ? 'paneGl' : 'glassGl'; canvas.setAttribute('aria-hidden', 'true');
    try { gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, failIfMajorPerformanceCaveat: true }); } catch { gl = null; }
    if (!gl) return null;
    progs = programsOf(gl);
    if (!progs) return null;
  }
  // (The glass's own objects in its own context, copy mode only: made now, and again when a lost context comes back.)
  let bprog, pprog, BU, PU, vao, copyTex = null, pass = null, blurred = null, fbPass, fbOut;
  const tex = (filter) => texOf(gl, filter);
  const own = () => {
    ({ bprog, pprog, BU, PU } = progs);
    vao = gl.createVertexArray();
    copyTex = tex(gl.LINEAR); pass = tex(gl.LINEAR); blurred = tex(gl.LINEAR);
    fbPass = gl.createFramebuffer(); fbOut = gl.createFramebuffer();
  };
  if (gl) own();
  // (Where a fade from above stops being the glass's own: where its canvas lies, or would.)
  const stop = (cards ? cards.before : pane || layers[0]).parentNode;
  if (canvas) (cards ? cards.before : pane || layers[0]).before(canvas);

  let lost = false, dead = false, raf = 0, W = 0, H = 0, dpr = 1, pending = false, fails = 0, ready = null, drawn = false, fbSize = '', takenKey = '';
  // (shown: the glass drew the last time it looked; drawnKey: everything that picture was drawn from, so a frame that would draw it the
  // same is skipped; quiet: the frames in a row that changed nothing; liveUntil: a callout's transition or animation runs until then;
  // poll: the slow look while it sleeps; gen: a copy asked for before the glass was let go is never put in.)
  let shown = false, drawnKey = '', quiet = 0, liveUntil = 0, poll = 0, gen = 0, readySeq = 0;
  let masks = new WeakMap();
  const maskTex = new Set(), maskFb = new Set(), marked = new Set(), paintMarks = new Set();
  // Any CSS colour as straight [r, g, b, a] (0–1). A colour the page gives as written (a custom property that is not registered: a
  // color-mix(), a name, oklab) is resolved in script once, when the page is read (resolveColour, from measureGeo, outside
  // any frame), by css-color.js, so it always comes back as straight sRGB; a frame only looks it up. (Through a 2D
  // canvas's parser until 1 Nov 2026: no canvas 2D anywhere.)
  const colours = new Map();
  function resolveColour(str) {
    const k = (str || '').trim();
    if (!k || colours.has(k)) return;
    let v = parseColour(k);
    // (CSS Color 4 in script, css-color.js: color-mix(), names, oklab, lab, hsl. No probe element is made, written to or read back, so no
    // frame of a slide change writes the page's DOM or style to find a colour out; the same sRGB the browser's own CSS gives.)
    if (!(v[3] > 0) && k !== 'transparent' && !/^#|^rgba?\(|^color\(srgb/i.test(k)) v = parseCssColor(k) || v;
    if (colours.size > 256) colours.clear();
    colours.set(k, v);
  }
  // (A frame only looks a colour up by the string the page was read with, already trimmed there (readPanes, measureGeo); a string not read yet is
  // parsed in colourMiss, and no colour at all is the clear one.)
  const colour = (str, fb) => colours.get(str) || (!str && fb === 'transparent' ? CLEAR4 : colourMiss(str, fb));
  function colourMiss(str, fb) {
    const k = (str || '').trim();   // alloc-rare: a colour string the page has not been read with yet (resolveColour reads every one), never in steady state
    return colours.get(k) || parseColour(k || fb);
  }
  const markOf = new WeakMap();
  const unmark = () => { for (const g of marked) g.removeAttribute('data-gl'); marked.clear(); unwait(); };
  // (A card about to have its glass drawn here for the first time (data-gl-wait) shows no solid card for that frame or two (app.css), so
  // it never flashes solid then frost. Only such a card: one held out of this canvas (past its edge, crossing a label), or not drawn here
  // for any reason, keeps the solid card (the browser's glass), never a bare one. Mohammad, 2 Nov 2026, iPhone, HVPG 6: both cards bare,
  // the lobule showing through them unfrosted. A wait not met within WAIT_MS is given up: the solid card shows.)
  // (Given up only when the glass has had its turns and not drawn the card: WAIT_MS of the clock AND WAIT_PASSES passes that listed it, or
  // WAIT_CAP of the clock whatever. A slow first frame (a shader linking, the first blur copy) is not a refusal: a clock alone gave up in
  // the middle of it and showed the solid card for the frame before the frost, the flash on a card opening. Mohammad, 2 Nov 2026.)
  // (A card faded right out (opacity 0, its glass not drawn) is held bare too, as it waits for its first frame, so the frame it starts to fade
  // in is never the solid card for a moment before its frost: it is invisible bare, and is drawn the frame it shows. fadedNow: the cards
  // the last read found so, set in readPanes. Mohammad, 2 Nov 2026: "a new data card shows as a plain solid card before its frost draws".)
  let fadedNow = new Set();
  const waiting = new Map(), WAIT_MS = 300, WAIT_PASSES = 3, WAIT_CAP = 2500;
  let waitT = 0;
  function unwait() { for (const g of waiting.keys()) g.removeAttribute('data-gl-wait'); waiting.clear(); gaveUp.clear(); wasDrawn.clear(); clearTimeout(waitT); waitT = 0; }
  const wasDrawn = new Set();   // (cards whose glass this canvas has drawn while they stayed listed: only a first draw is waited for)
  const gaveUp = new Set();   // (waited and not drawn: solid until it is drawn here, or leaves the list and comes back)
  const waitOver = (w, t) => { const d = t - w.at; return d > WAIT_CAP || (d > WAIT_MS && w.n >= WAIT_PASSES); };
  function sweepWait() {
    waitT = 0;
    const n = performance.now();
    for (const [g, w] of waiting) if (!w.faded && n - w.at > WAIT_CAP) { g.removeAttribute('data-gl-wait'); waiting.delete(g); gaveUp.add(g); }
    if (waiting.size) waitT = setTimeout(sweepWait, 200);
  }
  const wantSet = new Set(), inListSet = new Set();   // (kept, cleared at each use)
  function waitFor(list) {
    if (!cards || !CARD_MARK) return;
    const t = performance.now(), want = wantSet;
    want.clear();
    for (const p of list) if (!marked.has(p.g) && !wasDrawn.has(p.g)) want.add(p.g);   // (a card drawn here before and not now: solid at once)
    for (const g of gaveUp) if (!want.has(g)) gaveUp.delete(g);
    if (wasDrawn.size) { inListSet.clear(); for (const p of list) inListSet.add(p.g); for (const g of wasDrawn) if (!inListSet.has(g)) wasDrawn.delete(g); }
    for (const [g, w] of waiting) {
      if (!want.has(g)) { if (w.faded && fadedNow.has(g)) continue; g.removeAttribute('data-gl-wait'); waiting.delete(g); }
      else { if (w.faded) { w.faded = false; w.at = t; w.n = 0; } w.n++; if (waitOver(w, t)) { g.removeAttribute('data-gl-wait'); waiting.delete(g); gaveUp.add(g); } }
    }
    for (const g of want) if (!waiting.has(g) && !gaveUp.has(g)) { waiting.set(g, { at: t, n: 0 }); g.setAttribute('data-gl-wait', ''); }   // alloc-rare: a card seen for the first time starts its wait (once per card)
    for (const g of fadedNow) if (!waiting.has(g) && !want.has(g) && g.isConnected) { waiting.set(g, { at: t, n: 0, faded: true }); gaveUp.delete(g); g.setAttribute('data-gl-wait', ''); }   // alloc-rare: a card faded right out starts its wait (once per card)
    if (waiting.size && !waitT) waitT = setTimeout(sweepWait, WAIT_CAP + 20);
  }

  const wanted = glassCheck(document, window);
  const glassesOf = () => (cards ? cards.find().filter((g) => g?.isConnected) : pane ? (pane.isConnected ? [pane] : []) : layers.flatMap((l) => [...l.getElementsByClassName('cl-glass')]));
  // (The same list for a frame, in a kept array and over the layers' live collections: nothing is made in a frame. glassesOf above makes a
  // list of its own, kept by the page read (geo.list) and compared with this one.)
  const nowList = [], layerGlasses = !cards && !pane ? layers.map((l) => l.getElementsByClassName('cl-glass')) : null;
  const glassesNow = () => {
    const out = nowList;
    out.length = 0;
    if (cards) { const l = cards.find(); for (let i = 0; i < l.length; i++) if (l[i]?.isConnected) out.push(l[i]); }
    else if (pane) { if (pane.isConnected) out.push(pane); }
    else for (const c of layerGlasses) for (let i = 0; i < c.length; i++) out.push(c[i]);
    return out;
  };
  // A card's corner radii (CSS px, top left round to bottom left): the first length of each computed radius (an elliptical corner's across).
  const radiiOf = (cs) => [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(NUM);

  // What fades a glass from above: the opacity of whatever holds it, up to where the canvas takes over (the callout, its layer). The DOM
  // applies such a fade to the callout's words and outline as one, so the glass beside them takes it too: a layer faded as a whole once
  // left every pill solid until its words were removed. (A pane's canvas lies beside the pane: nothing holds it.)
  // (Each parent's opacity read once per read of the page, however many glasses it holds: fadeMemo, set by readPanes.)
  let fadeMemo = null;
  const fadeOf = (e) => {
    let v = fadeMemo?.get(e);
    if (v === undefined) { v = parseFloat(getComputedStyle(e).opacity); fadeMemo?.set(e, v); }
    return v;
  };
  const heldBy = (g) => {
    let a = 1;
    for (let e = g.parentElement; e && e !== stop && a > 0.001; e = e.parentElement) {
      const v = fadeOf(e);
      if (v < 1) a *= v;   // (a missing or odd value is no fade)
    }
    return a;
  };
  // A callout's shape as a mask, drawn from its own outline path (callout.js), again only when that or its size changes. Filled on the
  // GPU (fillMask) from the path cut into polygons (path-poly.js) at twice the glass's density, so the glass, sampling it between texels,
  // takes a 2 × 2 average at its edge; through a 2D canvas until 1 Nov 2026. Made before any glass of a picture is drawn (masksFor), never
  // between two of them.
  // (K: the figure's context's kit when the glass is drawn there (host), with its own masks, at that canvas's density.)
  function maskOf(g, d, w, h, K = null) {
    const G = K ? K.G : gl, k = K ? K.k : dpr, store = K ? K.masks : masks;
    let m = store.get(g);
    if (m && m.kd === d && m.kw === w && m.kh === h && m.kk === k) return m;
    const key = `${d}|${w}|${h}|${k}`;   // alloc-rare: a mask is made or refilled only when its outline or size changed, not in a frame that finds it as it was
    if (!fillKit(G)) return null;   // (no fill program: that glass is left to the CSS's solid look, unmarked)
    const ss = 2 * k, mw = Math.max(1, Math.ceil(w * ss)), mh = Math.max(1, Math.ceil(h * ss));
    // (Made on unit 1, where the glass reads its mask, never on unit 0: the blurred figure is bound there while the glasses are drawn;
    // a mask made in the middle of them once took its place, a grey glass for one frame (1 Nov 2026).)
    G.activeTexture(G.TEXTURE1);
    // alloc-rare: a glass's first mask
    if (!m) { m = { tex: texOf(G, G.LINEAR), fb: G.createFramebuffer() }; (K ? K.maskTex : maskTex).add(m.tex); (K ? K.maskFb : maskFb).add(m.fb); }
    G.bindTexture(G.TEXTURE_2D, m.tex);
    if (m.w !== mw || m.h !== mh) { G.texImage2D(G.TEXTURE_2D, 0, G.RGBA8 ?? G.RGBA, mw, mh, 0, G.RGBA, G.UNSIGNED_BYTE, null); m.w = mw; m.h = mh; }
    fillMask(G, m, d, ss, mw, mh);
    G.activeTexture(G.TEXTURE0);
    Object.assign(m, { key, kd: d, kw: w, kh: h, kk: k, ms: [w * ss / mw, h * ss / mh] });   // alloc-rare: a mask is refilled only when its outline or size changed
    store.set(g, m);
    return m;
  }
  // Every mask a picture's glasses need, made before the first of them is drawn (the state they are drawn with set after).
  function masksFor(panes, K = null) { for (const p of panes) if (!p.rad && p.d) maskOf(p.g, p.d, p.lw, p.lh, K); }
  // A new small copy of the figure behind the callouts, blurred once in two passes when it arrives.
  function take(reg, cr, sr) {
    if (!sr.width || !sr.height || !source.width) return;
    // (The key of the figure as it is copied now, read before the copy is asked for: the browser takes its snapshot in that call.)
    const key = version ? `${version()}|${reg.x}|${reg.y}|${reg.w}|${reg.h}|${cr.left}|${cr.top}|${sr.left}|${sr.top}|${sr.width}|${sr.height}|${source.width}x${source.height}` : '';   // alloc-rare: copy mode only (every caller passes copy: false); the figure's canvas takes the glass, this path never runs
    if (key && key === takenKey && ready) { if (gpuProbe.on) gpuProbe.note(cards ? COUNTED.cardSkip : pane ? COUNTED.paneSkip : COUNTED.glassSkip); return; }
    const kx = source.width / sr.width, ky = source.height / sr.height;
    const bw = Math.max(1, Math.ceil(reg.w / SCALE)), bh = Math.max(1, Math.ceil(reg.h / SCALE));
    pending = true;
    if (gpuProbe.on) gpuProbe.note(cards ? COUNTED.cardCopy : pane ? COUNTED.paneCopy : COUNTED.glassCopy);
    const job = gen;
    let p, got = reg;
    try {
      capture?.();   // (the figure's whole picture is on the canvas for this copy, whether or not the canvas keeps its own)
      const sx = Math.round((reg.x + cr.left - sr.left) * kx), sy = Math.round((reg.y + cr.top - sr.top) * ky), sw = Math.max(1, Math.round(reg.w * kx)), sh = Math.max(1, Math.round(reg.h * ky));
      // (The region as copied, on the source's own pixels: the glass is laid from where the copy really starts. Laid from the region
      // asked for, a copy from a coarse source (the lobule's pills: half a CSS px) sat up to a pixel off, a different way each copy.)
      got = { x: sx / kx - cr.left + sr.left, y: sy / ky - cr.top + sr.top, w: sw / kx, h: sh / ky };   // alloc-rare: copy mode only (every caller passes copy: false); the figure's canvas takes the glass, this path never runs
      p = createImageBitmap(source, sx, sy, sw, sh, { resizeWidth: bw, resizeHeight: bh, resizeQuality: 'medium', premultiplyAlpha: 'premultiply' });   // alloc-rare: copy mode only (every caller passes copy: false); the figure's canvas takes the glass, this path never runs
    } catch { p = Promise.reject(); }
    p.then((bm) => {   // alloc-rare: copy mode only (every caller passes copy: false); the figure's canvas takes the glass, this path never runs
      pending = false;
      if (lost || dead || job !== gen) { bm.close?.(); return; }
      fails = 0;
      gl.bindTexture(gl.TEXTURE_2D, copyTex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bm);
      bm.close?.();
      if (fbSize !== `${bw}x${bh}`) {   // alloc-rare: copy mode only (every caller passes copy: false); the figure's canvas takes the glass, this path never runs
        fbSize = `${bw}x${bh}`;   // alloc-rare: copy mode only (every caller passes copy: false); the figure's canvas takes the glass, this path never runs
        for (const [t, fb] of [[pass, fbPass], [blurred, fbOut]]) {   // alloc-rare: copy mode only (every caller passes copy: false); the figure's canvas takes the glass, this path never runs
          gl.bindTexture(gl.TEXTURE_2D, t);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, bw, bh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
          gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        }
      }
      gl.useProgram(bprog); gl.bindVertexArray(vao); gl.disable(gl.BLEND);
      gl.viewport(0, 0, bw, bh);
      gl.uniform4f(BU.uBox, 0, 0, bw, bh); gl.uniform2f(BU.uView, bw, bh); gl.uniform1i(BU.uT, 0);
      gl.uniform1fv(BU.uW, gaussTaps(look.blur / SCALE));
      gl.activeTexture(gl.TEXTURE0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbPass); gl.bindTexture(gl.TEXTURE_2D, copyTex); gl.uniform2f(BU.uDir, 1, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbOut); gl.bindTexture(gl.TEXTURE_2D, pass); gl.uniform2f(BU.uDir, 0, 1); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      // alloc-rare: copy mode only (every caller passes copy: false); the figure's canvas takes the glass, this path never runs
      ready = { ...got };
      takenKey = key;
      readySeq++;
      ask();
    }, () => {   // alloc-rare: copy mode only (every caller passes copy: false); the figure's canvas takes the glass, this path never runs
      // (A browser that refuses the copy keeps its own glass.)
      pending = false;
      if (job !== gen) return;
      if (++fails > 3) { dead = true; unmark(); clear(); }
    });
  }
  function clear() {
    if (!drawn || lost || !gl) return;
    gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); drawn = false;
  }
  // Each callout's glass as the page lays it out this frame (its fades, glides and the card's shadow included).
  function readPanes(list, keep0 = false) {
    fadeMemo = new Map();
    fadedNow = new Set();
    const panes = [];
    const shows = (a) => keep0 || a > 0.001;   // (keep0: a glass faded right out is kept too, its fade put back each frame by the motion)
    for (const g of list) {
      const el = cards ? g : g.parentElement, cs = getComputedStyle(g);
      if (!el || cs.display === 'none' || cs.visibility !== 'visible') continue;
      const a = NUM(cs.opacity) * heldBy(g);
      // (A glass whose box the page reads itself: cards.read(g) gives { r, rad | d, a, tint }, a list of them drawn in that order, or null
      // (none shows); undefined reads the card as usual. The lobule's pills and the split sheet's cards, pseudo-elements; d: a mask path.)
      const q = cards?.read ? cards.read(g) : undefined;
      if (q !== undefined) {
        for (const one of [].concat(q || [])) {
          if (!one || !shows(a * one.a) || !one.r.width || !one.r.height) { if (one && one.r.width && one.r.height) fadedNow.add(g); continue; }
          panes.push({ g, el, oa: one.a, a: a * one.a, r: one.r, d: one.d || null, rad: one.d ? null : one.rad, lw: one.r.width, lh: one.r.height, er: one.r, shadow: null, tint: one.tint, k: 1 });
        }
        continue;
      }
      if (cards) {
        // (Its CSS says whether this element's glass is its own (--gl-glass 1) and what its tint is; a filter on it (a brightness) would
        // not reach a glass drawn here, so such a card keeps the browser's.)
        if (cs.getPropertyValue('--gl-glass').trim() !== '1' || (cs.filter && cs.filter !== 'none')) continue;
        const r = drawnRect(g);
        if (!r.width || !r.height || !shows(a)) { if (r.width && r.height) fadedNow.add(g); continue; }
        const zk = g.drawnScale ? g.drawnScale() : 1;   // (a zoomed card's scale: its corners grow with it)
        // (A card's own edge and drop shadows, drawn here with its glass where its CSS names them (--gl-line, --gl-drop): the page's own
        // are taken off while it is drawn here ([data-gl="edge"]), so the card is one GPU shape that may change size in view.)
        const drops = GPU_EDGE ? dropsOf(cs.getPropertyValue('--gl-drop')) : [], line = GPU_EDGE ? cs.getPropertyValue('--gl-line').trim() : '';
        // (cut: the still box a glass that slides is cut off at (a phone sheet's paper sliding below its resting foot, which the sheet's
        // own clip hides on the page): { bottom } in client px, from cards.cut(g), kept where it is while the glass moves.)
        const cut = cards.cut ? cards.cut(g) || null : null;
        panes.push({ g, el, oa: 1, a, r, d: null, rad: zk > 1.001 || zk < 0.999 ? radiiOf(cs).map((v) => v * zk) : radiiOf(cs), lw: r.width, lh: r.height, er: r, shadow: null, tint: cs.getPropertyValue('--gl-tint'), k: 1, drops, line, cut });
        continue;
      }
      const r = g.getBoundingClientRect(), lw = NUM(g.style.width), lh = NUM(g.style.height);
      if (!r.width || !r.height || !lw || !lh || !shows(a)) continue;
      // (The liver's pane: its own rounded box, tinted with --frost as it stands; its soft shadow, outside it, stays the DOM's.)
      if (pane) { panes.push({ g, el, oa: 1, a, r, d: roundPath(lw, lh, NUM(cs.borderTopLeftRadius)), lw, lh, er: r, shadow: null, tint: cs.getPropertyValue('--frost'), k: 1 }); continue; }
      const d = g.firstChild?.firstChild?.getAttribute?.('d');
      if (!d) continue;
      panes.push({ g, el, oa: 1, a, r, d, lw, lh, er: el.getBoundingClientRect(), shadow: parseShadow(getComputedStyle(el).boxShadow), tint: cs.getPropertyValue('--surface'), k: GLASS.tint });
    }
    return panes;
  }
  function draw() {
    if (lost || dead || gl?.isContextLost()) return false;
    const list = glassesNow();
    if (hostOn && (!list.length || !wanted() || !live())) dropHost(true);
    if (!list.length || !wanted() || !live()) { unmark(); clear(); return false; }
    if (host) { const r = hostDraw(list); if (r !== undefined) return r; }
    // (No copy of its own: the browser's glass, until the figure's canvas can take it again.)
    if (!copy) { unmark(); return false; }
    const N = nowGeo(list);
    if (!N) return true;   // (the page read once more just after this frame: measureGeo)
    const { cr } = N, k = glassDpr();
    const w = Math.max(1, Math.round(cr.width * k)), h = Math.max(1, Math.round(cr.height * k));
    if (w !== W || h !== H) { W = w; H = h; canvas.width = w; canvas.height = h; }
    dpr = k;
    const panes = N.panes;
    // The figure taken around them all (CSS px from the canvas' corner).
    if (panes.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of panes) { x0 = Math.min(x0, p.r.left); y0 = Math.min(y0, p.r.top); x1 = Math.max(x1, p.r.right); y1 = Math.max(y1, p.r.bottom); }
      x0 = Math.max(0, x0 - cr.left - MARGIN); y0 = Math.max(0, y0 - cr.top - MARGIN);
      x1 = Math.min(cr.width, x1 - cr.left + MARGIN); y1 = Math.min(cr.height, y1 - cr.top + MARGIN);
      if (x1 > x0 && y1 > y0 && !pending) take({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, cr, N.sr);   // alloc-rare: copy mode only (every caller passes copy: false); the figure's canvas takes the glass, this path never runs
    }
    // No glass shows (all hidden, faded out or empty): the canvas is cleared once and nothing more is done. (A card still marked from an
    // earlier frame goes back to the browser's glass: its CSS may have turned its own off while it was the only one.)
    if (!panes.length) { if (cards) unmark(); clear(); return false; }
    // (Until the first copy is in, the browser's own glass stays.)
    if (!ready) return true;
    return paint(panes, cr, N.bgs, N.bg, N.bgVar);
  }
  // The glasses drawn over the blurred copy, unless the picture would be the one already on the canvas ('same').
  function paint(panes, cr, bgs, bg, bgVar) {
    // Everything this picture is drawn from: the blurred copy, the canvas, the stage's colour and each glass as laid out now (its place,
    // fade, shape, tint and the card's shadow). The same as the picture on the canvas: it is left as it is ('same').
    const key = `${W}x${H}|${dpr}|${readySeq}|${cr.left}|${cr.top}|${bgs}|${bgVar}` + panesKey(panes);   // alloc-rare: copy mode only (every caller passes copy: false); the figure's canvas takes the glass, this path never runs
    if (drawn && key === drawnKey) return 'same';
    noteDraw(cards ? 'glass-cards' : pane ? 'glass-pane' : 'glass');
    if (gpuProbe.on) gpuProbe.note(cards ? COUNTED.cardDrawn : pane ? COUNTED.paneDrawn : COUNTED.glassDrawn);
    masksFor(panes);
    gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(pprog); gl.bindVertexArray(vao);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform2f(PU.uView, W, H); gl.uniform1i(PU.uScene, 0); gl.uniform1i(PU.uMask, 1); gl.uniform1f(PU.uSat, look.sat);
    gl.uniform4f(PU.uReg, ready.x * dpr, ready.y * dpr, ready.w * dpr, ready.h * dpr);
    const base = bg[3] > 0 ? bg : colour(bgVar, 'transparent');
    gl.uniform3f(PU.uBg, base[0], base[1], base[2]);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, blurred);
    paintMarks.clear();
    drawPanes(gl, PU, panes, cr, dpr, (p) => maskOf(p.g, p.d, p.lw, p.lh), paintMarks);   // alloc-rare: copy mode only (every caller passes copy: false); the figure's canvas takes the glass, this path never runs
    drawn = true; drawnKey = key;
    return true;
  }
  // (Each glass as laid out: its place, fade, shape, tint and the card's shadow.)
  function panesKey(panes) {
    let key = '';
    for (const p of panes) {
      const s = p.shadow, e = p.er;
      key += `|${p.r.left},${p.r.top},${p.r.width},${p.r.height},${p.a},${p.lw},${p.lh},${p.d},${p.rad || ''},${p.tint}`   // alloc-rare: copy mode only (every caller passes copy: false); the figure's canvas takes the glass, this path never runs
        + (pane ? '' : `,${e.left},${e.top},${e.right},${e.bottom},${s ? `${s.c},${s.x},${s.y},${s.blur},${s.spread}` : '-'}`);   // alloc-rare: copy mode only (every caller passes copy: false); the figure's canvas takes the glass, this path never runs
    }
    return key;
  }
  // Each glass over the blurred copy (bound on unit 0, the glass's program in use and its view set), in context G at k device px per
  // CSS px, marked as it is drawn; a mark no longer drawn is given back.
  function drawPanes(G, U, panes, cr, k, maskFor, now, final = true) {
    for (const p of panes) {
      const t = colour(p.tint, 'transparent'), ta = t[3] * p.k;
      // (A card whose tint did not read as a colour (a browser that does not register custom properties): not drawn, and left to the
      // browser's glass, which still shows its declared background.)
      if (cards && !(ta > 0)) continue;
      const bx = (p.r.left - cr.left) * k, by = (p.r.top - cr.top) * k;
      if (p.rad) {
        // (No mask: unit 1 is left empty, as a texture the figure left there (an integer one, the blood's) makes every draw of this
        // program fail in the figure's context, the shape not sampling it notwithstanding: a card's glass was never drawn there.)
        G.activeTexture(G.TEXTURE1); G.bindTexture(G.TEXTURE_2D, null); G.activeTexture(G.TEXTURE0);
        G.uniform1i(U.uMode, 1);
        G.uniform4f(U.uRad, p.rad[0] * k, p.rad[1] * k, p.rad[2] * k, p.rad[3] * k);
        G.uniform2f(U.uMS, 1, 1);
      } else {
        const m = maskFor(p);
        if (!m) continue;
        G.activeTexture(G.TEXTURE1); G.bindTexture(G.TEXTURE_2D, m.tex); G.activeTexture(G.TEXTURE0);
        G.uniform1i(U.uMode, 0);
        G.uniform2f(U.uMS, m.ms[0], m.ms[1]);
      }
      G.uniform4f(U.uBox, bx, by, p.r.width * k, p.r.height * k);
      G.uniform4f(U.uTint, t[0] * ta, t[1] * ta, t[2] * ta, ta);
      G.uniform1f(U.uA, Math.min(1, p.a));
      const e = p.er, L = (e.left - cr.left) * k, T = (e.top - cr.top) * k, R = (e.right - cr.left) * k, B = (e.bottom - cr.top) * k;
      G.uniform4f(U.uBB, L, T, R, B);
      const s = p.shadow, sp = (s?.spread || 0) * k;
      const sc = s ? s.c : CLEAR4;
      G.uniform4f(U.uShC, sc[0], sc[1], sc[2], sc[3]);
      G.uniform4f(U.uShB, L + (s?.x || 0) * k - sp, T + (s?.y || 0) * k - sp, R + (s?.x || 0) * k + sp, B + (s?.y || 0) * k + sp);
      G.uniform1f(U.uShS, (s?.blur || 0) / 2 * k);
      // (The card's own edge and drop shadows: --gl-line, --gl-drop. Their colours were read with the page: resolveColour.)
      const ds = p.drops || NONE, lc = p.line ? colour(p.line, 'transparent') : CLEAR4, edge = !!p.rad && (ds.length > 0 || lc[3] > 0);
      let gl0 = 0, gt0 = 0, gr0 = 0, gb0 = 0;
      for (let i = 0; i < 2; i++) {
        const d = edge ? ds[i] : null, C = i ? U.uD1C : U.uD0C, Bx = i ? U.uD1B : U.uD0B;
        if (!d) { G.uniform4f(C, 0, 0, 0, 0); continue; }
        const c = colour(d.c, 'transparent'), sp = d.spread * k, reach = (d.blur * 1.5 + Math.max(0, d.spread)) * k;
        G.uniform4f(C, c[0], c[1], c[2], c[3]);
        G.uniform4f(Bx, bx + d.x * k - sp, by + d.y * k - sp, bx + p.r.width * k + d.x * k + sp, by + p.r.height * k + d.y * k + sp);
        gl0 = Math.max(gl0, reach - d.x * k); gr0 = Math.max(gr0, reach + d.x * k); gt0 = Math.max(gt0, reach - d.y * k); gb0 = Math.max(gb0, reach + d.y * k);
      }
      G.uniform2f(U.uDS, (ds[0]?.blur || 0) / 2 * k, (ds[1]?.blur || 0) / 2 * k);
      G.uniform4f(U.uGrow, gl0, gt0, gr0, gb0);
      G.uniform4f(U.uLine, lc[0], lc[1], lc[2], edge ? lc[3] : 0);
      G.uniform1f(U.uLW, k);
      const c = p.cut;
      if (c) {
        // (Cut at its still foot, on the canvas's own pixels: the scissor counts up from the bottom.)
        const H = G.drawingBufferHeight, W = G.drawingBufferWidth, b = Math.round((c.bottom - cr.top) * k);
        G.enable(G.SCISSOR_TEST); G.scissor(0, Math.max(0, H - b), W, Math.max(0, Math.min(H, b)));
      }
      G.drawArrays(G.TRIANGLE_STRIP, 0, 4);
      if (c) G.disable(G.SCISSOR_TEST);
      G.uniform4f(U.uGrow, 0, 0, 0, 0);
      // (Marked in the frame its glass is first drawn here: the browser's blur and this one never both show, nor neither. "edge": its own
      // edge and shadows are drawn here too, and the page's are taken off.)
      const mk = edge ? 'edge' : '';
      if (!p.g.hasAttribute('data-gl') || markOf.get(p.g) !== mk) { p.g.setAttribute('data-gl', mk); markOf.set(p.g, mk); }
      if (waiting.has(p.g)) { waiting.delete(p.g); p.g.removeAttribute('data-gl-wait'); }
      gaveUp.delete(p.g); wasDrawn.add(p.g);
      now.add(p.g);
    }
    if (final) settleMarks(now);
  }
  // (A card not drawn this time, whatever the reason (hidden, faded out, its glass turned off by its CSS, its tint unread, something
  // between it and the figure's canvas), goes back to the browser's glass now: marked, it would show no glass at all. In the figure's
  // canvas a glass not drawn there goes back to the browser's whatever it is.)
  function settleMarks(now) {
    for (const g of marked) if (!now.has(g) && (cards || hostOn || !g.isConnected)) { if (g.isConnected) g.removeAttribute('data-gl'); marked.delete(g); }
    for (const g of now) marked.add(g);
  }
  // Drawn into the figure's canvas (setHost; recs A1, glass). The loop reads the glasses as before; when they, the canvas's place or the
  // stage's colour changed it asks the figure to lay its picture again at once (host.now: in the frame's final phase, so in the same
  // frame as the change). Each picture laid draws the glass over it (drawInto): the region behind the glasses taken from that picture
  // (halved until it is at most twice the blur's size, then down to it: each step an average, as the copy's resize was), blurred in two
  // passes and cut to each glass's shape. A picture laid while the figure under the glasses has not been drawn again (the same version)
  // keeps the blur already made. The figure drawn again needs no frame of the glass's own: the picture is laid with it.
  // (host.over(level): the boxes (client px: left, top, right, bottom) of what the page lays between the figure's canvas and this glass's
  // level ('low' for a card host.low(g) names, the teaching card's shade; 'high' for the other cards; undefined for the callouts and the
  // pane): a glass drawn into the figure's canvas would show those sharp through it, where the browser's blurs them. The callouts and
  // the pane go back to their own way as a whole when any of theirs crosses one; a card, alone.)
  const heldOut = new Map(), heldPanes = [];
  let heldEpoch = 0;
  const keepBox = (s) => { for (let i = 0; i < s.nc; i++) s.box[i] = s.cur[i]; s.nb = s.nc; };
  // (What the figure's labels leave out (onHoles; 1 Nov 2026): the shapes of the glasses drawn in the figure's canvas, each with its fade. The
  // labels' own canvas lies over the figure's, under the callouts and the cards, so a label under a glass drawn there would show sharp
  // through it; the browser's blur makes such a label a faint smear, so here the labels are left out under it, as the glass's own copy
  // always left them. Told in the same task the glass is laid, so the two change in the same frame; [] when none is drawn there.)
  const holeList = [];
  let holesA = newKey(), holesB = newKey();
  function tellHoles(panes) {
    if (!onHoles) return;
    const L = holeList;
    L.length = 0;
    for (const p of panes) if (!cards || colour(p.tint, 'transparent')[3] * p.k > 0) L.push(p);   // (as drawPanes: a card whose tint did not read is not drawn)
    fillHolesKey(holesA, L);
    if (sameKey(holesA, holesB)) return;
    const t = holesB; holesB = holesA; holesA = t;
    if (!L.length) { onHoles(NONE); return; }
    // (The labels keep the list they are given (frostHoles), so a changed set of glasses is a new list; an unchanged one is not told at all.)
    const out = [];   // alloc-rare: the labels keep this list, so it is new only when a glass's place, fade or shape changed
    for (const p of L) out.push({ x: p.r.left, y: p.r.top, w: p.r.width, h: p.r.height, a: Math.min(1, p.a), rad: p.d ? null : p.rad || [0, 0, 0, 0], d: p.d || null, lw: p.lw, lh: p.lh, el: p.g });   // alloc-rare: as above
    onHoles(out);
  }
  // (Why a glass shows the browser's blur instead of being drawn in the figure's canvas, for the ?perf blur gauge (why(), below):
  // whyAll, for the glass as a whole; whyEl, for a card held out by itself. Written where the decision is made, read by nothing else.)
  const whyEl = new Map();
  let whyAll = '', heldWake = 0;
  const heldWakeFn = () => { heldWake = 0; ask(); };
  const hfSet = { panes: NONE, cr: null, base: CLEAR4 };
  let keyNow = newKey(), keyHf = newKey();
  let host = null, hk = null, hostOn = false, hf = null, hostTops = [], hostMo = null;
  const shareId = {};   // (this instance, as a user of its context's shared blurs: blur-share.js)
  const freeShare = (G) => (t) => {   // alloc-rare: a shared blur is let go (a lost context, the budget's release, the last user out), never per frame
    if (G.isContextLost()) return;
    for (const x of [t.copy, t.pass, t.blurred, ...(t.steps || []).map((st) => st.t)]) if (x) G.deleteTexture(x);   // alloc-rare: a shared blur is let go, never per frame
    for (const fb of [t.fbCopy, t.fbPass, t.fbOut, ...(t.steps || []).map((st) => st.fb)]) if (fb) G.deleteFramebuffer(fb);   // alloc-rare: a shared blur is let go, never per frame
  };
  const crosses = (p, rs) => {
    if (!rs?.length) return false;
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i];
      if (r.right > r.left && r.bottom > r.top && p.r.left < r.right && r.left < p.r.right && p.r.top < r.bottom && r.top < p.r.bottom) return true;
    }
    return false;
  };
  function hostKit() {
    const G = host.gl, P = GLASS_WARM ? warmPrograms(G, true) : programsOf(G);
    if (!P) return null;
    const K = { G, ...P, shared: GLASS_WARM,   // alloc-rare: the kit is made once per figure context (setHost), never per frame
      vao: G.createVertexArray(), copy: texOf(G, G.LINEAR), pass: texOf(G, G.LINEAR), blurred: texOf(G, G.LINEAR),
      fbCopy: G.createFramebuffer(), fbPass: G.createFramebuffer(), fbOut: G.createFramebuffer(), steps: [], size: '', key: '', reg: null, k: 1,   // alloc-rare: once per figure context
      masks: new WeakMap(), maskTex: new Set(), maskFb: new Set() };   // alloc-rare: once per figure context
    G.bindTexture(G.TEXTURE_2D, null);
    return K;
  }
  function hostFree() {
    const K = hk;
    hk = null;
    if (K?.trail) { clearTimeout(K.trail); K.trail = 0; }
    if (!K || K.G.isContextLost()) return;
    const G = K.G;
    // (Its place among the shared blur's users given back; the last one out frees the shared targets.)
    shareRelease(shares, G, shareId, freeShare(G));
    for (const t of [K.copy, K.pass, K.blurred, ...K.steps.map((st) => st.t), ...K.maskTex]) G.deleteTexture(t);
    for (const fb of [K.fbCopy, K.fbPass, K.fbOut, ...K.steps.map((st) => st.fb), ...K.maskFb]) G.deleteFramebuffer(fb);
    if (!K.shared) { G.deleteProgram(K.bprog); G.deleteProgram(K.pprog); }   // (the warmed set stays with its context, for the others)
    G.deleteVertexArray(K.vao);
  }
  // Back to this canvas: the browser's glass shows until its first copy is in (marks given back), and the figure's picture is laid again
  // without the glass now (again), or by the figure's next picture (from inside one, which has just been laid without it).
  function dropHost(again) {
    if (!hostOn) return;
    hostOn = false; hf = null;
    if (cards && CARD_MARK) document.documentElement?.removeAttribute?.('data-cardgl');
    if (hk) hk.key = '';
    unmark();
    tellHoles(NONE);
    if (canvas) canvas.style.visibility = '';
    if (again) host?.now(); else ask();
  }
  // The loop's turn while a host is set: true, 'same' or false as draw() returns, or undefined when the glass is drawn on its own canvas.
  const inside = (p, cr, vw, vh) => {
    const l = Math.max(p.r.left, 0), t = Math.max(p.r.top, 0), r = Math.min(p.r.right, vw), b = Math.min(p.r.bottom, vh);
    return !(r > l && b > t) || (l >= cr.left - 2 && t >= cr.top - 2 && r <= cr.right + 2 && b <= cr.bottom + 2);
  };
  function hostDraw(list) {
    if (!host.active()) { whyAll = host.why?.() || 'the figure\'s canvas is not taking glass'; dropHost(true); return undefined; }
    const R = nowGeo(list);
    if (!R) return hostOn ? 'same' : false;   // (the page read once more just after this frame: measureGeo)
    const cr = R.cr;
    if (!cr.width || !cr.height) { whyAll = 'the figure\'s canvas has no size'; dropHost(true); return undefined; }
    // (A glass reaching past the figure's canvas could not be drawn there whole: the browser's, or its own canvas, takes it.)
    // (2 px of slack: the split sheet's glass panes reach 1 px past the card's box (their border) and the card moves by fractions of a pixel as the view follows it, so a pane
    // standing at the canvas's edge, as the readings' card does when fully out, was in and out of reach from frame to frame.)
    // (Only the part of a glass on the screen counts (1 Nov 2026): the figure's canvas fills the screen, so a card sliding in from below it, as
    // the phone's sheet untucks, or a callout pushed off its edge by a pan, is drawn there clipped by the screen as the browser's would be,
    // never handed to the browser's blur at the edge and back as it comes in: that swap read as the sheet flickering on every untuck.)
    const { vw, vh } = R;
    let panes = R.panes;
    {
      // (A card is drawn here whole or not at all: marked, a card with one of its panes kept out (the split sheet's two, one reaching past the
      // canvas or crossing a label as it slides) would lose the browser's blur for that pane and show none, flickering as it moves.)
      // (Each swap from one blur to the other shows as the whole card blinking (Mohammad, 31 Oct: "while tucking and untucking those cards the
      // whole cards flicker"), so a card changes way only once it has wanted the other one for 400 ms without a break, and never while it
      // moves: a label gliding clear of the readings' card as it rises, or a leader fading in or out as the view follows it, crossed it for a
      // few frames and swapped it out and back again. Only a pane past the canvas's edge, which the figure's canvas cannot draw whole, goes
      // to the browser's glass at once.)
      const nowT = performance.now(), ep = ++heldEpoch;
      for (const p of panes) {
        let s = heldOut.get(p.g);
        if (!s) { s = { out: false, since: 0, box: [], nb: 0, cur: [], nc: 0, moved: -1e9, ep: 0, edge: false, cross: false, fresh: true }; heldOut.set(p.g, s); }   // alloc-rare: a card seen for the first time (once per card)
        if (s.ep !== ep) { s.ep = ep; s.edge = false; s.cross = false; s.nc = 0; }
        if (!inside(p, cr, vw, vh)) s.edge = true;
        else if (crosses(p, !cards ? R.over.all : host.low?.(p.g) ? R.over.low : R.over.high)) s.cross = true;
        const c = s.cur;
        c[s.nc++] = p.r.left; c[s.nc++] = p.r.top; c[s.nc++] = p.r.width; c[s.nc++] = p.r.height;
      }
      let waiting = false;
      for (const [g, s] of heldOut) {
        // (A card not shown this time starts afresh when it comes back.)
        if (s.ep !== ep || !g.isConnected) { heldOut.delete(g); whyEl.delete(g); continue; }
        const want = s.edge || s.cross;
        if (s.fresh) { s.fresh = false; s.out = want; keepBox(s); }
        else {
          let diff = s.nb !== s.nc;
          for (let i = 0; i < s.nc && !diff; i++) if (!sameNum(s.cur[i], s.box[i])) diff = true;
          if (diff) { keepBox(s); s.moved = nowT; }
        }
        if (s.edge) { s.out = true; s.since = 0; }
        else if (want === s.out) s.since = 0;
        else if (nowT - s.moved < 250) s.since = 0;   // (moving, or just come to rest: it keeps the way it is on)
        else if (!s.since) { s.since = nowT; waiting = true; }
        else if (nowT - s.since >= 400) { s.out = want; s.since = 0; }
        else waiting = true;
        if (want !== s.out && !s.edge) waiting = true;
        if (s.out) { whyEl.set(g, s.edge ? 'reaches past the figure\'s canvas' : s.cross ? 'crosses a label, a leader or a callout' : 'waiting 400 ms to change back'); } else whyEl.delete(g);
      }
      if (waiting && !heldWake) heldWake = setTimeout(heldWakeFn, 120);
      const shown = heldPanes;
      shown.length = 0;
      for (const p of panes) if (!heldOut.get(p.g).out) shown.push(p);
      panes = shown;
    }
    if (!hk && !(hk = hostKit())) { whyAll = 'the figure\'s context cannot take the glass\'s programs'; dropHost(true); host = null; return undefined; }
    waitFor(panes);
    const { bgs, bg, bgVar } = R;
    fillPanesKey(keyNow, panes, cr, bgs, bgVar);
    if (!hostOn) {
      // (This canvas cleared and out of the page's layers; a copy on its way is not put in, and the next one here is taken afresh.)
      hostOn = true; hf = null; gen++; pending = false; ready = null; takenKey = '';
      if (cards && CARD_MARK) document.documentElement?.setAttribute?.('data-cardgl', '');
      if (canvas) {
        clear();
        canvas.style.visibility = 'hidden';
        W = H = 1; canvas.width = 1; canvas.height = 1;   // (its memory given back while it stands aside; sized again when it draws)
      }
    }
    if (hf && sameKey(keyNow, keyHf)) return panes.length ? 'same' : false;
    { const t = keyHf; keyHf = keyNow; keyNow = t; }
    hf = hfSet;
    hf.panes = panes; hf.cr = cr; hf.base = bg[3] > 0 ? bg : colour(bgVar, 'transparent');
    tellHoles(panes);
    host.now();
    return panes.length ? true : false;
  }
  // A texture and framebuffer for one halving step, grown (never shrunk) to hold w × h.
  // (A target is checked once, as it is made or resized, never in a frame that reuses it: a size past what the GPU takes (a zoomed card's
  // region on a 5K screen, MAX_TEXTURE_SIZE) or a format it cannot draw into leaves a framebuffer incomplete, every draw into it does
  // nothing, and the glass showed the bare tint over an empty blur. Such a blur is refused (false) and made again at the next size, so
  // the cards are never drawn from it.)
  // (Through the context's record (gl-state.js): its limit read once, and completeness asked once per target and size, per generation.
  // A stand-in context with no numeric constants (the unit tests' fakes) cannot say, and is taken as complete, as before.)
  const real = (G) => typeof G.FRAMEBUFFER_COMPLETE === 'number';
  function fits(G, w, h) {
    const m = real(G) ? glCap(G, G.MAX_TEXTURE_SIZE) || 4096 : Infinity;
    return w >= 1 && h >= 1 && w <= m && h <= m;
  }
  const complete = (G, key, w, h) => !real(G) || fbComplete(G, G.FRAMEBUFFER, key, w, h);
  function step(i, w, h, B = hk) {
    const G = B.G;
    let st = B.steps[i];
    if (!st) { st = { t: texOf(G, G.LINEAR), fb: G.createFramebuffer(), w: 0, h: 0 }; B.steps[i] = st; B.allocs = (B.allocs || 0) + 1; }
    if (w > st.w || h > st.h) {
      st.w = Math.max(w, st.w); st.h = Math.max(h, st.h); B.allocs = (B.allocs || 0) + 1;
      G.bindTexture(G.TEXTURE_2D, st.t);
      G.texImage2D(G.TEXTURE_2D, 0, G.RGBA, st.w, st.h, 0, G.RGBA, G.UNSIGNED_BYTE, null);
      G.bindFramebuffer(G.FRAMEBUFFER, st.fb);
      G.framebufferTexture2D(G.FRAMEBUFFER, G.COLOR_ATTACHMENT0, G.TEXTURE_2D, st.t, 0);
      st.ok = fits(G, st.w, st.h) && complete(G, `glass-step${i}`, st.w, st.h);
      if (!st.ok) { st.w = 0; st.h = 0; }   // (made again at the next ask)
    }
    return st;
  }
  // The region (CSS px from the canvas's corner) of the picture just laid, made small and blurred, as take() does from a copy.
  // (The region is laid on a fixed grid of the canvas's own pixels, T device px to a texel (a power of two, at least SCALE CSS px), so
  // every halving is an exact 2 × 2 average and a texel always covers the same pixels of the figure. Fitted to the glasses' boxes as
  // they were, the region's size and start changed with every frame of a card sliding (the readings' card tucking or coming out), so
  // the halvings sampled the figure a different way each frame and the whole of every card's frost flickered (Mohammad, 31 Oct).)
  function hostGrid(reg, k, W2, H2) {
    const T = 2 ** Math.max(0, Math.ceil(Math.log2(SCALE * k) - 1e-9));
    const X0 = Math.max(0, Math.floor(reg.x * k / T) * T), X1 = Math.min(Math.floor(W2 / T) * T, Math.ceil((reg.x + reg.w) * k / T) * T);
    const Y0 = Math.max(0, Math.floor((H2 - (reg.y + reg.h) * k) / T) * T), Y1 = Math.min(Math.floor(H2 / T) * T, Math.ceil((H2 - reg.y * k) / T) * T);
    if (!(X1 > X0 && Y1 > Y0)) return null;
    return { T, k, X0, X1, Y0, Y1, x: X0 / k, y: (H2 - Y1) / k, w: (X1 - X0) / k, h: (Y1 - Y0) / k };
  }
  // hostBlur for some parts of the copy only (blurBoxes): each halving and the turn into the copy blit each part's pixels alone, from the
  // same pixels to the same texels as the blit of the whole region (each part starts and ends on the grid of every step, so each step
  // is still an exact 2 × 2 average), and the two passes are cut to the parts (scissor). Texels outside the parts keep whatever they
  // held; no glass reads them (blurBoxes).
  function partBlur(g, parts, bw, bh, B = hk) {
    const G = B.G;
    let t = g.T, ox = g.X0, oy = g.Y0, src = null;
    // (A part's pixels at t device px to a texel, from (ox, oy), y up: the copy's top row is the region's top.)
    const px = (r, t, ox, oy) => [ox + r[0] * t, oy + (bh - r[3]) * t, ox + r[2] * t, oy + (bh - r[1]) * t];
    for (let i = 0; t > 2; i++) {
      const nt = t / 2, st = step(i, bw * nt, bh * nt, B);
      if (!st.ok) { G.bindFramebuffer(G.READ_FRAMEBUFFER, null); G.bindFramebuffer(G.DRAW_FRAMEBUFFER, null); return false; }
      G.bindFramebuffer(G.READ_FRAMEBUFFER, src); G.bindFramebuffer(G.DRAW_FRAMEBUFFER, st.fb);
      for (const r of parts) {
        const a = px(r, t, ox, oy), b = px(r, nt, 0, 0);
        G.blitFramebuffer(a[0], a[1], a[2], a[3], b[0], b[1], b[2], b[3], G.COLOR_BUFFER_BIT, G.LINEAR);
      }
      src = st.fb; ox = 0; oy = 0; t = nt;
    }
    G.bindFramebuffer(G.READ_FRAMEBUFFER, src); G.bindFramebuffer(G.DRAW_FRAMEBUFFER, B.fbCopy);
    for (const r of parts) {
      const a = px(r, t, ox, oy);
      G.blitFramebuffer(a[0], a[1], a[2], a[3], r[0], r[3], r[2], r[1], G.COLOR_BUFFER_BIT, G.LINEAR);
    }
    G.bindFramebuffer(G.READ_FRAMEBUFFER, null); G.bindFramebuffer(G.DRAW_FRAMEBUFFER, null);
    G.useProgram(B.bprog); G.bindVertexArray(B.vao); G.disable(G.BLEND);
    G.viewport(0, 0, bw, bh);
    G.uniform4f(B.BU.uBox, 0, 0, bw, bh); G.uniform2f(B.BU.uView, bw, bh); G.uniform1i(B.BU.uT, 0);
    G.uniform1fv(B.BU.uW, gaussTaps(look.blur * g.k / g.T));
    G.activeTexture(G.TEXTURE0);
    G.enable(G.SCISSOR_TEST);
    for (const [fb, tex, dx, dy] of [[B.fbPass, B.copy, 1, 0], [B.fbOut, B.pass, 0, 1]]) {
      G.bindFramebuffer(G.FRAMEBUFFER, fb); G.bindTexture(G.TEXTURE_2D, tex); G.uniform2f(B.BU.uDir, dx, dy);
      for (const r of parts) { G.scissor(r[0], r[1], r[2] - r[0], r[3] - r[1]); G.drawArrays(G.TRIANGLE_STRIP, 0, 4); }
    }
    G.disable(G.SCISSOR_TEST);
    G.bindFramebuffer(G.FRAMEBUFFER, null);
    return true;
  }
  // (parts: blurBoxes' parts of the copy to make, or null for all of it.)
  function hostBlur(g, parts = null, B = hk) {
    const G = B.G, { T, k } = g;
    let x0 = g.X0, y0 = g.Y0, w = g.X1 - g.X0, h = g.Y1 - g.Y0;
    const bw = w / T, bh = h / T;
    if (B.size !== `${bw}x${bh}`) {
      if (!fits(G, bw, bh)) { B.size = ''; return false; }
      B.size = `${bw}x${bh}`; B.allocs = (B.allocs || 0) + 1;
      let ok = true;
      for (const [t, fb] of [[B.copy, B.fbCopy], [B.pass, B.fbPass], [B.blurred, B.fbOut]]) {
        G.bindTexture(G.TEXTURE_2D, t);
        G.texImage2D(G.TEXTURE_2D, 0, G.RGBA, bw, bh, 0, G.RGBA, G.UNSIGNED_BYTE, null);
        G.bindFramebuffer(G.FRAMEBUFFER, fb);
        G.framebufferTexture2D(G.FRAMEBUFFER, G.COLOR_ATTACHMENT0, G.TEXTURE_2D, t, 0);
        ok = ok && complete(G, 'glass-blur', bw, bh);
      }
      if (!ok) { B.size = ''; G.bindFramebuffer(G.FRAMEBUFFER, null); return false; }
    }
    if (gpuProbe.on) gpuProbe.note(COUNTED.glassCopy);
    let src = null;
    if (parts) return partBlur(g, parts, bw, bh, B);
    for (let i = 0; w > bw * 2 || h > bh * 2; i++) {
      const nw = w / 2, nh = h / 2, st = step(i, nw, nh, B);
      if (!st.ok) { G.bindFramebuffer(G.READ_FRAMEBUFFER, null); G.bindFramebuffer(G.DRAW_FRAMEBUFFER, null); return false; }
      G.bindFramebuffer(G.READ_FRAMEBUFFER, src); G.bindFramebuffer(G.DRAW_FRAMEBUFFER, st.fb);
      G.blitFramebuffer(x0, y0, x0 + w, y0 + h, 0, 0, nw, nh, G.COLOR_BUFFER_BIT, G.LINEAR);
      src = st.fb; x0 = 0; y0 = 0; w = nw; h = nh;
    }
    // (Turned over on the way: the copy's first row is the region's top, as a copy of the page's canvas is.)
    G.bindFramebuffer(G.READ_FRAMEBUFFER, src); G.bindFramebuffer(G.DRAW_FRAMEBUFFER, B.fbCopy);
    G.blitFramebuffer(x0, y0, x0 + w, y0 + h, 0, bh, bw, 0, G.COLOR_BUFFER_BIT, G.LINEAR);
    G.bindFramebuffer(G.READ_FRAMEBUFFER, null); G.bindFramebuffer(G.DRAW_FRAMEBUFFER, null);
    G.useProgram(B.bprog); G.bindVertexArray(B.vao); G.disable(G.BLEND);
    G.viewport(0, 0, bw, bh);
    G.uniform4f(B.BU.uBox, 0, 0, bw, bh); G.uniform2f(B.BU.uView, bw, bh); G.uniform1i(B.BU.uT, 0);
    G.uniform1fv(B.BU.uW, gaussTaps(look.blur * k / T));
    G.activeTexture(G.TEXTURE0);
    G.bindFramebuffer(G.FRAMEBUFFER, B.fbPass); G.bindTexture(G.TEXTURE_2D, B.copy); G.uniform2f(B.BU.uDir, 1, 0); G.drawArrays(G.TRIANGLE_STRIP, 0, 4);
    G.bindFramebuffer(G.FRAMEBUFFER, B.fbOut); G.bindTexture(G.TEXTURE_2D, B.pass); G.uniform2f(B.BU.uDir, 0, 1); G.drawArrays(G.TRIANGLE_STRIP, 0, 4);
    G.bindFramebuffer(G.FRAMEBUFFER, null);
    return true;
  }
  // The glass over the picture the figure has just laid (veins-gl top), into its canvas: first (prepInto, before any glass is drawn on
  // that picture) the region behind the glasses blurred from it, then each glass (drawInto) in its turn among the page's layers: the
  // pane under the labels, the teaching card's shade ('low'), the callouts, the other cards ('high'). The cards' two turns share one
  // blur and one set of marks, given back after the last turn (settleMarks).
  const frameMarks = new Set(), passPanes = [];
  let blurOK = false;
  const SHARED = GLASS_SHARE && !(reblur > 0);
  function prepInto() {
    frameMarks.clear(); blurOK = false;
    if (hk) hk.share = null;
    if (!hostOn || !hf || !hk || lost || dead) return;
    const G = hk.G;
    if (G.isContextLost() || !host.active()) return;
    const { panes, cr } = hf;
    if (!panes.length) return;
    const W2 = host.canvas.width, H2 = host.canvas.height, k = W2 / cr.width;
    if (!(k > 0) || !H2) return;
    if (SHARED) {
      // (blur-share.js: what this glass needs is entered; the first glass drawn on this picture blurs once for every glass of its look.)
      const S = shareFor(shares, G, look, SCALE);
      sharePrep(S, { id: shareId, boxes: panes.map((p) => ({ x: p.r.left - cr.left, y: p.r.top - cr.top, w: p.r.width, h: p.r.height })), key: `${version ? version() : performance.now()}|${fresh ? fresh() : ''}` });
      shareUse(S, shareId);
      hk.share = S; hk.k = k; blurOK = true;
      return;
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of panes) { x0 = Math.min(x0, p.r.left); y0 = Math.min(y0, p.r.top); x1 = Math.max(x1, p.r.right); y1 = Math.max(y1, p.r.bottom); }
    x0 = Math.max(0, x0 - cr.left - MARGIN); y0 = Math.max(0, y0 - cr.top - MARGIN);
    x1 = Math.min(cr.width, x1 - cr.left + MARGIN); y1 = Math.min(cr.height, y1 - cr.top + MARGIN);
    if (!(x1 > x0 && y1 > y0)) return;
    const grid = hostGrid({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, k, W2, H2);
    if (!grid) return;
    const reg = { x: grid.x, y: grid.y, w: grid.w, h: grid.h };
    G.disable(G.SCISSOR_TEST); G.disable(G.STENCIL_TEST);
    // (The parts of the copy the glasses read, unless the whole of it is blurred (?glassfull=1). Glasses that move change them, so they are
    // part of the key: the same picture with a card moved is blurred again where the card now is; a blur is never kept for other parts.)
    const bw = (grid.X1 - grid.X0) / grid.T, bh = (grid.Y1 - grid.Y0) / grid.T;
    let parts = full ? null : blurBoxes(panes.map((p) => ({ x: p.r.left - cr.left, y: p.r.top - cr.top, w: p.r.width, h: p.r.height })), grid.x, grid.y, grid.T / k, bw, bh);
    if (parts && (!parts.length || (parts.length === 1 && !parts[0][0] && !parts[0][1] && parts[0][2] === bw && parts[0][3] === bh))) parts = null;
    const rest = `${grid.X0}|${grid.Y0}|${grid.X1}|${grid.Y1}|${W2}x${H2}${parts ? `|${parts.join(';')}` : ''}`;
    const key = `${version ? version() : performance.now()}|${fresh ? fresh() : ''}|${rest}`;
    if (key !== hk.key) {
      // (Only the figure under the glass drawn again, its view and the region taken the same as the last blur's: blurred again at most
      // every REBLUR_MS, the glass drawn meanwhile from the blur it has. Those are the frames that are not plain blood (the ascites
      // ripple, a catheter, dye, an eased colour): a plain blood frame never gets here. A pan, a zoom or a glide moves the view, and
      // a card sliding or growing moves the region: both blur at once, as before. The last change is blurred when the time is up.)
      const view = version && host.view ? host.view() : null, t = performance.now();
      if (reblur > 0 && view !== null && hk.rest === rest && hk.view === view && hk.reg && t - hk.at < reblur) {
        if (!hk.trail) {
          const K = hk;
          K.trail = setTimeout(() => { K.trail = 0; if (hk === K && hostOn) { K.key = ''; host.now(); } }, reblur - (t - K.at) + 1);
        }
        hk.k = k;
        blurOK = true;
        if (gpuProbe.on) gpuProbe.note(COUNTED.glassSkip);
        return;
      }
      const ok = hostBlur(grid, parts);
      // (The figure's context left as its other passes expect to find it.)
      G.bindFramebuffer(G.FRAMEBUFFER, null); G.viewport(0, 0, W2, H2);
      G.bindTexture(G.TEXTURE_2D, null); G.useProgram(null); G.bindVertexArray(null);
      if (!ok) { hk.key = ''; return; }
      hk.key = key; hk.reg = reg; hk.rest = rest; hk.view = view; hk.at = t;
      if (hk.trail) { clearTimeout(hk.trail); hk.trail = 0; }
    } else if (gpuProbe.on) gpuProbe.note(COUNTED.glassSkip);
    hk.k = k;
    blurOK = true;
  }
  // The shared blur (blur-share.js), made by the first glass of its look drawn on this picture: the union of every glass's parts, on
  // the whole canvas's grid, into targets sized by the canvas alone (so a card moving never reallocates them). False: nothing to draw from.
  function runShare(S, cr) {
    if (!shareTurn(S)) return S.ok;
    const G = hk.G, W2 = host.canvas.width, H2 = host.canvas.height, k = hk.k;
    S.ok = false;
    const grid = hostGrid({ x: 0, y: 0, w: cr.width, h: cr.height }, k, W2, H2);
    if (!grid) { S.key = ''; return false; }
    const bw = (grid.X1 - grid.X0) / grid.T, bh = (grid.Y1 - grid.Y0) / grid.T;
    const plan = sharePlan(S, grid, grid.T / k, bw, bh, full, blurBoxes);
    S.reg = { x: grid.x, y: grid.y, w: grid.w, h: grid.h };
    // (In use in this frame, kept or made again: see the release below.)
    S.usedIn = frameCount();
    if (plan.key === S.key && S.t) { S.ok = true; S.skips++; if (gpuProbe.on) gpuProbe.note(COUNTED.glassSkip); return true; }
    if (!S.t) {
      S.t = { copy: texOf(G, G.LINEAR), pass: texOf(G, G.LINEAR), blurred: texOf(G, G.LINEAR), fbCopy: G.createFramebuffer(), fbPass: G.createFramebuffer(), fbOut: G.createFramebuffer(), steps: [], size: '', allocs: 0 };
      // (A retained holder of the budget: under pressure it is freed between frames and made again by the next blur that needs it.)
      S.hold?.drop();
      const mine = S.t;
      // (2 Nov 2026, bug sweep: hold() looks at the budget at once, and over its envelope (a phone in the lobule or the sinusoid) it let go
      // of this very blur before its first use: S.t was null on the next line, the throw took the cards' glass out of the canvas for the
      // rest of the session and every card stayed solid. A blur asked for in this frame (S.usedIn) is the glass on screen, not one kept for
      // later: a release then only takes it out of the budget's keeping (it is freed with its kit, hostFree), never out from under the
      // cards, and never freed and made again frame after frame. Between frames, unused, it is let go as before.)
      S.hold = hold({ owner: `shared glass blur ${S.look}`, kind: 'retained', gl: G, bytes: () => shareBytes(S), release: () => {
        if (S.t !== mine) return;
        S.hold = null;
        if (S.usedIn === frameCount()) return;
        freeShare(G)(mine); S.t = null; S.key = ''; S.ok = false;
      } });
    }
    S.hold?.touch();
    const B = Object.assign(S.t, { G, bprog: hk.bprog, BU: hk.BU, vao: hk.vao });
    G.disable(G.SCISSOR_TEST); G.disable(G.STENCIL_TEST);
    const ok = hostBlur(grid, plan.parts, B);
    G.bindFramebuffer(G.FRAMEBUFFER, null); G.viewport(0, 0, W2, H2);
    G.bindTexture(G.TEXTURE_2D, null); G.useProgram(null); G.bindVertexArray(null);
    S.key = ok ? plan.key : ''; S.ok = !!ok;
    if (ok) S.blurs++;
    return S.ok;
  }
  // (pass: 'low', 'high' or 'all'; the last turn of the frame ('high', 'all') gives back the marks of the glasses not drawn.)
  const maskFromKit = (p) => maskOf(p.g, p.d, p.lw, p.lh, hk);
  function drawInto(pass = 'all') {
    if (!hostOn || !hf || !hk || lost || dead) return;
    const G = hk.G;
    if (G.isContextLost()) return;
    // (No longer to be drawn there: this picture was laid without it, and the browser's glass shows in the same frame.)
    if (!host.active()) { dropHost(false); return; }
    const final = pass !== 'low';
    const { cr } = hf;
    if (blurOK && hk.share && (!runShare(hk.share, cr) || !hk.share.t)) blurOK = false;
    let panes = NONE;
    if (blurOK) {
      if (pass === 'all') panes = hf.panes;
      else { panes = passPanes; panes.length = 0; for (const p of hf.panes) if (!!host.low?.(p.g) === (pass === 'low')) panes.push(p); }
    }
    if (!panes.length) { if (final) settleMarks(frameMarks); return; }
    const W2 = host.canvas.width, H2 = host.canvas.height, k = hk.k;
    noteDraw(cards ? 'glass-cards' : pane ? 'glass-pane' : 'glass');
    if (gpuProbe.on) gpuProbe.note(cards ? COUNTED.cardDrawn : pane ? COUNTED.paneDrawn : COUNTED.glassDrawn);
    const U = hk.PU, R = hk.share ? hk.share.reg : hk.reg;
    masksFor(panes, hk);
    G.bindFramebuffer(G.FRAMEBUFFER, null);
    G.viewport(0, 0, W2, H2);
    G.disable(G.SCISSOR_TEST); G.disable(G.STENCIL_TEST);
    G.useProgram(hk.pprog); G.bindVertexArray(hk.vao);
    G.enable(G.BLEND); G.blendEquation(G.FUNC_ADD); G.blendFunc(G.ONE, G.ONE_MINUS_SRC_ALPHA);
    G.uniform2f(U.uView, W2, H2); G.uniform1i(U.uScene, 0); G.uniform1i(U.uMask, 1); G.uniform1f(U.uSat, look.sat);
    G.uniform4f(U.uReg, R.x * k, R.y * k, R.w * k, R.h * k);
    G.uniform3f(U.uBg, hf.base[0], hf.base[1], hf.base[2]);
    G.activeTexture(G.TEXTURE0); G.bindTexture(G.TEXTURE_2D, hk.share ? hk.share.t.blurred : hk.blurred);
    drawPanes(G, U, panes, cr, k, maskFromKit, frameMarks, final);
    // (The figure's context left as its other passes expect to find it.)
    G.disable(G.BLEND); G.bindVertexArray(null); G.useProgram(null);
    G.activeTexture(G.TEXTURE1); G.bindTexture(G.TEXTURE_2D, null); G.activeTexture(G.TEXTURE0); G.bindTexture(G.TEXTURE_2D, null);
    G.pixelStorei(G.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }
  const onHostLost = () => { if (host) { warmed.delete(host.gl); fills.delete(host.gl); shares.delete(host.gl); } hk = null; if (hostOn) { hostOn = false; hf = null; if (cards && CARD_MARK) document.documentElement?.removeAttribute?.('data-cardgl'); unmark(); tellHoles(NONE); if (canvas) canvas.style.visibility = ''; ask(); } };
  const sameList = (a, b) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  };
  // The page as the glasses need it, read once, outside any frame, and kept (geo), each moving part taken out (glass-motion.js): every
  // glass's box, corners, tint and the fade of everything that is not moving; the canvas's and the figure's boxes; the stage's colour;
  // what lies across the glasses (host.over). Read again only when something other than a glide or a fade changed: a write that is not
  // only a translation or an opacity (a size, a class, a new callout), a size change, a scroll, a resize, a font come in, the theme, an
  // animation ending, the slow look while asleep, the camera at rest after a move (what lies across the glasses), or the labels at rest
  // after a change. Each frame puts the motion back (nowGeo): the translations and opacities written inline on a glass or on what holds
  // it, and each running animation of either, from its keyframes and timing. No layout or style is read in a frame.
  let geo = null, geoT = 0, restT = 0;
  const anims = new Map();   // (element → Map(animation → { kf: its keyframes, c: its clock }))
  // (2 Nov 2026, Mohammad: "MOVE. EVERYTHING. TO. GPU". Where each animation is in a frame comes from its clock (glass-motion.js clockOf,
  // clockAt): its timing taken once when it is first seen, its start time once it has started, and the frame's time. A frame asked each
  // one for its playState, pending and getComputedTiming(), and each of those brings a CSS animation's styles up to date, every frame of
  // a slide change. Its end comes from its timing, or its finish, cancel or remove event (a cancel() sends one). ?glassclock=0: read
  // from the animation every frame, as before (that path is picked here, once, and runs only with the switch).)
  const CLOCK = !/[?&]glassclock=0\b/.test(SEARCH);
  const tlNow = () => { const t = document.timeline?.currentTime; return Number.isFinite(t) ? t : performance.now(); };
  // (stateOf answers in one kept record, read before the next call: nothing is made for each animation in a frame.)
  const ST = { st: '', p: null, end: 0, fills: false, bad: false, live: undefined };
  function clockState(an, rec) {
    ST.live = undefined;
    if (!rec.c) { ST.st = 'running'; ST.p = null; ST.end = Infinity; ST.fills = false; ST.bad = false; return ST; }
    const r = clockAt(rec.c, tlNow());
    ST.st = r.st; ST.p = r.p; ST.end = r.end; ST.fills = fillsAfter(rec.c); ST.bad = rec.c.bad;
    return ST;
  }
  function readState(an) {
    const ct = an.effect?.getComputedTiming?.();
    ST.st = an.playState; ST.p = ct?.progress; ST.end = ct?.endTime; ST.fills = fillsOn(an); ST.bad = false; ST.live = an.playState === 'running' || an.pending;
    return ST;
  }
  const stateOf = CLOCK ? clockState : readState;
  function timeAnim(an) {
    const rec = { kf: null, c: null };   // alloc-rare: an animation is timed once, the first time it is seen (trackSoon/measureGeo), never per frame
    try { rec.kf = an.effect?.getKeyframes?.() || null; } catch { rec.kf = null; }
    if (!CLOCK) return rec;
    const c = rec.c = clockOf(an, tlNow());
    if (!c) return rec;
    const stop = (done) => () => { if (done) c.done = true; else c.idle = true; wake(); measureSoon(); };   // alloc-rare: an animation is timed once, the first time it is seen (trackSoon/measureGeo), never per frame
    try {
      an.addEventListener?.('finish', stop(true));
      an.addEventListener?.('cancel', stop(false));
      an.addEventListener?.('remove', stop(false));
      if (c.s == null) an.ready?.then?.(() => { const s = an.startTime; if (Number.isFinite(s) && c.rate !== 0) c.s = s; wake(); }, () => {});   // alloc-rare: an animation is timed once, the first time it is seen (trackSoon/measureGeo), never per frame
    } catch (e) { caught('glass-gl:1233', e); /* (a stand-in with no events: its timing alone) */ }
    return rec;
  }
  // (Where an animation that has just finished left its element, until the page is read again: { t, o } of its last keyframe. Mohammad,
  // 2 Nov 2026, the iPhone: "the glass appears alone, a solid flash". A card's fade carried by its transition (the data card's pz-hide)
  // was dropped as it finished, and until the read after it the card's glass was drawn at the fade it had been read with, whole, over a
  // card at 0. ?glassend=0: as before.)
  const ENDS = !/[?&]glassend=0\b/.test(SEARCH);
  const ended = new Map();
  const RISE = !/[?&]glassrise=0\b/.test(SEARCH);
  const LIVE_READ = !/[?&]liveread=0\b/.test(SEARCH);
  const chainOf = (g) => { const c = []; for (let e = g; e && e !== stop && e.nodeType !== 9; e = e.parentElement) c.push(e); return c; };
  function addAnim(e, an) {
    let m = anims.get(e);
    if (!m) anims.set(e, (m = new Map()));
    if (!m.has(an)) m.set(an, timeAnim(an));
  }
  function track(e) {
    if (!e?.getAnimations) return;
    const list = e.getAnimations();
    for (const an of list) addAnim(e, an);
    // (One the page no longer lists has gone (cancelled, or ended with no fill): let go here, read outside any frame.)
    const m = CLOCK && anims.get(e);
    if (m) { for (const an of m.keys()) if (!list.includes(an)) m.delete(an); if (!m.size) anims.delete(e); }
  }
  // (A script's animate() on a glass or on what holds it is followed from its first frame: no event announces one.)
  // (An element whose inline opacity a stylesheet's !important beats, as read at the last read of the page: the teaching card's shade keeps
  // style.opacity 1 while .pz-leave holds it at 0 !important. Its fade is then the computed one, never the inline value, or the glass
  // drew the card's shell where the page showed none: the ghost panel left behind a case card (2 Nov 2026).)
  const inlineLoses = new WeakSet();
  const hooked = new WeakSet();
  function hook(e) {
    if (!e || hooked.has(e) || typeof e.animate !== 'function') return;
    hooked.add(e);
    const own = e.animate;
    e.animate = function (...args) { const an = own.apply(this, args); if (an) { addAnim(this, an); wake(); } return an; };   // alloc-rare: an element's animate() is hooked once, the first time it is seen
  }
  const fillsOn = (an) => /forwards|both/.test(an.effect?.getTiming?.().fill || '');
  // One element's moving part now: { t: [x, y] (its translation), o (its opacity, or null when not moving) }; bad: something it cannot
  // follow (the page is read again just after this frame); ended: an animation of it has ended (likewise, for its end state).
  // (Whether an animation ends: from the timing it was given (its clock, or getTiming), never its computed timing, which brings the
  // page's style up to date when asked in a frame. Its end is finite unless it repeats for ever.)
  function endsOf(an, rec) {
    if (rec?.c) return Number.isFinite(rec.c.iters);
    let t;
    try { t = an.effect?.getTiming?.() || null; } catch { t = null; }
    return !!t && t.iterations !== Infinity && !(typeof t.duration === 'number' && !Number.isFinite(t.duration));
  }
  const MV = { x: 0, y: 0, o: null }, CM = { x: 0, y: 0, o: 1 };   // (moveOf's and chainMove's answers: kept records, read before the next call)
  function moveOf(e, flag) {
    let tx = 0, ty = 0, hasT = false, o = null;
    const m = anims.get(e);
    if (m) {
      for (const [an, rec] of m) {
        const kf = rec.kf, S = stateOf(an, rec), st = S.st;
        if (st === 'idle' || (st === 'finished' && !S.fills)) {
          m.delete(an); flag.ended = true;
          if (ENDS && st === 'finished') { const v = kf && motionAt(kf, 1); if (v) { const was = ended.get(e) || {}; ended.set(e, { t: v.t || was.t || null, o: v.o ?? was.o ?? null }); } }   // alloc-rare: an animation has just finished (once per animation), not per frame
          continue;
        }
        if (S.bad) { flag.bad = true; continue; }
        const p = S.p;
        if (p == null) continue;
        const v = motionAt(kf, p);
        // (One that has finished and holds its end, a card zoomed up, is in the box the page was read at: nothing to put back, and its end
        // read the page again already, so it no longer asks for a read in every frame.)
        if (!v && (st === 'finished' || e.zoomAffine)) continue;
        if (!v) { flag.bad = true; if (st === 'running' && endsOf(an, rec)) flag.live = true; continue; }
        if (v.t) { tx = v.t[0]; ty = v.t[1]; hasT = true; }
        if (v.o != null) o = v.o;
      }
      if (!m.size) anims.delete(e);
    }
    const end = ENDS && ended.get(e);
    if (end) { if (!hasT && end.t && !e.style?.transform) { tx = end.t[0]; ty = end.t[1]; hasT = true; } if (o == null && end.o != null) o = end.o; }
    const s = e.style;
    if (s) {
      if (!hasT && !e.zoomAffine) { const a = shiftOf(s.transform); if (!a) flag.bad = true; else { tx = a[0]; ty = a[1]; } }
      const b = translateOf(s.translate);
      if (!b) flag.bad = true; else { tx += b[0]; ty += b[1]; }
      if (o == null && s.opacity !== '' && s.opacity != null && !inlineLoses.has(e)) o = NUM(s.opacity);
      // (A card the page moves by a custom property its stylesheet turns into a translate (the words' card's --pz-rise as the readings are
      // pulled out, the data card's --pz-lift): cards.shift(e) gives that move, read from the inline value each frame, so the glass rises
      // with its words. Before, it waited for the next read of the page and the words outran their card (Mohammad, 2 Nov 2026, untucking
      // on the iPhone). ?glassrise=0: as before.)
      if (RISE && cards?.shift && !s.translate && !anims.get(e)?.size) { const sh = cards.shift(e); if (sh) { tx += sh[0]; ty += sh[1]; } }
    }
    MV.x = tx; MV.y = ty; MV.o = o;
    return MV;
  }
  const sameRect = (a, b) => Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;
  /** Where a card's box is drawn at time t, before its motion: its eased size (morph) or its box. */
  function morphAt(q, t) {
    const M = q.morph;
    if (!M) return q.r0;
    const u = Math.min(1, Math.max(0, (t - M.t0) / M.ms));
    if (u >= 1) return q.r0;
    const e = easeArrive(u), a = M.from, b = q.r0, L = a.left + (b.left - a.left) * e, T = a.top + (b.top - a.top) * e;
    const W = a.width + (b.width - a.width) * e, H = a.height + (b.height - a.height) * e;
    return { left: L, top: T, right: L + W, bottom: T + H, width: W, height: H };
  }
  // (card-zoom.js zoomAffine(): the zoom's scale s about (ox, oy), then the move (dx, dy), in screen px, as the card is drawn this frame.)
  const unzoom = (r, a) => { const f = (v, m, d) => m + (v - d - m) / a.s, l = f(r.left, a.ox, a.dx), t = f(r.top, a.oy, a.dy), rt = f(r.right, a.ox, a.dx), b = f(r.bottom, a.oy, a.dy); return { left: l, top: t, right: rt, bottom: b, width: rt - l, height: b - t }; };
  const shift = (r, t) => (t[0] || t[1] ? { left: r.left + t[0], top: r.top + t[1], right: r.right + t[0], bottom: r.bottom + t[1], width: r.width, height: r.height } : r);
  function chainMove(chain, flag) {
    let x = 0, y = 0, o = 1;
    for (const e of chain) { const m = moveOf(e, flag); x += m.x; y += m.y; if (m.o != null) o *= m.o; }
    CM.x = x; CM.y = y; CM.o = o;
    return CM;
  }
  function measureGeo() {
    clearTimeout(geoT); geoT = 0;
    if (dead || lost) return;
    ended.clear();
    const list = glassesOf();
    const tgt = host?.canvas || canvas;
    for (const g of list) for (const e of chainOf(g)) { track(e); hook(e); }
    if (tgt) track(tgt);
    const flag = {};
    const cr = tgt ? tgt.getBoundingClientRect() : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    const cm = tgt ? moveOf(tgt, flag) : MV, cmx = tgt ? cm.x : 0, cmy = tgt ? cm.y : 0;   // (read now: the next moveOf writes the same record)
    const view = viewSize(), vw = view.w || cr.right, vh = view.h || cr.bottom;   // (the window's size kept from its last resize: layout-snap.js)
    const ws = getComputedStyle(wrap), bgs = ws.backgroundColor;
    resolveColour(bgs);
    const bg = colour(bgs, 'transparent');
    const bgVar = bg[3] > 0 ? '' : ws.getPropertyValue('--stage-bg').trim() || ws.getPropertyValue('--bg').trim();
    resolveColour(bgVar);
    const prev = geo?.panes || [], tNow = performance.now();
    const panes = readPanes(list, MOTION).map((p) => {
      p.tint = p.tint.trim();   // (a frame looks the colour up by this string)
      resolveColour(p.tint);
      if (p.line) resolveColour(p.line);
      for (const d of p.drops || []) resolveColour(d.c);
      const chain = chainOf(p.g);
      for (const e of chain) { const so = e.style?.opacity; if (so !== '' && so != null && ![...(anims.get(e) || [])].some(([an, rec]) => stateOf(an, rec).st === 'running') && Math.abs(fadeOf(e) - NUM(so)) > 0.01) inlineLoses.add(e); else inlineLoses.delete(e); }
      const mv = chainMove(chain, flag);
      // (The fade of what does not move, read now; what moves is put back each frame.)
      let aS = p.oa ?? 1;
      for (const e of chain) { if (moveOf(e, flag).o != null) continue; const v = fadeOf(e); if (v < 1) aS *= v; }   // (a missing or odd value is no fade)
      const back = [-mv.x, -mv.y];
      // (A card card-zoom.js moves: its box is the rest box, its motion the zoom's analytic one (zoomAffine, put back each frame in nowGeo), so what is
      // read now, at the zoom it has, is taken back to where the card rests.)
      const za = p.g.zoomAffine?.() ?? null;
      const rest = (r) => (za ? unzoom(r, za) : r);
      const r0 = rest(shift(p.r, back)), er0 = rest(shift(p.er, back));
      // (A card the page asks to change size in view (data-gl-morph: the teaching card's glass kept up through a slide change) eases from
      // where it is drawn now to its new box on the GPU, its edge and shadows with it; read again mid-way, it carries on from there.)
      let morph = null;
      if (GPU_EDGE && p.rad && !p.d) {
        const q = prev.find((x) => x.g === p.g && x.rad && !x.d);
        if (q) {
          const cur = morphAt(q, tNow);
          if (p.g.hasAttribute('data-gl-morph') && !sameRect(cur, r0)) morph = { from: cur, t0: tNow, ms: D_SURFACE };
          else if (q.morph && tNow - q.morph.t0 < q.morph.ms && sameRect(q.r0, r0)) morph = q.morph;
        }
      }
      if (morph) liveUntil = Math.max(liveUntil, morph.t0 + morph.ms + 34);
      return { ...p, chain, r0, er0, aS, morph, zoomed: !!za, rad0: za && p.rad ? p.rad.map((v) => v / za.s) : p.rad };
    });
    for (const p of panes) {
      // (What a frame writes its boxes and fade into: kept with the page read, so nowGeo makes nothing.)
      p.radZ = p.rad0 ? [0, 0, 0, 0] : null;
      p.live = { ...p, r: newRect(), er: newRect(), a: 0 };
    }
    const over = host ? (cards ? { low: host.over?.('low') || [], high: host.over?.('high') || [] } : { all: host.over?.() || [] }) : null;
    geo = { list, cr0: shift(cr, [-cmx, -cmy]), tgt, sr: tgt === source ? cr : source.getBoundingClientRect(),   // (the figure's canvas is both: one read, not two)
      vw, vh, bgs, bg, bgVar, panes, over, vk: host?.view?.() ?? null };
    if (watchRo) { if (tgt) watchRo.observe(tgt); for (const g of list) watchRo.observe(g); }
    wake();
  }
  // (2 Nov 2026, the iPhone trace: a write the observers saw, to the callouts, a card, the page's classes, was read at once, in the
  // observer's task (a microtask straight after a frame's callbacks, or an event's), where the page's styles were not up to date: the
  // animations and boxes read there made the browser restyle and lay out the page then, up to 14 ms on a slide change. Those reads wait
  // for the first, read-only phase of the next frame (frame.js readFrame), where the page is as the browser last laid it, and the glass
  // drawn in that frame's final phase still has them. ?glassearly=0: read at once, as before.)
  const GEO_EARLY = !/[?&]glassearly=0\b/.test(SEARCH);
  const readFrame = readFrameFor(cards ? 'glass-cards' : pane ? 'glass-pane' : 'glass');
  let earlyAsk = 0;
  function measureEarlyNow() { earlyAsk = 0; if (trackQ.size) trackNow(); measureGeo(); }
  // (Likewise a transition or animation that has just started: its keyframes are taken in the next frame's read phase, which comes after
  // the browser sent the event, in the same frame.)
  const trackQ = new Set();
  let trackAsk = 0;
  function trackNow() { trackAsk = 0; for (const e of trackQ) track(e); trackQ.clear(); }
  function trackSoon(e) {
    if (!e) return;
    if (!GEO_EARLY || framePhase() === 'read') { track(e); return; }
    trackQ.add(e);
    if (!trackAsk) trackAsk = readFrame(trackNow);
  }
  // (2 Nov 2026: an observer that fires in the read phase fired after a write made there, so a read in it laid the page out in that
  // microtask: it is read in the next frame's read phase too. ?glassobs=0: read at once there, as before; ?glassearly=0: always at once.
  // Picked once, here.)
  const OBS_LATER = !/[?&]glassobs=0\b/.test(SEARCH);
  const measureAtOnce = GEO_EARLY && OBS_LATER ? null : measureGeo;
  function measureEarly() {
    if (measureAtOnce && (!GEO_EARLY || framePhase() === 'read')) { measureAtOnce(); return; }
    if (!earlyAsk) earlyAsk = readFrame(measureEarlyNow);
  }
  /** The page read again just after this frame (or now, outside a frame), once however often asked. */
  function measureSoon(ms = 0) { if (!geoT) geoT = setTimeout(measureGeo, ms); }
  // (The labels drawn anew (their boxes may now lie across a glass): read once they rest, 250 ms after the last change.)
  function measureAtRest() { clearTimeout(restT); restT = setTimeout(() => { restT = 0; measureGeo(); }, 250); }   // alloc-rare: the labels' rest timer is armed from a redraw, not drawn per frame
  // (nowGeo's answer and its parts, kept: the canvas's box, the move flags, the glasses of this frame; read before the next call.)
  const NOW = { cr: null, panes: [], sr: null, bgs: '', bg: CLEAR4, bgVar: '', over: null, vw: 0, vh: 0 }, NF = { bad: false, ended: false, live: false }, crLive = newRect();
  let vkSeen = null, vkAt = 0;
  /** The glasses as they are this frame, from geo and their motion: { cr, panes, sr, bgs, bg, bgVar, over, vw, vh }, or null with none read yet. */
  function nowGeo(list) {
    const G = geo;
    if (!G) { measureSoon(); return null; }
    if (!sameList(G.list, list)) measureSoon();
    const flag = NF, panes = NOW.panes;
    flag.bad = false; flag.ended = false; flag.live = false;
    panes.length = 0;
    let cx = 0, cy = 0;
    if (G.tgt) { const m = moveOf(G.tgt, flag); cx = m.x; cy = m.y; }
    const cr = shiftInto(crLive, G.cr0, cx, cy);
    for (const p of G.panes) {
      if (!p.g.isConnected) continue;
      const mv = chainMove(p.chain, flag), a = p.aS * mv.o;
      if (!(a > 0.001)) continue;
      const L = p.live;
      L.a = a;
      if (p.morph) { morphInto(L.r, p, performance.now(), mv.x, mv.y); copyRect(L.er, L.r); L.rad = p.rad; panes.push(L); continue; }
      if (p.zoomed) {
        const za = p.g.zoomAffine?.() ?? null;
        if (za) { zoomInto(L.r, p.r0, za, mv.x, mv.y); zoomInto(L.er, p.er0, za, mv.x, mv.y); }
        else { shiftInto(L.r, p.r0, mv.x, mv.y); shiftInto(L.er, p.er0, mv.x, mv.y); }
        if (za && p.rad0) { const z = p.radZ; for (let i = 0; i < 4; i++) z[i] = p.rad0[i] * za.s; L.rad = z; } else L.rad = p.rad0;
        panes.push(L);
        continue;
      }
      shiftInto(L.r, p.r0, mv.x, mv.y); shiftInto(L.er, p.er0, mv.x, mv.y); L.rad = p.rad;
      panes.push(L);
    }
    // (A move the motion cannot put back by itself (a card zoomed up: a scale, in a glide that ends): read again in the next frame's read phase, so its glass is
    // drawn where the card is in that frame, never left a frame or more behind at its old box, an empty panel (Mohammad, 2 Nov 2026, a
    // chart zoomed on HVPG 3). ?liveread=0: just after this frame, as before.)
    if (flag.live && LIVE_READ) measureEarly(); else if (flag.bad || flag.ended) measureSoon();
    if (due?.()) measureSoon();
    // (The camera moved since the page was read: what lies across the glasses is read again once it has rested 250 ms. While it moves, a
    // glass keeps the way it is drawn; hostDraw changes it only at rest anyway.)
    const vk = host?.view?.() ?? null;
    if (vk !== G.vk) {
      const t = performance.now();
      if (vk !== vkSeen) { vkSeen = vk; vkAt = t; }
      else if (t - vkAt >= 250) measureSoon();
      if (!heldWake) heldWake = setTimeout(heldWakeFn, 120);
    }
    NOW.cr = cr; NOW.sr = G.sr; NOW.bgs = G.bgs; NOW.bg = G.bg; NOW.bgVar = G.bgVar; NOW.over = G.over; NOW.vw = G.vw; NOW.vh = G.vh;
    return NOW;
  }
  // While a callout shows, every frame something under or in it moves: the figure drawn again (the blood under it), a callout
  // written (its place, its size, a class), or one of its transitions or animations running. A frame that would draw the same
  // picture draws nothing, and two such frames in a row put the glass to sleep (a paused figure, settled callouts): no copy, no
  // blur, no draw and no frame asked for, only a look once a second in case a change came by a path that does not wake it.
  // A callout written outside a frame is drawn in the next frame's final phase, before that frame is shown, so the glass never trails its outline.
  // (On the shared scheduler's final phase: after every other surface's frame, the figure's own pass and the callouts' writes
  // included, so it blurs the figure of this frame, not the last, and is drawn once in a frame whoever asked.)
  const later = finalFrameFor(cards ? 'glass-cards' : pane ? 'glass-pane' : 'glass');
  // (The writes made before it in this frame: a glide or a fade is put back by the motion now; anything else is read just after this frame.)
  const loop = () => { raf = 0; if (changed(mo.takeRecords())) measureSoon(); settle(draw()); };
  function ask() { if (!raf && !lost && !dead) raf = later(loop); }
  /** Something the glass shows may have changed: it looks again (for two frames at least). */
  function wake() { quiet = 0; ask(); }
  // (Any animation of a glass or of what holds it still running: no event says when a script's ends.)
  function moving() {
    for (const [e, m] of anims) {
      let keep = false;
      for (const [an, rec] of m) {
        const S = stateOf(an, rec);
        if ((S.live ?? S.st === 'running') && Number.isFinite(S.end)) return true;   // (one that never ends does not hold it awake)
        if (S.st !== 'idle' && (S.st !== 'finished' || S.fills)) keep = true;
      }
      if (!keep) anims.delete(e);
    }
    return false;
  }
  const pollFn = () => { poll = 0; measureGeo(); };
  function settle(r) {
    shown = !!r;
    clearTimeout(poll); poll = 0;
    if (lost || dead) return;
    quiet = r === 'same' ? quiet + 1 : 0;
    const running = performance.now() < liveUntil;
    // (Showing: on while it drew, a copy is on its way, or for two quiet frames. Not showing: on only while a transition may bring it in.
    // Either way, never asleep while something in the layers is still animating: a script's fade sends no event.)
    if ((r ? r === true || pending || quiet < 2 : false) || running || moving()) { ask(); return; }
    // (Asleep: a slow look while any glass is on the page; none, and only a new callout (a write to the layers) wakes it.)
    if (glassesNow().length) poll = setTimeout(pollFn, 1000);
  }
  // (Whether these writes change more than the motion puts back: anything but a style that changed only in a translation or an opacity
  // already written there (glass-motion.js movesOnly) on an element inside the glasses' layers. ?glassmotion=0: every write does.)
  function changed(recs) {
    for (const r of recs) {
      if (!MOTION || r.type !== 'attributes' || r.attributeName !== 'style') return true;
      const e = r.target;
      if (e.contains?.(stop) || !movesOnly(r.oldValue || '', e.getAttribute('style') || '')) return true;
    }
    return false;
  }
  // (A write to the callouts asks for the glass's frame, not a draw of its own: a write made in a task (an event, a timer) is drawn in the
  // final phase of the frame that shows it, so the glass still never trails its outline, and one made in a frame before the glass's turn
  // is taken by its loop (takeRecords). The microtask draw it was had drawn a second time in a frame while callouts moved; 30 Oct,
  // review H4b.)
  const mo = new MutationObserver((recs) => { if (!recs?.length || changed(recs)) measureEarly(); quiet = 0; ask(); });
  const watched = cards ? cards.watch : pane ? [pane] : layers;
  for (const l of watched) mo.observe(l, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: ['style', 'class', 'data-at', 'hidden'] });
  const again = () => measureEarly();
  const observers = [mo, new MutationObserver(again), new MutationObserver(again)];
  observers[1].observe(document.documentElement, { attributes: true, attributeFilter: ['data-noglass', 'data-theme', 'data-palette', 'class'] });
  observers[2].observe(wrap, { attributes: true, attributeFilter: ['class'] });   // (the GPU figure on or off: live(); the stage's look)
  // (What can move the glasses, the canvas or the figure with no write in the layers: a style, class or hidden on any of their parents, a
  // size change, a scroll, a font come in. A parent's glide or fade above the layers is read again too: the motion follows only what lies
  // between a glass and its canvas.)
  const parentsMo = new MutationObserver(() => measureEarly());
  {
    const chain = new Set();
    for (const el of [...watched, source]) for (let e = el === source ? el : el.parentElement; e && e.nodeType === 1; e = e.parentElement) chain.add(e);
    for (const e of chain) parentsMo.observe(e, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    observers.push(parentsMo);
  }
  const watchRo = typeof ResizeObserver === 'function' ? new ResizeObserver(() => measureEarly()) : null;
  for (const e of [canvas, source, wrap]) if (e) watchRo?.observe(e);
  const onScroll = () => measureSoon();
  document.addEventListener?.('scroll', onScroll, true);
  document.fonts?.addEventListener?.('loadingdone', again);
  // (A CSS transition or animation starting anywhere: followed if it moves a glass or what holds it (its keyframes taken now, once); one
  // ending, anywhere: the page read again for where it ended.)
  const docStart = (e) => { trackSoon(e?.target); wake(); };
  const docEnd = () => measureEarly();
  const DOC_START = ['transitionrun', 'animationstart'], DOC_END = ['transitionend', 'transitioncancel', 'animationend', 'animationcancel'];
  for (const t of DOC_START) document.addEventListener?.(t, docStart, true);
  for (const t of DOC_END) document.addEventListener?.(t, docEnd, true);
  // A callout's fade, glide or hover moves its glass with no write to wake it: it is followed while it runs.
  const held = (e) => {
    liveUntil = performance.now() + 800;
    if (/(end|cancel)$/.test(e?.type || '')) { measureEarly(); return; }   // (ended: read where it ended)
    if (e?.target && /^(transition|animation)/.test(e.type)) trackSoon(e.target);
    wake();
  };
  const EVENTS = ['transitionrun', 'transitionstart', 'transitionend', 'transitioncancel', 'animationstart', 'animationend', 'animationcancel', 'pointerover', 'pointerout'];
  for (const l of watched) for (const t of EVENTS) l.addEventListener(t, held, true);
  addEventListener('resize', again);
  // (card-zoom.js moves the card in the frame loop and tells each frame: the glass is drawn in that frame, from the same zoom.)
  const onZoomFrame = () => { quiet = 0; ask(); };
  addEventListener('pps:zoomframe', onZoomFrame);
  // (The figure drawn again: the blur under a glass that shows is taken again. With none showing, the figure is not its business.)
  const offFigure = onFigure?.(() => { if (shown && !hostOn) wake(); });   // (drawn into the figure's canvas: laid with each picture)
  const onLost = (e) => { e.preventDefault(); lost = true; unmark(); };
  canvas?.addEventListener('webglcontextlost', onLost);
  // Copy mode: the context given back (iOS Safari returns to the page, or a GPU process restarts) gets its programs, textures and
  // framebuffers again and the next frame takes a fresh copy of the figure; the browser's glass shows until it is in. (Without a copy of
  // its own there is no context here: the glass drawn into the figure's canvas follows that canvas, setHost.)
  const onBack = () => {
    if (dead || !gl) return;
    progs = programsOf(gl);
    if (!progs) { dead = true; unmark(); return; }   // (the shaders will not build: the browser's glass stays)
    own();
    maskTex.clear(); maskFb.clear(); masks = new WeakMap(); fills.delete(gl);   // (the masks' textures went with the context)
    gen++; pending = false; ready = null; takenKey = ''; fbSize = ''; drawn = false;
    lost = false;
    measureGeo();
  };
  canvas?.addEventListener('webglcontextrestored', onBack);
  measureGeo();
  return {
    canvas,
    // (Asked from outside, often in a frame (the labels drew anew): it looks now, and reads the page once that has rested.)
    redraw() { measureAtRest(); wake(); },
    /** The figure's canvas to draw into while it may (see above); callouts only. */
    // (h: { gl, canvas, add, now, active, over, low, order }: the figure's canvas and its context (veins-gl top), add({ order, prep,
    // draw }) to be drawn at the end of each picture it lays, now() to lay one at once, active() whether the glass may be drawn there,
    // over(level) and low(g) as above, order the turn (a card's: { low, high }).)
    setHost(h) {
      if (!h?.gl || !h.add || dead) return;
      // (A host set again (the figure's context made anew after a loss): the old one's turns, watch and kit let go first.)
      if (host) {
        dropHost(false);
        for (const off of hostTops) off();
        hostTops = []; hostMo?.disconnect(); hostMo = null;
        host.canvas.removeEventListener('webglcontextlost', onHostLost);
        hostFree();
      }
      host = h;
      if (GLASS_WARM) { warmPrograms(h.gl, false); if (SHADER_WARM) h.warmIn?.(warmTask(h.gl)); }   // (started now, published when done: see warmPrograms, warmTask)
      host.canvas.addEventListener('webglcontextlost', onHostLost);
      hostTops = cards
        ? [host.add({ order: h.order?.low ?? 1, prep: prepInto, draw: () => drawInto('low') }), host.add({ order: h.order?.high ?? 3, draw: () => drawInto('high') })]
        : [host.add({ order: h.order ?? 2, prep: prepInto, draw: () => drawInto('all') })];
      // (The figure's canvas faded, hidden or moved by a style of its own (a resolution's fade, a sub-pixel rest): looked at again.)
      hostMo = new MutationObserver((recs) => { if (!recs?.length || changed(recs)) measureEarly(); else wake(); });
      hostMo.observe(host.canvas, { attributes: true, attributeOldValue: true, attributeFilter: ['style', 'class', 'hidden'] });
      measureGeo();
    },
    /** Gives the figure's canvas back at once (the stage is about to copy its picture: a resolution's fade): the browser's glass, or the
     *  glass's own canvas, shows in the same frame. Drawn there again when active() says so. */
    release() { dropHost(false); },
    /** Into the figure's canvas, over the picture it has just laid (its top hook). */
    drawInto,
    /** Whether the glass is drawn into the figure's canvas now. */
    get hosted() { return hostOn; },
    /** The ?perf blur gauge (perf-readout.js): null when `el` is not one of this glass's; else why the browser's blur is the one showing
     *  on it, or '' when its glass is drawn here (in the figure's canvas, or on this glass's own canvas from a copy). */
    why(el) {
      if (!el || !glassesOf().includes(el)) return null;
      if (hostOn) return whyEl.get(el) || '';
      if (!host) return copy ? '' : 'no figure canvas to draw into';
      return whyAll || 'not drawn in the figure\'s canvas yet';
    },
    get on() { return !lost && !dead; },
    /** The ?perf surfaces list (gpu-surfaces.js): null with none of its glasses on the page, else how they are drawn now. Read only by
     *  the readout (twice a second while it is open), never in a frame. */
    state() {
      const n = glassesOf().length;
      if (!n) return null;
      if (lost || dead) return { on: 'fallback', via: `browser blur, ${n}`, why: dead ? 'its GPU drawing could not be made again' : 'context lost' };
      if (hostOn) return { on: 'gpu', via: `in the figure's canvas, ${n}` };
      if (!host && copy) return { on: 'gpu', via: `own canvas from a copy, ${n}` };
      return { on: 'fallback', via: `browser blur, ${n}`, why: !host ? 'no figure canvas to draw into' : whyAll || 'not drawn in the figure\'s canvas yet' };
    },
    /** Let go of it: its frames, timers, observers, listeners and GPU objects, and its canvas; the browser's glass shows again. */
    dispose() {
      if (gen < 0) return;
      dead = true; gen = -1;
      cancelFrame(raf); raf = 0; clearTimeout(poll); poll = 0; clearTimeout(geoT); geoT = 0; clearTimeout(restT); restT = 0;
      for (const o of observers) o.disconnect();
      watchRo?.disconnect();
      document.removeEventListener?.('scroll', onScroll, true);
      document.fonts?.removeEventListener?.('loadingdone', again);
      for (const t of DOC_START) document.removeEventListener?.(t, docStart, true);
      for (const t of DOC_END) document.removeEventListener?.(t, docEnd, true);
      anims.clear();
      for (const l of watched) for (const t of EVENTS) l.removeEventListener(t, held, true);
      removeEventListener('resize', again); removeEventListener('pps:zoomframe', onZoomFrame);
      offFigure?.();
      canvas?.removeEventListener('webglcontextlost', onLost);
      canvas?.removeEventListener('webglcontextrestored', onBack);
      host?.canvas.removeEventListener('webglcontextlost', onHostLost);
      hostMo?.disconnect();
      for (const off of hostTops) off();
      hostTops = [];
      unmark();
      tellHoles(NONE);
      if (hostOn) { hostOn = false; hf = null; if (cards && CARD_MARK) document.documentElement?.removeAttribute?.('data-cardgl'); host?.now(); }
      hostFree();
      if (gl && !lost) {
        for (const t of [copyTex, pass, blurred, ...maskTex]) gl.deleteTexture(t);
        gl.deleteFramebuffer(fbPass); gl.deleteFramebuffer(fbOut);
        for (const fb of maskFb) gl.deleteFramebuffer(fb);
        gl.deleteProgram(bprog); gl.deleteProgram(pprog); gl.deleteVertexArray(vao);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
      maskTex.clear(); maskFb.clear();
      canvas?.remove();
    },
  };
}
