// The liver's surface: its outline sampled from the artwork and the sites of the regenerative nodules. Both follow
// from the artwork alone, so they are computed ahead (scripts/liver-geo.mjs writes liver-geo-data.js) rather than on
// every load, which spent most of a second (several on a phone) before the figure appeared. If the outline in
// anatomy.js changes, its hash no longer matches and the stage computes them live until the data is regenerated.

// A seeded random stream, so the surface is the same on every load.
export const seeded = (seed) => () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

/** A short hash of a string (FNV-1a, hex): ties the stored geometry to the outline it was made from. */
export function strHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

// Spacing of the grid the sites are bucketed in.
const G = 13;
// The nodules' size (organ picks, 20 Oct: "a little bit larger cells"): every site's spacing scaled by it. Changing it
// changes the sites: run scripts/liver-geo.mjs again.
export const NODULE_SIZE = 1.4;
// Regenerative nodules as a packing of irregular polygons (a Voronoi diagram of dart-thrown
// sites, each with its own random spacing, so nodule sizes mix evenly over the whole
// liver). These are the sites, [[x, y]], inside (or just outside) the outline.
export function nodularSites(outline) {
  // Even-odd test, with the outline's edges bucketed into horizontal bands so each test walks only
  // the few edges that span its row (the same edges and arithmetic as a full walk, so the same answer).
  // A full walk per test froze the first load for seconds.
  const BAND = 4, bands = new Map();
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const yi = outline[i][1], yj = outline[j][1];
    for (let b = Math.floor(Math.min(yi, yj) / BAND), e = Math.floor(Math.max(yi, yj) / BAND); b <= e; b++) {
      if (bands.has(b)) bands.get(b).push(i, j); else bands.set(b, [i, j]);
    }
  }
  const r = seeded(53), inside = (x, y) => {
    let w = false;
    const es = bands.get(Math.floor(y / BAND));
    if (!es) return false;
    for (let k = 0; k < es.length; k += 2) {
      const [xi, yi] = outline[es[k]], [xj, yj] = outline[es[k + 1]];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) w = !w;
    }
    return w;
  };
  const near = (x, y) => inside(x, y) || inside(x + 10, y) || inside(x - 10, y) || inside(x, y + 10) || inside(x, y - 10);
  // Dart throwing, with a grid of accepted sites so each try checks only its neighbours.
  const sites = [], grid = new Map();
  for (let k = 0; k < 160000 && sites.length < 4600; k++) {
    const x = 290 + 620 * r(), y = 150 + 390 * r(), d = (5 + 4.5 * r()) * NODULE_SIZE;
    const gx = Math.floor(x / G), gy = Math.floor(y / G);
    let ok = true;
    for (let i = -1; i <= 1 && ok; i++) for (let j = -1; j <= 1 && ok; j++) {
      for (const [sx, sy, sd] of grid.get((gx + i) * 1000 + gy + j) || []) if (Math.hypot(sx - x, sy - y) <= (d + sd) / 2) { ok = false; break; }
    }
    if (!ok || !near(x, y)) continue;
    const site = [x, y, d], key = gx * 1000 + gy;
    sites.push(site);
    if (grid.has(key)) grid.get(key).push(site); else grid.set(key, [site]);
  }
  return sites.map(([x, y]) => [x, y]);
}

/** The nodules' cells (a Voronoi diagram of the sites, [[x, y]]): each keeps its site and its corners. */
export function nodularCells(sites) {
  const grid = new Map();
  for (const site of sites) { const key = Math.floor(site[0] / G) * 1000 + Math.floor(site[1] / G); if (grid.has(key)) grid.get(key).push(site); else grid.set(key, [site]); }
  return sites.map(([x, y], i) => {
    let poly = [[x - 20, y - 20], [x + 20, y - 20], [x + 20, y + 20], [x - 20, y + 20]];
    const gx = Math.floor(x / G), gy = Math.floor(y / G), nb = [];
    for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) for (const o of grid.get((gx + a) * 1000 + gy + b) || []) if (o !== sites[i]) nb.push(o);
    for (const [ox, oy] of nb) {
      const dx = ox - x, dy = oy - y;
      if (dx * dx + dy * dy > 28 * 28) continue;
      const mx = (x + ox) / 2, my = (y + oy) / 2, side = (q) => (q[0] - mx) * dx + (q[1] - my) * dy, nxt = [];
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k], b = poly[(k + 1) % poly.length], sa = side(a), sb = side(b);
        if (sa <= 0) nxt.push(a);
        if ((sa <= 0) !== (sb <= 0)) { const t = sa / (sa - sb); nxt.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
      }
      poly = nxt;
    }
    const v = poly.filter((q, k) => Math.hypot(q[0] - poly[(k + 1) % poly.length][0], q[1] - poly[(k + 1) % poly.length][1]) > 1.5);
    return { x, y, v };
  }).filter((cl) => cl.v.length >= 3);
}
