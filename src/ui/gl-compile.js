// Shader programs in two steps, so a context's compiles run side by side and off the frames that need them (the 120 fps addendum,
// §10.1): a program is STARTED (its shaders compiled and linked, nothing read back), and PUBLISHED later, once the driver says it is
// done (KHR_parallel_shader_compile's COMPLETION_STATUS, polled without waiting); only then are its status and uniforms read and a
// small offscreen draw made, so the first real draw has no driver work left to do. Where the extension is missing the status is read
// at once, as before. A draw that comes before its program is published publishes it itself (the wait the old code always had).
// Publishing waits for the page to be left alone (quiet.js): the status read, the uniform lookups and the small draw are a few ms of
// script, and a program that finishes mid pan or pinch had them land in a gesture's frame.
import { leftAlone } from './quiet.js';
import { glGet } from './gl-state.js';
import { caught } from './caught.js';

// (Asked once per context where it is there: getExtension is a call into the browser each time. Not kept when it is missing, so a
// context that came back from a loss is asked again; and one that is there is forgotten when its context is restored, as a restored
// context has none of its extensions on until they are asked for once more.)
const parallel = new WeakMap(), watched = new WeakSet();
const NO_BIND = Object.freeze([]);   // (no attribute locations to set: the default of the starters, shared)
const parallelOf = (gl) => {
  let e = parallel.get(gl);
  if (!e) {
    e = gl.getExtension('KHR_parallel_shader_compile');
    if (e) {
      parallel.set(gl, e);
      if (!watched.has(gl)) { watched.add(gl); gl.canvas?.addEventListener?.('webglcontextrestored', () => parallel.delete(gl)); } // alloc-rare: once per context, the first time its extension is asked for
    }
  }
  return e;
};

/** Starts a program: its shaders compiled and its link begun, nothing read. bind: [[attribute, location], …] set before the link. */
export function startProgram(gl, vs, fs, bind = NO_BIND) {
  parallelOf(gl);   // (asking for it is what turns the parallel compile on)
  const sh = [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].map(([type, src]) => { // alloc-rare: once per program, when it is started (a surface's first draw, a restored context)
    if (typeof src !== 'string') return src;   // (a shader object shared with another program)
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  });
  const p = gl.createProgram();
  for (const s of sh) gl.attachShader(p, s);
  for (const [name, loc] of bind) gl.bindAttribLocation(p, loc, name);
  gl.linkProgram(p);
  return { p, sh }; // alloc-rare: once per program, when it is started (a surface's first draw, a restored context)
}

/** True when every started program has finished (always true where the driver cannot say: reading its status then waits). */
export function compileDone(gl, handles) {
  const ext = parallelOf(gl);
  if (!ext) return true;
  if (!Array.isArray(handles)) return !!gl.getProgramParameter(handles.p, ext.COMPLETION_STATUS_KHR);
  for (let i = 0; i < handles.length; i++) if (!gl.getProgramParameter(handles[i].p, ext.COMPLETION_STATUS_KHR)) return false;
  return true;
}

