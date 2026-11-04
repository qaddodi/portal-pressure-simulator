// The presenter's pointer and pen (N2, 3 Nov 2026), drawn on the GPU.
//
//  - Spotlight: hold L (Mac), or press and hold 500 ms on the figure (iPad, iPhone): a soft round window follows the pointer and the rest
//    of the figure steps back under a veil of the stage's own colour.
//  - Pen: D turns it on and off; a drag on the figure draws. A stroke is kept in the figure's own coordinates (the view on show: the
//    world, the lobule or the sinusoid) and laid again each frame the scheduler runs, through the figure's matrix (stage.figureXform), so it
//    rides a pan, a zoom and a camera glide exactly as a label does, in the frame the figure moves. E erases; a new slide clears.
//
// One WebGL2 canvas of its own lies over the figure and under the cards (the stage view's last child, pointer-events none). It is made
// when the first spotlight or stroke is wanted and given back once there is none, so the page holds the extra context only while ink is
// on. Segments are drawn as instanced quads with a distance-field round end (5 floats a segment); the veil is one triangle.
// No canvas 2D and no CPU pixels: the lines are the GPU's. While a program is still compiling the frame is asked again, nothing is drawn.
import { startProgram, compileDone, checkProgram } from './gl-compile.js';
import { frameFor, onFrameFinal, easeNow } from './frame.js';
import { onTheme } from './theme-epoch.js';
import { restPass } from './rest-pass.js';
import { readStyle, stageBox } from './layout-snap.js';
import { parseCssColor } from './css-color.js';
import { caught } from './caught.js';

export const HOLD_MS = 500, HOLD_SLOP = 10, PEN_PX = 3.5, STEP_PX = 1.5, MAX_SEGS = 24000;
const VEIL = 0, FADE_MS = 90;

/** The inverse of the affine m = { a, b, c, d, e, f } (x' = a x + c y + e, y' = b x + d y + f), written into o; false when it has none. */
export function invertInto(o, m) {
  const det = m.a * m.d - m.b * m.c;
  if (!(Math.abs(det) > 1e-12)) return false;
  o.a = m.d / det; o.b = -m.b / det; o.c = -m.c / det; o.d = m.a / det;
  o.e = -(o.a * m.e + o.c * m.f); o.f = -(o.b * m.e + o.d * m.f);
  return true;
}
/** The affine's scale (the length of its x axis). */
export const scaleOf = (m) => Math.hypot(m.a, m.b);

/** A stroke in figure coordinates: pts is [x0, y0, x1, y1, …] (grown by add), r the pen's half width in figure units. */
export function newStroke(kind, r) { return { kind, r, pts: new Float32Array(64), n: 0 }; }   // alloc-rare: one per stroke, at its pointer down
/** Adds a point (figure units) unless it lies within `step` of the last; returns whether it was added. */
export function addPoint(s, x, y, step = 0) {
  if (s.n) {
    const dx = x - s.pts[2 * s.n - 2], dy = y - s.pts[2 * s.n - 1];
    if (dx * dx + dy * dy < step * step) return false;
  }
  if (2 * s.n + 2 > s.pts.length) { const g = new Float32Array(s.pts.length * 2); g.set(s.pts); s.pts = g; }   // alloc-rare: the stroke's buffer doubles
  s.pts[2 * s.n] = x; s.pts[2 * s.n + 1] = y; s.n++;
  return true;
}
/**
 * The strokes of `kind` as screen segments through m, written into out (a Float32Array: x0, y0, x1, y1, r a segment) from `at`; returns the
 * number of segments. A stroke of one point is a dot (a segment of no length).
 */
export function segmentsInto(out, strokes, kind, m, minR = 0.75) {
  let k = 0;
  const sc = scaleOf(m);
  for (const s of strokes) {
    if (s.kind !== kind || !s.n) continue;
    const r = Math.max(minR, s.r * sc), cap = out.length / 5;
    const n1 = s.n === 1 ? 1 : s.n - 1;
    for (let i = 0; i < n1 && k < cap; i++) {
      const j = s.n === 1 ? 0 : i + 1;
      const x0 = s.pts[2 * i], y0 = s.pts[2 * i + 1], x1 = s.pts[2 * j], y1 = s.pts[2 * j + 1];
      out[5 * k] = m.a * x0 + m.c * y0 + m.e; out[5 * k + 1] = m.b * x0 + m.d * y0 + m.f;
      out[5 * k + 2] = m.a * x1 + m.c * y1 + m.e; out[5 * k + 3] = m.b * x1 + m.d * y1 + m.f;
      out[5 * k + 4] = r; k++;
    }
  }
  return k;
}

