// Where the four varix columns run in the scope's field (endo-gl.js shades them; endo-bleed.js puts a tear on one). Each is an
// angle round the lumen (radians, clockwise from the right, the picture's y down) that wanders with the depth z along the tube:
// the same seeded constants and the same two sines as the shader's centreOf, so a mark placed here lies on the drawn column.
export const NCOL = 4, TAU = Math.PI * 2;
/** The depth a picture radius rho (0..1 of the lumen) shows: the field's z = 1 / (rho * T). */
export const FIELD_T = 1.55;
export const depthAt = (rho) => 1 / (Math.max(rho, 0.01) * FIELD_T);

// Per-column constants, in the same order the CPU renderer draws them from its seeded generator.
export function columnConsts() {
  let x = 7 >>> 0;
  const r = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
  const c0 = [], c1 = [];
  for (let c = 0; c < NCOL; c++) {
    const a0 = (c / NCOL) * TAU + 0.5 + (r() - 0.5) * 0.5;
    const ph = r() * 6.28, ph2 = r() * 6.28, ph3 = r() * 6.28;
    const f1 = 1.15 + r() * 0.5, f2 = 2.6 + r() * 0.8, wj = (r() - 0.5) * 0.015;
    c0.push(a0, ph, ph2, ph3); c1.push(f1, f2, wj, 0);
  }
  return { c0, c1 };
}
const K = columnConsts();

/** Column c's angle at depth z, for an engorgement grow (0..1) and a deflation df (0 engorged .. 1 strangulated). */
export function columnAngle(c, z, grow, df = 0) {
  const k0 = K.c0.slice(c * 4, c * 4 + 4), k1 = K.c1.slice(c * 4, c * 4 + 4);
  const A1 = (0.025 + 0.3 * grow) * (1 - 0.55 * df), A2 = A1 * 0.45;
  return k0[0] + A1 * Math.sin(k1[0] * z + k0[1]) + A2 * Math.sin(k1[1] * z + k0[2]);
}
