// Shader programs in two steps, so a context's compiles run side by side and off the frames that need them (the 120 fps addendum,
// §10.1): a program is STARTED (its shaders compiled and linked, nothing read back), and PUBLISHED later, once the driver says it is
// done (KHR_parallel_shader_compile's COMPLETION_STATUS, polled without waiting); only then are its status and uniforms read and a
// small offscreen draw made, so the first real draw has no driver work left to do. Where the extension is missing the status is read
// at once, as before. A draw that comes before its program is published publishes it itself (the wait the old code always had).

/** Starts a program: its shaders compiled and its link begun, nothing read. bind: [[attribute, location], …] set before the link. */
export function startProgram(gl, vs, fs, bind = []) {
  gl.getExtension('KHR_parallel_shader_compile');
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
  const ext = gl.getExtension('KHR_parallel_shader_compile');
  if (!ext) return true;
  return [].concat(handles).every((h) => gl.getProgramParameter(h.p, ext.COMPLETION_STATUS_KHR));
}

/** Reads a started program's status (it waits if the compile is not done); throws the info log on a failure. */
export function checkProgram(gl, { p, sh }) {
  for (const s of sh) if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

/** One 1 × 1 draw into a throwaway framebuffer: draw() sets the program and issues the draw call; the canvas is untouched. */
export function exerciseDraw(gl, draw) {
  const fbo = gl.createFramebuffer(), tex = gl.createTexture();
  const unit = gl.getParameter(gl.ACTIVE_TEXTURE), bound = gl.getParameter(gl.TEXTURE_BINDING_2D);
  try {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, 1, 1);
    draw();
  } catch { /* only a head start */ } finally {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.activeTexture(unit); gl.bindTexture(gl.TEXTURE_2D, bound);
    gl.deleteFramebuffer(fbo); gl.deleteTexture(tex);
  }
}

/**
 * Calls publish() once the started programs are done, polled from idle moments (never waited on, so never during a gesture's frame
 * for longer than a status query). After `tries` polls it stops and leaves the publishing to the first draw. Returns a cancel.
 */
export function publishWhenDone(gl, handles, publish, tries = 400) {
  let dead = false;
  const idle = typeof requestIdleCallback === 'function' ? (f) => requestIdleCallback(f, { timeout: 250 }) : (f) => setTimeout(f, 32);
  const tick = () => {
    if (dead) return;
    let done;
    try { done = gl.isContextLost() || compileDone(gl, handles); } catch { done = true; }
    if (done) publish();
    else if (--tries > 0) idle(tick);
  };
  idle(tick);
  return () => { dead = true; };
}
