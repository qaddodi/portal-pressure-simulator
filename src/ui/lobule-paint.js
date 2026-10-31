// The lobule's tissue as the lobule view paints it into its bitmap (lobule-zoom.js paintWorld): the plates, the zones, the collagen
// of fibrosis and cirrhosis, the stellate cells and the nutmeg of congestion. Kept apart from the view, with no page and no styles
// in it, so the same code paints the bitmap on the page or in a worker (tissue-worker.js): one picture, wherever it is painted, from
// the same plain values (the view's worldInput).

import { cordTone, bandOutline } from './lobule-look.js?v=cf14995b07';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));   // (as util.js clamp)
function at(pts, u) {
  const f = clamp(u, 0, 1) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)), t = f - i;
  return [lerp(pts[i][0], pts[i + 1][0], t), lerp(pts[i][1], pts[i + 1][1], t)];
}
export const css = (a, al = 1) => `rgba(${Math.round(a[0] * 255)},${Math.round(a[1] * 255)},${Math.round(a[2] * 255)},${al})`;

// The colour tokens the painting reads (a token, optionally with an alpha): on the page the live tokens (lobule-zoom.js tk), in the
// worker the same tokens' values, sent with each job (TOKENS, tokenReader).
let tk = () => { throw new Error('lobule-paint: no tokens'); };
export const useTokens = (f) => { tk = f; };
/** Every token the painting reads (the worker is sent exactly these). */
export const TOKENS = ['--lz-plate-line', '--lz-nodule-ink', '--lz-nutmeg', '--lz-zone-1', '--lz-zone-2', '--lz-zone-3', '--lz-zone-line', '--lz-hsc-body', '--lz-hsc-nucleus', '--lz-nodule-shadow', '--lz-shade'];
/** A reader over sent values ({ name: [value, [r, g, b]] }) that gives the same strings as util.js cssVar and cssAlpha. */
export const tokenReader = (T) => (n, a) => {
  const t = T[n];
  if (!t) throw new Error(`lobule-paint: token ${n} not sent`);
  return a === undefined ? t[0] : `rgba(${t[1].join(',')},${a})`;
};

