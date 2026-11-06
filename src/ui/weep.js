// Lymph weeping from the liver's surface into the ascites pool on the anatomy figure (6 Nov 2026, the "midline drop" of the
// gutter-river mocks: /mnt/project-files lymph mocks, variation 2).
//
// Eight fine rivulets of amber dashes leave the liver's lower rim, join one stream that runs under the liver and turns down between
// the bowel loops, and land in the pool. The stream widens at every join. How many rivulets run follows the model's Leaked mL/day
// (what the lymphatics cannot carry, the Fluid card's "Leaked"): none while the lymphatics carry it all, all eight at about twice
// the ordinary 1,060. A thin amber sheen along the liver's lower edge shows where it starts.
//
// This file works out the picture's numbers only: a flat list of segments (each with its arc length along its path, its half width
// and its opacity at both ends), kept in one array the figure's GPU renderer reads from a texture (veins-gl.js weepAt). The renderer
// draws the dashes, per pixel, from the clock it is given: nothing is drawn or moved here per frame beyond the eased leak, the phase
// and the numbers of the segments whose opacity changes. No pulse, no splash: dashes run at a constant speed.
//
// Everything here is plain numbers (no page, no canvas), so it is tested in node (tests/weep.test.js).

/** Leaked mL a day at which the stream shows at its ordinary strength (the Fluid card's typical Leaked). */
export const WEEP_REF = 1060;
export const WEEP_LEAVES = 8;
export const WEEP_PITCH = 26, WEEP_DASH = 11;      // (world units along a path: one dash every pitch)
const LEAF_SEGS = 7, TRUNK_SEGS = [12, 8, 8];
/** The segments the figure draws: eight rivulets of LEAF_SEGS, and the stream's three curves. */
export const WEEP_N = WEEP_LEAVES * LEAF_SEGS + TRUNK_SEGS[0] + TRUNK_SEGS[1] + TRUNK_SEGS[2];
/** Rows of the segments' table: A (x0, y0, x1, y1), B (arc at its start, half width at its start and end, 0), C (opacity at its start and end, 0, 0). */
export const WEEP_ROWS = 12;
const SIZE = 0.85;                                 // (the mock's widths, a little finer on the figure)
const CELL = 16;                                   // (the figure's cell, veins-gl.js CELL)
const LIVER_C = [560, 350];                        // (the liver's scale is about this point: stage-diaphragm.js)

// (Writes v into the table at idx; true when that changed the number the table holds.)
function put(arr, idx, v) { const f = Math.fround(v); if (arr[idx] === f) return false; arr[idx] = f; return true; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** What the lymphatics cannot carry, mL a day, from a frame's metrics.ascites (hepLymph, splLymph, lymphCap in mL/min); 0 when it has none. */
export function leakedPerDay(asc) {
  if (!asc) return 0;
  const hep = +asc.hepLymph, spl = +asc.splLymph, cap = +asc.lymphCap;
  if (!Number.isFinite(hep) || !Number.isFinite(spl) || !Number.isFinite(cap)) return 0;
  return Math.max(0, hep + spl - cap) * 1440;
}

// The stream's route, in the liver's rim frame: offsets from the rim's right end (dx) and its lowest point (dy), at the rim's width
// of 290. Three curves: under the liver to the left, round the corner, and down.
const ROUTE = [
  [[25, 4], [-40, 57], [-110, 82], [-170, 97]],
  [[-170, 97], [-190, 104], [-195, 152], [-195, 222]],
];
const RIM_W = 290;

function bez(out, a, b, c, d, t) {
  const u = 1 - t;
  out[0] = u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0];
  out[1] = u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1];
}

/**
 * One stream, made once. layout(floor, scale, h, R, cols, surf) builds its geometry for a liver (its lower edge `floor`, in its own
 * frame, at `cols` columns across R = [x, y, w, h]; its scale about (560, 350)) and a pool `h` high whose surface is surf(x); it
 * returns true when anything it drew with changed. step(dt, run, visible, look) eases the leak, runs the dashes and writes the
 * renderer's numbers into `look` (wp, wb, wk: arrays of 4); it returns 0 when nothing drawn changed, 1 when the stream's table or
 * strength did (a running figure draws it again anyway; a paused one needs a repaint), 2 when the stream came or went (always repaint). `data` is the table the renderer reads (WEEP_ROWS rows of WEEP_N numbers, row-major); `dirty` says it changed.
 */
