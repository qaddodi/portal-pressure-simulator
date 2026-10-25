// The GPU's shape coverage (shape-gl.js) against the true share of each pixel a shape covers. The liver's outline (healthy,
// and as cirrhosis reshapes it), its stroke widths (the ambient-occlusion band, the outline line) and a field of nodules are
// drawn by the GPU into a coverage texture at three zooms, and by the browser's own path filler (a 2D canvas, the one its SVG
// uses) at 8 × 8 samples a pixel, averaged down: the truth. Inside and outside the shapes the GPU must agree with it to
// HARD_MAX levels of 255 (nothing missing, nothing spilt; a pixel at a cusp of the nodular edge may be off by a little); on an edge to EDGE_MAX at most and EDGE_MEAN on average, and the
// ink of the whole shape (its summed coverage) to INK_MAX. The browser's own pixel-size drawing is scored the same way and
// printed beside it: the GPU's edges are closer to the truth than the browser's (mean 2-3 levels against 8-25, 22 Oct).
//
//   node tests/e2e/shape-cover.mjs [dir]

import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';

const HARD_MAX = 24, EDGE_MAX = 64, EDGE_MEAN = 4, INK_MAX = 0.005;
const server = await serve(process.argv[2] || '.');
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
const page = await browser.newPage();
let failed = 0;
const fail = (m) => { failed++; console.log(`FAIL ${m}`); };
try {
  await page.goto(server.url + 'tests/e2e/blank');
  const r = await page.evaluate(async (HARD_MAX) => {
    const { createShapeGL, flattenPath, polyMesh } = await import('/src/ui/shape-gl.js');
    const { ORGANS } = await import('/src/ui/anatomy.js');
    const { LIVER_GEO } = await import('/src/ui/liver-geo-data.js');
    const { morphOutline, outlineNormals, contourNodules } = await import('/src/ui/liver-morph.js');
    const W = 640, H = 480;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const gl = cv.getContext('webgl2', { antialias: false, premultipliedAlpha: true });
    if (!gl) return { skip: 'no WebGL2' };
    const sh = createShapeGL(gl);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const rb = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.STENCIL_INDEX8, W, H);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.STENCIL_ATTACHMENT, gl.RENDERBUFFER, rb);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return { skip: 'no stencil framebuffer' };
    gl.viewport(0, 0, W, H);
    const liverD = ORGANS.find((o) => o.id === 'liver').d;
    const pts = []; for (let i = 0; i < 360; i++) pts.push([LIVER_GEO.pts[2 * i], LIVER_GEO.pts[2 * i + 1]]);
    const base = { pts, nm: outlineNormals(pts), nod: contourNodules(LIVER_GEO.L, 360) };
    const cirr = 'M' + morphOutline(base, 1, 0).out.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L') + ' Z';
    // A field of rounded six-sided nodules, as cellPath draws them (quadratics through the edge midpoints).
    let nod = '';
    for (let i = 0; i < 9; i++) for (let j = 0; j < 7; j++) {
      const cx = 420 + i * 44 + (j % 2) * 22, cy = 230 + j * 38, p = [];
      for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3 + 0.3 * Math.sin(i * 7 + j); p.push([cx + 17 * Math.cos(a) * (0.8 + 0.25 * Math.sin(i + k)), cy + 17 * Math.sin(a)]); }
      const m = (k) => `${((p[k % 6][0] + p[(k + 1) % 6][0]) / 2).toFixed(1)} ${((p[k % 6][1] + p[(k + 1) % 6][1]) / 2).toFixed(1)}`;
      nod += 'M' + m(5) + p.map((q, k) => `Q${q[0].toFixed(1)} ${q[1].toFixed(1)} ${m(k)}`).join('') + 'Z';
    }
    const cases = [];
    for (const [name, d] of [['healthy', liverD], ['cirrhotic', cirr]]) for (const k of [0.55, 1.3, 3.1]) {
      const m = [k, 0, 0, k, W / 2 - 600 * k, H / 2 - 350 * k];
      cases.push({ name: `${name} ×${k}`, d, m, ops: [['fill'], ['stroke', 9], ['stroke', 1.15]] });
    }
    cases.push({ name: 'nodules ×1.3', d: nod, m: [1.3, 0, 0, 1.3, W / 2 - 600 * 1.3, H / 2 - 350 * 1.3], ops: [['fill'], ['stroke', 0.6]] });
    const out = [];
    const px = new Uint8Array(W * H * 4);
    for (const c of cases) {
      const mesh = polyMesh(flattenPath(c.d), 1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.clearColor(0, 0, 0, 0); gl.clearStencil(0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
      c.ops.forEach(([kind, w], ch) => {
        const mask = [0, 1, 2, 3].map((q) => q === ch);
        sh.forget();
        if (kind === 'fill') sh.fill(mesh, c.m, [W, H], mask); else sh.stroke(mesh, c.m, [W, H], mask, w);
      });
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const res = { name: c.name, ops: [] };
      c.ops.forEach(([kind, w], ch) => {
        // The browser's drawing at the pixel size, and at 8 × 8 samples a pixel averaged down: the true share of each pixel.
        const draw = (k) => {
          const ref = document.createElement('canvas'); ref.width = W * k; ref.height = H * k;
          const g = ref.getContext('2d');
          g.fillStyle = '#000'; g.fillRect(0, 0, W * k, H * k);
          g.setTransform(c.m[0] * k, 0, 0, c.m[3] * k, c.m[4] * k, c.m[5] * k);
          const p = new Path2D(c.d);
          if (kind === 'fill') { g.fillStyle = '#fff'; g.fill(p); } else { g.strokeStyle = '#fff'; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(p); }
          return g.getImageData(0, 0, W * k, H * k).data;
        };
        const one = draw(1), big = draw(8), truth = new Float32Array(W * H);
        for (let y = 0; y < H * 8; y++) for (let x = 0; x < W * 8; x++) truth[(y >> 3) * W + (x >> 3)] += big[(y * W * 8 + x) * 4] / 64;
        const score = (at) => {
          let hard = 0, edges = 0, sum = 0, max = 0, ink = 0, cover = 0;
          for (let i = 0; i < W * H; i++) {
            const t = truth[i], e = Math.abs(t - at(i));
            cover += t; ink += at(i);
            if (t < 0.5 || t > 254.5) { if (e > HARD_MAX) hard++; } else { edges++; sum += e; if (e > max) max = e; }
          }
          return { hard, edges, mean: edges ? sum / edges : 0, max, cover, ink: cover ? ink / cover - 1 : 0 };
        };
        const gpu = score((i) => px[((H - 1 - Math.floor(i / W)) * W + (i % W)) * 4 + ch]), own = score((i) => one[i * 4]);
        res.ops.push({ kind: kind + (w ? ' ' + w : ''), gpu, own });
      });
      out.push(res);
    }
    return { out };
  }, HARD_MAX);
  if (r.skip) console.log(`SKIP ${r.skip}`);
  else for (const c of r.out) for (const o of c.ops) {
    const f = (q) => `mean ${q.mean.toFixed(1)}, max ${q.max.toFixed(0)}, ink ${(q.ink * 100).toFixed(2)} %, hard ${q.hard}`;
    const line = `${c.name} ${o.kind} (${o.gpu.edges} edge pixels): GPU ${f(o.gpu)} | browser ${f(o.own)}`;
    const g = o.gpu;
    if (!g.cover) fail(`${line}: nothing drawn`);
    else if (g.hard) fail(`${line}: an inside or outside pixel is off`);
    else if (g.max > EDGE_MAX || g.mean > EDGE_MEAN) fail(`${line}: edges further off than ${EDGE_MAX} (mean ${EDGE_MEAN})`);
    else if (Math.abs(g.ink) > INK_MAX) fail(`${line}: the shape's ink differs by more than ${INK_MAX * 100} %`);
    else console.log(`ok ${line}`);
  }
} finally {
  await browser.close();
  server.close();
}
if (failed) { console.log(`${failed} failed`); process.exit(1); }
