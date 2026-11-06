// Lymph weeping from the liver's surface into the ascites pool on the anatomy figure (6 Nov 2026).
//
// Fine rivulets of soft amber streaks leave the liver at the lower tip of its right lobe (the left bottom corner of the figure's liver),
// join one thin stream that falls from the tip, and land in the pool. The stream widens at every join. How many rivulets run follows
// the model's Leaked mL/day (what the lymphatics cannot carry, the Fluid card's "Leaked"): none while the lymphatics carry it all,
// all of them at about twice the ordinary 1,060. A soft amber sheen on the liver's edge at the tip shows where it starts.
//
// This file works out the picture's numbers only: a flat list of segments (each with its arc length along its path, its half width
// and its opacity at both ends), kept in one array the figure's GPU renderer reads from a texture (veins-gl.js weepAt). The renderer
// draws the streaks, per pixel, from the clock it is given: nothing is drawn or moved here per frame beyond the eased leak, the phase
// and the numbers of the segments whose opacity changes. No pulse, no splash: the streaks run at a constant speed, soft as the blood's.
//
// Everything here is plain numbers (no page, no canvas), so it is tested in node (tests/weep.test.js).

/** Leaked mL a day at which the stream shows at its ordinary strength (the Fluid card's typical Leaked). */
export const WEEP_REF = 1060;
export const WEEP_LEAVES = 4;
export const WEEP_PITCH = 44, WEEP_DASH = 26;      // (world units along a path: one streak every pitch)
export const WEEP_LEAF_SEGS = 6;
const TRUNK_SEGS = 24;
/** The segments the figure draws: the rivulets of WEEP_LEAF_SEGS each, and the stream. */
export const WEEP_N = WEEP_LEAVES * WEEP_LEAF_SEGS + TRUNK_SEGS;
/** Rows of the segments' table: A (x0, y0, x1, y1), B (arc at its start, half width at its start and end, 0), C (opacity at its start and end, 0, 0). */
export const WEEP_ROWS = 12;
const SIZE = 0.8;
const CELL = 16;                                   // (the figure's cell, veins-gl.js CELL)
const LIVER_C = [560, 350];                        // (the liver's scale is about this point: stage-diaphragm.js)
const RIM_W = 290;                                 // (the rim width the sizes below were drawn for)
const LEAF_DX = [-34, -11, 11, 34];                // where the rivulets leave the rim, either side of the tip
const LEAF_JOIN = [34, 12, 22, 44];                // and how far down the stream each one joins it

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

function bez(out, a, b, c, d, t) {
  const u = 1 - t;
  out[0] = u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0];
  out[1] = u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1];
}

/**
 * One stream, made once. layout(floor, scale, h, R, cols, surf) builds its geometry for a liver (its lower edge `floor`, in its own
 * frame, at `cols` columns across R = [x, y, w, h]; its scale about (560, 350)) and a pool `h` high whose surface is surf(x); it
 * returns true when anything it drew with changed. step(dt, run, visible, look) eases the leak, runs the streaks and writes the
 * renderer's numbers into `look` (wp, wb, wk: arrays of 4); it returns 0 when nothing drawn changed, 1 when the stream's table or
 * strength did (a running figure draws it again anyway; a paused one needs a repaint), 2 when the stream came or went (always
 * repaint). `out.data` is the table the renderer reads (WEEP_ROWS rows of WEEP_N numbers, row-major); `out.dirty` says it changed.
 */
