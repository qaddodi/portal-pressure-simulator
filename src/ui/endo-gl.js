// WebGL version of the endoscopic renderer (same model as endo-render.js, which stays as the
// fallback): a fragment shader shades the lumen per pixel, so every frame of a transition is cheap
// and varices can grow, deflate and be banded smoothly at display rate.
//
// State per frame: grow (0..1 engorgement), vis (0..1 presence), red (wale marks), and for each of
// the four columns a deflation (0 engorged .. 1 strangulated) and up to four knuckle strengths
// (0 none .. 1 a cinched band with its dusky knuckle).

const TAU = Math.PI * 2;
const NCOL = 4;

// Per-column constants, in the same order the CPU renderer draws them from its seeded generator.
function columnConsts() {
  let x = 7 >>> 0;
  const r = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
  const c0 = [], c1 = [];
  for (let c = 0; c < NCOL; c++) {
    const a0 = (c / NCOL) * TAU + 0.5 + (r() - 0.5) * 0.5;
    const ph = r() * 6.28, ph2 = r() * 6.28, ph3 = r() * 6.28;
    const f1 = 1.15 + r() * 0.5, f2 = 2.6 + r() * 0.8, wj = (r() - 0.5) * 0.015;
    c0.push(a0, ph, ph2, ph3); c1.push(f1, f2, wj, 0);
  }
  return { c0, c1 };
}

