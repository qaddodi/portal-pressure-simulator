// Which stretches of a lit pile's loop edges can be seen (stage.js, the warm layer): a loop's edge glows only where no loop
// drawn over it lies on it and it is inside the organ's own outline. The pile is drawn in short pieces in order (organ-art.mjs
// pileArt: later tubes over earlier ones, and in a tube each later piece over the ones before), so a piece's edge is hidden
// by any later piece whose tube covers it. Worked out once per drawing, in the drawing's own coordinates (a transform moves
// the edges and what covers them alike), so a build costs one look-up per point.

// A grid of the area inside rings (even-odd, filled by scanlines), and its look-up.
export function ringGrid(rings, cell = 3) {
  const all = rings.flat();
  if (!all.length) return null;
  const x0 = Math.min(...all.map((q) => q[0])), y0 = Math.min(...all.map((q) => q[1]));
  const w = Math.ceil((Math.max(...all.map((q) => q[0])) - x0) / cell) + 1, h = Math.ceil((Math.max(...all.map((q) => q[1])) - y0) / cell) + 1;
  const bits = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    const y = y0 + (j + 0.5) * cell, xs = [];
    for (const r of rings) for (let i = 0, k = r.length - 1; i < r.length; k = i++) if ((r[i][1] > y) !== (r[k][1] > y)) xs.push(r[i][0] + (y - r[i][1]) * (r[k][0] - r[i][0]) / (r[k][1] - r[i][1]));
    xs.sort((u, v) => u - v);
    for (let m = 0; m + 1 < xs.length; m += 2) for (let i = Math.max(0, Math.ceil((xs[m] - x0) / cell - 0.5)); i <= Math.min(w - 1, Math.floor((xs[m + 1] - x0) / cell - 0.5)); i++) bits[j * w + i] = 1;
  }
  return { x0, y0, w, h, cell, bits };
}
export const inGrid = (g, x, y) => {
  const i = Math.floor((x - g.x0) / g.cell), j = Math.floor((y - g.y0) / g.cell);
  return i >= 0 && j >= 0 && i < g.w && j < g.h && g.bits[j * g.w + i] === 1;
};

// tubes: each tube's centre line ([x, y] points), in drawing order; rad: the tubes' half width; piece: the length of each drawn
// piece; inside(x, y): in the organ's outline (or null). Returns, per tube, a Uint8Array of 2 per point (side -1, then side 1,
// as stage.js lays the edge: the centre moved rad along the normal (-ty, tx) times the side), 1 where that edge can be seen.
// A piece of the same tube within `near` of the point along it is not counted as lying over it: on a bend the tube's own
// next stretch would otherwise swallow its inner edge, which the glow's own bend rule handles.
export function warmVisible(tubes, rad, { piece = 36, inside = null, near = 3 } = {}) {
  const C = Math.max(4, rad), cells = new Map(), key = (i, j) => (i + 4096) * 16384 + (j + 4096);
  const arc = tubes.map((r) => { const s = [0]; for (let k = 1; k < r.length; k++) s.push(s[k - 1] + Math.hypot(r[k][0] - r[k - 1][0], r[k][1] - r[k - 1][1])); return s; });
  const order = (t, k) => t * 1e6 + Math.floor(arc[t][k] / piece);
  tubes.forEach((r, t) => r.forEach((p, k) => {
    const c = key(Math.floor(p[0] / C), Math.floor(p[1] / C));
    let l = cells.get(c); if (!l) cells.set(c, (l = [])); l.push(t, k);
  }));
  const cover = rad * 0.95, cover2 = cover * cover, nearL = near * rad;
  return tubes.map((r, t) => {
    const n = r.length, vis = new Uint8Array(n * 2);
    for (let k = 0; k < n; k++) {
      const pa = r[Math.max(0, k - 1)], pb = r[Math.min(n - 1, k + 1)];
      let tx = pb[0] - pa[0], ty = pb[1] - pa[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const ok = order(t, k);
      for (let si = 0; si < 2; si++) {
        const side = si ? 1 : -1, ex = r[k][0] - ty * rad * side, ey = r[k][1] + tx * rad * side;
        let seen = !inside || inside(ex, ey);
        const ci = Math.floor(ex / C), cj = Math.floor(ey / C);
        for (let di = -1; seen && di <= 1; di++) for (let dj = -1; seen && dj <= 1; dj++) {
          const l2 = cells.get(key(ci + di, cj + dj));
          if (l2) for (let m = 0; m < l2.length; m += 2) {
            const u = l2[m], j = l2[m + 1];
            if (order(u, j) <= ok || (u === t && Math.abs(arc[t][j] - arc[t][k]) < nearL)) continue;
            const q = tubes[u][j], dx = q[0] - ex, dy = q[1] - ey;
            if (dx * dx + dy * dy < cover2) { seen = false; break; }
          }
        }
        vis[2 * k + si] = seen ? 1 : 0;
      }
    }
    return vis;
  });
}
