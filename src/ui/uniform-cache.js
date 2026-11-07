// A uniform is sent to the GPU only when its value is not the one its program already holds (laptop-heat quick item Q2, 31 Oct 2026).
// In Safari every gl.* call is a message to the GPU process, and the figure's composite set about fifty uniforms on every frame the blood
// moved, nearly all of them the same numbers as the frame before (the view, the plates, the colours; only the clock changes). A program
// keeps its uniforms until it is linked again, so a call that would set the value it already holds changes nothing on the screen.
//
// The cache is keyed by the uniform's location object, which belongs to one program, and made for one context (a lost context makes
// new programs and new locations). It must be the only way the uniforms it handles are set: anything else that sets one of them on the
// same program would leave the cache believing in a value that is no longer there (veins-gl.js sets these names nowhere else; its
// test pins that).

// reset() forgets what every location holds: call it when the context is lost or restored (the new programs hold their defaults,
// not the values this cache last sent).

// (A class, so the fifty-odd uniform calls a frame go through methods on its prototype: one closure per call kind per context is not
// made, and the cache holds only its context and the map of what each location holds.)
class UniformCache {
  constructor(gl) {
    this.gl = gl;
    this.last = new WeakMap();   // alloc-rare: made once per GL context (ucOf keeps the cache)
    this.t = new Float64Array(4);   // alloc-rare: made once per GL context: the numbers of the call being checked, see changed
  }
  // True when `loc` is not already holding the n numbers in T (and records them as now held). The numbers come in the kept T, not as
  // arguments: a double passed to a call that is not inlined is boxed in a new heap number, once for each of the fifty uniforms a frame.
  changed(loc, n) {
    if (typeof loc !== 'object') return true;   // (not a real location: send it)
    let s = this.last.get(loc);
    // (A location last set from an array (changedArr: a linear gradient's ends, fv4) and now from numbers (a radial one's, f4) gets a record
    // of numbers: the array's record has none, and reading it threw on every frame, so the scope's bleed, which fills both, never drew.)
    if (!s || !s.v) { s = { n: -1, v: new Float64Array(4) }; this.last.set(loc, s); }   // alloc-rare: once per uniform location, the first time it is set
    const v = s.v, t = this.t;
    if (s.n === n && v[0] === t[0] && (n < 2 || v[1] === t[1]) && (n < 3 || v[2] === t[2]) && (n < 4 || v[3] === t[3])) return false;
    s.n = n; v[0] = t[0];
    if (n > 1) v[1] = t[1];
    if (n > 2) v[2] = t[2];
    if (n > 3) v[3] = t[3];
    return true;
  }
  // The same for an array uniform (uniformNfv / uniformMatrixNfv): held as a copy, compared element by element.
  changedArr(loc, arr) {
    if (typeof loc !== 'object') return true;
    let s = this.last.get(loc);
    if (!s || !s.arr || s.arr.length !== arr.length) { s = { arr: new Float32Array(arr.length), fresh: true }; this.last.set(loc, s); }   // alloc-rare: once per uniform location (again only if the array's length changes)
    const held = s.arr;
    let diff = !!s.fresh;
    for (let i = 0; i < held.length; i++) if (held[i] !== Math.fround(arr[i])) { diff = true; break; }
    if (!diff) return false;
    held.set(arr); s.fresh = false;
    return true;
  }
  reset() { this.last = new WeakMap(); }   // alloc-rare: only when a GL context is lost or restored
  f1(loc, a) { if (loc) { this.t[0] = a; if (this.changed(loc, 1)) this.gl.uniform1f(loc, a); } }
  i1(loc, a) { if (loc) { this.t[0] = a; if (this.changed(loc, 1)) this.gl.uniform1i(loc, a); } }
  f2(loc, a, b) { if (loc) { const t = this.t; t[0] = a; t[1] = b; if (this.changed(loc, 2)) this.gl.uniform2f(loc, a, b); } }
  i2(loc, a, b) { if (loc) { const t = this.t; t[0] = a; t[1] = b; if (this.changed(loc, 2)) this.gl.uniform2i(loc, a, b); } }
  f3(loc, a, b, c) { if (loc) { const t = this.t; t[0] = a; t[1] = b; t[2] = c; if (this.changed(loc, 3)) this.gl.uniform3f(loc, a, b, c); } }
  i3(loc, a, b, c) { if (loc) { const t = this.t; t[0] = a; t[1] = b; t[2] = c; if (this.changed(loc, 3)) this.gl.uniform3i(loc, a, b, c); } }
  f4(loc, a, b, c, d) { if (loc) { const t = this.t; t[0] = a; t[1] = b; t[2] = c; t[3] = d; if (this.changed(loc, 4)) this.gl.uniform4f(loc, a, b, c, d); } }
  /** From an array of 2, 3 or 4 numbers (what the callers spread into uniform2f / 3f / 4f). */
  f2a(loc, v) { if (loc) { const t = this.t; t[0] = v[0]; t[1] = v[1]; if (this.changed(loc, 2)) this.gl.uniform2f(loc, v[0], v[1]); } }
  f3a(loc, v) { if (loc) { const t = this.t; t[0] = v[0]; t[1] = v[1]; t[2] = v[2]; if (this.changed(loc, 3)) this.gl.uniform3f(loc, v[0], v[1], v[2]); } }
  f4a(loc, v) { if (loc) { const t = this.t; t[0] = v[0]; t[1] = v[1]; t[2] = v[2]; t[3] = v[3]; if (this.changed(loc, 4)) this.gl.uniform4f(loc, v[0], v[1], v[2], v[3]); } }
  /** Arrays: Float32Arrays (a plain array of doubles would never compare equal to its float copy and be sent each time). */
  fv1(loc, arr) { if (loc && this.changedArr(loc, arr)) this.gl.uniform1fv(loc, arr); }
  iv1(loc, arr) { if (loc && this.changedArr(loc, arr)) this.gl.uniform1iv(loc, arr); }
  fv3(loc, arr) { if (loc && this.changedArr(loc, arr)) this.gl.uniform3fv(loc, arr); }
  fv4(loc, arr) { if (loc && this.changedArr(loc, arr)) this.gl.uniform4fv(loc, arr); }
  m3(loc, arr) { if (loc && this.changedArr(loc, arr)) this.gl.uniformMatrix3fv(loc, false, arr); }
}
export function uniformCache(gl) {
  return new UniformCache(gl);
}

// One cache per context, shared by every file that draws on it (a program's uniforms are set only through it).
const PER_CONTEXT = new WeakMap();
export function ucOf(gl) {
  let c = PER_CONTEXT.get(gl);
  if (!c) { c = uniformCache(gl); PER_CONTEXT.set(gl, c); }
  return c;
}