// A fibrous septum, the way it looks under the microscope: a band of pale collagen, uneven in
// width, soft at its edges, swelling where it leaves a portal tract, with wavy fibres running along
// it and a few spindle-shaped fibroblast nuclei. Drawn once into a cached canvas, never per frame.
// A, B: ends; w: mean width; e0, e1: width at each end (1.5 at a tract, ~0.2 for a septum that
// stops in the parenchyma); seed: a fixed number so the same septum always looks the same;
// detail: 0 … 1, fewer fibres and no nuclei when small on screen.
export const fibHash = (i) => { let q = (i * 374761393 + 668265263) >>> 0; q = ((q ^ (q >>> 13)) * 1274126177) >>> 0; return (q >>> 8) / 16777216; };
/** A band's centre line and widths: 27 samples (n = 26), each with its point P, unit normal N and width Wd; L0, the chord's length. */
export function bandGeom(A, B, { w, seed = 0, e0 = 1.5, e1 = 1.5, amp = 0, path = null }) {
  const n = 26, P = [], N = [], Wd = [];
  const ph = fibHash(seed) * TAU, ph2 = fibHash(seed + 9) * TAU;
  const dx = B[0] - A[0], dy = B[1] - A[1], L0 = Math.hypot(dx, dy) || 1;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    if (path) P.push(path(u));
    else { const e = amp * Math.sin(Math.PI * u) * (0.75 * Math.sin(3 * Math.PI * u + ph) + 0.25 * Math.sin(7 * Math.PI * u + ph2)); P.push([A[0] + dx * u - (dy / L0) * e, A[1] + dy * u + (dx / L0) * e]); }
  }
  for (let i = 0; i <= n; i++) {
    const p = P[Math.max(0, i - 1)], q = P[Math.min(n, i + 1)], ex = q[0] - p[0], ey = q[1] - p[1], L = Math.hypot(ex, ey) || 1, u = i / n;
    N.push([-ey / L, ex / L]);
    const lump = 0.78 + 0.22 * Math.sin(TAU * 1.4 * u + ph) + 0.14 * Math.sin(TAU * 3.3 * u + ph2);
    const end = 1 + (e0 - 1) * Math.max(0, 1 - u * 3) ** 2 + (e1 - 1) * Math.max(0, u * 3 - 2) ** 2;
    Wd.push(Math.max(0, w * lump * end));
  }
  return { n, P, N, Wd, L0 };
}
/** Fibre f of a band: its offset across the band (in widths), phase, waviness, where along it (samples iA … iB) and how thick (world units). */
export function bandFibre(seed, f, w, n = 26) {
  const off = (fibHash(seed * 31 + f) - 0.5) * 0.9, fp = fibHash(seed * 17 + f) * TAU, wav = 0.05 + 0.08 * fibHash(seed * 7 + f);
  const u0 = fibHash(seed * 13 + f) * 0.25, u1 = 1 - fibHash(seed * 19 + f) * 0.25;
  return { off, fp, wav, iA: Math.floor(u0 * n), iB: Math.ceil(u1 * n), lw: Math.max(0.45, w * (0.035 + 0.03 * fibHash(seed * 5 + f))), deep: f % 3 === 0 };
}
/** How many fibres a band has, and how many nuclei (0 when it is too small on screen or too narrow to show them). */
export const bandFibreCount = (w, detail = 1) => (detail <= 0 || w < 1.2 ? 0 : Math.round((3 + Math.min(7, w / 1.6)) * detail));
export const bandNucleiCount = (g, w, detail = 1) => (detail <= 0 || w < 1.2 || detail < 0.6 || w < 3 ? 0 : Math.round((g.L0 / (w * 2.6)) * detail));
/** Nucleus k of a band: its centre, half axes and angle. */
export function bandNucleus(g, seed, k, w) {
  const { n, P, N, Wd } = g;
  const i = Math.min(n - 1, Math.max(1, Math.round(fibHash(seed * 41 + k) * n))), h = Wd[i] * (fibHash(seed * 43 + k) - 0.5) * 0.7;
  return { x: P[i][0] + N[i][0] * h, y: P[i][1] + N[i][1] * h, rx: Math.max(0.8, w * 0.16), ry: Math.max(0.35, w * 0.045), ang: Math.atan2(N[i][0], -N[i][1]) };
}
export function fibrousBand(c, A, B, { w, rgb, a = 1, seed = 0, e0 = 1.5, e1 = 1.5, amp = 0, detail = 1, path = null }) {
  const g = bandGeom(A, B, { w, seed, e0, e1, amp, path }), { n, P, N, Wd } = g;
  // (Round ends, so bands meeting at a tract blend; the widest, faintest pass narrows to the middle one's width at the
  // ends, so it leaves no outer halo round the tract.)
  const outline = (k) => bandOutline(c, P, N, Wd, k, Math.min(k, 1.45));
  // Soft edges: the band laid down in three passes, wide and faint to narrow and dense.
  const sb = c.shadowBlur;   // a shade (set by the caller) is cast by the faint outer pass only
  for (const [k, al] of [[2.1, 0.12], [1.45, 0.24], [1, 0.5]]) { c.fillStyle = css(rgb, al * a); outline(k); c.fill(); c.shadowBlur = 0; }
  c.shadowBlur = sb;
  if (detail <= 0 || w < 1.2) return;
  // Fibres: thin wavy strands along the band, some brighter, some deeper.
  const lite = rgb.map((x) => x + (1 - x) * 0.45), deep = rgb.map((x, j) => x * [0.78, 0.74, 0.7][j]);
  const nf = bandFibreCount(w, detail);
  c.lineCap = 'round'; c.shadowBlur = 0;
  for (let f = 0; f < nf; f++) {
    const { off, fp, wav, iA, iB, lw, deep: isDeep } = bandFibre(seed, f, w, n);
    c.strokeStyle = css(isDeep ? deep : lite, (isDeep ? 0.32 : 0.55) * a);
    c.lineWidth = lw;
    c.beginPath();
    for (let i = iA; i <= iB; i++) {
      const u = i / n, h = Wd[i] * (off + wav * Math.sin(TAU * 4 * u + fp));
      c[i === iA ? 'moveTo' : 'lineTo'](P[i][0] + N[i][0] * h, P[i][1] + N[i][1] * h);
    }
    c.stroke();
  }
  if (detail < 0.6 || w < 3) { c.shadowBlur = sb; return; }
  // Fibroblast nuclei: small dark spindles lying along the fibres.
  const nn = bandNucleiCount(g, w, detail);
  c.fillStyle = tk('--lz-shade', 0.32 * a);
  for (let k = 0; k < nn; k++) {
    const { x, y, rx, ry, ang } = bandNucleus(g, seed, k, w);
    c.beginPath(); c.ellipse(x, y, rx, ry, ang, 0, TAU); c.fill();
  }
  c.shadowBlur = sb;
}

