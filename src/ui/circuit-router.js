// Circuit view: routes a learner-made (custom) shunt as a transit-map line. The course runs only
// horizontally, vertically or at 45°, never along another line (a parallel course keeps a lane's
// width clear), crosses other lines square or at 45° (each crossing costs, so it takes as few as it
// can), keeps clear of stations it does not serve and of the zone captions, and turns as rarely as
// it can. The search is A* on a fine grid over (cell, heading). Pure: no DOM.

const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
// Heading class: 0 horizontal, 1 diagonal ↘, 2 vertical, 3 diagonal ↗ (a direction and its reverse share one).
const CLASS = (dx, dy) => (dy === 0 ? 0 : dx === 0 ? 2 : dx === dy ? 1 : 3);

/**
 * @param {object} o
 * @param {number[][][]} o.lines  sampled courses of the lines already drawn ([[x, y], …] each)
 * @param {number[][]} o.stations station positions [x, y] to keep clear of
 * @param {number[]} o.bounds     [x0, y0, x1, y1] the area a course may use
 * @param {number[][]} [o.keepOut] rectangles [x0, y0, x1, y1] no course may enter (captions)
 */
export function createRouter({ lines, stations, bounds, keepOut = [], step = 6, lane = 30, turn45 = 30, turn90 = 64, cross = 50, maxBends = 6 }) {
  const [X0, Y0, X1, Y1] = bounds;
  const nx = Math.ceil((X1 - X0) / step) + 1, ny = Math.ceil((Y1 - Y0) / step) + 1, NC = nx * ny;
  const near = new Uint8Array(NC);   // per heading class: a line of that class runs within a lane's width
  const on = new Uint8Array(NC);     // per heading class: a line of that class runs through this cell
  const wide = new Uint8Array(NC);   // a line's drawn width (and a margin) covers this cell
  const mine = new Uint8Array(NC);   // another custom shunt's drawn width covers this cell
  const blocked = new Uint8Array(NC);
  const cx = (i) => X0 + (i % nx) * step, cy = (i) => Y0 + Math.floor(i / nx) * step;
  const cell = (x, y) => {
    const i = Math.round((x - X0) / step), j = Math.round((y - Y0) / step);
    return i < 0 || j < 0 || i >= nx || j >= ny ? -1 : j * nx + i;
  };
  const stamp = (arr, x, y, r, bits) => {
    const i0 = Math.max(0, Math.ceil((x - r - X0) / step)), i1 = Math.min(nx - 1, Math.floor((x + r - X0) / step));
    const j0 = Math.max(0, Math.ceil((y - r - Y0) / step)), j1 = Math.min(ny - 1, Math.floor((y + r - Y0) / step));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = X0 + i * step - x, dy = Y0 + j * step - y;
      if (dx * dx + dy * dy < r * r) arr[j * nx + i] |= bits;
    }
  };
  // The heading classes a short piece of course belongs to (both neighbours when it is in between,
  // as on a rounded corner).
  const classBits = (dx, dy) => {
    let a = Math.atan2(dy, dx) * 180 / Math.PI;
    a = ((a % 180) + 180) % 180;               // 0…180, a line and its reverse alike
    let bits = 0;
    for (let k = 0; k < 4; k++) { const d = Math.abs(a - k * 45); if (Math.min(d, 180 - d) < 30) bits |= 1 << k; }
    return bits;
  };
  function addLine(pts, custom = false) {
    for (let m = 1; m < pts.length; m++) {
      const [ax, ay] = pts[m - 1], [bx, by] = pts[m], L = Math.hypot(bx - ax, by - ay);
      if (L < 1e-6) continue;
      const bits = classBits(bx - ax, by - ay), n = Math.ceil(L / 2);
      for (let k = 0; k <= n; k++) {
        const x = ax + ((bx - ax) * k) / n, y = ay + ((by - ay) * k) / n;
        stamp(near, x, y, lane, bits);
        stamp(on, x, y, step * 0.9, bits);
        stamp(wide, x, y, 12, 1);
        if (custom) stamp(mine, x, y, 15, 1);
      }
    }
  }
  for (const pts of lines) addLine(pts);
  for (const [x, y] of stations) stamp(blocked, x, y, 18, 1);
  for (const [a, b, c, d] of keepOut) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = X0 + i * step, y = Y0 + j * step;
    if (x >= a && x <= c && y >= b && y <= d) blocked[j * nx + i] = 1;
  }

  /** The course from p to q as corner points (orthogonal / 45° runs), or null if none is found. */
  // A station whose sides are all taken is reached by a course that may run close beside other lines
  // near it (a wider end zone), and failing that anywhere, at a price for every step alongside one.
  let bufs = null;
  function route(p, q) { return search(p, q, false, 42) || search(p, q, false, 90) || search(p, q, true, 42); }
  function search(p, q, relaxed, endR) {
    const s0 = cell(p[0], p[1]), g0 = cell(q[0], q[1]);
    if (s0 < 0 || g0 < 0) return null;
    const gx = cx(g0), gy = cy(g0);
    // Near either end, lines converge on the station: there a course may run close to them, but
    // never right along one (within 10 units of the station itself anything goes).
    const zone = new Uint8Array(NC);
    for (let c = 0; c < NC; c++) {
      const x = cx(c), y = cy(c), d = Math.min(Math.hypot(x - p[0], y - p[1]), Math.hypot(x - q[0], y - q[1]));
      zone[c] = d < 10 ? 3 : d < 22 ? 2 : d < endR ? 1 : 0;
    }
    const B = maxBends + 1, NS = NC * 8 * B;
    if (!bufs || bufs.gC.length !== NS) bufs = { gC: new Float32Array(NS), from: new Int32Array(NS), hf: new Float32Array(1 << 16), hs: new Int32Array(1 << 16) };
    const { gC, from } = bufs;
    gC.fill(Infinity); from.fill(-1);
    // Binary heap of (f, state) in typed arrays, grown as needed.
    let hf = bufs.hf, hs = bufs.hs, hn = 0;
    const push = (f, st) => {
      if (hn === hf.length) { const a = new Float32Array(hn * 2), b = new Int32Array(hn * 2); a.set(hf); b.set(hs); bufs.hf = hf = a; bufs.hs = hs = b; }
      let i = hn++;
      while (i > 0) { const pa = (i - 1) >> 1; if (hf[pa] <= f) break; hf[i] = hf[pa]; hs[i] = hs[pa]; i = pa; }
      hf[i] = f; hs[i] = st;
    };
    let popF = 0;
    const pop = () => {
      const st = hs[0]; popF = hf[0];
      const lf = hf[--hn], ls = hs[hn];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= hn) break;
        const m = l + 1 < hn && hf[l + 1] < hf[l] ? l + 1 : l;
        if (hf[m] >= lf) break;
        hf[i] = hf[m]; hs[i] = hs[m]; i = m;
      }
      hf[i] = lf; hs[i] = ls;
      return st;
    };
    const h = (i) => { const dx = Math.abs(cx(i) - gx), dy = Math.abs(cy(i) - gy); return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy); };
    for (let d = 0; d < 8; d++) { gC[s0 * 8 * B + d * B] = 0; push(h(s0), s0 * 8 * B + d * B); }
    let goal = -1;
    while (hn) {
      const st = pop(), f = popF;
      const c = (st / (8 * B)) | 0, d = ((st / B) | 0) % 8, nb = st % B, gc = gC[st];
      if (f - h(c) > gc + 1e-3) continue;
      if (c === g0) { goal = st; break; }
      const i = c % nx, j = (c / nx) | 0;
      for (const t of [-2, -1, 0, 1, 2]) {
        if (t !== 0 && (nb === maxBends || c === s0)) continue;   // few turns; the first heading is free
        const nd = (d + t + 8) % 8, [dx, dy] = DIRS[nd];
        const ni = i + dx, nj = j + dy;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
        const nc = nj * nx + ni, z = zone[nc];
        if (blocked[nc] && z < 2) continue;
        const k = 1 << CLASS(dx, dy);
        if (z === 0 && ((relaxed ? on : near)[nc] & k)) continue;   // would run alongside another line
        const beside = relaxed && z === 0 && (near[nc] & k) ? 30 : 0;
        // A slant only in open ground: lines are crossed square, never at 45°.
        if (z === 0 && (k & 10) && near[nc]) continue;
        if (z === 0 && !relaxed && mine[nc] && !mine[c]) continue;   // never across another custom shunt (unless there is no other way)
        // Turns only clear of other lines (a crossing goes straight over, never bends on one).
        if (t !== 0 && z === 0 && wide[c]) continue;
        if ((z === 1 || z === 2) && (on[nc] & k)) continue;   // would run right along one
        let cost = beside + Math.hypot(dx, dy) * step + (t === 0 ? 0 : Math.abs(t) === 1 ? turn45 : turn90);
        // Entering another line's course (a crossing); entering a parallel band from inside the
        // end zone is free. Crossing at 45° costs more than crossing square.
        if (z === 0 && on[nc] && !on[c]) cost += (on[nc] & (1 << ((CLASS(dx, dy) + 2) % 4))) ? cross : cross * 1.6;
        const ns = (nc * 8 + nd) * B + nb + (t !== 0 ? 1 : 0), ng = gc + cost;
        if (ng < gC[ns]) { gC[ns] = ng; from[ns] = st; push(ng + h(nc), ns); }
      }
    }
    if (goal < 0) return null;
    const cells = [];
    for (let st = goal; st >= 0; st = from[st]) cells.push((st / (8 * B)) | 0);
    cells.reverse();
    // Corners only, then exact ends (the snap to the grid is under the station's dot).
    const pts = [[cx(cells[0]), cy(cells[0])]];
    for (let m = 1; m < cells.length - 1; m++) {
      const a = cells[m - 1], b = cells[m], c = cells[m + 1];
      if ((cx(b) - cx(a)) !== (cx(c) - cx(b)) || (cy(b) - cy(a)) !== (cy(c) - cy(b))) pts.push([cx(b), cy(b)]);
    }
    pts.push([cx(g0), cy(g0)]);
    pts[0] = [p[0], p[1]];
    pts[pts.length - 1] = [q[0], q[1]];
    return pts.length === 2 ? pts : pts.filter((pt, m) => m === 0 || Math.hypot(pt[0] - pts[m - 1][0], pt[1] - pts[m - 1][1]) > 0.5);
  }
  return { route, addLine };
}
