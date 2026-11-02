// A uniform is sent to the GPU only when its value is not the one its program already holds (laptop-heat quick item Q2, 31 Oct 2026).
// In Safari every gl.* call is a message to the GPU process, and the figure's composite set about fifty uniforms on every frame the blood
// moved, nearly all of them the same numbers as the frame before (the view, the plates, the colours; only the clock changes). A program
// keeps its uniforms until it is linked again, so a call that would set the value it already holds changes nothing on the screen.
//
// The cache is keyed by the uniform's location object, which belongs to one program, and made for one context (a lost context makes
// new programs and new locations). It must be the only way the uniforms it handles are set: anything else that sets one of them on the
// same program would leave the cache believing in a value that is no longer there (veins-gl.js sets these names nowhere else; its
// test pins that).

// `on: false` (?ucache=0 in the address) sends every uniform as before. reset() forgets what every location holds: call it when the context
// is lost or restored (the new programs hold their defaults, not the values this cache last sent).
// Every per-frame draw that uses the cache reads the same ?ucache=0 switch (the figure's composite in veins-gl.js has its own copy).
export const UCACHE_ON = !(typeof location !== 'undefined' && /[?&]ucache=0\b/.test(location.search));

export function uniformCache(gl, { on = UCACHE_ON } = {}) {
  let last = new WeakMap();
  // True when `loc` is not already holding these n numbers (and records them as now held).
  function changed(loc, n, a, b, c, d) {
    if (typeof loc !== 'object') return true;   // (not a real location: send it)
    let s = last.get(loc);
    if (!s) { s = { n: -1, v: new Float64Array(4) }; last.set(loc, s); }
    const v = s.v;
    if (!on) return true;
    if (s.n === n && v[0] === a && (n < 2 || v[1] === b) && (n < 3 || v[2] === c) && (n < 4 || v[3] === d)) return false;
    s.n = n; v[0] = a;
    if (n > 1) v[1] = b;
    if (n > 2) v[2] = c;
    if (n > 3) v[3] = d;
    return true;
  }
  // The same for an array uniform (uniformNfv / uniformMatrixNfv): held as a copy, compared element by element.
  function changedArr(loc, arr) {
    if (typeof loc !== 'object') return true;
    let s = last.get(loc);
    if (!s || !s.arr || s.arr.length !== arr.length) { s = { arr: new Float32Array(arr.length), fresh: true }; last.set(loc, s); }
    if (!on) return true;
    const held = s.arr;
    let diff = !!s.fresh;
    for (let i = 0; i < held.length; i++) if (held[i] !== Math.fround(arr[i])) { diff = true; break; }
    if (!diff) return false;
    held.set(arr); s.fresh = false;
    return true;
  }
  return {
    reset() { last = new WeakMap(); },
    f1: (loc, a) => { if (loc && changed(loc, 1, a)) gl.uniform1f(loc, a); },
    i1: (loc, a) => { if (loc && changed(loc, 1, a)) gl.uniform1i(loc, a); },
    f2: (loc, a, b) => { if (loc && changed(loc, 2, a, b)) gl.uniform2f(loc, a, b); },
    i2: (loc, a, b) => { if (loc && changed(loc, 2, a, b)) gl.uniform2i(loc, a, b); },
    f3: (loc, a, b, c) => { if (loc && changed(loc, 3, a, b, c)) gl.uniform3f(loc, a, b, c); },
    i3: (loc, a, b, c) => { if (loc && changed(loc, 3, a, b, c)) gl.uniform3i(loc, a, b, c); },
    f4: (loc, a, b, c, d) => { if (loc && changed(loc, 4, a, b, c, d)) gl.uniform4f(loc, a, b, c, d); },
    /** From an array of 2, 3 or 4 numbers (what the callers spread into uniform2f / 3f / 4f). */
    f2a: (loc, v) => { if (loc && changed(loc, 2, v[0], v[1])) gl.uniform2f(loc, v[0], v[1]); },
    f3a: (loc, v) => { if (loc && changed(loc, 3, v[0], v[1], v[2])) gl.uniform3f(loc, v[0], v[1], v[2]); },
    f4a: (loc, v) => { if (loc && changed(loc, 4, v[0], v[1], v[2], v[3])) gl.uniform4f(loc, v[0], v[1], v[2], v[3]); },
    /** Arrays: Float32Arrays (a plain array of doubles would never compare equal to its float copy and be sent each time). */
    fv1: (loc, arr) => { if (loc && changedArr(loc, arr)) gl.uniform1fv(loc, arr); },
    iv1: (loc, arr) => { if (loc && changedArr(loc, arr)) gl.uniform1iv(loc, arr); },
    fv3: (loc, arr) => { if (loc && changedArr(loc, arr)) gl.uniform3fv(loc, arr); },
    fv4: (loc, arr) => { if (loc && changedArr(loc, arr)) gl.uniform4fv(loc, arr); },
    m3: (loc, arr) => { if (loc && changedArr(loc, arr)) gl.uniformMatrix3fv(loc, false, arr); },
  };
}

// One cache per context, shared by every file that draws on it (a program's uniforms are set only through it).
const PER_CONTEXT = new WeakMap();
export function ucOf(gl) {
  let c = PER_CONTEXT.get(gl);
  if (!c) { c = uniformCache(gl); PER_CONTEXT.set(gl, c); }
  return c;
}
