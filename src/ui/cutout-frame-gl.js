// The plate's frame, drawn on the GPU (Three scales on one plate, docs/cutouts.md; the owner's rule, 11 Nov 2026: nothing off the GPU).
//
// A ring round the lobule's window (with the soft shadow that lifts it off the figure), a ring on the spot of the liver it was taken from and the
// two thin lines of a magnifier's cone between them. One pass of the figure's present (veins-gl top.add), over the lobule's window and under
// every glass, laid in the same present as the picture it frames: the liver's spot is kept in the figure's own coordinates and put through this
// frame's camera (stage.figureXform) as a label's anchor is, so it can never be a frame behind a pan, a zoom or a glide.
// No canvas, no DOM, no CPU pixels: one fullscreen triangle, scissored to the frame's box, the shapes worked out in the fragment shader as
// distance fields. While the program is still compiling the frame is asked again, nothing is drawn.
import { startProgram, compileDone, checkProgram } from './gl-compile.js';
import { frameFor } from './frame.js';
import { onTheme } from './theme-epoch.js';
import { restPass } from './rest-pass.js';
import { readStyle, stageBox } from './layout-snap.js';
import { parseCssColor } from './css-color.js';
import { caught } from './caught.js';
import { coneTangents } from './cutouts.js';

/** The pass's place among the figure's tops: over the lobule's window (orders -15 to -8) and under the ink (-2) and every glass (0 and up). */
export const FRAME_ORDER = -4;
export const RING_PX = 2.5, HALO_PX = 7, SPOT_R = 14, SPOT_RING = 2, LINE_PX = 1.6;

export const FRAME_VS = `#version 300 es
void main() { gl_Position = vec4(float((gl_VertexID & 1) << 2) - 1.0, float((gl_VertexID & 2) << 1) - 1.0, 0.0, 1.0); }`;
export const FRAME_FS = `#version 300 es
precision highp float;
uniform vec2 uView; uniform float uDpr;
uniform vec3 uWin;            // the window: centre x, y and radius (css px)
uniform vec4 uP;              // the spot on the liver: x, y, radius, on (0 or 1)
uniform vec4 uAB;             // the cone's tangent points a and b (css px); the cone is drawn when uP.w is 1 and uFlags.x is 1
uniform vec4 uFlags;          // x: the cone, y: the window, z: the master alpha
uniform vec4 uInk; uniform vec3 uShadow;
out vec4 o;
vec4 over(vec4 t, vec4 b) { return t + b * (1.0 - t.a); }
vec4 ink(float a) { return vec4(uInk.rgb * a, a); }
float segDist(vec2 p, vec2 a, vec2 b) { vec2 ab = b - a; float h = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0); return length(p - a - ab * h); }
void main() {
  vec2 px = vec2(gl_FragCoord.x, uView.y * uDpr - gl_FragCoord.y) / uDpr;
  vec4 c = vec4(0.0);
  vec2 q = px - uWin.xy; float len = length(q), R = uWin.z;
  float out_ = smoothstep(R - 0.5, R + 0.5, len);                       // 0 inside the window, 1 outside it
  if (uFlags.y > 0.5) {
    // (A drop shadow under the window, a flat soft band round it and a ring: the window itself is the lobule's own picture, left as it is.)
    float sd = length(q - vec2(0.0, 10.0)) - R;
    c = over(vec4(uShadow * 0.4, 0.4) * (1.0 - smoothstep(-17.0, 17.0, sd)) * out_, c);
    c = over(ink(0.12 * out_ * (1.0 - smoothstep(R + ${HALO_PX.toFixed(2)} - 0.5, R + ${HALO_PX.toFixed(2)} + 0.5, len))), c);
  }
  if (uP.w > 0.5 && uFlags.x > 0.5) {
    vec2 P = uP.xy, A = uAB.xy, B = uAB.zw;
    float s = sign((B.x - A.x) * (P.y - A.y) - (B.y - A.y) * (P.x - A.x));
    float e1 = s * ((B.x - A.x) * (px.y - A.y) - (B.y - A.y) * (px.x - A.x)) / length(B - A);
    float e2 = s * ((P.x - B.x) * (px.y - B.y) - (P.y - B.y) * (px.x - B.x)) / length(P - B);
    float e3 = s * ((A.x - P.x) * (px.y - P.y) - (A.y - P.y) * (px.x - P.x)) / length(A - P);
    float inside = clamp(min(e1, min(e2, e3)) + 0.5, 0.0, 1.0);
    float ln = clamp(${(LINE_PX / 2 + 0.5).toFixed(2)} - min(segDist(px, P, A), segDist(px, P, B)), 0.0, 1.0);
    c = over(ink((0.08 * inside + 0.7 * ln * (1.0 - 0.08 * inside)) * out_), c);
  }
  if (uFlags.y > 0.5) c = over(ink(1.0 - smoothstep(R + ${RING_PX.toFixed(2)} - 0.5, R + ${RING_PX.toFixed(2)} + 0.5, len)) * out_, c);
  if (uP.w > 0.5) {
    float sp = length(px - uP.xy);
    c = over(ink((0.10 + 0.10 * (1.0 - uFlags.y)) * clamp(uP.z + 0.5 - sp, 0.0, 1.0)), c);   // (a closed window leaves the spot a little fuller: the way to open it)
    c = over(ink(clamp(3.5 - sp, 0.0, 1.0)), c);
    c = over(ink(clamp(${(SPOT_RING / 2 + 0.5).toFixed(2)} - abs(sp - uP.z - ${(SPOT_RING / 2).toFixed(2)}), 0.0, 1.0)), c);
  }
  o = c * uFlags.z;
}`;

