// Whether the look handed to the vessels' painter changed since the sync that last drew it (stage.js syncVeinsNow): every number the
// look holds, read into one kept list and compared with the last one's, so no text is made of it each sync (it was a JSON string of the
// whole look, fluid left out). tests/look-signature.test.js walks the real look and changes each number in turn: a field added to the look
// that is not read here fails it.

/** The kept state of one stage's signature. */
export const newLookSig = () => ({ now: new Float64Array(256), prev: new Float64Array(256), n: -1 });   // alloc-rare: made once for the stage

/** True when any number of the look (or whether the plate is on) differs from the last call's. `plateIsOn`: the plate class. */
export function lookChanged(v, plateIsOn, sig) {
  const A = sig.now;
  let n = 0;
  A[n++] = v.shOff[0]; A[n++] = v.shOff[1];
  for (let i = 0; i < v.light.length; i++) A[n++] = v.light[i];
  A[n++] = v.reach; A[n++] = v.organs; A[n++] = v.netAlpha; A[n++] = v.fx ? 1 : 0;
  for (let i = 0; i < 4; i++) { A[n++] = v.casing[i]; A[n++] = v.shadow[i]; A[n++] = v.sheen[i]; A[n++] = v.shade[i]; A[n++] = v.ring[i]; }
  for (let i = 0; i < v.tierAlpha.length; i++) A[n++] = v.tierAlpha[i];
  for (let i = 0; i < v.tierGroup.length; i++) A[n++] = v.tierGroup[i];
  const m = v.map;
  A[n++] = m.a; A[n++] = m.fxOn ? 1 : 0; A[n++] = m.fxU;
  for (let i = 0; i < 4; i++) { A[n++] = m.dot[i]; A[n++] = m.zone[i]; A[n++] = m.fx[i]; A[n++] = m.alt[i]; A[n++] = m.rot[i]; }
  A[n++] = m.fxX[0]; A[n++] = m.fxX[1]; A[n++] = m.fxCol[0]; A[n++] = m.fxCol[1]; A[n++] = m.fxCol[2];
  const pl = v.plate;
  A[n++] = pl ? 1 : 0; A[n++] = pl ? pl.alpha : 0; A[n++] = pl ? pl.sat : 0; A[n++] = pl && pl.stack ? 1 : 0; A[n++] = plateIsOn ? 1 : 0;
  const P = sig.prev;
  let differs = n !== sig.n;
  for (let i = 0; i < n; i++) { const a = A[i], b = P[i]; if (a !== b && !(a !== a && b !== b)) differs = true; P[i] = a; }
  sig.n = n;
  return differs;
}
