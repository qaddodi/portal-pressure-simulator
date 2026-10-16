// The hover and glow texels of one vessel row in the tube data (o + 39 … o + 47; veins-gl.js reads them), written the
// same way by the whole vessel sync and by the glow-only sync (stage.js syncGlowOnly). While a hover, selection, slide or
// Doppler glow eases, only these texels change from frame to frame, so the glow-only sync rewrites them alone and leaves
// every other texel as the last whole sync wrote it.

/**
 * T: the tube data; o: the row's first float; kind: 'v' (vessel) or 's' (strand), other kinds have no glow texels;
 * id / raId: the vessel and, on the cava drawn as one, its upper stretch; len: a strand's arc length;
 * lit: the glow engine's eased glows by vessel; hov: the hover amounts by vessel; rgb: CSS colour → [r, g, b] (0–1);
 * ease: the stage's easeInOut.
 */
export function writeGlowTexels(T, o, kind, id, raId, len, lit, hov, rgb, ease) {
  if (kind !== 'v' && kind !== 's') return;
  const h = Math.max(hov.get(id) || 0, raId ? hov.get(raId) || 0 : 0);
  T[o + 39] = h ? ease(h) : 0;
  const la = lit.get(id), lb = raId && lit.get(raId), l = la || lb;
  // A strand's glow fades out toward both its ends, where it meets its own glowing vessel: run on, it would be
  // cut off square by the strand's cells at the junction.
  const lend = kind === 's' ? [0.3 * len, 0.3 * len] : la && lb ? [la.end[0], lb.end[1]] : l?.end;
  const v = l ? ease(Math.max(0, l.v)) * l.amt : 0;
  if (v > 0) {
    if (l.col) { const c = rgb(l.col); l.rgb = l.from && l.cu < 1 ? mix3(l.from, c, ease(l.cu)) : c; }
    // (A stretch is sent as its two ends along the vessel, each as −(1 + u): the shader fades the glow in and out there.)
    const part = kind === 'v' && la && la.span && (la.span[0] > 0.002 || la.span[1] < 0.998);
    const c = l.col ? l.rgb : ZERO;
    T[o + 40] = c[0]; T[o + 41] = c[1]; T[o + 42] = c[2]; T[o + 43] = v;
    T[o + 44] = part ? -1 - la.span[0] : lend[0]; T[o + 45] = part ? -1 - la.span[1] : lend[1];
    T[o + 46] = l.col ? 0 : 1; T[o + 47] = l.wide + (l.top ? 10 : 0);
  } else T.fill(0, o + 40, o + 48);
}
const ZERO = [0, 0, 0];
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
