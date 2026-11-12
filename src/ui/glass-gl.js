// The figure callouts' frosted glass drawn on the GPU (his pick, 25 Oct: "GPU glass"). The callouts stay HTML, and each one's
// glass (.cl-glass, callout.js) keeps its shape and its 2 px outline; only the blur and the tint behind it move here, to one
// pass of the figure's own GPU context (setHost). The browser's backdrop blur redrew every callout over the moving figure on
// every frame; here the figure just laid is made small on the GPU (averaged to one texel each 64 CSS px: SMOOTH, since 12 Nov 2026 the
// field, the blur's two passes gone), and each callout's shape is cut from it, the field read over those averages. There is no canvas or context of the glass's own (G5, 4 Nov 2026).
// What differs from the browser's glass: only the GPU's figure (veins-gl: the plate, the vessels, the blood) is under the blur;
// the SVG drawn over it (stents, guides) and the labels are hidden behind the glass rather than blurred into it.
// Off (the browser's glass, as before): no WebGL2, a software renderer, Settings' blur effect off, reduced
// transparency, or a browser without backdrop blur (whose solid card stays).

import { BLOOD_BLUR_MS, shareFor, sharePrep, sharePlan, shareKeep, shareForget, shareShift, shareTurn, shareUse, shareRelease, shareBytes } from './blur-share.js';
import { glCap, fbComplete } from './gl-state.js';
import { glassCover } from './glass-cover.js';
import { hold } from './gpu-budget.js';
import { gpuProbe, COUNTED } from './gpu-probe.js';
import { finalFrameFor, readFrameFor, framePhase, frameCount, cancelFrame, noteDraw } from './frame.js';
import { startProgram, checkProgram, compileDone, exerciseDraw, SHADER_WARM } from './gl-compile.js';
import { Inline, inlineShift, inlineTranslate, Motion, compileKeyframes, motionAt, movesOnly, clockOf, clockAt } from './glass-motion.js';
import { pathPolys, fanTriangles } from './path-poly.js';
import { easeArrive, D_SURFACE } from './ease.js';
import { caught } from './caught.js';
import { glassForgetters } from './drop-label.js';
import { booting, holdCover } from './quiet.js';
import { viewSize, readAnims } from './layout-snap.js';
import { parseCssColor } from './css-color.js';
import { driven, isDrivenAnimation, onMove } from './num-move.js';
import { counts, tally } from './frame-counts.js';
import { zoomRide, onZoomFrame as onSceneZoomFrame } from './scene-cam.js';

/** The callouts' glass: since 11 Nov 2026 the cards' own (CARD: 22 px, saturate 1.15, 66 % of --surface; it was 16 px over 58 %), as every
 *  glass is ("Tint and blur of glass should be the same EVERYWHERE"); app.css .cl-glass, the solid fill where there is no GPU glass, at 66 % too. */
export const GLASS = { blur: 22, sat: 1.15, tint: 0.66 };
/** The liver label's pane (app.css .lb-glass: blur(9px) saturate(1.2) over --frost, its corners its border radius). */
export const PANE = { blur: 9, sat: 1.2 };
/** The Present cards' frost (Mohammad, 2 Nov 2026, on the iPhone: "the blur sucks now it's just transparent"): the callouts' 16 px blur
 *  left the vessels and organs readable through a card; 30 px under a 74 % tint (70ca81f6) read muddy, "not clean". A card is blurred at 22 px
 *  (sigma 22 px), on a grid of 8 CSS px a texel (2.75 texels, inside the 12 taps), from 3 sigmas of figure around it;
 *  its tint, app.css --pz-frost (66 % of the surface, 58 % before), was read from each card's --gl-tint.
 *  tint: since 11 Nov 2026 (Mohammad: "Tint and blur of glass should be the same EVERYWHERE") every card (glass.add's `card`: the talk's
 *  teaching, case, data, readings and key cards and its bar, the phone's sheets, the toasts) is drawn with this one glass, the surface at
 *  this strength, whatever its own --gl-tint says (the sheets' 80 %, the toasts' 70 %, the high-contrast bar's 92 %). Its own --gl-tint still
 *  says whether it is drawn here at all (a tint that does not read, or none: the browser's glass, as before): paneTint. */
export const CARD = { blur: 22, sat: 1.15, scale: 8, margin: 66, tint: 0.66 };
/** The glass's filter (Mohammad, 12 Nov 2026, after trying Off, Blur, M1 and F4 on every glass: "No more real blur or mesh. Field or Off."; his
 *  F4): no blur passes, only the figure averaged to one texel each `scale` CSS px (halvings: a texel is the mean of its square, and a read between
 *  texels a tent of two, as the mocks' mipmap was), and over those averages a cubic B-spline at `cell` CSS px cells laid from each glass's corner,
 *  C2 smooth so no cell edge shows. Its reads are held within `reach` CSS px of the glass (inside the parts made for it); `margin`: CSS px of
 *  figure taken around a glass where it is not shared (option reblur). The tint, saturation, shadows, edge and the dip's undo are the glass's
 *  own, as before. Settings › Blur effect turns it on or off (glass-mode.js). */
