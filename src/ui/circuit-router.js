// Circuit view: routes a learner-made (custom) shunt as a transit-map line. The course runs only
// horizontally, vertically or at 45°, never along another line (a parallel course keeps a lane's
// width clear), crosses other lines square or at 45° (each crossing costs, so it takes as few as it
// can), keeps clear of stations it does not serve and of the zone captions, and turns as rarely as
// it can. The search is A* on a fine grid over (cell, heading). Pure: no DOM.

// The eight headings as steps in x and in y, in order round the compass (the turns below are steps in this order).
const DIR_X = [1, 1, 0, -1, -1, -1, 0, 1], DIR_Y = [0, 1, 1, 1, 0, -1, -1, -1];
// Heading class: 0 horizontal, 1 diagonal ↘, 2 vertical, 3 diagonal ↗ (a direction and its reverse share one).
const CLASS = (dx, dy) => (dy === 0 ? 0 : dx === 0 ? 2 : dx === dy ? 1 : 3);
// The heading classes a short piece of course belongs to (both neighbours when it is in between,
// as on a rounded corner).
const classBits = (dx, dy) => {
  let a = Math.atan2(dy, dx) * 180 / Math.PI;
  a = ((a % 180) + 180) % 180;               // 0…180, a line and its reverse alike
  let bits = 0;
  for (let k = 0; k < 4; k++) { const d = Math.abs(a - k * 45); if (Math.min(d, 180 - d) < 30) bits |= 1 << k; }
  return bits;
};

// What the search works in, kept between searches (a custom shunt is routed when the learner opens one, from the stage's listener) and
// shared by every router, since a search starts by clearing what it reads: the cost to reach each (cell, heading, bends) state and the
// state it came from, the open list as a binary heap of (f, state) in two lists, and the route's cells and corners. They grow only when
// a bigger grid (or open list) asks for it.
const NONE = [];
let gC = new Float32Array(0), from = new Int32Array(0), HF = new Float32Array(1 << 16), HS = new Int32Array(1 << 16), HN = 0, POP_F = 0;
const CELLS = [], CORN = [], ROUTE = [];
function growStates(NS) {
  if (gC.length >= NS) return;
  gC = new Float32Array(NS); from = new Int32Array(NS);   // alloc-rare: pool growth, only when a bigger grid than any before asks for more states
}
function growHeap() {
  const a = new Float32Array(HN * 2), b = new Int32Array(HN * 2);   // alloc-rare: pool growth, only when the open list is full (it doubles)
  a.set(HF); b.set(HS);
  HF = a; HS = b;
}
function heapPush(f, st) {
  if (HN === HF.length) growHeap();
  let i = HN++;
  while (i > 0) { const pa = (i - 1) >> 1; if (HF[pa] <= f) break; HF[i] = HF[pa]; HS[i] = HS[pa]; i = pa; }
  HF[i] = f; HS[i] = st;
}
function heapPop() {
  const st = HS[0]; POP_F = HF[0];
  const lf = HF[--HN], ls = HS[HN];
  let i = 0;
  for (;;) {
    const l = 2 * i + 1;
    if (l >= HN) break;
    const m = l + 1 < HN && HF[l + 1] < HF[l] ? l + 1 : l;
    if (HF[m] >= lf) break;
    HF[i] = HF[m]; HS[i] = HS[m]; i = m;
  }
  HF[i] = lf; HS[i] = ls;
  return st;
}

const EMPTY = new Uint8Array(0);

/**
 * A router, kept and refilled (`reset`) rather than made anew: its grids (what is near a line, on one, wide, another custom shunt's,
 * blocked) are cleared and stamped again for each reset, and grow only when the area does.
 */