const SEG_VS = `#version 300 es
layout(location=0) in vec4 aSeg;
layout(location=1) in float aR;
uniform vec2 uView;
out vec2 vP; flat out vec4 vSeg; flat out float vR;
void main() {
  vec2 c = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));
  vec2 p0 = aSeg.xy, p1 = aSeg.zw, d = p1 - p0;
  float L = length(d);
  vec2 t = L > 1e-4 ? d / L : vec2(1.0, 0.0), n = vec2(-t.y, t.x);
  float pad = aR + 1.5;
  vec2 pos = mix(p0 - t * pad, p1 + t * pad, c.x) + n * (c.y * 2.0 - 1.0) * pad;
  vP = pos; vSeg = aSeg; vR = aR;
  gl_Position = vec4(pos.x / uView.x * 2.0 - 1.0, 1.0 - pos.y / uView.y * 2.0, 0.0, 1.0);
}`;
const SEG_FS = `#version 300 es
precision highp float;
in vec2 vP; flat in vec4 vSeg; flat in float vR;
uniform vec4 uCol;
out vec4 o;
void main() {
  vec2 a = vSeg.xy, b = vSeg.zw, ab = b - a;
  float l2 = dot(ab, ab);
  float h = l2 > 1e-6 ? clamp(dot(vP - a, ab) / l2, 0.0, 1.0) : 0.0;
  float d = length(vP - a - ab * h);
  float al = clamp(vR + 0.5 - d, 0.0, 1.0);
  o = vec4(uCol.rgb, 1.0) * (al * uCol.a);
}`;
const VEIL_VS = `#version 300 es
void main() { gl_Position = vec4(float((gl_VertexID & 1) << 2) - 1.0, float((gl_VertexID & 2) << 1) - 1.0, 0.0, 1.0); }`;
const VEIL_FS = `#version 300 es
precision highp float;
uniform vec2 uView; uniform vec3 uC; uniform vec4 uCol; uniform vec4 uPen; uniform float uDpr;
out vec4 o;
void main() {
  vec2 px = vec2(gl_FragCoord.x, uView.y * uDpr - gl_FragCoord.y) / uDpr;
  float d = length(px - uC.xy);
  float a = uCol.a * smoothstep(uC.z * 0.8, uC.z * 1.55, d);
  // (a thin ring at the window's edge and a dot at its centre, in the pen's colour, so the pointer reads as a pointer on any slide)
  float ring = (1.0 - smoothstep(0.75, 1.75, abs(d - uC.z * 0.8))) * 0.85;
  float dot_ = 1.0 - smoothstep(4.0, 5.5, d);
  float k = max(ring, dot_) * uPen.a;
  o = vec4(uCol.rgb * a * (1.0 - k) + uPen.rgb * k, a * (1.0 - k) + k);
}`;

const VAR = (name, fallback) => {
  const c = parseCssColor(readStyle(document.documentElement).getPropertyValue(name)) || fallback;
  return c;
};

/**
 * The ink for one stage view.
 *   host      the stage view (the canvas goes right after it, in the stage wrap, which the stage view fills)
 *   xform(o)  writes the figure's affine { a, b, c, d, e, f } in host px into o and returns its kind ('' while there is none)
 *   active()  whether a talk is on
 *   onFigure(e)  whether a pointer event is on the figure (not a card or a control)
 */