/** Reads a started program's status (it waits if the compile is not done); throws the info log on a failure. */
// (The link's status first, as MDN's "WebGL best practices" advises: a program that linked had shaders that compiled, so their own status,
// one more synchronous query each, is read only for a failure's log.)
export function checkProgram(gl, { p, sh }) {
  if (gl.getProgramParameter(p, gl.LINK_STATUS)) return p;
  for (const s of sh) if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

// Every shader started at the context's setup, before any is read (GPU practice §2, docs/gpu-practices.md; Mohammad, 1 Nov: "Move
// everything to GPU"). The figure's renderer starts, in one go and side by side with its own, the programs its helpers would otherwise
// compile one after another as each is first made or first drawn (the organs' painter and shapes, the overlays' stack, the resolution
// fade): prestart() leaves each compiling, and the helper's own linkProgram() takes it up, by when the driver has long finished. A
// helper made before or without that start compiles its own, as before.
export const SHADER_WARM = true;   // (switch deleted; kept for veins-gl.js, glass-gl.js, field-gl.js and res-fade-gl.js until their own pass)
const pre = new WeakMap();   // gl → Map(sources → started program)
const srcKey = (vs, fs) => `${vs}\u0000${fs}`; // alloc-rare: once per program, at a renderer's setup: the key is built to find the started program
/** Starts a program (strings only) for a later linkProgram on the same context; nothing is read. Returns its handle (null: not started). */
export function prestart(gl, vs, fs, bind = NO_BIND) {
  if (!gl || gl.isContextLost?.()) return null;
  let m = pre.get(gl);
  if (!m) pre.set(gl, (m = new Map())); // alloc-rare: once per program, at a renderer's setup: the key is built to find the started program
  const k = srcKey(vs, fs);
  let h = m.get(k);
  if (h && gl.isProgram(h.p)) return h;   // (one from before a lost context is gone with it: started again)
  h = startProgram(gl, vs, fs, bind);
  m.set(k, h);
  return h;
}
/** The started program waiting for these sources, if there is one (not taken). */
export function prestarted(gl, vs, fs) {
  const h = pre.get(gl)?.get(srcKey(vs, fs));
  return h && gl.isProgram(h.p) ? h : null;
}
/** A linked program for these sources (strings): the one prestart left compiling, or one compiled now; its status read (throws the
 *  info log on a failure). Its shaders are let go of (freed with the program). */
export function linkProgram(gl, vs, fs, bind = NO_BIND) {
  const m = pre.get(gl), k = srcKey(vs, fs);
  let h = m?.get(k);
  if (h) m.delete(k);
  if (!h || !gl.isProgram(h.p)) h = startProgram(gl, vs, fs, bind);
  try { checkProgram(gl, h); } catch (e) { gl.deleteProgram(h.p); for (const s of h.sh) gl.deleteShader(s); throw e; }
  for (const s of h.sh) gl.deleteShader(s);
  return h.p;
}

/** One 1 × 1 draw into a throwaway framebuffer: draw() sets the program and issues the draw call; the canvas is untouched.
 *  The target texture is bound on no unit while it is drawn to (a program whose sampler read it would be reading what it writes, a
 *  feedback loop: the driver refuses the draw and warns, and on another it is undefined); every unit holds a blank 1 × 1 meanwhile, and
 *  every unit's own binding is put back. */
// (Review pass 2, item 9: what is bound is read from the renderer's own record (gl-state.js), not asked of the driver 17 times; and the
// host's framebuffers, viewport, program and vertex array are put back too: the warm-up used to leave the default framebuffer bound and
// a 1 × 1 viewport behind, for whoever drew next in the same context.)
export function exerciseDraw(gl, draw) {
  const fbo = gl.createFramebuffer(), tex = gl.createTexture(), blank = gl.createTexture();
  const g = (k) => glGet(gl, k); // alloc-rare: once per program, when its warm-up draw is made at publication
  const unit = g(gl.ACTIVE_TEXTURE), saved = []; // alloc-rare: once per program, when its warm-up draw is made at publication
  const fbR = g(gl.READ_FRAMEBUFFER_BINDING), fbD = g(gl.DRAW_FRAMEBUFFER_BINDING), vp = g(gl.VIEWPORT), prog = g(gl.CURRENT_PROGRAM), vao = g(gl.VERTEX_ARRAY_BINDING);
  const UNITS = 16, T0 = gl.TEXTURE0 ?? 0x84C0;
  try {
    for (let u = 0; u < UNITS; u++) { gl.activeTexture(T0 + u); saved.push(g(gl.TEXTURE_BINDING_2D)); }
    // (The target is made on the last unit and let go of at once: attached, it needs no unit.)
    gl.activeTexture(T0 + UNITS - 1);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    for (let u = 0; u < UNITS; u++) {
      gl.activeTexture(T0 + u);
      gl.bindTexture(gl.TEXTURE_2D, blank);
      if (u === 0) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); }   // (complete, so a sampler reading it draws black without a warning)
    }
    gl.activeTexture(T0);
    gl.viewport(0, 0, 1, 1);
    draw();
  } catch (e) { caught('gl-compile:127', e); /* only a head start */ } finally {
    if ((fbR ?? null) === (fbD ?? null)) gl.bindFramebuffer(gl.FRAMEBUFFER, fbD ?? null);
    else { gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbR ?? null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fbD ?? null); }
    if (vp?.length === 4) gl.viewport(vp[0], vp[1], vp[2], vp[3]);
    if (prog) gl.useProgram?.(prog);   // (the host's program back; with none bound, the warm-up's may stay: nothing draws without one)
    if (vao !== undefined) gl.bindVertexArray?.(vao);
    for (let u = 0; u < saved.length; u++) { gl.activeTexture(T0 + u); gl.bindTexture(gl.TEXTURE_2D, saved[u]); }
    gl.activeTexture(unit);
    gl.deleteFramebuffer(fbo); gl.deleteTexture(tex); gl.deleteTexture(blank);
  }
}

/** How long the page is left alone before a finished program is published (ms). */
export const PUBLISH_QUIET_MS = 200;