export function createWeep() {
  const N = WEEP_N;
  // The geometry (kept; layout writes into it)
  const ax = new Float64Array(N), ay = new Float64Array(N), bx = new Float64Array(N), by = new Float64Array(N);
  const sA = new Float64Array(N), sB = new Float64Array(N), sOff = new Float64Array(N);   // arc length at each end (along its own path), and the path's phase offset
  const owner = new Int8Array(N);                 // the rivulet it belongs to (0 … 7), or -1 for the stream
  const join = new Float64Array(WEEP_LEAVES);     // where each rivulet meets the stream: arc length along the stream
  const rank = new Float64Array(WEEP_LEAVES);
  const acts = new Float64Array(WEEP_LEAVES);
  const data = new Float32Array(N * WEEP_ROWS);
  const box = [0, 0, 0, 0];
  const cellSet = new Set();                      // alloc-rare: rebuilt by layout, which runs when the liver or the pool moves
  let have = false, key = '', rimY0 = 0, nCells = 0;
  const cells = [];
  const sm = { target: 0, shown: 0 };
  let phase = 0, wasOn = false, lastSig = '';   // (the leak starts at none and eases up: a new patient's stream arrives, it does not pop)
  const P0 = [0, 0], P1 = [0, 0];
  const tx = new Float64Array(TRUNK_SEGS[0] + TRUNK_SEGS[1] + TRUNK_SEGS[2] + 1), ty = new Float64Array(tx.length), ts = new Float64Array(tx.length);   // (the stream's points and arc lengths, while layout works)
  const out = { dirty: false, data, n: N, box, cells };

  const probe = (floor, scale, h, cols) => {
    // (A few of the liver's columns and its scale: the liver eases its shape without a call to layout, and the key must follow it.)
    let s = scale.toFixed(3) + '/' + h.toFixed(0);
    for (let i = 1; i < 12; i++) s += '/' + floor[Math.floor((cols - 1) * i / 12)].toFixed(0);
    return s;
  };

  function layout(floor, scale, h, R, cols, surf) {
    if (!floor || !(scale > 0)) { const was = have; have = false; key = ''; return was; }
    const k = probe(floor, scale, h, cols);
    if (have && k === key) return false;
    key = k;
    // The liver's rim in the world: x → y of its lower edge (null where the liver does not reach).
    const dx = R[2] / (cols - 1);
    let c0 = -1, c1 = -1, low = -1e9;
    for (let i = 0; i < cols; i++) if (floor[i] > -1e3) { if (c0 < 0) c0 = i; c1 = i; if (floor[i] > low) low = floor[i]; }
    if (c0 < 0 || c1 - c0 < 20) { const was = have; have = false; return was; }
    const wx = (i) => LIVER_C[0] + (R[0] + i * dx - LIVER_C[0]) * scale;
    const wy = (y) => LIVER_C[1] + (y - LIVER_C[1]) * scale;
    const xmin = wx(c0), xmax = wx(c1), yLow = wy(low), W = xmax - xmin;
    const kw = clamp(W / RIM_W, 0.6, 1.3);
    const rimAt = (x) => {
      const i = clamp(Math.round(((LIVER_C[0] + (x - LIVER_C[0]) / scale) - R[0]) / dx), c0, c1);
      return wy(floor[i]);
    };
    rimY0 = Infinity;
    for (let i = c0; i <= c1; i += 8) rimY0 = Math.min(rimY0, wy(floor[i]));
    // The stream (the route's two curves, then the drop to the pool's surface)
    const route = (r) => [xmax + r[0] * kw, yLow + r[1] * kw];
    const c = ROUTE.map((cv) => cv.map(route));
    const xd = c[1][3][0], y2 = c[1][3][1];
    const yEnd = Math.max(y2 + 60, surf(xd) + 60);
    const third = (yEnd - y2) / 3;
    c.push([[xd, y2], [xd - 1, y2 + third], [xd - 3, y2 + 2 * third], [xd - 3, yEnd]]);
    let n = 0, s = 0;
    const trunkStart = N - (TRUNK_SEGS[0] + TRUNK_SEGS[1] + TRUNK_SEGS[2]);
    // Rivulets first (each has its own path); the stream is written last, but its arcs are needed for the joins, so it is walked first into scratch.
    let ti = 0;
    for (let ci = 0; ci < 3; ci++) {
      const m = TRUNK_SEGS[ci];
      for (let j = (ci ? 1 : 0); j <= m; j++) {
        bez(P0, c[ci][0], c[ci][1], c[ci][2], c[ci][3], j / m);
        if (ti) s += Math.hypot(P0[0] - tx[ti - 1], P0[1] - ty[ti - 1]);
        tx[ti] = P0[0]; ty[ti] = P0[1]; ts[ti] = s; ti++;
      }
    }
    const trunkLen = s;
    // Where each rivulet meets the stream: the stream's point nearest 125 below and 6 left of its start, above the drop's start.
    for (let i = 0; i < WEEP_LEAVES; i++) {
      const x = xmin + W * (0.02 + 0.96 * i / (WEEP_LEAVES - 1)), y = rimAt(x);
      let best = 0, bd = 1e12;
      for (let j = 0; j < ti; j++) {
        if (ty[j] > y2 + 0.5 || ts[j] > trunkLen * 0.75) break;
        const d = Math.hypot(tx[j] - (x - 6), ty[j] - (y + 125 * kw));
        if (d < bd) { bd = d; best = j; }
      }
      join[i] = ts[best];
      rank[i] = ((i * 0.618034) % 1) * WEEP_LEAVES;
      // The rivulet: from just inside the rim, down, and into the stream from above.
      const p0 = [x, y - 12 * kw], p1 = [x, y + 55 * kw], p2 = [tx[best] + 10, ty[best] - 48 * kw], p3 = [tx[best], ty[best]];
      const off = (i * 9.3) % WEEP_PITCH;
      let sx = p0[0], sy = p0[1], arc = 0;
      for (let j = 1; j <= LEAF_SEGS; j++) {
        bez(P1, p0, p1, p2, p3, j / LEAF_SEGS);
        const e = Math.hypot(P1[0] - sx, P1[1] - sy);
        ax[n] = sx; ay[n] = sy; bx[n] = P1[0]; by[n] = P1[1];
        sA[n] = arc; sB[n] = arc + e; sOff[n] = off; owner[n] = i;
        arc += e; sx = P1[0]; sy = P1[1]; n++;
      }
    }
    for (let j = 0; j < ti - 1; j++) {
      ax[n] = tx[j]; ay[n] = ty[j]; bx[n] = tx[j + 1]; by[n] = ty[j + 1];
      sA[n] = ts[j]; sB[n] = ts[j + 1]; sOff[n] = 0; owner[n] = -1; n++;
    }
    have = n === N && trunkStart === WEEP_LEAVES * LEAF_SEGS;
    // The box (the stream's and rivulets' reach, the rim's sheen) and the cells it passes through, drawn again each frame while it runs.
    let x0 = Infinity, y0 = rimY0 - 8, x1 = -Infinity, y1 = -Infinity;
    cellSet.clear();
    const mark = (x, y, m) => {
      for (let cx = Math.floor((x - m) / CELL); cx <= Math.floor((x + m) / CELL); cx++) for (let cy = Math.floor((y - m) / CELL); cy <= Math.floor((y + m) / CELL); cy++) cellSet.add(cx * 8192 + cy);
    };
    for (let i = 0; i < n; i++) {
      x0 = Math.min(x0, ax[i], bx[i]); x1 = Math.max(x1, ax[i], bx[i]); y1 = Math.max(y1, ay[i], by[i]);
      mark(ax[i], ay[i], 10); mark((ax[i] + bx[i]) / 2, (ay[i] + by[i]) / 2, 10);
    }
    for (let x = xmin; x <= xmax; x += 8) mark(x, rimAt(x), 8);
    x0 = Math.min(x0, xmin) - 12; x1 = Math.max(x1, xmax) + 12; y1 += 12;
    box[0] = x0; box[1] = y0; box[2] = x1; box[3] = y1;
    cells.length = 0;
    for (const v of cellSet) { const cy = v % 8192, cx = (v - cy) / 8192; cells.push(cx * CELL, cy * CELL); }
    nCells = cells.length / 2;
    lastSig = '';
    return true;
  }

  function fill() {
    // The opacity and half width of every segment at the leak shown (acts: how awake each rivulet is).
    let changed = false;
    for (let i = 0; i < N; i++) {
      let a0, a1, h0, h1;
      const o = owner[i];
      if (o >= 0) {
        a0 = acts[o] * sstep(0, 30, sA[i]); a1 = acts[o] * sstep(0, 30, sB[i]);
        h0 = h1 = 1.7 * SIZE;
      } else {
        let k0 = 0, k1 = 0, w0 = 0, w1 = 0;
        for (let j = 0; j < WEEP_LEAVES; j++) {
          k0 += acts[j] * sstep(join[j] - 30, join[j] + 20, sA[i]); k1 += acts[j] * sstep(join[j] - 30, join[j] + 20, sB[i]);
          w0 += acts[j] * sstep(join[j], join[j] + 50, sA[i]); w1 += acts[j] * sstep(join[j], join[j] + 50, sB[i]);
        }
        a0 = clamp(k0, 0, 1) * sstep(0, 10, sA[i]); a1 = clamp(k1, 0, 1) * sstep(0, 10, sB[i]);
        h0 = 2 * (0.8 + 0.22 * w0) * SIZE; h1 = 2 * (0.8 + 0.22 * w1) * SIZE;
      }
      if (put(data, i, ax[i])) changed = true; if (put(data, N + i, ay[i])) changed = true; if (put(data, 2 * N + i, bx[i])) changed = true; if (put(data, 3 * N + i, by[i])) changed = true;
      if (put(data, 4 * N + i, sA[i] + sOff[i])) changed = true; if (put(data, 5 * N + i, h0)) changed = true; if (put(data, 6 * N + i, h1)) changed = true;
      if (put(data, 8 * N + i, a0)) changed = true; if (put(data, 9 * N + i, a1)) changed = true;
    }
    return changed;
  }

  function step(dt, run, visible, look) {
    // The leak eases (a slider or a new patient never makes the stream jump), over about a second and a half.
    sm.shown += (sm.target - sm.shown) * (dt > 0 ? 1 - Math.exp(-dt / 1.5) : 0);
    if (Math.abs(sm.target - sm.shown) < 0.5) sm.shown = sm.target;
    const live = visible && have && sm.shown > 0.5;
    let changed = false;
    if (live) {
      const r = clamp(sm.shown / WEEP_REF, 0, 2.5);
      for (let i = 0; i < WEEP_LEAVES; i++) acts[i] = sstep(0, 1, clamp(r * WEEP_LEAVES * 0.65 - rank[i], 0, 1));
      const sig = r.toFixed(3) + '|' + key;
      if (sig !== lastSig) { lastSig = sig; if (fill()) { out.dirty = true; changed = true; } }
      if (run) phase = (phase + dt * 30 * (1 + 0.3 * Math.min(r, 1.5))) % (WEEP_PITCH * 64);
      look.wp[0] = N; look.wp[1] = phase; look.wp[2] = WEEP_PITCH; look.wp[3] = WEEP_DASH;
      look.wb[0] = box[0]; look.wb[1] = box[1]; look.wb[2] = box[2]; look.wb[3] = box[3];
      look.wk[0] = 0.5 * Math.min(r, 1.2);
    } else {
      look.wp[0] = 0; look.wk[0] = 0;
    }
    const toggled = live !== wasOn;
    wasOn = live;
    return toggled ? 2 : changed ? 1 : 0;
  }

  return {
    /** The leak the stream follows: the frame's metrics.ascites. */
    feed(asc) { sm.target = leakedPerDay(asc); },
    layout, step, out,
    get n() { return N; },
    get on() { return wasOn; },
    get cellCount() { return nCells; },
    get shown() { return sm.shown; },
    /** The cells (world x, y pairs) to draw again each frame, pushed onto `list`. */
    cellsInto(list) { for (let i = 0; i < cells.length; i++) list.push(cells[i]); },
  };
}
