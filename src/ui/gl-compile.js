// Shader programs in two steps, so a context's compiles run side by side and off the frames that need them (the 120 fps addendum,
// §10.1): a program is STARTED (its shaders compiled and linked, nothing read back), and PUBLISHED later, once the driver says it is
// done (KHR_parallel_shader_compile's COMPLETION_STATUS, polled without waiting); only then are its status and uniforms read and a
// small offscreen draw made, so the first real draw has no driver work left to do. Where the extension is missing the status is read
// at once, as before. A draw that comes before its program is published publishes it itself (the wait the old code always had).
// Publishing waits for the page to be left alone (quiet.js): the status read, the uniform lookups and the small draw are a few ms of
// script, and a program that finishes mid pan or pinch had them land in a gesture's frame.
import { leftAlone } from './quiet.js?v=388052eba8';

// (Asked once per context where it is there: getExtension is a call into the browser each time. Not kept when it is missing, so a
// context that came back from a loss is asked again; and one that is there is forgotten when its context is restored, as a restored
// context has none of its extensions on until they are asked for once more.)
const parallel = new WeakMap(), watched = new WeakSet();
const parallelOf = (gl) => {
  let e = parallel.get(gl);
  if (!e) {
    e = gl.getExtension('KHR_parallel_shader_compile');
    if (e) {
      parallel.set(gl, e);
      if (!watched.has(gl)) { watched.add(gl); gl.canvas?.addEventListener?.('webglcontextrestored', () => parallel.delete(gl)); }
    }
  }
  return e;
};

/** Starts a program: its shaders compiled and its link begun, nothing read. bind: [[attribute, location], …] set before the link. */
export function startProgram(gl, vs, fs, bind = []) {
  parallelOf(gl);   // (asking for it is what turns the parallel compile on)
  const sh = [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].map(([type, src]) => {
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
  return { p, sh };
}

/** True when every started program has finished (always true where the driver cannot say: reading its status then waits). */
export function compileDone(gl, handles) {
  const ext = parallelOf(gl);
  if (!ext) return true;
  return [].concat(handles).every((h) => gl.getProgramParameter(h.p, ext.COMPLETION_STATUS_KHR));
}

/** Reads a started program's status (it waits if the compile is not done); throws the info log on a failure. */
export function checkProgram(gl, { p, sh }) {
  for (const s of sh) if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

/** One 1 × 1 draw into a throwaway framebuffer: draw() sets the program and issues the draw call; the canvas is untouched.
 *  The target texture is bound on no unit while it is drawn to (a program whose sampler read it would be reading what it writes, a
 *  feedback loop: the driver refuses the draw and warns, and on another it is undefined); every unit holds a blank 1 × 1 meanwhile, and
 *  every unit's own binding is put back. */
export function exerciseDraw(gl, draw) {
  const fbo = gl.createFramebuffer(), tex = gl.createTexture(), blank = gl.createTexture();
  const unit = gl.getParameter(gl.ACTIVE_TEXTURE), saved = [];
  const UNITS = 16, T0 = gl.TEXTURE0 ?? 0x84C0;
  try {
    for (let u = 0; u < UNITS; u++) { gl.activeTexture(T0 + u); saved.push(gl.getParameter(gl.TEXTURE_BINDING_2D)); }
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
  } catch { /* only a head start */ } finally {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    for (let u = 0; u < saved.length; u++) { gl.activeTexture(T0 + u); gl.bindTexture(gl.TEXTURE_2D, saved[u]); }
    gl.activeTexture(unit);
    gl.deleteFramebuffer(fbo); gl.deleteTexture(tex); gl.deleteTexture(blank);
  }
}

/** How long the page is left alone before a finished program is published (ms). */
export const PUBLISH_QUIET_MS = 200;

/**
 * Calls publish() once the started programs are done, polled from idle moments (never waited on, so never during a gesture's frame
 * for longer than a status query), and once the page has been left alone (`calm(ms)`, quiet.js's leftAlone): a program done in the
 * middle of a pan or pinch is published after it, the draws before then using what they used before (or publishing it themselves,
 * as ever). After `tries` polls for completion it stops and leaves the publishing to the first draw. Returns a cancel.
 */
export function publishWhenDone(gl, handles, publish, tries = 400, calm = leftAlone) {
  let dead = false;
  const idle = typeof requestIdleCallback === 'function' ? (f) => requestIdleCallback(f, { timeout: 250 }) : (f) => setTimeout(f, 32);
  const tick = () => {
    if (dead) return;
    let done;
    try { done = gl.isContextLost() || compileDone(gl, handles); } catch { done = true; }
    if (done) { if (calm(PUBLISH_QUIET_MS)) publish(); else idle(tick); }   // (a finished program waits out the gesture; no poll of it is counted)
    else if (--tries > 0) idle(tick);
  };
  idle(tick);
  return () => { dead = true; };
}
