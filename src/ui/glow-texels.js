// The hover texel of one vessel row in the tube data (o + 39; veins-gl.js reads it), written the same way by the whole vessel sync and by the
// glow-only sync (stage.js syncGlowOnly). While a hover or selection eases, only this texel changes from frame to frame, so the glow-only sync
// rewrites it alone and leaves every other texel as the last whole sync wrote it.
//
// No vessel takes a glow or a halo (owner, 13 Nov 2026: "remove it", "it's disgusting"), so the row's glow texels o + 40 … o + 47 are always zero. They
// were written from the glow engine's eased sources until 15 Nov 2026 (app review R1-7; the engine, its program and its passes are gone with the classic
// renderer). The slots stay in the row (its layout is the shaders'), zero.

/**
 * T: the tube data; o: the row's first float; kind: 'v' (vessel) or 's' (strand), other kinds have no hover texel;
 * id / raId: the vessel and, on the cava drawn as one, its upper stretch; hov: the hover amounts by vessel; ease: the stage's easeInOut.
 */
export function writeGlowTexels(T, o, kind, id, raId, hov, ease) {
  if (kind !== 'v' && kind !== 's') return;
  const h = Math.max(hov.get(id) || 0, raId ? hov.get(raId) || 0 : 0);
  T[o + 39] = h ? ease(h) : 0;
  T.fill(0, o + 40, o + 48);
}