const VAR = (name, fallback) => parseCssColor(readStyle(document.documentElement).getPropertyValue(name)) || fallback;
const shadowRgb = () => {
  const v = readStyle(document.documentElement).getPropertyValue('--shadow-rgb').trim().split(/\s+/).map(Number);
  return v.length === 3 && v.every(Number.isFinite) ? v.map((x) => x / 255) : [0.18, 0.09, 0.13];
};

/**
 * The plate's frame for the figure.
 *   top()     the figure's context (veins-gl top: { gl, canvas, screen, add, present }), or null where there is none
 *   xform(o)  writes the figure's affine { a, b, c, d, e, f } in stage px (world → stage) into o and returns its kind ('w' while the anatomy is on show)
 * Returns { set(plan), hit(x, y), dispose() }. plan: null (no frame), or { win: { x, y, w, h } (the lobule's window, stage px), free: { l, t, r, b },
 * spot: [x, y] | null (the liver's spot, in the figure's coordinates) }.
 */
export function createCutoutFrame({ top, xform }) {
  let key = '', gl = null, topOf = null, offPass = null, h = null, prog = null, vao = null, dead = false, plan = null, ask = 0, stopTheme = null, watched = null;
  const seen = { on: false, x: 0, y: 0 }, cam = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, tan = { a: [0, 0], b: [0, 0] }, p = [0, 0], c = [0, 0];
  const ink = [0.1, 0.1, 0.1, 1], shadow = [0.18, 0.09, 0.13];
  const colours = () => { const t = VAR('--text', ink); ink[0] = t[0]; ink[1] = t[1]; ink[2] = t[2]; const s = shadowRgb(); shadow[0] = s[0]; shadow[1] = s[1]; shadow[2] = s[2]; };

  const rehost = () => {
    if (offPass) { try { offPass(); } catch (e) { caught('cutout-frame:rehost', e); } offPass = null; }
    gl = null; topOf = null; h = null; prog = null; vao = null;
  };
  const onCtxLost = () => rehost();
  const onCtxBack = () => { if (plan) again(); };   // (a frame later: the stage's own restore, which makes the new top, runs first)
  const watch = (cv) => {
    if (watched === cv) return;
    if (watched) { watched.removeEventListener('webglcontextlost', onCtxLost); watched.removeEventListener('webglcontextrestored', onCtxBack); }
    watched = cv || null;
    if (watched) { watched.addEventListener('webglcontextlost', onCtxLost); watched.addEventListener('webglcontextrestored', onCtxBack); }
  };
  const hostGL = () => {
    const t = top?.();
    if (!t || !t.gl || t.gl.isContextLost()) return null;
    if (t !== topOf || t.gl !== gl) { rehost(); gl = t.gl; h = startProgram(gl, FRAME_VS, FRAME_FS); watch(t.canvas); }
    topOf = t;
    return t;
  };
  const take = () => {
    if (prog) return true;
    if (!compileDone(gl, [h])) return false;
    try {
      prog = checkProgram(gl, h);
      prog.u = {};
      for (const n of ['uView', 'uDpr', 'uWin', 'uP', 'uAB', 'uFlags', 'uInk', 'uShadow']) prog.u[n] = gl.getUniformLocation(prog, n);
      vao = gl.createVertexArray();
    } catch (e) { caught('cutout-frame:take', e); dead = true; return false; }
    return true;
  };
  const unpass = () => {
    if (!offPass) return;
    offPass(); offPass = null;
    try { topOf?.present?.(); } catch (e) { caught('cutout-frame:unpass', e); }
  };
  const askDraw = () => { ask = 0; sync(); }, askFrame = frameFor('cutout-frame');
  const again = () => { if (!ask) ask = askFrame(askDraw); };
  /** Puts the pass in the figure's present while a plan is set, out when not, and asks the figure to lay its picture again. */
  function sync() {
    if (dead || !plan) { unpass(); return; }
    const t = hostGL(); if (!t) return;
    if (!take()) { again(); return; }
    if (!offPass) offPass = t.add({ order: FRAME_ORDER, draw: pass });
    try { t.present(); } catch (e) { caught('cutout-frame:present', e); }
  }
  /** The pass itself, inside each present of the figure: the spot through this frame's camera, the cone from it to the window. */
  function pass() {
    if (dead || !gl || !prog || !plan || gl.isContextLost()) return;
    const b = stageBox(); if (!b) return;
    const W = Math.max(1, Math.round(b.width || b.sw || 1)), H = Math.max(1, Math.round(b.height || b.sh || 1));
    const cw = topOf.canvas.width, ch = topOf.canvas.height, dpr = cw / W;
    const win = plan.win, R = win.w / 2;
    c[0] = win.x + R; c[1] = win.y + win.h / 2;
    // (The liver's spot, through the camera now; it shows only while it lies in the room left of the windows.)
    let spot = 0, cone = 0;
    const open = plan.open !== false;
    seen.on = false;
    if (plan.spot && xform(cam) === 'w') {
      p[0] = cam.a * plan.spot[0] + cam.c * plan.spot[1] + cam.e; p[1] = cam.b * plan.spot[0] + cam.d * plan.spot[1] + cam.f;
      if (p[0] >= plan.free.l && p[0] <= (open ? win.x - 10 : W) && p[1] >= 0 && p[1] <= H) { spot = 1; seen.on = true; seen.x = p[0]; seen.y = p[1]; cone = open && coneTangents(p, c, R, tan) ? 1 : 0; }
    }
    // (The box the frame fills, in canvas px; a scissor takes the rest of the triangle away.)
    let x0 = c[0] - R - 50, y0 = c[1] - R - 50, x1 = c[0] + R + 50, y1 = c[1] + R + 70;
    if (!open) { x0 = p[0]; y0 = p[1]; x1 = p[0]; y1 = p[1]; if (!spot) return; }
    if (spot) { x0 = Math.min(x0, p[0] - 24); y0 = Math.min(y0, p[1] - 24); x1 = Math.max(x1, p[0] + 24); y1 = Math.max(y1, p[1] + 24); }
    const sx = Math.max(0, Math.floor(x0 * dpr)), sy = Math.max(0, Math.floor(ch - y1 * dpr)), sw = Math.min(cw, Math.ceil(x1 * dpr)) - sx, sh = Math.min(ch, Math.ceil(ch - y0 * dpr)) - sy;
    if (sw <= 0 || sh <= 0) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, topOf.screen ? topOf.screen() : null);
    gl.viewport(0, 0, cw, ch);
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.SCISSOR_TEST); gl.scissor(sx, sy, sw, sh);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(prog); gl.bindVertexArray(vao);
    const u = prog.u;
    gl.uniform2f(u.uView, W, H); gl.uniform1f(u.uDpr, dpr);
    gl.uniform3f(u.uWin, c[0], c[1], R);
    gl.uniform4f(u.uP, p[0], p[1], SPOT_R, spot);
    gl.uniform4f(u.uAB, tan.a[0], tan.a[1], tan.b[0], tan.b[1]);
    gl.uniform4f(u.uFlags, cone, open ? 1 : 0, 1, 0);
    gl.uniform4f(u.uInk, ink[0], ink[1], ink[2], 1); gl.uniform3f(u.uShadow, shadow[0], shadow[1], shadow[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null); gl.disable(gl.SCISSOR_TEST);
  }

  colours(); stopTheme = onTheme(() => restPass(() => { colours(); if (plan) again(); }));
  return {
    /** Sets the frame (see above), or takes it away (null). */
    set(next) {
      const k = next ? `${next.open}|${next.win.x}|${next.win.y}|${next.win.w}|${next.free.l}|${next.spot ? next.spot[0].toFixed(1) + next.spot[1].toFixed(1) : ''}` : '';
      if (k === key) return;
      key = k; plan = next || null;
      if (plan) again(); else sync();
    },
    /** Whether a point (stage px) is on the liver's spot as last drawn, with a finger's margin. */
    hit(x, y) { return seen.on && Math.hypot(x - seen.x, y - seen.y) <= Math.max(SPOT_R + 8, 22); },
    dispose() { plan = null; key = ''; unpass(); stopTheme?.(); stopTheme = null; watch(null); clearAsk(); rehost(); },
  };
  function clearAsk() { ask = 0; }
}
