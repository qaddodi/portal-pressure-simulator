// Endoscopic image of the distal esophagus, rendered per pixel from a simple 3D model.
//
// The lumen is a tube of unit radius seen from its axis by a wide-angle lens with the light at
// the scope tip. A pixel at screen radius rho looks at wall depth z = 1 / (rho * T), so the wall
// recedes into a dark lumen. Varices are raised, winding, round-section ridges on that wall (a
// height field over angle and depth); each pixel is shaded from the surface normal of that field
// (lit by the tip light, inverse-square falloff), tinted blue-purple where a vein lies under the
// pink mucosa, with a wet specular sheen, red wale marks and, for band ligation, a dusky knuckle
// of strangulated tissue with the band as a tight ring at its base. The result is drawn once per
// state into an offscreen bitmap and cached, so it never flickers.

const TAU = Math.PI * 2;
const T = 1.55;          // tan(half field of view)
const NCOL = 4;

function h2(x, y) {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
// Value noise; x wraps with period P so there is no seam around the lumen.
function nz(x, y, P) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const x0 = ((ix % P) + P) % P, x1 = (x0 + 1) % P;
  const a = h2(x0, iy), b = h2(x1, iy), c = h2(x0, iy + 1), d = h2(x1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const wrapPi = (a) => { a %= TAU; return a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a; };
const mix = (a, b, t) => a + (b - a) * t;

function seeded(seed) { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }

// Columns for a given engorgement (grow 0..1) and band count.
function makeColumns(grow, bands) {
  const r = seeded(7);
  const cols = [];
  const A1 = 0.025 + 0.3 * grow;
  for (let c = 0; c < NCOL; c++) {
    const nb = Math.floor(bands / NCOL) + (c < bands % NCOL ? 1 : 0);
    const col = {
      a0: (c / NCOL) * TAU + 0.5 + (r() - 0.5) * 0.5,
      ph: r() * 6.28, ph2: r() * 6.28, ph3: r() * 6.28,
      A1, A2: A1 * 0.45,
      f1: 1.15 + r() * 0.5, f2: 2.6 + r() * 0.8,
      w0: 0.055 + 0.27 * grow + (r() - 0.5) * 0.015,
      amp: 0.03 + 0.28 * grow,
      zb: [],
    };
    for (let k = 0; k < Math.min(nb, 4); k++) col.zb.push(2.8 * Math.pow(1.4, k));
    // A banded column is strangulated: its own vein deflates (the knuckle stands where it was).
    col.ampK = col.amp;
    if (nb > 0) { col.amp *= 0.3; col.w0 *= 0.8; col.vk = 0.45; }
    cols.push(col);
  }
  return cols;
}

function centre(col, z) { return col.a0 + col.A1 * Math.sin(col.f1 * z + col.ph) + col.A2 * Math.sin(col.f2 * z + col.ph2); }

// Height of the wall bulging into the lumen at (theta, z). With `o`, also reports what is there.
function field(th, z, cols, grow, beaded, o) {
  let hh = 0;
  // Faint longitudinal mucosal ripples.
  hh += 0.017 * Math.sin(th * 9 + 2.2 * nz(th / TAU * 6, z * 0.3, 6)) * sstep(0.5, 1.2, z);
  const near = sstep(0.42, 0.95, z);
  if (o) { o.vein = 0; o.u = 0; o.c = -1; o.dom = 0; o.q = 9; o.qc = -1; o.halo = 0; }
  for (let c = 0; c < NCOL; c++) {
    const col = cols[c];
    const d = wrapPi(th - centre(col, z));
    const bead = beaded ? 1 + 0.3 * Math.sin(2.3 * z + col.ph3) : 1;
    const w = col.w0 * bead;
    const u = d / w, au = Math.abs(u);
    if (au < 2.6) {
      const p = Math.exp(-Math.pow(au, 2.6));
      hh += col.amp * bead * near * p;
      if (o && p > o.vein) { o.vein = p; o.u = u; o.c = c; }
    }
    // Banded knuckles: dusky domes standing on the column, band ring at the base.
    for (const zb of col.zb) {
      // Round on screen: radial extent ~ dz / z^2 and angular extent ~ dtheta / z, so dz scales with z.
      const dz = z - zb, wp = col.w0 * 1.5 + 0.06, lp = wp * zb * 0.95;
      const dd = wrapPi(th - centre(col, zb));
      const q = (dd / wp) * (dd / wp) + (dz / lp) * (dz / lp);
      if (q < 4) {
        if (q < 1) hh += (col.ampK * 0.9 + 0.07) * Math.pow(1 - q, 0.6);
        if (o) { if (q < o.q) { o.q = q; o.qc = c; o.dd = dd; o.dz = dz; } }
      }
    }
  }
  return hh;
}

// Renders the view to an offscreen canvas of res x res. p: { grow, bands, redWale }.
export function renderEndo(res, p) {
  const grow = Math.min(1, Math.max(0, p.grow));
  const bands = Math.max(0, Math.round(p.bands || 0));
  const present = p.present !== false;
  const cols = makeColumns(present ? grow : 0, bands);
  const beaded = grow > 0.5;
  const vis = Math.min(1, Math.max(0, p.vis ?? (present ? 1 : 0))); // 0 = no varix, grows smoothly into view
  for (const c of cols) c.amp *= vis;
  const cv = document.createElement('canvas'); cv.width = cv.height = res;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(res, res), D = img.data;
  const half = res / 2, o = {};
  const V = [66, 62, 158], ALB = [236, 167, 152], DEEP = [140, 40, 50];
  const eth = 0.008;
  for (let py = 0; py < res; py++) {
    for (let px = 0; px < res; px++) {
      const x = (px + 0.5 - half) / half, y = (py + 0.5 - half) / half;
      const rho = Math.hypot(x, y), i = (py * res + px) * 4;
      if (rho > 1.02) { D[i + 3] = 0; continue; }
      const th = Math.atan2(y, x), z = 1 / (Math.max(rho, 0.01) * T);
      const ez = 0.012 * (1 + z * 0.7);
      const H = field(th, z, cols, grow, beaded, o);
      const Ht = field(th + eth, z, cols, grow, beaded, null);
      const Hz = field(th, z + ez, cols, grow, beaded, null);
      const hth = (Ht - H) / eth, hz = (Hz - H) / ez;
      const rw = 1 - H;
      // Outward normal in (er, etheta, ez); the visible side faces the axis.
      const nr = 1, nt = hth / rw, nzc = hz, nl = Math.hypot(nr, nt, nzc);
      const d2 = rw * rw + z * z, dd = Math.sqrt(d2);
      const NL = Math.max(0, (rw * nr + nzc * z) / (nl * dd));
      const atten = 1.7 / (1 + d2 * 0.12);
      // Normal in screen axes for the wet highlight from a second, off-axis light.
      const ct = Math.cos(th), st = Math.sin(th);
      const Nx = -(nr * ct - nt * st) / nl, Ny = -(nr * st + nt * ct) / nl, Nz = -nzc / nl;
      // Light/view direction L = -P/d with P = (rw cos, rw sin, z).
      const Lx = -(rw * ct) / dd, Ly = -(rw * st) / dd, Lz = -z / dd;
      // Half vector with a second light up and to the left of the lens.
      let hx = Lx - 0.35, hy = Ly - 0.55, hz2 = Lz + 0.75;
      const hl = Math.hypot(hx, hy, hz2); hx /= hl; hy /= hl; hz2 /= hl;
      const NH = Math.max(0, Nx * hx + Ny * hy + Nz * hz2);

      // Mucosal colour: salmon, deeper toward the lumen, with slow mottling.
      const tint = sstep(1.5, 9, z);
      let r0 = mix(ALB[0], DEEP[0], tint * 0.7), g0 = mix(ALB[1], DEEP[1], tint * 0.75), b0 = mix(ALB[2], DEEP[2], tint * 0.6);
      const mott = nz(th / TAU * 14, z * 0.9, 14) * 0.6 + nz(th / TAU * 40, z * 2.5, 40) * 0.4;
      const mm = 0.92 + 0.16 * mott + 0.08 * (h2(px, py) - 0.5);
      r0 *= mm; g0 *= mm * (0.98 + 0.04 * mott); b0 *= mm;
      // Very fine, faint superficial vessels (ridged noise) fading with distance.
      const rid = 1 - Math.abs(nz(th / TAU * 48, z * 3.2, 48) * 2 - 1);
      const vs = sstep(0.95, 0.998, rid) * 0.07 * (1 - sstep(2.5, 6, z));
      r0 = mix(r0, 190, vs); g0 = mix(g0, 70, vs); b0 = mix(b0, 72, vs);

      // The vein under the thin mucosa: blue-purple, strongest where the column is tallest.
      let vein = 0;
      if (vis > 0.02 && o.vein > 0.02) {
        vein = Math.min(1, vis * o.vein * (0.4 + 0.75 * grow) * (o.c >= 0 && cols[o.c].vk ? cols[o.c].vk : 1));
        // Pale, stretched mucosa along the very crest.
        const crest = Math.exp(-Math.pow(Math.abs(o.u) / 0.55, 2));
        const k = vein * 0.72;
        r0 = mix(r0, V[0] + 26 * crest, k); g0 = mix(g0, V[1] + 22 * crest, k); b0 = mix(b0, V[2] + 14 * crest, k);
        if (p.redWale && o.c >= 0) {
          // Red wale marks: broken longitudinal red streaks along the crest, plus cherry-red spots.
          const sk = nz(o.u * 13 + o.c * 11, z * 1.3, 4096);
          const wm = sstep(0.7, 0.84, sk) * 0.6 * Math.exp(-Math.pow(Math.abs(o.u) / 0.8, 2)) * sstep(0.35, 0.7, grow);
          const spot = sstep(0.86, 0.93, nz(th / TAU * 120, z * 6, 120)) * vein * sstep(0.3, 0.6, grow);
          const rr = Math.max(wm * 0.8, spot * 0.85);
          r0 = mix(r0, 178, rr); g0 = mix(g0, 28, rr); b0 = mix(b0, 44, rr);
        }
      }
      // Occlusion in the groove beside a column.
      let ao = 1;
      if (vis > 0.02 && o.vein > 0.005 && o.vein < 0.2) ao = 1 - 0.28 * sstep(0.005, 0.1, o.vein) * (1 - sstep(0.1, 0.2, o.vein));

      // Banded knuckle.
      let gloss = 1, knuckle = 0;
      if (o.q < 4) {
        const q = o.q;
        if (q >= 1) {
          // Hyperaemic, congested halo around the base.
          const halo = (1 - sstep(1, 3, q)) * 0.3;
          r0 = mix(r0, 200, halo); g0 = mix(g0, 78, halo); b0 = mix(b0, 96, halo);
        }
        if (q < 1.12) {
          const g = Math.max(0, 1 - q);
          knuckle = sstep(0, 0.12, g);
          // Strangulated tissue: dusky purple, paler and violet toward the tip, mottled.
          const mt = nz(th / TAU * 60 + 3, z * 7, 60);
          const tip = sstep(0.55, 0.95, g), pr = mix(mix(84, 128, g), 196, tip * 0.6) + 22 * mt, pg = mix(mix(34, 62, g), 150, tip * 0.6) + 14 * mt, pb = mix(mix(76, 112, g), 172, tip * 0.6) + 18 * mt;
          r0 = mix(r0, pr, knuckle); g0 = mix(g0, pg, knuckle); b0 = mix(b0, pb, knuckle);
          gloss = 0.9;
        }
        // The band: a tight dark elastic ring where the knuckle meets the column.
        const ring = Math.exp(-Math.pow((Math.sqrt(q) - 1) / 0.05, 2));
        if (ring > 0.01) { r0 = mix(r0, 26, ring * 0.8); g0 = mix(g0, 16, ring * 0.8); b0 = mix(b0, 20, ring * 0.8); }
      }

      const diff = Math.min(1.1, (NL * 0.72 + 0.28)) * atten;
      const sheen = (0.08 + 0.1 * nz(th / TAU * 9, z * 0.7, 9));
      const spec = (Math.min(0.35, Math.pow(NH, 220) * 0.3 + Math.pow(NL, 14) * 0.02)) * gloss * atten * (0.35 + 0.9 * nz(th / TAU * 20, z * 1.4, 20));
      // Tiny wet glints from saliva films, sparse and fixed.
      const glint = sstep(0.94, 0.985, nz(th / TAU * 80, z * 7, 80)) * 0.14 * atten * NL;
      let rr = (r0 / 255) * diff * ao + spec * 0.9 + glint * 0.8 + sheen * 0.04;
      let gg = (g0 / 255) * diff * ao + spec * 0.9 + glint * 0.8 + sheen * 0.03;
      let bb = (b0 / 255) * diff * ao + spec * 0.9 + glint * 0.8 + sheen * 0.03;
      // Lumen: fade to a dark red-brown void.
      const lum = sstep(5, 20, z);
      rr = mix(rr, 0.05, lum); gg = mix(gg, 0.012, lum); bb = mix(bb, 0.014, lum);
      // Vignette of the lens.
      const vg = 1 - 0.62 * sstep(0.62, 1.0, rho);
      rr *= vg; gg *= vg; bb *= vg;
      D[i] = Math.min(255, 255 * Math.pow(Math.min(1.2, rr), 0.82));
      D[i + 1] = Math.min(255, 255 * Math.pow(Math.min(1.2, gg), 0.9));
      D[i + 2] = Math.min(255, 255 * Math.pow(Math.min(1.2, bb), 0.86));
      D[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