export function createInk({ host, xform, active, onFigure }) {
  let cv = null, gl = null, prog = null, vprog = null, vao = null, buf = null, dead = false;
  let hs = null, hv = null, bufSegs = 0;
  let strokes = [], cur = null, penOn = false, spotOn = false, spotA = 0, spotAt = 0, penDown = false;
  let px = -1, py = -1, hasPos = false, holdT = 0, holdId = -1, holdX = 0, holdY = 0, touchSpot = false;
  let W = 0, H = 0, dpr = 1, idleT = 0, ask = 0;
  const cam = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, inv = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, last = { a: NaN, b: 0, c: 0, d: 0, e: 0, f: 0, kind: '', n: -1, spot: -1 };
  let segs = new Float32Array(5 * 4096);
  const pen = [0.9, 0.22, 0.2, 1], veil = [0.97, 0.97, 0.97, VEIL];
  const snap = { seq: 0, kind: '', segs: [], spot: null };
  let seq = 0, stopEnd = null, stopTheme = null;

  const colours = () => {
    const d = VAR('--danger', pen), b = VAR('--stage-bg', veil);
    pen[0] = d[0]; pen[1] = d[1]; pen[2] = d[2]; veil[0] = b[0]; veil[1] = b[1]; veil[2] = b[2];
  };

  // ── the context, made when ink is first wanted and given back when it is not ──
  // (The canvas joins the page once, as the talk begins (createInk); its context is made at the first spotlight or stroke and given back with the talk.)
  const mount = () => {
    cv = document.createElement('canvas');
    cv.id = 'inkGl'; cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:1;';   // (beside the stage view, not in it: its opacity .22 behind a slide's veil must not thin the ink; above it, under the cards)
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); prog = vprog = null; }, false);
    cv.addEventListener('webglcontextrestored', () => { gl = null; last.a = NaN; again(); }, false);
    host.after(cv);
  };
  const make = () => {
    if (!cv) return false;
    if (gl && !gl.isContextLost()) return true;
    if (typeof WebGL2RenderingContext === 'undefined') return false;
    try { gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false }); } catch (e) { caught('ink-gl:make', e); gl = null; }
    if (!gl) return false;
    hs = startProgram(gl, SEG_VS, SEG_FS); hv = startProgram(gl, VEIL_VS, VEIL_FS);
    prog = vprog = null;
    return true;
  };
  const take = () => {
    if (prog && vprog) return true;
    if (!compileDone(gl, [hs, hv])) return false;
    try {
      prog = checkProgram(gl, hs); vprog = checkProgram(gl, hv);
      prog.u = { view: gl.getUniformLocation(prog, 'uView'), col: gl.getUniformLocation(prog, 'uCol') };
      vprog.u = { view: gl.getUniformLocation(vprog, 'uView'), c: gl.getUniformLocation(vprog, 'uC'), col: gl.getUniformLocation(vprog, 'uCol'), pen: gl.getUniformLocation(vprog, 'uPen'), dpr: gl.getUniformLocation(vprog, 'uDpr') };
      vao = gl.createVertexArray(); buf = gl.createBuffer(); bufSegs = 0;
      gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 20, 0); gl.vertexAttribDivisor(0, 1);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 20, 16); gl.vertexAttribDivisor(1, 1);
      gl.bindVertexArray(null);
    } catch (e) { caught('ink-gl:take', e); dead = true; return false; }
    return true;
  };
  const release = () => {
    clearTimeout(idleT); idleT = 0;
    if (stopEnd) { stopEnd(); stopEnd = null; }
    if (cv) { try { gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch (e) { caught('ink-gl:release', e); } cv.remove(); cv = null; gl = null; prog = vprog = null; }
    last.a = NaN;   // (only as the talk ends: the canvas and its context stay for the talk once made)
  };

  // ── drawing ──
  const wanted = () => spotOn || spotA > 0.004 || strokes.length > 0;   // (spotOn: the veil fades in from nothing, so it is wanted before it shows)
  const askDraw = () => { ask = 0; draw(true); }, endDraw = () => draw(false), askFrame = frameFor('ink');   // (kept: a frame's ask allocates nothing)
  const again = () => { if (!ask) ask = askFrame(askDraw); };
  const draw = (force) => {
    if (dead || !active()) return;
    if (!wanted()) {   // (nothing left to show: the picture is cleared on the GPU, and the context given back a moment later)
      if (stopEnd) { stopEnd(); stopEnd = null; }
      if (cv && gl && !gl.isContextLost() && last.n !== -1) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); last.n = -1; last.a = NaN; }
      return;
    }
    if (!make()) return;
    if (!take()) { again(); return; }
    // (spot: eased on the scheduler's clock toward its target)
    const t = easeNow(), target = spotOn ? 1 : 0;
    if (spotA !== target) { const dt = Math.min(64, Math.max(0, t - spotAt)); spotA = target > spotA ? Math.min(1, spotA + dt / FADE_MS) : Math.max(0, spotA - dt / FADE_MS); if (Math.abs(spotA - target) < 0.004) spotA = target; }
    spotAt = t;
    const kind = xform(cam);
    const b = stageBox(); if (!b) return;
    const w = Math.max(1, Math.round(b.width || b.sw || 1)), h = Math.max(1, Math.round(b.height || b.sh || 1));
    const nSeg = kind ? segmentsInto(segs, strokes, kind, cam) : 0;
    const same = !force && last.a === cam.a && last.b === cam.b && last.c === cam.c && last.d === cam.d && last.e === cam.e && last.f === cam.f
      && last.kind === kind && last.n === nSeg && last.spot === spotA && !spotOn;
    if (same && w === W && h === H) return;
    const d = Math.min(2, globalThis.devicePixelRatio || 1);
    if (w !== W || h !== H || d !== dpr) { W = w; H = h; dpr = d; cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
    last.a = cam.a; last.b = cam.b; last.c = cam.c; last.d = cam.d; last.e = cam.e; last.f = cam.f; last.kind = kind; last.n = nSeg; last.spot = spotA;
    gl.viewport(0, 0, cv.width, cv.height);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(vao);
    if (spotA > 0.004 && hasPos) {
      const R = Math.max(50, Math.min(100, Math.min(W, H) * 0.09));
      gl.useProgram(vprog);
      gl.uniform2f(vprog.u.view, W, H); gl.uniform3f(vprog.u.c, px, py, R); gl.uniform1f(vprog.u.dpr, dpr);
      gl.uniform4f(vprog.u.col, veil[0], veil[1], veil[2], VEIL * spotA); gl.uniform4f(vprog.u.pen, pen[0], pen[1], pen[2], spotA);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    snap.seq = ++seq; snap.kind = kind; snap.spot = spotA > 0.004 && hasPos ? { x: px, y: py, a: spotA } : null; snap.n = nSeg; snap.x0 = nSeg ? segs[0] : NaN; snap.y0 = nSeg ? segs[1] : NaN; snap.x1 = nSeg ? segs[5 * nSeg - 3] : NaN; snap.y1 = nSeg ? segs[5 * nSeg - 2] : NaN;   // (the first and last point as laid, for the checks)
    if (nSeg) {
      gl.useProgram(prog);
      gl.uniform2f(prog.u.view, W, H); gl.uniform4f(prog.u.col, pen[0], pen[1], pen[2], 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      if (nSeg > bufSegs) { bufSegs = Math.max(nSeg, bufSegs * 2, 1024); gl.bufferData(gl.ARRAY_BUFFER, bufSegs * 20, gl.DYNAMIC_DRAW); }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, segs, 0, nSeg * 5);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, nSeg);
    }
    gl.bindVertexArray(null);
    if (spotA !== (spotOn ? 1 : 0)) again();   // (the veil still easing)
    if (!stopEnd) stopEnd = onFrameFinal(endDraw);   // (at the end of every frame the scheduler runs: a glide of the figure moves the ink in that same frame)
  };

  // ── input ──
  const local = (e) => { const b = stageBox(); return b ? [e.clientX - b.left, e.clientY - b.top] : [e.clientX, e.clientY]; };
  const say = (x) => { hasPos = true; px = x[0]; py = x[1]; };
  const spot = (on) => {
    if (spotOn === on) return;
    spotOn = on; spotAt = easeNow();
    if (on && !hasPos) { const b = stageBox(); if (b) say([(b.width || b.sw) / 2, (b.height || b.sh) / 2]); }
    if (on) { clearTimeout(idleT); idleT = 0; }
    again();
  };
  const beginStroke = (e) => {
    const kind = xform(cam); if (!kind || !invertInto(inv, cam)) return false;
    const [lx, ly] = local(e), sc = scaleOf(cam);
    cur = newStroke(kind, PEN_PX / sc);
    addPoint(cur, inv.a * lx + inv.c * ly + inv.e, inv.b * lx + inv.d * ly + inv.f);
    strokes.push(cur); penDown = true; clearTimeout(idleT); idleT = 0;
    again(); return true;
  };
  const extend = (e) => {
    if (!cur || !invertInto(inv, cam)) return;
    const [lx, ly] = local(e);
    const sc = scaleOf(cam);
    if (addPoint(cur, inv.a * lx + inv.c * ly + inv.e, inv.b * lx + inv.d * ly + inv.f, STEP_PX / sc) && strokes.length) again();
  };
  const endStroke = () => { cur = null; penDown = false; };
  const onDown = (e) => {
    if (!active() || !onFigure(e)) return;
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      if (!penOn && e.pointerType === 'touch') {
        clearTimeout(holdT); holdId = e.pointerId; holdX = e.clientX; holdY = e.clientY;
        holdT = setTimeout(() => { holdT = 0; touchSpot = true; say(local({ clientX: holdX, clientY: holdY })); spot(true); }, HOLD_MS);
        return;
      }
    }
    if (penOn && (e.button === 0 || e.pointerType !== 'mouse') && beginStroke(e)) { e.preventDefault(); e.stopImmediatePropagation(); }
  };
  const onMove = (e) => {
    if (!active()) return;
    if (holdT && e.pointerId === holdId && Math.hypot(e.clientX - holdX, e.clientY - holdY) > HOLD_SLOP) { clearTimeout(holdT); holdT = 0; }
    if (e.pointerType === 'mouse' || touchSpot || spotOn) {
      const b = stageBox();
      if (b && (e.pointerType === 'mouse' || touchSpot) && e.clientX >= b.left && e.clientY >= b.top) { say(local(e)); if (spotOn) again(); }
    }
    if (cur && e.buttons !== 0 || cur && e.pointerType !== 'mouse') { extend(e); e.preventDefault(); e.stopImmediatePropagation(); }
    else if (touchSpot) { e.preventDefault(); e.stopImmediatePropagation(); }
  };
  const onUp = (e) => {
    if (holdT && e.pointerId === holdId) { clearTimeout(holdT); holdT = 0; }
    if (touchSpot && e.pointerId === holdId) { touchSpot = false; spot(false); eatClick = performance.now() + 600; }
    if (cur) { endStroke(); e.stopImmediatePropagation?.(); }
  };
  const onTouch = (e) => { if (cur || touchSpot || (penOn && active() && onFigure(e))) { if (e.cancelable) e.preventDefault(); e.stopImmediatePropagation(); } };
  let eatClick = 0;
  const onClick = (e) => { if (eatClick && performance.now() < eatClick) { e.preventDefault(); e.stopImmediatePropagation(); } };   // (the click a lifted long press can leave: it must not also explain a label)
  const onMenu = (e) => { if (touchSpot || holdT || cur) e.preventDefault(); };
  const onBlur = () => { spot(false); clearTimeout(holdT); holdT = 0; touchSpot = false; endStroke(); };
  const L = [['pointerdown', onDown], ['pointermove', onMove], ['pointerup', onUp], ['pointercancel', onUp], ['touchstart', onTouch], ['touchmove', onTouch], ['contextmenu', onMenu], ['click', onClick], ['blur', onBlur]];
  for (const [t, f] of L) addEventListener(t, f, { capture: true, passive: false });
  mount();
  colours(); stopTheme = onTheme(() => restPass(() => { colours(); last.a = NaN; if (wanted()) again(); }));   // (the tokens are read again in a rest pass, not in the theme's frame)

  return {
    /** Holds the spotlight on (L down) or lets it go (L up). */
    /** L: the laser on if off, off if on. */
    toggleSpot() { spot(active() ? !spotOn : false); },
    hold(on) { if (active()) spot(!!on); else spot(false); },
    /** Turns the pen on or off (D); returns whether it is on. */
    togglePen(on = !penOn) { penOn = !!on && active(); host.style.cursor = penOn ? 'crosshair' : ''; if (!penOn) endStroke(); return penOn; },
    penOn: () => penOn,
    /** Erases every stroke (E, and a new slide). */
    clear() { endStroke(); const had = strokes.length > 0; strokes = []; if (had) { last.a = NaN; again(); } },
    /** The slide changed or the talk ended: erase, and let the veil go. */
    reset() { this.clear(); spotOn = false; spotA = 0; touchSpot = false; clearTimeout(holdT); holdT = 0; },
    count: () => strokes.length,
    /** Whether the laser or a stroke in progress is live (the talk is not idle while it is). */
    live: () => spotOn || spotA > 0.004 || penDown,
    /** For the checks: what the last draw laid ({ seq, kind, n, spot }), and the strokes' points in figure units. */
    snapshot: () => ({ ...snap, pen: pen.slice(0, 3), veil: veil.slice(0, 3), strokes: strokes.map((s) => ({ kind: s.kind, r: s.r, n: s.n, pts: Array.from(s.pts.subarray(0, 2 * s.n)) })) }),
    /** Draws now (the checks). */
    drawNow: () => draw(true),
    dispose() {
      for (const [t, f] of L) removeEventListener(t, f, { capture: true });
      stopTheme?.(); clearTimeout(holdT); strokes = []; spotOn = false; spotA = 0; host.style.cursor = ''; release(); dead = true;
    },
  };
}