export const SMOOTH = { scale: 64, cell: 72, reach: 64, margin: 192 };
/** A rounded rectangle's outline (w × h, corner radius r), as an SVG path. */
export function roundPath(w, h, r) {
  const f = (n) => +n.toFixed(2), q = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M${f(q)} 0H${f(w - q)}A${f(q)} ${f(q)} 0 0 1 ${f(w)} ${f(q)}V${f(h - q)}A${f(q)} ${f(q)} 0 0 1 ${f(w - q)} ${f(h)}H${f(q)}A${f(q)} ${f(q)} 0 0 1 0 ${f(h - q)}V${f(q)}A${f(q)} ${f(q)} 0 0 1 ${f(q)} 0Z`;
}
// The glass's canvas holds at most 2 device px per CSS px (30 Oct, review H3): what it draws is a blur, a flat tint and a soft shadow,
// whose edge lies under the callout's own 2 px outline (the DOM's, at the screen's full density), so a 3× screen shows the same glass
// from four ninths of the pixels. The masks are drawn at the same density.
export const glassDpr = () => Math.min(2, window.devicePixelRatio || 1);
/** The longest a glass drawn in the figure's canvas goes between two blurs when only the figure under it has been drawn again (a host that gives view()). */
export const REBLUR_MS = 50;
// (Off by default since 1 Nov 2026: on an iPhone the callouts' glass, blurred only every 50 ms while the figure under it moved each frame
// (a catheter's pulse, eased colours), stepped between a fresh blur and a stale one and read as a hard flicker (FHVP on HVPG 3, IVC on
// HVPG 7). The option reblur: REBLUR_MS (tests) brings the 50 ms hold back.)
// (Since 1 Nov 2026 (Mohammad: "is there a way to keep it and make it faster", and the sheet's cards flickering on his iPhone) the glass drawn in
// the figure's canvas is blurred again on every picture laid, the moving blood's frames too (option fresh: the figure's count of them), so
// the frost never holds an old blood picture and then jumps to a new one. Each blur reads only the texels some glass samples (blurBoxes):
// the same texels from the same pixels as a blur of the whole region, so the same glass, from a fraction of the figure. The option full
// (tests) blurs the whole region, as before.)
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
  return blurBoxesInto([], [], boxes, ox, oy, t, bw, bh, keep).map((r) => r.slice());   // alloc-rare: the pure form, for tests; a frame calls blurBoxesInto
}
/** blurBoxes into kept arrays: `out` (a kept list, set to the parts) and `pool` (the parts' kept [x0, y0, x1, y1] arrays, grown only when a
 *  picture has more parts than any before it). Returns out. The parts are the pool's arrays, valid until the next call with the same ones. */
export function blurBoxesInto(out, pool, boxes, ox, oy, t, bw, bh, keep = BLUR_KEEP) {
  let n = 0;
  for (const b of boxes) {
    const x0 = Math.max(0, Math.floor((b.x - ox) / t) - keep), y0 = Math.max(0, Math.floor((b.y - oy) / t) - keep);
    const x1 = Math.min(bw, Math.ceil((b.x + b.w - ox) / t) + keep), y1 = Math.min(bh, Math.ceil((b.y + b.h - oy) / t) + keep);
    if (x1 > x0 && y1 > y0) {
      const r = pool[n] || (pool[n] = [0, 0, 0, 0]);   // alloc-rare: the pool grows to the most parts a picture has had
      r[0] = x0; r[1] = y0; r[2] = x1; r[3] = y1;
      out[n++] = r;
    }
  }
  for (let again = true; again;) {
    again = false;
    for (let i = 0; i < n && !again; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = out[i], c = out[j];
        if (a[0] < c[2] && c[0] < a[2] && a[1] < c[3] && c[1] < a[3]) {
          a[0] = Math.min(a[0], c[0]); a[1] = Math.min(a[1], c[1]); a[2] = Math.max(a[2], c[2]); a[3] = Math.max(a[3], c[3]);
          for (let k = j; k < n - 1; k++) out[k] = out[k + 1];   // (c leaves the list; its array stays in the pool)
          n--; again = true; break;
        }
      }
    }
  }
  out.length = n;
  // (Parts that together cover most of the copy: the whole of it, in one go.)
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (out[i][2] - out[i][0]) * (out[i][3] - out[i][1]);
  if (sum >= 0.85 * bw * bh) {
    const r = pool[0] || (pool[0] = [0, 0, 0, 0]);   // alloc-rare: the pool grows to the most parts a picture has had
    r[0] = 0; r[1] = 0; r[2] = bw; r[3] = bh;
    out[0] = r; out.length = 1;
  }
  return out;
}

const NUM = (v) => parseFloat(v) || 0;
// Boxes written in place: a frame's glass boxes are kept objects with these written into them (nowGeo), never new ones.
const newRect = () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });
function shiftInto(o, r, tx, ty) { o.left = r.left + tx; o.top = r.top + ty; o.right = r.right + tx; o.bottom = r.bottom + ty; o.width = r.width; o.height = r.height; return o; }
function copyRect(o, r) { o.left = r.left; o.top = r.top; o.right = r.right; o.bottom = r.bottom; o.width = r.width; o.height = r.height; return o; }
/** r zoomed by a (scene-cam.js zoomRide.of: scale s about (ox, oy), then the move (dx, dy)), then moved by (tx, ty). */
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
export const drawnRect = (e) => zoomRide.box(e);
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
// (blurBoxesInto with a `keep` fixed, one function for each: sharePlan calls it with no keep to give.)
const keepFns = new Map();
function keepFor(keep) {
  let f = keepFns.get(keep);
  if (!f) { f = (out, pool, boxes, ox, oy, t, bw, bh) => blurBoxesInto(out, pool, boxes, ox, oy, t, bw, bh, keep); keepFns.set(keep, f); }   // alloc-rare: one for each tap count, at most ten
  return f;
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
// A callout's glass: the blurred figure under it over the stage's own colour, saturated as the CSS does, under the tint, cut
// to the callout's shape (its mask). Where the pointer reaches past the card, the card's own shadow (the DOM's, painted over
// this layer) is allowed for, so the pointer stays the card's tint as one shape.
const PFS = `#version 300 es
precision highp float;
uniform vec2 uView;
uniform vec4 uBox;          // the glass (device px)
uniform vec2 uMS;           // the share of the mask the glass fills
uniform vec4 uReg;          // the averaged copy's place (device px)
uniform sampler2D uScene, uMask;
uniform vec3 uBg;
uniform float uUn;          // 1 / the figure's dip the blurred copy was taken at (1: none): the frost is of the figure undipped
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
uniform float uCell;        // field: its cells (device px)
uniform float uReach;       // how far past the glass its reads go at most (device px), inside the copy's parts
out vec4 o;
// The averaged copy at q (device px), held within uReach of the glass, so a read never leaves the parts made for it.
vec4 avgAt(vec2 q) {
  q = clamp(q, uBox.xy - uReach, uBox.xy + uBox.zw + uReach);
  return texture(uScene, clamp((q - uReg.xy) / uReg.zw, 0.0, 1.0));
}
// The cubic B-spline's four weights at t (0..1).
vec4 bsw(float t) { float t2 = t * t, t3 = t2 * t; return vec4((1.0 - t) * (1.0 - t) * (1.0 - t), 3.0 * t3 - 6.0 * t2 + 4.0, -3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0, t3) / 6.0; }
// The figure under the glass at p, the field (premultiplied, as the copy is): a cubic B-spline over the averages at the cells' centres.
vec4 sceneAt(vec2 p) {
  vec2 g = (p - uBox.xy) / uCell - 0.5, i = floor(g), f = g - i;
  vec4 wx = bsw(f.x), wy = bsw(f.y), acc = vec4(0.0);
  for (int y = 0; y < 4; y++) {
    vec4 row = vec4(0.0);
    for (int x = 0; x < 4; x++) row += avgAt(uBox.xy + (i + vec2(float(x - 1), float(y - 1)) + 0.5) * uCell) * wx[x];
    acc += row * wy[y];
  }
  return acc;
}
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
// A drop shadow's coverage at p from a rounded box b (device px: left, top, right, bottom) with the card's corner radii, blurred by sigma s: the
// error function of the signed distance to the rounded box, so the shadow of a rounded card has rounded corners (the product of two edge
// coverages is a blurred rectangle, with dark wedges past a large radius).
float shCover(vec2 p, vec4 b, vec4 rad, float s) {
  vec2 wh = b.zw - b.xy, c = p - (b.xy + wh * 0.5);
  float r = c.x < 0.0 ? (c.y < 0.0 ? rad.x : rad.w) : (c.y < 0.0 ? rad.y : rad.z);
  r = min(r, min(wh.x, wh.y) * 0.5);
  vec2 q = abs(c) - wh * 0.5 + r;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  return 0.5 * (1.0 - erfa(d / (s * 1.4142136)));
}
void main() {
  vec2 p = vec2(gl_FragCoord.x, uView.y - gl_FragCoord.y);
  float m = uMode == 1 ? boxCover(p - uBox.xy, uBox.zw, uRad) : texture(uMask, (p - uBox.xy) / uBox.zw * uMS).a;
  // (A card's drop shadows, outside its box only, as the CSS draws a box-shadow: so the card's box, its edge and its shadow are one GPU
  // shape that can change size in view with nothing of the page laid out again.)
  float sa = 0.0;
  vec3 sc = vec3(0.0);
  // (Weighted by 1 - m below, so a pixel the card covers fully never needs them.)
  if (m < 1.0) {
    float d0 = uD0C.a > 0.0 ? uD0C.a * (uMode == 1 ? shCover(p, uD0B, uRad, max(uDS.x, 0.5)) : cover(p.x, uD0B.x, uD0B.z, max(uDS.x, 0.5)) * cover(p.y, uD0B.y, uD0B.w, max(uDS.x, 0.5))) : 0.0;
    float d1 = uD1C.a > 0.0 ? uD1C.a * (uMode == 1 ? shCover(p, uD1B, uRad, max(uDS.y, 0.5)) : cover(p.x, uD1B.x, uD1B.z, max(uDS.y, 0.5)) * cover(p.y, uD1B.y, uD1B.w, max(uDS.y, 0.5))) : 0.0;
    sa = 1.0 - (1.0 - d0) * (1.0 - d1);
    sc = sa > 0.0 ? (uD0C.rgb * d0 * (1.0 - d1) + uD1C.rgb * d1) / sa : vec3(0.0);
  }
  if (m <= 0.0) { if (sa <= 0.001) discard; o = vec4(sc * sa, sa) * uA; return; }
  vec4 s = sceneAt(p);
  // (The figure dipped under a case card was laid at a fifth of its alpha: taken back to its own, so the glass frosts the figure as it stands
  // and looks the same dipped or not. Never past whole: what was laid whole, not dipped (a label, the lobule), stays as it is.)
  s *= min(uUn, 1.0 / max(s.a, 0.0001));
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

// The glass's uniform locations, read once a context's program is linked (hostKit).
function uniformsOf(gl, pprog) {
  const uni = (p, ks) => Object.fromEntries(ks.map((k) => [k, gl.getUniformLocation(p, k)]));   // alloc-rare: a context's two programs are linked once (setHost, a restored context), never per frame
  const PU = uni(pprog, ['uBox', 'uView', 'uMS', 'uReg', 'uScene', 'uMask', 'uBg', 'uUn', 'uTint', 'uSat', 'uA', 'uBB', 'uShC', 'uShB', 'uShS', 'uRad', 'uMode', 'uGrow', 'uD0C', 'uD1C', 'uD0B', 'uD1B', 'uDS', 'uLine', 'uLW', 'uCell', 'uReach']);   // alloc-rare: a context's two programs are linked once (setHost, a restored context), never per frame
  return { pprog, PU };   // alloc-rare: a context's program is linked once (setHost, a restored context), never per frame
}
// Shader warm-up for the glass drawn in the figure's canvas (GPU practice, MDN "WebGL best practices": compile and link early, read the
// status later, KHR_parallel_shader_compile where there is one). The blur's and the glass's programs are started the moment the figure's
// context is handed over (setHost), long before the first card shows, and only their link status is read, at the first glass, by when the
// driver has long finished: that frame no longer compiles and links two programs and waits on them. One set
// per context, shared by every glass drawn there (cards, panes, callouts compiled the same two programs each before).
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
    e = { hs: [start(PFS)], P: undefined };   // (nothing read back here)   // alloc-rare: a context's two programs are linked once (setHost, a restored context), never per frame
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
      const { pprog, PU } = e.P;
      exerciseDraw(gl, () => {
        gl.useProgram(pprog);
        gl.uniform4f(PU.uBox, 0, 0, 1, 1); gl.uniform2f(PU.uView, 1, 1);
        gl.enable(gl.BLEND); gl.blendEquation(gl.FUNC_ADD); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
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
  e.P = ok[0] ? uniformsOf(gl, e.hs[0].p) : null;
}
// A mask's fill (fillMask): the triangles of a callout's outline (mask px, y down) turn each pixel they cover over, 0 to 1 and back
// (blend: one minus the destination), so a pixel inside the outline is turned an odd number of times and shows; the texture's row 0 is
// the mask's top, as the glass samples it.
/** The glass's shaders, for the shader compile check (scripts/glsl-compile-list.mjs). */
export { QVS as GLASS_VS, PFS as GLASS_FS };
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
// glass-motion.js.)
// (A card's own edge and drop shadows drawn with its glass on the GPU (--gl-line, --gl-drop), and its size eased there when the page asks
// (data-gl-morph): Mohammad, 2 Nov 2026, "Do it" to review/slide-motion-recs-2nov (the glass stays up through a slide change and
// changes size in view).)
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
export function createGlassGL(wrap, source, layers, { software = false, live = () => true, pane = null, cards = null, version = null, capture = null, onFigure = null, keep = null, due = null, reblur = 0, fresh = null, dirty = null, dirtyRects = null, pictureRects = null, camKey = null, full = false, onHoles = null, dip = null, pan = null, panning = null } = {}) {
  if (reblur > 0) fresh = null;
  // (cards.callouts: the figure's callouts, a glass.add region of their own (stage.js): the cards' machinery, with the callouts' own ways kept: no
  // wait for a first draw, no html[data-cardgl], one turn ('all') between the cards' two, one over-list, their shadow and tint strength, the parent's box.)
  const co = !!(cards?.callouts || cards?.pane), paneKind = !!(pane || cards?.pane);   // (cards.pane: the liver label's pane, likewise)
  const look = pane ? PANE : cards ? (cards.look ? { ...CARD, ...cards.look } : CARD) : GLASS;   // (cards.look: a region's own blur, sat, scale, margin: glassRegions below)
  // (Every look reads the field's averaged copy (SMOOTH): a look's own blur and scale no longer change it, only its saturation and tint do.)
  const SCALE = SMOOTH.scale, MARGIN = SMOOTH.margin;
  // (While the cards' glass is drawn in the figure's canvas (html[data-cardgl]), a card not yet marked as drawn there shows no solid card
  // (app.css): a card coming in showed the solid fallback for its first frame or two, before its glass's first draw, a flash of solid then
  // frost (Mohammad, 2 Nov 2026: "the blur flickers when new card opens").)
  // (cards: { find, watch, before, read? }: the Present cards' glass (recs A2, 31 Oct): find() lists the elements, each its own rounded box, its
  // corners its border radii and its tint the colour its CSS declares in --gl-tint (app.css: the same colour its background was), drawn
  // while its --gl-glass is 1 and no CSS filter lies on it; watch: the roots whose writes may move them; before: where the canvas goes.
  // Their DOM shadows and borders stay the page's. A card whose tint cannot be read, or whose glass its CSS has turned off (the phone's
  // sheet, drawn by its pseudo-elements), keeps the browser's glass.)
  // (No canvas or context of the glass's own: it is drawn into the figure's canvas while it can be (setHost), and is otherwise the
  // browser's. A copy of the figure read back by createImageBitmap, drawn on a canvas of its own, was removed on 4 Nov 2026 (G5).)
  if (software || !source || typeof WebGL2RenderingContext === 'undefined') return null;
  // (Where a fade from above stops being the glass's own: where the layers lie.)
  const stop = (cards ? cards.before : pane || layers[0]).parentNode;

  let lost = false, dead = false, raf = 0;
  // (shown: the glass drew the last time it looked; drawnKey: everything that picture was drawn from, so a frame that would draw it the
  // same is skipped; quiet: the frames in a row that changed nothing; liveUntil: a callout's transition or animation runs until then;
  // poll: the slow look while it sleeps; gen: a copy asked for before the glass was let go is never put in.)
  let shown = false, quiet = 0, liveUntil = 0, poll = 0, gen = 0;
  const maskTex = new Set(), maskFb = new Set(), marked = new Set();
  // Any CSS colour as straight [r, g, b, a] (0–1). A colour the page gives as written (a custom property that is not registered: a
  // color-mix(), a name, oklab) is resolved in script once, when the page is read (resolveColour, from measureGeo, outside
  // any frame), by css-color.js, so it always comes back as straight sRGB; a frame only looks it up. (Through a 2D
  // canvas's parser until 1 Nov 2026: no canvas 2D anywhere.)
  const colours = new Map();
  function resolveColour(str) {
    const k = (str || '').trim();
    if (!k || (colours.has(k) && colours.has(str))) return;
    let v = parseColour(k);
    // (CSS Color 4 in script, css-color.js: color-mix(), names, oklab, lab, hsl. No probe element is made, written to or read back, so no
    // frame of a slide change writes the page's DOM or style to find a colour out; the same sRGB the browser's own CSS gives.)
    if (!(v[3] > 0) && k !== 'transparent' && !/^#|^rgba?\(|^color\(srgb/i.test(k)) v = parseCssColor(k) || v;
    if (colours.size > 256) colours.clear();
    colours.set(k, v);
    if (str !== k) colours.set(str, colours.get(k));   // (and by the string as read, untrimmed: a card's surface, paneTint)
  }
  // (A frame only looks a colour up by the string the page was read with, already trimmed there (readPanes, measureGeo); a string not read yet is
  // parsed in colourMiss, and no colour at all is the clear one.)
  const colour = (str, fb) => colours.get(str) || (!str && fb === 'transparent' ? CLEAR4 : colourMiss(str, fb));
  function colourMiss(str, fb) {
    const k = (str || '').trim();   // alloc-rare: a colour string the page has not been read with yet (resolveColour reads every one), never in steady state
    return colours.get(k) || parseColour(k || fb);
  }
  const markOf = new WeakMap();
  const unmark = () => { for (const g of marked) g.removeAttribute('data-gl'); marked.clear(); unwait(); cover.clear(); };
  // (A card over a card of the same region hides it whole, its words too: the lower one is cut where the upper lies, glass-cover.js. Only the
  // cards' glass: a callout or the pane covers none. cssClip: each card's own clip-path as its page read gives it (one it has is never cut).)
  const cover = glassCover(), cssClip = new WeakMap(), coverOrder = [];
  const coverGroup = (a, b) => cards.region(a) === cards.region(b);
  const coverOwn = (g) => { const c = cssClip.get(g); return !!c && c !== 'none'; };
  function coverNow() {
    if (!cards || co || !cards.region) return;
    coverOrder.length = 0;
    if (hf && blurOK) {
      // (In the order they are drawn: the low turn's (the teaching card's shade) first, then the others.)
      for (const p of hf.panes) if (host.low?.(p.g)) coverOrder.push(p);
      for (const p of hf.panes) if (!host.low?.(p.g)) coverOrder.push(p);
    }
    cover.apply(coverOrder, coverGroup, coverOwn);
  }
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
  // (10 Nov 2026, Mohammad: "the glass cards when they appear and they disappear still glitch". The page is read with every faded glass
  // kept (readPanes keep0), so the read never found one faded and no card was ever held bare: each card at 0 went back to its solid fill,
  // and the frame its fade began, or ended, could show that solid panel under the words before its frost. Now fadedNow is the frame's own:
  // the cards every one of whose glasses this frame puts at 0 (nowGeo), so a card is held bare from the frame it fades out until the
  // frame its glass is drawn again.)
  const fadedNow = new Set(), litNow = new Set();
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
    if (!cards || co) return;
    const t = performance.now(), want = wantSet;
    want.clear();
    for (const p of list) if (!marked.has(p.g) && !wasDrawn.has(p.g)) want.add(p.g);   // (a card drawn here before and not now: solid at once)
    for (const g of gaveUp) if (!want.has(g)) gaveUp.delete(g);
    inListSet.clear(); for (const p of list) inListSet.add(p.g);
    if (wasDrawn.size) for (const g of wasDrawn) if (!inListSet.has(g)) wasDrawn.delete(g);
    for (const [g, w] of waiting) {
      // (A card held bare while faded that is now to be drawn stays bare until its glass is drawn, a first draw's wait from here: let go
      // in this pass, a frame whose glass did not draw (its blur not made yet) showed its solid fill for that frame as it came in.)
      if (!want.has(g) && !(w.faded && inListSet.has(g))) { if (w.faded && fadedNow.has(g)) continue; g.removeAttribute('data-gl-wait'); waiting.delete(g); }
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
  function maskOf(g, d, w, h, K) {
    const G = K.G, k = K.k, store = K.masks;
    let m = store.get(g);
    if (m && m.kd === d && m.kw === w && m.kh === h && m.kk === k) return m;
    const key = `${d}|${w}|${h}|${k}`;   // alloc-rare: a mask is made or refilled only when its outline or size changed, not in a frame that finds it as it was
    if (!fillKit(G)) return null;   // (no fill program: that glass is left to the CSS's solid look, unmarked)
    const ss = 2 * k, mw = Math.max(1, Math.ceil(w * ss)), mh = Math.max(1, Math.ceil(h * ss));
    // (Made on unit 1, where the glass reads its mask, never on unit 0: the blurred figure is bound there while the glasses are drawn;
    // a mask made in the middle of them once took its place, a grey glass for one frame (1 Nov 2026).)
    G.activeTexture(G.TEXTURE1);
    // alloc-rare: a glass's first mask
    if (!m) { m = { tex: texOf(G, G.LINEAR), fb: G.createFramebuffer(), g }; K.maskTex.add(m.tex); K.maskFb.add(m.fb); K.maskRec.add(m); }
    G.bindTexture(G.TEXTURE_2D, m.tex);
    if (m.w !== mw || m.h !== mh) { G.texImage2D(G.TEXTURE_2D, 0, G.RGBA8 ?? G.RGBA, mw, mh, 0, G.RGBA, G.UNSIGNED_BYTE, null); m.w = mw; m.h = mh; }
    fillMask(G, m, d, ss, mw, mh);
    G.activeTexture(G.TEXTURE0);
    Object.assign(m, { key, kd: d, kw: w, kh: h, kk: k, ms: [w * ss / mw, h * ss / mh] });   // alloc-rare: a mask is refilled only when its outline or size changed
    store.set(g, m);
    return m;
  }
  // Every mask a picture's glasses need, made before the first of them is drawn (the state they are drawn with set after).
  function masksFor(panes, K) {
    sweepMasks(K);
    for (const p of panes) if (!p.rad && p.d) maskOf(p.g, p.d, p.lw, p.lh, K);
  }
  // A glass element's mask given back (4 Nov 2026): its texture and framebuffer, deleted and taken out of the kit's sets. Until then the
  // sets held every callout's mask for as long as the figure's context lived, one texture and framebuffer for each reading ever shown.
  function freeMask(K, m) {
    K.maskRec.delete(m); K.masks.delete(m.g);
    K.maskTex.delete(m.tex); K.maskFb.delete(m.fb);
    if (!K.G.isContextLost()) { K.G.deleteTexture(m.tex); K.G.deleteFramebuffer(m.fb); }
  }
  function forgetMask(g) { const K = hk, m = K && K.masks.get(g); if (m) freeMask(K, m); }
  // (The safety net: a mask whose element has left the page, whoever forgot to say so, is freed at the next picture's masks.)
  function sweepMasks(K) {
    if (!K.maskRec.size) return;
    for (const m of K.maskRec) if (!m.g.isConnected) freeMask(K, m);
  }
  // Each callout's glass as the page lays it out this frame (its fades, glides and the card's shadow included).
  function readPanes(list, keep0 = false) {
    fadeMemo = new Map();
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
        const cd = isCard(cards.region?.(g), g), sf = cd ? cs.getPropertyValue('--surface') : '';   // (a card's pieces, the split sheet's: the one card glass)
        for (const one of [].concat(q || [])) {
          if (!one || !shows(a * one.a) || !one.r.width || !one.r.height) { if (one && one.r.width && one.r.height) fadedNow.add(g); continue; }
          panes.push({ g, el, oa: one.a, pe: one.pe || null, a: a * one.a, r: one.r, d: one.d || null, rad: one.d ? null : one.rad, lw: one.r.width, lh: one.r.height, er: one.r, shadow: null, tint: one.tint, k: 1, card: cd, sf });
        }
        continue;
      }
      if (cards) {
        // (Its CSS says whether this element's glass is its own (--gl-glass 1) and what its tint is; a filter on it (a brightness) would
        // not reach a glass drawn here, so such a card keeps the browser's.)
        // (reg: the glass.add region of this element (cards.region, glassRegions): it asked for glass, so its CSS need not say --gl-glass 1; its tint
        // and shape, when it gives them, are its own.)
        const reg = cards.region ? cards.region(g) : null;
        if (!reg && cs.getPropertyValue('--gl-glass').trim() !== '1') continue;
        if (cs.filter && cs.filter !== 'none') continue;
        const r = drawnRect(g);
        if (!r.width || !r.height || !shows(a)) { if (r.width && r.height) fadedNow.add(g); continue; }
        const zk = zoomRide.scale(g);   // (a zoomed card's scale: its corners grow with it)
        // (A card's own edge and drop shadows, drawn here with its glass where its CSS names them (--gl-line, --gl-drop): the page's own
        // are taken off while it is drawn here ([data-gl="edge"]), so the card is one GPU shape that may change size in view.)
        const drops = dropsOf(cs.getPropertyValue('--gl-drop')), line = cs.getPropertyValue('--gl-line').trim();
        // (cut: the still box a glass that slides is cut off at (a phone sheet's paper sliding below its resting foot, which the sheet's
        // own clip hides on the page): { bottom } in client px, from cards.cut(g), kept where it is while the glass moves.)
        const cut = cards.cut ? cards.cut(g) || null : null;
        const shp = reg?.shape ? (typeof reg.shape === 'function' ? reg.shape(g, r) : reg.shape) : null;   // (a path: { d, w, h } in the box's own px; else the box's rounded corners; false: no shape to draw yet, so none)
        if (shp === false) continue;
        // (outer: the card this glass belongs to (its parent): its box bounds the glass's shadow and its box-shadow is the glass's soft shadow, the callouts'.)
        const outer = reg?.outer ? g.parentElement : null;
        const cd = isCard(reg, g), sf = cd ? cs.getPropertyValue('--surface') : '';   // (a card: the one card glass, drawn from its look's surface; paneTint)
        const tn = reg?.tint ? (typeof reg.tint === 'function' ? reg.tint(g, cs) : reg.tint) : cs.getPropertyValue('--gl-tint');
        cssClip.set(g, cs.clipPath);
        panes.push({ g, el, box: true, oa: 1, a, r, d: shp?.d || null, rad: shp?.d ? null : zk > 1.001 || zk < 0.999 ? radiiOf(cs).map((v) => v * zk) : radiiOf(cs), lw: shp?.d ? shp.w : r.width, lh: shp?.d ? shp.h : r.height, er: outer ? outer.getBoundingClientRect() : r, shadow: outer && reg.shadow ? parseShadow(getComputedStyle(outer).boxShadow) : null, tint: tn, k: reg?.k ?? 1, card: cd, sf, drops, line, cut });
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
  // (The loading cover waits for the glass's first draw, inside its own cap (index.html): it lifted on cards with no frost, which
  // arrived a beat later. 1.5 s here, so a page that shows no glass does not hold it.)
  let coverOpen = null;   // alloc-rare: one promise for the cover, made once, only while it is up
  if (booting()) holdCover(new Promise((done) => { coverOpen = done; setTimeout(done, 1500); }));
  function draw() {
    const r = drawNow();
    if (coverOpen && r) { coverOpen(); coverOpen = null; }
    return r;
  }
  function drawNow() {
    if (lost || dead) return false;
    const list = glassesNow();
    if (hostOn && (!list.length || !wanted() || !live())) dropHost(true);
    if (!list.length || !wanted() || !live()) {
      unmark();
      // (holesWhile: while the figure is not on this canvas (the dive), the browser's own glass is still laid over the labels: the labels
      // leave its place out, as they do under a glass drawn here, so a label is never seen through a card. Not drawn, only told.)
      if (cards?.holesWhile && list.length && wanted() && cards.holesWhile()) { try { const R = nowGeo(list); if (R) { tellHoles(R.panes); holeOnly = true; } } catch (e) { caught('glass-gl:holes', e); } }
      else if (holeOnly) { holeOnly = false; tellHoles(NONE); }
      return false;
    }
    if (holeOnly) holeOnly = false;
    if (host) { const r = hostDraw(list); if (r !== undefined) return r; }
    // (Not drawn in the figure's canvas: the browser's glass, until the figure's canvas can take it again.)
    unmark();
    return false;
  }
  // Each glass over the blurred copy (bound on unit 0, the glass's program in use and its view set), in context G at k device px per
  // CSS px, marked as it is drawn; a mark no longer drawn is given back.
  // (A glass's tint as drawn: a card's (glass.add's card) is the one card glass, its look's surface at CARD.tint, whatever its own --gl-tint;
  // 11 Nov 2026, Mohammad: "Tint and blur of glass should be the same EVERYWHERE". Its own still says whether it is drawn here: drawPanes.)
  // (glass.add's card: true, or (el) => whether that element is one: the menus' region holds the tooltip, whose dark glass is its own.)
  const isCard = (reg, g) => (typeof reg?.card === 'function' ? !!reg.card(g) : !!reg?.card);
  const paneTint = (p) => colour(p.card ? p.sf : p.tint, 'transparent');
  function drawPanes(G, U, panes, cr, k, maskFor, now, final = true) {
    for (const p of panes) {
      const own = colour(p.tint, 'transparent')[3] * p.k, t = paneTint(p), ta = own > 0 ? t[3] * (p.card ? CARD.tint : p.k) : 0;
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
  // (halved until it is at most twice the copy's texel, then down to it: each step an average, as the copy's resize was), and cut to each
  // glass's shape, the field read over it. A picture laid while the figure under the glasses has not been drawn again (the same version)
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
  let holeOnly = false;
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
    for (const x of [t.copy, t.spare, ...(t.steps || []).map((st) => st.t)]) if (x) G.deleteTexture(x);   // alloc-rare: a shared blur is let go, never per frame
    for (const fb of [t.fbCopy, t.fbSpare, ...(t.steps || []).map((st) => st.fb)]) if (fb) G.deleteFramebuffer(fb);   // alloc-rare: a shared blur is let go, never per frame
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
    const G = host.gl, P = warmPrograms(G, true);
    if (!P) return null;
    const K = { G, ...P,   // alloc-rare: the kit is made once per figure context (setHost), never per frame
      vao: G.createVertexArray(), copy: texOf(G, G.LINEAR),
      fbCopy: G.createFramebuffer(), steps: [], size: '', key: '', reg: null, k: 1,   // alloc-rare: once per figure context
      masks: new WeakMap(), maskTex: new Set(), maskFb: new Set(), maskRec: new Set() };   // alloc-rare: once per figure context
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
    for (const t of [K.copy, ...K.steps.map((st) => st.t), ...K.maskTex]) G.deleteTexture(t);
    for (const fb of [K.fbCopy, ...K.steps.map((st) => st.fb), ...K.maskFb]) G.deleteFramebuffer(fb);
    // (The warmed programs stay with their context, for the others.)
    G.deleteVertexArray(K.vao);
  }
  // Back to this canvas: the browser's glass shows until its first copy is in (marks given back), and the figure's picture is laid again
  // without the glass now (again), or by the figure's next picture (from inside one, which has just been laid without it).
  function dropHost(again) {
    if (!hostOn) return;
    hostOn = false; hf = null;
    if (cards && !co) document.documentElement?.removeAttribute?.('data-cardgl');
    if (hk) hk.key = '';
    unmark();
    tellHoles(NONE);
    if (again && !inPrep) host?.now(); else ask();
  }
  // The loop's turn while a host is set: true, 'same' or false as draw() returns, or undefined when the glass is drawn on its own canvas.
  const inside = (p, cr, vw, vh) => {
    const l = Math.max(p.r.left, 0), t = Math.max(p.r.top, 0), r = Math.min(p.r.right, vw), b = Math.min(p.r.bottom, vh);
    return !(r > l && b > t) || (l >= cr.left - 2 && t >= cr.top - 2 && r <= cr.right + 2 && b <= cr.bottom + 2);
  };
  // (hostDraw run from the figure's own turn (prepInto) lays the panes it will draw and does not ask the figure for another picture.)
  let inPrep = false;
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
        else if (crosses(p, !cards || co ? R.over.all : host.low?.(p.g) ? R.over.low : R.over.high)) s.cross = true;
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
      hostOn = true; hf = null; gen++;
      if (cards && !co) document.documentElement?.setAttribute?.('data-cardgl', '');
    }
    if (hf && sameKey(keyNow, keyHf)) return panes.length ? 'same' : false;
    { const t = keyHf; keyHf = keyNow; keyNow = t; }
    hf = hfSet;
    hf.panes = panes; hf.cr = cr; hf.base = bg[3] > 0 ? bg : colour(bgVar, 'transparent');
    tellHoles(panes);
    if (!inPrep) host.now();
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
    if (!st) { st = { t: texOf(G, G.LINEAR), fb: G.createFramebuffer(), w: 0, h: 0 }; B.steps[i] = st; B.allocs = (B.allocs || 0) + 1; }   // alloc-rare: a halving step's targets are made once per blur kit
    if (w > st.w || h > st.h) {
      st.w = Math.max(w, st.w); st.h = Math.max(h, st.h); B.allocs = (B.allocs || 0) + 1;
      G.bindTexture(G.TEXTURE_2D, st.t);
      G.texImage2D(G.TEXTURE_2D, 0, G.RGBA, st.w, st.h, 0, G.RGBA, G.UNSIGNED_BYTE, null);
      G.bindFramebuffer(G.FRAMEBUFFER, st.fb);
      G.framebufferTexture2D(G.FRAMEBUFFER, G.COLOR_ATTACHMENT0, G.TEXTURE_2D, st.t, 0);
      st.ok = fits(G, st.w, st.h) && complete(G, `glass-step${i}`, st.w, st.h);   // alloc-rare: a step's target is grown (a larger canvas), and checked once for that size
      if (!st.ok) { st.w = 0; st.h = 0; }   // (made again at the next ask)
    }
    return st;
  }
  // The region (CSS px from the canvas's corner) of the picture just laid, made small and blurred, as take() does from a copy.
  // (The region is laid on a fixed grid of the canvas's own pixels, T device px to a texel (a power of two, at least SCALE CSS px), so
  // every halving is an exact 2 × 2 average and a texel always covers the same pixels of the figure. Fitted to the glasses' boxes as
  // they were, the region's size and start changed with every frame of a card sliding (the readings' card tucking or coming out), so
  // the halvings sampled the figure a different way each frame and the whole of every card's frost flickered (Mohammad, 31 Oct).)
  const GRID = { T: 1, k: 1, X0: 0, X1: 0, Y0: 0, Y1: 0, x: 0, y: 0, w: 0, h: 0 };   // (hostGrid's answer, a kept record, read before the next call)
  function hostGrid(rx, ry, rw, rh, k, W2, H2) {
    const T = 2 ** Math.max(0, Math.ceil(Math.log2(SCALE * k) - 1e-9));
    const X0 = Math.max(0, Math.floor(rx * k / T) * T), X1 = Math.min(Math.floor(W2 / T) * T, Math.ceil((rx + rw) * k / T) * T);
    const Y0 = Math.max(0, Math.floor((H2 - (ry + rh) * k) / T) * T), Y1 = Math.min(Math.floor(H2 / T) * T, Math.ceil((H2 - ry * k) / T) * T);
    if (!(X1 > X0 && Y1 > Y0)) return null;
    const G = GRID;
    G.T = T; G.k = k; G.X0 = X0; G.X1 = X1; G.Y0 = Y0; G.Y1 = Y1; G.x = X0 / k; G.y = (H2 - Y1) / k; G.w = (X1 - X0) / k; G.h = (Y1 - Y0) / k;
    return G;
  }
  // The share's grid held to the figure (option pan): the whole canvas, its texels starting where the figure's own translation (canvas px, rounded) falls
  // on the grid, so a pan of whole texels moves the figure by whole texels of the copy and a blur moved with it is the blur of the figure moved; between
  // texels the glass samples its blur where the figure is (uReg), less than half a canvas pixel off. The same number of texels at any pan (no target is
  // made again as the figure moves): T - 1 canvas px may be left at an edge, inside the blur's own clamp at the canvas's edge. m null: held at 0.
  // PG: the grid's anchor in texels (ax, ay: the copy's column and row, y down, of the figure's origin, give or take a constant), read before the next call.
  const PG = { ax: 0, ay: 0 };
  function panGrid(m, k, W2, H2) {
    const T = 2 ** Math.max(0, Math.ceil(Math.log2(SCALE * k) - 1e-9));
    const ex = m ? Math.round(m[4] * k) : 0, ey = m ? Math.round(m[5] * k) : 0;
    const X0 = ((ex % T) + T) % T, Y0 = ((-ey % T) + T) % T;
    const bw = Math.floor((W2 - T + 1) / T), bh = Math.floor((H2 - T + 1) / T);
    if (!(bw > 0 && bh > 0)) return null;
    const G = GRID, X1 = X0 + bw * T, Y1 = Y0 + bh * T;
    G.T = T; G.k = k; G.X0 = X0; G.X1 = X1; G.Y0 = Y0; G.Y1 = Y1; G.x = X0 / k; G.y = (H2 - Y1) / k; G.w = bw * T / k; G.h = bh * T / k;
    PG.ax = (ex - X0) / T; PG.ay = (ey + Y0) / T;
    return G;
  }
  // A kept copy moved (sx, sy) texels (y down) with the figure: laid into the spare target that far over and swapped with it, so every texel holds
  // the figure it held, moved; what the move uncovers is old and outside the parts kept (blur-share.js shareShift). One blit of the small copy (a
  // canvas pixel in T × T), in place of the halvings of all the glasses read.
  function shiftBlur(B, sx, sy, bw, bh) {
    const G = B.G;
    if (!B.spare || B.spareSize !== B.size) {
      if (!B.spare) { B.spare = texOf(G, G.LINEAR); B.fbSpare = G.createFramebuffer(); B.allocs = (B.allocs || 0) + 1; }   // alloc-rare: the spare target is made at a share's first pan
      G.bindTexture(G.TEXTURE_2D, B.spare);
      G.texImage2D(G.TEXTURE_2D, 0, G.RGBA, bw, bh, 0, G.RGBA, G.UNSIGNED_BYTE, null);
      G.bindFramebuffer(G.FRAMEBUFFER, B.fbSpare);
      G.framebufferTexture2D(G.FRAMEBUFFER, G.COLOR_ATTACHMENT0, G.TEXTURE_2D, B.spare, 0);
      const ok = complete(G, 'glass-spare', bw, bh);   // alloc-rare: the spare target is checked once for its size
      G.bindFramebuffer(G.FRAMEBUFFER, null);
      if (!ok) { B.spareSize = ''; return false; }
      B.spareSize = B.size;
    }
    G.disable(G.SCISSOR_TEST);
    {
      const fb = B.fbCopy, tex = B.copy;
      G.bindFramebuffer(G.READ_FRAMEBUFFER, fb); G.bindFramebuffer(G.DRAW_FRAMEBUFFER, B.fbSpare);
      G.blitFramebuffer(0, 0, bw, bh, sx, sy, bw + sx, bh + sy, G.COLOR_BUFFER_BIT, G.NEAREST);
      B.copy = B.spare; B.fbCopy = B.fbSpare; B.spare = tex; B.fbSpare = fb;
    }
    G.bindFramebuffer(G.READ_FRAMEBUFFER, null); G.bindFramebuffer(G.DRAW_FRAMEBUFFER, null);
    return true;
  }
  // hostBlur for some parts of the copy only (blurBoxes): each halving and the turn into the copy blit each part's pixels alone, from the
  // same pixels to the same texels as the blit of the whole region (each part starts and ends on the grid of every step, so each step
  // is still an exact 2 × 2 average), and the two passes are cut to the parts (scissor). Texels outside the parts keep whatever they
  // held; no glass reads them (blurBoxes).
  // (copy: the parts the halvings copy from the canvas, when fewer than those the passes run on (sharePlan's copy: the rest of the copy is kept); else all.)
  function partBlur(g, parts, bw, bh, B = hk, copy = null) {
    const cp = copy || parts;
    const G = B.G;
    let t = g.T, ox = g.X0, oy = g.Y0, src = null;
    // (A part's pixels at t device px to a texel, from (ox, oy), y up: the copy's top row is the region's top.)
    for (let i = 0; t > 2; i++) {
      const nt = t / 2, st = step(i, bw * nt, bh * nt, B);
      if (!st.ok) { G.bindFramebuffer(G.READ_FRAMEBUFFER, null); G.bindFramebuffer(G.DRAW_FRAMEBUFFER, null); return false; }
      G.bindFramebuffer(G.READ_FRAMEBUFFER, src); G.bindFramebuffer(G.DRAW_FRAMEBUFFER, st.fb);
      for (const r of cp) {
        G.blitFramebuffer(ox + r[0] * t, oy + (bh - r[3]) * t, ox + r[2] * t, oy + (bh - r[1]) * t, r[0] * nt, (bh - r[3]) * nt, r[2] * nt, (bh - r[1]) * nt, G.COLOR_BUFFER_BIT, G.LINEAR);
      }
      src = st.fb; ox = 0; oy = 0; t = nt;
    }
    G.bindFramebuffer(G.READ_FRAMEBUFFER, src); G.bindFramebuffer(G.DRAW_FRAMEBUFFER, B.fbCopy);
    for (const r of cp) {
      G.blitFramebuffer(ox + r[0] * t, oy + (bh - r[3]) * t, ox + r[2] * t, oy + (bh - r[1]) * t, r[0], r[3], r[2], r[1], G.COLOR_BUFFER_BIT, G.LINEAR);
    }
    G.bindFramebuffer(G.READ_FRAMEBUFFER, null); G.bindFramebuffer(G.DRAW_FRAMEBUFFER, null);
    return true;
  }
  // (parts: blurBoxes' parts of the copy to make, or null for all of it.)
  function hostBlur(g, parts = null, B = hk, copy = null) {
    const G = B.G, { T } = g;
    let x0 = g.X0, y0 = g.Y0, w = g.X1 - g.X0, h = g.Y1 - g.Y0;
    const bw = w / T, bh = h / T;
    if (B.sw !== bw || B.sh !== bh || !B.size) {
      if (!fits(G, bw, bh)) { B.size = ''; return false; }
      B.size = `${bw}x${bh}`; B.sw = bw; B.sh = bh; B.allocs = (B.allocs || 0) + 1;   // alloc-rare: the blur's targets are made again only when the canvas's size changed
      let ok = true;
      for (const [t, fb] of [[B.copy, B.fbCopy]]) {   // alloc-rare: only when the targets are made again (a size change)
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
    if (parts) return partBlur(g, parts, bw, bh, B, copy);
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
    return true;
  }
  // The glass over the picture the figure has just laid (veins-gl top), into its canvas: first (prepInto, before any glass is drawn on
  // that picture) the region behind the glasses blurred from it, then each glass (drawInto) in its turn among the page's layers: the
  // pane under the labels, the teaching card's shade ('low'), the callouts, the other cards ('high'). The cards' two turns share one
  // blur and one set of marks, given back after the last turn (settleMarks).
  const frameMarks = new Set(), passPanes = [];
  let blurOK = false;
  const SHARED = !(reblur > 0);
  const SKEY = `field|${look.blur}`;   // (this look's name among the context's shared copies)
  const shareReq = { id: shareId, boxes: [], v: 0, f: '' }, boxPool = [];   // (this glass's request for the picture, kept and written each time)
  // A hand panning the figure (heat recs H2b, 12 Nov 2026): every frame of a pan was a new picture, and the glasses blurred all they read in every one.
  // The figure moves whole under them, and a blur moved with it is the blur of the figure moved (runShare: the share's grid is held to the figure, its
  // targets moved with it, shiftBlur), so while a hand pans at one scale the glass takes the pictures it had when the pan set off, and the blood's count,
  // and blurs only the strips the pan brings under the glasses. Refreshed every BLOOD_BLUR_MS, as the blood is at rest, so the model's changes reach
  // the glass 4 times a second; at the hand's let go, or any zoom or camera, the pictures as they are, blurred at once. (pan(): the figure's matrix,
  // world to canvas CSS px, [a, b, c, d, e, f], or null where the figure is not what the canvas shows; panning(): a hand is on the figure.)
  const PANL = new Float64Array(4), LASTL = new Float64Array(4);
  let panAt = -1, panV = 0, panF = '', lastV = 0, lastF = '', lastOk = false;
  const linIs = (L, m) => L[0] === m[0] && L[1] === m[1] && L[2] === m[2] && L[3] === m[3];
  const linSet = (L, m) => { L[0] = m[0]; L[1] = m[1]; L[2] = m[2]; L[3] = m[3]; };
  function panHold(v, f) {
    const m = pan ? pan() : null, now = performance.now();
    const can = !!m && !!panning?.() && (camKey ? camKey() >= 0 : true) && !zoomRide.riding();
    if (can && (panAt >= 0 ? linIs(PANL, m) : lastOk && linIs(LASTL, m))) {
      if (panAt < 0) { panV = lastV; panF = lastF; panAt = now; linSet(PANL, m); }   // (the pictures the last blur was of, as the pan sets off)
      else if (now - panAt >= BLOOD_BLUR_MS) { panV = v; panF = f; panAt = now; }
      shareReq.v = panV; shareReq.f = panF;
    } else { panAt = -1; shareReq.v = v; shareReq.f = f; }
    lastV = v; lastF = f; lastOk = !!m; if (m) linSet(LASTL, m);
  }
  function prepInto() {
    frameMarks.clear(); blurOK = false;
    if (hk) hk.share = null;
    // (The panes as the page and the motion have them now, before this picture lays them: a picture laid with the last frame's panes was
    // laid again in the glass's final phase with these, two whole pictures and every card's glass twice a frame while cards moved (Mohammad's
    // ?perf, 3 Nov 2026: "card glass: drawn x8", "50 frames with two"). Laid with them here, the final phase finds the same key and draws nothing.)
    if (hostOn && hk && host && !inPrep && !lost && !dead) {
      inPrep = true;
      try { const list = glassesNow(); if (list.length && wanted() && live()) hostDraw(list); } catch (e) { caught('glass-gl:prep', e); } finally { inPrep = false; }
    }
    if (!hostOn || !hf || !hk || lost || dead) return;
    const G = hk.G;
    if (G.isContextLost() || !host.active()) return;
    const { panes, cr } = hf;
    if (!panes.length) return;
    const W2 = host.canvas.width, H2 = host.canvas.height, k = W2 / cr.width;
    if (!(k > 0) || !H2) return;
    if (SHARED) {
      // (blur-share.js: what this glass needs is entered; the first glass drawn on this picture blurs once for every glass of its look.)
      const S = shareFor(shares, G, SKEY);
      const bx = shareReq.boxes;
      bx.length = panes.length;
      for (let i = 0; i < panes.length; i++) {
        const p = panes[i], b = boxPool[i] || (boxPool[i] = { x: 0, y: 0, w: 0, h: 0 });   // alloc-rare: the pool grows to the most glasses a picture has had
        b.x = p.r.left - cr.left; b.y = p.r.top - cr.top; b.w = p.r.width; b.h = p.r.height;
        bx[i] = b;
      }
      const v = version ? version() : performance.now(), f = fresh ? fresh() : '';
      panHold(v, f);
      sharePrep(S, shareReq);
      shareUse(S, shareId);
      hk.share = S; hk.k = k; blurOK = true;
      return;
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of panes) { x0 = Math.min(x0, p.r.left); y0 = Math.min(y0, p.r.top); x1 = Math.max(x1, p.r.right); y1 = Math.max(y1, p.r.bottom); }
    x0 = Math.max(0, x0 - cr.left - MARGIN); y0 = Math.max(0, y0 - cr.top - MARGIN);
    x1 = Math.min(cr.width, x1 - cr.left + MARGIN); y1 = Math.min(cr.height, y1 - cr.top + MARGIN);
    if (!(x1 > x0 && y1 > y0)) return;
    const grid = hostGrid(x0, y0, x1 - x0, y1 - y0, k, W2, H2);
    if (!grid) return;
    const reg = { x: grid.x, y: grid.y, w: grid.w, h: grid.h };   // alloc-rare: the reblur option only (the 50 ms hold, off by default): the shared blur is how every glass blurs otherwise
    G.disable(G.SCISSOR_TEST); G.disable(G.STENCIL_TEST);
    // (The parts of the copy the glasses read, unless the whole of it is blurred (option full). Glasses that move change them, so they are
    // part of the key: the same picture with a card moved is blurred again where the card now is; a blur is never kept for other parts.)
    const bw = (grid.X1 - grid.X0) / grid.T, bh = (grid.Y1 - grid.Y0) / grid.T;
    let parts = full ? null : blurBoxes(panes.map((p) => ({ x: p.r.left - cr.left, y: p.r.top - cr.top, w: p.r.width, h: p.r.height })), grid.x, grid.y, grid.T / k, bw, bh);   // alloc-rare: the reblur option only (the 50 ms hold, off by default): the shared blur is how every glass blurs otherwise
    if (parts && (!parts.length || (parts.length === 1 && !parts[0][0] && !parts[0][1] && parts[0][2] === bw && parts[0][3] === bh))) parts = null;
    const rest = `${grid.X0}|${grid.Y0}|${grid.X1}|${grid.Y1}|${W2}x${H2}${parts ? `|${parts.join(';')}` : ''}`;   // alloc-rare: the reblur option only (the 50 ms hold, off by default): the shared blur is how every glass blurs otherwise
    const key = `${version ? version() : performance.now()}|${fresh ? fresh() : ''}|${rest}`;   // alloc-rare: the reblur option only (the 50 ms hold, off by default): the shared blur is how every glass blurs otherwise
    if (key !== hk.key) {
      // (Only the figure under the glass drawn again, its view and the region taken the same as the last blur's: blurred again at most
      // every REBLUR_MS, the glass drawn meanwhile from the blur it has. Those are the frames that are not plain blood (the ascites
      // ripple, a catheter, dye, an eased colour): a plain blood frame never gets here. A pan, a zoom or a glide moves the view, and
      // a card sliding or growing moves the region: both blur at once, as before. The last change is blurred when the time is up.)
      const view = version && host.view ? host.view() : null, t = performance.now();
      if (reblur > 0 && view !== null && hk.rest === rest && hk.view === view && hk.reg && t - hk.at < reblur) {
        if (!hk.trail) {
          const K = hk;
          K.trail = setTimeout(() => { K.trail = 0; if (hk === K && hostOn) { K.key = ''; host.now(); } }, reblur - (t - K.at) + 1);   // alloc-rare: the reblur option only (the 50 ms hold, off by default): the shared blur is how every glass blurs otherwise
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
  // (The device-px rect the moving blood drew over since the frame `from` (option dirty: the figure's), as a box in CSS px from the canvas's corner, or null.)
  const dirtyBox = { x: 0, y: 0, w: 0, h: 0 }, dirtyDev = [0, 0, 0, 0];
  // (Render-cost plan 3a, option dirtyRects: the tiles the blood drew, a short list of boxes, in place of their one union; null when unknown.)
  const dirtyList = [], dirtyListPool = [], dirtyDevList = [], dirtyDevPool = [];
  // (Render-cost plan 3b, option pictureRects: where the figure's pictures after `from` up to `to` drew, when each was a part drawn again.)
  const picList = [], picListPool = [], picDevList = [], picDevPool = [];
  function picDirtyFn(from, to) {
    const n = pictureRects(from, to, picDevList, picDevPool);
    if (n < 0) return null;
    const k = host.canvas.width / cr0.width;
    for (let i = 0; i < n; i++) {
      const s = picDevList[i], o = picListPool[i] || (picListPool[i] = { x: 0, y: 0, w: 0, h: 0 });   // alloc-rare: the pool grows to the most boxes a range has had
      o.x = s.x / k; o.y = s.y / k; o.w = s.w / k; o.h = s.h / k;
      picList[i] = o;
    }
    picList.length = n;
    return picList;
  }
  function dirtyFn(from, to) {
    if (dirtyRects) {
      const n = dirtyRects(from, to, dirtyDevList, dirtyDevPool);
      if (n < 0) return null;
      const k = host.canvas.width / cr0.width;
      for (let i = 0; i < n; i++) {
        const s = dirtyDevList[i], o = dirtyListPool[i] || (dirtyListPool[i] = { x: 0, y: 0, w: 0, h: 0 });   // alloc-rare: the pool grows to the most boxes a range has had
        o.x = s.x / k; o.y = s.y / k; o.w = s.w / k; o.h = s.h / k;
        dirtyList[i] = o;
      }
      dirtyList.length = n;
      return dirtyList;
    }
    if (!dirty || !dirty(from, to, dirtyDev)) return null;
    const k = host.canvas.width / cr0.width;
    dirtyBox.x = dirtyDev[0] / k; dirtyBox.y = dirtyDev[1] / k; dirtyBox.w = (dirtyDev[2] - dirtyDev[0]) / k; dirtyBox.h = (dirtyDev[3] - dirtyDev[1]) / k;
    return dirtyBox;
  }
  // (A dip under 1/20 is taken as 1/20: a copy laid that faint has too few levels left to be taken back whole.)
  const figureDip = () => { const d = dip ? +dip() : 1; return d >= 1 || !(d > 0) ? 1 : Math.max(0.05, d); };
  let cr0 = null;
  function runShare(S, cr) {
    cr0 = cr;
    if (!shareTurn(S)) return S.ok;
    const G = hk.G, W2 = host.canvas.width, H2 = host.canvas.height, k = hk.k;
    S.ok = false;
    const pm = pan ? pan() : null;
    const grid = pan ? panGrid(pm, k, W2, H2) : hostGrid(0, 0, cr.width, cr.height, k, W2, H2);
    if (!grid) { shareForget(S); return false; }
    const bw = (grid.X1 - grid.X0) / grid.T, bh = (grid.Y1 - grid.Y0) / grid.T;
    // (The figure moved whole at the same scale since the blur kept: its targets are moved the whole texels the figure moved on the grid held to it,
    // and the plan below finds the parts still inside current. Anything else that moved (the scale, the grid, too far) is no move: blurred as ever.)
    if (pm && S.t && S.snapOk && S.panT === grid.T && S.panW === bw && S.panH === bh && linIs(S.panL, pm)) {
      const sx = PG.ax - S.panX, sy = PG.ay - S.panY, P = S.snap;
      // (Less than a texel moved: the grid alone follows the figure, the targets stay; the snapshot takes the grid it is now on.)
      const moved = sx || sy || P.g[0] !== grid.X0 || P.g[1] !== grid.Y0 || P.g[2] !== grid.X1 || P.g[3] !== grid.Y1;
      if (moved && !(Math.abs(sx) < bw && Math.abs(sy) < bh && (!(sx || sy) || shiftBlur(S.t, sx, sy, bw, bh)) && shareShift(S, sx, sy, grid, bw, bh))) shareForget(S);
    }
    if (pm) { S.panL || (S.panL = new Float64Array(4)); linSet(S.panL, pm); S.panX = PG.ax; S.panY = PG.ay; S.panT = grid.T; S.panW = bw; S.panH = bh; }   // alloc-rare: the share's matrix record, made once
    const nT = 0;   // (no blur passes: the field's reads are held within SMOOTH.reach, a texel at most)
    // (3d, a glass moved over a figure standing still, only with no camera on and none changed since the kept blur: a camera's change (a card's
    // zoom easing out, the deck's fade as it closes) changes what lies under the glasses with no new picture counted, and the kept blur then
    // showed the figure as it lay before, inside a card that had shrunk, until the camera rested and the glass blurred again. 5 Nov 2026.)
    const ck = camKey ? camKey() : -1, ring = ck >= 0 && ck === S.camAt && !zoomRide.riding() ? nT + 1 : 0;
    // (The figure's dip this picture was laid with (a case card's, stage-dive.js): a blur kept from another dip is not this picture's, and every
    // part the glasses read is blurred again, so the whole copy is of one dip, the one the glass takes back out (uUn).)
    const dp = figureDip();
    if (S.dipAt !== dp) shareForget(S);
    const plan = sharePlan(S, grid, grid.T / k, bw, bh, full, keepFor(nT + 2), dirty || dirtyRects ? dirtyFn : null, keepFor(2 * nT + 3), pictureRects ? picDirtyFn : null, ring, performance.now(), look.blur === CARD.blur ? BLOOD_BLUR_MS : 0);   // (the parts grown by the taps this sigma has, one for the glass's sampling between two texels, one spare)
    const sr = S.reg || (S.reg = { x: 0, y: 0, w: 0, h: 0 });   // alloc-rare: the share's region record is made at its first blur
    sr.x = grid.x; sr.y = grid.y; sr.w = grid.w; sr.h = grid.h;
    // (In use in this frame, kept or made again: see the release below.)
    S.usedIn = frameCount();
    if (plan.same && S.t) { S.ok = true; S.skips++; if (gpuProbe.on) gpuProbe.note(COUNTED.glassSkip); return true; }
    if (!S.t) {
      S.t = { copy: texOf(G, G.LINEAR), fbCopy: G.createFramebuffer(), steps: [], size: '', allocs: 0 };   // alloc-rare: a shared blur's targets are made at its first blur (once per look and context)
      // (A retained holder of the budget: under pressure it is freed between frames and made again by the next blur that needs it.)
      S.hold?.drop();
      const mine = S.t;
      // (2 Nov 2026, bug sweep: hold() looks at the budget at once, and over its envelope (a phone in the lobule or the sinusoid) it let go
      // of this very blur before its first use: S.t was null on the next line, the throw took the cards' glass out of the canvas for the
      // rest of the session and every card stayed solid. A blur asked for in this frame (S.usedIn) is the glass on screen, not one kept for
      // later: a release then only takes it out of the budget's keeping (it is freed with its kit, hostFree), never out from under the
      // cards, and never freed and made again frame after frame. Between frames, unused, it is let go as before.)
      S.hold = hold({ owner: `shared glass blur ${S.look}`, kind: 'retained', gl: G, bytes: () => shareBytes(S), release: () => {   // alloc-rare: the share's budget holder is made with its targets (once per look and context)
        if (S.t !== mine) return;
        S.hold = null;
        if (S.usedIn === frameCount()) return;
        freeShare(G)(mine); S.t = null; shareForget(S); S.ok = false;
      } });
    }
    S.hold?.touch();
    const B = S.t;
    B.G = G; B.vao = hk.vao;
    G.disable(G.SCISSOR_TEST); G.disable(G.STENCIL_TEST);
    const ok = hostBlur(grid, plan.parts, B, plan.copy);
    G.bindFramebuffer(G.FRAMEBUFFER, null); G.viewport(0, 0, W2, H2);
    G.bindTexture(G.TEXTURE_2D, null); G.useProgram(null); G.bindVertexArray(null);
    if (ok) shareKeep(S, performance.now()); else shareForget(S);
    S.ok = !!ok;
    if (ok) { S.blurs++; counts.blur++; tally(counts.blurs, co && !paneKind ? 'callouts' : look.blur === CARD.blur ? 'cards' : look.blur === PANE.blur ? 'pane' : look.blur === GLASS.blur ? 'callouts' : S.look); S.camAt = ck; S.dipAt = dp; }   // (by look, for the frame panel: which glass blurs each frame)
    return S.ok;
  }
  // (pass: 'low', 'high' or 'all'; the last turn of the frame ('high', 'all') gives back the marks of the glasses not drawn.)
  const maskFromKit = (p) => maskOf(p.g, p.d, p.lw, p.lh, hk);
  // (What the last frame drew, for a check of the page in motion (drawn(), below): one record per glass, kept and written over, so a frame
  // makes none. A frame may be two passes ('low' then 'high'); it is complete at the final one.)
  const seen = [];
  let seenN = 0, seenSeq = 0, seenT = 0, seenOpen = false;
  function noteSeen(panes, final) {
    if (!seenOpen) seenN = 0;
    for (let i = 0; i < panes.length; i++) {
      const p = panes[i], d = seen[seenN] || (seen[seenN] = { g: null, x: 0, y: 0, w: 0, h: 0, a: 0 });   // alloc-rare: the list grows to the most glasses a frame has drawn
      d.g = p.g; d.x = p.r.left; d.y = p.r.top; d.w = p.r.width; d.h = p.r.height; d.a = p.a;
      seenN++;
    }
    seenOpen = !final;
    if (final) { seenSeq++; seenT = performance.now(); }
  }
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
    if (final) coverNow();
    if (!panes.length) { if (final) { noteSeen(panes, true); settleMarks(frameMarks); } return; }
    const W2 = host.canvas.width, H2 = host.canvas.height, k = hk.k;
    noteDraw(cards && !co ? 'glass-cards' : paneKind ? 'glass-pane' : 'glass');
    if (gpuProbe.on) gpuProbe.note(cards && !co ? COUNTED.cardDrawn : paneKind ? COUNTED.paneDrawn : COUNTED.glassDrawn);
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
    G.uniform1f(U.uUn, 1 / ((hk.share && hk.share.dipAt) || 1));
    G.uniform1f(U.uCell, SMOOTH.cell * k); G.uniform1f(U.uReach, SMOOTH.reach * k);
    G.activeTexture(G.TEXTURE0); G.bindTexture(G.TEXTURE_2D, hk.share ? hk.share.t.copy : hk.copy);
    drawPanes(G, U, panes, cr, k, maskFromKit, frameMarks, final);
    noteSeen(panes, final);
    // (The figure's context left as its other passes expect to find it.)
    G.disable(G.BLEND); G.bindVertexArray(null); G.useProgram(null);
    G.activeTexture(G.TEXTURE1); G.bindTexture(G.TEXTURE_2D, null); G.activeTexture(G.TEXTURE0); G.bindTexture(G.TEXTURE_2D, null);
    G.pixelStorei(G.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }
  const onHostLost = () => { if (host) { warmed.delete(host.gl); fills.delete(host.gl); shares.delete(host.gl); } hk = null; if (hostOn) { hostOn = false; hf = null; if (cards && !co) document.documentElement?.removeAttribute?.('data-cardgl'); unmark(); tellHoles(NONE); ask(); } };
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
  // a slide change. Its end comes from its timing, or its finish, cancel or remove event (a cancel() sends one).)
  const tlNow = () => { const t = document.timeline?.currentTime; return Number.isFinite(t) ? t : performance.now(); };
  // (stateOf answers in one kept record, read before the next call: nothing is made for each animation in a frame.)
  const ST = { st: '', has: false, p: 0, end: 0, fills: false, bad: false, live: undefined };
  function clockState(an, rec) {
    ST.live = undefined;
    if (!rec.c) { ST.st = 'running'; ST.has = false; ST.end = Infinity; ST.fills = false; ST.bad = false; return ST; }
    clockAt(rec.c, tlNow(), ST);
    ST.fills = rec.c.fwd; ST.bad = rec.c.bad;
    return ST;
  }
  const stateOf = clockState;
  function timeAnim(an) {
    const rec = { kf: null, c: null };   // alloc-rare: an animation is timed once, the first time it is seen (trackSoon/measureGeo), never per frame
    try { rec.kf = compileKeyframes(an.effect?.getKeyframes?.() || null); } catch { rec.kf = null; }   // (its keyframes as numbers, once: motionAt reads them each frame and builds nothing)
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
  // card at 0.)
  const ended = new Map();
  const zoomTr = new WeakMap();   // (a zoomed glass's translate as the zoom took it: measureGeo)
  const chainOf = (g) => { const c = []; for (let e = g; e && e !== stop && e.nodeType !== 9; e = e.parentElement) c.push(e); return c; };
  function addAnim(e, an) {
    let m = anims.get(e);
    if (!m) anims.set(e, (m = new Map()));
    if (!m.has(an)) m.set(an, timeAnim(an));
  }
  function track(e) {
    if (!e?.getAnimations) return;
    const list = readAnims(e);
    for (const an of list) addAnim(e, an);
    // (One the page no longer lists has gone (cancelled, or ended with no fill): let go here, read outside any frame.)
    const m = anims.get(e);
    if (m) { for (const an of m.keys()) if (!list.includes(an)) m.delete(an); if (!m.size) anims.delete(e); }
    if (pseudoHosts.has(e)) trackPseudo(e);
  }
  // (A glass that is a pseudo-element's (cards.read gives its pane a pe: the split readings sheet's two cards, ::before and ::after) fades by
  // that pseudo-element's own transition (app.css .pz-sheet.pz-hide::before), which the element's getAnimations() does not list. Its fade was
  // the opacity the page was read with, so the sheet came in as a solid card and turned to glass only when its fade ended (or stepped
  // whenever a write made the page be read again), and went out as a whole frosted panel under words already gone, which then vanished:
  // Mohammad, 10 Nov 2026, "the glass cards when they appear and they disappear still glitch". Its pseudo-elements' animations are taken
  // here (getAnimations({ subtree }) filtered to this element's own pseudo-elements), timed once, and put back each frame (pseudoOf), as an
  // element's are.)
  const pseudoHosts = new WeakSet();
  const panims = new Map();   // (element → Map(animation → { kf, c, pe }))
  const pended = new Map();   // (element → Map(pe → the opacity an animation that has just finished left it at, until the page is read again))
  const SUBTREE = { subtree: true };
  function trackPseudo(e) {
    let list;
    try { list = readAnims(e, SUBTREE) || NONE; } catch { return; }
    let m = panims.get(e);
    for (const an of list) {
      const ef = an.effect, pe = ef?.pseudoElement;
      if (!pe || ef.target !== e) continue;
      if (!m) panims.set(e, (m = new Map()));   // alloc-rare: once per sheet whose pane fades, outside any frame
      if (!m.has(an)) { const rec = timeAnim(an); rec.pe = pe; m.set(an, rec); }
    }
    if (m) { for (const an of m.keys()) if (!list.includes(an)) m.delete(an); if (!m.size) panims.delete(e); }
  }
  // One pane's own fade now, from its pseudo-element's animations (null: none runs, its fade is the one the page was read with).
  function pseudoOf(e, pe, flag) {
    let o = null;
    const m = panims.get(e);
    if (m) {
      for (const [an, rec] of m) {
        if (rec.pe !== pe) continue;
        const S = stateOf(an, rec), st = S.st;
        if (st === 'idle' || (st === 'finished' && !S.fills)) {
          m.delete(an); flag.ended = true;
          if (st === 'finished') { AM.at = 1; if (motionAt(rec.kf, AM) && AM.hasO) { let q = pended.get(e); if (!q) pended.set(e, (q = new Map())); q.set(pe, AM.o); } }   // alloc-rare: an animation has just finished (once per animation), not per frame
          continue;
        }
        if (S.bad) { flag.bad = true; continue; }
        if (!S.has) continue;
        AM.at = S.p;
        if (!motionAt(rec.kf, AM)) { if (st !== 'finished') { flag.bad = true; if (st === 'running' && endsOf(an, rec)) flag.live = true; } continue; }
        if (AM.hasO) o = AM.o;
      }
      if (!m.size) panims.delete(e);
    }
    if (o == null) { const q = pended.get(e); if (q?.has(pe)) o = q.get(pe); }
    return o;
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
  const MV = { x: 0, y: 0, o: null }, CM = { x: 0, y: 0, o: 1 }, AM = new Motion(), inlines = new WeakMap();   // (moveOf's and chainMove's answers: kept records, read before the next call)
  function moveOf(e, flag) {
    let tx = 0, ty = 0, hasT = false, byProp = false, o = null;
    // A number-driven drag owns its animated property; its paused Web Animations are also visible to the animation tracker.
    // Count that property from driven() only, while still following an independent transform or opacity on the same element.
    const dn = driven(e);
    const m = anims.get(e);
    if (m) {
      for (const [an, rec] of m) {
        if (dn && isDrivenAnimation(an)) continue;
        const kf = rec.kf, S = stateOf(an, rec), st = S.st;
        if (st === 'idle' || (st === 'finished' && !S.fills)) {
          m.delete(an); flag.ended = true;
          if (st === 'finished') { AM.at = 1; if (motionAt(kf, AM)) { const was = ended.get(e) || {}; ended.set(e, { t: AM.hasT && !AM.prop ? [AM.tx, AM.ty] : was.t || null, o: AM.hasO ? AM.o : was.o ?? null }); } }   // alloc-rare: an animation has just finished (once per animation), not per frame
          continue;
        }
        if (S.bad) { flag.bad = true; continue; }
        if (!S.has) continue;
        AM.at = S.p;
        const ok = motionAt(kf, AM);
        // (One that has finished and holds its end, a card zoomed up, is in the box the page was read at: nothing to put back, and its end
        // read the page again already, so it no longer asks for a read in every frame.)
        if (!ok && (st === 'finished' || zoomRide.of(e))) continue;
        if (!ok) { flag.bad = true; if (st === 'running' && endsOf(an, rec)) flag.live = true; continue; }
        if (AM.hasT) { tx = AM.tx; ty = AM.ty; hasT = true; byProp = AM.prop; }
        if (AM.hasO) o = AM.o;
      }
      if (!m.size) anims.delete(e);
    }
    const end = ended.get(e);
    if (end) { if (!hasT && dn?.prop !== 'transform' && end.t && !e.style?.transform) { tx = end.t[0]; ty = end.t[1]; hasT = true; } if (o == null && end.o != null) o = end.o; }
    const s = e.style;
    if (s) {
      let im = inlines.get(e);
      if (!im) inlines.set(e, (im = new Inline()));   // alloc-rare: an element's inline reading is made once, the first time it is seen
      if (!hasT && !zoomRide.of(e) && dn?.prop !== 'transform') { if (!inlineShift(im, s.transform)) flag.bad = true; else { tx = im.tx; ty = im.ty; } }
      // (A card or a sheet's plate moved by a finger is held by a number (num-move.js), which replaces its inline translate while it lives: the same two numbers.)
      if (dn) {
        tx += dn.x; ty += dn.y;
        if (dn.prop === 'transform' && !byProp) { if (!inlineTranslate(im, s.translate)) flag.bad = true; else { tx += im.ux; ty += im.uy; } }
      } else if (byProp) { /* (the translate property is animated: the animation's value stands for the inline one while it plays) */ } else if (!inlineTranslate(im, s.translate)) flag.bad = true; else { tx += im.ux; ty += im.uy; }
      if (o == null && s.opacity !== '' && s.opacity != null && !inlineLoses.has(e)) o = NUM(s.opacity);
      // (A card the page moves by a custom property its stylesheet turns into a translate (the words' card's --pz-rise as the readings are
      // pulled out, the data card's --pz-lift): cards.shift(e) gives that move, read from the inline value each frame, so the glass rises
      // with its words. Before, it waited for the next read of the page and the words outran their card (Mohammad, 2 Nov 2026, untucking
      // on the iPhone).)
      if (cards?.shift && !s.translate && !anims.get(e)?.size) { const sh = cards.shift(e); if (sh) { tx += sh[0]; ty += sh[1]; } }
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
  // (scene-cam.js zoomRide.of(): the zoom's scale s about (ox, oy), then the move (dx, dy), in screen px, as the card is drawn this frame.)
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
    ended.clear(); pended.clear();
    const list = glassesOf();
    const tgt = host?.canvas;
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
    const read = readPanes(list, true);
    for (const p of read) if (p.pe && !pseudoHosts.has(p.g)) { pseudoHosts.add(p.g); trackPseudo(p.g); }   // (its pseudo-elements' fades, followed each frame: pseudoOf)
    const panes = read.map((p) => {
      p.tint = p.tint.trim();   // (a frame looks the colour up by this string)
      resolveColour(p.tint);
      if (p.card) resolveColour(p.sf);
      if (p.line) resolveColour(p.line);
      for (const d of p.drops || []) resolveColour(d.c);
      const chain = chainOf(p.g);
      // (Only a running animation of the opacity makes the inline value and the computed one differ for a moment: one that moves the element and
      // leaves its opacity alone does not. The shade's slide out with .pz-leave (a transform transition) let the inline '1' layout writes for the
      // next slide stand for its fade until the slide ended, while .pz-leave held the card at 0: an empty glass panel at full strength, sliding
      // off, on the way from the outline to a deck's first slide (Mohammad, 11 Nov 2026: "see when i transition to first slide how the teaching
      // card flickers").)
      for (const e of chain) { const so = e.style?.opacity; if (so !== '' && so != null && ![...(anims.get(e) || [])].some(([an, rec]) => (!rec.kf || rec.kf.hasO || rec.kf.bad) && stateOf(an, rec).st === 'running') && Math.abs(fadeOf(e) - NUM(so)) > 0.01) inlineLoses.add(e); else inlineLoses.delete(e); }
      const mv = chainMove(chain, flag);
      // (The fade of what does not move, read now; what moves is put back each frame.)
      // (aC: that fade without the pane's own (oa), which a pseudo-element's running fade stands for each frame: nowGeo.)
      let aC = 1;
      for (const e of chain) { if (moveOf(e, flag).o != null) continue; const v = fadeOf(e); if (v < 1) aC *= v; }   // (a missing or odd value is no fade)
      const aS = (p.oa ?? 1) * aC;
      const back = [-mv.x, -mv.y];
      // (A card card-zoom.js moves: its box is the rest box, its motion the zoom's analytic one (zoomRide.of, put back each frame in nowGeo), so what is
      // read now, at the zoom it has, is taken back to where the card rests.)
      // (5 Nov 2026, Mohammad: "the glass lags after i zoom out from the teaching card". On a wide screen the words' card, its glass and the
      // data card are raised by a translate (app.css --pz-rise, --pz-lift), which the browser applies outside the zoom's transform, about an
      // origin card-zoom.js fixed from the box as it stood, translate included. The read took the translate off before the zoom, so a read
      // made at one scale was right only at that scale: read with the card up and drawn on the way back, the glass ended a fraction of the
      // rise off, and stayed so after the zoom let go, until the next read eased it over (the outline above the words, the text spilling
      // below). Now the translate the card had as the zoom took it (tr0, kept per zoom) is part of the zoomed box (rz), any change since is
      // added outside it, and r0 is the box as it rests with no translate, as for every other glass: right at every scale and the frame
      // the zoom lets go.)
      const za = zoomRide.of(p.g);
      let r0, er0, rz = null, erz = null, tr0 = null;
      if (za) {
        tr0 = zoomTr.get(p.g);
        if (!tr0 || tr0.aff !== za) { tr0 = { aff: za, x: mv.x, y: mv.y }; zoomTr.set(p.g, tr0); }   // alloc-rare: once per glass as a zoom takes it
        const since = [tr0.x - mv.x, tr0.y - mv.y], off = [-tr0.x, -tr0.y];
        rz = unzoom(shift(p.r, since), za); erz = unzoom(shift(p.er, since), za);
        r0 = shift(rz, off); er0 = shift(erz, off);
      } else { r0 = shift(p.r, back); er0 = shift(p.er, back); }
      // (A card the page asks to change size in view (data-gl-morph: the teaching card's glass kept up through a slide change) eases from
      // where it is drawn now to its new box on the GPU, its edge and shadows with it; read again mid-way, it carries on from there.)
      let morph = null;
      if (p.rad && !p.d && !za) {
        const q = prev.find((x) => x.g === p.g && x.rad && !x.d);
        if (q) {
          const cur = morphAt(q, tNow);
          if (p.g.hasAttribute('data-gl-morph') && !sameRect(cur, r0)) morph = { from: cur, t0: tNow, ms: D_SURFACE };
          else if (q.morph && tNow - q.morph.t0 < q.morph.ms && sameRect(q.r0, r0)) morph = q.morph;
        }
      }
      if (morph) liveUntil = Math.max(liveUntil, morph.t0 + morph.ms + 34);
      return { ...p, chain, r0, er0, rz, erz, tr0, aS, aC, morph, zoomed: !!za, rad0: za && p.rad ? p.rad.map((v) => v / za.s) : p.rad };
    });
    for (const p of panes) {
      // (What a frame writes its boxes and fade into: kept with the page read, so nowGeo makes nothing.)
      p.radZ = p.rad0 ? [0, 0, 0, 0] : null;
      p.live = { ...p, r: newRect(), er: newRect(), a: 0 };
    }
    const over = host ? (cards && !co ? { low: host.over?.('low') || [], high: host.over?.('high') || [] } : { all: host.over?.() || [] }) : null;
    geo = { list, cr0: shift(cr, [-cmx, -cmy]), tgt, sr: tgt === source ? cr : source.getBoundingClientRect(),   // (the figure's canvas is both: one read, not two)
      vw, vh, bgs, bg, bgVar, panes, over, vk: host?.view?.() ?? null };
    if (watchRo) { if (tgt) watchRo.observe(tgt); for (const g of list) watchRo.observe(g); }
    wake();
  }
  // (2 Nov 2026, the iPhone trace: a write the observers saw, to the callouts, a card, the page's classes, was read at once, in the
  // observer's task (a microtask straight after a frame's callbacks, or an event's), where the page's styles were not up to date: the
  // animations and boxes read there made the browser restyle and lay out the page then, up to 14 ms on a slide change. Those reads wait
  // for the first, read-only phase of the next frame (frame.js readFrame), where the page is as the browser last laid it, and the glass
  // drawn in that frame's final phase still has them.)
  const readFrame = readFrameFor(cards && !co ? 'glass-cards' : paneKind ? 'glass-pane' : 'glass');
  let earlyAsk = 0;
  function measureEarlyNow() { earlyAsk = 0; if (trackQ.size) trackNow(); measureGeo(); }
  // (Likewise a transition or animation that has just started: its keyframes are taken in the next frame's read phase, which comes after
  // the browser sent the event, in the same frame.)
  const trackQ = new Set();
  let trackAsk = 0;
  function trackNow() { trackAsk = 0; for (const e of trackQ) track(e); trackQ.clear(); }
  function trackSoon(e) {
    if (!e) return;
    if (framePhase() === 'read') { track(e); return; }
    trackQ.add(e);
    if (!trackAsk) trackAsk = readFrame(trackNow);
  }
  // (2 Nov 2026: an observer that fires in the read phase fired after a write made there, so a read in it laid the page out in that
  // microtask: it is read in the next frame's read phase too.)
  function measureEarly() {
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
    if (!sameList(G.list, list)) measureEarly();
    const flag = NF, panes = NOW.panes;
    flag.bad = false; flag.ended = false; flag.live = false;
    panes.length = 0;
    let cx = 0, cy = 0;
    if (G.tgt) { const m = moveOf(G.tgt, flag); cx = m.x; cy = m.y; }
    const cr = shiftInto(crLive, G.cr0, cx, cy);
    fadedNow.clear(); litNow.clear();
    for (const p of G.panes) {
      if (!p.g.isConnected) continue;
      const mv = chainMove(p.chain, flag);
      let a = p.aS * mv.o;
      if (p.pe) { const po = pseudoOf(p.g, p.pe, flag); if (po != null) a = p.aC * mv.o * po; }
      if (!(a > 0.001)) { fadedNow.add(p.g); continue; }
      litNow.add(p.g);
      const L = p.live;
      L.a = a;
      if (p.morph) { morphInto(L.r, p, performance.now(), mv.x, mv.y); copyRect(L.er, L.r); L.rad = p.rad; panes.push(L); continue; }
      if (p.zoomed) {
        const za = zoomRide.of(p.g);
        if (za && p.rz) { const tx = mv.x - p.tr0.x, ty = mv.y - p.tr0.y; zoomInto(L.r, p.rz, za, tx, ty); zoomInto(L.er, p.erz, za, tx, ty); }
        else { shiftInto(L.r, p.r0, mv.x, mv.y); shiftInto(L.er, p.er0, mv.x, mv.y); }
        if (za && p.rad0) { const z = p.radZ; for (let i = 0; i < 4; i++) z[i] = p.rad0[i] * za.s; L.rad = z; } else L.rad = p.rad0;
        panes.push(L);
        continue;
      }
      shiftInto(L.r, p.r0, mv.x, mv.y); shiftInto(L.er, p.er0, mv.x, mv.y); L.rad = p.rad;
      panes.push(L);
    }
    for (const g of litNow) fadedNow.delete(g);   // (faded: every glass of the card at 0 this frame, as the wait takes it)
    // (A move the motion cannot put back by itself (a card zoomed up: a scale, in a glide that ends): read again in the next frame's read phase, so its glass is
    // drawn where the card is in that frame, never left a frame or more behind at its old box, an empty panel (Mohammad, 2 Nov 2026, a
    // chart zoomed on HVPG 3).)
    if (flag.live) measureEarly(); else if (flag.bad || flag.ended) measureSoon();
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
  const later = finalFrameFor(cards && !co ? 'glass-cards' : paneKind ? 'glass-pane' : 'glass');
  // (The writes made before it in this frame: a glide or a fade is put back by the motion now; anything else is read just after this frame.)
  const loop = () => { raf = 0; if (changed(mo.takeRecords())) measureSoon(); settle(draw()); };
  function ask() { if (!raf && !lost && !dead) raf = later(loop); }
  /** Something the glass shows may have changed: it looks again (for two frames at least). */
  function wake() { quiet = 0; ask(); }
  // (Any animation of a glass or of what holds it still running: no event says when a script's ends.)
  function moving() {
    for (const M of MOVERS) {
      for (const [e, m] of M) {
        let keep = false;
        for (const [an, rec] of m) {
          const S = stateOf(an, rec);
          if (S.st === 'running' && Number.isFinite(S.end)) return true;   // (one that never ends does not hold it awake)
          if (S.st !== 'idle' && (S.st !== 'finished' || S.fills)) keep = true;
        }
        if (!keep) M.delete(e);
      }
    }
    return false;
  }
  const MOVERS = [anims, panims];   // (the elements' animations and their panes' pseudo-elements')
  const pollFn = () => { poll = 0; measureGeo(); };
  function settle(r) {
    shown = !!r;
    clearTimeout(poll); poll = 0;
    if (lost || dead) return;
    quiet = r === 'same' ? quiet + 1 : 0;
    const running = performance.now() < liveUntil;
    // (Showing: on while it drew, a copy is on its way, or for two quiet frames. Not showing: on only while a transition may bring it in.
    // Either way, never asleep while something in the layers is still animating: a script's fade sends no event.)
    if ((r ? r === true || quiet < 2 : false) || running || moving()) { ask(); return; }
    // (Asleep: a slow look while any glass is on the page; none, and only a new callout (a write to the layers) wakes it.)
    if (glassesNow().length) poll = setTimeout(pollFn, 1000);
  }
  // (Whether these writes change more than the motion puts back: anything but a style that changed only in a translation or an opacity
  // already written there (glass-motion.js movesOnly) on an element inside the glasses' layers.)
  function changed(recs) {
    for (const r of recs) {
      if (r.type !== 'attributes' || r.attributeName !== 'style') return true;
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
  const watched = cards ? [...cards.watch] : pane ? [pane] : layers;   // (a copy: watch(root) adds to it)
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
  for (const e of [source, wrap]) if (e) watchRo?.observe(e);
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
  // A root watched from now on (a region added after the glass was made): the same watch, observer, parents and events as the first ones.
  function watchMore(l) {
    if (!l || dead || watched.includes(l)) return;
    watched.push(l);
    mo.observe(l, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: ['style', 'class', 'data-at', 'hidden'] });
    for (let e = l.parentElement; e && e.nodeType === 1; e = e.parentElement) parentsMo.observe(e, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    for (const t of EVENTS) l.addEventListener(t, held, true);
    measureEarly();
  }
  addEventListener('resize', again);
  // (card-zoom.js moves the card in the frame loop and tells each frame: the glass is drawn in that frame, from the same zoom.)
  const onZoomFrame = () => { quiet = 0; if (hostOn && host && !inPrep && !lost && !dead) host.now(); else ask(); };   // (the zoom's own frame: drawn in this frame's final phase, from this frame's zoom, so the shadow and frost are never a frame behind the card)
  const offZoomFrame = onSceneZoomFrame(onZoomFrame);
  // (The readings' card tucking or coming out (presenter.js slideUnder) writes --pz-u each frame, which sizes the sheet's two panes. They were read in
  // the next frame's read phase, so the glass trailed the card by a frame: the card above's blur slid up from below and back down as the card
  // tucked and untucked (Mohammad, 3 Nov 2026). The presenter tells the glass right after the write, and a cards' glass reads the panes now, in
  // the frame that wrote them, once: the layout is the one this frame has to make anyway.)
  const onSlideFrame = () => { if (!cards || co) return; if (earlyAsk) { earlyAsk = 0; } measureGeo(); quiet = 0; ask(); };
  addEventListener('pps:slideframe', onSlideFrame);
  const offMove = onMove(() => wake());   // (a pull moves a card or a sheet by a number, which writes no style for the observer to see)
  // (The figure drawn again: the blur under a glass that shows is taken again. With none showing, the figure is not its business.)
  const offFigure = onFigure?.(() => { if (shown && !hostOn) wake(); });   // (drawn into the figure's canvas: laid with each picture)
  measureGeo();
  glassForgetters.add(forgetMask);   // (dropLabel tells every renderer a callout's glass is going; dispose() leaves the list)
  return {
    /** Also watches `root` for writes that may move this glass's elements (a region added later). */
    watch: watchMore,
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
      warmPrograms(h.gl, false); if (SHADER_WARM) h.warmIn?.(warmTask(h.gl));   // (started now, published when done: see warmPrograms, warmTask)
      host.canvas.addEventListener('webglcontextlost', onHostLost);
      hostTops = cards && !co
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
     *  on it, or '' when its glass is drawn in the figure's canvas. */
    why(el) {
      if (!el || !glassesOf().includes(el)) return null;
      if (hostOn) return whyEl.get(el) || '';
      if (!host) return 'no figure canvas to draw into';
      return whyAll || 'not drawn in the figure\'s canvas yet';
    },
    /** Where the glass of `el` is drawn now, from the last read of the page and the motion put back on it (CSS px): { left, top, width, height }, or
     *  null when `el` is none of this glass's. Asked outside a frame, by a check that compares the glass with its card; nothing in a frame asks. */
    boxOf(el) {
      if (!el || dead || lost) return null;
      const N = nowGeo(glassesOf());
      if (!N) return null;
      for (const p of N.panes) if (p.g === el) return { left: p.r.left, top: p.r.top, width: p.r.width, height: p.r.height };   // alloc-rare: a check's answer, never made in a frame
      return null;
    },
    /** What the last frame drawn put on the GPU: { seq (counts drawn frames), t (performance.now() when it was drawn), panes: [{ el (the
     *  glass element), x, y, w, h (page CSS px, its motion and zoom applied), a (its opacity)}] }. Asked by a check outside a frame; built
     *  on the call, nothing in a frame makes it. */
    drawn() {
      const panes = [];
      for (let i = 0; i < seenN; i++) { const d = seen[i]; panes.push({ el: d.g, x: d.x, y: d.y, w: d.w, h: d.h, a: d.a }); }
      return { seq: seenSeq, t: seenT, panes };
    },
    get on() { return !lost && !dead; },
    /** The ?perf surfaces list (gpu-surfaces.js): null with none of its glasses on the page, else how they are drawn now. Read only by
     *  the readout (twice a second while it is open), never in a frame. */
    state() {
      const n = glassesOf().length;
      if (!n) return null;
      if (lost || dead) return { on: 'fallback', via: `browser blur, ${n}`, why: dead ? 'its GPU drawing could not be made again' : 'context lost' };
      if (hostOn) return { on: 'gpu', via: `field in the figure's canvas, ${n}` };
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
      removeEventListener('resize', again); offZoomFrame(); removeEventListener('pps:slideframe', onSlideFrame);
      offFigure?.(); offMove();
      host?.canvas.removeEventListener('webglcontextlost', onHostLost);
      hostMo?.disconnect();
      for (const off of hostTops) off();
      hostTops = [];
      unmark();
      tellHoles(NONE);
      if (hostOn) { hostOn = false; hf = null; if (cards && !co) document.documentElement?.removeAttribute?.('data-cardgl'); host?.now(); }
      hostFree();
      maskTex.clear(); maskFb.clear();
      glassForgetters.delete(forgetMask);
    },
    /** Gives back the mask of a glass element that is going (a callout dropped): its texture and framebuffer. Safe to call again. */
    forget: forgetMask,
  };
}

/**
 * One-call glass anywhere (G2): `glass.add(el, { blur, tint, shape })` frosts the figure behind `el` on the GPU and returns a handle with
 * remove(). Each frame the renderer reads the element's box and corner radius (or the given path) and cuts that region out of the blurred
 * figure; the card, sheet and toast glass are plain users of it. `make` is stage.cardGlass (the renderer of one look); `wrap` is the stage.
 *   el      an element, or a function that returns the live list of them (toasts come and go)
 *   blur    CSS px of blur (default CARD.blur); regions of the same blur share one renderer and one blur of the figure
 *   tint    a CSS colour, or (el, computedStyle) => colour; else the element's --gl-tint
 *   card    true (or el => bool): drawn with the one glass (CARD's blur, its look's surface at CARD.tint) whatever its own tint or --gl-tint says
 *   shape   { d, w, h } or (el, box) => { d, w, h }: an SVG path in the box's own px; else the box's rounded corners
 *   k       the tint's strength (default 1); outer  true: the glass's parent is the card it belongs to, whose box bounds the glass's shadow;
 *           shadow  true: that card's box-shadow is drawn with the glass; callouts / pane  true: the figure's callouts' or the liver pane's renderer (own turn and over-list); scale  CSS px a texel of the blur; margin, sat  its own
 *   before  an element beside the cards' layer (where fades stop counting; default the element itself)
 *   watch   roots whose writes may move it (default: its parent); cut / shift / read / low (true, or e => bool)   the cards' own hooks (glass-gl cards option)
 * Where no renderer can be made yet (the figure's canvas not there) it is asked again, 20 times at 500 ms; a region that never gets one
 * keeps the page's solid card, as the cards did.
 */
export function glassRegions(make, wrap) {
  const groups = new Map();
  const live = (grp) => { const out = grp.out; out.length = 0; for (const rec of grp.recs) { const l = rec.el; if (typeof l === 'function') { const m = l(); for (let i = 0; i < m.length; i++) out.push(m[i]); } else out.push(l); } return out; };
  const recOf = (grp, g) => { for (const rec of grp.recs) { if (rec.el === g) return rec; if (typeof rec.el === 'function' && rec.items().includes(g)) return rec; } return null; };   // alloc-rare: only a pane's read
  function build(grp) {
    if (grp.g) return true;
    const blur = grp.blur;
    const roots = []; for (const rec of grp.recs) roots.push(...rec.roots());
    const g = make({
      find: () => live(grp), watch: roots, before: [...grp.recs].map((r) => r.before)[0] || wrap, look: { blur, scale: grp.scale ?? (blur <= 12 ? 4 : CARD.scale), margin: grp.margin ?? Math.ceil(blur * 3), ...(grp.sat ? { sat: grp.sat } : null) }, callouts: grp.callouts, pane: grp.pane,
      region: (e) => recOf(grp, e),
      read: (e) => { const rec = recOf(grp, e); return rec?.read ? rec.read(e) : undefined; },
      shift: (e) => { for (const rec of grp.recs) { const s = rec.shift?.(e); if (s) return s; } return null; },
      cut: (e) => { const rec = recOf(grp, e); return rec?.cut ? rec.cut(e) : null; },
      isLow: (e) => { for (const rec of grp.recs) if (rec.low && (typeof rec.low === 'function' ? rec.low(e) : rec.items().includes(e))) return true; return false; },
    });
    if (!g) return false;
    grp.g = g;
    return true;
  }
  function add(el, o = {}) {
    // (callouts: the figure's callouts, a renderer of their own with their own blur grid (scale), turn and over-list: see createGlassGL's `co`.)
    const key = `${o.blur ?? CARD.blur}${o.callouts ? 'c' : ''}${o.pane ? 'p' : ''}`;
    const grp = groups.get(key) || (() => { const n = { blur: o.blur ?? CARD.blur, scale: o.scale, margin: o.margin, sat: o.sat, callouts: !!o.callouts, pane: !!o.pane, recs: new Set(), out: [], g: null, tries: 0, t: 0 }; groups.set(key, n); return n; })();
    const rec = {
      el, before: o.before || (typeof el === 'function' ? wrap : el), tint: o.tint, card: o.card, shape: o.shape, k: o.k, outer: o.outer, shadow: o.shadow, read: o.read, shift: o.shift, cut: o.cut, low: o.low,
      items: () => (typeof el === 'function' ? el() : [el]),
      roots: () => (o.watch ? [].concat(o.watch) : typeof el === 'function' ? [] : [el.parentElement || el]).filter(Boolean),
    };
    grp.recs.add(rec);
    const start = () => {
      grp.t = 0;
      if (!grp.recs.size) return;
      if (!grp.g) { if (!build(grp)) { if (grp.tries++ < 20) grp.t = setTimeout(start, 500); return; } }
      else for (const r of rec.roots()) grp.g.watch?.(r);
      grp.g.redraw?.();
    };
    if (grp.g) start(); else if (!grp.t) start();
    return {
      // (The renderer's own readings, for checks and the ?perf readout: those of the renderer this region's blur shares.)
      drawn: () => grp.g?.drawn() ?? null, why: (e) => (grp.g ? grp.g.why(e) : grp.recs.has(rec) ? 'no figure canvas to draw into yet (asked again; the card stays solid, never a CPU copy)' : null), boxOf: (e) => grp.g?.boxOf(e) ?? null,
      state: () => grp.g?.state() ?? null, release: () => grp.g?.release(), redraw: () => grp.g?.redraw(), get on() { return !!grp.g?.on; }, get hosted() { return !!grp.g?.hosted; },
      remove() {
        if (!grp.recs.delete(rec)) return;
        if (!grp.recs.size) { clearTimeout(grp.t); grp.t = 0; grp.tries = 0; grp.g?.dispose(); grp.g = null; }
        else grp.g?.redraw?.();
      },
    };
  }
  return { add };
}
