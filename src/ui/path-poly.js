// An SVG path as polygons (1 Nov 2026, Mohammad: no canvas 2D anywhere). The glass's masks (a callout's outline with its pointer, the
// liver pane's rounded box) were drawn by a 2D canvas from the path and uploaded; they are now filled on the GPU from these polygons
// (glass-gl fillMask). Every command of the SVG path grammar: M L H V C S Q T A Z, absolute and relative; curves and arcs cut into
// segments no longer than about `tol` CSS px off the curve.

const TAU = Math.PI * 2;

/** The path `d` as closed polygons: [[x0, y0, x1, y1, ...], ...] (CSS px). A subpath of fewer than three points is dropped. */
export function pathPolys(d, tol = 0.2) {
  const out = [];   // alloc-rare: runs only when a glass mask is rebuilt (glass-gl maskOf: only when the outline or its size changes), never in a steady frame
  const toks = String(d || '').match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];   // alloc-rare: same: only when a glass mask is rebuilt
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, cx = 0, cy = 0, qx = 0, qy = 0, pts = null, last = '';
  const num = () => +toks[i++];   // alloc-rare: same: only when a glass mask is rebuilt
  const more = () => i < toks.length && !/^[A-Za-z]$/.test(toks[i]);   // alloc-rare: same: only when a glass mask is rebuilt
  const flush = () => { if (pts && pts.length >= 6) out.push(pts); pts = null; };   // alloc-rare: same: only when a glass mask is rebuilt
  const put = (px, py) => { if (!pts) pts = [x, y]; pts.push(px, py); x = px; y = py; };   // alloc-rare: same: only when a glass mask is rebuilt
  const steps = (len) => Math.max(1, Math.min(64, Math.ceil(Math.sqrt(len / Math.max(0.01, tol)))));   // alloc-rare: same: only when a glass mask is rebuilt
  const cubic = (x1, y1, x2, y2, x3, y3) => {   // alloc-rare: same: only when a glass mask is rebuilt
    const x0 = x, y0 = y, n = steps(Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(x3 - x2, y3 - y2));
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, e = t * t * t;
      put(a * x0 + b * x1 + c * x2 + e * x3, a * y0 + b * y1 + c * y2 + e * y3);
    }
  };
  const quad = (x1, y1, x2, y2) => {   // alloc-rare: same: only when a glass mask is rebuilt
    const x0 = x, y0 = y, n = steps(Math.hypot(x1 - x0, y1 - y0) + Math.hypot(x2 - x1, y2 - y1));
    for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; put(u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2); }
  };
  // (SVG's arc from its endpoints to its centre: the implementation notes of SVG 1.1, F.6.5.)
  const arc = (rx, ry, rot, large, sweep, x2, y2) => {   // alloc-rare: same: only when a glass mask is rebuilt
    const x1 = x, y1 = y;
    if (x1 === x2 && y1 === y2) return;
    rx = Math.abs(rx); ry = Math.abs(ry);
    if (!rx || !ry) { put(x2, y2); return; }
    const phi = (rot * Math.PI) / 180, cs = Math.cos(phi), sn = Math.sin(phi);
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, xp = cs * dx + sn * dy, yp = -sn * dx + cs * dy;
    const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
    if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
    const num2 = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp, den = rx * rx * yp * yp + ry * ry * xp * xp;
    let co = Math.sqrt(Math.max(0, num2 / den));
    if (!!large === !!sweep) co = -co;
    const cxp = (co * rx * yp) / ry, cyp = (-co * ry * xp) / rx;
    const ccx = cs * cxp - sn * cyp + (x1 + x2) / 2, ccy = sn * cxp + cs * cyp + (y1 + y2) / 2;
    const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);   // alloc-rare: same: only when a glass mask is rebuilt
    const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
    let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
    if (!sweep && dt > 0) dt -= TAU; else if (sweep && dt < 0) dt += TAU;
    const n = steps(Math.abs(dt) * Math.max(rx, ry));
    for (let k = 1; k <= n; k++) {
      const t = t1 + (dt * k) / n, ex = rx * Math.cos(t), ey = ry * Math.sin(t);
      if (k === n) put(x2, y2); else put(cs * ex - sn * ey + ccx, sn * ex + cs * ey + ccy);
    }
  };
  while (i < toks.length) {
    if (/^[A-Za-z]$/.test(toks[i])) cmd = toks[i++];
    else if (!cmd) { i++; continue; }
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? x : 0, oy = rel ? y : 0;   // alloc-rare: same: only when a glass mask is rebuilt
    if (C === 'Z') { if (pts) { x = sx; y = sy; } flush(); last = 'Z'; continue; }
    if (!more()) continue;   // (a command with no numbers: the next is a command)
    if (C === 'M') {
      flush();
      x = num() + ox; y = num() + oy; sx = x; sy = y; pts = [x, y];   // alloc-rare: same: only when a glass mask is rebuilt
      cmd = rel ? 'l' : 'L'; last = 'M'; continue;
    }
    if (C === 'L') put(num() + ox, num() + oy);
    else if (C === 'H') put(num() + ox, y);
    else if (C === 'V') put(x, num() + oy);
    else if (C === 'C') {
      const x1 = num() + ox, y1 = num() + oy, x2 = num() + ox, y2 = num() + oy, x3 = num() + ox, y3 = num() + oy;
      cubic(x1, y1, x2, y2, x3, y3); cx = x2; cy = y2;
    } else if (C === 'S') {
      const x1 = /[CS]/.test(last) ? 2 * x - cx : x, y1 = /[CS]/.test(last) ? 2 * y - cy : y;
      const x2 = num() + ox, y2 = num() + oy, x3 = num() + ox, y3 = num() + oy;
      cubic(x1, y1, x2, y2, x3, y3); cx = x2; cy = y2;
    } else if (C === 'Q') {
      const x1 = num() + ox, y1 = num() + oy, x2 = num() + ox, y2 = num() + oy;
      quad(x1, y1, x2, y2); qx = x1; qy = y1;
    } else if (C === 'T') {
      const x1 = /[QT]/.test(last) ? 2 * x - qx : x, y1 = /[QT]/.test(last) ? 2 * y - qy : y;
      quad(x1, y1, num() + ox, num() + oy); qx = x1; qy = y1;
    } else if (C === 'A') {
      const rx = num(), ry = num(), rot = num(), large = num(), sweep = num(), x2 = num() + ox, y2 = num() + oy;
      arc(rx, ry, rot, large, sweep, x2, y2);
    } else { i++; continue; }
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];   // alloc-rare: same: only when a glass mask is rebuilt
    last = C;
  }
  flush();
  return out;
}

/** The polygons as a triangle fan from each one's first point, scaled by k ([x, y, ...] for TRIANGLES). Filled with a blend that turns
 *  each pixel over once per triangle covering it (even-odd), the fans give the polygons' exact inside, whatever their winding. */
export function fanTriangles(polys, k = 1) {
  let n = 0;
  for (const p of polys) n += Math.max(0, p.length / 2 - 2) * 6;
  const out = new Float32Array(n);   // alloc-rare: same: only when a glass mask is rebuilt (the fan is uploaded once for the mask)
  let o = 0;
  for (const p of polys) {
    for (let j = 2; j + 3 < p.length; j += 2) {
      out[o++] = p[0] * k; out[o++] = p[1] * k;
      out[o++] = p[j] * k; out[o++] = p[j + 1] * k;
      out[o++] = p[j + 2] * k; out[o++] = p[j + 3] * k;
    }
  }
  return out;
}