// Shader readiness (recs R10, 2 Nov 2026): a program a draw asks for before it is published is no longer published inside that draw,
// where reading its status waits for the driver while the frame's deadline runs. ready() first asks, without waiting, whether the
// compile is done (compileDone: COMPLETION_STATUS_KHR); while it is not, the draw is skipped (the caller keeps what it showed) and the
// program is marked WANTED, so the idle poller publishes it the moment the driver is done, without waiting out a gesture. And every
// program still waiting can be published ahead of use by prepareShaders(), called from a slide's preparation (slide-prep.js), so a
// slide change finds its programs published before its first frame.
export const SHADER_READY = true;   // (switch deleted; kept for sinusoid-gl.js until its own pass)
const waitingPub = new Set();   // { gl, handles, publish, wanted }: started programs not yet published
// (recs-production-120hz §6/§17: a slide's preparation that found programs still compiling waits for the next one to be published, or
// to fail, instead of reading a stale boolean; failures are counted, never taken for a publication.)
const movers = new Set();
const shaderStats = { published: 0, failed: 0 };
function moved() { for (const r of [...movers]) r(); movers.clear(); }
/** Resolves when a waiting program is published or given up on, or after `ms` at most. */
export function whenShadersMove(ms = 250) {
  if (!waitingPub.size) return Promise.resolve();
  return new Promise((res) => { const t = setTimeout(() => { movers.delete(done); res(); }, ms); const done = () => { clearTimeout(t); res(); }; movers.add(done); });
}
/** Cumulative count of publications that threw (B16: a slide's preparation compares it before and after; an emptied waiting set is not proof of success). */
export const shaderFailures = () => shaderStats.failed;
/** Programs published ahead of their draw, and publications that threw (each left to its first draw, which reports it). */
export const shaderPrepStats = () => ({ ...shaderStats, waiting: waitingPub.size });
/** Publishes, ahead of their first draw, every waiting program whose compile is done (asked without waiting), within `budgetMs` of
 *  script. Where the driver cannot say, the status is read here (a controlled preparation step, never a frame). Returns how many wait. */
export function prepareShaders(budgetMs = 4) {
  const t0 = performance.now();
  for (const e of [...waitingPub]) {
    if (performance.now() - t0 > budgetMs) break;
    let done;
    try { done = e.gl.isContextLost() || compileDone(e.gl, e.handles); } catch { done = true; }
    if (!done) continue;
    waitingPub.delete(e);
    try { e.publish(); shaderStats.published++; } catch { /* counted by publish(); read at the first draw, as before */ }
    moved();
  }
  return waitingPub.size;
}
/** True while these started programs are still compiling (asked without waiting; false where the driver cannot say). */
export function stillCompiling(gl, handles) {
  if (!handles) return false;
  try { return !gl.isContextLost() && !compileDone(gl, handles); } catch { return false; }
}

/**
 * Calls publish() once the started programs are done, polled from idle moments (never waited on, so never during a gesture's frame
 * for longer than a status query), and once the page has been left alone (`calm(ms)`, quiet.js's leftAlone): a program done in the
 * middle of a pan or pinch is published after it, the draws before then using what they used before (or publishing it themselves,
 * as ever). After `tries` polls for completion it stops and leaves the publishing to the first draw. Returns a cancel.
 */
export function publishWhenDone(gl, handles, publish, tries = 400, calm = leftAlone) {
  let dead = false;
  const idle = typeof requestIdleCallback === 'function' ? (f) => requestIdleCallback(f, { timeout: 250 }) : (f) => setTimeout(f, 32); // alloc-rare: once per program, when it waits to be published
  // (R10: registered while it waits, so a slide's preparation can publish it first; a draw that wanted it lifts the wait for calm.)
  const entry = { gl, handles, wanted: false, publish: () => { if (dead) return; dead = true; waitingPub.delete(entry); try { publish(); } catch (e) { shaderStats.failed++; throw e; } finally { moved(); } } }; // alloc-rare: once per program, when it waits to be published
  waitingPub.add(entry);
  const tick = () => { // alloc-rare: once per program, when it waits to be published
    if (dead) return;
    let done;
    try { done = gl.isContextLost() || compileDone(gl, handles); } catch { done = true; }
    if (done) { if (entry.wanted || calm(PUBLISH_QUIET_MS)) entry.publish(); else idle(tick); }   // (a finished program waits out the gesture; no poll of it is counted)
    else if (--tries > 0) idle(tick);
    // (Review pass 2, item 2: past its `tries` the poll no longer gives up and leaves the publishing to the first draw, where reading
    // the status waits for the driver inside a frame. It slows to one ask every half second and keeps its place in the queue, so a
    // slide's preparation (prepareShaders) can still publish it ahead of use.)
    else setTimeout(tick, 500);
  };
  idle(tick);
  const stop = () => { dead = true; if (waitingPub.delete(entry)) moved(); }; // alloc-rare: once per program, when it waits to be published
  stop.want = () => { entry.wanted = true; }; // alloc-rare: once per program, when it waits to be published
  return stop;
}