// Visual scar growth is eased independently of the physiology and stays close to the vessels.
export const scarGrowth = (fibrosis) => clamp(fibrosis, 0, 1) ** 1.1;

// Portal fibrosis has a compact circular footprint with interwoven collagen inside.
// Cached with the tissue; fixed seeds keep the texture still as pressure changes.
export function fibrousTract(c, x, y, radius, angle, rgb, fibrosis, seed, detail = 1) {
  c.save(); c.translate(x, y); c.rotate(angle);
  const rx = radius, ry = radius;
  const phase = fibHash(seed) * TAU;
  c.beginPath(); c.arc(0, 0, radius, 0, TAU);
  c.fillStyle = css(rgb, fibrosis * 0.24); c.fill(); c.clip();
  // Broken curving bundles cross each other instead of forming a circular halo.
  const count = Math.round(10 * detail);
  for (let k = 0; k < count; k++) {
    const sd = seed + k * 37, a0 = fibHash(sd) * TAU;
    const span = 1.2 + 2 * fibHash(sd + 1), r0 = 0.25 + 0.65 * fibHash(sd + 2);
    const path = (u) => {
      const a = a0 + span * u;
      const r = r0 + 0.09 * Math.sin(5 * a + phase) + 0.12 * Math.sin(Math.PI * u);
      return [Math.cos(a) * rx * r, Math.sin(a) * ry * r];
    };
    fibrousBand(c, path(0), path(1), {
      w: radius * (0.08 + 0.085 * fibrosis) * (0.7 + fibHash(sd + 3)),
      rgb, a: Math.min(1, fibrosis * (0.75 + 0.35 * fibHash(sd + 4))),
      e0: 0.2, e1: 0.25, seed: sd, path, detail,
    });
  }
  c.restore();
}

