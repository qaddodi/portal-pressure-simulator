// Boxes for the anatomy's home framing (stage.js defaultVT): a part cut to its clip path's box, and a box carried
// through an affine matrix { a, b, c, d, e, f } (the group's transform). Pure, so the tests can check them.
export function clipBox(b, k) {
  const x0 = Math.max(b.x, k.x), y0 = Math.max(b.y, k.y);
  const x1 = Math.min(b.x + b.width, k.x + k.width), y1 = Math.min(b.y + b.height, k.y + k.height);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
}
export function mapBox(b, m) {
  const l = b.x, t = b.y, r = b.x + b.width, d = b.y + b.height;   // (the corners in the order top-left, top-right, bottom-left, bottom-right)
  const x0 = m.a * l + m.c * t + m.e, x1 = m.a * r + m.c * t + m.e, x2 = m.a * l + m.c * d + m.e, x3 = m.a * r + m.c * d + m.e;
  const y0 = m.b * l + m.d * t + m.f, y1 = m.b * r + m.d * t + m.f, y2 = m.b * l + m.d * d + m.f, y3 = m.b * r + m.d * d + m.f;
  const lo = Math.min(x0, x1, x2, x3), top = Math.min(y0, y1, y2, y3);
  return { x: lo, y: top, width: Math.max(x0, x1, x2, x3) - lo, height: Math.max(y0, y1, y2, y3) - top };
}
