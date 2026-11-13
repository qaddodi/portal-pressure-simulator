// Path builders (sample on the scratch path, meander, then the pure ones): polyline text, arc length, point and tangent at a fraction, wiggle, braid, tube outline and arc midpoint.
// (moved out of stage.js by scripts/stage-split/move.mjs: the text is unchanged except that a shared let reads live.x; every `let` of the stage is read through live, never copied.)
import { LIGHT } from './light.js';
import { smooth01 } from './motion.js';
import { clamp, lerp, s } from './util.js';
import { wiggleAt } from './wiggle-math.js';

export function createPaths(st) {
  const { N_SAMPLES, scratchG } = st;
  function sample(d) {
    const scratch = s('path', { d });
    scratchG.replaceChildren(scratch);
    const L = scratch.getTotalLength();
    const pts = [];
    for (let i = 0; i < N_SAMPLES; i++) {
      const p = scratch.getPointAtLength((L * i) / (N_SAMPLES - 1));
      pts.push([p.x, p.y]);
    }
    return pts;
  }
  // Real vessels are never ruler-straight: a gentle, low-frequency meander (a few units, fixed
  // per vessel) along each anatomic course, fading to zero at both ends so junctions stay put.
  function meander(pts, id) {
    let L = 0;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(L); }
    const amp = Math.min(4.5, L * 0.02);
    if (amp < 0.8) return pts;
    let hsh = 0;
    for (const c of id) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0;
    const ph = (hsh % 628) / 100, k = (Math.PI * 2 * (0.7 + (hsh % 5) * 0.12)) / L;
    return pts.map((p, i) => {
      if (i === 0 || i === pts.length - 1) return p;
      const a = pts[i - 1], b = pts[i + 1];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
      const u = cum[i] / L;
      const o = amp * Math.sin(Math.PI * u) * (0.72 * Math.sin(k * cum[i] + ph) + 0.28 * Math.sin(2.3 * k * cum[i] + 2 * ph));
      return [p[0] + nx * o, p[1] + ny * o];
    });
  }
  const polyD = (pts) => {
    // Catmull-Rom → cubic Bézier for a smooth morph
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d;
  };
  // (A square root, not Math.hypot: hypot is a builtin call whose answer is boxed in a new number each time, and this ran over every segment
  // of every vessel on a frame that eased the radii. The same length to the last digit or two.)
  const arcLen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) { const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1]; L += Math.sqrt(dx * dx + dy * dy); } return L; };
  // A drawn course's length, kept with the course it was measured on (the arrays are replaced, never changed in place, when the geometry moves).
  function lenOfItem(it) {
    const o = it.obj;
    if (o.glLenPts !== it.pts) { o.glLenPts = it.pts; o.glLenV = arcLen(it.pts); }
    return o.glLenV;
  }
  // (The tangent at sample j: central differences, written into tanOut.)
  const tanOut = [0, 0];
  function tanAt(pts, j) {
    const p0 = pts[Math.max(0, j - 1)], p1 = pts[Math.min(pts.length - 1, j + 1)];
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], n = Math.hypot(dx, dy) || 1;
    tanOut[0] = dx / n; tanOut[1] = dy / n;
  }
  // (Every caller reads its four numbers at once, by destructuring or spreading, before the next call: one kept array.)
  const pointOut = [0, 0, 0, 0];
  function pointAt(pts, u) {
    const f = clamp(u, 0, 1) * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(f)), t = f - i;
    const a = pts[i], b = pts[i + 1];
    // The tangent blends between the directions at the two samples (central differences), so a
    // mark gliding along a curve turns smoothly instead of snapping at each sample.
    tanAt(pts, i);
    const ta0 = tanOut[0], ta1 = tanOut[1];
    tanAt(pts, i + 1);
    const tb0 = tanOut[0], tb1 = tanOut[1];
    pointOut[0] = a[0] + (b[0] - a[0]) * t; pointOut[1] = a[1] + (b[1] - a[1]) * t;
    pointOut[2] = ta0 + (tb0 - ta0) * t; pointOut[3] = ta1 + (tb1 - ta1) * t;
    return pointOut;
  }
  // Tortuous collateral: a smooth serpentine (wavelength ≈ 64 units) along the centerline,
  // tapered to zero at both ends so the vessel still meets its nodes.
  // (With `hold`, the wave stays off for the first and last `hold` of the course and comes in over the next 1.4 of it: a strand that must leave its channel and join it as one vessel.)
  function wiggle(pts, amp, seed, hold = 0) {
    if (amp < 0.3) return pts;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = cum[cum.length - 1] || 1;
    const k = Math.max(1.5, Math.round(L / 90)) * Math.PI * 2 / L;
    return pts.map((p, i) => {
      if (i === 0 || i === pts.length - 1) return p;
      const a = pts[i - 1], b = pts[i + 1];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
      const u = cum[i] / L;
      let env = Math.min(1, u * 6, (1 - u) * 6);
      if (hold) env *= smooth01((u - hold) / (1.4 * hold)) * smooth01((1 - u - hold) / (1.4 * hold));
      const w = wiggleAt(amp, env, cum[i], k, seed);
      return [p[0] + nx * w, p[1] + ny * w];
    });
  }
  // Lateral offset of `off` units at mid-course, easing to zero at both ends (or, with `u0`, at
  // `u0` along the vessel and the far end: the strands leave a single trunk there).
  // With a stretch `span` [from, to] the strand leaves and rejoins the vessel there, its bow a little uneven (`ph`).
  function braid(pts, off, u0 = 0, span = null, ph = 0, soft = false) {
    if (Math.abs(off) < 0.3) return pts;
    if (span) {
      // One normal for every strand (across the vessel's chord), so a bend in the vessel never kinks a strand or
      // makes two cross.
      const [ua, ub] = span, n0 = pts.length - 1, A = pts[0], B = pts[n0];
      const cl = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, nx = -(B[1] - A[1]) / cl, ny = (B[0] - A[0]) / cl;
      return pts.map((p, i) => {
        const v = (i / n0 - ua) / (ub - ua);
        if (v <= 0 || v >= 1) return p;
        const o = off * Math.sin(Math.PI * v) ** 1.4 * (1 + 0.1 * Math.sin(3 * Math.PI * v + ph));
        return [p[0] + nx * o, p[1] + ny * o];
      });
    }
    // (A soft braid bows off the chord's one normal, like a span: a large offset on the inner side of a curving course would fold at the bend.)
    const A = pts[0], B = pts[pts.length - 1], cl = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, cx = -(B[1] - A[1]) / cl, cy = (B[0] - A[0]) / cl;
    return pts.map((p, i) => {
      if (i === 0 || i === pts.length - 1) return p;
      const a = pts[i - 1], b = pts[i + 1];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
      if (soft) { nx = cx; ny = cy; }
      const s = Math.sin(Math.PI * clamp((i / (pts.length - 1) - u0) / (1 - u0), 0, 1));
      const o = off * (soft ? s * s : s);
      return [p[0] + nx * o, p[1] + ny * o];
    });
  }
  // `b` blended in over `a` past `u0` along the vessel (a short smooth ramp): before it, `a`.
  function blendFrom(a, b, u0) {
    const n = a.length - 1;
    return a.map((p, i) => { const e = clamp((i / n - u0) / 0.12, 0, 1), k = e * e * (3 - 2 * e); return [lerp(p[0], b[i][0], k), lerp(p[1], b[i][1], k)]; });
  }
  // Light comes from the top (slightly left). For each sample: the unit normal and how much it
  // faces the light (n·L), so a tube's sheen and shade slide smoothly around its curves.
  // (Written into `out`, the vessel's own list of triples (geo[..].lit), whose readers take what they need from it at once.)
  function litNormals(pts, out) {
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const n = Math.hypot(nx, ny) || 1; nx /= n; ny /= n;
      const o = out[i];
      o[0] = nx; o[1] = ny; o[2] = nx * LIGHT[0] + ny * LIGHT[1];
    }
    return out;
  }
  // Outline of a tube of radius r(u) along pts (with round ends), as a closed path. The end caps
  // are explicit half-circles bulging along the tangent, so they are always convex.
  function tubeOutline(pts, lit, rOf) {
    const n = pts.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const r = rOf(i / (n - 1));
      const [nx, ny] = lit[i];
      L.push([pts[i][0] + nx * r, pts[i][1] + ny * r]); R.push([pts[i][0] - nx * r, pts[i][1] - ny * r]);
    }
    const cap = (i, r, fwd) => {
      const [nx, ny] = lit[i];
      const tx = ny * fwd, ty = -nx * fwd; // tangent pointing out of the tube at this end
      const out = [];
      for (let k = 1; k < 8; k++) {
        const th = (k / 8) * Math.PI, c = Math.cos(th), sn = Math.sin(th);
        const sx = fwd > 0 ? nx * c : -nx * c, sy = fwd > 0 ? ny * c : -ny * c;
        out.push([pts[i][0] + (sx + tx * sn) * r, pts[i][1] + (sy + ty * sn) * r]);
      }
      return out;
    };
    // Along the left side, round the far end (left → right), back along the right side, round the
    // near end (right → left).
    const ring = [...L, ...cap(n - 1, rOf(1), 1), ...R.reverse(), ...cap(0, rOf(0), -1)];
    return 'M' + ring.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L') + ' Z';
  }
  // The point half way along a drawn vessel, by length, and the direction it runs there.
  // (at: how far along, 0.5 by default: the middle.)
  const arcOut = [0, 0, 0, 0];   // (read at once by every caller, by destructuring or spreading)
  // (The last answer for each course, kept with a copy of its points (13 Nov 2026, Mac heat): the labels' pins ask for the middle of the same
  // unchanged course on every present, 30 to 40 times a second, and the walk with its square roots was the main thread's largest single cost
  // at rest. The points are compared one by one, so a course moved in place is walked again; the answer is the same numbers either way.)
  const arcMemo = new WeakMap();
  function arcMid(pts, at = 0.5) {
    const n = pts.length;
    let k = arcMemo.get(pts);
    if (k && k.at === at && k.n === n) {
      const xs = k.xs;
      let same = true;
      for (let i = 0, j = 0; i < n; i++, j += 2) { const p = pts[i]; if (p[0] !== xs[j] || p[1] !== xs[j + 1]) { same = false; break; } }
      if (same) { arcOut[0] = k.r[0]; arcOut[1] = k.r[1]; arcOut[2] = k.r[2]; arcOut[3] = k.r[3]; return arcOut; }
    }
    arcWalk(pts, at);
    if (!k) arcMemo.set(pts, (k = { at, n: -1, xs: null, r: new Float64Array(4) }));   // alloc-rare: once per course array
    if (!k.xs || k.xs.length !== 2 * n) k.xs = new Float64Array(2 * n);   // alloc-rare: once per course array, again only if it changes length
    for (let i = 0, j = 0; i < n; i++, j += 2) { k.xs[j] = pts[i][0]; k.xs[j + 1] = pts[i][1]; }
    k.at = at; k.n = n; k.r[0] = arcOut[0]; k.r[1] = arcOut[1]; k.r[2] = arcOut[2]; k.r[3] = arcOut[3];
    return arcOut;
  }
  function arcWalk(pts, at) {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let run = 0;
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (run + seg >= total * at && seg > 0) {
        const u = (total * at - run) / seg, dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
        arcOut[0] = pts[i - 1][0] + dx * u; arcOut[1] = pts[i - 1][1] + dy * u; arcOut[2] = dx / seg; arcOut[3] = dy / seg;
        return arcOut;
      }
      run += seg;
    }
    arcOut[0] = pts[0][0]; arcOut[1] = pts[0][1]; arcOut[2] = 1; arcOut[3] = 0;
    return arcOut;
  }
  return { arcLen, arcMid, blendFrom, braid, lenOfItem, litNormals, meander, pointAt, polyD, sample, tubeOutline, wiggle };
}
