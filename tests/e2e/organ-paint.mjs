// The organs painted on the GPU from their own SVG (organ-paint.js) against the browser's drawing of the same SVG. For the liver
// (healthy, and cirrhotic with its nodules, septa and congestion), the spleen (enlarged), the ghost line and the diaphragm, at
// three zooms, in the light and dark themes: each group is read from the page (readGroup) and painted by the GPU, and the same
// group, its styles inlined, is drawn by the browser at the same transform. Inside the shapes (pixels whose 3 × 3 neighbourhood
// the browser paints alike: no edge near) the two must agree to INSIDE levels of 255 (premultiplied), on average to INSIDE_MEAN;
// everywhere, on average, to ALL_MEAN; and on edges to EDGE_MAX (Mohammad's OK for edges a few levels off, 22 Oct: the drawer's
// edges are the true coverage, the browser's its own approximation). 22 Oct: inside mean 1.0 to 1.6, max 5, the GPU a level
// brighter on average: the browser rounds each translucent layer (the septa at .25 × .93, the nodules, the mask) to 8 bits
// on its own and dithers its gradients; edges at most 38.
//
//   node tests/e2e/organ-paint.mjs [dir]

import { chromium } from 'playwright';
import { serve } from '../../scripts/serve.mjs';

const INSIDE = 6, INSIDE_MEAN = 2, ALL_MEAN = 1.5, EDGE_MAX = 96;
const server = await serve(process.argv[2] || '.');
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let failed = 0;
const fail = (m) => { failed++; console.log(`FAIL ${m}`); };