export class CircuitRouter {
  constructor() {
    this.near = EMPTY;    // per heading class: a line of that class runs within a lane's width
    this.on = EMPTY;      // per heading class: a line of that class runs through this cell
    this.wide = EMPTY;    // a line's drawn width (and a margin) covers this cell
    this.mine = EMPTY;    // another custom shunt's drawn width covers this cell
    this.blocked = EMPTY;
    this.zone = EMPTY;
    this.X0 = 0; this.Y0 = 0; this.nx = 0; this.ny = 0; this.NC = 0;
    this.step = 6; this.lane = 30; this.turn45 = 30; this.turn90 = 64; this.cross = 50; this.maxBends = 6;
  }
  /**
   * @param {object} o
   * @param {number[][][]} o.lines  sampled courses of the lines already drawn ([[x, y], …] each)
   * @param {number[][]} o.stations station positions [x, y] to keep clear of
   * @param {number[]} o.bounds     [x0, y0, x1, y1] the area a course may use
   * @param {number[][]} [o.keepOut] rectangles [x0, y0, x1, y1] no course may enter (captions)
   */
  reset({ lines, stations, bounds, keepOut = NONE, step = 6, lane = 30, turn45 = 30, turn90 = 64, cross = 50, maxBends = 6 }) {
    const X0 = this.X0 = bounds[0], Y0 = this.Y0 = bounds[1], X1 = bounds[2], Y1 = bounds[3];
    const nx = this.nx = Math.ceil((X1 - X0) / step) + 1, ny = this.ny = Math.ceil((Y1 - Y0) / step) + 1, NC = this.NC = nx * ny;
    this.step = step; this.lane = lane; this.turn45 = turn45; this.turn90 = turn90; this.cross = cross; this.maxBends = maxBends;
    if (this.near.length < NC) this.growGrids(NC);
    this.near.fill(0, 0, NC); this.on.fill(0, 0, NC); this.wide.fill(0, 0, NC); this.mine.fill(0, 0, NC); this.blocked.fill(0, 0, NC);
    for (const pts of lines) this.addLine(pts);
    for (const [x, y] of stations) this.stamp(this.blocked, x, y, 18, 1);
    for (const [a, b, c, d] of keepOut) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = X0 + i * step, y = Y0 + j * step;
      if (x >= a && x <= c && y >= b && y <= d) this.blocked[j * nx + i] = 1;
    }
    return this;
  }
  growGrids(NC) {
    this.near = new Uint8Array(NC); this.on = new Uint8Array(NC); this.wide = new Uint8Array(NC); this.mine = new Uint8Array(NC);   // alloc-rare: pool growth, only when the area is bigger than any before (reset)
    this.blocked = new Uint8Array(NC); this.zone = new Uint8Array(NC);   // alloc-rare: pool growth, only when the area is bigger than any before (reset)
  }
  cx(i) { return this.X0 + (i % this.nx) * this.step; }
  cy(i) { return this.Y0 + Math.floor(i / this.nx) * this.step; }
  cell(x, y) {
    const i = Math.round((x - this.X0) / this.step), j = Math.round((y - this.Y0) / this.step);
    return i < 0 || j < 0 || i >= this.nx || j >= this.ny ? -1 : j * this.nx + i;
  }
  stamp(arr, x, y, r, bits) {
    const { X0, Y0, step, nx, ny } = this;
    const i0 = Math.max(0, Math.ceil((x - r - X0) / step)), i1 = Math.min(nx - 1, Math.floor((x + r - X0) / step));
    const j0 = Math.max(0, Math.ceil((y - r - Y0) / step)), j1 = Math.min(ny - 1, Math.floor((y + r - Y0) / step));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = X0 + i * step - x, dy = Y0 + j * step - y;
      if (dx * dx + dy * dy < r * r) arr[j * nx + i] |= bits;
    }
  }
  addLine(pts, custom = false) {
    const { near, on, wide, mine, lane, step } = this;
    for (let m = 1; m < pts.length; m++) {
      const [ax, ay] = pts[m - 1], [bx, by] = pts[m], L = Math.hypot(bx - ax, by - ay);
      if (L < 1e-6) continue;
      const bits = classBits(bx - ax, by - ay), n = Math.ceil(L / 2);
      for (let k = 0; k <= n; k++) {
        const x = ax + ((bx - ax) * k) / n, y = ay + ((by - ay) * k) / n;
        this.stamp(near, x, y, lane, bits);
        this.stamp(on, x, y, step * 0.9, bits);
        this.stamp(wide, x, y, 12, 1);
        if (custom) this.stamp(mine, x, y, 15, 1);
      }
    }
  }
  // The distance still to go from cell i to the goal at (gx, gy): the heuristic.
  h(i, gx, gy) { const dx = Math.abs(this.cx(i) - gx), dy = Math.abs(this.cy(i) - gy); return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy); }

  /**
   * The course from p to q as corner points (orthogonal / 45° runs), written into out as x, y, x, y…; returns how many points, or -1
   * if none is found. A station whose sides are all taken is reached by a course that may run close beside other lines
   * near it (a wider end zone), and failing that anywhere, at a price for every step alongside one.
   */
  routeInto(p, q, out) {
    const n = this.search(p, q, false, 42, out);
    if (n >= 0) return n;
    const n2 = this.search(p, q, false, 90, out);
    return n2 >= 0 ? n2 : this.search(p, q, true, 42, out);
  }
  /** The course from p to q as corner points (orthogonal / 45° runs), or null if none is found (routeInto's, as a fresh list of points). */
  route(p, q) {
    const n = this.routeInto(p, q, ROUTE);
    if (n < 0) return null;
    const pts = [];   // alloc-rare: a fresh list the caller keeps, once for each custom shunt routed (stage.js routeCustomShunts routes only the shunts with no route yet)
    for (let i = 0; i < n; i++) pts.push([ROUTE[2 * i], ROUTE[2 * i + 1]]);   // alloc-rare: as above, once for each custom shunt routed
    return pts;
  }
  search(p, q, relaxed, endR, out) {
    const { nx, ny, NC, step, turn45, turn90, cross, maxBends, near, on, wide, mine, blocked, zone } = this;
    const s0 = this.cell(p[0], p[1]), g0 = this.cell(q[0], q[1]);
    if (s0 < 0 || g0 < 0) return -1;
    const gx = this.cx(g0), gy = this.cy(g0);
    // Near either end, lines converge on the station: there a course may run close to them, but
    // never right along one (within 10 units of the station itself anything goes).
    for (let c = 0; c < NC; c++) {
      const x = this.cx(c), y = this.cy(c), d = Math.min(Math.hypot(x - p[0], y - p[1]), Math.hypot(x - q[0], y - q[1]));
      zone[c] = d < 10 ? 3 : d < 22 ? 2 : d < endR ? 1 : 0;
    }
    const B = maxBends + 1, NS = NC * 8 * B;
    growStates(NS);
    gC.fill(Infinity, 0, NS); from.fill(-1, 0, NS);
    HN = 0;   // (the open list: a binary heap of (f, state) in typed arrays, grown as needed)
    for (let d = 0; d < 8; d++) { gC[s0 * 8 * B + d * B] = 0; heapPush(this.h(s0, gx, gy), s0 * 8 * B + d * B); }
    let goal = -1;
    while (HN) {
      const st = heapPop(), f = POP_F;
      const c = (st / (8 * B)) | 0, d = ((st / B) | 0) % 8, nb = st % B, gc = gC[st];
      if (f - this.h(c, gx, gy) > gc + 1e-3) continue;
      if (c === g0) { goal = st; break; }
      const i = c % nx, j = (c / nx) | 0;
      for (let ti = 0; ti < 5; ti++) {
        const t = ti - 2;   // (the turns tried, -2 … 2 eighths)
        if (t !== 0 && (nb === maxBends || c === s0)) continue;   // few turns; the first heading is free
        const nd = (d + t + 8) % 8, dx = DIR_X[nd], dy = DIR_Y[nd];
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
        if (ng < gC[ns]) { gC[ns] = ng; from[ns] = st; heapPush(ng + this.h(nc, gx, gy), ns); }
      }
    }
    if (goal < 0) return -1;
    // The cells from the start to the goal (CELLS holds them goal first).
    let cn = 0;
    for (let st = goal; st >= 0; st = from[st]) CELLS[cn++] = (st / (8 * B)) | 0;
    // Corners only, then exact ends (the snap to the grid is under the station's dot).
    let kn = 0;
    CORN[kn++] = this.cx(CELLS[cn - 1]); CORN[kn++] = this.cy(CELLS[cn - 1]);
    for (let m = 1; m < cn - 1; m++) {
      const a = CELLS[cn - m], b = CELLS[cn - 1 - m], c = CELLS[cn - 2 - m];
      if ((this.cx(b) - this.cx(a)) !== (this.cx(c) - this.cx(b)) || (this.cy(b) - this.cy(a)) !== (this.cy(c) - this.cy(b))) { CORN[kn++] = this.cx(b); CORN[kn++] = this.cy(b); }
    }
    CORN[kn++] = this.cx(g0); CORN[kn++] = this.cy(g0);
    CORN[0] = p[0]; CORN[1] = p[1];
    CORN[kn - 2] = q[0]; CORN[kn - 1] = q[1];
    const np = kn / 2;
    if (np === 2) { out[0] = CORN[0]; out[1] = CORN[1]; out[2] = CORN[2]; out[3] = CORN[3]; return 2; }
    // (A corner closer than half a unit to the one before it is left out.)
    let kept = 0;
    for (let m = 0; m < np; m++) {
      if (m === 0 || Math.hypot(CORN[2 * m] - CORN[2 * m - 2], CORN[2 * m + 1] - CORN[2 * m - 1]) > 0.5) { out[2 * kept] = CORN[2 * m]; out[2 * kept + 1] = CORN[2 * m + 1]; kept++; }
    }
    return kept;
  }
}

/** A router for the given grid (see CircuitRouter.reset): { route, addLine }. A caller that routes more than once keeps one CircuitRouter and resets it. */
export function createRouter(o) { return new CircuitRouter().reset(o); }
