// Boxes for the anatomy's home framing (stage.js defaultVT): a part cut to its clip path's box, and a box carried
// through an affine matrix { a, b, c, d, e, f } (the group's transform). Pure, so the tests can check them.
export function clipBox(b, k) {
  const x0 = Math.max(b.x, k.x), y0 = Math.max(b.y, k.y);
  const x1 = Math.min(b.x + b.width, k.x + k.width), y1 = Math.min(b.y + b.height, k.y + k.height);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
}
export function mapBox(b, m) {
  const xs = [], ys = [];
  for (const [x, y] of [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]) {
    xs.push(m.a * x + m.c * y + m.e); ys.push(m.b * x + m.d * y + m.f);
  }
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  return { x: x0, y: y0, width: Math.max(...xs) - x0, height: Math.max(...ys) - y0 };
}