async function compare(state) {
  await page.waitForTimeout(3000);
  const out = await page.evaluate(async ({ INSIDE }) => {
    const { readGroup, createOrganPaint, mul } = await import('/src/ui/organ-paint.js');
    const { createShapeGL } = await import('/src/ui/shape-gl.js');
    const { inlineStyles } = await import('/src/ui/svg-inline.js');
    const svg = document.querySelector('#organs').ownerSVGElement, defs = svg.querySelector('defs');
    const groups = [['liver', document.querySelector('#organs > .organ-liver')], ['spleen', document.querySelector('#organs > .organ-spleen')], ['ghost', document.querySelector('#organs > .org-ghost')], ['diaphragm', document.querySelector('#backdrop')]];
    const W = 640, H = 480;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const gl = cv.getContext('webgl2', { antialias: false, premultipliedAlpha: true });
    if (!gl) return { skip: 'no WebGL2' };
    const painter = createOrganPaint(gl, createShapeGL(gl));
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    const dc = defs.cloneNode(true); inlineStyles(defs, dc);
    const head = new XMLSerializer().serializeToString(dc);
    const res = [];
    for (const [name, g] of groups) {
      if (!g || getComputedStyle(g).display === 'none') continue;
      const spec = readGroup(g);
      if (!spec) { res.push({ name, unread: true }); continue; }
      const bb = g.getBBox(), gm = g.transform.baseVal.numberOfItems ? (() => { const k = g.transform.baseVal.consolidate().matrix; return [k.a, k.b, k.c, k.d, k.e, k.f]; })() : [1, 0, 0, 1, 0, 0];
      const cx = gm[0] * (bb.x + bb.width / 2) + gm[2] * (bb.y + bb.height / 2) + gm[4], cy = gm[1] * (bb.x + bb.width / 2) + gm[3] * (bb.y + bb.height / 2) + gm[5];
      for (const k of [0.6, 1.4, 3.2]) {
        const view = [k, 0, 0, k, W / 2 - cx * k, H / 2 - cy * k];
        // The GPU's painting.
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, W, H);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        painter.paintGroup(spec, mul(view, gm), W, H, fbo);
        painter.endFrame();
        const px = new Uint8Array(W * H * 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
        // The browser's, of the same group alone, styles inlined.
        const c = g.cloneNode(true); inlineStyles(g, c, 'visible');
        const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${head}<g transform="matrix(${view.join(' ')})">${new XMLSerializer().serializeToString(c)}</g></svg>`;
        const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
        const img = new Image(); img.src = url; await img.decode(); URL.revokeObjectURL(url);
        const rc = document.createElement('canvas'); rc.width = W; rc.height = H;
        const rg = rc.getContext('2d'); rg.drawImage(img, 0, 0);
        const ref = rg.getImageData(0, 0, W, H).data;
        const P = (d, i) => { const a = d[i + 3]; return [d[i] * a / 255, d[i + 1] * a / 255, d[i + 2] * a / 255, a]; };
        const gpuAt = (x, y) => { const i = ((H - 1 - y) * W + x) * 4; return [px[i], px[i + 1], px[i + 2], px[i + 3]]; };
        let inside = 0, insideMax = 0, insideSum = 0, allSum = 0, edgeMax = 0, ink = 0, worst = null;
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
          const i = (y * W + x) * 4, r = P(ref, i), q = gpuAt(x, y);
          let e = 0; for (let n = 0; n < 4; n++) e = Math.max(e, Math.abs(r[n] - q[n]));
          allSum += e; ink += r[3];
          // (Flat here: the browser's 3 × 3 neighbourhood within 6 levels of this pixel, and painted.)
          let flat = r[3] > 0;
          for (let dy = -1; dy <= 1 && flat; dy++) for (let dx = -1; dx <= 1 && flat; dx++) { const s = P(ref, ((y + dy) * W + x + dx) * 4); for (let n = 0; n < 4; n++) if (Math.abs(s[n] - r[n]) > 6) flat = false; }
          if (flat) { inside++; insideSum += e; if (e > insideMax) { insideMax = e; worst = [x, y, r.map(Math.round), q]; } }
          else edgeMax = Math.max(edgeMax, e);
        }
        let gpuInk = 0; for (let i = 3; i < px.length; i += 4) gpuInk += px[i];
        res.push({ name, k, gpuInk, inside, insideMax, insideMean: inside ? insideSum / inside : 0, allMean: allSum / ((W - 2) * (H - 2)), edgeMax, ink, worst });
      }
    }
    painter.dispose();
    return { res };
  }, { INSIDE });
  if (out.skip) { console.log(`SKIP ${out.skip}`); return; }
  for (const r of out.res) {
    if (r.unread) { fail(`${state} ${r.name}: the group could not be read for the GPU`); continue; }
    const line = `${state} ${r.name} ×${r.k}: inside ${r.inside} px max ${r.insideMax.toFixed(1)} mean ${r.insideMean.toFixed(2)}, all mean ${r.allMean.toFixed(2)}, edges max ${r.edgeMax.toFixed(0)}`;
    if (!r.ink && !r.gpuInk) console.log(`ok ${state} ${r.name} ×${r.k}: nothing in view, for both`);
    else if (!r.ink || !r.gpuInk) fail(`${line}: only one of them drew anything`);
    else if (r.insideMax > INSIDE || r.insideMean > INSIDE_MEAN) fail(`${line}: inside differs (worst at ${JSON.stringify(r.worst)})`);
    else if (r.allMean > ALL_MEAN || r.edgeMax > EDGE_MAX) fail(`${line}: edges differ too much`);
    else console.log(`ok ${line}`);
  }
}

try {
  await page.goto(server.url);
  await page.waitForFunction(() => window.pps?.store.get().frame && document.querySelector('#organs'), null, { timeout: 120000 });
  await compare('healthy');
  await page.goto(server.url + '?preset=cirr-decomp');
  await page.waitForFunction(() => window.pps?.store.get().frame && document.querySelector('#organs'), null, { timeout: 120000 });
  await page.waitForTimeout(6000);
  await compare('cirrhosis');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await compare('cirrhosis, dark');
  if (errors.length) fail(`page errors: ${errors.join(' | ')}`);
} finally {
  await browser.close();
  server.close();
}
if (failed) { console.log(`${failed} failed`); process.exit(1); }
