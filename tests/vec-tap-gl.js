// A stand-in for src/ui/veins-gl.js in tests/vec-anatomy.js's process only (a resolve hook sends the stage's import here): it exports
// everything veins-gl does and wraps createVeinsGL so each instance's inputs are kept as the figure was given them (the binnings it was
// given, the tube attributes, the radii), for the vector renderer's compiler tests to read the real anatomy. Not a *.test.js.
import * as real from '../src/ui/veins-gl.js';
export * from '../src/ui/veins-gl.js';

const taps = (globalThis.__vecTaps ??= []);
const NS = real.N_SAMPLES;

export function createVeinsGL(canvas, opts) {
  const api = real.createVeinsGL(canvas, opts);
  if (!api) return api;
  const tap = { who: opts?.who ?? 'stage', nTubes: opts?.tubes ?? 0, bins: null, sets: [], tube: new Float32Array((opts?.tubes ?? 0) * real.TUBE_TEXELS * 4), rad: new Float32Array((opts?.tubes ?? 0) * NS), geoCount: 0 };
  taps.push(tap);
  const wrap = {
    setGeometry(bins) { tap.bins = bins; tap.geoCount++; return api.setGeometry(bins); },
    patchGeometry(bins) { tap.bins = bins; return api.patchGeometry(bins); },
    makeMorphSet(bins) { const S = api.makeMorphSet(bins); tap.sets.push({ bins, S }); return S; },
    setTubes(data) { tap.tube.set(data.length > tap.tube.length ? data.subarray(0, tap.tube.length) : data); return api.setTubes(data); },
    setRadii(row, r, along) {
      if (row >= 0 && row < tap.nTubes) for (let i = 0; i < NS; i++) tap.rad[row * NS + i] = r[i];
      if (tap.radLog) tap.radLog.push({ row, r: Float32Array.from(r.subarray ? r.subarray(0, NS) : r) });   // (a test turns the log on by setting tap.radLog = []: every width easing, in order)
      return api.setRadii(row, r, along);
    },
  };
  return new Proxy(api, {
    get(target, k) { if (Object.hasOwn(wrap, k)) return wrap[k]; const v = Reflect.get(target, k); return typeof v === 'function' ? v.bind(target) : v; },
    set(target, k, v) { target[k] = v; return true; },
  });
}