const VS = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';
const FS = `
precision highp float;
uniform float uSize, uGrow, uVis, uRed;
uniform vec4 uC0[4];
uniform vec4 uC1[4];
uniform float uDef[4];
uniform float uKn[16];
const float TAU = 6.2831853;
const float PI = 3.1415927;
const float T = 1.55;

float hsh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float nz(float x, float y, float P) {
  float ix = floor(x), iy = floor(y), fx = x - ix, fy = y - iy;
  float ux = fx * fx * (3.0 - 2.0 * fx), uy = fy * fy * (3.0 - 2.0 * fy);
  float x0 = mod(ix, P), x1 = mod(x0 + 1.0, P);
  float a = hsh(vec2(x0, iy)), b = hsh(vec2(x1, iy)), c = hsh(vec2(x0, iy + 1.0)), d = hsh(vec2(x1, iy + 1.0));
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
float sst(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float wrapPi(float a) { return mod(a + PI, TAU) - PI; }

float centreOf(int c, float z) {
  vec4 k0 = uC0[0], k1 = uC1[0]; float df = uDef[0];
  for (int i = 0; i < 4; i++) if (i == c) { k0 = uC0[i]; k1 = uC1[i]; df = uDef[i]; }
  float A1 = (0.025 + 0.3 * uGrow) * (1.0 - 0.55 * df), A2 = A1 * 0.45;
  return k0.x + A1 * sin(k1.x * z + k0.y) + A2 * sin(k1.y * z + k0.z);
}

// Height of the wall bulging into the lumen. Outputs: vein weight, signed distance across the
// column in widths, column index, nearest knuckle footprint q (ellipse metric), its strength.
float field(float th, float z, out float vein, out float uu, out float cc, out float qm, out float kns) {
  float hh = 0.017 * sin(th * 9.0 + 2.2 * nz(th / TAU * 6.0, z * 0.3, 6.0)) * sst(0.5, 1.2, z);
  float near = sst(0.42, 0.95, z);
  vein = 0.0; uu = 0.0; cc = -1.0; qm = 9.0; kns = 0.0;
  float beaded = sst(0.45, 0.6, uGrow);
  float ampK = 0.03 + 0.28 * uGrow;
  for (int c = 0; c < 4; c++) {
    vec4 k0 = uC0[c], k1 = uC1[c];
    float df = uDef[c];
    float w0full = 0.055 + 0.27 * uGrow + k1.z;
    float w0 = w0full * (1.0 - 0.2 * df);
    float amp = ampK * uVis * uVis * (1.0 - 0.72 * df);
    float ce = centreOf(c, z);
    float d = wrapPi(th - ce);
    float bead = 1.0 + beaded * 0.3 * sin(2.3 * z + k0.w);
    float w = w0 * bead, u = d / w, au = abs(u);
    if (au < 2.6) {
      float p = exp(-pow(au, 2.6));
      hh += amp * bead * near * p;
      float vw = p * (1.0 - 0.55 * df);
      if (vw > vein) { vein = vw; uu = u; cc = float(c); }
    }
    for (int k = 0; k < 4; k++) {
      float kn = uKn[c * 4 + k];
      if (kn > 0.001) {
        float zb = 2.8 * pow(1.4, float(k));
        float wp = w0full * 0.8 * 1.5 + 0.06, lp = wp * zb * 0.95;
        float dd = wrapPi(th - centreOf(c, zb));
        float dz = z - zb;
        float q = (dd / wp) * (dd / wp) + (dz / lp) * (dz / lp);
        if (q < 4.0) {
          if (q < 1.0) hh += (ampK * 0.9 + 0.07) * pow(1.0 - q, 0.6) * kn * kn * (3.0 - 2.0 * kn);
          if (q < qm) { qm = q; kns = kn; }
        }
      }
    }
  }
  return hh;
}

void main() {
  vec2 xy = (gl_FragCoord.xy - 0.5 * uSize) / (0.5 * uSize);
  xy.y = -xy.y;
  float rho = length(xy);
  if (rho > 1.02) { gl_FragColor = vec4(0.0); return; }
  float th = atan(xy.y, xy.x), z = 1.0 / (max(rho, 0.01) * T);
  float ez = 0.012 * (1.0 + z * 0.7), eth = 0.008;
  float vein, uu, cc, qm, kns, a1, a2, a3, a4, a5, b1, b2, b3, b4;
  float H = field(th, z, vein, uu, cc, qm, kns);
  float Ht = field(th + eth, z, a1, a2, a3, a4, a5);
  float Hz = field(th, z + ez, b1, b2, b3, b4, a5);
  float hth = (Ht - H) / eth, hz = (Hz - H) / ez;
  float rw = 1.0 - H;
  float nr = 1.0, nt = hth / rw, nzc = hz, nl = sqrt(nr * nr + nt * nt + nzc * nzc);
  float d2 = rw * rw + z * z, dd = sqrt(d2);
  float NL = max(0.0, (rw * nr + nzc * z) / (nl * dd));
  float atten = 1.7 / (1.0 + d2 * 0.12);
  float ct = cos(th), st = sin(th);
  float Nx = -(nr * ct - nt * st) / nl, Ny = -(nr * st + nt * ct) / nl, Nz = -nzc / nl;
  float Lx = -(rw * ct) / dd, Ly = -(rw * st) / dd, Lz = -z / dd;
  vec3 hv = normalize(vec3(Lx - 0.35, Ly - 0.55, Lz + 0.75));
  float NH = max(0.0, Nx * hv.x + Ny * hv.y + Nz * hv.z);

  // Squamous mucosa: pale pink-salmon close to the lens, warmer and redder with depth. Past the
  // serrated Z-line (the squamocolumnar junction) the gastric cardia shows as deeper salmon-red.
  vec3 ALB = vec3(226.0, 150.0, 132.0), DEEP = vec3(150.0, 52.0, 50.0);
  float tint = sst(1.2, 7.0, z);
  vec3 col = mix(ALB, DEEP, tint * vec3(0.7, 0.8, 0.65));
  float zl = 5.2 + 0.9 * (nz(th / TAU * 11.0, 0.5, 11.0) - 0.5) + 0.35 * (nz(th / TAU * 31.0, 2.5, 31.0) - 0.5);
  float zline = sst(zl - 0.25, zl + 0.25, z);
  col = mix(col, vec3(200.0, 70.0, 60.0), zline * 0.85);
  float mott = nz(th / TAU * 14.0, z * 0.9, 14.0) * 0.6 + nz(th / TAU * 40.0, z * 2.5, 40.0) * 0.4;
  float grain = nz(th / TAU * 160.0, z * 11.0, 160.0);
  float mm = 0.93 + 0.12 * mott + 0.06 * (grain - 0.5) + 0.04 * (hsh(gl_FragCoord.xy) - 0.5);
  col *= vec3(mm, mm * (0.97 + 0.05 * mott), mm);
  // Fine submucosal vessels: a branching red-violet net, long and thin along the wall (palisade
  // vessels near the junction), sharp close to the lens and lost with depth.
  float n1 = nz(th / TAU * 36.0 + 0.6 * nz(th / TAU * 9.0, z * 1.1, 9.0), z * 1.6, 36.0);
  float n2 = nz(th / TAU * 90.0, z * 4.2 + 3.0 * n1, 90.0);
  float r1 = 1.0 - abs(n1 * 2.0 - 1.0), r2 = 1.0 - abs(n2 * 2.0 - 1.0);
  float vs = (sst(0.93, 0.995, r1) * 0.16 + sst(0.95, 0.995, r2) * 0.1) * (1.0 - sst(2.2, 5.0, z)) * sst(0.5, 0.75, z);
  col = mix(col, vec3(184.0, 84.0, 92.0), vs);

  float dfc = 0.0;
  if (cc >= 0.0) for (int i = 0; i < 4; i++) if (float(i) == cc) dfc = uDef[i];
  float vn = 0.0;
  if (uVis > 0.05 && vein > 0.02) {
    vn = min(1.0, uVis * vein * (0.45 + 0.7 * uGrow));
    // A small varix shows white under thick mucosa; a large, thin-walled one shows blue.
    float crest = exp(-pow(abs(uu) / 0.55, 2.0));
    vec3 V = mix(vec3(214.0, 178.0, 176.0), vec3(80.0, 90.0, 172.0), sst(0.1, 0.5, uGrow));
    col = mix(col, V + vec3(30.0, 26.0, 18.0) * crest * sst(0.2, 0.6, uGrow), vn * 0.74);
    if (uRed > 0.01) {
      float rs = uRed * (1.0 - dfc) * (1.0 - zline);
      // Red wale marks: thin, broken red whip-marks running along the crest.
      float off = 0.32 * (nz(cc * 7.0, z * 0.8, 4096.0) - 0.5);
      float streak = exp(-pow((uu - off) / 0.08, 2.0)) * sst(0.66, 0.86, nz(cc * 13.0 + 5.0, z * 2.6, 4096.0));
      float streak2 = exp(-pow((uu + 0.35 + off) / 0.07, 2.0)) * sst(0.66, 0.84, nz(cc * 17.0 + 9.0, z * 3.4, 4096.0));
      float wm = max(streak, streak2 * 0.8) * sst(0.0, 0.5, rs);
      // Cherry-red spots: small round dots on the varix, more of them as the wall nears its limit.
      float spot = sst(0.95 - 0.05 * rs, 0.98 - 0.03 * rs, nz(th / TAU * 220.0, z * 11.0, 220.0)) * vn * sst(0.2, 0.7, rs);
      col = mix(col, vec3(158.0, 26.0, 42.0), max(wm * 0.6 * vn, spot * 0.75) * sst(0.25, 0.5, uGrow));
    }
  }
  float ao = 1.0;
  if (uVis > 0.05 && vein > 0.003 && vein < 0.35) ao = 1.0 - 0.16 * uVis * uVis * sst(0.003, 0.12, vein) * (1.0 - sst(0.12, 0.35, vein));

  float gloss = 1.0;
  if (qm < 4.0) {
    float kk = kns, q = qm;
    if (q >= 1.0) {
      float halo = (1.0 - sst(1.0, 3.0, q)) * 0.3 * kk;
      col = mix(col, vec3(200.0, 78.0, 96.0), halo);
    }
    if (q < 1.12) {
      float g = max(0.0, 1.0 - q);
      float knuckle = sst(0.0, 0.12, g) * kk;
      float mt = nz(th / TAU * 60.0 + 3.0, z * 7.0, 60.0);
      float tip = sst(0.55, 0.95, g);
      vec3 pc = vec3(mix(mix(84.0, 128.0, g), 196.0, tip * 0.6) + 22.0 * mt,
                     mix(mix(34.0, 62.0, g), 150.0, tip * 0.6) + 14.0 * mt,
                     mix(mix(76.0, 112.0, g), 172.0, tip * 0.6) + 18.0 * mt);
      col = mix(col, pc, knuckle);
      gloss = mix(1.0, 0.9, knuckle);
    }
    // The band: a ring that cinches in from a wide loop to the base of the knuckle.
    float rr0 = 1.0 + (1.0 - kk) * 0.5;
    float ring = exp(-pow((sqrt(q) - rr0) / 0.05, 2.0)) * sst(0.0, 0.25, kk);
    col = mix(col, vec3(26.0, 16.0, 20.0), ring * 0.8);
  }

  // Light from the scope tip: steep falloff with distance, and what light comes back from deep in
  // the lumen is reddened by the tissue.
  float diff = min(1.1, NL * 0.72 + 0.3) * atten;
  vec3 lc = mix(vec3(1.0, 0.97, 0.93), vec3(1.0, 0.7, 0.6), sst(1.5, 8.0, z));
  // Wet mucus film: patchy, so the highlights break up as they do on real tissue.
  float wet = sst(0.35, 0.75, nz(th / TAU * 20.0, z * 1.4, 20.0)) * 0.8 + 0.2;
  float spec = min(0.5, pow(NH, 200.0) * 0.35 + pow(NL, 90.0) * 0.32 * wet + pow(NL, 18.0) * 0.03) * gloss * atten * wet;
  float glint = sst(0.93, 0.98, nz(th / TAU * 80.0, z * 7.0, 80.0)) * 0.18 * atten * pow(NL, 4.0);
  float sheen = 0.08 + 0.1 * nz(th / TAU * 9.0, z * 0.7, 9.0);
  vec3 rgb = (col / 255.0) * diff * ao * lc + vec3(spec * 0.95 + glint * 0.85) * vec3(1.0, 0.98, 0.95) + vec3(sheen * 0.04, sheen * 0.025, sheen * 0.025);
  float lum = sst(5.5, 18.0, z);
  rgb = mix(rgb, vec3(0.045, 0.01, 0.012), lum);
  rgb *= 1.0 - 0.58 * sst(0.64, 1.0, rho);
  rgb = vec3(pow(min(1.2, rgb.r), 0.82), pow(min(1.2, rgb.g), 0.92), pow(min(1.2, rgb.b), 0.9));
  gl_FragColor = vec4(min(rgb, 1.0), 1.0);
}
`;