export function createWeep() {
  const N = WEEP_N;
  // The geometry (kept; layout writes into it)
  const ax = new Float64Array(N), ay = new Float64Array(N), bx = new Float64Array(N), by = new Float64Array(N);
  const sA = new Float64Array(N), sB = new Float64Array(N), sOff = new Float64Array(N);   // arc length at each end (along its own path), and the path's phase offset
  const owner = new Int8Array(N);                 // the rivulet it belongs to, or -1 for the stream
  const join = new Float64Array(WEEP_LEAVES);     // where each rivulet meets the stream: arc length along the stream
  const rank = new Float64Array(WEEP_LEAVES);
  const acts = new Float64Array(WEEP_LEAVES);
  const data = new Float32Array(N * WEEP_ROWS);
  const box = [0, 0, 0, 0];
  const sheen = [0, 0];                           // the sheen's centre x and half width (world)
  const cellSet = new Set();                      // alloc-rare: rebuilt by layout, which runs when the liver or the pool moves
  let have = false, key = '';
  const cells = [];
  const sm = { target: 0, shown: 0 };
  let phase = 0, wasOn = false, lastSig = '';   // (the leak starts at none and eases up: a new patient's stream arrives, it does not pop)
  const P0 = [0, 0], P1 = [0, 0];
  const tx = new Float64Array(TRUNK_SEGS + 1), ty = new Float64Array(TRUNK_SEGS + 1), ts = new Float64Array(TRUNK_SEGS + 1);   // (the stream's points and arc lengths, while layout works)
  const out = { dirty: false, data, n: N, box, cells };

  const probe = (floor, scale, h, cols) => {
    // (A few of the liver's columns and its scale: the liver eases its shape without a call to layout, and the key must follow it.)
    let s = scale.toFixed(3) + '/' + h.toFixed(0);
    for (let i = 1; i < 24; i++) s += '/' + floor[Math.floor((cols - 1) * i / 24)].toFixed(0);
    return s;
  };

  function layout(floor, scale, h, R, cols, surf) {
    if (!floor || !(scale > 0)) { const was = have; have = false; key = ''; return was; }
    const k = probe(floor, scale, h, cols);
    if (have && k === key) return false;
    key = k;
    // The liver's rim in the world: x → y of its lower edge.
    const dx = R[2] / (cols - 1);
    let c0 = -1, c1 = -1;
    for (let i = 0; i < cols; i++) if (floor[i] > -1e3) { if (c0 < 0) c0 = i; c1 = i; }
    if (c0 < 0 || c1 - c0 < 20) { const was = have; have = false; return was; }
    const wx = (i) => LIVER_C[0] + (R[0] + i * dx - LIVER_C[0]) * scale;
    const wy = (y) => LIVER_C[1] + (y - LIVER_C[1]) * scale;
    const xmin = wx(c0), xmax = wx(c1), W = xmax - xmin;
    const kw = clamp(W / RIM_W, 0.6, 1.3);
    const rimAt = (x) => {
      const i = clamp(Math.round(((LIVER_C[0] + (x - LIVER_C[0]) / scale) - R[0]) / dx), c0, c1);
      return wy(floor[i]);
    };
    // The tip: the lowest point of the liver's lower edge in its left part (the right lobe's inferior tip), a little in from its far end.
    let tip = c0, tipLow = -1e9;
    for (let i = c0 + Math.round(0.08 * (c1 - c0)); i <= c0 + Math.round(0.4 * (c1 - c0)); i++) if (floor[i] > tipLow) { tipLow = floor[i]; tip = i; }
    const tipX = wx(tip), tipY = wy(tipLow);
    // The stream: from just under the tip, down and a little toward the flank, to a hand's breadth under the pool's surface.
    const xd = tipX - 14 * kw, yT = tipY + 26 * kw;
    const yEnd = Math.max(yT + 150 * kw, surf(xd) + 60);
    const d3 = yEnd - yT;
    const a = [tipX, yT], b = [tipX + 4 * kw, yT + 0.35 * d3], c = [xd + 6 * kw, yT + 0.7 * d3], e = [xd, yEnd];
    let s = 0;
    for (let j = 0; j <= TRUNK_SEGS; j++) {
      bez(P0, a, b, c, e, j / TRUNK_SEGS);
      if (j) s += Math.hypot(P0[0] - tx[j - 1], P0[1] - ty[j - 1]);
      tx[j] = P0[0]; ty[j] = P0[1]; ts[j] = s;
    }
    let n = 0;
    // The rivulets: from just inside the rim either side of the tip, down, and into the stream from above.
    for (let i = 0; i < WEEP_LEAVES; i++) {
      const x = clamp(tipX + LEAF_DX[i] * kw, xmin + 3, xmax - 3), y = rimAt(x) - 8 * kw;
      // (the stream's point at the arc the rivulet joins at)
      const want = LEAF_JOIN[i] * kw;
      let best = 0;
      for (let j = 0; j <= TRUNK_SEGS; j++) if (ts[j] <= want) best = j;
      join[i] = ts[best];
      rank[i] = [0.4, 2.2, 1.3, 3.1][i];
      const jx = tx[best], jy = ty[best];
      const p0 = [x, y], p1 = [x, y + (jy - y) * 0.45], p2 = [jx + (x - jx) * 0.25, jy - (jy - y) * 0.35], p3 = [jx, jy];
      const off = (i * 13.7) % WEEP_PITCH;
      let sx = p0[0], sy = p0[1], arc = 0;
      for (let j = 1; j <= WEEP_LEAF_SEGS; j++) {
        bez(P1, p0, p1, p2, p3, j / WEEP_LEAF_SEGS);
        const len = Math.hypot(P1[0] - sx, P1[1] - sy);
        ax[n] = sx; ay[n] = sy; bx[n] = P1[0]; by[n] = P1[1];
        sA[n] = arc; sB[n] = arc + len; sOff[n] = off; owner[n] = i;
        arc += len; sx = P1[0]; sy = P1[1]; n++;
      }
    }
    for (let j = 0; j < TRUNK_SEGS; j++) {
      ax[n] = tx[j]; ay[n] = ty[j]; bx[n] = tx[j + 1]; by[n] = ty[j + 1];
      sA[n] = ts[j]; sB[n] = ts[j + 1]; sOff[n] = 0; owner[n] = -1; n++;
    }
    have = n === N;
    // The box (the stream's and rivulets' reach, the sheen at the tip) and the cells it passes through, drawn again each frame while it runs.
    sheen[0] = tipX; sheen[1] = 70 * kw;
    let x0 = tipX - sheen[1], y0 = tipY - 60 * kw, x1 = tipX + sheen[1], y1 = -Infinity;
    cellSet.clear();
    const mark = (px, py, m) => {
      for (let cx = Math.floor((px - m) / CELL); cx <= Math.floor((px + m) / CELL); cx++) for (let cy = Math.floor((py - m) / CELL); cy <= Math.floor((py + m) / CELL); cy++) cellSet.add(cx * 8192 + cy);
    };
    for (let i = 0; i < n; i++) {
      x0 = Math.min(x0, ax[i], bx[i]); x1 = Math.max(x1, ax[i], bx[i]); y1 = Math.max(y1, ay[i], by[i]);
      mark(ax[i], ay[i], 12); mark((ax[i] + bx[i]) / 2, (ay[i] + by[i]) / 2, 12);
    }
    for (let x = tipX - sheen[1]; x <= tipX + sheen[1]; x += 8) mark(x, rimAt(x), 8);
    x0 -= 14; x1 += 14; y1 += 14;
    box[0] = x0; box[1] = y0; box[2] = x1; box[3] = y1;
    cells.length = 0;
    for (const v of cellSet) { const cy = v % 8192, cx = (v - cy) / 8192; cells.push(cx * CELL, cy * CELL); }
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
        a0 = acts[o] * sstep(0, 26, sA[i]); a1 = acts[o] * sstep(0, 26, sB[i]);
        h0 = h1 = 1.9 * SIZE;
      } else {
        let k0 = 0, k1 = 0, w0 = 0, w1 = 0;
        for (let j = 0; j < WEEP_LEAVES; j++) {
          k0 += acts[j] * sstep(join[j] - 24, join[j] + 14, sA[i]); k1 += acts[j] * sstep(join[j] - 24, join[j] + 14, sB[i]);
          w0 += acts[j] * sstep(join[j], join[j] + 40, sA[i]); w1 += acts[j] * sstep(join[j], join[j] + 40, sB[i]);
        }
        a0 = clamp(k0, 0, 1) * sstep(0, 10, sA[i]); a1 = clamp(k1, 0, 1) * sstep(0, 10, sB[i]);
        h0 = (1.8 + 0.5 * w0) * SIZE; h1 = (1.8 + 0.5 * w1) * SIZE;
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
      for (let i = 0; i < WEEP_LEAVES; i++) acts[i] = sstep(0, 1, clamp(r * WEEP_LEAVES * 0.65 - rank[i] * 0.65, 0, 1));
      const sig = r.toFixed(3) + '|' + key;
      if (sig !== lastSig) { lastSig = sig; if (fill()) { out.dirty = true; changed = true; } }
      if (run) phase = (phase + dt * 26 * (1 + 0.3 * Math.min(r, 1.5))) % (WEEP_PITCH * 64);
      look.wp[0] = N; look.wp[1] = phase; look.wp[2] = WEEP_PITCH; look.wp[3] = WEEP_DASH;
      look.wb[0] = box[0]; look.wb[1] = box[1]; look.wb[2] = box[2]; look.wb[3] = box[3];
      look.wk[0] = 0.4 * Math.min(r, 1.2); look.wk[1] = sheen[0]; look.wk[2] = sheen[1];
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
    get shown() { return sm.shown; },
    /** The cells (world x, y pairs) to draw again each frame, pushed onto `list`. */
    cellsInto(list) { for (let i = 0; i < cells.length; i++) list.push(cells[i]); },
  };
}