// Perivenular collagen: overlapping curved bundles rather than a smooth, solid disc.
// Like the bridging bands, this texture is painted only into the cached tissue bitmap.
export function fibrousCuff(c, cx, cy, inner, outer, rgb, fibrosis) {
  const annulus = () => {
    c.beginPath();
    for (let i = 0; i <= 80; i++) {
      const a = TAU * i / 80, r = outer * (1 + 0.035 * Math.sin(3 * a) + 0.025 * Math.sin(7 * a + 0.8));
      c[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    c.closePath(); c.moveTo(cx + inner, cy); c.arc(cx, cy, inner, 0, TAU); c.closePath();
  };
  c.save();
  annulus(); c.fillStyle = css(rgb, 0.4 * fibrosis); c.fill('evenodd'); c.clip('evenodd');
  const thickness = outer - inner;
  for (let ring = 0; ring < 3; ring++) for (let k = 0; k < 6; k++) {
    const seed = 211 + ring * 17 + k, a0 = TAU * k / 6 + ring * 0.27;
    const span = TAU / 6 * (1.2 + 0.5 * fibHash(seed)), r0 = inner + thickness * (0.18 + ring * 0.3);
    const path = (u) => {
      const a = a0 + span * u, r = r0 + thickness * 0.1 * Math.sin(a * 5 + fibHash(seed + 5) * TAU);
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    };
    fibrousBand(c, path(0), path(1), { w: thickness * 0.34, rgb, a: Math.min(1, 1.0 * fibrosis), e0: 0.45, e1: 0.5, seed, path });
  }
  c.restore();
}

// The lobule in world space (plates, septa, tracts, lymph): drawn into the cached bitmap. P: the view's plain values (lobule-zoom.js
// worldInput): m, the model's tissue values; G, the lobule's shape; dark, zonesOn; rgb, its colours; sin, the sinusoids' paths and
// calibers; cvIn, the central vein's.
export function paintLobule(c, P) {
  const { m, G, dark, zonesOn, rgb } = P, { R, cx, cy, lobules } = G;
  { const l = lobules[0], bq = rgb.bg; c.fillStyle = css(rgb.gap.map((x, i) => lerp(bq[i], x, 0.55)), 1); c.beginPath(); l.corners.forEach(([x, y], i) => { const px = l.x + (x - l.x) * 1.015, py = l.y + (y - l.y) * 1.015; if (i) c.lineTo(px, py); else c.moveTo(px, py); }); c.closePath(); c.fill(); }
  const gap = rgb.gap, cell = rgb.cell;
  const COL = rgb.col;   // (light and Soft: a deeper tan than the collagen token, to read on the pale cells)
  const PRE = dark ? [0.86, 0.78, 0.6] : [0.78, 0.64, 0.44];   // periportal scar: deeper than COL to read on the tissue
  const DIS = rgb.dis, col = (a) => css(DIS, a);   // (the space of Disse's lining keeps the paler collagen)
  const hexPath = (l, k = 1) => { c.beginPath(); l.corners.forEach(([x, y], i) => { const px = l.x + (x - l.x) * k, py = l.y + (y - l.y) * k; if (i) c.lineTo(px, py); else c.moveTo(px, py); }); c.closePath(); };
  // The lobule's own plates: hepatocytes in radial cords, one cell thick.
  const main = lobules[0];
  hexPath(main); c.fillStyle = css(gap, dark ? 0.55 : 0.5); c.fill();
  c.save(); hexPath(main); c.clip();
  const cu = m.congU;
  // Each cell's membrane: a 0.6 px line where neighbouring cells meet, so a cord reads as a row of cells (G21).
  c.strokeStyle = tk('--lz-plate-line'); c.lineWidth = Math.max(0.6, 0.6 / (c.getTransform().a || 1));
  for (const k of G.cells) {
    const z3 = k.q < 0.4, dead = z3 && cu > 0.12 && k.drop < cu * (1.25 - k.q * 1.6);
    const t = 0.88 + 0.12 * k.tone;
    const base = dark ? cell.map((x, i) => lerp(gap[i], x, 0.28)) : cell;
    // (Zone 3, by the central vein, deeper and warmer than zone 1: cordTone.)
    const fill = dead ? (dark ? [0.42, 0.33, 0.3] : [0.93, 0.86, 0.72]) : cordTone(base.map((x) => x * t + (1 - t) * (dark ? 0.15 : 1) * 0.3), k.q, dark);
    // In cirrhosis the plates thicken and lose their order (regenerating nodules).
    const sj = m.septU, dz = sj * Math.min(k.l, k.w) * 0.45;
    c.save(); c.translate(k.x + k.jx * dz, k.y + k.jy * dz); c.rotate(k.a + k.ja * sj * 0.9);
    const lw = (dead ? k.l * 0.7 : k.l) * (1 + 0.12 * sj), ww = (dead ? k.w * 0.7 : k.w) * (1 + 0.3 * sj);
    c.fillStyle = css(fill, dead ? 0.6 : dark ? 0.8 : 0.92);
    c.beginPath(); if (c.roundRect) c.roundRect(-lw / 2, -ww / 2, lw, ww, Math.min(lw, ww) * 0.38); else c.rect(-lw / 2, -ww / 2, lw, ww); c.fill();
    if (!dead) c.stroke();
    if (!dead) { c.fillStyle = tk('--lz-nodule-ink'); c.beginPath(); c.arc(k.nu * lw, 0, Math.max(0.9, ww * 0.16), 0, TAU); c.fill(); }
    c.restore();
  }
  // Zone 3 congestion: blood pooling around the central vein (nutmeg).
  if (cu > 0.04) {
    const gr = c.createRadialGradient(cx, cy, R * 0.05, cx, cy, R * 0.55);
    gr.addColorStop(0, tk('--lz-nutmeg', 0.5 * cu)); gr.addColorStop(0.6, tk('--lz-nutmeg', 0.22 * cu)); gr.addColorStop(1, tk('--lz-nutmeg', 0));
    c.fillStyle = gr; c.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  }
  // Zones of the acinus (toggle): hexagonal bands from the triads (1) to the central vein (3).
  if (zonesOn) {
    [[1, 0], [0.66, 1], [0.36, 2]].forEach(([k, i]) => { hexPath(main, k); c.fillStyle = tk(`--lz-zone-${i + 1}`, dark ? 0.2 : 0.17); c.fill(); });
    c.lineWidth = 1; c.strokeStyle = tk('--lz-zone-line');
    for (const k of [0.66, 0.36]) { hexPath(main, k); c.stroke(); }
  }
  // Space of Disse collagen (capillarization) along every sinusoid.
  if (m.fibSin > 0.05) {
    c.strokeStyle = col(0.75 * m.fibSin); c.lineCap = 'round'; c.lineJoin = 'round';
    for (const t of P.sin) {
      c.lineWidth = 2 * t.r + 2 + 3.5 * m.fibSin;
      c.beginPath(); t.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
    }
  }
  // Stellate (Ito) cells, in the space of Disse between a plate and its sinusoid: shown once fibrosis
  // starts, when they activate. A spindle-shaped body lying along the sinusoid, with long thin
  // processes hugging its wall; activated (myofibroblasts), they grow, darken and lay down collagen.
  if (m.act > 0.08) {
    const a = m.act, L = G.rs0 * (2.4 + 1.4 * a), Wb = G.rs0 * (0.42 + 0.2 * a);
    const body = tk('--lz-hsc-body', (0.22 + 0.3 * a).toFixed(3)), nuc = tk('--lz-hsc-nucleus', (0.3 + 0.3 * a).toFixed(3));
    // A tapered strand: from (x0, y0) along the wall, bowing toward the sinusoid, width w0 → 0.
    const strand = (k, x0, y0, sgn, len, w0, bow) => {
      const ux = Math.cos(k.a) * sgn, uy = Math.sin(k.a) * sgn, n = 10, Pq = [];
      for (let i = 0; i <= n; i++) { const u = i / n, b = bow * Math.sin(Math.PI * u * 0.8) * G.rs0; Pq.push([x0 + ux * len * u - k.nx * b, y0 + uy * len * u - k.ny * b, w0 * (1 - u) ** 1.3]); }
      c.moveTo(Pq[0][0] + k.nx * Pq[0][2], Pq[0][1] + k.ny * Pq[0][2]);
      for (const [x, y, w] of Pq) c.lineTo(x + k.nx * w, y + k.ny * w);
      for (let i = n; i >= 0; i--) c.lineTo(Pq[i][0] - k.nx * Pq[i][2], Pq[i][1] - k.ny * Pq[i][2]);
      c.closePath();
    };
    for (const k of G.hsc) {
      const ux = Math.cos(k.a), uy = Math.sin(k.a);
      c.fillStyle = body; c.beginPath();
      // Body: a slender spindle, its ends drawn out into the processes along the sinusoid.
      c.ellipse(k.x, k.y, L * 0.6, Wb, k.a, 0, TAU);
      for (const sgn of [-1, 1]) {
        const x0 = k.x + ux * sgn * L * 0.45, y0 = k.y + uy * sgn * L * 0.45;
        strand(k, x0, y0, sgn, L * (2 + 0.6 * a), Wb * 0.55, 0.45);
        strand(k, x0, y0, sgn, L * (1.1 + 0.4 * a), Wb * 0.35, -0.25);   // a finer branch on the plate side
      }
      c.fill();
      c.fillStyle = nuc; c.beginPath(); c.ellipse(k.x, k.y, L * 0.26, Wb * 0.5, k.a, 0, TAU); c.fill();
    }
  }
  c.restore();
  // Bridging septa in cirrhosis: fibrous bands along the borders (portal-portal) and, later, from
  // the triads to the central vein (portal-central), cutting the lobule into rounded nodules.
  const su = m.septU;
  if (su > 0) {
    const w = R * (0.045 + 0.075 * su), crn = lobules[0].corners;
    // Early: incomplete septa reaching out from the tracts; then complete portal-portal bridges.
    const reach = Math.min(1, 0.3 + 2.4 * su);
    c.save();
    c.shadowColor = tk('--lz-nodule-shadow'); c.shadowBlur = R * 0.06 * su;   // nodules bulge beside the bands
    crn.forEach((A, i) => {
      const B = crn[(i + 1) % 6], o = { w, rgb: COL, a: 0.55 + 0.45 * su, amp: R * 0.025, seed: 11 + i };
      if (reach >= 1) fibrousBand(c, A, B, o);
      else { const M = (t, P, Q) => [lerp(P[0], Q[0], t), lerp(P[1], Q[1], t)], h = reach / 2;
        fibrousBand(c, A, M(h, A, B), { ...o, e1: 0.2, seed: 11 + i }); fibrousBand(c, B, M(h, B, A), { ...o, e1: 0.2, seed: 61 + i }); }
    });
    // Portal-central bridges (advanced): from three tracts to the central vein, then spurs from the others.
    if (su > 0.18) {
      const g = Math.min(1, (su - 0.18) / 0.4);
      G.septaPC.forEach((sp, k) => { const P = sp.pts, q = P.length - 1;
        fibrousBand(c, P[0], P[q], { w: w * (0.6 + 0.3 * g), rgb: COL, a: 0.45 + 0.5 * g, e1: 0.9, seed: 31 + k, path: (u) => at(P, u) }); });
      if (su > 0.6) [1, 3, 5].forEach((i, k) => { const A = crn[i], t = 0.25 + 0.3 * Math.min(1, (su - 0.6) / 0.3);
        fibrousBand(c, A, [lerp(A[0], cx, t), lerp(A[1], cy, t)], { w: w * 0.55, rgb: COL, a: 0.6, e1: 0.15, amp: R * 0.03, seed: 41 + k }); });
    }
    c.restore();
  } else {
    // Healthy: just the limiting plate, a hairline.
    c.strokeStyle = tk('--lz-plate-line'); c.lineWidth = 1;
    hexPath(lobules[0]); c.stroke();
  }
  // Portal tracts (connective tissue), thicker with portal fibrosis.
  const seen = new Set();
  c.globalAlpha = 1;
  for (const [x, y] of lobules[0].corners) {
    const kk = Math.round(x) + ',' + Math.round(y);
    if (seen.has(kk)) continue; seen.add(kk);
    // (Only this lobule's own corners: every one is a near triad, drawn whole.)
    const gp = scarGrowth(m.fibPre), rt = G.rt * (0.8 + 0.9 * gp);
    // Collagen expands asymmetrically around all three structures, continuous with the septa; in presinusoidal
    // disease a denser, deeper-toned periportal collar (pipestem) rings the tract, clear of the orchid sinusoids.
    if (m.fibPre > 0.03) {
      fibrousTract(c, x, y, rt, Math.atan2(y - cy, x - cx), PRE, gp,
        900 + lobules[0].corners.findIndex((p) => p[0] === x && p[1] === y) * 71);
      fibrousCuff(c, x, y, rt * 0.62, rt * 1.08, PRE, gp);
    }
  }
  // Central vein wall: wavy collagen bundles, continuous with the portal-central bridges.
  if (m.fibPost > 0.05) {
    const growth = scarGrowth(m.fibPost), inner = P.cvIn;
    const outer = inner + G.rcv0 * (0.1 + 0.85 * growth);
    fibrousCuff(c, cx, cy, inner, outer, COL, growth);
  }
}

/** The lobule in world space into an n × n bitmap's context w, at sc px per world unit, its corner at world (bx, by). */
export function paintWorldInto(w, n, sc, bx, by, P) {
  w.setTransform(1, 0, 0, 1, 0, 0); w.clearRect(0, 0, n, n);
  w.setTransform(sc, 0, 0, sc, -bx * sc, -by * sc);
  paintLobule(w, P);
}