export function createEndoGL() {
  const cv = document.createElement('canvas');
  const gl = cv.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
  const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return null;
  const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
  gl.useProgram(pr);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = (n) => gl.getUniformLocation(pr, n);
  const u = { size: U('uSize'), grow: U('uGrow'), vis: U('uVis'), red: U('uRed'), c0: U('uC0'), c1: U('uC1'), def: U('uDef'), kn: U('uKn') };
  const { c0, c1 } = columnConsts();
  gl.uniform4fv(u.c0, new Float32Array(c0)); gl.uniform4fv(u.c1, new Float32Array(c1));
  return {
    canvas: cv,
    // Raw RGBA of the last frame (for tests).
    pixels() { const n = cv.width, a = new Uint8Array(n * n * 4); gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, a); return a; },
    // st: { grow, vis, red (0..1 red-sign strength), def: [4], kn: [16] }; draws into the shared canvas at res x res.
    render(res, st) {
      if (cv.width !== res) { cv.width = cv.height = res; }
      gl.viewport(0, 0, res, res);
      gl.uniform1f(u.size, res); gl.uniform1f(u.grow, st.grow); gl.uniform1f(u.vis, st.vis); gl.uniform1f(u.red, +st.red || 0);
      gl.uniform1fv(u.def, new Float32Array(st.def)); gl.uniform1fv(u.kn, new Float32Array(st.kn));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return cv;
    },
  };
}
