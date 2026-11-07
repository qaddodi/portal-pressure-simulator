// The world box an organ paints, for the boxes of its layers on the GPU (stage.js layerBoxes). (The SVG copy of the organs this
// file once trimmed for the browser to rasterize is gone: every organ is painted on the GPU from its own shapes.)

/** The world box a shape paints: its geometry box [x, y, w, h] through the matrix m ({a..f}, to the world), grown by the
 *  most its stroke can reach (a miter at the default limit of 4 reaches twice the stroke width past the outline) and a
 *  margin, all in world units. */
export function paintBox(bb, m, sw, pad = 6) {
  const xs = [], ys = [];
  for (const [x, y] of [[bb.x, bb.y], [bb.x + bb.width, bb.y], [bb.x, bb.y + bb.height], [bb.x + bb.width, bb.y + bb.height]]) {
    xs.push(m.a * x + m.c * y + m.e); ys.push(m.b * x + m.d * y + m.f);
  }
  const k = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1, g = (2 * (sw || 0) + 2) * k + pad;
  return [Math.min(...xs) - g, Math.min(...ys) - g, Math.max(...xs) + g, Math.max(...ys) + g];
}
